import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { VoiceAudience } from '@fiestapay/shared';
import type { Capabilities, Guest, Quote, RsvpStatus } from '../../types';
import { ApiError, api } from '../../api/client';
import { ContinuousResampler } from '../../voice/resampler';
import { floatToPCM16, pcm16ToBase64 } from '../../voice/pcm';
import { PlaybackQueue, type PlaybackFault } from '../../voice/playback';
import { createSpanishSpeechFallback, type SpanishSpeechFallback } from '../../voice/fallback-speech';
import {
  VOICE_ACTIVITY_THROTTLE_MS,
  VOICE_COOLDOWN_MS,
  VOICE_IDLE_MS,
  friendlyVoiceError,
  isVoiceCooldownError,
} from '../../voice/lifecycle';

interface VoiceInvitationAgentProps {
  /** Optional for the public informational audience, which never creates or joins an event. */
  slug?: string;
  capabilities: Capabilities | null;
  guest?: Guest | null;
  onConfirmRsvp?: (status: RsvpStatus, companions: number) => Promise<void>;
  onApplyQuote?: (quote: Quote) => void;
  onShowToast: (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => void;
  /** This session cannot start or continue voice. Existing playback is stopped. */
  accessRevoked?: boolean;
  /** The invitation is closed to new guest voice sessions. */
  eventClosed?: boolean;
  /**
   * guest: public invitation routes and guest tools.
   * organizer: keyed panel routes and read-only organizer tools.
   * public: informational voice on home/create/recover; no event, no guest, no tools.
   */
  audience?: VoiceAudience;
}

interface AccumulatedToolCall {
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ActionProposal {
  id: string;
  status: RsvpStatus;
  companions: number;
  confirmed: boolean;
}

/** Read aloud only when no neural voice is configured or reachable. No private data. */
const PUBLIC_INFO_SPEECH = [
  'FiestaPay crea invitaciones con una cuota fija por persona.',
  'Para empezar, crea una invitación y comparte su enlace.',
  'Cada persona se une con un alias, confirma su asistencia y paga la cuota fija con PayPal en modo de prueba.',
  'El organizador ve el avance del financiamiento y las personas asistentes.',
  'Esta voz solo da información general: no crea eventos, no consulta datos privados y no confirma pagos.',
  'Cuando quieras usar una invitación concreta, abre su enlace y usa el asistente de esa invitación.',
].join(' ');

/** Neutral Spanish fallback for guest/organizer when the neural provider is unavailable. */
const UNAVAILABLE_SPEECH =
  'La voz del asistente no está disponible en este momento. Puedes continuar por texto en la misma página.';

/** Call AudioContext.resume() now. The returned promise may be awaited later. */
function invokeResume(ctx: AudioContext): Promise<void> {
  try {
    const pending = ctx.resume();
    const ready = new Promise<void>((resolve, reject) => {
      Promise.resolve(pending).then(() => resolve(), reject);
    });
    void ready.catch(() => {});
    return ready;
  } catch (error) {
    const ready = Promise.reject<void>(error);
    void ready.catch(() => {});
    return ready;
  }
}

function playbackFaultMessage(reason: PlaybackFault['reason']): string {
  if (reason === 'overflow') {
    return 'No se reprodujo el audio completo. Lee la respuesta del asistente en el texto.';
  }
  if (reason === 'resume') {
    return 'No se pudo reanudar el audio. Lee la respuesta del asistente en el texto.';
  }
  return 'No se pudo reproducir el audio. Lee la respuesta del asistente en el texto.';
}

function parseRsvpAction(actionStr: string): { status: RsvpStatus; companions: number } | null {
  const match = /^rsvp:(yes|no|maybe):(\d+)$/.exec(actionStr.trim());
  if (!match) return null;
  return {
    status: match[1] as RsvpStatus,
    companions: parseInt(match[2], 10),
  };
}

export const VoiceInvitationAgent: React.FC<VoiceInvitationAgentProps> = ({
  slug = '',
  capabilities,
  guest = null,
  onConfirmRsvp,
  onApplyQuote,
  onShowToast,
  accessRevoked = false,
  eventClosed = false,
  audience = 'guest',
}) => {
  const organizer = audience === 'organizer';
  const publicAudience = audience === 'public';
  const [isOpen, setIsOpen] = useState(false);
  const [consentGranted, setConsentGranted] = useState(false);
  const [sessionState, setSessionState] = useState<
    'idle' | 'requesting_permission' | 'connecting' | 'ready' | 'active' | 'error' | 'ended'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [agentTranscript, setAgentTranscript] = useState<string>('');
  const [agentStatus, setAgentStatus] = useState<'listening' | 'speaking' | 'processing'>('listening');
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [suggestedQuote, setSuggestedQuote] = useState<Quote | null>(null);
  const [actionProposals, setActionProposals] = useState<ActionProposal[]>([]);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);

  // References for cleanup
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const playbackRef = useRef<PlaybackQueue | null>(null);
  const resamplerRef = useRef<ContinuousResampler | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const leaseIdRef = useRef<string | null>(null);
  const accumulatedToolsRef = useRef<AccumulatedToolCall[]>([]);
  const isReadyRef = useRef<boolean>(false);
  const sessionGenerationRef = useRef(0);
  const toolGenerationRef = useRef(0);
  const toolQueueRef = useRef<Promise<void>>(Promise.resolve());
  const playbackSpeakingRef = useRef(false);
  const toolsInFlightRef = useRef(false);
  const startingRef = useRef(false);
  const lastUserActivityRef = useRef(0);
  const lastBackendActivityRef = useRef(0);
  const leaseInactiveRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const fallbackRef = useRef<SpanishSpeechFallback | null>(null);

  const voiceAvailable = Boolean(capabilities?.voice);
  const voiceStopped = publicAudience ? accessRevoked : organizer ? accessRevoked : accessRevoked || eventClosed;

  const fallbackSpeech = useCallback((): SpanishSpeechFallback => {
    const existing = fallbackRef.current;
    if (existing) return existing;
    const created = createSpanishSpeechFallback();
    fallbackRef.current = created;
    return created;
  }, []);

  /**
   * Releases the current lease exactly once. Called by Stop, pagehide/beforeunload, WS
   * disconnect, route change/unmount and the idle timer. The server call is idempotent and
   * scoped by the session cookie. A failed release never restores budget by itself.
   */
  const cleanupSession = useCallback((reason = 'client', keepalive = false) => {
    // Invalidate pending permission/token requests and callbacks before releasing resources.
    sessionGenerationRef.current += 1;
    toolGenerationRef.current += 1;
    toolQueueRef.current = Promise.resolve();
    isReadyRef.current = false;
    playbackSpeakingRef.current = false;
    toolsInFlightRef.current = false;
    lastUserActivityRef.current = 0;
    lastBackendActivityRef.current = 0;
    leaseInactiveRef.current = false;

    const leaseId = leaseIdRef.current;
    leaseIdRef.current = null;
    if (leaseId) {
      void api.releaseVoiceLease(leaseId, reason, keepalive).catch(() => {
        // The server treats a repeated or lost release as idempotent.
      });
    }

    try {
      fallbackRef.current?.cancel();
    } catch {
      // Ignore a closed speech engine.
    }

    // Clear timebox timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop mic stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      mediaStreamRef.current = null;
    }

    // Flush and destroy playback
    if (playbackRef.current) {
      try {
        playbackRef.current.destroy();
      } catch {
        // ignore
      }
      playbackRef.current = null;
    }

    // Close AudioContext
    if (audioContextRef.current) {
      try {
        void audioContextRef.current.close().catch(() => {
          // The context may already have been closed by the browser.
        });
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }

    // End and close WebSocket
    if (socketRef.current) {
      const socket = socketRef.current;
      socketRef.current = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'session.end' }));
        }
        socket.close();
      } catch {
        // ignore
      }
    }

    resamplerRef.current = null;
    accumulatedToolsRef.current = [];
  }, []);

  /** 15-second client cooldown after a refusal. No automatic retry is scheduled. */
  const startCooldown = useCallback(() => {
    cooldownUntilRef.current = Date.now() + VOICE_COOLDOWN_MS;
    setCooldownSeconds(Math.ceil(VOICE_COOLDOWN_MS / 1000));
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((cooldownUntilRef.current - Date.now()) / 1000));
      setCooldownSeconds(left);
      if (left === 0 && cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    }, 250);
  }, []);

  const handleStopVoice = useCallback((msg?: string, reason = 'stop', keepalive = false) => {
    cleanupSession(reason, keepalive);
    setSessionState('ended');
    if (msg) {
      onShowToast('info', msg, 'Sesión de voz');
    }
  }, [cleanupSession, onShowToast]);

  useEffect(() => {
    const onHide = () => cleanupSession('pagehide', true);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      cleanupSession('unmount', true);
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, [cleanupSession]);

  const voiceLoadBlocked = organizer ? accessRevoked : accessRevoked || eventClosed;
  useEffect(() => {
    if (!voiceLoadBlocked) return;
    cleanupSession('access_revoked');
    setSessionState((current) => (current === 'idle' ? current : 'ended'));
  }, [voiceLoadBlocked, cleanupSession]);

  /** Reads the public informational script only when no neural audio exists. */
  const speakTextFallback = useCallback((text: string): boolean => {
    if (playbackRef.current?.isBusy) return false;
    const fallback = fallbackSpeech();
    if (!fallback.supported) return false;
    return fallback.speak(text);
  }, [fallbackSpeech]);

  const speakPublicFallback = useCallback(() => {
    if (playbackRef.current?.isBusy) return false;
    const fallback = fallbackSpeech();
    if (!fallback.supported) {
      onShowToast(
        'warning',
        'Este navegador no puede leer la información en voz alta. Puedes continuar por texto.',
        'Voz informativa',
      );
      return false;
    }
    const ok = fallback.speak(PUBLIC_INFO_SPEECH);
    if (ok) {
      setAgentTranscript(PUBLIC_INFO_SPEECH);
      onShowToast('info', 'Te leo la información general de FiestaPay.', 'Voz informativa');
    } else {
      onShowToast(
        'warning',
        'No se pudo reproducir la voz informativa. Puedes continuar por texto.',
        'Voz informativa',
      );
    }
    return ok;
  }, [fallbackSpeech, onShowToast]);

  /** Neutral notice for guest/organizer when neural audio is not available. */
  const speakUnavailableFallback = useCallback(() => {
    speakTextFallback(UNAVAILABLE_SPEECH);
  }, [speakTextFallback]);

  const handleStartVoice = async () => {
    if (startingRef.current) return;
    if (cooldownUntilRef.current > Date.now()) {
      onShowToast('info', 'Espera unos segundos antes de volver a intentar la voz.', 'Voz');
      return;
    }
    if (voiceStopped) {
      onShowToast(
        'info',
        accessRevoked
          ? 'El organizador revocó el acceso de esta sesión. La voz queda detenida.'
          : 'Esta invitación está cerrada. La voz queda detenida.',
        'Voz',
      );
      return;
    }
    if (!publicAudience && !organizer && !guest) {
      onShowToast('info', 'Debes unirte a esta invitación primero para hablar con el asistente de voz.', 'Identificación requerida');
      return;
    }

    // Public informational voice with no neural provider: speak locally, create nothing.
    if (publicAudience && !voiceAvailable) {
      if (capabilities === null) {
        onShowToast('info', 'La voz todavía se está preparando. Inténtalo en un momento.', 'Voz');
        return;
      }
      setErrorMessage(null);
      setUserTranscript('');
      setSessionState('ended');
      speakPublicFallback();
      return;
    }
    if (!voiceAvailable) {
      onShowToast('warning', 'El servicio de voz no está habilitado en este servidor.', 'Voz no disponible');
      return;
    }
    if (!publicAudience && !organizer && !slug) {
      onShowToast('info', 'No se encontró la invitación para iniciar la voz.', 'Voz');
      return;
    }
    if (organizer && !slug) {
      onShowToast('info', 'No se encontró el evento para iniciar la voz.', 'Voz');
      return;
    }

    startingRef.current = true;
    try {
      cleanupSession('restart');
      const generation = sessionGenerationRef.current;
      const isCurrentSession = () => sessionGenerationRef.current === generation;

      // Create and resume inside the click, before any await. A context opened
      // after the microphone or token request is no longer in the user gesture,
      // so browsers leave it suspended and the first samples are clipped.
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (typeof AudioContextCtor !== 'function') {
        setErrorMessage('No se pudo crear el audio del navegador.');
        setSessionState('error');
        return;
      }
      let ctx: AudioContext;
      try {
        ctx = new AudioContextCtor();
      } catch {
        setErrorMessage('No se pudo iniciar la sesión de voz.');
        setSessionState('error');
        return;
      }
      audioContextRef.current = ctx;
      const resumeReady = invokeResume(ctx);

      setErrorMessage(null);
      setSessionState('requesting_permission');
      setUserTranscript('');
      setAgentTranscript('');
      setSuggestedQuote(null);
      setActionProposals([]);
      setRemainingSeconds(null);
      accumulatedToolsRef.current = [];
      isReadyRef.current = false;

      try {
        // 1. Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: { ideal: 24000 },
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        if (!isCurrentSession()) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        mediaStreamRef.current = stream;

        // 2. Request voice token from server
        setSessionState('connecting');
        const tokenData = publicAudience
          ? await api.getPublicVoiceToken()
          : organizer
            ? await api.getOrganizerVoiceToken(slug)
            : await api.getVoiceToken(slug);
        if (!isCurrentSession()) {
          // The generation was cancelled by Stop, unmount or a restart while the token
          // request was in flight. The server already reserved this lease, so release
          // exactly this id (never another generation's) and do not open a socket/stream.
          void api.releaseVoiceLease(tokenData.leaseId, 'late_token', true).catch(() => {
            // Idempotent on the server; a lost release still expires and stays charged.
          });
          return;
        }
        leaseIdRef.current = tokenData.leaseId;

        // Playback starts only after the gesture-time resume() has reached running.
        await resumeReady;
        if (!isCurrentSession()) return;
        if (ctx.state !== 'running') {
          throw new Error('No se pudo preparar el audio del navegador.');
        }

        const replyAudioPending = () =>
          playbackSpeakingRef.current || Boolean(playbackRef.current?.isBusy);

        playbackRef.current = new PlaybackQueue(ctx, {
          onFault: (fault) => {
            if (!isCurrentSession()) return;
            const message = playbackFaultMessage(fault.reason);
            setErrorMessage(message);
            onShowToast(
              fault.reason === 'overflow' ? 'warning' : 'error',
              message,
              fault.reason === 'overflow' ? 'Audio incompleto' : 'Audio no disponible',
            );
            // Nothing left to hear, so the badge must not stay on speaking.
            if (!playbackRef.current?.isBusy) {
              playbackSpeakingRef.current = false;
              setAgentStatus(toolsInFlightRef.current ? 'processing' : 'listening');
            }
          },
          onActivity: ({ speaking }) => {
            if (!isCurrentSession()) return;
            playbackSpeakingRef.current = speaking;
            if (speaking) {
              setAgentStatus('speaking');
              return;
            }
            setAgentStatus(toolsInFlightRef.current ? 'processing' : 'listening');
            // The lease already answered inactive while this reply was still being heard.
            // Finish the audio first; the Stop is applied here, never mid-phrase.
            if (leaseInactiveRef.current && !toolsInFlightRef.current) {
              handleStopVoice('La sesión de voz ya no está activa. Puedes iniciar una nueva o continuar por texto.');
            }
          },
        });
        resamplerRef.current = new ContinuousResampler(ctx.sampleRate, 24000);

        // 4. Setup AudioWorklet or ScriptProcessor fallback for mic capture
        const workletCode = `
          class PCMCaptureProcessor extends AudioWorkletProcessor {
            constructor(options) {
              super();
              const batchSize = options?.processorOptions?.batchSize ?? 2048;
              this.batchSize = batchSize;
              this.buffer = new Float32Array(batchSize);
              this.writeIndex = 0;
              this.stopped = false;
              this.port.onmessage = (ev) => {
                if (ev.data === 'stop') this.stopped = true;
              };
            }
            process(inputs) {
              if (this.stopped) return false;
              const input = inputs[0];
              if (!input || input.length === 0) return true;
              const channel = input[0];
              if (!channel) return true;
              for (let i = 0; i < channel.length; i++) {
                this.buffer[this.writeIndex++] = channel[i];
                if (this.writeIndex >= this.batchSize) {
                  this.flush();
                }
              }
              return true;
            }
            flush() {
              if (this.writeIndex === 0) return;
              const chunk = this.buffer.slice(0, this.writeIndex);
              this.port.postMessage({ type: 'pcm-chunk', samples: chunk }, [chunk.buffer]);
              this.buffer = new Float32Array(this.batchSize);
              this.writeIndex = 0;
            }
          }
          registerProcessor('pcm-capture', PCMCaptureProcessor);
        `;

        let workletSupported = false;
        if (ctx.audioWorklet && typeof URL.createObjectURL === 'function') {
          try {
            const blob = new Blob([workletCode], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            try {
              await ctx.audioWorklet.addModule(blobUrl);
            } finally {
              URL.revokeObjectURL(blobUrl);
            }
            workletSupported = true;
          } catch {
            if (!isCurrentSession()) return;
            try {
              await ctx.audioWorklet.addModule('/pcm-capture.js');
              workletSupported = true;
            } catch {
              workletSupported = false;
            }
          }
        }
        if (!isCurrentSession()) return;

        const micSource = ctx.createMediaStreamSource(stream);

        if (workletSupported) {
          const workletNode = new AudioWorkletNode(ctx, 'pcm-capture');
          workletNode.port.onmessage = (ev: MessageEvent) => {
            if (!isCurrentSession() || !isReadyRef.current || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
            const data = ev.data as { type: string; samples: Float32Array };
            if (data?.type === 'pcm-chunk' && resamplerRef.current) {
              const resampled = resamplerRef.current.process(data.samples);
              if (resampled.length > 0) {
                const pcm16 = floatToPCM16(resampled);
                const b64 = pcm16ToBase64(pcm16);
                socketRef.current.send(JSON.stringify({ type: 'input.audio', audio: b64 }));
              }
            }
          };
          micSource.connect(workletNode);
          const silentSink = ctx.createGain();
          silentSink.gain.value = 0;
          workletNode.connect(silentSink);
          silentSink.connect(ctx.destination);
        } else {
          // Safe fallback for older or restricted environments
          const scriptNode = ctx.createScriptProcessor(2048, 1, 1);
          scriptNode.onaudioprocess = (e) => {
            if (!isCurrentSession() || !isReadyRef.current || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
            const inputData = e.inputBuffer.getChannelData(0);
            if (resamplerRef.current) {
              const resampled = resamplerRef.current.process(inputData);
              if (resampled.length > 0) {
                const pcm16 = floatToPCM16(resampled);
                const b64 = pcm16ToBase64(pcm16);
                socketRef.current.send(JSON.stringify({ type: 'input.audio', audio: b64 }));
              }
            }
          };
          micSource.connect(scriptNode);
          const silentSink = ctx.createGain();
          silentSink.gain.value = 0;
          scriptNode.connect(silentSink);
          silentSink.connect(ctx.destination);
        }

        // Activity is client-attested but never extends expires_at, and the server throttles
        // writes. It is sent only for real speech/reply events and while audio is actually
        // being heard; silent microphone PCM and idle timers never send it.
        const sendBackendActivity = () => {
          const leaseId = leaseIdRef.current;
          if (!leaseId) return;
          const now = Date.now();
          if (now - lastBackendActivityRef.current < VOICE_ACTIVITY_THROTTLE_MS) return;
          lastBackendActivityRef.current = now;
          void api.markVoiceActivity(leaseId)
            .then((result) => {
              if (result.active || !isCurrentSession()) return;
              leaseInactiveRef.current = true;
              // Never cut a reply that is already queued or being heard, and never abort
              // a tool result that is still being applied. The stop waits for the audio.
              if (!replyAudioPending() && !toolsInFlightRef.current) {
                handleStopVoice('La sesión de voz ya no está activa. Puedes iniciar una nueva o continuar por texto.');
              }
            })
            .catch(() => {
              // A failed activity write must not interrupt audio already playing.
            });
        };
        const markUserActivity = () => {
          lastUserActivityRef.current = Date.now();
          sendBackendActivity();
        };

        // 5. Connect WebSocket to AssemblyAI
        const wsUrl = `wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(tokenData.token)}`;
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          if (!isCurrentSession()) return;
          // Send session.update immediately BEFORE session.ready as mandated by AssemblyAI
          const updatePayload = {
            type: 'session.update',
            session: tokenData.sessionConfig || {},
          };
          ws.send(JSON.stringify(updatePayload));
        };

        ws.onmessage = async (event) => {
          if (!isCurrentSession()) return;
          let parsed: any;
          try {
            parsed = JSON.parse(event.data);
          } catch {
            return;
          }
          if (!parsed || !parsed.type) return;

          switch (parsed.type) {
            case 'session.ready': {
              if (isReadyRef.current) break;
              isReadyRef.current = true;
              setSessionState('active');
              setAgentStatus('listening');
              lastUserActivityRef.current = Date.now();
              // One timebox. No relay session is opened when it reaches zero.
              if (tokenData.maxSeconds && tokenData.maxSeconds > 0) {
                const startedAt = Date.now();
                setRemainingSeconds(tokenData.maxSeconds);
                timerRef.current = setInterval(() => {
                  if (!isCurrentSession()) return;
                  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
                  const left = Math.max(0, tokenData.maxSeconds - elapsed);
                  setRemainingSeconds(left);
                  if (left <= 0) {
                    handleStopVoice('Límite de tiempo de sesión alcanzado.', 'limit');
                    return;
                  }
                  // Real 60s inactivity. A reply still playing is never cut. While audio
                  // is actually being heard, the backend activity signal is refreshed from
                  // that playback (throttled); it is not a ping and silent mic PCM is ignored.
                  if (replyAudioPending()) {
                    sendBackendActivity();
                  } else if (
                    !toolsInFlightRef.current &&
                    Date.now() - lastUserActivityRef.current >= VOICE_IDLE_MS
                  ) {
                    handleStopVoice('La sesión se cerró por 60 segundos sin actividad.', 'idle');
                  }
                }, 1000);
              }
              break;
            }

            case 'input.speech.started':
              markUserActivity();
              toolGenerationRef.current += 1;
              accumulatedToolsRef.current = [];
              toolsInFlightRef.current = false;
              // VAD must not cut audio already queued. Stop and unmount still flush.
              // The badge stays on speaking until that audio has actually ended.
              if (!replyAudioPending()) setAgentStatus('listening');
              break;

            case 'reply.started':
              // A real reply event, not a ping. It keeps the lease live while long audio plays.
              lastBackendActivityRef.current = 0;
              sendBackendActivity();
              setAgentStatus('speaking');
              break;

            case 'reply.audio': {
              // Handle both Sparring 'data' field and standard 'audio' field
              const audioData = parsed.data || parsed.audio;
              if (audioData && playbackRef.current) {
                playbackRef.current.enqueueBase64(audioData);
                // A streaming reply is real activity, not a heartbeat: a long answer keeps
                // the server lease live while its audio actually arrives. The client and
                // server both throttle writes, so this cannot become a renewal loop.
                sendBackendActivity();
              }
              break;
            }

            case 'transcript.user.delta':
              markUserActivity();
              if (typeof parsed.text === 'string') {
                setUserTranscript(parsed.text);
              }
              break;

            case 'transcript.user':
              markUserActivity();
              if (typeof parsed.text === 'string') {
                setUserTranscript(parsed.text);
              }
              break;

            case 'transcript.agent.delta':
              if (typeof parsed.delta === 'string') {
                setAgentTranscript((prev) => prev + (prev.endsWith(' ') || parsed.delta.startsWith(' ') ? '' : ' ') + parsed.delta);
              }
              break;

            case 'transcript.agent':
              if (typeof parsed.text === 'string') {
                setAgentTranscript(parsed.text);
              }
              if (!replyAudioPending()) setAgentStatus('listening');
              break;

            case 'tool.call':
              // Accumulate tool call; DO NOT send result yet! Wait until reply.done per AssemblyAI docs
              if (!publicAudience && parsed.call_id && parsed.name) {
                accumulatedToolsRef.current.push({
                  call_id: parsed.call_id,
                  name: parsed.name,
                  arguments: parsed.arguments || {},
                });
              }
              break;

            case 'reply.done': {
              if (!replyAudioPending()) setAgentStatus('listening');
              sendBackendActivity();
              lastUserActivityRef.current = Date.now();
              const toolsToExecute = publicAudience ? [] : [...accumulatedToolsRef.current];
              accumulatedToolsRef.current = [];

              if (parsed.status === 'interrupted') {
                // Discard in-flight tools if reply was interrupted. Do not flush audio.
                toolGenerationRef.current += 1;
                break;
              }

              // Execute accumulated tools sequentially only after reply.done
              if (toolsToExecute.length > 0 && leaseIdRef.current) {
                const toolGeneration = toolGenerationRef.current;
                const isCurrentTurn = () => isCurrentSession() && toolGenerationRef.current === toolGeneration;
                const executeTools = async () => {
                  if (!isCurrentTurn()) return;
                  toolsInFlightRef.current = true;
                  if (!replyAudioPending()) setAgentStatus('processing');
                  try {
                    for (const tool of toolsToExecute) {
                      if (!isCurrentTurn()) return;
                      try {
                        const toolRes = organizer
                          ? await api.executeOrganizerVoiceTool(slug, {
                              leaseId: tokenData.leaseId,
                              name: tool.name,
                              arguments: tool.arguments,
                            })
                          : await api.executeVoiceTool(slug, {
                              leaseId: tokenData.leaseId,
                              name: tool.name,
                              arguments: tool.arguments,
                            });
                        if (!isCurrentTurn()) return;

                        // Send tool result back over WebSocket
                        if (ws.readyState === WebSocket.OPEN) {
                          ws.send(
                            JSON.stringify({
                              type: 'tool.result',
                              call_id: tool.call_id,
                              result: JSON.stringify(toolRes.response ?? { ok: true }),
                              is_error: false,
                            })
                          );
                        }

                        // Guest quotes stay human-confirmed. Organizer voice never applies a quote or an RSVP.
                        if (!organizer && !publicAudience) {
                          const guestRes = toolRes as Awaited<ReturnType<typeof api.executeVoiceTool>>;
                          if (guestRes.quote) {
                            setSuggestedQuote(guestRes.quote);
                            onApplyQuote?.(guestRes.quote);
                          }
                          for (const act of guestRes.actions ?? []) {
                            const parsedAction = parseRsvpAction(act);
                            if (parsedAction) {
                              setActionProposals((prev) => [
                                ...prev,
                                {
                                  id: `${tool.call_id}-${Date.now()}`,
                                  status: parsedAction.status,
                                  companions: parsedAction.companions,
                                  confirmed: false,
                                },
                              ]);
                            }
                          }
                        }
                      } catch (toolErr: any) {
                        if (!isCurrentTurn()) return;
                        if (toolErr instanceof ApiError && toolErr.status === 403) {
                          cleanupSession('tool_forbidden');
                          setSessionState('error');
                          setErrorMessage('La voz se detuvo: la clave o la sesión ya no autoriza esta herramienta. Continúa por el panel o el formulario.');
                          onShowToast('error', 'La voz se detuvo. Puedes seguir en el panel o en el formulario.', 'Voz detenida');
                          return;
                        }
                        if (ws.readyState === WebSocket.OPEN) {
                          ws.send(
                            JSON.stringify({
                              type: 'tool.result',
                              call_id: tool.call_id,
                              result: JSON.stringify({ error: friendlyVoiceError(toolErr) }),
                              is_error: true,
                            })
                          );
                        }
                      }
                    }
                  } finally {
                    if (toolGenerationRef.current === toolGeneration && isCurrentSession()) {
                      toolsInFlightRef.current = false;
                      setAgentStatus(replyAudioPending() ? 'speaking' : 'listening');
                    }
                  }
                };
                toolQueueRef.current = toolQueueRef.current.then(executeTools, executeTools);
              }
              break;
            }

            case 'session.error': {
              // The provider can report a rate limit over the WebSocket. Treat it like the
              // HTTP refusal: Spanish copy and the same 15 s cooldown, never provider text.
              const providerText =
                typeof parsed.message === 'string'
                  ? parsed.message
                  : typeof parsed.error === 'string'
                    ? parsed.error
                    : typeof parsed.error?.message === 'string'
                      ? parsed.error.message
                      : '';
              const rateLimited =
                parsed.code === 'rate_limit_exceeded' || /rate\s*limit/i.test(providerText);
              setErrorMessage(friendlyVoiceError(rateLimited ? { status: 429 } : null));
              if (rateLimited) startCooldown();
              setSessionState('error');
              cleanupSession('provider_error');
              if (publicAudience) speakPublicFallback();
              else speakUnavailableFallback();
              break;
            }

            case 'session.ended':
              setSessionState('ended');
              cleanupSession('provider_ended');
              break;
          }
        };

        ws.onerror = () => {
          if (!isCurrentSession()) return;
          setErrorMessage(friendlyVoiceError(null));
          setSessionState('error');
          cleanupSession('ws_error');
          if (publicAudience) speakPublicFallback();
          else speakUnavailableFallback();
        };

        ws.onclose = () => {
          if (!isCurrentSession()) return;
          setSessionState('ended');
          cleanupSession('ws_closed');
        };
      } catch (err: any) {
        if (!isCurrentSession()) return;
        cleanupSession('start_failed');
        const message = friendlyVoiceError(err);
        setErrorMessage(message);
        if (isVoiceCooldownError(err)) startCooldown();
        setSessionState('error');
        // No neural output: public reads the informational script, others a neutral notice.
        if (publicAudience) speakPublicFallback();
        else speakUnavailableFallback();
      }
    } finally {
      startingRef.current = false;
    }
  };

  const handleConfirmActionProposal = async (proposal: ActionProposal) => {
    if (!onConfirmRsvp || voiceStopped || publicAudience) return;
    setIsConfirmingAction(true);
    try {
      await onConfirmRsvp(proposal.status, proposal.companions);
      setActionProposals((prev) =>
        prev.map((p) => (p.id === proposal.id ? { ...p, confirmed: true } : p))
      );
      onShowToast('success', 'Asistencia confirmada según lo conversado con el asistente.', 'Asistencia confirmada');
    } catch {
      onShowToast('error', 'No se pudo confirmar la propuesta. Revisa la invitación en pantalla.', 'Error');
    } finally {
      setIsConfirmingAction(false);
    }
  };

  const startDisabledReason = !consentGranted
    ? 'Debes marcar la casilla de consentimiento para habilitar el botón.'
    : cooldownSeconds > 0
      ? `Espera ${cooldownSeconds} s antes de reintentar.`
      : null;

  return (
    <>
      {/* Floating or Embedded Trigger */}
      <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 900 }}>
        <button
          onClick={() => {
            if (isOpen) handleStopVoice();
            setIsOpen(!isOpen);
          }}
          className="btn btn-teal"
          style={{
            borderRadius: 'var(--radius-full)',
            padding: '0.75rem 1.25rem',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            border: '2px solid #FFFFFF',
          }}
          aria-label={isOpen ? 'Cerrar asistente de voz' : 'Abrir asistente de voz'}
          aria-expanded={isOpen}
        >
          <span style={{ fontSize: '1.2rem' }}>🎙️</span>
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{publicAudience ? 'Hablar con FiestaPay' : 'Hablar'}</span>
          {isOpen ? '✕' : ''}
        </button>
      </div>

      {/* Voice Assistant Modal/Drawer */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '5.2rem',
            right: '1.5rem',
            width: '380px',
            maxWidth: 'calc(100vw - 3rem)',
            maxHeight: 'min(520px, calc(100dvh - 6.2rem))',
            backgroundColor: '#FFFFFF',
            borderRadius: 'var(--radius-xl)',
            border: '1.5px solid var(--color-border)',
            boxShadow: 'var(--shadow-ticket)',
            zIndex: 901,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          role="region"
          aria-label={publicAudience ? 'Asistente de voz informativo de FiestaPay' : 'Panel del Asistente de Voz'}
        >
          {/* Header */}
          <div
            style={{
              padding: '0.85rem 1rem',
              backgroundColor: 'var(--color-teal)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.2rem' }}>🎙️</span>
              <div>
                <strong style={{ fontSize: '0.9rem', display: 'block' }}>
                  {publicAudience ? 'Asistente de voz de FiestaPay' : organizer ? 'Voz del organizador' : 'Asistente de Voz'}
                </strong>
                <span style={{ fontSize: '0.72rem', opacity: 0.9 }}>
                  {publicAudience ? 'Información general · sin datos del evento' : 'AssemblyAI Real-Time Voice Agent'}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                handleStopVoice();
                setIsOpen(false);
              }}
              style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontSize: '1.1rem' }}
              aria-label="Cerrar panel de voz"
            >
              ×
            </button>
          </div>

          {/* Body Content */}
          <div
            style={{
              padding: '1rem',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
              backgroundColor: 'var(--color-cloudwhite)',
            }}
          >
            {/* Guest requirement warning */}
            {!publicAudience && !organizer && !guest ? (
              <div
                style={{
                  backgroundColor: 'var(--color-yellow-tint)',
                  border: '1px solid var(--color-yellow)',
                  padding: '0.85rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Únete primero</div>
                <p style={{ color: 'var(--color-ink-muted)' }}>
                  Para comenzar la conversación por voz, ingresa un alias ficticio en la invitación principal.
                </p>
              </div>
            ) : !voiceAvailable && !publicAudience ? (
              <div
                style={{
                  backgroundColor: 'var(--color-surface-subtle)',
                  border: '1.5px dashed var(--color-border)',
                  padding: '0.85rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '0.25rem', color: 'var(--color-ink)' }}>
                  Voz no habilitada en el servidor
                </div>
                <p style={{ color: 'var(--color-ink-muted)' }}>
                  Las credenciales de voz no están activas en este entorno. Puedes interactuar mediante el chat escrito o con el formulario.
                </p>
              </div>
            ) : (
              <>
                {/* Informed consent and audience disclosure */}
                <div
                  style={{
                    backgroundColor: 'var(--color-surface-subtle)',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.75rem',
                    color: 'var(--color-ink-muted)',
                    lineHeight: 1.4,
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <p>
                    🔒 <strong>Aviso de Privacidad y Consentimiento:</strong>{' '}
                    {publicAudience ? (
                      <>
                        Esta voz es informativa y funciona sin crear ni unirte a un evento. No tiene herramientas, no consulta
                        datos de organizadores, invitados ni pagos.{' '}
                        {voiceAvailable
                          ? 'El audio del micrófono se procesa en tiempo real mediante AssemblyAI Voice Agent.'
                          : 'La información se lee con la voz del navegador; no se envía audio a ningún proveedor.'}
                      </>
                    ) : organizer ? (
                      <>
                        El audio del micrófono se procesa en tiempo real mediante <strong>AssemblyAI Voice Agent</strong>. Esta voz
                        es del panel y exige la clave en el servidor. No digas la clave, correos ni datos de tarjeta.
                      </>
                    ) : (
                      <>
                        El audio del micrófono se procesa en tiempo real mediante <strong>AssemblyAI Voice Agent</strong>. Tu
                        sesión usa tu alias público <strong>&quot;{guest?.name}&quot;</strong>. No transmitas información
                        financiera confidencial por este canal.
                      </>
                    )}
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={consentGranted}
                      onChange={(e) => setConsentGranted(e.target.checked)}
                    />
                    <span>{voiceAvailable ? 'Acepto procesar mi audio con AssemblyAI' : 'Entiendo el aviso de voz'}</span>
                  </label>
                </div>

                {/* Session controls */}
                {voiceStopped && (
                  <p className="session-revoked-banner" role="status">
                    {accessRevoked
                      ? 'El organizador revocó el acceso de esta sesión. No se inicia voz nueva.'
                      : 'Esta invitación está cerrada. No se inicia voz nueva.'}
                  </p>
                )}
                {sessionState === 'idle' || sessionState === 'ended' || sessionState === 'error' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button
                      onClick={handleStartVoice}
                      disabled={Boolean(startDisabledReason) || voiceStopped}
                      className="btn btn-teal"
                      style={{ padding: '0.75rem', fontWeight: 700, width: '100%' }}
                    >
                      🎙️ {publicAudience ? 'Escuchar información por voz' : 'Iniciar Conversación por Voz'}
                    </button>
                    {startDisabledReason && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-ink-light)', textAlign: 'center' }}>
                        {startDisabledReason}
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Live status bar */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: '#FFFFFF',
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border)',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor:
                              sessionState === 'active'
                                ? agentStatus === 'speaking'
                                  ? 'var(--color-blue)'
                                  : 'var(--color-teal)'
                                : 'var(--color-yellow)',
                          }}
                        />
                        <strong style={{ textTransform: 'capitalize' }}>
                          {sessionState === 'requesting_permission'
                            ? 'Solicitando micrófono...'
                            : sessionState === 'connecting'
                            ? 'Conectando con la voz...'
                            : agentStatus === 'speaking'
                            ? 'Asistente hablando...'
                            : agentStatus === 'processing'
                            ? 'Procesando acción...'
                            : 'Escuchando tu voz...'}
                        </strong>
                      </div>
                      {remainingSeconds !== null && (
                        <span style={{ fontWeight: 700, color: remainingSeconds < 30 ? 'var(--color-coral)' : 'var(--color-ink)' }}>
                          ⏳ {remainingSeconds}s
                        </span>
                      )}
                    </div>

                    {/* Transcripts container */}
                    <div
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.75rem',
                        border: '1px solid var(--color-border)',
                        fontSize: '0.825rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        minHeight: '100px',
                      }}
                    >
                      {userTranscript && (
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--color-blue)', fontWeight: 700, display: 'block' }}>
                            Tú ({publicAudience ? 'visitante' : organizer ? 'organizador' : guest?.name}):
                          </span>
                          <span style={{ color: 'var(--color-ink)' }}>{userTranscript}</span>
                        </div>
                      )}
                      {agentTranscript && (
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--color-teal)', fontWeight: 700, display: 'block' }}>
                            Asistente {publicAudience ? '(FiestaPay)' : '(AssemblyAI)'}:
                          </span>
                          <span style={{ color: 'var(--color-ink)' }}>{agentTranscript}</span>
                        </div>
                      )}
                      {!userTranscript && !agentTranscript && (
                        <div style={{ color: 'var(--color-ink-muted)', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>
                          {publicAudience
                            ? 'Pregunta cómo funcionan las invitaciones, la cuota fija o el pago de prueba. No se consultan datos privados.'
                            : 'Habla por el micrófono. Puedes decir: "¿Cuánto cuesta la cuota?", "Confirmo mi asistencia con 1 amigo", etc.'}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleStopVoice('Sesión detenida por el usuario.')}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--color-coral)' }}
                    >
                      ⏹️ Detener y Cerrar Micrófono
                    </button>
                  </div>
                )}

                {/* Confirmable Action Proposals returned by tools. Never public. */}
                {!publicAudience && actionProposals.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {actionProposals.map((prop) => {
                      const totalCount = prop.status === 'yes' ? 1 + prop.companions : 0;
                      return (
                        <div
                          key={prop.id}
                          style={{
                            backgroundColor: 'var(--color-yellow-tint)',
                            border: '1.5px solid var(--color-yellow)',
                            borderRadius: 'var(--radius-md)',
                            padding: '0.75rem',
                            fontSize: '0.825rem',
                          }}
                        >
                          <div style={{ fontWeight: 700, color: 'var(--color-ink)', marginBottom: '0.25rem' }}>
                            📋 Propuesta de Asistencia (Voz)
                          </div>
                          <p style={{ color: 'var(--color-ink-muted)', marginBottom: '0.5rem' }}>
                            El asistente sugiere marcar tu asistencia como: <strong>{prop.status === 'yes' ? `Asistir (${totalCount} ${totalCount === 1 ? 'persona' : 'personas'})` : prop.status === 'no' ? 'No asistir' : 'Tal vez'}</strong>.
                          </p>
                          <button
                            onClick={() => handleConfirmActionProposal(prop)}
                            disabled={prop.confirmed || isConfirmingAction || voiceStopped}
                            className="btn btn-teal"
                            style={{ width: '100%', fontSize: '0.75rem', padding: '0.4rem' }}
                          >
                            {prop.confirmed ? '✓ Asistencia Confirmada en el Servidor' : 'Confirmar Asistencia'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Suggested Quote Notification. Never public. */}
                {!publicAudience && suggestedQuote && (
                  <div
                    style={{
                      backgroundColor: 'var(--color-teal-tint)',
                      border: '1px solid var(--color-teal)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.75rem',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--color-teal)' }}>🧾 Cotización Calculada</div>
                    <p style={{ margin: '0.25rem 0' }}>
                      {suggestedQuote.summary}
                    </p>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-ink-muted)' }}>
                      Revisa y confirma la orden de pago en la tarjeta de cotización de la invitación.
                    </span>
                  </div>
                )}

                {/* Error Banner. Always Spanish, never provider text. */}
                {errorMessage && (
                  <div
                    style={{
                      backgroundColor: 'var(--color-coral-tint)',
                      color: 'var(--color-coral)',
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.8rem',
                      border: '1px solid var(--color-coral)',
                    }}
                    role="alert"
                  >
                    <strong>Aviso:</strong> {errorMessage}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

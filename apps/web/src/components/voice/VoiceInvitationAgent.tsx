import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Capabilities, Guest, Quote, RsvpStatus } from '../../types';
import { api } from '../../api/client';
import { ContinuousResampler } from '../../voice/resampler';
import { floatToPCM16, pcm16ToBase64 } from '../../voice/pcm';
import { PlaybackQueue, type PlaybackFault } from '../../voice/playback';

interface VoiceInvitationAgentProps {
  slug: string;
  capabilities: Capabilities | null;
  guest: Guest | null;
  onConfirmRsvp?: (status: RsvpStatus, companions: number) => Promise<void>;
  onApplyQuote?: (quote: Quote) => void;
  onShowToast: (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => void;
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
  slug,
  capabilities,
  guest,
  onConfirmRsvp,
  onApplyQuote,
  onShowToast,
}) => {
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
  const leaseIdRef = useRef<string | null>(null);
  const accumulatedToolsRef = useRef<AccumulatedToolCall[]>([]);
  const isReadyRef = useRef<boolean>(false);
  const sessionGenerationRef = useRef(0);
  const toolGenerationRef = useRef(0);
  const toolQueueRef = useRef<Promise<void>>(Promise.resolve());
  const playbackSpeakingRef = useRef(false);
  const toolsInFlightRef = useRef(false);

  const voiceAvailable = Boolean(capabilities?.voice);

  const cleanupSession = useCallback(() => {
    // Invalidate pending permission/token requests and callbacks before releasing resources.
    sessionGenerationRef.current += 1;
    toolGenerationRef.current += 1;
    toolQueueRef.current = Promise.resolve();
    isReadyRef.current = false;
    playbackSpeakingRef.current = false;
    toolsInFlightRef.current = false;

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
    leaseIdRef.current = null;
    accumulatedToolsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      cleanupSession();
    };
  }, [cleanupSession]);

  const handleStartVoice = async () => {
    if (!guest) {
      onShowToast('info', 'Debes unirte a la fiesta primero para hablar con el asistente de voz.', 'Identificación requerida');
      return;
    }
    if (!voiceAvailable) {
      onShowToast('warning', 'El servicio de voz AssemblyAI no está habilitado en este servidor.', 'Voz no disponible');
      return;
    }

    cleanupSession();
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
    } catch (err: any) {
      setErrorMessage(err?.message || 'No se pudo iniciar la sesión de voz.');
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
      const tokenData = await api.getVoiceToken(slug);
      if (!isCurrentSession()) return;
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
          case 'session.ready':
            if (isReadyRef.current) break;
            isReadyRef.current = true;
            setSessionState('active');
            setAgentStatus('listening');
            // Start timebox countdown
            if (tokenData.maxSeconds && tokenData.maxSeconds > 0) {
              setRemainingSeconds(tokenData.maxSeconds);
              timerRef.current = setInterval(() => {
                if (!isCurrentSession()) return;
                setRemainingSeconds((prev) => {
                  if (prev === null || prev <= 1) {
                    handleStopVoice('Límite de tiempo de sesión alcanzado.');
                    return 0;
                  }
                  return prev - 1;
                });
              }, 1000);
            }
            break;

          case 'input.speech.started':
            toolGenerationRef.current += 1;
            accumulatedToolsRef.current = [];
            toolsInFlightRef.current = false;
            // VAD must not cut audio already queued. Stop and unmount still flush.
            // The badge stays on speaking until that audio has actually ended.
            if (!replyAudioPending()) setAgentStatus('listening');
            break;

          case 'reply.started':
            setAgentStatus('speaking');
            break;

          case 'reply.audio': {
            // Handle both Sparring 'data' field and standard 'audio' field
            const audioData = parsed.data || parsed.audio;
            if (audioData && playbackRef.current) {
              playbackRef.current.enqueueBase64(audioData);
            }
            break;
          }

          case 'transcript.user.delta':
            if (typeof parsed.text === 'string') {
              setUserTranscript(parsed.text);
            }
            break;

          case 'transcript.user':
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
            if (parsed.call_id && parsed.name) {
              accumulatedToolsRef.current.push({
                call_id: parsed.call_id,
                name: parsed.name,
                arguments: parsed.arguments || {},
              });
            }
            break;

          case 'reply.done': {
            if (!replyAudioPending()) setAgentStatus('listening');
            const toolsToExecute = [...accumulatedToolsRef.current];
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
                      const toolRes = await api.executeVoiceTool(slug, {
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

                      // Handle suggested quote
                      if (toolRes.quote) {
                        setSuggestedQuote(toolRes.quote);
                        onApplyQuote?.(toolRes.quote);
                      }

                      // Handle action proposals (e.g. rsvp:yes:1)
                      if (toolRes.actions && Array.isArray(toolRes.actions)) {
                        for (const act of toolRes.actions) {
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
                      if (ws.readyState === WebSocket.OPEN) {
                        ws.send(
                          JSON.stringify({
                            type: 'tool.result',
                            call_id: tool.call_id,
                            result: JSON.stringify({ error: toolErr.message || 'Error executing tool' }),
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

          case 'session.error':
            setErrorMessage(parsed.message || 'Error en la sesión de voz con AssemblyAI.');
            setSessionState('error');
            cleanupSession();
            break;

          case 'session.ended':
            setSessionState('ended');
            cleanupSession();
            break;
        }
      };

      ws.onerror = () => {
        if (!isCurrentSession()) return;
        setErrorMessage('Error de conexión con el servidor de voz AssemblyAI.');
        setSessionState('error');
        cleanupSession();
      };

      ws.onclose = () => {
        if (!isCurrentSession()) return;
        setSessionState('ended');
        cleanupSession();
      };
    } catch (err: any) {
      if (!isCurrentSession()) return;
      cleanupSession();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Permiso de micrófono denegado. Puedes usar el formulario o chat escrito.');
      } else {
        setErrorMessage(err.message || 'No se pudo iniciar la sesión de voz.');
      }
      setSessionState('error');
    }
  };

  const handleStopVoice = (msg?: string) => {
    cleanupSession();
    setSessionState('ended');
    if (msg) {
      onShowToast('info', msg, 'Sesión de voz');
    }
  };

  const handleConfirmActionProposal = async (proposal: ActionProposal) => {
    if (!onConfirmRsvp) return;
    setIsConfirmingAction(true);
    try {
      await onConfirmRsvp(proposal.status, proposal.companions);
      setActionProposals((prev) =>
        prev.map((p) => (p.id === proposal.id ? { ...p, confirmed: true } : p))
      );
      onShowToast('success', 'Asistencia confirmada según lo conversado con el asistente.', 'Asistencia confirmada');
    } catch (err: any) {
      onShowToast('error', err.message || 'Error al confirmar la propuesta', 'Error');
    } finally {
      setIsConfirmingAction(false);
    }
  };

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
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Hablar</span>
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
          aria-label="Panel del Asistente de Voz AssemblyAI"
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
                <strong style={{ fontSize: '0.9rem', display: 'block' }}>Asistente de Voz</strong>
                <span style={{ fontSize: '0.72rem', opacity: 0.9 }}>
                  AssemblyAI Real-Time Voice Agent
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
            {!guest ? (
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
            ) : !voiceAvailable ? (
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
                  Las credenciales de AssemblyAI Voice no están activas en este entorno. Puedes interactuar mediante el chat escrito de Gemini o con el formulario.
                </p>
              </div>
            ) : (
              <>
                {/* Informed consent and alias disclosure */}
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
                    🔒 <strong>Aviso de Privacidad y Consentimiento:</strong> El audio del micrófono se procesa en tiempo real mediante <strong>AssemblyAI Voice Agent</strong>. Tu sesión usa tu alias público <strong>"{guest.name}"</strong>. No transmitas información financiera confidencial por este canal.
                  </p>
                  {!consentGranted && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={consentGranted}
                        onChange={(e) => setConsentGranted(e.target.checked)}
                      />
                      <span>Acepto procesar mi audio con AssemblyAI</span>
                    </label>
                  )}
                </div>

                {/* Session controls */}
                {sessionState === 'idle' || sessionState === 'ended' || sessionState === 'error' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button
                      onClick={handleStartVoice}
                      disabled={!consentGranted}
                      className="btn btn-teal"
                      style={{ padding: '0.75rem', fontWeight: 700, width: '100%' }}
                    >
                      🎙️ Iniciar Conversación por Voz
                    </button>
                    {!consentGranted && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-ink-light)', textAlign: 'center' }}>
                        Debes marcar la casilla de consentimiento para habilitar el botón.
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
                            ? 'Conectando con AssemblyAI...'
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
                            Tú ({guest.name}):
                          </span>
                          <span style={{ color: 'var(--color-ink)' }}>{userTranscript}</span>
                        </div>
                      )}
                      {agentTranscript && (
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--color-teal)', fontWeight: 700, display: 'block' }}>
                            Asistente (AssemblyAI):
                          </span>
                          <span style={{ color: 'var(--color-ink)' }}>{agentTranscript}</span>
                        </div>
                      )}
                      {!userTranscript && !agentTranscript && (
                        <div style={{ color: 'var(--color-ink-muted)', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>
                          Habla por el micrófono. Puedes decir: "¿Cuánto cuesta la cuota?", "Confirmo mi asistencia con 1 amigo", etc.
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

                {/* Confirmable Action Proposals returned by tools */}
                {actionProposals.length > 0 && (
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
                            disabled={prop.confirmed || isConfirmingAction}
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

                {/* Suggested Quote Notification */}
                {suggestedQuote && (
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

                {/* Error Banner */}
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

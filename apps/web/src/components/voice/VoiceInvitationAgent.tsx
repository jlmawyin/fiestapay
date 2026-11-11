import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Check, ClipboardList, Lock, Mic, Receipt, X } from 'lucide-react';
import {
  SHOW_ON_SCREEN_TOOL,
  UI_LABELS,
  type AssistantContext,
  type ShowOnScreenResult,
  type VoiceAudience,
  type VoiceProvider,
} from '@fiestapay/shared';
import type { Capabilities, Guest, Quote, RsvpStatus } from '../../types';
import { ApiError, api } from '../../api/client';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { voiceCatalog } from '../../i18n/messages/voice';
import { peopleWord, quoteClientSummary } from '../../lib/event-presentation';
import { AssistantText } from '../chat/AssistantText';
import { openAndroidSpeakerphone } from '../../voice/android-speakerphone';
import { ContinuousResampler } from '../../voice/resampler';
import { floatToPCM16, pcm16ToBase64 } from '../../voice/pcm';
import { PlaybackQueue, type PlaybackFault } from '../../voice/playback';
import { createSpanishSpeechFallback, type SpanishSpeechFallback } from '../../voice/fallback-speech';
import {
  asGeminiSessionConfig,
  connectGeminiLive,
  liveConfigHasTool,
  type GeminiLiveConnector,
  type GeminiLiveSessionHandle,
} from '../../voice/gemini-live';
import {
  VOICE_ACTIVITY_EVENT,
  VOICE_FALLBACK_EVENT,
  VOICE_RESUME_EVENT,
  VOICE_STOP_EVENT,
  getGuidePage,
  showOnScreen,
  validateInviteShowOnScreenArgs,
  validateShowOnScreenArgs,
  type VoiceActivityDetail,
  type VoiceFallbackDetail,
} from '../../guide/showOnScreen';
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
   * public: informational voice on home/create/recover; no event, no guest, only the show_on_screen guide tool.
   */
  audience?: VoiceAudience;
  /** Public only: landing or demo, sent with the token so the prompt describes the current page. */
  context?: AssistantContext;
  /** Presentation seam: render without its own floating trigger inside a host panel. */
  embedded?: boolean;
  /** Optional controlled visibility. Standalone use keeps its internal state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Test seam: fake Gemini Live transport. Production omits it and uses the real connector. */
  geminiLiveConnector?: GeminiLiveConnector;
  /**
   * FP-WELCOME-1: the welcome card accept click. Each new value marks consent
   * and starts one public session; 0/undefined (every manual open) never starts.
   */
  autoStartSignal?: number;
  /** Called once per consumed signal so a later manual open stays idle. */
  onAutoStartConsumed?: () => void;
}

const MIC_PAUSE_AFTER_MS = 5000;
const MIN_MIC_SIGNAL_POWER = 0.0001;

function hasMicSignal(samples: Float32Array): boolean {
  let power = 0;
  for (const sample of samples) power += sample * sample;
  return power > samples.length * MIN_MIC_SIGNAL_POWER;
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

/** Speech scripts live in the voice catalog (infoSpeech, unavailableSpeech). */

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

function playbackFaultMessage(
  reason: PlaybackFault['reason'],
  copy: { faultOverflow: string; faultResume: string; faultGeneric: string },
): string {
  if (reason === 'overflow') return copy.faultOverflow;
  if (reason === 'resume') return copy.faultResume;
  return copy.faultGeneric;
}

function parseRsvpAction(actionStr: string): { status: RsvpStatus; companions: number } | null {
  const match = /^rsvp:(yes|no|maybe):(\d+)$/.exec(actionStr.trim());
  if (!match) return null;
  return {
    status: match[1] as RsvpStatus,
    companions: parseInt(match[2], 10),
  };
}

/** Appends one incremental transcript fragment with a single separating space. */
function appendTranscriptFragment(previous: string, fragment: string): string {
  if (!previous) return fragment;
  if (!fragment) return previous;
  if (previous.endsWith(' ') || fragment.startsWith(' ')) return previous + fragment;
  return `${previous} ${fragment}`;
}

/** One transcript bubble. Turns stay in the order they started; a closed turn is never extended. */
interface TranscriptTurn {
  id: number;
  role: 'user' | 'agent';
  text: string;
  closed: boolean;
}

/** Appends to the last turn when it is open and from the same role; otherwise opens a new turn after it. */
function appendTranscriptTurn(turns: TranscriptTurn[], role: 'user' | 'agent', fragment: string): TranscriptTurn[] {
  if (!fragment) return turns;
  const last = turns[turns.length - 1];
  if (last && last.role === role && !last.closed) {
    return [...turns.slice(0, -1), { ...last, text: appendTranscriptFragment(last.text, fragment) }];
  }
  return [...turns, { id: turns.length, role, text: fragment, closed: false }];
}

/** Replaces the last turn when it is open and from the same role (cumulative snapshots); otherwise opens a new turn. */
function setTranscriptTurn(turns: TranscriptTurn[], role: 'user' | 'agent', text: string): TranscriptTurn[] {
  if (!text) return turns;
  const last = turns[turns.length - 1];
  if (last && last.role === role && !last.closed) {
    return [...turns.slice(0, -1), { ...last, text }];
  }
  return [...turns, { id: turns.length, role, text, closed: false }];
}

/** Closes every open turn of one role. Appends only ever touch the last turn, so a closed turn is never extended. */
function closeTranscriptTurns(turns: TranscriptTurn[], role: 'user' | 'agent'): TranscriptTurn[] {
  let changed = false;
  const next = turns.map((turn) => {
    if (turn.role !== role || turn.closed) return turn;
    changed = true;
    return { ...turn, closed: true };
  });
  return changed ? next : turns;
}

/** Normalizes a server tool answer into the object Gemini expects back. */
function toGeminiToolPayload(response: unknown): Record<string, unknown> {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    return response as Record<string, unknown>;
  }
  if (response === undefined || response === null) return { ok: true };
  return { result: response };
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
  context = 'landing',
  embedded = false,
  open,
  onOpenChange,
  geminiLiveConnector,
  autoStartSignal,
  onAutoStartConsumed,
}) => {
  const organizer = audience === 'organizer';
  const publicAudience = audience === 'public';
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : internalOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [consentGranted, setConsentGranted] = useState(false);
  const [sessionState, setSessionState] = useState<
    'idle' | 'requesting_permission' | 'connecting' | 'ready' | 'active' | 'error' | 'ended'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** Ordered transcript: one bubble per turn, in the order each turn started. */
  const [transcriptTurns, setTranscriptTurns] = useState<TranscriptTurn[]>([]);
  const [agentStatus, setAgentStatus] = useState<'listening' | 'speaking' | 'processing'>('listening');
  const [micPaused, setMicPaused] = useState(false);
  const micPausedRef = useRef(false);
  const resumeMicRef = useRef<(() => void) | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [suggestedQuote, setSuggestedQuote] = useState<Quote | null>(null);
  const [actionProposals, setActionProposals] = useState<ActionProposal[]>([]);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  /** Engine of the live session. Null before start and after stop; rollback stays assemblyai. */
  const [activeProvider, setActiveProvider] = useState<VoiceProvider | null>(null);
  const { locale, formatMoney } = useI18n();
  const m = useMessages(voiceCatalog);
  const labels = UI_LABELS[locale];
  const copyRef = useRef(m);
  copyRef.current = m;
  const localeRef = useRef(locale);
  localeRef.current = locale;

  // References for cleanup
  const socketRef = useRef<WebSocket | null>(null);
  const geminiSessionRef = useRef<GeminiLiveSessionHandle | null>(null);
  const geminiConnectorRef = useRef<GeminiLiveConnector | undefined>(geminiLiveConnector);
  geminiConnectorRef.current = geminiLiveConnector;
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
  /** True only when the locked public session declares the show_on_screen tool. */
  const guideToolRef = useRef(false);
  /** Guest sessions with the invitation-only show_on_screen declaration. */
  const inviteGuideToolRef = useRef(false);
  /** One text fallback per session, never re-entered by later provider callbacks. */
  const fallbackDispatchedRef = useRef(false);

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
    micPausedRef.current = false;
    resumeMicRef.current = null;
    setMicPaused(false);
    toolsInFlightRef.current = false;
    lastUserActivityRef.current = 0;
    lastBackendActivityRef.current = 0;
    leaseInactiveRef.current = false;
    guideToolRef.current = false;
    inviteGuideToolRef.current = false;
    setActiveProvider(null);

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

    // Close the Gemini Live session (microphone and playback close below).
    if (geminiSessionRef.current) {
      const gemini = geminiSessionRef.current;
      geminiSessionRef.current = null;
      try {
        gemini.close();
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
    // A voluntary stop (or any normal end) never becomes a text fallback later.
    fallbackDispatchedRef.current = true;
    cleanupSession(reason, keepalive);
    setSessionState('ended');
    if (msg) {
      onShowToast('info', msg, copyRef.current.voiceSessionTitle);
    }
  }, [cleanupSession, onShowToast]);

  /**
   * A real token/connection/provider failure releases the voice resources once
   * and hands the same audience to its text chat, with a localized visible
   * notice. It never retries the microphone, never runs for a voluntary stop,
   * and keeps the transcript state already produced by this session.
   */
  const fallbackToText = useCallback((panelMessage: string, reason: string) => {
    if (fallbackDispatchedRef.current) return;
    fallbackDispatchedRef.current = true;
    const notice = copyRef.current.fallbackUnavailable;
    cleanupSession(reason);
    setSessionState('error');
    setErrorMessage(panelMessage);
    onShowToast('warning', notice, copyRef.current.fallbackTitle);
    try {
      document.dispatchEvent(
        new CustomEvent<VoiceFallbackDetail>(VOICE_FALLBACK_EVENT, {
          detail: { message: notice, audience },
        }),
      );
    } catch {
      // The visible toast still explains the fallback when no listener mounts.
    }
  }, [audience, cleanupSession, onShowToast]);

  // A language change stops an active voice session through the same Stop path
  // (lease and microphone released) and asks for a restart in the new language.
  const sessionStateRef = useRef(sessionState);
  sessionStateRef.current = sessionState;
  const previousLocaleRef = useRef(locale);
  useEffect(() => {
    if (previousLocaleRef.current === locale) return;
    previousLocaleRef.current = locale;
    const state = sessionStateRef.current;
    const active = leaseIdRef.current !== null || state === 'requesting_permission' || state === 'connecting' || state === 'ready' || state === 'active';
    if (!active) return;
    handleStopVoice(copyRef.current.localeChanged, 'locale_change');
    setConsentGranted(false);
  }, [locale, handleStopVoice]);

  // A page-context change (landing <-> demo) stops an active public voice session through
  // the same Stop path, so the next session requests a token for the page now on screen.
  // FP-GUIDE-1: public voice with the guide tool follows the person across public pages.
  const previousContextRef = useRef(context);
  useEffect(() => {
    if (previousContextRef.current === context) return;
    previousContextRef.current = context;
    if (publicAudience && guideToolRef.current) return;
    const state = sessionStateRef.current;
    const active = leaseIdRef.current !== null || state === 'requesting_permission' || state === 'connecting' || state === 'ready' || state === 'active';
    if (!active) return;
    handleStopVoice(copyRef.current.contextChanged, 'context_change');
    setConsentGranted(false);
  }, [context, handleStopVoice]);

  // Controlled hosts (the unified orb) close this panel without unmounting it. Stop the
  // existing session and release its lease through the same handleStopVoice seam used by
  // standalone Stop; the generation guard also releases a token that arrives late.
  const previousControlledOpenRef = useRef<boolean | undefined>(open);
  useEffect(() => {
    if (open === undefined) {
      previousControlledOpenRef.current = undefined;
      return;
    }
    const previous = previousControlledOpenRef.current;
    previousControlledOpenRef.current = open;
    if (previous === true && open === false) {
      handleStopVoice(undefined, 'orb_close');
      setConsentGranted(false);
    }
  }, [open, handleStopVoice]);

  // FP-GUIDE-1: the orb shows a floating mini-bar while voice is live and a guide
  // highlight or navigation is on screen. The bar stops voice through the usual path.
  useEffect(() => {
    try {
      document.dispatchEvent(
        new CustomEvent<VoiceActivityDetail>(VOICE_ACTIVITY_EVENT, {
          detail: { active: sessionState === 'active', status: agentStatus, audience, paused: micPaused },
        }),
      );
    } catch {
      // Listeners never break voice.
    }
  }, [sessionState, agentStatus, audience, micPaused]);

  useEffect(() => {
    const onStopRequest = () => {
      handleStopVoice(copyRef.current.stopToast, 'voice_bar');
    };
    document.addEventListener(VOICE_STOP_EVENT, onStopRequest);
    return () => document.removeEventListener(VOICE_STOP_EVENT, onStopRequest);
  }, [handleStopVoice]);

  useEffect(() => {
    const onResumeRequest = (event: Event) => {
      if ((event as CustomEvent<VoiceAudience>).detail === audience) resumeMicRef.current?.();
    };
    document.addEventListener(VOICE_RESUME_EVENT, onResumeRequest);
    return () => document.removeEventListener(VOICE_RESUME_EVENT, onResumeRequest);
  }, [audience]);

  useEffect(() => {
    const onHide = () => cleanupSession('pagehide', true);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      cleanupSession('unmount', true);
      // The session is gone with the panel; report inactive so guide listeners
      // never believe a voice session is still live.
      try {
        document.dispatchEvent(
          new CustomEvent<VoiceActivityDetail>(VOICE_ACTIVITY_EVENT, {
            detail: { active: false, status: 'listening', audience },
          }),
        );
      } catch {
        // Listeners never break unmount.
      }
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, [cleanupSession, audience]);

  const voiceLoadBlocked = organizer ? accessRevoked : accessRevoked || eventClosed;
  useEffect(() => {
    if (!voiceLoadBlocked) return;
    cleanupSession('access_revoked');
    setSessionState((current) => (current === 'idle' ? current : 'ended'));
  }, [voiceLoadBlocked, cleanupSession]);

  const speakPublicFallback = useCallback(() => {
    if (playbackRef.current?.isBusy) return false;
    const fallback = fallbackSpeech();
    if (!fallback.supported) {
      onShowToast(
        'warning',
        copyRef.current.publicUnsupported,
        copyRef.current.publicToastTitle,
      );
      return false;
    }
    const script = copyRef.current.infoSpeech;
    const ok = fallback.speak(script, localeRef.current);
    if (ok) {
      setTranscriptTurns([{ id: 0, role: 'agent', text: script, closed: true }]);
      onShowToast('info', copyRef.current.publicReading, copyRef.current.publicToastTitle);
    } else {
      onShowToast(
        'warning',
        copyRef.current.publicFail,
        copyRef.current.publicToastTitle,
      );
    }
    return ok;
  }, [fallbackSpeech, onShowToast]);

  /**
   * Applies the server quote to the page and scrolls to the existing
   * order + PayPal approval step. Voice never creates an order or calls PayPal.
   */
  const handleApproveInPayPal = useCallback((quote: Quote) => {
    onApplyQuote?.(quote);
    try {
      const target = document.querySelector('[data-testid="paypal-stepper"]')
        ?? document.querySelector('[data-payment-quote]')
        ?? document.querySelector('[data-paypal-section]');
      const element = target as HTMLElement | null;
      if (element && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch {
      // The quote is already applied; a missing anchor never blocks payment.
    }
  }, [onApplyQuote]);

  const handleStartVoice = async () => {
    if (startingRef.current) return;
    if (cooldownUntilRef.current > Date.now()) {
      onShowToast('info', copyRef.current.cooldownToast, copyRef.current.voiceTitle);
      return;
    }
    if (voiceStopped) {
      onShowToast(
        'info',
        accessRevoked ? copyRef.current.revokedToast : copyRef.current.closedToast,
        copyRef.current.voiceTitle,
      );
      return;
    }
    if (!publicAudience && !organizer && !guest) {
      onShowToast('info', copyRef.current.joinFirstToast, copyRef.current.joinFirstToastTitle);
      return;
    }

    // Public informational voice with no neural provider: speak locally, create nothing.
    if (publicAudience && !voiceAvailable) {
      if (capabilities === null) {
        onShowToast('info', copyRef.current.preparingToast, copyRef.current.voiceTitle);
        return;
      }
      setErrorMessage(null);
      setTranscriptTurns([]);
      setSessionState('ended');
      speakPublicFallback();
      return;
    }
    if (!voiceAvailable) {
      onShowToast('warning', copyRef.current.offToast, copyRef.current.offToastTitle);
      return;
    }
    if (!publicAudience && !organizer && !slug) {
      onShowToast('info', copyRef.current.noInviteToast, copyRef.current.voiceTitle);
      return;
    }
    if (organizer && !slug) {
      onShowToast('info', copyRef.current.noEventToast, copyRef.current.voiceTitle);
      return;
    }

    startingRef.current = true;
    try {
      fallbackDispatchedRef.current = false;
      cleanupSession('restart');
      const generation = sessionGenerationRef.current;
      const isCurrentSession = () => sessionGenerationRef.current === generation;

      // Create and resume inside the click, before any await. A context opened
      // after the microphone or token request is no longer in the user gesture,
      // so browsers leave it suspended and the first samples are clipped.
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (typeof AudioContextCtor !== 'function') {
        setErrorMessage(copyRef.current.audioCreateFail);
        setSessionState('error');
        return;
      }
      let ctx: AudioContext;
      try {
        ctx = new AudioContextCtor();
      } catch {
        setErrorMessage(copyRef.current.audioStartFail);
        setSessionState('error');
        return;
      }
      audioContextRef.current = ctx;
      const resumeReady = invokeResume(ctx);

      setErrorMessage(null);
      setSessionState('requesting_permission');
      setTranscriptTurns([]);
      setSuggestedQuote(null);
      setActionProposals([]);
      accumulatedToolsRef.current = [];
      isReadyRef.current = false;

      try {
        // 1. Request microphone permission before looking for the communication device.
        const audio: MediaTrackConstraints = {
          channelCount: 1,
          sampleRate: { ideal: 24000 },
          echoCancellation: true,
          noiseSuppression: true,
        };
        const devices = navigator.mediaDevices;
        let stream = await devices.getUserMedia({ audio });
        if (!isCurrentSession()) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        mediaStreamRef.current = stream;
        const speakerStream = await openAndroidSpeakerphone(devices, navigator.userAgent, stream, audio, isCurrentSession);
        if (!isCurrentSession()) {
          speakerStream?.getTracks().forEach((track) => track.stop());
          return;
        }
        if (speakerStream && speakerStream !== stream) {
          const originalStream = stream;
          stream = speakerStream;
          mediaStreamRef.current = speakerStream;
          originalStream.getTracks().forEach((track) => track.stop());
        }

        // 2. Request voice token from server
        setSessionState('connecting');
        const tokenData = publicAudience
          ? await api.getPublicVoiceToken(context)
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
        const tokenProvider = (tokenData as { provider?: VoiceProvider }).provider;
        const useGemini = tokenProvider === 'gemini';
        setActiveProvider(useGemini ? 'gemini' : 'assemblyai');
        const geminiConfig = useGemini ? asGeminiSessionConfig(tokenData.sessionConfig) : null;
        if (useGemini && !geminiConfig) {
          throw new Error('Invalid Gemini session config');
        }
        const declaresGuideTool =
          useGemini &&
          !!geminiConfig &&
          liveConfigHasTool(geminiConfig.liveConfig, SHOW_ON_SCREEN_TOOL);
        guideToolRef.current = publicAudience && declaresGuideTool;
        inviteGuideToolRef.current = !publicAudience && !organizer && declaresGuideTool;

        // Playback starts only after the gesture-time resume() has reached running.
        await resumeReady;
        if (!isCurrentSession()) return;
        if (ctx.state !== 'running') {
          throw new Error('No se pudo preparar el audio del navegador.');
        }

        let lastMicSignalAt = Date.now();
        let modelTurnPending = true;
        const replyAudioPending = () =>
          playbackSpeakingRef.current || Boolean(playbackRef.current?.isBusy);

        playbackRef.current = new PlaybackQueue(ctx, {
          onFault: (fault) => {
            if (!isCurrentSession()) return;
            const message = playbackFaultMessage(fault.reason, copyRef.current);
            setErrorMessage(message);
            onShowToast(
              fault.reason === 'overflow' ? 'warning' : 'error',
              message,
              fault.reason === 'overflow' ? copyRef.current.faultOverflowTitle : copyRef.current.faultTitle,
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
            lastMicSignalAt = Date.now();
            setAgentStatus(toolsInFlightRef.current ? 'processing' : 'listening');
            // The lease already answered inactive while this reply was still being heard.
            // Finish the audio first; the Stop is applied here, never mid-phrase.
            if (leaseInactiveRef.current && !toolsInFlightRef.current) {
              handleStopVoice(copyRef.current.leaseDead);
            }
          },
        });
        resamplerRef.current = new ContinuousResampler(ctx.sampleRate, useGemini ? 16000 : 24000);

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

        const sendMicPcm16 = (b64: string) => {
          if (useGemini) {
            const gemini = geminiSessionRef.current;
            if (!gemini || gemini.closed) return;
            try {
              gemini.sendAudio(b64);
            } catch {
              // A failed realtime write never stops the microphone.
            }
            return;
          }
          if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
          socketRef.current.send(JSON.stringify({ type: 'input.audio', audio: b64 }));
        };

        const captureMicSamples = (samples: Float32Array) => {
          const resampler = resamplerRef.current;
          if (!isCurrentSession() || !isReadyRef.current || micPausedRef.current || !resampler) return;
          if (useGemini && !replyAudioPending() && hasMicSignal(samples)) lastMicSignalAt = Date.now();
          const resampled = resampler.process(samples);
          if (resampled.length > 0) sendMicPcm16(pcm16ToBase64(floatToPCM16(resampled)));
        };

        const silentSink = ctx.createGain();
        silentSink.gain.value = 0;
        silentSink.connect(ctx.destination);
        if (workletSupported) {
          const workletNode = new AudioWorkletNode(ctx, 'pcm-capture');
          workletNode.port.onmessage = (ev: MessageEvent) => {
            const data = ev.data as { type: string; samples: Float32Array };
            if (data?.type === 'pcm-chunk') captureMicSamples(data.samples);
          };
          micSource.connect(workletNode);
          workletNode.connect(silentSink);
        } else {
          const scriptNode = ctx.createScriptProcessor(2048, 1, 1);
          scriptNode.onaudioprocess = (e) => captureMicSamples(e.inputBuffer.getChannelData(0));
          micSource.connect(scriptNode);
          scriptNode.connect(silentSink);
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
                handleStopVoice(copyRef.current.leaseDead);
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

        // 5. Gemini Live (default) or the AssemblyAI rollback.
        if (useGemini && geminiConfig) {
          let providerEnding = false;
          const setMicCapture = (enabled: boolean) => {
            micPausedRef.current = !enabled;
            for (const track of stream.getTracks()) track.enabled = enabled;
            setMicPaused(!enabled);
          };
          resumeMicRef.current = () => {
            if (!isCurrentSession() || !micPausedRef.current) return;
            lastMicSignalAt = Date.now();
            resamplerRef.current = new ContinuousResampler(ctx.sampleRate, 16000);
            setMicCapture(true);
            markUserActivity();
          };
          const pauseMic = () => {
            setMicCapture(false);
            try {
              geminiSessionRef.current?.endAudioStream?.();
            } catch {
              // Local capture stays paused even if the provider has disconnected.
            }
          };
          const beginGeminiActive = () => {
            if (isReadyRef.current) return;
            isReadyRef.current = true;
            setSessionState('active');
            setAgentStatus('listening');
            lastUserActivityRef.current = Date.now();
            // One timebox. No relay session is opened when it reaches zero.
            if (tokenData.maxSeconds && tokenData.maxSeconds > 0) {
              const startedAt = Date.now();
              timerRef.current = setInterval(() => {
                if (!isCurrentSession()) return;
                const elapsed = Math.floor((Date.now() - startedAt) / 1000);
                const left = Math.max(0, tokenData.maxSeconds - elapsed);
                if (left <= 0) {
                  handleStopVoice(copyRef.current.timeLimit, 'limit');
                  return;
                }
                // Real 60s inactivity. A reply still playing is never cut. While audio
                // is actually being heard, the backend activity signal is refreshed from
                // that playback (throttled); it is not a ping and silent mic PCM is ignored.
                const now = Date.now();
                if (replyAudioPending()) {
                  lastMicSignalAt = now;
                  sendBackendActivity();
                } else if (!toolsInFlightRef.current && now - lastUserActivityRef.current >= VOICE_IDLE_MS) {
                  handleStopVoice(copyRef.current.idle60, 'idle');
                } else if (!toolsInFlightRef.current && !modelTurnPending && !micPausedRef.current && now - lastMicSignalAt >= MIC_PAUSE_AFTER_MS) {
                  pauseMic();
                }
              }, 1000);
            }
          };

          const connector = geminiConnectorRef.current ?? connectGeminiLive;
          const geminiSession = await connector({
            token: tokenData.token,
            model: geminiConfig.model,
            apiVersion: geminiConfig.apiVersion,
            liveConfig: geminiConfig.liveConfig,
            callbacks: {
              onOpen: () => {
                if (!isCurrentSession()) return;
                beginGeminiActive();
              },
              onAudio: (audioBase64) => {
                if (!isCurrentSession()) return;
                if (audioBase64 && playbackRef.current) {
                  playbackRef.current.enqueueBase64(audioBase64);
                  // A streaming reply is real activity: a long answer keeps the
                  // server lease live while its audio actually arrives.
                  sendBackendActivity();
                }
              },
              onInputTranscript: (text, finished) => {
                if (!isCurrentSession()) return;
                if (!text) return;
                markUserActivity();
                lastMicSignalAt = Date.now();
                if (finished) modelTurnPending = true;
                setTranscriptTurns((prev) => {
                  const next = appendTranscriptTurn(prev, 'user', text);
                  return finished ? closeTranscriptTurns(next, 'user') : next;
                });
              },
              onOutputTranscript: (text) => {
                if (!isCurrentSession()) return;
                if (!text) return;
                setTranscriptTurns((prev) => appendTranscriptTurn(prev, 'agent', text));
              },
              onInterrupted: () => {
                if (!isCurrentSession()) return;
                modelTurnPending = true;
                // Barge-in: cut the audio in course and empty the queue.
                toolGenerationRef.current += 1;
                accumulatedToolsRef.current = [];
                toolsInFlightRef.current = false;
                try {
                  playbackRef.current?.flush();
                } catch {
                  // ignore
                }
                playbackSpeakingRef.current = false;
                // The cut-off agent bubble is final; the interruption opens its own turn after it.
                setTranscriptTurns((prev) => closeTranscriptTurns(prev, 'agent'));
                setAgentStatus('listening');
              },
              onTurnComplete: () => {
                if (!isCurrentSession()) return;
                sendBackendActivity();
                modelTurnPending = false;
                lastMicSignalAt = Date.now();
                lastUserActivityRef.current = Date.now();
                // Each agent turn is its own bubble; the next reply opens a new one.
                setTranscriptTurns((prev) => closeTranscriptTurns(prev, 'agent'));
                if (!replyAudioPending()) {
                  setAgentStatus(toolsInFlightRef.current ? 'processing' : 'listening');
                }
              },
              onToolCalls: (calls) => {
                if (!isCurrentSession()) return;
                if (calls.length === 0) return;
                if (publicAudience) {
                  // Public voice executes show_on_screen in the browser and ignores
                  // anything else, exactly as before when the tool is not declared.
                  if (!guideToolRef.current) return;
                  const guided = calls.filter((call) => call.name === SHOW_ON_SCREEN_TOOL);
                  if (guided.length === 0) return;
                  sendBackendActivity();
                  const toolGeneration = toolGenerationRef.current;
                  const isCurrentTurn = () => isCurrentSession() && toolGenerationRef.current === toolGeneration;
                  const executeGuideTools = async () => {
                    if (!isCurrentTurn()) return;
                    toolsInFlightRef.current = true;
                    if (!replyAudioPending()) setAgentStatus('processing');
                    try {
                      for (const tool of guided) {
                        if (!isCurrentTurn()) return;
                        const validated = validateShowOnScreenArgs(tool.args);
                        let result: ShowOnScreenResult;
                        if (!validated.ok) {
                          result = { ok: false, reason: 'invalid_args' };
                        } else {
                          try {
                            result = await showOnScreen(validated.args);
                          } catch {
                            if (!isCurrentTurn()) return;
                            result = { ok: false, reason: 'invalid_args' };
                          }
                        }
                        if (!isCurrentTurn()) return;
                        const page = result.page ?? getGuidePage() ?? undefined;
                        const payload: ShowOnScreenResult = page ? { ...result, page } : result;
                        const live = geminiSessionRef.current;
                        if (live && !live.closed) {
                          try {
                            live.sendToolResponse([{
                              id: tool.id,
                              name: tool.name,
                              response: payload as unknown as Record<string, unknown>,
                            }]);
                          } catch {
                            // A failed tool answer never stops the session.
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
                  toolQueueRef.current = toolQueueRef.current.then(executeGuideTools, executeGuideTools);
                  return;
                }
                if (!leaseIdRef.current) return;
                sendBackendActivity();
                const toolGeneration = toolGenerationRef.current;
                const isCurrentTurn = () => isCurrentSession() && toolGenerationRef.current === toolGeneration;
                const executeTools = async () => {
                  if (!isCurrentTurn()) return;
                  toolsInFlightRef.current = true;
                  if (!replyAudioPending()) setAgentStatus('processing');
                  try {
                    for (const tool of calls) {
                      if (!isCurrentTurn()) return;
                      try {
                        let toolRes: { response: unknown };
                        if (tool.name === SHOW_ON_SCREEN_TOOL) {
                          // Keep the browser-only tool in turn order with server tools. A
                          // prepare_quote followed by a highlight must apply the quote first.
                          const validated = !organizer && inviteGuideToolRef.current
                            ? validateInviteShowOnScreenArgs(tool.args)
                            : { ok: false as const };
                          toolRes = {
                            response: validated.ok
                              ? await showOnScreen(validated.args, { inviteSlug: slug })
                              : { ok: false, reason: 'invalid_args' },
                          };
                        } else {
                          const request = { leaseId: tokenData.leaseId, name: tool.name, arguments: tool.args };
                          toolRes = organizer
                            ? await api.executeOrganizerVoiceTool(slug, request)
                            : await api.executeVoiceTool(slug, request);
                        }
                        if (!isCurrentTurn()) return;
                        const live = geminiSessionRef.current;
                        if (live && !live.closed) {
                          try {
                            live.sendToolResponse([{
                              id: tool.id,
                              name: tool.name,
                              response: toGeminiToolPayload(toolRes.response),
                            }]);
                          } catch {
                            // A failed tool answer never stops the session.
                          }
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
                                  id: `${tool.id}-${Date.now()}`,
                                  status: parsedAction.status,
                                  companions: parsedAction.companions,
                                  confirmed: false,
                                },
                              ]);
                            }
                          }
                        }
                      } catch (toolErr: unknown) {
                        if (!isCurrentTurn()) return;
                        if (toolErr instanceof ApiError && toolErr.status === 403) {
                          cleanupSession('tool_forbidden');
                          setSessionState('error');
                          setErrorMessage(copyRef.current.toolForbidden);
                          onShowToast('error', copyRef.current.toolForbiddenToast, copyRef.current.toolForbiddenTitle);
                          return;
                        }
                        const live = geminiSessionRef.current;
                        if (live && !live.closed) {
                          try {
                            live.sendToolResponse([{
                              id: tool.id,
                              name: tool.name,
                              response: { error: friendlyVoiceError(toolErr, localeRef.current) },
                            }]);
                          } catch {
                            // ignore
                          }
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
              },
              onToolCallCancellation: (ids) => {
                if (!isCurrentSession()) return;
                if (ids.length > 0) toolGenerationRef.current += 1;
              },
              onGoAway: () => {
                providerEnding = true;
              },
              onError: () => {
                if (!isCurrentSession()) return;
                fallbackToText(friendlyVoiceError(null, localeRef.current), 'provider_error');
              },
              onClose: (event) => {
                if (!isCurrentSession()) return;
                if (providerEnding || (event && typeof event === 'object' && 'wasClean' in event && event.wasClean === false)) {
                  fallbackToText(friendlyVoiceError(null, localeRef.current), 'ws_closed');
                  return;
                }
                setSessionState('ended');
                cleanupSession('ws_closed');
              },
            },
          });
          if (!isCurrentSession()) {
            try {
              geminiSession.close();
            } catch {
              // ignore
            }
            return;
          }
          geminiSessionRef.current = geminiSession;
          // The greeting arrives after the locked kickoff text is sent.
          geminiSession.sendKickoff(geminiConfig.kickoff);
        } else {
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
                timerRef.current = setInterval(() => {
                  if (!isCurrentSession()) return;
                  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
                  const left = Math.max(0, tokenData.maxSeconds - elapsed);
                  if (left <= 0) {
                    handleStopVoice(copyRef.current.timeLimit, 'limit');
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
                    handleStopVoice(copyRef.current.idle60, 'idle');
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
                setTranscriptTurns((prev) => setTranscriptTurn(prev, 'user', parsed.text));
              }
              break;

            case 'transcript.user':
              markUserActivity();
              if (typeof parsed.text === 'string') {
                setTranscriptTurns((prev) => closeTranscriptTurns(setTranscriptTurn(prev, 'user', parsed.text), 'user'));
              }
              break;

            case 'transcript.agent.delta':
              if (typeof parsed.delta === 'string') {
                setTranscriptTurns((prev) => appendTranscriptTurn(prev, 'agent', parsed.delta));
              }
              break;

            case 'transcript.agent':
              if (typeof parsed.text === 'string') {
                setTranscriptTurns((prev) => closeTranscriptTurns(setTranscriptTurn(prev, 'agent', parsed.text), 'agent'));
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
              // The AssemblyAI turn boundary: the agent bubble ends here, like turnComplete on Gemini.
              setTranscriptTurns((prev) => closeTranscriptTurns(prev, 'agent'));
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
                          setErrorMessage(copyRef.current.toolForbidden);
                          onShowToast('error', copyRef.current.toolForbiddenToast, copyRef.current.toolForbiddenTitle);
                          return;
                        }
                        if (ws.readyState === WebSocket.OPEN) {
                          ws.send(
                            JSON.stringify({
                              type: 'tool.result',
                              call_id: tool.call_id,
                              result: JSON.stringify({ error: friendlyVoiceError(toolErr, localeRef.current) }),
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
              if (rateLimited) startCooldown();
              fallbackToText(
                friendlyVoiceError(rateLimited ? { status: 429 } : null, localeRef.current),
                'provider_error',
              );
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
          fallbackToText(friendlyVoiceError(null, localeRef.current), 'ws_error');
        };

        ws.onclose = (event) => {
          if (!isCurrentSession()) return;
          if (event?.wasClean === false) {
            fallbackToText(friendlyVoiceError(null, localeRef.current), 'ws_closed');
            return;
          }
          setSessionState('ended');
          cleanupSession('ws_closed');
        };
        }
      } catch (err: any) {
        if (!isCurrentSession()) return;
        if (isVoiceCooldownError(err)) startCooldown();
        fallbackToText(friendlyVoiceError(err, localeRef.current), 'start_failed');
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
      onShowToast('success', copyRef.current.rsvpVoiceOk, copyRef.current.rsvpVoiceOkTitle);
    } catch {
      onShowToast('error', copyRef.current.rsvpVoiceFail, copyRef.current.rsvpVoiceFailTitle);
    } finally {
      setIsConfirmingAction(false);
    }
  };

  const handleStartVoiceRef = useRef(handleStartVoice);
  handleStartVoiceRef.current = handleStartVoice;
  const handledAutoStartRef = useRef(0);
  // FP-WELCOME-1: the welcome card click is the explicit consent. Each new
  // signal marks consent and starts one public session through the usual path
  // (usual notices, no retry). Manual opens mount with signal 0 and stay idle;
  // an already-running session is left alone.
  useEffect(() => {
    if (!publicAudience || !autoStartSignal || handledAutoStartRef.current === autoStartSignal) return;
    handledAutoStartRef.current = autoStartSignal;
    onAutoStartConsumed?.();
    const state = sessionStateRef.current;
    if (state !== 'idle' && state !== 'ended' && state !== 'error') return;
    setConsentGranted(true);
    void handleStartVoiceRef.current();
  }, [autoStartSignal, publicAudience, onAutoStartConsumed]);

  const startDisabledReason = !consentGranted
    ? m.needConsent
    : cooldownSeconds > 0
      ? m.cooldownWait(cooldownSeconds)
      : null;
  /**
   * Engine named in consent/privacy/subtitle. The token wins once seated;
   * before start the capabilities announce the real engine so consent names
   * the provider that will receive audio. Absent = assemblyai.
   */
  const effectiveVoiceProvider: VoiceProvider = activeProvider ?? capabilities?.voiceProvider ?? 'assemblyai';
  const geminiActive = effectiveVoiceProvider === 'gemini';

  return (
    <>
      {/* Floating or Embedded Trigger */}
      {!embedded && (
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 900 }}>
          <button
            onClick={() => {
              if (isOpen) handleStopVoice();
              setOpen(!isOpen);
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
            aria-label={isOpen ? m.closeVoice : m.openVoice}
            aria-expanded={isOpen}
          >
            <Mic size={20} aria-hidden="true" />
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{publicAudience ? m.talkShortPublic : m.talkShort}</span>
            {isOpen ? <X size={16} aria-hidden="true" /> : null}
          </button>
        </div>
      )}

      {/* Voice Assistant Modal/Drawer */}
      {isOpen && (
        <div
          style={{
            position: embedded ? 'relative' : 'fixed',
            bottom: embedded ? 'auto' : '5.2rem',
            right: embedded ? 'auto' : '1.5rem',
            width: embedded ? '100%' : '380px',
            maxWidth: embedded ? 'none' : 'calc(100vw - 3rem)',
            maxHeight: embedded ? 'none' : 'min(520px, calc(100dvh - 6.2rem))',
            flex: embedded ? 1 : undefined,
            minHeight: embedded ? 0 : undefined,
            backgroundColor: '#FFFFFF',
            borderRadius: embedded ? 0 : 'var(--radius-xl)',
            border: embedded ? 'none' : '1.5px solid var(--color-border)',
            boxShadow: embedded ? 'none' : 'var(--shadow-ticket)',
            zIndex: embedded ? 'auto' : 901,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          role="region"
          aria-label={publicAudience ? m.panelPublic : m.panelLabel}
        >
          {/* Header */}
          {!embedded && (
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
              <Mic size={20} aria-hidden="true" />
              <div>
                <strong style={{ fontSize: '0.9rem', display: 'block' }}>
                  {publicAudience ? m.titlePublic : organizer ? m.titleOrg : m.titleGuest}
                </strong>
                <span style={{ fontSize: '0.72rem', opacity: 0.9 }}>
                  {publicAudience ? m.subtitlePublic : geminiActive ? m.subtitleGemini : m.subtitleAgent}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                handleStopVoice();
                setOpen(false);
              }}
              style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'inline-flex' }}
              aria-label={m.closePanel}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          )}

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
                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{m.joinFirstTitle}</div>
                <p style={{ color: 'var(--color-ink-muted)' }}>
                  {m.joinFirstBody}
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
                  {m.voiceOffTitle}
                </div>
                <p style={{ color: 'var(--color-ink-muted)' }}>
                  {m.voiceOffBody}
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
                    <Lock size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} />
                    <strong>{m.privacyTitle}</strong>{' '}
                    {publicAudience ? (
                      <>
                        {m.privacyPublicA}
                        {voiceAvailable ? (geminiActive ? m.privacyPublicGemini : m.privacyPublicOn) : m.privacyPublicOff}
                      </>
                    ) : organizer ? (
                      <>
                        {m.privacyOrgA}<strong>{geminiActive ? m.providerGemini : m.providerAssembly}</strong>{m.privacyOrgB}
                      </>
                    ) : (
                      <>
                        {m.privacyGuestA}<strong>{geminiActive ? m.providerGemini : m.providerAssembly}</strong>{m.privacyGuestB1}<strong>&quot;{guest?.name}&quot;</strong>{m.privacyGuestB2}
                      </>
                    )}
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={consentGranted}
                      onChange={(e) => setConsentGranted(e.target.checked)}
                    />
                    <span>{voiceAvailable ? (geminiActive ? m.consentGemini : m.consentOn) : m.consentOff}</span>
                  </label>
                </div>

                {/* Session controls */}
                {voiceStopped && (
                  <p className="session-revoked-banner" role="status">
                    {accessRevoked ? m.stoppedRevoked : m.stoppedClosed}
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
                      <Mic size={18} aria-hidden="true" />
                      <span>{publicAudience ? labels.listen : labels.startVoice}</span>
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
                            ? m.statusMic
                            : sessionState === 'connecting'
                            ? m.statusConnecting
                            : agentStatus === 'speaking'
                            ? m.statusSpeaking
                            : agentStatus === 'processing'
                            ? m.statusProcessing
                            : micPaused ? m.statusPaused : m.statusListening}
                        </strong>
                      </div>
                      {micPaused ? (
                        <button type="button" className="btn btn-primary" onClick={() => resumeMicRef.current?.()}>
                          {m.resumeMic}
                        </button>
                      ) : null}
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
                      {transcriptTurns.length === 0 ? (
                        <div style={{ color: 'var(--color-ink-muted)', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>
                          {publicAudience ? m.emptyPublic : m.emptyGuest}
                        </div>
                      ) : (
                        transcriptTurns.map((turn) => (
                          <div key={turn.id} data-testid="voice-turn" data-role={turn.role}>
                            {turn.role === 'user' ? (
                              <>
                                <span style={{ fontSize: '0.72rem', color: 'var(--color-blue)', fontWeight: 700, display: 'block' }}>
                                  {m.youPrefix} ({publicAudience ? m.visitor : organizer ? m.organizerRole : guest?.name}):
                                </span>
                                <span style={{ color: 'var(--color-ink)' }}>{turn.text}</span>
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: '0.72rem', color: 'var(--color-teal)', fontWeight: 700, display: 'block' }}>
                                  {publicAudience ? m.assistantIsPublic : geminiActive ? m.assistantIsGemini : m.assistantIs}
                                </span>
                                <span style={{ color: 'var(--color-ink)' }}>
                                  <AssistantText text={turn.text} guideScope="page" />
                                </span>
                              </>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    <button
                      onClick={() => handleStopVoice(copyRef.current.stopToast)}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--color-coral)' }}
                    >
                      <span aria-hidden="true">⏹️ </span>{labels.stopVoice}
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
                          <div style={{ fontWeight: 700, color: 'var(--color-ink)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <ClipboardList size={16} aria-hidden="true" />
                            <span>{m.proposalTitle}</span>
                          </div>
                          <p style={{ color: 'var(--color-ink-muted)', marginBottom: '0.5rem' }}>
                            {m.proposalSuggests}<strong>{prop.status === 'yes' ? m.attend(totalCount, peopleWord(totalCount, locale)) : prop.status === 'no' ? m.decline : m.maybe}</strong>.
                          </p>
                          <button
                            onClick={() => handleConfirmActionProposal(prop)}
                            disabled={prop.confirmed || isConfirmingAction || voiceStopped}
                            className="btn btn-teal"
                            style={{ width: '100%', fontSize: '0.75rem', padding: '0.4rem' }}
                          >
                            {prop.confirmed ? (
                              <>
                                <Check size={16} aria-hidden="true" />
                                <span>{m.confirmedServer}</span>
                              </>
                            ) : (
                              m.confirmRsvp
                            )}
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
                    <div style={{ fontWeight: 700, color: 'var(--color-teal)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Receipt size={16} aria-hidden="true" />
                      <span>{m.quoteDoneTitle}</span>
                    </div>
                    <p style={{ margin: '0.25rem 0' }}>
                      {quoteClientSummary(
                        {
                          people: suggestedQuote.people,
                          unit: formatMoney(suggestedQuote.unitCents),
                          total: formatMoney(suggestedQuote.totalCents),
                          paid: formatMoney(suggestedQuote.paidCents),
                          due: formatMoney(suggestedQuote.amountCents),
                        },
                        suggestedQuote.amountCents,
                        locale,
                      )}
                    </p>
                    <p style={{ margin: '0.25rem 0', fontSize: '0.75rem', color: 'var(--color-ink)' }}>
                      {m.quotePendingNote}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleApproveInPayPal(suggestedQuote)}
                      className="btn btn-primary"
                      style={{ width: '100%', marginTop: '0.35rem', fontSize: '0.8rem', padding: '0.55rem 0.6rem' }}
                    >
                      {m.approveInPayPal(formatMoney(suggestedQuote.amountCents))}
                    </button>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-ink-muted)', display: 'block', marginTop: '0.35rem' }}>
                      {m.quoteDoneHint}
                    </span>
                  </div>
                )}

                {/* Error Banner. Always in the locale, never provider text. */}
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
                    <strong>{m.errorPrefix}</strong> {errorMessage}
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

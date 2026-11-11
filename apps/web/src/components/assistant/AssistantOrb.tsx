import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MessageCircle, Minus, X } from 'lucide-react';
import { UI_LABELS, type AssistantContext, type MealKind, type ThemeKey } from '@fiestapay/shared';
import type { Capabilities, Guest, Quote, RsvpStatus, TemplateKind } from '../../types';
import { PublicChatAssistant } from '../chat/PublicChatAssistant';
import { ChatAssistant } from '../chat/ChatAssistant';
import { VoiceInvitationAgent } from '../voice/VoiceInvitationAgent';
import {
  GUIDE_ACTION_EVENT,
  GUIDE_HIDDEN_EVENT,
  GUIDE_VISIBLE_EVENT,
  VOICE_ACTIVITY_EVENT,
  VOICE_FALLBACK_EVENT,
  VOICE_RESUME_EVENT,
  VOICE_STOP_EVENT,
  isInviteTarget,
  type GuideActionDetail,
  type GuideVisibleDetail,
  type VoiceActivityDetail,
  type VoiceFallbackDetail,
} from '../../guide/showOnScreen';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { orbCatalog } from '../../i18n/catalogs/orb';
import { OrbArt } from './OrbArt';
import {
  ASSISTANT_THEME_EVENT,
  ESPACIAL_ACCENT,
  ORB_SLOGANS,
  THEME_KEY_ICONS,
  localize,
  orbAccentFor,
  orbIconFor,
  orbThemeFor,
  type AssistantThemeDetail,
  type OrbIcon,
  type OrbThemeKey,
} from './orb-themes';

export type AssistantAudience = 'public' | 'guest' | 'organizer';
export type AssistantOrbMode = 'text' | 'voice';

/**
 * Document event that opens the orb in text mode without sending messages or
 * starting voice. Dispatch: `document.dispatchEvent(new CustomEvent(
 * ASSISTANT_OPEN_EVENT, { detail: { step } }))`. The payment wizard uses it
 * for its per-step "ask the assistant" link.
 */
export const ASSISTANT_OPEN_EVENT = 'fiestapay:open-assistant' as const;

/**
 * Document event that opens the public orb in voice mode and starts one voice
 * session. Dispatch: `document.dispatchEvent(new CustomEvent(
 * ASSISTANT_VOICE_OPEN_EVENT))`. Only the welcome card dispatches it, from its
 * own accept click with the consent line visible: that click is the explicit
 * consent. Guest and organizer orbs ignore it.
 */
export const ASSISTANT_VOICE_OPEN_EVENT = 'fiestapay:open-voice' as const;

export interface AssistantOrbTheme {
  template: TemplateKind;
  themeKey?: ThemeKey;
  meal?: MealKind;
}

export interface AssistantOrbProps {
  /** public: informational only. guest: the invitation routes. organizer: keyed panel routes. */
  audience?: AssistantAudience;
  slug?: string;
  capabilities: Capabilities | null;
  guest?: Guest | null;
  onApplyQuote?: (quote: Quote) => void;
  onConfirmRsvp?: (status: RsvpStatus, companions: number) => Promise<void>;
  accessRevoked?: boolean;
  eventClosed?: boolean;
  onShowToast: (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => void;
  /** Public only: which separate conversation to show. Defaults to landing. */
  context?: AssistantContext;
  /** External open request: the orb opens in text mode whenever this changes. */
  openSignal?: number;
  /** Invitation look. Without it the orb is deep-space, or follows /create. */
  theme?: AssistantOrbTheme;
}

type OrbCopy = (typeof orbCatalog)['es'];

function subtitleFor(audience: AssistantAudience, mode: AssistantOrbMode, m: OrbCopy): string {
  if (mode === 'voice') {
    if (audience === 'public') return m.subtitlePublicVoice;
    if (audience === 'organizer') return m.subtitleOrganizerVoice;
    return m.subtitleGuestVoice;
  }
  if (audience === 'public') return m.subtitlePublicText;
  if (audience === 'organizer') return m.subtitleOrganizerText;
  return m.subtitleGuestText;
}

/** Reactive media query. False when matchMedia is missing (tests, SSR). */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    try {
      return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
    return undefined;
  }, [query]);
  return matches;
}

const ESPACIAL_ICON: OrbIcon = THEME_KEY_ICONS.noche;

/**
 * One visible launcher for Text and Voice. The text component stays mounted (hidden when
 * voice is selected or the orb is closed), so its own in-memory history survives close and
 * reopen. Voice is mounted only after the person explicitly selects Hablar and is unmounted
 * on switch/close, which reuses its existing stop, lease-release and late-token cleanup.
 */
export const AssistantOrb: React.FC<AssistantOrbProps> = ({
  audience = 'public',
  slug,
  capabilities,
  guest = null,
  onApplyQuote,
  onConfirmRsvp,
  accessRevoked = false,
  eventClosed = false,
  onShowToast,
  context,
  openSignal,
  theme,
}) => {
  const { locale } = useI18n();
  const m = useMessages(orbCatalog);
  const labels = UI_LABELS[locale];
  const [isOpen, setIsOpen] = useState(false);
  const [docked, setDocked] = useState(false);
  const [textContext, setTextContext] = useState<AssistantContext | null>(null);
  const [guidedVoiceContext, setGuidedVoiceContext] = useState<AssistantContext | null>(null);
  const [mode, setMode] = useState<AssistantOrbMode>('text');
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dockButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const textTabRef = useRef<HTMLButtonElement>(null);
  const justClosedRef = useRef(false);
  const lastSignalRef = useRef(openSignal);
  const panelId = `assistant-orb-${useId().replace(/:/g, '')}`;

  /** Landing and demo keep their own mounted text state; only one shows. */
  const activeContext: AssistantContext = context ?? 'landing';
  const textKey = audience === 'public' ? 'public' : `${audience}:${slug ?? ''}`;
  const voiceKey = `voice:${audience}:${slug ?? ''}`;

  // Orb look: an explicit invitation theme wins; otherwise /create drives the
  // surprise through ASSISTANT_THEME_EVENT and everything else is deep-space.
  const [createTemplate, setCreateTemplate] = useState<TemplateKind | null>(null);
  useEffect(() => {
    if (theme) return;
    const onTheme = (event: Event) => {
      const detail = (event as CustomEvent<AssistantThemeDetail>).detail;
      setCreateTemplate(detail?.template ?? null);
    };
    document.addEventListener(ASSISTANT_THEME_EVENT, onTheme);
    return () => document.removeEventListener(ASSISTANT_THEME_EVENT, onTheme);
  }, [theme]);

  const activeTemplate = theme?.template ?? createTemplate;
  const orb: OrbThemeKey = orbThemeFor(activeTemplate ?? null);
  const accent = activeTemplate ? orbAccentFor(activeTemplate, theme?.themeKey) : ESPACIAL_ACCENT;
  const orbIcon = activeTemplate ? orbIconFor(activeTemplate, theme?.themeKey) : ESPACIAL_ICON;
  const slogan = localize(ORB_SLOGANS[orb], locale);
  const agentName = labels.agentName;

  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  // Landscape phones (height <= 560 px): one-line header, full-height panel.
  const compact = useMediaQuery('(max-height: 560px)');
  const mobile = useMediaQuery('(max-width: 639px), (pointer: coarse) and (max-height: 560px)');

  // The pill alternates between the agent name and the theme motto.
  const [showSlogan, setShowSlogan] = useState(false);
  useEffect(() => {
    if (reducedMotion) {
      setShowSlogan(false);
      return;
    }
    const id = window.setInterval(() => setShowSlogan((value) => !value), 4000);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  // Attention surprise every ~10 s until the orb is opened once on this page.
  const [surprise, setSurprise] = useState(false);
  const openedRef = useRef(false);
  useEffect(() => {
    if (isOpen) {
      openedRef.current = true;
      setSurprise(false);
    }
  }, [isOpen]);
  useEffect(() => {
    if (reducedMotion) return;
    let stopTimer: number | undefined;
    const id = window.setInterval(() => {
      if (openedRef.current) return;
      setSurprise(true);
      window.clearTimeout(stopTimer);
      stopTimer = window.setTimeout(() => setSurprise(false), 2200);
    }, 10000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stopTimer);
    };
  }, [reducedMotion]);

  // Under 640 px the pill folds to the orb alone after ~6 s so it never
  // covers content; focus or hover brings it back.
  const [pillCollapsed, setPillCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(max-width: 639px)');
    let timer: number | undefined;
    const arm = () => {
      window.clearTimeout(timer);
      if (query.matches) {
        timer = window.setTimeout(() => setPillCollapsed(true), 6000);
      } else {
        setPillCollapsed(false);
      }
    };
    arm();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', arm);
      return () => {
        window.clearTimeout(timer);
        query.removeEventListener('change', arm);
      };
    }
    return () => window.clearTimeout(timer);
  }, []);

  const closeOrb = useCallback(() => {
    justClosedRef.current = true;
    setDocked(false);
    setTextContext(null);
    setGuidedVoiceContext(null);
    setIsOpen(false);
    setMode('text');
  }, []);

  const minimizePanel = () => {
    restoreFocusRef.current = true;
    if (mode === 'text') setTextContext((previous) => previous ?? activeContext);
    setDocked(true);
  };

  useEffect(() => {
    if (lastSignalRef.current !== openSignal) {
      lastSignalRef.current = openSignal;
      if (openSignal !== undefined) {
        setDocked(false);
        setMode('text');
        setIsOpen(true);
      }
    }
  }, [openSignal]);

  useEffect(() => {
    if (isOpen) {
      textTabRef.current?.focus();
    } else if (justClosedRef.current) {
      justClosedRef.current = false;
      launcherRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || docked) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeOrb();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, docked, closeOrb]);

  useEffect(() => {
    const onOpenRequest = () => {
      setDocked(false);
      setMode('text');
      setIsOpen(true);
    };
    document.addEventListener(ASSISTANT_OPEN_EVENT, onOpenRequest);
    return () => document.removeEventListener(ASSISTANT_OPEN_EVENT, onOpenRequest);
  }, []);

  // FP-WELCOME-1: the welcome card accept click opens voice and asks for one
  // session start. The signal is consumed by the voice pane, so a later manual
  // open never starts the microphone by itself.
  const [voiceAutoStart, setVoiceAutoStart] = useState(0);
  const consumeVoiceAutoStart = useCallback(() => setVoiceAutoStart(0), []);
  useEffect(() => {
    const onVoiceRequest = () => {
      if (audience !== 'public') return;
      const state = orbStateRef.current;
      if (state.mode === 'voice' && state.isOpen && (voiceLiveRef.current || state.docked)) return;
      setDocked(false);
      setFallbackNotice(null);
      setMode('voice');
      setIsOpen(true);
      setVoiceAutoStart((value) => value + 1);
    };
    document.addEventListener(ASSISTANT_VOICE_OPEN_EVENT, onVoiceRequest);
    return () => document.removeEventListener(ASSISTANT_VOICE_OPEN_EVENT, onVoiceRequest);
  }, [audience]);

  // On mobile the live voice panel stays mounted behind the corner controls.
  // The temporary guide bar still handles placement and desktop behavior.
  const [voiceLive, setVoiceLive] = useState<{
    active: boolean;
    paused: boolean;
    status: 'listening' | 'speaking' | 'processing';
  }>({ active: false, paused: false, status: 'listening' });
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [guideBar, setGuideBar] = useState<{ placement: 'top' | 'bottom' } | null>(null);
  const voiceLiveRef = useRef(false);
  const orbStateRef = useRef({ isOpen, mode, mobile, docked, activeContext });
  orbStateRef.current = { isOpen, mode, mobile, docked, activeContext };
  const barTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onVoiceActivity = (event: Event) => {
      const detail = (event as CustomEvent<VoiceActivityDetail>).detail;
      if (!detail || detail.audience !== audience) return;
      const wasLive = voiceLiveRef.current;
      const state = orbStateRef.current;
      voiceLiveRef.current = detail.active;
      if (wasLive && !detail.active && state.mobile && state.docked && state.mode === 'voice') closeOrb();
      setVoiceLive({ active: detail.active, paused: detail.paused === true, status: detail.status });
      if (!detail.active) {
        setGuidedVoiceContext(null);
        window.clearTimeout(barTimerRef.current);
        barTimerRef.current = undefined;
        setGuideBar(null);
      }
    };
    const onGuideAction = (event: Event) => {
      const state = orbStateRef.current;
      const detail = (event as CustomEvent<GuideActionDetail>).detail;
      const guidesThisAudience = audience === 'public'
        || (audience === 'guest' && isInviteTarget(detail?.target));
      if (!guidesThisAudience || !state.isOpen) return;
      if (state.mobile) {
        if (state.mode === 'text') setTextContext((previous) => previous ?? state.activeContext);
        if (state.mode === 'voice' && voiceLiveRef.current && audience === 'public') {
          // Keep the original public token and its context across the guided handoff.
          setGuidedVoiceContext((previous) => previous ?? state.activeContext);
        }
        if (state.mode === 'text' || voiceLiveRef.current) setDocked(true);
        else closeOrb();
        return;
      }
      if (state.mode === 'voice' && voiceLiveRef.current) {
        setGuideBar((prev) => prev ?? { placement: 'bottom' });
        window.clearTimeout(barTimerRef.current);
        barTimerRef.current = window.setTimeout(() => setGuideBar(null), 5000);
        return;
      }
      closeOrb();
    };
    const onGuideVisible = (event: Event) => {
      if (!voiceLiveRef.current) return;
      const detail = (event as CustomEvent<GuideVisibleDetail>).detail;
      window.clearTimeout(barTimerRef.current);
      barTimerRef.current = undefined;
      if (detail) setGuideBar({ placement: detail.placement });
    };
    const onGuideHidden = () => {
      window.clearTimeout(barTimerRef.current);
      barTimerRef.current = undefined;
      setGuideBar(null);
    };
    // A real voice failure (token, connection or provider) switches the same
    // audience to its text chat; the voice component already released mic/lease.
    const onVoiceFallback = (event: Event) => {
      const detail = (event as CustomEvent<VoiceFallbackDetail>).detail;
      if (!detail?.message || detail.audience !== audience) return;
      voiceLiveRef.current = false;
      window.clearTimeout(barTimerRef.current);
      barTimerRef.current = undefined;
      setGuideBar(null);
      setFallbackNotice(detail.message);
      setMode('text');
      setIsOpen(true);
    };
    document.addEventListener(VOICE_ACTIVITY_EVENT, onVoiceActivity);
    document.addEventListener(VOICE_FALLBACK_EVENT, onVoiceFallback);
    document.addEventListener(GUIDE_ACTION_EVENT, onGuideAction);
    document.addEventListener(GUIDE_VISIBLE_EVENT, onGuideVisible);
    document.addEventListener(GUIDE_HIDDEN_EVENT, onGuideHidden);
    return () => {
      document.removeEventListener(VOICE_ACTIVITY_EVENT, onVoiceActivity);
      document.removeEventListener(VOICE_FALLBACK_EVENT, onVoiceFallback);
      document.removeEventListener(GUIDE_ACTION_EVENT, onGuideAction);
      document.removeEventListener(GUIDE_VISIBLE_EVENT, onGuideVisible);
      document.removeEventListener(GUIDE_HIDDEN_EVENT, onGuideHidden);
      window.clearTimeout(barTimerRef.current);
    };
  }, [audience, closeOrb]);

  // The voice pane unmounts on switch/close, which stops its session; the bar and
  // the live flag reset with it. While the bar shows, the pane stays mounted hidden.
  useEffect(() => {
    if (mode === 'voice' && isOpen) return;
    voiceLiveRef.current = false;
    setVoiceLive({ active: false, paused: false, status: 'listening' });
    setGuideBar(null);
  }, [mode, isOpen]);

  useEffect(() => {
    if (mobile && voiceLive.active && mode === 'voice' && isOpen) setDocked(true);
  }, [mobile, voiceLive.active, mode, isOpen]);

  const showVoiceBar = isOpen && mode === 'voice' && voiceLive.active
    && (mobile ? docked : guideBar !== null);
  const showTextDock = mobile && docked && isOpen && mode === 'text';
  const panelVisible = isOpen && !showVoiceBar && !showTextDock;

  const reopenPanel = () => {
    restoreFocusRef.current = true;
    window.clearTimeout(barTimerRef.current);
    barTimerRef.current = undefined;
    setGuideBar(null);
    setDocked(false);
  };

  useEffect(() => {
    if (!restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    if (panelVisible) {
      document.getElementById(`${panelId}-${mode}-tab`)?.focus({ preventScroll: true });
    } else {
      dockButtonRef.current?.focus({ preventScroll: true });
    }
  }, [showTextDock, showVoiceBar, panelVisible, mode, panelId]);

  const panelControls = (
    <div className="fp-orb-header-controls">
      {mobile && (mode === 'text' || voiceLive.active) ? (
        <button type="button" className="fp-orb-header-button" onClick={minimizePanel} aria-label={m.minimizePanel}>
          <Minus size={18} aria-hidden="true" />
        </button>
      ) : null}
      <button type="button" className="fp-orb-header-button" onClick={closeOrb} aria-label={m.closePanel}>
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <>
      <button
        ref={launcherRef}
        hidden={showVoiceBar || showTextDock || (mobile && panelVisible)}
        type="button"
        onClick={() => {
          if (isOpen) closeOrb();
          else setIsOpen(true);
        }}
        onFocus={() => setPillCollapsed(false)}
        onMouseEnter={() => setPillCollapsed(false)}
        aria-label={isOpen ? m.launcherClose : labels.orbLauncher}
        aria-expanded={isOpen}
        aria-controls={panelId}
        data-orb={orb}
        data-pill-collapsed={pillCollapsed ? 'true' : 'false'}
        className={`fp-orb-launcher${pillCollapsed ? ' fp-orb-launcher--bare' : ''}`}
      >
        <OrbArt
          orb={orb}
          accent={accent}
          icon={orbIcon}
          meal={theme?.meal}
          size={56}
          surprise={surprise}
          static={reducedMotion}
        />
        {!pillCollapsed && (
          <span className="fp-orb-pill" data-testid="orb-pill">
            {showSlogan ? slogan : agentName}
          </span>
        )}
        <span
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: 0,
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {m.launcherShort}
        </span>
      </button>

      <section
        id={panelId}
        role="dialog"
        aria-label={m.dialogLabel}
        aria-modal="false"
        className="fp-orb-panel"
        data-compact={compact ? 'true' : 'false'}
        data-mobile={mobile ? 'true' : 'false'}
        style={{ display: panelVisible ? 'flex' : 'none' }}
      >
        {compact ? (
          <header
            className="fp-orb-header--compact"
            style={{
              padding: '0.35rem 0.5rem',
              backgroundColor: 'var(--color-ink)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <OrbArt orb={orb} accent={accent} icon={orbIcon} meal={theme?.meal} size={24} static={reducedMotion} />
            <strong style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', flex: '0 0 auto' }}>{m.title}</strong>
            <div role="tablist" aria-label={m.modeLabel} style={{ display: 'flex', gap: '0.3rem', flex: 1, minWidth: 0 }}>
              <button
                ref={textTabRef}
                type="button"
                role="tab"
                id={`${panelId}-text-tab`}
                aria-selected={mode === 'text'}
                aria-controls={`${panelId}-text-pane`}
                tabIndex={mode === 'text' ? 0 : -1}
                onClick={() => setMode('text')}
                className={mode === 'text' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ flex: 1, padding: '0.25rem 0.4rem', fontSize: '0.72rem' }}
              >
                {labels.textTab}
              </button>
              <button
                type="button"
                role="tab"
                id={`${panelId}-voice-tab`}
                aria-selected={mode === 'voice'}
                aria-controls={`${panelId}-voice-pane`}
                tabIndex={mode === 'voice' ? 0 : -1}
                onClick={() => {
                  setFallbackNotice(null);
                  setMode('voice');
                }}
                className={mode === 'voice' ? 'btn btn-teal' : 'btn btn-secondary'}
                style={{ flex: 1, padding: '0.25rem 0.4rem', fontSize: '0.72rem' }}
              >
                {labels.voiceTab}
              </button>
            </div>
            {panelControls}
          </header>
        ) : (
          <>
            <header
              style={{
                padding: '0.8rem 0.9rem',
                backgroundColor: 'var(--color-ink)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                <OrbArt orb={orb} accent={accent} icon={orbIcon} meal={theme?.meal} size={30} static={reducedMotion} />
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', fontSize: '0.92rem' }}>{m.title}</strong>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.7rem',
                      color: 'var(--color-yellow)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {subtitleFor(audience, mode, m)}
                  </span>
                </div>
              </div>
              {panelControls}
            </header>

            <div
              role="tablist"
              aria-label={m.modeLabel}
              style={{
                display: 'flex',
                gap: '0.4rem',
                padding: '0.45rem 0.65rem',
                backgroundColor: 'var(--color-surface-subtle)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <button
                ref={textTabRef}
                type="button"
                role="tab"
                id={`${panelId}-text-tab`}
                aria-selected={mode === 'text'}
                aria-controls={`${panelId}-text-pane`}
                tabIndex={mode === 'text' ? 0 : -1}
                onClick={() => setMode('text')}
                className={mode === 'text' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
              >
                {labels.textTab}
              </button>
              <button
                type="button"
                role="tab"
                id={`${panelId}-voice-tab`}
                aria-selected={mode === 'voice'}
                aria-controls={`${panelId}-voice-pane`}
                tabIndex={mode === 'voice' ? 0 : -1}
                onClick={() => {
                  setFallbackNotice(null);
                  setMode('voice');
                }}
                className={mode === 'voice' ? 'btn btn-teal' : 'btn btn-secondary'}
                style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
              >
                {labels.voiceTab}
              </button>
            </div>
          </>
        )}

        {fallbackNotice ? (
          <div
            role="alert"
            data-testid="voice-fallback-notice"
            style={{
              backgroundColor: 'var(--color-yellow-tint)',
              borderBottom: '1px solid var(--color-yellow)',
              color: 'var(--color-ink)',
              padding: '0.6rem 0.75rem',
              fontSize: '0.78rem',
              lineHeight: 1.45,
            }}
          >
            {fallbackNotice}
          </div>
        ) : null}

        <div
          id={`${panelId}-text-pane`}
          role="tabpanel"
          aria-labelledby={`${panelId}-text-tab`}
          style={{
            display: mode === 'text' ? 'flex' : 'none',
            flex: 1,
            minHeight: 0,
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {audience === 'public' ? (
            <>
              {(['landing', 'demo'] as const).map((ctx) => (
                <div
                  key={`${textKey}:${ctx}`}
                  style={{
                    display: (textContext ?? activeContext) === ctx ? 'flex' : 'none',
                    flex: 1,
                    minHeight: 0,
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <PublicChatAssistant
                    capabilities={capabilities}
                    embedded
                    open={isOpen && mode === 'text'}
                    onOpenChange={(next) => {
                      if (!next) closeOrb();
                    }}
                    context={ctx}
                    idSuffix={ctx}
                    compact={compact}
                  />
                </div>
              ))}
            </>
          ) : (
            <ChatAssistant
              key={textKey}
              slug={slug ?? ''}
              capabilities={capabilities}
              audience={audience}
              embedded
              open={isOpen && mode === 'text'}
              accessRevoked={accessRevoked}
              closed={eventClosed}
              onApplyQuote={onApplyQuote}
              onConfirmRsvp={onConfirmRsvp}
              onOpenChange={(next) => {
                if (!next) closeOrb();
              }}
            />
          )}
        </div>

        {mode === 'voice' && isOpen && (
          <div
            id={`${panelId}-voice-pane`}
            role="tabpanel"
            aria-labelledby={`${panelId}-voice-tab`}
            style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}
          >
            <VoiceInvitationAgent
              key={voiceKey}
              slug={slug}
              capabilities={capabilities}
              guest={guest}
              audience={audience}
              context={guidedVoiceContext ?? activeContext}
              embedded
              open
              accessRevoked={accessRevoked}
              eventClosed={eventClosed}
              onApplyQuote={onApplyQuote}
              onConfirmRsvp={onConfirmRsvp}
              onShowToast={onShowToast}
              onOpenChange={(next) => {
                if (!next) closeOrb();
              }}
              autoStartSignal={voiceAutoStart}
              onAutoStartConsumed={consumeVoiceAutoStart}
            />
          </div>
        )}
      </section>

      {showTextDock ? (
        <button
          ref={dockButtonRef}
          type="button"
          className="fp-voice-bar fp-assistant-dock fp-assistant-dock--text"
          data-placement="bottom"
          aria-controls={panelId}
          aria-expanded={false}
          onClick={reopenPanel}
        >
          <MessageCircle size={18} aria-hidden="true" />
          {m.returnToChat}
        </button>
      ) : null}
      {showVoiceBar ? (
        <div
          className={mobile ? 'fp-voice-bar fp-assistant-dock' : 'fp-voice-bar'}
          data-placement={guideBar?.placement ?? 'bottom'}
          data-testid="voice-guide-bar"
        >
          <OrbArt orb={orb} accent={accent} icon={orbIcon} meal={theme?.meal} size={28} static={reducedMotion} />
          <span className="fp-voice-bar__status" role="status">
            {voiceLive.status === 'speaking' ? m.guideBarSpeaking
              : voiceLive.status === 'processing' ? m.guideBarProcessing
              : voiceLive.paused ? m.guideBarPaused : m.guideBarListening}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              try {
                document.dispatchEvent(new CustomEvent(VOICE_STOP_EVENT));
              } catch {
                // The voice panel owns the stop path.
              }
            }}
          >
            {m.guideBarStop}
          </button>
          {voiceLive.paused ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => document.dispatchEvent(new CustomEvent(VOICE_RESUME_EVENT, { detail: audience }))}
            >
              {m.guideBarResume}
            </button>
          ) : null}
          <button
            type="button"
            className={voiceLive.paused ? 'btn btn-secondary' : 'btn btn-primary'}
            ref={dockButtonRef}
            aria-controls={panelId}
            aria-expanded={false}
            onClick={reopenPanel}
          >
            {m.guideBarOpen}
          </button>
        </div>
      ) : null}
    </>
  );
};

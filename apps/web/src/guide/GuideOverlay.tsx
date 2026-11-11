/**
 * FP-GUIDE-1 tutorial overlay: an animated ring around the guided element (which stays
 * tappable) plus a bubble with the hint. No libraries. Closes on tap, Esc or after 12 s;
 * `prefers-reduced-motion` renders a static ring. Also runs the /demo step-by-step tour.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { UI_LABELS, UI_TARGETS, type Locale, type UiTarget } from '@fiestapay/shared';
import { useI18n, useMessages } from '../i18n/I18nContext';
import { orbCatalog } from '../i18n/catalogs/orb';
import { demoCatalog } from '../i18n/catalogs/demo';
import {
  GUIDE_HIDE_EVENT,
  GUIDE_HIDDEN_EVENT,
  GUIDE_SHOW_EVENT,
  GUIDE_TOUR_EVENT,
  GUIDE_VISIBLE_EVENT,
  VOICE_ACTIVITY_EVENT,
  findGuideTarget,
  type GuideShowDetail,
  type GuideTourDetail,
  type GuideVisibleDetail,
  type VoiceActivityDetail,
} from './showOnScreen';
import { guideIsMobileViewport, guideStepFor, startGuideScroll } from './step-preview';

const AUTO_CLOSE_MS = 12000;
const RING_PAD = 6;
const BUBBLE_GAP = 12;
const BUBBLE_WIDTH = 300;

interface Spot {
  target: UiTarget;
  caption?: string;
  tour?: { steps: UiTarget[]; index: number };
  /** The target lives in a mobile-preview `[data-guide-step]` wrapper. */
  step?: boolean;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    try {
      return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(media.matches);
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
    return undefined;
  }, []);
  return reduced;
}

function tourTextFor(step: UiTarget, demo: (typeof demoCatalog)['es']): string | null {
  if (step === 'aiBuildParty') return demo.tourAi;
  if (step === 'previewPanel') return demo.tourPreview;
  if (step === 'paymentDemo') return demo.tourPayment;
  if (step === 'paypalAiPanel') return demo.tourPaypal;
  return null;
}

function defaultCaptionFor(locale: Locale, target: UiTarget, tapHere: (label: string) => string): string {
  return tapHere(UI_LABELS[locale][UI_TARGETS[target].label]);
}

export const GuideOverlay: React.FC = () => {
  const { locale } = useI18n();
  const orb = useMessages(orbCatalog);
  const demo = useMessages(demoCatalog);
  const reducedMotion = useReducedMotion();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(0);
  const [voiceActive, setVoiceActive] = useState(false);
  const voiceActiveRef = useRef(false);
  const voiceSpeakingRef = useRef(false);
  const spotRef = useRef<Spot | null>(null);
  spotRef.current = spot;
  const elementRef = useRef<HTMLElement | null>(null);
  const addedTabindexRef = useRef(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const close = useCallback(() => {
    if (!spotRef.current) return;
    spotRef.current = null;
    const element = elementRef.current;
    elementRef.current = null;
    if (addedTabindexRef.current) {
      addedTabindexRef.current = false;
      try {
        element?.removeAttribute('tabindex');
      } catch {
        // The element may already be gone.
      }
    }
    setRect(null);
    setSpot(null);
    try {
      document.dispatchEvent(new CustomEvent(GUIDE_HIDDEN_EVENT));
    } catch {
      // Listeners never break the close path.
    }
  }, []);

  const resolveElement = useCallback((target: UiTarget): HTMLElement | null => {
    const current = elementRef.current;
    if (current && current.isConnected) return current;
    const found = findGuideTarget(target);
    elementRef.current = found;
    return found;
  }, []);

  // Show / tour / hide requests from the guide service.
  useEffect(() => {
    const onShow = (event: Event) => {
      const detail = (event as CustomEvent<GuideShowDetail>).detail;
      if (!detail?.target) return;
      elementRef.current = null;
      setSpot({
        target: detail.target,
        ...(detail.caption ? { caption: detail.caption } : {}),
        ...(detail.step ? { step: true } : {}),
      });
    };
    const onTour = (event: Event) => {
      const detail = (event as CustomEvent<GuideTourDetail>).detail;
      const steps = detail?.steps?.filter((step): step is UiTarget => typeof step === 'string') ?? [];
      if (steps.length === 0 || !steps[0]) return;
      elementRef.current = null;
      setSpot({ target: steps[0], tour: { steps, index: 0 } });
    };
    const onHide = () => close();
    document.addEventListener(GUIDE_SHOW_EVENT, onShow);
    document.addEventListener(GUIDE_TOUR_EVENT, onTour);
    document.addEventListener(GUIDE_HIDE_EVENT, onHide);
    return () => {
      document.removeEventListener(GUIDE_SHOW_EVENT, onShow);
      document.removeEventListener(GUIDE_TOUR_EVENT, onTour);
      document.removeEventListener(GUIDE_HIDE_EVENT, onHide);
    };
  }, [close]);

  // Focus the guided element (still tappable) and own the scroll for tours and
  // marked step wrappers. On mobile the scroll aligns the heading below the
  // sticky header and previews long steps; desktop keeps the centered scroll.
  useEffect(() => {
    if (!spot) return;
    const element = resolveElement(spot.target);
    if (!element) {
      // A tour step that never mounted is skipped instead of stalling the tour.
      if (spot.tour) {
        const next = spot.tour.index + 1;
        if (next < spot.tour.steps.length) {
          const following = spot.tour.steps[next];
          if (following) {
            elementRef.current = null;
            const advanced = { target: following, tour: { steps: spot.tour.steps, index: next } };
            // Advance the ref synchronously: the rect effect below runs on
            // this same commit for the stale spot, and without this it would
            // see a missing element and close the tour instead of skipping.
            spotRef.current = advanced;
            setSpot(advanced);
            return;
          }
        }
        close();
      } else {
        close();
      }
      return;
    }
    let cancelScroll: (() => void) | undefined;
    if (spot.tour || spot.step) {
      cancelScroll = startGuideScroll({
        target: element,
        step: guideStepFor(element),
        reducedMotion,
        previewReady: voiceActiveRef.current ? () => voiceSpeakingRef.current : undefined,
      });
    }
    const focusable = /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(element.tagName) || element.hasAttribute('tabindex');
    if (!focusable) {
      try {
        element.setAttribute('tabindex', '-1');
        addedTabindexRef.current = true;
      } catch {
        // Focus still attempted below.
      }
    }
    try {
      element.focus({ preventScroll: true });
    } catch {
      try {
        element.focus();
      } catch {
        // A non-focusable element still shows the ring.
      }
    }
    return () => cancelScroll?.();
  }, [spot, reducedMotion, resolveElement, close]);

  // Measure the hint so it stays fully inside short phone viewports even when
  // the highlighted target is above or below the fold. The first render has a
  // spot but no rect yet, so `hasRect` re-runs this when the bubble mounts.
  const hasRect = rect !== null;
  useLayoutEffect(() => {
    if (!spot || !hasRect) return;
    const node = bubbleRef.current;
    if (!node) return;
    const measure = () => {
      const next = node.getBoundingClientRect().height || node.offsetHeight || 0;
      if (next > 0) setBubbleHeight(next);
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [spot, hasRect]);

  // Track the element rect; a disconnected target (navigation away) closes the guide.
  useEffect(() => {
    if (!spot) return;
    let alive = true;
    const measure = () => {
      if (!alive || spotRef.current !== spot) return;
      const element = resolveElement(spot.target);
      if (!element || !element.isConnected) {
        close();
        return;
      }
      setRect(element.getBoundingClientRect());
    };
    measure();
    const interval = window.setInterval(measure, 500);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [spot, resolveElement, close]);

  // A live voice session owns the highlight lifetime: it closes when the session
  // ends, never on a timer. Only the active→inactive transition closes, so idle
  // panels mounting or unmounting never dismiss a highlight.
  useEffect(() => {
    const onVoiceActivity = (event: Event) => {
      const detail = (event as CustomEvent<VoiceActivityDetail>).detail;
      if (!detail) return;
      const wasActive = voiceActiveRef.current;
      voiceActiveRef.current = detail.active;
      voiceSpeakingRef.current = detail.active && detail.status === 'speaking';
      setVoiceActive(detail.active);
      if (wasActive && !detail.active) close();
    };
    document.addEventListener(VOICE_ACTIVITY_EVENT, onVoiceActivity);
    return () => document.removeEventListener(VOICE_ACTIVITY_EVENT, onVoiceActivity);
  }, [close]);

  // Auto-close 12 s after a text-label highlight only. Tour steps advance or exit
  // explicitly, and a live voice session may keep explaining past 12 s.
  useEffect(() => {
    if (!spot) return;
    if (spot.tour) return;
    if (voiceActive) return;
    const timer = window.setTimeout(close, AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [spot, voiceActive, close]);

  // Esc closes. On mobile, swiping through a tour keeps its Next and Exit controls.
  useEffect(() => {
    if (!spot) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (spot.tour && guideIsMobileViewport()) return;
      const bubble = bubbleRef.current;
      if (bubble && event.target instanceof Node && bubble.contains(event.target)) return;
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [spot, close]);

  const viewportHeight = window.innerHeight || 667;
  const placement: 'top' | 'bottom' =
    rect && rect.top + rect.height / 2 < viewportHeight / 2 ? 'bottom' : 'top';

  // Announce visibility + placement so the voice mini-bar parks on the other half.
  useEffect(() => {
    if (!spot || !rect) return;
    try {
      document.dispatchEvent(
        new CustomEvent<GuideVisibleDetail>(GUIDE_VISIBLE_EVENT, {
          detail: { target: spot.target, placement },
        }),
      );
    } catch {
      // Listeners never break the highlight.
    };
  }, [spot, rect, placement]);

  if (!spot || !rect) return null;

  const tourIndex = spot.tour?.index;
  const tourSteps = spot.tour?.steps;
  const isTour = tourIndex !== undefined && tourSteps !== undefined;
  // fillWithAi always uses the fixed caption: a model caption like "Filling the
  // party details with AI" wrongly suggests the AI is already working before
  // the person presses anything.
  const body =
    (isTour && tourSteps[tourIndex] ? tourTextFor(tourSteps[tourIndex], demo) : null) ??
    (spot.target === 'fillWithAi'
      ? orb.guideFillWithAi
      : (spot.caption ?? defaultCaptionFor(locale, spot.target, orb.guideTapHere)));

  const viewportWidth = window.innerWidth || 375;
  const bubbleLeft = Math.min(
    Math.max(8, rect.left + rect.width / 2 - BUBBLE_WIDTH / 2),
    Math.max(8, viewportWidth - BUBBLE_WIDTH - 8),
  );
  // Keep the hint and its actions inside the viewport even when the ring is
  // above or below the fold during a scroll preview.
  const effectiveBubbleHeight = bubbleHeight || (isTour ? 150 : 96);
  const desiredBubbleTop =
    placement === 'bottom' ? rect.bottom + BUBBLE_GAP : rect.top - BUBBLE_GAP - effectiveBubbleHeight;
  const bubbleTop = Math.min(
    Math.max(8, desiredBubbleTop),
    Math.max(8, viewportHeight - effectiveBubbleHeight - 8),
  );
  const bubbleStyle: React.CSSProperties = { left: bubbleLeft, top: bubbleTop };

  return (
    <>
      <div
        className="fp-guide-ring"
        data-motion={reducedMotion ? 'static' : 'animated'}
        data-testid="guide-ring"
        aria-hidden="true"
        style={{
          left: rect.left - RING_PAD,
          top: rect.top - RING_PAD,
          width: rect.width + RING_PAD * 2,
          height: rect.height + RING_PAD * 2,
        }}
      />
      <div
        ref={bubbleRef}
        className="fp-guide-bubble"
        data-testid="guide-bubble"
        role="status"
        style={bubbleStyle}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          if (!isTour) close();
        }}
      >
        <span>{body}</span>
        {isTour && tourSteps ? (
          <div className="fp-guide-bubble__actions">
            <button
              type="button"
              className="btn btn-primary"
              data-tour-action="next"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                const next = (tourIndex ?? 0) + 1;
                if (next < tourSteps.length) {
                  const following = tourSteps[next];
                  if (following) {
                    elementRef.current = null;
                    setSpot({ target: following, tour: { steps: tourSteps, index: next } });
                    return;
                  }
                }
                close();
              }}
            >
              {orb.guideNext}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              data-tour-action="exit"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                close();
              }}
            >
              {orb.guideExit}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
};

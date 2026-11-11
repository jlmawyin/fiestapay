/**
 * FP-GUIDE mobile step preview.
 *
 * A guided target may live inside a fixed `[data-guide-step]` wrapper (a wizard
 * step, a judges-demo step, the PayPal explainer). On a phone, scrolling that
 * target to the middle of the viewport hides the heading behind the sticky
 * header. Instead we align the wrapper heading just below the header. If the
 * step is taller than the viewport we play a brief down-and-back preview while
 * the assistant explains, then settle at the heading so the person keeps
 * scrolling by themselves.
 *
 * The preview is a small rAF scroll, never a synthetic press. Any touch,
 * pointer, wheel, navigation key, manual scroll or new step cancels it, and a
 * cancelled preview never snaps back or overwrites the person's scroll.
 */

export const GUIDE_STEP_SELECTOR = '[data-guide-step]';

/** Phones and small tablets get the step preview; desktop keeps centered scroll. */
const MOBILE_MAX_WIDTH = 640;
const HEADER_GAP = 12;
const BOTTOM_GAP = 16;
const PREVIEW_MAX = 240;
const PREVIEW_MIN = 56;
const MAX_VOICE_PREVIEW_WAIT_MS = 1500;

export function guideStepFor(element: HTMLElement): HTMLElement | null {
  try {
    const step = element.closest(GUIDE_STEP_SELECTOR);
    return step instanceof HTMLElement ? step : null;
  } catch {
    return null;
  }
}

export function guideIsMobileViewport(): boolean {
  try {
    return window.innerWidth > 0 && window.innerWidth <= MOBILE_MAX_WIDTH;
  } catch {
    return false;
  }
}

function viewportHeight(): number {
  try {
    return window.innerHeight || 667;
  } catch {
    return 667;
  }
}

/** Bottom of the sticky header, plus breathing room, in viewport coordinates. */
function guideTopOffset(): number {
  try {
    const header = document.querySelector('header');
    if (header instanceof HTMLElement) {
      // Only the app's pinned header reserves space; an assistant panel header
      // that happens to be first in the DOM must not shift the guide.
      const position = window.getComputedStyle(header).position;
      const rect = header.getBoundingClientRect();
      const height = rect.height || header.offsetHeight || 0;
      const bottom = rect.bottom > 0 ? rect.bottom : height;
      if ((position === 'sticky' || position === 'fixed') && height > 0) {
        return Math.round(Math.max(0, bottom)) + HEADER_GAP;
      }
    }
  } catch {
    // No measurable header: keep the small breathing gap.
  }
  return HEADER_GAP;
}

function currentScroll(): number {
  try {
    return window.scrollY || window.pageYOffset || 0;
  } catch {
    return 0;
  }
}

function maxScroll(): number {
  try {
    const root = document.documentElement;
    return Math.max(0, (root?.scrollHeight ?? 0) - viewportHeight());
  } catch {
    return 0;
  }
}

/** Document position that leaves the wrapper heading just below the header. */
function headingScrollTop(container: HTMLElement): number {
  const rect = container.getBoundingClientRect();
  return Math.max(0, Math.round(currentScroll() + rect.top - guideTopOffset()));
}

function applyScroll(top: number): void {
  const rounded = Math.round(top);
  try {
    window.scrollTo({ top: rounded, left: 0, behavior: 'instant' });
    return;
  } catch {
    // Older engines only accept the positional form.
  }
  try {
    window.scrollTo(0, rounded);
  } catch {
    // A locked-down test environment may not implement scrolling.
  }
}

function easeInOut(progress: number): number {
  return progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
}

interface Segment {
  from: number;
  to: number;
  start: number;
  duration: number;
}

interface Keyframe {
  top: number;
  duration: number;
  holdBefore?: number;
}

function animateScroll(keyframes: Keyframe[], finalHeading: () => number, previewReady?: () => boolean): () => void {
  const firstTop = currentScroll();
  const segments: Segment[] = [];
  let cursor = 0;
  let previous = firstTop;
  for (const frame of keyframes) {
    if (frame.holdBefore) {
      segments.push({ from: previous, to: previous, start: cursor, duration: frame.holdBefore });
      cursor += frame.holdBefore;
    }
    segments.push({ from: previous, to: frame.top, start: cursor, duration: Math.max(1, frame.duration) });
    cursor += Math.max(1, frame.duration);
    previous = frame.top;
  }
  const finalTop = previous;

  let cancelled = false;
  let rafId = 0;
  let startedAt: number | null = null;
  let voiceWaitStarted: number | null = null;
  let previewReleased = !previewReady;
  const onManual = () => cancel();
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown' ||
      event.key === 'PageUp' ||
      event.key === 'PageDown' ||
      event.key === 'Home' ||
      event.key === 'End' ||
      event.key === ' ' ||
      event.key === 'Escape'
    ) {
      cancel();
    }
  };
  const cleanup = () => {
    try {
      window.removeEventListener('wheel', onManual);
      window.removeEventListener('touchstart', onManual);
      window.removeEventListener('pointerdown', onManual, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('popstate', onManual);
      window.removeEventListener('hashchange', onManual);
    } catch {
      // Listener removal never breaks the guide.
    }
  };

  function cancel(): void {
    if (cancelled) return;
    cancelled = true;
    try {
      window.cancelAnimationFrame(rafId);
    } catch {
      // The frame already ran.
    }
    cleanup();
  }

  function frame(timestamp: number): void {
    if (cancelled) return;
    if (startedAt === null) startedAt = timestamp;
    let elapsed = timestamp - startedAt;
    const headingArrival = segments[0]?.duration ?? 0;
    if (!previewReleased && elapsed >= headingArrival) {
      voiceWaitStarted ??= timestamp;
      if (previewReady?.() || timestamp - voiceWaitStarted >= MAX_VOICE_PREVIEW_WAIT_MS) {
        previewReleased = true;
      } else {
        startedAt = timestamp - headingArrival;
        elapsed = headingArrival;
      }
    }
    let top = finalTop;
    for (const segment of segments) {
      if (elapsed <= segment.start) {
        top = segment.from;
        break;
      }
      const progress = Math.min(1, (elapsed - segment.start) / segment.duration);
      top = segment.from + (segment.to - segment.from) * easeInOut(progress);
      if (progress < 1) break;
    }
    if (elapsed >= cursor) {
      // Capabilities and fonts can move a step during the preview.
      applyScroll(finalHeading());
      cleanup();
      return;
    }
    applyScroll(top);
    rafId = window.requestAnimationFrame(frame);
  }

  try {
    window.addEventListener('wheel', onManual, { passive: true });
    window.addEventListener('touchstart', onManual, { passive: true });
    window.addEventListener('pointerdown', onManual, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('popstate', onManual);
    window.addEventListener('hashchange', onManual);
    rafId = window.requestAnimationFrame(frame);
  } catch {
    // Without rAF, align immediately rather than leaving the target offscreen.
    applyScroll(finalHeading());
    cleanup();
  }

  return cancel;
}

export interface GuideScrollOptions {
  target: HTMLElement;
  /** Fixed step wrapper found by the caller; auto-detected when omitted. */
  step?: HTMLElement | null;
  reducedMotion: boolean;
  /** When available, begin the down-and-back preview as the voice starts speaking. */
  previewReady?: () => boolean;
  /** Tests may force the mobile branch. */
  mobile?: boolean;
}

/**
 * Starts the guide's scroll for one target. Returns an idempotent cancel that
 * must run on a new step or unmount.
 */
export function startGuideScroll(options: GuideScrollOptions): () => void {
  const { target, reducedMotion } = options;
  const mobile = options.mobile ?? guideIsMobileViewport();
  const step = options.step ?? guideStepFor(target);
  if (!mobile || !step) {
    try {
      target.scrollIntoView({
        block: 'center',
        inline: 'center',
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    } catch {
      // The ring still shows without the scroll.
    }
    return () => undefined;
  }

  const container = step;
  const finalHeading = () => Math.min(headingScrollTop(container), maxScroll());
  const limit = maxScroll();
  const start = finalHeading();

  // Reduced motion means top alignment only: no preview, no animation.
  if (reducedMotion) {
    applyScroll(start);
    return () => undefined;
  }

  const rect = container.getBoundingClientRect();
  const height = Math.max(rect.height || 0, container.scrollHeight || 0);
  const available = Math.max(160, viewportHeight() - guideTopOffset() - BOTTOM_GAP);
  const isLong = height > available * 0.9;
  if (!isLong) {
    const distance = Math.abs(start - currentScroll());
    return animateScroll([
      { top: start, duration: Math.min(420, Math.max(160, distance * 0.45)) },
    ], finalHeading);
  }

  const previewDistance = Math.round(
    Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, (height - available) * 0.55)),
  );
  const down = Math.min(limit, start + previewDistance);
  if (down <= start + 8) {
    const distance = Math.abs(start - currentScroll());
    return animateScroll([
      { top: start, duration: Math.min(420, Math.max(160, distance * 0.45)) },
    ], finalHeading);
  }

  const distance = Math.abs(start - currentScroll());
  return animateScroll([
    { top: start, duration: Math.min(420, Math.max(160, distance * 0.45)) },
    { top: down, duration: 520, holdBefore: 80 },
    { top: start, duration: 520, holdBefore: 200 },
  ], finalHeading, options.previewReady);
}

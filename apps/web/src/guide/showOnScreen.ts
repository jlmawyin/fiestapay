/**
 * FP-GUIDE-1 — the agent opens pages and highlights elements; it never presses anything.
 *
 * Single service behind quoted labels in text answers, the /demo guided tour and the
 * public voice tool. The model only ever chooses ids from the shared contract
 * (`UI_PAGES` / `UI_TARGETS`); paths and selectors live there, never in model output.
 * Anything else (unknown ids, URLs, selectors, extra keys) is rejected with
 * `{ ok:false, reason:'invalid_args' }` without navigating, scrolling or highlighting.
 */
import {
  DEMO_TOUR,
  INVITE_UI_TARGETS,
  UI_PAGES,
  UI_TARGETS,
  UI_TARGET_IDS,
  type DraftEventProposal,
  type ShowOnScreenArgs,
  type ShowOnScreenResult,
  type UiPage,
  type UiTarget,
  type VoiceAudience,
} from '@fiestapay/shared';

/** Fired synchronously once validated, so the orb minimizes before navigation paints. */
export const GUIDE_ACTION_EVENT = 'fiestapay:guide-action' as const;
/** Asks the overlay to highlight one element. */
export const GUIDE_SHOW_EVENT = 'fiestapay:guide-show' as const;
/** Asks the overlay to hide whatever it shows. */
export const GUIDE_HIDE_EVENT = 'fiestapay:guide-hide' as const;
/** The overlay announces a visible highlight (used to place the voice bar). */
export const GUIDE_VISIBLE_EVENT = 'fiestapay:guide-visible' as const;
/** The overlay announces the highlight is gone, whatever closed it. */
export const GUIDE_HIDDEN_EVENT = 'fiestapay:guide-hidden' as const;
/** Asks the overlay to run a step-by-step tour. */
export const GUIDE_TOUR_EVENT = 'fiestapay:guide-tour' as const;
/** Asks /create to write the person's party sentence into the one-sentence field (no AI run). */
export const GUIDE_PREFILL_EVENT = 'fiestapay:guide-prefill' as const;
/** Delivers a complete public-chat draft to a mounted /create wizard, one visit only. */
export const GUIDE_DRAFT_EVENT = 'fiestapay:guide-draft' as const;
/** Voice failed for a real token/connection/provider reason; continue in text. */
export const VOICE_FALLBACK_EVENT = 'fiestapay:voice-fallback' as const;
/** Voice session activity for the orb (public mini-bar). */
export const VOICE_ACTIVITY_EVENT = 'fiestapay:voice-activity' as const;
/** The mini-bar asks the voice panel to stop through its usual Stop path. */
export const VOICE_STOP_EVENT = 'fiestapay:voice-stop' as const;

export interface GuideActionDetail {
  page?: UiPage;
  target?: UiTarget;
  tour?: boolean;
}

export interface GuideShowDetail {
  target: UiTarget;
  caption?: string;
}

export interface GuideVisibleDetail {
  target: UiTarget;
  placement: 'top' | 'bottom';
}

export interface GuideTourDetail {
  steps: UiTarget[];
}

export interface GuidePrefillDetail {
  sentence: string;
}

export interface GuideDraftDetail {
  proposal: DraftEventProposal;
}

export interface VoiceFallbackDetail {
  message: string;
  audience: VoiceAudience;
}

export interface VoiceActivityDetail {
  active: boolean;
  status: 'listening' | 'speaking' | 'processing';
  audience: VoiceAudience;
}

function dispatchGuideEvent(name: string, detail: unknown): void {
  try {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    // A listener must never break the guide action.
  }
}

export function dispatchGuideAction(detail: GuideActionDetail): void {
  dispatchGuideEvent(GUIDE_ACTION_EVENT, detail);
}

export function dispatchGuideShow(detail: GuideShowDetail): void {
  dispatchGuideEvent(GUIDE_SHOW_EVENT, detail);
}

/** Hides any highlight or tour the overlay currently shows. */
export function dismissGuide(): void {
  dispatchGuideEvent(GUIDE_HIDE_EVENT, null);
}

/**
 * Pending one-sentence prefill for /create. The event reaches a mounted wizard;
 * the pending slot covers a wizard that mounts after the navigation. Reading
 * consumes: a stale sentence never leaks into a later manual visit.
 */
let pendingGuidePrefill: string | null = null;

export function setGuidePrefill(sentence: string): void {
  pendingGuidePrefill = sentence;
  dispatchGuideEvent(GUIDE_PREFILL_EVENT, { sentence } satisfies GuidePrefillDetail);
}

export function consumeGuidePrefill(): string | null {
  const sentence = pendingGuidePrefill;
  pendingGuidePrefill = null;
  return sentence;
}

/**
 * Pending complete DraftEventProposal for /create. It is not persisted anywhere:
 * reading consumes it, so a later manual visit never receives an old proposal.
 */
let pendingGuideDraft: DraftEventProposal | null = null;

export function setGuideDraftProposal(proposal: DraftEventProposal): void {
  pendingGuideDraft = proposal;
  dispatchGuideEvent(GUIDE_DRAFT_EVENT, { proposal } satisfies GuideDraftDetail);
}

export function consumeGuideDraftProposal(): DraftEventProposal | null {
  const proposal = pendingGuideDraft;
  pendingGuideDraft = null;
  return proposal;
}

/**
 * Public chat card click: hand the whole proposal to the controlled /create
 * route exactly once. A mounted wizard receives the event synchronously; a
 * wizard that mounts after the navigation reads the pending slot. No AI call,
 * no URL/storage payload and no automatic publish happen here.
 */
export function openCreateWithDraft(proposal: DraftEventProposal): void {
  const navigator = guideNavigator;
  if (!navigator) return;
  setGuideDraftProposal(proposal);
  dispatchGuideAction({ page: 'create' });
  if (getGuidePage() === 'create') return;
  try {
    navigator.navigate('create');
  } catch {
    consumeGuideDraftProposal();
  }
}

/** Starts the judges-demo tour (`DEMO_TOUR` order) from the /demo button. */
export function startGuidedTour(steps: readonly UiTarget[] = DEMO_TOUR): void {
  dispatchGuideAction({ page: 'demo', tour: true });
  dispatchGuideEvent(GUIDE_TOUR_EVENT, { steps: [...steps] } satisfies GuideTourDetail);
}

/** App-owned router wiring. Registered once by App; null anywhere else (tests). */
export interface GuideNavigator {
  navigate: (page: UiPage) => void;
  getCurrentPage: () => UiPage | null;
  /** Active invitation slug, or null on every other route. */
  getCurrentInviteSlug?: () => string | null;
}

let guideNavigator: GuideNavigator | null = null;

export function registerGuideNavigator(next: GuideNavigator | null): void {
  guideNavigator = next;
}

/** Current public page, or null on invite/dashboard routes (not guide pages). */
export function getGuidePage(): UiPage | null {
  try {
    return guideNavigator?.getCurrentPage() ?? null;
  } catch {
    return null;
  }
}

/** Active invitation slug reported by the app router, or null off invitation routes. */
export function getGuideInviteSlug(): string | null {
  try {
    return guideNavigator?.getCurrentInviteSlug?.() ?? null;
  } catch {
    return null;
  }
}

/** The invitation actually mounted in the DOM (never inferred from a URL). */
export function getMountedInviteSlug(): string | null {
  try {
    const root = document.querySelector('[data-invite-slug]');
    const slug = root instanceof HTMLElement ? root.dataset.inviteSlug : undefined;
    return slug && slug.length > 0 ? slug : null;
  } catch {
    return null;
  }
}

export function isInviteTarget(target: unknown): target is UiTarget {
  return typeof target === 'string' && (INVITE_UI_TARGETS as readonly string[]).includes(target);
}

export function guidePrefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const ALLOWED_ARG_KEYS = new Set(['page', 'target', 'caption', 'sentence']);
const MAX_CAPTION = 60;
const MIN_SENTENCE = 3;
const MAX_SENTENCE = 400;

function isUiPage(value: unknown): value is UiPage {
  return typeof value === 'string' && (UI_PAGES as readonly string[]).includes(value);
}

function isUiTarget(value: unknown): value is UiTarget {
  return typeof value === 'string' && (UI_TARGET_IDS as readonly string[]).includes(value);
}

/**
 * Strict contract validation. Only `page`/`target`/`caption`/`sentence` are accepted and
 * both ids must belong to the closed lists. URLs, selectors and any other key are
 * rejected. An over-long caption is trimmed to 60 characters; anything else fails
 * closed. `sentence` is only valid with target `fillWithAi`: plain text, 3–400
 * characters after trimming.
 */
export function validateShowOnScreenArgs(raw: unknown): { ok: true; args: ShowOnScreenArgs } | { ok: false } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_ARG_KEYS.has(key)) return { ok: false };
  }
  const { page, target, caption, sentence } = record;
  if (page !== undefined && !isUiPage(page)) return { ok: false };
  if (target !== undefined && !isUiTarget(target)) return { ok: false };
  if (page === undefined && target === undefined) return { ok: false };
  let cleanCaption: string | undefined;
  if (caption !== undefined) {
    if (typeof caption !== 'string') return { ok: false };
    const trimmed = caption.trim();
    if (trimmed.length > 0) cleanCaption = trimmed.slice(0, MAX_CAPTION);
  }
  let cleanSentence: string | undefined;
  if (sentence !== undefined) {
    if (target !== 'fillWithAi') return { ok: false };
    if (typeof sentence !== 'string') return { ok: false };
    const trimmed = sentence.trim();
    if (trimmed.length < MIN_SENTENCE || trimmed.length > MAX_SENTENCE) return { ok: false };
    cleanSentence = trimmed;
  }
  return {
    ok: true,
    args: {
      ...(page !== undefined ? { page: page as UiPage } : {}),
      ...(target !== undefined ? { target: target as UiTarget } : {}),
      ...(cleanCaption !== undefined ? { caption: cleanCaption } : {}),
      ...(cleanSentence !== undefined ? { sentence: cleanSentence } : {}),
    },
  };
}

const INVITE_ALLOWED_ARG_KEYS = new Set(['target', 'caption']);

/**
 * Guest voice contract for the current invitation: only one of the closed
 * INVITE_UI_TARGETS ids plus an optional caption. It accepts no page, slug,
 * URL, selector or sentence and never navigates.
 */
export function validateInviteShowOnScreenArgs(
  raw: unknown,
): { ok: true; args: ShowOnScreenArgs } | { ok: false } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!INVITE_ALLOWED_ARG_KEYS.has(key)) return { ok: false };
  }
  if (!isInviteTarget(record.target)) return { ok: false };
  let cleanCaption: string | undefined;
  if (record.caption !== undefined) {
    if (typeof record.caption !== 'string') return { ok: false };
    const trimmed = record.caption.trim();
    if (trimmed.length > 0) cleanCaption = trimmed.slice(0, MAX_CAPTION);
  }
  return {
    ok: true,
    args: {
      target: record.target,
      ...(cleanCaption !== undefined ? { caption: cleanCaption } : {}),
    },
  };
}

export function guideSelector(id: UiTarget): string {
  return `[data-guide="${id}"]`;
}

export function findGuideTarget(id: UiTarget): HTMLElement | null {
  try {
    const element = document.querySelector(guideSelector(id));
    return element instanceof HTMLElement ? element : null;
  } catch {
    return null;
  }
}

/** Waits (poll + MutationObserver) for the target to mount after a navigation. */
export function waitForGuideTarget(id: UiTarget, timeoutMs = 3000): Promise<HTMLElement | null> {
  const immediate = findGuideTarget(id);
  if (immediate) return Promise.resolve(immediate);
  return new Promise((resolve) => {
    let done = false;
    let observer: MutationObserver | null = null;
    let timer = 0;
    let deadline = 0;
    const finish = (element: HTMLElement | null) => {
      if (done) return;
      done = true;
      try {
        observer?.disconnect();
      } catch {
        // A torn-down observer still resolves below.
      }
      window.clearInterval(timer);
      window.clearTimeout(deadline);
      resolve(element);
    };
    const probe = () => {
      const element = findGuideTarget(id);
      if (element) finish(element);
    };
    if (typeof MutationObserver === 'function') {
      try {
        observer = new MutationObserver(probe);
        observer.observe(document.documentElement, { childList: true, subtree: true });
      } catch {
        observer = null;
      }
    }
    timer = window.setInterval(probe, 50);
    deadline = window.setTimeout(() => finish(findGuideTarget(id)), timeoutMs);
  });
}

export interface ShowOnScreenOptions {
  /** How long to wait for the target to mount. Tests shorten it; production waits 3 s. */
  timeoutMs?: number;
  /** Guest voice: this session belongs to `slug`; refuse if another invitation is active. */
  inviteSlug?: string;
}

/** Navigation entries open their page instead of highlighting. */
export function opensOf(target: UiTarget): UiPage | undefined {
  const spec = UI_TARGETS[target];
  return 'opens' in spec ? spec.opens : undefined;
}

/**
 * Opens one page and/or highlights one element. Navigation entries (`opens`) open their
 * page instead of highlighting. A target on another page opens that page first when
 * needed; header (`any`) targets highlight in place on any route. With target
 * `fillWithAi` and a valid `sentence`, /create also receives the person's phrase
 * written into the one-sentence field, without running the AI.
 */
export async function showOnScreen(
  rawArgs: unknown,
  options: ShowOnScreenOptions = {},
): Promise<ShowOnScreenResult> {
  const validated = validateShowOnScreenArgs(rawArgs);
  if (!validated.ok) return { ok: false, reason: 'invalid_args' };
  const args = validated.args;
  const timeoutMs = options.timeoutMs ?? 3000;
  const inviteTarget = args.target !== undefined && isInviteTarget(args.target);
  if (inviteTarget) {
    // Invitation targets belong to the invitation currently mounted. They never
    // navigate, carry a page/sentence or accept another event's slug.
    if (args.page !== undefined || args.sentence !== undefined) return { ok: false, reason: 'invalid_args' };
    const routeSlug = getGuideInviteSlug();
    const mountedSlug = getMountedInviteSlug();
    if (!routeSlug || !mountedSlug || routeSlug !== mountedSlug) {
      return { ok: false, reason: 'unavailable_here', ...(args.target ? { target: args.target } : {}) };
    }
    if (options.inviteSlug !== undefined && options.inviteSlug !== mountedSlug) {
      return { ok: false, reason: 'unavailable_here', ...(args.target ? { target: args.target } : {}) };
    }
    dispatchGuideAction({ target: args.target! });
    const element = await waitForGuideTarget(args.target!, timeoutMs);
    const activeSlug = getMountedInviteSlug();
    const activeRoute = getGuideInviteSlug();
    const elementSlug = element?.closest('[data-invite-slug]');
    const elementBelongs =
      elementSlug instanceof HTMLElement && elementSlug.dataset.inviteSlug === activeSlug;
    if (
      !element ||
      !elementBelongs ||
      !activeSlug ||
      !activeRoute ||
      activeRoute !== activeSlug ||
      (options.inviteSlug !== undefined && options.inviteSlug !== activeSlug)
    ) {
      return { ok: false, reason: 'unavailable_here', target: args.target! };
    }
    try {
      element.scrollIntoView({
        block: 'center',
        inline: 'center',
        behavior: guidePrefersReducedMotion() ? 'auto' : 'smooth',
      });
    } catch {
      // The highlight still shows without the scroll.
    }
    dispatchGuideShow({ target: args.target!, ...(args.caption ? { caption: args.caption } : {}) });
    return { ok: true, target: args.target! };
  }
  const spec = args.target ? UI_TARGETS[args.target] : undefined;
  const opens = args.target ? opensOf(args.target) : undefined;
  // An explicit page must agree with the target. A target pinned to another page
  // (and not a navigation entry) is a caller error: refuse without navigating.
  if (args.page && args.target && spec && !opens && spec.page !== 'any' && spec.page !== args.page) {
    return { ok: false, reason: 'invalid_args' };
  }
  // An explicit page wins; otherwise an opens entry or the target's own page.
  const destination: UiPage | undefined =
    args.page ?? opens ?? (spec && spec.page !== 'any' && spec.page !== 'invite' ? spec.page : undefined);
  // The sentence reaches /create before the highlight is waited for: a mounted
  // wizard opens step 1 on the event, a mounting wizard reads the pending slot.
  if (args.target === 'fillWithAi' && args.sentence) setGuidePrefill(args.sentence);
  const current = getGuidePage();
  dispatchGuideAction({ ...(destination || current ? { page: (destination ?? current) as UiPage } : {}), ...(args.target ? { target: args.target } : {}) });
  if (destination && destination !== current) {
    try {
      guideNavigator?.navigate(destination);
    } catch {
      // A failed navigation surfaces as unavailable_here below.
    }
  }
  if (!args.target) {
    return { ok: true, ...(destination || current ? { page: (destination ?? current) as UiPage } : {}) };
  }
  // Navigation entries open their page instead of highlighting: alone, or together
  // with their own page (the header link there would point at itself).
  if (opens && (!args.page || args.page === opens)) {
    return { ok: true, page: opens, target: args.target };
  }
  const element = await waitForGuideTarget(args.target, timeoutMs);
  if (!element) {
    // Nobody will highlight: drop a pending sentence so it never leaks into
    // a later manual visit to /create.
    consumeGuidePrefill();
    const missingPage = getGuidePage() ?? destination;
    return {
      ok: false,
      reason: 'unavailable_here',
      ...(missingPage ? { page: missingPage } : {}),
      target: args.target,
    };
  }
  try {
    element.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: guidePrefersReducedMotion() ? 'auto' : 'smooth',
    });
  } catch {
    // The highlight still shows without the scroll.
  }
  dispatchGuideShow({ target: args.target, ...(args.caption ? { caption: args.caption } : {}) });
  const after = getGuidePage() ?? destination;
  return { ok: true, ...(after ? { page: after } : {}), target: args.target };
}

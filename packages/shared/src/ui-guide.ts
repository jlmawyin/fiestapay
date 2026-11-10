/**
 * On-screen guide contract (Jorge, 10 Nov 2026): the agent may open a FiestaPay page and highlight
 * one element so the person sees it and presses it themselves. It never presses anything, never
 * pays, creates, confirms or changes data. The model only chooses ids from these closed lists;
 * paths and selectors live here, never in model output.
 */
import type { GeminiFunctionDeclaration } from './index.js';
import { UI_LABELS, type Locale } from './i18n.js';

/** Public pages the agent may open. */
export const UI_PAGES = ['landing', 'demo', 'create', 'recover'] as const;
export type UiPage = (typeof UI_PAGES)[number];

export const UI_PAGE_PATHS: Record<UiPage, string> = {
  landing: '/',
  demo: '/demo',
  create: '/create',
  recover: '/recover',
};

type UiLabelKey = keyof (typeof UI_LABELS)['es'];

export interface UiTargetSpec {
  /** Page where the element is rendered; 'invite' means the current invitation only. */
  page: UiPage | 'any' | 'invite';
  /** Visible text of the element, from UI_LABELS (same words the guide quotes). */
  label: UiLabelKey;
  /** Navigation entries: choosing this target opens that page instead of highlighting. */
  opens?: UiPage;
}

/** Elements the agent may show. The web marks each one with `data-guide="<id>"`. */
export const UI_TARGETS = {
  judgesDemo: { page: 'any', label: 'judgesDemo', opens: 'demo' },
  createInvitation: { page: 'landing', label: 'createInvitation', opens: 'create' },
  newInvitation: { page: 'any', label: 'newInvitation', opens: 'create' },
  myInvitations: { page: 'any', label: 'myInvitations' },
  languageSelector: { page: 'any', label: 'languageSelector' },
  previewPanel: { page: 'demo', label: 'previewPanel' },
  paymentDemo: { page: 'demo', label: 'paymentDemo' },
  paypalAiPanel: { page: 'demo', label: 'paypalAiPanel' },
  privateDemo: { page: 'demo', label: 'privateDemo' },
  myDemos: { page: 'demo', label: 'myDemos' },
  resetDemos: { page: 'demo', label: 'resetDemos' },
  describeInvitation: { page: 'create', label: 'describeInvitation' },
  guidedTour: { page: 'demo', label: 'guidedTour' },
  aiBuildParty: { page: 'demo', label: 'aiBuildParty' },
  fillWithAi: { page: 'create', label: 'fillWithAi' },
  quoteReview: { page: 'invite', label: 'quoteReview' },
  generatePayment: { page: 'invite', label: 'generatePayment' },
  openPayPal: { page: 'invite', label: 'openPayPal' },
} as const satisfies Record<string, UiTargetSpec>;

export type UiTarget = keyof typeof UI_TARGETS;
export const UI_TARGET_IDS = Object.keys(UI_TARGETS) as UiTarget[];

export const INVITE_UI_TARGETS = ['quoteReview', 'generatePayment', 'openPayPal'] as const satisfies readonly UiTarget[];
const PUBLIC_UI_TARGETS = UI_TARGET_IDS.filter((id) => UI_TARGETS[id].page !== 'invite');

/** Guided tour of the judges demo, in order. */
export const DEMO_TOUR: readonly UiTarget[] = ['aiBuildParty', 'previewPanel', 'paymentDemo', 'paypalAiPanel'];

/** Label text → target, for clickable labels inside text answers. Exact match after trimming. */
export function targetForLabel(locale: Locale, text: string): UiTarget | null {
  const wanted = text.trim();
  for (const id of UI_TARGET_IDS) {
    if (UI_LABELS[locale][UI_TARGETS[id].label] === wanted) return id;
  }
  return null;
}

export const SHOW_ON_SCREEN_TOOL = 'show_on_screen';

/** Arguments the browser accepts; anything else is rejected without acting. */
export interface ShowOnScreenArgs {
  page?: UiPage;
  target?: UiTarget;
  /** Short hint next to the highlight, ≤ 60 characters, in the person's language. */
  caption?: string;
  /**
   * Only with target 'fillWithAi': the party as the person described it (plain text, 3–400
   * characters). The browser writes it into the one-sentence field without running the AI;
   * the person presses "Fill with AI".
   */
  sentence?: string;
}

/** What the browser answers to the model after acting (or refusing). */
export interface ShowOnScreenResult {
  ok: boolean;
  page?: UiPage;
  target?: UiTarget;
  reason?: 'invalid_args' | 'unavailable_here' | 'disabled';
}

/** Voice tool declaration (Gemini Live form). Executed only by the browser, never by the server. */
export const SHOW_ON_SCREEN_DECLARATION: GeminiFunctionDeclaration = {
  name: SHOW_ON_SCREEN_TOOL,
  description:
    'Opens one FiestaPay page and/or highlights one element on screen so the person can see it and press it themselves. It never presses buttons, never pays, creates, confirms or changes anything. Use it when the person asks to go somewhere or where something is.',
  parameters: {
    type: 'OBJECT',
    properties: {
      page: { type: 'STRING', enum: [...UI_PAGES], description: 'Page to open.' },
      target: { type: 'STRING', enum: PUBLIC_UI_TARGETS, description: 'Element to highlight; its page opens first when needed.' },
      caption: { type: 'STRING', description: 'Short hint shown next to the highlight, max 60 characters, in the language of the conversation.' },
      sentence: { type: 'STRING', description: "Only with target fillWithAi: the party exactly as the person described it (type, people, amount, date, place), max 400 characters. It is typed into the one-sentence field; the person presses Fill with AI." },
    },
  },
};

/** Guest voice may highlight controls on its current invitation without navigating. */
export const INVITE_SHOW_ON_SCREEN_DECLARATION: GeminiFunctionDeclaration = {
  name: SHOW_ON_SCREEN_TOOL,
  description: 'Highlights a payment control on the current invitation. Never presses it, creates a PayPal order, or approves payment.',
  parameters: {
    type: 'OBJECT',
    properties: {
      target: { type: 'STRING', enum: [...INVITE_UI_TARGETS] },
      caption: { type: 'STRING', description: 'Optional hint in the guest language, max 60 characters.' },
    },
    required: ['target'],
  },
};

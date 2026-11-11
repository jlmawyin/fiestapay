import React, { useEffect, useRef, useState } from 'react';
import { Check, Lock, X } from 'lucide-react';
import {
  UI_LABELS,
  mealLabel,
  themeLabel,
  themePhrase,
  themesForTemplate,
  type DraftEventProposal,
  type PresentationSuggestionInput,
  type ThemeKey,
} from '@fiestapay/shared';
import type { AgendaItem, EventInput, TemplateKind } from '../../types';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { createEventCatalog } from '../../i18n/messages/organizerCreate';
import { ApiError, api } from '../../api/client';
import {
  buildEventInput,
  capitalLabel,
  collectExampleHits,
  defaultStart,
  mealForHour,
  pad,
  plusHours,
  reviewSignatureOf,
  toLocalInput,
  type ExampleHit,
  type EventFormFields,
} from './event-form-model';
import { CreateInterview } from './CreateInterview';
import {
  parseCreatePath,
  type CreatePath,
} from '../../lib/create-interview';
import {
  defaultThemeFor,
  formatEventRange,
  resolveTheme,
  suggestThemeFor,
  themeCssVars,
} from '../../lib/event-presentation';
import { TemplateCover } from '../illustrations/TemplateCover';
import { TemplateIcon } from './template-icons';
import { ASSISTANT_THEME_EVENT, type AssistantThemeDetail } from '../assistant/orb-themes';
import {
  GUIDE_ACTION_EVENT,
  GUIDE_DRAFT_EVENT,
  GUIDE_PREFILL_EVENT,
  consumeGuideDraftProposal,
  consumeGuidePrefill,
  type GuideDraftDetail,
  type GuidePrefillDetail,
} from '../../guide/showOnScreen';
import { isDraftEventProposal } from '../../lib/draft-proposal';

interface CreateWizardProps {
  onSubmit: (input: EventInput) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  /** One-shot prefill from the judges-demo AI step; the click consented to one AI fill. */
  initialDraft?: { text: string; id: number } | null;
  /** Bounded creation entry point from /create?path=… */
  path?: CreatePath;
  onSelectPath?: (path: CreatePath) => void;
}

export type CreateWizardStep = 1 | 2 | 3 | 4 | 5 | 6;

type DepartMode = 'plus3' | 'plus4' | 'midnight' | 'exact';

type FoodStyleKey = '' | 'asado' | 'mariscos' | 'tipico' | 'pizza' | 'parrillada' | 'vegetariano' | 'postres';

interface WhenState {
  date: string;
  time: string;
  durationHours: 2 | 3 | 4;
  departMode: DepartMode;
  exactTime: string;
  departDate: string;
  returnDate: string;
  endTime: string;
}

const addDays = (datePart: string, days: number): string => {
  const d = new Date(`${datePart}T12:00`);
  if (Number.isNaN(d.getTime())) return datePart;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const initialWhen = (): WhenState => {
  const date = defaultStart().slice(0, 10);
  return {
    date,
    time: '14:00',
    durationHours: 3,
    departMode: 'plus4',
    exactTime: '18:00',
    departDate: date,
    returnDate: addDays(date, 2),
    endTime: '18:00',
  };
};

const nextMidnight = (local: string): string => {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return toLocalInput(d);
};

/** Same instant math as the long form: local parts in, browser-local ISO out. */
const computeWhen = (template: TemplateKind, w: WhenState): { startsAt: string; endsAt: string } => {
  switch (template) {
    case 'comida': {
      const startsAt = `${w.date}T${w.time}`;
      return { startsAt, endsAt: plusHours(startsAt, w.durationHours) };
    }
    case 'casa': {
      const startsAt = `${w.date}T${w.time}`;
      if (w.departMode === 'exact') return { startsAt, endsAt: `${w.date}T${w.exactTime}` };
      if (w.departMode === 'midnight') return { startsAt, endsAt: nextMidnight(startsAt) };
      return { startsAt, endsAt: plusHours(startsAt, w.departMode === 'plus3' ? 3 : 4) };
    }
    case 'viaje':
      return { startsAt: `${w.departDate}T${w.time}`, endsAt: `${w.returnDate}T${w.time}` };
    case 'evento':
      return { startsAt: `${w.date}T${w.time}`, endsAt: `${w.date}T${w.endTime}` };
  }
};

const FOOD_STYLE_KEYS: Exclude<FoodStyleKey, ''>[] = [
  'asado',
  'mariscos',
  'tipico',
  'pizza',
  'parrillada',
  'vegetariano',
  'postres',
];

const INCLUDE_KEYS: Record<TemplateKind, string[]> = {
  viaje: ['hotel', 'transport', 'meals'],
  comida: ['main', 'drink', 'dessert'],
  casa: ['food', 'drinks', 'music'],
  evento: [],
};

const splitIncludesFree = (text: string): string[] =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Wizard fields that can carry a "suggested" mark from POST /api/ai/draft-event. */
type DraftMark =
  | 'template'
  | 'title'
  | 'meal'
  | 'date'
  | 'startTime'
  | 'duration'
  | 'location'
  | 'includes'
  | 'capacity'
  | 'price';

const isTemplateKind = (value: unknown): value is TemplateKind =>
  value === 'comida' || value === 'casa' || value === 'viaje' || value === 'evento';

const isDraftDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(new Date(`${value}T12:00`).getTime());

const isDraftTime = (value: unknown): value is string =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const durationHoursForComida = (minutes: number): 2 | 3 | 4 =>
  minutes < 150 ? 2 : minutes < 210 ? 3 : 4;

/** HH:MM plus minutes, or null when it would leave the same day. */
const addMinutesToTime = (time: string, minutes: number): string | null => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match || !match[1] || !match[2]) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  if (total < 0 || total >= 24 * 60) return null;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

/**
 * Creation assistant: one open step, later steps locked, finished steps
 * folded with «Cambiar». The payload and its validation are the shared
 * event-form model, so the same input sends the same EventInput as the
 * long form, in both languages.
 */
export const CreateWizard: React.FC<CreateWizardProps> = ({
  onSubmit,
  onCancel,
  isLoading,
  initialDraft = null,
  path = 'sentence',
  onSelectPath,
}) => {
  const { locale, formatMoney: formatMoneyInLocale } = useI18n();
  const m = useMessages(createEventCatalog);
  const labels = UI_LABELS[locale];

  const [template, setTemplate] = useState<TemplateKind>('comida');
  const [title, setTitle] = useState('');
  const [organizerName, setOrganizerName] = useState('');
  const [when, setWhen] = useState<WhenState>(initialWhen);
  const [whenTouched, setWhenTouched] = useState(false);
  const [meal, setMeal] = useState<'desayuno' | 'almuerzo' | 'cena'>('almuerzo');
  const [mealTouched, setMealTouched] = useState(false);
  const [foodStyle, setFoodStyle] = useState<FoodStyleKey>('');
  const [foodStyleFree, setFoodStyleFree] = useState('');
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [location, setLocation] = useState('');
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [includesFree, setIncludesFree] = useState('');
  const [description, setDescription] = useState('');
  const [priceDollars, setPriceDollars] = useState('');
  const [capacity, setCapacity] = useState('');
  const [calcTotal, setCalcTotal] = useState('');
  const [calcPeople, setCalcPeople] = useState('');
  const [calcResult, setCalcResult] = useState<string | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [minimumDollars, setMinimumDollars] = useState('');
  const [goalDollars, setGoalDollars] = useState('');
  const [deadlineLocal, setDeadlineLocal] = useState('');
  const [deadlineTouched, setDeadlineTouched] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [accessTouched, setAccessTouched] = useState(false);
  const [theme, setTheme] = useState<ThemeKey>(defaultThemeFor('comida').key);
  const [themeTouched, setThemeTouched] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [aiApplied, setAiApplied] = useState<string | null>(null);
  const [aiProposal, setAiProposal] = useState<{ theme: ThemeKey; description: string } | null>(null);
  const [draftText, setDraftText] = useState(initialDraft?.text ?? '');
  const autoDraftIdRef = useRef<number | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [draftSource, setDraftSource] = useState<'ai' | 'rules' | null>(null);
  const [suggestedMarks, setSuggestedMarks] = useState<ReadonlySet<DraftMark>>(new Set());
  const [openStep, setOpenStep] = useState<CreateWizardStep>(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [errorStep, setErrorStep] = useState<CreateWizardStep | null>(null);
  const [reviewVisited, setReviewVisited] = useState(false);
  const [activePath, setActivePath] = useState<CreatePath>(() => parseCreatePath(path));
  const [focusAfterNav, setFocusAfterNav] = useState<string | null>(null);
  const exampleWarningRef = useRef<HTMLDivElement>(null);
  const posting = useRef(false);

  useEffect(() => {
    setActivePath(parseCreatePath(path));
  }, [path]);

  const selectPath = (next: CreatePath) => {
    setActivePath(next);
    if (next !== 'interview') setOpenStep(1);
    setStepError(null);
    setErrorStep(null);
    onSelectPath?.(next);
  };

  const { startsAt, endsAt } = computeWhen(template, when);
  const hour = (() => {
    const h = new Date(startsAt).getHours();
    return Number.isNaN(h) ? null : h;
  })();

  const foodStyleLabel = (key: Exclude<FoodStyleKey, ''>): string => {
    switch (key) {
      case 'asado':
        return m.foodStyleAsado;
      case 'mariscos':
        return m.foodStyleMariscos;
      case 'tipico':
        return m.foodStyleTipico;
      case 'pizza':
        return m.foodStylePizza;
      case 'parrillada':
        return m.foodStyleParrillada;
      case 'vegetariano':
        return m.foodStyleVegetariano;
      case 'postres':
        return m.foodStylePostres;
    }
  };

  const includeLabelFor = (kind: TemplateKind, key: string): string => {
    switch (`${kind}:${key}`) {
      case 'viaje:hotel':
        return m.includeViajeHotel;
      case 'viaje:transport':
        return m.includeViajeTransport;
      case 'viaje:meals':
        return m.includeViajeMeals;
      case 'comida:main':
        return m.includeComidaMain;
      case 'comida:drink':
        return m.includeComidaDrink;
      case 'comida:dessert':
        return m.includeComidaDessert;
      case 'casa:food':
        return m.includeCasaFood;
      case 'casa:drinks':
        return m.includeCasaDrinks;
      case 'casa:music':
        return m.includeCasaMusic;
      default:
        return key;
    }
  };

  const includeLabel = (key: string): string => includeLabelFor(template, key);

  const assembledIncludes = (): string[] => {
    const out: string[] = [];
    if (template === 'comida') {
      if (foodStyle) out.push(foodStyleLabel(foodStyle));
      const free = foodStyleFree.trim();
      if (free) out.push(free);
    }
    for (const key of INCLUDE_KEYS[template]) {
      if (checks[`${template}:${key}`]) out.push(includeLabel(key));
    }
    out.push(...splitIncludesFree(includesFree));
    return out;
  };
  const includes = assembledIncludes();

  const foodStyleText = [
    foodStyle ? foodStyleLabel(foodStyle) : '',
    foodStyleFree.trim(),
  ]
    .filter(Boolean)
    .join(' ');

  const suggestedKey = suggestThemeFor({
    template,
    title,
    location,
    includes,
    meal,
    hour,
    foodStyle: foodStyleText,
  }).key;

  // Rules suggest the theme while the person has not chosen one. A manual
  // pick or an accepted AI suggestion sets themeTouched and stays put.
  useEffect(() => {
    if (!themeTouched && theme !== suggestedKey) setTheme(suggestedKey);
  });

  const titles: Record<CreateWizardStep, string> = {
    1: labels.stepWhat,
    2: labels.stepWhen,
    3: labels.stepWhere,
    4: labels.stepShare,
    5: labels.stepLook,
    6: m.reviewSummaryTitle,
  };
  const steps: CreateWizardStep[] = [1, 2, 3, 4, 5, 6];

  const typeExample = (t: TemplateKind): string => {
    switch (t) {
      case 'comida':
        return m.typeExampleComida;
      case 'casa':
        return m.typeExampleCasa;
      case 'viaje':
        return m.typeExampleViaje;
      case 'evento':
        return m.typeExampleEvento;
    }
  };

  // When the open step advances, move focus to it with a smooth scroll and
  // announce it. The first render never steals focus.
  const stepRefs = useRef<Record<CreateWizardStep, HTMLLIElement | null>>({
    1: null,
    2: null,
    3: null,
    4: null,
    5: null,
    6: null,
  });
  const prevOpenRef = useRef<CreateWizardStep | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = openStep;
    if (prev === undefined || prev === openStep) return;
    const element = stepRefs.current[openStep];
    element?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    element?.focus?.({ preventScroll: true });
  }, [openStep]);

  useEffect(() => {
    if (!focusAfterNav) return;
    document.getElementById(focusAfterNav)?.focus();
    setFocusAfterNav(null);
  }, [openStep, focusAfterNav]);

  const touchWhen = (next: WhenState) => {
    setWhen(next);
    setWhenTouched(true);
  };

  /** A manual edit clears the "suggested" mark of that field. */
  const clearMark = (key: DraftMark) => {
    setSuggestedMarks((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  /** Per-field mark. Rules output never claims to be AI. */
  const markBadge = (key: DraftMark) =>
    suggestedMarks.has(key) ? (
      <span className="create-wizard__suggested-badge">
        {draftSource === 'rules' ? m.draftRules : m.draftSuggestedBadge}
      </span>
    ) : null;

  const handleStartTimeChange = (time: string) => {
    touchWhen({ ...when, time });
    clearMark('startTime');
    if (!mealTouched) {
      const h = Number.parseInt(time.slice(0, 2), 10);
      if (!Number.isNaN(h)) setMeal(mealForHour(h));
    }
  };

  // The public orb listens: picking a type transforms it (the surprise).
  // Unmounting (cancel, publish, back home) folds it back to deep-space.
  useEffect(
    () => () => {
      document.dispatchEvent(
        new CustomEvent<AssistantThemeDetail>(ASSISTANT_THEME_EVENT, { detail: { template: null } }),
      );
    },
    [],
  );

  const handleSelectTemplate = (t: TemplateKind) => {
    setTemplate(t);
    setAiProposal(null);
    setAiApplied(null);
    setAiError(false);
    clearMark('template');
    document.dispatchEvent(
      new CustomEvent<AssistantThemeDetail>(ASSISTANT_THEME_EVENT, { detail: { template: t } }),
    );
    if (!themesForTemplate(t).some((item) => item.key === theme)) {
      setTheme(defaultThemeFor(t).key);
      setThemeTouched(false);
    }
  };

  const handleUpdateAgendaItem = (index: number, field: keyof AgendaItem, val: string) => {
    const updated = [...agenda];
    updated[index] = { ...updated[index], [field]: val };
    setAgenda(updated);
  };

  const fullFields = (): EventFormFields => ({
    template,
    title,
    description,
    organizerName,
    theme,
    meal,
    startsAt,
    endsAt,
    location,
    includes,
    priceDollars,
    capacity,
    goalDollars,
    minimumDollars,
    agenda,
    accessCode,
    accessTouched,
    deadlineLocal,
    deadlineTouched,
  });

  /**
   * Per-step validation reuses the shared model with real values for this
   * step and earlier ones, plus valid dummies for later steps. Any failure
   * can only come from the current step.
   */
  const validateStep = (step: CreateWizardStep): string | null => {
    if (step === 1) return title.trim() ? null : m.errTitle;
    if (step === 5 || step === 6) return null;
    const probe: EventFormFields = {
      ...fullFields(),
      title: title.trim() || 'x',
      location: step >= 3 ? location : 'x',
      includes: step >= 3 ? includes : [],
      priceDollars: step >= 4 ? priceDollars : '25.00',
      capacity: step >= 4 ? capacity : '10',
      goalDollars: step >= 4 ? goalDollars : '',
      minimumDollars: step >= 4 ? minimumDollars : '',
      accessCode: step >= 4 ? accessCode : '',
      accessTouched: step >= 4 ? accessTouched : false,
      deadlineLocal: step >= 4 ? deadlineLocal : '',
      deadlineTouched: step >= 4 ? deadlineTouched : false,
    };
    const built = buildEventInput(probe, { isEdit: false, isLegacy: false }, m);
    if (!built.ok) return built.message;
    if (step === 3) {
      if (includes.length > 20) return m.errIncludesTooMany;
      if (includes.some((item) => item.length > 120)) return m.errIncludesTooLong;
    }
    return null;
  };

  const exampleValues = (): Record<'title' | 'location' | 'description' | 'includes', string> => ({
    title,
    location,
    description,
    includes: includesFree,
  });

  const reviewSignature = (): string =>
    reviewSignatureOf({
      template,
      title,
      description,
      organizerName,
      theme,
      themeTouched,
      meal,
      mealTouched,
      when,
      whenTouched,
      foodStyle,
      foodStyleFree,
      location,
      checks,
      includesFree,
      agenda,
      priceDollars,
      capacity,
      goalDollars,
      minimumDollars,
      accessCode,
      accessTouched,
      deadlineLocal,
      deadlineTouched,
    });

  const liveSignature = reviewSignature();
  const builtLive = buildEventInput(fullFields(), { isEdit: false, isLegacy: false }, m);
  const liveHits = collectExampleHits(exampleValues(), (key) => m[key]);
  const needsExampleAck = liveHits.length > 0;

  useEffect(() => {
    if (openStep !== 6 || !needsExampleAck) return;
    exampleWarningRef.current?.focus();
  }, [openStep, needsExampleAck, liveSignature]);

  /** First section that stops a valid full payload. Avoids five sequential saves. */
  const firstInvalidStep = (): CreateWizardStep => {
    for (const step of [1, 2, 3, 4, 5] as const) {
      if (validateStep(step)) return step;
    }
    return 6;
  };

  const inputIdForStep = (step: CreateWizardStep): string | null => {
    if (step === 1) return 'event-title';
    if (step === 2) return template === 'viaje' ? 'wizard-depart-date' : 'wizard-date';
    if (step === 3) return 'event-location';
    if (step === 4) return 'event-price';
    return null;
  };

  const jumpToSection = (step: CreateWizardStep, focusId?: string | null) => {
    setOpenStep(step);
    if (focusId) setFocusAfterNav(focusId);
  };

  const openReview = () => {
    setStepError(null);
    setErrorStep(null);
    setReviewVisited(true);
    setOpenStep(6);
  };

  const handleSaveStep = (step: CreateWizardStep) => {
    if (isLoading || posting.current) return;
    if (step === 6) {
      void handlePublish();
      return;
    }
    const error = validateStep(step);
    if (error) {
      setStepError(error);
      setErrorStep(step);
      return;
    }
    setStepError(null);
    setErrorStep(null);
    if (step === 5) {
      openReview();
      return;
    }
    setOpenStep((step + 1) as CreateWizardStep);
  };

  const handleChangeStep = (step: CreateWizardStep) => {
    if (isLoading) return;
    setStepError(null);
    setErrorStep(null);
    setOpenStep(step);
  };

  const submitPayload = async (payload: EventInput) => {
    if (posting.current || isLoading) return;
    posting.current = true;
    try {
      await onSubmit(payload);
    } catch (err: unknown) {
      setStepError(err instanceof Error ? err.message : m.errSubmit);
      setErrorStep(6);
    } finally {
      posting.current = false;
    }
  };

  /** The only publication path: explicit click, fresh validation, fresh payload. */
  const handlePublish = async () => {
    if (isLoading || posting.current) return;
    if (!builtLive.ok) {
      const target = firstInvalidStep();
      setStepError(builtLive.message);
      setErrorStep(target);
      jumpToSection(target, inputIdForStep(target));
      return;
    }
    if (needsExampleAck) {
      exampleWarningRef.current?.focus();
      return;
    }
    await submitPayload(builtLive.payload);
  };

  const handleReviseExamples = () => {
    if (isLoading || liveHits.length === 0) return;
    const first: ExampleHit | undefined = liveHits[0];
    if (!first) return;
    const target: CreateWizardStep = first.field === 'title' ? 1 : 3;
    jumpToSection(target, first.inputId);
  };

  const handlePublishExamples = async () => {
    if (isLoading || posting.current || liveHits.length === 0) return;
    if (!builtLive.ok) {
      const target = firstInvalidStep();
      setStepError(builtLive.message);
      setErrorStep(target);
      jumpToSection(target, inputIdForStep(target));
      return;
    }
    await submitPayload(builtLive.payload);
  };

  const handleApplyCalculator = () => {
    const total = parseFloat(calcTotal);
    if (!Number.isFinite(total) || total <= 0) {
      setCalcError(m.calcErrTotal);
      setCalcResult(null);
      return;
    }
    const people = Number.parseInt(calcPeople, 10);
    if (!Number.isInteger(people) || people < 1) {
      setCalcError(m.calcErrPeople);
      setCalcResult(null);
      return;
    }
    const totalCents = Math.round(total * 100);
    const shareCents = Math.round(totalCents / people);
    setPriceDollars((shareCents / 100).toFixed(2));
    setCalcError(null);
    setCalcResult(m.calcResult(formatMoneyInLocale(shareCents)));
  };

  /**
   * Applies a DraftEventProposal to the wizard steps without creating anything.
   * Only fields listed in `suggested` with a usable value are applied, and only
   * applied fields are marked. Dates stay "suggested" (whenTouched is untouched)
   * so the review keeps describing them as a suggestion until the person edits.
   * The per-person share always comes from the server `perPersonCents`, as is.
   */
  const applyDraftProposal = (proposal: DraftEventProposal) => {
    const wants = new Set(proposal.suggested ?? []);
    const marks = new Set<DraftMark>();
    const nextTemplate =
      wants.has('template') && isTemplateKind(proposal.template) ? proposal.template : template;

    if (wants.has('template') && isTemplateKind(proposal.template)) {
      handleSelectTemplate(proposal.template);
      marks.add('template');
    }
    if (wants.has('title') && proposal.title.trim()) {
      setTitle(proposal.title);
      marks.add('title');
    }
    if (wants.has('meal') && proposal.meal) {
      setMeal(proposal.meal);
      setMealTouched(true);
      marks.add('meal');
    }

    const dateValue = wants.has('date') && isDraftDate(proposal.date) ? proposal.date : null;
    const timeValue =
      wants.has('startTime') && isDraftTime(proposal.startTime) ? proposal.startTime : null;
    const durationValue =
      wants.has('durationMinutes') &&
      Number.isSafeInteger(proposal.durationMinutes) &&
      (proposal.durationMinutes ?? 0) > 0
        ? (proposal.durationMinutes as number)
        : null;

    if (!proposal.meal && timeValue && !mealTouched) {
      const h = Number.parseInt(timeValue.slice(0, 2), 10);
      if (!Number.isNaN(h)) setMeal(mealForHour(h));
    }

    const nextWhen: WhenState = { ...when };
    let whenChanged = false;
    if (dateValue) {
      if (nextTemplate === 'viaje') {
        nextWhen.departDate = dateValue;
        if (nextWhen.returnDate <= dateValue) nextWhen.returnDate = addDays(dateValue, 1);
      } else {
        nextWhen.date = dateValue;
      }
      marks.add('date');
      whenChanged = true;
    }
    if (timeValue) {
      nextWhen.time = timeValue;
      marks.add('startTime');
      whenChanged = true;
    }
    if (durationValue !== null) {
      const baseTime = timeValue ?? when.time;
      if (nextTemplate === 'comida') {
        nextWhen.durationHours = durationHoursForComida(durationValue);
        marks.add('duration');
        whenChanged = true;
      } else if (nextTemplate === 'casa') {
        if (durationValue === 180) nextWhen.departMode = 'plus3';
        else if (durationValue === 240) nextWhen.departMode = 'plus4';
        else {
          const exact = addMinutesToTime(baseTime, durationValue);
          if (exact) {
            nextWhen.departMode = 'exact';
            nextWhen.exactTime = exact;
          } else {
            nextWhen.departMode = durationValue <= 210 ? 'plus3' : 'plus4';
          }
        }
        marks.add('duration');
        whenChanged = true;
      } else if (nextTemplate === 'evento') {
        const end = addMinutesToTime(baseTime, durationValue);
        if (end) {
          nextWhen.endTime = end;
          marks.add('duration');
          whenChanged = true;
        }
      }
      // viaje spans several days: a minutes duration does not apply, so no mark.
    }
    if (whenChanged) setWhen(nextWhen);

    if (wants.has('location') && proposal.location?.trim()) {
      setLocation(proposal.location.trim());
      marks.add('location');
    }
    if (wants.has('includes')) {
      const items = (proposal.includes ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 20);
      const matched: Record<string, boolean> = {};
      const free: string[] = [];
      for (const item of items) {
        const key = INCLUDE_KEYS[nextTemplate].find(
          (candidate) => includeLabelFor(nextTemplate, candidate).toLowerCase() === item.toLowerCase(),
        );
        if (key) matched[`${nextTemplate}:${key}`] = true;
        else free.push(item);
      }
      if (Object.keys(matched).length > 0) setChecks((prev) => ({ ...prev, ...matched }));
      setIncludesFree(free.join(', '));
      if (items.length > 0) marks.add('includes');
    }
    if (
      wants.has('headcount') &&
      Number.isInteger(proposal.headcount) &&
      (proposal.headcount ?? 0) >= 1 &&
      (proposal.headcount ?? 0) <= 500
    ) {
      setCapacity(String(proposal.headcount));
      marks.add('capacity');
    }
    if (
      wants.has('budgetCents') &&
      Number.isSafeInteger(proposal.perPersonCents) &&
      (proposal.perPersonCents ?? 0) > 0
    ) {
      setPriceDollars(((proposal.perPersonCents as number) / 100).toFixed(2));
      marks.add('price');
    }

    setSuggestedMarks(marks);
    setDraftSource(proposal.source);
    setDraftNotice(
      proposal.source === 'rules' ? `${m.draftApplied} ${m.draftRules}.` : m.draftApplied,
    );
    // A draft always lands on the editable summary, never on a locked step 1.
    selectPath('sentence');
    setReviewVisited(true);
    setStepError(null);
    setErrorStep(null);
    setOpenStep(6);
  };

  /**
   * FP-FINAL-A2: the public chat's "Review in Create" card hands over the whole
   * server proposal. A mounted wizard receives it by event; a wizard that mounts
   * after the controlled navigation consumes the one-shot pending slot. Reading
   * consumes, so a later manual visit never keeps the proposal or puts it in the URL.
   */
  const applyDraftRef = useRef(applyDraftProposal);
  applyDraftRef.current = applyDraftProposal;
  useEffect(() => {
    const apply = (proposal: DraftEventProposal) => {
      applyDraftRef.current(proposal);
    };
    const pending = consumeGuideDraftProposal();
    if (isDraftEventProposal(pending)) apply(pending);
    const onDraft = (event: Event) => {
      const proposal = (event as CustomEvent<GuideDraftDetail>).detail?.proposal;
      consumeGuideDraftProposal();
      if (isDraftEventProposal(proposal)) apply(proposal);
    };
    document.addEventListener(GUIDE_DRAFT_EVENT, onDraft);
    return () => document.removeEventListener(GUIDE_DRAFT_EVENT, onDraft);
  }, []);

  const handleDraftFill = async (override?: string) => {
    if (draftLoading || isLoading || posting.current) return;
    const text = (override ?? draftText).trim();
    if (text.length < 3) {
      setDraftError(m.draftEmpty);
      setDraftNotice(null);
      return;
    }
    setDraftLoading(true);
    setDraftError(null);
    setDraftNotice(null);
    try {
      const proposal = await api.draftEvent(text);
      applyDraftProposal(proposal);
    } catch (err: unknown) {
      // 429/503 keep the existing bilingual AI message; the manual form stays usable.
      if (err instanceof ApiError && (err.status === 429 || err.status === 503)) {
        setDraftError(m.aiError);
      } else {
        setDraftError(err instanceof Error && err.message ? err.message : m.aiError);
      }
    } finally {
      setDraftLoading(false);
    }
  };
  const draftFillRef = useRef(handleDraftFill);
  draftFillRef.current = handleDraftFill;

  // One-shot auto-fill for the judges-demo AI step: the demo click was the
  // consent, so the prefilled phrase fires "Rellenar con IA" exactly once.
  // No loops, no retries: each request id runs at most once, and a missing
  // request (manual visit) never calls. An AI failure keeps the phrase
  // written and shows the usual message through the normal error path.
  useEffect(() => {
    if (!initialDraft || autoDraftIdRef.current === initialDraft.id) return;
    autoDraftIdRef.current = initialDraft.id;
    setDraftText(initialDraft.text);
    setActivePath('sentence');
    void draftFillRef.current(initialDraft.text);
  }, [initialDraft]);

  // FP-WELCOME-1 voice prefill: the person's spoken sentence is written into
  // the one-sentence field without running the AI. Step 1 opens so the field
  // and "Rellenar con IA" are visible for the highlight; other fields stay.
  useEffect(() => {
    const applyPrefill = (sentence: string) => {
      setDraftText(sentence);
      setActivePath('sentence');
      setOpenStep(1);
    };
    const pending = consumeGuidePrefill();
    if (pending) applyPrefill(pending);
    const onPrefill = (event: Event) => {
      const sentence = (event as CustomEvent<GuidePrefillDetail>).detail?.sentence;
      consumeGuidePrefill();
      if (typeof sentence === 'string' && sentence) applyPrefill(sentence);
    };
    document.addEventListener(GUIDE_PREFILL_EVENT, onPrefill);
    return () => document.removeEventListener(GUIDE_PREFILL_EVENT, onPrefill);
  }, []);

  // Guide targets on /create live in step 1. If the guide asks to highlight the
  // sentence field while the wizard is showing the summary or the interview,
  // reopen the sentence path so the documented target stays mounted.
  useEffect(() => {
    const onGuideAction = (event: Event) => {
      const target = (event as CustomEvent<{ target?: string }>).detail?.target;
      if (target !== 'describeInvitation' && target !== 'fillWithAi') return;
      setActivePath('sentence');
      setOpenStep(1);
    };
    document.addEventListener(GUIDE_ACTION_EVENT, onGuideAction);
    return () => document.removeEventListener(GUIDE_ACTION_EVENT, onGuideAction);
  }, []);

  const handleSuggestAi = async () => {
    if (aiLoading || isLoading || posting.current) return;
    setAiLoading(true);
    setAiError(false);
    setAiApplied(null);
    const hints: string[] = [];
    const pushHint = (value: string) => {
      const trimmed = value.trim().slice(0, 60);
      if (trimmed) hints.push(trimmed);
    };
    if (template === 'comida') {
      if (foodStyle) pushHint(foodStyleLabel(foodStyle));
      pushHint(foodStyleFree);
    }
    for (const key of INCLUDE_KEYS[template]) {
      if (checks[`${template}:${key}`]) pushHint(includeLabel(key));
    }
    for (const item of splitIncludesFree(includesFree)) pushHint(item);
    const input: PresentationSuggestionInput = {
      template,
      title: title.trim().slice(0, 120),
      meal,
      ...(location.trim() ? { location: location.trim().slice(0, 200) } : {}),
      ...(hints.length > 0 ? { hints: hints.slice(0, 10) } : {}),
    };
    try {
      const res = await api.suggestPresentation(input);
      setTheme(res.theme);
      setThemeTouched(true);
      setAiApplied(m.aiThemeApplied(themeLabel(res.theme, locale)));
      const proposed = res.description?.trim() ?? '';
      setAiProposal(proposed ? { theme: res.theme, description: proposed } : null);
    } catch {
      // Rules suggestion stays; publishing is never blocked.
      setAiError(true);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAcceptAiDescription = () => {
    if (!aiProposal) return;
    setDescription(aiProposal.description);
    setAiProposal(null);
  };

  const templateLabels: Record<TemplateKind, string> = {
    comida: m.templateComida,
    casa: m.templateCasa,
    viaje: m.templateViaje,
    evento: m.templateEvento,
  };

  const stepErrorFor = (step: CreateWizardStep) =>
    errorStep === step && stepError ? (
      <p role="alert" className="create-wizard__error">
        {stepError}
      </p>
    ) : null;

  const saveButton = (step: CreateWizardStep) => (
    <div className="create-wizard__actions">
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => handleSaveStep(step)}
        disabled={isLoading}
      >
        {labels.saveAndContinue}
      </button>
      {reviewVisited ? (
        <button type="button" className="btn btn-secondary" onClick={openReview} disabled={isLoading}>
          {m.reviewBackToSummary}
        </button>
      ) : null}
    </div>
  );

  const doneRow = (summary: string, step: CreateWizardStep) => (
    <div className="create-wizard__done-row">
      <p className="create-wizard__done-line">{summary}</p>
      <button
        type="button"
        className="btn btn-secondary create-wizard__change"
        onClick={() => handleChangeStep(step)}
        disabled={isLoading}
      >
        {labels.changeStep}
      </button>
    </div>
  );

  const renderWhat = () => (
    <>
      <p className="create-wizard__explain">{m.explainWhat}</p>
      {activePath !== 'manual' ? (
        <div className="create-wizard__draft">
          <label className="form-label" htmlFor="wizard-draft-text" data-guide="describeInvitation">
            {m.draftTitle}
          </label>
          <div className="create-wizard__draft-row">
            <input
              id="wizard-draft-text"
              className="form-input"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder={m.draftPlaceholder}
              maxLength={400}
              autoComplete="off"
              aria-describedby="wizard-draft-help"
            />
            <button
              type="button"
              className="btn btn-primary"
              data-guide="fillWithAi"
              onClick={() => void handleDraftFill()}
              disabled={draftLoading || isLoading}
            >
              {draftLoading ? m.draftFilling : m.draftFill}
            </button>
          </div>
          <span id="wizard-draft-help" className="form-label-desc">
            {m.draftHelp}
          </span>
          {draftError ? (
            <p role="alert" className="create-wizard__error">
              {draftError}
            </p>
          ) : null}
          {draftNotice ? (
            <p role="status" className="create-wizard__ai-note">
              {draftNotice}
            </p>
          ) : null}
        </div>
      ) : null}
      <div>
        <span className="form-label" id="wizard-type-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
          {m.typeLabel} {markBadge('template')}
        </span>
        <div className="create-wizard__type-grid" role="radiogroup" aria-label={m.typeGroupAria}>
          {(['comida', 'casa', 'viaje', 'evento'] as TemplateKind[]).map((t) => {
            const isSelected = template === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={isSelected}
                data-selected={isSelected}
                onClick={() => handleSelectTemplate(t)}
                className="create-wizard__type-card"
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <TemplateIcon template={t} size={18} />
                  <span className="create-wizard__type-name">{templateLabels[t]}</span>
                </span>
                <span className="create-wizard__type-example">{typeExample(t)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" htmlFor="event-title">
          {m.titleLabel} {markBadge('title')}
        </label>
        <input
          id="event-title"
          className="form-input"
          value={title}
          onChange={(e) => {
            clearMark('title');
            setTitle(e.target.value);
          }}
          required
          placeholder={m.wizardTitlePlaceholder}
        />
        <button
          type="button"
          className="create-wizard__example-chip"
          onClick={() => {
            clearMark('title');
            setTitle(typeExample(template));
          }}
        >
          {m.titleUseExample(typeExample(template))}
        </button>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" htmlFor="event-organizer">
          {m.organizerLabel}
        </label>
        <input
          id="event-organizer"
          className="form-input"
          value={organizerName}
          maxLength={100}
          onChange={(e) => setOrganizerName(e.target.value)}
          placeholder={m.organizerPlaceholder}
          autoComplete="off"
        />
        <span className="form-label-desc">{m.organizerHelp}</span>
      </div>
    </>
  );

  const renderWhenComida = () => (
    <>
      <div className="create-wizard__field-row">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="wizard-date">
            {m.whenDateLabel} {markBadge('date')}
          </label>
          <input
            id="wizard-date"
            type="date"
            className="form-input"
            value={when.date}
            onChange={(e) => {
              clearMark('date');
              touchWhen({ ...when, date: e.target.value });
            }}
            required
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="wizard-time">
            {m.whenTimeLabel} {markBadge('startTime')}
          </label>
          <input
            id="wizard-time"
            type="time"
            className="form-input"
            value={when.time}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            required
          />
        </div>
      </div>
      <div>
        <span className="form-label" id="wizard-duration-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
          {m.durationLabel} {markBadge('duration')}
        </span>
        <div className="create-wizard__chips" role="radiogroup" aria-labelledby="wizard-duration-label">
          {([2, 3, 4] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={when.durationHours === d}
              data-selected={when.durationHours === d}
              className="create-wizard__chip"
              onClick={() => {
                clearMark('duration');
                touchWhen({ ...when, durationHours: d });
              }}
            >
              {m.durationHours(d)}
            </button>
          ))}
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" htmlFor="wizard-meal">
          {m.mealLabel} {markBadge('meal')}
        </label>
        <select
          id="wizard-meal"
          className="form-select"
          value={meal}
          onChange={(e) => {
            clearMark('meal');
            setMealTouched(true);
            setMeal(e.target.value as 'desayuno' | 'almuerzo' | 'cena');
          }}
        >
          <option value="desayuno">{capitalLabel(mealLabel('desayuno', locale), locale)}</option>
          <option value="almuerzo">{capitalLabel(mealLabel('almuerzo', locale), locale)}</option>
          <option value="cena">{capitalLabel(mealLabel('cena', locale), locale)}</option>
        </select>
        <span className="form-label-desc">{m.mealNote}</span>
      </div>
      <div>
        <span className="form-label" id="wizard-food-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
          {m.foodStyleLabel}
        </span>
        <div className="create-wizard__chips" role="radiogroup" aria-labelledby="wizard-food-label">
          {FOOD_STYLE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={foodStyle === key}
              data-selected={foodStyle === key}
              className="create-wizard__chip"
              onClick={() => setFoodStyle(foodStyle === key ? '' : key)}
            >
              {foodStyleLabel(key)}
            </button>
          ))}
        </div>
        <input
          className="form-input"
          style={{ marginTop: '0.5rem' }}
          aria-label={m.foodStyleOther}
          placeholder={m.foodStyleOther}
          value={foodStyleFree}
          maxLength={120}
          onChange={(e) => setFoodStyleFree(e.target.value)}
          autoComplete="off"
        />
      </div>
    </>
  );

  const renderWhenCasa = () => (
    <>
      <div className="create-wizard__field-row">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="wizard-date">
            {m.whenDateLabel} {markBadge('date')}
          </label>
          <input
            id="wizard-date"
            type="date"
            className="form-input"
            value={when.date}
            onChange={(e) => {
              clearMark('date');
              touchWhen({ ...when, date: e.target.value });
            }}
            required
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="wizard-time">
            {m.casaArrivalLabel} {markBadge('startTime')}
          </label>
          <input
            id="wizard-time"
            type="time"
            className="form-input"
            value={when.time}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            required
          />
        </div>
      </div>
      <div>
        <span className="form-label" id="wizard-depart-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
          {m.casaDepartureLabel} {markBadge('duration')}
        </span>
        <div className="create-wizard__chips" role="radiogroup" aria-labelledby="wizard-depart-label">
          {(
            [
              ['plus3', m.departPlus3],
              ['plus4', m.departPlus4],
              ['midnight', m.departMidnight],
              ['exact', m.departExact],
            ] as [DepartMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={when.departMode === mode}
              data-selected={when.departMode === mode}
              className="create-wizard__chip"
              onClick={() => {
                clearMark('duration');
                touchWhen({ ...when, departMode: mode });
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {when.departMode === 'exact' ? (
          <div className="form-group" style={{ marginBottom: 0, marginTop: '0.5rem' }}>
            <label className="form-label" htmlFor="wizard-exact-time">
              {m.whenEndLabel}
            </label>
            <input
              id="wizard-exact-time"
              type="time"
              className="form-input"
              value={when.exactTime}
              onChange={(e) => {
                clearMark('duration');
                touchWhen({ ...when, exactTime: e.target.value });
              }}
              required
            />
          </div>
        ) : null}
      </div>
    </>
  );

  const renderWhenViaje = () => (
    <>
      <div className="create-wizard__field-row">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="wizard-depart-date">
            {m.viajeDepartLabel} {markBadge('date')}
          </label>
          <input
            id="wizard-depart-date"
            type="date"
            className="form-input"
            value={when.departDate}
            onChange={(e) => {
              clearMark('date');
              touchWhen({ ...when, departDate: e.target.value });
            }}
            required
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="wizard-return-date">
            {m.viajeReturnLabel}
          </label>
          <input
            id="wizard-return-date"
            type="date"
            className="form-input"
            value={when.returnDate}
            onChange={(e) => touchWhen({ ...when, returnDate: e.target.value })}
            required
          />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" htmlFor="wizard-time">
          {m.viajeTimeLabel} {markBadge('startTime')}
        </label>
        <input
          id="wizard-time"
          type="time"
          className="form-input"
          value={when.time}
          onChange={(e) => handleStartTimeChange(e.target.value)}
          required
        />
      </div>
      <span className="form-label-desc">{m.viajeMultiNote}</span>
    </>
  );

  const renderAgenda = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span className="form-label" style={{ marginBottom: 0 }}>
          {m.agendaLabel}
        </span>
        <button
          type="button"
          onClick={() => setAgenda([...agenda, { time: '', title: '' }])}
          className="btn btn-secondary"
          style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
        >
          {m.agendaAdd}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {agenda.map((item, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              alignItems: 'center',
            }}
          >
            <input
              style={{ width: '80px', flexShrink: 0 }}
              className="form-input"
              value={item.time}
              onChange={(e) => handleUpdateAgendaItem(idx, 'time', e.target.value)}
              placeholder={m.agendaTimePlaceholder}
              aria-label={m.agendaTimeAria(idx + 1)}
            />
            <input
              style={{ flex: '1 1 180px' }}
              className="form-input"
              value={item.title}
              onChange={(e) => handleUpdateAgendaItem(idx, 'title', e.target.value)}
              placeholder={m.agendaTitlePlaceholder}
              aria-label={m.agendaTitleAria(idx + 1)}
            />
            <input
              style={{ flex: '1 1 140px' }}
              className="form-input"
              value={item.speaker || ''}
              maxLength={80}
              onChange={(e) => handleUpdateAgendaItem(idx, 'speaker', e.target.value)}
              placeholder={m.agendaSpeakerPlaceholder}
              aria-label={m.agendaSpeakerAria(idx + 1)}
            />
            <button
              type="button"
              onClick={() => setAgenda(agenda.filter((_, i) => i !== idx))}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.6rem', color: 'var(--color-coral)' }}
              aria-label={m.agendaRemoveAria}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderWhenEvento = () => (
    <>
      <div className="create-wizard__field-row">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="wizard-date">
            {m.whenDateLabel} {markBadge('date')}
          </label>
          <input
            id="wizard-date"
            type="date"
            className="form-input"
            value={when.date}
            onChange={(e) => {
              clearMark('date');
              touchWhen({ ...when, date: e.target.value });
            }}
            required
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="wizard-time">
            {m.whenTimeLabel} {markBadge('startTime')}
          </label>
          <input
            id="wizard-time"
            type="time"
            className="form-input"
            value={when.time}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" htmlFor="wizard-end-time">
          {m.whenEndLabel} {markBadge('duration')}
        </label>
        <input
          id="wizard-end-time"
          type="time"
          className="form-input"
          value={when.endTime}
          onChange={(e) => {
            clearMark('duration');
            touchWhen({ ...when, endTime: e.target.value });
          }}
          required
        />
      </div>
      {renderAgenda()}
    </>
  );

  const renderWhen = () => (
    <>
      <p className="create-wizard__explain">{m.explainWhen}</p>
      {template === 'comida'
        ? renderWhenComida()
        : template === 'casa'
          ? renderWhenCasa()
          : template === 'viaje'
            ? renderWhenViaje()
            : renderWhenEvento()}
      <span className="form-label-desc">{m.timeZoneNote}</span>
      {!whenTouched ? <span className="form-label-desc">{m.startSuggestion}</span> : null}
    </>
  );

  const renderWhere = () => (
    <>
      <p className="create-wizard__explain">{m.explainWhere}</p>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" htmlFor="event-location">
          {m.locationLabel} {markBadge('location')}
        </label>
        <input
          id="event-location"
          className="form-input"
          value={location}
          onChange={(e) => {
            clearMark('location');
            setLocation(e.target.value);
          }}
          required
          placeholder={m.locationPlaceholder}
        />
      </div>
      {INCLUDE_KEYS[template].length > 0 ? (
        <fieldset className="create-wizard__checks">
          <legend>{m.includesCheckLabel}</legend>
          {INCLUDE_KEYS[template].map((key) => (
            <label key={key} className="create-wizard__check">
              <input
                type="checkbox"
                checked={!!checks[`${template}:${key}`]}
                onChange={(e) => {
                  clearMark('includes');
                  setChecks({ ...checks, [`${template}:${key}`]: e.target.checked });
                }}
              />
              {includeLabel(key)}
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" htmlFor="event-includes">
          {m.includesLabel} {markBadge('includes')}
        </label>
        <input
          id="event-includes"
          className="form-input"
          value={includesFree}
          onChange={(e) => {
            clearMark('includes');
            setIncludesFree(e.target.value);
          }}
          placeholder={m.includesPlaceholder}
        />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" htmlFor="event-desc">
          {m.descLabel}
        </label>
        <textarea
          id="event-desc"
          className="form-textarea"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={m.descPlaceholder}
        />
      </div>
    </>
  );

  const renderShare = () => (
    <>
      <p className="create-wizard__explain">{m.explainShare}</p>
      <div className="create-wizard__field-row">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="event-price">
            {m.priceLabel} {markBadge('price')}
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.75rem', top: '0.65rem', color: 'var(--color-ink-muted)' }}>
              $
            </span>
            <input
              id="event-price"
              type="number"
              step="0.01"
              min="0.50"
              className="form-input"
              style={{ paddingLeft: '1.75rem' }}
              value={priceDollars}
              onChange={(e) => {
                clearMark('price');
                setPriceDollars(e.target.value);
              }}
              placeholder="0.00"
              required
            />
          </div>
          <span className="form-label-desc">{m.priceHelp}</span>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="event-capacity">
            {m.capacityLabel} {markBadge('capacity')}
          </label>
          <input
            id="event-capacity"
            type="number"
            min="1"
            max="1000"
            className="form-input"
            value={capacity}
            onChange={(e) => {
              clearMark('capacity');
              setCapacity(e.target.value);
            }}
            placeholder={m.capacityPlaceholder}
            required
          />
          <span className="form-label-desc">{m.capacityHelp}</span>
        </div>
      </div>
      <div className="create-wizard__calc">
        <p className="form-label" style={{ marginBottom: '0.5rem' }}>
          {m.calcTitle}
        </p>
        <div className="create-wizard__field-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="wizard-calc-total">
              {m.calcTotalLabel}
            </label>
            <input
              id="wizard-calc-total"
              type="number"
              step="0.01"
              min="0"
              className="form-input"
              value={calcTotal}
              onChange={(e) => setCalcTotal(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="wizard-calc-people">
              {m.calcPeopleLabel}
            </label>
            <input
              id="wizard-calc-people"
              type="number"
              min="1"
              className="form-input"
              value={calcPeople}
              onChange={(e) => setCalcPeople(e.target.value)}
              placeholder="1"
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={handleApplyCalculator}>
            {m.calcApply}
          </button>
          {calcError ? (
            <p role="alert" className="create-wizard__error" style={{ margin: 0 }}>
              {calcError}
            </p>
          ) : null}
          {calcResult && !calcError ? (
            <p role="status" style={{ margin: 0, fontSize: '0.875rem' }}>
              {calcResult}
            </p>
          ) : null}
        </div>
      </div>
      <div>
        <button
          type="button"
          className="create-wizard__advanced-toggle"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen(!advancedOpen)}
        >
          {labels.advancedOptions}
        </button>
        {advancedOpen ? (
          <div className="create-wizard__advanced">
            <div className="create-wizard__field-row">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="event-minimum">
                  {m.minimumLabel}
                </label>
                <div style={{ position: 'relative' }}>
                  <span
                    style={{ position: 'absolute', left: '0.75rem', top: '0.65rem', color: 'var(--color-ink-muted)' }}
                  >
                    $
                  </span>
                  <input
                    id="event-minimum"
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    style={{ paddingLeft: '1.75rem' }}
                    value={minimumDollars}
                    onChange={(e) => setMinimumDollars(e.target.value)}
                  />
                </div>
                <span className="form-label-desc">{m.minimumHelp}</span>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="event-goal">
                  {m.goalLabel}
                </label>
                <div style={{ position: 'relative' }}>
                  <span
                    style={{ position: 'absolute', left: '0.75rem', top: '0.65rem', color: 'var(--color-ink-muted)' }}
                  >
                    $
                  </span>
                  <input
                    id="event-goal"
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    style={{ paddingLeft: '1.75rem' }}
                    value={goalDollars}
                    onChange={(e) => setGoalDollars(e.target.value)}
                  />
                </div>
                <span className="form-label-desc">{m.goalHelp}</span>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="event-funding-deadline">
                {m.deadlineLabel}
              </label>
              <input
                id="event-funding-deadline"
                type="datetime-local"
                className="form-input"
                value={deadlineLocal}
                onChange={(e) => {
                  setDeadlineTouched(true);
                  setDeadlineLocal(e.target.value);
                }}
                aria-describedby="event-funding-deadline-help"
              />
              <span id="event-funding-deadline-help" className="form-label-desc">
                {m.deadlineHelpCreate}
              </span>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="event-access">
                {m.accessLabel}
              </label>
              <input
                id="event-access"
                className="form-input"
                value={accessCode}
                onChange={(e) => {
                  setAccessTouched(true);
                  setAccessCode(e.target.value);
                }}
                placeholder={m.accessPlaceholderCreate}
                autoComplete="off"
              />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );

  const selectedTheme = resolveTheme(template, theme);

  const renderLook = () => (
    <>
      <p className="create-wizard__explain">{m.explainLook}</p>
      <div
        role="region"
        aria-label={m.lookPreviewAria}
        className="theme-scope create-wizard__preview"
        data-theme={selectedTheme.key}
        style={{ ...themeCssVars(selectedTheme) }}
      >
        <TemplateCover template={template} height="130px" accent={selectedTheme.accent} />
        <p className="theme-phrase" style={{ margin: '0.75rem 1rem 0.25rem' }}>
          {themePhrase(selectedTheme.key, locale)}
        </p>
        <div className="create-wizard__palette" aria-hidden="true">
          {[selectedTheme.surface, selectedTheme.ink, selectedTheme.muted, selectedTheme.accent, selectedTheme.tint].map(
            (color, i) => (
              <span key={`${color}-${i}`} className="create-wizard__swatch" style={{ backgroundColor: color }} />
            ),
          )}
        </div>
        <p className="create-wizard__suggested">
          {m.lookSuggested}: <strong>{themeLabel(suggestedKey, locale)}</strong>
        </p>
      </div>
      <div>
        <span className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
          {m.lookOthers}
        </span>
        <div className="theme-picker" role="radiogroup" aria-label={m.themeGroupAria}>
          {themesForTemplate(template).map((item) => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={theme === item.key}
              className="theme-choice"
              style={{ ['--choice-accent' as string]: item.accent }}
              onClick={() => {
                setThemeTouched(true);
                setTheme(item.key);
              }}
            >
              {themeLabel(item.key, locale)}
            </button>
          ))}
        </div>
      </div>
      {activePath !== 'manual' ? (
        <div className="create-wizard__ai">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleSuggestAi()}
            disabled={aiLoading || isLoading}
          >
            {aiLoading ? m.aiLoading : labels.suggestWithAi}
          </button>
        {aiError ? (
          <p role="status" className="create-wizard__ai-note">
            {m.aiError}
          </p>
        ) : null}
        {aiApplied && !aiError ? (
          <p role="status" className="create-wizard__ai-note">
            {aiApplied}
          </p>
        ) : null}
        {aiProposal ? (
          <div className="create-wizard__ai-proposal">
            <p className="form-label">{m.aiProposedDescription}</p>
            <p className="create-wizard__ai-text">{aiProposal.description}</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={handleAcceptAiDescription}>
                {m.aiAccept}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setAiProposal(null)}>
                {m.aiDismiss}
              </button>
            </div>
          </div>
        ) : null}
        </div>
      ) : null}
    </>
  );

  const whenReview = (): string => {
    const startMs = new Date(startsAt).getTime();
    const endMs = new Date(endsAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return m.reviewNotSet;
    return formatEventRange(new Date(startMs).toISOString(), new Date(endMs).toISOString(), undefined, locale);
  };

  const priceReview = (): string => {
    const cents = Math.round(parseFloat(priceDollars) * 100);
    return Number.isFinite(cents) && cents > 0 ? formatMoneyInLocale(cents) : m.reviewNotSet;
  };

  const capacityReview = (): string => {
    const value = Number.parseInt(capacity, 10);
    return Number.isInteger(value) && value > 0 ? String(value) : m.reviewNotSet;
  };

  const agendaReview = (): string =>
    agenda
      .filter((item) => item.title.trim() && item.time.trim())
      .map((item) => `${item.time} ${item.title}`)
      .join(' · ');

  type ReviewRowOptions = {
    mark?: DraftMark;
    focusId?: string;
    onEdit?: () => void;
  };

  const reviewRow = (
    label: string,
    value: React.ReactNode,
    step: CreateWizardStep,
    options: ReviewRowOptions = {},
  ) => (
    <div className="create-wizard__review-row" key={label}>
      <dt>
        {label} {options.mark ? markBadge(options.mark) : null}
      </dt>
      <dd>{value}</dd>
      <button
        type="button"
        className="btn btn-secondary create-wizard__review-edit"
        onClick={() => {
          if (options.onEdit) options.onEdit();
          else jumpToSection(step, options.focusId);
        }}
        disabled={isLoading}
        aria-label={m.reviewEditAria(label)}
      >
        {m.reviewEdit}
      </button>
    </div>
  );

  const editAdvanced = (focusId: string) => {
    setAdvancedOpen(true);
    jumpToSection(4, focusId);
  };

  const renderReview = () => (
    <>
      <p className="create-wizard__explain">{m.explainReview}</p>
      <section className="publish-review" aria-label={m.reviewAria} style={themeCssVars(selectedTheme)}>
        <h3 style={{ margin: 0 }}>{m.reviewSummaryTitle}</h3>
        <p className="theme-phrase" style={{ fontSize: '1.15rem' }}>{themePhrase(selectedTheme.key, locale)}</p>
        {draftNotice ? (
          <p role="status" className="create-wizard__ai-note">
            {draftNotice}
          </p>
        ) : null}
        <p className={builtLive.ok ? 'create-wizard__review-note' : 'create-wizard__review-note create-wizard__review-note--missing'}>
          {builtLive.ok ? m.reviewReady : m.reviewIncomplete}
        </p>
        {!whenTouched ? <p>{m.reviewDatesSuggestedDraft}</p> : <p>{m.reviewDatesFixed}</p>}
        <dl className="create-wizard__review-list">
          {reviewRow(m.reviewType, templateLabels[template], 1, { mark: 'template', focusId: 'event-title' })}
          {reviewRow(m.reviewHeading, title.trim() || m.reviewNotSet, 1, { mark: 'title', focusId: 'event-title' })}
          {reviewRow(
            m.reviewOrganizer,
            organizerName.trim() ? organizerName : m.reviewNoName,
            1,
            { focusId: 'event-organizer' },
          )}
          {reviewRow(
            m.reviewWhen,
            <>
              {whenReview()}
              <span className="create-wizard__review-sub">{m.reviewTimeZone}</span>
            </>,
            2,
            {
              mark: !whenTouched ? 'date' : suggestedMarks.has('startTime') ? 'startTime' : undefined,
              focusId: template === 'viaje' ? 'wizard-depart-date' : 'wizard-date',
            },
          )}
          {reviewRow(m.reviewWhere, location.trim() || m.reviewNotSet, 3, {
            mark: 'location',
            focusId: 'event-location',
          })}
          {reviewRow(
            m.reviewIncludes,
            includes.length > 0 ? includes.join(', ') : m.reviewNoIncludes,
            3,
            { mark: 'includes', focusId: 'event-includes' },
          )}
          {reviewRow(m.reviewPrice, priceReview(), 4, { mark: 'price', focusId: 'event-price' })}
          {reviewRow(m.reviewCapacity, capacityReview(), 4, { mark: 'capacity', focusId: 'event-capacity' })}
          {minimumDollars.trim()
            ? reviewRow(
                m.reviewMinimum,
                formatMoneyInLocale(Math.round(parseFloat(minimumDollars) * 100)),
                4,
                { focusId: 'event-minimum', onEdit: () => editAdvanced('event-minimum') },
              )
            : null}
          {goalDollars.trim()
            ? reviewRow(
                m.reviewGoal,
                formatMoneyInLocale(Math.round(parseFloat(goalDollars) * 100)),
                4,
                { focusId: 'event-goal', onEdit: () => editAdvanced('event-goal') },
              )
            : null}
          {deadlineLocal.trim()
            ? reviewRow(m.reviewDeadline, deadlineLocal.replace('T', ' '), 4, {
                focusId: 'event-funding-deadline',
                onEdit: () => editAdvanced('event-funding-deadline'),
              })
            : null}
          {template === 'comida'
            ? reviewRow(m.reviewMeal, capitalLabel(mealLabel(meal, locale), locale), 2, {
                mark: 'meal',
                focusId: 'wizard-meal',
              })
            : null}
          {foodStyleText
            ? reviewRow(m.reviewFoodStyle, foodStyleText, 2, { focusId: 'wizard-meal' })
            : null}
          {template === 'evento' && agendaReview()
            ? reviewRow(m.reviewAgenda, agendaReview(), 2)
            : null}
          {reviewRow(
            m.reviewTheme,
            <>
              {themeLabel(theme, locale)}
              {!themeTouched ? <span className="create-wizard__suggested-badge">{m.draftRules}</span> : null}
            </>,
            5,
          )}
          {reviewRow(
            m.reviewDescription,
            description.trim() ? description.trim() : m.reviewNoDescription,
            3,
            { focusId: 'event-desc' },
          )}
        </dl>
        <div className="create-wizard__actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const target = builtLive.ok ? 1 : firstInvalidStep();
              setReviewVisited(true);
              jumpToSection(target, target === 6 ? null : inputIdForStep(target));
            }}
            disabled={isLoading}
          >
            {m.reviewKeepEditing}
          </button>
          {!builtLive.ok ? (
            <button type="button" className="btn btn-primary" onClick={() => void handlePublish()} disabled={isLoading}>
              {m.reviewComplete}
            </button>
          ) : needsExampleAck ? null : (
            <button
              type="button"
              className="btn btn-primary btn-theme-primary"
              onClick={() => void handlePublish()}
              disabled={isLoading}
            >
              {m.reviewPublish}
            </button>
          )}
        </div>
      </section>
      {needsExampleAck ? (
        <div
          ref={exampleWarningRef}
          id="example-values-warning"
          tabIndex={-1}
          role="alert"
          aria-labelledby="example-values-warning-title"
          style={{
            backgroundColor: 'var(--color-yellow-tint)',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-yellow-dark)',
            padding: '0.75rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.875rem',
          }}
        >
          <p id="example-values-warning-title" style={{ margin: '0 0 0.5rem' }}>
            {m.exampleTitle}
          </p>
          <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }}>
            {liveHits.map((hit) => (
              <li key={hit.field}>
                {hit.label}: {hit.raw}
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={handleReviseExamples} disabled={isLoading}>
              {m.exampleRevise}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void handlePublishExamples()} disabled={isLoading}>
              {m.examplePublish}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );

  const whenSummary = (): string => {
    const startMs = new Date(startsAt).getTime();
    const endMs = new Date(endsAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return '';
    return formatEventRange(new Date(startMs).toISOString(), new Date(endMs).toISOString(), undefined, locale);
  };

  const whatSummary = (): string => `${templateLabels[template]} · ${title}`;

  const whereSummary = (): string => `${location} · ${m.includesCount(includes.length)}`;

  const shareSummary = (): string => {
    const cents = Math.round(parseFloat(priceDollars) * 100);
    const cap = Number.parseInt(capacity, 10);
    return m.summaryShare(
      formatMoneyInLocale(Number.isFinite(cents) ? cents : 0),
      Number.isInteger(cap) ? cap : 0,
    );
  };

  const lookSummary = (): string => themeLabel(theme, locale);

  const stepState = (step: CreateWizardStep): 'done' | 'open' | 'locked' => {
    if (openStep === step) return 'open';
    return step < openStep ? 'done' : 'locked';
  };

  const renderStepBody = (step: CreateWizardStep) => {
    switch (step) {
      case 1:
        return (
          <>
            {renderWhat()}
            {stepErrorFor(1)}
            {saveButton(1)}
          </>
        );
      case 2:
        return (
          <>
            {renderWhen()}
            {stepErrorFor(2)}
            {saveButton(2)}
          </>
        );
      case 3:
        return (
          <>
            {renderWhere()}
            {stepErrorFor(3)}
            {saveButton(3)}
          </>
        );
      case 4:
        return (
          <>
            {renderShare()}
            {stepErrorFor(4)}
            {saveButton(4)}
          </>
        );
      case 5:
        return (
          <>
            {renderLook()}
            {stepErrorFor(5)}
            {saveButton(5)}
          </>
        );
      case 6:
        return (
          <>
            {renderReview()}
            {stepErrorFor(6)}
          </>
        );
    }
  };

  const renderDoneBody = (step: CreateWizardStep) => {
    switch (step) {
      case 1:
        return doneRow(whatSummary(), 1);
      case 2:
        return doneRow(whenSummary(), 2);
      case 3:
        return doneRow(whereSummary(), 3);
      case 4:
        return doneRow(shareSummary(), 4);
      case 5:
        return doneRow(lookSummary(), 5);
      case 6:
        return null;
    }
  };

  const pathLabels: Record<CreatePath, string> = {
    sentence: m.pathSentence,
    interview: m.pathInterview,
    manual: m.pathManual,
  };

  return (
    <section aria-label={m.wizardAria} className="create-wizard">
      <div className="create-wizard__header">
        <h2 className="create-wizard__title">{labels.createWizardTitle}</h2>
      </div>
      <div className="create-wizard__paths" role="group" aria-label={m.pathLabel}>
        {(['sentence', 'interview', 'manual'] as CreatePath[]).map((option) => (
          <button
            key={option}
            type="button"
            className="create-wizard__path"
            data-selected={activePath === option}
            aria-pressed={activePath === option}
            onClick={() => selectPath(option)}
            disabled={isLoading}
          >
            {pathLabels[option]}
          </button>
        ))}
      </div>
      <p className="create-wizard__live" aria-live="polite">
        {activePath === 'interview' ? m.interviewTitle : titles[openStep]}
      </p>
      {activePath === 'interview' ? (
        <CreateInterview
          onProposal={applyDraftProposal}
          onManual={() => selectPath('manual')}
          onCancel={onCancel}
        />
      ) : (
        <ol className="create-wizard__steps">
          {(openStep === 6 ? [6 as const] : steps).map((step) => {
            const state = stepState(step);
            return (
              <li
                key={step}
                ref={(element) => {
                  stepRefs.current[step] = element;
                }}
                tabIndex={state === 'open' ? -1 : undefined}
                aria-current={state === 'open' ? 'step' : undefined}
                aria-disabled={state === 'locked' ? true : undefined}
                data-step-state={state}
                data-guide-step={`create-${step}`}
                className={`create-wizard__step create-wizard__step--${state}`}
              >
                {step !== 6 || state !== 'open' ? (
                  <div className="create-wizard__step-head">
                    <span aria-hidden="true" className="create-wizard__badge">
                      {state === 'done' ? (
                        <Check size={14} aria-hidden="true" />
                      ) : state === 'locked' ? (
                        <Lock size={14} aria-hidden="true" />
                      ) : (
                        step
                      )}
                    </span>
                    <strong className="create-wizard__step-title">{titles[step]}</strong>
                  </div>
                ) : null}
                {state === 'locked' ? (
                  <p className="create-wizard__locked-hint">{m.lockedHint(titles[(step - 1) as CreateWizardStep])}</p>
                ) : state === 'done' ? (
                  <div className="create-wizard__step-body">{renderDoneBody(step)}</div>
                ) : (
                  <div className="create-wizard__step-body">{renderStepBody(step)}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <div className="create-wizard__footer">
        <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={isLoading}>
          {m.cancel}
        </button>
      </div>
    </section>
  );
};

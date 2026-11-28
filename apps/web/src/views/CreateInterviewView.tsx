/**
 * Entrevista de creación (NAP-U3): la persona arma su reunión conversando con
 * la avatar. La avatar va a la izquierda (video, subtítulos y micrófono de
 * U1); a la derecha, el formulario se llena por pasos y el dorado marca solo
 * el paso activo. `fill_event_draft` con step llena los campos y activa ese
 * paso; la persona corrige a mano cuando quiere y solo ella publica. Al
 * publicar, la pantalla final muestra la invitación, la dirección propia, los
 * dos QR, el correo opcional y cómo compartirla.
 * NAP-U5: sugeridas por tag, anfitriona que recibe invitados, ?subdominio=,
 * saludo propio con foto y resumen del borrador al cambiar de avatar.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AVATAR_TAGS, type AvatarDraftStep, type AvatarTag, type TemplateKind, type ThemeKey } from '@fiestapay/shared';
import { api, type AvatarCatalogItem } from '../api/client';
import { rememberAdminKey } from '../api/admin-key';
import { preferredSubdomainFromLocation } from '../api/host-info';
import type { FiestaEvent } from '../types';
import { useI18n, useMessages } from '../i18n/I18nContext';
import { interviewCatalog } from '../i18n/messages/interview';
import { createEventCatalog } from '../i18n/messages/organizerCreate';
import {
  GUIDE_DRAFT_EVENT,
  consumeGuideDraftProposal,
  type GuideDraftDetail,
} from '../guide/showOnScreen';
import { isDraftEventProposal, type DraftEventProposal } from '../lib/draft-proposal';
import {
  AVATAR_SUGGEST_EVENT,
  consumeAvatarSuggestion,
  type AvatarSuggestDetail,
} from '../components/avatar/avatar-suggest';
import {
  buildEventInput,
  mealForHour,
  pad,
  plusHours,
  type EventFormFields,
} from '../components/events/event-form-model';
import {
  buildInviteShareText,
  defaultThemeFor,
  formatEventRange,
} from '../lib/event-presentation';
import { NapsterAvatar } from '../components/avatar/NapsterAvatar';
import { AvatarPicker } from '../components/avatar/AvatarPicker';
import { EventAvatarSection } from '../components/avatar/EventAvatarSection';
import { HostAvatar } from '../components/avatar/HostAvatar';
import { TemplateIcon } from '../components/events/template-icons';
import { SignatureInvitationCard } from '../components/invite/SignatureInvitationCard';
import { RecoveryEmailCard } from '../components/dashboard/RecoveryEmailCard';
import { EventQrCards } from '../components/share/EventQrCards';
import { ShareButtons } from '../components/share/ShareButtons';
import type { NapsterSessionStatus } from '../components/avatar/useNapsterSession';
import '../styles/create-interview.css';

interface CreateInterviewViewProps {
  onDone: (slug: string) => void;
  onCancel: () => void;
  onShowToast: (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => void;
  recoveryAvailable?: boolean;
}

type InterviewStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STEP_ORDER: InterviewStep[] = [1, 2, 3, 4, 5, 6, 7];

/** Paso que activa cada `step` de `fill_event_draft` (contrato NAP-S1). */
const STEP_BY_DRAFT: Record<AvatarDraftStep, InterviewStep> = {
  template: 1,
  date: 2,
  startTime: 3,
  location: 4,
  headcount: 5,
  perPersonCents: 6,
};

const TEMPLATES: TemplateKind[] = ['comida', 'casa', 'viaje', 'evento'];

const DRAFT_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DRAFT_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ADDRESS_OK = /^[a-z0-9-]{3,40}$/;

/** Fecha local YYYY-MM-DD dentro de `days` días; nada de años fijos. */
function datePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const isRealDate = (value: string): boolean =>
  DRAFT_DATE.test(value) && !Number.isNaN(new Date(`${value}T12:00`).getTime());

export const CreateInterviewView: React.FC<CreateInterviewViewProps> = ({
  onDone,
  onCancel,
  onShowToast,
  recoveryAvailable = false,
}) => {
  const { formatMoney, locale } = useI18n();
  const m = useMessages(interviewCatalog);
  const c = useMessages(createEventCatalog);

  const [avatars, setAvatars] = useState<AvatarCatalogItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restartToken, setRestartToken] = useState(0);
  const [sessionStatus, setSessionStatus] = useState<NapsterSessionStatus>('idle');
  const sessionApiRef = useRef<{
    status: NapsterSessionStatus;
    textReady: boolean;
    notifyPublished: () => void;
    notifySystem: (message: string) => void;
  } | null>(null);
  /** NAP-U5: tag de `suggest_avatars`; la fila resalta las de ese tag. */
  const [suggestedTag, setSuggestedTag] = useState<AvatarTag | null>(null);
  /** NAP-U5: resumen del borrador para la nueva avatar al reiniciar. */
  const pendingSummaryRef = useRef<string | null>(null);

  const [template, setTemplate] = useState<TemplateKind>('comida');
  const [title, setTitle] = useState('');
  const [organizerName, setOrganizerName] = useState('');
  const [date, setDate] = useState(() => datePlusDays(7));
  const [time, setTime] = useState('18:00');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [priceDollars, setPriceDollars] = useState('');
  // NAP-U5: pedir una dirección libre desde su subdominio la trae pedida.
  const [address, setAddress] = useState(() => preferredSubdomainFromLocation() ?? '');
  const [activeStep, setActiveStep] = useState<InterviewStep>(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState<{ event: FiestaEvent; adminKey: string | null } | null>(null);
  /** Campos que la persona tocó: la avatar no los pisa al rellenar. */
  const touchedRef = useRef<Set<string>>(new Set());
  /** Doble clic publica una sola vez; el estado llega tarde al segundo clic. */
  const inFlightRef = useRef(false);
  /** Un resultado tardío tras desmontar no navega ni avisa. */
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const selected = avatars.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    let alive = true;
    api
      .getAvatars()
      .then((res) => {
        if (!alive) return;
        setAvatars(res.avatars);
        const favorite = res.avatars.find((item) => item.default) ?? res.avatars[0] ?? null;
        setSelectedId(favorite ? favorite.id : null);
      })
      .catch(() => {
        // Sin catálogo no hay fila; la sesión usa la default del servidor.
        if (alive) setAvatars([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const stepLabel = (step: InterviewStep): string => {
    switch (step) {
      case 1:
        return m.stepType;
      case 2:
        return m.stepDate;
      case 3:
        return m.stepTime;
      case 4:
        return m.stepPlace;
      case 5:
        return m.stepHeadcount;
      case 6:
        return m.stepQuota;
      case 7:
        return m.stepReview;
    }
  };

  const templateLabel = (kind: TemplateKind): string => {
    switch (kind) {
      case 'comida':
        return c.templateComida;
      case 'casa':
        return c.templateCasa;
      case 'viaje':
        return c.templateViaje;
      case 'evento':
        return c.templateEvento;
    }
  };

  const touch = (key: string): void => {
    touchedRef.current.add(key);
  };

  /**
   * Aplica un borrador de la avatar sin publicar: solo los campos sugeridos
   * con valor usable que la persona no tocó, y siempre activa el paso que la
   * avatar reporta. La corrección a mano nunca se pierde.
   */
  const applyProposal = (proposal: DraftEventProposal): void => {
    const wants = new Set(proposal.suggested ?? []);
    const touched = touchedRef.current;
    if (wants.has('title') && proposal.title.trim() && !touched.has('title')) {
      setTitle(proposal.title.trim().slice(0, 120));
    }
    if (wants.has('date') && proposal.date && isRealDate(proposal.date) && !touched.has('date')) {
      setDate(proposal.date);
    }
    if (
      wants.has('startTime') &&
      proposal.startTime &&
      DRAFT_TIME.test(proposal.startTime) &&
      !touched.has('time')
    ) {
      setTime(proposal.startTime);
    }
    if (wants.has('location') && proposal.location?.trim() && !touched.has('location')) {
      setLocation(proposal.location.trim().slice(0, 160));
    }
    if (
      wants.has('headcount') &&
      Number.isInteger(proposal.headcount) &&
      (proposal.headcount ?? 0) >= 1 &&
      (proposal.headcount ?? 0) <= 500 &&
      !touched.has('capacity')
    ) {
      setCapacity(String(proposal.headcount));
    }
    if (
      wants.has('budgetCents') &&
      Number.isSafeInteger(proposal.perPersonCents) &&
      (proposal.perPersonCents ?? 0) > 0 &&
      !touched.has('price')
    ) {
      setPriceDollars(((proposal.perPersonCents as number) / 100).toFixed(2));
    }
    if (proposal.step && STEP_BY_DRAFT[proposal.step]) {
      const step = STEP_BY_DRAFT[proposal.step];
      setActiveStep(step);
      setStepError(null);
      setDraftNotice(m.draftFilled(stepLabel(step)));
    }
  };

  const applyProposalRef = useRef(applyProposal);
  applyProposalRef.current = applyProposal;
  useEffect(() => {
    const pending = consumeGuideDraftProposal();
    if (isDraftEventProposal(pending)) applyProposalRef.current(pending);
    const onDraft = (event: Event): void => {
      const proposal = (event as CustomEvent<GuideDraftDetail>).detail?.proposal;
      consumeGuideDraftProposal();
      if (isDraftEventProposal(proposal)) applyProposalRef.current(proposal);
    };
    document.addEventListener(GUIDE_DRAFT_EVENT, onDraft);
    return () => document.removeEventListener(GUIDE_DRAFT_EVENT, onDraft);
  }, []);

  // NAP-U5: `suggest_avatars{tag}` resalta las de ese tag; la persona elige.
  useEffect(() => {
    const pending = consumeAvatarSuggestion();
    if (pending) setSuggestedTag(pending);
    const onSuggest = (event: Event): void => {
      const tag = (event as CustomEvent<AvatarSuggestDetail>).detail?.tag;
      consumeAvatarSuggestion();
      if (tag && AVATAR_TAGS.some((entry) => entry.id === tag)) setSuggestedTag(tag);
    };
    document.addEventListener(AVATAR_SUGGEST_EVENT, onSuggest);
    return () => document.removeEventListener(AVATAR_SUGGEST_EVENT, onSuggest);
  }, []);

  const suggestedIds = suggestedTag ? avatars.filter((item) => item.tags.includes(suggestedTag)).map((item) => item.id) : [];
  const suggestedTagLabel = suggestedTag
    ? (AVATAR_TAGS.find((entry) => entry.id === suggestedTag)?.[locale] ?? null)
    : null;

  const startsAtLocal = `${date}T${time}`;
  const endsAtLocal = plusHours(startsAtLocal, 3);

  const validateStep = (step: InterviewStep): string | null => {
    switch (step) {
      case 1:
        return title.trim() ? null : c.errTitle;
      case 2:
        return isRealDate(date) ? null : c.errStartFuture;
      case 3:
        return DRAFT_TIME.test(time) ? null : c.errStartFuture;
      case 4:
        return location.trim() ? null : c.errLocation;
      case 5: {
        const people = Number.parseInt(capacity, 10);
        return Number.isInteger(people) && people >= 1 ? null : c.errCapacity;
      }
      case 6: {
        const price = parseFloat(priceDollars);
        return Number.isFinite(price) && price > 0 ? null : c.errPrice;
      }
      case 7:
        return null;
    }
  };

  const goNext = (): void => {
    const error = validateStep(activeStep);
    if (error) {
      setStepError(error);
      return;
    }
    setStepError(null);
    setActiveStep((Math.min(activeStep + 1, 7) as InterviewStep));
  };

  const goBack = (): void => {
    setStepError(null);
    setActiveStep((Math.max(activeStep - 1, 1) as InterviewStep));
  };

  const fullFields = (): EventFormFields => ({
    template,
    title,
    description: '',
    organizerName,
    theme: defaultThemeFor(template).key,
    meal: mealForHour(Number.parseInt(time.slice(0, 2), 10) || 18),
    startsAt: startsAtLocal,
    endsAt: endsAtLocal,
    location,
    includes: [],
    priceDollars,
    capacity,
    goalDollars: '',
    minimumDollars: '',
    agenda: [],
    accessCode: '',
    accessTouched: false,
    deadlineLocal: '',
    deadlineTouched: false,
  });

  /**
   * La única vía de publicación: clic explícito de la persona, validación
   * fresca y aviso «published» a la sesión para que la avatar celebre. La
   * avatar nunca publica.
   */
  const handlePublish = async (): Promise<void> => {
    if (busy || inFlightRef.current) return;
    const cleanAddress = address.trim().toLowerCase();
    if (cleanAddress && !ADDRESS_OK.test(cleanAddress)) {
      setStepError(m.addressInvalid);
      return;
    }
    const built = buildEventInput(fullFields(), { isEdit: false, isLegacy: false }, c);
    if (!built.ok) {
      setStepError(built.message);
      return;
    }
    setStepError(null);
    setBusy(true);
    inFlightRef.current = true;
    try {
      // NAP-U5: la elegida viaja como anfitriona que recibe a los invitados.
      const res = await api.createEvent({
        ...built.payload,
        ...(cleanAddress ? { preferredSubdomain: cleanAddress } : {}),
        ...(selectedId ? { avatarId: selectedId } : {}),
      });
      // La clave se guarda siempre (también tras desmontar); lo visible no.
      if (res.adminKey) rememberAdminKey(res.event.slug, res.adminKey);
      if (!mountedRef.current) return;
      onShowToast('success', c.toastCreated(res.event.title), c.toastCreatedTitle);
      if (!res.adminKey) {
        // Sin clave de organizador no hay panel: directo a la invitación.
        onDone(res.event.slug);
        return;
      }
      sessionApiRef.current?.notifyPublished();
      setPublished({ event: res.event, adminKey: res.adminKey });
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const message = err instanceof Error && err.message ? err.message : c.toastCreateFail;
      onShowToast('error', message, c.toastCreateFailTitle);
      setStepError(message);
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  const sessionActive = sessionStatus === 'connecting' || sessionStatus === 'live' || sessionStatus === 'text';

  /**
   * Resumen breve de lo ya llenado para la nueva avatar (NAP-U5). El
   * borrador queda en el formulario; el resumen viaja como system cuando la
   * nueva sesión está lista, para que continúe donde iba la anterior.
   */
  const buildDraftSummary = (): string | null => {
    // Solo lo que la persona o la avatar llenaron; los defaults no cuentan.
    const touched = touchedRef.current;
    const parts: string[] = [];
    if (title.trim()) parts.push(`«${title.trim().slice(0, 80)}»`);
    if (touched.has('template')) parts.push(templateLabel(template));
    if (touched.has('date') && isRealDate(date)) parts.push(date);
    if (touched.has('time') && DRAFT_TIME.test(time)) parts.push(time);
    if (location.trim()) parts.push(location.trim().slice(0, 80));
    const people = Number.parseInt(capacity, 10);
    if (Number.isInteger(people) && people >= 1) parts.push(String(people));
    const price = parseFloat(priceDollars);
    if (Number.isFinite(price) && price > 0) parts.push(formatMoney(Math.round(price * 100)));
    if (parts.length === 0) return null;
    return `${m.resumeIntro}: ${parts.join('; ')}.`;
  };

  const buildDraftSummaryRef = useRef(buildDraftSummary);
  buildDraftSummaryRef.current = buildDraftSummary;

  /** Entrega el resumen pendiente en cuanto la (nueva) sesión puede oírlo. */
  const flushResumeSummary = (apiState: {
    status: NapsterSessionStatus;
    textReady: boolean;
    notifySystem: (message: string) => void;
  }): void => {
    const summary = pendingSummaryRef.current;
    if (!summary) return;
    const audible = apiState.status === 'live' || (apiState.status === 'text' && apiState.textReady);
    if (!audible) return;
    pendingSummaryRef.current = null;
    apiState.notifySystem(summary);
  };

  const flushResumeSummaryRef = useRef(flushResumeSummary);
  flushResumeSummaryRef.current = flushResumeSummary;

  const onPickAvatar = (id: string): void => {
    // El borrador se conserva: solo se guarda el resumen para la nueva.
    if (sessionActive) pendingSummaryRef.current = buildDraftSummaryRef.current();
    setSelectedId(id);
    // Con sesión en curso la tarjeta reinicia con la nueva elegida.
    setRestartToken((n) => n + 1);
  };

  const renderStepFields = (): React.ReactNode => {
    switch (activeStep) {
      case 1:
        return (
          <div className="interview-fields">
            <div className="interview-templates" role="group" aria-label={m.stepType}>
              {TEMPLATES.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`interview-template ${template === kind ? 'interview-template-active' : ''}`}
                  aria-pressed={template === kind}
                  data-testid={`interview-template-${kind}`}
                  onClick={() => {
                    setTemplate(kind);
                    touch('template');
                  }}
                >
                  <TemplateIcon template={kind} />
                  <span>{templateLabel(kind)}</span>
                </button>
              ))}
            </div>
            <label className="form-label" htmlFor="interview-title">
              {m.titleLabel}
            </label>
            <input
              id="interview-title"
              className="form-input"
              data-testid="interview-title"
              value={title}
              maxLength={120}
              placeholder={m.titlePlaceholder}
              onChange={(event) => {
                setTitle(event.target.value);
                touch('title');
              }}
            />
            <label className="form-label" htmlFor="interview-organizer">
              {m.organizerLabel}
            </label>
            <input
              id="interview-organizer"
              className="form-input"
              data-testid="interview-organizer"
              value={organizerName}
              maxLength={80}
              placeholder={m.organizerPlaceholder}
              onChange={(event) => setOrganizerName(event.target.value)}
            />
          </div>
        );
      case 2:
        return (
          <div className="interview-fields">
            <label className="form-label" htmlFor="interview-date">
              {m.dateLabel}
            </label>
            <input
              id="interview-date"
              className="form-input"
              data-testid="interview-date"
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                touch('date');
              }}
            />
          </div>
        );
      case 3:
        return (
          <div className="interview-fields">
            <label className="form-label" htmlFor="interview-time">
              {m.timeLabel}
            </label>
            <input
              id="interview-time"
              className="form-input"
              data-testid="interview-time"
              type="time"
              value={time}
              onChange={(event) => {
                setTime(event.target.value);
                touch('time');
              }}
            />
          </div>
        );
      case 4:
        return (
          <div className="interview-fields">
            <label className="form-label" htmlFor="interview-location">
              {m.placeLabel}
            </label>
            <input
              id="interview-location"
              className="form-input"
              data-testid="interview-location"
              value={location}
              maxLength={160}
              placeholder={m.placePlaceholder}
              onChange={(event) => {
                setLocation(event.target.value);
                touch('location');
              }}
            />
          </div>
        );
      case 5:
        return (
          <div className="interview-fields">
            <label className="form-label" htmlFor="interview-capacity">
              {m.headcountLabel}
            </label>
            <input
              id="interview-capacity"
              className="form-input"
              data-testid="interview-capacity"
              type="number"
              min={1}
              max={500}
              inputMode="numeric"
              value={capacity}
              onChange={(event) => {
                setCapacity(event.target.value);
                touch('capacity');
              }}
            />
          </div>
        );
      case 6:
        return (
          <div className="interview-fields">
            <label className="form-label" htmlFor="interview-price">
              {m.quotaLabel}
            </label>
            <input
              id="interview-price"
              className="form-input"
              data-testid="interview-price"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={priceDollars}
              onChange={(event) => {
                setPriceDollars(event.target.value);
                touch('price');
              }}
            />
            <p className="interview-quota-note">{m.quotaNote}</p>
          </div>
        );
      case 7: {
        const rows: Array<[string, string]> = [
          [m.stepType, `${templateLabel(template)} — ${title.trim() || m.reviewEmpty}`],
          [m.stepDate, isRealDate(date) ? date : m.reviewEmpty],
          [m.stepTime, DRAFT_TIME.test(time) ? time : m.reviewEmpty],
          [m.stepPlace, location.trim() || m.reviewEmpty],
          [m.stepHeadcount, capacity.trim() || m.reviewEmpty],
          [
            m.stepQuota,
            Number.isFinite(parseFloat(priceDollars)) && parseFloat(priceDollars) > 0
              ? formatMoney(Math.round(parseFloat(priceDollars) * 100))
              : m.reviewEmpty,
          ],
        ];
        return (
          <div className="interview-fields">
            <dl className="interview-review" data-testid="interview-review">
              {rows.map(([label, value]) => (
                <div key={label} className="interview-review-row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <label className="form-label" htmlFor="interview-address">
              {m.addressLabel}
            </label>
            <input
              id="interview-address"
              className="form-input"
              data-testid="interview-address"
              value={address}
              maxLength={40}
              placeholder={m.addressPlaceholder}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setAddress(event.target.value)}
            />
            <p className="interview-hint">{m.addressHint}</p>
            {address.trim() ? (
              <p className="interview-address-willbe" data-testid="interview-address-willbe">
                {m.addressWillBe(address.trim().toLowerCase())}. {m.addressTakenNote}
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn-primary interview-publish"
              data-testid="interview-publish"
              disabled={busy}
              onClick={() => void handlePublish()}
            >
              {busy ? m.publishing : m.publish}
            </button>
          </div>
        );
      }
    }
  };

  // La avatar nunca se desmonta: la conversación sigue en la pantalla final.
  return (
    <div className="interview" data-testid={published ? 'create-interview-done' : 'create-interview'}>
      <header className="interview-head">
        <h1>{published ? m.finalTitle : m.pageTitle}</h1>
        <p>{published ? m.finalLead : m.pageLead}</p>
      </header>
      {published ? null : (
        <AvatarPicker
          avatars={avatars}
          selectedId={selectedId}
          suggestedIds={suggestedIds}
          suggestedTagLabel={suggestedTagLabel}
          sessionActive={sessionActive}
          onSelect={onPickAvatar}
        />
      )}
      <div className="interview-grid">
        <div className="interview-avatar">
          <NapsterAvatar
            intent="create"
            avatarId={selected?.id}
            guideName={selected?.firstName}
            previewUrl={selected?.previewUrl}
            restartToken={restartToken}
            idleGreeting={m.interviewGreeting}
            onSessionApi={(apiState) => {
              sessionApiRef.current = apiState;
              setSessionStatus(apiState.status);
              flushResumeSummaryRef.current(apiState);
            }}
          />
        </div>
        {published ? (
          <PublishedPanel
            event={published.event}
            adminKey={published.adminKey}
            recoveryAvailable={recoveryAvailable}
            onDone={onDone}
          />
        ) : (
        <div className="interview-form">
          <ol className="interview-steps" data-testid="interview-steps">
            {STEP_ORDER.map((step) => (
              <li key={step}>
                <button
                  type="button"
                  className={`interview-step-dot ${step === activeStep ? 'interview-step-active' : ''}`}
                  aria-current={step === activeStep ? 'step' : undefined}
                  data-testid={`interview-step-${step}`}
                  onClick={() => {
                    setStepError(null);
                    setActiveStep(step);
                  }}
                >
                  <span className="interview-step-num">{step}</span>
                  <span className="interview-step-text">{stepLabel(step)}</span>
                </button>
              </li>
            ))}
          </ol>
          {draftNotice ? (
            <p className="interview-draft-notice" role="status" data-testid="interview-draft-notice">
              {draftNotice}
            </p>
          ) : null}
          <section
            key={activeStep}
            className="interview-step"
            aria-label={stepLabel(activeStep)}
            data-testid="interview-step-panel"
          >
            <h2>{stepLabel(activeStep)}</h2>
            {renderStepFields()}
          </section>
          {stepError ? (
            <p className="interview-error" role="alert" data-testid="interview-step-error">
              {stepError}
            </p>
          ) : null}
          {busy ? (
            <p className="interview-creating" role="status" aria-live="polite" data-testid="interview-creating">
              {c.viewCreating}
            </p>
          ) : null}
          <div className="interview-nav">
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="interview-back"
              disabled={busy || activeStep === 1}
              onClick={goBack}
            >
              {m.back}
            </button>
            {activeStep === 1 ? (
              <button type="button" className="btn btn-secondary" data-testid="interview-cancel" onClick={onCancel}>
                {c.cancel}
              </button>
            ) : null}
            {activeStep < 7 ? (
              <button
                type="button"
                className="btn btn-primary"
                data-testid="interview-next"
                disabled={busy}
                onClick={goNext}
              >
                {m.next}
              </button>
            ) : null}
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

/**
 * Panel final tras publicar (NAP-U3): a la derecha de la avatar, que sigue
 * conversando. Vista previa de la invitación, dirección propia, QR de
 * invitados, QR de administrador distinto con su aviso, correo opcional de
 * recuperación, foto propia y cómo compartirla.
 * NAP-U5: la previa usa la tarjeta real en modo colecta y muestra quién
 * recibe a los invitados, con opción de cambiarla.
 */
const PublishedPanel: React.FC<{
  event: FiestaEvent;
  adminKey: string | null;
  recoveryAvailable: boolean;
  onDone: (slug: string) => void;
}> = ({ event: initialEvent, adminKey, recoveryAvailable, onDone }) => {
  const { locale } = useI18n();
  const m = useMessages(interviewCatalog);
  const [event, setEvent] = useState(initialEvent);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const origin = window.location.origin;
  const guestUrl = event.publicUrl ?? `${origin}/e/${encodeURIComponent(event.slug)}`;
  const adminUrl = adminKey ? `${origin}/e/${encodeURIComponent(event.slug)}/admin?k=${encodeURIComponent(adminKey)}` : null;
  const themeKey: ThemeKey = defaultThemeFor(event.template).key;
  const dateLine = formatEventRange(event.startsAt, event.endsAt, undefined, locale);
  const shareText = buildInviteShareText(
    {
      template: event.template,
      theme: themeKey,
      title: event.title,
      location: event.location,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      priceCents: event.priceCents,
      inviteUrl: guestUrl,
      organizerName: event.organizerName,
    },
    locale,
  );

  return (
    <div className="interview-final" data-testid="interview-final">
      <section aria-label={m.finalPreviewTitle} data-testid="interview-final-preview">
        <h2>{m.finalPreviewTitle}</h2>
        <SignatureInvitationCard
          template={event.template}
          theme={themeKey}
          title={event.title}
          organizerName={event.organizerName ?? ''}
          description={event.description}
          location={event.location}
          startsAt={event.startsAt}
          endsAt={event.endsAt ?? event.startsAt}
          priceCents={event.priceCents}
          capacity={event.capacity ?? 0}
          includes={event.includes}
          meal={event.meal}
          locale={locale}
          compact
          collecta
        />
      </section>
      <HostAvatar
        slug={event.slug}
        currentId={event.avatarId ?? null}
        photoStatus={photoStatus}
        onChanged={(avatarId) => setEvent((prev) => ({ ...prev, avatarId }))}
      />
      <section aria-label={m.finalAddressTitle} data-testid="interview-final-address">
        <h2>{m.finalAddressTitle}</h2>
        <p className="interview-address" data-testid="interview-public-url">
          {guestUrl}
        </p>
      </section>
      <EventQrCards guestUrl={guestUrl} adminUrl={adminUrl} />
      <ShareButtons title={event.title} dateLine={dateLine} place={event.location} url={guestUrl} shareText={shareText} />
      <section aria-label={m.finalEmailTitle} data-testid="interview-final-email">
        <h2>{m.finalEmailTitle}</h2>
        <RecoveryEmailCard slug={event.slug} available={recoveryAvailable} />
      </section>
      <section aria-label={m.finalPhotoTitle} data-testid="interview-final-photo">
        <h2>{m.finalPhotoTitle}</h2>
        <EventAvatarSection slug={event.slug} onStatus={setPhotoStatus} />
      </section>
      <button type="button" className="btn btn-primary" data-testid="interview-go-dashboard" onClick={() => onDone(event.slug)}>
        {m.finalGoDashboard}
      </button>
    </div>
  );
};

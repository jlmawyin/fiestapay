import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  mealLabel,
  templateInviteCopy,
  themeLabel,
  themePhrase,
  themesForTemplate,
  type ThemeKey,
} from '@fiestapay/shared';
import type { EventInput, FiestaEvent, TemplateKind, AgendaItem } from '../../types';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { createEventCatalog } from '../../i18n/messages/organizerCreate';
import {
  buildEventInput,
  capitalLabel,
  collectExampleHits,
  defaultStart,
  dollars,
  mealForHour,
  plusHours,
  reviewSignatureOf,
  toLocalInput,
  type ExampleFieldKey,
  type ExampleHit,
  type ExampleReview,
  type PublishReview,
  type Submission,
} from './event-form-model';
import {
  defaultThemeFor,
  formatEventRange,
  organizerLine,
  resolveTheme,
  suggestTheme,
  themeCssVars,
} from '../../lib/event-presentation';
import { TemplateCover } from '../illustrations/TemplateCover';
import { TemplateIcon } from './template-icons';

interface CreateEventFormProps {
  onSubmit: (input: EventInput) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  initial?: FiestaEvent | null;
  submitLabel?: string;
}

export const CreateEventForm: React.FC<CreateEventFormProps> = ({
  onSubmit,
  onCancel,
  isLoading,
  initial = null,
  submitLabel,
}) => {
  const { locale, formatMoney } = useI18n();
  const m = useMessages(createEventCatalog);
  const effectiveSubmitLabel = submitLabel ?? m.createSubmit;
  const [template, setTemplate] = useState<TemplateKind>(initial?.template ?? 'comida');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [mealTouched, setMealTouched] = useState(Boolean(initial));
  const [meal, setMeal] = useState<'desayuno' | 'almuerzo' | 'cena'>(initial?.meal ?? 'almuerzo');
  const [organizerName, setOrganizerName] = useState(initial?.organizerName ?? '');
  const [themeTouched, setThemeTouched] = useState(Boolean(initial?.theme));
  const [theme, setTheme] = useState<ThemeKey>(initial?.theme ?? defaultThemeFor(initial?.template ?? 'comida').key);
  const [startsAt, setStartsAt] = useState(() => (initial ? toLocalInput(new Date(initial.startsAt)) : defaultStart()));
  const [startTouched, setStartTouched] = useState(Boolean(initial));
  const [endsTouched, setEndsTouched] = useState(Boolean(initial?.endsAt));
  const [endsAt, setEndsAt] = useState(() => {
    if (initial?.endsAt) return toLocalInput(new Date(initial.endsAt));
    const start = initial ? toLocalInput(new Date(initial.startsAt)) : defaultStart();
    return plusHours(start, 4);
  });
  const [location, setLocation] = useState(initial?.location ?? '');
  const [priceDollars, setPriceDollars] = useState(initial ? dollars(initial.priceCents) : '');
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : '');
  const [goalDollars, setGoalDollars] = useState(initial ? dollars(initial.goalCents) : '');
  const [minimumDollars, setMinimumDollars] = useState(initial ? dollars(initial.minimumCents) : '');
  const [includesText, setIncludesText] = useState(initial?.includes.join(', ') ?? '');
  const [agenda, setAgenda] = useState<AgendaItem[]>(initial?.agenda ?? []);
  const [accessCode, setAccessCode] = useState('');
  const [accessTouched, setAccessTouched] = useState(false);
  const [deadlineLocal, setDeadlineLocal] = useState(() =>
    initial?.fundingDeadlineAt ? toLocalInput(new Date(initial.fundingDeadlineAt)) : '',
  );
  const [deadlineTouched, setDeadlineTouched] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [exampleReview, setExampleReview] = useState<ExampleReview | null>(null);
  const [publishReview, setPublishReview] = useState<PublishReview | null>(null);
  const exampleWarningRef = useRef<HTMLDivElement>(null);
  const posting = useRef(false);
  const isEdit = Boolean(initial);
  const isLegacy = initial?.fundingStatus === 'legacy';
  const initialDeadlineAbsent = isEdit && (initial?.fundingDeadlineAt == null);

  const handleSelectTemplate = (t: TemplateKind) => {
    setTemplate(t);
    if (!themesForTemplate(t).some((item) => item.key === theme)) {
      setTheme(defaultThemeFor(t).key);
      setThemeTouched(false);
    }
  };

  const handleStartChange = (value: string) => {
    setStartTouched(true);
    setStartsAt(value);
    if (!endsTouched) setEndsAt(plusHours(value, 4));
    if (!mealTouched) {
      const hour = new Date(value).getHours();
      if (!Number.isNaN(hour)) setMeal(mealForHour(hour));
    }
  };

  const handleAddAgendaItem = () => {
    setAgenda([...agenda, { time: '', title: '' }]);
  };

  const handleUpdateAgendaItem = (index: number, field: keyof AgendaItem, val: string) => {
    const updated = [...agenda];
    updated[index] = { ...updated[index], [field]: val };
    setAgenda(updated);
  };

  const handleRemoveAgendaItem = (index: number) => {
    setAgenda(agenda.filter((_, i) => i !== index));
  };

  const exampleValues = (): Record<ExampleFieldKey, string> => ({
    title,
    location,
    description,
    includes: includesText,
  });

  const currentExampleHits = (): ExampleHit[] => collectExampleHits(exampleValues(), (key) => m[key]);

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
      startsAt,
      endsAt,
      endsTouched,
      location,
      priceDollars,
      capacity,
      goalDollars,
      minimumDollars,
      includesText,
      agenda,
      accessCode,
      accessTouched,
      deadlineLocal,
      deadlineTouched,
    });

  const liveSignature = reviewSignature();
  const activeExample = exampleReview && exampleReview.signature === liveSignature ? exampleReview : null;
  const activePublish = publishReview && publishReview.signature === liveSignature ? publishReview : null;
  const activeReview = isEdit ? activeExample : activePublish;

  useEffect(() => {
    if (!activeReview) return;
    exampleWarningRef.current?.focus();
  }, [activeReview]);

  const buildSubmission = (): Submission =>
    buildEventInput(
      {
        template,
        title,
        description,
        organizerName,
        theme,
        meal,
        startsAt,
        endsAt,
        location,
        includes: includesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        priceDollars,
        capacity,
        goalDollars,
        minimumDollars,
        agenda,
        accessCode,
        accessTouched,
        deadlineLocal,
        deadlineTouched,
      },
      { isEdit, isLegacy },
      m,
    );

  const rejectSubmission = (message: string) => {
    setExampleReview(null);
    setPublishReview(null);
    setValidationError(message);
  };

  const submitPayload = async (payload: EventInput) => {
    if (posting.current || isLoading) return;
    posting.current = true;
    try {
      await onSubmit(payload);
      setPublishReview(null);
      setExampleReview(null);
    } catch (err: any) {
      setValidationError(err.message || m.errSubmit);
    } finally {
      posting.current = false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || posting.current) return;
    setValidationError(null);

    const built = buildSubmission();
    if (!built.ok) {
      rejectSubmission(built.message);
      return;
    }

    const hits = currentExampleHits();
    const signature = reviewSignature();
    if (!isEdit) {
      setExampleReview(null);
      setPublishReview({
        signature,
        payload: built.payload,
        hits,
        datesSuggested: !startTouched && !endsTouched,
      });
      return;
    }

    if (hits.length > 0) {
      setExampleReview({ signature, hits });
      return;
    }

    setExampleReview(null);
    await submitPayload(built.payload);
  };

  const handleReviseExamples = () => {
    if (isLoading || !activeReview || activeReview.hits.length === 0) return;
    const first = activeReview.hits[0];
    setExampleReview(null);
    setPublishReview(null);
    if (first) document.getElementById(first.inputId)?.focus();
  };

  const handlePublishExamples = async () => {
    if (isLoading || posting.current || !activeReview || activeReview.hits.length === 0) return;
    const signature = reviewSignature();
    if (signature !== activeReview.signature) {
      setExampleReview(null);
      setPublishReview(null);
      return;
    }

    const built = buildSubmission();
    if (!built.ok) {
      rejectSubmission(built.message);
      return;
    }
    if (currentExampleHits().length === 0 || reviewSignature() !== signature) {
      setExampleReview(null);
      setPublishReview(null);
      return;
    }
    if (!isEdit && 'payload' in activeReview && JSON.stringify(built.payload) !== JSON.stringify(activeReview.payload)) {
      setPublishReview(null);
      return;
    }

    await submitPayload(built.payload);
  };

  const handlePublishReviewed = async () => {
    if (isLoading || posting.current || !activePublish || activePublish.hits.length > 0) return;
    const built = buildSubmission();
    if (!built.ok) {
      rejectSubmission(built.message);
      return;
    }
    if (reviewSignature() !== activePublish.signature || JSON.stringify(built.payload) !== JSON.stringify(activePublish.payload)) {
      setPublishReview(null);
      return;
    }
    await submitPayload(activePublish.payload);
  };

  const selectedTheme = resolveTheme(template, theme);
  const themeHint = suggestTheme(template, title);
  const reviewedPayload = activePublish?.payload ?? null;
  const templateLabels: Record<TemplateKind, string> = {
    comida: m.templateComida,
    casa: m.templateCasa,
    viaje: m.templateViaje,
    evento: m.templateEvento,
  };

  return (
    <form noValidate onSubmit={handleSubmit} className="event-form" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', ...themeCssVars(selectedTheme) }}>
      {/* Template Selection Tabs */}
      <div>
        <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
          {m.typeLabel}
        </label>
        <div
          className="template-picker"
          role="radiogroup"
          aria-label={m.typeGroupAria}
        >
          {(['comida', 'casa', 'viaje', 'evento'] as TemplateKind[]).map((t) => {
            const isSelected = template === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handleSelectTemplate(t)}
                className="btn"
                style={{
                  backgroundColor: isSelected ? 'var(--color-blue-tint)' : 'var(--color-surface)',
                  color: isSelected ? 'var(--color-blue)' : 'var(--color-ink)',
                  borderColor: isSelected ? 'var(--color-blue)' : 'var(--color-border)',
                  borderWidth: isSelected ? '2px' : '1px',
                  fontWeight: isSelected ? 800 : 600,
                  fontSize: '0.875rem',
                  padding: '0.6rem 0.5rem',
                  flexDirection: 'column',
                  gap: '0.2rem',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <TemplateIcon template={t} size={18} />
                  <span>{templateLabels[t]}</span>
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-ink-muted)', fontWeight: 500 }}>
                  {m.typeKind}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SVG Preview Card */}
      <div className="theme-scope" data-theme={selectedTheme.key} style={{ ...themeCssVars(selectedTheme), borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
        <TemplateCover template={template} height="130px" accent={selectedTheme.accent} />
        <p className="theme-phrase" style={{ margin: '0.75rem 1rem' }}>{themePhrase(selectedTheme.key, locale)}</p>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="event-theme">{m.themeLabel}</label>
        <div id="event-theme" className="theme-picker" role="radiogroup" aria-label={m.themeGroupAria}>
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
        {themeHint && themeHint.key !== theme ? (
          <p className="form-label-desc">
            {m.themeSuggestion(themeLabel(themeHint.key, locale))}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginLeft: '0.5rem', padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}
              onClick={() => {
                setThemeTouched(true);
                setTheme(themeHint.key);
              }}
            >
              {m.themeUse(themeLabel(themeHint.key, locale))}
            </button>
          </p>
        ) : null}
      </div>

      <div
        style={{
          backgroundColor: validationError ? 'var(--color-coral-tint)' : 'transparent',
          color: 'var(--color-coral)',
          border: validationError ? '1px solid var(--color-coral)' : '1px solid transparent',
          padding: validationError ? '0.75rem' : '0',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.875rem',
          minHeight: validationError ? undefined : 0,
        }}
        role="alert"
        aria-live="polite"
      >
        {validationError ?? ''}
      </div>

      {/* Basic Info */}
      <div className="form-group">
        <label className="form-label" htmlFor="event-title">
          {m.titleLabel}
        </label>
        <input
          id="event-title"
          className="form-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder={m.titlePlaceholder}
        />
      </div>

      <div className="form-group">
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

      <div className="event-form-grid-2">
        {template === 'comida' ? (
        <div className="form-group">
          <label className="form-label" htmlFor="event-meal">
            {m.mealLabel}
          </label>
          <select
            id="event-meal"
            className="form-select"
            value={meal}
            onChange={(e) => {
              setMealTouched(true);
              setMeal(e.target.value as 'desayuno' | 'almuerzo' | 'cena');
            }}
          >
            <option value="desayuno">{capitalLabel(mealLabel('desayuno', locale), locale)}</option>
            <option value="almuerzo">{capitalLabel(mealLabel('almuerzo', locale), locale)}</option>
            <option value="cena">{capitalLabel(mealLabel('cena', locale), locale)}</option>
          </select>
        </div>
        ) : null}

        <div className="form-group">
          <label className="form-label" htmlFor="event-date">
            {m.startLabel}
          </label>
          <input
            id="event-date"
            type="datetime-local"
            className="form-input"
            value={startsAt}
            onChange={(e) => handleStartChange(e.target.value)}
            required
          />
          <span className="form-label-desc">{m.timeZoneNote}</span>
          {!isEdit && !startTouched ? (
            <span className="form-label-desc">{m.startSuggestion}</span>
          ) : null}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="event-end">
          {m.endLabel}
        </label>
        <input
          id="event-end"
          type="datetime-local"
          className="form-input"
          value={endsAt}
          onChange={(e) => {
            setEndsTouched(true);
            setEndsAt(e.target.value);
          }}
          required
        />
        <span className="form-label-desc">{m.endHelp}</span>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="event-location">
          {m.locationLabel}
        </label>
        <input
          id="event-location"
          className="form-input"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
          placeholder={m.locationPlaceholder}
        />
      </div>

      <div className="form-group">
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

      {/* Financials (P1 Fixed Covers & Minimums) */}
      <div
        style={{
          padding: '1rem',
          backgroundColor: 'var(--color-surface-subtle)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
        }}
      >
        <h4 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', color: 'var(--color-ink)' }}>
          {m.moneyTitle}
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="event-price">
              {m.priceLabel}
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
                onChange={(e) => setPriceDollars(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <span className="form-label-desc">{m.priceHelp}</span>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="event-minimum">
              {m.minimumLabel}
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.75rem', top: '0.65rem', color: 'var(--color-ink-muted)' }}>
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
              <span style={{ position: 'absolute', left: '0.75rem', top: '0.65rem', color: 'var(--color-ink-muted)' }}>
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

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="event-capacity">
              {m.capacityLabel}
            </label>
            <input
              id="event-capacity"
              type="number"
              min="1"
              max="1000"
              className="form-input"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder={m.capacityPlaceholder}
              required
            />
            <span className="form-label-desc">{m.capacityHelp}</span>
          </div>
        </div>

        <div className="form-group" style={{ margin: '0.85rem 0 0 0' }}>
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
            {isEdit ? m.deadlineHelpEdit : m.deadlineHelpCreate}
          </span>
        </div>
        {isLegacy ? (
          <p className="funding-field-note" role="note">
            {m.legacyNote}
          </p>
        ) : initialDeadlineAbsent ? (
          <p className="funding-field-note" role="note">
            {m.deadlineAbsentNote}
          </p>
        ) : null}
        {isEdit ? (
          <p className="funding-field-note" role="note">
            {m.editOrdersNote}
          </p>
        ) : null}
      </div>

      {/* What's Included */}
      <div className="form-group">
        <label className="form-label" htmlFor="event-includes">
          {m.includesLabel}
        </label>
        <input
          id="event-includes"
          className="form-input"
          value={includesText}
          onChange={(e) => setIncludesText(e.target.value)}
          placeholder={m.includesPlaceholder}
        />
      </div>

      {/* Agenda */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label className="form-label" style={{ marginBottom: 0 }}>
            {m.agendaLabel}
          </label>
          <button
            type="button"
            onClick={handleAddAgendaItem}
            className="btn btn-secondary"
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
          >
            {m.agendaAdd}
          </button>
        </div>
        <div className="form-group">
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
            placeholder={initial ? m.accessPlaceholderEdit : m.accessPlaceholderCreate}
            autoComplete="off"
          />
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
                onClick={() => handleRemoveAgendaItem(idx)}
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

      {reviewedPayload ? (
        <section className="publish-review" aria-label={m.reviewAria} style={themeCssVars(selectedTheme)}>
          <h3 style={{ margin: 0 }}>{m.reviewTitle}</h3>
          <p className="theme-phrase" style={{ fontSize: '1.15rem' }}>{themePhrase(selectedTheme.key, locale)}</p>
          {activePublish?.datesSuggested ? (
            <p>{m.reviewDatesSuggested}</p>
          ) : (
            <p>{m.reviewDatesFixed}</p>
          )}
          <dl>
            <dt>{m.reviewType}</dt>
            <dd>{templateInviteCopy(reviewedPayload.template, locale).welcome}</dd>
            <dt>{m.reviewHeading}</dt>
            <dd>{reviewedPayload.title}</dd>
            <dt>{m.reviewOrganizer}</dt>
            <dd>{organizerLine(reviewedPayload.organizerName, locale) ?? m.reviewNoName}</dd>
            <dt>{m.reviewWhen}</dt>
            <dd>{formatEventRange(reviewedPayload.startsAt, reviewedPayload.endsAt, undefined, locale)}</dd>
            <dt>{m.reviewWhere}</dt>
            <dd>{reviewedPayload.location}</dd>
            <dt>{m.reviewPrice}</dt>
            <dd>{formatMoney(reviewedPayload.priceCents)}</dd>
            <dt>{m.reviewMinimum}</dt>
            <dd>{reviewedPayload.minimumCents === null ? m.reviewNoMinimum : formatMoney(reviewedPayload.minimumCents)}</dd>
            <dt>{m.reviewGoal}</dt>
            <dd>{reviewedPayload.goalCents === null ? m.reviewNoGoal : formatMoney(reviewedPayload.goalCents)}</dd>
            {reviewedPayload.template === 'comida' ? (
              <>
                <dt>{m.reviewMeal}</dt>
                <dd style={{ textTransform: 'capitalize' }}>{mealLabel(reviewedPayload.meal, locale)}</dd>
              </>
            ) : null}
          </dl>
          {activePublish && activePublish.hits.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPublishReview(null)} disabled={isLoading}>
                {m.reviewKeepEditing}
              </button>
              <button type="button" className="btn btn-primary btn-theme-primary" onClick={() => void handlePublishReviewed()} disabled={isLoading}>
                {m.reviewPublish}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeReview && activeReview.hits.length > 0 ? (
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
            {activeReview.hits.map((hit) => (
              <li key={hit.field}>
                {hit.label}: {hit.raw}
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={handleReviseExamples} disabled={isLoading}>
              {m.exampleRevise}
            </button>
            <button type="button" className="btn btn-primary" onClick={handlePublishExamples} disabled={isLoading}>
              {m.examplePublish}
            </button>
          </div>
        </div>
      ) : null}

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem',
          borderTop: '1px solid var(--color-border)',
          paddingTop: '1rem',
          marginTop: '0.5rem',
        }}
      >
        <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={isLoading}>
          {m.cancel}
        </button>
        <button type="submit" className="btn btn-primary" disabled={isLoading || Boolean(activePublish)}>
          {isLoading ? m.saving : isEdit ? effectiveSubmitLabel : m.reviewTitle}
        </button>
      </div>
    </form>
  );
};

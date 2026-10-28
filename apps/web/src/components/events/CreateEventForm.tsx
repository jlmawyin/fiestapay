import React, { useEffect, useRef, useState } from 'react';
import { TEMPLATE_INVITE_COPY, themesForTemplate, type ThemeKey } from '@fiestapay/shared';
import type { EventInput, FiestaEvent, TemplateKind, AgendaItem } from '../../types';
import { usd } from '../../types';
import {
  defaultThemeFor,
  formatEventRange,
  organizerLine,
  resolveTheme,
  suggestTheme,
  themeCssVars,
} from '../../lib/event-presentation';
import { TemplateCover } from '../illustrations/TemplateCover';

interface CreateEventFormProps {
  onSubmit: (input: EventInput) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  initial?: FiestaEvent | null;
  submitLabel?: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

const toLocalInput = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const defaultStart = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  d.setHours(14, 0, 0, 0);
  return toLocalInput(d);
};

const plusHours = (local: string, hours: number): string => {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  d.setHours(d.getHours() + hours);
  return toLocalInput(d);
};

const mealForHour = (hour: number): 'desayuno' | 'almuerzo' | 'cena' => {
  if (hour < 11) return 'desayuno';
  if (hour < 17) return 'almuerzo';
  return 'cena';
};

const dollars = (cents: number | null): string => (cents === null ? '' : (cents / 100).toFixed(2));

// Visible title hint is neutral. The rule string below still says "Nombre de la fiesta"
// so an unmodified legacy example keeps warning. That leftover phrase is intentional.
const TITLE_PLACEHOLDER = 'Nombre de la invitación';

const EXAMPLE_FIELDS = [
  { field: 'title', label: 'Título del Evento', example: 'Nombre de la fiesta', inputId: 'event-title' },
  { field: 'location', label: 'Lugar o Dirección', example: 'Lugar o direccion', inputId: 'event-location' },
  {
    field: 'description',
    label: 'Descripción para los invitados',
    example: 'Que van a hacer',
    inputId: 'event-desc',
  },
  {
    field: 'includes',
    label: '¿Qué incluye la cuota? (Separados por coma)',
    example: 'Separa con comas',
    inputId: 'event-includes',
  },
] as const;

const TITLE_EXAMPLE_PHRASES = [EXAMPLE_FIELDS[0].example, TITLE_PLACEHOLDER] as const;

type ExampleFieldKey = (typeof EXAMPLE_FIELDS)[number]['field'];

type ExampleHit = {
  field: ExampleFieldKey;
  label: string;
  raw: string;
  inputId: string;
};

type ExampleReview = {
  signature: string;
  hits: ExampleHit[];
};

type Submission = { ok: false; message: string } | { ok: true; payload: EventInput };

type PublishReview = {
  signature: string;
  payload: EventInput;
  hits: ExampleHit[];
  datesSuggested: boolean;
};

// Whole-field match only. Folding trim, case, and accents must not treat a
// longer sentence that merely discusses an example as the placeholder.
const foldExampleText = (value: string): string =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const matchesKnownExample = (value: string, example: string): boolean => {
  const folded = foldExampleText(value);
  return folded.length > 0 && folded === foldExampleText(example);
};

export const CreateEventForm: React.FC<CreateEventFormProps> = ({
  onSubmit,
  onCancel,
  isLoading,
  initial = null,
  submitLabel = 'Crear y Obtener Enlace de Invitación',
}) => {
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

  const collectExampleHits = (): ExampleHit[] => {
    const values = exampleValues();
    return EXAMPLE_FIELDS.filter((item) => {
      if (item.field === 'title') {
        return TITLE_EXAMPLE_PHRASES.some((phrase) => matchesKnownExample(values.title, phrase));
      }
      return matchesKnownExample(values[item.field], item.example);
    }).map((item) => ({
      field: item.field,
      label: item.label,
      raw: values[item.field],
      inputId: item.inputId,
    }));
  };

  const reviewSignature = (): string =>
    JSON.stringify({
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

  const buildSubmission = (): Submission => {
    if (!title.trim()) {
      return { ok: false, message: 'Escribe un titulo.' };
    }
    if (!location.trim()) {
      return { ok: false, message: 'Escribe el lugar.' };
    }
    const startMs = new Date(startsAt).getTime();
    const endMs = new Date(endsAt).getTime();
    if (!Number.isFinite(startMs) || startMs <= Date.now()) {
      return { ok: false, message: 'El inicio debe ser en el futuro.' };
    }
    if (!Number.isFinite(endMs) || endMs <= startMs) {
      return { ok: false, message: 'La hora de fin debe ser posterior al inicio.' };
    }
    const priceNum = parseFloat(priceDollars);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      return { ok: false, message: 'La cuota por persona debe ser mayor a 0.' };
    }
    const priceCents = Math.round(priceNum * 100);
    const parsedCapacity = Number.parseInt(capacity, 10);
    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1) {
      return { ok: false, message: 'Indica un cupo mayor a 0.' };
    }

    let goalCents: number | null = null;
    if (goalDollars.trim()) {
      const g = parseFloat(goalDollars);
      if (!Number.isFinite(g) || g <= 0) {
        return { ok: false, message: 'La meta debe ser un monto mayor a 0.' };
      }
      goalCents = Math.round(g * 100);
    }

    let minimumCents: number | null = null;
    if (minimumDollars.trim()) {
      const m = parseFloat(minimumDollars);
      if (!Number.isFinite(m) || m <= 0) {
        return { ok: false, message: 'El minimo debe ser un monto mayor a 0.' };
      }
      minimumCents = Math.round(m * 100);
    }
    if (minimumCents !== null && goalCents !== null && minimumCents > goalCents) {
      return { ok: false, message: 'El minimo no puede superar la meta.' };
    }
    const ceiling = priceCents * parsedCapacity;
    if ((goalCents !== null && ceiling < goalCents) || (minimumCents !== null && ceiling < minimumCents)) {
      return { ok: false, message: 'La cuota por el cupo debe cubrir la meta y el minimo.' };
    }

    const deadlineFilled = deadlineLocal.trim().length > 0;
    if (deadlineFilled) {
      const deadlineMs = new Date(deadlineLocal).getTime();
      if (!Number.isFinite(deadlineMs)) {
        return { ok: false, message: 'La fecha limite de aportes no es valida.' };
      }
      if (deadlineMs <= Date.now()) {
        return { ok: false, message: 'La fecha limite debe ser posterior a ahora y no posterior al inicio.' };
      }
      if (deadlineMs > startMs) {
        return { ok: false, message: 'La fecha limite debe ser posterior a ahora y no posterior al inicio.' };
      }
      if (minimumCents === null) {
        return { ok: false, message: 'Sin minimo no hay fecha limite de financiamiento.' };
      }
      if (isLegacy) {
        return { ok: false, message: 'Un evento anterior conserva la exencion y no admite fecha limite.' };
      }
    } else if (isEdit && deadlineTouched && minimumCents !== null) {
      return {
        ok: false,
        message: 'Un minimo requiere fecha limite. Vaciar el campo al editar no usa la hora de inicio por defecto.',
      };
    }

    const includes = includesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: EventInput = {
      title: title.trim(),
      template,
      meal,
      organizerName: organizerName.trim() ? organizerName.trim() : null,
      theme,
      description: description.trim(),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      location: location.trim(),
      includes,
      priceCents,
      capacity: parsedCapacity,
      goalCents,
      minimumCents,
      agenda: agenda
        .filter((a) => a.title.trim() && a.time.trim())
        .map((a) => {
          const item: AgendaItem = {
            time: a.time.trim(),
            title: a.title.trim(),
          };
          if (a.speaker && a.speaker.trim()) {
            item.speaker = a.speaker.trim().slice(0, 80);
          }
          return item;
        }),
    };
    if (accessTouched) payload.accessCode = accessCode.trim() ? accessCode.trim() : null;
    if (isEdit) {
      if (deadlineTouched) {
        payload.fundingDeadlineAt = deadlineFilled ? new Date(deadlineLocal).toISOString() : null;
      }
    } else if (deadlineFilled) {
      payload.fundingDeadlineAt = new Date(deadlineLocal).toISOString();
    }

    return { ok: true, payload };
  };

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
      setValidationError(err.message || 'Error al crear la invitación');
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

    const hits = collectExampleHits();
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
    if (collectExampleHits().length === 0 || reviewSignature() !== signature) {
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

  return (
    <form noValidate onSubmit={handleSubmit} className="event-form" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', ...themeCssVars(selectedTheme) }}>
      {/* Template Selection Tabs */}
      <div>
        <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
          Tipo de invitación
        </label>
        <div
          className="template-picker"
          role="radiogroup"
          aria-label="Selecciona una de las 4 plantillas"
        >
          {(['comida', 'casa', 'viaje', 'evento'] as TemplateKind[]).map((t) => {
            const isSelected = template === t;
            const labels: Record<TemplateKind, string> = {
              comida: '🥘 Comida',
              casa: '🏠 En Casa',
              viaje: '🚐 Viaje',
              evento: '🎉 Evento',
            };
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
                <span>{labels[t]}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-ink-muted)', fontWeight: 500 }}>
                  Tipo
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SVG Preview Card */}
      <div className="theme-scope" data-theme={selectedTheme.key} style={{ ...themeCssVars(selectedTheme), borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
        <TemplateCover template={template} height="130px" accent={selectedTheme.accent} />
        <p className="theme-phrase" style={{ margin: '0.75rem 1rem' }}>{selectedTheme.phrase}</p>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="event-theme">Tema</label>
        <div id="event-theme" className="theme-picker" role="radiogroup" aria-label="Tema de la invitación">
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
              {item.label}
            </button>
          ))}
        </div>
        {themeHint && themeHint.key !== theme ? (
          <p className="form-label-desc">
            Sugerencia: {themeHint.label}. El tema actual se mantiene hasta que la uses.
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginLeft: '0.5rem', padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}
              onClick={() => {
                setThemeTouched(true);
                setTheme(themeHint.key);
              }}
            >
              Usar {themeHint.label}
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
          Título del Evento *
        </label>
        <input
          id="event-title"
          className="form-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder={TITLE_PLACEHOLDER}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="event-organizer">
          Nombre de quien organiza (opcional)
        </label>
        <input
          id="event-organizer"
          className="form-input"
          value={organizerName}
          maxLength={100}
          onChange={(e) => setOrganizerName(e.target.value)}
          placeholder="Como quieres aparecer"
          autoComplete="off"
        />
        <span className="form-label-desc">Nombre público de la invitación. No hace falta un correo.</span>
      </div>

      <div className="event-form-grid-2">
        {template === 'comida' ? (
        <div className="form-group">
          <label className="form-label" htmlFor="event-meal">
            Tipo de Comida
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
            <option value="desayuno">Desayuno</option>
            <option value="almuerzo">Almuerzo</option>
            <option value="cena">Cena</option>
          </select>
        </div>
        ) : null}

        <div className="form-group">
          <label className="form-label" htmlFor="event-date">
            Fecha y Hora *
          </label>
          <input
            id="event-date"
            type="datetime-local"
            className="form-input"
            value={startsAt}
            onChange={(e) => handleStartChange(e.target.value)}
            required
          />
          {!isEdit && !startTouched ? (
            <span className="form-label-desc">Sugerencia. Confírmala en el resumen antes de publicar.</span>
          ) : null}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="event-end">
          Hora de fin *
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
        <span className="form-label-desc">Incluye la fecha. Si termina otro día, elige esa fecha.</span>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="event-location">
          Lugar o Dirección *
        </label>
        <input
          id="event-location"
          className="form-input"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
          placeholder="Lugar o direccion"
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="event-desc">
          Descripción para los invitados
        </label>
        <textarea
          id="event-desc"
          className="form-textarea"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Que van a hacer"
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
          Cuota y Metas Financieras (USD)
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="event-price">
              Cuota por persona *
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
            <span className="form-label-desc">Precio fijo individual</span>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="event-minimum">
              Mínimo requerido
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
            <span className="form-label-desc">Para confirmar la invitación</span>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="event-goal">
              Meta ideal
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
            <span className="form-label-desc">Objetivo de recaudación</span>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="event-capacity">
              Capacidad máxima *
            </label>
            <input
              id="event-capacity"
              type="number"
              min="1"
              max="1000"
              className="form-input"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="Cupo"
              required
            />
            <span className="form-label-desc">Cupos disponibles</span>
          </div>
        </div>

        <div className="form-group" style={{ margin: '0.85rem 0 0 0' }}>
          <label className="form-label" htmlFor="event-funding-deadline">
            Fecha límite de aportes (opcional)
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
            {isEdit
              ? 'Si no la modificas, se conserva el valor actual, incluida una fecha vacía de eventos anteriores. Vaciarla con un mínimo no usa la hora de inicio por defecto.'
              : 'Si indicas un mínimo y omites esta fecha, el servidor usa la hora de inicio.'}
          </span>
        </div>
        {isLegacy ? (
          <p className="funding-field-note" role="note">
            Este evento es anterior al financiamiento automático. Conserva su exención: no hay fecha
            límite automática y no se activa editando el título o el mínimo.
          </p>
        ) : initialDeadlineAbsent ? (
          <p className="funding-field-note" role="note">
            Sin fecha límite automática. Vacío y sin cambios conserva el valor actual. No se enviará
            un valor por defecto.
          </p>
        ) : null}
        {isEdit ? (
          <p className="funding-field-note" role="note">
            Si ya existe cualquier orden, el servidor rechaza cambios del mínimo o de la fecha
            límite. Esta pantalla no sabe si hay órdenes; el mensaje de rechazo se muestra aquí. El
            precio no se congela solo por tener recaudación.
          </p>
        ) : null}
      </div>

      {/* What's Included */}
      <div className="form-group">
        <label className="form-label" htmlFor="event-includes">
          ¿Qué incluye la cuota? (Separados por coma)
        </label>
        <input
          id="event-includes"
          className="form-input"
          value={includesText}
          onChange={(e) => setIncludesText(e.target.value)}
          placeholder="Separa con comas"
        />
      </div>

      {/* Agenda */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label className="form-label" style={{ marginBottom: 0 }}>
            Programa o Agenda
          </label>
          <button
            type="button"
            onClick={handleAddAgendaItem}
            className="btn btn-secondary"
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
          >
            + Añadir horario
          </button>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="event-access">
            Codigo de acceso (opcional)
          </label>
          <input
            id="event-access"
            className="form-input"
            value={accessCode}
            onChange={(e) => {
              setAccessTouched(true);
              setAccessCode(e.target.value);
            }}
            placeholder={initial ? 'Vacio quita el codigo' : 'Solo si la invitación es privada'}
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
                placeholder="14:00"
                aria-label={`Hora actividad ${idx + 1}`}
              />
              <input
                style={{ flex: '1 1 180px' }}
                className="form-input"
                value={item.title}
                onChange={(e) => handleUpdateAgendaItem(idx, 'title', e.target.value)}
                placeholder="Descripción de la actividad"
                aria-label={`Título actividad ${idx + 1}`}
              />
              <input
                style={{ flex: '1 1 140px' }}
                className="form-input"
                value={item.speaker || ''}
                maxLength={80}
                onChange={(e) => handleUpdateAgendaItem(idx, 'speaker', e.target.value)}
                placeholder="Expositor (opcional)"
                aria-label={`Expositor actividad ${idx + 1}`}
              />
              <button
                type="button"
                onClick={() => handleRemoveAgendaItem(idx)}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.6rem', color: 'var(--color-coral)' }}
                aria-label="Eliminar punto de agenda"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {reviewedPayload ? (
        <section className="publish-review" aria-label="Resumen de la invitación" style={themeCssVars(selectedTheme)}>
          <h3 style={{ margin: 0 }}>Revisar invitación</h3>
          <p className="theme-phrase" style={{ fontSize: '1.15rem' }}>{selectedTheme.phrase}</p>
          {activePublish?.datesSuggested ? (
            <p>Estas fechas son una sugerencia. Publicar la invitación las confirma.</p>
          ) : (
            <p>Estas son las fechas que quedan en la invitación.</p>
          )}
          <dl>
            <dt>Tipo</dt>
            <dd>{TEMPLATE_INVITE_COPY[reviewedPayload.template].welcome}</dd>
            <dt>Título</dt>
            <dd>{reviewedPayload.title}</dd>
            <dt>Quién organiza</dt>
            <dd>{organizerLine(reviewedPayload.organizerName) ?? 'Sin nombre público'}</dd>
            <dt>Cuándo</dt>
            <dd>{formatEventRange(reviewedPayload.startsAt, reviewedPayload.endsAt)}</dd>
            <dt>Lugar</dt>
            <dd>{reviewedPayload.location}</dd>
            <dt>Cuota por persona</dt>
            <dd>{usd(reviewedPayload.priceCents)}</dd>
            {reviewedPayload.template === 'comida' ? (
              <>
                <dt>Tipo de comida</dt>
                <dd style={{ textTransform: 'capitalize' }}>{reviewedPayload.meal}</dd>
              </>
            ) : null}
          </dl>
          {activePublish && activePublish.hits.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPublishReview(null)} disabled={isLoading}>
                Seguir editando
              </button>
              <button type="button" className="btn btn-primary btn-theme-primary" onClick={() => void handlePublishReviewed()} disabled={isLoading}>
                Publicar invitación
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
            Algunos campos tienen el texto de ejemplo. Revisa esos campos o publica estos valores a propósito.
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
              Revisar campos
            </button>
            <button type="button" className="btn btn-primary" onClick={handlePublishExamples} disabled={isLoading}>
              Publicar estos valores
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
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={isLoading || Boolean(activePublish)}>
          {isLoading ? 'Guardando...' : isEdit ? submitLabel : 'Revisar invitación'}
        </button>
      </div>
    </form>
  );
};

import React, { useState } from 'react';
import type { EventInput, FiestaEvent, TemplateKind, AgendaItem } from '../../types';
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
  const [startsAt, setStartsAt] = useState(() => (initial ? toLocalInput(new Date(initial.startsAt)) : defaultStart()));
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
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSelectTemplate = (t: TemplateKind) => {
    setTemplate(t);
  };

  const handleStartChange = (value: string) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!title.trim()) {
      setValidationError('Escribe un titulo.');
      return;
    }
    if (!location.trim()) {
      setValidationError('Escribe el lugar.');
      return;
    }
    const startMs = new Date(startsAt).getTime();
    const endMs = new Date(endsAt).getTime();
    if (!Number.isFinite(startMs) || startMs <= Date.now() - 60_000) {
      setValidationError('El inicio debe ser en el futuro.');
      return;
    }
    if (!Number.isFinite(endMs) || endMs <= startMs) {
      setValidationError('La hora de fin debe ser posterior al inicio.');
      return;
    }
    const priceNum = parseFloat(priceDollars);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setValidationError('La cuota por persona debe ser mayor a 0.');
      return;
    }
    const priceCents = Math.round(priceNum * 100);
    const parsedCapacity = Number.parseInt(capacity, 10);
    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1) {
      setValidationError('Indica un cupo mayor a 0.');
      return;
    }

    let goalCents: number | null = null;
    if (goalDollars.trim()) {
      const g = parseFloat(goalDollars);
      if (!Number.isFinite(g) || g <= 0) {
        setValidationError('La meta debe ser un monto mayor a 0.');
        return;
      }
      goalCents = Math.round(g * 100);
    }

    let minimumCents: number | null = null;
    if (minimumDollars.trim()) {
      const m = parseFloat(minimumDollars);
      if (!Number.isFinite(m) || m <= 0) {
        setValidationError('El minimo debe ser un monto mayor a 0.');
        return;
      }
      minimumCents = Math.round(m * 100);
    }
    if (minimumCents !== null && goalCents !== null && minimumCents > goalCents) {
      setValidationError('El minimo no puede superar la meta.');
      return;
    }
    const ceiling = priceCents * parsedCapacity;
    if ((goalCents !== null && ceiling < goalCents) || (minimumCents !== null && ceiling < minimumCents)) {
      setValidationError('La cuota por el cupo debe cubrir la meta y el minimo.');
      return;
    }

    const includes = includesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: EventInput = {
      title: title.trim(),
      template,
      meal,
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

    try {
      await onSubmit(payload);
    } catch (err: any) {
      setValidationError(err.message || 'Error al crear la fiesta');
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Template Selection Tabs */}
      <div>
        <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
          Plantilla de Fiesta (4 Opciones)
        </label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
            gap: '0.65rem',
          }}
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
      <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
        <TemplateCover template={template} height="130px" />
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
          placeholder="Nombre de la fiesta"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
            <span className="form-label-desc">Para confirmar fiesta</span>
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
            placeholder={initial ? 'Vacio quita el codigo' : 'Solo si la fiesta es privada'}
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
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? 'Guardando...' : submitLabel}
        </button>
      </div>
    </form>
  );
};

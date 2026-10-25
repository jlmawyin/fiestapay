import React, { useState } from 'react';
import type { EventInput, TemplateKind, AgendaItem } from '../../types';
import { TemplateCover } from '../illustrations/TemplateCover';

interface CreateEventFormProps {
  onSubmit: (input: EventInput) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

const TEMPLATE_PRESETS: Record<
  TemplateKind,
  {
    title: string;
    description: string;
    meal: 'desayuno' | 'almuerzo' | 'cena';
    location: string;
    priceDollars: string;
    goalDollars: string;
    minimumDollars: string;
    capacity: string;
    includes: string;
    agenda: AgendaItem[];
  }
> = {
  comida: {
    title: 'Gran Asado entre Amigos',
    description: 'Nos juntamos a compartir carnes a la parrilla, ensaladas frescas, bebidas y buena sobremesa.',
    meal: 'almuerzo',
    location: 'Quinta Los Laureles, Jardín Principal',
    priceDollars: '25.00',
    goalDollars: '250.00',
    minimumDollars: '125.00',
    capacity: '15',
    includes: 'Cortes premium, guarniciones, carbón, barra de bebidas y postre casero',
    agenda: [
      { time: '13:00', title: 'Llegada y aperitivos de bienvenida' },
      { time: '14:30', title: 'Servicio de asado y almuerzo comunitario' },
      { time: '16:30', title: 'Sobremesa, café y juegos de mesa' },
    ],
  },
  casa: {
    title: 'Noche de Pizzas Caseras & Vinilos',
    description: 'Armamos pizzas artesanales al horno, abrimos buena música en vinilo y compartimos cócteles.',
    meal: 'cena',
    location: 'Casa de Nico — Sala y Terraza',
    priceDollars: '18.00',
    goalDollars: '180.00',
    minimumDollars: '90.00',
    capacity: '12',
    includes: 'Comida e ingredientes gourmet para pizzas, cervezas artesanales, cócteles y servicio de limpieza',
    agenda: [
      { time: '20:00', title: 'Recepción y sesión de vinilos' },
      { time: '21:00', title: 'Taller de armado y horneado de pizzas' },
      { time: '23:00', title: 'Karaoke y brindis' },
    ],
  },
  viaje: {
    title: 'Escapada de Fin de Semana a la Montaña',
    description: 'Viaje en caravana hacia las cabañas del bosque con caminata, fogata nocturna y asado.',
    meal: 'almuerzo',
    location: 'Cabañas El Refugio, Valle Andino',
    priceDollars: '65.00',
    goalDollars: '520.00',
    minimumDollars: '390.00',
    capacity: '10',
    includes: 'Hospedaje en cabaña rústica, transporte en caravana, compras comunitarias de comida, leña y entradas',
    agenda: [
      { time: '08:00', title: 'Punto de encuentro y salida en ruta' },
      { time: '11:30', title: 'Check-in en cabañas y caminata a la cascada' },
      { time: '19:30', title: 'Fogata nocturna y cena campestre' },
    ],
  },
  evento: {
    title: 'Fiesta de Celebración & Cóctel Festivo',
    description: 'Fiesta con música en vivo, barra libre y aperitivos para celebrar por todo lo alto.',
    meal: 'cena',
    location: 'Salón Terraza Central',
    priceDollars: '40.00',
    goalDollars: '800.00',
    minimumDollars: '400.00',
    capacity: '25',
    includes: 'Acceso exclusivo al salón, catering de bocadillos finos, barra libre 4 horas y DJ',
    agenda: [
      { time: '21:00', title: 'Apertura de puertas y alfombra de fotos' },
      { time: '22:30', title: 'Brindis oficial de los organizadores' },
      { time: '00:00', title: 'Pista de baile y sorpresas' },
    ],
  },
};

export const CreateEventForm: React.FC<CreateEventFormProps> = ({ onSubmit, onCancel, isLoading }) => {
  const [template, setTemplate] = useState<TemplateKind>('comida');
  const [title, setTitle] = useState(TEMPLATE_PRESETS.comida.title);
  const [description, setDescription] = useState(TEMPLATE_PRESETS.comida.description);
  const [meal, setMeal] = useState<'desayuno' | 'almuerzo' | 'cena'>(TEMPLATE_PRESETS.comida.meal);
  const [startsAt, setStartsAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    d.setHours(14, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  });
  const [location, setLocation] = useState(TEMPLATE_PRESETS.comida.location);
  const [priceDollars, setPriceDollars] = useState(TEMPLATE_PRESETS.comida.priceDollars);
  const [capacity, setCapacity] = useState(TEMPLATE_PRESETS.comida.capacity);
  const [goalDollars, setGoalDollars] = useState(TEMPLATE_PRESETS.comida.goalDollars);
  const [minimumDollars, setMinimumDollars] = useState(TEMPLATE_PRESETS.comida.minimumDollars);
  const [includesText, setIncludesText] = useState(TEMPLATE_PRESETS.comida.includes);
  const [agenda, setAgenda] = useState<AgendaItem[]>(TEMPLATE_PRESETS.comida.agenda);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSelectTemplate = (t: TemplateKind) => {
    setTemplate(t);
    const preset = TEMPLATE_PRESETS[t];
    setTitle(preset.title);
    setDescription(preset.description);
    setMeal(preset.meal);
    setLocation(preset.location);
    setPriceDollars(preset.priceDollars);
    setGoalDollars(preset.goalDollars);
    setMinimumDollars(preset.minimumDollars);
    setCapacity(preset.capacity);
    setIncludesText(preset.includes);
    setAgenda(preset.agenda);
  };

  const handleAddAgendaItem = () => {
    setAgenda([...agenda, { time: '18:00', title: 'Nueva actividad' }]);
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

    const priceNum = parseFloat(priceDollars);
    if (isNaN(priceNum) || priceNum <= 0) {
      setValidationError('Por favor ingresa un precio por persona válido mayor a 0.');
      return;
    }
    const priceCents = Math.round(priceNum * 100);

    let goalCents: number | null = null;
    if (goalDollars.trim()) {
      const g = parseFloat(goalDollars);
      if (!isNaN(g) && g > 0) goalCents = Math.round(g * 100);
    }

    let minimumCents: number | null = null;
    if (minimumDollars.trim()) {
      const m = parseFloat(minimumDollars);
      if (!isNaN(m) && m > 0) minimumCents = Math.round(m * 100);
    }

    let parsedCapacity: number | null = null;
    if (capacity.trim()) {
      const cap = parseInt(capacity, 10);
      if (!isNaN(cap) && cap > 0) parsedCapacity = cap;
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
      location: location.trim(),
      includes,
      priceCents,
      capacity: parsedCapacity,
      goalCents,
      minimumCents,
      agenda: agenda
        .filter((a) => a.title.trim())
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

    try {
      await onSubmit(payload);
    } catch (err: any) {
      setValidationError(err.message || 'Error al crear la fiesta');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
                  Preconfigurado
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

      {validationError && (
        <div
          style={{
            backgroundColor: 'var(--color-coral-tint)',
            color: 'var(--color-coral)',
            border: '1px solid var(--color-coral)',
            padding: '0.75rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.875rem',
          }}
          role="alert"
        >
          {validationError}
        </div>
      )}

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
          placeholder="Ej. Asado dominical de bienvenida"
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
            onChange={(e) => setMeal(e.target.value as any)}
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
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </div>
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
          placeholder="Ej. Terraza de Nico o Parque Central"
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
          placeholder="Cuéntales qué harán en la fiesta..."
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
              Capacidad máx.
            </label>
            <input
              id="event-capacity"
              type="number"
              min="1"
              max="100"
              className="form-input"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="Ej. 20"
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
          placeholder="Carne, carbón, bebidas, postre..."
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
          {isLoading ? 'Creando fiesta...' : 'Crear y Obtener Enlace de Invitación'}
        </button>
      </div>
    </form>
  );
};

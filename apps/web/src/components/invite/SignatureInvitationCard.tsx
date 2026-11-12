import React from 'react';
import {
  formatMoney,
  mealLabel,
  type Locale,
  type MealKind,
  type TemplateKind,
  type ThemeKey,
} from '@fiestapay/shared';
import {
  INVITATION_STYLES,
  polaroidsForEvent,
  resolveInvitationStyle,
  type InvitationCardStyle,
  type PolaroidMemory,
} from '../../lib/invitation-blueprints';
import type { AgendaItem } from '../../types';

export interface SignatureInvitationCardProps {
  template: TemplateKind;
  theme: ThemeKey;
  title: string;
  organizerName: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  capacity: number;
  includes: string[];
  meal?: MealKind;
  foodStyle?: string;
  agenda?: AgendaItem[];
  deadlineLocal?: string;
  locale: Locale;
  onSelectStyle?: (style: InvitationCardStyle) => void;
  compact?: boolean;
}

function formatCardDate(isoOrLocal: string, locale: Locale): string {
  const ms = new Date(isoOrLocal).getTime();
  if (!Number.isFinite(ms)) {
    return locale === 'en' ? 'Date to be defined' : 'Fecha por definir';
  }
  const d = new Date(ms);
  return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-EC', {
    timeZone: 'America/Guayaquil',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatCardTimeRange(startsAt: string, endsAt: string, locale: Locale): string {
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  if (!Number.isFinite(startMs)) {
    return locale === 'en' ? 'Time to be defined' : 'Hora por definir';
  }
  const fmt = (ms: number) =>
    new Date(ms).toLocaleTimeString(locale === 'en' ? 'en-US' : 'es-EC', {
      timeZone: 'America/Guayaquil',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  if (!Number.isFinite(endMs) || endMs <= startMs) {
    return fmt(startMs);
  }
  return locale === 'en' ? `${fmt(startMs)} to ${fmt(endMs)}` : `${fmt(startMs)} a ${fmt(endMs)}`;
}

export const PolaroidStrip: React.FC<{
  memories: PolaroidMemory[];
  position: 'top' | 'bottom';
}> = ({ memories, position }) => {
  const items = position === 'top' ? memories.slice(0, 2) : memories.slice(2, 3);
  return (
    <div className={`sig-invite__polaroids sig-invite__polaroids--${position}`} aria-hidden="true">
      {items.map((item, idx) => (
        <div
          key={`${item.caption}-${idx}`}
          className="sig-invite__polaroid"
          style={{ transform: `rotate(${item.tiltDeg}deg)` }}
        >
          <div className={`sig-invite__polaroid-photo sig-invite__polaroid-photo--${item.motif}`}>
            {item.motif === 'group' ? (
              <svg viewBox="0 0 120 74" className="sig-invite__polaroid-svg">
                <rect width="120" height="74" fill="#2c3e55" />
                <circle cx="30" cy="28" r="9" fill="#e6cfa8" />
                <circle cx="60" cy="25" r="10" fill="#f0d9b5" />
                <circle cx="90" cy="28" r="9" fill="#dfbfa0" />
                <path d="M14 68 C14 46, 46 46, 46 68 Z" fill="#d4af37" opacity="0.85" />
                <path d="M42 68 C42 42, 78 42, 78 68 Z" fill="#f8fafc" opacity="0.9" />
                <path d="M74 68 C74 46, 106 46, 106 68 Z" fill="#d4af37" opacity="0.85" />
              </svg>
            ) : item.motif === 'keepsake' ? (
              <svg viewBox="0 0 120 74" className="sig-invite__polaroid-svg">
                <rect width="120" height="74" fill="#f4efe6" />
                <rect x="38" y="14" width="38" height="46" rx="5" fill="#1e293b" />
                <rect x="43" y="19" width="28" height="36" rx="3" fill="#b91c1c" />
                <path d="M76 24 C88 24, 88 48, 76 48" stroke="#1e293b" strokeWidth="5" fill="none" />
                <circle cx="57" cy="37" r="8" fill="#fbbf24" opacity="0.9" />
              </svg>
            ) : (
              <svg viewBox="0 0 120 74" className="sig-invite__polaroid-svg">
                <rect width="120" height="74" fill="#1e3a5f" />
                <circle cx="38" cy="30" r="9" fill="#fde68a" />
                <circle cx="62" cy="28" r="9" fill="#fcd34d" />
                <circle cx="84" cy="31" r="9" fill="#fde68a" />
                <path d="M22 68 C22 47, 54 47, 54 68 Z" fill="#38bdf8" opacity="0.85" />
                <path d="M46 68 C46 45, 78 45, 78 68 Z" fill="#f59e0b" opacity="0.9" />
                <path d="M68 68 C68 47, 100 47, 100 68 Z" fill="#e2e8f0" opacity="0.85" />
              </svg>
            )}
            <span className="sig-invite__polaroid-tag">{item.yearTag}</span>
          </div>
          <span className="sig-invite__polaroid-caption">{item.caption}</span>
        </div>
      ))}
    </div>
  );
};

export const CrestMedallion: React.FC<{
  style: InvitationCardStyle;
  organizerName?: string;
  locale: Locale;
}> = ({ style, locale }) => {
  const ringLabel =
    style === 'reencuentro'
      ? locale === 'en'
        ? 'ALUMNI & FRIENDS REUNION · EDITION'
        : 'REENCUENTRO DE AMISTAD · EDICIÓN ESPECIAL'
      : style === 'elegante'
        ? locale === 'en'
          ? 'GALA INVITATION · SPECIAL GATHERING'
          : 'INVITACIÓN DE GALA · ENCUENTRO ESPECIAL'
        : style === 'retro'
          ? locale === 'en'
            ? 'CLASSIC EDITION · HERITAGE SEAL'
            : 'EDICIÓN CLÁSICA · SELLO CONMEMORATIVO'
          : locale === 'en'
            ? 'FESTIVE CELEBRATION · FIESTAPAY'
            : 'CELEBRACIÓN ESPECIAL · FIESTAPAY';
  return (
    <div className={`sig-invite__crest sig-invite__crest--${style}`} aria-hidden="true">
      <div className="sig-invite__crest-inner">
        <svg viewBox="0 0 64 64" className="sig-invite__crest-svg">
          <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2" />
          <circle cx="32" cy="32" r="23" fill="none" stroke="currentColor" strokeWidth="1.2" />
          {style === 'reencuentro' ? (
            <>
              <path d="M20 42 L32 18 L44 42 Z" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="32" cy="28" r="4" fill="currentColor" />
            </>
          ) : style === 'elegante' || style === 'retro' ? (
            <>
              <circle cx="23" cy="26" r="4" fill="currentColor" />
              <circle cx="32" cy="24" r="4.5" fill="currentColor" />
              <circle cx="41" cy="26" r="4" fill="currentColor" />
              <path d="M17 42 C17 34, 29 34, 29 42" stroke="currentColor" strokeWidth="2.2" fill="none" />
              <path d="M25 42 C25 32, 39 32, 39 42" stroke="currentColor" strokeWidth="2.4" fill="none" />
              <path d="M35 42 C35 34, 47 34, 47 42" stroke="currentColor" strokeWidth="2.2" fill="none" />
            </>
          ) : (
            <>
              <path d="M22 40 L28 22 L38 36 L44 24 L42 40 Z" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="32" cy="20" r="3" fill="currentColor" />
            </>
          )}
        </svg>
      </div>
      <span className="sig-invite__crest-caption">{ringLabel}</span>
    </div>
  );
};

export const SignatureInvitationCard: React.FC<SignatureInvitationCardProps> = ({
  template,
  theme,
  title,
  organizerName,
  description,
  location,
  startsAt,
  endsAt,
  priceCents,
  capacity,
  includes,
  meal,
  foodStyle,
  agenda,
  deadlineLocal,
  locale,
  onSelectStyle,
  compact = false,
}) => {
  const activeStyle = resolveInvitationStyle(template, theme);
  const displayTitle =
    title.trim() ||
    (locale === 'en'
      ? 'Special Gathering · Your Invitation'
      : 'El reencuentro más esperado · Tu Invitación');
  const displayOrganizer =
    organizerName.trim() ||
    (locale === 'en' ? 'Organizing Committee' : 'Comité Organizador');
  const displayLocation =
    location.trim() ||
    (locale === 'en' ? 'Venue to be confirmed' : 'Lugar por confirmar');
  const displayDate = formatCardDate(startsAt, locale);
  const displayTime = formatCardTimeRange(startsAt, endsAt, locale);
  const displayShare =
    Number.isFinite(priceCents) && priceCents > 0
      ? locale === 'en'
        ? `${formatMoney(priceCents, locale)} per person`
        : `${formatMoney(priceCents, locale)} por persona`
      : locale === 'en'
        ? 'To be defined'
        : 'Por definir';

  const displayDescription = description.trim();

  const salutation =
    activeStyle === 'reencuentro'
      ? locale === 'en'
        ? 'Dear classmates and friends:'
        : 'Estimados compañeros y amigos:'
      : activeStyle === 'elegante'
        ? locale === 'en'
          ? 'Dear colleagues and friends:'
          : 'Estimados compañeros:'
        : activeStyle === 'retro'
          ? locale === 'en'
            ? 'Lifelong friends and companions:'
            : 'Compañeros y amigos de toda la vida:'
          : locale === 'en'
            ? 'You are cordially invited:'
            : '¡Estás cordialmente invitado!';

  const closingLine =
    activeStyle === 'reencuentro'
      ? locale === 'en'
        ? 'Reserve your spot early!'
        : '¡Reserva tu cupo a tiempo · La amistad sigue intacta!'
      : activeStyle === 'elegante' || activeStyle === 'retro'
        ? locale === 'en'
          ? 'Do not miss it, lovely surprises await! We look forward to seeing you.'
          : '¡No falten, habrá bonitas sorpresas! Los esperamos con mucho cariño.'
        : locale === 'en'
          ? 'Confirm your attendance and lock in your share with PayPal!'
          : '¡Confirma tu asistencia y asegura tu parte con PayPal!';

  const memories = polaroidsForEvent(displayTitle, displayOrganizer, locale);
  const validAgenda = (agenda ?? []).filter((item) => item.time.trim() && item.title.trim());

  return (
    <div className="sig-invite-wrapper" data-testid="signature-invitation-card" data-card-style={activeStyle}>
      {onSelectStyle ? (
        <div
          className="sig-invite-toolbar"
          role="group"
          aria-label={
            locale === 'en' ? 'Invitation card design style' : 'Estilo visual de la tarjeta de invitación'
          }
        >
          <span className="sig-invite-toolbar__label">
            {locale === 'en' ? 'Card Design:' : 'Diseño de tarjeta:'}
          </span>
          <div className="sig-invite-toolbar__pills">
            {INVITATION_STYLES.map((item) => {
              const selected = item.key === activeStyle;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`sig-invite-pill ${selected ? 'sig-invite-pill--active' : ''}`}
                  aria-pressed={selected}
                  onClick={() => onSelectStyle(item.key)}
                >
                  <span>{item.name[locale]}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <article
        className={`sig-invite-card sig-invite-card--${activeStyle} ${compact ? 'sig-invite-card--compact' : ''}`}
        aria-label={
          locale === 'en'
            ? `Invitation preview: ${displayTitle}`
            : `Vista previa de la invitación: ${displayTitle}`
        }
      >
        {activeStyle === 'reencuentro' ? (
          <PolaroidStrip memories={memories} position="top" />
        ) : null}

        <div className="sig-invite-card__frame">
          <CrestMedallion style={activeStyle} organizerName={displayOrganizer} locale={locale} />

          <header className="sig-invite-card__header">
            <p className="sig-invite-card__kicker">{displayOrganizer}</p>
            <h4 className="sig-invite-card__title">{displayTitle}</h4>
            <p className="sig-invite-card__subtitle">
              {locale === 'en' ? 'Do not miss it!' : '¡No te lo pierdas!'}
            </p>
            <div className="sig-invite-card__divider" aria-hidden="true">
              <span className="sig-invite-card__divider-line" />
              <span className="sig-invite-card__divider-gem">
                {activeStyle === 'retro' ? '◆' : '◇'}
              </span>
              <span className="sig-invite-card__divider-line" />
            </div>
          </header>

          {!compact && displayDescription ? (
            <section className="sig-invite-card__greeting">
              <p className="sig-invite-card__salutation">{salutation}</p>
              <p className="sig-invite-card__body">{displayDescription}</p>
            </section>
          ) : null}

          <div className="sig-invite-card__grid" role="group" aria-label={locale === 'en' ? 'Key details' : 'Datos clave'}>
            <div className="sig-invite-card__cell">
              <span className="sig-invite-card__cell-label">
                {locale === 'en' ? 'VENUE' : 'UBICACIÓN'}
              </span>
              <strong className="sig-invite-card__cell-value">{displayLocation}</strong>
              {template === 'comida' && meal ? (
                <span className="sig-invite-card__cell-sub">
                  {mealLabel(meal, locale).toUpperCase()}
                  {foodStyle?.trim() ? ` · ${foodStyle.trim()}` : ''}
                </span>
              ) : null}
            </div>
            <div className="sig-invite-card__cell">
              <span className="sig-invite-card__cell-label">
                {locale === 'en' ? 'EVENT DATE' : 'FECHA DEL ENCUENTRO'}
              </span>
              <strong className="sig-invite-card__cell-value">{displayDate}</strong>
              <span className="sig-invite-card__cell-sub">
                {locale === 'en' ? 'Ecuador Time (ECT)' : 'Hora de Ecuador (ECT)'}
              </span>
            </div>
            <div className="sig-invite-card__cell">
              <span className="sig-invite-card__cell-label">
                {locale === 'en' ? 'SCHEDULE' : 'HORARIO'}
              </span>
              <strong className="sig-invite-card__cell-value">{displayTime}</strong>
              <span className="sig-invite-card__cell-sub">
                {capacity > 0
                  ? locale === 'en'
                    ? `Capacity: ${capacity} guests`
                    : `Cupo total: ${capacity} personas`
                  : locale === 'en'
                    ? 'Spots to be defined'
                    : 'Cupos por definir'}
              </span>
            </div>
            <div className="sig-invite-card__cell">
              <span className="sig-invite-card__cell-label">
                {locale === 'en' ? 'SHARE PER PERSON' : 'CUOTA POR PERSONA'}
              </span>
              <strong className="sig-invite-card__cell-value sig-invite-card__cell-value--accent">
                {displayShare}
              </strong>
              <span className="sig-invite-card__cell-sub">
                {locale === 'en' ? 'Fixed cover via PayPal' : 'Cuota fija con PayPal'}
              </span>
            </div>
          </div>

          {deadlineLocal?.trim() ? (
            <p className="sig-invite-card__deadline">
              {locale === 'en' ? 'Payment deadline: ' : 'Plazo de pago: '}
              <strong>{formatCardDate(deadlineLocal, locale)} · {formatCardTimeRange(deadlineLocal, '', locale)}</strong>
            </p>
          ) : null}

          <div className="sig-invite-card__share-box">
            <p className="sig-invite-card__share-title">
              {locale === 'en' ? 'What Your Share Covers & PayPal' : 'Lo que incluye tu cuota y pago con PayPal'}
            </p>
            {includes.length > 0 ? (
              <ul className="sig-invite-card__includes">
                {includes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {validAgenda.length > 0 ? (
              <div className="sig-invite-card__agenda">
                {validAgenda.map((item, idx) => (
                  <span key={`${item.time}-${idx}`} className="sig-invite-card__agenda-chip">
                    <strong>{item.time}</strong> · {item.title}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="sig-invite-card__paypal-row">
              <span>{locale === 'en' ? 'Collection method' : 'Recaudación oficial'}</span>
              <strong>PayPal · {displayShare}</strong>
            </div>
          </div>

          <footer className="sig-invite-card__footer">
            <p className="sig-invite-card__closing">{closingLine}</p>
            <div className="sig-invite-card__signature">
              <span className="sig-invite-card__signature-line" />
              <span>{displayOrganizer}</span>
              <span className="sig-invite-card__signature-line" />
            </div>
          </footer>
        </div>

        {activeStyle === 'reencuentro' ? (
          <PolaroidStrip memories={memories} position="bottom" />
        ) : null}
      </article>
    </div>
  );
};

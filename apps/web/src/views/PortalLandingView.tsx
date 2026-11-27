/**
 * Portada C2 de somospanas.com: secciones ordenadas por `contenido/paginas.json` (SP-6).
 * Depende de `contenido/portada.json`, `contenido/tutorial.json`, `contenido/preguntas.json`,
 * tokens en `estilos/tokens.css` y listado `GET /api/portal/events`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import '../../../../estilos/tokens.css';
import '../styles/portal-landing.css';
import portada from '../../../../contenido/portada.json';
import paginas from '../../../../contenido/paginas.json';
import tutorial from '../../../../contenido/tutorial.json';
import preguntas from '../../../../contenido/preguntas.json';
import { normalizeSiteSlugInput, validateSiteSlug } from '@fiestapay/shared';
import { NapsterAvatar } from '../components/avatar/NapsterAvatar';
import { legacyCreateUrl } from '../lib/app-host';
import { useI18n, useMessages } from '../i18n/I18nContext';
import { avatarCatalog } from '../i18n/messages/avatar';
import { LanguageSelector } from '../i18n/LanguageSelector';
import { ApiError, api, type PortalListedEvent, type CreateSiteResult } from '../api/client';

type LocaleKey = 'es' | 'en';
type SectionId = (typeof paginas.portadaRaiz.secciones)[number]['id'];

export interface PortalLandingViewProps {
  onNavigateRegister: () => void;
  onNavigateLogin: () => void;
}

/** Anclas reales en el DOM (`portal-section-*`); no incluye ids de barra/pie como `tutorial`. */
type ScrollSectionId =
  | 'como-funciona'
  | 'eventos-publicos'
  | 'donaciones'
  | 'compositor'
  | 'hero'
  | 'preguntas';

function pick<T extends Record<LocaleKey, string>>(block: T, locale: LocaleKey): string {
  return block[locale] ?? block.es;
}

function formatEventWhen(startsAt: string, locale: LocaleKey): string {
  try {
    const date = new Date(startsAt);
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-EC', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return startsAt;
  }
}

type CreateSpaceState = 'idle' | 'loading' | 'unavailable' | 'done';

/**
 * Vista principal de la raíz: monta bloques según `paginas.json` sin copiar textos en el componente.
 */
export const PortalLandingView: React.FC<PortalLandingViewProps> = ({ onNavigateRegister, onNavigateLogin }) => {
  const { locale } = useI18n();
  const lang = (locale === 'en' ? 'en' : 'es') as LocaleKey;
  const avatarTexts = useMessages(avatarCatalog);

  const [listedEvents, setListedEvents] = useState<PortalListedEvent[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [slugDraft, setSlugDraft] = useState('');
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [createState, setCreateState] = useState<CreateSpaceState>('idle');
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<CreateSiteResult | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setEventsError(null);
    try {
      const res = await api.getPortalEvents();
      setListedEvents(res.events);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar el listado';
      setEventsError(message);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const scrollTo = useCallback((id: ScrollSectionId) => {
    try {
      document.getElementById(`portal-section-${id}`)?.scrollIntoView({ behavior: 'smooth' });
    } catch {
      /* el ancla es opcional */
    }
  }, []);

  /** SP6-D-2: los ids de barra/pie no siempre coinciden con secciones del DOM (p. ej. tutorial → pasos). */
  const handleBarLink = useCallback(
    (linkId: string) => {
      if (linkId === 'iniciar-sesion') {
        onNavigateLogin();
        return;
      }
      if (linkId === 'tutorial' || linkId === 'como-funciona') {
        scrollTo('como-funciona');
        return;
      }
      if (linkId === 'eventos-publicos' || linkId === 'donaciones') {
        scrollTo(linkId);
        return;
      }
    },
    [onNavigateLogin, scrollTo],
  );

  const handleCreateSpace = useCallback(async () => {
    const slug = normalizeSiteSlugInput(slugDraft);
    const displayName = displayNameDraft.trim() || slug;
    const validation = validateSiteSlug(slug);
    setSlugError(null);
    if (validation === 'empty') return;
    if (validation === 'invalid') {
      setSlugError(pick(portada.compositorSubdominio.errorSlugInvalido, lang));
      return;
    }
    if (validation === 'reserved') {
      setSlugError(pick(portada.compositorSubdominio.errorSlugReservado, lang));
      return;
    }
    setCreateState('loading');
    setCreateMessage(null);
    try {
      const res = await api.createSiteSpace({ slug, displayName });
      setCreateResult(res);
      setCreateState('done');
      setCreateMessage(pick(portada.compositorSubdominio.estadoListo, lang));
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 404) {
        setCreateState('unavailable');
        setCreateMessage(pick(portada.compositorSubdominio.estadoNoDisponible, lang));
        return;
      }
      const message = err instanceof Error ? err.message : pick(portada.compositorSubdominio.estadoNoDisponible, lang);
      setCreateState('idle');
      setCreateMessage(message);
    }
  }, [displayNameDraft, lang, slugDraft]);

  const sampleBadge = portada.eventosPublicos.ejemplos[0]?.badgeEjemplo ?? { es: 'Ejemplo', en: 'Sample' };

  const sectionOrder = paginas.portadaRaiz.secciones;

  const blocks = useMemo(() => {
    const map: Partial<Record<SectionId, React.ReactNode>> = {
      barra: (
        <header className="portal-bar portal-wrap" data-testid="portal-bar">
          <p className="portal-brand">{pick(portada.barra.marca, lang)}</p>
          <nav className="portal-nav" aria-label={lang === 'en' ? 'Main' : 'Principal'}>
            {portada.barra.enlaces.map((enlace) => (
              <a
                key={enlace.id}
                href={
                  enlace.id === 'iniciar-sesion'
                    ? '#portal-login'
                    : enlace.id === 'tutorial'
                      ? '#portal-section-como-funciona'
                      : `#portal-section-${enlace.id}`
                }
                data-testid={`portal-bar-link-${enlace.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  handleBarLink(enlace.id);
                }}
              >
                {pick(enlace, lang)}
              </a>
            ))}
            <button type="button" className="portal-btn" onClick={() => scrollTo('compositor')}>
              {pick(portada.barra.botonCrearEspacio, lang)}
            </button>
            <div className="portal-bar-lang" data-testid="portal-language-selector">
              <LanguageSelector />
            </div>
          </nav>
        </header>
      ),
      hero: (
        <section className="portal-hero portal-wrap" id="portal-section-hero" data-testid="portal-hero">
          <p className="portal-hero-kicker">{pick(portada.hero.ojo, lang)}</p>
          <h1>{pick(portada.hero.titulo, lang)}</h1>
          <p className="portal-hero-text">{pick(portada.hero.texto, lang)}</p>
          <div className="portal-hero-actions">
            <button
              type="button"
              className="portal-btn portal-btn-secondary"
              data-testid="portal-hero-tutorial"
              onClick={() => scrollTo('como-funciona')}
            >
              {pick(portada.hero.botonTutorial, lang)}
            </button>
            <button type="button" className="portal-btn" onClick={() => scrollTo('compositor')}>
              {pick(portada.hero.botonCrearEspacio, lang)}
            </button>
            <a className="portal-btn portal-btn-secondary" data-testid="portal-organize-meeting" href={legacyCreateUrl()}>
              {avatarTexts.organizeMeeting}
            </a>
          </div>
          <NapsterAvatar />
          <p className="portal-hero-auth">
            <button type="button" className="portal-btn-secondary portal-btn" onClick={onNavigateRegister}>
              {pick(portada.hero.enlaceRegistro, lang)}
            </button>
            <button type="button" className="portal-btn-secondary portal-btn" onClick={onNavigateLogin}>
              {pick(portada.hero.enlaceIniciarSesion, lang)}
            </button>
          </p>
          <p className="portal-muted">{pick(portada.hero.notaSubdominio, lang)}</p>
        </section>
      ),
      'foto-ambiente': (
        <section className="portal-section portal-wrap" id="portal-section-foto-ambiente">
          <div className="portal-ambient" role="img" aria-label={pick(portada.fotoAmbiente.pie, lang)}>
            {pick(portada.fotoAmbiente.pie, lang)}
          </div>
        </section>
      ),
      compositor: (
        <section className="portal-section portal-wrap" id="portal-section-compositor" data-testid="portal-compositor">
          <div className="portal-compositor">
            <label className="portal-muted" htmlFor="portal-slug">
              {pick(portada.compositorSubdominio.campoPlaceholder, lang)}
            </label>
            <div className="portal-compositor-row">
              <span>{portada.compositorSubdominio.prefijo}</span>
              <input
                id="portal-slug"
                data-testid="portal-slug-input"
                value={slugDraft}
                onChange={(e) => setSlugDraft(e.target.value)}
                placeholder={pick(portada.compositorSubdominio.campoPlaceholder, lang)}
                autoComplete="off"
              />
              <span>{portada.compositorSubdominio.sufijo}</span>
            </div>
            <label className="portal-muted" htmlFor="portal-display-name">
              {pick(portada.compositorSubdominio.campoNombreGrupo, lang)}
            </label>
            <div className="portal-compositor-row">
              <input
                id="portal-display-name"
                data-testid="portal-display-name-input"
                value={displayNameDraft}
                onChange={(e) => setDisplayNameDraft(e.target.value)}
                placeholder={pick(portada.compositorSubdominio.placeholderNombreGrupo, lang)}
                autoComplete="organization"
              />
            </div>
            {slugError ? (
              <p className="portal-status-warn" data-testid="portal-slug-error" role="alert">
                {slugError}
              </p>
            ) : null}
            <button
              type="button"
              className="portal-btn"
              data-testid="portal-create-space"
              disabled={createState === 'loading' || !slugDraft.trim()}
              onClick={() => void handleCreateSpace()}
            >
              {createState === 'loading'
                ? pick(portada.compositorSubdominio.estadoCreando, lang)
                : pick(portada.compositorSubdominio.boton, lang)}
            </button>
            {createState === 'unavailable' ? (
              <p className="portal-status-warn" data-testid="portal-create-unavailable" role="status">
                {createMessage}
              </p>
            ) : null}
            {createState === 'done' && createResult ? (
              <p data-testid="portal-create-success" role="status">
                {createMessage}{' '}
                <a href={createResult.site.url}>{createResult.site.url}</a>
              </p>
            ) : null}
            {createState === 'idle' && createMessage ? (
              <p className="portal-status-warn" role="alert">
                {createMessage}
              </p>
            ) : null}
          </div>
        </section>
      ),
      'como-funciona': (
        <section className="portal-section portal-wrap" id="portal-section-como-funciona" data-testid="portal-steps">
          <h2>{pick(tutorial.titulo, lang)}</h2>
          <p className="portal-muted">{pick(tutorial.intro, lang)}</p>
          <div className="portal-steps">
            {tutorial.pasos.map((paso) => (
              <article key={paso.numero} className="portal-step">
                <p className="portal-step-num">{paso.numero}</p>
                <h3>{pick(paso.titulo, lang)}</h3>
                <p>{pick(paso.texto, lang)}</p>
              </article>
            ))}
          </div>
        </section>
      ),
      'eventos-publicos': (
        <section className="portal-section portal-wrap" id="portal-section-eventos-publicos" data-testid="portal-events">
          <h2>
            {pick(
              portada.barra.enlaces.find((e) => e.id === 'eventos-publicos') ?? {
                es: 'Eventos públicos',
                en: 'Public events',
              },
              lang,
            )}
          </h2>
          <p className="portal-muted">{pick(portada.eventosPublicos.aviso, lang)}</p>
          <div className="portal-cards">
            {portada.eventosPublicos.ejemplos.map((ejemplo) => (
              <article key={ejemplo.id} className="portal-card" data-testid={`portal-sample-event-${ejemplo.id}`}>
                <span className="portal-badge">{pick(ejemplo.badgeEjemplo, lang)}</span>
                <span className="portal-badge portal-badge-public">{pick(ejemplo.badgeEvento, lang)}</span>
                <h3>{pick(ejemplo.titulo, lang)}</h3>
              </article>
            ))}
            {listedEvents.map((event) => (
              <article key={event.slug} className="portal-card" data-testid={`portal-listed-event-${event.slug}`}>
                {event.listingKind === 'example' ? (
                  <span className="portal-badge" data-testid={`portal-listed-badge-example-${event.slug}`}>
                    {pick(sampleBadge, lang)}
                  </span>
                ) : null}
                <span className="portal-badge portal-badge-public">
                  {lang === 'en' ? 'Public event' : 'Evento público'}
                </span>
                <h3>{event.title}</h3>
                <p className="portal-muted">{formatEventWhen(event.startsAt, lang)}</p>
                {event.location ? <p className="portal-muted">{event.location}</p> : null}
                <p className="portal-muted">
                  {event.siteName} ({event.siteSlug}.somospanas.com)
                </p>
                <a href={event.url}>{event.url}</a>
              </article>
            ))}
          </div>
          {eventsError ? (
            <p className="portal-status-warn" role="alert">
              {eventsError}
            </p>
          ) : null}
        </section>
      ),
      donaciones: (
        <section className="portal-section portal-wrap" id="portal-section-donaciones" data-testid="portal-donations">
          <h2>{pick(portada.donaciones.tituloSeccion, lang)}</h2>
          <p className="portal-muted">{pick(portada.donaciones.aviso, lang)}</p>
          <div className="portal-cards">
            {portada.donaciones.ejemplos.map((ejemplo) => (
              <article key={ejemplo.id} className="portal-card" data-testid={`portal-sample-donation-${ejemplo.id}`}>
                <h3>{pick(ejemplo.titulo, lang)}</h3>
                <div className="portal-progress" aria-hidden="true">
                  <span />
                </div>
                <p className="portal-muted">{pick(ejemplo.leyendaBarra, lang)}</p>
              </article>
            ))}
          </div>
          <p className="portal-muted">{pick(portada.donaciones.leyendaReal, lang)}</p>
        </section>
      ),
      preguntas: (
        <section className="portal-section portal-wrap portal-faq" id="portal-section-preguntas" data-testid="portal-faq">
          {preguntas.preguntas.map((item) => (
            <details key={item.id}>
              <summary>{pick(item.pregunta, lang)}</summary>
              <p>{pick(item.respuesta, lang)}</p>
            </details>
          ))}
        </section>
      ),
      pie: (
        <footer className="portal-section portal-wrap" id="portal-section-pie" data-testid="portal-footer">
          <p className="portal-brand">{pick(portada.barra.marca, lang)}</p>
          <p className="portal-muted">{pick(portada.pie.fraseFotos, lang)}</p>
          <nav className="portal-nav">
            {portada.barra.enlaces.map((enlace) => (
              <a
                key={enlace.id}
                href={
                  enlace.id === 'iniciar-sesion'
                    ? '#portal-login'
                    : enlace.id === 'tutorial'
                      ? '#portal-section-como-funciona'
                      : `#portal-section-${enlace.id}`
                }
                data-testid={`portal-footer-link-${enlace.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  handleBarLink(enlace.id);
                }}
              >
                {pick(enlace, lang)}
              </a>
            ))}
          </nav>
        </footer>
      ),
    };
    return map;
  }, [
    createMessage,
    createResult,
    createState,
    displayNameDraft,
    eventsError,
    handleCreateSpace,
    lang,
    listedEvents,
  handleBarLink,
    onNavigateLogin,
    onNavigateRegister,
    sampleBadge,
    scrollTo,
    slugDraft,
    slugError,
  ]);

  return (
    <div className="portal-page" data-testid="portal-landing">
      {sectionOrder.map((section) => (
        <React.Fragment key={section.id}>{blocks[section.id]}</React.Fragment>
      ))}
    </div>
  );
};
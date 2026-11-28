/**
 * Portada de somospanas.com (NAP-U2): una presentación con un solo foco, «aquí
 * un agente te guía de principio a fin». Secciones ordenadas por
 * `contenido/paginas.json`. Depende de `contenido/portada.json`, tokens en
 * `estilos/tokens.css` y listado `GET /api/portal/events` (si no hay eventos,
 * la sección no se muestra). Sin menús: el único camino es el botón dorado.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import '../../../../estilos/tokens.css';
import '../styles/portal-landing.css';
import portada from '../../../../contenido/portada.json';
import paginas from '../../../../contenido/paginas.json';
import { legacyCreateUrl } from '../lib/app-host';
import { useI18n, useMessages } from '../i18n/I18nContext';
import { avatarCatalog } from '../i18n/messages/avatar';
import { api, type PortalListedEvent } from '../api/client';
import { SiteLogo } from '../components/brand/SiteLogo';
import { ThemeToggle } from '../components/theme/ThemeToggle';
import { AvatarSpotlight } from '../components/portal/AvatarSpotlight';
import { SampleInviteCard } from '../components/demo/SampleInviteCard';

type LocaleKey = 'es' | 'en';
type SectionId = (typeof paginas.portadaRaiz.secciones)[number]['id'];

export interface PortalLandingViewProps {
  onNavigateRegister: () => void;
  onNavigateLogin: () => void;
  /**
   * NAP-U2: el botón dorado va a /create y arranca la avatar con el mismo clic
   * (App lo cablea). Opcional para no romper montajes sueltos: sin cableado
   * navega a /create con recarga.
   */
  onNavigateCreate?: () => void;
}

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

const defaultNavigateCreate = (): void => {
  try {
    window.location.assign('/create');
  } catch {
    // Sin navegación el botón no hace nada.
  }
};

/** Textos de pasos y muestra con tipos del JSON (claves nuevas NAP-U2). */
interface PasoPortada {
  titulo: Record<LocaleKey, string>;
  texto: Record<LocaleKey, string>;
}

interface MuestraPortada {
  titulo: Record<LocaleKey, string>;
  fecha: Record<LocaleKey, string>;
  lugar: Record<LocaleKey, string>;
  url: Record<LocaleKey, string>;
  qrPie: Record<LocaleKey, string>;
}

/**
 * Vista principal de la raíz: monta bloques según `paginas.json` sin copiar textos en el componente.
 */
export const PortalLandingView: React.FC<PortalLandingViewProps> = ({
  onNavigateRegister,
  onNavigateLogin,
  onNavigateCreate = defaultNavigateCreate,
}) => {
  const { locale, setLocale } = useI18n();
  const lang = (locale === 'en' ? 'en' : 'es') as LocaleKey;
  const avatarTexts = useMessages(avatarCatalog);

  const [listedEvents, setListedEvents] = useState<PortalListedEvent[]>([]);
  const [activeStep, setActiveStep] = useState(0);
  const pasos = (portada.hero as { pasos?: PasoPortada[] }).pasos ?? [];
  const muestra = (portada.hero as { muestra?: MuestraPortada }).muestra;
  const pasosTitulo = (portada.hero as { pasosTitulo?: Record<LocaleKey, string> }).pasosTitulo;
  const muestraTitulo = (portada.hero as { muestraTitulo?: Record<LocaleKey, string> }).muestraTitulo;
  const botonConversar = (portada.hero as { botonConversar?: Record<LocaleKey, string> }).botonConversar;
  const enlaceIdioma = (portada.hero as { enlaceIdioma?: Record<LocaleKey, string> }).enlaceIdioma;
  const notaPana = (portada.hero as { notaPana?: Record<LocaleKey, string> }).notaPana;
  const saludo = (portada.hero as { saludo?: Record<LocaleKey, string> }).saludo;

  const loadEvents = useCallback(async () => {
    try {
      const res = await api.getPortalEvents();
      setListedEvents(res.events);
    } catch {
      // Sin listado no hay sección de eventos; la portada sigue intacta.
      setListedEvents([]);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  // NAP-U2: el body acompaña al tema solo en la raíz (tokens.css lo tiñe).
  useEffect(() => {
    try {
      document.body.classList.add('portal-body');
    } catch {
      // Sin DOM no hay marco que teñir.
    }
    return () => {
      try {
        document.body.classList.remove('portal-body');
      } catch {
        // El DOM ya se fue con la vista.
      }
    };
  }, []);

  const sectionOrder = paginas.portadaRaiz.secciones;

  const blocks = useMemo(() => {
    const map: Partial<Record<SectionId, React.ReactNode>> = {
      barra: (
        <header className="portal-bar portal-wrap" data-testid="portal-bar">
          <SiteLogo />
          <ThemeToggle />
        </header>
      ),
      hero: (
        <section className="portal-hero portal-wrap" id="portal-section-hero" data-testid="portal-hero">
          <div className="portal-hero-copy">
            <h1>{pick(portada.hero.titulo, lang)}</h1>
            <p className="portal-hero-text">{pick(portada.hero.texto, lang)}</p>
            {lang === 'en' && notaPana ? <p className="portal-pana-note">{notaPana.en}</p> : null}
            <div className="portal-hero-actions">
              {botonConversar ? (
                <button
                  type="button"
                  className="portal-btn-gold"
                  data-testid="portal-hero-create"
                  onClick={onNavigateCreate}
                >
                  {pick(botonConversar, lang)}
                </button>
              ) : null}
              {enlaceIdioma ? (
                <button
                  type="button"
                  className="portal-lang-link"
                  data-testid="portal-language-link"
                  onClick={() => setLocale(lang === 'en' ? 'es' : 'en')}
                >
                  {pick(enlaceIdioma, lang)}
                </button>
              ) : null}
            </div>
          </div>
          <div className="portal-hero-avatar">
            {saludo ? <AvatarSpotlight saludo={pick(saludo, lang)} previewAlt={avatarTexts.previewAlt} /> : null}
            <p className="portal-powered" data-testid="portal-powered">
              {avatarTexts.poweredBy}
            </p>
          </div>
        </section>
      ),
      pasos: (
        <section className="portal-section portal-wrap" id="portal-section-pasos" data-testid="portal-steps">
          {pasosTitulo ? <h2>{pick(pasosTitulo, lang)}</h2> : null}
          <ol className="portal-steps">
            {pasos.map((paso, index) => (
              <li key={paso.titulo.es}>
                <button
                  type="button"
                  className={index === activeStep ? 'portal-step portal-step-active' : 'portal-step'}
                  aria-current={index === activeStep ? 'step' : undefined}
                  data-testid={`portal-step-${index}`}
                  onClick={() => setActiveStep(index)}
                >
                  <span className="portal-step-num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="portal-step-title">{pick(paso.titulo, lang)}</span>
                  <span className="portal-step-text">{pick(paso.texto, lang)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ),
      ejemplo: muestra ? (
        <section className="portal-section portal-wrap" id="portal-section-ejemplo" data-testid="portal-sample">
          {muestraTitulo ? <h2>{pick(muestraTitulo, lang)}</h2> : null}
          <SampleInviteCard
            titulo={pick(muestra.titulo, lang)}
            fecha={pick(muestra.fecha, lang)}
            lugar={pick(muestra.lugar, lang)}
            url={pick(muestra.url, lang)}
            qrPie={pick(muestra.qrPie, lang)}
          />
        </section>
      ) : undefined,
      'eventos-publicos':
        listedEvents.length > 0 ? (
          <section
            className="portal-section portal-wrap"
            id="portal-section-eventos-publicos"
            data-testid="portal-events"
          >
            <h2>
              {pick(
                portada.barra.enlaces.find((e) => e.id === 'eventos-publicos') ?? {
                  es: 'Eventos públicos',
                  en: 'Public events',
                },
                lang,
              )}
            </h2>
            <div className="portal-cards">
              {listedEvents.map((event) => (
                <article key={event.slug} className="portal-card" data-testid={`portal-listed-event-${event.slug}`}>
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
          </section>
        ) : undefined,
      pie: (
        <footer className="portal-footer portal-wrap" id="portal-section-pie" data-testid="portal-footer">
          <SiteLogo size="sm" />
          <p className="portal-footer-actions">
            <button type="button" className="portal-footer-link" onClick={onNavigateRegister}>
              {pick(portada.hero.enlaceRegistro, lang)}
            </button>
            <button type="button" className="portal-footer-link" onClick={onNavigateLogin}>
              {pick(portada.hero.enlaceIniciarSesion, lang)}
            </button>
            <a
              className="portal-footer-link"
              data-testid="portal-organize-meeting"
              href={legacyCreateUrl()}
            >
              {avatarTexts.organizeMeeting}
            </a>
          </p>
        </footer>
      ),
    };
    return map;
  }, [
    activeStep,
    avatarTexts,
    botonConversar,
    enlaceIdioma,
    lang,
    listedEvents,
    muestra,
    muestraTitulo,
    notaPana,
    onNavigateCreate,
    onNavigateLogin,
    onNavigateRegister,
    pasos,
    pasosTitulo,
    saludo,
    setLocale,
  ]);

  return (
    <div className="portal-page" data-testid="portal-landing">
      {sectionOrder.map((section) => (
        <React.Fragment key={section.id}>{blocks[section.id]}</React.Fragment>
      ))}
    </div>
  );
};

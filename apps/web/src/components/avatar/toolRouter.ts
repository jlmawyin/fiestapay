/**
 * Router de tools implícitas de la avatar Napster (NAP-F3 público, NAP-F4w
 * invitado y creador). Depende del contrato `packages/shared/src/avatar-tools.ts`
 * (nombres, JSON Schema y listas por visitante) y de `guide/showOnScreen.ts`
 * para resaltados y borradores. La app ejecuta cada tool y responde con
 * `send_function_output`; el modelo nunca aporta URLs ni selectores. Toda tool
 * desconocida, de otro visitante o con argumentos inválidos responde
 * `{ok:false, error:'not_allowed'}` sin efectos.
 */
import {
  AVATAR_SHOW_ON_SCREEN_TARGETS,
  AVATAR_TOOLS_BY_VISITOR,
  UI_TARGET_IDS,
  normalizeSiteSlugInput,
  validateSiteSlug,
  type AvatarVisitor,
  type DraftEventProposal,
} from '@fiestapay/shared';
import { guidePrefersReducedMotion, setGuideDraftProposal, showOnScreen } from '../../guide/showOnScreen';
import { api, type PortalListedEvent } from '../../api/client';
import { readAppHostContext } from '../../lib/app-host';
import { consumeAvatarReminderDraft, setAvatarReminderDraft } from './reminderPrefill';
import { markCreateIntent } from './sessionIntent';

/** Llamada implícita tal como llega en `function_implicitly_called`. */
export interface AvatarFunctionCall {
  call_id?: unknown;
  name?: unknown;
  arguments?: unknown;
}

/** Salida JSON que viaja en `send_function_output`. */
export type AvatarToolOutput = Record<string, unknown>;

/** Presupuesto por tool: 9 s, dentro del plazo de 10 s de Napster. */
export const AVATAR_TOOL_TIMEOUT_MS = 9_000;

/** Clase del resaltado propio en `napster-avatar.css` (ver comentario NAP-F3). */
export const AVATAR_FLASH_CLASS = 'napster-guide-flash';
const FLASH_MS = 2500;

const SHOW_ON_SCREEN_TARGETS = AVATAR_SHOW_ON_SCREEN_TARGETS as readonly string[];
const LEGACY_UI_TARGETS = UI_TARGET_IDS as readonly string[];

/**
 * Ids raíz de la portada → sección del DOM. NAP-F3: `showOnScreen`/`GuideOverlay`
 * solo aceptan `UI_TARGETS`; los ids raíz de la portada (contrato NAP-F2) se
 * resuelven aquí con scroll a la sección y resaltado propio, sin tocar esos
 * archivos. `registro`/`sesion` viven en el hero (botones de cuenta).
 */
const ROOT_SECTION_BY_TARGET: Record<string, string> = {
  tutorial: 'portal-section-como-funciona',
  'crear-espacio': 'portal-section-compositor',
  'eventos-publicos': 'portal-section-eventos-publicos',
  donaciones: 'portal-section-donaciones',
  registro: 'portal-section-hero',
  sesion: 'portal-section-hero',
};

export interface AvatarToolRouterDeps {
  visitor: AvatarVisitor;
  /** Fuente de eventos; por defecto `GET /api/portal/events`. Inyectable en pruebas. */
  fetchEvents?: () => Promise<{ events: PortalListedEvent[] }>;
  /** Navegación; por defecto `location.assign`. Inyectable en pruebas. */
  navigate?: (url: string) => void;
  /** Navegación interna SPA; por defecto pushState + popstate. Inyectable en pruebas. */
  navigateTo?: (path: string) => void;
  /** Resaltado legado; por defecto `showOnScreen`. Inyectable en pruebas. */
  highlight?: typeof showOnScreen;
  /** Slug del evento abierto, para amarrar los resaltados de invitado. */
  inviteSlug?: string;
  /** Presupuesto por tool; las pruebas lo acortan. */
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function notAllowed(): AvatarToolOutput {
  return { ok: false, error: 'not_allowed' };
}

/**
 * Valida los argumentos contra el JSON Schema del contrato (NAP-F3: sin claves
 * extra en ninguna tool). Entrada: argumentos ya parseados. Salida: args limpios.
 */
function validateToolArgs(
  name: string,
  raw: unknown,
): { ok: true; args: Record<string, unknown> } | { ok: false } {
  const args = raw === undefined ? {} : raw;
  if (!isRecord(args)) return { ok: false };
  switch (name) {
    case 'list_open_events': {
      return Object.keys(args).length === 0 ? { ok: true, args } : { ok: false };
    }
    case 'open_event': {
      const keys = Object.keys(args);
      if (keys.length !== 1 || !('ref' in args)) return { ok: false };
      const ref = args.ref;
      if (typeof ref !== 'number' || !Number.isInteger(ref) || ref < 1 || ref > 5) {
        return { ok: false };
      }
      return { ok: true, args };
    }
    case 'start_new_space': {
      for (const key of Object.keys(args)) {
        if (key !== 'slug' && key !== 'name') return { ok: false };
      }
      if (args.slug !== undefined) {
        if (typeof args.slug !== 'string' || !/^[a-z0-9-]{3,40}$/.test(args.slug)) return { ok: false };
      }
      if (args.name !== undefined) {
        if (typeof args.name !== 'string' || args.name.length < 1 || args.name.length > 80) {
          return { ok: false };
        }
      }
      return { ok: true, args };
    }
    case 'show_on_screen': {
      for (const key of Object.keys(args)) {
        if (key !== 'target' && key !== 'caption') return { ok: false };
      }
      if (typeof args.target !== 'string' || !SHOW_ON_SCREEN_TARGETS.includes(args.target)) {
        return { ok: false };
      }
      if (args.caption !== undefined) {
        if (typeof args.caption !== 'string' || args.caption.length > 60) return { ok: false };
      }
      return { ok: true, args };
    }
    case 'fill_event_draft': {
      for (const key of Object.keys(args)) {
        if (key !== 'title' && key !== 'startsAt' && key !== 'place' && key !== 'description') {
          return { ok: false };
        }
      }
      if (typeof args.title !== 'string' || args.title.length < 1 || args.title.length > 120) {
        return { ok: false };
      }
      if (typeof args.startsAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(args.startsAt)) {
        return { ok: false };
      }
      if (args.place !== undefined && (typeof args.place !== 'string' || args.place.length > 160)) {
        return { ok: false };
      }
      if (
        args.description !== undefined &&
        (typeof args.description !== 'string' || args.description.length > 500)
      ) {
        return { ok: false };
      }
      return { ok: true, args };
    }
    case 'draft_reminder': {
      const keys = Object.keys(args);
      if (keys.length !== 1 || !('text' in args)) return { ok: false };
      if (typeof args.text !== 'string' || args.text.length < 1 || args.text.length > 500) {
        return { ok: false };
      }
      return { ok: true, args };
    }
    case 'show_event_details':
    case 'open_avatar_settings': {
      return Object.keys(args).length === 0 ? { ok: true, args } : { ok: false };
    }
    default:
      return { ok: false };
  }
}

function smoothScroll(): ScrollBehavior {
  try {
    return guidePrefersReducedMotion() ? 'auto' : 'smooth';
  } catch {
    return 'auto';
  }
}

/** Resaltado temporal de una sección de la portada (ids raíz, ver mapa NAP-F3). */
function flashSection(sectionId: string): boolean {
  try {
    const element = document.getElementById(sectionId);
    if (!(element instanceof HTMLElement)) return false;
    element.scrollIntoView({ block: 'start', behavior: smoothScroll() });
    element.classList.add(AVATAR_FLASH_CLASS);
    window.setTimeout(() => {
      try {
        element.classList.remove(AVATAR_FLASH_CLASS);
      } catch {
        // El resaltado es decorativo; su limpieza nunca falla la tool.
      }
    }, FLASH_MS);
    return true;
  } catch {
    return false;
  }
}

/**
 * Escribe en un input controlado por React (NAP-F3: el setter nativo más el
 * evento `input` sí actualizan el estado; asignar `.value` solo no lo haría).
 */
function setPortalInput(id: string, value: string): boolean {
  try {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLInputElement)) return false;
    const setter =
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ??
      Object.getOwnPropertyDescriptor(element, 'value')?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

function withToolTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('tool_timeout')), timeoutMs);
  });
  return Promise.race([
    work.finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    }),
    timeout,
  ]);
}

/**
 * Navegación SPA sin tocar App.tsx (NAP-F4w): pushState más un popstate
 * sintético, que el router de App ya escucha. No navega si ya está en la ruta.
 */
function defaultNavigateTo(path: string): void {
  try {
    if (window.location.pathname === path) return;
    window.history.pushState({}, '', path);
    // El router de App solo escucha el nombre del evento; PopStateEvent con
    // respaldo a Event por si el entorno no lo implementa.
    const EventCtor: new (type: string) => Event =
      typeof PopStateEvent === 'function' ? PopStateEvent : Event;
    window.dispatchEvent(new EventCtor('popstate'));
  } catch {
    // Sin historial no hay navegación; la tool informa no disponible.
    throw new Error('navigate_failed');
  }
}

/** Fecha de calendario real YYYY-MM-DD (el patrón del contrato no basta). */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Hora real HH:MM de 24 h. */
function isRealTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Lleva a un selector existente y lo resalta; falso si no está en la página. */
function flashSelector(selector: string): boolean {
  try {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) return false;
    element.scrollIntoView({ block: 'start', behavior: smoothScroll() });
    element.classList.add(AVATAR_FLASH_CLASS);
    window.setTimeout(() => {
      try {
        element.classList.remove(AVATAR_FLASH_CLASS);
      } catch {
        // Decorativo; su limpieza nunca falla la tool.
      }
    }, FLASH_MS);
    return true;
  } catch {
    return false;
  }
}

/**
 * Crea el router de tools para un visitante. Guarda la última lista de eventos
 * (refs 1..5 con la URL que dio el servidor) para validar `open_event`. El
 * visitante real lo fija la sesión con `setVisitor` desde la respuesta del
 * servidor, nunca desde la vista (NAP-F4w).
 */
export function createAvatarToolRouter(deps: AvatarToolRouterDeps) {
  let visitor: AvatarVisitor = deps.visitor;
  const timeoutMs = deps.timeoutMs ?? AVATAR_TOOL_TIMEOUT_MS;
  let lastList: { ref: number; url: string }[] = [];

  function visitorTools(): readonly string[] {
    return AVATAR_TOOLS_BY_VISITOR[visitor] as readonly string[];
  }

  /**
   * Fija el visitante decidido por el servidor. Si cambia, la última lista se
   * descarta: los refs de otro contexto no deben abrirse aquí.
   */
  function setVisitor(next: AvatarVisitor): void {
    if (next !== visitor) lastList = [];
    visitor = next;
  }

  async function listOpenEvents(): Promise<AvatarToolOutput> {
    const res = await (deps.fetchEvents ?? api.getPortalEvents)();
    const top = res.events.slice(0, 5);
    lastList = top.map((event, index) => ({ ref: index + 1, url: event.url }));
    return {
      events: top.map((event, index) => ({
        ref: index + 1,
        title: event.title,
        startsAt: event.startsAt,
        place: event.location,
        siteName: event.siteName,
      })),
    };
  }

  async function openEvent(args: Record<string, unknown>): Promise<AvatarToolOutput> {
    const entry = lastList.find((item) => item.ref === args.ref);
    if (!entry) return notAllowed();
    // NAP-F3: la URL sale de la lista del servidor, nunca del modelo.
    const navigate =
      deps.navigate ??
      ((url: string) => {
        window.location.assign(url);
      });
    navigate(entry.url);
    return { ok: true, ref: entry.ref };
  }

  async function startNewSpace(args: Record<string, unknown>): Promise<AvatarToolOutput> {
    // Lleva al compositor de subdominio y lo resalta; la persona pulsa «Crear».
    // NAP-F3: esta tool jamás llama a POST /api/sites.
    // NAP-F4w: el compositor solo existe en la raíz; fuera de ella no aplica.
    let compositor: HTMLElement | null;
    try {
      const found = document.getElementById('portal-section-compositor');
      compositor = found instanceof HTMLElement ? found : null;
    } catch {
      compositor = null;
    }
    if (!compositor) return { ok: false, error: 'unavailable' };
    flashSection('portal-section-compositor');
    markCreateIntent();
    if (typeof args.slug === 'string') {
      const slug = normalizeSiteSlugInput(args.slug);
      if (validateSiteSlug(slug) === 'ok') setPortalInput('portal-slug', slug);
    }
    if (typeof args.name === 'string') {
      const name = args.name.trim();
      if (name.length > 0) setPortalInput('portal-display-name', name.slice(0, 80));
    }
    return { ok: true };
  }

  async function showOnScreenTool(args: Record<string, unknown>): Promise<AvatarToolOutput> {
    const target = args.target as string;
    const caption = typeof args.caption === 'string' && args.caption.trim().length > 0
      ? args.caption.trim().slice(0, 60)
      : undefined;
    if (LEGACY_UI_TARGETS.includes(target)) {
      const highlight = deps.highlight ?? showOnScreen;
      const callArgs = { target, ...(caption ? { caption } : {}) };
      // NAP-F4w: en página de evento, el resaltado de invitado se amarra al slug.
      const result =
        deps.inviteSlug !== undefined
          ? await highlight(callArgs, { inviteSlug: deps.inviteSlug })
          : await highlight(callArgs);
      if (result.ok) return { ok: true, target };
      if (result.reason === 'unavailable_here') return { ok: false, error: 'unavailable' };
      return notAllowed();
    }
    const sectionId = ROOT_SECTION_BY_TARGET[target];
    if (!sectionId) return notAllowed();
    return flashSection(sectionId) ? { ok: true, target } : { ok: false, error: 'unavailable' };
  }

  /**
   * Rellena el formulario de crear evento sin enviarlo (NAP-F4w, creador).
   * Reutiliza el pending de un solo uso de `guide/showOnScreen`: si el
   * formulario ya está montado lo aplica por evento; si no, viaja a /create y
   * el formulario lo consume al montar. La persona revisa y publica.
   */
  async function fillEventDraft(args: Record<string, unknown>): Promise<AvatarToolOutput> {
    const startsAt = args.startsAt as string;
    const date = startsAt.slice(0, 10);
    const startTime = startsAt.slice(11, 16);
    if (!isRealDate(date) || !isRealTime(startTime)) return notAllowed();
    const title = (args.title as string).trim();
    if (title.length === 0) return notAllowed();
    const place = typeof args.place === 'string' && args.place.trim().length > 0
      ? args.place.trim().slice(0, 160)
      : undefined;
    const description =
      typeof args.description === 'string' && args.description.trim().length > 0
        ? args.description.trim().slice(0, 500)
        : undefined;
    const proposal: DraftEventProposal & { description?: string } = {
      template: 'evento',
      title,
      date,
      startTime,
      ...(place ? { location: place } : {}),
      ...(description ? { description } : {}),
      includes: [],
      suggested: ['title', 'date', 'startTime', ...(place ? (['location'] as const) : [])],
      source: 'rules',
    };
    setGuideDraftProposal(proposal);
    const navigateTo = deps.navigateTo ?? defaultNavigateTo;
    try {
      navigateTo('/create');
    } catch {
      return { ok: false, error: 'unavailable' };
    }
    return { ok: true };
  }

  /**
   * Deja el recordatorio en el campo general de la vista del organizador
   * (NAP-F4w, creador). El organizador lo copia o lo abre en WhatsApp; la tool
   * jamás envía nada. Sin la sección en la página no aplica y no deja pending.
   */
  async function draftReminder(args: Record<string, unknown>): Promise<AvatarToolOutput> {
    const section =
      typeof document === 'undefined' ? null : document.querySelector('.reminder-drafts');
    if (!(section instanceof HTMLElement)) {
      consumeAvatarReminderDraft();
      return { ok: false, error: 'unavailable' };
    }
    setAvatarReminderDraft(args.text as string);
    flashSelector('.reminder-drafts');
    return { ok: true };
  }

  /** Lleva a los detalles logísticos de la invitación abierta (NAP-F4w). */
  async function showEventDetails(): Promise<AvatarToolOutput> {
    return flashSelector('.invite-facts') ? { ok: true } : { ok: false, error: 'unavailable' };
  }

  /**
   * Lleva a la configuración del sitio (NAP-F4w, creador). Los ajustes de
   * avatar con foto llegan en otro frente; por ahora solo navega. Fuera de un
   * subdominio de sitio no hay ajustes a los que ir.
   */
  async function openAvatarSettings(): Promise<AvatarToolOutput> {
    let isSiteHost: boolean;
    try {
      isSiteHost = readAppHostContext().isSiteHost;
    } catch {
      isSiteHost = false;
    }
    if (!isSiteHost) return { ok: false, error: 'unavailable' };
    const navigateTo = deps.navigateTo ?? defaultNavigateTo;
    try {
      navigateTo('/settings');
    } catch {
      return { ok: false, error: 'unavailable' };
    }
    return { ok: true };
  }

  /**
   * Enruta una llamada implícita y devuelve la salida para `send_function_output`.
   * Acepta `arguments` como objeto o como JSON en texto; todo lo demás se rechaza.
   */
  async function route(call: AvatarFunctionCall): Promise<AvatarToolOutput> {
    const name = typeof call.name === 'string' ? call.name : '';
    if (!visitorTools().includes(name)) return notAllowed();
    let rawArgs: unknown = call.arguments;
    if (typeof rawArgs === 'string') {
      try {
        rawArgs = JSON.parse(rawArgs) as unknown;
      } catch {
        return notAllowed();
      }
    }
    const validated = validateToolArgs(name, rawArgs);
    if (!validated.ok) return notAllowed();
    try {
      const work =
        name === 'list_open_events'
          ? listOpenEvents()
          : name === 'open_event'
            ? openEvent(validated.args)
            : name === 'start_new_space'
              ? startNewSpace(validated.args)
              : name === 'fill_event_draft'
                ? fillEventDraft(validated.args)
                : name === 'draft_reminder'
                  ? draftReminder(validated.args)
                  : name === 'show_event_details'
                    ? showEventDetails()
                    : name === 'open_avatar_settings'
                      ? openAvatarSettings()
                      : showOnScreenTool(validated.args);
      return await withToolTimeout(work, timeoutMs);
    } catch {
      return { ok: false, error: 'failed' };
    }
  }

  return { route, setVisitor };
}

export type AvatarToolRouter = ReturnType<typeof createAvatarToolRouter>;

/**
 * Sesión de avatar Napster (NAP-F3 video, NAP-F4w invitado/creador y texto).
 * Depende del SDK `@touchcastllc/napster-companion-api`, de
 * `api.createAvatarSession`/`queueAvatarSessionEnd` y del router de tools. El
 * micrófono y la red solo se tocan tras un clic; sin clic no hay `init`,
 * `getToken` ni socket. Cadena de respaldo: video → chat de texto Napster por
 * WebSocket → recorrido fijo de lectura. El visitante y las tools salen del
 * servidor (`visitor`), nunca de la vista.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  DataChannelMessageType,
  NapsterCompanionApiSdk,
  type NapsterCompanionApiConfig,
  type NapsterCompanionApiInstance,
} from '@touchcastllc/napster-companion-api';
import type { AvatarLang, AvatarSessionResponse, AvatarVisitor } from '@fiestapay/shared';
import { AvatarSessionError, api } from '../../api/client';
import { createAvatarToolRouter, type AvatarToolRouter } from './toolRouter';
import { clearCreateIntent, consumeCreateIntent, peekCreateIntent } from './sessionIntent';

export type NapsterSessionStatus = 'idle' | 'connecting' | 'live' | 'text' | 'fallback';
// NAP-F4w: el 409 de video abre el chat de texto; el recorrido fijo solo
// distingue lectura voluntaria (`reading`) de video+texto caídos (`unavailable`).
export type NapsterFallbackReason = 'unavailable' | 'reading';

export interface NapsterCaption {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  done: boolean;
}

/** Tope de espera en 429: Retry-After con máximo de 5 s y un solo reintento. */
export const AVATAR_RETRY_MAX_MS = 5_000;
const MAX_CAPTIONS = 50;

/**
 * Evento de servidor tal como lo entrega `onData` (NAP-F3: el SDK no exporta
 * `EventMessage` desde su índice, así que se deriva del tipo del callback).
 * El socket de texto usa la misma envoltura `{event, data}` (doc websockets).
 */
type NapsterServerEvent = Parameters<NonNullable<NapsterCompanionApiConfig['onData']>>[0];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Espera ante 429 en milisegundos (NAP-F3: Retry-After con tope de 5 s).
 * Exportada para probarla sin temporizadores.
 */
export function retryDelayMs(retryAfterSec?: number): number {
  const secs = typeof retryAfterSec === 'number' && Number.isFinite(retryAfterSec) ? retryAfterSec : 1;
  return Math.min(Math.max(secs, 0), AVATAR_RETRY_MAX_MS / 1000) * 1000;
}

/**
 * NAP-U1: el SDK no trae ids de mensaje (`EventMessage.message` solo trae
 * action/content/role), así que la deduplicación es del lado del cliente.
 */
function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Agrega un mensaje humano acotando el historial. Se ignoran los vacíos, el
 * JSON (salidas de función como {"events": []}) y los duplicados consecutivos
 * idénticos (eco del usuario, doble `completed`). Un `completed` con el texto
 * completo sustituye lo acumulado; si trae solo el resto, se suma.
 */
function appendCleanMessage(
  prev: NapsterCaption[],
  id: number,
  role: NapsterCaption['role'],
  text: string,
  delta: boolean,
): NapsterCaption[] {
  if (text.trim().length === 0 || looksLikeJson(text)) return prev;
  const last = prev[prev.length - 1];
  if (last && !last.done && last.role === role) {
    const next = [...prev];
    if (text === last.text) {
      // Mismo contenido reenviado: el delta se ignora, el final lo cierra.
      if (delta) return prev;
      next[next.length - 1] = { ...last, done: true };
      return next;
    }
    if (!delta && (text.includes(last.text) || last.text.includes(text))) {
      // El final trae el texto completo: sustituye, no suma.
      next[next.length - 1] = {
        ...last,
        text: text.length >= last.text.length ? text : last.text,
        done: true,
      };
      return next;
    }
    next[next.length - 1] = { ...last, text: last.text + text, done: !delta };
    return next;
  }
  if (!delta && last && last.done && last.role === role && last.text === text) return prev;
  return [...prev, { id, role, text, done: !delta }].slice(-MAX_CAPTIONS);
}

/** NAP-U1: estados del botón del micrófono en el video. */
export type NapsterMicState = 'ready' | 'listening' | 'processing' | 'denied' | 'error';

export interface UseNapsterSessionOptions {
  lang: AvatarLang;
  visitor?: AvatarVisitor;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Slug del evento abierto; el servidor valida y decide `guest`. */
  eventSlug?: string;
  /**
   * Intención fija de la vista (NAP-F4: crear reunión en el legado pide
   * `intent:'create'` en cada intento, sin depender de la bandera de un uso).
   */
  intent?: 'create';
  /** Router compartido (video y texto preservan la última lista). */
  router?: AvatarToolRouter;
}

export interface UseNapsterSession {
  status: NapsterSessionStatus;
  reason: NapsterFallbackReason;
  captions: NapsterCaption[];
  textMessages: NapsterCaption[];
  textReady: boolean;
  /** Verdadero cuando un 404 degradó el saludo de invitado a público. */
  degradedToPublic: boolean;
  /** NAP-F6w: agente de la sesión ('custom' → avatar con foto del organizador). */
  agent: string | null;
  /** NAP-U1: nombre de la avatar si la sesión lo trae (`avatar.firstName`). */
  firstName: string | null;
  /** NAP-U1: estado del botón del micrófono (video). */
  mic: NapsterMicState;
  /** NAP-U1: micrófono silenciado por la persona (muteMic del SDK). */
  muted: boolean;
  /** NAP-U1: silencia o reactiva el micrófono del video. */
  toggleMute: () => void;
  /** NAP-U1: reintenta la sesión de video (denegado o error). */
  micRetry: () => void;
  /** Solo el clic en «Conversar» lo llama; sin clic no hay sesión. */
  start: () => void;
  /** Terminar visible: destruye el widget o el socket y cierra el handle. */
  stop: () => void;
  /** «Prefiero leer»: chat de texto con la misma avatar (NAP-F4w). */
  readInstead: () => void;
  /** Punto de extensión del modo texto (NAP-F4w: ya abre el chat). */
  startTextMode: () => void;
  /** Envía un mensaje de texto (solo con el socket abierto). */
  sendText: (text: string) => void;
  /** Avisa al agente de un cambio de sección (solo con sesión lista). */
  notifyLocation: (message: string) => void;
}

export function useNapsterSession(options: UseNapsterSessionOptions): UseNapsterSession {
  const visitor = options.visitor ?? 'public';
  const [requested, setRequested] = useState(false);
  const [textRequested, setTextRequested] = useState(false);
  const [status, setStatus] = useState<NapsterSessionStatus>('idle');
  const [reason, setReason] = useState<NapsterFallbackReason>('unavailable');
  const [captions, setCaptions] = useState<NapsterCaption[]>([]);
  const [textMessages, setTextMessages] = useState<NapsterCaption[]>([]);
  const [textReady, setTextReady] = useState(false);
  const [degradedToPublic, setDegradedToPublic] = useState(false);
  /** NAP-F6w: 'custom' cuando el evento tiene avatar con la foto del organizador. */
  const [agent, setAgent] = useState<string | null>(null);
  /** NAP-U1: nombre opcional de la avatar para el título. */
  const [firstName, setFirstName] = useState<string | null>(null);
  /** NAP-U1: estado del micrófono; denegado y error quedan fijos hasta reintentar. */
  const [mic, setMic] = useState<NapsterMicState>('ready');
  const [muted, setMuted] = useState(false);

  const langRef = useRef(options.lang);
  langRef.current = options.lang;
  const eventSlugRef = useRef(options.eventSlug);
  eventSlugRef.current = options.eventSlug;
  const intentPropRef = useRef(options.intent);
  intentPropRef.current = options.intent;
  const degradedRef = useRef(false);
  const requestedRef = useRef(false);
  const textRequestedRef = useRef(false);
  const instanceRef = useRef<NapsterCompanionApiInstance | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const handleRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const textReadyRef = useRef(false);
  const mintErrorRef = useRef<AvatarSessionError | null>(null);
  const captionIdRef = useRef(0);
  // NAP-U1: espejos para decidir dentro de callbacks y del sondeo del micrófono.
  const micRef = useRef<NapsterMicState>('ready');
  const mutedRef = useRef(false);
  const streamingRef = useRef(false);
  const [videoAttempt, setVideoAttempt] = useState(0);
  const ownRouterRef = useRef<AvatarToolRouter | null>(null);
  if (!ownRouterRef.current) ownRouterRef.current = createAvatarToolRouter({ visitor });
  const router = options.router ?? ownRouterRef.current;

  const setMicState = useCallback((next: NapsterMicState): void => {
    micRef.current = next;
    setMic(next);
  }, []);

  const resetMic = useCallback((): void => {
    streamingRef.current = false;
    mutedRef.current = false;
    setMuted(false);
    setMicState('ready');
  }, [setMicState]);

  /** NAP-U1: silencia o reactiva el micrófono del video (muteMic del SDK). */
  const toggleMute = useCallback((): void => {
    const instance = instanceRef.current as unknown as {
      muteMic?: () => void;
      unmuteMic?: () => void;
    } | null;
    if (!instance) return;
    try {
      if (mutedRef.current) instance.unmuteMic?.();
      else instance.muteMic?.();
    } catch {
      // Si el SDK no responde, el botón conserva su estado anterior.
      return;
    }
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
  }, []);

  /** NAP-U1: reintenta la sesión de video tras denegado o error. */
  const micRetry = useCallback((): void => {
    resetMic();
    if (!requestedRef.current) {
      requestedRef.current = true;
      textRequestedRef.current = false;
      setTextRequested(false);
      setStatus('connecting');
      setRequested(true);
      return;
    }
    setStatus('connecting');
    setVideoAttempt((n) => n + 1);
  }, [resetMic]);

  /**
   * NAP-U1: otro encargo agregará `avatar.firstName` a la respuesta de la
   * sesión; lectura defensiva para dejar el título listo sin romper el
   * contrato actual. (Aviso: el cliente valida con zod estricto, así que ese
   * encargo también debe aceptar el campo en `api/client.ts`.)
   */
  const applySessionIdentity = useCallback((session: AvatarSessionResponse): void => {
    setAgent(typeof session.agent === 'string' ? session.agent : null);
    const avatar = (session as unknown as { avatar?: { firstName?: unknown } }).avatar;
    setFirstName(
      typeof avatar?.firstName === 'string' && avatar.firstName.trim().length > 0
        ? avatar.firstName.trim().slice(0, 60)
        : null,
    );
  }, []);

  const sendCommand = useCallback(
    (command: Parameters<NapsterCompanionApiInstance['sendCommand']>[0]): void => {
      try {
        instanceRef.current?.sendCommand(command);
      } catch {
        // Un comando perdido sobre una sesión moribunda no rompe la tarjeta.
      }
    },
    [],
  );

  /** Envía JSON por el socket de texto (doc channels/websockets). */
  const sendSocket = useCallback((payload: Record<string, unknown>): void => {
    try {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    } catch {
      // Un mensaje perdido sobre un socket moribundo no rompe el chat.
    }
  }, []);

  const notifyLocation = useCallback(
    (message: string): void => {
      // NAP-F3: contexto best-effort, solo tras avatar lista (doc client-commands).
      if (readyRef.current && instanceRef.current) {
        sendCommand({
          type: DataChannelMessageType.SEND_MESSAGE,
          data: { role: 'system', text: message, trigger_response: false },
        });
        return;
      }
      // NAP-F4w: el mismo contexto viaja por el socket en modo texto.
      if (textReadyRef.current && socketRef.current) {
        sendSocket({ type: 'send_message', data: { role: 'system', text: message, trigger_response: false } });
      }
    },
    [sendCommand, sendSocket],
  );

  const pushCaption = useCallback((message: unknown): void => {
    if (!message || typeof message !== 'object') return;
    const record = message as { action?: unknown; content?: unknown; role?: unknown };
    if (typeof record.content !== 'string' || record.content.length === 0) return;
    // NAP-U1: solo voces humanas; sistema y salidas internas no se muestran.
    if (record.role !== undefined && record.role !== 'user' && record.role !== 'assistant') return;
    const role: NapsterCaption['role'] = record.role === 'user' ? 'user' : 'assistant';
    const delta = record.action === 'delta';
    const text = record.content;
    captionIdRef.current += 1;
    const id = captionIdRef.current;
    setCaptions((prev) => appendCleanMessage(prev, id, role, text, delta));
  }, []);

  const pushTextMessage = useCallback(
    (role: NapsterCaption['role'], text: string, delta: boolean): void => {
      if (text.length === 0) return;
      captionIdRef.current += 1;
      const id = captionIdRef.current;
      setTextMessages((prev) => appendCleanMessage(prev, id, role, text, delta));
    },
    [],
  );

  /**
   * Pide una sesión al servidor (NAP-F4w): con reintento 429 y, si el evento
   * no existe o no es visible, degradación silenciosa a saludo público. El
   * visitante de la respuesta fija las tools del router.
   */
  const mintSession = useCallback(
    async (mode?: 'text'): Promise<AvatarSessionResponse> => {
      mintErrorRef.current = null;
      const attempt = async (withSlug: boolean): Promise<AvatarSessionResponse> => {
        const slug = withSlug && !degradedRef.current ? eventSlugRef.current : undefined;
        // NAP-F4: la vista puede fijar intent; si no, vale la bandera de un uso.
        // La bandera siempre se ojea/consume para no arrastrarla a otra vista.
        const flag = mode === 'text' ? consumeCreateIntent() : peekCreateIntent();
        const intent = intentPropRef.current ?? flag;
        try {
          try {
            return await api.createAvatarSession({
              lang: langRef.current,
              ...(intent ? { intent: 'create' as const } : {}),
              ...(slug ? { eventSlug: slug } : {}),
              ...(mode ? { mode } : {}),
            });
          } catch (error) {
            if (!(error instanceof AvatarSessionError) || error.code !== 'avatar_rate_limited') {
              throw error;
            }
            await sleep(retryDelayMs(error.retryAfterSec));
            return await api.createAvatarSession({
              lang: langRef.current,
              ...(intent ? { intent: 'create' as const } : {}),
              ...(slug ? { eventSlug: slug } : {}),
              ...(mode ? { mode } : {}),
            });
          }
        } catch (error) {
          if (error instanceof AvatarSessionError) mintErrorRef.current = error;
          throw error;
        }
      };
      try {
        const session = await attempt(true);
        if (mode !== 'text') clearCreateIntent();
        router.setVisitor(session.visitor);
        applySessionIdentity(session);
        return session;
      } catch (error) {
        // NAP-F4w: 404 con slug → se cae al saludo público sin revelar nada.
        if (
          error instanceof AvatarSessionError &&
          error.code === 'event_not_found' &&
          eventSlugRef.current &&
          !degradedRef.current
        ) {
          degradedRef.current = true;
          setDegradedToPublic(true);
          const session = await attempt(false);
          if (mode !== 'text') clearCreateIntent();
          router.setVisitor(session.visitor);
          applySessionIdentity(session);
          return session;
        }
        throw error;
      }
    },
    [router, applySessionIdentity],
  );

  const start = useCallback((): void => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    textRequestedRef.current = false;
    setTextRequested(false);
    degradedRef.current = false;
    setDegradedToPublic(false);
    setCaptions([]);
    setAgent(null);
    setFirstName(null);
    resetMic();
    setStatus('connecting');
    setRequested(true);
  }, [resetMic]);

  const stop = useCallback((): void => {
    requestedRef.current = false;
    textRequestedRef.current = false;
    setRequested(false);
    setTextRequested(false);
    setTextReady(false);
    setAgent(null);
    // NAP-U1: el nombre se conserva para la bienvenida de vuelta.
    resetMic();
    setStatus('idle');
  }, [resetMic]);

  /** NAP-F4w: «Prefiero leer» abre el chat de texto con la misma avatar. */
  const startTextMode = useCallback((): void => {
    if (textRequestedRef.current) return;
    requestedRef.current = false;
    textRequestedRef.current = true;
    setRequested(false);
    setTextMessages([]);
    setTextReady(false);
    resetMic();
    setStatus('text');
    setTextRequested(true);
  }, [resetMic]);

  const readInstead = startTextMode;

  const sendText = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || !textReadyRef.current) return;
      // Doc channels/websockets (text sessions): el usuario envía send_message.
      sendSocket({ type: 'send_message', data: { role: 'user', text: trimmed, trigger_response: true } });
      pushTextMessage('user', trimmed, false);
    },
    [pushTextMessage, sendSocket],
  );

  useEffect(() => {
    if (!requested) return;
    const container = options.containerRef.current;
    if (!container) {
      // Sin contenedor inline no hay video; respaldo sin tocar la red.
      requestedRef.current = false;
      setRequested(false);
      setReason('unavailable');
      setStatus('fallback');
      return;
    }
    let cancelled = false;

    const toFallback = (next: NapsterFallbackReason): void => {
      if (cancelled) return;
      requestedRef.current = false;
      setRequested(false);
      setReason(next);
      setStatus('fallback');
    };

    /** NAP-F4w: video caído → chat de texto con la misma avatar. */
    const toText = (): void => {
      if (cancelled) return;
      requestedRef.current = false;
      textRequestedRef.current = true;
      setRequested(false);
      setTextMessages([]);
      setTextReady(false);
      setStatus('text');
      setTextRequested(true);
    };

    const toFallbackFromMintError = (): void => {
      const code = mintErrorRef.current?.code;
      // NAP-F4w: 409, micro denegado y fallos WebRTC/SDK abren el chat; 503 y
      // errores de petición van directo al recorrido fijo.
      if (code === 'avatar_busy' || mintErrorRef.current === null) toText();
      else toFallback('unavailable');
    };

    const markLive = (): void => {
      if (cancelled) return;
      readyRef.current = true;
      setStatus('live');
    };

    /**
     * El SDK la llama tras resolver el permiso de micrófono, así el token
     * efímero (~5 s de vida) siempre es fresco. NAP-F3: en 429 espera
     * Retry-After (máx. 5 s) y reintenta una sola vez.
     */
    const getToken = async (): Promise<string> => {
      const session = await mintSession();
      handleRef.current = session.handle;
      return session.token;
    };

    const handleToolCall = async (data: Record<string, unknown> | undefined): Promise<void> => {
      const callId = typeof data?.call_id === 'string' ? data.call_id : '';
      if (!callId || !instanceRef.current) return;
      const output = await router.route({
        call_id: data?.call_id,
        name: data?.name,
        arguments: data?.arguments,
      });
      sendCommand({
        type: DataChannelMessageType.FUNCTION_CALL_OUTPUT,
        data: { call_id: callId, output },
      });
    };

    const onData = (event: NapsterServerEvent): void => {
      if (cancelled) return;
      const data = (event?.data ?? {}) as Record<string, unknown>;
      switch (event?.event) {
        case 'message_received': {
          pushCaption(data.message);
          // NAP-U1: el habla de la avatar marca «procesando» hasta el final.
          const incoming = data.message as { action?: unknown; content?: unknown; role?: unknown } | null;
          const isAssistantVoice =
            !!incoming &&
            typeof incoming === 'object' &&
            typeof incoming.content === 'string' &&
            incoming.content.length > 0 &&
            (incoming.role === 'assistant' || incoming.role === undefined);
          if (isAssistantVoice && micRef.current !== 'denied' && micRef.current !== 'error') {
            if (incoming.action === 'delta') {
              streamingRef.current = true;
              setMicState('processing');
            } else {
              streamingRef.current = false;
              if (micRef.current === 'processing') setMicState('ready');
            }
          }
          break;
        }
        case 'function_implicitly_called':
          void handleToolCall(data);
          break;
        case 'avatar_state_changed':
          if (data.state === 'ready') markLive();
          break;
        case 'session_expired':
          toText();
          break;
        case 'no_credits_left':
          toFallback('unavailable');
          break;
        default:
          break;
      }
    };

    // Patrón React de la doc oficial: un microtask deja que la limpieza de
    // StrictMode (setup→cleanup→setup) cancele el primer intento antes de init,
    // así el doble montaje jamás crea dos sesiones ni pide dos tokens.
    queueMicrotask(() => {
      if (cancelled) return;
      NapsterCompanionApiSdk.init(getToken, {
        layout: { type: 'inline', mountContainer: container },
        onData,
        onAvatarReady: (ready) => {
          if (ready !== false) markLive();
        },
        onSessionStatusChange: (sessionStatus) => {
          // NAP-U1: sin permiso se muestra el estado denegado con ayuda y
          // reintento; la persona elige «Prefiero leer» si quiere solo texto.
          if (sessionStatus === 'permissionBlocked' || sessionStatus === 'permissionDismissed') {
            if (!cancelled) setMicState('denied');
          }
        },
        onError: () => {
          // NAP-U1: un fallo con la sesión viva se muestra en el micrófono
          // con reintento; antes de vivir se conserva la navegación anterior.
          if (!cancelled && readyRef.current) {
            setMicState('error');
            return;
          }
          toFallbackFromMintError();
        },
      }).then(
        (created) => {
          if (cancelled) {
            try {
              created.destroy();
            } catch {
              // La instancia huérfana ya se limpia; nada más que hacer.
            }
            return;
          }
          instanceRef.current = created;
        },
        () => {
          toFallbackFromMintError();
        },
      );
    });

    // Única vía de cierre del video: al terminar, al fallar, al desmontar o en
    // pagehide (este último pasa por stop/onPageHide pero ejecuta el mismo código).
    return () => {
      cancelled = true;
      readyRef.current = false;
      const instance = instanceRef.current;
      instanceRef.current = null;
      try {
        instance?.destroy();
      } catch {
        // destroy() es idempotente en la práctica; un segundo llamado no falla.
      }
      const handle = handleRef.current;
      handleRef.current = null;
      if (handle) api.queueAvatarSessionEnd(handle);
    };
    // NAP-F3: la sesión vive por `requested`; idioma y contenedor viajan por
    // refs para que un cambio de idioma no reinicie la llamada en curso.
    // NAP-U1: `videoAttempt` reabre la sesión en el reintento del micrófono.
  }, [requested, videoAttempt]);

  useEffect(() => {
    if (!textRequested) return;
    let cancelled = false;
    let opened = false;

    const toFallback = (): void => {
      if (cancelled) return;
      textRequestedRef.current = false;
      setTextRequested(false);
      setTextReady(false);
      setReason('unavailable');
      setStatus('fallback');
    };

    const handleToolCall = async (
      socket: WebSocket,
      data: Record<string, unknown>,
    ): Promise<void> => {
      const callId = typeof data.call_id === 'string' ? data.call_id : '';
      if (!callId) return;
      const output = await router.route({
        call_id: data.call_id,
        name: data.name,
        arguments: data.arguments,
      });
      if (cancelled) return;
      // Doc executing-tools: en WebSocket los mensajes son idénticos; el
      // cliente los escribe al socket.
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'send_function_output', data: { call_id: callId, output } }));
        }
      } catch {
        // La respuesta perdida cierra el turno; el chat sigue.
      }
    };

    const onSocketMessage = (socket: WebSocket, raw: unknown): void => {
      if (cancelled || typeof raw !== 'string') return;
      let envelope: { event?: unknown; data?: unknown };
      try {
        envelope = JSON.parse(raw) as { event?: unknown; data?: unknown };
      } catch {
        return;
      }
      const data = (envelope.data ?? {}) as Record<string, unknown>;
      switch (envelope.event) {
        case 'message_received': {
          const message = data.message as { action?: unknown; content?: unknown; role?: unknown } | undefined;
          // NAP-U1: solo voces humanas; sistema y salidas internas no se muestran.
          if (message?.role !== undefined && message.role !== 'user' && message.role !== 'assistant') break;
          if (typeof message?.content === 'string' && message.content.length > 0) {
            pushTextMessage(message.role === 'user' ? 'user' : 'assistant', message.content, message.action === 'delta');
          }
          break;
        }
        case 'function_implicitly_called':
          void handleToolCall(socket, data);
          break;
        case 'session_expired':
        case 'no_credits_left':
          toFallback();
          break;
        default:
          break;
      }
    };

    void (async () => {
      let session: AvatarSessionResponse;
      try {
        session = await mintSession('text');
      } catch {
        toFallback();
        return;
      }
      if (cancelled) {
        api.queueAvatarSessionEnd(session.handle);
        return;
      }
      // Sin socketUrl (servidor sin contrato de texto) no hay chat.
      if (!session.socketUrl) {
        api.queueAvatarSessionEnd(session.handle);
        toFallback();
        return;
      }
      handleRef.current = session.handle;
      let socket: WebSocket;
      try {
        // Doc channels/websockets: el token ya va en la URL; sin cabeceras.
        socket = new WebSocket(session.socketUrl);
      } catch {
        toFallback();
        return;
      }
      if (cancelled) {
        try {
          socket.close();
        } catch {
          // El cierre huérfano no informa a nadie.
        }
        return;
      }
      socketRef.current = socket;
      socket.onopen = () => {
        if (cancelled) return;
        opened = true;
        textReadyRef.current = true;
        setTextReady(true);
      };
      socket.onmessage = (event: MessageEvent) => onSocketMessage(socket, event.data);
      socket.onerror = () => {
        // El cierre propio también dispara close; toFallback es idempotente.
        if (!opened) toFallback();
      };
      socket.onclose = () => {
        textReadyRef.current = false;
        setTextReady(false);
        toFallback();
      };
    })();

    return () => {
      cancelled = true;
      textReadyRef.current = false;
      const socket = socketRef.current;
      socketRef.current = null;
      try {
        socket?.close();
      } catch {
        // Cerrar dos veces no falla.
      }
      const handle = handleRef.current;
      handleRef.current = null;
      if (handle) api.queueAvatarSessionEnd(handle);
    };
    // NAP-F4w: el chat vive por `textRequested`, igual que el video por `requested`.
  }, [textRequested]);

  // NAP-U1: el SDK no expone un evento «escuchando»; solo trae banderas para
  // sondear (`isUserTalking`/`isAvatarSpeaking` de la instancia). Se aproximan
  // por sondeo cada medio segundo mientras el video está vivo; denegado y
  // error quedan fijos hasta reintentar o terminar.
  useEffect(() => {
    if (status !== 'live') return undefined;
    const timer = window.setInterval(() => {
      if (micRef.current === 'denied' || micRef.current === 'error') return;
      const instance = instanceRef.current as unknown as {
        isUserTalking?: unknown;
        isAvatarSpeaking?: unknown;
      } | null;
      if (instance?.isUserTalking === true) {
        setMicState('listening');
      } else if (instance?.isAvatarSpeaking === true || streamingRef.current) {
        setMicState('processing');
      } else if (micRef.current !== 'ready') {
        setMicState('ready');
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [status, setMicState]);

  useEffect(() => {
    const onPageHide = (): void => {
      const instance = instanceRef.current;
      instanceRef.current = null;
      try {
        instance?.destroy();
      } catch {
        // Salir de la página nunca queda bloqueado por el widget.
      }
      const socket = socketRef.current;
      socketRef.current = null;
      try {
        socket?.close();
      } catch {
        // Salir de la página nunca queda bloqueado por el chat.
      }
      const handle = handleRef.current;
      handleRef.current = null;
      if (handle) api.queueAvatarSessionEnd(handle);
      requestedRef.current = false;
      textRequestedRef.current = false;
      setRequested(false);
      setTextRequested(false);
      setStatus('idle');
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  return {
    status,
    reason,
    captions,
    textMessages,
    textReady,
    degradedToPublic,
    agent,
    firstName,
    mic,
    muted,
    toggleMute,
    micRetry,
    start,
    stop,
    readInstead,
    startTextMode,
    sendText,
    notifyLocation,
  };
}

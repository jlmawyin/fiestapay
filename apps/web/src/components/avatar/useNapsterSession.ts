/**
 * Sesión de avatar Napster en la portada raíz (NAP-F3, visitante Público).
 * Depende del SDK `@touchcastllc/napster-companion-api`, de
 * `api.createAvatarSession`/`queueAvatarSessionEnd` y del router de tools.
 * El micrófono y la red solo se tocan tras el clic en «Conversar con video y
 * voz»; sin ese clic no hay `init` ni `getToken`. Si el video falla (409, 503,
 * SDK, WebRTC o micrófono), la tarjeta pasa al recorrido fijo de lectura.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  DataChannelMessageType,
  NapsterCompanionApiSdk,
  type NapsterCompanionApiConfig,
  type NapsterCompanionApiInstance,
} from '@touchcastllc/napster-companion-api';
import type { AvatarLang, AvatarVisitor } from '@fiestapay/shared';
import { AvatarSessionError, api } from '../../api/client';
import { createAvatarToolRouter, type AvatarToolRouter } from './toolRouter';

export type NapsterSessionStatus = 'idle' | 'connecting' | 'live' | 'fallback';
export type NapsterFallbackReason = 'busy' | 'unavailable' | 'reading';

/**
 * Evento de servidor tal como lo entrega `onData` (NAP-F3: el SDK no exporta
 * `EventMessage` desde su índice, así que se deriva del tipo del callback).
 */
type NapsterServerEvent = Parameters<NonNullable<NapsterCompanionApiConfig['onData']>>[0];

export interface NapsterCaption {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  done: boolean;
}

/** Tope de espera en 429: Retry-After con máximo de 5 s y un solo reintento. */
export const AVATAR_RETRY_MAX_MS = 5_000;
const MAX_CAPTIONS = 50;

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

export interface UseNapsterSessionOptions {
  lang: AvatarLang;
  visitor?: AvatarVisitor;
  containerRef: RefObject<HTMLDivElement | null>;
}

export interface UseNapsterSession {
  status: NapsterSessionStatus;
  reason: NapsterFallbackReason;
  captions: NapsterCaption[];
  /** Solo el clic en «Conversar» lo llama; sin clic no hay sesión. */
  start: () => void;
  /** Terminar visible: destruye el widget y cierra el handle. */
  stop: () => void;
  /** «Prefiero leer»: recorrido fijo sin tocar la red ni el SDK. */
  readInstead: () => void;
  /** Punto de extensión del modo texto conversacional (otro frente). */
  startTextMode: () => void;
  /** Avisa al agente de un cambio de sección (solo con sesión lista). */
  notifyLocation: (message: string) => void;
}

export function useNapsterSession(options: UseNapsterSessionOptions): UseNapsterSession {
  const visitor = options.visitor ?? 'public';
  const [requested, setRequested] = useState(false);
  const [status, setStatus] = useState<NapsterSessionStatus>('idle');
  const [reason, setReason] = useState<NapsterFallbackReason>('unavailable');
  const [captions, setCaptions] = useState<NapsterCaption[]>([]);

  const langRef = useRef(options.lang);
  langRef.current = options.lang;
  const requestedRef = useRef(false);
  const instanceRef = useRef<NapsterCompanionApiInstance | null>(null);
  const handleRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const mintErrorRef = useRef<AvatarSessionError | null>(null);
  const captionIdRef = useRef(0);
  const routerRef = useRef<AvatarToolRouter | null>(null);
  if (!routerRef.current) routerRef.current = createAvatarToolRouter({ visitor });

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

  const notifyLocation = useCallback(
    (message: string): void => {
      // NAP-F3: contexto best-effort, solo tras avatar lista (doc client-commands).
      if (!readyRef.current || !instanceRef.current) return;
      sendCommand({
        type: DataChannelMessageType.SEND_MESSAGE,
        data: { role: 'system', text: message, trigger_response: false },
      });
    },
    [sendCommand],
  );

  const start = useCallback((): void => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    setCaptions([]);
    setStatus('connecting');
    setRequested(true);
  }, []);

  const stop = useCallback((): void => {
    requestedRef.current = false;
    setRequested(false);
    setStatus('idle');
  }, []);

  const readInstead = useCallback((): void => {
    setReason('reading');
    setStatus('fallback');
  }, []);

  /**
   * NAP-F3: punto de extensión del modo texto conversacional de Napster
   * (websocket). Llega en otro frente; mientras tanto ofrece la lectura.
   */
  const startTextMode = useCallback((): void => {
    readInstead();
  }, [readInstead]);

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

    const toFallbackFromMintError = (): void => {
      toFallback(mintErrorRef.current?.code === 'avatar_busy' ? 'busy' : 'unavailable');
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
      mintErrorRef.current = null;
      try {
        try {
          const session = await api.createAvatarSession({ lang: langRef.current, intent: 'create' });
          handleRef.current = session.handle;
          return session.token;
        } catch (error) {
          if (!(error instanceof AvatarSessionError) || error.code !== 'avatar_rate_limited') {
            throw error;
          }
          await sleep(retryDelayMs(error.retryAfterSec));
          const retry = await api.createAvatarSession({ lang: langRef.current, intent: 'create' });
          handleRef.current = retry.handle;
          return retry.token;
        }
      } catch (error) {
        if (error instanceof AvatarSessionError) mintErrorRef.current = error;
        throw error;
      }
    };

    const pushCaption = (message: unknown): void => {
      if (!message || typeof message !== 'object') return;
      const record = message as { action?: unknown; content?: unknown; role?: unknown };
      if (typeof record.content !== 'string' || record.content.length === 0) return;
      const role: NapsterCaption['role'] = record.role === 'user' ? 'user' : 'assistant';
      const delta = record.action === 'delta';
      const text = record.content;
      setCaptions((prev) => {
        const last = prev[prev.length - 1];
        if (delta && last && !last.done && last.role === role) {
          const next = [...prev];
          next[next.length - 1] = { ...last, text: last.text + text };
          return next;
        }
        captionIdRef.current += 1;
        const next = [...prev, { id: captionIdRef.current, role, text, done: !delta }];
        return next.slice(-MAX_CAPTIONS);
      });
    };

    const handleToolCall = async (data: Record<string, unknown> | undefined): Promise<void> => {
      const callId = typeof data?.call_id === 'string' ? data.call_id : '';
      if (!callId || !instanceRef.current) return;
      const output = await routerRef.current!.route({
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
        case 'message_received':
          pushCaption(data.message);
          break;
        case 'function_implicitly_called':
          void handleToolCall(data);
          break;
        case 'avatar_state_changed':
          if (data.state === 'ready') markLive();
          break;
        case 'session_expired':
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
          // Micrófono denegado: respaldo fijo en vez del video.
          if (sessionStatus === 'permissionBlocked') toFallback('unavailable');
        },
        onError: () => {
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

    // Única vía de cierre: al terminar, al fallar, al desmontar o en pagehide
    // (este último pasa por stop/onPageHide pero ejecuta el mismo código).
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
  }, [requested]);

  useEffect(() => {
    const onPageHide = (): void => {
      const instance = instanceRef.current;
      instanceRef.current = null;
      try {
        instance?.destroy();
      } catch {
        // Salir de la página nunca queda bloqueado por el widget.
      }
      const handle = handleRef.current;
      handleRef.current = null;
      if (handle) api.queueAvatarSessionEnd(handle);
      requestedRef.current = false;
      setRequested(false);
      setStatus('idle');
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  return { status, reason, captions, start, stop, readInstead, startTextMode, notifyLocation };
}

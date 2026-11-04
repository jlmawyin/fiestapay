import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceInvitationAgent } from '../components/voice/VoiceInvitationAgent';
import { api } from '../api/client';
import type { Capabilities } from '../types';
import {
  FALLBACK_SPEECH_RATE,
  SpanishSpeechFallback,
  pickSpanishVoice,
} from '../voice/fallback-speech';
import { friendlyVoiceError } from '../voice/lifecycle';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class MockSocket {
  static OPEN = 1;
  static instances: MockSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => Promise<void>) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
  });
  constructor() {
    MockSocket.instances.push(this);
  }
}

class MockAudioContext {
  sampleRate = 48000;
  state = 'running';
  currentTime = 0;
  destination = {};
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  resume = vi.fn(async () => undefined);
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
  createScriptProcessor = vi.fn(() => ({ connect: vi.fn(), onaudioprocess: null }));
  createGain = vi.fn(() => ({ connect: vi.fn(), gain: { value: 1 } }));
}

const capabilities: Capabilities = {
  voice: true,
  chat: false,
  paypal: false,
  paypalClientId: null,
  sandbox: true,
  email: false,
};
const mockToken = {
  token: 'audit-token-xyz',
  leaseId: 'audit-lease-123',
  sessionConfig: {},
  maxSeconds: 180,
  audience: 'public' as const,
};

let stopTrack: ReturnType<typeof vi.fn>;
let stream: MediaStream;
let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  MockSocket.instances = [];
  stopTrack = vi.fn();
  stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('WebSocket', MockSocket);
  vi.stubGlobal('AudioContext', MockAudioContext);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  vi.spyOn(api, 'getPublicVoiceToken').mockResolvedValue(mockToken);
  vi.spyOn(api, 'getVoiceToken').mockResolvedValue(mockToken);
  vi.spyOn(api, 'markVoiceActivity').mockResolvedValue({ ok: true, active: true });
  vi.spyOn(api, 'releaseVoiceLease').mockResolvedValue({
    ok: true,
    released: true,
    alreadyReleased: false,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Auditoría independiente de voz en navegador (Web / UI)', () => {
  describe('Respaldo de voz en español (fallback-speech.ts)', () => {
    it('cumple con el rango de velocidad 0.95 a 1.0 requerido', () => {
      expect(FALLBACK_SPEECH_RATE).toBeGreaterThanOrEqual(0.95);
      expect(FALLBACK_SPEECH_RATE).toBeLessThanOrEqual(1.0);
    });

    it('prioriza es-ES, luego es-US, luego cualquier español, y rechaza sin español', () => {
      const voices: SpeechSynthesisVoice[] = [
        { lang: 'en-US', name: 'English US' } as SpeechSynthesisVoice,
        { lang: 'fr-FR', name: 'French' } as SpeechSynthesisVoice,
        { lang: 'es-MX', name: 'Spanish Mexico' } as SpeechSynthesisVoice,
        { lang: 'es-US', name: 'Spanish US' } as SpeechSynthesisVoice,
        { lang: 'es-ES', name: 'Spanish Spain' } as SpeechSynthesisVoice,
      ];
      expect(pickSpanishVoice(voices)?.lang).toBe('es-ES');

      const withoutEs = voices.filter((v) => v.lang !== 'es-ES');
      expect(pickSpanishVoice(withoutEs)?.lang).toBe('es-US');

      const onlyMx = voices.filter((v) => v.lang === 'es-MX');
      expect(pickSpanishVoice(onlyMx)?.lang).toBe('es-MX');

      const nonSpanish = voices.filter((v) => !v.lang.startsWith('es'));
      expect(pickSpanishVoice(nonSpanish)).toBeNull();
    });

    it('encola frases sin cancelar la locución que está reproduciéndose', () => {
      const cancelFn = vi.fn();
      const speakFn = vi.fn();
      const mockSynth = {
        speaking: true,
        cancel: cancelFn,
        speak: speakFn,
        getVoices: () => [{ lang: 'es-ES', name: 'Castellano' } as SpeechSynthesisVoice],
      };
      const fallback = new SpanishSpeechFallback(mockSynth, (t) => ({
        text: t,
        lang: 'es-ES',
        rate: 0.97,
        voice: null,
      }));

      fallback.speak('Primera frase');
      expect(cancelFn).not.toHaveBeenCalled();

      fallback.speak('Segunda frase');
      expect(cancelFn).not.toHaveBeenCalled();
      expect(speakFn).toHaveBeenCalledTimes(2);
    });

    it('no cae en una voz por defecto no española si no hay ninguna voz española', () => {
      const speak = vi.fn();
      const fallback = new SpanishSpeechFallback({ speaking: false, cancel: vi.fn(), speak, getVoices: () => [{lang: 'en-US'} as SpeechSynthesisVoice] }, text => ({text, lang: '', rate: 1, voice: null}));
      expect(fallback.speak('Hola')).toBe(false);
      expect(speak).not.toHaveBeenCalled();
    });
  });

  describe('Ciclo de vida y liberación ante eventos de página', () => {
    it('llama a releaseVoiceLease con keepalive: true en pagehide y beforeunload', async () => {
      render(
        <VoiceInvitationAgent
          audience="public"
          capabilities={capabilities}
          onShowToast={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /Escuchar información/ }));

      await waitFor(() => expect(api.getPublicVoiceToken).toHaveBeenCalledTimes(1));

      // Simular pagehide
      window.dispatchEvent(new Event('pagehide'));
      expect(api.releaseVoiceLease).toHaveBeenCalledWith('audit-lease-123', 'pagehide', true);

      // Simular beforeunload
      window.dispatchEvent(new Event('beforeunload'));
      expect(api.releaseVoiceLease).toHaveBeenCalledWith('audit-lease-123', 'pagehide', true);
    });

    it('detener y cerrar libera el lease y limpia el micrófono', async () => {
      render(
        <VoiceInvitationAgent
          audience="public"
          capabilities={capabilities}
          onShowToast={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /Escuchar información/ }));

      await waitFor(() => expect(api.getPublicVoiceToken).toHaveBeenCalledTimes(1));

      const stopButton = await screen.findByRole('button', { name: /Detener y Cerrar/ });
      fireEvent.click(stopButton);

      expect(api.releaseVoiceLease).toHaveBeenCalledWith('audit-lease-123', 'stop', false);
      expect(stopTrack).toHaveBeenCalled();
    });
  });

  describe('Cooldown de 15s tras rate limit y mensajes amigables en español', () => {
    it('activa cooldown tras error 429 y no permite reintentar de inmediato', async () => {
      vi.mocked(api.getPublicVoiceToken).mockRejectedValueOnce({
        status: 429,
        message: 'Has iniciado demasiadas sesiones de voz.',
      });

      render(
        <VoiceInvitationAgent
          audience="public"
          capabilities={capabilities}
          onShowToast={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /Escuchar información/ }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // El error visible debe ser en español y amable
      expect(screen.getByRole('alert')).toHaveTextContent(
        'La voz no está disponible por ahora. Espera unos segundos y vuelve a intentarlo, o continúa por texto.',
      );

      // El botón debe quedar deshabilitado indicando espera
      const btn = screen.getByRole('button', { name: /Escuchar información/ });
      expect(btn).toBeDisabled();
      expect(screen.getByText(/Espera \d+ s antes de reintentar/)).toBeInTheDocument();
    });

    it('friendlyVoiceError no expone texto en inglés ni detalles crudos del proveedor', () => {
      const rawError = {
        status: 503,
        message: 'AssemblyAI upstream provider timeout: connection reset by peer',
      };
      const translated = friendlyVoiceError(rawError);
      expect(translated).not.toContain('AssemblyAI');
      expect(translated).not.toContain('timeout');
      expect(translated).toBe(
        'El servicio de voz no está disponible en este momento. Puedes continuar por texto.',
      );
    });
  });

  describe('Auditoría de fuga de lease: token recibido tras stop (losttokenafterstop)', () => {
    it('libera un token HTTP que llega después de pulsar Detener', async () => {
      const pendingToken = deferred<typeof mockToken>();
      vi.mocked(api.getPublicVoiceToken).mockReturnValueOnce(pendingToken.promise);

      render(
        <VoiceInvitationAgent
          audience="public"
          capabilities={capabilities}
          onShowToast={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /Escuchar información/ }));

      // Token request está pendiente en el backend
      await waitFor(() => expect(api.getPublicVoiceToken).toHaveBeenCalledTimes(1));

      // Usuario pulsa "Detener y Cerrar Micrófono" mientras el token aún no ha respondido
      const stopBtn = await screen.findByRole('button', { name: /Detener y Cerrar/ });
      fireEvent.click(stopBtn);

      // Ahora el backend responde con el token reservado
      await act(async () => {
        pendingToken.resolve({
          ...mockToken,
          leaseId: 'orphaned-lease-after-stop',
        });
      });

      // La generación cancelada debe soltar también una reserva cuya respuesta llegó tarde.
      const releaseCalls = vi.mocked(api.releaseVoiceLease).mock.calls;
      const releasedOrphan = releaseCalls.some((call) => call[0] === 'orphaned-lease-after-stop');

      expect(releasedOrphan).toBe(true);
    });
  });
});

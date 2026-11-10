import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOCALES,
  SHOW_ON_SCREEN_DECLARATION,
  UI_LABELS,
  type GeminiVoiceSessionConfig,
} from '@fiestapay/shared';
import { createGeminiVoiceSession, type GeminiVoiceTokenRequest } from '../src/ai/gemini-live.js';
import { publicChatInstruction } from '../src/ai/public-chat.js';
import { loadConfig, type GeminiConfig } from '../src/config.js';
import {
  organizerVoiceSessionConfig,
  organizerVoiceInstruction,
} from '../src/routes/organizer-assistant.js';
import {
  guestVoiceInstruction,
  publicVoiceInstruction,
  publicVoiceSessionConfig,
  voiceSessionConfig,
} from '../src/routes/voice.js';

const PUBLIC_TOOLS = [{ functionDeclarations: [SHOW_ON_SCREEN_DECLARATION] }];

const GEMINI: GeminiConfig = {
  apiKey: 'test-gemini-key',
  liveModel: 'gemini-3.8-live',
  textModel: 'gemini-3.5-flash',
  timeoutMs: 20_000,
  maxToolRounds: 4,
  maxHistoryMessages: 24,
  maxOutputTokens: 2000,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('interruptor VOICE_SCREEN_GUIDE', () => {
  it('esta activo por defecto y acepta on explicito', () => {
    expect(loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).voice.screenGuide).toBe(true);
    expect(loadConfig({ NODE_ENV: 'test', VOICE_SCREEN_GUIDE: 'on' } as NodeJS.ProcessEnv).voice.screenGuide)
      .toBe(true);
  });

  it('se apaga solo con off', () => {
    expect(loadConfig({ NODE_ENV: 'test', VOICE_SCREEN_GUIDE: 'off' } as NodeJS.ProcessEnv).voice.screenGuide)
      .toBe(false);
  });

  it('un valor invalido vuelve a on con un aviso fijo que no repite el valor', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invalid = 'valor-secreto-inventado';
    const config = loadConfig({ NODE_ENV: 'test', VOICE_SCREEN_GUIDE: invalid } as NodeJS.ProcessEnv);
    expect(config.voice.screenGuide).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/VOICE_SCREEN_GUIDE invalido/i);
    expect(String(warn.mock.calls[0]![0])).not.toContain(invalid);
  });
});

describe('declaracion publica de show_on_screen', () => {
  it('la voz publica recibe exactamente la declaracion del contrato', () => {
    expect(publicVoiceSessionConfig({}).tools).toEqual(PUBLIC_TOOLS);
  });

  it('con el interruptor en off no declara herramientas', () => {
    expect(publicVoiceSessionConfig({}, 'es', 'landing', false).tools).toEqual([]);
  });

  it('invitado y organizador no reciben la herramienta publica', () => {
    expect(voiceSessionConfig({}).tools).not.toContainEqual({ functionDeclarations: [SHOW_ON_SCREEN_DECLARATION] });
    expect(organizerVoiceSessionConfig('Cena', 'cena', {}).tools)
      .not.toContainEqual({ functionDeclarations: [SHOW_ON_SCREEN_DECLARATION] });
    expect(voiceSessionConfig({}).system_prompt).toBe(guestVoiceInstruction());
    expect(organizerVoiceSessionConfig('Cena', 'cena', {}).system_prompt)
      .toBe(organizerVoiceInstruction('Cena', 'cena'));
  });

  it('el token efimero de Gemini fija la misma declaracion y el mismo liveConfig', async () => {
    const requests: GeminiVoiceTokenRequest[] = [];
    const issued = await createGeminiVoiceSession(
      GEMINI,
      async (request) => {
        requests.push(structuredClone(request));
        return 'auth_tokens/test';
      },
      {
        locale: 'es',
        maxSeconds: 120,
        systemInstruction: 'instruccion',
        kickoff: 'saludo',
        tools: [SHOW_ON_SCREEN_DECLARATION],
      },
    );
    const sessionConfig = issued.sessionConfig as GeminiVoiceSessionConfig;
    expect(sessionConfig.liveConfig.tools).toEqual(PUBLIC_TOOLS);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.liveConfig).toEqual(sessionConfig.liveConfig);
  });

  it('con off el token efimero no fija herramientas', async () => {
    const requests: GeminiVoiceTokenRequest[] = [];
    const issued = await createGeminiVoiceSession(
      GEMINI,
      async (request) => {
        requests.push(structuredClone(request));
        return 'auth_tokens/test';
      },
      {
        locale: 'es',
        maxSeconds: 120,
        systemInstruction: 'instruccion',
        kickoff: 'saludo',
        tools: [],
      },
    );
    expect(issued.sessionConfig.liveConfig.tools).toEqual([]);
    expect(requests[0]!.liveConfig.tools).toEqual([]);
  });
});

describe.each(LOCALES)('instruccion publica con guia de pantalla (%s)', (locale) => {
  const labels = UI_LABELS[locale];

  it('explica la herramienta, la accion de la persona y la pagina actual por resultado', () => {
    const prompt = publicVoiceInstruction(locale, 'landing');
    expect(prompt).toContain('show_on_screen');
    expect(prompt).toContain(labels.judgesDemo);
    expect(prompt).toContain(labels.paymentDemo);
    expect(prompt).toContain(labels.guidedTour);
    expect(prompt).toMatch(locale === 'en' ? /latest successful show_on_screen result/i : /último resultado correcto de show_on_screen/i);
    expect(prompt).toMatch(locale === 'en' ? /must press the button themselves/i : /es ella quien pulsa el botón/i);
    expect(prompt).toMatch(locale === 'en' ? /never say you pressed/i : /nunca digas que pulsaste/i);
  });

  it('incluye el recorrido DEMO_TOUR paso a paso y el maximo de un reintento', () => {
    const prompt = publicVoiceInstruction(locale, 'demo');
    expect(prompt).toContain('DEMO_TOUR');
    expect(prompt).toContain('previewPanel');
    expect(prompt).toContain('paymentDemo');
    expect(prompt).toContain('paypalAiPanel');
    expect(prompt).toContain('ok:false');
    expect(prompt).toMatch(locale === 'en' ? /at most one retry/i : /como máximo un reintento/i);
    expect(prompt).toMatch(locale === 'en' ? /say "next"/i : /diga «siguiente»/i);
  });

  it('sin la herramienta conserva la instruccion anterior sin show_on_screen', () => {
    const prompt = publicVoiceInstruction(locale, 'landing', false);
    expect(prompt).not.toContain('show_on_screen');
    expect(prompt).toContain(locale === 'en' ? 'You have no tools' : 'No tienes herramientas');
  });

  it('la guia de texto publica cita la etiqueta guiada y los nombres entre comillas tocables', () => {
    const prompt = publicChatInstruction(locale, 'landing');
    expect(prompt).toContain(labels.guidedTour);
    expect(prompt).toContain(labels.judgesDemo);
    expect(prompt).toMatch(locale === 'en' ? /quoted in this chat can be tapped/i : /entre comillas dobles en este chat se pueden tocar/i);
  });
});

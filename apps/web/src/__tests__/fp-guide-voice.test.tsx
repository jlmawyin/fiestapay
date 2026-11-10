import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHOW_ON_SCREEN_TOOL, type UiPage } from '@fiestapay/shared';
import { VoiceInvitationAgent } from '../components/voice/VoiceInvitationAgent';
import { AssistantOrb } from '../components/assistant/AssistantOrb';
import { GuideOverlay } from '../guide/GuideOverlay';
import { api } from '../api/client';
import { setActiveLocale } from '../i18n/locale-store';
import type {
  GeminiLiveCallbacks,
  GeminiLiveConnector,
  GeminiLiveSessionHandle,
  GeminiLiveToolResponse,
} from '../voice/gemini-live';
import {
  GUIDE_ACTION_EVENT,
  GUIDE_HIDDEN_EVENT,
  GUIDE_SHOW_EVENT,
  GUIDE_VISIBLE_EVENT,
  VOICE_ACTIVITY_EVENT,
  VOICE_STOP_EVENT,
  registerGuideNavigator,
  startGuidedTour,
  type GuideVisibleDetail,
  type VoiceActivityDetail,
} from '../guide/showOnScreen';
import type { Capabilities } from '../types';

interface FakeGeminiSession extends GeminiLiveSessionHandle {
  callbacks: GeminiLiveCallbacks;
  toolResponses: GeminiLiveToolResponse[][];
  closeCalls: number;
}

function createFakeGemini() {
  const sessions: FakeGeminiSession[] = [];
  const connector: GeminiLiveConnector = async (options) => {
    let closed = false;
    const session: FakeGeminiSession = {
      callbacks: options.callbacks,
      toolResponses: [],
      closeCalls: 0,
      get closed() {
        return closed;
      },
      sendAudio: () => undefined,
      sendKickoff: () => undefined,
      sendToolResponse: (responses: GeminiLiveToolResponse[]) => {
        session.toolResponses.push(responses);
      },
      close: () => {
        closed = true;
        session.closeCalls += 1;
      },
    };
    sessions.push(session);
    return session;
  };
  return { connector, sessions };
}

class MockSource {
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn(() => {
    this.onended?.();
  });
}

class MockAudioContext {
  static sources: MockSource[] = [];
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
  createBuffer = vi.fn((_channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
  }));
  createBufferSource = vi.fn(() => {
    const source = new MockSource();
    MockAudioContext.sources.push(source);
    return source;
  });
}

const capabilities: Capabilities = {
  voice: true,
  voiceProvider: 'gemini',
  chat: false,
  paypal: false,
  paypalClientId: null,
  sandbox: true,
  email: false,
};

const LIVE_CONFIG_BASE = {
  responseModalities: ['AUDIO'],
  systemInstruction: 'Eres el asistente de voz.',
  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
  inputAudioTranscription: {},
  outputAudioTranscription: {},
};

function publicToken(liveConfig: unknown) {
  return {
    token: 'auth_tokens/fake-public-guide',
    sessionConfig: {
      provider: 'gemini',
      model: 'gemini-3.8-live',
      apiVersion: 'v1beta',
      liveConfig,
      kickoff: 'Saluda con información general.',
      locale: 'es',
    },
    maxSeconds: 60,
    leaseId: 'gemini-lease-public-guide',
    audience: 'public',
    provider: 'gemini',
  } as const;
}

const guideLiveConfig = {
  ...LIVE_CONFIG_BASE,
  tools: [
    {
      functionDeclarations: [
        {
          name: SHOW_ON_SCREEN_TOOL,
          description: 'Opens one page and highlights one element.',
          parameters: { type: 'OBJECT', properties: {} },
        },
      ],
    },
  ],
};
const plainLiveConfig = { ...LIVE_CONFIG_BASE, tools: [] };

let fixtures: HTMLElement[] = [];

function addFixture(id: string, tag = 'button', text?: string): HTMLElement {
  const element = document.createElement(tag);
  element.setAttribute('data-guide', id);
  element.textContent = text ?? id;
  element.scrollIntoView = vi.fn();
  document.body.appendChild(element);
  fixtures.push(element);
  return element;
}

function useFakeNavigator(initial: UiPage | null = 'landing') {
  const state = { current: initial, navigations: [] as UiPage[] };
  registerGuideNavigator({
    navigate: (page) => {
      state.navigations.push(page);
      state.current = page;
    },
    getCurrentPage: () => state.current,
  });
  return state;
}

function startPublicVoice(fake: ReturnType<typeof createFakeGemini>, context: 'landing' | 'demo' = 'landing') {
  render(
    <VoiceInvitationAgent
      audience="public"
      context={context}
      capabilities={capabilities}
      guest={null}
      onShowToast={vi.fn()}
      geminiLiveConnector={fake.connector}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Escuchar información por voz/ }));
}

async function openGemini(fake: ReturnType<typeof createFakeGemini>): Promise<FakeGeminiSession> {
  await waitFor(() => expect(fake.sessions).toHaveLength(1));
  const session = fake.sessions[0]!;
  await act(async () => {
    session.callbacks.onOpen?.();
  });
  return session;
}

beforeEach(() => {
  MockAudioContext.sources = [];
  localStorage.clear();
  setActiveLocale('es');
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  vi.stubGlobal('AudioContext', MockAudioContext);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
  vi.spyOn(api, 'getPublicVoiceToken').mockResolvedValue(publicToken(guideLiveConfig) as never);
  vi.spyOn(api, 'markVoiceActivity').mockResolvedValue({ ok: true, active: true });
  vi.spyOn(api, 'releaseVoiceLease').mockResolvedValue({ ok: true, released: true, alreadyReleased: false });
  vi.spyOn(api, 'executeVoiceTool').mockResolvedValue({ response: { ok: true } });
  vi.spyOn(api, 'executeOrganizerVoiceTool').mockResolvedValue({ response: { ok: true } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const fixture of fixtures) fixture.remove();
  fixtures = [];
  registerGuideNavigator(null);
  localStorage.clear();
  setActiveLocale('es');
});

describe('FP-GUIDE-1 public voice tool', () => {
  it('answers show_on_screen in the browser with the current page', async () => {
    useFakeNavigator('landing');
    addFixture('myInvitations', 'button', 'Mis invitaciones');
    const fake = createFakeGemini();
    startPublicVoice(fake);
    const session = await openGemini(fake);

    await act(async () => {
      session.callbacks.onToolCalls?.([
        { id: 'guide-1', name: SHOW_ON_SCREEN_TOOL, args: { target: 'myInvitations' } },
      ]);
    });

    await waitFor(() => expect(session.toolResponses).toHaveLength(1));
    expect(session.toolResponses[0]).toEqual([
      {
        id: 'guide-1',
        name: SHOW_ON_SCREEN_TOOL,
        response: { ok: true, page: 'landing', target: 'myInvitations' },
      },
    ]);
    expect(api.executeVoiceTool).not.toHaveBeenCalled();
    expect(api.executeOrganizerVoiceTool).not.toHaveBeenCalled();
  });

  it('rejects invalid guide arguments without acting', async () => {
    const nav = useFakeNavigator('landing');
    const fake = createFakeGemini();
    startPublicVoice(fake);
    const session = await openGemini(fake);

    await act(async () => {
      session.callbacks.onToolCalls?.([
        { id: 'guide-bad', name: SHOW_ON_SCREEN_TOOL, args: { url: 'https://evil.test/demo' } },
      ]);
    });

    await waitFor(() => expect(session.toolResponses).toHaveLength(1));
    expect(session.toolResponses[0]).toEqual([
      {
        id: 'guide-bad',
        name: SHOW_ON_SCREEN_TOOL,
        response: { ok: false, reason: 'invalid_args', page: 'landing' },
      },
    ]);
    expect(nav.navigations).toEqual([]);
  });

  it('ignores other public tools even with the guide switch on', async () => {
    useFakeNavigator('landing');
    const fake = createFakeGemini();
    startPublicVoice(fake);
    const session = await openGemini(fake);

    await act(async () => {
      session.callbacks.onToolCalls?.([{ id: 'other-1', name: 'prepare_quote', args: {} }]);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(session.toolResponses).toHaveLength(0);
    expect(api.executeVoiceTool).not.toHaveBeenCalled();
  });

  it('ignores guide calls when the session does not declare the tool', async () => {
    vi.mocked(api.getPublicVoiceToken).mockResolvedValue(publicToken(plainLiveConfig) as never);
    useFakeNavigator('landing');
    addFixture('myInvitations', 'button', 'Mis invitaciones');
    const fake = createFakeGemini();
    startPublicVoice(fake);
    const session = await openGemini(fake);

    await act(async () => {
      session.callbacks.onToolCalls?.([
        { id: 'guide-off', name: SHOW_ON_SCREEN_TOOL, args: { target: 'myInvitations' } },
      ]);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(session.toolResponses).toHaveLength(0);
  });
});

describe('FP-GUIDE-1 voice session follows public pages', () => {
  it('stays alive across public pages when the tool is present', async () => {
    useFakeNavigator('landing');
    const fake = createFakeGemini();
    const view = render(
      <VoiceInvitationAgent
        audience="public"
        context="landing"
        capabilities={capabilities}
        guest={null}
        onShowToast={vi.fn()}
        geminiLiveConnector={fake.connector}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Escuchar información por voz/ }));
    const session = await openGemini(fake);
    expect(screen.getByText('Escuchando tu voz...')).toBeInTheDocument();

    view.rerender(
      <VoiceInvitationAgent
        audience="public"
        context="demo"
        capabilities={capabilities}
        guest={null}
        onShowToast={vi.fn()}
        geminiLiveConnector={fake.connector}
      />,
    );

    expect(screen.getByText('Escuchando tu voz...')).toBeInTheDocument();
    expect(session.closeCalls).toBe(0);
    expect(api.releaseVoiceLease).not.toHaveBeenCalled();
  });

  it('still stops on context change without the tool', async () => {
    vi.mocked(api.getPublicVoiceToken).mockResolvedValue(publicToken(plainLiveConfig) as never);
    useFakeNavigator('landing');
    const fake = createFakeGemini();
    const onShowToast = vi.fn();
    const view = render(
      <VoiceInvitationAgent
        audience="public"
        context="landing"
        capabilities={capabilities}
        guest={null}
        onShowToast={onShowToast}
        geminiLiveConnector={fake.connector}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Escuchar información por voz/ }));
    await openGemini(fake);
    expect(screen.getByText('Escuchando tu voz...')).toBeInTheDocument();

    view.rerender(
      <VoiceInvitationAgent
        audience="public"
        context="demo"
        capabilities={capabilities}
        guest={null}
        onShowToast={onShowToast}
        geminiLiveConnector={fake.connector}
      />,
    );

    expect(api.releaseVoiceLease).toHaveBeenCalledWith(
      'gemini-lease-public-guide',
      'context_change',
      false,
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});

describe('FP-GUIDE-1 voice mini-bar', () => {
  function dispatchActivity(detail: VoiceActivityDetail): void {
    act(() => {
      document.dispatchEvent(new CustomEvent(VOICE_ACTIVITY_EVENT, { detail }));
    });
  }

  function openVoicePane(): void {
    render(<AssistantOrb audience="public" capabilities={capabilities} onShowToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Agente FiestaPay' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Hablar' }));
    expect(screen.getByRole('dialog', { name: 'Agente FiestaPay' })).toBeVisible();
  }

  it('shows the floating bar while voice is live and a guide action runs', () => {
    openVoicePane();
    dispatchActivity({ active: true, status: 'speaking', audience: 'public' });
    act(() => {
      document.dispatchEvent(new CustomEvent(GUIDE_ACTION_EVENT, { detail: {} }));
    });

    const bar = screen.getByTestId('voice-guide-bar');
    expect(bar).toHaveTextContent('Hablando…');
    expect(screen.getByRole('button', { name: 'Detener' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Agente FiestaPay' })).toBeNull();
  });

  it('parks the bar opposite the highlight and restores on hide', () => {
    openVoicePane();
    dispatchActivity({ active: true, status: 'listening', audience: 'public' });
    act(() => {
      document.dispatchEvent(new CustomEvent(GUIDE_ACTION_EVENT, { detail: {} }));
    });
    expect(screen.getByTestId('voice-guide-bar')).toHaveTextContent('Escuchando…');

    act(() => {
      document.dispatchEvent(
        new CustomEvent<GuideVisibleDetail>(GUIDE_VISIBLE_EVENT, {
          detail: { target: 'myInvitations', placement: 'top' },
        }),
      );
    });
    expect(screen.getByTestId('voice-guide-bar')).toHaveAttribute('data-placement', 'top');

    act(() => {
      document.dispatchEvent(new CustomEvent(GUIDE_HIDDEN_EVENT));
    });
    expect(screen.queryByTestId('voice-guide-bar')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Agente FiestaPay' })).toBeVisible();
  });

  it('Detener asks voice to stop and Abrir restores the panel', () => {
    openVoicePane();
    dispatchActivity({ active: true, status: 'listening', audience: 'public' });
    act(() => {
      document.dispatchEvent(new CustomEvent(GUIDE_ACTION_EVENT, { detail: {} }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.queryByTestId('voice-guide-bar')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Agente FiestaPay' })).toBeVisible();

    dispatchActivity({ active: true, status: 'listening', audience: 'public' });
    act(() => {
      document.dispatchEvent(new CustomEvent(GUIDE_ACTION_EVENT, { detail: {} }));
    });
    const stops: Event[] = [];
    const onStop = (event: Event) => {
      stops.push(event);
    };
    document.addEventListener(VOICE_STOP_EVENT, onStop);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Detener' }));
      expect(stops).toHaveLength(1);
    } finally {
      document.removeEventListener(VOICE_STOP_EVENT, onStop);
    }
    // The mounted voice panel stops through its usual path and reports inactive.
    expect(screen.queryByTestId('voice-guide-bar')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Agente FiestaPay' })).toBeVisible();
  });

  it('restores the panel 5 s after a navigation-only action', async () => {
    vi.useFakeTimers();
    openVoicePane();
    dispatchActivity({ active: true, status: 'listening', audience: 'public' });
    act(() => {
      document.dispatchEvent(new CustomEvent(GUIDE_ACTION_EVENT, { detail: { page: 'demo' } }));
    });
    expect(screen.getByTestId('voice-guide-bar')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.queryByTestId('voice-guide-bar')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Agente FiestaPay' })).toBeVisible();
  });

  it('minimizes without a bar when voice is idle', () => {
    render(<AssistantOrb audience="public" capabilities={capabilities} onShowToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Agente FiestaPay' }));
    expect(screen.getByRole('dialog', { name: 'Agente FiestaPay' })).toBeVisible();
    act(() => {
      document.dispatchEvent(new CustomEvent(GUIDE_ACTION_EVENT, { detail: {} }));
    });
    expect(screen.queryByTestId('voice-guide-bar')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Agente FiestaPay' })).toBeNull();
  });
});

describe('FP-GUIDE-1 highlight lifetime with voice', () => {
  function showHighlight(target: string): void {
    act(() => {
      document.dispatchEvent(new CustomEvent(GUIDE_SHOW_EVENT, { detail: { target } }));
    });
  }

  function setVoiceActive(active: boolean): void {
    act(() => {
      document.dispatchEvent(
        new CustomEvent<VoiceActivityDetail>(VOICE_ACTIVITY_EVENT, {
          detail: { active, status: active ? 'speaking' : 'listening', audience: 'public' },
        }),
      );
    });
  }

  it('keeps the highlight open past 12 s while voice is live', async () => {
    vi.useFakeTimers();
    render(<GuideOverlay />);
    addFixture('myInvitations', 'button', 'Destino cabecera');
    setVoiceActive(true);
    showHighlight('myInvitations');
    expect(screen.getByTestId('guide-bubble')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(screen.getByTestId('guide-bubble')).toBeInTheDocument();
  });

  it('closes the highlight when the voice session ends', () => {
    render(<GuideOverlay />);
    addFixture('myInvitations', 'button', 'Destino cabecera');
    setVoiceActive(true);
    showHighlight('myInvitations');
    expect(screen.getByTestId('guide-bubble')).toBeInTheDocument();
    setVoiceActive(false);
    expect(screen.queryByTestId('guide-bubble')).toBeNull();
  });

  it('closes the guided tour when the voice session ends', () => {
    render(<GuideOverlay />);
    addFixture('previewPanel', 'section', 'Panel');
    addFixture('paymentDemo', 'button', 'Pago');
    addFixture('paypalAiPanel', 'section', 'PayPal e IA');
    setVoiceActive(true);
    act(() => {
      startGuidedTour();
    });
    expect(screen.getByTestId('guide-bubble')).toBeInTheDocument();
    setVoiceActive(false);
    expect(screen.queryByTestId('guide-bubble')).toBeNull();
  });

  it('ignores idle voice reports while a highlight is open', () => {
    render(<GuideOverlay />);
    addFixture('myInvitations', 'button', 'Destino cabecera');
    showHighlight('myInvitations');
    expect(screen.getByTestId('guide-bubble')).toBeInTheDocument();
    setVoiceActive(false);
    expect(screen.getByTestId('guide-bubble')).toBeInTheDocument();
  });

  it('reports inactive when a live panel unmounts', async () => {
    useFakeNavigator('landing');
    const seen: VoiceActivityDetail[] = [];
    const onActivity = (event: Event) => {
      seen.push((event as CustomEvent<VoiceActivityDetail>).detail);
    };
    document.addEventListener(VOICE_ACTIVITY_EVENT, onActivity);
    try {
      const fake = createFakeGemini();
      const view = render(
        <VoiceInvitationAgent
          audience="public"
          context="landing"
          capabilities={capabilities}
          guest={null}
          onShowToast={vi.fn()}
          geminiLiveConnector={fake.connector}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /Escuchar información por voz/ }));
      await openGemini(fake);
      expect(seen.some((detail) => detail.active)).toBe(true);
      view.unmount();
      expect(seen[seen.length - 1]).toMatchObject({ active: false });
    } finally {
      document.removeEventListener(VOICE_ACTIVITY_EVENT, onActivity);
    }
  });
});
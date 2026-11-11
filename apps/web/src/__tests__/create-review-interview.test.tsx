import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_LABELS, type DraftEventProposal } from '@fiestapay/shared';
import { App } from '../App';
import { CreateWizard } from '../components/events/CreateWizard';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import { api } from '../api/client';
import { composeInterviewSentence } from '../lib/create-interview';
import type { Capabilities, EventInput } from '../types';

vi.mock('../components/assistant/AssistantOrb', () => ({
  AssistantOrb: ({ audience }: { audience: string }) => (
    <div data-testid="assistant-orb" data-audience={audience} />
  ),
}));

const capabilities: Capabilities = {
  paypal: true,
  paypalClientId: 'sb-client',
  chat: false,
  voice: false,
  sandbox: true,
  email: false,
};

const pad = (n: number): string => String(n).padStart(2, '0');

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function proposal(over: Partial<DraftEventProposal> = {}): DraftEventProposal {
  const date = futureDate(12);
  return {
    template: 'comida',
    title: 'Asado del sábado',
    meal: 'almuerzo',
    date,
    startTime: '13:00',
    durationMinutes: 180,
    location: 'Parque Central',
    includes: ['Carne'],
    headcount: 10,
    budgetCents: 15000,
    perPersonCents: 1500,
    suggested: ['template', 'title', 'date', 'startTime', 'durationMinutes', 'location', 'includes', 'headcount', 'budgetCents'],
    source: 'ai',
    ...over,
  };
}

function renderEs(node: React.ReactElement): void {
  render(node);
}

function answerInterviewEs(): void {
  fireEvent.change(screen.getByLabelText('¿Qué vas a celebrar?'), { target: { value: 'Asado en casa' } });
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  fireEvent.change(screen.getByLabelText('¿Cuántas personas, incluido tú?'), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  fireEvent.change(screen.getByLabelText(/¿Cuánto debe pagar cada persona/), {
    target: { value: '15 cada uno' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  fireEvent.change(screen.getByLabelText(/¿Qué fecha y hora/), {
    target: { value: 'el sábado próximo a las 15:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.lang = 'es';
  setActiveLocale('es');
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.lang = 'es';
  setActiveLocale('es');
  window.history.replaceState({}, '', '/');
});

describe('guided interview sentence', () => {
  it('states the total budget and the per-person share in a <=400-char sentence', () => {
    const sentence = composeInterviewSentence(
      { occasion: 'BBQ at home', headcount: '10', share: '15 each', when: 'next Saturday at 3:00 PM' },
      'en',
    );
    expect(sentence).toContain('total budget of $150.00');
    expect(sentence).toContain('$15.00 per person');
    expect(sentence.length).toBeLessThanOrEqual(400);
    expect(sentence).toContain('next Saturday at 3:00 PM');

    const es = composeInterviewSentence(
      { occasion: 'Asado en casa', headcount: '10', share: '150 en total', when: '' },
      'es',
    );
    expect(es).toContain('presupuesto total de $150.00');
    expect(es).toContain('todo el grupo');
    expect(es.length).toBeLessThanOrEqual(400);
  });

  it('does not invent skipped details', () => {
    const sentence = composeInterviewSentence(
      { occasion: 'Cena en casa', headcount: '', share: '', when: '' },
      'es',
    );
    expect(sentence).toBe('Cena en casa.');
    expect(sentence).not.toContain('$');
    expect(sentence).not.toContain('personas');
  });
});

describe('guided interview flow', () => {
  it('asks one question at a time and sends one explicit draft request to the shared review', async () => {
    const draft = vi.spyOn(api, 'draftEvent').mockResolvedValue(proposal());
    renderEs(<CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} path="interview" />);

    expect(screen.getByRole('heading', { name: 'Planeemos tu fiesta en cuatro preguntas' })).toBeInTheDocument();
    answerInterviewEs();

    const sentence = screen.getByTestId('interview-sentence').textContent ?? '';
    expect(sentence).toContain('presupuesto total de $150.00');
    expect(sentence).toContain('$15.00 por persona');
    expect(sentence.length).toBeLessThanOrEqual(400);
    expect(draft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Redactar con IA' }));
    await waitFor(() => expect(draft).toHaveBeenCalledTimes(1));
    expect(draft.mock.calls[0][0].length).toBeLessThanOrEqual(400);
    expect(await screen.findByRole('heading', { name: 'Revisar y publicar' })).toBeInTheDocument();
    expect(screen.getAllByText('Asado del sábado').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Publicar invitación' })).toBeInTheDocument();
  });

  it('keeps answers and the sentence when the draft request fails, then retries explicitly', async () => {
    const draft = vi
      .spyOn(api, 'draftEvent')
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(proposal());
    renderEs(<CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} path="interview" />);
    answerInterviewEs();
    const sentence = screen.getByTestId('interview-sentence').textContent;

    fireEvent.click(screen.getByRole('button', { name: 'Redactar con IA' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tus respuestas siguen aquí');
    expect(screen.getByTestId('interview-sentence').textContent).toBe(sentence);

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(draft).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: 'Revisar y publicar' })).toBeInTheDocument();
  });

  it('does not call the AI when every question was skipped', async () => {
    const draft = vi.spyOn(api, 'draftEvent');
    renderEs(<CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} path="interview" />);
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Omitir' }));
    }
    expect(screen.getByTestId('interview-sentence').textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Redactar con IA' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Responde al menos una pregunta');
    expect(draft).not.toHaveBeenCalled();
  });

  it('switches to the manual form without a sentence or AI call', () => {
    const draft = vi.spyOn(api, 'draftEvent');
    renderEs(<CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} path="manual" />);
    expect(screen.queryByLabelText('Describe tu invitación en una frase')).toBeNull();
    expect(screen.getByLabelText(/Título del Evento/i)).toBeInTheDocument();
    expect(draft).not.toHaveBeenCalled();
  });
});

describe('incomplete draft review', () => {
  it('opens the summary, then jumps straight to the first invalid section', async () => {
    vi.spyOn(api, 'draftEvent').mockResolvedValue(proposal({ location: '', suggested: ['title', 'date', 'startTime', 'headcount', 'budgetCents'] }));
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);

    fireEvent.change(screen.getByLabelText('Describe tu invitación en una frase'), {
      target: { value: 'Asado para 10 sin lugar' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rellenar con IA' }));

    expect(await screen.findByRole('heading', { name: 'Revisar y publicar' })).toBeInTheDocument();
    expect(screen.getByText(/Faltan datos obligatorios/)).toBeInTheDocument();
    expect(screen.getAllByText('Aún sin definir').length).toBeGreaterThan(0);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Completar datos faltantes' }));
    const where = UI_LABELS.es.stepWhere;
    const item = screen.getAllByRole('listitem').find((li) => within(li).queryByText(where, { selector: 'strong' }));
    expect(item).toHaveAttribute('data-step-state', 'open');
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('event-location')));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('still publishes a manually completed invitation from the same summary', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} path="manual" />);
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Cena manual' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y seguir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y seguir' }));
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Terraza' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y seguir' }));
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '20.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y seguir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y seguir' }));

    expect(screen.getByRole('heading', { name: 'Revisar y publicar' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.title).toBe('Cena manual');
    expect(payload.location).toBe('Terraza');
    expect(payload.priceCents).toBe(2000);
    expect(payload.capacity).toBe(6);
  });
});

describe('bounded create path routing', () => {
  it('opens the interview from a deep link and keeps the query and locale', async () => {
    localStorage.setItem('fp_locale', 'en');
    window.history.replaceState({}, '', '/create?path=interview');
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });

    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    expect(await screen.findByRole('heading', { name: "Let's plan your party in four questions" })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/create');
    expect(window.location.search).toBe('?path=interview');
    expect(screen.getByLabelText('What are you celebrating?')).toBeInTheDocument();
  });
});

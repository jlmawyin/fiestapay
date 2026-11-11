import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftEventProposal } from '@fiestapay/shared';
import { CreateWizard } from '../components/events/CreateWizard';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import { ApiError, api } from '../api/client';
import type { EventInput } from '../types';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

function renderEs(node: React.ReactElement): void {
  render(node);
}

function renderEn(node: React.ReactElement): void {
  localStorage.setItem('fp_locale', 'en');
  render(<I18nProvider>{node}</I18nProvider>);
}

const pad = (n: number): string => String(n).padStart(2, '0');

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function saveStepEs(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar y seguir' }));
}

function summaryRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Resumen de la invitación' });
}

function fillSentenceEs(sentence: string): void {
  fireEvent.change(screen.getByLabelText('Describe tu invitación en una frase'), {
    target: { value: sentence },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Rellenar con IA' }));
}

const COMIDA_PROPOSAL = (date: string): DraftEventProposal => ({
  template: 'comida',
  title: 'Asado del sábado',
  meal: 'almuerzo',
  date,
  startTime: '13:00',
  durationMinutes: 180,
  location: 'Parque Central',
  includes: ['Carne', 'Bebidas'],
  headcount: 10,
  budgetCents: 15000,
  perPersonCents: 1500,
  suggested: [
    'template',
    'title',
    'meal',
    'date',
    'startTime',
    'durationMinutes',
    'location',
    'includes',
    'headcount',
    'budgetCents',
  ],
  source: 'ai',
});

describe('draft-event fill (ES)', () => {
  it('opens the editable summary and publishes exactly once with those values', async () => {
    const date = futureDate(9);
    const draft = vi.spyOn(api, 'draftEvent').mockResolvedValue(COMIDA_PROPOSAL(date));
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);

    expect(
      screen.getByPlaceholderText('Asado para 10 el sábado a las 13:00, $15 cada uno'),
    ).toBeInTheDocument();
    fillSentenceEs('Asado para 10 el sábado a las 13:00, $15 cada uno');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Revisar y publicar' })).toBeInTheDocument();
    });
    expect(draft).toHaveBeenCalledTimes(1);
    expect(draft).toHaveBeenCalledWith('Asado para 10 el sábado a las 13:00, $15 cada uno');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Redacté tu invitación\. Los campos sugeridos están marcados/),
    ).toBeInTheDocument();
    const summary = summaryRegion();
    expect(within(summary).getByText('Asado del sábado')).toBeInTheDocument();
    expect(within(summary).getByText('Parque Central')).toBeInTheDocument();
    expect(within(summary).getByText('Carne, Bebidas')).toBeInTheDocument();
    expect(within(summary).getByText(/15,00/)).toBeInTheDocument();
    expect(screen.getAllByText('Sugerido por IA').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.template).toBe('comida');
    expect(payload.title).toBe('Asado del sábado');
    expect(payload.meal).toBe('almuerzo');
    expect(payload.startsAt).toBe(new Date(`${date}T13:00`).toISOString());
    expect(new Date(payload.endsAt).getTime() - new Date(payload.startsAt).getTime()).toBe(3 * 3600 * 1000);
    expect(payload.location).toBe('Parque Central');
    expect(payload.includes).toEqual(['Carne', 'Bebidas']);
    expect(payload.priceCents).toBe(1500);
    expect(payload.capacity).toBe(10);
  });

  it('clears only the edited field mark and refreshes the summary', async () => {
    const date = futureDate(9);
    vi.spyOn(api, 'draftEvent').mockResolvedValue(COMIDA_PROPOSAL(date));
    renderEs(<CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    fillSentenceEs('Asado para 10 el sábado a las 13:00, $15 cada uno');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Revisar y publicar' })).toBeInTheDocument();
    });
    const before = screen.getAllByText('Sugerido por IA').length;

    fireEvent.click(screen.getByRole('button', { name: 'Editar Título' }));
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Mi propio título' } });
    // Only the untouched template mark remains in the step 1 form.
    expect(screen.getAllByText('Sugerido por IA')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Volver al resumen' }));
    expect(screen.getAllByText('Sugerido por IA')).toHaveLength(before - 1);
    expect(screen.getAllByText('Mi propio título').length).toBeGreaterThan(0);
  });

  it('shows rules output as automatic suggestion and keeps the date/time editable', async () => {
    const date = futureDate(9);
    vi.spyOn(api, 'draftEvent').mockResolvedValue({
      template: 'casa',
      title: 'Noche de juegos',
      date,
      startTime: '20:00',
      durationMinutes: 180,
      location: 'Mi sala',
      includes: [],
      suggested: ['template', 'title', 'date', 'startTime', 'durationMinutes', 'location'],
      source: 'rules',
    });
    renderEs(<CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    fillSentenceEs('Noche de juegos en casa');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Revisar y publicar' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Sugerido por IA')).toBeNull();
    expect(screen.getAllByText('Sugerencia automática').length).toBeGreaterThan(0);
    expect(screen.getByText('En Casa')).toBeInTheDocument();
    expect(screen.getAllByText('Noche de juegos').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Editar Cuándo' }));
    expect((screen.getByLabelText(/^Fecha(?: Sugerencia automática)?$/) as HTMLInputElement).value).toBe(date);
    expect((screen.getByLabelText(/^Hora de llegada(?: Sugerencia automática)?$/) as HTMLInputElement).value).toBe('20:00');
    expect(screen.getByRole('radio', { name: '+3 h' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByText('Sugerencia automática')).toHaveLength(3);
  });

  it('applies only the suggested fields and leaves the rest empty', async () => {
    vi.spyOn(api, 'draftEvent').mockResolvedValue({
      template: 'viaje',
      title: 'Ruta a la playa',
      location: 'Baños',
      includes: [],
      suggested: ['title'],
      source: 'ai',
    });
    renderEs(<CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    fillSentenceEs('Ruta a la playa');

    await waitFor(() => {
      expect(screen.getAllByText('Ruta a la playa').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Sugerido por IA')).toHaveLength(1);
    expect(screen.getAllByText(/Aún sin definir/).length).toBeGreaterThan(0);
    expect(screen.getByText('Aún no hay nada incluido')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Editar Lugar' }));
    expect((screen.getByLabelText(/Lugar o Dirección/i) as HTMLInputElement).value).toBe('');
  });

  it('maps an event duration to its end time and a trip date to its departure', async () => {
    const date = futureDate(12);
    vi.spyOn(api, 'draftEvent').mockResolvedValue({
      template: 'evento',
      title: 'Charla de parrilla',
      date,
      startTime: '10:00',
      durationMinutes: 120,
      includes: [],
      suggested: ['template', 'title', 'date', 'startTime', 'durationMinutes'],
      source: 'ai',
    });
    renderEs(<CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    fillSentenceEs('Charla de parrilla de dos horas');
    await waitFor(() => {
      expect(screen.getAllByText('Charla de parrilla').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Editar Cuándo' }));
    expect((screen.getByLabelText(/Fecha/) as HTMLInputElement).value).toBe(date);
    expect((screen.getByLabelText(/Hora de inicio/) as HTMLInputElement).value).toBe('10:00');
    expect((screen.getByLabelText(/Hora de fin/) as HTMLInputElement).value).toBe('12:00');
    cleanup();

    const depart = futureDate(10);
    vi.spyOn(api, 'draftEvent').mockResolvedValue({
      template: 'viaje',
      title: 'Ruta a Baños',
      date: depart,
      startTime: '08:00',
      durationMinutes: 60,
      includes: [],
      suggested: ['template', 'title', 'date', 'startTime', 'durationMinutes'],
      source: 'ai',
    });
    renderEs(<CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    fillSentenceEs('Viaje a Baños');
    await waitFor(() => {
      expect(screen.getAllByText('Ruta a Baños').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Editar Cuándo' }));
    expect((screen.getByLabelText(/Fecha de ida/) as HTMLInputElement).value).toBe(depart);
    expect((screen.getByLabelText(/Hora de salida/) as HTMLInputElement).value).toBe('08:00');
    // A minutes duration does not apply to a multi-day trip, so it is not marked.
    expect(screen.getAllByText('Sugerido por IA')).toHaveLength(2);
  });

  it('rejects an empty sentence without calling the server', () => {
    const draft = vi.spyOn(api, 'draftEvent');
    renderEs(<CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rellenar con IA' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe una frase para rellenar con IA.');
    expect(draft).not.toHaveBeenCalled();
  });

  it.each([429, 503])('shows the existing bilingual message on AI failure (%s) and keeps the manual form', async (status) => {
    vi.spyOn(api, 'draftEvent').mockRejectedValue(new ApiError('IA ocupada', status));
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fillSentenceEs('Asado para 10 el sábado');
    await waitFor(() => {
      expect(
        screen.getByText('La IA no respondió. Te dejamos la sugerencia por reglas; puedes publicar igual.'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Sugerido por IA')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Asado manual' } });
    saveStepEs();
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Parque real' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '8' } });
    saveStepEs();
    saveStepEs();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((onSubmit.mock.calls[0][0] as EventInput).title).toBe('Asado manual');
  });
});

describe('draft-event fill (EN)', () => {
  it('opens the summary in English with AI suggestion marks and publishes once', async () => {
    const date = futureDate(9);
    const draft = vi.spyOn(api, 'draftEvent').mockResolvedValue({
      ...COMIDA_PROPOSAL(date),
      title: 'Saturday BBQ',
      location: 'Central Park',
    });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEn(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);

    fireEvent.change(screen.getByLabelText('Describe your gathering in one sentence'), {
      target: { value: 'BBQ for 10 on Saturday, $15 each' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fill with AI' }));

    await waitFor(() => {
      expect(draft).toHaveBeenCalledWith('BBQ for 10 on Saturday, $15 each');
      expect(screen.getByRole('heading', { name: 'Review and publish' })).toBeInTheDocument();
    });
    expect(
      screen.getByText(/I drafted your invitation\. Suggested fields are marked/),
    ).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Invitation summary' });
    expect(within(summary).getByText('Saturday BBQ')).toBeInTheDocument();
    expect(within(summary).getByText('Central Park')).toBeInTheDocument();
    expect(screen.getAllByText('AI suggestion').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Publish invitation' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((onSubmit.mock.calls[0][0] as EventInput).priceCents).toBe(1500);

    const text = document.body.textContent ?? '';
    for (const witness of [
      'Describe tu invitación en una frase',
      'Rellenar con IA',
      'Sugerido por IA',
      'Sugerencia automática',
      'Título del Evento',
      'Cuota por persona',
    ]) {
      expect(text, `Spanish witness in English UI: ${witness}`).not.toContain(witness);
    }
  });

  it('shows rules output as automatic suggestion, then keeps answers on a 503', async () => {
    vi.spyOn(api, 'draftEvent')
      .mockResolvedValueOnce({
        template: 'comida',
        title: 'Sunday dinner',
        includes: [],
        suggested: ['title'],
        source: 'rules',
      })
      .mockRejectedValueOnce(new ApiError('busy', 503));
    renderEn(<CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);

    fireEvent.change(screen.getByLabelText('Describe your gathering in one sentence'), {
      target: { value: 'Sunday dinner' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fill with AI' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Review and publish' })).toBeInTheDocument();
    });
    expect(screen.getAllByText('Automatic suggestion').length).toBeGreaterThan(0);
    expect(screen.queryByText('AI suggestion')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Title' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fill with AI' }));
    await waitFor(() => {
      expect(
        screen.getByText('AI did not answer. We kept the rules suggestion; you can still publish.'),
      ).toBeInTheDocument();
    });
  });
});

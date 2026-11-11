import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_LABELS, themeBelongs } from '@fiestapay/shared';
import { CreateWizard } from '../components/events/CreateWizard';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import { ApiError, api } from '../api/client';
import { suggestThemeFor } from '../lib/event-presentation';
import type { EventInput, TemplateKind } from '../types';

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

function addDays(datePart: string, days: number): string {
  const d = new Date(`${datePart}T12:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function saveStepEs(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar y seguir' }));
}

function stepItem(title: string): HTMLElement {
  const items = screen.getAllByRole('listitem');
  const found = items.find((li) => within(li).queryByText(title, { selector: 'strong' }));
  if (!found) throw new Error(`step not found: ${title}`);
  return found;
}

function expectStepState(title: string, state: 'done' | 'open' | 'locked'): void {
  expect(stepItem(title)).toHaveAttribute('data-step-state', state);
}

/** Full comida walk with default dates. Returns the submitted payload. */
async function walkComidaEs(over: { title?: string; location?: string } = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
  fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: over.title ?? 'Almuerzo de equipo' } });
  saveStepEs();
  saveStepEs();
  fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: over.location ?? 'Oficina' } });
  saveStepEs();
  fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '25.00' } });
  fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '8' } });
  saveStepEs();
  saveStepEs();
  fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  return onSubmit.mock.calls[0][0] as EventInput;
}

describe('creation wizard structure', () => {
  it('opens one step at a time in order with the contract labels', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    const L = UI_LABELS.es;

    expect(screen.getByRole('heading', { name: L.createWizardTitle })).toBeInTheDocument();
    expectStepState(L.stepWhat, 'open');
    expectStepState(L.stepWhen, 'locked');
    expectStepState(L.stepWhere, 'locked');
    expectStepState(L.stepShare, 'locked');
    expectStepState(L.stepLook, 'locked');
    expectStepState('Revisar y publicar', 'locked');
    expect(screen.getByLabelText(/Título del Evento/i)).toBeInTheDocument();
    // Later steps stay locked: their forms never render.
    expect(screen.queryByLabelText(/Lugar o Dirección/i)).toBeNull();
    expect(screen.queryByLabelText(/Cuota por persona/i)).toBeNull();

    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Asado real' } });
    saveStepEs();
    expectStepState(L.stepWhat, 'done');
    expectStepState(L.stepWhen, 'open');
    expectStepState(L.stepWhere, 'locked');
    expect(within(stepItem(L.stepWhen)).getByText(L.stepWhen, { selector: 'strong' })).toBeInTheDocument();
  });

  it('folds finished steps with Cambiar and preserves data when reopening', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    const L = UI_LABELS.es;

    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Asado real' } });
    fireEvent.change(screen.getByLabelText(/Nombre de quien organiza/i), { target: { value: 'Luis' } });
    saveStepEs();
    saveStepEs();

    const what = stepItem(L.stepWhat);
    expect(within(what).getByText(/Asado real/)).toBeInTheDocument();
    fireEvent.click(within(what).getByRole('button', { name: L.changeStep }));

    expectStepState(L.stepWhat, 'open');
    expectStepState(L.stepWhen, 'locked');
    expect(screen.getByLabelText(/Título del Evento/i)).toHaveValue('Asado real');
    expect(screen.getByLabelText(/Nombre de quien organiza/i)).toHaveValue('Luis');
  });

  it('validates each step inline without submitting', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);

    saveStepEs();
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un titulo.');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Asado real' } });
    saveStepEs();
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Parque' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '8' } });
    saveStepEs();
    expect(screen.getByRole('alert')).toHaveTextContent('La cuota por persona debe ser mayor a 0.');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('wizard when fields per type', () => {
  it('comida 13:00 + 3 h sends endsAt = start + 3 h with a deduced meal', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Almuerzo de equipo' } });
    saveStepEs();

    const date = (screen.getByLabelText('Fecha') as HTMLInputElement).value;
    expect(screen.getByRole('radio', { name: '3 h' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '13:00' } });
    expect((screen.getByLabelText('Tipo de Comida') as HTMLSelectElement).value).toBe('almuerzo');
    fireEvent.click(screen.getByRole('radio', { name: 'Asado' }));
    saveStepEs();

    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Oficina' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '8' } });
    saveStepEs();
    saveStepEs();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const payload = onSubmit.mock.calls[0][0] as EventInput;
    // Same construction the form uses, so it holds in any browser zone.
    expect(payload.startsAt).toBe(new Date(`${date}T13:00`).toISOString());
    expect(new Date(payload.endsAt).getTime() - new Date(payload.startsAt).getTime()).toBe(3 * 3600 * 1000);
    expect(payload.meal).toBe('almuerzo');
    expect(payload.includes).toEqual(['Asado']);
    expect(payload.template).toBe('comida');
  });

  it('comida duration chips change the computed end', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Cena larga' } });
    saveStepEs();
    const date = (screen.getByLabelText('Fecha') as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '19:00' } });
    fireEvent.click(screen.getByRole('radio', { name: '2 h' }));
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Casa' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '10.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '4' } });
    saveStepEs();
    saveStepEs();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.startsAt).toBe(new Date(`${date}T19:00`).toISOString());
    expect(new Date(payload.endsAt).getTime() - new Date(payload.startsAt).getTime()).toBe(2 * 3600 * 1000);
    expect(payload.meal).toBe('cena');
  });

  it('casa sends arrival plus a midnight departure on the next day', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.click(screen.getByRole('radio', { name: /En Casa/ }));
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Noche de juegos' } });
    saveStepEs();

    const date = (screen.getByLabelText('Fecha') as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText('Hora de llegada'), { target: { value: '20:00' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Hasta la medianoche' }));
    saveStepEs();

    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Mi casa' } });
    fireEvent.click(screen.getByLabelText('Música'));
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '5.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '6' } });
    saveStepEs();
    saveStepEs();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.template).toBe('casa');
    expect(payload.startsAt).toBe(new Date(`${date}T20:00`).toISOString());
    expect(payload.endsAt).toBe(new Date(`${addDays(date, 1)}T00:00`).toISOString());
    expect(payload.includes).toEqual(['Música']);
  });

  it('casa accepts an exact departure time after arrival', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.click(screen.getByRole('radio', { name: /En Casa/ }));
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Tarde de cine' } });
    saveStepEs();

    const date = (screen.getByLabelText('Fecha') as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText('Hora de llegada'), { target: { value: '16:00' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Hora exacta' }));
    fireEvent.change(screen.getByLabelText('Hora de fin'), { target: { value: '23:30' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Sala' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '5.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '6' } });
    saveStepEs();
    saveStepEs();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.startsAt).toBe(new Date(`${date}T16:00`).toISOString());
    expect(payload.endsAt).toBe(new Date(`${date}T23:30`).toISOString());
  });

  it('viaje spans several days and rejects a return that is not after departure', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.click(screen.getByRole('radio', { name: /Viaje/ }));
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Ruta a Baños' } });
    saveStepEs();

    const depart = futureDate(10);
    const back = futureDate(14);
    fireEvent.change(screen.getByLabelText('Fecha de ida'), { target: { value: depart } });
    fireEvent.change(screen.getByLabelText('Fecha de vuelta'), { target: { value: depart } });
    fireEvent.change(screen.getByLabelText('Hora de salida'), { target: { value: '08:00' } });
    saveStepEs();
    expect(screen.getByRole('alert')).toHaveTextContent('La hora de fin debe ser posterior al inicio.');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Fecha de vuelta'), { target: { value: back } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Baños' } });
    fireEvent.click(screen.getByLabelText('Hotel u hospedaje'));
    fireEvent.click(screen.getByLabelText('Transporte de ida y vuelta'));
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '65.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '12' } });
    saveStepEs();
    saveStepEs();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.template).toBe('viaje');
    expect(payload.startsAt).toBe(new Date(`${depart}T08:00`).toISOString());
    expect(payload.endsAt).toBe(new Date(`${back}T08:00`).toISOString());
    expect(payload.includes).toEqual(['Hotel u hospedaje', 'Transporte de ida y vuelta']);
  });

  it('evento keeps start/end plus the agenda rows', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.click(screen.getByRole('radio', { name: /Evento/ }));
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Charla de parrilla' } });
    saveStepEs();

    const date = futureDate(9);
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: date } });
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('Hora de fin'), { target: { value: '12:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Añadir horario/ }));
    fireEvent.change(screen.getByLabelText('Hora actividad 1'), { target: { value: '10:30' } });
    fireEvent.change(screen.getByLabelText('Título actividad 1'), { target: { value: 'Bienvenida' } });
    fireEvent.change(screen.getByLabelText('Expositor actividad 1'), { target: { value: 'Ana' } });
    saveStepEs();

    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Auditorio' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '40.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '50' } });
    saveStepEs();
    saveStepEs();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.template).toBe('evento');
    expect(payload.startsAt).toBe(new Date(`${date}T10:00`).toISOString());
    expect(payload.endsAt).toBe(new Date(`${date}T12:00`).toISOString());
    expect(payload.agenda).toEqual([{ time: '10:30', title: 'Bienvenida', speaker: 'Ana' }]);
  });
});

describe('wizard includes assembly', () => {
  function reachWhere(): void {
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Almuerzo real' } });
    saveStepEs();
    saveStepEs();
  }

  it('merges food style, checks, and free text into includes', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Almuerzo real' } });
    saveStepEs();
    fireEvent.click(screen.getByRole('radio', { name: 'Vegetariano' }));
    fireEvent.change(screen.getByLabelText(/Otro estilo/), { target: { value: 'Jugos naturales' } });
    saveStepEs();

    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Huerto' } });
    fireEvent.click(screen.getByLabelText('Plato fuerte'));
    fireEvent.click(screen.getByLabelText('Postre'));
    fireEvent.change(screen.getByLabelText(/Qué incluye la cuota/i), { target: { value: 'Jugo, Pan' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '12.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '10' } });
    saveStepEs();
    saveStepEs();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((onSubmit.mock.calls[0][0] as EventInput).includes).toEqual([
      'Vegetariano',
      'Jugos naturales',
      'Plato fuerte',
      'Postre',
      'Jugo',
      'Pan',
    ]);
  });

  it('rejects more than 20 items or an item over 120 chars inside the step', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    reachWhere();
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Parque' } });
    fireEvent.change(screen.getByLabelText(/Qué incluye la cuota/i), {
      target: { value: Array.from({ length: 21 }, (_, i) => `cosa ${i}`).join(', ') },
    });
    saveStepEs();
    expect(screen.getByRole('alert')).toHaveTextContent('La cuota incluye máximo 20 elementos.');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Qué incluye la cuota/i), { target: { value: `x${'y'.repeat(120)}` } });
    saveStepEs();
    expect(screen.getByRole('alert')).toHaveTextContent('Cada elemento incluye máximo 120 caracteres.');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('wizard share calculator and advanced options', () => {
  function reachShare(): void {
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Cena real' } });
    saveStepEs();
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Casa' } });
    saveStepEs();
  }

  it('fills the share from total ÷ people with clear cent rounding', () => {
    renderEs(<CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    reachShare();
    fireEvent.change(screen.getByLabelText('Gasto total'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Personas'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular cuota' }));
    expect(screen.getByRole('status')).toHaveTextContent('= $33,33 por persona (redondeado a centavos)');
    expect(screen.getByLabelText(/Cuota por persona/i)).toHaveValue(33.33);
  });

  it('validates the calculator inputs without touching the share', () => {
    renderEs(<CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    reachShare();
    fireEvent.change(screen.getByLabelText('Gasto total'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Personas'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular cuota' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un gasto total mayor a 0.');
    expect((screen.getByLabelText(/Cuota por persona/i) as HTMLInputElement).value).toBe('');

    fireEvent.change(screen.getByLabelText('Gasto total'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Personas'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular cuota' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe cuántas personas (1 o más).');
  });

  it('keeps advanced options collapsed with in-step money validation', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    reachShare();
    expect(screen.queryByLabelText(/Mínimo requerido/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Opciones avanzadas' }));
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '1.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Meta ideal/i), { target: { value: '100.00' } });
    saveStepEs();
    expect(screen.getByRole('alert')).toHaveTextContent('La cuota por el cupo debe cubrir la meta y el minimo.');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('wizard review and example warning', () => {
  it('marks untouched dates as a suggestion and fixed dates as final', async () => {
    const payload = await walkComidaEs();
    expect(payload.title).toBe('Almuerzo de equipo');
    cleanup();

    const onSubmit2 = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit2} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Cena final' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '20:00' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Terraza' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '10.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '5' } });
    saveStepEs();
    saveStepEs();
    expect(screen.getByText('Estas son las fechas que quedan en la invitación.')).toBeInTheDocument();
  });

  it('warns on an unchanged title example, revises with focus, and publishes once', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar «Comida con excompañeros»' }));
    saveStepEs();
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Parque real' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '8' } });
    saveStepEs();
    saveStepEs();

    const alert = screen.getByRole('alert', { name: /texto de ejemplo/i });
    expect(alert).toHaveTextContent('Título del Evento: Comida con excompañeros');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Revisar campos' }));
    expectStepState(UI_LABELS.es.stepWhat, 'open');
    expect(document.activeElement).toBe(document.getElementById('event-title'));

    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Asado del sábado' } });
    saveStepEs();
    saveStepEs();
    saveStepEs();
    saveStepEs();
    saveStepEs();
    expect(screen.queryByRole('button', { name: 'Publicar estos valores' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((onSubmit.mock.calls[0][0] as EventInput).title).toBe('Asado del sábado');
  });

  it('publishes acknowledged examples once from the explicit action', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Nombre de la fiesta' } });
    saveStepEs();
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Parque real' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '8' } });
    saveStepEs();
    saveStepEs();

    const publish = screen.getByRole('button', { name: 'Publicar estos valores' });
    fireEvent.click(publish);
    fireEvent.click(publish);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((onSubmit.mock.calls[0][0] as EventInput).title).toBe('Nombre de la fiesta');
  });
});

describe('suggestThemeFor rules', () => {
  const cases: Array<[Parameters<typeof suggestThemeFor>[0], string]> = [
    [{ template: 'comida', foodStyle: 'asado' }, 'fogata'],
    [{ template: 'comida', meal: 'desayuno' }, 'huerto'],
    [{ template: 'comida', hour: 21 }, 'brindis'],
    [{ template: 'comida', title: 'Ceviche de mariscos' }, 'mesa'],
    [{ template: 'casa', title: 'Tarde en la terraza' }, 'terraza'],
    [{ template: 'casa', hour: 22 }, 'sala'],
    [{ template: 'casa', includes: ['Música'] }, 'patio'],
    [{ template: 'viaje', title: 'Viaje a la playa' }, 'costa'],
    [{ template: 'viaje', location: 'Quito centro' }, 'ciudad'],
    [{ template: 'viaje', title: 'Ruta de senderismo' }, 'montana'],
    [{ template: 'evento', title: 'Charla de emprendimiento' }, 'taller'],
    [{ template: 'evento', hour: 22 }, 'noche'],
    [{ template: 'evento', title: 'Expo de arte' }, 'galeria'],
    [{ template: 'comida', title: 'xyz sin pistas', hour: 14 }, 'mesa'],
    [{ template: 'viaje', title: 'xyz' }, 'camino'],
    [{ template: 'evento', title: 'xyz', hour: 10 }, 'escenario'],
  ];

  it.each(cases)('suggests %s for %o', (input, expected) => {
    expect(suggestThemeFor(input).key).toBe(expected);
  });

  it('always answers with a theme of the template', () => {
    const templates: TemplateKind[] = ['comida', 'casa', 'viaje', 'evento'];
    const probes = [
      {},
      { title: 'Asado en la playa de noche con vino' },
      { title: '', location: '', includes: [], hour: 99, foodStyle: '' },
      { title: 'xyz', hour: -1 },
      { meal: 'cena' as const, hour: 9 },
      { includes: ['Hotel', 'Música', 'Taller de fotos'] },
    ];
    for (const template of templates) {
      for (const probe of probes) {
        const theme = suggestThemeFor({ template, ...probe }).key;
        expect(themeBelongs(template, theme), `${template} ${JSON.stringify(probe)}`).toBe(true);
      }
    }
  });

  it('auto-applies the rules theme and keeps a manual pick', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Gran asado familiar' } });
    saveStepEs();
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Parque' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '8' } });
    saveStepEs();

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Fogata' })).toHaveAttribute('aria-checked', 'true');
    });
    expect(screen.getByText('Sugerido para tu invitación:')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Mesa' }));
    const what = stepItem(UI_LABELS.es.stepWhat);
    fireEvent.click(within(what).getByRole('button', { name: 'Cambiar' }));
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Brindis de fin de año' } });
    saveStepEs();
    saveStepEs();
    saveStepEs();
    saveStepEs();
    expect(screen.getByRole('radio', { name: 'Mesa' })).toHaveAttribute('aria-checked', 'true');

    saveStepEs();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((onSubmit.mock.calls[0][0] as EventInput).theme).toBe('mesa');
  });
});

describe('wizard AI suggestion', () => {
  function reachLook(): void {
    fireEvent.click(screen.getByRole('radio', { name: /En Casa/ }));
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Cena en casa' } });
    fireEvent.change(screen.getByLabelText(/Nombre de quien organiza/i), { target: { value: 'Ana Secreta' } });
    saveStepEs();
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Mi sala' } });
    fireEvent.click(screen.getByLabelText('Música'));
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '10.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Opciones avanzadas' }));
    fireEvent.change(screen.getByLabelText(/Codigo de acceso/i), { target: { value: 'clave-secreta' } });
    saveStepEs();
  }

  it('applies the mocked theme and offers the description without personal data', async () => {
    const suggest = vi.spyOn(api, 'suggestPresentation').mockResolvedValue({
      theme: 'sala',
      description: 'Una noche para brindar en casa.',
      source: 'ai',
    });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    reachLook();

    fireEvent.click(screen.getByRole('button', { name: '✨ Sugerir con IA' }));
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Sala' })).toHaveAttribute('aria-checked', 'true');
    });
    expect(screen.getByText('Tema aplicado: Sala.')).toBeInTheDocument();
    expect(screen.getByText('Una noche para brindar en casa.')).toBeInTheDocument();

    expect(suggest).toHaveBeenCalledTimes(1);
    const body = suggest.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(body.template).toBe('casa');
    expect(body.title).toBe('Cena en casa');
    expect(body.location).toBe('Mi sala');
    expect(body.hints).toEqual(['Música']);
    expect(Object.keys(body).sort()).toEqual(['hints', 'location', 'meal', 'template', 'title'].sort());
    expect(JSON.stringify(body)).not.toContain('Ana Secreta');
    expect(JSON.stringify(body)).not.toContain('clave-secreta');

    fireEvent.click(screen.getByRole('button', { name: 'Usar esta descripción' }));
    expect(screen.queryByText('Una noche para brindar en casa.')).toBeNull();
    saveStepEs();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.theme).toBe('sala');
    expect(payload.description).toBe('Una noche para brindar en casa.');
    expect(payload.organizerName).toBe('Ana Secreta');
    expect(payload.accessCode).toBe('clave-secreta');
  });

  it('discards the proposed description without changing the theme', async () => {
    vi.spyOn(api, 'suggestPresentation').mockResolvedValue({
      theme: 'patio',
      description: 'Texto propuesto.',
      source: 'ai',
    });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    reachLook();
    fireEvent.click(screen.getByRole('button', { name: '✨ Sugerir con IA' }));
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Patio' })).toHaveAttribute('aria-checked', 'true');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByText('Texto propuesto.')).toBeNull();
    saveStepEs();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.theme).toBe('patio');
    expect(payload.description).toBe('');
  });

  it.each([408, 429, 503])('keeps the rules suggestion and publishes after an AI failure (%s)', async (status) => {
    vi.spyOn(api, 'suggestPresentation').mockRejectedValue(new ApiError('IA ocupada', status));
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Gran asado' } });
    saveStepEs();
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Parque' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '8' } });
    saveStepEs();

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Fogata' })).toHaveAttribute('aria-checked', 'true');
    });
    fireEvent.click(screen.getByRole('button', { name: '✨ Sugerir con IA' }));
    await waitFor(() => {
      expect(screen.getByText('La IA no respondió. Te dejamos la sugerencia por reglas; puedes publicar igual.')).toBeInTheDocument();
    });
    expect(screen.getByRole('radio', { name: 'Fogata' })).toHaveAttribute('aria-checked', 'true');
    saveStepEs();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((onSubmit.mock.calls[0][0] as EventInput).theme).toBe('fogata');
  });
});

describe('wizard ES/EN parity', () => {
  const SPANISH_WITNESSES = [
    '¿Qué celebran?',
    '¿Cuándo?',
    '¿Dónde y qué incluye?',
    'Cuota y cupo',
    'Portada y tema',
    'Guardar y seguir',
    'Cambiar',
    'Título del Evento',
    'Cuota por persona',
    'Revisar y publicar',
    'Publicar invitación',
    'Opciones avanzadas',
    'Sugerir con IA',
    'Escribe un titulo',
    'Desayuno',
    'Almuerzo',
    'Cena',
  ];

  function walkEn(): void {
    fireEvent.change(screen.getByLabelText('Event Title *'), { target: { value: 'Sunday dinner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: futureDate(10) } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '14:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    fireEvent.change(screen.getByLabelText('Place or Address *'), { target: { value: 'Main hall' } });
    fireEvent.change(screen.getByLabelText('What does the share include? (Comma separated)'), {
      target: { value: 'Snack, juice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    fireEvent.change(screen.getByLabelText('Share per person *'), { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText('Maximum capacity *'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
  }

  it('renders the contract labels in English with no Spanish witnesses', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEn(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    const L = UI_LABELS.en;
    expect(screen.getByRole('heading', { name: L.createWizardTitle })).toBeInTheDocument();
    expectStepState(L.stepWhat, 'open');
    walkEn();
    fireEvent.click(screen.getByRole('button', { name: 'Publish invitation' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const text = document.body.textContent ?? '';
    for (const witness of SPANISH_WITNESSES) {
      expect(text, `Spanish witness in English UI: ${witness}`).not.toContain(witness);
    }
  });

  it('sends exactly the same EventInput in English as in Spanish', async () => {
    const date = futureDate(11);
    const onSubmitEn = vi.fn().mockResolvedValue(undefined);
    renderEn(<CreateWizard onSubmit={onSubmitEn} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText('Event Title *'), { target: { value: 'Sunday dinner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '14:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    fireEvent.change(screen.getByLabelText('Place or Address *'), { target: { value: 'Main hall' } });
    fireEvent.change(screen.getByLabelText('Description for guests'), { target: { value: 'Real description here' } });
    fireEvent.change(screen.getByLabelText('What does the share include? (Comma separated)'), {
      target: { value: 'Snack, juice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    fireEvent.change(screen.getByLabelText('Share per person *'), { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText('Maximum capacity *'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish invitation' }));
    await waitFor(() => expect(onSubmitEn).toHaveBeenCalledTimes(1));
    const payloadEn = onSubmitEn.mock.calls[0][0] as EventInput;
    cleanup();
    localStorage.clear();

    const onSubmitEs = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmitEs} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Sunday dinner' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: date } });
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '14:00' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Main hall' } });
    fireEvent.change(screen.getByLabelText(/Descripción para los invitados/i), { target: { value: 'Real description here' } });
    fireEvent.change(screen.getByLabelText(/Qué incluye la cuota/i), { target: { value: 'Snack, juice' } });
    saveStepEs();
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '8' } });
    saveStepEs();
    saveStepEs();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmitEs).toHaveBeenCalledTimes(1));
    const payloadEs = onSubmitEs.mock.calls[0][0] as EventInput;

    expect(payloadEn).toEqual(payloadEs);
    expect(payloadEn.priceCents).toBe(2500);
    expect(payloadEn.capacity).toBe(8);
    expect(payloadEn.startsAt).toBe(new Date(`${date}T14:00`).toISOString());
  });
});

describe('wizard at 375px', () => {
  it('keeps every wizard rule shrinkable with no fixed wide widths', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, '..', 'index.css'), 'utf8');
    for (const cls of [
      '.create-wizard',
      '.create-wizard__step',
      '.create-wizard__step-body',
      '.create-wizard__type-grid',
      '.create-wizard__chips',
      '.create-wizard__field-row',
      '.create-wizard__checks',
      '.create-wizard__calc',
      '.create-wizard__ai-proposal',
    ]) {
      const pattern = new RegExp(`${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`);
      const block = pattern.exec(css)?.[0] ?? '';
      expect(block, `${cls} rule`).toContain('min-width: 0');
    }
    expect(css).toContain('.create-wizard .form-input');
    expect(css).toContain('max-width: 100%');
    expect(css).toContain('@media (max-width: 379px)');
    const wizardBlocks = css.match(/\.create-wizard[^{]*\{[^}]*\}/g) ?? [];
    expect(wizardBlocks.length).toBeGreaterThan(0);
    for (const block of wizardBlocks) {
      expect(block, `fixed wide width in ${block.slice(0, 60)}`).not.toMatch(/(?<!min-|max-)width:\s*\d{3,}px/);
    }
  });

  it('renders long summaries without breaking the step layout', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEs(<CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    const longTitle = 'Una celebración con un título muy largo que no debería romper el diseño en móvil';
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: longTitle } });
    saveStepEs();
    const done = within(stepItem(UI_LABELS.es.stepWhat)).getByText(/Una celebración/);
    expect(done).toHaveClass('create-wizard__done-line');
  });
});

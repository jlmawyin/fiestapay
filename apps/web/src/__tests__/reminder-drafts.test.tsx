import type { ComponentType } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderDraftResult } from '@fiestapay/shared';
import { ReminderDrafts } from '../components/dashboard/ReminderDrafts';
import { OrganizerDashboardView } from '../views/OrganizerDashboardView';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import { api } from '../api/client';
import { rememberAdminKey } from '../api/admin-key';
import type { Dashboard, Guest } from '../types';

// jsdom has no grid layout/virtualization. Same stub as the dashboard tests.
vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData, columnDefs }: { rowData: Guest[]; columnDefs: ColDef<Guest>[] }) => (
    <table><tbody>{rowData.map(guest => <tr key={guest.id}>{columnDefs.map((col, i) => {
      const value = col.field ? guest[col.field as keyof Guest] : undefined;
      const Cell = col.cellRenderer as ComponentType<Pick<ICellRendererParams<Guest>, 'data' | 'value'>> | undefined;
      return <td key={i}>{Cell ? <Cell data={guest} value={value} /> : String(value ?? '')}</td>;
    })}</tr>)}</tbody></table>
  ),
}));

function setClipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.lang = 'es';
  setActiveLocale('es');
  setClipboard(vi.fn().mockResolvedValue(undefined));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

function renderEn(node: React.ReactElement): void {
  localStorage.setItem('fp_locale', 'en');
  render(<I18nProvider>{node}</I18nProvider>);
}

const RESULT: ReminderDraftResult = {
  drafts: [
    { guestId: 'g1', alias: 'José Demo', dueCents: 5000, message: 'Hola José, te faltan $50,00. Paga aquí: https://x/e/a' },
    { guestId: 'g2', alias: 'Inés Demo', dueCents: 1333, message: 'Hola Inés, te faltan $13,33. Paga aquí: https://x/e/a' },
  ],
  source: 'ai',
  truncated: true,
};

const messageOf = (link: HTMLElement) => new URL((link as HTMLAnchorElement).href).searchParams.get('text')!;

describe('reminder drafts (ES)', () => {
  it('drafts once per explicit click and shows editable drafts with the server balance', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const draft = vi.spyOn(api, 'draftReminders').mockResolvedValue(RESULT);
    render(<ReminderDrafts slug="a" />);

    expect(draft).not.toHaveBeenCalled();
    expect(screen.queryByTestId('reminder-draft-g1')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Preparar recordatorios' }));
    expect(draft).toHaveBeenCalledTimes(1);
    expect(draft).toHaveBeenCalledWith('a', 'amable');

    const first = await screen.findByTestId('reminder-draft-g1');
    expect(within(first).getByText('José Demo')).toBeInTheDocument();
    // Server balance formatted like the rest of the panel, never recomputed.
    expect(within(first).getByText('Pendiente: $50,00')).toBeInTheDocument();
    expect(within(first).getByLabelText('Mensaje para José Demo')).toHaveValue(RESULT.drafts[0].message);
    const second = screen.getByTestId('reminder-draft-g2');
    expect(within(second).getByText('Pendiente: $13,33')).toBeInTheDocument();

    expect(screen.getByText('Hay más invitados con deuda; se muestran los primeros.')).toBeInTheDocument();
    expect(screen.getByText('Revisa cada borrador y envíalo tú desde WhatsApp.')).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });

  it('sends the chosen tone and marks rules output as automatic suggestion', async () => {
    const draft = vi.spyOn(api, 'draftReminders').mockResolvedValue({ ...RESULT, source: 'rules', truncated: false });
    render(<ReminderDrafts slug="a" />);

    fireEvent.change(screen.getByLabelText('Tono'), { target: { value: 'divertido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preparar recordatorios' }));
    await screen.findByTestId('reminder-draft-g1');

    expect(draft).toHaveBeenCalledWith('a', 'divertido');
    expect(screen.getByText('Sugerencia automática')).toBeInTheDocument();
    expect(screen.queryByText('Hay más invitados con deuda; se muestran los primeros.')).toBeNull();
  });

  it('edits the message, copies the edited text, and opens WhatsApp with it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    vi.spyOn(api, 'draftReminders').mockResolvedValue({ ...RESULT, truncated: false });
    render(<ReminderDrafts slug="a" />);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar recordatorios' }));
    await screen.findByTestId('reminder-draft-g1');

    fireEvent.change(screen.getByLabelText('Mensaje para José Demo'), {
      target: { value: 'José, edité este mensaje' },
    });

    const link = screen.getByTestId('reminder-whatsapp-g1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect((link as HTMLAnchorElement).href.startsWith('https://api.whatsapp.com/send?text=')).toBe(true);
    expect(messageOf(link)).toBe('José, edité este mensaje');

    const copy = screen.getByTestId('reminder-copy-g1');
    expect(copy).toHaveTextContent('Copiar');
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('José, edité este mensaje'));
    expect(copy).toHaveTextContent('¡Copiado!');
  });

  it('says when nobody owes money and recovers from a failure without losing the manual grid', async () => {
    vi.spyOn(api, 'draftReminders')
      .mockResolvedValueOnce({ drafts: [], source: 'ai', truncated: false })
      .mockRejectedValueOnce(new Error('Sin red'))
      .mockResolvedValueOnce(RESULT);
    render(<ReminderDrafts slug="a" />);

    fireEvent.click(screen.getByRole('button', { name: 'Preparar recordatorios' }));
    await screen.findByText('Nadie debe dinero ahora mismo.');
    expect(screen.queryByTestId('reminder-draft-g1')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Preparar recordatorios' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Sin red');

    fireEvent.click(screen.getByRole('button', { name: 'Preparar recordatorios' }));
    await screen.findByTestId('reminder-draft-g1');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sends the organizer key in the same header as the other organizer calls', async () => {
    rememberAdminKey('a', 'clave-organizador');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => RESULT,
    } as Response);
    await api.draftReminders('a', 'formal');
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/api/events/a/reminders/draft');
    expect(new Headers(init?.headers).get('X-Fiesta-Admin-Key')).toBe('clave-organizador');
    expect(String(init?.body)).toBe(JSON.stringify({ tone: 'formal' }));
    expect(String(init?.body)).not.toContain('clave-organizador');
  });
});

describe('reminder drafts (EN)', () => {
  it('renders the full flow in English with no Spanish witnesses', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    const draft = vi.spyOn(api, 'draftReminders').mockResolvedValue(RESULT);
    renderEn(<ReminderDrafts slug="a" />);

    expect(screen.getByLabelText('Tone')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Friendly' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Fun' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Formal' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Draft reminders' }));
    expect(draft).toHaveBeenCalledWith('a', 'amable');
    const first = await screen.findByTestId('reminder-draft-g1');
    expect(within(first).getByText('Due: $50.00')).toBeInTheDocument();
    expect(within(first).getByLabelText('Message for José Demo')).toBeInTheDocument();
    expect(screen.getByText('More guests owe money; showing the first ones.')).toBeInTheDocument();

    fireEvent.change(within(first).getByLabelText('Message for José Demo'), {
      target: { value: 'Hi José, edited' },
    });
    expect(messageOf(screen.getByTestId('reminder-whatsapp-g1'))).toBe('Hi José, edited');
    fireEvent.click(screen.getByTestId('reminder-copy-g1'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Hi José, edited'));

    const text = document.body.textContent ?? '';
    for (const witness of [
      'Preparar recordatorios',
      'Tono',
      'Amable',
      'Divertido',
      'Pendiente:',
      'Mensaje para',
      'Copiar',
      'Abrir WhatsApp',
      'Sugerencia automática',
    ]) {
      expect(text, `Spanish witness in English UI: ${witness}`).not.toContain(witness);
    }
  });
});

describe('reminder drafts inside the organizer dashboard', () => {
  const dashboard = (slug: string): Dashboard => ({
    event: {
      id: slug, slug, title: `Fiesta ${slug}`, template: 'comida', meal: 'almuerzo', description: 'Demo',
      startsAt: '2026-10-31T18:00:00Z', location: 'Lugar demo', includes: [], agenda: [], priceCents: 2500,
      capacity: null, goalCents: null, minimumCents: null, minimumReached: false, confirmed: false,
      collectedCents: 0, confirmedPeople: 0, createdAt: '2026-10-24T09:00:00Z',
    },
    guests: [
      { id: 'unpaid', name: 'José Demo', status: 'yes', companions: 0, paidCents: 0, dueCents: 5000 },
    ],
    audit: [],
  });

  it('offers the drafts below the manual grid without auto-sending anything', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    vi.spyOn(api, 'getDashboard').mockResolvedValue(dashboard('a'));
    const draft = vi.spyOn(api, 'draftReminders').mockResolvedValue({ ...RESULT, truncated: false });
    render(
      <OrganizerDashboardView
        slug="a"
        capabilities={null}
        onNavigateInvite={vi.fn()}
        onNavigateHome={vi.fn()}
        onShowToast={vi.fn()}
      />,
    );

    // The existing manual grid keeps working untouched.
    await screen.findByRole('link', { name: /José Demo/ });
    expect(draft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Preparar recordatorios' }));
    await screen.findByTestId('reminder-draft-g1');
    expect(draft).toHaveBeenCalledWith('a', 'amable');
    expect(screen.getByRole('link', { name: /José Demo/ })).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });
});

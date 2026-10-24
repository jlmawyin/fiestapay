import type { ComponentType } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuestGrid } from '../components/dashboard/GuestGrid';
import { OrganizerDashboardView } from '../views/OrganizerDashboardView';
import { api } from '../api/client';
import type { Dashboard, Guest } from '../types';

// jsdom has no grid layout/virtualization. Exercise our real cell renderers here;
// AG Grid rendering and horizontal scrolling are checked separately in the browser.
vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData, columnDefs }: { rowData: Guest[]; columnDefs: ColDef<Guest>[] }) => (
    <table><tbody>{rowData.map(guest => <tr key={guest.id}>{columnDefs.map((col, i) => {
      const value = col.field ? guest[col.field as keyof Guest] : undefined;
      const Cell = col.cellRenderer as ComponentType<Pick<ICellRendererParams<Guest>, 'data' | 'value'>> | undefined;
      return <td key={i}>{Cell ? <Cell data={guest} value={value} /> : String(value ?? '')}</td>;
    })}</tr>)}</tbody></table>
  ),
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const guests: Guest[] = [
  { id:'unpaid', name:'José & Demo', status:'yes', companions:1, paidCents:0, dueCents:5000 },
  { id:'partial', name:'Inés Demo', status:'yes', companions:1, paidCents:2500, dueCents:2500 },
  { id:'paid', name:'Carlos Demo', status:'yes', companions:0, paidCents:2500, dueCents:0 },
  { id:'maybe', name:'Lucía Demo', status:'maybe', companions:0, paidCents:0, dueCents:0 },
  { id:'no', name:'Roberto Demo', status:'no', companions:0, paidCents:0, dueCents:0 },
  { id:'zero', name:'Cero Demo', status:'yes', companions:0, paidCents:0, dueCents:0 },
];
const dashboard = (slug: string): Dashboard => ({
  event: { id:slug, slug, title:`Fiesta ${slug} & Amigos`, template:'comida', meal:'almuerzo', description:'Demo', startsAt:'2026-10-31T18:00:00Z', location:'Lugar demo', includes:[], agenda:[], priceCents:2500, capacity:null, goalCents:10000, minimumCents:5000, minimumReached:true, confirmed:false, collectedCents:5000, confirmedPeople:5, createdAt:'2026-10-24T09:00:00Z' },
  guests, audit:[],
});
const props = () => ({ capabilities:null, onNavigateInvite:vi.fn(), onNavigateHome:vi.fn(), onShowToast:vi.fn() });
function deferred<T>() {
  let resolve!: (value:T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const messageOf = (link:HTMLElement) => new URL((link as HTMLAnchorElement).href).searchParams.get('text')!;

describe('Organizer payment status and human WhatsApp reminders', () => {
  it('renders separate attendance/payment states and only eligible reminders; mounting performs no operation', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const rsvp = vi.spyOn(api, 'rsvp'), create = vi.spyOn(api, 'createOrder'), capture = vi.spyOn(api, 'captureOrder');
    render(<GuestGrid guests={guests} eventTitle="Fiesta A & Amigos" inviteUrl="https://fiestapay.somospanas.com/e/a" />);
    expect(screen.getByText('Confirmado, sin pagar')).toBeInTheDocument();
    expect(screen.getByText('Confirmado (pago parcial)')).toBeInTheDocument();
    expect(screen.getByText('✓ Confirmado (pagado)')).toBeInTheDocument();
    for (const name of ['Lucía Demo','Roberto Demo','Cero Demo']) {
      expect(within(screen.getByRole('row', {name:new RegExp(name)})).queryByText(/pagado/i)).not.toBeInTheDocument();
    }
    expect(screen.getAllByRole('link')).toHaveLength(2);
    const link = screen.getByRole('link', {name:/José & Demo/});
    expect(messageOf(link)).toContain('José & Demo');
    expect(messageOf(link)).toContain('Fiesta A & Amigos');
    expect(messageOf(link)).toContain('$50,00');
    expect(messageOf(link)).toContain('https://fiestapay.somospanas.com/e/a');
    expect(link).toHaveAttribute('target','_blank');
    expect(link).toHaveAttribute('rel','noopener noreferrer');
    expect(messageOf(screen.getByRole('link', {name:/Inés Demo/}))).toContain('$25,00');
    for (const spy of [open,rsvp,create,capture]) expect(spy).not.toHaveBeenCalled();
  });

  it('updates the server balance and event link, then removes reminders after payment or RSVP change', () => {
    const {rerender} = render(<GuestGrid guests={guests.slice(0,2)} eventTitle="Fiesta A" inviteUrl="https://fiestapay.somospanas.com/e/a" />);
    const updated = [{...guests[0],dueCents:1333}, {...guests[1],status:'maybe' as const}];
    rerender(<GuestGrid guests={updated} eventTitle="Fiesta B" inviteUrl="https://fiestapay.somospanas.com/e/b" />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    const text = messageOf(screen.getByRole('link'));
    expect(text).toContain('$13,33'); // Takes the server balance, never recomputes price × people.
    expect(text).toContain('Fiesta B');
    expect(text).toContain('/e/b');
    expect(text).not.toContain('Fiesta A');
    rerender(<GuestGrid guests={[{...updated[0],paidCents:5000,dueCents:0},updated[1]]} eventTitle="Fiesta B" inviteUrl="https://fiestapay.somospanas.com/e/b" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('requires a human action to confirm the celebration without RSVP/payment mutations', async () => {
    const data = dashboard('a');
    vi.spyOn(api,'getDashboard').mockResolvedValue(data);
    const confirm = vi.spyOn(api,'confirmEvent').mockResolvedValue({event:{...data.event,confirmed:true}});
    const rsvp = vi.spyOn(api,'rsvp'), create = vi.spyOn(api,'createOrder'), capture = vi.spyOn(api,'captureOrder');
    render(<OrganizerDashboardView slug="a" {...props()} />);
    fireEvent.click(await screen.findByRole('button',{name:'✓ Confirmar Realización'}));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getAllByText(/asistencia y los pagos de cada invitado se gestionan por separado/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button',{name:'Sí, Confirmar Celebración'}));
    await waitFor(() => expect(confirm).toHaveBeenCalledExactlyOnceWith('a'));
    for (const spy of [rsvp,create,capture]) expect(spy).not.toHaveBeenCalled();
  });

  it('does not reuse guests or reminders from A when loading B fails', async () => {
    const common = props();
    vi.spyOn(api,'getDashboard').mockResolvedValueOnce(dashboard('a')).mockRejectedValueOnce(new Error('No autorizado'));
    const {rerender} = render(<OrganizerDashboardView slug="a" {...common} />);
    await screen.findByRole('link',{name:/José & Demo/});
    rerender(<OrganizerDashboardView slug="b" {...common} />);
    await screen.findByText('Error al acceder al panel');
    expect(screen.queryByRole('link',{name:/recordatorio/i})).not.toBeInTheDocument();
    expect(screen.queryByText('José & Demo')).not.toBeInTheDocument();
  });

  it('ignores a late A load after B is shown', async () => {
    const common=props(), late=deferred<Dashboard>();
    vi.spyOn(api,'getDashboard').mockImplementation(slug => slug==='a' ? late.promise : Promise.resolve(dashboard('b')));
    const {rerender}=render(<OrganizerDashboardView slug="a" {...common} />);
    rerender(<OrganizerDashboardView slug="b" {...common} />);
    await screen.findByRole('heading',{name:'Fiesta b & Amigos'});
    await act(async()=>late.resolve(dashboard('a')));
    expect(screen.queryByRole('heading',{name:'Fiesta a & Amigos'})).not.toBeInTheDocument();
    expect(messageOf(screen.getByRole('link',{name:/José & Demo/}))).toContain('/e/b');
  });

  it('ignores a late confirmation of A after navigating to B', async () => {
    const common=props(), late=deferred<{event:Dashboard['event']}>();
    vi.spyOn(api,'getDashboard').mockImplementation(slug => Promise.resolve(dashboard(slug)));
    vi.spyOn(api,'confirmEvent').mockReturnValue(late.promise);
    const {rerender}=render(<OrganizerDashboardView slug="a" {...common} />);
    fireEvent.click(await screen.findByRole('button',{name:'✓ Confirmar Realización'}));
    fireEvent.click(screen.getByRole('button',{name:'Sí, Confirmar Celebración'}));
    rerender(<OrganizerDashboardView slug="b" {...common} />);
    await screen.findByRole('heading',{name:'Fiesta b & Amigos'});
    await act(async()=>late.resolve({event:{...dashboard('a').event,confirmed:true}}));
    expect(screen.getByRole('heading',{name:'Fiesta b & Amigos'})).toBeInTheDocument();
    expect(screen.queryByText('Fiesta Confirmada ✓')).not.toBeInTheDocument();
    expect(common.onShowToast).not.toHaveBeenCalled();
  });
});

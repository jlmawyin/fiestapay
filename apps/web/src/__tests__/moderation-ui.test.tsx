import type { ComponentType } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import { GuestGrid } from '../components/dashboard/GuestGrid';
import { ModerationPanel } from '../components/dashboard/ModerationPanel';
import { PublicInviteView } from '../views/PublicInviteView';
import type { Capabilities, FiestaEvent, Guest, ModerationConversation, ModerationGuest, ModerationMessage } from '../types';

vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData, columnDefs }: { rowData: Guest[]; columnDefs: ColDef<Guest>[] }) => (
    <table>
      <tbody>
        {rowData.map((guest) => (
          <tr key={guest.id}>
            {columnDefs.map((col, index) => {
              const value = col.field ? guest[col.field as keyof Guest] : undefined;
              const Cell = col.cellRenderer as ComponentType<Pick<ICellRendererParams<Guest>, 'data' | 'value'>> | undefined;
              return <td key={index}>{Cell ? <Cell data={guest} value={value} /> : String(value ?? '')}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

const caps: Capabilities = {
  paypal: false,
  voice: false,
  paypalClientId: null,
  sandbox: true,
  chat: true,
  email: false,
};

function eventOf(): FiestaEvent {
  return {
    id: 'event-one',
    slug: 'fiesta',
    title: 'Comida demo',
    template: 'comida',
    meal: 'almuerzo',
    description: 'Evento de prueba',
    startsAt: '2099-01-01T12:00:00Z',
    location: 'Casa',
    includes: [],
    priceCents: 2500,
    capacity: 20,
    goalCents: null,
    minimumCents: null,
    agenda: [],
    confirmed: false,
    collectedCents: 0,
    confirmedPeople: 1,
    minimumReached: false,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function guestOf(extra: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-server-1',
    name: 'Ana',
    status: 'yes',
    companions: 1,
    paidCents: 1333,
    dueCents: 1167,
    ...extra,
  };
}

describe('moderacion en la interfaz', () => {
  it('habilita bloquear, desbloquear y retirar segun el estado que devolvio el servidor', () => {
    const onBlock = vi.fn();
    const onUnblock = vi.fn();
    const onRemove = vi.fn();
    const guests: Guest[] = [
      guestOf({ id: 'activo', blockedAt: null, removedAt: null, paymentPending: false }),
      guestOf({ id: 'bloqueado', blockedAt: '2026-10-27T15:00:00.000Z', removedAt: null }),
      guestOf({ id: 'retirado', blockedAt: '2026-10-27T15:00:00.000Z', removedAt: '2026-10-27T15:01:00.000Z' }),
      guestOf({ id: 'pendiente', paymentPending: true, paidCents: 0, dueCents: 5000 }),
    ];
    render(
      <GuestGrid
        guests={guests}
        eventTitle="Comida"
        inviteUrl="https://example.test/e/fiesta"
        moderation={{ onBlock, onUnblock, onRemove }}
      />,
    );

    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('Bloqueado')).toBeInTheDocument();
    expect(screen.getByText('Retirado')).toBeInTheDocument();
    expect(screen.getByText('Pago en verificacion')).toBeInTheDocument();
    expect(screen.getByTestId('moderation-block-activo')).toBeEnabled();
    expect(screen.getByTestId('moderation-unblock-activo')).toBeDisabled();
    expect(screen.getByTestId('moderation-block-bloqueado')).toBeDisabled();
    expect(screen.getByTestId('moderation-unblock-bloqueado')).toBeEnabled();
    expect(screen.getByTestId('moderation-remove-retirado')).toBeDisabled();
    expect(screen.getByTestId('moderation-unblock-retirado')).toBeDisabled();

    fireEvent.click(screen.getByTestId('moderation-remove-pendiente'));
    expect(onRemove).toHaveBeenCalledWith('pendiente');
    fireEvent.click(screen.getByTestId('moderation-block-activo'));
    expect(onBlock).toHaveBeenCalledWith('activo');
  });

  it('muestra el texto literal del servidor, el alias opaco y el error de retirada', async () => {
    const script = '<script>alert(1)</script>';
    const conversations: ModerationConversation[] = [
      { id: 'conv-1', guestId: null, guestName: null },
    ];
    const messages: ModerationMessage[] = [
      { id: '41', role: 'user', text: script, createdAt: '2026-10-27T15:00:00.000Z', conversationId: 'conv-1' },
    ];
    vi.spyOn(api, 'getModerationGuests').mockResolvedValue({ guests: [] satisfies ModerationGuest[] });
    vi.spyOn(api, 'getModerationConversations').mockResolvedValue({ conversations });
    vi.spyOn(api, 'getModerationMessages').mockResolvedValue({ messages });
    const remove = vi.spyOn(api, 'deleteModerationMessage').mockRejectedValue(new ApiError('El pago esta en verificacion.', 409));

    render(<ModerationPanel slug="fiesta" refreshKey={1} onGuests={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Participante' }));
    const literal = await screen.findByText(script);
    expect(literal.tagName).toBe('P');
    expect(literal.innerHTML).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(screen.getByText(/41/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('moderation-delete-41'));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('fiesta', '41'));
    expect(await screen.findByRole('alert')).toHaveTextContent('El pago esta en verificacion.');
    expect(screen.getByText(script)).toBeInTheDocument();
  });

  it('cierra formularios de una sesion revocada y conserva verificar la orden y el abono del servidor', async () => {
    const guest = guestOf({ blockedAt: '2026-10-27T15:00:00.000Z', removedAt: null });
    sessionStorage.setItem('fiestapay_order_fiesta', JSON.stringify({ orderId: 'ORD-1', status: 'capturing', approveUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORD-1' }));
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventOf(), guest });
    vi.spyOn(api, 'getOrder').mockResolvedValue({ status: 'capturing', guest });
    vi.spyOn(api, 'getChatHistory').mockResolvedValue({
      messages: [{ id: '88', role: 'assistant', text: 'Historial real del servidor', createdAt: '2026-10-27T15:02:00.000Z' }],
    });
    const send = vi.spyOn(api, 'sendChat');

    render(<PublicInviteView slug="fiesta" capabilities={caps} onShowToast={vi.fn()} onNavigateHome={vi.fn()} />);

    expect(await screen.findByText(/Esta sesión no puede confirmar asistencia/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actualizar mi Asistencia' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '🔍 Verificar Estado' })).toBeInTheDocument();
    expect(screen.queryByText(/Proveedor PayPal no configurado/)).not.toBeInTheDocument();
    expect(screen.getByText(/13,33/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));
    expect(await screen.findByText('Historial real del servidor')).toBeInTheDocument();
    expect(screen.getByText(/El organizador revoco el acceso de esta sesion/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Mensaje para el asistente' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Mensaje para el asistente' }), { target: { value: 'sigue' } });
    fireEvent.submit(screen.getByRole('textbox', { name: 'Mensaje para el asistente' }).closest('form')!);
    expect(send).not.toHaveBeenCalled();
  });
});

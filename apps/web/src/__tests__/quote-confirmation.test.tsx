import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuoteReviewCard } from '../components/invite/QuoteReviewCard';
import type { Quote } from '../types';

afterEach(cleanup);

const quote: Quote = {
  id: 'quote-one', guestId: 'guest-one', people: 1, unitCents: 2500,
  totalCents: 2500, paidCents: 0, amountCents: 2500,
  summary: 'Una persona', expiresAt: '2099-01-01T00:00:00Z',
};

describe('Human quote confirmation', () => {
  it('requires a new confirmation when the server replaces the quote', () => {
    const onCreateOrder = vi.fn(async () => undefined);
    const props = { quote, isLoadingQuote: false, onRefreshQuote: vi.fn(async () => undefined), onCreateOrder, isCreatingOrder: false };
    const { rerender } = render(<QuoteReviewCard {...props} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: /Confirmar y Generar Pago/ })).toBeEnabled();

    rerender(<QuoteReviewCard {...props} quote={{ ...quote, id: 'quote-two', people: 2, totalCents: 5000, amountCents: 5000 }} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    const proceed = screen.getByRole('button', { name: /Confirmar y Generar Pago/ });
    expect(proceed).toBeDisabled();
    fireEvent.click(proceed);
    expect(onCreateOrder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(proceed);
    expect(onCreateOrder).toHaveBeenCalledWith('quote-two');
  });

  it('blocks creation while a fresh server quote is pending', () => {
    const props = { quote, isLoadingQuote: false, onRefreshQuote: vi.fn(async () => undefined), onCreateOrder: vi.fn(async () => undefined), isCreatingOrder: false };
    const { rerender } = render(<QuoteReviewCard {...props} />);
    fireEvent.click(screen.getByRole('checkbox'));
    rerender(<QuoteReviewCard {...props} isLoadingQuote />);
    expect(screen.getByRole('button', { name: /Confirmar y Generar Pago/ })).toBeDisabled();
  });
});

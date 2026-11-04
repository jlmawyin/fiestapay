import { describe, it, expect } from 'vitest';
import { fixedQuote, usd } from '../types';

describe('Financial Quote & Money Integrity Tests', () => {
  it('calculates exact integer cents total for single attendee', () => {
    // 2500 cents = $25.00
    const quote = fixedQuote(2500, 1, 0);
    expect(quote.totalCents).toBe(2500);
    expect(quote.amountCents).toBe(2500);
    expect(Number.isInteger(quote.totalCents)).toBe(true);
    expect(Number.isInteger(quote.amountCents)).toBe(true);
  });

  it('multiplies cleanly for primary attendee plus companions', () => {
    // Primary + 2 companions = 3 people at $18.50 (1850 cents)
    const quote = fixedQuote(1850, 3, 0);
    expect(quote.totalCents).toBe(5550);
    expect(quote.amountCents).toBe(5550);
  });

  it('deducts prior captured payment cleanly from amount due', () => {
    // Total is $50.00 (5000 cents), already paid $20.00 (2000 cents)
    const quote = fixedQuote(2500, 2, 2000);
    expect(quote.totalCents).toBe(5000);
    expect(quote.amountCents).toBe(3000); // $30.00 remaining
  });

  it('clamps amountCents to 0 if paid amount equals or exceeds total', () => {
    const quote = fixedQuote(2500, 1, 3000);
    expect(quote.totalCents).toBe(2500);
    expect(quote.amountCents).toBe(0);
  });

  it('throws for invalid unit cents (non-integer, zero, negative)', () => {
    expect(() => fixedQuote(0, 1)).toThrow('Invalid quote');
    expect(() => fixedQuote(-500, 1)).toThrow('Invalid quote');
    expect(() => fixedQuote(25.5, 1)).toThrow('Invalid quote');
  });

  it('throws for invalid people counts', () => {
    expect(() => fixedQuote(2000, 0)).toThrow('Invalid quote');
    expect(() => fixedQuote(2000, -1)).toThrow('Invalid quote');
    expect(() => fixedQuote(2000, 101)).toThrow('Invalid quote'); // max limit
  });

  it('formats USD currency correctly for Ecuadorian locale (USD)', () => {
    const formatted = usd(2500);
    expect(formatted).toContain('25');
    expect(formatted).toContain('00');
  });
});

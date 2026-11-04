import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { api } from '../api/client';
import type { Capabilities } from '../types';

const capabilities: Capabilities = {
  voice: true,
  chat: false,
  paypal: false,
  paypalClientId: null,
  sandbox: true,
  email: false,
};

/**
 * Integration test for the App-level public launcher. It is meant to run in the full
 * checkout, where every view imported by App exists. The artifact snapshot only contains
 * the voice slice, so Codex/AGY run this there.
 */
describe('public voice launcher placement', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
  });

  afterEach(() => {
    // React Testing Library only auto-cleans with a global afterEach; this file declares
    // its own, so without this line the first App stays mounted and the route test sees
    // two launchers. The product still renders exactly one.
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows exactly one launcher on home without any event or guest', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Abrir asistente de voz' })).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: 'Abrir asistente de voz' })).toHaveLength(1);
  });

  it('keeps exactly one launcher after a client-side route to create', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Abrir asistente de voz' })).toBeInTheDocument();
    });
    await act(async () => {
      window.history.pushState({}, '', '/create');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getAllByRole('button', { name: 'Abrir asistente de voz' })).toHaveLength(1);
  });
});

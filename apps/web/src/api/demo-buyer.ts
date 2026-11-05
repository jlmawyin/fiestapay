import { request } from './client';

export type DemoBuyerResponse =
  | { available: false; sandbox: true }
  | { available: true; sandbox: true; email: string; password: string };

/**
 * Explicit-only read of the dedicated public Personal sandbox buyer. No local storage,
 * query data, or other credential source is involved. The caller invokes this only after
 * a human clicks "Ver cuenta de prueba".
 */
export async function fetchDemoBuyerAccount(): Promise<DemoBuyerResponse> {
  const response = await request<DemoBuyerResponse>('/api/demo/buyer', {
    method: 'GET',
    cache: 'no-store',
  });
  if (!response || typeof response.available !== 'boolean' || response.sandbox !== true) {
    throw new Error('Respuesta de cuenta de prueba inválida.');
  }
  if (!response.available) return { available: false, sandbox: true };
  if (typeof response.email !== 'string' || response.email.length === 0) {
    throw new Error('Respuesta de cuenta de prueba inválida.');
  }
  if (typeof response.password !== 'string' || response.password.length === 0) {
    throw new Error('Respuesta de cuenta de prueba inválida.');
  }
  return response;
}

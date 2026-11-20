/**
 * Proyecto Vitest aislado para pruebas del mapa SP-1b (sin tocar vitest.config.ts raíz).
 * Depende de: vitest.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'somospanas-mapa',
    include: ['scripts/somospanas/**/*.test.ts'],
    restoreMocks: true,
  },
});
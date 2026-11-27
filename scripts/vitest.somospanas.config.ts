/**
 * Proyecto Vitest aislado para pruebas del mapa SP-1b (sin tocar vitest.config.ts raíz).
 * Depende de: vitest.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
  resolve: {
    alias: {
      // NAP-F1b: `verificar` corre estas pruebas antes de compilar shared; resolver a la
      // fuente evita «Failed to resolve entry for package "@fiestapay/shared"» en CI
      // fresco y en ejecuciones directas, igual que apps/web/vite.config.ts y tsconfig.
      '@fiestapay/shared': join(RAIZ, 'packages', 'shared', 'src', 'index.ts'),
    },
  },
  test: {
    name: 'somospanas-mapa',
    include: ['scripts/somospanas/**/*.test.ts'],
    restoreMocks: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

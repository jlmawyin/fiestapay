import { defineConfig } from 'vitest/config';
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: { name:'web', environment:'jsdom', setupFiles:['./src/test/setup.ts'], include:['src/**/*.test.{ts,tsx}'], restoreMocks:true },
});

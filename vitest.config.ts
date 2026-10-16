import { defineConfig } from 'vitest/config';
export default defineConfig({test:{projects:[
  {test:{name:'api',include:['apps/api/**/*.test.ts','packages/**/*.test.ts'],testTimeout:30000,hookTimeout:60000,restoreMocks:true}},
  'apps/web/vitest.config.ts',
]}});

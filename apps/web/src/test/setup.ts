import { afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  vi.restoreAllMocks();
});

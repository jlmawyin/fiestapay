import { afterEach, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// jsdom reports an en-US browser, which would flip every default-locale test
// to English. The suite predates browser-language detection and asserts the
// Spanish default, so the default browser here is Spanish; tests that cover
// detection override navigator.language/languages explicitly per case.
function forceSpanishBrowser(): void {
  try {
    Object.defineProperty(window.navigator, 'language', {
      value: 'es-ES',
      configurable: true,
      writable: true,
    });
  } catch {
    // A non-configurable navigator keeps its value; detection tests stub it.
  }
  try {
    Object.defineProperty(window.navigator, 'languages', {
      value: ['es-ES', 'es'],
      configurable: true,
      writable: true,
    });
  } catch {
    // Same fallback as above.
  }
}

beforeEach(() => {
  forceSpanishBrowser();
});

// Cleanup after each test
afterEach(() => {
  vi.restoreAllMocks();
  forceSpanishBrowser();
});

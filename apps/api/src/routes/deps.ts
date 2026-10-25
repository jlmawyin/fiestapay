import type { GenerateFn } from '../ai/gemini.js';
import type { RespondFn } from '../ai/openai.js';
import type { Config } from '../config.js';
import type { Pool } from '../db/pool.js';
import type { PayPalAdapter } from '../paypal/types.js';

export interface RouteDeps {
  pool: Pool;
  config: Config;
  /** Null when PayPal is not configured; routes that need it answer 503. */
  paypal: PayPalAdapter | null;
  /** Overridden only by tests with a scripted model; production uses each provider's REST call. */
  generate?: GenerateFn;
  respond?: RespondFn;
}

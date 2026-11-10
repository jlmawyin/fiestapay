import type { CreateGeminiVoiceTokenFn } from '../ai/gemini-live.js';
import type { RespondFn } from '../ai/openai.js';
import type { Config } from '../config.js';
import type { Pool } from '../db/pool.js';
import type { EmailAdapter } from '../email/types.js';
import type { PayPalAdapter } from '../paypal/types.js';

export interface RouteDeps {
  pool: Pool;
  config: Config;
  /** Null when PayPal is not configured; routes that need it answer 503. */
  paypal: PayPalAdapter | null;
  /** Null when email is not configured. Tests inject a fake; browsers cannot select it. */
  email: EmailAdapter | null;
  /** Overridden only by tests with a scripted model; production uses the selected provider. */
  respond?: RespondFn;
  /** Overridden only by tests; production creates the Gemini ephemeral token with the SDK. */
  createVoiceToken?: CreateGeminiVoiceTokenFn;
  /** Test-only shorter assistant deadline; production always uses the 40 s constant. */
  assistantDeadlineMs?: number;
}

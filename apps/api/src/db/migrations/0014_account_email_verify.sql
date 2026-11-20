-- Somos Panas SP-4: verificación de correo en cuentas Somos Panas (aditiva).
-- Depende de 0013 (`users`). No retira el trigger `events_fill_legacy_tenant_id`:
-- financiamiento y rollback-compat aún insertan eventos sin tenant_id.

ALTER TABLE users
  ADD COLUMN email_verified_at timestamptz;

CREATE TABLE account_email_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX account_email_tokens_user_idx ON account_email_tokens (user_id, expires_at);
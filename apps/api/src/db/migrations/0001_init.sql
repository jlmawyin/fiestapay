-- FiestaPay P1 schema. USD integer cents only; no floating point money anywhere.
-- Every mutation that touches money or capacity serializes on the events row.

CREATE TABLE sessions (
  id               uuid PRIMARY KEY,
  token_hash       bytea NOT NULL UNIQUE,     -- sha256 of the cookie token; the token itself is never stored
  demo_generation  integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id                   uuid PRIMARY KEY,
  slug                 text NOT NULL UNIQUE,
  organizer_session_id uuid NOT NULL REFERENCES sessions(id),
  generation           integer NOT NULL DEFAULT 0,
  archived             boolean NOT NULL DEFAULT false,
  title                text NOT NULL,
  template             text NOT NULL CHECK (template IN ('comida','casa','viaje','evento')),
  meal                 text NOT NULL CHECK (meal IN ('desayuno','almuerzo','cena')),
  description          text NOT NULL,
  starts_at            timestamptz NOT NULL,
  location             text NOT NULL,
  includes             jsonb NOT NULL DEFAULT '[]'::jsonb,
  agenda               jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_cents          integer NOT NULL CHECK (price_cents >= 1),
  capacity             integer CHECK (capacity IS NULL OR capacity >= 1),
  goal_cents           integer CHECK (goal_cents IS NULL OR goal_cents >= 1),
  minimum_cents        integer CHECK (minimum_cents IS NULL OR minimum_cents >= 1),
  confirmed            boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_organizer_idx ON events (organizer_session_id, created_at DESC);

CREATE TABLE guests (
  id                 uuid PRIMARY KEY,
  event_id           uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id         uuid NOT NULL REFERENCES sessions(id),
  name               text NOT NULL,
  status             text NOT NULL DEFAULT 'maybe' CHECK (status IN ('yes','no','maybe')),
  companions         integer NOT NULL DEFAULT 0 CHECK (companions >= 0 AND companions <= 20),
  obligation_version integer NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, session_id)
);
CREATE INDEX guests_event_idx ON guests (event_id, created_at);

CREATE TABLE quotes (
  id                 uuid PRIMARY KEY,
  event_id           uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_id           uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  obligation_version integer NOT NULL,
  people             integer NOT NULL CHECK (people >= 1),
  unit_cents         integer NOT NULL CHECK (unit_cents >= 1),
  total_cents        integer NOT NULL CHECK (total_cents >= 1),
  paid_cents         integer NOT NULL CHECK (paid_cents >= 0),
  amount_cents       integer NOT NULL CHECK (amount_cents >= 0),
  summary            text NOT NULL,
  expires_at         timestamptz NOT NULL,
  invalidated_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_guest_idx ON quotes (guest_id, created_at DESC);

CREATE TABLE orders (
  id                 uuid PRIMARY KEY,
  event_id           uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_id           uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  quote_id           uuid NOT NULL REFERENCES quotes(id),
  obligation_version integer NOT NULL,
  generation         integer NOT NULL DEFAULT 0,
  request_id         text NOT NULL UNIQUE,    -- stable PayPal-Request-Id; survives timeouts and retries
  paypal_order_id    text UNIQUE,
  amount_cents       integer NOT NULL CHECK (amount_cents >= 1),
  currency           text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  payee_merchant_id  text NOT NULL,
  status             text NOT NULL CHECK (status IN ('intent','created','approved','paid','superseded','failed')),
  approve_url        text,
  capture_id         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
-- At most one open order per guest. Superseding happens in the same transaction as the insert.
CREATE UNIQUE INDEX orders_one_open_per_guest
  ON orders (guest_id)
  WHERE status IN ('intent','created','approved');
CREATE INDEX orders_event_idx ON orders (event_id);

-- Append-only money ledger. A capture or refund can only ever be applied once because the
-- external PayPal id is unique per kind; both the capture call and the webhook converge here.
CREATE TABLE payment_ledger (
  id             uuid PRIMARY KEY,
  event_id       uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_id       uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  order_id       uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('capture','refund')),
  amount_cents   integer NOT NULL CHECK (amount_cents >= 1),
  external_id    text NOT NULL,
  capture_id     text NOT NULL,
  currency       text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, external_id)
);
CREATE INDEX payment_ledger_event_idx ON payment_ledger (event_id);
CREATE INDEX payment_ledger_guest_idx ON payment_ledger (guest_id);
CREATE INDEX payment_ledger_capture_idx ON payment_ledger (capture_id);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  event_id   uuid REFERENCES events(id) ON DELETE CASCADE,
  action     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_event_idx ON audit_log (event_id, id DESC);

-- Received webhook ids, so a redelivered notification is a no-op.
CREATE TABLE webhook_events (
  id          text PRIMARY KEY,
  event_type  text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- Chat history lives on the server, scoped to one (event, session) pair.
CREATE TABLE chat_messages (
  id         bigserial PRIMARY KEY,
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id),
  role       text NOT NULL CHECK (role IN ('user','model','function')),
  parts      jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_scope_idx ON chat_messages (event_id, session_id, id);

-- Somos Panas SP-3: sitios (tenants), cuentas, visibilidad y sitio legado FiestaPay.
-- Depende de migraciones 0001–0012 (sessions, events, orders, payment_ledger, ai_requests, voice_leases).
-- Aditiva: no toca centavos, ids de PayPal ni slugs existentes. El backfill asigna tenant_id del
-- legado solo en events.tenant_id NULL (filas sin sitio); órdenes y libro mayor no se actualizan.
-- Visibilidad por defecto private (D6); chargeable true en filas actuales (D7).

CREATE TABLE tenants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text NOT NULL UNIQUE,
  kind               text NOT NULL CHECK (kind IN ('legacy', 'template', 'group')),
  discoverable       boolean NOT NULL DEFAULT false,
  payment_provider   text NOT NULL CHECK (payment_provider IN ('none', 'paypal_sandbox')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid
);

CREATE TABLE tenant_settings (
  tenant_id          uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  display_name       text NOT NULL CHECK (char_length(display_name) >= 1 AND char_length(display_name) <= 120),
  tagline            text NOT NULL DEFAULT '' CHECK (char_length(tagline) <= 200),
  about              text NOT NULL DEFAULT '' CHECK (char_length(about) <= 4000),
  color_cloudwhite   text NOT NULL CHECK (color_cloudwhite ~ '^#[0-9A-Fa-f]{6}$'),
  color_ink          text NOT NULL CHECK (color_ink ~ '^#[0-9A-Fa-f]{6}$'),
  color_ink_muted    text NOT NULL CHECK (color_ink_muted ~ '^#[0-9A-Fa-f]{6}$'),
  color_blue         text NOT NULL CHECK (color_blue ~ '^#[0-9A-Fa-f]{6}$'),
  color_teal         text NOT NULL CHECK (color_teal ~ '^#[0-9A-Fa-f]{6}$'),
  color_yellow       text NOT NULL CHECK (color_yellow ~ '^#[0-9A-Fa-f]{6}$'),
  color_coral        text NOT NULL CHECK (color_coral ~ '^#[0-9A-Fa-f]{6}$'),
  modulo_reuniones   boolean NOT NULL DEFAULT true,
  modulo_eventos     boolean NOT NULL DEFAULT true,
  modulo_recaudacion boolean NOT NULL DEFAULT true,
  modulo_asistente   boolean NOT NULL DEFAULT true,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  email_hash      bytea NOT NULL UNIQUE,
  password_hash   text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('admin', 'member')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE handoff_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash    bytea NOT NULL UNIQUE,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX handoff_codes_tenant_idx ON handoff_codes (tenant_id, expires_at);

-- Sitio legado único: PayPal sandbox y no listado en portada global.
INSERT INTO tenants (slug, kind, discoverable, payment_provider)
VALUES ('fiestapay', 'legacy', false, 'paypal_sandbox');

INSERT INTO tenant_settings (
  tenant_id,
  display_name,
  tagline,
  about,
  color_cloudwhite,
  color_ink,
  color_ink_muted,
  color_blue,
  color_teal,
  color_yellow,
  color_coral,
  modulo_reuniones,
  modulo_eventos,
  modulo_recaudacion,
  modulo_asistente
)
SELECT
  id,
  'FiestaPay',
  '',
  '',
  '#F7FAFC',
  '#12263A',
  '#4A5D73',
  '#125FE6',
  '#0B8075',
  '#FFC85A',
  '#E85D4A',
  true,
  true,
  true,
  true
FROM tenants
WHERE slug = 'fiestapay';

ALTER TABLE sessions
  ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE events
  ADD COLUMN tenant_id uuid REFERENCES tenants(id),
  ADD COLUMN visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  ADD COLUMN chargeable boolean NOT NULL DEFAULT true;

UPDATE events
   SET tenant_id = (SELECT id FROM tenants WHERE slug = 'fiestapay' LIMIT 1)
 WHERE tenant_id IS NULL;

ALTER TABLE events
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE events
  ADD CONSTRAINT events_public_no_access_code
  CHECK (visibility <> 'public' OR access_code_hash IS NULL);

CREATE UNIQUE INDEX events_tenant_slug_idx ON events (tenant_id, slug);

ALTER TABLE ai_requests
  ADD COLUMN tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;

ALTER TABLE voice_leases
  ADD COLUMN tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;

-- Escritores que aún omiten tenant_id (p. ej. SQL de pruebas de financiamiento pre-SP-4) reciben
-- el legado sin reescribir slugs ni dinero; la aplicación ya envía tenant_id en INSERT explícito.
CREATE OR REPLACE FUNCTION fiestapay_fill_legacy_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT id INTO STRICT NEW.tenant_id FROM tenants WHERE slug = 'fiestapay' LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER events_fill_legacy_tenant_id
  BEFORE INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION fiestapay_fill_legacy_tenant_id();
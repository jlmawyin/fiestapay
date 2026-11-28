-- Somos Panas NAP-S2: dirección propia por reunión en un subdominio.
-- Depende de `events` (0001) y `tenants` (0013). Aditiva: no rellena eventos viejos y
-- mantiene `slug` como identificador interno de la invitación. `subdomain` es único entre
-- reuniones y usa el formato de etiqueta DNS: 3–40, minúsculas/números/guiones internos.

ALTER TABLE events
  ADD COLUMN subdomain text NULL UNIQUE;

ALTER TABLE events
  ADD CONSTRAINT events_subdomain_dns_label
  CHECK (subdomain IS NULL OR subdomain ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$');

-- NAP-S2: tenant interno de reuniones creadas desde la raíz. Su slug no es una etiqueta DNS
-- (empieza con guion bajo), no compite con sitios/eventos y no tiene CHECK que lo rechace.
INSERT INTO tenants (slug, kind, discoverable, payment_provider)
VALUES ('_reuniones', 'group', false, 'none')
ON CONFLICT (slug) DO NOTHING;

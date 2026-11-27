-- Somos Panas SP-7: ventanas de intento para crear espacios desde la raíz.
-- Depende de `email_attempt_windows` (0006, ampliado en 0014). Aditiva.

ALTER TABLE email_attempt_windows DROP CONSTRAINT email_attempt_windows_scope_check;
ALTER TABLE email_attempt_windows
  ADD CONSTRAINT email_attempt_windows_scope_check
  CHECK (scope IN (
    'ip',
    'event',
    'account_login_ip',
    'account_login_email',
    'account_register_ip',
    'account_register_email',
    'site_create_ip',
    'site_create_user'
  ));
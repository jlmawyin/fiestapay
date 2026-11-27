# Revisión del VPS para la demo Napster (27-nov-2026)

Hechos observados desde fuera (sin SSH, solo DNS y HTTP públicos, 27-nov ~16:00 ECT):

| Host | DNS | Responde | Qué es |
| --- | --- | --- | --- |
| `somospanas.com` | Cloudflare (172.67.181.52) | 200 «Somos Panas»; `/api/capabilities` 404 HTML | Página estática, **no** la app |
| `muestra.somospanas.com`, `prueba-xyz.somospanas.com` | Cloudflare (comodín activo) | 200 «muestra.somospanas.com · Somos Panas» | Página estática de marcador |
| `fiestapay.somospanas.com` | Cloudflare (104.21.35.239) | 200 título «FiestaPay — …»; `/api/capabilities` con `llmProvider:"gemini"` | La app, versión anterior (rama `main`, con Gemini, sin 0013–0015) |

Conclusiones:
- El DNS comodín `*.somospanas.com` ya existe y pasa por Cloudflare. No hace falta tocar el DNS.
- El paso pendiente es el **corte de la raíz y del comodín hacia la app**, que en el PLAN se llama D1. Hoy nginx solo enruta `fiestapay.somospanas.com` a la app (`deploy/nginx.conf`).
- Desplegar `somospanas/plan` aplica al arrancar las migraciones **0013, 0014 y 0015**. Son aditivas, pero nunca se han aplicado en producción. Requisitos: OK de Jorge, respaldo y simulacro de restauración.
- Antes de desplegar cuentas (SP-4) debe existir `ACCOUNTS_EMAIL_HMAC_KEY` en `.env.production`.

## Hechos por SSH (27-nov, solo lectura, `root@198.7.114.73`, host `vmi2330194`)

- **Proxy compartido:** `web-proxy-core` (nginx), con la configuración en `/root/nginx-core/conf.d/`. Lo usan otras apps (aac, sparring, hermes, litellm, visitaremota); no se tocan.
  - `00-default.conf` es el `default_server` de los puertos 80 y 443. Recibe la raíz, `www` y todo el comodín, y lo manda al contenedor `somospanas-libre`, la página estática actual (`/opt/somospanas-libre`, un `app.py` con SMTP y Turnstile). Usa un certificado autofirmado, válido detrás de Cloudflare.
  - `fiestapay.conf` atiende `fiestapay.somospanas.com` y lo manda a la app con un certificado de Let's Encrypt.
- **App:** está en `/opt/fiestapay` (copia sin `.git`, `RELEASE_COMMIT` = 3129041, que es `main`). Se levanta con compose (`deploy/compose.yml` + `compose.smtp-runtime.yml`), con los contenedores `fiestapay-api-1` y `fiestapay-db-1`.
- **Variables en `.env.production` (solo los nombres):**
  - Hay variables de PayPal, SMTP y comprador demo.
  - Hay variables de IA que se retiran con F5: `GEMINI_*`, `OPENAI_*`, `ASSEMBLYAI_API_KEY`, `VOICE_*`, `LLM_PROVIDER` y `AI_TEXT_PROVIDER`.
  - **Faltan** `ACCOUNTS_EMAIL_HMAC_KEY` y `NAPSTER_*`.

**Corte propuesto, el mínimo y reversible:** agregar `/root/nginx-core/conf.d/somospanas.conf` con `server_name somospanas.com www.somospanas.com *.somospanas.com` y `proxy_pass` al upstream de la app, reutilizando el certificado autofirmado del bloque por defecto. Los nombres explícitos tienen prioridad sobre `default_server`, así que no se edita `00-default.conf`. El rollback es borrar ese archivo y recargar nginx. `somospanas-libre` sigue corriendo como respaldo.

## Pasos propuestos (Jorge decide quién los ejecuta)

1. **Respaldo:** ejecutar `deploy/backup.sh` y `deploy/restore-drill.sh` sobre una copia, y anotar la hora y el archivo resultante.
2. **Variables en `.env.production`** (los valores los pone Jorge; nunca van a Git):
   - `ACCOUNTS_EMAIL_HMAC_KEY`
   - `NAPSTER_ENABLED=true`, `NAPSTER_API_KEY`, `NAPSTER_API_BASE` (según el diagnóstico)
   - `NAPSTER_AGENT_ID_ES`, `NAPSTER_AGENT_ID_EN` (los imprime `npm run napster:setup`)
   - Cuando F5 esté fusionado, borrar `GEMINI_*`, `OPENAI_*`, `ASSEMBLYAI_*`, `AI_TEXT_PROVIDER`, `LLM_PROVIDER` y `VOICE_*`.
3. **Imagen:** construir y levantar la app desde la rama `somospanas/plan` con el mismo `deploy/compose.yml`. Las migraciones corren al arrancar.
4. **nginx:**
   - Agregar `server_name somospanas.com *.somospanas.com` al mismo upstream de la app.
   - Guardar el bloque actual de la página estática para el rollback.
   - Con Cloudflare en modo proxy, la cabecera `Host` llega intacta (la app clasifica por `Host`).
   - Certificado de origen: comprobar que el que se usa hoy cubra `somospanas.com` y `*.somospanas.com`, o usar el certificado de origen de Cloudflare.
5. **Smoke:**
   - `https://somospanas.com/` muestra la portada C2 con la avatar.
   - `GET /api/portal/events` responde 200.
   - `POST /api/avatar-session` devuelve un token.
   - `https://fiestapay.somospanas.com/` sigue mostrando su portada.
   - `https://muestra.somospanas.com/` muestra la plantilla.
   - Un invitado de prueba entra y confirma su asistencia en el legado.
6. **Rollback:** si algo falla, volver al bloque nginx anterior y a la imagen anterior, y restaurar el respaldo **solo si** las migraciones dañaron datos (son aditivas, así que lo esperable es no tener que restaurar).

## Qué necesita el director de Jorge

- Cómo se entra al VPS: Jorge ejecuta los pasos con esta guía, o autoriza por SSH un alias concreto y el alcance.
- OK explícito para aplicar 0013–0015 en producción después del respaldo.
- OK para cambiar el vhost de `somospanas.com` y `*.somospanas.com` de la página estática a la app (no se toca DNS ni otras apps de Contabo).

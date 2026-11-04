# Recuperación por SMTP Banahosting

25 octubre 2026. GROK construyó el módulo y corrigió la navegación de enlaces en la misma pestaña, entregas 1 y 2 de un máximo de 3. AGY verificó ambas versiones independientemente. El transporte es Nodemailer 10.2.1 en servidor; no existe adaptador alternativo de correo. Credenciales reales únicamente en el entorno privado del servicio en el VPS.

La revisión de la primera entrega ejecutó 253 pruebas en 26 archivos con PostgreSQL local, incluidos dinero, permisos y concurrencia, además de tipos/build y un recorrido Chromium de trece comprobaciones. La segunda validó diez pruebas de UI, ocho comprobaciones de navegación/hash y repitió las trece del recorrido como regresión. No se suman esos conteos como pruebas diferentes: varios comprueban las mismas reglas por capas distintas. El lint del módulo está limpio; la línea pendiente de voz pertenece a otra entrega aún sin integrar.

Reglas verificadas: correo opcional y verificado; respuesta pública uniforme; límites persistentes por IP, evento y día; tokens aleatorios guardados solo como hash, de un uso y máximo quince minutos; rotación atómica de clave con anterior403/nueva200 y un ganador ante consumo concurrente; revocación al cambiar contacto y limpieza al borrar/caducar la fiesta, conservando referencias financieras. Fragmentos se retiran de la URL y el consumo requiere confirmar; nuevas respuestas tardías no cambian una recuperación posterior.

El adaptador admite465 con TLS y587 con STARTTLS obligatorio, valida certificado y mantiene límites de tiempo. Desactiva trazas, lectura de archivos y URLs. Clasifica errores sin registrar auth/cuerpo. Aceptación por el SMTP de salida no demuestra bandeja de entrada ni spam. Las pruebas usaron transporte falso: no hubo conexión ni envío de correo real.

Dependencias `fast-uri` actualizadas a3.1.9/4.2.3; auditoría del espacio de trabajo sin vulnerabilidades registradas. La revisión inspeccionó paquete/bundle y el flujo de datos; no recibió credenciales reales ni demuestra una comparación contra secretos todavía sin cargar.

**Aceptación real posterior:** [SMTP y recuperación verificados con Jorge](smtp-live-20261025.md): dos mensajes enentrada, contacto verificado, claveantigua403 ypanelnuevo200. Reutilización manual confirmada con rechazo400; las pruebas de caducidad/concurrencia descritas arriba mantienen su alcance automatizado. [Configuración y protocolo](../EMAIL_SETUP.md).

Informes ignorados: `.local/recovery-review.md`, `.local/recovery-ui-review.md`; arneses `.local/recovery-verify.e2e.mjs` y `.local/recovery-verify-hashchange.mjs`. Revisión1:337146tokens entrada/39841salida; revisión2:208584entrada/30877salida. El25,8% agregado del puente corresponde aClaude/GPT, no aGemini usado por estos revisores.

## Publicación del código

Commit `2d7c542f8fbea0792e9e066e7e49fd412efad3ad`, [CI aprobada](https://github.com/jlmawyin/fiestapay/actions/runs/40221509308). En el despliegue inicial, únicamente FiestaPay, con copia previa y sin restaurar PostgreSQL ni modificar registrosDNS/MX: APIhealthy,0006 aplicada, ledger1/5000 y recovery_tokens0; correo deshabilitado y dominio con falloTLS. Esos hechos eran el estado inicial, no prueba de recepción. La aceptación posterior conserva la misma imagen y se documenta por separado con el ajuste de clienteDNS soloAPI, sin atribuirle revisión independiente nueva.

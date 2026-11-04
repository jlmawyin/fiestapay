# Copia fuera del VPS y restauración aislada — 27 octubre 2026

Codex operaciones, intento 1/3. Servicio publicado: `44d2c3c`, esquema `0008`. Se creó un dump privado de PostgreSQL en Contabo y se copió al equipo de Jorge, dentro de una carpeta ignorada por Git con acceso para su usuario y SYSTEM. No se copiaron los archivos de entorno ni las credenciales SMTP.

- Archivo: `fiestapay-20261027T201452Z.dump`, 153 978 bytes.
- SHA256 local y remoto coincidentes: `923ee8e97a018e6c22d63c4ef63b36b38a35fd049922011b5eed12d411a71641`.
- Restauración completa en una base nueva y temporal de PostgreSQL16 local: **24 fiestas, 20 asistentes, 3 movimientos contables y migración0008 presente**.
- La captura de USD50 conserva una captura, cero devoluciones y 5000 centavos; el caso de USD1 conserva una captura, una devolución y saldo0. No se ejecutaron pagos ni consultas a proveedores desde esta prueba.
- La base temporal se eliminó al terminar. Producción y las bases locales del constructor y del revisor no se restauraron ni sobrescribieron.

El dump y el resultado detallado permanecen en `.local`, fuera de Git; no publicar su contenido. La prueba acredita restauración de datos desde una copia fuera del VPS. No simula una pérdida completa del servidor ni acredita recuperación de DNS, secretos o servicios externos.

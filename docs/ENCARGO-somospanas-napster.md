# Encargo: somospanas.com con avatar Napster (Napster API Ignite 2026)

Actualizado el 27-nov-2026 por el director (Claude) a pedido de Jorge: «encárgate tú y modifica del encargo lo que necesites». Reemplaza la versión anterior, que no se escribió para el hackathon. El plan detallado y vivo está en [internal/PLAN-NAPSTER-IGNITE.md](internal/PLAN-NAPSTER-IGNITE.md).

## Objetivo

Cuando alguien abre somospanas.com, una avatar Napster con video y voz lo recibe (en español o en inglés), presenta Somos Panas y guía a tres tipos de visitante:

1. **Público:** llega por curiosidad o por un link de redes. La avatar presenta el sitio, muestra los eventos abiertos e invita a crear un espacio o a apoyar un evento como invitado. Los sitios privados de grupos no aparecen.
2. **Creador:** organiza una reunión. La avatar lo guía paso a paso y rellena borradores por tools. Puede usar su foto como avatar (extra opcional) o el avatar general.
3. **Invitado:** llega con el link de un evento. La avatar lo saluda con el nombre del evento y lo lleva directo a la reunión.

La avatar solo explica y guía. Las acciones finales (publicar, confirmar, aprobar un pago) las hace la persona en la app.

## Reglas del hackathon (verificadas el 27-nov)

- **Entrega:** antes del 30-nov 23:59 hora del Pacífico, que es el 1-dic 02:59 en Ecuador. Meta interna: congelar a las 12:00 ECT del 30-nov y entregar antes de las 20:00 ECT. Jorge está inscrito.
- **Qué se entrega:** demo en línea, video de 3 min o menos con los tres saludos (cara y voz), link al repo y resumen de 500 palabras o menos. El resumen explica qué hace, qué problema resuelve, cómo usa la API de Napster y declara que se usaron agentes de IA bajo la dirección de Jorge.
- **Calificación:** uso de la API de Napster 30 %, ejecución técnica 25 %, creatividad 25 %, presentación 20 %.
- **Trabajo nuevo:** la integración con Napster debe hacerse durante el concurso. El resumen dice con honestidad qué venía de FiestaPay y qué es nuevo.

## Decisiones de Jorge

- **La única IA del producto es Napster**, en todo lo posible. Se retiran los proveedores anteriores: código, dependencias, configuración, documentación pública y textos. También desaparece «FiestaPay» del texto visible y de los datos de demo.
- El sitio legado `fiestapay.somospanas.com` también pasa a Napster.
- La invitación desde una frase y los recordatorios pasan a ser **tools de la avatar**. Rellenan el formulario y la persona revisa y publica.
- Hay **dos agentes Napster, `es` y `en`**, con el mismo avatar, conocimiento y tools. La app elige el agente según el idioma de la página.
- **Créditos Napster:** USD 150 en total. Tope de pruebas de desarrollo: USD 40, con registro en `.local/coord/NAPSTER-GASTO.md`. El resto queda para el video y el jurado (del 30-nov al 8-dic).
- **SDK:** se autoriza instalar `@touchcastllc/napster-companion-api@2` y `@reduxjs/toolkit`.
- **Git:** ramas, commit, push y fusión a `somospanas/plan` autorizados al director, siempre con CI verde, 0 pruebas omitidas y veredicto independiente de Codex. Nada va a `main` ni a producción sin el despliegue acordado con Jorge.
- **Worktree:** se autoriza uno temporal en `C:\Users\Jorge\OneDrive\hackathon\somospanas-napster`, sin `.env`, que se borra al fusionar.
- **Despliegue:** Somos Panas ya está en el VPS de Jorge. Hoy se revisa con él cómo desplegar. La migración 0015 (SP-7) necesita su OK y un respaldo antes de aplicarse en producción.

## Forma de trabajo

- **Repo local:** `C:\Users\Jorge\OneDrive\hackathon\somospanas`, rama base `somospanas/plan`.
  - FiestaPay se puede consultar, en solo lectura, en `C:\Users\Jorge\OneDrive\hackathon\fiestapay`.
  - No se usan otras carpetas.
- **Dirección (habilidad director-claude):**
  - Claude dirige y no programa.
  - Muse y DSH construyen, con un máximo de dos frentes y rutas disjuntas.
  - Codex verifica en solo lectura y rescata.
  - AGY y Grok están retirados.
- **Secretos:** la clave `NAPSTER_API_KEY` la pone Jorge en su `.env`. Nunca va a Git, logs, navegador, reportes ni prompts.
- **Pruebas:** sin red hacia Napster en las pruebas automáticas (se usa un falso). Las llamadas reales las hace solo el director, dentro del tope.
- **Pruebas humanas:** la prueba con voz y cámara la hace Jorge. No se da por pasada sin su evidencia.
- **Idioma:** respuestas en español claro, separando hechos, inferencias y pendientes.

## Orden

1. Arreglar `npm run verificar` en Windows y las 5 pruebas que fallan.
2. Integrar SP-7 (#49) y SP-6 (#50): portada y eventos públicos.
3. Endpoint `POST /api/avatar-session` y avatar en la portada para el Público.
4. Flujos de Creador e Invitado, con tools, conocimiento y FAQ.
5. Retirar por completo cualquier otra IA o voz, con las pruebas en verde. El legado también pasa a Napster.
6. Avatar con la foto del creador: personalizado, opcional y sin bloquear la demo.
7. Documentación para el jurado, resumen, guion del video y despliegue final.

Fuera de alcance antes del plazo: SP-9 (recaudaciones anotadas) y SP-11 (examen «Cumpleaños»). La avatar no promete funciones que no existen.

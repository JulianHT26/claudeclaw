---
name: davincheese-proveedores
description: Publica en WhatsApp la deuda real de proveedores de Da Vincheese para un rango de fechas específico -- exactamente el mismo reporte que ya llega solo todos los lunes 9am, pero bajo pedido y con las fechas que el usuario quiera. Usar ante "sacame la deuda de proveedores del X al Y", "cuánto le debemos a los proveedores entre el X y el Y", "corré el reporte de proveedores de esta semana/del mes pasado", o cualquier pedido de revisar pagos pendientes a proveedores fuera del ciclo semanal automático.
---

# Proveedores pendientes de pago (rango libre, bajo pedido)

Mismo Ops Bridge que el resto de los reportes -- no llames a Fudo ni a Postgres directo.

## Diferencia clave con el resto de los reportes de este directorio

**No vuelve con los datos en la respuesta.** Este comando solo confirma que el reporte se encoló
-- el reporte real (un mensaje de WhatsApp por proveedor con deuda real, listando los 3 medios de
pago con su emoji: 💵 Efectivo / 🏦 Bancolombia / 💳 Datafono bold) llega unos segundos después,
publicado directo por el puente de proveedores. Es el mismo código que corre solo los lunes 9am
(semana anterior) -- `reports_proveedores_pendientes_rango_...` es "correlo ahora, con estas
fechas", nada más.

## Cómo pedirlo

1. Identificá el rango de fechas exacto que pide el usuario (YYYY-MM-DD, ambas inclusive). Si no
   queda claro qué rango quiere ("esta semana" es ambiguo: ¿lunes-hoy, o los últimos 7 días?),
   preguntá antes de asumir -- no hay un default silencioso, mismo criterio que
   `davincheese-ventas`.
2. Generá un id único.
3. Escribí `/workspace/project/ops/requests/<id>.json` con
   `{"cmd": "reports_proveedores_pendientes_rango_<desde>_<hasta>"}` (ej.
   `reports_proveedores_pendientes_rango_2026-08-01_2026-08-15`).
4. Esperá `/workspace/project/ops/results/<id>.json` -- normalmente rápido (~5s, es solo encolar
   un job, no esperar a que Fudo responda).
5. El `stdout` trae:
   ```json
   { "ok": true, "mensaje": "Reporte encolado -- los mensajes de WhatsApp llegan en los próximos segundos..." }
   ```
   Respondele al usuario en el momento algo como "Dale, ya te mando por acá la deuda de
   proveedores del [rango] -- un mensaje por proveedor, reaccioná con el emoji del medio que
   usaste (💵/🏦/💳) para registrar el pago." **No inventes ni resumas cifras vos** -- el detalle
   real (proveedor, monto, gastos) llega en los mensajes que publica el puente, no en esta
   respuesta.

## Qué pasa después (para que puedas explicárselo al usuario si pregunta)

- **Un solo mensaje por proveedor** con deuda real en el rango, listando los 3 medios de pago con
  su emoji -- reaccionar con el emoji del medio que corresponda, directo sobre ese mensaje,
  registra el pago real en Fudo con ese medio (ejecuta el mismo script que ya usa
  `pago-proveedores` a mano, con verificación antes de guardar).
- Reaccionar con cualquier otro emoji (✅/❌ incluidos), o no reaccionar, **no hace nada** -- el
  proveedor queda pendiente sin vencimiento, se puede resolver en cualquier momento futuro.
- Si el rango pedido no tiene ningún proveedor con deuda real, no llega ningún mensaje -- si el
  usuario pregunta y no le llegó nada, es esperable, no un error.

## No hacer

- No calcules ni afirmes montos de deuda vos mismo -- ni con este comando ni con ningún otro, la
  única fuente es este reporte (o `pago-proveedores` en una sesión de Claude Code sobre el repo).
- No confundas esto con el pago en sí -- este comando solo publica el reporte, el pago lo dispara
  la reacción del usuario, nunca este comando por sí solo.

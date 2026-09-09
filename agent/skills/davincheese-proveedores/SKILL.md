---
name: davincheese-proveedores
description: Consulta y publica en WhatsApp la deuda real de proveedores de Da Vincheese para un rango de fechas específico, en 2 pasos (resumen primero, publicar los mensajes de pago después de confirmar). Usar ante "cuánto debo a proveedores del X al Y", "sacame la deuda de proveedores del X al Y", "cuánto le debemos a los proveedores entre el X y el Y", "corré el reporte de proveedores de esta semana/del mes pasado", o cualquier pedido de revisar pagos pendientes a proveedores fuera del ciclo semanal automático.
---

# Proveedores pendientes de pago (rango libre, en 2 pasos)

Mismo Ops Bridge que el resto de los reportes -- no llames a Fudo ni a Postgres directo.

Flujo en 2 pasos (pedido explícito del usuario 2026-09-09, ver
`decisions/2026-09-09-cron-pago-proveedores.md` en davincheese-os): primero un **resumen** con el
dato real y fresco de este pedido puntual, después -- solo si el usuario confirma -- se **publica**
el reporte real (un mensaje por proveedor, reaccionable, dispara el pago).

## Paso 1 -- Resumen (siempre primero, nunca te saltees este paso)

1. Identificá el rango de fechas exacto que pide el usuario (YYYY-MM-DD, ambas inclusive). Si no
   queda claro qué rango quiere ("esta semana" es ambiguo: ¿lunes-hoy, o los últimos 7 días?),
   preguntá antes de asumir -- no hay un default silencioso, mismo criterio que
   `davincheese-ventas`.
2. Generá un id único.
3. Escribí `/workspace/project/ops/requests/<id>.json` con
   `{"cmd": "reports_proveedores_pendientes_resumen_rango_<desde>_<hasta>"}` (ej.
   `reports_proveedores_pendientes_resumen_rango_2026-08-01_2026-08-15`).
4. Esperá `/workspace/project/ops/results/<id>.json` -- puede tardar hasta ~20s (reconcilia cada
   proveedor con deuda contra su historial completo en Fudo, no es instantáneo).
5. El `stdout` trae:
   ```json
   {
     "rango": { "desde": "...", "hasta": "..." },
     "proveedores": [{ "nombre": "...", "monto": 568642, "montoFmt": "$568.642", "gastos": 6 }, ...],
     "total": 3010338,
     "totalFmt": "$3.010.338"
   }
   ```
   **Este es el ÚNICO dato del que podés armar una tabla o resumen** -- fresco, de este pedido
   puntual, nunca inventado ni reusado de otro momento. Mostrale al usuario una tabla con
   proveedor/monto (podés usar `montoFmt`/`totalFmt` directo) y cerrá SIEMPRE con esta pregunta
   textual (pedido explícito del usuario 2026-09-09, no la parafrasees):
   **"¿Quieres iniciar el proceso de registro de pago para estos proveedores?"**
   **No sigas al paso 2 sin que el usuario diga que sí** -- no asumas.
   - Si `proveedores` viene vacío: no hay deuda real en ese rango, decíselo y no hay nada más que
     hacer (no hace falta el paso 2).

## Paso 2 -- Publicar (solo si el usuario confirmó que quiere pagar)

1. Generá un id único nuevo.
2. Escribí `/workspace/project/ops/requests/<id>.json` con
   `{"cmd": "reports_proveedores_pendientes_rango_<desde>_<hasta>"}` (mismo desde/hasta del paso
   1 -- sin `resumen_` en el nombre del comando esta vez).
3. Esperá el resultado (rápido, ~5s -- solo encola el job de publicar, no espera a que termine).
4. El `stdout` trae `{"ok": true, "mensaje": "..."}`. Respondele al usuario algo como "Dale, ya te
   mando los mensajes -- reaccioná con el emoji del medio que usaste (💵 Efectivo / 🏦 Bancolombia
   / 💳 Datafono bold) en cada uno para registrar el pago." **No repitas la tabla del paso 1 acá**
   -- los mensajes que están por llegar ya tienen el detalle.

## Qué pasa después de publicar (para que puedas explicárselo al usuario si pregunta)

- **Un solo mensaje por proveedor**, listando los 3 medios de pago con su emoji -- reaccionar con
  el emoji del medio que corresponda, directo sobre ese mensaje, registra el pago real en Fudo con
  ese medio (ejecuta el mismo script que ya usa `pago-proveedores` a mano, con verificación antes
  de guardar).
- Reaccionar con cualquier otro emoji (✅/❌ incluidos), o no reaccionar, **no hace nada** -- el
  proveedor queda pendiente sin vencimiento, se puede resolver en cualquier momento futuro.
- **El aviso de éxito/error de cada pago lo manda el puente directo, como mensaje propio** (sin el
  prefijo `[Davincho] 🧊` -- se nota porque no lleva ese prefijo). Vos (Davincho) NO te enterás
  cuando eso pasa ni tenés forma de confirmarlo desde el chat.

## No hacer

- **No te saltees el paso 1.** Nunca llames directo al comando de publicar sin haber mostrado
  antes el resumen y recibido una confirmación explícita.
- **No armes una tabla/resumen/total con datos que no vengan del `stdout` del paso 1 de ESTE
  pedido.** Nunca reuses cifras de este mismo chat, de `memory_search`, ni de un pedido anterior
  (aunque el rango de fechas parezca el mismo) -- pueden estar desactualizadas o ser de otro
  cálculo. Ya causó un error real dos veces: un total mal calculado y una tabla con datos viejos
  quietos de un pedido anterior. Cada pedido nuevo corre el paso 1 de nuevo, sin excepción.
- No confundas el paso 1 con el pago en sí -- el resumen no publica nada ni mueve dinero, el pago
  lo dispara la reacción del usuario después del paso 2, nunca antes.
- **Nunca confirmes que un pago "quedó registrado" o algo similar si el usuario te dice "ya
  reaccioné" o parecido.** No tenés ninguna forma de saber si funcionó -- el aviso real lo manda
  el puente por su cuenta (ver arriba). Si el usuario te pregunta cómo va, decile eso: que el
  aviso llega directo del puente, no de vos, y que revise si le llegó un mensaje de confirmación
  separado.

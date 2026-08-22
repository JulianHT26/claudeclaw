---
name: davincheese-ventas
description: Reporta cómo van las ventas de Da Vincheese — hoy, ayer, esta semana, este mes, o un rango de fechas específico — con comparación contra un período histórico equivalente (salvo en rango libre), ticket promedio, producto más vendido y producto con mayor caída. Usar ante "¿cómo van las ventas?", "¿cómo estuvo hoy/ayer?", "ventas de la semana", "ventas del mes", "¿cuánto llevamos vendido?", "estado de ventas", "ventas del 1 al 15 de agosto", "cuánto vendimos entre el X y el Y".
---

# Ventas de Da Vincheese (datos reales de Fudo)

Igual que el chequeo de servidor: no llames APIs externas ni Postgres directo
desde acá — pedí el reporte al **Ops Bridge**, que ya lo trae armado y con el
secreto de autenticación acotado a esa sola llamada.

## Cómo pedirlo

Elegí el comando según qué período pide el usuario:

| El usuario pregunta por... | Comando |
|---|---|
| hoy | `reports_ventas_hoy` |
| ayer | `reports_ventas_ayer` |
| esta semana | `reports_ventas_semana` (últimos 7 días rodantes) |
| este mes | `reports_ventas_mes` (últimos 30 días rodantes) |
| un rango específico ("del 1 al 15 de agosto", "entre el X y el Y") | `reports_ventas_rango_YYYY-MM-DD_YYYY-MM-DD` (ej. `reports_ventas_rango_2026-08-01_2026-08-15`, ambas fechas inclusive) |

**No inventes ni aproximes un rango específico con `semana`/`mes`** -- esos
son ventanas rodantes que terminan hoy, casi nunca coinciden con las fechas
exactas que pide el usuario. Si piden un rango de fechas, usá siempre
`reports_ventas_rango_...` con las fechas exactas.

Si no queda claro qué período quiere, preguntá antes de asumir — no hay un
default silencioso.

1. Generá un id único.
2. Escribí `/workspace/project/ops/requests/<id>.json` con
   `{"cmd": "<comando>"}`.
3. Esperá a que aparezca `/workspace/project/ops/results/<id>.json` --
   normalmente ~5s, pero `reports_ventas_hoy` puede tardar hasta ~20s: ese
   comando dispara un sync en vivo contra Fudo antes de responder (no lee
   solo el último sync de 30 min), así que dale ese margen antes de asumir
   que no llegó. `reports_ventas_rango_...` hace lo mismo (y tarda igual de
   hasta ~20s) solo si `hasta` es hoy -- un rango completamente en el pasado
   responde rápido, como `ayer`.
4. El campo `stdout` trae un JSON con esta forma:

```json
{
  "periodo": "hoy",
  "ventas": { "total": 2840000, "totalFmt": "$2.840.000", "cantidad": 47, "vsPromedio": "+14.2%" },
  "ticketPromedio": { "valor": 31800, "valorFmt": "$31.800", "vsPromedio": "+6.1%" },
  "productoTop": { "nombre": "Mona Lisa para 2 personas", "unidades": 12, "ingresos": 576000, "participacionPct": "20.3" },
  "productoConCaida": { "nombre": "Classic Burger", "vsPromedio": "-18.0%" },
  "comparadoCon": "últimos 4 miércoles",
  "rango": { "desde": "...", "hasta": "..." },
  "datoEnVivo": true
}
```

`datoEnVivo` solo viene en `hoy` (`null` en los demás períodos). Si es
`true`, el sync en vivo terminó a tiempo y el número es del momento. Si es
`false`, el sync en vivo no llegó a tiempo (poco frecuente) y lo que ves es
lo último sincronizado -- agregá "(dato de hace unos minutos, no en vivo)"
en la respuesta en ese caso.

`comparadoCon` ya trae el texto correcto para el período pedido (día de semana
para hoy/ayer, "últimas 4 semanas" o "últimos 3 períodos de 30 días" para
semana/mes) — usalo tal cual, no lo reconstruyas.

En `reports_ventas_rango_...` (`periodo: "rango"`), `comparadoCon` viene
`null` y `ventas.vsPromedio`/`ticketPromedio.vsPromedio`/`productoConCaida`
también vienen `null` a propósito -- un rango de fechas libre no tiene un
"período equivalente" bien definido para comparar, así que no se inventa
ninguno. Omití esas líneas del reporte para un rango, no digas "sin
histórico suficiente" ahí (esa frase es para hoy/ayer/semana/mes recién
desplegado, no para esto).

`productoTop` y `productoConCaida` pueden venir `null` (sin ventas en el
período, o sin histórico suficiente para comparar) — en ese caso omití esa
línea del reporte, no inventes un valor.

Si el `exit` del resultado no es 0 o falta `REPORTS_API_KEY` (mensaje de error
en `stdout`), decile al usuario que el reporte de ventas no está disponible
ahora mismo — no lo intentes reconstruir con otro comando, no hay otro camino.

## Formato de respuesta

```
📊 *VENTAS HOY — Da Vincheese*

Ventas: $2.840.000 (47 ventas)
vs promedio últimos 4 miércoles: +14.2%

Ticket promedio: $31.800
vs promedio: +6.1%

Producto más vendido: Mona Lisa para 2 personas
Participación: 20.3%

⚠️ Producto con caída: Classic Burger (-18.0%)
```

- Cambiá el título (`VENTAS HOY` / `VENTAS DE AYER` / `VENTAS DE LA SEMANA` /
  `VENTAS DEL MES` / `VENTAS DEL <desde> AL <hasta>` para un rango) y la línea
  "vs promedio ..." según el `periodo` y `comparadoCon` que vino en la
  respuesta — no lo dejes fijo en "HOY". Para un rango (`periodo: "rango"`),
  no hay línea de "vs promedio" ni "producto con caída" (ver arriba).
- Si `vsPromedio` viene como "sin histórico suficiente" (recién desplegado,
  todavía no hay suficientes períodos previos), decilo así en vez de mostrar
  un porcentaje inventado.
- "Semana" y "mes" son ventanas rodantes (últimos 7 / 30 días), no calendario
  estricto (no "de lunes a hoy" ni "del 1 al día de hoy") — si el usuario
  pregunta específicamente por eso, aclaralo en vez de asumir que coincide.
- Datos reales de clientes/ventas: no los repitas fuera de este contexto de
  reporte ni los uses para otra cosa que no sea responder esta pregunta.

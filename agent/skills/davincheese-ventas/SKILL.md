---
name: davincheese-ventas
description: Reporta cómo van las ventas de Da Vincheese — hoy, ayer, esta semana o este mes — con comparación contra un período histórico equivalente, ticket promedio, producto más vendido y producto con mayor caída. Usar ante "¿cómo van las ventas?", "¿cómo estuvo hoy/ayer?", "ventas de la semana", "ventas del mes", "¿cuánto llevamos vendido?", "estado de ventas".
---

# Ventas de Da Vincheese (datos reales de Fudo)

Igual que el chequeo de servidor: no llames APIs externas ni Postgres directo
desde acá — pedí el reporte al **Ops Bridge**, que ya lo trae armado y con el
secreto de autenticación acotado a esa sola llamada.

## Cómo pedirlo

Elegí el comando según qué período pide el usuario — son cuatro comandos
distintos, uno por período, no un parámetro libre:

| El usuario pregunta por... | Comando |
|---|---|
| hoy | `reports_ventas_hoy` |
| ayer | `reports_ventas_ayer` |
| esta semana | `reports_ventas_semana` (últimos 7 días rodantes) |
| este mes | `reports_ventas_mes` (últimos 30 días rodantes) |

Si no queda claro qué período quiere, preguntá antes de asumir — no hay un
default silencioso.

1. Generá un id único.
2. Escribí `/workspace/project/ops/requests/<id>.json` con
   `{"cmd": "<uno de los cuatro comandos de arriba>"}`.
3. Esperá a que aparezca `/workspace/project/ops/results/<id>.json` --
   normalmente ~5s, pero `reports_ventas_hoy` puede tardar hasta ~20s: ese
   comando dispara un sync en vivo contra Fudo antes de responder (no lee
   solo el último sync de 30 min), así que dale ese margen antes de asumir
   que no llegó.
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
  `VENTAS DEL MES`) y la línea "vs promedio ..." según el `periodo` y
  `comparadoCon` que vino en la respuesta — no lo dejes fijo en "HOY".
- Si `vsPromedio` viene como "sin histórico suficiente" (recién desplegado,
  todavía no hay suficientes períodos previos), decilo así en vez de mostrar
  un porcentaje inventado.
- "Semana" y "mes" son ventanas rodantes (últimos 7 / 30 días), no calendario
  estricto (no "de lunes a hoy" ni "del 1 al día de hoy") — si el usuario
  pregunta específicamente por eso, aclaralo en vez de asumir que coincide.
- Datos reales de clientes/ventas: no los repitas fuera de este contexto de
  reporte ni los uses para otra cosa que no sea responder esta pregunta.

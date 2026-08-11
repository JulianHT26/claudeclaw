---
name: davincheese-ventas
description: Reporta cómo van las ventas de Da Vincheese hoy — total, comparación contra el promedio de las últimas 4 semanas del mismo día, ticket promedio, producto más vendido y producto con mayor caída. Usar ante "¿cómo van las ventas?", "¿cómo estuvo hoy?", "¿cuánto llevamos vendido?", "estado de ventas".
---

# Ventas de Da Vincheese (datos reales de Fudo)

Igual que el chequeo de servidor: no llames APIs externas ni Postgres directo
desde acá — pedí el reporte al **Ops Bridge**, que ya lo trae armado y con el
secreto de autenticación acotado a esa sola llamada.

## Cómo pedirlo

1. Generá un id único.
2. Escribí `/workspace/project/ops/requests/<id>.json` con
   `{"cmd": "reports_ventas_hoy"}`.
3. Esperá hasta ~5s a que aparezca `/workspace/project/ops/results/<id>.json`.
4. El campo `stdout` trae un JSON con esta forma:

```json
{
  "ventas": { "total": 2840000, "totalFmt": "$2.840.000", "cantidad": 47, "vsPromedio": "+14.2%" },
  "ticketPromedio": { "valor": 31800, "valorFmt": "$31.800", "vsPromedio": "+6.1%" },
  "productoTop": { "nombre": "Mona Lisa para 2 personas", "unidades": 12, "ingresos": 576000, "participacionPct": "20.3" },
  "productoConCaida": { "nombre": "Classic Burger", "vsPromedio": "-18.0%" },
  "comparadoConSemanas": 4,
  "periodo": { "desde": "...", "hasta": "..." }
}
```

`productoTop` y `productoConCaida` pueden venir `null` (sin ventas hoy, o sin
histórico suficiente para comparar) — en ese caso omití esa línea del reporte,
no inventes un valor.

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

- El día de comparación ("últimos 4 miércoles/jueves/...") es siempre el día
  de la semana de HOY — no lo escribas fijo, usalo tal cual describe la
  comparación real.
- Si `vsPromedio` viene como "sin histórico suficiente" (recién desplegado,
  todavía no hay 4 semanas de datos), decilo así en vez de mostrar un
  porcentaje inventado.
- Datos reales de clientes/ventas: no los repitas fuera de este contexto de
  reporte ni los uses para otra cosa que no sea responder esta pregunta.

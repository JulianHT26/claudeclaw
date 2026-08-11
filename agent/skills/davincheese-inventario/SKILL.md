---
name: davincheese-inventario
description: Reporta el consumo teórico de ingredientes (calculado desde ventas reales × receta de cada producto) para hoy, ayer, la semana o el mes, junto al stock actual registrado en Fudo como referencia. Usar ante "¿cuánto se consumió de X?", "consumo de ingredientes", "¿qué tanto papa/queso/etc se usó?", "inventario teórico".
---

# Consumo teórico de ingredientes (Da Vincheese)

Mismo patrón que `davincheese-ventas`: pedí el reporte al Ops Bridge, nunca
Postgres ni el API de Fudo directo.

## Qué es y qué NO es este número

`consumoTeorico` = (unidades vendidas de cada producto en el período) ×
(gramos/unidades de cada ingrediente en su receta), sumado por ingrediente.
Es un cálculo, no una medición — asume que cada plato se preparó exactamente
según la receta cargada en Fudo, sin mermas ni variaciones.

**No calcules "días de inventario restante" ni "% de merma" comparando
`consumoTeorico` contra `stockActual` tú mismo.** El propio reporte trae una
`advertencia` explicando por qué: el stock de Fudo no tiene confirmada la
misma unidad que la receta, y Fudo no expone historial de compras, así que no
hay forma de aislar cuánto bajó el stock por ventas vs. por una reposición
reciente. Mostrá los dos números por separado, tal como vienen, con la
advertencia si el usuario pregunta específicamente por eso.

## Cómo pedirlo

| El usuario pregunta por... | Comando |
|---|---|
| hoy | `reports_consumo_hoy` |
| ayer | `reports_consumo_ayer` |
| esta semana | `reports_consumo_semana` (últimos 7 días rodantes) |
| este mes | `reports_consumo_mes` (últimos 30 días rodantes) |

1. Generá un id único.
2. Escribí `/workspace/project/ops/requests/<id>.json` con `{"cmd": "<comando>"}`.
3. Esperá hasta ~5s a que aparezca `/workspace/project/ops/results/<id>.json`.
4. El campo `stdout` trae:

```json
{
  "periodo": "semana",
  "rango": { "desde": "...", "hasta": "..." },
  "advertencia": "stock viene de Fudo sin confirmar que su unidad coincida con la de la receta...",
  "ingredientes": [
    { "nombre": "Papa", "consumoTeorico": 42350, "unidad": "g", "stockActual": 38.2, "stockControlActivo": true },
    { "nombre": "Salchicha americana", "consumoTeorico": 15600, "unidad": "g", "stockActual": null, "stockControlActivo": false }
  ]
}
```

`ingredientes` viene ordenado de mayor a menor consumo. `stockActual: null`
significa que ese ingrediente no tiene control de stock activado en Fudo —
decilo así si el usuario pregunta por ese ingrediente en particular, no lo
muestres como 0.

Si no hay ventas en el período (`ingredientes` vacío), decilo directamente —
no repitas el reporte de un período anterior como si fuera el actual.

## Formato de respuesta

```
📦 *CONSUMO TEÓRICO — Semana*

Calculado desde ventas reales × receta de cada producto (no es una medición
de stock, es lo que debería haberse usado si todo se preparó según receta).

Papa            42.350 g   (stock actual: 38.2 — verificar unidad)
Salchicha am.   15.600 g
Queso            9.800 g
...

⚠️ El stock actual de Fudo no tiene confirmado que use la misma unidad que la
receta — no lo tomes como "cuánto falta comprar" sin revisarlo a mano.
```

- Mostrá los primeros 8-10 ingredientes por consumo, no la lista completa
  entera salvo que el usuario la pida.
- Convertí a kg cuando el número en gramos sea grande (>1000g), para que sea
  legible — pero mantené el valor exacto, no redondees de forma que cambie el
  orden de magnitud.
- No conviertas `stockActual` a la unidad de la receta ni saques
  conclusiones sobre si alcanza o no — ver la sección de arriba.

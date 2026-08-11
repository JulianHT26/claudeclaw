---
name: davincheese-rentabilidad
description: Reporta margen y rentabilidad de Da Vincheese — ingresos, costo de producción (COGS), margen % global, producto más y menos rentable — para hoy, ayer, la semana o el mes. Usar ante "¿cómo está el margen?", "¿qué tan rentable estuvimos?", "¿cuánto costó lo que vendimos?", "producto más/menos rentable".
---

# Rentabilidad y márgenes (Da Vincheese)

Mismo patrón que los otros reportes de negocio: pedí el reporte al Ops
Bridge, nunca Postgres ni el API de Fudo directo.

## De dónde sale el costo (y por qué no siempre está completo)

El costo de cada producto vendido se resuelve en este orden:
1. Su propia receta (ingrediente × gramaje real, scrapeado de Fudo).
2. Si es una variante "delivery" (nombre termina en " D") sin receta propia,
   la receta del plato base -- es la misma preparación.
3. El costo que trae el catálogo de Fudo directamente (típico en bebidas de
   reventa simple, sin receta).
4. Si nada de eso existe, ese producto queda **sin costo conocido** — no se
   inventa un número.

Por eso el reporte siempre trae `coberturaCostoPct`: qué % de los ingresos
del período corresponde a productos con costo conocido. **Si ese número es
bajo (por debajo de ~70%), decilo explícitamente al reportar el margen** — un
margen calculado sobre poca cobertura no es representativo del negocio
completo, es una muestra parcial.

## Cómo pedirlo

| El usuario pregunta por... | Comando |
|---|---|
| hoy | `reports_rentabilidad_hoy` |
| ayer | `reports_rentabilidad_ayer` |
| esta semana | `reports_rentabilidad_semana` (últimos 7 días rodantes) |
| este mes | `reports_rentabilidad_mes` (últimos 30 días rodantes) |

1. Generá un id único.
2. Escribí `/workspace/project/ops/requests/<id>.json` con `{"cmd": "<comando>"}`.
3. Esperá hasta ~5s a que aparezca `/workspace/project/ops/results/<id>.json`.
4. El campo `stdout` trae:

```json
{
  "periodo": "semana",
  "ingresoTotal": { "valor": 14538470, "valorFmt": "$14.538.470" },
  "coberturaCostoPct": "81.4",
  "margenGlobal": { "costoTotal": 4830000, "costoTotalFmt": "$4.830.000", "margenPct": "59.2", "nota": "..." },
  "productoMasRentable": { "nombre": "Salsa de la casa extra", "margenPct": "92.1" },
  "productoMenosRentable": { "nombre": "La Última Cena", "margenPct": "31.2" },
  "productosSinCosto": 12
}
```

`margenGlobal` puede venir `null` si no hubo ningún producto con costo
conocido en el período — decilo así, no muestres un margen de 0%.
`productoMasRentable`/`productoMenosRentable` solo consideran productos con
costo conocido (nunca un producto de `productosSinCosto`).

## Formato de respuesta

```
💰 *RENTABILIDAD — Semana*

Ingresos: $14.538.470
Costo estimado: $4.830.000
Margen: 59.2%
(cobertura de costo: 81.4% de las ventas — el resto no tiene receta ni costo cargado en Fudo)

📈 Más rentable: Salsa de la casa extra (92.1%)
📉 Menos rentable: La Última Cena (31.2%)

12 productos vendidos sin costo conocido — no entraron en este cálculo.
```

- Si `coberturaCostoPct` es menor a 70, agregá una aclaración explícita de
  que el margen es una estimación parcial, no cierres el reporte como si
  fuera un número definitivo.
- No redondees `margenPct` a un número entero si el usuario pidió precisión
  (ej. para comparar dos períodos) — usá el decimal tal cual viene.
- Esto es costo de producción (comida/insumos) únicamente — no incluye mano
  de obra, empaque, comisiones ni publicidad. Si el usuario pregunta por
  esos, aclará que este reporte no los cubre todavía.

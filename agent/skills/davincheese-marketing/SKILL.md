---
name: davincheese-marketing
description: Reporta gasto e impacto de las campañas de Meta Ads (Facebook/Instagram) de Da Vincheese — gasto, compras atribuidas, ROAS reportado por Meta, top campañas, y la correlación entre gasto en pauta y ventas reales de Fudo — para hoy, ayer, la semana o el mes. Usar ante "¿cómo van las pautas/campañas?", "¿cuánto gastamos en publicidad?", "ROAS de Meta", "¿qué campaña anda mejor?", "¿la pauta realmente está generando ventas?".
---

# Marketing / Meta Ads (Da Vincheese)

Mismo patrón que los otros reportes de negocio: pedí el reporte al Ops
Bridge, nunca la Marketing API de Meta ni Postgres directo desde acá.

**Si la pregunta es una auditoría a fondo de campañas** ("¿por qué bajó el
ROAS?", "¿qué deberíamos hacer con esta campaña?", diagnóstico completo) —
**no uses este skill**, usá `ads-optimizer` (ya existe en este proyecto,
estructura la respuesta en las 3 Q's con la metodología completa). Este
skill es para el número rápido — gasto, compras, ROAS — no para diagnóstico
ni para decidir cambios de presupuesto.

## Lo más importante: qué NO es este número

`comprasAtribuidas`/`valorAtribuido`/`roas` son la **atribución propia de
Meta** — su ventana de atribución y su modelo, conocidos por sobre-atribuir
conversiones que en realidad no vinieron del anuncio. **No es un cruce
verificado contra pedidos reales de Fudo** — verificado 2026-08-12: Fudo no
tiene forma de identificar qué venta vino de un clic de Meta (`origin` del
cliente viene vacío en el 100% de una muestra de 2.500 clientes reales de
esta cuenta -- no es algo pendiente de construir, es un dato que
simplemente no existe ahí). `ventasRealesFudo` se entrega aparte, como
contexto del volumen total de ventas del período — no lo uses para
"calcular" un ROAS más preciso vos mismo, ni asumas que la diferencia entre
ambos números es atribuible a otra causa.

**Siempre que dés el ROAS, aclará que es el que reporta Meta, no un ROAS
verificado.** No lo presentes como un hecho confirmado.

## Cómo pedirlo

| El usuario pregunta por... | Comando |
|---|---|
| hoy | `reports_marketing_hoy` |
| ayer | `reports_marketing_ayer` |
| esta semana | `reports_marketing_semana` (últimos 7 días rodantes) |
| este mes | `reports_marketing_mes` (últimos 30 días rodantes) |

1. Generá un id único.
2. Escribí `/workspace/project/ops/requests/<id>.json` con `{"cmd": "<comando>"}`.
3. Esperá hasta ~5s a que aparezca `/workspace/project/ops/results/<id>.json`.
4. El campo `stdout` trae:

```json
{
  "periodo": "semana",
  "gasto": { "valor": 508167, "valorFmt": "$508.167" },
  "comprasAtribuidas": 12,
  "valorAtribuido": { "valor": 1250000, "valorFmt": "$1.250.000" },
  "roas": "2.46",
  "ventasRealesFudo": { "valor": 17961900, "valorFmt": "$17.961.900" },
  "porcentajeVentasAtribuidoAMeta": "7.0",
  "campañas": [
    { "nombre": "Ventas retargeting Da Vincheese...", "gasto": 285000, "gastoFmt": "$285.000", "compras": 8, "roas": "3.1" }
  ],
  "advertencia": "comprasAtribuidas/valorAtribuido/roas son la atribución propia de Meta..."
}
```

`roas` y el `roas` por campaña pueden venir `null` si no hubo gasto en el
período — decilo así, no muestres 0.00.

## Formato de respuesta

```
📣 *META ADS — Semana*

Gasto: $508.167
Compras atribuidas (Meta): 12 · $1.250.000
ROAS reportado por Meta: 2.46x
⚠️ Es la atribución propia de Meta, no un cruce verificado contra Fudo.

Contexto: las ventas totales reales de Fudo en el mismo período fueron
$17.961.900 — Meta atribuye ~7.0% de eso a sus campañas.

Top campaña por gasto: Ventas retargeting Da Vincheese... ($285.000, ROAS 3.1x)
```

- Mostrá 2-3 campañas top por gasto, no las 10 completas salvo que el
  usuario las pida.
- No conviertas `porcentajeVentasAtribuidoAMeta` en una conclusión sobre si
  la publicidad "vale la pena" o no — es un dato de contexto, la decisión de
  presupuesto es del usuario (y de `ads-optimizer` si pide ese análisis).

## Correlación gasto vs. ventas reales (`reports_marketing_correlacion`)

Usar cuando pregunten específicamente si la pauta "realmente está
generando ventas" o algo similar a un ROAS verificado — no es lo mismo que
el reporte de arriba. Comando: `reports_marketing_correlacion` (sin
período, usa todo el historial disponible).

```json
{
  "disponible": true,
  "fechaCorte": "2026-08-03T...",
  "comparacionAntesDepues": {
    "promedioVentasDiariasAntes": 2100000, "diasAntes": 84,
    "promedioVentasDiariasDespues": 2450000, "diasDespues": 9,
    "cambioPct": "16.7",
    "advertencia": "no aísla el efecto de la pauta de otros cambios..."
  },
  "correlacionGastoVentas": {
    "coeficiente": 0.34, "interpretacion": "débil",
    "diasConsiderados": 9,
    "advertencia": "muestra chica..."
  },
  "advertenciaGeneral": "Fudo no expone ninguna señal de qué venta vino de un clic de Meta..."
}
```

**Explicá siempre las dos advertencias en la respuesta, no solo los
números** — este reporte existe precisamente porque no se puede calcular
una atribución exacta, y presentarlo sin ese contexto sería peor que no
tener el dato. Si `disponible` es `false`, decilo así (todavía no hay
suficiente historia de Meta sincronizada).

Formato sugerido:

```
🔍 *META × FUDO — Correlación (no atribución exacta)*

Ventas promedio por día:
Antes de la pauta (84 días): $2.100.000
Desde que arrancó la pauta (9 días): $2.450.000
Diferencia: +16.7%
⚠️ No aísla otros cambios del mismo período (estacionalidad, menú, etc.)

Correlación gasto-ventas día a día: 0.34 (débil)
⚠️ Muestra chica (9 días) — señal preliminar, no concluyente.

Fudo no tiene forma de identificar qué venta vino de un clic de Meta
específico, así que esto es lo más cerca que se puede llegar de "¿la
pauta funciona?" con los datos disponibles hoy.
```

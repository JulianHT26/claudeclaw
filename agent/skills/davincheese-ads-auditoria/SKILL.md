---
name: davincheese-ads-auditoria
description: Auditoría completa de campañas de Meta Ads (Facebook/Instagram) de Da Vincheese, con la metodología de trafficking de Felipe Vergara (las 3 Q's -- qué pasó, por qué pasó, qué haremos) -- semáforo 🔴🟡🟢 por eslabón del embudo de ventas o de interacción/WhatsApp, diagnóstico de creativo (gancho, retención, frecuencia), y acción concreta de la matriz de decisión para cada hallazgo. Usar ante "auditoría de campañas", "por qué bajó el ROAS", "qué está pasando con la pauta", "análisis completo de anuncios", "diagnóstico de embudo", o cuando `davincheese-marketing` no alcanza porque el usuario pide el porqué y no solo el número.
---

# Auditoría de Ads — metodología Felipe Vergara / 3 Q's (Da Vincheese)

Mismo patrón que los demás reportes: pedí el reporte al **Ops Bridge**, nunca
Meta directo ni Postgres. Este comando ya viene con el diagnóstico armado
(semáforos, matriz de decisión) — tu trabajo es traducirlo a una respuesta
clara, no recalcular ni reinterpretar los números.

**Diferencia con `davincheese-marketing`**: ese skill da el número rápido
(gasto, ROAS, campañas top). Este da el análisis completo -- por qué está
así, y qué acción concreta corresponde. Si el usuario solo pregunta "¿cómo
van las pautas?", usá `davincheese-marketing`. Si pregunta "¿por qué?",
"auditoría", o pide diagnóstico/acción, usá este.

## Cómo pedirlo

| El usuario pregunta por... | Comando |
|---|---|
| hoy | `reports_marketing_auditoria_hoy` |
| ayer | `reports_marketing_auditoria_ayer` |
| esta semana | `reports_marketing_auditoria_semana` (últimos 7 días rodantes) |
| este mes | `reports_marketing_auditoria_mes` (últimos 30 días rodantes) |

1. Generá un id único.
2. Escribí `/workspace/project/ops/requests/<id>.json` con `{"cmd": "<comando>"}`.
3. Esperá a que aparezca `/workspace/project/ops/results/<id>.json` --
   normalmente ~5s, pero `_hoy` puede tardar hasta ~20s (dispara un sync en
   vivo contra Meta antes de responder, igual que `reports_marketing_hoy`).
4. El campo `stdout` trae un JSON con un array `campañas`, una entrada por
   campaña con gasto > 0 en el período, ordenadas por gasto:

```json
{
  "periodo": "ayer",
  "datoEnVivo": null,
  "campañas": [
    {
      "nombre": "Ventas retargeting Da Vincheese...",
      "objetivo": "ventas",
      "diasActiva": 7,
      "gasto": { "valorFmt": "$37.457" },
      "resultados": { "compras": 1, "valorFmt": "$30.900" },
      "costoPorCompra": "$37.457",
      "roas": 0.82,
      "roasObjetivo": 3.4,
      "queHicimos": {
        "quePaso": "Gastó $37.457, 1 compra(s) atribuidas por $30.900, ROAS 0.82x (objetivo 3.4x).",
        "porQue": {
          "embudo": {
            "ctrSalientePct": 0.2,
            "pctVisitasPorClics": 7.7,
            "pctCarritoPorVisitas": 0,
            "pctCheckoutPorCarrito": null,
            "pctCompraPorCheckout": null,
            "semaforo": { "ctrSaliente": "🔴", "visitasClics": "🔴", "carritoVisitas": null, "checkoutCarrito": null, "compraCheckout": null },
            "advertenciaEmbudo": "Sin evento ViewContent configurado..."
          },
          "creativo": {
            "pctVideo3s": 2.4, "videoTiempoPromedioSeg": 1, "frecuencia": 2.03,
            "semaforo": { "video3s": "🔴", "videoTiempo": "🔴", "frecuencia": "🟢", "calidad": null, "engagement": null, "conversion": null },
            "rankings": { "calidad": "sin dato", "engagement": "sin dato", "conversion": "sin dato" }
          }
        },
        "queHaremos": [
          { "hallazgo": "ROAS por debajo del 80% del objetivo", "accion": "Revisar margen/precio, pausar o reducir presupuesto -- auditar urgente el embudo", "puedeEjecutarseYa": true }
        ]
      },
      "anuncios": [
        {
          "nombre": "Hamburguesas 3 agosto 2026",
          "gasto": { "valorFmt": "$29.305" },
          "pctGastoDelConjunto": 88.7,
          "resultados": 7,
          "costoPorResultado": "$4.186",
          "diasActiva": 12,
          "situacion": "Alto gasto (>80% del conjunto) pero peor costo por resultado que el resto",
          "recomendacion": "⚠️ Efecto Desglose posible -- evaluar el conjunto completo antes de tocar el anuncio individual"
        }
      ]
    }
  ],
  "advertenciaGeneral": "..."
}
```

`anuncios` es el Efecto Desglose -- compara cada anuncio contra el **resto de
su propio conjunto**, no contra la campaña entera (un anuncio puede ser
"barato" en la campaña pero seguir siendo el peor de su conjunto). Cada
entrada trae `situacion` + `recomendacion` ya redactadas por la tabla de
decisión -- no reinterpretes ni inventes otra lectura de los números.
`recomendacion` empieza siempre con el emoji que indica qué tan accionable
es: ⏳ esperar, 🚫 no tocar, ✅ puede pausarse, ⚠️ investigar antes de actuar,
🔴 candidato real a pausar (revisando primero fase de aprendizaje).

`objetivo` puede ser `"ventas"` (embudo completo), `"interaccion"` (tabla de
WhatsApp -- ahí el campo relevante es `porQue.interaccion`, no
`porQue.embudo`) u `"otro"` (sin matriz definida, solo trae `gasto` y una
`advertencia` -- reportalo así, sin inventar semáforo).

## Cómo estructurar la respuesta -- las 3 Q's, siempre en este orden

Para cada campaña con gasto en el período (no agrupes todas juntas, una
sección por campaña):

**1) ¿Qué pasó?** -- usá `queHicimos.quePaso` tal cual, más `costoPorCompra`
o `costoPorConversacion`.

**2) ¿Por qué pasó?** -- recorré `porQue.embudo` (o `porQue.interaccion`) y
`porQue.creativo`, mostrando el semáforo de cada métrica que no sea `null`.
Un semáforo `null` significa "sin dato suficiente" -- omitilo, no lo
muestres como si fuera 🔴. Señalá cuál es el eslabón con el % más bajo (el
`hallazgo` de `queHaremos` ya te dice cuáles están en rojo/amarillo).

**3) ¿Qué haremos?** -- listá cada entrada de `queHaremos` como
"hallazgo → acción". Si `puedeEjecutarseYa` es `false`, aclará explícitamente
que la campaña tiene menos de 7 días activa (mostrá `diasActiva`) y que la
recomendación real es esperar, no ejecutar el cambio todavía -- no te saltes
esta aclaración.

**Nunca ofrezcas ejecutar un cambio de presupuesto/pausar/editar vos
mismo** -- esto es diagnóstico y sugerencia, toda acción real la aprueba el
usuario explícitamente, mismo criterio que el resto del proyecto.

**4) (si hay hallazgos accionables en `anuncios`)** -- mencioná solo los
anuncios con `recomendacion` distinta de "Sin acción sugerida por esta
tabla" (esa es la mayoría en cuentas con pocos días de datos -- no listes
todos los anuncios siempre, solo los que la tabla realmente marcó). Si
`situacion` es "Menos de 7 días activo", aclará que por eso no hay
recomendación de acción todavía, igual que en el punto 3.

## Qué NO hace este reporte (decilo si el usuario pregunta por eso)

- El Efecto Desglose (`anuncios[]`) usa el semáforo de ROAS/conversión ya
  calculado a nivel campaña como proxy de "el conjunto funciona bien en
  general" -- no reconstruye un embudo completo por conjunto de anuncios,
  solo por campaña.
- El paso "Ver contenido" del embudo no es medible (el pixel de esta cuenta
  no dispara ese evento) -- por eso `pctCarritoPorVisitas` es un ratio
  adaptado sin semáforo, no el paso oficial de la metodología.
- `comprasAtribuidas`/ROAS siguen siendo la atribución propia de Meta, no un
  cruce verificado contra Fudo -- mismo criterio que `davincheese-marketing`.

## Formato de respuesta sugerido

```
📣 *AUDITORÍA — Ventas retargeting Da Vincheese (ayer)*

**1) Qué pasó**
Gastó $37.457, 1 compra por $30.900 · ROAS 0.82x (objetivo 3.4x) · costo por compra $37.457

**2) Por qué**
🔴 CTR saliente: 0.2% (objetivo >2%)
🔴 Visitas de página / clics salientes: 7.7% (objetivo >70%)
🔴 Video: gancho no engancha (2.4% de reproducciones de 3s+)
🟢 Frecuencia: 2.03 (sana)

**3) Qué haremos**
⚠️ Campaña con 7 días activa — ya se puede actuar:
• ROAS bajo el 80% del objetivo → revisar margen/precio, auditar el embudo urgente
• Página lenta o mala UX → revisar velocidad de carga de la landing
• Creativo débil → testear nuevos ganchos

**4) Por anuncio**
⚠️ "Hamburguesas 3 agosto" se lleva el 88.7% del gasto del conjunto pero tiene peor costo por resultado que el resto — antes de tocarlo, revisar el conjunto completo (posible Efecto Desglose, no necesariamente el anuncio en sí).
```

- Si son varias campañas, priorizá la de mayor gasto primero.
- Si `advertenciaGeneral` u otras advertencias son relevantes al caso puntual
  (ej. el usuario pregunta por el embudo completo y falta ViewContent),
  mencionalas -- no las repitas siempre de memoria si no vienen al caso.

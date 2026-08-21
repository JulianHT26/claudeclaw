---
name: davincheese-impoconsumo
description: Calcula el Impuesto al Consumo (impoconsumo, 8%) de Da Vincheese para un rango de fechas -- normalmente quincenal (ej. "del 1 al 15 de agosto"). Reemplaza el proceso manual de descargar el Excel de Fudo, filtrar por método de pago Bancolombia y sumar la columna Consumo. Usar ante "impoconsumo", "impuesto al consumo", "cuánto le declaramos a la DIAN", "el consumo de la quincena", "cuánto facturamos por Bancolombia".
---

# Impoconsumo (Da Vincheese)

Igual que los demás reportes: pedí el número al **Ops Bridge**, nunca Postgres
ni la API de Fudo directo desde acá.

## Por qué Bancolombia = facturado

Fudo emite factura electrónica a la DIAN automáticamente en cuanto una venta
tiene un pago con el método **Bancolombia** -- por el total completo de la
venta, aunque el pago haya estado dividido con otro medio (confirmado con el
usuario 2026-08-18). Por eso el reporte no necesita un filtro aparte de
"facturado": basta con filtrar por método de pago Bancolombia, que es
exactamente lo mismo.

## Cómo pedirlo

El usuario casi siempre va a pedir un rango específico ("del 1 al 15",
"la quincena pasada", "del 16 al 31 de julio") -- no hay atajos de "quincena
actual", siempre desde/hasta explícitos.

1. Si el usuario dice algo relativo ("la quincena pasada", "este mes"), traducilo
   vos a fechas exactas antes de pedir el reporte -- no le pases texto libre al
   comando. Si no queda claro qué rango quiere, preguntá antes de asumir.
2. Generá un id único.
3. Escribí `/workspace/project/ops/requests/<id>.json` con
   `{"cmd": "reports_impoconsumo_<desde>_<hasta>"}`, ej.
   `{"cmd": "reports_impoconsumo_2026-08-01_2026-08-15"}` (ambas fechas
   YYYY-MM-DD, inclusive, sin espacios).
4. Esperá hasta ~5s a que aparezca `/workspace/project/ops/results/<id>.json`.
5. El campo `stdout` trae:

```json
{
  "rango": { "desde": "2026-08-01T05:00:00.000Z", "hasta": "2026-08-16T05:00:00.000Z" },
  "ventasBancolombia": { "cantidad": 135, "valor": 9752400, "valorFmt": "$9.752.400" },
  "baseGravable": { "valor": 9030004, "valorFmt": "$9.030.004" },
  "impoconsumo": { "valor": 722396, "valorFmt": "$722.396" },
  "formula": "consumo = total_venta × 8 ÷ 108, redondeado por venta -- 8% de impoconsumo ya incluido en el precio",
  "advertenciaGeneral": "..."
}
```

Si el `exit` no es 0 o el formato de fecha vino mal, decile al usuario que no
se pudo calcular -- no lo intentes reconstruir a mano ni le des un número
aproximado.

## Formato de respuesta

```
🧾 *IMPOCONSUMO — 1 al 15 de agosto*

Ventas facturadas (Bancolombia): 135 · $9.752.400
Base gravable: $9.030.004
Impoconsumo (8%): $722.396

⚠️ Cálculo replicado a partir de las ventas sincronizadas, no un valor emitido
por la DIAN -- confirmar contra el reporte fiscal de Fudo si hay cualquier duda
antes de declarar.
```

- Siempre incluí la advertencia final tal cual (o su idea central) -- es un
  cálculo replicado nuestro, no el documento oficial de Fudo/DIAN. No lo
  presentes como si fuera la fuente de verdad legal.
- Si `ventasBancolombia.cantidad` es 0, decilo así explícitamente ("no hubo
  ventas con Bancolombia en ese rango") en vez de mostrar $0 sin contexto --
  puede ser una señal de que el rango está mal o que de verdad no hubo.

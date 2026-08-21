---
name: davincheese-propinas
description: Calcula el total de propinas de Da Vincheese para un rango de fechas -- normalmente quincenal (ej. "del 1 al 15 de agosto", "del 16 al 31"). Usar ante "propinas", "cuánto fue de propinas", "propinas de la quincena". Todavía NO desglosa por mesero/persona (fase futura, pendiente de un archivo de turnos que el usuario va a compartir aparte) -- si piden ese desglose, aclarar que todavía no está construido, no inventarlo.
---

# Propinas (Da Vincheese)

Igual que los demás reportes: pedí el número al **Ops Bridge**, nunca
Postgres ni la API de Fudo directo desde acá.

## Cómo pedirlo

Siempre rango de fechas explícito, igual que impoconsumo -- no hay atajos de
"quincena actual". Si el usuario dice algo relativo ("la quincena pasada"),
traducilo vos a fechas exactas antes de pedir el reporte.

1. Generá un id único.
2. Escribí `/workspace/project/ops/requests/<id>.json` con
   `{"cmd": "reports_propinas_<desde>_<hasta>"}`, ej.
   `{"cmd": "reports_propinas_2026-08-01_2026-08-15"}` (YYYY-MM-DD, ambas
   fechas inclusive, sin espacios).
3. Esperá hasta ~5s a que aparezca `/workspace/project/ops/results/<id>.json`.
4. El campo `stdout` trae:

```json
{
  "rango": { "desde": "2026-08-01T05:00:00.000Z", "hasta": "2026-08-16T05:00:00.000Z" },
  "propinas": { "cantidad": 196, "valor": 1486960, "valorFmt": "$1.486.960" },
  "advertenciaGeneral": "Excluye propinas canceladas..."
}
```

Si el `exit` no es 0 o el formato de fecha vino mal, decile al usuario que no
se pudo calcular -- no inventes un número aproximado.

## Formato de respuesta

```
💰 *PROPINAS — 1 al 15 de agosto*

196 propinas registradas · Total: $1.486.960
```

- No hace falta repetir la advertencia técnica de "excluye canceladas" en
  cada respuesta -- es una aclaración interna del reporte, no algo que el
  usuario necesite ver siempre. Mencionala solo si preguntan por qué el
  número no coincide con algo que ellos calcularon aparte.
- Si `cantidad` es 0, decilo así explícitamente en vez de mostrar $0 sin
  contexto.

## Si piden desglose por mesero/persona

**Todavía no está construido.** El usuario va a compartir un archivo de
registro de turnos aparte para poder cruzar cada propina con quién trabajó
ese día -- hasta que eso exista, si preguntan "cuánto le tocó a cada uno",
respondé que por ahora solo se puede dar el total, y que el desglose por
persona es lo próximo que se va a agregar. No lo inventes ni lo estimes.

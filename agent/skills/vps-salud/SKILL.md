---
name: vps-salud
description: Diagnóstico y estado del VPS completo (contenedores Docker de TODOS los proyectos, disco, memoria, unidades systemd, logs, certificados). Usar cuando el usuario pregunta por el servidor/VPS en general, no por un proyecto puntual — "¿cómo está el VPS?", "estado del servidor", "mostrame los contenedores", "¿por qué está lento X?", "¿qué pasó con Y?", "reiniciá <contenedor>". Para el estado del proyecto Da Vincheese específicamente, usar `davincheese-status`.
---

# Diagnóstico del VPS

NO corras `docker`, `systemctl`, `ss`, `sudo` directamente — este contenedor no
tiene el socket de Docker ni sudo. Todo pasa por el **puente clops-bridge**: un
proceso separado en el host, cuenta de mínimo privilegio (`clops`), que ejecuta
solo `clops-diag` (whitelist fija) y devuelve el resultado por archivo.

El puente está montado en `/workspace/extra/vps-bridge`.

## Cómo pedir un dato

1. id único: `date +%s%N`
2. Escribí `/workspace/extra/vps-bridge/requests/<id>.json` con:
   `{"verb": "<verbo>", "args": [<arg1>, <arg2>]}`  (`args` opcional según el verbo)
3. Poll cada ~1s (hasta ~45s) a que aparezca
   `/workspace/extra/vps-bridge/results/<id>.json`
4. Leé `stdout`. `exit` != 0 = falló o el verbo fue rechazado.

## Verbos (son TODOS — no inventes otros)

**Lectura:** `ps` · `stats` · `images` · `volumes` · `networks` · `compose-ls`
· `logs` args `["<contenedor>","<n≤500>"]` · `inspect` args `["<contenedor>"]`
· `health` args `["<contenedor>"]` · `df` · `mem` · `uptime` · `top`
· `list-units` · `list-timers` · `systemctl-status` args `["<unidad>"]`
· `journal` args `["<unidad>","<n>"]`

**Acción (⚠️ SOLO si el usuario lo pide explícito en el mensaje):**
`restart-container` args `["<nombre>"]` — denylist: traefik, postgres, redis, ES,
socket_proxy · `restart-unit` args `["<unidad>"]` — denylist: ssh, docker,
systemd, bridge.

## "¿cómo está el VPS?"

Pedí en orden: `ps`, `df`, `mem`, `list-units`. De `ps` mirá:
`dvc_traefik`, `dvc_socket_proxy`, `dvc_api`, `dvc_admin`, `dvc_worker`,
`dvc_fudo_bot`, `dvc_postgres`, `dvc_redis`, `dvc_marketing` (+ sus
`dvc_marketing_*`), `dvc_uptime`, `dvc_dozzle` → `Up` vs
`Restarting`/`Exited`/`unhealthy`/ausente.

```
🟢 VPS — OPERATIVO

INGRESS (traefik)      🟢
APP DV (api/admin/worker) 🟢
FUDO BOT               🟢
DATOS (pg/redis)       🟢
MARKETING (postiz)     🟢
MONITOREO              🟢
DISCO                 🟢  20%
MEMORIA               🟢  38%

⚠️ Detectado:
<solo si hay algo — contenedor caído/unhealthy, disco > 80%, memoria alta,
unidad fallida, error reciente en un log. Si no hay nada, omití la sección.>

Acción recomendada:
<solo si aplica>
```

Si algo da 🔴/🟡, antes de sugerir acción mirá el log del contenedor
(`logs ["<nombre>","80"]`) o `journal` de la unidad → causa probable, no solo
el síntoma.

## `restart-*`

Ejecutan un cambio real. Solo si el usuario lo pide en el mensaje ("reiniciá el
worker", "sí, dale"). Nunca en un chequeo de rutina ni encadenado tras detectar
un problema — reportá y esperá instrucción. Traefik/Postgres/Redis/ES no se
reinician por acá; si hace falta, decíselo al usuario.

## Estilo

Español rioplatense, conciso. Dato concreto primero (número, contenedor, línea
de log). No repitas la pregunta. No inventes datos que no pediste.

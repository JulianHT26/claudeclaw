---
name: davincheese-status
description: Reporta el estado operativo de Da Vincheese OS (API, admin, worker, fudo-bot, Postgres, Redis, Docker, disco, memoria, certificados, backups, git, ClaudeClaw) cuando el usuario pregunta cómo está el servidor, el proyecto o alguno de sus servicios. Usar ante frases como "¿cómo está Da Vincheese?", "estado del servidor", "¿todo bien con el VPS?", "revisa la salud del sistema".
---

# Estado operativo de Da Vincheese OS

No corras `docker`, `systemctl`, `ss` ni nada equivalente directamente — este
contenedor no tiene el socket de Docker ni sudo. Todo pasa por el **Ops
Bridge**: un proceso separado, corriendo en el host con una cuenta de
servicio de mínimo privilegio (`dvc-ops`), que ejecuta solo comandos de una
whitelist fija y devuelve el resultado por archivo.

## Cómo pedir un chequeo

El proyecto está montado en `/workspace/project` (es `/opt/davincheese-os`
en el host). Por cada chequeo:

1. Generá un id único (ej. `date +%s%N`).
2. Escribí `/workspace/project/ops/requests/<id>.json` con `{"cmd": "<comando>"}`.
3. Esperá hasta ~5s a que aparezca `/workspace/project/ops/results/<id>.json`.
4. Leé el campo `stdout` del resultado.

Comandos disponibles (son TODOS los que existen — no inventes otros, si
pedís uno que no está en esta lista el bridge lo rechaza):

`docker_ps`, `docker_stats`, `docker_images`, `docker_volumes`, `docker_networks`,
`logs_api`, `logs_worker`, `logs_traefik`, `logs_postgres`, `logs_redis`, `logs_fudo_bot`, `logs_admin`, `logs_uptime`,
`inspect_api`, `inspect_worker`, `inspect_postgres`, `inspect_redis`,
`sys_disk`, `sys_mem`, `sys_cpu`, `sys_ports`, `sys_top`,
`svc_status`, `svc_list`, `svc_timers`, `fw_status`,
`health_api`, `health_admin`, `health_status`, `cert_check`,
`claudeclaw_status`, `git_davincheese`, `git_claudeclaw`, `backup_check`,
`restart_api`, `restart_worker`, `restart_fudo_bot`, `restart_uptime` (⚠️ ver más abajo — nunca uses estos sin autorización explícita del usuario en el mensaje).

## Para el reporte de estado general ("¿cómo está Da Vincheese?")

Pedí, en este orden: `docker_ps`, `sys_disk`, `sys_mem`, `cert_check`,
`backup_check`, `git_davincheese`, `git_claudeclaw`, `claudeclaw_status`.
De `docker_ps` extraé el estado de `dvc_api`, `dvc_admin`, `dvc_worker`,
`dvc_fudo_bot`, `dvc_postgres`, `dvc_redis`, `dvc_traefik` (busca `Up` vs
`Restarting`/`Exited`/ausente).

Formato de respuesta (usa 🟢/🟡/🔴 según corresponda, no siempre todo va a
estar en verde — no lo fuerces):

```
🟢 DA VINCHEESE OS — OPERATIVO

API              🟢
ADMIN            🟢
WORKER           🟢
FUDO BOT         🟢
POSTGRES         🟢
REDIS            🟢
DOCKER           🟢
DISCO            🟢  38%
MEMORIA          🟢  42%
CERTIFICADOS     🟢  vence en 86 días
BACKUP           🟢  hace 13h, íntegro
GIT              🟢  sin cambios pendientes
CLAUDECLAW       🟢  conectado a WhatsApp

⚠️ Detectado:
<solo si hay algo — errores recientes en logs, contenedor caído,
certificado por vencer, backup viejo/corrupto, git con cambios sin
commitear, etc. Si no hay nada, omití esta sección entera.>

Acción recomendada:
<solo si aplica>
```

Si algo da 🔴, antes de sugerir una acción correctiva mirá el log
correspondiente (`logs_api`, `logs_worker`, etc.) para dar una causa
probable, no solo el síntoma.

## Sobre las acciones de recuperación (`restart_*`)

Estos SÍ ejecutan un cambio real (reinician un contenedor). Están en la
whitelist porque son acciones concretas y ya evaluadas — pero solo las usás
si el usuario lo pide explícitamente en el mensaje ("reinicia el worker",
"sí, hacelo"). Nunca las dispares como parte de un chequeo de rutina ni las
encadenes automáticamente después de detectar un problema: reportá el
diagnóstico y esperá instrucción.

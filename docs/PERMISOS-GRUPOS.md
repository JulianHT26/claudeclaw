# Davincho — agente global con permisos por grupo

Una sola instancia de claudeclaw (usuario `dvcadmin`, `RUNTIME=container`).
Cada chat de WhatsApp = un `jid` registrado a un **grupo**. El grupo define el
sobre de permisos de quien escribe. **Un número NO registrado no recibe
respuesta** (message-loop.js: `if (!group) return`).

## Cómo se hace cumplir cada límite

| Palanca | Controla | Dónde |
|---|---|---|
| Registro del `jid` | Si responde o no | `registered_groups` (no registrado = ignorado) |
| `container_config.additionalMounts` | Qué carpetas del host ve el agente (rw/ro) | por grupo |
| `agent_config.allowedTools` | Qué herramientas Claude Code puede usar | por grupo |
| `agent_config.maxTurns` / `effort` / `model` | Cuánto trabaja por mensaje | por grupo |
| `agent_config.allowedDomains` | Salida de red | por grupo |
| `mount-allowlist.json` (`~/.config/claudeclaw/`) | Qué roots del host se PUEDEN montar | global |
| Bridges (Ops Bridge, clops-bridge) | TODO lo privilegiado (docker, sudo, DB, secretos) | el agente escribe un pedido; un demonio de bajo privilegio lo ejecuta |

**Regla de oro:** el agente nunca corre `sudo`, nunca toca el socket de Docker,
nunca lee un `.env`. Lo privilegiado se pide a un bridge.

## Grupos actuales

| Grupo (`folder`) | Quién | Mounts | Tools | Límites | Puede |
|---|---|---|---|---|---|
| `whatsapp_main` | **Operador** (Julian DM), `is_main` | `/opt/davincheese-os` rw · `/srv/_ops/bridge` rw | todas | sin límite | Todo: skills de davincheese (ventas, inventario, rentabilidad, marketing, propinas, impoconsumo, ads), diagnóstico del VPS (`vps-salud` → clops-bridge), leer/editar el repo davincheese-os |
| `davincheese-ia` | **Clientes** (bot de pedidos) | ninguno | **solo `Read`** | `maxTurns: 4`, `effort: low`, `runtime: container` | Solo el flujo de pedidos. Sin archivos, sin bridges, sin diagnóstico, sin secretos. No puede escribir → físicamente no puede usar ningún bridge. |
| `swe-agent` | Interno (tareas de código) | (hereda) | Bash/Read/Write/Edit/Glob/Grep | `maxTurns: 60` | Tareas de desarrollo sobre el repo |

## Tiers de referencia (para grupos nuevos, ej. mentrades)

- **operador-total**: `is_main` o mounts del proyecto + su bridge, todas las tools, sin límite.
- **operador-scoped**: mount solo de `/srv/<proyecto>` + el bridge de ese proyecto. Sin acceso a otros proyectos.
- **cliente / público**: `allowedTools: ["Read"]`, `maxTurns: 3-4`, `container_config: null`. Sin mounts, sin bridges.
- **desconocido**: no se registra → sin respuesta.

## Alta de mentrades (futuro)

1. `registered_groups`: `mentrades-operador` (mount `/srv/mentrades` + `/srv/mentrades/bridge`), `mentrades-clientes` (locked).
2. Un `mnt-bridge` (patrón clops-bridge) como usuario `mnt`, whitelist propia.
3. Skill `mentrades-*` que escribe a `/workspace/extra/mnt-bridge/`.
4. mount-allowlist: agregar `/srv/mentrades`.

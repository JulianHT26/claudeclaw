/**
 * Puente para el reporte semanal de proveedores pendientes de pago y su
 * ejecución por reacción -- ver decisions/2026-09-09-cron-pago-proveedores.md
 * (en el repo de davincheese-os) para el diseño completo.
 *
 * davincheese-os calcula la deuda real semanal (apps/worker/src/proveedores-pendientes.ts,
 * corre solo, nunca escribe nada en Fudo) y publica UN mensaje de WhatsApp
 * por proveedor acá (POST /proveedor-pendiente), listando los 3 medios de
 * pago reales con un emoji distinto cada uno. El usuario reacciona con el
 * emoji del medio que usó, directo sobre ese único mensaje -- este puente
 * ejecuta scripts/fudo-web/pagar_proveedor.py directo con ese medio.
 *
 * Corrección 2026-09-09 (probado en vivo por el usuario): la primera
 * versión mandaba 3 mensajes idénticos por proveedor (uno por medio de
 * pago, todos reaccionables con ✅) -- confuso, se veía como el mismo gasto
 * pegado 3 veces. Ahora es un solo mensaje/tracking por proveedor; el
 * medio de pago se resuelve por CUÁL de los 3 emoji se usó, no por A CUÁL
 * de 3 mensajes se reaccionó.
 *
 * Distinto de comprobantes-bridge (que solo avisa de vuelta a davincheese-os
 * y deja que ESE lado actúe): acá la ejecución del pago vive en este mismo
 * puente porque necesita Playwright con navegador instalado, que ni
 * dvc_api ni dvc_worker tienen -- este proceso (ClaudeClaw, usuario `dv`)
 * corre en el mismo host y ya tiene el venv + Chromium verificados
 * (ver esa misma decisión para el detalle de cómo se armó el acceso mínimo).
 */
import { createServer, IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { logger } from '../orchestrator/logger.js';
import { trackProveedorPendienteMessage, resolveProveedorPendiente } from '../orchestrator/db.js';
import type { Channel, ReactionEvent } from '../orchestrator/types.js';
import {
  PROVEEDORES_CHAT_JID,
  FUDO_WEB_ENV_FILE,
  PAGAR_PROVEEDOR_SCRIPT,
  PAGAR_PROVEEDOR_PYTHON,
} from '../orchestrator/config.js';

const execFileAsync = promisify(execFile);

const PAGO_SCRIPT_TIMEOUT_MS = 90_000;

function verifySignature(secret: string, payload: string, signature: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: string) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function formatearCop(valor: number): string {
  return `$${new Intl.NumberFormat('es-CO').format(valor)}`;
}

interface Gasto {
  fudoId: string;
  fechaDdMmAaaa: string;
  amount: number;
}

/**
 * Corre pagar_proveedor.py una vez para UN gasto puntual (dry-run o
 * confirmar según `confirmar`) -- nunca selección múltiple, mismo motivo
 * que el SOP: un multiselect de más de un gasto es la causa mecánica exacta
 * del sobrepago de agosto. `ok=false` cuando el proceso sale con código
 * distinto de 0 (el script mismo aborta si el monto no coincide o la
 * selección no dio exactamente 1 -- ver ese archivo).
 */
async function correrPagoScript(
  proveedor: string,
  gasto: Gasto,
  medioPago: string,
  sinArqueo: boolean,
  confirmar: boolean,
): Promise<{ ok: boolean; output: string }> {
  if (!PAGAR_PROVEEDOR_PYTHON || !PAGAR_PROVEEDOR_SCRIPT || !FUDO_WEB_ENV_FILE) {
    return { ok: false, output: 'PAGAR_PROVEEDOR_PYTHON/SCRIPT/FUDO_WEB_ENV_FILE sin configurar en .env' };
  }

  const args = [
    PAGAR_PROVEEDOR_SCRIPT,
    '--proveedor',
    proveedor,
    '--fecha-gasto',
    gasto.fechaDdMmAaaa,
    '--monto',
    String(gasto.amount),
    '--medio-pago',
    medioPago,
  ];
  if (sinArqueo) args.push('--sin-arqueo');
  if (confirmar) args.push('--confirmar');

  try {
    const { stdout } = await execFileAsync(PAGAR_PROVEEDOR_PYTHON, args, {
      env: { ...process.env, FUDO_WEB_ENV_FILE },
      timeout: PAGO_SCRIPT_TIMEOUT_MS,
    });
    return { ok: true, output: stdout };
  } catch (err) {
    const e = err as { stdout?: string; message?: string };
    const salida = `${e.stdout ?? ''}\n${e.message ?? String(err)}`.trim();
    return { ok: false, output: salida };
  }
}

/**
 * Ejecuta el pago completo del proveedor con el medio elegido: dry-run +
 * confirmar por CADA gasto, secuencial (un solo Chromium a la vez -- nunca
 * en paralelo). Si cualquier gasto falla en el dry-run o el guardado,
 * aborta ahí mismo (no sigue con los gastos restantes) -- mejor un pago
 * parcial reportado con claridad que seguir adivinando sobre un estado
 * inesperado.
 */
async function ejecutarPagoCompleto(
  providerName: string,
  medioPago: string,
  sinArqueo: boolean,
  gastos: Gasto[],
): Promise<{ okTodos: boolean; resumen: string }> {
  const lineas: string[] = [];
  for (const gasto of gastos) {
    const dry = await correrPagoScript(providerName, gasto, medioPago, sinArqueo, false);
    if (!dry.ok) {
      lineas.push(`❌ Gasto ${gasto.fechaDdMmAaaa} (${formatearCop(gasto.amount)}): falló la verificación, no se guardó nada.\n${dry.output.slice(-600)}`);
      return { okTodos: false, resumen: lineas.join('\n\n') };
    }

    const real = await correrPagoScript(providerName, gasto, medioPago, sinArqueo, true);
    if (!real.ok) {
      lineas.push(
        `⚠️ Gasto ${gasto.fechaDdMmAaaa} (${formatearCop(gasto.amount)}): la verificación pasó pero el guardado falló -- revisar a mano en Fudo antes de reintentar.\n${real.output.slice(-600)}`,
      );
      return { okTodos: false, resumen: lineas.join('\n\n') };
    }

    lineas.push(`✅ Gasto ${gasto.fechaDdMmAaaa} (${formatearCop(gasto.amount)}) pagado.`);
  }
  return { okTodos: true, resumen: lineas.join('\n') };
}

function wireReactionListener(whatsapp: Channel): void {
  if (!whatsapp.onReaction) {
    logger.error('El canal de WhatsApp no soporta onReaction -- proveedores-bridge no puede detectar reacciones');
    return;
  }
  whatsapp.onReaction((evt: ReactionEvent) => {
    if (evt.chatJid !== PROVEEDORES_CHAT_JID) return; // no es el chat de proveedores, se ignora

    // resolveProveedorPendiente ya filtra por si el emoji es uno de los
    // medios de pago válidos de ESTE mensaje -- cualquier otro emoji (✅,
    // ❌, lo que sea) devuelve null acá sin tocar nada, queda pendiente.
    const resuelto = resolveProveedorPendiente(evt.targetMessageId, evt.emoji);
    if (!resuelto) return;

    (async () => {
      await whatsapp.sendMessage(evt.chatJid, `⏳ Pagando *${resuelto.providerName}* con *${resuelto.medioPago}*...`);
      const { okTodos, resumen } = await ejecutarPagoCompleto(resuelto.providerName, resuelto.medioPago, resuelto.sinArqueo, resuelto.gastos);
      const cabecera = okTodos
        ? `✅ *${resuelto.providerName}* pagado con *${resuelto.medioPago}* (${formatearCop(resuelto.montoTotal)})`
        : `❌ No se pudo completar el pago a *${resuelto.providerName}* -- revisar antes de reintentar (no se toca de nuevo automáticamente).`;
      await whatsapp.sendMessage(evt.chatJid, `${cabecera}\n\n${resumen}`);
    })().catch((err) => {
      logger.error({ err, providerId: resuelto.providerId }, 'proveedores-bridge: fallo inesperado ejecutando el pago');
      whatsapp
        .sendMessage(evt.chatJid, `❌ Fallo inesperado pagando *${resuelto.providerName}* -- revisar logs.`)
        .catch(() => {});
    });
  });
}

export function startProveedoresBridgeServer(
  port: number,
  secret: string,
  whatsapp: Channel,
): ReturnType<typeof createServer> {
  wireReactionListener(whatsapp);

  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }
    if (req.method !== 'POST' || req.url !== '/proveedor-pendiente') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const body = await readBody(req);
    const signature = req.headers['x-signature'] as string | undefined;
    if (!signature || !verifySignature(secret, body, signature)) {
      sendJson(res, 401, { error: 'Invalid signature' });
      return;
    }

    let payload: {
      providerId?: string;
      providerName?: string;
      medios?: Record<string, string>;
      montoTotal?: number;
      gastos?: Gasto[];
      sinArqueo?: boolean;
      mensaje?: string;
    };
    try {
      payload = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: 'JSON inválido' });
      return;
    }
    if (
      !payload.providerId ||
      !payload.providerName ||
      !payload.medios ||
      Object.keys(payload.medios).length === 0 ||
      typeof payload.montoTotal !== 'number' ||
      !Array.isArray(payload.gastos) ||
      payload.gastos.length === 0 ||
      typeof payload.sinArqueo !== 'boolean' ||
      !payload.mensaje
    ) {
      sendJson(res, 400, { error: 'Faltan campos requeridos' });
      return;
    }
    if (!PROVEEDORES_CHAT_JID) {
      sendJson(res, 503, { error: 'PROVEEDORES_CHAT_JID sin configurar' });
      return;
    }
    if (!whatsapp.sendMessageForTracking) {
      sendJson(res, 503, { error: 'El canal de WhatsApp no soporta sendMessageForTracking' });
      return;
    }

    try {
      const messageId = await whatsapp.sendMessageForTracking(PROVEEDORES_CHAT_JID, payload.mensaje);
      if (!messageId) {
        sendJson(res, 502, { error: 'No se pudo enviar el mensaje' });
        return;
      }
      trackProveedorPendienteMessage({
        whatsappMessageId: messageId,
        providerId: payload.providerId,
        providerName: payload.providerName,
        medios: payload.medios,
        montoTotal: payload.montoTotal,
        gastos: payload.gastos,
        sinArqueo: payload.sinArqueo,
      });
      logger.info({ providerId: payload.providerId, medios: Object.values(payload.medios), messageId }, 'Proveedor pendiente publicado');
      sendJson(res, 200, { ok: true });
    } catch (err) {
      logger.error({ err }, 'proveedores-bridge: fallo inesperado');
      sendJson(res, 500, { error: 'fallo interno' });
    }
  });

  server.listen(port, () => {
    logger.info({ port }, 'Proveedores bridge server listening');
  });

  return server;
}

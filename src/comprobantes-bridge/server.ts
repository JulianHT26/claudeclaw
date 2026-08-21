/**
 * Puente para validar comprobantes de pago por reacción en un grupo real de
 * WhatsApp ("Comprobantes Da Vincheese") -- ver plan 2026-08-21. davincheese-os
 * publica la foto del comprobante acá (POST /comprobante); el equipo reacciona
 * con ✅/❌ desde el grupo real; este servidor detecta la reacción y le avisa
 * de vuelta a davincheese-os (POST firmado a DAVINCHEESE_COMPROBANTE_WEBHOOK_URL)
 * quién aprobó/rechazó qué pedido.
 *
 * Distinto de ia-bridge/server.ts (síncrono, respuesta en el mismo request) y
 * de webhook/server.ts (dispara un turno de agente): acá no hay agente
 * involucrado, es solo enviar una imagen y escuchar reacciones -- por eso
 * llama directo a los métodos del canal de WhatsApp en vez de pasar por
 * ingestion/router. Mismo estilo de servidor HTTP crudo (sin
 * Express/Fastify) y firma HMAC-SHA256 vía header x-signature que el resto
 * de los puentes de este repo.
 */
import { createServer, IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';

import { logger } from '../orchestrator/logger.js';
import { trackComprobanteMessage, resolveComprobanteTracking } from '../orchestrator/db.js';
import type { Channel, ReactionEvent } from '../orchestrator/types.js';
import {
  COMPROBANTES_GRUPO_JID,
  DAVINCHEESE_COMPROBANTE_WEBHOOK_URL,
  DAVINCHEESE_COMPROBANTE_WEBHOOK_SECRET,
} from '../orchestrator/config.js';

const EMOJIS_APRUEBA = new Set(['✅', '✔️', '☑️']);
const EMOJIS_RECHAZA = new Set(['❌', '✖️', '🚫']);

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

/** Avisa a davincheese-os quién resolvió el pedido -- reintenta una vez, y si
 * sigue fallando solo lo loguea: el timeout propio de davincheese-os
 * (revisarComprobantesSinRespuestaDelGrupo) es el respaldo real, esto es
 * best-effort para no dejar al pedido esperando de más cuando el aviso sí
 * llega a la primera. */
async function avisarADavincheese(orderId: string, aprobado: boolean, reactedBy: string): Promise<void> {
  if (!DAVINCHEESE_COMPROBANTE_WEBHOOK_URL || !DAVINCHEESE_COMPROBANTE_WEBHOOK_SECRET) {
    logger.error('DAVINCHEESE_COMPROBANTE_WEBHOOK_URL/SECRET sin configurar: no se pudo avisar');
    return;
  }
  const body = JSON.stringify({ orderId, aprobado, reactedBy });
  const firma = crypto.createHmac('sha256', DAVINCHEESE_COMPROBANTE_WEBHOOK_SECRET).update(body).digest('hex');

  for (let intento = 1; intento <= 2; intento++) {
    try {
      const res = await fetch(DAVINCHEESE_COMPROBANTE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': firma },
        body,
      });
      if (res.ok) {
        logger.info({ orderId, aprobado, intento }, 'Aviso a davincheese-os entregado');
        return;
      }
      logger.warn({ orderId, status: res.status, intento }, 'davincheese-os respondió con error al aviso');
    } catch (err) {
      logger.warn({ orderId, err, intento }, 'Fallo avisando a davincheese-os');
    }
    if (intento === 1) await new Promise((r) => setTimeout(r, 2000));
  }
  logger.error(
    { orderId, aprobado },
    'No se pudo avisar a davincheese-os tras reintentar -- queda pendiente del timeout propio de davincheese-os',
  );
}

/** Se engancha una sola vez al canal de WhatsApp para escuchar reacciones. */
function wireReactionListener(whatsapp: Channel): void {
  if (!whatsapp.onReaction) {
    logger.error('El canal de WhatsApp no soporta onReaction -- comprobantes-bridge no puede detectar reacciones');
    return;
  }
  whatsapp.onReaction((evt: ReactionEvent) => {
    if (evt.chatJid !== COMPROBANTES_GRUPO_JID) return; // no es el grupo de comprobantes, se ignora

    const aprobado = EMOJIS_APRUEBA.has(evt.emoji);
    const rechazado = EMOJIS_RECHAZA.has(evt.emoji);
    if (!aprobado && !rechazado) return; // emoji no relevante (👍, 😂, etc.)

    const orderId = resolveComprobanteTracking(evt.targetMessageId);
    if (!orderId) return; // no trackeado acá, o ya lo resolvió otra reacción primero

    const textoConfirmacion = aprobado
      ? `✅ Pedido confirmado por *${evt.reactorName}*`
      : `❌ Pedido rechazado por *${evt.reactorName}*`;
    whatsapp.sendMessage(evt.chatJid, textoConfirmacion).catch((err) => {
      logger.warn({ err }, 'No se pudo confirmar en el grupo, pero el pedido sí se resolvió');
    });

    avisarADavincheese(orderId, aprobado, evt.reactorName).catch((err) => {
      logger.error({ err, orderId }, 'Fallo inesperado avisando a davincheese-os');
    });
  });
}

export function startComprobantesBridgeServer(
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
    if (req.method !== 'POST' || req.url !== '/comprobante') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const body = await readBody(req);
    const signature = req.headers['x-signature'] as string | undefined;
    if (!signature || !verifySignature(secret, body, signature)) {
      sendJson(res, 401, { error: 'Invalid signature' });
      return;
    }

    let payload: { orderId?: string; imageBase64?: string; caption?: string };
    try {
      payload = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: 'JSON inválido' });
      return;
    }
    if (!payload.orderId || !payload.imageBase64 || !payload.caption) {
      sendJson(res, 400, { error: 'Faltan orderId/imageBase64/caption' });
      return;
    }
    if (!COMPROBANTES_GRUPO_JID) {
      sendJson(res, 503, { error: 'COMPROBANTES_GRUPO_JID sin configurar' });
      return;
    }
    if (!whatsapp.sendImage) {
      sendJson(res, 503, { error: 'El canal de WhatsApp no soporta envío de imágenes' });
      return;
    }

    try {
      const buffer = Buffer.from(payload.imageBase64, 'base64');
      const messageId = await whatsapp.sendImage(COMPROBANTES_GRUPO_JID, buffer, payload.caption);
      if (!messageId) {
        sendJson(res, 502, { error: 'No se pudo enviar la imagen al grupo' });
        return;
      }
      trackComprobanteMessage(messageId, payload.orderId);
      logger.info({ orderId: payload.orderId, messageId }, 'Comprobante publicado en el grupo');
      sendJson(res, 200, { ok: true });
    } catch (err) {
      logger.error({ err }, 'comprobantes-bridge: fallo inesperado');
      sendJson(res, 500, { error: 'fallo interno' });
    }
  });

  server.listen(port, () => {
    logger.info({ port }, 'Comprobantes bridge server listening');
  });

  return server;
}

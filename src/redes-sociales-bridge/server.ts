/**
 * Puente para avisar por WhatsApp cuando una integración de redes sociales
 * del motor propio de davincheese-os (Instagram/Facebook) queda con
 * `necesitaReconexion=true` -- ver
 * decisions/2026-09-11-motor-propio-redes-sociales.md en davincheese-os
 * (Fase 4). Meta no ofrece refresh real para los tokens de larga duración
 * que usa ese motor; cuando uno se revoca/expira, antes esto fallaba en
 * silencio hasta que alguien notaba el error en el panel -- este puente
 * cierra ese hueco.
 *
 * Mucho más simple que comprobantes-bridge/server.ts (que sí es su gemelo
 * más cercano en estilo): acá no hay reacción que escuchar ni aviso de
 * vuelta a davincheese-os, es un mensaje informativo de una sola vía. Mismo
 * estilo de servidor HTTP crudo (sin Express/Fastify) y firma HMAC-SHA256
 * vía header x-signature que el resto de los puentes de este repo.
 */
import { createServer, IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';

import { logger } from '../orchestrator/logger.js';
import type { Channel } from '../orchestrator/types.js';
import { REDES_SOCIALES_ALERTAS_JID } from '../orchestrator/config.js';

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

export function startRedesSocialesBridgeServer(
  port: number,
  secret: string,
  whatsapp: Channel,
): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }
    if (req.method !== 'POST' || req.url !== '/redes-sociales-reconectar') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const body = await readBody(req);
    const signature = req.headers['x-signature'] as string | undefined;
    if (!signature || !verifySignature(secret, body, signature)) {
      sendJson(res, 401, { error: 'Invalid signature' });
      return;
    }

    let payload: { plataforma?: string; nombreCuenta?: string; motivo?: string };
    try {
      payload = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: 'JSON inválido' });
      return;
    }
    if (!payload.plataforma || !payload.nombreCuenta) {
      sendJson(res, 400, { error: 'Faltan plataforma/nombreCuenta' });
      return;
    }
    if (!REDES_SOCIALES_ALERTAS_JID) {
      sendJson(res, 503, { error: 'REDES_SOCIALES_ALERTAS_JID sin configurar' });
      return;
    }

    const texto = [
      `⚠️ *${payload.plataforma}* (${payload.nombreCuenta}) necesita reconexión.`,
      'Meta revocó o venció el token -- las publicaciones programadas de esta cuenta van a fallar hasta que se reconecte a mano desde el panel de Redes Sociales.',
      payload.motivo ? `Detalle: ${payload.motivo}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await whatsapp.sendMessage(REDES_SOCIALES_ALERTAS_JID, texto);
      logger.info({ plataforma: payload.plataforma, nombreCuenta: payload.nombreCuenta }, 'Aviso de reconexión enviado');
      sendJson(res, 200, { ok: true });
    } catch (err) {
      logger.error({ err }, 'redes-sociales-bridge: fallo inesperado enviando el aviso');
      sendJson(res, 500, { error: 'fallo interno' });
    }
  });

  server.listen(port, () => {
    logger.info({ port }, 'Redes sociales bridge server listening');
  });

  return server;
}

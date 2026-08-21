/**
 * Puente síncrono para que davincheese-os (el bot de pedidos de WhatsApp de
 * Da Vincheese) pueda pedirle una respuesta a un agente de Claude sin pagar
 * la API de Anthropic por token -- corre bajo la suscripción de Claude Code
 * que el usuario ya paga (CLAUDE_CODE_OAUTH_TOKEN), nunca ANTHROPIC_API_KEY
 * (decisión explícita del usuario 2026-08-08/2026-08-19: prohibido pagar por
 * esa API para el chatbot).
 *
 * Distinto de ../webhook/server.ts: ese es fire-and-forget y enruta la
 * respuesta por el canal de WhatsApp de ClaudeClaw. Acá se necesita la
 * respuesta de vuelta en el mismo HTTP request, porque quien pregunta
 * (davincheese-os) es quien le reenvía la respuesta al cliente real por SU
 * PROPIO número de WhatsApp -- ClaudeClaw nunca le habla al cliente directo.
 */
import { createServer, IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { ChildProcess } from 'child_process';

import { logger } from '../orchestrator/logger.js';
import { runSandboxAgent } from '../runtimes/sandbox-runner.js';
import { runContainerAgent, type ContainerOutput } from '../runtimes/container-runner.js';
import { getRegisteredGroup, setRegisteredGroup } from '../orchestrator/db.js';
import { resolveGroupIpcPath } from '../orchestrator/group-folder.js';
import type { RegisteredGroup } from '../orchestrator/types.js';

const GRUPO_FOLDER = 'davincheese-ia';
const GRUPO_JID = 'davincheese-ia';
/** Tope de espera por el agente -- el caller (davincheese-os) tiene que poder
 * caer al humano si esto no contesta a tiempo, no dejar al cliente esperando
 * indefinidamente. */
const TIMEOUT_MS = 25_000;
/** Mismo criterio que swe-agent.ts: dar un margen antes de mandar la señal
 * de cierre, para no cortar de golpe una llamada MCP en curso. */
const CLOSE_DELAY_MS = 5_000;

function ensureGrupo(): RegisteredGroup {
  const existente = getRegisteredGroup(GRUPO_JID);
  if (existente) return existente;
  const grupo: RegisteredGroup = {
    name: 'Da Vincheese IA (bot de pedidos)',
    folder: GRUPO_FOLDER,
    trigger: '',
    added_at: new Date().toISOString(),
    isMain: false,
    requiresTrigger: false,
    // Sandbox hubiera sido ideal por el arranque casi instantáneo, pero
    // falla en este VPS (`bwrap: loopback: Failed RTM_NEWADDR: Operation
    // not permitted`, restricción de namespaces de red a nivel de host,
    // confirmado 2026-08-19 -- no es algo arreglable desde el código de
    // ClaudeClaw). container/Docker es más lento en frío pero es el runtime
    // ya probado y confiable en el resto de esta instancia.
    runtime: 'container',
    agentConfig: {
      // Solo texto entra / texto sale, no necesita tocar archivos ni Bash --
      // 'Read' es el único tool inofensivo que igual nunca va a usar (un
      // array vacío cae al default completo, ver agent/runner/src/index.ts).
      allowedTools: ['Read'],
      maxTurns: 4,
      effort: 'low',
    },
  };
  setRegisteredGroup(GRUPO_JID, grupo);
  logger.info({ folder: GRUPO_FOLDER }, 'Registrado grupo davincheese-ia');
  return grupo;
}

function closeAgente(): void {
  try {
    const inputDir = path.join(resolveGroupIpcPath(GRUPO_FOLDER), 'input');
    fs.mkdirSync(inputDir, { recursive: true });
    fs.writeFileSync(path.join(inputDir, '_close'), '');
  } catch (err) {
    logger.warn({ err }, 'davincheese-ia: no se pudo escribir la señal de cierre');
  }
}

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

/** Sin structured outputs acá (eso era una feature del SDK de Anthropic que
 * ya no usamos) -- se le pide al prompt que devuelva SOLO un JSON crudo, y
 * se extrae con una regex tolerante por si el modelo agrega texto alrededor.
 * Genérico a propósito (no valida una forma fija): cada caller (ai.ts,
 * pedido-ai.ts) define su propia forma esperada en su `systemPrompt` y la
 * valida del otro lado con su propio schema -- el puente solo hace de
 * transporte, no conoce los contratos de cada uno. */
function extraerJson(texto: string): unknown {
  const match = texto.match(/[[{][\s\S]*[\]}]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function consultarAgente(systemPrompt: string, mensaje: string): Promise<unknown> {
  const grupo = ensureGrupo();

  const prompt = `${systemPrompt}

# Mensaje del cliente
<mensaje_cliente>
${mensaje}
</mensaje_cliente>

# Formato de tu respuesta -- OBLIGATORIO, sin excepción
Tu ÚNICA salida debe ser un objeto o array JSON crudo (la forma exacta ya se
describió arriba), sin texto antes ni después, sin bloque de código markdown
ni backticks.`;

  let capturedResult: string | null = null;
  let closeScheduled = false;
  const scheduleClose = () => {
    if (closeScheduled) return;
    closeScheduled = true;
    setTimeout(closeAgente, CLOSE_DELAY_MS);
  };

  const onProcess = (_proc: ChildProcess, processName: string) => {
    logger.info({ processName }, 'davincheese-ia: agente iniciado');
  };
  const onOutput = async (output: ContainerOutput) => {
    if (output.result) capturedResult = output.result;
    if (output.status === 'success' || output.status === 'error') scheduleClose();
  };

  const runFn = grupo.runtime === 'sandbox' ? runSandboxAgent : runContainerAgent;
  const output = await runFn(
    grupo,
    {
      prompt,
      groupFolder: GRUPO_FOLDER,
      chatJid: GRUPO_JID,
      isMain: false,
      agentConfig: grupo.agentConfig,
    },
    onProcess,
    onOutput,
  );

  const texto = output.result ?? capturedResult ?? '';
  return extraerJson(texto);
}

export function startIaBridgeServer(port: number, secret: string): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }
    if (req.method !== 'POST' || req.url !== '/consulta') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const body = await readBody(req);
    const signature = req.headers['x-signature'] as string | undefined;
    if (!signature || !verifySignature(secret, body, signature)) {
      sendJson(res, 401, { error: 'Invalid signature' });
      return;
    }

    let payload: { systemPrompt?: string; mensaje?: string };
    try {
      payload = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: 'JSON inválido' });
      return;
    }
    if (!payload.systemPrompt || !payload.mensaje) {
      sendJson(res, 400, { error: 'Faltan systemPrompt/mensaje' });
      return;
    }

    try {
      let venceTimeout = false;
      const timeout = new Promise<null>((resolve) => {
        setTimeout(() => {
          venceTimeout = true;
          resolve(null);
        }, TIMEOUT_MS);
      });
      const resultado = await Promise.race([
        consultarAgente(payload.systemPrompt, payload.mensaje).catch((err) => {
          logger.error({ err }, 'davincheese-ia: fallo consultando el agente');
          return null;
        }),
        timeout,
      ]);

      if (resultado === null || resultado === undefined) {
        sendJson(res, 504, { error: venceTimeout ? 'timeout' : 'respuesta no parseable' });
        return;
      }
      // `resultado` es la forma que haya pedido el caller en su systemPrompt
      // -- se envuelve en {data: ...} para no chocar con sendJson (que pide
      // Record<string, unknown>) sin importarle la forma interna.
      sendJson(res, 200, { data: resultado });
    } catch (err) {
      logger.error({ err }, 'davincheese-ia: fallo inesperado');
      sendJson(res, 500, { error: 'fallo interno' });
    }
  });

  server.listen(port, () => {
    logger.info({ port }, 'IA bridge server (davincheese-ia) listening');
  });

  return server;
}

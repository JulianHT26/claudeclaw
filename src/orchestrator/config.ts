import fs from 'fs';
import os from 'os';
import path from 'path';

import { readEnvFile } from './env.js';

// Read config values from .env (falls back to process.env).
// Secrets (API keys, tokens) are NOT read here — they are loaded only
// by the credential proxy (credential-proxy.ts), never exposed to containers.
const envConfig = readEnvFile([
  'ASSISTANT_NAME',
  'ASSISTANT_HAS_OWN_NUMBER',
  'RUNTIME',
]);

export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'ClaudeClaw';
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER ||
    envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

const HOME_DIR = process.env.HOME || os.homedir();

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'claudeclaw',
  'mount-allowlist.json',
);
export const SENDER_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'claudeclaw',
  'sender-allowlist.json',
);
// Code root: where the claudeclaw source/dist lives.
// Derived from this file's location: dist/orchestrator/config.js → ../../
// In developer mode: same as STATE_ROOT.
// In plugin mode: the plugin code directory (different from STATE_ROOT).
const thisDir = path.dirname(new URL(import.meta.url).pathname);
export const CODE_ROOT = path.resolve(thisDir, '..', '..');

// State lives in the current working directory — always.
// In developer mode: cwd is the claudeclaw repo.
// In plugin mode: cwd is whatever directory the user ran `claude` from.
// The directory IS the instance. Multiple instances = multiple directories.
export const STATE_ROOT = process.cwd();

export const STORE_DIR = path.resolve(STATE_ROOT, 'store');
export const GROUPS_DIR = path.resolve(STATE_ROOT, 'groups');
export const LOG_DIR = path.resolve(STATE_ROOT, 'logs');
export const DATA_DIR = path.resolve(STATE_ROOT, 'data');

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'claudeclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '1800000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const CREDENTIAL_PROXY_PORT = parseInt(
  process.env.CREDENTIAL_PROXY_PORT || '3001',
  10,
);
export const IPC_POLL_INTERVAL = 1000;
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '1800000', 10); // 30min default — how long to keep container alive after last result
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5,
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Webhook server configuration
const webhookEnv = readEnvFile(['WEBHOOK_PORT', 'WEBHOOK_SECRET']);
export const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT || webhookEnv.WEBHOOK_PORT || '3100', 10);
export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || webhookEnv.WEBHOOK_SECRET || '';

// IA bridge server configuration (puente síncrono para davincheese-os, ver
// src/ia-bridge/server.ts) -- puerto/secreto separados del webhook normal
// porque el contrato es distinto (síncrono, devuelve la respuesta en el
// mismo request, no enruta por un canal de WhatsApp).
const iaBridgeEnv = readEnvFile(['IA_BRIDGE_PORT', 'IA_BRIDGE_SECRET']);
export const IA_BRIDGE_PORT = parseInt(process.env.IA_BRIDGE_PORT || iaBridgeEnv.IA_BRIDGE_PORT || '3101', 10);
export const IA_BRIDGE_SECRET = process.env.IA_BRIDGE_SECRET || iaBridgeEnv.IA_BRIDGE_SECRET || '';

// Puente de validación de comprobantes por reacción en grupo de WhatsApp
// (ver src/comprobantes-bridge/server.ts) -- davincheese-os publica la foto
// del comprobante en un grupo real, el equipo reacciona con ✅/❌, y este
// puente le avisa de vuelta a davincheese-os quién resolvió qué pedido.
const comprobantesBridgeEnv = readEnvFile([
  'COMPROBANTES_BRIDGE_PORT',
  'COMPROBANTES_BRIDGE_SECRET',
  'COMPROBANTES_GRUPO_JID',
  'DAVINCHEESE_COMPROBANTE_WEBHOOK_URL',
  'DAVINCHEESE_COMPROBANTE_WEBHOOK_SECRET',
]);
export const COMPROBANTES_BRIDGE_PORT = parseInt(
  process.env.COMPROBANTES_BRIDGE_PORT || comprobantesBridgeEnv.COMPROBANTES_BRIDGE_PORT || '3102',
  10,
);
export const COMPROBANTES_BRIDGE_SECRET =
  process.env.COMPROBANTES_BRIDGE_SECRET || comprobantesBridgeEnv.COMPROBANTES_BRIDGE_SECRET || '';
export const COMPROBANTES_GRUPO_JID =
  process.env.COMPROBANTES_GRUPO_JID || comprobantesBridgeEnv.COMPROBANTES_GRUPO_JID || '';
export const DAVINCHEESE_COMPROBANTE_WEBHOOK_URL =
  process.env.DAVINCHEESE_COMPROBANTE_WEBHOOK_URL ||
  comprobantesBridgeEnv.DAVINCHEESE_COMPROBANTE_WEBHOOK_URL ||
  '';
export const DAVINCHEESE_COMPROBANTE_WEBHOOK_SECRET =
  process.env.DAVINCHEESE_COMPROBANTE_WEBHOOK_SECRET ||
  comprobantesBridgeEnv.DAVINCHEESE_COMPROBANTE_WEBHOOK_SECRET ||
  '';

// Runtime selection: 'container' (default, Apple Container / Docker) or 'sandbox' (srt)
export const DEFAULT_RUNTIME: 'container' | 'sandbox' =
  (process.env.RUNTIME || envConfig.RUNTIME || 'container') === 'sandbox'
    ? 'sandbox'
    : 'container';

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Container runtime abstraction for ClaudeClaw.
 * All runtime-specific logic lives here so swapping runtimes means changing one file.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';

import { logger } from '../orchestrator/logger.js';

/** The container runtime binary name. */
export const CONTAINER_RUNTIME_BIN: string = 'docker';

/** Hostname containers use to reach the host machine. */
export const CONTAINER_HOST_GATEWAY =
  CONTAINER_RUNTIME_BIN === 'container'
    ? '192.168.64.1'
    : 'host.docker.internal';

/**
 * Address the credential proxy binds to.
 * Docker Desktop (macOS): 127.0.0.1 — the VM routes host.docker.internal to loopback.
 * Docker (Linux): bind to the docker0 bridge IP so only containers can reach it,
 *   falling back to 0.0.0.0 if the interface isn't found.
 */
export const PROXY_BIND_HOST =
  process.env.CREDENTIAL_PROXY_HOST || detectProxyBindHost();

function detectProxyBindHost(): string {
  // Apple Container uses a bridged network — bind to all interfaces so the VM can reach the proxy
  if (os.platform() === 'darwin' && CONTAINER_RUNTIME_BIN === 'container')
    return '0.0.0.0';
  if (os.platform() === 'darwin') return '127.0.0.1';

  // WSL uses Docker Desktop (same VM routing as macOS) — loopback is correct.
  // Check /proc filesystem, not env vars — WSL_DISTRO_NAME isn't set under systemd.
  if (fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop')) return '127.0.0.1';

  // Bare-metal Linux: bind to the docker0 bridge IP instead of 0.0.0.0
  const ifaces = os.networkInterfaces();
  const docker0 = ifaces['docker0'];
  if (docker0) {
    const ipv4 = docker0.find((a) => a.family === 'IPv4');
    if (ipv4) return ipv4.address;
  }
  return '0.0.0.0';
}

/** CLI args needed for the container to resolve the host gateway. */
export function hostGatewayArgs(): string[] {
  // On Linux, host.docker.internal isn't built-in — add it explicitly
  if (os.platform() === 'linux') {
    return ['--add-host=host.docker.internal:host-gateway'];
  }
  return [];
}

/** Returns CLI args for a readonly bind mount. */
export function readonlyMountArgs(
  hostPath: string,
  containerPath: string,
): string[] {
  return [
    '--mount',
    `type=bind,source=${hostPath},target=${containerPath},readonly`,
  ];
}

/** Returns the shell command to stop a container by name. */
export function stopContainer(name: string): string {
  return `${CONTAINER_RUNTIME_BIN} stop ${name}`;
}

/** Ensure the container runtime is running, starting it if needed. */
export function ensureContainerRuntimeRunning(): void {
  if (CONTAINER_RUNTIME_BIN === 'docker') {
    // The Docker CLI has no "start the daemon" subcommand (that's an OS-level
    // service). If `docker info` fails, the daemon isn't reachable and there's
    // nothing more the CLI can do — surface instructions instead of retrying.
    try {
      execSync('docker info', { stdio: 'pipe' });
      logger.debug('Container runtime already running');
    } catch (err) {
      logger.error({ err }, 'Docker daemon is not reachable');
      console.error(
        '\n╔════════════════════════════════════════════════════════════════╗',
      );
      console.error(
        '║  FATAL: Docker daemon is not running                           ║',
      );
      console.error(
        '║                                                                ║',
      );
      console.error(
        '║  Agents cannot run without Docker. To fix:                     ║',
      );
      console.error(
        '║  macOS:  open -a Docker                                        ║',
      );
      console.error(
        '║  Linux:  sudo systemctl start docker                           ║',
      );
      console.error(
        '║  Then restart ClaudeClaw                                       ║',
      );
      console.error(
        '╚════════════════════════════════════════════════════════════════╝\n',
      );
      throw new Error('Container runtime is required but failed to start');
    }
    return;
  }

  try {
    execSync(`${CONTAINER_RUNTIME_BIN} system status`, { stdio: 'pipe' });
    logger.debug('Container runtime already running');
  } catch {
    logger.info('Starting container runtime...');
    try {
      execSync(`${CONTAINER_RUNTIME_BIN} system start`, {
        stdio: 'pipe',
        timeout: 30000,
      });
      logger.info('Container runtime started');
    } catch (err) {
      logger.error({ err }, 'Failed to start container runtime');
      console.error(
        '\n╔════════════════════════════════════════════════════════════════╗',
      );
      console.error(
        '║  FATAL: Container runtime failed to start                      ║',
      );
      console.error(
        '║                                                                ║',
      );
      console.error(
        '║  Agents cannot run without a container runtime. To fix:        ║',
      );
      console.error(
        '║  1. Ensure Apple Container is installed                        ║',
      );
      console.error(
        '║  2. Run: container system start                                ║',
      );
      console.error(
        '║  3. Restart ClaudeClaw                                           ║',
      );
      console.error(
        '╚════════════════════════════════════════════════════════════════╝\n',
      );
      throw new Error('Container runtime is required but failed to start');
    }
  }
}

/** Kill orphaned ClaudeClaw containers from previous runs. */
export function cleanupOrphans(): void {
  try {
    let orphans: string[];
    if (CONTAINER_RUNTIME_BIN === 'docker') {
      // `docker ps --format json` prints JSON Lines (one object per running
      // container), not a JSON array like Apple Container's `ls --format json`.
      // The format spec must be quoted: execSync runs this through a shell,
      // and the unquoted space inside `{{json .}}` gets word-split into a
      // second (invalid) positional arg, which `docker ps` rejects.
      const output = execSync("docker ps --format '{{json .}}'", {
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
      });
      orphans = output
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { Names: string; State: string })
        .filter((c) => c.State === 'running' && c.Names.startsWith('claudeclaw-'))
        .map((c) => c.Names);
    } else {
      const output = execSync(`${CONTAINER_RUNTIME_BIN} ls --format json`, {
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
      });
      const containers: { status: string; configuration: { id: string } }[] =
        JSON.parse(output || '[]');
      orphans = containers
        .filter(
          (c) =>
            c.status === 'running' &&
            c.configuration.id.startsWith('claudeclaw-'),
        )
        .map((c) => c.configuration.id);
    }
    for (const name of orphans) {
      try {
        execSync(stopContainer(name), { stdio: 'pipe' });
      } catch {
        /* already stopped */
      }
    }
    if (orphans.length > 0) {
      logger.info(
        { count: orphans.length, names: orphans },
        'Stopped orphaned containers',
      );
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to clean up orphaned containers');
  }
}

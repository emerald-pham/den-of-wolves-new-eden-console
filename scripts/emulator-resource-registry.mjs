#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { EMULATOR_SLOT_COUNT, emulatorPortsForSlot } from './emulator-slots.js';

export const COORDINATION_FILE_ENV = 'DOW_EMULATOR_COORDINATION_FILE';
export const COORDINATION_SCHEMA_VERSION = 1;
export const DEFAULT_VERSION_AGREEMENT =
  'Increment the patch version for each completed player-facing fix; do not bump tooling-only work.';

const DEFAULT_COORDINATION_FILE = 'den-of-wolves-new-eden-coordination.json';
const LOCK_RETRY_MS = 50;
const LOCK_ATTEMPTS = 600;
const execFileAsync = promisify(execFile);

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function validPid(value) {
  return Number.isInteger(value) && value > 0;
}

function processIsAlive(pid) {
  if (!validPid(pid)) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/** Return the one coordination file shared by local worktrees on this host. */
export function coordinationFilePath(
  environment = process.env,
  temporaryDirectory = tmpdir(),
) {
  const configuredPath = environment[COORDINATION_FILE_ENV];
  if (typeof configuredPath === 'string' && configuredPath.trim()) {
    return resolve(configuredPath);
  }
  return resolve(temporaryDirectory, DEFAULT_COORDINATION_FILE);
}

export function emptyCoordinationState() {
  return {
    version: COORDINATION_SCHEMA_VERSION,
    versionAgreement: DEFAULT_VERSION_AGREEMENT,
    entries: [],
    reservations: [],
    configurations: [],
  };
}

function normalizeState(value) {
  const record = objectRecord(value);
  const entries = Array.isArray(record.entries)
    ? record.entries.filter((entry) => objectRecord(entry).id)
    : [];
  const reservations = Array.isArray(record.reservations)
    ? record.reservations.filter(
        (reservation) =>
          Number.isInteger(reservation?.slot) &&
          typeof reservation?.worktree === 'string' &&
          typeof reservation?.kind === 'string' &&
          validPid(reservation?.pid),
      )
    : [];
  const configurations = Array.isArray(record.configurations)
    ? record.configurations.filter(
        (configuration) =>
          Number.isInteger(configuration?.slot) &&
          typeof configuration?.worktree === 'string',
      )
    : [];

  return {
    version: COORDINATION_SCHEMA_VERSION,
    versionAgreement: text(record.versionAgreement, DEFAULT_VERSION_AGREEMENT),
    entries,
    reservations,
    configurations,
  };
}

export function parseCoordinationState(content) {
  try {
    return normalizeState(JSON.parse(content));
  } catch (error) {
    throw new Error('The shared emulator coordination file is corrupted.', {
      cause: error,
    });
  }
}

export function pruneDeadReservations(state, isAlive = processIsAlive) {
  return {
    ...state,
    reservations: state.reservations.filter((reservation) => isAlive(reservation.pid)),
  };
}

function reservationBlocksSlot(reservation, request) {
  if (reservation.slot !== request.slot) return false;

  // A slot is isolated between worktrees. Within one worktree, the Vite
  // process may share the Firebase processes, but two Firebase-backed
  // processes must never point at the same Firestore instance.
  if (reservation.worktree !== request.worktree) return true;
  if (reservation.kind === 'configuration') return false;
  if (reservation.kind === 'vite' || request.kind === 'vite') {
    return reservation.kind === request.kind;
  }
  return true;
}

function coordinationReservations(state) {
  return [
    ...state.reservations,
    ...state.configurations.map((configuration) => ({
      ...configuration,
      kind: 'configuration',
      pid: 0,
      command: 'configured worktree slot',
      claimedAt: configuration.configuredAt,
    })),
  ];
}

/**
 * Select a preferred slot unless a live reservation blocks it. The caller
 * still checks OS ports while holding the registry lock; this pure helper is
 * intentionally easy to exercise without starting emulators.
 */
export function chooseAvailableEmulatorSlot({
  preferredSlot,
  availableSlots,
  worktree,
  kind,
  reservations,
}) {
  const candidates = [preferredSlot, ...availableSlots].filter(
    (slot, index, allSlots) =>
      Number.isInteger(slot) && allSlots.indexOf(slot) === index,
  );

  return candidates.find(
    (slot) =>
      !reservations.some((reservation) =>
        reservationBlocksSlot(reservation, { slot, worktree, kind }),
      ),
  );
}

function reservationSummary(reservations, slot) {
  return reservations
    .filter((reservation) => reservation.slot === slot)
    .map(
      (reservation) =>
        reservation.kind === 'configuration'
          ? `configuration by ${reservation.worktree}`
          : `${reservation.kind} by ${reservation.worktree} (pid ${reservation.pid})`,
    )
    .join('; ');
}

function reservationId() {
  return `${process.pid}-${Date.now()}-${randomUUID()}`;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function lockIsStale(lockPath) {
  try {
    const content = await readFile(lockPath, 'utf8');
    const pid = Number.parseInt(content.trim(), 10);
    return !processIsAlive(pid);
  } catch (error) {
    return error?.code === 'ENOENT';
  }
}

async function withCoordinationLock(filePath, operation) {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const lockPath = `${filePath}.lock`;
  let lockHandle;

  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      lockHandle = await open(lockPath, 'wx', 0o600);
      await lockHandle.writeFile(String(process.pid), 'utf8');
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (await lockIsStale(lockPath)) {
        await unlink(lockPath).catch((unlinkError) => {
          if (unlinkError?.code !== 'ENOENT') throw unlinkError;
        });
      } else {
        await delay(LOCK_RETRY_MS);
      }
    }
  }

  if (!lockHandle) {
    throw new Error(
      `Timed out waiting for the local emulator coordination lock at ${lockPath}.`,
    );
  }

  try {
    return await operation();
  } finally {
    await lockHandle.close();
    await unlink(lockPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

async function readStateUnlocked(filePath) {
  try {
    return parseCoordinationState(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyCoordinationState();
    throw error;
  }
}

async function writeStateUnlocked(filePath, state) {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}

export async function readCoordinationState(filePath = coordinationFilePath()) {
  return pruneDeadReservations(await readStateUnlocked(filePath));
}

function bindPortIsFree(port, host) {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once('error', () => resolvePromise(false));
    server.listen({ host, port }, () => {
      server.close((error) => resolvePromise(!error));
    });
  });
}

async function lsofPortIsFree(port) {
  try {
    const result = await execFileAsync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'],
      { encoding: 'utf8' },
    );
    return result.stdout.trim().length === 0;
  } catch (error) {
    if (error?.code === 1) return true;
    if (error?.code === 'ENOENT') return undefined;
    return undefined;
  }
}

export async function isPortFree(port, host = '127.0.0.1') {
  // Binding only to 127.0.0.1 can miss a process listening on a wildcard
  // address on macOS. lsof sees both forms and is also the repository's
  // documented port-ownership check; retain a bind fallback for machines
  // without lsof (and for callers that request a different host).
  if (host === '127.0.0.1') {
    const lsofResult = await lsofPortIsFree(port);
    if (lsofResult !== undefined) return lsofResult;
  }
  return bindPortIsFree(port, host === '127.0.0.1' ? '0.0.0.0' : host);
}

async function occupiedPorts(ports, portCheck) {
  const results = await Promise.all(
    ports.map(async (port) => ({ port, free: await portCheck(port) })),
  );
  return results.filter(({ free }) => !free).map(({ port }) => port);
}

function newReservation({ slot, worktree, kind, command, ports }) {
  return {
    id: reservationId(),
    slot,
    worktree,
    kind,
    pid: process.pid,
    command,
    claimedAt: new Date().toISOString(),
    ports: [...ports],
  };
}

function blockedSlotError({ filePath, slot, kind, state }) {
  const owners = reservationSummary(state.reservations, slot);
  const ownerText = owners || 'a process that is not registered in the coordination file';
  return new Error(
    `Cannot claim emulator slot ${slot} for ${kind}: ${ownerText}. ` +
      `See ${filePath}; stop or reconfigure the owning worktree before retrying.`,
  );
}

function occupiedSlotError({ filePath, slot, kind, ports }) {
  return new Error(
    `Cannot claim emulator slot ${slot} for ${kind}: port(s) ${ports.join(', ')} ` +
      `are already listening. See ${filePath} and choose a free slot.`,
  );
}

async function claimSlot({
  filePath,
  slot,
  worktree,
  kind,
  command,
  ports,
  portCheck,
  state,
}) {
  const reservations = coordinationReservations(state);
  const blockingReservation = reservations.find((reservation) =>
    reservationBlocksSlot(reservation, { slot, worktree, kind }),
  );
  if (blockingReservation) {
    throw blockedSlotError({
      filePath,
      slot,
      kind,
      state: { ...state, reservations },
    });
  }

  const occupied = await occupiedPorts(ports, portCheck);
  if (occupied.length > 0) {
    throw occupiedSlotError({ filePath, slot, kind, ports: occupied });
  }

  const reservation = newReservation({ slot, worktree, kind, command, ports });
  state.reservations.push(reservation);
  return reservation;
}

/** Record the configured slot before writing local config files. */
export async function reserveConfiguredEmulatorSlot({
  filePath = coordinationFilePath(),
  slot,
  worktree = process.cwd(),
  ports,
  portCheck = isPortFree,
}) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const reservations = coordinationReservations(state);
    const blockingReservation = reservations.find((reservation) =>
      reservationBlocksSlot(reservation, {
        slot,
        worktree,
        kind: 'configuration',
      }),
    );
    if (blockingReservation) {
      throw blockedSlotError({
        filePath,
        slot,
        kind: 'configuration',
        state: { ...state, reservations },
      });
    }

    const occupied = await occupiedPorts(ports, portCheck);
    if (occupied.length > 0) {
      throw occupiedSlotError({
        filePath,
        slot,
        kind: 'configuration',
        ports: occupied,
      });
    }

    const configuration = {
      id: `configuration-${randomUUID()}`,
      slot,
      worktree,
      configuredAt: new Date().toISOString(),
      ports: [...ports],
    };
    state.configurations = state.configurations.filter(
      (candidate) => candidate.worktree !== worktree,
    );
    state.configurations.push(configuration);
    await writeStateUnlocked(filePath, state);
    return configuration;
  });
}

export async function releaseConfiguredEmulatorSlot(
  configuration,
  filePath = coordinationFilePath(),
) {
  if (!configuration?.worktree) return;

  await withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    state.configurations = state.configurations.filter((candidate) => {
      if (configuration.id) return candidate.id !== configuration.id;
      return !(
        candidate.worktree === configuration.worktree &&
        candidate.slot === configuration.slot
      );
    });
    await writeStateUnlocked(filePath, state);
  });
}

/** Claim one configured slot after checking both the registry and OS ports. */
export async function reserveEmulatorSlot({
  filePath = coordinationFilePath(),
  slot,
  worktree = process.cwd(),
  kind,
  command,
  ports,
  portCheck = isPortFree,
}) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const reservation = await claimSlot({
      filePath,
      slot,
      worktree,
      kind,
      command,
      ports,
      portCheck,
      state,
    });
    await writeStateUnlocked(filePath, state);
    return reservation;
  });
}

/** Claim the first free complete slot, preferring the worktree's configured slot. */
export async function reserveAvailableEmulatorSlot({
  filePath = coordinationFilePath(),
  preferredSlot,
  worktree = process.cwd(),
  kind,
  command,
  availableSlots = Array.from({ length: EMULATOR_SLOT_COUNT }, (_, slot) => slot),
  portsForSlot = (slot) => Object.values(emulatorPortsForSlot(slot)),
  portCheck = isPortFree,
}) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const slot = chooseAvailableEmulatorSlot({
      preferredSlot,
      availableSlots,
      worktree,
      kind,
      reservations: coordinationReservations(state),
    });

    if (slot === undefined) {
      throw new Error(
        `No unreserved emulator slot is available for ${kind}. ` +
          `See ${filePath}, stop a running worktree, and retry.`,
      );
    }

    const candidateSlots = [slot, ...availableSlots.filter((candidate) => candidate !== slot)];
    for (const candidate of candidateSlots) {
      const candidateSlot = chooseAvailableEmulatorSlot({
        preferredSlot: candidate,
        availableSlots: [],
        worktree,
        kind,
        reservations: coordinationReservations(state),
      });
      if (candidateSlot === undefined) continue;

      const ports = portsForSlot(candidateSlot);
      if ((await occupiedPorts(ports, portCheck)).length > 0) continue;

      const reservation = newReservation({
        slot: candidateSlot,
        worktree,
        kind,
        command,
        ports,
      });
      state.reservations.push(reservation);
      await writeStateUnlocked(filePath, state);
      return reservation;
    }

    throw new Error(
      `No free emulator port set is available for ${kind}. ` +
        `See ${filePath}, stop a running worktree, and retry.`,
    );
  });
}

export async function releaseEmulatorSlot(
  reservation,
  filePath = coordinationFilePath(),
) {
  if (!reservation?.id) return;

  await withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    state.reservations = state.reservations.filter(
      (candidate) => candidate.id !== reservation.id,
    );
    await writeStateUnlocked(filePath, state);
  });
}

function formatEntry(entry) {
  const status = text(entry.status, 'active');
  const resources = Array.isArray(entry.resources) && entry.resources.length > 0
    ? entry.resources.join(', ')
    : 'none declared';
  return [
    `- [${status}] ${entry.id} — ${text(entry.intent, 'No intent recorded.')}`,
    `  worktree: ${text(entry.worktree, 'unknown')}`,
    `  started: ${text(entry.startedAt, 'unknown')} | version plan: ${text(entry.versionPlan, 'not recorded')}`,
    `  preemptive changelog: ${text(entry.preemptiveChangelog, 'not recorded')}`,
    `  resources: ${resources}`,
  ].join('\n');
}

function formatReservation(reservation) {
  const ports = Array.isArray(reservation.ports) ? reservation.ports.join(', ') : 'unknown';
  return `- slot ${reservation.slot} — ${reservation.kind} — ${reservation.worktree} — pid ${reservation.pid} — ports ${ports}`;
}

/** Render the coordination file as a compact, agent-readable status pane. */
export function formatCoordinationState(state) {
  const entries = Array.isArray(state.entries) ? state.entries : [];
  const reservations = Array.isArray(state.reservations) ? state.reservations : [];
  const configurations = Array.isArray(state.configurations) ? state.configurations : [];
  const lines = [
    '# Den of Wolves local coordination',
    '',
    '## Version agreement',
    text(state.versionAgreement, DEFAULT_VERSION_AGREEMENT),
    '',
    '## Preemptive changelog / active work',
  ];

  if (entries.length === 0) lines.push('- none');
  else lines.push(...entries.map(formatEntry));

  lines.push('', '## Configured worktree slots');
  if (configurations.length === 0) lines.push('- none');
  else {
    lines.push(
      ...configurations.map(
        (configuration) =>
          `- slot ${configuration.slot} — ${configuration.worktree} — configured ${text(configuration.configuredAt, 'unknown')}`,
      ),
    );
  }

  lines.push('', '## Emulator reservations');
  if (reservations.length === 0) lines.push('- none');
  else lines.push(...reservations.map(formatReservation));

  return `${lines.join('\n')}\n`;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument?.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const name = argument.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}.`);
    options[name] = value;
    index += 1;
  }
  return options;
}

async function beginEntry(filePath, options) {
  const required = ['intent', 'version-plan', 'preemptive-changelog'];
  for (const name of required) {
    if (!options[name]) throw new Error(`coordination begin requires --${name} <text>.`);
  }

  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const entry = {
      id: `${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}`,
      worktree: process.cwd(),
      pid: process.pid,
      startedAt: new Date().toISOString(),
      status: 'active',
      intent: options.intent,
      versionPlan: options['version-plan'],
      preemptiveChangelog: options['preemptive-changelog'],
      resources: options.resources
        ? options.resources.split(',').map((resource) => resource.trim()).filter(Boolean)
        : [],
    };
    state.entries.push(entry);
    await writeStateUnlocked(filePath, state);
    return entry;
  });
}

async function finishEntry(filePath, options) {
  if (!options.id) throw new Error('coordination finish requires --id <entry-id>.');

  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    entry.status = 'complete';
    entry.completedAt = new Date().toISOString();
    if (options.result) entry.result = options.result;
    await writeStateUnlocked(filePath, state);
    return entry;
  });
}

async function status(filePath) {
  const state = await withCoordinationLock(filePath, async () => {
    const cleanState = pruneDeadReservations(await readStateUnlocked(filePath));
    await writeStateUnlocked(filePath, cleanState);
    return cleanState;
  });
  console.log(`Coordination file: ${filePath}`);
  console.log(formatCoordinationState(state));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const filePath = coordinationFilePath();

  if (command === 'status') {
    await status(filePath);
    return;
  }

  const options = parseOptions(args);
  if (command === 'begin') {
    const entry = await beginEntry(filePath, options);
    console.log(`Registered preemptive work entry ${entry.id} in ${filePath}.`);
    return;
  }
  if (command === 'finish') {
    const entry = await finishEntry(filePath, options);
    console.log(`Completed coordination entry ${entry.id} in ${filePath}.`);
    return;
  }

  throw new Error(
    'usage: node scripts/emulator-resource-registry.mjs <status|begin|finish> [options]',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

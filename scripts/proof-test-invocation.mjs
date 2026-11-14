import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants as osConstants, tmpdir } from 'node:os';
import { open, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const DEFAULT_EXCERPT_BYTES = 24 * 1024;
const DEFAULT_EXCERPT_LINES = 80;
const SUMMARY_ITEM_LIMIT = 8;
const execFileAsync = promisify(execFile);

function signalExitCode(signal) {
  const number = osConstants.signals[signal];
  return Number.isSafeInteger(number) ? 128 + number : 1;
}

async function createLogPath(logPath) {
  if (logPath) {
    const absolutePath = resolve(logPath);
    await mkdir(dirname(absolutePath), { recursive: true });
    return absolutePath;
  }

  const directory = await mkdtemp(join(tmpdir(), 'proof-test-'));
  return join(directory, 'proof.log');
}

export async function readProofLogExcerpt(logPath, {
  maxBytes = DEFAULT_EXCERPT_BYTES,
  maxLines = DEFAULT_EXCERPT_LINES,
} = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('maxBytes must be a positive integer.');
  if (!Number.isSafeInteger(maxLines) || maxLines < 1) throw new Error('maxLines must be a positive integer.');

  const file = await open(logPath, 'r');
  try {
    const { size } = await file.stat();
    if (size === 0) return '';
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, size - length);
    let text = buffer.toString('utf8');
    if (size > length) {
      const firstNewline = text.indexOf('\n');
      text = firstNewline < 0 ? '' : text.slice(firstNewline + 1);
    }
    return text.split(/\r?\n/).slice(-maxLines).join('\n').trimEnd();
  } finally {
    await file.close();
  }
}

export function proofProcessExitCode({ code, signal, spawnError, interruptedBy, timedOut }) {
  if (timedOut) return 124;
  if (interruptedBy) return signalExitCode(interruptedBy);
  if (Number.isSafeInteger(code)) return code;
  if (signal) return signalExitCode(signal);
  if (spawnError) return 127;
  return 1;
}

// --- Owned runtime return -------------------------------------------------
//
// These helpers inspect only what a run recorded as its own: process IDs it
// spawned (optionally as process-group leaders), their descendants and the
// ports allocated to it. The host process table is read in memory, but only
// rows owned by, or ambiguous for, this run are summarized or retained. The
// helpers never signal a process or release a reservation; a foreign or
// ambiguous resource is reported with no stop or release authority.

function positivePid(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function parseProcessTable(output) {
  const rows = [];
  for (const line of String(output).split(/\r?\n/)) {
    // pid ppid pgid, then `lstart` (five tokens), then the command.
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.*)$/);
    if (!match) continue;
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]),
      startedAt: match[4].replace(/\s+/g, ' '), command: match[5] });
  }
  return rows;
}

/** Read the host process table for in-memory ownership matching only. */
export async function readProcessTable() {
  const { stdout } = await execFileAsync('ps', ['-A', '-ww', '-o', 'pid=,ppid=,pgid=,lstart=,command='],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return parseProcessTable(stdout);
}

/** Return a recorded process's start identity, or undefined when it cannot be observed. */
export async function readProcessStartTime(pid) {
  if (!positivePid(pid)) return undefined;
  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' });
    const value = stdout.trim().replace(/\s+/g, ' ');
    return value || undefined;
  } catch {
    return undefined;
  }
}

/** List TCP listeners on exactly the given ports. */
export async function readPortListeners(ports) {
  if (!ports.length) return [];
  let stdout;
  try {
    ({ stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${ports.join(',')}`, '-sTCP:LISTEN', '-Fpcn'],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  } catch (error) {
    // lsof exits 1 with no output when nothing listens on these ports.
    if (error?.code === 1 && !String(error.stdout ?? '').trim()) return [];
    throw error;
  }
  const allocated = new Set(ports);
  const listeners = new Map();
  let pid;
  let executable;
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith('p')) { pid = Number(line.slice(1)); executable = undefined; }
    else if (line.startsWith('c')) executable = line.slice(1);
    else if (line.startsWith('n')) {
      const port = Number(line.slice(line.lastIndexOf(':') + 1));
      if (allocated.has(port) && positivePid(pid)) listeners.set(`${port}:${pid}`, { port, pid, executable });
    }
  }
  return [...listeners.values()];
}

function executableName(command) {
  const first = String(command ?? '').trim().split(/\s+/)[0];
  return first ? basename(first) : 'unknown';
}

function errorRecord(error) {
  return { name: error?.name, message: error?.message ?? String(error), code: error?.code };
}

function listSummary(items, format) {
  const shown = items.slice(0, SUMMARY_ITEM_LIMIT).map(format).join('; ');
  return items.length > SUMMARY_ITEM_LIMIT ? `${shown}; +${items.length - SUMMARY_ITEM_LIMIT} more in evidence` : shown;
}

function classifyOwnedProcesses(records, table) {
  const byPid = new Map(table.map(row => [row.pid, row]));
  const owned = new Map();
  const foreign = [];
  const add = (row, label, ownership) => {
    if (row.pid === process.pid || owned.has(row.pid)) return;
    owned.set(row.pid, { ...row, label, ownership });
  };

  for (const record of records) {
    const row = byPid.get(record.pid);
    if (row && record.startedAt && row.startedAt !== record.startedAt) {
      // The recorded process has exited and its PID was reused. A reused PID
      // cannot lead a surviving group of the recorded process.
      foreign.push({ pid: record.pid, label: record.label, executable: executableName(row.command),
        reason: 'recorded PID now identifies a different process' });
      continue;
    }
    const ownership = record.startedAt ? 'recorded' : 'unverified';
    if (row) add(row, record.label, ownership);
    if (record.group) {
      for (const member of table) {
        if (member.pgid === record.pid) add(member, `${record.label} group member`, ownership === 'unverified' ? 'unverified' : 'group-member');
      }
    }
  }

  let grew = true;
  while (grew) {
    grew = false;
    for (const row of table) {
      const parent = owned.get(row.ppid);
      if (!parent || owned.has(row.pid) || row.pid === process.pid) continue;
      add(row, `descendant of ${parent.label}`, parent.ownership === 'unverified' ? 'unverified' : 'descendant');
      grew = true;
    }
  }
  return { owned: [...owned.values()], foreign };
}

/**
 * Inspect a run's recorded owned processes, their descendants and its
 * allocated ports after teardown. Returns a concise summary and retains the
 * scoped detail on disk. Missing ownership evidence or a failed probe can
 * never produce a clean-return claim.
 */
export async function inspectOwnedRuntime({
  owned = [],
  ports = [],
  originalResult = 'not recorded',
  evidenceDirectory,
  listProcesses = readProcessTable,
  listListeners = readPortListeners,
} = {}) {
  const records = (Array.isArray(owned) ? owned : [])
    .filter(record => positivePid(record?.pid))
    .map(record => ({ pid: record.pid, label: String(record.label ?? `pid ${record.pid}`),
      group: record.group === true, ...(record.startedAt ? { startedAt: String(record.startedAt) } : {}) }));
  const allocatedPorts = [...new Set((Array.isArray(ports) ? ports : []).filter(port => Number.isSafeInteger(port) && port > 0))];
  const probeErrors = [];

  let ownedProcesses = [];
  let foreign = [];
  try {
    ({ owned: ownedProcesses, foreign } = classifyOwnedProcesses(records, await listProcesses()));
  } catch (error) {
    probeErrors.push({ probe: 'process table', error: errorRecord(error) });
  }

  let listeners = [];
  try {
    const ownedPids = new Map(ownedProcesses.map(row => [row.pid, row]));
    listeners = (await listListeners(allocatedPorts)).map(listener => {
      const row = ownedPids.get(listener.pid);
      const owner = !row ? 'foreign' : row.ownership === 'unverified' ? 'unverified' : 'owned';
      return { port: listener.port, pid: listener.pid, executable: listener.executable ?? 'unknown', owner };
    });
  } catch (error) {
    probeErrors.push({ probe: 'allocated port listeners', error: errorRecord(error) });
  }

  for (const listener of listeners) {
    if (listener.owner === 'foreign') foreign.push({ pid: listener.pid, port: listener.port,
      executable: listener.executable, reason: 'listener on an allocated port is not owned by this run' });
  }

  const remaining = {
    processes: ownedProcesses.map(row => ({ pid: row.pid, ppid: row.ppid, pgid: row.pgid, label: row.label,
      ownership: row.ownership, executable: executableName(row.command) })),
    listeners,
  };
  const status = probeErrors.length ? 'inspection-failed'
    : records.length === 0 ? 'ownership-missing'
      : remaining.processes.length || remaining.listeners.length ? 'resources-remaining'
        : 'clean';

  const evidence = {
    inspectedAt: new Date().toISOString(),
    originalResult,
    status,
    ownedRecords: records,
    allocatedPorts,
    remaining,
    // Full command lines are retained only for this run's own/ambiguous rows.
    remainingProcessRows: ownedProcesses.map(({ pid, ppid, pgid, startedAt, command, label, ownership }) =>
      ({ pid, ppid, pgid, startedAt, command, label, ownership })),
    foreign,
    probeErrors,
  };

  let evidencePath = null;
  let evidenceWriteError = null;
  try {
    const directory = evidenceDirectory ? resolve(evidenceDirectory) : await mkdtemp(join(tmpdir(), 'proof-runtime-'));
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, `runtime-return-${randomUUID()}.json`);
    await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    evidencePath = path;
  } catch (error) {
    evidenceWriteError = errorRecord(error);
  }

  const cleanReturn = status === 'clean' && evidencePath !== null;
  const lines = [cleanReturn
    ? `Runtime return: clean. Original result: ${originalResult}. ${records.length} recorded owned process(es), their descendants and allocated port(s) ${allocatedPorts.join(', ') || 'none'} have returned.`
    : `Runtime return: NOT CLEAN (${status === 'clean' ? 'evidence not retained' : status}). Original result: ${originalResult}.`];
  if (remaining.processes.length) {
    lines.push(`Remaining owned processes (${remaining.processes.length}): ${listSummary(remaining.processes,
      entry => `${entry.pid} ${entry.executable} (${entry.ownership === 'unverified' ? 'ambiguous: unverified identity, ' : ''}${entry.label})`)}`);
  }
  if (listeners.length) {
    lines.push(`Allocated port listeners (${listeners.length}): ${listSummary(listeners,
      entry => `port ${entry.port} by ${entry.pid} ${entry.executable} (${entry.owner})`)}`);
  }
  const ambiguous = [...foreign, ...remaining.processes.filter(entry => entry.ownership === 'unverified')];
  if (ambiguous.length) {
    lines.push(`Foreign or ambiguous (no stop or release authority): ${listSummary(ambiguous,
      entry => `${entry.pid}${entry.port ? ` on port ${entry.port}` : ''} ${entry.executable}${entry.reason ? ` (${entry.reason})` : ' (unverified identity)'}`)}`);
  }
  if (status === 'ownership-missing') lines.push('Ownership evidence missing: no recorded owned process; a clean return cannot be claimed.');
  for (const failure of probeErrors) lines.push(`Inspection failed (${failure.probe}): ${failure.error.message}`);
  lines.push(evidencePath ? `Detailed evidence: ${evidencePath}` : `Detailed evidence could not be written: ${evidenceWriteError?.message}`);

  return { status, cleanReturn, originalResult, allocatedPorts, remaining, foreign, probeErrors,
    evidencePath, evidenceWriteError, summary: lines.join('\n') };
}

function commandLabel(command, args) {
  return [command, ...args].map(value => JSON.stringify(String(value))).join(' ');
}

/**
 * Run a proof check without a shell pipeline, retain its complete output in a
 * private log, print a bounded excerpt on failure, and return the child's
 * actual exit code or a signal-derived non-success code. Diagnostic and
 * cleanup errors are reported separately and cannot replace a failed child.
 */
export async function runProofTestCommand(command, args, {
  cwd = process.cwd(),
  env = process.env,
  logPath,
  maxExcerptBytes = DEFAULT_EXCERPT_BYTES,
  maxExcerptLines = DEFAULT_EXCERPT_LINES,
  timeoutMs,
  writeOutput = value => process.stderr.write(value),
  cleanup,
  runtime,
} = {}) {
  if (typeof command !== 'string' || command.length === 0) throw new Error('A command is required.');
  if (!Array.isArray(args) || args.some(value => typeof value !== 'string')) throw new Error('Command arguments must be strings.');
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new Error('timeoutMs must be positive and finite.');
  }
  if (cleanup !== undefined && typeof cleanup !== 'function') throw new Error('cleanup must be a function.');
  if (typeof writeOutput !== 'function') throw new Error('writeOutput must be a function.');
  if (runtime !== undefined && (runtime === null || typeof runtime !== 'object')) {
    throw new Error('runtime must be an object of recorded owned processes and allocated ports.');
  }
  // With runtime inspection, the child leads its own process group so that
  // descendants remain attributable after they are reparented.
  const ownsGroup = runtime !== undefined && process.platform !== 'win32';

  const absoluteLogPath = await createLogPath(logPath);
  const log = await open(absoluteLogPath, 'wx', 0o600);
  let child;
  let rawResult = { code: null, signal: null, spawnError: null };
  let interruptedBy = null;
  let timedOut = false;
  let timeoutTimer;
  let forceKillTimer;
  let logCloseError = null;
  let childStartTime;

  // Signal only this run's child, or its own process group when it leads one.
  const signalChild = signal => {
    if (ownsGroup) process.kill(-child.pid, signal);
    else child.kill(signal);
  };
  const forwardSignal = signal => {
    interruptedBy ??= signal;
    if (child && child.exitCode === null && child.signalCode === null) {
      try { signalChild(signal); } catch { /* The child result retains the signal request. */ }
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          try { signalChild('SIGKILL'); } catch { /* The child result retains the signal request. */ }
        }
      }, 1_000);
    }
  };
  const onSigint = () => forwardSignal('SIGINT');
  const onSigterm = () => forwardSignal('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  try {
    child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', log.fd, log.fd],
      shell: false,
      detached: ownsGroup,
    });
    if (interruptedBy) forwardSignal(interruptedBy);
    if (timeoutMs !== undefined) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        if (child.exitCode === null && child.signalCode === null) {
          try { signalChild('SIGTERM'); } catch { /* The child result records the timeout. */ }
          forceKillTimer = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) {
              try { signalChild('SIGKILL'); } catch { /* The child result records the timeout. */ }
            }
          }, 1_000);
        }
      }, timeoutMs);
    }

    const exited = new Promise(resolveResult => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        resolveResult(result);
      };
      child.once('error', spawnError => finish({ code: null, signal: null, spawnError }));
      child.once('exit', (code, signal) => finish({ code, signal, spawnError: null }));
    });
    if (runtime !== undefined) childStartTime = readProcessStartTime(child.pid);
    rawResult = await exited;
  } catch (spawnError) {
    rawResult = { code: null, signal: null, spawnError };
  } finally {
    clearTimeout(timeoutTimer);
    clearTimeout(forceKillTimer);
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    try { await log.close(); } catch (error) { logCloseError = error; }
  }

  let excerpt = '';
  let diagnosticError = null;
  try {
    excerpt = await readProofLogExcerpt(absoluteLogPath, {
      maxBytes: maxExcerptBytes,
      maxLines: maxExcerptLines,
    });
  } catch (error) {
    diagnosticError = error;
  }

  let cleanupError = logCloseError;
  if (cleanup) {
    try { await cleanup({ code: rawResult.code, signal: rawResult.signal, logPath: absoluteLogPath }); }
    catch (error) { cleanupError ??= error; }
  }

  const initialExitCode = proofProcessExitCode({ ...rawResult, interruptedBy, timedOut });
  const status = timedOut
    ? `timed out after ${timeoutMs} ms`
    : interruptedBy
      ? `interrupted by ${interruptedBy} (exit code ${initialExitCode})`
      : rawResult.signal
        ? `terminated by ${rawResult.signal} (exit code ${initialExitCode})`
        : rawResult.spawnError
          ? `could not start (${rawResult.spawnError.message})`
          : `exited with code ${rawResult.code ?? initialExitCode}`;

  let runtimeReturn;
  if (runtime !== undefined) {
    const owned = [...(Array.isArray(runtime.owned) ? runtime.owned : [])];
    if (positivePid(child?.pid)) {
      owned.unshift({ pid: child.pid, label: 'proof command', group: ownsGroup, startedAt: await childStartTime });
    }
    runtimeReturn = await inspectOwnedRuntime({
      ...runtime,
      owned,
      originalResult: status,
      evidenceDirectory: runtime.evidenceDirectory ?? dirname(absoluteLogPath),
    });
  }

  let exitCode = initialExitCode;
  if (exitCode === 0 && (diagnosticError || cleanupError || (runtimeReturn && !runtimeReturn.cleanReturn))) exitCode = 1;

  let diagnosticsPrinted = false;
  if (exitCode !== 0) {
    const details = [
      `Proof command ${commandLabel(command, args)} ${status}.`,
      `Full log: ${absoluteLogPath}`,
      excerpt ? `Log excerpt (last ${maxExcerptLines} lines):\n${excerpt}` : 'Log excerpt: (empty)',
      diagnosticError ? `Diagnostic error: ${diagnosticError.message}` : null,
      cleanupError ? `Cleanup error: ${cleanupError.message}` : null,
      runtimeReturn?.summary,
    ].filter(Boolean).join('\n');
    try {
      await writeOutput(`${details}\n`);
      diagnosticsPrinted = true;
    }
    catch (error) { diagnosticError ??= error; }
  }

  return {
    code: rawResult.code,
    signal: rawResult.signal,
    exitCode,
    logPath: absoluteLogPath,
    excerpt,
    timedOut,
    interruptedBy,
    spawnError: rawResult.spawnError,
    diagnosticError,
    cleanupError,
    diagnosticsPrinted,
    ...(runtimeReturn ? { runtime: runtimeReturn } : {}),
  };
}

async function main() {
  const separator = process.argv.indexOf('--');
  if (separator < 0 || !process.argv[separator + 1]) {
    process.stderr.write('Usage: node scripts/proof-test-invocation.mjs [--log PATH] -- COMMAND [ARG ...]\n');
    process.exitCode = 2;
    return;
  }

  const options = process.argv.slice(2, separator);
  let logPath;
  for (let index = 0; index < options.length; index++) {
    if (options[index] === '--log' && options[index + 1]) {
      logPath = options[++index];
      continue;
    }
    process.stderr.write(`Unknown option: ${options[index]}\n`);
    process.exitCode = 2;
    return;
  }

  const command = process.argv[separator + 1];
  const args = process.argv.slice(separator + 2);
  const result = await runProofTestCommand(command, args, { logPath });
  if (result.exitCode === 0) {
    process.stdout.write(`Proof command passed (exit 0). Full log: ${result.logPath}\n`);
  }
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode ?? 1;
  });
}

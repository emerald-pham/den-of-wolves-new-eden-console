import { spawn } from 'node:child_process';
import { constants as osConstants, tmpdir } from 'node:os';
import { open, mkdir, mkdtemp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_EXCERPT_BYTES = 24 * 1024;
const DEFAULT_EXCERPT_LINES = 80;

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
} = {}) {
  if (typeof command !== 'string' || command.length === 0) throw new Error('A command is required.');
  if (!Array.isArray(args) || args.some(value => typeof value !== 'string')) throw new Error('Command arguments must be strings.');
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new Error('timeoutMs must be positive and finite.');
  }
  if (cleanup !== undefined && typeof cleanup !== 'function') throw new Error('cleanup must be a function.');
  if (typeof writeOutput !== 'function') throw new Error('writeOutput must be a function.');

  const absoluteLogPath = await createLogPath(logPath);
  const log = await open(absoluteLogPath, 'wx', 0o600);
  let child;
  let rawResult = { code: null, signal: null, spawnError: null };
  let interruptedBy = null;
  let timedOut = false;
  let timeoutTimer;
  let forceKillTimer;
  let logCloseError = null;

  const forwardSignal = signal => {
    interruptedBy ??= signal;
    if (child && child.exitCode === null && child.signalCode === null) {
      try { child.kill(signal); } catch { /* The child result retains the signal request. */ }
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          try { child.kill('SIGKILL'); } catch { /* The child result retains the signal request. */ }
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
    });
    if (interruptedBy) forwardSignal(interruptedBy);
    if (timeoutMs !== undefined) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        if (child.exitCode === null && child.signalCode === null) {
          try { child.kill('SIGTERM'); } catch { /* The child result records the timeout. */ }
          forceKillTimer = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) {
              try { child.kill('SIGKILL'); } catch { /* The child result records the timeout. */ }
            }
          }, 1_000);
        }
      }, timeoutMs);
    }

    rawResult = await new Promise(resolveResult => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        resolveResult(result);
      };
      child.once('error', spawnError => finish({ code: null, signal: null, spawnError }));
      child.once('exit', (code, signal) => finish({ code, signal, spawnError: null }));
    });
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
  let exitCode = initialExitCode;
  if (exitCode === 0 && (diagnosticError || cleanupError)) exitCode = 1;

  let diagnosticsPrinted = false;
  if (exitCode !== 0) {
    const status = timedOut
      ? `timed out after ${timeoutMs} ms`
      : interruptedBy
        ? `interrupted by ${interruptedBy} (exit code ${exitCode})`
        : rawResult.signal
          ? `terminated by ${rawResult.signal} (exit code ${exitCode})`
          : `exited with code ${rawResult.code ?? exitCode}`;
    const details = [
      `Proof command ${commandLabel(command, args)} ${status}.`,
      `Full log: ${absoluteLogPath}`,
      excerpt ? `Log excerpt (last ${maxExcerptLines} lines):\n${excerpt}` : 'Log excerpt: (empty)',
      diagnosticError ? `Diagnostic error: ${diagnosticError.message}` : null,
      cleanupError ? `Cleanup error: ${cleanupError.message}` : null,
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

import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, rename, rm, stat, unlink, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const LOCKFILE_STAMP_FILE = '.codex-lockfile-fingerprint';

const INSTALL_ARGUMENTS = Object.freeze(['ci', '--prefer-offline', '--no-audit']);
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const LOCK_STALE_MS = 30 * 1000;
const LOCK_RETRY_MS = 100;
const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function lockPathForRepository(directory) {
  const identity = createHash('sha256').update(resolve(directory)).digest('hex').slice(0, 24);
  return resolve(tmpdir(), `den-of-wolves-dependency-bootstrap-${identity}.lock`);
}

export async function fingerprintLockfile(lockfilePath) {
  const content = await readFile(lockfilePath);
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function currentStamp(nodeModulesPath) {
  if (!(await isDirectory(nodeModulesPath))) return undefined;
  try {
    return (await readFile(resolve(nodeModulesPath, LOCKFILE_STAMP_FILE), 'utf8')).trim();
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function writeStamp(nodeModulesPath, fingerprint) {
  await mkdir(nodeModulesPath, { recursive: true });
  const temporaryPath = resolve(
    nodeModulesPath,
    `.${LOCKFILE_STAMP_FILE}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, `${fingerprint}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, resolve(nodeModulesPath, LOCKFILE_STAMP_FILE));
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function lockIsStale(lockPath, now) {
  let metadata;
  try {
    metadata = JSON.parse(await readFile(lockPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    metadata = undefined;
  }
  if (processIsAlive(metadata?.pid)) return false;

  const details = await stat(lockPath).catch((error) => {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!details) return false;
  return now - details.mtimeMs >= LOCK_STALE_MS;
}

async function acquireProcessLock(lockPath) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
    try {
      const handle = await open(lockPath, 'wx');
      try {
        await handle.writeFile(`${JSON.stringify({ pid: process.pid })}\n`, 'utf8');
      } catch (error) {
        await handle.close();
        await unlink(lockPath).catch(() => undefined);
        throw error;
      }
      return async () => {
        await handle.close();
        await unlink(lockPath).catch((error) => {
          if (error?.code !== 'ENOENT') throw error;
        });
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (await lockIsStale(lockPath, Date.now())) {
        await rm(lockPath, { force: true });
        continue;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, LOCK_RETRY_MS));
    }
  }
  throw new Error(`Timed out waiting for dependency bootstrap lock: ${lockPath}`);
}

function runNpmCi({ cwd, args = INSTALL_ARGUMENTS }) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(npmCommand, args, { cwd, stdio: 'inherit' });
    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (code === 0 && signal === null) {
        resolvePromise();
      } else {
        rejectPromise(new Error(
          `${npmCommand} ${args.join(' ')} failed in ${cwd} with ${signal ?? `code ${code ?? 1}`}.`,
        ));
      }
    });
  });
}

async function bootstrapTree({ name, cwd, runInstall, installed, skipped }) {
  const lockfilePath = resolve(cwd, 'package-lock.json');
  const nodeModulesPath = resolve(cwd, 'node_modules');
  const beforeFingerprint = await fingerprintLockfile(lockfilePath);
  if ((await currentStamp(nodeModulesPath)) === beforeFingerprint) {
    skipped.push(name);
    return;
  }

  await runInstall({ cwd, args: INSTALL_ARGUMENTS });
  const afterFingerprint = await fingerprintLockfile(lockfilePath);
  if (afterFingerprint !== beforeFingerprint) {
    throw new Error(`Lockfile changed while installing ${name}; dependency stamp was not written.`);
  }
  await writeStamp(nodeModulesPath, afterFingerprint);
  installed.push(name);
}

export async function bootstrapDependencies({
  repositoryDirectory: root = repositoryDirectory,
  runInstall = runNpmCi,
} = {}) {
  const lockRelease = await acquireProcessLock(lockPathForRepository(root));
  try {
    const installed = [];
    const skipped = [];
    await bootstrapTree({
      name: 'root',
      cwd: root,
      runInstall,
      installed,
      skipped,
    });
    await bootstrapTree({
      name: 'functions',
      cwd: resolve(root, 'functions'),
      runInstall,
      installed,
      skipped,
    });
    return { installed, skipped };
  } finally {
    await lockRelease();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  bootstrapDependencies()
    .then(({ installed, skipped }) => {
      console.log(`Dependency bootstrap complete; installed=${installed.join(',') || 'none'}; skipped=${skipped.join(',') || 'none'}.`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

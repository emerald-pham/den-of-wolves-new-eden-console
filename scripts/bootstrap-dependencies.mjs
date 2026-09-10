import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, rename, stat, unlink, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const LOCKFILE_STAMP_FILE = '.codex-lockfile-fingerprint';

const INSTALL_ARGUMENTS = Object.freeze(['ci', '--prefer-offline', '--no-audit']);
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const LOCK_STALE_MS = 30 * 1000;
const LOCK_RETRY_MS = 100;
const LOCK_RECOVERY_TIMEOUT_MS = LOCK_TIMEOUT_MS;
const MAX_LOCKFILE_RECHECKS = 3;
const DEPENDENCY_STAMP_SCHEMA_VERSION = 2;
const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function safePackagePath(path) {
  if (typeof path !== 'string' || path.includes('\\')) return false;
  const segments = path.split('/');
  return segments[0] === 'node_modules' && segments.length > 1 &&
    segments.slice(1).every((segment) => segment && segment !== '.' && segment !== '..');
}

export function lockPathForRepository(directory) {
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
    const source = (await readFile(resolve(nodeModulesPath, LOCKFILE_STAMP_FILE), 'utf8')).trim();
    const stamp = JSON.parse(source);
    if (stamp && typeof stamp === 'object' &&
      stamp.schemaVersion === DEPENDENCY_STAMP_SCHEMA_VERSION &&
      typeof stamp.fingerprint === 'string' &&
      Array.isArray(stamp.packageRecords) &&
      stamp.packageRecords.every((record) => record && safePackagePath(record.path) &&
        typeof record.optional === 'boolean')) {
      return stamp;
    }
    return undefined;
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function recordedPackageRecords(nodeModulesPath) {
  try {
    const source = JSON.parse(
      await readFile(resolve(nodeModulesPath, '.package-lock.json'), 'utf8'),
    );
    if (!source || typeof source !== 'object' ||
      typeof source.lockfileVersion !== 'number' || source.lockfileVersion < 3 ||
      !source.packages ||
      typeof source.packages !== 'object' || Array.isArray(source.packages)) {
      return undefined;
    }
    const records = [];
    for (const [path, metadata] of Object.entries(source.packages)) {
      if (!path.startsWith('node_modules/')) continue;
      if (!safePackagePath(path)) return undefined;
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
      records.push({ path, optional: metadata.optional === true });
    }
    return records.sort((left, right) => left.path.localeCompare(right.path));
  } catch (error) {
    return undefined;
  }
}

async function writeStamp(nodeModulesPath, fingerprint) {
  await mkdir(nodeModulesPath, { recursive: true });
  const temporaryPath = resolve(
    nodeModulesPath,
    `.${LOCKFILE_STAMP_FILE}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    const packageRecords = await recordedPackageRecords(nodeModulesPath);
    if (!packageRecords) {
      throw new Error(`npm hidden lock metadata is missing or malformed in ${nodeModulesPath}.`);
    }
    await writeFile(temporaryPath, `${JSON.stringify({
      schemaVersion: DEPENDENCY_STAMP_SCHEMA_VERSION,
      fingerprint,
      packageRecords,
    })}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
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

function sameFileIdentity(left, right) {
  if (!left || !right) return false;
  for (const field of ['dev', 'ino']) {
    if (left[field] !== undefined && right[field] !== undefined &&
      left[field] !== right[field]) return false;
  }
  return true;
}

async function closeAndRemoveOwnedPath(handle, path) {
  const handleIdentity = await handle.stat().catch(() => undefined);
  await handle.close().catch(() => undefined);
  if (!handleIdentity) return;
  const pathIdentity = await stat(path).catch((error) => {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!sameFileIdentity(handleIdentity, pathIdentity)) return;
  await unlink(path).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
}

async function readLockMetadata(lockPath) {
  let metadata;
  try {
    metadata = JSON.parse(await readFile(lockPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    metadata = undefined;
  }
  return metadata;
}

async function lockIsStale(lockPath, now) {
  const metadata = await readLockMetadata(lockPath);
  if (processIsAlive(metadata?.pid)) return false;

  const details = await stat(lockPath).catch((error) => {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!details) return false;
  return now - details.mtimeMs >= LOCK_STALE_MS;
}

async function acquireRecoveryLock(lockPath) {
  const recoveryPath = `${lockPath}.recovery`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < LOCK_RECOVERY_TIMEOUT_MS) {
    let handle;
    try {
      handle = await open(recoveryPath, 'wx', 0o600);
      const token = randomUUID();
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, token })}\n`, 'utf8');
      return {
        handle,
        path: recoveryPath,
        token,
      };
    } catch (error) {
      if (handle) {
        await closeAndRemoveOwnedPath(handle, recoveryPath).catch(() => undefined);
      }
      if (error?.code !== 'EEXIST') throw error;
      if (await lockIsStale(recoveryPath, Date.now())) {
        const quarantinePath = `${recoveryPath}.${randomUUID()}.stale`;
        const renamed = await rename(recoveryPath, quarantinePath).then(() => true).catch((renameError) => {
          if (renameError?.code === 'ENOENT') return false;
          if (['EACCES', 'EBUSY', 'EPERM'].includes(renameError?.code)) return false;
          throw renameError;
        });
        if (!renamed) {
          await new Promise((resolvePromise) => setTimeout(resolvePromise, LOCK_RETRY_MS));
          continue;
        }
        await unlink(quarantinePath).catch((unlinkError) => {
          if (unlinkError?.code !== 'ENOENT') throw unlinkError;
        });
        continue;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, LOCK_RETRY_MS));
    }
  }
  throw new Error(`Timed out waiting for dependency bootstrap recovery lock: ${recoveryPath}`);
}

async function releaseRecoveryLock(recovery) {
  await releaseOwnedLock(recovery);
}

async function reclaimStaleLock(lockPath) {
  const recovery = await acquireRecoveryLock(lockPath);
  try {
    if (!(await lockIsStale(lockPath, Date.now()))) return false;
    const quarantinePath = `${lockPath}.${randomUUID()}.recovery`;
    const renamed = await rename(lockPath, quarantinePath).then(() => true).catch((error) => {
      if (error?.code === 'ENOENT') return;
      if (['EACCES', 'EBUSY', 'EPERM'].includes(error?.code)) return false;
      throw error;
    });
    if (!renamed) return false;
    await unlink(quarantinePath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    return true;
  } finally {
    await releaseRecoveryLock(recovery);
  }
}

async function releaseOwnedLock(lock) {
  const handleIdentity = await lock.handle.stat().catch(() => undefined);
  const pathIdentity = await stat(lock.path).catch((error) => {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  });
  const metadata = await readLockMetadata(lock.path);
  await lock.handle.close();
  const currentMetadata = await readLockMetadata(lock.path);
  const currentPathIdentity = await stat(lock.path).catch((error) => {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  });
  if (metadata?.token !== lock.token || currentMetadata?.token !== lock.token ||
    !sameFileIdentity(handleIdentity, pathIdentity) ||
    !sameFileIdentity(handleIdentity, currentPathIdentity)) return;
  await unlink(lock.path).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
}

async function releaseProcessLock(lock) {
  await releaseOwnedLock(lock);
}

async function acquireProcessLock(lockPath) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      const token = randomUUID();
      try {
        await handle.writeFile(`${JSON.stringify({ pid: process.pid, token })}\n`, 'utf8');
      } catch (error) {
        await closeAndRemoveOwnedPath(handle, lockPath);
        throw error;
      }
      return { handle, path: lockPath, token };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (await lockIsStale(lockPath, Date.now())) {
        await reclaimStaleLock(lockPath);
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

async function dependencyTreeIsValid(nodeModulesPath, stamp) {
  if (!stamp || stamp.schemaVersion !== DEPENDENCY_STAMP_SCHEMA_VERSION) return false;
  const packageRecords = await recordedPackageRecords(nodeModulesPath);
  if (!packageRecords || JSON.stringify(packageRecords) !== JSON.stringify(stamp.packageRecords)) {
    return false;
  }
  const missingRecordedPackage = (await Promise.all(packageRecords
    .map((record) => isDirectory(
      resolve(nodeModulesPath, record.path.replace(/^node_modules\//, '')),
    )))).some((exists) => !exists);
  return !missingRecordedPackage;
}

async function bootstrapTree({ name, cwd, runInstall, fingerprint = fingerprintLockfile, installed, skipped }) {
  const lockfilePath = resolve(cwd, 'package-lock.json');
  const nodeModulesPath = resolve(cwd, 'node_modules');
  for (let attempt = 0; attempt < MAX_LOCKFILE_RECHECKS; attempt += 1) {
    const beforeFingerprint = await fingerprint(lockfilePath);
    const stamp = await currentStamp(nodeModulesPath);
    if (stamp?.fingerprint === beforeFingerprint &&
      await dependencyTreeIsValid(nodeModulesPath, stamp)) {
      const afterFingerprint = await fingerprint(lockfilePath);
      const afterStamp = await currentStamp(nodeModulesPath);
      if (afterFingerprint === beforeFingerprint &&
        afterStamp?.fingerprint === stamp.fingerprint &&
        await dependencyTreeIsValid(nodeModulesPath, afterStamp)) {
        skipped.push(name);
        return;
      }
      continue;
    }

    await runInstall({ cwd, args: INSTALL_ARGUMENTS });
    // The final fingerprint check is the bootstrap linearization point. A
    // lockfile mutation after it belongs to a later bootstrap change.
    const afterFingerprint = await fingerprint(lockfilePath);
    if (afterFingerprint !== beforeFingerprint) {
      throw new Error(`Lockfile changed while installing ${name}; dependency stamp was not written.`);
    }
    await writeStamp(nodeModulesPath, afterFingerprint);
    installed.push(name);
    return;
  }
  throw new Error(`Lockfile changed repeatedly while checking ${name}; dependency stamp was not trusted.`);
}

export async function bootstrapDependencies({
  repositoryDirectory: root = repositoryDirectory,
  runInstall = runNpmCi,
  fingerprint = fingerprintLockfile,
} = {}) {
  const lock = await acquireProcessLock(lockPathForRepository(root));
  try {
    const installed = [];
    const skipped = [];
    await bootstrapTree({
      name: 'root',
      cwd: root,
      runInstall,
      fingerprint,
      installed,
      skipped,
    });
    await bootstrapTree({
      name: 'functions',
      cwd: resolve(root, 'functions'),
      runInstall,
      fingerprint,
      installed,
      skipped,
    });
    return { installed, skipped };
  } finally {
    await releaseProcessLock(lock);
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

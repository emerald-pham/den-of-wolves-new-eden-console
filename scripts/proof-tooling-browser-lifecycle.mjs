const DEFAULT_CLEANUP_TIMEOUT_MS = 2_000;

function timeoutError(operation, timeoutMs) {
  const error = new Error(`${operation} exceeded cleanup timeout (${timeoutMs} ms).`);
  error.name = 'TimeoutError';
  return error;
}

async function withinTimeout(operation, start, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(start),
      new Promise((_, reject) => { timer = setTimeout(() => reject(timeoutError(operation, timeoutMs)), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function exited(child) {
  return child && (child.exitCode !== null || child.signalCode !== null);
}

function waitForProcessExit(child, timeoutMs) {
  if (exited(child)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (complete, value) => {
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
      complete(value);
    };
    const onExit = () => finish(resolve);
    const onError = error => finish(reject, error);
    child.once('exit', onExit);
    child.once('error', onError);
    timer = setTimeout(() => finish(reject, timeoutError('browserServer process exit', timeoutMs)), timeoutMs);
    if (exited(child)) onExit();
  });
}

async function attemptClose(operation, resource, errors, timeoutMs) {
  if (!resource) return;
  try {
    await withinTimeout(operation, () => resource.close(), timeoutMs);
  } catch (error) {
    errors.push({ operation, error });
  }
}

async function killOwnedBrowserServer(browserServer, errors, timeoutMs) {
  let child;
  try {
    child = browserServer.process();
    if (!child || exited(child)) return;
    if (child.kill() === false) throw new Error('browserServer process kill returned false.');
    await waitForProcessExit(child, timeoutMs);
  } catch (error) {
    errors.push({ operation: 'browserServer.process.kill', error });
  }
}

async function cleanupProofBrowser(resources, { afterCleanup, stopBuild, timeoutMs }) {
  const errors = [];
  await attemptClose('context.close', resources.context, errors, timeoutMs);
  await attemptClose('browser.close', resources.browser, errors, timeoutMs);
  const errorsBeforeServerClose = errors.length;
  await attemptClose('browserServer.close', resources.browserServer, errors, timeoutMs);
  if (resources.browserServer && errors.length > errorsBeforeServerClose) {
    await killOwnedBrowserServer(resources.browserServer, errors, timeoutMs);
  }
  try {
    await withinTimeout('build stop', stopBuild, timeoutMs);
  } catch (error) {
    errors.push({ operation: 'build.stop', error });
  }
  try {
    await withinTimeout('post-cleanup check', () => afterCleanup(resources), timeoutMs);
  } catch (error) {
    errors.push({ operation: 'afterCleanup', error });
  }
  return errors;
}

/** Run a proof browser against injectable resources, always attempting bounded cleanup. */
export async function withProofBrowserCleanup(run, {
  afterCleanup = async () => {},
  stopBuild = () => {},
  timeoutMs = DEFAULT_CLEANUP_TIMEOUT_MS,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be a positive finite number.');
  const resources = { context: null, browser: null, browserServer: null };
  let result;
  let primaryError;
  let hasPrimaryError = false;
  try {
    result = await run(resources);
  } catch (error) {
    hasPrimaryError = true;
    primaryError = error;
  }

  const cleanupErrors = await cleanupProofBrowser(resources, { afterCleanup, stopBuild, timeoutMs });
  if (hasPrimaryError) {
    if (cleanupErrors.length && primaryError instanceof Error) {
      try { Object.defineProperty(primaryError, 'cleanupErrors', { value: cleanupErrors, configurable: true }); }
      catch { /* Keep the original failure when it cannot accept diagnostics. */ }
    }
    throw primaryError;
  }
  if (cleanupErrors.length) {
    const error = new AggregateError(cleanupErrors.map(entry => entry.error), 'Proof browser cleanup failed.');
    error.cleanupErrors = cleanupErrors;
    throw error;
  }
  return result;
}

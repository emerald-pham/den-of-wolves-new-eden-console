// PC10.3 reusable reconnect harness: real browser members on an isolated
// Auth/Functions/Firestore emulator row, served by the ordinary Vite app.
//
// Usage from a proof script (see scripts/test-pc10-3-reconnect.emulator.mjs):
//
//   import { enterReconnectRow, startEmulatorApp, openReconnectMember } from './pc10-3-reconnect-harness.mjs';
//   if (await enterReconnectRow({ script: 'node scripts/<proof>.mjs', kind: '<proof-kind>' })) {
//     const app = await startEmulatorApp();          // Vite on this row's port
//     const browser = await chromium.launch({ headless: true });
//     const member = await openReconnectMember(browser, { uiUrl: app.url, label: 'member' });
//     // createPc07AuthenticatedSession(..., { joinBrowserPlayers: { roleId: member.join } })
//     await member.partition();  // backend unreachable; the app shell still loads
//     await member.reload();     // persisted snapshot renders, server refresh is blocked
//     await member.heal();       // backend reachable; the app's ordinary reconnect runs
//     await member.until('fresh', s => s.connection === 'live' && s.freshness === 'server');
//   }
//
// Run a proof with `npm run emulators:configure -- auto` once, then
// `node scripts/<proof>.mjs`. The outer process builds Functions, reserves the
// configured row (Firebase ports plus Vite) and re-enters itself inside
// `firebase emulators:exec --only auth,functions,firestore`. Nothing here writes
// to the session store, seeds a scene or retries a gameplay command for the app.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { emulatorPortsForSlot, emulatorSlotForConfig, vitePortForSlot } from './emulator-slots.js';
import { runWithReservation } from './run-emulator-command.mjs';

export const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RECONNECT_PROJECT_ID = 'demo-dow-pc10-3-reconnect';
const SESSION_STORAGE_KEY = 'dow-new-eden-session';

/**
 * Outer call: build Functions and run `script` inside a reserved emulator row,
 * then return false. Inner call (inside emulators:exec): return true.
 */
export async function enterReconnectRow({ script, kind, project = RECONNECT_PROJECT_ID }) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.VITE_FIREBASE_PROJECT_ID ??= process.env.GCLOUD_PROJECT ?? project;
    process.chdir(repository);
    return true;
  }
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const configPath = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(configPath, 'utf8')));
  if (slot === undefined) throw new Error('Run `npm run emulators:configure -- auto` to claim an isolated row first.');
  await runWithReservation({ slot, kind, command: script,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', configPath,
      '--project', project, '--only', 'auth,functions,firestore', script] });
  return false;
}

/** Read the row's generated Vite environment (ports only; no credentials). */
export async function emulatorEnvironment() {
  const text = await readFile(resolve(repository, '.env.emulators.local'), 'utf8');
  return Object.fromEntries(text.trim().split('\n').map(line => line.split('=')));
}

/** Serve the ordinary app against this row. Inner process only. */
export async function startEmulatorApp() {
  const env = await emulatorEnvironment();
  const port = Number(env.VITE_DEV_SERVER_PORT);
  assert.ok(Number.isInteger(port) && port > 0, 'The row must define its Vite port.');
  const url = `http://127.0.0.1:${port}`;
  process.env.PC07_LOCAL_GM_ORIGIN ??= url;
  const child = spawn('npx', ['--no-install', 'vite', '--mode', 'emulators', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: repository, env: { ...process.env, VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID },
      stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let output = '';
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite exited early: ${output}`);
    try { if ((await fetch(url)).ok) break; } catch { /* not listening yet */ }
    await delay(250);
  }
  assert.ok((await fetch(url)).ok, `The app did not start on ${url}: ${output}`);
  return {
    url,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = new Promise(resolveExit => child.once('exit', resolveExit));
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM'); } catch { /* gone */ }
      await Promise.race([exited, delay(5_000)]);
    },
  };
}

/**
 * One real browser member: its own context (storage, Auth, Firestore), the
 * ordinary UI join, and network controls for genuine disconnect/reconnect.
 */
export async function openReconnectMember(browser, { uiUrl, label, viewport = { width: 390, height: 844 } }) {
  const env = await emulatorEnvironment();
  const backendPorts = new Set([env.VITE_FIREBASE_AUTH_EMULATOR_PORT, env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT,
    env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT]);
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  const callableRequests = [];
  let storeModuleUrl = '/src/store/useSessionStore.ts';
  let partitioned = false;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/src/store/useSessionStore.ts' &&
        (url.searchParams.has('t') || !new URL(storeModuleUrl, uiUrl).searchParams.has('t'))) storeModuleUrl = url.href;
    if (backendPorts.has(url.port) && request.method() === 'POST' && url.pathname.includes('/us-central1/')) {
      callableRequests.push({ name: url.pathname.split('/').at(-1), at: Date.now(), partitioned });
    }
  });
  const callableResponses = [];
  page.on('response', async response => {
    const url = new URL(response.url());
    if (!backendPorts.has(url.port) || !url.pathname.includes('/us-central1/')) return;
    let error = null;
    try { const body = await response.json(); error = body?.error ? { status: body.error.status, message: body.error.message } : null; }
    catch { /* body unavailable */ }
    callableResponses.push({ name: url.pathname.split('/').at(-1), at: Date.now(), httpStatus: response.status(), error });
  });
  const backendRoute = url => backendPorts.has(url.port);
  const blockBackend = route => route.abort('internetdisconnected');

  /** Current store view. Identity fields are returned for in-process assertions only. */
  async function observe() {
    return page.evaluate(async moduleUrl => {
      const { auth } = await import('/src/lib/firebase.ts');
      const { useSessionStore } = await import(moduleUrl);
      const s = useSessionStore.getState();
      const session = s.session, me = s.me;
      return {
        uid: auth().currentUser?.uid ?? null, memberUid: me?.uid ?? null, sessionId: session?.id ?? null,
        role: me?.role ?? null, assignedRoleId: me?.assignedRoleId ?? null, seatId: me?.seatId ?? null,
        activeConsoleRoleId: me?.activeConsoleRoleId ?? null, replacementRoleId: me?.replacementRoleId ?? null,
        fleetGroupId: me?.fleetGroupId ?? null, connectionGeneration: me?.connectionGeneration ?? null,
        connection: s.connection, freshness: s.sessionSnapshotFreshness,
        persistedSessionSnapshot: s.persistedSessionSnapshot === true,
        scopeGroupId: session?.memberSessionScope?.groupId ?? null,
        scopeVesselIds: session?.memberSessionScope?.vesselIds ?? null,
        shipResourceIds: Object.keys(session?.shipResources ?? {}).sort(),
        discoveryGroupId: session?.playerDiscovery?.groupId ?? null,
        discoveryVesselIds: session?.playerDiscovery?.fleetGroupVesselIds ?? null,
        activeVesselIds: session?.activeVesselIds ?? null,
        shuttleControl: session?.shuttleControl ?? null,
        shuttleCargo: session?.shuttleCargo ?? null,
        shipResources: session?.shipResources ?? null,
        shuttleDockings: session?.shuttleDockings ?? null,
        seats: (s.seats ?? []).map(seat => ({ id: seat.id, status: seat.status, holderUid: seat.holderUid ?? null })),
        hash: window.location.hash,
      };
    }, storeModuleUrl);
  }

  /** The browser's persisted snapshot: the cache a reload renders first. */
  async function persisted() {
    return page.evaluate(key => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const state = JSON.parse(raw).state ?? {};
      return { sessionId: state.session?.id ?? null, me: state.me ?? null,
        scopeGroupId: state.session?.memberSessionScope?.groupId ?? null,
        shipResourceIds: Object.keys(state.session?.shipResources ?? {}).sort(),
        shuttleControl: state.session?.shuttleControl ?? null, shuttleCargo: state.session?.shuttleCargo ?? null };
    }, SESSION_STORAGE_KEY);
  }

  async function until(description, ready, timeout = 60_000) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
      try { last = await observe(); } catch (error) { last = { observeError: error.message }; }
      if (!last.observeError && ready(last)) return last;
      await delay(250);
    }
    throw new Error(`${label}: ${description} — last ${JSON.stringify({ ...last, uid: undefined, memberUid: undefined,
      seats: undefined, shipResources: undefined, shuttleCargo: undefined })}`);
  }

  /** Ordinary landing-page join with the code of conduct; returns the browser's own Auth actor. */
  async function join(code) {
    await page.goto(uiUrl);
    await page.getByRole('button', { name: /^REDUCED MOTION/i }).click();
    await page.getByRole('textbox', { name: 'Session code', exact: true }).fill(code);
    await page.getByRole('button', { name: 'Join a session', exact: true }).click();
    const waiver = page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true });
    await waiver.waitFor();
    const acknowledgements = waiver.getByRole('checkbox', { name: /^Acknowledge regulation/ });
    await acknowledgements.first().waitFor();
    for (const checkbox of await acknowledgements.all()) await checkbox.check();
    await waiver.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true })
      .and(page.locator(':enabled')).click();
    await until('ordinary UI join', s => Boolean(s.uid && s.uid === s.memberUid));
    return token();
  }

  /** The browser's current Auth actor for fixture HTTP calls made as this same UID. */
  async function token() {
    return page.evaluate(async () => {
      const { auth } = await import('/src/lib/firebase.ts');
      return { localId: auth().currentUser.uid, idToken: await auth().currentUser.getIdToken() };
    });
  }

  /** Call a production callable through this page's own Firebase SDK and Auth. */
  async function callable(name, data) {
    return page.evaluate(async ({ name, data }) => {
      const source = await (await fetch('/src/lib/firebase.ts')).text();
      const match = source.match(/from\s+["']([^"']*firebase_functions\.js[^"']*)["']/);
      if (!match) throw new Error('The app Functions SDK import was not found.');
      const sdk = await import(match[1]);
      const { functions } = await import('/src/lib/firebase.ts');
      try { return { ok: true, result: (await sdk.httpsCallable(functions(), name)(data)).data }; }
      catch (error) { return { ok: false, code: error?.code ?? null, message: String(error?.message ?? error) }; }
    }, { name, data });
  }

  /**
   * Make the backend unreachable while the app shell remains loadable: drop
   * live connections, block every emulator port, then restore the link so a
   * reload renders only what this browser cached.
   */
  async function partition() {
    assert.equal(partitioned, false, `${label} is already partitioned.`);
    await context.setOffline(true);
    await page.waitForFunction(() => navigator.onLine === false);
    await context.route(backendRoute, blockBackend);
    partitioned = true;
    await context.setOffline(false);
    await page.waitForFunction(() => navigator.onLine === true);
  }

  /**
   * Restore the backend. The app's own retry loop and Firestore backoff find
   * it; no offline blip is injected, because a blip can fail an in-flight lazy
   * route import and that would test chunk loading rather than reconnect.
   */
  async function heal() {
    assert.equal(partitioned, true, `${label} is not partitioned.`);
    await context.unroute(backendRoute, blockBackend);
    partitioned = false;
  }

  async function reload() { await page.reload({ waitUntil: 'domcontentloaded' }); }

  return { label, page, context, errors, callableRequests, callableResponses, observe, persisted, until, join, token, callable,
    partition, heal, reload, isPartitioned: () => partitioned, close: () => context.close() };
}

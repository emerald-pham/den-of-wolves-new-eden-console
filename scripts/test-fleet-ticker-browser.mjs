import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const host = '127.0.0.1';
const port = Number(process.env.TICKER_SMOKE_PORT ?? 4179);
const appUrl = `http://${host}:${port}/`;
const artifactDirectory = process.env.TICKER_SMOKE_ARTIFACT_DIR
  ?? path.join('/tmp', 'fleet-ticker-smoke');
const AWAITING_DISPATCH_TEXT = 'AIRSPACE CONTROL // AWAITING DISPATCH';
const PRESS_TEXT = 'SNN // CURRENT SERVER BROADCAST';
const AIRSPACE_OPEN_TEXT = 'AIRSPACE CONTROL // AIRSPACE OPEN';
const RED_ALERT_TEXT = 'ICSN ADMIRAL // RED ALERT // WOLF ATTACK IMMINENT, ALL HANDS TO BATTLE STATIONS';
const STAND_DOWN_TEXT = 'AEGIS // RED ALERT CANCELLED BY AEGIS, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. REPEAT, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. RED ALERT CANCELLED BY AEGIS.';
const TURN_ZERO_ATC_TEXT = 'AIRSPACE CONTROL // AIRSPACE CLOSED';
const TURN_ONE_AIRSPACE_TEXT = 'AIRSPACE CONTROL // AIRSPACE CLOSED';
// Headless CI can coalesce one rAF callback while CSS advances one frame.
// Compare adjacent two-observation windows so every elapsed-time-normalized
// sample measures the same physical track without single-frame compositor jitter.
const VELOCITY_SAMPLE_STRIDE = 2;

const session = {
  id: 'ticker-browser-smoke',
  name: 'Ticker browser smoke',
  joinCode: 'BIRD',
  phase: 'active',
  ownerUid: 'ticker-smoke-player',
  createdAt: '2026-09-13T16:00:00.000Z',
  updatedAt: '2026-09-13T16:00:00.000Z',
  fleetTicker: {
    revision: 7,
    nextSequence: 7,
    replayCursor: 7,
    current: {
      id: 'ticker-browser-smoke:fleet-ticker:7',
      sequence: 7,
      source: 'press',
      priority: 50,
      text: PRESS_TEXT,
      tone: 'normal',
      gap: 'long',
      createdAt: '2026-09-13T16:00:00.000Z',
    },
    queued: [],
    draining: [],
    dismissed: [],
  },
};

const turnZeroSession = {
  ...session,
  id: 'ticker-browser-turn-zero',
  name: 'Turn Zero Ticker Browser Smoke',
  joinCode: 'ZERO',
  phase: 'lobby',
  currentTurn: 0,
  ownerUid: 'ticker-smoke-player',
  fleetTicker: {
    revision: 1,
    nextSequence: 1,
    replayCursor: 1,
    current: {
      id: 'ticker-browser-turn-zero:fleet-ticker:1',
      sequence: 1,
      source: 'automatic',
      sourceId: 'turn-zero-atc',
      priority: 30,
      text: TURN_ZERO_ATC_TEXT,
      tone: 'normal',
      gap: 'long',
      createdAt: '2026-09-13T16:00:00.000Z',
    },
    queued: [],
    draining: [],
    dismissed: [],
  },
};

const turnOneSession = {
  ...turnZeroSession,
  phase: 'active',
  currentTurn: 1,
  updatedAt: '2026-09-13T16:01:00.000Z',
  fleetTicker: {
    revision: 2,
    nextSequence: 2,
    replayCursor: 2,
    current: {
      id: 'ticker-browser-turn-zero:fleet-ticker:2',
      sequence: 2,
      source: 'automatic',
      sourceId: 'airspace:1:restricted',
      priority: 40,
      text: TURN_ONE_AIRSPACE_TEXT,
      tone: 'normal',
      gap: 'long',
      createdAt: '2026-09-13T16:01:00.000Z',
    },
    queued: [],
    draining: [],
    dismissed: [],
  },
};

const player = {
  uid: 'ticker-smoke-player',
  sessionId: 'ticker-browser-smoke',
  displayName: 'Ticker Smoke Player',
  role: 'player',
  seatId: null,
  activeConsoleRoleId: 'admiral',
  joinedAt: '2026-09-13T16:00:00.000Z',
};

function persistedFixture(nextSession, lastRoute, activeConsoleRoleId = player.activeConsoleRoleId) {
  return {
    state: {
      session: nextSession,
      me: { ...player, sessionId: nextSession.id, activeConsoleRoleId },
      gmInstance: null,
      gmAccessAuthenticatedAt: null,
      pendingCommands: [],
      mode: 'console',
      lastRoute,
    },
    version: 1,
  };
}

const persistedSession = persistedFixture(session, '/console');
const persistedTurnZeroSession = persistedFixture(turnZeroSession, '/roles', null);
const persistedTurnOneSession = persistedFixture(turnOneSession, '/roles', null);

// These isolated projections exercise painting of all three server sources.
// Callable tests prove the producer transitions; this smoke does not contact Firebase.
const sourceFixtures = Object.fromEntries([
  ['airspace-open', AIRSPACE_OPEN_TEXT, 'automatic', 'airspace:1:lifted', 40, 'normal'],
  ['short-press', 'SNN // OK', 'press', 'press-short-smoke-dispatch', 50, 'normal'],
  ['red-alert', RED_ALERT_TEXT, 'admiral', 'red-alert:1', 80, 'danger'],
  ['stand-down', STAND_DOWN_TEXT, 'automatic', 'red-alert:2', 80, 'normal'],
  ['press-return', PRESS_TEXT, 'press', 'press-smoke-dispatch', 50, 'normal'],
].map(([key, text, source, sourceId, priority, tone], index) => [key, persistedFixture({
  ...session,
  currentTurn: 1,
  fleetTicker: {
    ...session.fleetTicker,
    revision: 8 + index,
    current: { ...session.fleetTicker.current, text, source, sourceId, priority, tone },
  },
}, '/console')]));

sourceFixtures['expired-stand-down'] = persistedFixture({
  ...session,
  fleetTicker: {
    ...session.fleetTicker,
    current: {
      ...session.fleetTicker.current,
      source: 'automatic', sourceId: 'red-alert:2', priority: 80,
      text: STAND_DOWN_TEXT, passCount: 2, expiresAt: '2026-01-01T00:00:00.000Z',
    },
  },
}, '/console');
sourceFixtures['stale-airspace'] = persistedFixture({
  ...session,
  currentTurn: 2,
  turnPhase: {
    turn: 2, teamPhaseEndsAt: '2026-09-13T16:05:00.000Z',
    openAirspaceEndsAt: '2026-09-13T16:25:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  },
  fleetTicker: {
    ...session.fleetTicker,
    current: { ...turnOneSession.fleetTicker.current, sourceId: 'airspace:1:lifted', text: AIRSPACE_OPEN_TEXT },
    queued: [{ ...turnOneSession.fleetTicker.current, id: 'ticker-browser-smoke:fleet-ticker:3', sequence: 3,
      sourceId: 'airspace:2:restricted', text: 'AIRSPACE CONTROL // AIRSPACE CLOSED // OLD LOCKDOWN COPY' }],
  },
}, '/console');
sourceFixtures['pending-stream'] = persistedFixture({
  ...session,
  fleetTicker: undefined,
  currentTurn: 1,
  pressDispatch: { revision: 1, dispatches: [{ id: 'old-press', text: 'OLD DISMISSED NEWS' }] },
  turnPhase: {
    turn: 1,
    teamPhaseEndsAt: '2026-09-13T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-13T12:25:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  },
}, '/console');
sourceFixtures['empty-stream'] = persistedFixture({
  ...session,
  fleetTicker: { ...session.fleetTicker, revision: 12, current: null },
  // Deliberately stale legacy copy must not reappear while the stream is empty.
  pressDispatch: { revision: 1, dispatches: [{ id: 'old-press', text: 'OLD DISMISSED NEWS' }] },
}, '/console');

function startVite() {
  const output = [];
  const child = spawn(
    process.execPath,
    [path.join(process.cwd(), 'node_modules/vite/bin/vite.js'), '--host', host, '--port', String(port), '--strictPort'],
    { cwd: process.cwd(), env: { ...process.env, CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout?.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr?.on('data', (chunk) => output.push(chunk.toString()));
  return { child, output: () => output.join('').slice(-4000) };
}

async function waitForServer(child, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before browser smoke started.\n${output()}`);
    }
    try {
      const response = await fetch(appUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Vite at ${appUrl}.\n${output()}`);
}

async function assertTicker(page, label, fontMode, reducedMotion, expectedText) {
  await page.waitForFunction(
    () => document.querySelector('.fleet-ticker [role="status"]') !== null,
    undefined,
    { timeout: 15_000 },
  );
  const snapshotHandle = await page.waitForFunction((expected) => {
    const ticker = document.querySelector('.fleet-ticker');
    const frame = ticker?.querySelector('.fleet-ticker__window');
    const status = ticker?.querySelector('[role="status"]');
    const frameBounds = frame?.getBoundingClientRect();
    const tickerBounds = ticker?.getBoundingClientRect();
    const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const intersectsViewport = (bounds) => bounds !== undefined && bounds.right > viewport.left &&
      bounds.left < viewport.right && bounds.bottom > viewport.top && bounds.top < viewport.bottom;
    const tickerStyle = ticker ? getComputedStyle(ticker) : null;
    const frameStyle = frame ? getComputedStyle(frame) : null;
    const viewportVisible = intersectsViewport(tickerBounds) && intersectsViewport(frameBounds) &&
      tickerStyle?.display !== 'none' && tickerStyle?.visibility !== 'hidden' &&
      Number(tickerStyle?.opacity ?? 0) > 0 && frameStyle?.display !== 'none' &&
      frameStyle?.visibility !== 'hidden' && Number(frameStyle?.opacity ?? 0) > 0;
    const paintedText = ticker
      ? [...ticker.querySelectorAll('.fleet-ticker__copy, .fleet-ticker__message')]
        .filter((element) => !element.closest('.fleet-ticker__probe'))
        .some((element) => {
          const bounds = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return element.textContent?.includes(expected) &&
            bounds.width > 0 &&
            bounds.height > 0 && style.visibility === 'visible' && style.display !== 'none' && Number(style.opacity) > 0 &&
            frameBounds !== undefined && bounds.right > frameBounds.left &&
            bounds.left < frameBounds.right && bounds.bottom > frameBounds.top &&
            bounds.top < frameBounds.bottom;
        })
      : false;
    if (!viewportVisible || !paintedText) return false;
    return {
      fontStatus: document.fonts?.status ?? 'unavailable',
      fontPatchInstalled: Boolean(window.__tickerSmokeFontPatch),
      ticker: Boolean(ticker),
      text: status?.getAttribute('aria-label') ?? status?.textContent?.trim() ?? '',
      tickerBounds: tickerBounds?.toJSON() ?? null,
      frameBounds: frameBounds?.toJSON() ?? null,
      viewportVisible,
      paintedText,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      motion: document.querySelector('[data-motion]')?.dataset.motion ?? null,
    };
  }, expectedText, { timeout: 5_000 });
  const snapshot = await snapshotHandle.jsonValue();
  await snapshotHandle.dispose();

  if (!snapshot.ticker || !snapshot.viewportVisible || !snapshot.paintedText || !snapshot.tickerBounds ||
      snapshot.tickerBounds.width <= 0 || snapshot.tickerBounds.height <= 0) {
    throw new Error(`${label}: ticker is not painted in the viewport: ${JSON.stringify(snapshot)}`);
  }
  if (!snapshot.text.includes(expectedText)) {
    throw new Error(`${label}: visible ticker text is wrong: ${JSON.stringify(snapshot)}`);
  }
  if (snapshot.text.includes('IRIS')) {
    throw new Error(`${label}: obsolete Iris lockout copy reached the ticker: ${JSON.stringify(snapshot)}`);
  }
  if (snapshot.overflow) {
    throw new Error(`${label}: ticker introduced horizontal overflow: ${JSON.stringify(snapshot)}`);
  }
  const expectedMotion = reducedMotion ? 'reduce' : 'full';
  if (snapshot.motion !== expectedMotion) {
    throw new Error(`${label}: motion fixture was not applied: ${JSON.stringify(snapshot)}`);
  }
  if (fontMode === 'pending' && (!snapshot.fontPatchInstalled || snapshot.fontStatus !== 'loading')) {
    throw new Error(`${label}: pending-font fixture did not remain pending: ${JSON.stringify(snapshot)}`);
  }
  if (fontMode === 'ready' && snapshot.fontStatus !== 'loaded') {
    throw new Error(`${label}: ready-font fixture remained pending: ${JSON.stringify(snapshot)}`);
  }
}

async function assertTickerGeometry(page, label, reducedMotion) {
  const snapshot = await page.evaluate(async ({ reduced, velocitySampleStride }) => {
    const frame = document.querySelector('.fleet-ticker__window');
    const waitFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    if (!frame) return { reduced, error: 'ticker frame missing' };

    const samples = [];
    for (let index = 0; index < 18; index += 1) {
      const frameTime = await waitFrame();
      const frameBounds = frame.getBoundingClientRect();
      const groups = [...frame.querySelectorAll('.fleet-ticker__group')].map((group) => {
        const bounds = group.getBoundingClientRect();
        return {
          id: group.getAttribute('data-instance-id') ?? '',
          messageId: group.getAttribute('data-message-id') ?? '',
          left: bounds.left,
          right: bounds.right,
          width: bounds.width,
          top: bounds.top,
          bottom: bounds.bottom,
          elapsed: frameTime,
          copyIds: [...group.querySelectorAll('.fleet-ticker__copy')]
            .map((copy) => copy.getAttribute('data-copy-instance-id')),
        };
      }).filter((group) => group.width > 0 && group.bottom > frameBounds.top && group.top < frameBounds.bottom);
      samples.push({ frame: { left: frameBounds.left, right: frameBounds.right }, groups });
    }

    if (reduced) {
      const message = frame.querySelector('.fleet-ticker__message');
      const bounds = message?.getBoundingClientRect();
      return {
        reduced,
        stationary: Boolean(message && bounds && bounds.width > 0 && bounds.height > 0),
        samples,
      };
    }

    const overlap = [];
    const stablePhysicalInstances = samples.every((sample) => sample.groups.every((group) => (
      group.id.length > 0 && group.copyIds.every((copyId) => typeof copyId === 'string' && copyId.length > 0)
    )));
    for (const sample of samples) {
      const ordered = [...sample.groups].sort((left, right) => left.left - right.left);
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        const current = ordered[index];
        if (current.left < previous.right - 1) {
          overlap.push({ previous, current });
        }
      }
    }

    const tracks = new Map();
    for (const sample of samples) {
      for (const group of sample.groups) {
        const entries = tracks.get(group.id) ?? [];
        entries.push(group);
        tracks.set(group.id, entries);
      }
    }
    const velocitySamples = [];
    for (const positions of tracks.values()) {
      for (let index = velocitySampleStride; index < positions.length; index += 1) {
        const previous = positions[index - velocitySampleStride];
        const elapsed = positions[index].elapsed - previous.elapsed;
        if (elapsed > 0) velocitySamples.push((positions[index].left - previous.left) / elapsed * 1_000);
      }
    }
    const speedStable = velocitySamples.length >= 8 && velocitySamples.every((speed) => speed >= -64 && speed <= -32);
    return {
      reduced,
      sampleCount: samples.length,
      overlap,
      stablePhysicalInstances,
      movingTrackSamples: Math.max(0, ...[...tracks.values()].map((positions) => positions.length)),
      velocitySamples,
      speedStable,
      samples,
    };
  }, { reduced: reducedMotion, velocitySampleStride: VELOCITY_SAMPLE_STRIDE });

  await mkdir(artifactDirectory, { recursive: true });
  const artifactName = label.replaceAll('/', '-');
  await writeFile(
    path.join(artifactDirectory, `geometry-${artifactName}.json`),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );

  if (snapshot.error) throw new Error(`${label}: ${snapshot.error}`);
  if (reducedMotion) {
    if (!snapshot.stationary) throw new Error(`${label}: reduced ticker is not stationary and readable: ${JSON.stringify(snapshot)}`);
    return;
  }
  if (snapshot.overlap.length > 0) {
    throw new Error(`${label}: ticker groups overlap during rAF geometry sampling: ${JSON.stringify(snapshot.overlap[0])}`);
  }
  if (!snapshot.stablePhysicalInstances) {
    throw new Error(`${label}: ticker did not expose stable physical group and copy identities`);
  }
  if (snapshot.movingTrackSamples < 8 || !snapshot.speedStable) {
    throw new Error(`${label}: ticker did not maintain a measurable constant linear track: ${JSON.stringify(snapshot)}`);
  }
}

async function runTickerLifecycleCase() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
    viewport: { width: 320, height: 844 },
  });
  const page = await context.newPage();
  const artifactPath = path.join(artifactDirectory, 'ticker-lifecycle-normal.json');
  const lifecycle = {
    pressOne: { id: 'lifecycle-press-1', source: 'press', text: 'SNN // ONE', tone: 'normal', gap: 'long' },
    pressTwo: { id: 'lifecycle-press-2', source: 'press', text: 'SNN // TWO', tone: 'normal', gap: 'standard' },
    aegis: { id: 'lifecycle-aegis', source: 'admiral', text: 'ICSN ADMIRAL // RED ALERT', tone: 'danger', gap: 'standard' },
    standDown: { id: 'lifecycle-stand-down', source: 'automatic', text: 'AEGIS // STAND DOWN', tone: 'normal', passes: 2, gap: 'standard' },
  };
  const samples = [];

  const setTicker = async (message, queue = [], fallback) => {
    await page.evaluate(({ nextMessage, nextQueue, nextFallback }) => {
      window.__tickerLifecycleSet?.({
        message: nextMessage,
        queue: nextQueue,
        ...(nextFallback === undefined ? {} : { fallback: nextFallback }),
      });
    }, { nextMessage: message, nextQueue: queue, nextFallback: fallback });
  };
  const waitForText = async (text, timeout = 120_000) => {
    await page.waitForFunction((expected) => {
      const host = document.querySelector('#ticker-lifecycle-harness');
      const status = host?.querySelector('[role="status"]');
      return status?.getAttribute('aria-label')?.includes(expected) ?? false;
    }, text, { timeout });
  };
  const captureGeometry = async (label, {
    targetId, traversals = 1, requiredExits = 2, handoffId,
  } = {}) => {
    console.log(`Ticker lifecycle capture started: ${label}`);
    const result = await page.evaluate(async ({ name, expectedId, passCount, exitsNeeded, observedId, velocitySampleStride }) => {
      const host = document.querySelector('#ticker-lifecycle-harness');
      const frame = host?.querySelector('.fleet-ticker__window');
      if (!frame) return { label: name, error: 'frame missing' };
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const rows = [];
      const endpointEvents = [];
      const endpointListener = (event) => {
        const group = event.target instanceof Element
          ? event.target.closest('.fleet-ticker__group') : null;
        if (!group || !frame.contains(group)) return;
        const bounds = group.getBoundingClientRect();
        const frameBounds = frame.getBoundingClientRect();
        endpointEvents.push({
          id: group.getAttribute('data-instance-id') ?? '',
          messageId: group.getAttribute('data-message-id') ?? '',
          phase: 'exit', left: bounds.left, right: bounds.right,
          frameLeft: frameBounds.left, frameRight: frameBounds.right,
          elapsed: performance.now(),
        });
      };
      document.addEventListener('animationend', endpointListener, true);
      await (async () => {
        for (let index = 0; index < 120; index += 1) {
          const candidate = expectedId
            ? frame.querySelector(`[data-message-id="${expectedId}"]`)
            : frame.querySelector('.fleet-ticker__group');
          if (candidate) return candidate;
          await waitFrame();
        }
        return null;
      })();
      const targetGroups = expectedId
        ? [...frame.querySelectorAll(`[data-message-id="${expectedId}"]`)]
        : [...frame.querySelectorAll('.fleet-ticker__group')];
      targetGroups.forEach((group) => group.addEventListener('animationend', endpointListener, { capture: true }));
      const durationSeconds = targetGroups.length > 0
        ? Math.max(...targetGroups.map((group) => Number.parseFloat(getComputedStyle(group).animationDuration)))
        : Number.NaN;
      const budget = Number.isFinite(durationSeconds)
        ? Math.max(2_000, (durationSeconds * 1_000) + 2_000)
        : 12_000;
      const startedAt = performance.now();
      let frameCount = 0;
      while (performance.now() - startedAt < budget) {
        const frameTime = await waitFrame();
        frameCount += 1;
        if (frameCount % 3 !== 0) continue;
        const frameBounds = frame.getBoundingClientRect();
        const groups = [...frame.querySelectorAll('.fleet-ticker__group')].map((group) => {
          const bounds = group.getBoundingClientRect();
          return {
            id: group.getAttribute('data-instance-id') ?? '',
            messageId: group.getAttribute('data-message-id') ?? '',
            left: bounds.left, right: bounds.right, width: bounds.width,
            startX: Number.parseFloat(group.style.getPropertyValue('--fleet-ticker-start-x')),
            groupWidth: Number.parseFloat(group.style.getPropertyValue('--fleet-ticker-group-width')),
            elapsed: frameTime,
            paintedCopies: [...group.querySelectorAll(
              '.fleet-ticker__copy-slot:not([data-committed="false"]) .fleet-ticker__copy',
            )].map((copy) => {
              const copyBounds = copy.getBoundingClientRect();
              return {
                id: copy.getAttribute('data-copy-instance-id') ?? '',
                left: copyBounds.left,
                right: copyBounds.right,
                width: copyBounds.width,
              };
            }).filter((copy) => copy.id && copy.width > 0),
          };
        }).filter((group) => group.id && group.width > 0);
        rows.push({ frameLeft: frameBounds.left, frameRight: frameBounds.right, groups });
        const completedExits = new Set(endpointEvents
          .filter((event) => !expectedId || event.messageId === expectedId)
          .map((event) => event.id));
        if (completedExits.size >= exitsNeeded) break;
      }
      document.removeEventListener('animationend', endpointListener, true);
      targetGroups.forEach((group) => group.removeEventListener('animationend', endpointListener, { capture: true }));
      const overlap = [];
      const velocitySamples = [];
      const tracks = new Map();
      for (const sample of rows) {
        const ordered = sample.groups.flatMap((group) => group.paintedCopies)
          .sort((left, right) => left.left - right.left);
        for (let index = 1; index < ordered.length; index += 1) {
          const previous = ordered[index - 1];
          const current = ordered[index];
          if (current.left < previous.right - 1) overlap.push({ previous, current });
        }
        for (const group of sample.groups) {
          const track = tracks.get(group.id) ?? [];
          track.push(group);
          tracks.set(group.id, track);
        }
      }
      for (const track of tracks.values()) {
        for (let index = velocitySampleStride; index < track.length; index += 1) {
          const previous = track[index - velocitySampleStride];
          const elapsed = track[index].elapsed - previous.elapsed;
          if (elapsed > 0) velocitySamples.push((track[index].left - previous.left) / elapsed * 1_000);
        }
      }
      const targetRows = expectedId
        ? rows.flatMap((sample) => sample.groups.filter((group) => group.messageId === expectedId))
        : rows.flatMap((sample) => sample.groups);
      const targetInstances = [...new Set(targetRows.map((group) => group.id))].map((id) => {
        const track = targetRows.filter((group) => group.id === id);
        const exit = endpointEvents.find((event) => event.id === id);
        const first = track[0];
        const last = track.at(-1);
        return {
          id,
          messageId: first?.messageId,
          startX: first?.startX,
          groupWidth: first?.groupWidth,
          firstLeft: first?.left,
          lastRight: last?.right,
          entered: track.some((group) => group.left < (rows[0]?.frameRight ?? Infinity)),
          exited: Boolean(exit) || track.some((group) => group.right <= (rows[0]?.frameLeft ?? -Infinity) + 1),
          exit,
        };
      });
      const targetExitCount = targetInstances.filter((instance) => instance.exited).length;
      const handoffTracks = observedId
        ? [...new Set(rows.flatMap((sample) => sample.groups
          .filter((group) => group.messageId === observedId).map((group) => group.id)))].map((id) => ({
            id,
            samples: rows.flatMap((sample) => sample.groups.filter((group) => group.id === id)),
          }))
        : [];
      const targetIds = targetInstances.map((instance) => instance.id);
      const secondTargetId = targetIds[1];
      const secondTargetExit = endpointEvents.find((event) => event.id === secondTargetId);
      const handoffEntry = handoffTracks.flatMap((track) => {
        const frameRight = rows[0]?.frameRight ?? Infinity;
        const beganOffscreen = (track.samples[0]?.left ?? -Infinity) >= frameRight - 1;
        const entry = beganOffscreen
          ? track.samples.find((group) => group.left < frameRight)
          : undefined;
        return entry ? [{ ...entry, id: track.id }] : [];
      }).sort((left, right) => left.elapsed - right.elapsed)[0];
      return {
        label: name,
        targetId: expectedId,
        traversals: passCount,
        requiredExits: exitsNeeded,
        expectedEndpointTolerancePx: 2,
        durationSeconds,
        sampleCount: rows.length,
        rows,
        overlap,
        targetSamples: targetRows.length,
        targetInstances,
        targetExitCount,
        endpointValid: targetInstances.filter((instance) => instance.exited).length >= exitsNeeded &&
          targetInstances.filter((instance) => instance.exited).every((instance) => {
          const frameWidth = (rows[0]?.frameRight ?? 0) - (rows[0]?.frameLeft ?? 0);
          return Number.isFinite(instance.startX) && instance.startX >= frameWidth - 2 &&
            instance.exited && (!instance.exit || instance.exit.right <= instance.exit.frameLeft + 2);
          }),
        endpointEvents,
        handoff: observedId ? {
          observedId,
          entry: handoffEntry ?? null,
          secondTargetId,
          secondTargetExit: secondTargetExit ?? null,
          enteredBeforeSecondExit: Boolean(handoffEntry && secondTargetExit &&
            handoffEntry.elapsed < secondTargetExit.elapsed),
        } : null,
        velocitySamples,
      };
    }, {
      name: label, expectedId: targetId, passCount: traversals,
      exitsNeeded: requiredExits, observedId: handoffId,
      velocitySampleStride: VELOCITY_SAMPLE_STRIDE,
    });
    samples.push(result);
    console.log(`Ticker lifecycle capture sampled: ${label} (${Math.round((result.durationSeconds ?? 0) * 1_000)}ms, ${result.sampleCount} samples)`);
    if (result.error) throw new Error(`lifecycle/${label}: ${result.error}`);
    if (result.targetSamples < 8 || result.targetInstances.length < result.requiredExits) throw new Error(`lifecycle/${label}: target was not sampled across its full physical instances: ${JSON.stringify(result)}`);
    if (result.targetExitCount < result.requiredExits) throw new Error(`lifecycle/${label}: target did not prove ${result.requiredExits} complete left exits: ${JSON.stringify(result)}`);
    if (!result.endpointValid) throw new Error(`lifecycle/${label}: target endpoints did not begin beyond the right edge and finish beyond the left edge: ${JSON.stringify(result.targetInstances)}`);
    if (handoffId && !result.handoff?.enteredBeforeSecondExit) throw new Error(`lifecycle/${label}: ${handoffId} did not enter behind the second target tail before that tail exited: ${JSON.stringify(result.handoff)}`);
    if (result.overlap.length > 0) throw new Error(`lifecycle/${label}: groups overlap: ${JSON.stringify(result.overlap[0])}`);
    if (result.velocitySamples.length < 8 || result.velocitySamples.some((speed) => speed < -64 || speed > -32)) {
      const speeds = result.velocitySamples;
      throw new Error(`lifecycle/${label}: movement was not normalized to the 48px/s track: samples=${speeds.length}, min=${Math.min(...speeds)}, max=${Math.max(...speeds)}`);
    }
  };

  try {
    await page.goto(`${appUrl}#/ships/aegis`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      const [{ default: FleetTicker }, { default: React }, { default: ReactDOM }] = await Promise.all([
        import('/src/components/FleetTicker.tsx'),
        import('/node_modules/.vite/deps/react.js'),
        import('/node_modules/.vite/deps/react-dom_client.js'),
      ]);
      const host = document.createElement('div');
      host.id = 'ticker-lifecycle-harness';
      document.body.append(host);
      const root = ReactDOM.createRoot(host);
      window.__tickerLifecycleSet = (props) => root.render(React.createElement(FleetTicker, props));
    });
    await setTicker(lifecycle.pressOne, [lifecycle.pressTwo]);
    const committedBeforeAlert = await page.waitForFunction((outgoingId) => {
      const frame = document.querySelector('#ticker-lifecycle-harness .fleet-ticker__window');
      if (!frame) return false;
      const frameBounds = frame.getBoundingClientRect();
      const groups = [...frame.querySelectorAll(`[data-message-id="${outgoingId}"]`)];
      for (const group of groups) {
        const copy = [...group.querySelectorAll('.fleet-ticker__copy')].find((candidate) => {
          const bounds = candidate.getBoundingClientRect();
          const middle = (bounds.left + bounds.right) / 2;
          return bounds.right > frameBounds.left && bounds.left < frameBounds.right &&
            middle > frameBounds.left + (frameBounds.width * 0.2) &&
            middle < frameBounds.right - (frameBounds.width * 0.2);
        });
        if (copy) return {
          groupId: group.getAttribute('data-instance-id'),
          copyId: copy.getAttribute('data-copy-instance-id'),
        };
      }
      return false;
    }, lifecycle.pressOne.id).then((handle) => handle.jsonValue());
    await setTicker(lifecycle.aegis, [lifecycle.pressOne, lifecycle.pressTwo]);
    await page.waitForFunction(({ outgoingId, incomingId, retainedGroupId }) => {
      const frame = document.querySelector('#ticker-lifecycle-harness .fleet-ticker__window');
      return Boolean(frame?.querySelector(
        `[data-message-id="${outgoingId}"][data-instance-id="${retainedGroupId}"]`,
      ) &&
        frame?.querySelector(`[data-message-id="${incomingId}"]`));
    }, {
      outgoingId: lifecycle.pressOne.id,
      incomingId: lifecycle.aegis.id,
      retainedGroupId: committedBeforeAlert.groupId,
    });
    const priorityHandoff = await page.evaluate(({
      outgoingId, incomingId, retainedGroupId, retainedCopyId,
    }) => {
      const frame = document.querySelector('#ticker-lifecycle-harness .fleet-ticker__window');
      if (!frame) return { error: 'frame missing' };
      const frameBounds = frame.getBoundingClientRect();
      const outgoing = [...frame.querySelectorAll(`[data-message-id="${outgoingId}"]`)]
        .map((group) => {
          const committedCopies = [...group.querySelectorAll(
            '.fleet-ticker__copy-slot[data-committed="true"] .fleet-ticker__copy',
          )];
          const bounds = committedCopies.map((copy) => copy.getBoundingClientRect());
          return {
            instanceId: group.getAttribute('data-instance-id'),
            copyIds: committedCopies.map((copy) => copy.getAttribute('data-copy-instance-id')),
            left: Math.min(...bounds.map((copy) => copy.left)),
            right: Math.max(...bounds.map((copy) => copy.right)),
            copies: committedCopies.length,
            text: committedCopies.map((copy) => copy.textContent ?? '').join(' '),
          };
        }).filter(({ copies, left, right }) => copies > 0 && right > frameBounds.left && left < frameBounds.right);
      const incoming = [...frame.querySelectorAll(`[data-message-id="${incomingId}"]`)]
        .map((group) => {
          const bounds = group.getBoundingClientRect();
          return { left: bounds.left, right: bounds.right };
        }).sort((left, right) => left.left - right.left);
      const retainedCopies = [...frame.querySelectorAll(
        '.fleet-ticker__copy-slot[data-committed="true"] .fleet-ticker__copy',
      )].filter((copy) => copy.closest('.fleet-ticker__group')
        ?.getAttribute('data-message-id') !== incomingId)
        .map((copy) => {
          const bounds = copy.getBoundingClientRect();
          return {
            id: copy.getAttribute('data-copy-instance-id'),
            messageId: copy.closest('.fleet-ticker__group')?.getAttribute('data-message-id'),
            left: bounds.left,
            right: bounds.right,
          };
        });
      const trailingEdge = Math.max(frameBounds.right, ...outgoing.map(({ right }) => right));
      const firstIncomingLeft = incoming[0]?.left;
      return {
        label: 'press-to-red-alert-handoff',
        frameLeft: frameBounds.left,
        frameRight: frameBounds.right,
        outgoing,
        retainedCopies,
        retainedOriginalNode: outgoing.some(({ instanceId, copyIds }) =>
          instanceId === retainedGroupId && copyIds.includes(retainedCopyId)),
        incoming,
        retainedPaintedPress: outgoing.length > 0 && outgoing.every(({ copies, text }) => (
          copies === 1 && text.includes('SNN // ONE')
        )),
        incomingBehindTail: incoming.length > 0 && incoming[0].left >= trailingEdge - 2,
        incomingAtNextOpportunity: firstIncomingLeft !== undefined &&
          firstIncomingLeft <= trailingEdge + 2,
      };
    }, {
      outgoingId: lifecycle.pressOne.id,
      incomingId: lifecycle.aegis.id,
      retainedGroupId: committedBeforeAlert.groupId,
      retainedCopyId: committedBeforeAlert.copyId,
    });
    samples.push(priorityHandoff);
    if (priorityHandoff.error || !priorityHandoff.retainedOriginalNode ||
        !priorityHandoff.retainedPaintedPress ||
        !priorityHandoff.incomingBehindTail || !priorityHandoff.incomingAtNextOpportunity) {
      throw new Error(`lifecycle/press-to-red-alert-handoff: ${JSON.stringify(priorityHandoff)}`);
    }
    await captureGeometry('aegis', { targetId: lifecycle.aegis.id, requiredExits: 1 });
    await waitForText(lifecycle.aegis.text, 10_000);

    await setTicker(lifecycle.standDown, [lifecycle.pressOne, lifecycle.pressTwo], lifecycle.pressOne);
    await captureGeometry('stand-down-two-passes', {
      targetId: lifecycle.standDown.id, traversals: 2, requiredExits: 2,
      handoffId: lifecycle.pressOne.id,
    });
    await waitForText(lifecycle.pressOne.text);

    await setTicker(lifecycle.pressOne, [lifecycle.pressTwo]);
    await waitForText(lifecycle.pressTwo.text);
    await waitForText(lifecycle.pressOne.text);
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(samples, null, 2)}\n`);
    console.log(`Ticker lifecycle browser proof passed: ${artifactPath}`);
  } catch (error) {
    await mkdir(artifactDirectory, { recursive: true });
    await page.screenshot({ path: path.join(artifactDirectory, 'ticker-lifecycle-failure.png'), fullPage: false });
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function runReducedTickerLifecycleCase() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    viewport: { width: 320, height: 844 },
  });
  const page = await context.newPage();
  const artifactPath = path.join(artifactDirectory, 'ticker-lifecycle-reduced.json');
  const lifecycle = {
    pressOne: { id: 'reduced-lifecycle-press-1', source: 'press', text: 'SNN // ONE', tone: 'normal', gap: 'long' },
    pressTwo: { id: 'reduced-lifecycle-press-2', source: 'press', text: 'SNN // TWO', tone: 'normal', gap: 'long' },
    aegis: { id: 'reduced-lifecycle-aegis', source: 'admiral', text: 'ICSN ADMIRAL // RED ALERT', tone: 'danger', gap: 'long' },
    standDown: { id: 'reduced-lifecycle-stand-down', source: 'automatic', text: 'AEGIS // STAND DOWN', tone: 'normal', passes: 2, gap: 'long' },
  };
  const labels = [];
  const setTicker = async (message, queue = [], fallback) => {
    await page.evaluate(({ nextMessage, nextQueue, nextFallback }) => {
      window.__tickerLifecycleSet?.({
        message: nextMessage,
        queue: nextQueue,
        ...(nextFallback === undefined ? {} : { fallback: nextFallback }),
      });
    }, { nextMessage: message, nextQueue: queue, nextFallback: fallback });
  };
  const waitForAnnouncement = async (text, copy) => {
    await page.waitForFunction(({ expectedText, expectedCopy }) => {
      const status = document.querySelector('#ticker-lifecycle-reduced-harness [role="status"]');
      const label = status?.getAttribute('aria-label') ?? '';
      return label.includes(expectedText) && (expectedCopy === undefined || label.includes(`copy ${expectedCopy} of 2`));
    }, { expectedText: text, expectedCopy: copy }, { timeout: 30_000 });
    labels.push(await page.locator('#ticker-lifecycle-reduced-harness [role="status"]').getAttribute('aria-label'));
  };

  try {
    await page.goto(`${appUrl}#/ships/aegis`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      const [{ default: FleetTicker }, { default: React }, { default: ReactDOM }] = await Promise.all([
        import('/src/components/FleetTicker.tsx'),
        import('/node_modules/.vite/deps/react.js'),
        import('/node_modules/.vite/deps/react-dom_client.js'),
      ]);
      const host = document.createElement('div');
      host.id = 'ticker-lifecycle-reduced-harness';
      document.body.append(host);
      const root = ReactDOM.createRoot(host);
      window.__tickerLifecycleSet = (props) => root.render(React.createElement(FleetTicker, props));
    });
    await setTicker(lifecycle.pressOne, [lifecycle.pressTwo]);
    await waitForAnnouncement(lifecycle.pressOne.text);
    await setTicker(lifecycle.aegis, [lifecycle.pressOne, lifecycle.pressTwo]);
    await waitForAnnouncement(lifecycle.aegis.text);
    await setTicker(lifecycle.standDown, [lifecycle.pressOne, lifecycle.pressTwo], lifecycle.pressOne);
    await waitForAnnouncement(lifecycle.standDown.text, 1);
    await waitForAnnouncement(lifecycle.standDown.text, 2);
    await waitForAnnouncement(lifecycle.pressOne.text);
    await setTicker(lifecycle.pressOne, [lifecycle.pressTwo]);
    await waitForAnnouncement(lifecycle.pressTwo.text);
    await waitForAnnouncement(lifecycle.pressOne.text);
    const distinctCopies = labels.filter((label) => label?.includes('copy 1 of 2')).length > 0 &&
      labels.filter((label) => label?.includes('copy 2 of 2')).length > 0;
    if (!distinctCopies) throw new Error(`Reduced lifecycle did not announce both distinct copies: ${JSON.stringify(labels)}`);
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify({ labels }, null, 2)}\n`);
    console.log(`Ticker reduced lifecycle browser proof passed: ${artifactPath}`);
  } catch (error) {
    await mkdir(artifactDirectory, { recursive: true });
    await page.screenshot({ path: path.join(artifactDirectory, 'ticker-lifecycle-reduced-failure.png'), fullPage: false });
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function runCase(fontMode, reducedMotion, viewport, scenario = 'press') {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    serviceWorkers: 'block',
  });
  const localOrigin = new URL(appUrl).origin;
  await context.route('**/*', (route) => {
    const requestUrl = route.request().url();
    try {
      const parsedUrl = new URL(requestUrl);
      if (parsedUrl.origin === localOrigin || parsedUrl.protocol === 'data:' || parsedUrl.protocol === 'blob:') {
        return route.continue();
      }
    } catch {
      if (requestUrl.startsWith('data:') || requestUrl.startsWith('blob:')) return route.continue();
    }
    return route.abort();
  });
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url());
    if (url.protocol === 'ws:' && url.host === new URL(appUrl).host) {
      socket.connectToServer();
    } else {
      socket.close();
    }
  });
  await context.addInitScript(({ fixture, transitionFixture, sourceFixtures, fontMode: mode, reduced }) => {
    const transition = sessionStorage.getItem('ticker-smoke-transition');
    const activeFixture = transitionFixture && transition === 'turn-one'
      ? transitionFixture
      : sourceFixtures[transition] ?? fixture;
    localStorage.setItem('dow-new-eden-session', JSON.stringify(activeFixture));
    localStorage.setItem('new-eden-motion-override', reduced ? 'reduce' : 'full');
    localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({
      acknowledgedAt: Date.now(),
      choice: reduced ? 'reduce' : 'full',
    }));
    localStorage.setItem('dow-new-eden-session-waiver', String(Date.now()));
    if (mode !== 'pending') return;
    const fonts = document.fonts;
    let patched = false;
    try {
      Object.defineProperty(fonts, 'status', { configurable: true, value: 'loading' });
      Object.defineProperty(fonts, 'ready', {
        configurable: true,
        value: new Promise(() => undefined),
      });
      patched = true;
    } catch {
      // The assertion below fails closed if a browser does not expose a patchable FontFaceSet.
    }
    window.__tickerSmokeFontPatch = patched;
  }, {
    fixture: scenario === 'turn-zero' ? persistedTurnZeroSession : persistedSession,
    transitionFixture: scenario === 'turn-zero' ? persistedTurnOneSession : null,
    sourceFixtures: scenario === 'press' ? sourceFixtures : {},
    fontMode,
    reduced: reducedMotion,
  });

  const page = await context.newPage();
  await page.setViewportSize(viewport);
  const expectedText = scenario === 'turn-zero' ? TURN_ZERO_ATC_TEXT : PRESS_TEXT;
  const label = `${scenario}/${fontMode}/${reducedMotion ? 'reduced' : 'normal'}/${viewport.width}x${viewport.height}`;
  try {
    await page.goto(`${appUrl}${scenario === 'turn-zero' ? '#/roles' : '#/ships/aegis'}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);
    await assertTicker(page, `${label}/initial`, fontMode, reducedMotion, expectedText);
    await assertTickerGeometry(page, `${label}/initial-geometry`, reducedMotion);
    if (scenario === 'press') {
      await page.evaluate(() => sessionStorage.setItem('ticker-smoke-transition', 'short-press'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(100);
      await assertTicker(page, `${label}/short`, fontMode, reducedMotion, 'SNN // OK');
      await assertTickerGeometry(page, `${label}/short-geometry`, reducedMotion);
      await page.evaluate(() => sessionStorage.removeItem('ticker-smoke-transition'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(100);
      await assertTicker(page, `${label}/initial-after-short`, fontMode, reducedMotion, expectedText);
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await assertTicker(page, `${label}/scrolled`, fontMode, reducedMotion, expectedText);
    await page.evaluate(() => window.scrollTo(0, 0));

    if (scenario === 'turn-zero') {
      await page.evaluate(() => sessionStorage.setItem('ticker-smoke-transition', 'turn-one'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(100);
      await assertTicker(page, `${label}/turn-one`, fontMode, reducedMotion, TURN_ONE_AIRSPACE_TEXT);
      await page.goto(`${appUrl}#/ships/aegis`, { waitUntil: 'domcontentloaded' });
    } else {
      await page.goto(`${appUrl}#/ships/aegis/roles/admiral`, { waitUntil: 'domcontentloaded' });
    }
    await page.waitForTimeout(100);
    await assertTicker(page, `${label}/navigation`, fontMode, reducedMotion,
      scenario === 'turn-zero' ? TURN_ONE_AIRSPACE_TEXT : expectedText);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);
    await assertTicker(page, `${label}/reload`, fontMode, reducedMotion,
      scenario === 'turn-zero' ? TURN_ONE_AIRSPACE_TEXT : expectedText);

    if (scenario === 'press') {
      for (const [transition, text] of [
        ['airspace-open', AIRSPACE_OPEN_TEXT],
        ['red-alert', RED_ALERT_TEXT],
        ['stand-down', STAND_DOWN_TEXT],
        ['press-return', PRESS_TEXT],
        ['stale-airspace', TURN_ONE_AIRSPACE_TEXT],
        ['pending-stream', AWAITING_DISPATCH_TEXT],
        ['empty-stream', AWAITING_DISPATCH_TEXT],
        ['expired-stand-down', AWAITING_DISPATCH_TEXT],
      ]) {
        await page.evaluate((value) => sessionStorage.setItem('ticker-smoke-transition', value), transition);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await assertTicker(page, `${label}/${transition}`, fontMode, reducedMotion, text);
      }
    }
  } catch (error) {
    await mkdir(artifactDirectory, { recursive: true });
    const screenshotPath = path.join(
      artifactDirectory,
      `ticker-${scenario}-${fontMode}-${reducedMotion ? 'reduced' : 'normal'}-${viewport.width}x${viewport.height}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: false });
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nFailure screenshot: ${screenshotPath}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

const { child: vite, output: viteOutput } = startVite();
try {
  await waitForServer(vite, viteOutput);
  if (process.env.TICKER_SMOKE_ONLY_LIFECYCLE !== '1'
    && process.env.TICKER_SMOKE_ONLY_REDUCED_LIFECYCLE !== '1') {
    for (const scenario of ['press', 'turn-zero']) {
      for (const fontMode of ['pending', 'ready']) {
        for (const reducedMotion of [false, true]) {
          const viewports = scenario === 'turn-zero'
            ? [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]
            : [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }];
          for (const viewport of viewports) {
            await runCase(fontMode, reducedMotion, viewport, scenario);
            console.log(`Ticker browser smoke passed: ${scenario}/${fontMode}/${reducedMotion ? 'reduced' : 'normal'}/${viewport.width}x${viewport.height}`);
          }
        }
      }
    }
  }
  if (process.env.TICKER_SMOKE_ONLY_REDUCED_LIFECYCLE !== '1') await runTickerLifecycleCase();
  if (process.env.TICKER_SMOKE_ONLY_LIFECYCLE !== '1'
    || process.env.TICKER_SMOKE_ONLY_REDUCED_LIFECYCLE === '1') {
    await runReducedTickerLifecycleCase();
  }
} finally {
  if (vite.exitCode === null) vite.kill('SIGTERM');
}

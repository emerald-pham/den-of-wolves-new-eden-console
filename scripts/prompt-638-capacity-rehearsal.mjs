#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  collection,
  onSnapshot,
} from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from 'firebase/functions';

const repositoryDirectory = resolve(new URL('..', import.meta.url).pathname);
const firebaseConfigPath = resolve(repositoryDirectory, 'firebase.local.json');
const evidencePath = process.env.P638_EVIDENCE_PATH ?? '/tmp/p638-capacity-rehearsal.json';
const projectId = 'dow-new-eden-console';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function errorCode(error) {
  return typeof error?.code === 'string' ? error.code : 'unknown';
}

function errorMessage(error) {
  return typeof error?.message === 'string' ? error.message : String(error);
}

function redactedError(error) {
  return { code: errorCode(error).replace(/^functions\//, ''), message: errorMessage(error).slice(0, 180) };
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function waitFor(predicate, label, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function emulatorPorts() {
  const config = JSON.parse(readFileSync(firebaseConfigPath, 'utf8'));
  return {
    auth: config.emulators.auth.port,
    functions: config.emulators.functions.port,
    firestore: config.emulators.firestore.port,
    firestoreWebsocket: config.emulators.firestore.websocketPort,
  };
}

async function createContext(label, ports) {
  const app = initializeApp({
    apiKey: 'demo-api-key',
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
    appId: `p638-${label}-${randomUUID()}`,
  }, `p638-${label}-${randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${ports.auth}`, { disableWarnings: true });
  await signInAnonymously(auth);
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, '127.0.0.1', ports.functions);
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', ports.firestore);
  return {
    label,
    app,
    auth,
    functions,
    firestore,
    uid: auth.currentUser?.uid,
  };
}

async function closeContext(context) {
  await deleteApp(context.app).catch(() => undefined);
}

async function call(context, name, data) {
  try {
    const result = await httpsCallable(context.functions, name)(data);
    return result.data;
  } catch (error) {
    const wrapped = new Error(`${name}(${context.label}) failed: ${errorCode(error)}: ${errorMessage(error)}`, { cause: error });
    wrapped.code = errorCode(error);
    throw wrapped;
  }
}

async function expectRejected(operation, label, expectedCodes = []) {
  try {
    await operation();
  } catch (error) {
    const code = errorCode(error).replace(/^functions\//, '');
    if (expectedCodes.length > 0 && !expectedCodes.includes(code)) {
      throw new Error(`${label} rejected with ${code}, expected ${expectedCodes.join(', ')}: ${errorMessage(error)}`);
    }
    return { code, message: errorMessage(error).slice(0, 180) };
  }
  throw new Error(`${label} unexpectedly succeeded.`);
}

function listenToDocument(context, path) {
  const state = { count: 0, lastData: null, error: null, unsubscribe: undefined };
  const target = doc(context.firestore, ...path.split('/'));
  state.unsubscribe = onSnapshot(target, (snapshot) => {
    state.count += 1;
    state.lastData = snapshot.exists() ? snapshot.data() : null;
  }, (error) => { state.error = error; });
  return state;
}

function listenToCollection(context, path) {
  const state = { count: 0, lastData: [], error: null, unsubscribe: undefined };
  const target = collection(context.firestore, ...path.split('/'));
  state.unsubscribe = onSnapshot(target, (snapshot) => {
    state.count += 1;
    state.lastData = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  }, (error) => { state.error = error; });
  return state;
}

function assertListenersHealthy(listeners) {
  for (const listener of listeners) {
    if (listener.error) throw listener.error;
    assert(listener.count > 0, 'A Firestore listener never received its initial snapshot.');
  }
}

async function readDoc(context, path) {
  return getDoc(doc(context.firestore, ...path.split('/')));
}

async function main() {
  const testedSourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryDirectory,
    encoding: 'utf8',
  }).trim();
  const ports = emulatorPorts();
  const contexts = [];
  const listeners = [];
  const evidence = {
    prompt: '638',
    status: 'failed',
    testedSourceCommit,
    projectId,
    emulator: {
      auth: ports.auth,
      functions: ports.functions,
      firestore: ports.firestore,
      firestoreWebsocket: ports.firestoreWebsocket,
      slot: Math.round((ports.firestore - 8080) / 10),
    },
    scenario: {
      corePlayerCount: 20,
      expansion: 'capybara',
      facilitatorCount: 2,
      pressHolderCount: 1,
    },
    results: {},
  };

  try {
    const owner = await createContext('owner', ports);
    contexts.push(owner);
    const created = await call(owner, 'createSession', {
      requestId: `p638-create-${randomUUID()}`,
      name: 'P638 emulator rehearsal',
      displayName: 'P638 facilitator',
      playerCount: 20,
      chartId: 'A',
      expansion: 'capybara',
      turnLimit: 8,
    });
    const createdSession = created.session;
    const sessionId = createdSession.id;
    const joinCode = createdSession.joinCode;
    const activeRoleIds = createdSession.activeRoleIds;
    assert(typeof sessionId === 'string' && sessionId.length > 0, 'createSession returned no session id.');
    assert(typeof joinCode === 'string' && joinCode.length > 0, 'createSession returned no join code.');
    assert(Array.isArray(activeRoleIds) && activeRoleIds.length === 20, 'The session did not return the exact 20-role roster.');
    assert(!activeRoleIds.includes('press-officer'), 'Press leaked into the core role roster.');

    const coreContexts = [];
    let firstJoin;
    for (let index = 0; index < 20; index += 1) {
      const context = await createContext(`core-${index + 1}`, ports);
      contexts.push(context);
      coreContexts.push(context);
      const joined = await call(context, 'joinSession', {
        joinCode,
        displayName: `P638 core ${index + 1}`,
      });
      if (!firstJoin) firstJoin = joined;
    }
    assert(firstJoin?.session?.fleetTicker?.current?.sourceId === 'turn-zero-atc',
      'A fresh join did not receive the server-owned Turn 0 ATC baseline.');
    assert(firstJoin.session.fleetTicker.current.sourceId !== 'turn-zero',
      'A fresh join still exposed the retired legacy Turn 0 source id.');

    const press = await createContext('press', ports);
    contexts.push(press);
    await call(press, 'joinSession', { joinCode, displayName: 'P638 press' });

    const extraGm = await createContext('gm-2', ports);
    contexts.push(extraGm);
    await call(extraGm, 'joinSession', { joinCode, displayName: 'P638 second GM' });

    const extraCore = await createContext('extra-core', ports);
    contexts.push(extraCore);
    await call(extraCore, 'joinSession', { joinCode, displayName: 'P638 ordinary extra' });

    await call(owner, 'elevateToGm', { sessionId, targetUid: owner.uid });
    await call(owner, 'loginGmAccess', { password: 'bananasplit' });
    await call(owner, 'claimGmInstance', {
      sessionId,
      instanceId: 'p638-bridge',
      name: 'P638 Bridge',
      deviceLabel: 'P638 emulator rehearsal',
    });
    await call(owner, 'elevateToGm', { sessionId, targetUid: extraGm.uid });
    await call(extraGm, 'loginGmAccess', { password: 'bananasplit' });
    await call(extraGm, 'claimGmInstance', {
      sessionId,
      instanceId: 'p638-observer',
      name: 'P638 Observer',
      deviceLabel: 'P638 emulator rehearsal',
    });

    const setup = await call(owner, 'confirmSetup', {
      sessionId,
      instanceId: 'p638-bridge',
      requestId: `p638-setup-${randomUUID()}`,
      expectedSetupRevision: 0,
      playerCount: 20,
      chartId: 'A',
      expansion: 'capybara',
      turnLimit: 8,
      dioneEnabled: true,
      capybaraEnabled: true,
      activeRoleIds,
    });
    let setupRevision = setup.setupRevision;

    const gmSeatDenial = await expectRejected(() => call(owner, 'claimSeat', {
      sessionId,
      seatId: activeRoleIds[0],
      requestId: `p638-gm-seat-${randomUUID()}`,
      expectedSetupRevision: setupRevision,
    }), 'GM core seat claim', ['permission-denied']);

    for (let index = 0; index < coreContexts.length; index += 1) {
      const context = coreContexts[index];
      const roleId = activeRoleIds[index];
      const assignment = await call(owner, 'assignRole', {
        sessionId,
        instanceId: 'p638-bridge',
        requestId: `p638-role-${index}-${randomUUID()}`,
        targetUid: context.uid,
        roleId,
      });
      setupRevision = assignment.setupRevision;
      const seat = await call(context, 'claimSeat', {
        sessionId,
        seatId: roleId,
        requestId: `p638-seat-${index}-${randomUUID()}`,
        expectedSetupRevision: setupRevision,
      });
      setupRevision = seat.setupRevision;
    }

    await call(press, 'refreshPresence', {
      sessionId,
      activeConsoleRoleId: 'press-officer',
    });

    const foreign = await createContext('foreign', ports);
    contexts.push(foreign);
    const foreignResumeDenial = await expectRejected(
      () => call(foreign, 'resumeSession', { sessionId }),
      'foreign resume',
      ['permission-denied'],
    );
    const foreignReadDenial = await expectRejected(
      () => readDoc(foreign, `sessions/${sessionId}`),
      'foreign session read',
      ['permission-denied'],
    );

    const sessionPath = `sessions/${sessionId}`;
    const sessionListeners = contexts
      .filter((context) => context !== extraCore && context !== foreign)
      .map((context) => listenToDocument(context, sessionPath));
    listeners.push(...sessionListeners);
    const ownerPlayersListener = listenToCollection(owner, `${sessionPath}/players`);
    const gmInstancesListener = listenToCollection(owner, `${sessionPath}/gmInstances`);
    listeners.push(ownerPlayersListener, gmInstancesListener);
    await waitFor(() => sessionListeners.every((listener) => listener.count > 0), '20 client session listener snapshots');
    await waitFor(() => ownerPlayersListener.count > 0 && gmInstancesListener.count > 0, 'player and GM listener snapshots');
    assertListenersHealthy(listeners);

    const blockedStartRequest = {
      sessionId,
      instanceId: 'p638-bridge',
      requestId: `p638-blocked-extra-${randomUUID()}`,
      expectedSetupRevision: setupRevision,
    };
    const extraCoreStartDenial = await expectRejected(
      () => call(owner, 'startGame', blockedStartRequest),
      'ordinary twenty-first core start',
      ['failed-precondition'],
    );
    await call(extraCore, 'disconnectFromSession', { sessionId });

    const startRequests = [
      {
        sessionId,
        instanceId: 'p638-bridge',
        requestId: `p638-start-owner-${randomUUID()}`,
        expectedSetupRevision: setupRevision,
      },
      {
        sessionId,
        instanceId: 'p638-observer',
        requestId: `p638-start-gm2-${randomUUID()}`,
        expectedSetupRevision: setupRevision,
      },
    ];
    const startResults = await Promise.allSettled([
      call(owner, 'startGame', startRequests[0]),
      call(extraGm, 'startGame', startRequests[1]),
    ]);
    const fulfilledStarts = startResults.filter((result) => result.status === 'fulfilled').map((result) => result.value);
    assert(fulfilledStarts.length === 2, 'The concurrent authorized start did not return two callable results.');
    const committedStart = fulfilledStarts.find((result) => result.status === 'committed');
    const staleStart = fulfilledStarts.find((result) => result.status === 'stale');
    assert(committedStart && staleStart, 'Concurrent authorized GMs did not produce one committed and one stale start.');
    assert(committedStart.currentTurn === 1, 'The committed 20-player start did not enter Turn 1.');
    assert(committedStart.setupReceipt?.playerCount === 20, 'Start receipt did not record playerCount 20.');
    assert(committedStart.setupReceipt?.wolfCount === 2, '20-player start did not record two Wolves.');
    assert(committedStart.setupReceipt?.pressEligibility?.claimed === true,
      'Start receipt did not record the claimed Press holder.');
    assert(committedStart.setupReceipt?.excludedGmCount === 2,
      'Start receipt did not exclude both authorized GM instances.');

    await waitFor(() => sessionListeners.every((listener) => listener.count >= 2), 'start convergence across all client listeners');
    assertListenersHealthy(listeners);
    for (const listener of sessionListeners) {
      const serialized = JSON.stringify(listener.lastData ?? {});
      assert(!serialized.includes('selectedWolfRoleIds'), 'A public session listener exposed selected Wolf roles.');
      assert(!serialized.includes('loyalty-agent'), 'A public session listener exposed a private loyalty payload.');
    }

    const ownerWolfSecret = await readDoc(owner, `${sessionPath}/secrets/wolf-assignment`);
    assert(ownerWolfSecret.exists(), 'The authorized GM could not read the private Wolf assignment.');
    const coreWolfDenial = await expectRejected(
      () => readDoc(coreContexts[0], `${sessionPath}/secrets/wolf-assignment`),
      'core Wolf assignment read',
      ['permission-denied'],
    );
    const coreOtherLoyaltyDenial = await expectRejected(
      () => readDoc(coreContexts[0], `${sessionPath}/secrets/loyalty-${coreContexts[1].uid}`),
      'core foreign loyalty read',
      ['permission-denied'],
    );

    const playerRecords = ownerPlayersListener.lastData;
    const coreRecords = playerRecords.filter((player) => activeRoleIds.includes(player.assignedRoleId) && player.connected === true);
    const pressRecords = playerRecords.filter((player) => player.activeConsoleRoleId === 'press-officer' && player.connected === true);
    assert(coreRecords.length === 20, `Expected 20 connected core records, found ${coreRecords.length}.`);
    assert(pressRecords.length === 1, `Expected one claimed Press record, found ${pressRecords.length}.`);
    assert(playerRecords.filter((player) => player.role === 'gm' && player.connected === true).length === 2,
      'The player listener did not converge on both live GM instances.');
    assert(gmInstancesListener.lastData.length === 2, 'The GM listener did not converge on two instances.');

    const initialScrapCommand = {
      sessionId,
      instanceId: 'p638-bridge',
      shipId: 'capybara',
      resourceId: 'scrap',
      delta: 1,
      expectedRevision: 0,
      requestId: `p638-resource-${randomUUID()}`,
    };
    const committedAction = await call(owner, 'adjustShipResource', initialScrapCommand);
    assert(committedAction.revision === 1, 'The real Capybara resource action did not commit revision 1.');
    const replayedAction = await call(owner, 'adjustShipResource', initialScrapCommand);
    assert(JSON.stringify(replayedAction) === JSON.stringify(committedAction), 'The real resource action replay changed its result.');
    const staleAction = await call(owner, 'adjustShipResource', {
      ...initialScrapCommand,
      requestId: `p638-resource-stale-${randomUUID()}`,
      expectedRevision: 0,
    });
    assert(staleAction.status === 'stale' && staleAction.currentRevision === 1,
      'The real resource action did not return a stale receipt for an old revision.');

    const concurrentActionBase = {
      sessionId,
      shipId: 'capybara',
      resourceId: 'scrap',
      delta: 1,
      expectedRevision: 1,
    };
    const concurrentActions = await Promise.all([
      call(owner, 'adjustShipResource', {
        ...concurrentActionBase,
        instanceId: 'p638-bridge',
        requestId: `p638-concurrent-owner-${randomUUID()}`,
      }),
      call(extraGm, 'adjustShipResource', {
        ...concurrentActionBase,
        instanceId: 'p638-observer',
        requestId: `p638-concurrent-gm2-${randomUUID()}`,
      }),
    ]);
    assert(concurrentActions.filter((result) => result.status === 'stale').length === 1,
      'Concurrent GM actions did not produce exactly one stale receipt.');
    assert(concurrentActions.filter((result) => result.status !== 'stale' && result.revision === 2).length === 1,
      'Concurrent GM actions did not produce exactly one committed revision 2.');
    await waitFor(() => sessionListeners.every((listener) => listener.count >= 3), 'action convergence across all client listeners');

    const tickerBeforeHeartbeat = (await readDoc(owner, sessionPath)).data()?.fleetTicker;
    const heartbeatResults = await Promise.all([
      ...coreContexts.map((context) => call(context, 'refreshPresence', { sessionId })),
      call(owner, 'refreshPresence', { sessionId, instanceId: 'p638-bridge' }),
      call(extraGm, 'refreshPresence', { sessionId, instanceId: 'p638-observer' }),
      call(press, 'refreshPresence', { sessionId, activeConsoleRoleId: 'press-officer' }),
    ]);
    assert(heartbeatResults.length === 23, 'The 20-core, Press, and two-GM heartbeat fanout was incomplete.');
    const tickerAfterHeartbeat = (await readDoc(owner, sessionPath)).data()?.fleetTicker;
    assert(JSON.stringify(tickerAfterHeartbeat) === JSON.stringify(tickerBeforeHeartbeat),
      'A normal heartbeat authored a duplicate Turn 0 ATC bulletin.');

    const reconnectUid = coreContexts[0].uid;
    const reconnectRole = activeRoleIds[0];
    await call(coreContexts[0], 'disconnectFromSession', { sessionId });
    const resumed = await call(coreContexts[0], 'resumeSession', { sessionId });
    assert(resumed.player?.uid === reconnectUid && resumed.player?.assignedRoleId === reconnectRole &&
      resumed.player?.seatId === reconnectRole && resumed.player?.role === 'player',
    'A core player did not retain role and seat across disconnect/resume.');
    await waitFor(() => sessionListeners.every((listener) => listener.count >= 4), 'reconnect convergence across all client listeners');

    const resumedPress = await call(press, 'resumeSession', { sessionId });
    assert(resumedPress.player?.activeConsoleRoleId === 'press-officer', 'Press did not retain its independent role across resume.');
    const finalSession = (await readDoc(owner, sessionPath)).data();
    assert(finalSession.phase === 'active' && finalSession.currentTurn === 1, 'The rehearsal session did not remain in active Turn 1.');
    assert(finalSession.activeRoleIds?.length === 20 && !finalSession.activeRoleIds.includes('press-officer'),
      'The final session core roster was changed by Press occupancy.');
    assert(finalSession.activeVesselIds?.includes('capybara') && !finalSession.activeVesselIds.includes('snn-press-shuttle'),
      'The final core vessel math changed when Press was claimed.');

    evidence.status = 'passed';
    evidence.results = {
      freshJoinTurnZeroSource: 'turn-zero-atc',
      connectedCoreRecords: coreRecords.length,
      connectedPressRecords: pressRecords.length,
      connectedGmRecords: 2,
      activeRoleCount: finalSession.activeRoleIds.length,
      activeVesselIds: finalSession.activeVesselIds,
      wolfCount: committedStart.setupReceipt.wolfCount,
      pressClaimed: committedStart.setupReceipt.pressEligibility.claimed,
      startRace: ['committed', 'stale'],
      resourceAction: { committedRevision: committedAction.revision, staleRevision: staleAction.currentRevision, concurrent: 'one-commit-one-stale' },
      heartbeatCallCount: heartbeatResults.length,
      listenerCount: sessionListeners.length,
      listenerConvergence: '20 session listeners plus player and GM collections',
      reconnect: 'core role/seat and Press role retained',
      privacy: 'GM Wolf read allowed; core Wolf and foreign-loyalty reads denied; public listeners contained no private loyalty/Wolf payload',
      denials: { gmSeatDenial, foreignResumeDenial, foreignReadDenial, extraCoreStartDenial, coreWolfDenial, coreOtherLoyaltyDenial },
      remainingLimits: ['local emulator rehearsal; no production capacity or 60-client claim', 'full Capybara vertical mechanics remain Prompt 584'],
    };
  } catch (error) {
    evidence.error = redactedError(error);
    throw error;
  } finally {
    for (const listener of listeners) listener.unsubscribe?.();
    for (const context of contexts.reverse()) await closeContext(context);
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`P638 evidence: ${evidencePath}`);
    console.log(JSON.stringify(evidence, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});

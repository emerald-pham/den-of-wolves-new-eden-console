import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as privateUi from './pc10-private-actions-ui-proof.mjs';
import * as plans from './pc10-explicit-loyalty-proof-plan.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const SESSION = 'optional-composition-session';
const GROUP = 'fleet-1';
const GM_UID = 'original-optional-gm';
const ROLE = 'executive-officer';
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);

async function loadServerTransfer() {
  // The fixture's UI delivery uses the unchanged server calculation, not a
  // made-up cargo receipt or a preloaded positive sabotage target.
  const load = async (path, dependencies = {}) => {
    const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(name => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected server source dependency ${name}`);
      return dependencies[name];
    }, module, module.exports);
    return module.exports;
  };
  const resources = await load('../functions/src/resources.ts');
  return load('../functions/src/shuttleCargoTransfer.ts', { './resources': resources });
}

async function loadComposition() {
  // Expose the two existing private composition boundaries in this NEW native
  // module only. All their bodies and ordinary readers/capture helpers execute
  // verbatim. No candidate export, browser, Firebase or live store is created.
  const path = new URL('./pc10-explicit-loyalty-demo-proof.mjs', import.meta.url);
  const text = await readFile(path, 'utf8');
  const module = new vm.SourceTextModule(`${text}\nexport { exerciseWolfCycleActions, exerciseActorRecoveryAndRepeat };`, {
    identifier: path.href,
    initializeImportMeta: meta => { meta.url = path.href; },
  });
  await module.link(async name => {
    const namespace = name === './pc10-full-game-demo-ui-proof.mjs'
      ? { runFreshFullGameDemoUi: () => { throw new Error('Native composition never launches the fresh-game factory.'); } }
      : await import(name.startsWith('.') ? new URL(name, path).href : name);
    return new vm.SyntheticModule(Object.keys(namespace), function () {
      for (const key of Object.keys(namespace)) this.setExport(key, namespace[key]);
    });
  });
  await module.evaluate();
  return module.namespace;
}

function locator({ count = 1, enabled = true, click, select, fill, options = [], text = '' } = {}) {
  let value = '';
  return {
    count: async () => count,
    isVisible: async () => count === 1,
    isEnabled: async () => count === 1 && (typeof enabled === 'function' ? enabled() : enabled),
    isDisabled: async () => count !== 1 || !(typeof enabled === 'function' ? enabled() : enabled),
    waitFor: async () => { assert.equal(count, 1, 'Requested native source control must be mounted exactly once.'); },
    click: async () => { assert.equal(count, 1); await click?.(); },
    selectOption: async input => { value = input; await select?.(input); },
    fill: async input => { value = input; await fill?.(input); },
    inputValue: async () => value,
    getAttribute: async name => name === 'href' ? text : null,
    innerText: async () => text,
    allTextContents: async () => text ? [text] : [],
    filter() { return this; },
    and() { return this; },
    locator: () => ({ evaluateAll: async callback => callback(options.map(option => ({
      value: option.value, textContent: option.label ?? option.value, disabled: option.disabled === true,
    }))) }),
    getByRole: () => locator({ text }),
  };
}

async function harness(mode, { selectedRole = ROLE, cargo = {}, stock = 9, airspace = 'restricted',
  patchCrew, patchGm, beforeCargoClick, afterCargoReply, malformedReceipt = false,
  options = [{ value: 'securityTeams', label: 'Security teams' }], loadCount = 1, loadEnabled = true } = {}) {
  const roles = ['admiral', ROLE, 'wing-commander', 'aegis-comms', 'aegis-engineer',
    ...Array.from({ length: 15 }, (_, index) => `remaining-role-${index}`), 'press-officer'];
  const roster = roles.map(roleId => ({ roleId, uidHash: hash(`original-${roleId}`) }));
  const plan = plans.buildExplicitLoyaltyScenarioPlan(roles, mode);
  const byRole = new Map();
  for (const entry of plan) {
    byRole.set(entry.holderRoleId, { kind: entry.kind, partnerRoleId: entry.partnerRoleId });
    if (entry.partnerRoleId) byRole.set(entry.partnerRoleId, { kind: 'friend', partnerRoleId: entry.holderRoleId });
  }
  const server = await loadServerTransfer();
  let selected = selectedRole, path = `#/ships/aegis/roles/${selectedRole}`, documentId = 100,
    generation = 2, hydration = 1, draftResource = '', draftAmount = 1;
  let lastResponse, alert, notice, sabotageUiUsed = false, reloaded = false;
  const waiters = [], events = [], receipts = new Map(), used = new Set();
  const session = {
    id: SESSION, joinCode: 'normal-code', phase: 'active', currentTurn: 1,
    fullGameDemo: { status: 'active', progression: 'manual' },
    turnPhase: { progression: 'manual', airspace: { state: airspace } },
    turnState: { phase: airspace === 'restricted' ? 'team' : 'coordination' },
    activeVesselIds: ['aegis'], activeRoleIds: roles.slice(0, 20),
    shipFleetGroupIds: { aegis: GROUP }, shipResources: { aegis: { securityTeams: stock } },
    shuttleControl: { pallas: { shuttleId: 'pallas', ownerUid: `original-${ROLE}`,
      holderUid: `original-${ROLE}`, ownerRoleId: ROLE, revision: 1 } },
    shuttleDockings: [{ shuttleId: 'pallas', shipId: 'aegis', dockedAt: 'SESSION START' }],
    shuttleCargo: structuredClone(cargo),
  };
  const uid = () => `original-${selected}`;
  const raw = gm => {
    const sessionProjection = { ...structuredClone(session),
      playerDiscovery: { groupId: GROUP },
      memberSessionScope: { groupId: GROUP, vesselIds: ['aegis'], craftIds: selected === ROLE ? ['pallas'] : [] },
      currentActorBerthAuthority: { sessionId: SESSION, actorUid: uid(), groupId: GROUP, role: 'player',
        connectionGeneration: generation, assignedRoleId: selected === 'press-officer' ? null : selected,
        activeConsoleRoleId: selected, replacementRoleId: null, replacementStatus: null, shipId: 'aegis' },
    };
    const value = { session: sessionProjection, connection: 'live', sessionSnapshotFreshness: 'server',
      identityHydrationRevision: hydration, pendingCommands: [],
      gmAccessAuthenticatedAt: gm ? '2026-10-06T10:00:00.000Z' : null,
      me: { uid: gm ? GM_UID : uid(), role: gm ? 'gm' : 'player', sessionId: SESSION, connected: true,
        fleetGroupId: GROUP, assignedRoleId: gm || selected === 'press-officer' ? null : selected,
        activeConsoleRoleId: gm ? null : selected, replacementRoleId: null, replacementStatus: null,
        seatId: gm || selected === 'press-officer' ? null : selected, connectionGeneration: gm ? 1 : generation },
      gmInstance: gm ? { id: 'original-gm-instance', uid: GM_UID, sessionId: SESSION,
        claimedAt: '2026-10-06T10:00:00.000Z' } : null,
      roleBrief: gm ? null : { assignmentUid: uid(), roleId: selected },
      privateLoyalty: gm ? null : { kind: byRole.get(selected)?.kind, suspicion: used.has(selected) ? 2 : 0,
        partnerRoleId: byRole.get(selected)?.partnerRoleId },
    };
    (gm ? patchGm : patchCrew)?.(value);
    return value;
  };
  const emit = (endpoint, requestData, result, status = 200, error) => {
    events.push({ kind: 'ui', endpoint, roleId: selected, requestData: structuredClone(requestData) });
    if (result) receipts.set(JSON.stringify(requestData), structuredClone(result));
    const request = { method: () => 'POST', postDataJSON: () => ({ data: requestData }) };
    const response = { request: () => request,
      url: () => `http://127.0.0.1:5011/demo-native/us-central1/${endpoint}`,
      status: () => status, json: async () => result ? { result } : { error } };
    lastResponse = response;
    for (const waiter of waiters.splice(0)) {
      assert.equal(waiter.predicate(response), true); waiter.resolve(response);
    }
  };
  const requestId = () => `ordinary-request-${events.length}-native`;
  async function wolfAction(endpoint) {
    const requestData = { sessionId: SESSION, requestId: requestId(), expectedCycle: 1 };
    if (used.has(selected)) {
      emit(endpoint, requestData, null, 400, { status: 'FAILED_PRECONDITION',
        message: 'The actor already submitted its action for the current cycle.' });
      return;
    }
    used.add(selected);
    const base = { status: 'committed', sessionId: SESSION, requestId: requestData.requestId,
      cycle: 1, coverRoleId: selected, revision: 1 };
    emit(endpoint, requestData, endpoint === 'submitWolfHomingBeacon'
      ? { ...base, type: 'wolf-homing-beacon', groupId: GROUP, dueCycle: 2,
        arrivalTiming: 'after-cycle-start', coordinate: '4454' }
      : { ...base, type: 'wolf-intelligence', message: 'Training proof // private handler action.', suspicion: 3 });
  }
  const makeSurface = gm => {
    const page = {
      url: () => `http://127.0.0.1:5174/?demoActor=${SESSION}~${gm ? 'gm' : selected}${gm ? '#/gm' : path}`,
      goto: async url => {
        const target = new URL(url);
        selected = target.searchParams.get('demoActor').split('~')[1]; path = target.hash;
        documentId += 1; generation = 2; hydration = 1;
        events.push({ kind: 'navigation', roleId: selected });
      },
      reload: async () => {
        events.push({ kind: 'reload', roleId: selected });
        documentId += 1; generation += 1; hydration += 1; reloaded = true;
      },
      waitForURL: async predicate => assert.equal(predicate(new URL(page.url())), true),
      waitForResponse: predicate => new Promise(resolve => waiters.push({ predicate, resolve })),
      waitForFunction: async () => true,
      evaluate: async (callback, input) => {
        const fixtureImport = async moduleUrl => {
          if (moduleUrl === '/src/store/useSessionStore.ts') return { useSessionStore: { getState: () => raw(gm) } };
          if (moduleUrl === '/src/lib/firebase.ts') return { auth: () => ({ currentUser: { uid: gm ? GM_UID : uid() } }) };
          if (moduleUrl === '/src/lib/demoActorContext.ts') return { activeDemoActorProfile: {
            roleId: gm ? 'gm' : selected, sessionId: SESSION } };
          if (moduleUrl === '/src/lib/firestore.ts') return { db: () => ({}) };
          if (moduleUrl.includes('firebase_firestore.js')) return {
            doc: (_db, path) => path,
            getDoc: async path => {
              if (path.includes('/wolfHackingAlerts/')) throw { code: 'permission-denied' };
              assert.ok(path.includes('/playerHackingNotices/'));
              return { exists: () => true, data: () => notice };
            },
          };
          throw new Error(`Unexpected original browser source import ${moduleUrl}`);
        };
        const body = callback.toString().replace(/\bimport\s*\(/g, 'fixtureImport(');
        const performance = { timeOrigin: gm ? 50 : documentId, getEntriesByType: () => [] };
        const document = { querySelector: () => null, querySelectorAll: () => [] };
        return new Function('fixtureImport', 'crypto', 'performance', 'globalThis', 'document', 'input', `return (${body})(input);`)(
          fixtureImport, webcrypto, performance, { performance }, document, input);
      },
      getByLabel: name => {
        if (name === 'Current actor') return locator({ select: role => {
          selected = role; path = '#/demo-actors'; documentId += 1; generation = 2; hydration = 1;
          events.push({ kind: 'selector', roleId: role });
        } });
        if (name === 'Shuttle cargo target') return locator({ options: selected === ROLE &&
          (session.shuttleCargo?.pallas?.securityTeams ?? 0) > 0
          ? [{ value: 'pallas|securityTeams', label: `Pallas // Security teams (${session.shuttleCargo.pallas.securityTeams})` }] : [] });
        return locator();
      },
      getByRole: (role, { name = '' } = {}) => {
        if (role === 'link') return locator({ click: () => {
          path = name === 'Open Pallas shuttle console' ? '#/shuttles/pallas'
            : name === "Enter this actor's stations" ? '#/console'
            : name === 'Open private brief' ? '#/brief' : name === 'Press Officer' ? '#/press' : path;
          events.push({ kind: 'link', name, roleId: selected });
        } });
        if (role === 'region' && name === 'Shuttle cargo transfer') return cargoPanel;
        if (role === 'button' && name === 'Open Coordination manually') return locator({ click: () => {
          session.turnPhase.airspace.state = 'lifted'; session.turnState.phase = 'coordination';
          events.push({ kind: 'coordination', roleId: 'gm' });
        } });
        if (role === 'button' && name === 'Sabotage selected supply') return locator({
          enabled: () => !sabotageUiUsed || reloaded,
          click: () => {
            const starting = session.shuttleCargo.pallas.securityTeams;
            const requestData = { sessionId: SESSION, requestId: requestId(), expectedCycle: 1,
              shuttleId: 'pallas', resourceId: 'securityTeams' };
            used.add(selected); sabotageUiUsed = true; reloaded = false;
            session.shuttleCargo.pallas.securityTeams = starting - Math.floor(starting / 2);
            alert = { requestId: requestData.requestId };
            emit('submitWolfSupplySabotage', requestData, {
              status: 'committed', type: 'wolf-supply-sabotage', sessionId: SESSION,
              requestId: requestData.requestId, idempotencyKey: requestData.requestId,
              actorUid: uid(), actorRoleId: selected, coverRoleId: selected,
              vesselId: 'pallas', shuttleId: 'pallas', resourceId: 'securityTeams',
              turn: 1, cycle: 1, phase: 'active', revision: 1,
              destroyedAmount: Math.floor(starting / 2), remainingAmount: session.shuttleCargo.pallas.securityTeams, suspicion: 2,
            });
          },
        });
        if (role === 'button' && ['Deploy homing beacon', 'Send private intelligence'].includes(name)) return locator({
          enabled: () => !used.has(selected) || reloaded,
          click: () => wolfAction(name === 'Deploy homing beacon' ? 'submitWolfHomingBeacon' : 'submitWolfIntelligence'),
        });
        return locator();
      },
      locator: selector => {
        if (selector.includes('/shuttles/pallas')) return locator({ text: '#/shuttles/pallas', click: () => {
          path = '#/shuttles/pallas'; events.push({ kind: 'shuttle-route', roleId: selected });
        } });
        if (selector.includes('/roles/')) return locator({ click: () => {
          path = `#/ships/aegis/roles/${selected}`; events.push({ kind: 'station-route', roleId: selected });
        } });
        if (selector === '.role-brief-screen') return { getByRole: () => locator({ click: () => { path = '#/console'; } }) };
        if (selector.includes('Facilitator sabotage alerts')) return {
          getByRole: role => role === 'button' ? locator({ click: () => {
            const requestData = { sessionId: SESSION, instanceId: 'original-gm-instance',
              requestId: requestId(), alertId: alert.requestId, expectedRevision: 1 };
            notice = { type: 'wolf-hacking-overlay-notice', sessionId: SESSION, sequence: 1,
              createdAt: '2026-10-06T10:00:00.000Z' };
            emit('acknowledgeWolfHackingAlert', requestData, { status: 'acknowledged',
              type: 'wolf-hacking-alert-acknowledgement', sessionId: SESSION, alertId: alert.requestId,
              revision: 2, noticeId: 'ordinary-public-notice', noticeSequence: 1 });
          } }) : locator(),
          innerText: async () => 'Supply sabotage destroyed cargo. Clue instruction: handled privately.',
        };
        return { getByRole: () => locator({ text: 'Loaded 2 Security Teams.' }) };
      },
    };
    const surface = {
      page, storeModuleUrl: () => '/src/store/useSessionStore.ts',
      observe: async () => {
        const state = raw(gm), me = state.me, s = state.session;
        return { hasAuth: true, sameActor: me.uid === (gm ? GM_UID : uid()), uidHash: hash(gm ? GM_UID : uid()),
          sessionId: s.id, profileSessionId: s.id, playerRole: me.role, profileRoleId: gm ? 'gm' : selected,
          assignedRoleId: me.assignedRoleId, activeConsoleRoleId: me.activeConsoleRoleId,
          connection: state.connection, freshness: state.sessionSnapshotFreshness,
          documentTimeOrigin: gm ? 50 : documentId, cycle: s.currentTurn, phase: s.phase,
          gmInstanceOwned: !!state.gmInstance && state.gmInstance.uid === GM_UID,
          instanceId: state.gmInstance?.id ?? null, fullGameDemo: s.fullGameDemo,
          phaseProgression: s.turnPhase.progression, airspace: s.turnPhase.airspace.state,
          privateLoyaltyPresent: !!state.privateLoyalty, briefMatchesActor: state.roleBrief?.assignmentUid === me.uid,
          briefRoleId: state.roleBrief?.roleId, pendingCommandCount: state.pendingCommands.length };
      },
      until: async (description, predicate) => {
        const current = await surface.observe();
        assert.equal(predicate(current), true, `Native source wait remains unavailable: ${description}`);
        return current;
      },
      callable: async (endpoint, request) => {
        events.push({ kind: 'sdk-replay', endpoint, roleId: selected, requestData: structuredClone(request) });
        if (endpoint === 'submitWolfHomingBeacon' && !receipts.has(JSON.stringify(request))) return {
          status: 'denied', code: 'functions/failed-precondition' };
        const result = receipts.get(JSON.stringify(request));
        assert.ok(result, 'Replay must use exactly an already captured original request.');
        return { status: 'committed', result: { ...structuredClone(result),
          ...(endpoint === 'transferShuttleCargoCommand' ? { status: 'replayed' } : {}) } };
      },
    };
    return surface;
  };
  const cargoPanel = {
    count: async () => 1, isVisible: async () => true,
    waitFor: async () => undefined,
    getByLabel: name => name === 'Resource' ? locator({ options, select: resource => { draftResource = resource; } })
      : locator({ fill: value => { draftAmount = Number(value); } }),
    getByRole: (role, { name } = {}) => role === 'button' && name === 'Load shuttle'
      ? locator({ count: loadCount, enabled: loadEnabled, click: async () => {
        await beforeCargoClick?.(session);
        const requestData = { sessionId: SESSION, requestId: requestId(), shuttleId: 'pallas',
          resourceId: draftResource, direction: 'load', amount: draftAmount, expectedControlRevision: 1 };
        const calculation = server.transferShuttleCargo({ actorUid: uid(), ...requestData,
          control: session.shuttleControl.pallas, dockings: session.shuttleDockings,
          shipResources: session.shipResources, shuttleCargo: session.shuttleCargo });
        session.shipResources.aegis = calculation.shipInventory;
        session.shuttleCargo.pallas = calculation.shuttleInventory;
        emit('transferShuttleCargoCommand', requestData, { status: 'committed', sessionId: SESSION,
          requestId: requestData.requestId, shuttleId: 'pallas', hostShipId: calculation.hostShipId,
          resourceId: calculation.resourceId, direction: calculation.direction, amount: calculation.amount,
          shipAmount: calculation.shipAmount, shuttleAmount: calculation.shuttleAmount,
          ...(malformedReceipt ? { amount: 1 } : {}) });
        await afterCargoReply?.(session);
      } }) : locator({ text: 'Loaded 2 Security Teams.' }),
  };
  const gm = makeSurface(true), crew = makeSurface(false);
  const initial = { sessionId: SESSION, joinCode: 'normal-code', uidHash: hash(GM_UID) };
  const started = await gm.observe();
  return { mode, gm, crew, initial, started, roster, byRole, events, session,
    lastResponse: () => lastResponse, currentRole: () => selected };
}

test('requested fresh supply recipe composes one actual-source Pallas load before either Wolf slot', async () => {
  const composition = await loadComposition();
  const h = await harness('wolf-cult');
  const directory = await mkdtemp(join(tmpdir(), 'pc10-optional-native-'));
  try {
    const result = await composition.exerciseWolfCycleActions({ ...h, directory, privateActionRecipe: 'supply-sabotage' });
    assert.equal(result.wolfSupplySabotage.status, 'committed', 'Fresh no-cargo source must receive an ordinary served load stage.');
    const load = h.events.filter(event => event.kind === 'ui' && event.endpoint === 'transferShuttleCargoCommand');
    assert.equal(load.length, 1);
    assert.equal(load[0].roleId, ROLE);
    assert.equal(load[0].requestData.amount, 2);
    assert.equal(load[0].requestData.resourceId, 'securityTeams');
    assert.equal(load[0].requestData.direction, 'load');
    assert.equal(load[0].requestData.expectedControlRevision, 1);
    const replay = h.events.filter(event => event.kind === 'sdk-replay' && event.endpoint === 'transferShuttleCargoCommand');
    assert.equal(replay.length, 1);
    assert.deepEqual(replay[0].requestData, load[0].requestData);
    assert.ok(h.events.indexOf(load[0]) < h.events.findIndex(event => event.kind === 'ui' && event.endpoint.startsWith('submitWolf')));
    assert.equal(h.session.shipResources.aegis.securityTeams, 7);
    assert.equal(h.session.shuttleCargo.pallas.securityTeams, 1, 'Unchanged server load2 and floor-half sabotage1 conserve real fixture balances.');
    assert.equal(result.actionsCompletedByDistinctOriginalActors, true);
    assert.equal(result.wolfSupplySabotage.connectionGenerationRevalidatedAfterReconnect, true);
    assert.equal(Object.hasOwn(result.wolfSupplySabotage, 'connectionGenerationStayedStable'), false,
      'A genuine reload accepts its independently verified generation instead of inventing unchanged-generation evidence.');
  } finally { await rm(directory, { recursive: true }); }
});

for (const mode of ['wolf-cult', 'universal-arbour']) test(`${mode} recovery restores actual original Press before its required reload`, async () => {
  const composition = await loadComposition();
  const h = await harness(mode, { selectedRole: mode === 'wolf-cult' ? ROLE : 'wing-commander' });
  const result = await composition.exerciseActorRecoveryAndRepeat(h);
  const reloaded = h.events.find(event => event.kind === 'reload');
  assert.equal(reloaded?.roleId, 'press-officer');
  assert.ok(h.events.findIndex(event => event.kind === 'selector' && event.roleId === 'press-officer') < h.events.indexOf(reloaded));
  assert.equal(h.currentRole(), 'press-officer');
  assert.equal(result.sameRealUidRecoveredAfterReload, true);
  assert.equal(result.repeatedActorSelections, 2);
});

test('ordinary Wolf action composition remains two distinct original actors without a cargo mutation', async () => {
  const composition = await loadComposition();
  const h = await harness('wolf-cult');
  const result = await composition.exerciseWolfCycleActions(h);
  assert.equal(result.wolfBeaconAction, true); assert.equal(result.wolfIntelligenceAction, true);
  assert.equal(result.actionsCompletedByDistinctOriginalActors, true);
  assert.equal(h.events.some(event => event.endpoint === 'transferShuttleCargoCommand'), false);
  assert.equal(h.events.some(event => event.kind === 'coordination'), false);
});

test('the unchanged actual source sabotage flow exposes a new accepted reload generation, not the obsolete summary bit', async () => {
  const composition = await loadComposition();
  const h = await harness('wolf-cult', { cargo: { pallas: { securityTeams: 2 } } });
  const directory = await mkdtemp(join(tmpdir(), 'pc10-optional-native-'));
  try {
    const result = await composition.exerciseWolfCycleActions({ ...h, directory, privateActionRecipe: 'supply-sabotage' });
    assert.equal(result.wolfSupplySabotage.status, 'committed');
    assert.equal(result.wolfSupplySabotage.connectionGenerationRevalidatedAfterReconnect, true);
    assert.equal(Object.hasOwn(result.wolfSupplySabotage, 'connectionGenerationStayedStable'), false);
  } finally { await rm(directory, { recursive: true }); }
});

test('current source server calculation refuses missing stock, impermissible Pallas cargo and capacity overflow', async () => {
  const server = await loadServerTransfer();
  const input = { actorUid: 'original-executive-officer', shuttleId: 'pallas', resourceId: 'securityTeams',
    direction: 'load', amount: 2, expectedControlRevision: 1,
    control: { shuttleId: 'pallas', holderUid: 'original-executive-officer', revision: 1 },
    dockings: [{ shuttleId: 'pallas', shipId: 'aegis' }], shipResources: { aegis: { securityTeams: 1 } }, shuttleCargo: {} };
  assert.throws(() => server.transferShuttleCargo(input), /enough cargo/);
  assert.throws(() => server.transferShuttleCargo({ ...input, resourceId: 'ore' }), /printed cargo/);
  assert.throws(() => server.transferShuttleCargo({ ...input, shipResources: { aegis: { securityTeams: 2 } },
    shuttleCargo: { pallas: { securityTeams: Number.MAX_SAFE_INTEGER } } }), /safely hold/);
});

test('the unchanged public source reader retains strict member audience and current-document checks', async () => {
  assert.equal(typeof privateUi.readWolfActor, 'function');
  const { readActionState } = await import('./pc10-pending-procedure-ui-recipes.mjs');
  const h = await harness('wolf-cult', { patchCrew: state => { state.session.memberSessionScope.craftIds = []; } });
  assert.equal((await readActionState(h.crew, 'pallas')).currentDocumentAuthority, null);
});

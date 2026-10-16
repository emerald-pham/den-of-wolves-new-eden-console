import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, Script, SourceTextModule, SyntheticModule } from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { resolveLiveWolfAttack } from './pc10-live-wolf-attack-ui-proof.mjs';

// Execute the actual Base callback, resolver and choice factory with inert
// transport/store modules. No browser, Auth, engine, clock or RNG is launched.
const callbackUrl = new URL('./pc10-base-combat-deduction-ui-proof.mjs', import.meta.url);
const callbackSource = await readFile(callbackUrl, 'utf8');
async function nativeEngineModule(name) {
  const source = await readFile(new URL(`../functions/src/${name}.ts`, import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
  } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
}
const { nextWolfBoardingStage } = await nativeEngineModule('wolfBoardingProtocol');
const { projectWolfAttackMemberView } = await nativeEngineModule('wolfAttackAudience');
const boundary = new Error('Native resolver boundary; aftermath and gameplay are unqualified.');
const rulingControl = new Error('Native normal pending-ruling control reached; no mutation.');
const nextActor = new Error('Native current pending crew actor reached; no mutation.');

async function mountedBase(adapter, result) {
  const sandbox = createContext({ URL, console, Date });
  const module = new SourceTextModule(callbackSource, { context: sandbox, identifier: callbackUrl.href });
  await module.link(async specifier => {
    let exports;
    if (specifier === './pc10-two-browser-gameplay.mjs') exports = { createTwoBrowserGameplay: () => adapter };
    else if (specifier === 'node:fs/promises') exports = { writeFile: async (_path, contents) => {
      result.report = JSON.parse(contents);
    } };
    else if (specifier === './pc10-live-wolf-attack-ui-proof.mjs') exports = {
      resolveLiveWolfAttack: async (context, options) => {
        result.resolved = await resolveLiveWolfAttack(context, options);
        throw boundary;
      },
    };
    else exports = await import(specifier.startsWith('.') ? new URL(specifier, callbackUrl).href : specifier);
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context: sandbox });
  });
  await module.evaluate();
  return module.namespace;
}

function sourceFixture({ mode = 'base', after = {}, progressAfterReads = 2, neverProgress = false,
  crewDrift = {}, gmDrift = {}, sourceReply = {}, pendingRuling = false, rulingAfter = {},
  initialRuling, commanderTarget, timeoutMs = 1_000, onClosedRead, notYourChoice = false,
  initialCrew = {}, initialGm = {}, gmGenericOmissions = false, gmDriftWhenClosed = {}, briefCommander = false,
  oldAfterObservedProgress = false } = {}) {
  const calls = [], selections = [], sources = [], observations = [], result = {};
  let role = 'executive-officer', closedRead = false, closingReads = 0, changed = false, observedProgress = false;
  const protocol = {
    attackedTargets: [{ target: 'aegis', boardingParties: 4 }],
    relocations: [{ craftId: 'pallas', holderUid: 'native-executive', fuelled: false, host: 'aegis' }],
    relocationChoices: {}, crewActorUidsByTarget: { aegis: ['native-executive'] },
    defenceChoices: { aegis: { actorUid: 'native-executive' } }, supportTargets: [],
    militiaUidByTarget: {}, militiaChoices: {}, rollsLocked: true, diceCounts: { aegis: 1 },
    aegisRerollActorUid: 'native-executive', pallasRerollActorUid: 'native-executive',
    rerollChoices: { aegis: {}, pallas: {} },
    ...(commanderTarget ? { commanderUid: 'native-commander', commanderChoice: { target: commanderTarget } } : {}),
  };
  if (notYourChoice) {
    protocol.attackedTargets = [{ target: 'shepherd', boardingParties: 4 }];
    protocol.defenceChoices = {}; protocol.crewActorUidsByTarget = { shepherd: ['native-engineer'] };
    assert.deepEqual(nextWolfBoardingStage(protocol), { kind: 'defence', actorUids: ['native-engineer'], target: 'shepherd' });
  } else assert.deepEqual(nextWolfBoardingStage(protocol), { kind: 'complete' });
  const commanderUid = 'native-original-commander';
  if (briefCommander) {
    protocol.commanderUid = commanderUid; protocol.commanderChoice = { target: null };
    assert.deepEqual(nextWolfBoardingStage(protocol), { kind: 'complete' });
  }
  const current = {
    type: 'wolf-attack-state', attackId: 'native-original-attack', turn: 1, revision: 27,
    status: 'declared', currentStep: 'boarding', airspaceLocked: true,
    deadlineAt: '2026-10-06T01:20:00.000Z', memberResults: [],
    boardingLockedDefence: [{ target: 'aegis', lockedRolls: [4] }],
    boardingRerollChoices: { aegis: { source: 'aegis', actorUid: 'native-executive', turn: 1, revision: 26 },
      pallas: { source: 'pallas', actorUid: 'native-executive', turn: 1, revision: 27 } },
    decisionSummary: { commander: { status: briefCommander ? 'finished' : 'no-commander',
      actors: briefCommander ? [{ uid: commanderUid }] : [] } },
    ...(briefCommander ? { boardingCommanderChoice: { targetShipId: null, actorUid: commanderUid, turn: 1, revision: 19 } } : {}),
    ...(commanderTarget ? { boardingCommanderChoice: { targetShipId: commanderTarget,
      actorUid: 'native-commander', turn: 1, revision: 19 } } : {}),
    ...initialRuling,
  };
  const final = { ...current, revision: 28, status: 'resolved', currentStep: 'resolved', airspaceLocked: false, ...after };
  const pending = { ...current, revision: 28, boardingCommanderRulingRequiredTarget: commanderTarget, ...rulingAfter };
  const discovery = { groupId: 'fleet-1', shipId: 'aegis', revision: 3, fleetGroupVesselIds: ['aegis', 'shepherd'] };
  const base = { hasAuth: true, sameActor: true, sessionId: 'native-session', phase: 'active', cycle: 1,
    connection: 'live', freshness: 'server', airspace: 'restricted', turnStatePhase: 'team', phaseProgression: 'manual',
    fleetGroupId: 'fleet-1', connectionGeneration: 13, identityHydrationRevision: 1,
    replacementRoleId: null, replacementStatus: null, seatId: 'native-seat',
    discoveryAuthority: discovery, entitledShipId: 'aegis', connected: true };
  const gmBase = { ...base, uidHash: 'native-gm', profileRoleId: null, assignedRoleId: null,
    activeConsoleRoleId: null, playerRole: 'gm', instanceId: 'native-original-instance', gmInstanceOwned: true,
    fleetGroupId: null, seatId: null, connectionGeneration: 0, discoveryAuthority: null, entitledShipId: null };
  const executiveHash = briefCommander ? createHash('sha256').update(commanderUid).digest('hex').slice(0, 16) : 'native-executive';
  const crewBase = () => ({ ...base, uidHash: role === 'executive-officer' ? executiveHash : 'native-engineer',
    profileRoleId: role, assignedRoleId: role, activeConsoleRoleId: role, playerRole: 'player' });
  const observe = isGm => ({ ...(isGm ? { ...gmBase, ...initialGm } : { ...crewBase(), ...initialCrew }),
    ...(closedRead && isGm ? gmDriftWhenClosed : {}),
    ...(changed ? isGm ? gmDrift : crewDrift : {}) });
  async function browserStoreRead(callback, moduleUrl, isGm) {
    assert.equal(moduleUrl, '/native-store');
    const actor = observe(isGm), store = { session: { id: actor.sessionId, playerDiscovery: actor.discoveryAuthority },
      me: { uid: actor.uidHash, ...actor }, identityHydrationRevision: actor.identityHydrationRevision };
    const browser = createContext({});
    const module = new SyntheticModule(['useSessionStore'], function () {
      this.setExport('useSessionStore', { getState: () => store });
    }, { context: browser });
    await module.link(() => {}); await module.evaluate();
    const observed = await new Script(`(${callback.toString()})("/native-store")`, {
      importModuleDynamically: async () => module,
    }).runInContext(browser);
    // page.evaluate serializes the browser result into the Node caller's realm.
    return structuredClone(observed);
  }
  function widget(kind, name, isGm) {
    return {
      count: async () => kind === 'combobox' ? 0 : 1,
      first() { return this; }, all: async () => [], isVisible: async () => true, isEnabled: async () => true,
      innerText: async () => 'Cycle 1 // boarding This ship’s defence choice is not open yet.',
      evaluateAll: async () => [],
      getByRole: (child, options = {}) => widget(child, options.name, isGm),
      fill: async () => { assert.equal(isGm, true); assert.equal(name, 'Facilitator ruling'); throw rulingControl; },
      click: async () => { throw new Error('Native routing must not invent any mutation.'); },
    };
  }
  let documentUrl = 'http://native.invalid/#/roles';
  const surface = isGm => ({ label: isGm ? 'original GM' : 'original crew',
    storeModuleUrl: () => '/native-store', observe: async () => {
      const actor = observe(isGm);
      if (gmGenericOmissions && isGm) {
        for (const key of ['fleetGroupId', 'seatId', 'connectionGeneration', 'identityHydrationRevision',
          'replacementRoleId', 'replacementStatus', 'discoveryAuthority', 'entitledShipId']) delete actor[key];
      }
      return { ...actor, ...(briefCommander && !isGm ? { privateLoyaltyPresent: true, briefMatchesActor: true } : {}) };
    }, until: async (_name, predicate) => {
      const value = observe(isGm); assert.equal(predicate({ ...value, privateLoyaltyPresent: true, briefMatchesActor: true }), true); return value;
    }, page: {
      url: () => documentUrl, goto: async url => { documentUrl = url; },
      getByRole: (kind, options = {}) => widget(kind, options.name, isGm),
      evaluate: (callback, moduleUrl) => browserStoreRead(callback, moduleUrl, isGm),
    } });
  const gm = surface(true), crew = surface(false);
  const denial = { status: 'denied', code: 'functions/failed-precondition',
    message: 'Wolf boarding defence is not currently open. [400]' };
  const callable = isGm => async (endpoint, request) => {
    assert.equal(request.sessionId, 'native-session');
    calls.push({ endpoint, roleId: isGm ? null : role, revision: changed && pendingRuling ? pending.revision : current.revision });
    if (isGm) {
      assert.equal(request.instanceId, gmBase.instanceId);
      if (pendingRuling && changed || initialRuling?.boardingCommanderRulingRequiredTarget &&
          initialRuling.boardingCommanderRuling === undefined) {
        const target = (changed ? pending : current).boardingCommanderRulingRequiredTarget;
        assert.deepEqual(nextWolfBoardingStage({ ...protocol, commanderRulingRequiredTarget: target }),
          { kind: 'commander-ruling', target });
        return { status: 'committed', result: { type: 'wolf-boarding-special-choice-view',
          sessionId: 'native-session', turn: 1, revision: changed ? pending.revision : current.revision,
          choice: { kind: 'commander-ruling', targetShipId: target,
            condition: 'All Commander-led Wolf Boarding Parties were destroyed.' } } };
      }
      return denial;
    }
    if (notYourChoice && role === 'shepherd-engineer') throw nextActor;
    if (endpoint === 'getWolfBoardingDefenceChoice') {
      if (notYourChoice) return { status: 'committed', result: { type: 'wolf-boarding-defence-choice-unavailable',
        sessionId: 'native-session', reason: 'not-your-choice' } };
      throw new Error('Obsolete crew defence read after no-special-choice.');
    }
    assert.equal(endpoint, 'getWolfBoardingSpecialChoice');
    closedRead = !notYourChoice; onClosedRead?.();
    return { status: 'committed', result: { type: 'wolf-boarding-special-choice-unavailable',
      sessionId: 'native-session', reason: notYourChoice ? 'not-your-choice' : 'no-special-choice', ...sourceReply } };
  };
  gm.callable = callable(true); crew.callable = callable(false);
  const roster = [{ roleId: 'executive-officer', uidHash: executiveHash },
    { roleId: 'shepherd-engineer', uidHash: 'native-engineer' }];
  const context = { gm, crew, roster, directory: '/native-no-files', initial: { sessionId: 'native-session', joinCode: 'NATIVE' },
    started: { uidHash: gmBase.uidHash, instanceId: gmBase.instanceId } };
  const adapter = {
    select: async roleId => { selections.push(roleId); if (roleId !== 'gm') role = roleId; return roleId === 'gm' ? gm : crew; },
    state: async () => ({ phase: 'active', cycle: 1, live: true }),
    read: async (roleId, path, options = {}) => {
      assert.equal(roleId, 'gm'); assert.equal(path, 'wolfAttackState/current');
      sources.push({ serverOnly: options.serverOnly === true });
      if (options.serverOnly === true) {
        await options.onSnapshot?.({ status: 'ok', value: current, metadata: { fromCache: false, hasPendingWrites: false } });
        return structuredClone(current);
      }
      if (closedRead && ++closingReads > progressAfterReads && !neverProgress) changed = true;
      const observed = oldAfterObservedProgress && observedProgress ? current : changed ? pendingRuling ? pending : final : current;
      if (changed) observedProgress = true;
      // Both pending and completed public DTOs are produced by the real source
      // projector; a locked declared revision is never called resolved.
      const canonical = changed ? { ...current, revision: 28, status: pendingRuling ? 'declared' : 'resolved',
        currentStep: pendingRuling ? 'boarding' : 'resolved', airspaceLocked: pendingRuling } : current;
      const publicView = projectWolfAttackMemberView({ sessionId: 'native-session', state: canonical,
        serverTime: '2026-10-06T01:10:00.000Z' });
      assert.equal(publicView.status, canonical.status);
      assert.equal(publicView.currentStep, canonical.currentStep);
      return structuredClone(observed);
    },
    record: async (stage, details) => { observations.push({ stage, ...details }); },
  };
  async function run() {
    if (mode === 'default') return resolveLiveWolfAttack(context, { tools: adapter, verifyReplay: false, timeoutMs });
    const module = await mountedBase(adapter, result);
    return module.runBaseCombatAndDeduction(context, { combat: 'current', deduction: false, timeoutMs,
      commanderRuling: 'Explicit native input; this test never commits it.' });
  }
  return { run, calls, selections, sources, observations, result, current, final, pending, denial,
    protocol, setCrewDrift: patch => Object.assign(crewDrift, patch), setGmDrift: patch => Object.assign(gmDrift, patch) };
}

test('actual Base skips an unrequested GM getter and waits after one explicit crew no-special-choice', async () => {
  const f = sourceFixture();
  await assert.rejects(f.run(), error => error === boundary);
  assert.equal(f.result.resolved.revision, 28); assert.equal(f.result.resolved.airspaceLocked, false);
  assert.deepEqual(f.calls, [{ endpoint: 'getWolfBoardingSpecialChoice', roleId: 'executive-officer', revision: 27 }]);
  assert.deepEqual(f.selections, ['executive-officer']);
  assert.equal(f.sources.filter(row => row.serverOnly).length, 0, 'No denied-read recovery or extra choice retry.');
  assert.equal(f.result.report.requests.length, 0);
});

test('default resolver also waits on complete source choices without asking for an obsolete defence or another actor', async () => {
  const f = sourceFixture({ mode: 'default' });
  const result = await f.run();
  assert.equal(result.revision, 28); assert.equal(result.currentStep, 'resolved');
  assert.deepEqual(f.calls.map(row => row.endpoint), ['getWolfBoardingSpecialChoice']);
  assert.deepEqual(f.selections, ['executive-officer']);
  assert.equal(f.observations.filter(row => row.gameplayCredit === true).length, 0);
});

test('a normal current source-requested GM ruling still reaches its actual enabled control', async () => {
  const f = sourceFixture({ commanderTarget: 'aegis', initialRuling: { boardingCommanderRulingRequiredTarget: 'aegis' } });
  await assert.rejects(f.run(), error => error === rulingControl);
  assert.deepEqual(f.calls.map(row => row.roleId), [null]); assert.equal(f.result.resolved, undefined);
});

test('a later explicit engine ruling returns only to ordinary GM choice routing with no resolution credit', async () => {
  const f = sourceFixture({ commanderTarget: 'aegis', pendingRuling: true });
  await assert.rejects(f.run(), error => error === rulingControl);
  assert.deepEqual(f.calls.map(row => [row.roleId, row.revision]), [['executive-officer', 27], [null, 28]]);
  assert.equal(f.result.resolved, undefined); assert.equal(f.result.report.requests.length, 0);
});

test('not-your-choice keeps the actual next admitted crew actor pending instead of declaring all choices closed', async () => {
  const f = sourceFixture({ notYourChoice: true });
  await assert.rejects(f.run(), error => error === nextActor);
  assert.deepEqual(f.calls.map(row => [row.roleId, row.endpoint]), [
    ['executive-officer', 'getWolfBoardingSpecialChoice'], ['executive-officer', 'getWolfBoardingDefenceChoice'],
    ['shepherd-engineer', 'getWolfBoardingSpecialChoice'],
  ]);
  assert.equal(f.result.resolved, undefined);
});

test('a finished admitted Commander brief also stops after its one explicit no-special-choice', async () => {
  const f = sourceFixture({ briefCommander: true });
  await assert.rejects(f.run(), error => error === boundary);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].roleId, 'executive-officer');
  assert.deepEqual(f.selections, ['executive-officer']);
});

test('the generic GM observation may omit member fields when the actual current store supplies them', async () => {
  const f = sourceFixture({ gmGenericOmissions: true });
  await assert.rejects(f.run(), error => error === boundary);
  assert.equal(f.result.resolved.revision, 28); assert.equal(f.calls.length, 1);
});

test('original GM generation is captured before the crew read even when its generic observer omits it', async () => {
  const f = sourceFixture({ gmGenericOmissions: true, gmDriftWhenClosed: { connectionGeneration: 1 } });
  await assert.rejects(f.run(), error => error !== boundary && /generation|Generation/.test(error.message));
  assert.equal(f.result.resolved, undefined); assert.equal(f.calls.length, 1);
});

test('the source wait returns its actually observed final tuple without issuing a second old-choice getter', async () => {
  const f = sourceFixture({ oldAfterObservedProgress: true });
  await assert.rejects(f.run(), error => error === boundary);
  assert.equal(f.result.resolved.revision, 28); assert.equal(f.calls.length, 1);
});

test('an old projection after an explicit pending ruling cannot cause another closed crew getter', async () => {
  const f = sourceFixture({ commanderTarget: 'aegis', pendingRuling: true, oldAfterObservedProgress: true });
  await assert.rejects(f.run(), error => error !== boundary && error !== rulingControl);
  assert.equal(f.result.resolved, undefined); assert.equal(f.calls.length, 1);
});

for (const [name, after] of [
  ['different attack', { attackId: 'foreign-attack' }], ['different session', { sessionId: 'foreign-session' }],
  ['different cycle', { turn: 2 }], ['unchanged resolved revision', { revision: 27 }],
  ['missing revision', { revision: undefined }], ['stale revision', { revision: 26 }],
  ['declared without a new actual ruling', { status: 'declared', currentStep: 'boarding', airspaceLocked: true }],
  ['unresolved current step', { currentStep: 'boarding' }], ['still locked', { airspaceLocked: true }],
  ['missing unlock', { airspaceLocked: undefined }],
]) test(`explicit no-special-choice never accepts ${name}`, async () => {
  const f = sourceFixture({ after });
  await assert.rejects(f.run(), error => error !== boundary && error !== rulingControl);
  assert.equal(f.result.resolved, undefined); assert.equal(f.calls.filter(row => row.roleId === null).length, 0);
  assert.equal(f.calls.filter(row => row.roleId !== null).length, 1);
});

for (const [name, patch] of [
  ['Auth', { hasAuth: false }], ['UID', { uidHash: 'foreign' }], ['profile', { profileRoleId: 'admiral' }],
  ['session', { sessionId: 'foreign' }], ['primary role', { assignedRoleId: 'admiral' }],
  ['held console', { activeConsoleRoleId: 'admiral' }], ['group', { fleetGroupId: 'fleet-2' }],
  ['seat', { seatId: 'foreign' }], ['generation', { connectionGeneration: 14 }],
  ['hydration', { identityHydrationRevision: 2 }], ['replacement', { replacementStatus: 'active' }],
  ['replacement role', { replacementRoleId: 'wolf-commander' }], ['phase', { phase: 'debrief' }],
  ['cycle', { cycle: 2 }], ['progression', { phaseProgression: 'automatic' }],
  ['unproved airspace', { airspace: 'unknown' }], ['unproved phase window', { turnStatePhase: 'admiral' }],
  ['discovery', { discoveryAuthority: { groupId: 'fleet-2', shipId: 'aegis', revision: 4, fleetGroupVesselIds: ['aegis'] } }],
]) test(`inactive source wait keeps the original crew ${name}`, async () => {
  const f = sourceFixture({ crewDrift: patch });
  await assert.rejects(f.run(), error => error !== boundary && error !== rulingControl);
  assert.equal(f.result.resolved, undefined); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].roleId, 'executive-officer');
});

for (const [name, patch] of [
  ['UID', { uidHash: 'foreign' }], ['instance', { instanceId: 'foreign-instance' }],
  ['ownership', { gmInstanceOwned: false }], ['generation', { connectionGeneration: 1 }],
  ['hydration', { identityHydrationRevision: 2 }], ['role', { playerRole: 'player' }],
  ['group', { fleetGroupId: 'fleet-2' }], ['seat', { seatId: 'foreign' }],
]) test(`inactive source wait keeps the original GM ${name}`, async () => {
  const f = sourceFixture({ gmDrift: patch });
  await assert.rejects(f.run(), error => error !== boundary && error !== rulingControl);
  assert.equal(f.result.resolved, undefined); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].roleId, 'executive-officer');
});

test('same manual-cycle forward restoration for both original actors is paired with actual resolved/unlocked source', async () => {
  const f = sourceFixture({ crewDrift: { airspace: 'lifted', turnStatePhase: 'coordination' },
    gmDrift: { airspace: 'lifted', turnStatePhase: 'coordination' } });
  await assert.rejects(f.run(), error => error === boundary);
  assert.equal(f.result.resolved.revision, 28); assert.equal(f.calls.length, 1);
});

for (const [name, patch] of [
  ['absent ruling', { boardingCommanderRulingRequiredTarget: undefined }],
  ['empty ruling', { boardingCommanderRulingRequiredTarget: '' }],
  ['null ruling', { boardingCommanderRulingRequiredTarget: null }],
  ['wrong selected target', { boardingCommanderRulingRequiredTarget: 'shepherd' }],
  ['already committed ruling', { boardingCommanderRuling: { targetShipId: 'aegis', text: 'Already committed' } }],
  ['unlocked pending ruling', { airspaceLocked: false }], ['different attack', { attackId: 'foreign' }],
  ['different cycle', { turn: 2 }], ['unchanged ruling revision', { revision: 27 }],
]) test(`normal ruling continuation rejects ${name}`, async () => {
  const f = sourceFixture({ commanderTarget: 'aegis', pendingRuling: true, rulingAfter: patch });
  await assert.rejects(f.run(), error => error !== boundary && error !== rulingControl);
  assert.equal(f.result.resolved, undefined); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].roleId, 'executive-officer');
});

test('a committed source ruling is never selected again', async () => {
  const f = sourceFixture({ commanderTarget: 'aegis', initialRuling: { boardingCommanderRulingRequiredTarget: 'aegis',
    boardingCommanderRuling: { targetShipId: 'aegis', text: 'Original committed ruling' } } });
  await assert.rejects(f.run(), error => error === boundary);
  assert.equal(f.calls.filter(row => row.roleId === null).length, 0); assert.equal(f.calls.length, 1);
});

test('no-special-choice closure keeps the original deadline and issues no repeated getter while source remains declared', async () => {
  const f = sourceFixture({ neverProgress: true, timeoutMs: 80 });
  await assert.rejects(f.run(), /deadline|source progress|did not commit|finalize/i);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].roleId, 'executive-officer');
  assert.equal(f.result.resolved, undefined);
});

test('foreign no-special-choice session cannot enter inactive source waiting', async () => {
  const f = sourceFixture({ sourceReply: { sessionId: 'foreign' } });
  await assert.rejects(f.run(), /sessionId/); assert.equal(f.result.resolved, undefined);
});

for (const [name, options] of [
  ['crew generation', { initialCrew: { connectionGeneration: undefined } }],
  ['crew hydration', { initialCrew: { identityHydrationRevision: undefined } }],
  ['GM generation', { initialGm: { connectionGeneration: undefined } }],
  ['GM hydration', { initialGm: { identityHydrationRevision: undefined } }],
]) test(`inactive source waiting requires actual ${name} evidence`, async () => {
  const f = sourceFixture(options);
  await assert.rejects(f.run(), error => error !== boundary && error !== rulingControl);
  assert.equal(f.result.resolved, undefined); assert.equal(f.calls[0].roleId, 'executive-officer');
});

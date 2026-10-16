import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// NEW proof-contract Source only. Root must explicitly release the Native
// allowance before this file is parsed or run. These finite fixtures contain
// synthetic identities, no browser, Firebase client, network, SDK or gameplay.
// Run serially in one process with --experimental-vm-modules; do not use
// node --test file workers. A missing module/VM bootstrap is not qualified RED.
const callbackUrl = new URL('./pc10-two-live-gm-responsibility-proof.mjs', import.meta.url);
const callbackSource = await readFile(callbackUrl, 'utf8');
const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const fixtureIds = Object.freeze({
  session: 'native-proof-session', gm: 'native-original-gm',
  controller: 'native-admitted-controller', admiral: 'native-original-admiral',
  executive: 'native-original-executive', press: 'native-original-press',
  foreign: 'native-foreign-press',
});
const panelSelector = '[aria-label="Explicit loyalty setup"]';
const selectSelector = 'select[aria-label="Loyalty holder"]';
const pressLabel = 'Press Officer — Original Press alias';

// Expose only existing private proof functions in memory. The file on disk
// stays whole-byte unchanged until a qualified OLD-callback RED is recorded.
const proofContext = vm.createContext({ Buffer });
const proofModule = new vm.SourceTextModule(callbackSource +
  '\nexport { readOriginalCasting, same, livePrestartGm, sameGmLease, safeHeldFailureObservations };\n', {
  context: proofContext, identifier: callbackUrl.href,
  initializeImportMeta(meta) { meta.url = callbackUrl.href; },
});
const allowedBuiltins = new Set([
  'node:assert/strict', 'node:crypto', 'node:fs/promises',
  'node:child_process', 'node:path', 'node:url',
]);
await proofModule.link(async specifier => {
  assert.ok(allowedBuiltins.has(specifier), 'Only the existing finite Node imports are linked.');
  const namespace = specifier === 'node:child_process'
    ? { execFileSync() { throw new Error('Native proof fixtures cannot launch a process.'); } }
    : await import(specifier);
  const entries = Object.entries(namespace);
  return new vm.SyntheticModule(entries.map(([key]) => key), function () {
    for (const [key, value] of entries) this.setExport(key, value);
  }, { context: proofContext, identifier: specifier });
});
await proofModule.evaluate();
const { readOriginalCasting, same, livePrestartGm, sameGmLease,
  assertTwoLiveGmResponsibilityMove, safeHeldFailureObservations } = proofModule.namespace;

function existingGuardBlock(startGuard, endMarker, parameters) {
  const start = callbackSource.indexOf("      failure.guard = '" + startGuard + "';");
  assert.ok(start >= 0, 'The existing exact public guard must exist: ' + startGuard);
  const end = callbackSource.indexOf(endMarker, start);
  assert.ok(end > start, 'The unchanged Source block boundary must exist: ' + startGuard);
  const source = callbackSource.slice(start, end);
  const context = vm.createContext({ assert, same });
  return new vm.Script('(function(' + parameters.join(',') + ') {\n' + source + '\n})',
    { filename: 'existing-proof-guard-' + startGuard }).runInContext(context);
}
const originalRosterGuard = existingGuardBlock(
  'original-controller.original-consent-whole-roster-and-distinct-uids',
  "      failure.guard = 'original-casting.same-existing-source-observation';",
  ['failure', 'beforeRoster', 'context', 'controller', 'originalA']);
const restoredRosterGuard = existingGuardBlock(
  'restored-controller.exact-original-consent-and-whole-roster',
  '      const crewPanel =',
  ['failure', 'beforeRoster', 'afterRoster']);
const restoredCastingGuard = existingGuardBlock(
  'restored-casting.exact-original-core-and-press-casting',
  "      // App's existing",
  ['failure', 'beforeCasting', 'afterCasting']);
const controllerPayloadGuard = existingGuardBlock(
  'original-controller.private-payload-count-zero',
  "      failure.guard = 'original-controller.no-cached-gm-access-and-no-pending-command';",
  ['failure', 'controller']);

function option(value, textContent, extra = {}) {
  return { value, textContent, disabled: false, isConnected: true, ...extra };
}
function fixture({ adversarialPrivatePointer = false } = {}) {
  const session = {
    id: fixtureIds.session, currentTurn: 0, phase: 'casting',
    setupConfirmed: true, configurationLocked: false,
    fullGameDemo: { status: 'preparing', progression: 'manual' },
    activeRoleIds: ['admiral', 'executive-officer'], activeVesselIds: ['aegis'],
    pressEnabled: true, pressClaimed: true,
  };
  // This unsupported field is used ONLY in explicit adversarial cases. It
  // makes the OLD observer accept an invalid projection instead of allowing
  // its usual absent-private-field rejection to hide the missing new guard.
  if (adversarialPrivatePointer) session.pressHolderUid = fixtureIds.press;
  const state = {
    session, connection: 'live', sessionSnapshotFreshness: 'server',
    me: { uid: fixtureIds.gm },
    seats: [
      { id: 'admiral', status: 'claimed', holderUid: fixtureIds.admiral,
        claimedAt: '2026-10-07T01:00:00.000Z' },
      { id: 'executive-officer', status: 'claimed', holderUid: fixtureIds.executive,
        claimedAt: '2026-10-07T01:01:00.000Z' },
    ],
  };
  const roster = [
    { roleId: 'admiral', uidHash: digest(fixtureIds.admiral), displayName: 'Original admiral' },
    { roleId: 'executive-officer', uidHash: digest(fixtureIds.executive), displayName: 'Original executive' },
    { roleId: 'press-officer', uidHash: digest(fixtureIds.press), displayName: 'Original Press alias' },
  ];
  const select = {
    disabled: false, isConnected: true, value: '',
    options: [option('', 'Choose a current holder'),
      option(fixtureIds.admiral, 'Admiral — Original admiral'),
      option(fixtureIds.executive, 'Executive Officer — Original executive'),
      option(fixtureIds.press, pressLabel)],
  };
  const panel = {
    isConnected: true,
    querySelectorAll(selector) {
      assert.equal(selector, selectSelector, 'Only the existing holder select is observed.');
      counts.holderControlQueries += 1;
      return controls;
    },
  };
  const panels = [panel], controls = [select];
  const counts = { evaluate: 0, storeReads: 0, authReads: 0, panelQueries: 0,
    holderControlQueries: 0, roleQueries: 0, actions: 0, sdkCalls: 0,
    launchedProcesses: 0, selections: 0, timers: 0 };
  const releaseRows = Object.fromEntries(roster.filter(row => row.roleId !== 'press-officer')
    .map(row => ['Release role from ' + row.displayName, { count: 1, visible: true, enabled: true }]));
  let secondState = null;
  const authValue = { currentUser: { uid: fixtureIds.gm } };
  const evaluateContext = vm.createContext({
    crypto: webcrypto, Uint8Array, TextEncoder,
    document: {
      querySelectorAll(selector) {
        assert.equal(selector, panelSelector, 'Only the Source-defined normal panel is observed.');
        counts.panelQueries += 1;
        return panels;
      },
    },
  });
  const storeModule = new vm.SyntheticModule(['useSessionStore'], function () {
    this.setExport('useSessionStore', { getState() {
      counts.storeReads += 1;
      return counts.storeReads % 2 === 0 && secondState ? secondState : state;
    } });
  }, { context: evaluateContext, identifier: '/native/store.ts' });
  const authModule = new vm.SyntheticModule(['auth'], function () {
    this.setExport('auth', () => { counts.authReads += 1; return authValue; });
  }, { context: evaluateContext, identifier: '/src/lib/firebase.ts' });
  const ready = Promise.all([storeModule, authModule].map(async module => {
    await module.link(() => { throw new Error('Finite synthetic modules have no dependencies.'); });
    await module.evaluate();
  }));
  const gm = {
    storeModuleUrl: () => '/native/store.ts',
    page: {
      async evaluate(callback, input) {
        counts.evaluate += 1;
        await ready;
        const script = new vm.Script('(' + callback.toString() + ')', {
          filename: 'existing-read-original-casting-evaluate',
          importModuleDynamically(specifier) {
            if (specifier === '/native/store.ts') return storeModule;
            if (specifier === '/src/lib/firebase.ts') return authModule;
            throw new Error('No extra evaluation import is permitted: ' + specifier);
          },
        });
        // Model the existing evaluation transport returning a value snapshot;
        // subsequent fixture changes must not mutate an earlier observation.
        return structuredClone(await script.runInContext(evaluateContext)(input));
      },
      getByRole(role, configuration) {
        counts.roleQueries += 1;
        assert.equal(role, 'region');
        assert.equal(configuration.name, 'Facilitator casting');
        assert.equal(configuration.exact, true);
        return { getByRole(childRole, childConfiguration) {
          assert.equal(childRole, 'button'); assert.equal(childConfiguration.exact, true);
          const row = releaseRows[childConfiguration.name];
          assert.ok(row, 'Only original rendered core release controls are inspected.');
          return {
            count: async () => row.count, isVisible: async () => row.visible,
            isEnabled: async () => row.enabled,
          };
        } };
      },
    },
  };
  return { state, roster, panels, controls, select, counts, releaseRows, authValue,
    setSecondState(value) { secondState = value; },
    context: { gm, confirmed: { activeRoleIds: ['admiral', 'executive-officer'] },
      roster, initial: { uidHash: digest(fixtureIds.gm), sessionId: fixtureIds.session } },
    failure: { guard: 'original-casting.same-existing-source-observation', held: {} },
  };
}
async function read(value) {
  return readOriginalCasting(value.context, value.failure);
}
async function rejectCasting(value, guard = /^original-casting\./) {
  await assert.rejects(() => read(value), error => {
    assert.equal(error.name, 'AssertionError', 'A proof assertion, not a harness/import error, must reject.');
    assert.match(value.failure.guard, guard);
    assert.ok(value.failure.held.casting, 'Failure retains the one already-held casting observation.');
    return true;
  });
  assert.equal(value.counts.evaluate, 1);
  assert.equal(value.counts.storeReads, 2);
}
function publicOnly(value) {
  assert.equal(Object.hasOwn(value.state.session, 'pressHolderUid'), false);
}
function gmActor(uidHash, instanceId, profileRoleId = null) {
  return { sessionId: fixtureIds.session, uidHash, instanceId,
    claimedAt: '2026-10-07T01:00:00.000Z', profileRoleId,
    hasAuth: true, sameActor: true, playerRole: 'gm', gmInstanceOwned: true,
    connection: 'live', freshness: 'server', phase: 'casting', cycle: 0,
    generation: 1, hydrationRevision: 1, privateAudienceMatches: true,
    foreignPendingCount: 0, pendingCount: 0, seatId: null,
    assignedRoleId: null, activeConsoleRoleId: null };
}
function moveInput() {
  const originalA = gmActor(digest(fixtureIds.gm), 'native-original-A-instance');
  const originalB = gmActor(digest(fixtureIds.controller), 'native-temporary-B-instance', 'controller');
  const before = { ...originalA, setupRevision: 40 };
  const data = { sessionId: fixtureIds.session, instanceId: originalA.instanceId,
    requestId: 'native-original-share', expectedSetupRevision: 40, responsibility: 'assistant',
    mode: 'share', targetInstanceId: originalB.instanceId };
  return { step: 0, originalA, originalB, expectedRevision: 40,
    capture: { before, data, httpStatus: 200,
      result: { status: 'committed', requestId: data.requestId, setupRevision: 41,
        responsibilities: ['main', 'assistant'],
        coverage: { main: [originalA.instanceId], assistant: [originalA.instanceId, originalB.instanceId] } } } };
}
function consentFixture(value) {
  const beforeRoster = { consentAcknowledged: true, consentAt: 'native-original-consent',
    roster: value.roster.map(({ roleId, uidHash }) => ({ roleId, uidHash })) };
  return { beforeRoster, controller: { uidHash: digest(fixtureIds.controller) },
    originalA: { uidHash: digest(fixtureIds.gm) } };
}

test('the test bridge exposes the existing OLD observer without a missing-import RED', () => {
  assert.equal(typeof readOriginalCasting, 'function');
  assert.equal(typeof assertTwoLiveGmResponsibilityMove, 'function');
  assert.equal(typeof sameGmLease, 'function');
  assert.ok(fileURLToPath(callbackUrl).endsWith('/scripts/pc10-two-live-gm-responsibility-proof.mjs'));
  // The external receipt binds the untouched mirror's original whole hash.
  // A future repair does not obtain RED credit from a missing private export.
});

test('a public-only session accepts the exact original UID from one enabled mounted Press option', async () => {
  const value = fixture(); publicOnly(value);
  const current = await read(value);
  assert.equal(current.pressHolderUidHash, digest(fixtureIds.press));
  assert.equal(value.counts.evaluate, 1); assert.equal(value.counts.storeReads, 2);
  assert.equal(value.counts.panelQueries, 1); assert.equal(value.counts.holderControlQueries, 1);
  assert.equal(value.counts.actions + value.counts.sdkCalls + value.counts.launchedProcesses +
    value.counts.selections + value.counts.timers, 0);
  const persisted = JSON.stringify(current);
  for (const identity of [fixtureIds.gm, fixtureIds.press, fixtureIds.admiral, fixtureIds.executive]) {
    assert.equal(persisted.includes(identity), false, 'No raw actor UID is exported.');
  }
  assert.equal(persisted.includes(pressLabel), false, 'No option text or configuration suffix is exported.');
});

test('a configured original Press option still binds its UID without exporting its suffix', async () => {
  const value = fixture(); publicOnly(value);
  value.select.options[3].textContent += ' // configured';
  const current = await read(value);
  assert.equal(current.pressHolderUidHash, digest(fixtureIds.press));
  assert.equal(JSON.stringify(current).includes('configured'), false);
});

test('the private Session UID cannot replace a missing public occupancy field', async () => {
  const value = fixture({ adversarialPrivatePointer: true });
  delete value.state.session.pressClaimed;
  await rejectCasting(value);
});

for (const [name, occupancy] of [
  ['null', null], ['string', 'true'], ['number', 1], ['object', {}],
  ['array', []], ['false', false], ['undefined own property', undefined],
]) {
  test('public Press occupancy rejects ' + name + ' despite an adversarial private pointer', async () => {
    const value = fixture({ adversarialPrivatePointer: true });
    value.state.session.pressClaimed = occupancy;
    await rejectCasting(value);
  });
}
test('inherited public occupancy cannot supply the required own boolean field', async () => {
  const value = fixture({ adversarialPrivatePointer: true });
  delete value.state.session.pressClaimed;
  Object.setPrototypeOf(value.state.session, { pressClaimed: true });
  await rejectCasting(value);
});

for (const [name, mutate] of [
  ['absent panel', value => { value.panels.length = 0; }],
  ['duplicate panels', value => { value.panels.push(value.panels[0]); }],
  ['detached panel', value => { value.panels[0].isConnected = false; }],
  ['absent select', value => { value.controls.length = 0; }],
  ['duplicate selects', value => { value.controls.push(value.controls[0]); }],
  ['disabled select', value => { value.select.disabled = true; }],
  ['detached select', value => { value.select.isConnected = false; }],
  ['absent Press option', value => { value.select.options.pop(); }],
  ['duplicate Press options', value => { value.select.options.push({ ...value.select.options[3] }); }],
  ['disabled Press option', value => { value.select.options[3].disabled = true; }],
  ['detached Press option', value => { value.select.options[3].isConnected = false; }],
]) {
  test('the exact enabled current holder control rejects ' + name, async () => {
    const value = fixture({ adversarialPrivatePointer: true });
    mutate(value); await rejectCasting(value);
  });
}
for (const [name, uid] of [
  ['empty', ''], ['whitespace', '  '], ['slash', 'foreign/uid'],
  ['nonstring', 12], ['too long', 'x'.repeat(129)],
]) {
  test('a Press option with ' + name + ' UID cannot establish current identity', async () => {
    const value = fixture({ adversarialPrivatePointer: true });
    value.select.options[3].value = uid; await rejectCasting(value);
  });
}
test('a foreign enabled Press UID with the same alias cannot replace the original actor', async () => {
  const value = fixture({ adversarialPrivatePointer: true });
  value.select.options[3].value = fixtureIds.foreign;
  await rejectCasting(value, /^original-casting\.original-press-holder$/);
});
for (const label of [
  'Admiral — Press Officer — Original Press alias',
  'Original Press alias // Press Officer — ',
  'Press Officer—Original Press alias',
  'press officer — Original Press alias',
  'Press Officer Assistant — Original Press alias',
]) {
  test('an unrelated or spoofed role label cannot create a Press option: ' + label, async () => {
    const value = fixture({ adversarialPrivatePointer: true });
    value.select.options[3].textContent = label; await rejectCasting(value);
  });
}
test('a foreign core-role option named like Press cannot win a broad text search', async () => {
  const value = fixture({ adversarialPrivatePointer: true });
  value.select.options[1].textContent = 'Admiral — Press Officer — Original Press alias';
  value.select.options[3].value = fixtureIds.foreign;
  await rejectCasting(value, /^original-casting\.original-press-holder$/);
});

for (const [name, mutate] of [
  ['absent original Press row', value => { value.roster.pop(); }],
  ['duplicate original Press rows', value => { value.roster.push({ ...value.roster[2] }); }],
  ['foreign original Press UID hash', value => { value.roster[2].uidHash = digest(fixtureIds.foreign); }],
]) {
  test('original Press roster identity still rejects ' + name, async () => {
    const value = fixture({ adversarialPrivatePointer: true });
    mutate(value); await rejectCasting(value, /^original-casting\.original-press-holder$/);
  });
}
for (const [name, mutate] of [
  ['offline connection', value => { value.state.connection = 'offline'; }],
  ['cached snapshot', value => { value.state.sessionSnapshotFreshness = 'cache'; }],
  ['foreign GM auth', value => { value.authValue.currentUser.uid = fixtureIds.foreign; value.state.me.uid = fixtureIds.foreign; }],
  ['foreign session', value => { value.state.session.id = 'native-foreign-session'; }],
  ['nonzero cycle', value => { value.state.session.currentTurn = 1; }],
  ['active phase', value => { value.state.session.phase = 'active'; }],
  ['unconfirmed setup', value => { value.state.session.setupConfirmed = false; }],
  ['locked setup', value => { value.state.session.configurationLocked = true; }],
  ['nonpreparing demo', value => { value.state.session.fullGameDemo.status = 'started'; }],
  ['automatic progression', value => { value.state.session.fullGameDemo.progression = 'automatic'; }],
  ['extra demo key', value => { value.state.session.fullGameDemo.extra = true; }],
  ['changed active core roles', value => { value.state.session.activeRoleIds.reverse(); }],
]) {
  test('the original GM/session/casting Source guard retains ' + name + ' rejection', async () => {
    const value = fixture({ adversarialPrivatePointer: true });
    mutate(value);
    await rejectCasting(value, /^original-casting\.fresh-confirmed-unlocked-preparing-manual-source$/);
  });
}
test('GM identity must still match the second original store read', async () => {
  const value = fixture({ adversarialPrivatePointer: true });
  value.setSecondState({ ...value.state, me: { uid: fixtureIds.foreign } });
  await assert.rejects(() => read(value), /Auth identity changed during casting observation/);
  assert.equal(value.counts.evaluate, 1); assert.equal(value.counts.storeReads, 2);
});
for (const [name, mutate] of [
  ['missing core seat', value => { value.state.seats.shift(); }],
  ['unclaimed core seat', value => { value.state.seats[0].status = 'open'; }],
  ['foreign core holder', value => { value.state.seats[0].holderUid = fixtureIds.foreign; }],
  ['foreign core roster hash', value => { value.roster[0].uidHash = digest(fixtureIds.foreign); }],
]) {
  test('canonical original core casting retains ' + name + ' rejection', async () => {
    const value = fixture({ adversarialPrivatePointer: true });
    mutate(value);
    await rejectCasting(value, /^original-casting\.canonical-seat-and-original-holder$/);
  });
}
for (const [name, property, changed] of [
  ['missing', 'count', 0], ['duplicate', 'count', 2],
  ['hidden', 'visible', false], ['disabled', 'enabled', false],
]) {
  test('the original rendered core release control rejects ' + name, async () => {
    const value = fixture({ adversarialPrivatePointer: true });
    value.releaseRows['Release role from Original admiral'][property] = changed;
    await rejectCasting(value, /^original-casting\.rendered-original-cast-release-control$/);
  });
}

test('unchanged before/after casting passes the exact existing restoration assertion', async () => {
  const value = fixture(); publicOnly(value);
  const before = await read(value), after = await read(value), failure = {};
  assert.doesNotThrow(() => restoredCastingGuard(failure, before, after));
  assert.equal(failure.guard, 'restored-casting.exact-original-core-and-press-casting');
  assert.equal(value.counts.evaluate, 2); assert.equal(value.counts.storeReads, 4);
});
for (const [name, mutate] of [
  ['changed core claim timestamp', value => { value.state.seats[0].claimedAt = '2026-10-07T01:02:00.000Z'; }],
  ['changed active vessel roster', value => { value.state.session.activeVesselIds = ['aegis', 'native-extra-vessel']; }],
]) {
  test('the exact existing before/after restoration assertion rejects ' + name, async () => {
    const value = fixture();
    const before = await read(value); mutate(value);
    const after = await read(value), failure = {};
    assert.throws(() => restoredCastingGuard(failure, before, after), /original core\/Press casting Source changed/);
    assert.equal(failure.guard, 'restored-casting.exact-original-core-and-press-casting');
  });
}
test('a different Press actor after the temporary GM flow cannot pass original identity', async () => {
  const value = fixture();
  await read(value);
  value.select.options[3].value = fixtureIds.foreign;
  const evaluateCountBefore = value.counts.evaluate;
  await assert.rejects(() => read(value), /original Press holder changed/);
  assert.equal(value.failure.guard, 'original-casting.original-press-holder');
  assert.equal(value.counts.evaluate, evaluateCountBefore + 1);
});

test('the original consent and complete distinct core/Press roster assertion accepts its unchanged fixture', () => {
  const value = fixture(), { beforeRoster, controller, originalA } = consentFixture(value), failure = {};
  assert.doesNotThrow(() => originalRosterGuard(failure, beforeRoster, value.context, controller, originalA));
});
for (const [name, mutate] of [
  ['missing consent', ({ beforeRoster }) => { beforeRoster.consentAcknowledged = false; }],
  ['foreign held roster UID', ({ beforeRoster }) => { beforeRoster.roster[2].uidHash = digest(fixtureIds.foreign); }],
  ['missing held Press actor', ({ beforeRoster }) => { beforeRoster.roster.pop(); }],
  ['duplicate UID in original roster', ({ value, beforeRoster }) => {
    value.roster[2].uidHash = value.roster[0].uidHash; beforeRoster.roster[2].uidHash = value.roster[0].uidHash;
  }],
  ['GM UID admitted as Press actor', ({ value, beforeRoster, originalA }) => {
    value.roster[2].uidHash = originalA.uidHash; beforeRoster.roster[2].uidHash = originalA.uidHash;
  }],
  ['controller UID admitted as Press actor', ({ value, beforeRoster, controller }) => {
    value.roster[2].uidHash = controller.uidHash; beforeRoster.roster[2].uidHash = controller.uidHash;
  }],
]) {
  test('the unchanged original consent/whole roster guard rejects ' + name, () => {
    const value = fixture(), fields = consentFixture(value), failure = {};
    mutate({ value, ...fields });
    assert.throws(() => originalRosterGuard(failure, fields.beforeRoster, value.context, fields.controller, fields.originalA),
      /original ordinary consent and full core\/Press roster/);
  });
}
for (const [name, mutate] of [
  ['changed consent timestamp', after => { after.consentAt = 'native-new-consent'; }],
  ['lost consent', after => { after.consentAcknowledged = false; }],
  ['missing actor', after => { after.roster.pop(); }],
  ['foreign Press UID', after => { after.roster[2].uidHash = digest(fixtureIds.foreign); }],
  ['changed actor order', after => { after.roster.reverse(); }],
]) {
  test('the unchanged exact before/after consent and roster guard rejects ' + name, () => {
    const { beforeRoster } = consentFixture(fixture());
    const afterRoster = structuredClone(beforeRoster), failure = {};
    mutate(afterRoster);
    assert.throws(() => restoredRosterGuard(failure, beforeRoster, afterRoster),
      /original consent and every core\/Press actor identity/);
  });
}

test('the unchanged actor lease and three-move authority contract accept the original share', () => {
  const value = moveInput();
  assert.equal(livePrestartGm(value.originalA), true);
  assert.equal(sameGmLease(value.originalA, value.capture.before), true);
  assert.equal(assertTwoLiveGmResponsibilityMove(value).mode, 'share');
});
for (const [key, invalid] of [
  ['hasAuth', false], ['sameActor', false], ['playerRole', 'player'],
  ['sessionId', ''], ['gmInstanceOwned', false], ['connection', 'offline'],
  ['freshness', 'cache'], ['phase', 'active'], ['cycle', 1],
  ['uidHash', ''], ['instanceId', ''], ['claimedAt', 'malformed'],
  ['generation', 0], ['generation', 1.5], ['hydrationRevision', 0],
  ['privateAudienceMatches', false], ['foreignPendingCount', 1], ['pendingCount', 1],
  ['seatId', 'admiral'], ['assignedRoleId', 'admiral'], ['activeConsoleRoleId', 'press-officer'],
]) {
  test('the original live prestart GM authority still rejects invalid ' + key + '=' + String(invalid), () => {
    const value = moveInput(); value.originalA[key] = invalid;
    assert.equal(livePrestartGm(value.originalA), false);
    assert.throws(() => assertTwoLiveGmResponsibilityMove(value), error =>
      error.proofGuard === 'responsibility.two-distinct-original-owned-live-gm-actors');
  });
}
for (const key of ['sessionId', 'uidHash', 'instanceId', 'claimedAt', 'generation', 'phase', 'cycle', 'profileRoleId']) {
  test('the same original responsibility lease still rejects changed ' + key, () => {
    const value = moveInput();
    const previous = value.capture.before[key];
    value.capture.before[key] = typeof previous === 'number' ? previous + 1 : 'native-changed-' + key;
    assert.equal(sameGmLease(value.originalA, value.capture.before), false);
    assert.throws(() => assertTwoLiveGmResponsibilityMove(value), error =>
      error.proofGuard === 'responsibility.current-original-live-lease');
  });
}
for (const [name, mutate, guard] of [
  ['same UID actors', value => { value.originalB.uidHash = value.originalA.uidHash; }, 'responsibility.two-distinct-original-owned-live-gm-actors'],
  ['same instance actors', value => { value.originalB.instanceId = value.originalA.instanceId; }, 'responsibility.two-distinct-original-owned-live-gm-actors'],
  ['foreign session controller', value => { value.originalB.sessionId = 'native-foreign-session'; }, 'responsibility.two-distinct-original-owned-live-gm-actors'],
  ['foreign controller profile', value => { value.originalB.profileRoleId = 'admiral'; }, 'responsibility.two-distinct-original-owned-live-gm-actors'],
  ['stale request revision', value => { value.capture.data.expectedSetupRevision -= 1; }, 'responsibility.current-setup-revision'],
  ['third target instance', value => { value.capture.data.targetInstanceId = 'native-third-instance'; }, 'responsibility.fixed-ui-native-body'],
  ['extra credential body', value => { value.capture.data.password = 'synthetic-forbidden-extra-field'; }, 'responsibility.fixed-ui-native-body'],
  ['foreign main lane', value => { value.capture.result.coverage.main = [value.originalB.instanceId]; }, 'responsibility.committed-next-revision-and-two-gm-coverage'],
  ['duplicate assistant lane', value => { value.capture.result.coverage.assistant.push(value.originalB.instanceId); }, 'responsibility.committed-next-revision-and-two-gm-coverage'],
  ['replayed result', value => { value.capture.result.status = 'replayed'; }, 'responsibility.committed-next-revision-and-two-gm-coverage'],
]) {
  test('the existing responsibility authority guard rejects ' + name, () => {
    const value = moveInput(); mutate(value);
    assert.throws(() => assertTwoLiveGmResponsibilityMove(value), error => error.proofGuard === guard);
  });
}
test('the already-held controller content-clearance guard remains strict without an UNKNOWN zero', () => {
  assert.doesNotThrow(() => controllerPayloadGuard({}, { privatePayloadCount: 0 }));
  for (const count of [undefined, null, '0', -1, 1, NaN]) {
    assert.throws(() => controllerPayloadGuard({}, { privatePayloadCount: count }),
      /same-call controller private-payload projection must be exactly zero/);
  }
});
test('failure diagnostics retain no raw UID or option label from an already-held failed observation', async () => {
  const value = fixture();
  value.select.options[3].value = fixtureIds.foreign;
  await rejectCasting(value, /^original-casting\.original-press-holder$/);
  const safe = safeHeldFailureObservations(value.failure.held);
  const persisted = JSON.stringify(safe);
  for (const identity of Object.values(fixtureIds)) assert.equal(persisted.includes(identity), false);
  assert.equal(persisted.includes(pressLabel), false);
  assert.equal(value.counts.evaluate, 1); assert.equal(value.counts.storeReads, 2);
});

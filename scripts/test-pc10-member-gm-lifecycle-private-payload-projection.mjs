import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { observeLifecycleActor } from './pc10-member-gm-lifecycle-ui-proof.mjs';

// Exercise the actual existing observation callback with native mock modules.
// This adds no browser or Firebase SDK and does not edit an old test/fixture.
const uid = 'native-observation-fixture-uid';
function state() {
  return { session: { id: 'native-session', currentTurn: 0, phase: 'casting', setupRevision: 37 },
    me: { uid, role: 'player', connectionGeneration: 1 },
    connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 1,
    gmInstance: null, gmAccessAuthenticatedAt: null, pendingCommands: [],
    gmAwayMissionHandPointers: [], gmLoyaltyCensusStatus: 'loading',
    privateLoyalty: null, roleBrief: null, gmLoyaltyCensus: null,
    gmWolfCultIntelligence: null, gmArbourVision: null, gmFacilitatorRuleCall: null,
    gmCrisisState: null, gmZealotryResponse: null, gmCivilUnrestResolution: null, gmSetupReceipt: null,
    arbourVision: null, awayMissionHand: null, facilitatorRuleCall: null,
    commissarPurgeAuthority: null, candidatePrivateWorkspace: null };
}
async function observe(value) {
  let evaluateCount = 0, storeReadCount = 0;
  const context = vm.createContext({ crypto: webcrypto, TextEncoder,
    document: { querySelector: () => null } });
  const exportsBySpecifier = {
    '/src/lib/firebase.ts': { auth: () => ({ currentUser: { uid } }) },
    '/src/lib/demoActorContext.ts': { activeDemoActorProfile: { roleId: 'controller' } },
    '/native/store.ts': { useSessionStore: { getState: () => { storeReadCount++; return value; } } },
  };
  const surface = { storeModuleUrl: () => '/native/store.ts', page: { evaluate: async (callback, input) => {
    evaluateCount++;
    const script = new vm.Script(`(${callback.toString()})`, { importModuleDynamically: async specifier => {
      assert.ok(Object.hasOwn(exportsBySpecifier, specifier), 'Only the original observation imports are mocked.');
      const entries = Object.entries(exportsBySpecifier[specifier]);
      const module = new vm.SyntheticModule(entries.map(([name]) => name), function () {
        for (const [name, exported] of entries) this.setExport(name, exported);
      }, { context });
      await module.link(() => { throw new Error('Mock observation modules have no dependencies.'); });
      await module.evaluate();
      return module;
    } });
    return script.runInContext(context)(input);
  } } };
  const actual = await observeLifecycleActor(surface, value.session.id);
  assert.equal(evaluateCount, 1, 'The original single observation is retained.');
  assert.equal(storeReadCount, 1, 'The original single store snapshot is retained.');
  return actual;
}

test('normal exact empty pointer and loading defaults retain aggregate two but carry no private payload', async () => {
  const actual = await observe(state());
  assert.equal(actual.privateCount, 2);
  assert.equal(actual.privatePayloadCount, 0);
  assert.equal(actual.hasAuth, true);
  assert.equal(actual.sameActor, true);
  assert.equal(actual.privateAudienceMatches, true);
});

test('nonempty or malformed GM pointer data stays counted and blocked', async () => {
  const customEmpty = []; customEmpty.foreign = 'foreign-pointer-payload';
  const symbolEmpty = []; symbolEmpty[Symbol('foreign')] = 'foreign-pointer-payload';
  for (const pointers of [[{ uid: 'foreign-pointer-uid' }], new Array(1), { length: 0 }, '', null, undefined,
    customEmpty, symbolEmpty]) {
    const value = state(); value.gmAwayMissionHandPointers = pointers;
    const actual = await observe(value);
    assert.equal(actual.privateCount, pointers === null || pointers === undefined ? 1 : 2);
    assert.equal(actual.privatePayloadCount, 1);
  }
});

test('only the exact loading status is a payload-free status', async () => {
  for (const status of ['ready', 'error', 'Loading', '', {}, false, 0, null, undefined]) {
    const value = state(); value.gmLoyaltyCensusStatus = status;
    const actual = await observe(value);
    assert.equal(actual.privateCount, status === null || status === undefined ? 1 : 2);
    assert.equal(actual.privatePayloadCount, 1);
  }
});

test('missing required default fields fail closed without a guessed zero', async () => {
  for (const key of ['gmAwayMissionHandPointers', 'gmLoyaltyCensusStatus']) {
    const value = state(); delete value[key];
    const actual = await observe(value);
    assert.equal(actual.privateCount, 1);
    assert.equal(actual.privatePayloadCount, 1);
  }
});

test('all other old private keys and foreign GM contents remain counted', async () => {
  for (const key of ['privateLoyalty', 'roleBrief', 'arbourVision', 'awayMissionHand', 'facilitatorRuleCall',
    'commissarPurgeAuthority', 'candidatePrivateWorkspace', 'gmLoyaltyCensus', 'gmSetupReceipt', 'gmForeignPrivateReceipt']) {
    const value = state(); value[key] = { assignmentUid: 'foreign-private-uid', content: 'foreign-private-content' };
    const actual = await observe(value);
    assert.equal(actual.privateCount, 3);
    assert.equal(actual.privatePayloadCount, 1);
    assert.equal(actual.privateAudienceMatches, key !== 'roleBrief');
    assert.equal(JSON.stringify(actual).includes('foreign-private-content'), false);
    assert.equal(JSON.stringify(actual).includes('foreign-private-uid'), false);
  }
});

test('the old GM-instance/access exclusions and aggregate callers retain their semantics', async () => {
  const value = state();
  value.gmInstance = { id: 'native-instance', uid, sessionId: value.session.id, claimedAt: 'native-claim' };
  value.gmAccessAuthenticatedAt = 1;
  const actual = await observe(value);
  assert.equal(actual.privateCount, 2);
  assert.equal(actual.privatePayloadCount, 0);
  assert.equal(actual.gmInstanceOwned, true);
  assert.equal(actual.gmAccessCached, true);
  assert.equal(JSON.stringify(actual).includes(uid), false);
});

test('content counting reuses the old key scan rather than reading private fields again', async () => {
  const value = state();
  let pointerReads = 0, statusReads = 0;
  Object.defineProperty(value, 'gmAwayMissionHandPointers', { enumerable: true,
    get: () => { pointerReads++; return []; } });
  Object.defineProperty(value, 'gmLoyaltyCensusStatus', { enumerable: true,
    get: () => { statusReads++; return 'loading'; } });
  const actual = await observe(value);
  assert.equal(actual.privatePayloadCount, 0);
  assert.ok(pointerReads <= 2 && statusReads <= 2, 'Do not add reads beyond the old aggregate scan.');
});

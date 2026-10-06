import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assessLiveBaseAction } from './pc10-base-post-combat-choice-policy.mjs';
import { observeBasePostCombatActor } from './pc10-base-post-combat-actor-observation.mjs';

const sessionId = 'session-original';
const roleId = 'shepherd-engineer';
const uidHash = '0123456789abcdef';
const gm = { sessionId, uidHash: 'gm-original-hash', instanceId: 'owned-gm-instance',
  gmInstanceOwned: true, playerRole: 'gm', phase: 'active', cycle: 2, connection: 'live', freshness: 'server' };
const currentSession = { sessionId, phase: 'active', currentTurn: 2, live: true,
  activeRoleIds: [roleId], activeVesselIds: ['shepherd'] };
const ship = { shipId: 'shepherd', currentTurn: 2, damage: { destroyed: false, damagedSystemIds: [] } };
const originalActor = { roleId, uidHash };

// This is JSON serialized using the exact public fields returned by the mounted
// generic observer. The absent source-member fields are the defect under test.
const genericObservation = JSON.parse('{"hasAuth":true,"sameActor":true,"uidHash":"0123456789abcdef",' +
  '"sessionId":"session-original","documentTimeOrigin":12345,"cycle":2,"phase":"active","playerRole":"player",' +
  '"profileSessionId":"session-original","profileRoleId":"shepherd-engineer",' +
  '"assignedRoleId":"shepherd-engineer",' +
  '"activeConsoleRoleId":"shepherd-engineer","connection":"live","freshness":"server"}');

const richActorRead = JSON.parse('{"sessionId":"session-original","fleetGroupId":"fleet-1",' +
  '"connectionGeneration":7,"identityHydrationRevision":3,"replacementRoleId":null,' +
  '"replacementStatus":null,"seatId":"seat-original","connected":true,"discoveryAuthority":null}');

function exactMemberRead(overrides = {}) {
  return JSON.parse(JSON.stringify({ sessionId, documentTimeOrigin: 12345, sameActor: true, meSessionId: sessionId,
    authUidHash: genericObservation.uidHash, memberUidHash: genericObservation.uidHash,
    memberDocumentIdHash: genericObservation.uidHash, profileRoleId: roleId,
    profileSessionId: sessionId, playerRole: 'player', assignedRoleId: roleId,
    activeConsoleRoleId: roleId, fleetGroupId: 'fleet-1', connectionGeneration: 7,
    identityHydrationRevision: 3,
    connected: true, escapeLocked: false, ...overrides }));
}

function mountedSurface({ exact = exactMemberRead(), generic = genericObservation } = {}) {
  let evaluateIndex = 0;
  const storeModule = '/src/store/useSessionStore.ts';
  return {
    storeModuleUrl: () => storeModule,
    observe: async () => JSON.parse(JSON.stringify(generic)),
    page: { evaluate: async (callback, moduleUrl) => {
      assert.equal(moduleUrl, storeModule);
      const source = String(callback);
      evaluateIndex++;
      if (source.includes('discoveryAuthority')) return JSON.parse(JSON.stringify(richActorRead));
      if (source.includes('escapeState')) return JSON.parse(JSON.stringify(exact));
      assert.fail(`Unexpected source observer callback ${evaluateIndex}.`);
    } },
  };
}

function assess(currentActor, changes = {}) {
  return assessLiveBaseAction({ sessionId, expectedCycle: 2, shipId: 'shepherd', roleId,
    expectedGroupId: 'fleet-1', sourceGm: gm, originalGm: gm, currentSession,
    ship, originalActor, currentActor, ...changes });
}

test('composes the serialized mounted observer with the original current source actor read', async () => {
  for (const field of ['meSessionId', 'fleetGroupId', 'connected', 'escapeLocked'])
    assert.equal(Object.hasOwn(genericObservation, field), false, `The generic serialized observer must omit ${field}.`);

  const observerSource = await readFile(new URL('./pc10-full-game-demo-ui-proof.mjs', import.meta.url), 'utf8');
  assert.match(observerSource, /async function observe\(\)[\s\S]*?return \{ hasAuth: !!user/);
  const observerBody = observerSource.slice(observerSource.indexOf('async function observe()'),
    observerSource.indexOf('}, storeUrl);', observerSource.indexOf('async function observe()')));
  for (const field of ['meSessionId', 'fleetGroupId', 'escapeLocked']) assert.doesNotMatch(observerBody, new RegExp(field));
  assert.doesNotMatch(observerBody, /connected\s*:/);

  const actor = await observeBasePostCombatActor(mountedSurface());
  assert.equal(actor.meSessionId, sessionId);
  assert.equal(actor.fleetGroupId, 'fleet-1');
  assert.equal(actor.connected, true);
  assert.equal(actor.escapeLocked, false);
  assert.deepEqual(assess(actor), { status: 'eligible', blockers: [] });

  for (const exact of [
    exactMemberRead({ meSessionId: null }),
    exactMemberRead({ connected: undefined }),
    exactMemberRead({ connected: false }),
    exactMemberRead({ escapeLocked: true }),
    exactMemberRead({ sameActor: false }),
    exactMemberRead({ sessionId: 'other-session' }),
  ]) {
    const current = await observeBasePostCombatActor(mountedSurface({ exact }));
    assert.equal(assess(current).status, 'pending');
  }

  assert.equal(assess(actor, { ship: { ...ship, damage: undefined } }).status, 'pending',
    'Missing projectShipState damage remains ineligible.');
  assert.equal(assess(actor, { ship: { ...ship, damage: { destroyed: true, damagedSystemIds: [] } } }).status, 'pending',
    'The actual projectShipState destroyed flag remains authoritative.');
});

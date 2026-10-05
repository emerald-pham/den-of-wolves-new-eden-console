import assert from 'node:assert/strict';
import test from 'node:test';
import { createWolfChoiceWaiter } from './pc10-combat-choice-readiness.mjs';

// Mounted-factory native counterexamples only. No actual browser, Auth, runtime,
// gameplay or acceptance credit; Combat12's historical denied code is unknown.
function fixture({ selected = 'crew', restoreBeforeSdk = false, actorWindow, gmWindow,
  actorDrift = {}, gmDrift = {}, afterActor = {}, afterGm = {}, source = {}, onSource = () => {} } = {}) {
  let denied = false, finalRead = false, restored = false;
  const counts = { sdkReads: 0, sourceReads: 0, paints: 0 };
  const records = [];
  const window = { airspace: 'restricted', turnStatePhase: 'team' };
  const forward = { airspace: 'lifted', turnStatePhase: 'coordination' };
  const member = { hasAuth: true, sameActor: true, sessionId: 'native-session', uidHash: 'native-executive',
    profileRoleId: 'executive-officer', assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer',
    playerRole: 'player', phase: 'active', cycle: 1, connection: 'live', freshness: 'server',
    fleetGroupId: 'native-group', seatId: 'native-seat', connectionGeneration: 3, identityHydrationRevision: 2,
    replacementRoleId: null, replacementStatus: null, phaseProgression: 'manual', ...window,
    discoveryAuthority: { groupId: 'native-group', shipId: 'aegis', revision: 3, fleetGroupVesselIds: ['aegis', 'dione'] } };
  const facilitator = { ...member, uidHash: 'native-gm', profileRoleId: 'gm', assignedRoleId: null,
    activeConsoleRoleId: null, playerRole: 'gm', fleetGroupId: null, seatId: null, discoveryAuthority: null,
    instanceId: 'native-instance', gmInstanceOwned: true };
  const supplement = ['fleetGroupId', 'seatId', 'connectionGeneration', 'identityHydrationRevision',
    'replacementRoleId', 'replacementStatus', 'discoveryAuthority'];
  const full = gm => structuredClone({ ...(gm ? facilitator : member),
    ...(restored ? gm ? gmWindow ?? forward : actorWindow ?? forward : {}),
    ...(denied ? gm ? gmDrift : actorDrift : {}), ...(finalRead ? gm ? afterGm : afterActor : {}) });
  const raw = gm => Object.fromEntries(Object.entries(full(gm)).filter(([key]) => !supplement.includes(key)));
  const reply = { status: 'denied', code: 'functions/failed-precondition', message: 'Original native closed boarding query' };
  function surface(gm) {
    return { observe: async () => raw(gm),
      get storeModuleUrl() {
        // Crew's normal authority check has just read the original raw GM.
        // Restore before the factory requests its richer GM observer, while
        // keeping all observations stable during that observer itself.
        if (gm && restoreBeforeSdk) restored = true;
        return () => '/native-store';
      },
      page: { evaluate: async () => {
        const current = full(gm);
        return { sessionId: current.sessionId, fleetGroupId: current.fleetGroupId, seatId: current.seatId,
          connectionGeneration: current.connectionGeneration, identityHydrationRevision: current.identityHydrationRevision,
          replacementRoleId: current.replacementRoleId, replacementStatus: current.replacementStatus,
          discoveryAuthority: current.discoveryAuthority, connected: true };
      }, getByRole: () => { counts.paints++; throw new Error('A closed boarding query never inspects or accepts a choice.'); } },
      callable: async (endpoint, request) => {
        counts.sdkReads++; assert.equal(endpoint, 'getWolfBoardingSpecialChoice');
        assert.equal(request.sessionId, 'native-session');
        if (gm) assert.equal(request.instanceId, facilitator.instanceId);
        denied = true; restored = true; return reply;
      } };
  }
  const gm = surface(true), crew = surface(false);
  const current = { attackId: 'native-attack', turn: 1, revision: 26, status: 'declared', currentStep: 'boarding', airspaceLocked: true };
  const tools = { read: async (role, path) => {
    counts.sourceReads++; assert.equal(role, 'gm'); assert.equal(path, 'wolfAttackState/current');
    if (!denied) return { ...current };
    finalRead = true; onSource();
    return { ...current, revision: 27, status: 'resolved', currentStep: 'resolved', airspaceLocked: false, ...source };
  }, record: async (stage, detail) => { records.push({ stage, ...detail }); } };
  const context = { gm, crew, initial: { sessionId: 'native-session' },
    started: { uidHash: facilitator.uidHash, instanceId: facilitator.instanceId },
    roster: [{ roleId: member.profileRoleId, uidHash: member.uidHash }] };
  return { counts, records, reply, current,
    run: (options = {}) => createWolfChoiceWaiter(context, { tools, ...options })(selected === 'gm' ? gm : crew, current, { kind: 'boarding-special' }) };
}
function retainedSdkError(error, reply) {
  for (let current = error; current; current = current.cause)
    if (current.code === reply.code && current.message === reply.message && current.cause === reply) return true;
  return false;
}

for (const selected of ['crew', 'gm'])
  test(`the mounted factory ${selected} denied boarding read can qualify both original fully restored windows against one final source`, async () => {
    const f = fixture({ selected });
    const result = await f.run();
    assert.equal(result.status, 'source-changed'); assert.equal(result.gameplayCredit, false);
    assert.equal(result.actionCredit, false); assert.equal(result.acceptanceCredit, false);
    assert.deepEqual(result.expected, { ...f.current, sessionId: 'native-session' });
    assert.equal(result.readDenial.reply, f.reply); assert.equal(result.readDenial.endpoint, 'getWolfBoardingSpecialChoice');
    assert.deepEqual(f.counts, { sdkReads: 1, sourceReads: 2, paints: 0 });
    assert.equal(f.records[0].readDenial.reply, f.reply, 'Retain the original denial before source-only recovery.');
  });

test('the richer original GM observation already restored between the waiter authority check and SDK read remains bound to the original attack', async () => {
  const f = fixture({ restoreBeforeSdk: true });
  const result = await f.run();
  assert.equal(result.status, 'source-changed'); assert.equal(result.gameplayCredit, false);
  assert.equal(result.actionCredit, false); assert.equal(result.acceptanceCredit, false);
  assert.equal(result.readDenial.reply, f.reply);
  assert.deepEqual(f.counts, { sdkReads: 1, sourceReads: 2, paints: 0 });
});

for (const [name, change] of Object.entries({ UID: { uidHash: 'foreign' }, group: { fleetGroupId: 'foreign' },
  seat: { seatId: 'foreign' }, generation: { connectionGeneration: 4 }, hydration: { identityHydrationRevision: 3 },
  discovery: { discoveryAuthority: { groupId: 'foreign', revision: 3, shipId: 'aegis', fleetGroupVesselIds: ['aegis'] } },
  cycle: { cycle: 2 }, manual: { phaseProgression: 'automatic' }, role: { playerRole: 'gm' } }))
  for (const when of ['actorDrift', 'afterActor'])
    test(`restored original actor ${name} drift ${when} is still a retained SDK hard failure`, async () => {
      const f = fixture({ [when]: change });
      await assert.rejects(f.run(), error => retainedSdkError(error, f.reply));
      assert.equal(f.counts.sdkReads, 1); assert.equal(f.counts.paints, 0);
      assert.equal(f.counts.sourceReads, when === 'actorDrift' ? 1 : 2);
    });

for (const [name, change] of Object.entries({ UID: { uidHash: 'foreign' }, group: { fleetGroupId: 'foreign' },
  seat: { seatId: 'foreign' }, generation: { connectionGeneration: 4 }, hydration: { identityHydrationRevision: 3 },
  discovery: { discoveryAuthority: { groupId: 'foreign', revision: 3, shipId: null, fleetGroupVesselIds: [] } },
  cycle: { cycle: 2 }, manual: { phaseProgression: 'automatic' }, instance: { instanceId: 'foreign' },
  ownership: { gmInstanceOwned: false }, role: { playerRole: 'player' } }))
  for (const when of ['gmDrift', 'afterGm'])
    test(`restored original GM ${name} drift ${when} is still a retained SDK hard failure`, async () => {
      const f = fixture({ [when]: change });
      await assert.rejects(f.run(), error => retainedSdkError(error, f.reply));
      assert.equal(f.counts.sdkReads, 1); assert.equal(f.counts.paints, 0);
      assert.equal(f.counts.sourceReads, when === 'gmDrift' ? 1 : 2);
    });

for (const source of [{ attackId: 'foreign' }, { sessionId: 'foreign' }, { turn: 2 }, { revision: 26 },
  { revision: 27.5 }, { status: 'declared' }, { currentStep: 'boarding' }, { airspaceLocked: true }, { airspaceLocked: undefined }])
  test(`restored windows need the original attack finalized source ${JSON.stringify(source)}`, async () => {
    const f = fixture({ source });
    await assert.rejects(f.run(), error => retainedSdkError(error, f.reply));
    assert.deepEqual(f.counts, { sdkReads: 1, sourceReads: 2, paints: 0 });
  });

for (const actorWindow of [{ airspace: 'lifted', turnStatePhase: 'team' },
  { airspace: 'restricted', turnStatePhase: 'coordination' }, { airspace: 'unknown', turnStatePhase: 'coordination' }])
  test(`an unproven partial actor restoration stays hard ${JSON.stringify(actorWindow)}`, async () => {
    const f = fixture({ actorWindow });
    await assert.rejects(f.run(), error => retainedSdkError(error, f.reply));
    assert.deepEqual(f.counts, { sdkReads: 1, sourceReads: 1, paints: 0 });
  });

test('restored windows and source reinspection cannot renew the unchanged stage deadline', async t => {
  let time = 0; t.mock.method(Date, 'now', () => time);
  const f = fixture({ onSource: () => { time = 600; } });
  await assert.rejects(f.run({ deadlineAt: 600 }), error => /deadline/i.test(error.message) && retainedSdkError(error, f.reply));
  assert.deepEqual(f.counts, { sdkReads: 1, sourceReads: 2, paints: 0 });
});

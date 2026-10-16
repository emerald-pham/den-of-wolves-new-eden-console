import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createBasePendingProcedureCallbacks } from './pc10-base-pending-procedure-composition.mjs';
import { CORE_CRAFT_PROCEDURES } from './pc10-pending-procedure-ui-proof.mjs';

const SESSION_ID = 'base-movement-authority-slice-session';
const UID_HASH = 'b'.repeat(16);
const GROUP_ID = 'fleet-1';
const SHUTTLE_ID = 'endeavour';
const ROLE_ID = 'shepherd-scientist';
const MOVEMENT_ENDPOINTS = new Set([
  'requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit', 'completeShuttleArrival',
]);

test('actual Base Coordination keeps movement inside one freshly selected Core document', async () => {
  let currentRoleId = ROLE_ID;
  let generation = 1;
  let hydrationRevision = 1;
  let documentTimeOrigin = 100_000;
  const movementObservations = [];
  const selectCrewRole = roleId => {
    if (roleId === currentRoleId) return;
    currentRoleId = roleId;
    generation += 1;
    hydrationRevision += 1;
    documentTimeOrigin += 1_000;
  };
  const currentAuthority = () => ({ sessionId: SESSION_ID, uidHash: UID_HASH, groupId: GROUP_ID,
    roleId: currentRoleId, connectionGeneration: generation,
    identityHydrationRevision: hydrationRevision, documentTimeOrigin,
    audienceHash: 'a'.repeat(64), authorityHash: String(generation).padStart(64, '0'), shuttleAuthorized: true });
  const gameFactory = () => ({ select: async roleId => {
    if (roleId !== 'gm') selectCrewRole(roleId);
    return { roleId, observe: async () => ({ sessionId: SESSION_ID, uidHash: UID_HASH,
      profileRoleId: roleId, activeConsoleRoleId: roleId, assignedRoleId: roleId,
      sameActor: true, connection: 'live', freshness: 'server' }) };
  } });
  const coreStepOverrides = Object.fromEntries(CORE_CRAFT_PROCEDURES.map(spec => [spec.id,
    async ({ context, game }) => {
      const roleId = spec.actorRoleId === 'current-shuttle-holder'
        ? context.shuttleOriginAuthority?.sourceAuthority?.roleId ?? ROLE_ID : spec.actorRoleId;
      await game.select(roleId);
      if (MOVEMENT_ENDPOINTS.has(spec.endpoint)) movementObservations.push({
        endpoint: spec.endpoint,
        directory: context.directory,
        originAuthority: context.shuttleOriginAuthority?.sourceAuthority ?? null,
        currentAuthority: currentAuthority(),
        witness: context.shuttleArrivalWitness ?? null,
      });
      return undefined;
    }]));
  const directory = await mkdtemp(join(tmpdir(), 'pc10-base-movement-authority-slice-'));
  try {
    const procedures = createBasePendingProcedureCallbacks({ coreStepOverrides, gameFactory });
    const context = { initial: { sessionId: SESSION_ID }, roster: [], directory };
    const staleOrigin = { sessionId: SESSION_ID, uidHash: UID_HASH, shuttleId: SHUTTLE_ID,
      groupId: GROUP_ID, cycle: 1, controlRevision: 4, sourceAuthority: currentAuthority() };

    await procedures.onCycle1Coordination({ ...context, shuttleOriginAuthority: staleOrigin,
      shuttleOriginHostShipId: 'shepherd' });
    const broadMovement = movementObservations.filter(value => value.directory.includes('cycle-1-coordination'));
    assert.equal(broadMovement.length, 0,
      `Cycle 1 must defer movement until the actor-changing Coordination procedures finish; observed ${JSON.stringify(broadMovement)}`);

    selectCrewRole(ROLE_ID);
    const freshOrigin = { sessionId: SESSION_ID, uidHash: UID_HASH, shuttleId: SHUTTLE_ID,
      groupId: GROUP_ID, cycle: 1, controlRevision: 4, sourceAuthority: currentAuthority() };
    const movement = procedures.onCycle1ShuttleMovement;
    assert.equal(typeof movement, 'function', 'Expose a bounded departure/begin/retarget-only Core slice.');
    await movement({ ...context, shuttleOriginAuthority: freshOrigin,
      shuttleOriginHostShipId: 'shepherd' });

    const witness = { status: 'completed', endpoint: 'retargetShuttleTransit', sessionId: SESSION_ID,
      roleId: ROLE_ID, uidHash: UID_HASH, shuttleId: SHUTTLE_ID, groupId: GROUP_ID, cycle: 1,
      controlRevision: 4, departureRequestId: 'departure-1', transitRequestId: 'transit-1',
      destinationShipId: 'quellon', transitRevision: 2, sourceAuthority: freshOrigin.sourceAuthority };
    await procedures.onShuttleAutoArrivalArmed({ ...context, shuttleOriginAuthority: freshOrigin,
      shuttleOriginHostShipId: 'shepherd', shuttleArrivalWitness: witness });

    assert.deepEqual(movementObservations.map(value => value.endpoint), [
      'requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit', 'completeShuttleArrival',
    ]);
    for (const observation of movementObservations) {
      assert.equal(JSON.stringify(observation.originAuthority), JSON.stringify(freshOrigin.sourceAuthority),
        `${observation.endpoint} must retain the authority captured immediately before departure.`);
      assert.equal(JSON.stringify(observation.currentAuthority), JSON.stringify(freshOrigin.sourceAuthority),
        `${observation.endpoint} must stay on that same actual document through the automatic arrival consumer.`);
      if (observation.endpoint === 'completeShuttleArrival') {
        assert.equal(JSON.stringify(observation.witness), JSON.stringify(witness),
          'Automatic arrival must retain the exact original retarget witness.');
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const read = () => readFile(new URL('./pc10-base-gameplay-composed-post-combat.mjs', import.meta.url), 'utf8');

test('post-Wolf paid actions and the four separate research choices recheck the current source before credit', async () => {
  const source = await read();
  assert.match(source, /async function currentRoleReadiness\(/);
  assert.match(source, /await currentRoleReadiness\(shipId, roleId, cycle/);
  assert.match(source, /pendingActions\.push/);
  assert.match(source, /await currentRoleReadiness\('shepherd', 'shepherd-scientist', cycle/);
  assert.match(source, /protectedShipPriority:\s*\['shepherd', 'quellon'\]/);
  assert.doesNotMatch(source, /for \(const \[ship, , name\] of ships\) \{\s*const captain =/);
  assert.doesNotMatch(source, /checks\.sixChargedJumpsAndExactRetries = true;\s*$/m);
});

test('mission start binds the current mounted group to a source-verified carrier and exact receipt before credit', async () => {
  const source = await read();
  assert.match(source, /selectCurrentBaseMissionCarriers\(/);
  assert.match(source, /selectBaseMissionTeam\(/);
  assert.match(source, /getDocsFromServer/);
  assert.match(source, /getDocFromServer/);
  assert.match(source, /validateBaseMissionStartReceipt\(/);
  assert.match(source, /checks\.realMissionStartAndExactRetry\s*=\s*true/);
  assert.doesNotMatch(source, /const participants = \['wing-commander', 'shepherd-scientist', 'quellon-explorer'\]/);
  assert.match(source, /pendingActions/);
});

test('scout request checks require the validated current craft-owner receipt and retain exact SDK replay', async () => {
  const source = await read();
  assert.ok(/validateBaseScoutRequestReceipt\(\{ receipt: result, sessionId: initial\.sessionId/.test(source),
    'Validate the actual server scout reply against the originally selected role and coordinate.');
  assert.ok(/checks\.scoutRequestsAndExactRetries = scoutResults\.every\(result => result\?\.status === 'committed'\)/.test(source),
    'Credit the scout branch only after every source receipt has been normalized as committed.');
  assert.ok(!/scoutResults\.every\(result => result\?\.status !== 'pending'\)/.test(source),
    'A missing or unexpected source reply cannot count as a scout commit.');
  assert.ok(/assert\.equal\(again\.status, 'committed'/.test(source),
    'Keep the original exact SDK replay requirement.');
  assert.ok(/assert\.deepEqual\(clean\(again\.result\), clean\(body\.result\)\)/.test(source),
    'Keep the exact result comparison across UI and replay receipts.');
});

test('Cycle 1 carries one current Core retarget witness to the source-timed arrival consumer before Wolf', async () => {
  let clockMs = Date.parse('2026-10-16T15:00:00.000Z');
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clockMs])); }
    static now() { return clockMs; }
  }
  const sessionId = 'base-movement-runner-session';
  const uid = 'shepherd-scientist-source-uid';
  const uidHash = createHash('sha256').update(uid).digest('hex').slice(0, 16);
  const groupId = 'fleet-1';
  const sourceAuthority = { sessionId, uidHash, groupId, roleId: 'shepherd-scientist',
    connectionGeneration: 4, identityHydrationRevision: 3, documentTimeOrigin: clockMs - 60_000,
    audienceHash: 'a'.repeat(64), authorityHash: 'b'.repeat(64), shuttleAuthorized: true };
  const origin = { sessionId, uidHash, shuttleId: 'endeavour', groupId, cycle: 1,
    controlRevision: 4, sourceAuthority };
  const arrivalWitness = { status: 'completed', endpoint: 'retargetShuttleTransit', sessionId,
    roleId: 'shepherd-scientist', uidHash, shuttleId: 'endeavour', groupId, cycle: 1,
    controlRevision: 4, departureRequestId: 'departure-base-1', transitRequestId: 'transit-base-1',
    destinationShipId: 'quellon', transitRevision: 2, sourceAuthority };
  const roster = [
    ['executive-officer', 'aegis-uid'], ['dione-engineer', 'dione-uid'],
    ['icebreaker-engineer', 'icebreaker-uid'], ['shepherd-engineer', 'shepherd-uid'],
    ['shepherd-scientist', uid], ['quellon-engineer', 'quellon-uid'],
    ['refinery-124-engineer', 'refinery-uid'],
  ].map(([roleId, actorUid]) => ({ roleId,
    uidHash: createHash('sha256').update(actorUid).digest('hex').slice(0, 16), displayName: roleId }));
  const ships = ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'];
  const activeRoleIds = roster.map(actor => actor.roleId);
  const shipFleetGroupIds = Object.fromEntries(ships.map(shipId => [shipId, groupId]));
  const shuttleControl = { endeavour: { shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist',
    holderUid: uid, revision: origin.controlRevision } };
  let movementDocument = null;
  let coordinationContext = null;
  let movementContext = null;
  const arrivalInvocations = [];
  const manualArrivalInvocations = [];
  const sourceMovementReads = [];
  const stopAtOpeningWolf = new Error('runner reached opening Wolf boundary');
  const gm = {
    observe: async () => ({ sessionId, uidHash: 'original-gm-hash', playerRole: 'gm',
      instanceId: 'original-gm-instance', gmInstanceOwned: true, phase: 'active', cycle: 1,
      connection: 'live', freshness: 'server', phaseProgression: 'manual', airspace: 'lifted' }),
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    page: { evaluate: async (_fn, input) => {
      if (input?.path === 'shuttleDepartures/endeavour') sourceMovementReads.push(clockMs);
      return { status: 'ok', value: input?.path === 'shuttleDepartures/endeavour'
        ? structuredClone(movementDocument) : null, fromCache: false, hasPendingWrites: false };
    } },
  };
  const currentSource = () => ({ live: true, sessionId, cycle: 1, phase: 'active',
    currentTurn: 1, holderGroupId: groupId, activeRoleIds, activeVesselIds: ships,
    shipFleetGroupIds, shipDamage: Object.fromEntries(ships.map(shipId => [shipId, { destroyed: false }])),
    shuttleControl, shuttleDockings: movementDocument ? [] : [{ shuttleId: 'endeavour', shipId: 'shepherd' }],
    turnPhase: { turn: 1, progression: 'manual', airspace: { state: 'lifted' } } });
  const makeSurface = roleId => {
    const actor = roster.find(value => value.roleId === roleId);
    const locator = {
      count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
      click: async () => {}, first() { return this; },
      or() { return this; }, waitFor: async () => {},
      getByRole() { return this; },
    };
    return { roleId, storeModuleUrl: () => '/src/store/useSessionStore.ts',
      observe: async () => ({ sameActor: true, hasAuth: true, sessionId, meSessionId: sessionId,
        uidHash: actor?.uidHash, profileRoleId: roleId, activeConsoleRoleId: roleId,
        assignedRoleId: roleId, playerRole: 'player', connected: true, connection: 'live', freshness: 'server',
        fleetGroupId: groupId }),
      page: { getByRole: () => locator, evaluate: async () => null },
    };
  };
  const gameplay = {
    state: async () => currentSource(),
    shipState: async shipId => ({ shipProjection: { shipId, currentTurn: 1, damage: { destroyed: false } } }),
    select: async roleId => roleId === 'gm' ? gm : makeSurface(roleId),
    maintenanceUi: async () => {},
    save: async () => {},
  };
  const fakeImports = {
    assert,
    createHash,
    randomUUID: () => 'test-request-id',
    writeFile: async () => {},
    rememberProofFailure: () => {},
    retainProofFailure: async () => {},
    createTwoBrowserGameplay: () => gameplay,
    candidateGameplayTools: () => ({ printedRationBudget: async shipRows => Object.fromEntries(
      Object.keys(shipRows).map(shipId => [shipId, { food: 0, water: 0 }])) ,
    gmSupplies: async () => ({}) }),
    advanceBaseDetectorResearch: async () => ({ branches: { 'detector-research-cross': { status: 'committed' } } }),
    runBaseCombatAndDeduction: async () => { throw stopAtOpeningWolf; },
    prepareMissionPrivacyThroughMountedControl: async () => ({}),
    startMissionDealThroughMountedUi: async () => ({}),
    resolveAndDeliverMissionThroughMountedUi: async () => ({}),
    observeUiReceipt: async () => ({}),
    completeOfferedTurnAdvance: async () => ({}),
    createBasePendingProcedureCallbacks: () => ({}),
    createBasePendingProcedureComposition: () => ({}),
    runBaseC4CustomCrisisLifecycle: async () => ({}),
    BASE_MISSION_ROLE_PRIORITY: ['wing-commander', 'shepherd-scientist', 'quellon-explorer'],
    baseShipForRole(roleId) {
      if (['admiral', 'executive-officer', 'wing-commander'].includes(roleId)) return 'aegis';
      if (roleId.startsWith('refinery-124-')) return 'refinery-124';
      if (roleId === 'press-officer' || roleId.startsWith('joint-engineering-')) return undefined;
      const shipId = roleId.split('-')[0];
      return ships.includes(shipId) ? shipId : undefined;
    },
    baseShipRoleCandidates({ shipId }) {
      const roleByShip = { aegis: 'executive-officer', dione: 'dione-engineer',
        icebreaker: 'icebreaker-engineer', shepherd: 'shepherd-engineer',
        quellon: 'quellon-engineer', 'refinery-124': 'refinery-124-engineer' };
      return [roleByShip[shipId]].filter(roleId => activeRoleIds.includes(roleId));
    },
    chooseAvailableBaseShipRole({ candidates, readinessByRoleId }) {
      const roleId = candidates.find(value => readinessByRoleId[value]?.status === 'eligible');
      return roleId ? { status: 'eligible', roleId, blockers: [] }
        : { status: 'pending', roleId: null, blockers: ['no-current-original-ship-role'] };
    },
    async recheckChosenBaseShipRole({ selection, inspectCurrentRole }) {
      if (selection.status !== 'eligible') return selection;
      const readiness = await inspectCurrentRole(selection.roleId);
      return readiness.status === 'eligible'
        ? { status: 'eligible', roleId: selection.roleId, blockers: [], readiness }
        : { ...readiness, roleId: selection.roleId };
    },
    assessLiveBaseAction: () => ({ status: 'eligible', blockers: [] }),
    selectBaseMissionTeam: () => ({ status: 'pending', participantRoleIds: [] }),
    selectCurrentBaseMissionCarriers: () => ({ status: 'pending' }),
    validateBaseMissionStartReceipt: () => ({}),
    validateBaseScoutRequestReceipt: () => ({}),
    assertBasePostCombatActorIdentity: () => {},
    observeBasePostCombatActor: async surface => surface.observe(),
    assertWolfChoiceActor: () => {},
    readActionState: async (surface, shuttleId) => {
      if (surface.roleId !== 'shepherd-scientist' || shuttleId !== 'endeavour') return null;
      return { ...currentSource(), currentDocumentAuthority: sourceAuthority,
        currentMemberScope: { groupId, vesselIds: ships, craftIds: ['endeavour'] } };
    },
    delay: async ms => { clockMs += ms; },
  };
  const source = (await readFile(new URL('./pc10-base-gameplay-composed-post-combat.mjs', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\s*/gm, '')
    .replace(/^export\s+/gm, '') + '\nglobalThis.__runBaseGameplay = runBaseGameplay;';
  const sandbox = { ...fakeImports, Date: FakeDate, console };
  runInNewContext(source, sandbox, { filename: 'pc10-base-gameplay-composed-post-combat.mjs' });
  const runBaseGameplay = sandbox.__runBaseGameplay;
  const integration = {
    procedures: {
      onCycle1Started: async () => null,
      onCycle1Maintenance: async () => null,
      onEligibleAlert: async () => null,
      onEligibleMutiny: async () => null,
      onEligibleDestruction: async () => null,
      onCycle1Coordination: async context => {
        coordinationContext = context;
        return { coordination: { evidence: { cases: [] } } };
      },
      onCycle1ShuttleMovement: async context => {
        movementContext = context;
        assert.equal(JSON.stringify(context.shuttleOriginAuthority), JSON.stringify(origin),
          'The movement-only callback must receive the fresh origin after actor-changing Coordination work.');
        const departedAt = new Date(clockMs).toISOString();
        movementDocument = { id: origin.shuttleId, status: 'in-transit', requestId: arrivalWitness.departureRequestId,
          shuttleId: origin.shuttleId, holderUid: uid, fleetGroupId: groupId,
          destinationShipId: arrivalWitness.destinationShipId, cycle: origin.cycle,
          controlRevision: origin.controlRevision, requestedAt: new Date(clockMs - 10_000).toISOString(),
          transitRequestId: arrivalWitness.transitRequestId, revision: arrivalWitness.transitRevision,
          currentPosition: { x: 0, y: 0, z: 0 }, destinationPosition: { x: 1, y: 1, z: 1 },
          velocity: { x: 1, y: 1, z: 1 }, departedAt,
          arrivesAt: new Date(clockMs + 60_000).toISOString() };
        return { evidence: { cases: [{ caseId: 'core:retargetShuttleTransit',
          status: 'completed', shuttleArrivalWitness: arrivalWitness }] } };
      },
      onShuttleAutoArrivalArmed: async context => {
        arrivalInvocations.push({ context, at: clockMs, source: structuredClone(movementDocument) });
        return { evidence: { cases: [{ caseId: 'core:completeShuttleArrival', status: 'completed' }] } };
      },
      onShuttleArrivalReady: async context => {
        manualArrivalInvocations.push(context);
        return { evidence: { cases: [{ caseId: 'core:completeShuttleArrival', status: 'completed' }] } };
      },
    },
    governance: { team1AfterNormalStart: async () => null, pending: [] },
    terminalBefore: [], terminalAfter: [],
  };
  const context = { gm, initial: { sessionId, uidHash: 'original-gm-hash' }, started: await gm.observe(),
    roster, directory: '/tmp/base-movement-consumer-test' };
  await assert.rejects(runBaseGameplay(context, integration), error => error === stopAtOpeningWolf,
    'Drive the real runner through its Cycle 1 movement handoff to the opening Wolf boundary.');
  assert.ok(coordinationContext, 'The real runner must invoke the existing Cycle 1 Coordination consumer.');
  assert.equal(coordinationContext.shuttleOriginAuthority, undefined,
    'Actor-changing Coordination work must finish before the runner captures the movement origin.');
  assert.ok(movementContext, 'The runner must invoke the bounded Core movement-only consumer.');
  assert.equal(JSON.stringify(movementContext.shuttleOriginAuthority), JSON.stringify(origin),
    'The runner must carry the fresh admitted Core source origin into the movement-only consumer.');
  assert.equal(arrivalInvocations.length, 1,
    'The arrival-only observer must execute once after the actual source retarget becomes current.');
  assert.equal(manualArrivalInvocations.length, 0,
    'The auto-arrival consumer must not fall back to or cross into the separate manual-ready consumer.');
  const invocation = arrivalInvocations[0];
  assert.equal(JSON.stringify(invocation.context.shuttleOriginAuthority), JSON.stringify(origin));
  assert.equal(JSON.stringify(invocation.context.shuttleArrivalWitness), JSON.stringify(arrivalWitness),
    'Arrival must keep the exact original retarget witness.');
  assert.equal(invocation.source.transitRequestId, arrivalWitness.transitRequestId);
  assert.equal(invocation.source.revision, arrivalWitness.transitRevision);
  assert.equal(invocation.source.destinationShipId, arrivalWitness.destinationShipId);
  assert.equal(Date.parse(invocation.source.arrivesAt) - invocation.at, 35_000,
    'Arm against the actual current source arrivesAt in the existing 1–35 second window.');
  assert.ok(sourceMovementReads.length > 0, 'Read the current server shuttleDepartures source before arming.');
});

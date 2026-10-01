import { describe, expect, it } from 'vitest';
import { activeVesselIdsForRoles } from './gameSetup';
import { SCOUT_TAXI_COMMUNICATION_PATH } from './fleetGroups';
import { planScoutTaxiCommunication } from './scoutTaxiCommunication';

const activeRoleIds = [
  'wing-commander', 'quellon-explorer', 'shepherd-scientist', 'dione-captain',
];
const activeVesselIds = activeVesselIdsForRoles(activeRoleIds);
const groups = [
  {
    id: 'fleet-1', vesselIds: ['aegis', 'quellon'],
    memberUids: ['starlight-owner', 'hummingbird-owner'],
  },
  { id: 'fleet-2', vesselIds: ['shepherd', 'dione'], memberUids: ['target-player'] },
];
const coordinates = { aegis: '0000', quellon: '0000', shepherd: '5143', dione: '6931' };
const turnPhase = {
  turn: 4,
  teamPhaseEndsAt: '2099-09-21T12:00:00.000Z',
  openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
  airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
};

function actor(patch: Record<string, unknown> = {}) {
  return {
    uid: 'starlight-owner',
    active: true,
    playerRole: 'player',
    connected: true,
    assignedRoleId: 'wing-commander',
    seatId: 'wing-commander',
    replacementRoleId: null,
    fleetGroupId: 'fleet-1',
    activeRoleIds,
    activeVesselIds,
    ...patch,
  };
}

function request(patch: Record<string, unknown> = {}) {
  return {
    sessionId: 'session-1',
    requestId: 'taxi-1',
    shuttleId: 'starlight',
    targetShipId: 'shepherd',
    text: 'Copy the new rendezvous point.',
    expectedCycle: 4,
    expectedControlRevision: 2,
    expectedNavigationRevision: 8,
    ...patch,
  };
}

function control(shuttleId: string, ownerRoleId: string, ownerUid: string, revision: number) {
  return { shuttleId, ownerRoleId, ownerUid, holderUid: ownerUid, revision };
}

function baseInput(patch: Record<string, unknown> = {}) {
  return {
    request: request(),
    sessionId: 'session-1',
    actorUid: 'starlight-owner',
    actor: actor(),
    currentCycle: 4,
    sessionPhase: 'active',
    turnPhase,
    now: Date.parse('2099-09-21T12:01:00.000Z'),
    chartId: 'A',
    shuttleControl: {
      starlight: control('starlight', 'wing-commander', 'starlight-owner', 2),
      hummingbird: control('hummingbird', 'quellon-explorer', 'hummingbird-owner', 5),
      endeavour: control('endeavour', 'shepherd-scientist', 'other-owner', 1),
    },
    shuttleDockings: [
      { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'session-start' },
      { shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'session-start' },
      { shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'session-start' },
    ],
    pendingDeparture: undefined,
    transit: undefined,
    activeRoleIds,
    activeVesselIds,
    fleetGroups: groups,
    shipGalacticCoordinates: coordinates,
    navigationRevision: 8,
    cadence: undefined,
    maintenanceCycles: {},
    shuttleFuelled: {},
    ...patch,
  };
}

function firstStarlightScan(targetCoordinate = '5143') {
  return {
    type: 'scout-request',
    sourceId: 'starlight',
    ownerRoleId: 'wing-commander',
    anchorShipId: 'aegis',
    attempt: 1,
    cycle: 4,
    originCoordinate: '0000',
    targetCoordinate,
    distance: 1,
  };
}

describe('P151 scout-taxi communication plan', () => {
  it('plans one bounded cross-group courier note and consumes the existing Starlight cadence', () => {
    const plan = planScoutTaxiCommunication(baseInput());

    expect(plan).toMatchObject({
      authorityPath: SCOUT_TAXI_COMMUNICATION_PATH,
      sessionId: 'session-1', requestId: 'taxi-1', actorUid: 'starlight-owner',
      cycle: 4, shuttleId: 'starlight', ownerRoleId: 'wing-commander',
      anchorShipId: 'aegis', controlRevision: 2, navigationRevision: 8,
      origin: { groupId: 'fleet-1', shipId: 'aegis', coordinate: '0000' },
      target: { groupId: 'fleet-2', shipId: 'shepherd', coordinate: '5143' },
      distance: 1, attempt: 1, text: 'Copy the new rendezvous point.',
      nextCadence: {
        sessionId: 'session-1', entitlementId: 'starlight', cycle: 4,
        scans: [{
          requestId: 'taxi-1', actorUid: 'starlight-owner',
          scan: { ...firstStarlightScan(), attempt: 1 },
        }],
      },
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.origin)).toBe(true);
    expect(Object.isFrozen(plan.target)).toBe(true);
    expect(Object.isFrozen(plan.nextCadence.scans)).toBe(true);
    expect(plan).not.toHaveProperty('passengers');
    expect(plan).not.toHaveProperty('fuel');
    expect(plan).not.toHaveProperty('revealedCoordinates');
    expect(plan).not.toHaveProperty('pursuit');
  });

  it('uses Hummingbird current Quellon position and printed three-jump taxi range', () => {
    const result = planScoutTaxiCommunication(baseInput({
      request: request({
        requestId: 'hummingbird-taxi', shuttleId: 'hummingbird', targetShipId: 'dione',
        expectedControlRevision: 5,
      }),
      actorUid: 'hummingbird-owner',
      actor: actor({
        uid: 'hummingbird-owner', assignedRoleId: 'quellon-explorer',
        seatId: 'quellon-explorer', fleetGroupId: 'fleet-1',
      }),
    }));

    expect(result).toMatchObject({
      shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', anchorShipId: 'quellon',
      origin: { groupId: 'fleet-1', shipId: 'quellon', coordinate: '0000' },
      target: { groupId: 'fleet-2', shipId: 'dione', coordinate: '6931' },
      distance: 3, attempt: 1,
      nextCadence: { entitlementId: 'hummingbird', scans: [{ scan: { attempt: 1, distance: 3 } }] },
    });
  });

  it('permits Starlight’s fuelled second attempt only under the existing cadence policy', () => {
    const result = planScoutTaxiCommunication(baseInput({
      request: request({ targetShipId: 'dione' }),
      shipGalacticCoordinates: { ...coordinates, dione: '1413' },
      cadence: {
        sessionId: 'session-1', entitlementId: 'starlight', cycle: 4,
        scans: [{ requestId: 'first-scan', actorUid: 'starlight-owner', scan: firstStarlightScan() }],
      },
      maintenanceCycles: { aegis: { turn: 4, step: 7, refuelled: ['starlight'] } },
      shuttleFuelled: { starlight: true },
    }));

    expect(result).toMatchObject({
      target: { shipId: 'dione', coordinate: '1413' },
      distance: 1, attempt: 2,
      nextCadence: {
        scans: [
          { requestId: 'first-scan', scan: { attempt: 1 } },
          { requestId: 'taxi-1', actorUid: 'starlight-owner', scan: { attempt: 2, firstTargetCoordinate: '5143' } },
        ],
      },
    });
  });

  it.each([
    ['a claimed source group', { sourceGroupId: 'fleet-1' }],
    ['a claimed coordinate', { originCoordinate: '0000' }],
    ['passenger data', { riders: ['target-player'] }],
    ['fuel data', { fuel: 2 }],
  ])('rejects client-supplied %s', (_label, extra) => {
    expect(() => planScoutTaxiCommunication(baseInput({ request: request(extra) }))).toThrow();
  });

  it.each([
    ['the ordinary Endeavour scanner', { shuttleId: 'endeavour' }],
    ['a Comms Officer', { shuttleId: 'comms-officer' }],
    ['an unprinted craft', { shuttleId: 'pallas' }],
  ])('rejects %s as a taxi craft', (_label, command) => {
    expect(() => planScoutTaxiCommunication(baseInput({ request: request(command) }))).toThrow();
  });

  it.each([
    ['the inactive actor', { actor: actor({ active: false }) }],
    ['the disconnected actor', { actor: actor({ connected: false }) }],
    ['the wrong assigned role', { actor: actor({ assignedRoleId: 'admiral' }) }],
    ['the wrong seat', { actor: actor({ seatId: 'admiral' }) }],
    ['a replacement-role holder', { actor: actor({ replacementRoleId: 'comms-officer' }) }],
    ['a different shuttle holder', { shuttleControl: {
      starlight: { ...control('starlight', 'wing-commander', 'starlight-owner', 2), holderUid: 'other-player' },
    } }],
    ['a different recorded owner', { shuttleControl: {
      starlight: { ...control('starlight', 'wing-commander', 'other-player', 2), holderUid: 'starlight-owner' },
    } }],
  ])('fails closed for %s', (_label, patch) => {
    expect(() => planScoutTaxiCommunication(baseInput(patch))).toThrow();
  });

  it.each([
    ['a stale cycle', { currentCycle: 5 }],
    ['a stale control revision', { request: request({ expectedControlRevision: 1 }) }],
    ['a stale navigation revision', { request: request({ expectedNavigationRevision: 7 }) }],
    ['a stale phase cycle', { turnPhase: { ...turnPhase, turn: 3 } }],
    ['a non-active session', { sessionPhase: 'lobby' }],
    ['team phase', { turnPhase: { ...turnPhase, airspace: { ...turnPhase.airspace, state: 'restricted' } } }],
    ['expired airspace', { now: Date.parse('2099-09-21T12:16:00.000Z') }],
    ['paused airspace', { turnPhase: { ...turnPhase, timerPause: {
      window: 'open', remainingMs: 60_000, pausedAt: '2099-09-21T12:01:00.000Z',
    } } }],
  ])('rejects %s', (_label, patch) => {
    expect(() => planScoutTaxiCommunication(baseInput(patch))).toThrow();
  });

  it.each([
    ['a pending departure', { pendingDeparture: {
      status: 'requested', requestId: 'depart-1', shuttleId: 'starlight',
      holderUid: 'starlight-owner', fleetGroupId: 'fleet-1', originShipId: 'aegis',
      destinationShipId: 'quellon', cycle: 4, controlRevision: 2,
      requestedAt: '2099-09-21T12:01:00.000Z',
    } }],
    ['transit', { transit: { status: 'in-transit' } }],
    ['a different dock', { shuttleDockings: [
      { shuttleId: 'starlight', shipId: 'quellon', dockedAt: 'session-start' },
      { shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'session-start' },
      { shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'session-start' },
    ] }],
    ['missing docking state', { shuttleDockings: undefined }],
  ])('rejects %s', (_label, patch) => {
    expect(() => planScoutTaxiCommunication(baseInput(patch))).toThrow();
  });

  it.each([
    ['the origin group', { targetShipId: 'quellon' }],
    ['an inactive ship', { targetShipId: 'capybara' }],
    ['a shuttle', { targetShipId: 'starlight' }],
  ])('rejects %s as the target host', (_label, command) => {
    expect(() => planScoutTaxiCommunication(baseInput({ request: request(command) }))).toThrow();
  });

  it('rejects same-group targets and incomplete or duplicated group authority', () => {
    expect(() => planScoutTaxiCommunication(baseInput({
      fleetGroups: [{
        id: 'fleet-1', vesselIds: activeVesselIds,
        memberUids: ['starlight-owner', 'hummingbird-owner', 'target-player'],
      }],
    }))).toThrow(/different fleet groups/i);

    expect(() => planScoutTaxiCommunication(baseInput({
      fleetGroups: [groups[0]],
    }))).toThrow();

    expect(() => planScoutTaxiCommunication(baseInput({
      fleetGroups: [groups[0], { ...groups[1], vesselIds: ['shepherd', 'shepherd'] }],
    }))).toThrow();
  });

  it('rejects absent current fixes and routes outside the printed shuttle range', () => {
    expect(() => planScoutTaxiCommunication(baseInput({
      shipGalacticCoordinates: { ...coordinates, dione: '9999' },
    }))).toThrow();

    expect(() => planScoutTaxiCommunication(baseInput({
      request: request({ targetShipId: 'dione' }),
    }))).toThrow(/range|jump/i);

    const hummingbirdInput = baseInput({
      request: request({ shuttleId: 'hummingbird', targetShipId: 'dione', expectedControlRevision: 5 }),
      actorUid: 'hummingbird-owner',
      actor: actor({
        uid: 'hummingbird-owner', assignedRoleId: 'quellon-explorer',
        seatId: 'quellon-explorer', fleetGroupId: 'fleet-1',
      }),
      shipGalacticCoordinates: { ...coordinates, dione: '4888' },
    });
    expect(() => planScoutTaxiCommunication(hummingbirdInput)).toThrow(/range|jump/i);
  });

  it('enforces one Hummingbird attempt and Starlight fuel and distinct-target rules', () => {
    const hummingbirdBase = baseInput({
      request: request({ shuttleId: 'hummingbird', targetShipId: 'dione', expectedControlRevision: 5 }),
      actorUid: 'hummingbird-owner',
      actor: actor({
        uid: 'hummingbird-owner', assignedRoleId: 'quellon-explorer',
        seatId: 'quellon-explorer', fleetGroupId: 'fleet-1',
      }),
    });
    expect(() => planScoutTaxiCommunication({
      ...hummingbirdBase,
      cadence: {
        sessionId: 'session-1', entitlementId: 'hummingbird', cycle: 4,
        scans: [{
          requestId: 'already-used', actorUid: 'hummingbird-owner',
          scan: {
            type: 'scout-request', sourceId: 'hummingbird', ownerRoleId: 'quellon-explorer',
            anchorShipId: 'quellon', attempt: 1, cycle: 4,
            originCoordinate: '0000', targetCoordinate: '6931', distance: 3,
          },
        }],
      },
    })).toThrow();

    const secondAttempt = baseInput({
      request: request({ targetShipId: 'dione' }),
      shipGalacticCoordinates: { ...coordinates, dione: '1413' },
      cadence: {
        sessionId: 'session-1', entitlementId: 'starlight', cycle: 4,
        scans: [{ requestId: 'first-scan', actorUid: 'starlight-owner', scan: firstStarlightScan() }],
      },
    });
    expect(() => planScoutTaxiCommunication(secondAttempt)).toThrow();
    expect(() => planScoutTaxiCommunication({
      ...secondAttempt,
      maintenanceCycles: { aegis: { turn: 4, step: 7, refuelled: ['starlight'] } },
      shuttleFuelled: { starlight: true },
      cadence: {
        sessionId: 'session-1', entitlementId: 'starlight', cycle: 4,
        scans: [{ requestId: 'first-scan', actorUid: 'starlight-owner', scan: firstStarlightScan('1413') }],
      },
    })).toThrow(/distinct/i);
  });
});

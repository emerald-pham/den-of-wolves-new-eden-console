import { describe, expect, it } from 'vitest';
import { memberSessionProjection, memberSessionScope } from './memberSession';
import { emptySmallShipState } from './smallShip';
import { emptyVoyage33MaintenanceState } from './voyage33Maintenance';
import { VOYAGE_33_COMMITMENTS } from './voyageAdmission';

const player = { uid: 'crew', connected: true, role: 'player', fleetGroupId: 'fleet-2', connectionGeneration: 3 };
const groups = [
  { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['foreign'] },
  { id: 'fleet-2', vesselIds: ['shepherd'], memberUids: ['crew'] },
];
const root = {
  id: 'session', name: 'Table', phase: 'active', currentTurn: 2,
  turnPhase: { turn: 2, phase: 'team', deadlineAt: '2026-10-02T12:00:00.000Z' },
  activeVesselIds: ['aegis', 'shepherd'], activeRoleIds: ['executive-officer', 'shepherd-captain'], fleetPartitionRevision: 2,
  shipResources: { aegis: { fuel: 91 }, shepherd: { fuel: 4 } },
  maintenanceCycles: { aegis: { revision: 2 }, shepherd: { revision: 3 } },
  shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis' }, { shuttleId: 'endeavour', shipId: 'shepherd' }],
  shuttleControl: { starlight: { holderUid: 'foreign' }, endeavour: { holderUid: 'crew' } },
  shuttleCargo: { starlight: { fuel: 9 }, endeavour: { fuel: 1 } },
  shuttleVisitLog: [
    { shuttleId: 'endeavour', shipId: 'aegis', id: 'private-history' },
    { shuttleId: 'endeavour', shipId: 'shepherd', id: 'current-local' },
  ],
  missionCraftCommitments: { starlight: { missionId: 'hidden-card' } },
  shipGalacticCoordinates: { aegis: '9876', shepherd: '3145' },
  voyage33Movement: { coordinate: 'private' }, facilitatorNotes: 'hidden',
  fleetTicker: { revision: 2 }, pressHolderUid: 'press', createdAt: '2026-10-02T11:00:00.000Z',
};

describe('current member session privacy', () => {
  it('uses the live group tuple and rejects disconnected or stale membership', () => {
    expect(memberSessionScope(player, groups)).toEqual({ groupId: 'fleet-2', vesselIds: ['shepherd'] });
    expect(() => memberSessionScope({ ...player, connected: false }, groups)).toThrow();
    expect(() => memberSessionScope({ ...player, fleetGroupId: 'fleet-1' }, groups)).toThrow();
    expect(() => memberSessionScope(player, [...groups, { ...groups[1]!, id: 'fleet-3' }])).toThrow();
  });

  it('retains the one shared clock and only current group vessel and craft state', () => {
    const value = memberSessionProjection(root, memberSessionScope(player, groups));
    expect(value.turnPhase).toEqual(root.turnPhase);
    expect(value.currentTurn).toBe(2);
    expect(value.fleetPartitionRevision).toBe(2);
    expect(value.shipResources).toEqual({ shepherd: { fuel: 4 } });
    expect(value.maintenanceCycles).toEqual({ shepherd: { revision: 3 } });
    expect(value.shuttleDockings).toEqual([{ shuttleId: 'endeavour', shipId: 'shepherd' }]);
    expect(value.shuttleControl).toEqual({ endeavour: { holderUid: 'crew' } });
    expect(value.shuttleCargo).toEqual({ endeavour: { fuel: 1 } });
    expect(value.shuttleVisitLog).toEqual([{ shuttleId: 'endeavour', shipId: 'shepherd', id: 'current-local' }]);
    for (const key of ['missionCraftCommitments', 'shipGalacticCoordinates', 'voyage33Movement', 'facilitatorNotes', 'pressHolderUid']) {
      expect(value).not.toHaveProperty(key);
    }
    expect(value.pressClaimed).toBe(true);
  });

  it('removes craft immediately when its authoritative host moves to another group', () => {
    const value = memberSessionProjection({ ...root, shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'aegis' }] }, memberSessionScope(player, groups));
    expect(value.shuttleDockings).toEqual([]);
    expect(value.shuttleControl).toEqual({});
    expect(value.shuttleCargo).toEqual({});
    expect(value.shuttleVisitLog).toEqual([]);
  });

  it('provides Press only the shared public header, without operational maps', () => {
    const scope = memberSessionScope({ ...player, activeConsoleRoleId: 'press-officer' }, groups);
    const value = memberSessionProjection(root, scope);
    expect(value.turnPhase).toEqual(root.turnPhase);
    expect(value.fleetTicker).toEqual(root.fleetTicker);
    expect(value.shipResources).toEqual({});
    expect(value.shuttleDockings).toEqual([]);
  });

  it('does not spread newly introduced private fields into the public DTO', () => {
    const value = memberSessionProjection({ ...root, futureSecret: { entire: 'private' } }, memberSessionScope(player, groups));
    expect(value).not.toHaveProperty('futureSecret');
  });

  it('shows the elected President the resolved-crisis award status without exposing office-owner UIDs', () => {
    const value = memberSessionProjection({ ...root,
      currentMemberIsPresident: true,
      presidentialOffices: { electionId: 'current', revision: 1,
        presidentCandidateId: 'candidate-amber', presidentDisplayName: 'Candidate A', decidedCycle: 2 },
      resolvedCrisisOutcome: { crisisId: 'crisis-1', revision: 4, title: 'Approaching Vessel',
        capitalApplied: false, capitalDelta: 0 },
      politicalCapital: { revision: 8, balance: 8, entries: [] },
    }, memberSessionScope(player, groups));
    expect(value).toMatchObject({ currentMemberIsPresident: true,
      resolvedCrisisOutcome: { crisisId: 'crisis-1', capitalApplied: false, capitalDelta: 0 } });
    expect(value.presidentialOffices).not.toHaveProperty('presidentUid');
    expect(value.presidentialOffices).not.toHaveProperty('vicePresidentUid');
  });

  it('keeps validated hosted small vessels with their current group and withdraws foreign hosts', () => {
    const local = { ...emptySmallShipState('gorgoneion', 'shepherd'), dockingRevision: 1 };
    const foreign = { ...emptySmallShipState('warrior', 'aegis'), dockingRevision: 1 };
    const value = memberSessionProjection({ ...root, smallShipStates: { gorgoneion: local, warrior: foreign },
      shipDamage: { gorgoneion: { destroyed: false }, warrior: { destroyed: false } },
      gorgoneionRepairDrones: { cycle: 2, revision: 1, hostShipId: 'shepherd', systemId: 'reactor' },
      warriorRepairDrones: { cycle: 2, revision: 2, hostShipId: 'aegis', systemIds: ['reactor'] },
    }, memberSessionScope(player, groups));
    expect(value.smallShipStates).toEqual({ gorgoneion: local });
    expect(value.shipDamage).toEqual({ gorgoneion: { destroyed: false } });
    expect(value.gorgoneionRepairDrones).toEqual({ cycle: 2, revision: 1, hostShipId: 'shepherd', systemId: 'reactor' });
    expect(value).not.toHaveProperty('warriorRepairDrones');
    expect(recordScope(value).vesselIds).toEqual(['shepherd', 'gorgoneion']);
    const malformed = memberSessionProjection({ ...root, smallShipStates: { gorgoneion: { ...local, dockingRevision: 0 } } }, memberSessionScope(player, groups));
    expect(malformed.smallShipStates).toEqual({});
  });

  it('keeps Voyage admission and maintenance at its validated current host without coordinates', () => {
    const maintenance = { ...emptyVoyage33MaintenanceState('shepherd'), dockingRevision: 1 };
    const admission = { type: 'voyage-admission', sessionId: 'session', id: 'voyage-33-0', status: 'admitted',
      crisisId: 'crisis-1', crisisRevision: 1, population: 40000, unrest: 0, hostShipId: null, commitments: VOYAGE_33_COMMITMENTS };
    const source = { ...root, voyage33Admission: admission, voyage33Maintenance: maintenance, admittedVesselIds: ['voyage-33-0'] };
    const value = memberSessionProjection(source, memberSessionScope(player, groups));
    expect(value.voyage33Admission).toEqual(admission);
    expect(value.voyage33Maintenance).toEqual(maintenance);
    expect(value.admittedVesselIds).toEqual(['voyage-33-0']);
    expect(value).not.toHaveProperty('voyage33Movement');
    const moved = memberSessionProjection({ ...source, voyage33Maintenance: { ...maintenance, hostShipId: 'aegis' } }, memberSessionScope(player, groups));
    expect(moved).not.toHaveProperty('voyage33Admission');
    expect(moved).not.toHaveProperty('voyage33Maintenance');
  });

  it('preserves repair usage without disclosing other-group host details or GM alert recipients', () => {
    const value = memberSessionProjection({ ...root,
      shuttleDockings: [{ shuttleId: 'philia', shipId: 'shepherd' }],
      philiaRepairs: { cycle: 2, revision: 2, hosts: [{ shipId: 'aegis', systemIds: ['reactor'] }, { shipId: 'dione', systemIds: ['storage'] }] },
      populationAlerts: { shepherd: { targetGmInstanceIds: ['hidden-gm'] } },
      unrestAlerts: { shepherd: { targetGmInstanceIds: ['hidden-gm'] } },
    }, memberSessionScope(player, groups));
    expect(value.philiaRepairs).toEqual({ cycle: 2, revision: 2, totalHostsUsed: 2, hosts: [] });
    expect(value.populationAlerts).toEqual({});
    expect(value.unrestAlerts).toEqual({});
  });

  it.each([['blacksmithRepairs','blacksmith'],['macawRepairs','macaw'],['chacauRepairs','chacau'],['allyRepairs','ally']])(
    'redacts previous foreign hosts in %s while retaining its printed usage count', (field, shuttleId) => {
      const value = memberSessionProjection({ ...root,
        shuttleDockings: [{ shuttleId, shipId: 'shepherd' }],
        [field!]: { cycle: 2, revision: 2, hosts: [{ shipId: field === 'allyRepairs' ? 'shepherd' : 'aegis', systemIds: ['reactor'] }, { shipId: 'icebreaker', systemIds: ['storage'] }] },
      }, memberSessionScope(player, groups));
      expect(value[field!]).toEqual({ cycle: 2, revision: 2, totalHostsUsed: 2,
        hosts: field === 'allyRepairs' ? [{ shipId: 'shepherd', systemIds: ['reactor'] }] : [] });
    });

  it('keeps prior drone/recharge usage without foreign host or system details', () => {
    const value = memberSessionProjection({ ...root,
      shuttleDockings: [...root.shuttleDockings, { shuttleId: 'wobbly', shipId: 'shepherd' }],
      smallShipStates: { gorgoneion: { ...emptySmallShipState('gorgoneion', 'shepherd'), dockingRevision: 1 },
        warrior: { ...emptySmallShipState('warrior', 'shepherd'), dockingRevision: 1 } },
      gorgoneionRepairDrones: { cycle: 2, revision: 1, hostShipId: 'aegis', systemId: 'reactor' },
      warriorRepairDrones: { cycle: 2, revision: 1, hostShipId: 'icebreaker', systemIds: ['storage'] },
      serviceShuttleRecharges: { wobbly: { cycle: 2, revision: 1, hostShipId: 'aegis', consoleId: 'jump-drive' } },
    }, memberSessionScope(player, groups));
    expect(value.gorgoneionRepairDrones).toEqual({ cycle: 2, revision: 1, redacted: true });
    expect(value.warriorRepairDrones).toEqual({ cycle: 2, revision: 1, redacted: true });
    expect(value.serviceShuttleRecharges).toEqual({ wobbly: { cycle: 2, revision: 1, redacted: true } });
  });
});

function recordScope(value: Record<string, unknown>) { return value.memberSessionScope as { vesselIds: string[] }; }

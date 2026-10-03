import { describe, expect, it } from 'vitest';
import { memberSessionProjection, memberSessionScope } from './memberSession';

const player = { uid: 'crew', connected: true, role: 'player', fleetGroupId: 'fleet-2', connectionGeneration: 3 };
const groups = [
  { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['foreign'] },
  { id: 'fleet-2', vesselIds: ['shepherd'], memberUids: ['crew'] },
];
const root = {
  id: 'session', name: 'Table', phase: 'active', currentTurn: 2,
  turnPhase: { turn: 2, phase: 'team', deadlineAt: '2026-10-02T12:00:00.000Z' },
  activeVesselIds: ['aegis', 'shepherd'], activeRoleIds: ['executive-officer', 'shepherd-captain'],
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
});

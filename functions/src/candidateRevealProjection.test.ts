import { describe, expect, it } from 'vitest';
import { candidateRevealProjectionForCurrentFleetMember } from './candidateRevealProjection';

type Snapshot = {
  id: string;
  ref: { path: string };
  exists: boolean;
  data: () => unknown;
};

const snapshot = (id: string, path: string, data: unknown, exists = true): Snapshot => ({
  id,
  ref: { path },
  exists,
  data: () => data,
});

const candidateHistory = (
  coordinate: string,
  code: 'N' | 'O' | 'P',
  title: string,
  source: 'arrival' | 'scout' = 'arrival',
) => ({
  [coordinate]: {
    coordinate,
    candidateDiscovery: {
      id: `${source}-${code}`,
      occurredAt: '2026-09-23T14:00:00.000Z',
      code,
      title,
      source,
    },
  },
});

const sessionId = 's1';
const sessionPath = `sessions/${sessionId}`;

const baseAuthority = () => ({
  sessionId,
  sessionSnapshot: snapshot(sessionId, sessionPath, {
    phase: 'active',
    chartId: 'A',
    chartSelectionLocked: true,
    configurationLocked: false,
    activeVesselIds: ['aegis', 'dione', 'quellon'],
  }),
  navigationSnapshot: snapshot('navigation', `${sessionPath}/serverState/navigation`, {
    systemHistory: {
      dione: candidateHistory('0408', 'O', 'Deep Nebula'),
      quellon: candidateHistory('4888', 'P', 'Ancient Space Station'),
    },
  }),
  playerSnapshots: [
    snapshot('u1', `${sessionPath}/players/u1`, { role: 'player', fleetGroupId: 'fleet-1' }),
    snapshot('u2', `${sessionPath}/players/u2`, { role: 'player', fleetGroupId: 'fleet-1' }),
    snapshot('u3', `${sessionPath}/players/u3`, { role: 'player', fleetGroupId: 'fleet-2' }),
  ],
  fleetGroupSnapshots: [
    snapshot('fleet-1', `${sessionPath}/fleetGroups/fleet-1`, {
      id: 'fleet-1', vesselIds: ['aegis', 'dione'], memberUids: ['u1', 'u2'],
    }),
    snapshot('fleet-2', `${sessionPath}/fleetGroups/fleet-2`, {
      id: 'fleet-2', vesselIds: ['quellon'], memberUids: ['u3'],
    }),
  ],
  recipientUid: 'u1',
});

describe('current-group candidate reveal projection', () => {
  it('shares only discovered candidate identity from the exact current fleet group', () => {
    const projection = candidateRevealProjectionForCurrentFleetMember(baseAuthority());

    expect(projection).toEqual({
      sessionId,
      recipientUid: 'u1',
      recipientPath: `${sessionPath}/playerDiscoveries/u1`,
      candidateReveals: [{ code: 'O', title: 'Deep Nebula' }],
    });
    expect(projection?.candidateReveals[0]).not.toHaveProperty('coordinate');
    expect(projection?.candidateReveals[0]).not.toHaveProperty('summary');
    expect(projection?.candidateReveals[0]).not.toHaveProperty('bonus');
  });

  it('derives the chart and candidate history only from path-bound session and navigation snapshots', () => {
    const baseline = baseAuthority();
    const wrongChartSite = { aegis: candidateHistory('0408', 'N', 'Ancient Jump Ring') };
    const chartBSession = snapshot(sessionId, sessionPath, {
      ...baseline.sessionSnapshot.data() as object,
      chartId: 'B',
    });
    const chartBNavigation = snapshot('navigation', `${sessionPath}/serverState/navigation`, {
      systemHistory: wrongChartSite,
    });

    expect(candidateRevealProjectionForCurrentFleetMember({
      ...baseline, navigationSnapshot: snapshot('navigation', `${sessionPath}/serverState/navigation`, {
        systemHistory: wrongChartSite,
      }),
    })?.candidateReveals).toEqual([]);
    expect(candidateRevealProjectionForCurrentFleetMember({
      ...baseline, sessionSnapshot: chartBSession, navigationSnapshot: chartBNavigation,
    })?.candidateReveals).toEqual([{ code: 'N', title: 'Ancient Jump Ring' }]);
  });

  it.each([
    ['another session document', { sessionSnapshot: snapshot('s2', 'sessions/s2', {
      phase: 'active', chartId: 'A', chartSelectionLocked: true,
      activeVesselIds: ['aegis', 'dione', 'quellon'],
    }) }],
    ['a mismatched session path', { sessionSnapshot: snapshot('s1', 'sessions/s2', {
      phase: 'active', chartId: 'A', chartSelectionLocked: true,
      activeVesselIds: ['aegis', 'dione', 'quellon'],
    }) }],
    ['a missing session snapshot', { sessionSnapshot: snapshot(sessionId, sessionPath, {}, false) }],
    ['a terminal session', { sessionSnapshot: snapshot(sessionId, sessionPath, {
      ...baseAuthority().sessionSnapshot.data() as object, phase: 'debrief',
    }) }],
    ['an unlocked chart', { sessionSnapshot: snapshot(sessionId, sessionPath, {
      ...baseAuthority().sessionSnapshot.data() as object,
      chartSelectionLocked: false, configurationLocked: false,
    }) }],
    ['an unknown chart', { sessionSnapshot: snapshot(sessionId, sessionPath, {
      ...baseAuthority().sessionSnapshot.data() as object, chartId: 'D',
    }) }],
    ['another session navigation snapshot', {
      navigationSnapshot: snapshot('navigation', 'sessions/s2/serverState/navigation', {
        systemHistory: baseAuthority().navigationSnapshot.data(),
      }),
    }],
    ['a navigation snapshot with a mismatched document ID', {
      navigationSnapshot: snapshot('navigation-copy', `${sessionPath}/serverState/navigation`, {
        systemHistory: baseAuthority().navigationSnapshot.data(),
      }),
    }],
    ['a missing navigation snapshot', {
      navigationSnapshot: snapshot('navigation', `${sessionPath}/serverState/navigation`, {}, false),
    }],
    ['a missing selected chart', { sessionSnapshot: snapshot(sessionId, sessionPath, {
      phase: 'active', activeVesselIds: ['aegis', 'dione', 'quellon'],
      chartSelectionLocked: true,
    }) }],
  ] as const)('denies projection for %s', (_label, override) => {
    expect(candidateRevealProjectionForCurrentFleetMember({
      ...baseAuthority(), ...override,
    })).toBeUndefined();
  });

  it.each([
    ['a missing recipient snapshot', { playerSnapshots: baseAuthority().playerSnapshots.slice(1) }],
    ['a recipient snapshot at another path', {
      playerSnapshots: [
        snapshot('u1', `${sessionPath}/players/u2`, { fleetGroupId: 'fleet-1' }),
        ...baseAuthority().playerSnapshots.slice(1),
      ],
    }],
    ['a kicked recipient', {
      playerSnapshots: [
        snapshot('u1', `${sessionPath}/players/u1`, { role: 'player', fleetGroupId: 'fleet-1', kickedAt: 'kicked' }),
        ...baseAuthority().playerSnapshots.slice(1),
      ],
    }],
    ['a facilitator recipient', {
      playerSnapshots: [
        snapshot('u1', `${sessionPath}/players/u1`, { role: 'gm', fleetGroupId: 'fleet-1' }),
        ...baseAuthority().playerSnapshots.slice(1),
      ],
    }],
    ['a stale player group pointer', {
      playerSnapshots: [
        snapshot('u1', `${sessionPath}/players/u1`, { fleetGroupId: 'fleet-2' }),
        ...baseAuthority().playerSnapshots.slice(1),
      ],
    }],
    ['a group whose snapshot path and ID disagree', {
      fleetGroupSnapshots: [
        snapshot('fleet-1', `${sessionPath}/fleetGroups/fleet-2`, {
          id: 'fleet-1', vesselIds: ['aegis', 'dione'], memberUids: ['u1', 'u2'],
        }),
        baseAuthority().fleetGroupSnapshots[1],
      ],
    }],
    ['a group whose snapshot ID and data disagree', {
      fleetGroupSnapshots: [
        snapshot('fleet-1', `${sessionPath}/fleetGroups/fleet-1`, {
          id: 'fleet-3', vesselIds: ['aegis', 'dione'], memberUids: ['u1', 'u2'],
        }),
        baseAuthority().fleetGroupSnapshots[1],
      ],
    }],
    ['duplicate current-group membership', {
      fleetGroupSnapshots: [
        ...baseAuthority().fleetGroupSnapshots,
        snapshot('fleet-3', `${sessionPath}/fleetGroups/fleet-3`, {
          id: 'fleet-3', vesselIds: ['quellon'], memberUids: ['u1'],
        }),
      ],
    }],
    ['overlapping vessel membership', {
      fleetGroupSnapshots: [
        ...baseAuthority().fleetGroupSnapshots,
        snapshot('fleet-3', `${sessionPath}/fleetGroups/fleet-3`, {
          id: 'fleet-3', vesselIds: ['aegis'], memberUids: ['u4'],
        }),
      ],
    }],
    ['incomplete active-vessel membership', {
      fleetGroupSnapshots: [snapshot('fleet-1', `${sessionPath}/fleetGroups/fleet-1`, {
        id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1', 'u2'],
      })],
    }],
    ['incomplete active-player membership', {
      fleetGroupSnapshots: [
        snapshot('fleet-1', `${sessionPath}/fleetGroups/fleet-1`, {
          id: 'fleet-1', vesselIds: ['aegis', 'dione'], memberUids: ['u1'],
        }),
        baseAuthority().fleetGroupSnapshots[1],
      ],
    }],
  ] as const)('denies projection for %s', (_label, override) => {
    expect(candidateRevealProjectionForCurrentFleetMember({
      ...baseAuthority(), ...override,
    })).toBeUndefined();
  });

  it('does not reveal scout-derived discoveries, ordinary systems, or forged chart titles', () => {
    const projection = candidateRevealProjectionForCurrentFleetMember({
      ...baseAuthority(),
      navigationSnapshot: snapshot('navigation', `${sessionPath}/serverState/navigation`, {
        systemHistory: {
          aegis: candidateHistory('5143', 'N', 'Ancient Jump Ring'),
          dione: {
            ...candidateHistory('0408', 'O', 'Deep Nebula', 'scout'),
            '4888': candidateHistory('4888', 'P', 'Forged title')['4888'],
          },
        },
      }),
    });

    expect(projection?.candidateReveals).toEqual([]);
  });

  it('returns a fresh allowlisted projection without organiser maps or candidate bonuses', () => {
    const projection = candidateRevealProjectionForCurrentFleetMember({
      ...baseAuthority(),
      navigationSnapshot: snapshot('navigation', `${sessionPath}/serverState/navigation`, {
        systemHistory: {
          dione: {
            ...candidateHistory('0408', 'O', 'Deep Nebula'),
            organiserSites: { '6798': { code: 'N', name: 'Ancient Jump Ring' } },
            '4888': {
              coordinate: '4888',
              candidateDiscovery: {
                id: 'scout-p', occurredAt: '2026-09-23T14:00:00.000Z',
                code: 'P', title: 'Ancient Space Station', source: 'scout', accruedBonus: 3,
              },
            },
          },
        },
      }),
    });

    expect(projection?.candidateReveals).toEqual([{ code: 'O', title: 'Deep Nebula' }]);
    expect(JSON.stringify(projection)).not.toMatch(/organiserSites|accruedBonus|summary|coordinate|4888/);
  });
});

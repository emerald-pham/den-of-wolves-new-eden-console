import { expect, it } from 'vitest';
import { candidateRevealProjectionForCurrentFleetMember } from './candidateRevealProjection';
import { candidateDiscoveryFromScout } from './candidateDiscovery';

const snapshot = (path: string, data: Record<string, unknown>) => ({
  id: path.split('/').at(-1), ref: { path }, exists: true, data: () => data,
});

it('projects a committed scout candidate to its current group and keeps organiser facts hidden', () => {
  const systemHistory = candidateDiscoveryFromScout(undefined, 'aegis', {
    type: 'private-scout-result', sessionId: 's1', requestId: 'scan-1', requesterUid: 'u1',
    sourceId: 'starlight', cycle: 4, targetCoordinate: '0408',
    systemFact: { coordinate: '0408', code: 'O', title: 'Deep Nebula' },
  }, '2026-10-05T12:00:00.000Z');
  const projection = candidateRevealProjectionForCurrentFleetMember({
    sessionId: 's1', recipientUid: 'u1',
    sessionSnapshot: snapshot('sessions/s1', {
      phase: 'active', chartId: 'A', chartSelectionLocked: true, activeVesselIds: ['aegis', 'shepherd'],
    }),
    navigationSnapshot: snapshot('sessions/s1/serverState/navigation', { systemHistory }),
    playerSnapshots: [snapshot('sessions/s1/players/u1', { role: 'player', fleetGroupId: 'fleet-1' }),
      snapshot('sessions/s1/players/u2', { role: 'player', fleetGroupId: 'fleet-2' })],
    fleetGroupSnapshots: [snapshot('sessions/s1/fleetGroups/fleet-1', {
      id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1'],
    }), snapshot('sessions/s1/fleetGroups/fleet-2', {
      id: 'fleet-2', vesselIds: ['shepherd'], memberUids: ['u2'],
    })],
  });
  expect(projection?.candidateReveals).toEqual([{ code: 'O', title: 'Deep Nebula' }]);
  expect(JSON.stringify(projection)).not.toMatch(/0408|chartId|scoutCount/);
});

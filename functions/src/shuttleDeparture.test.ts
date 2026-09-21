import { expect, it } from 'vitest';
import { authorizeShuttleDeparture, parseShuttleDepartures } from './shuttleDeparture';
const now = Date.parse('2026-09-21T05:00:00.000Z');
const phase = {
  turn: 2,
  teamPhaseEndsAt: '2026-09-21T04:55:00.000Z',
  openAirspaceEndsAt: '2026-09-21T05:10:00.000Z',
  airspace: { state: 'lifted' as const, tickerActive: true, pressAccess: true },
};
const base = {
  requestId: 'depart-1', shuttleId: 'starlight', actorUid: 'holder',
  destinationShipId: 'icebreaker', expectedControlRevision: 3, expectedCycle: 2,
  control: {
    shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner',
    holderUid: 'holder', revision: 3,
  },
  dockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'start' }],
  group: { id: 'fleet-1', vesselIds: ['aegis', 'icebreaker'], memberUids: ['holder'] },
  phase, requestedAt: new Date(now).toISOString(), now,
} as const;

it('authorizes an exact holder request to another ship in the local group', () => {
  expect(authorizeShuttleDeparture(base)).toEqual({
    status: 'requested', requestId: 'depart-1', shuttleId: 'starlight', holderUid: 'holder',
    fleetGroupId: 'fleet-1', originShipId: 'aegis', destinationShipId: 'icebreaker',
    cycle: 2, controlRevision: 3, requestedAt: '2026-09-21T05:00:00.000Z',
  });
});

it.each([
  ['non-holder', { actorUid: 'owner' }],
  ['stale control', { expectedControlRevision: 2 }],
  ['wrong cycle', { expectedCycle: 3 }],
  ['restricted airspace', { phase: { ...phase, airspace: { ...phase.airspace, state: 'restricted' as const } } }],
  ['paused clock', { phase: { ...phase, timerPause: { window: 'open' as const, remainingMs: 1, pausedAt: '2026-09-21T05:00:00.000Z' } } }],
  ['expired clock', { now: Date.parse(phase.openAirspaceEndsAt) }],
  ['foreign group', { group: { ...base.group, memberUids: ['other'] } }],
  ['same destination', { destinationShipId: 'aegis' }],
  ['cross-group destination', { destinationShipId: 'dione' }],
  ['pending departure', { existing: { status: 'requested' as const, requestId: 'old', shuttleId: 'starlight', holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId: 'aegis', destinationShipId: 'icebreaker', cycle: 2, controlRevision: 3, requestedAt: '2026-09-21T04:59:00.000Z' } }],
] as const)('rejects %s', (_label, patch) => {
  expect(() => authorizeShuttleDeparture({ ...base, ...patch })).toThrow();
});

it('enforces the Union craft host pair', () => {
  expect(() => authorizeShuttleDeparture({
    ...base, shuttleId: 'wobbly', destinationShipId: 'icebreaker',
    control: { ...base.control, shuttleId: 'wobbly' },
    dockings: [{ shuttleId: 'wobbly', shipId: 'quellon', dockedAt: 'start' }],
    group: { ...base.group, vesselIds: ['quellon', 'icebreaker'] },
  })).toThrow(/cannot dock/i);
});

it('parses only complete server-owned pending requests', () => {
  const state = authorizeShuttleDeparture(base);
  expect(parseShuttleDepartures({ starlight: state })).toEqual({ starlight: state });
  expect(parseShuttleDepartures({ starlight: { ...state, destinationShipId: 4 } })).toBeNull();
  expect(parseShuttleDepartures([])).toBeNull();
});

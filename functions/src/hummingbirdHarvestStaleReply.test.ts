import { expect, it } from 'vitest';
import {
  buildHummingbirdHarvestStaleReply,
  type HummingbirdHarvestStaleContext,
} from './hummingbirdHarvestStaleReply';

const pending = {
  sessionId: 's1', ownerUid: 'u1', turn: 3, hostShipId: 'quellon', revision: 6,
  status: 'pending', rolls: [2, 5], requestId: 'roll-5', createdAt: '2026-09-27T16:00:00.000Z',
} as const;

const context: HummingbirdHarvestStaleContext = {
  sessionId: 's1', actorUid: 'u1', actorRoleId: 'quellon-explorer',
  hostShipId: 'quellon', turn: 3, requestId: 'allocate-9', expectedRevision: 5,
};

it('returns a request-bound stale envelope for the same private actor, host, and cycle', () => {
  expect(buildHummingbirdHarvestStaleReply(pending, context)).toEqual({
    status: 'stale', sessionId: 's1', requestId: 'allocate-9', harvest: pending,
    actorUid: 'u1', actorRoleId: 'quellon-explorer', vesselId: 'hummingbird',
    hostShipId: 'quellon', turn: 3, phase: 'active', revision: 6,
    idempotencyKey: 'allocate-9', auditId: 'hummingbird-harvest-allocate-9',
  });
});

it('returns the current resolved receipt when a same-cycle allocation lost its CAS', () => {
  const resolved = {
    ...pending, revision: 7, status: 'resolved', foodDieIndex: 1,
    food: 5, water: 2, resolvedAt: '2026-09-27T16:01:00.000Z',
  } as const;
  expect(buildHummingbirdHarvestStaleReply(resolved, context)).toMatchObject({
    status: 'stale', revision: 7,
    harvest: { status: 'resolved', foodDieIndex: 1, food: 5, water: 2 },
  });
});

it.each([
  ['another session', { sessionId: 's2' }, pending],
  ['another actor', { actorUid: 'u2' }, pending],
  ['another role', { actorRoleId: 'quellon-captain' }, pending],
  ['another host', { hostShipId: 'dione' }, pending],
  ['another cycle', { turn: 4 }, pending],
  ['the same revision', { expectedRevision: 6 }, pending],
  ['a newer expected revision', { expectedRevision: 7 }, pending],
  ['a prior-cycle harvest', {}, { ...pending, turn: 2 }],
  ['another private owner', {}, { ...pending, ownerUid: 'u2' }],
  ['malformed harvest state', {}, { ...pending, rolls: [2, 8] }],
  ['an invalid request id', { requestId: 'contains spaces' }, pending],
] as const)('fails closed for %s', (_label, contextOverrides, harvest) => {
  expect(buildHummingbirdHarvestStaleReply(harvest, {
    ...context, ...contextOverrides,
  })).toBeUndefined();
});

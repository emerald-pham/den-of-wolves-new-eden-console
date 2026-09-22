import { expect, it } from 'vitest';
import { EventVisibility } from './eventEnvelope';
import { buildPhiliaRepairMemberEventRecord } from './philiaRepairEvent';

it('projects only the member-safe Philia repair audit fields', () => {
  expect(buildPhiliaRepairMemberEventRecord({
    envelope: {
      sessionId: 's1', actorUid: 'engineer', actorRoleId: 'dione-engineer',
      turn: 3, phase: 'active', type: 'philia-repair', requestId: 'repair-1',
      revision: 1, serverTime: '2026-09-22T15:00:00.000Z',
      visibility: EventVisibility.Member, secretEnvelopeValue: 'drop',
    },
    payload: {
      hostShipId: 'dione', systemIds: ['reactor', 'storage'], materialsSpent: 8,
      materialsRemaining: 4, commandFingerprint: { private: true },
    },
    createdAt: 'server-time',
  })).toEqual({
    sessionId: 's1', actorUid: 'engineer', actorRoleId: 'dione-engineer',
    turn: 3, phase: 'active', type: 'philia-repair', requestId: 'repair-1',
    revision: 1, serverTime: '2026-09-22T15:00:00.000Z',
    visibility: EventVisibility.Member, createdAt: 'server-time', shuttleId: 'philia',
    hostShipId: 'dione', systemIds: ['reactor', 'storage'], materialsSpent: 8,
  });
});

it('rejects a non-member event envelope', () => {
  expect(() => buildPhiliaRepairMemberEventRecord({
    envelope: { visibility: 'facilitator' }, payload: {}, createdAt: 'server-time',
  })).toThrow(/member visibility/i);
});

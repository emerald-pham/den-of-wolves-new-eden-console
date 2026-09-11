import { expect, expectTypeOf, it } from 'vitest';
import {
  ENTITY_ID_KINDS,
  entityId,
  isEntityId,
  parseEntityId,
  wireEntityId,
  type AttackId,
  type EventId,
  type GroupId,
  type MissionId,
  type PlayerId,
  type RoleId,
  type SessionId,
  type VesselId,
} from './identifiers';
import type { EntityIdentitySnapshot } from './game';

it('declares one wire-safe identity kind for every planned entity table', () => {
  expect(ENTITY_ID_KINDS).toEqual([
    'session', 'player', 'seat', 'role', 'vessel', 'console', 'shuttle',
    'group', 'mission', 'attack', 'event',
  ]);

  const sessionId = entityId('session', 's-1');
  const groupId = entityId('group', 'wolf-group-1');
  const missionId = entityId('mission', 'mission-1');
  const attackId = entityId('attack', 'attack-1');
  const eventId = entityId('event', 'event-1');

  expectTypeOf(sessionId).toEqualTypeOf<SessionId>();
  expectTypeOf(groupId).toEqualTypeOf<GroupId>();
  expectTypeOf(missionId).toEqualTypeOf<MissionId>();
  expectTypeOf(attackId).toEqualTypeOf<AttackId>();
  expectTypeOf(eventId).toEqualTypeOf<EventId>();
  expectTypeOf<EntityIdentitySnapshot<'group'>>().toHaveProperty('id');
  expectTypeOf<PlayerId>().not.toEqualTypeOf<RoleId>();
  expectTypeOf<VesselId>().not.toEqualTypeOf<SessionId>();
});

it('round-trips IDs without changing their Firestore wire value', () => {
  const roleId = entityId('role', 'refinery-124-pdf-colonel');
  const serialized = JSON.stringify({ roleId });

  expect(wireEntityId(roleId)).toBe('refinery-124-pdf-colonel');
  expect(JSON.parse(serialized)).toEqual({ roleId: 'refinery-124-pdf-colonel' });
  expect(parseEntityId('role', roleId)).toBe(roleId);
  expect(isEntityId('role', roleId)).toBe(true);
});

it('rejects malformed values while preserving valid legacy punctuation', () => {
  expect(parseEntityId('event', '')).toBeUndefined();
  expect(parseEntityId('event', 'events/event-1')).toBeUndefined();
  expect(parseEntityId('event', null)).toBeUndefined();
  expect(parseEntityId('event', 42)).toBeUndefined();
  expect(parseEntityId('event', 'session.created')).toBe('session.created');
  expect(parseEntityId('event', ' legacy-event ')).toBe(' legacy-event ');
  expect(() => entityId('session', '')).toThrow('Invalid session identifier.');
});

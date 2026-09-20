import { describe, expect, it } from 'vitest';
import { WOLF_ACTION_KINDS, isWolfActionKind, wolfActionAuthorization } from './wolfActionAuthorization';

const valid = {
  actorUid: 'u2',
  active: true,
  connectedRole: 'player',
  assignedRoleId: 'dione-engineer',
  replacementRoleId: null,
  escapeState: null,
  loyaltyAudience: ['u2'],
  loyaltyPayload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
  wolfAssignmentPayload: { type: 'wolf-assignment', roleIds: ['dione-engineer'] },
} as const;

describe('Wolf action authorization', () => {
  it.each(['wolf-agent', 'wolf-cult'] as const)('binds a live %s to its authoritative cover role', (kind) => {
    expect(wolfActionAuthorization({
      ...valid,
      loyaltyPayload: { type: 'loyalty', kind, suspicion: 0 },
    })).toEqual({ allowed: true, coverRoleId: 'dione-engineer' });
  });

  it.each([
    ['inactive', { active: false }, 'inactive'],
    ['observer', { connectedRole: 'observer' }, 'not-player'],
    ['replacement role', { replacementRoleId: 'wolf-commander' }, 'replaced'],
    ['destroyed-ship escape', { escapeState: { status: 'pending' } }, 'displaced'],
    ['public loyalty', { loyaltyAudience: ['u2', 'u3'] }, 'not-wolf'],
    ['another loyalty', { loyaltyPayload: { type: 'loyalty', kind: 'fleet-loyalist', suspicion: 0 } }, 'not-wolf'],
    ['malformed suspicion', { loyaltyPayload: { type: 'loyalty', kind: 'wolf-agent', suspicion: -1 } }, 'not-wolf'],
    ['stale cover role', { wolfAssignmentPayload: { type: 'wolf-assignment', roleIds: ['admiral'] } }, 'cover-mismatch'],
    ['duplicated cover roster', { wolfAssignmentPayload: { type: 'wolf-assignment', roleIds: ['dione-engineer', 'dione-engineer'] } }, 'cover-mismatch'],
  ] as const)('rejects a %s actor', (_label, patch, reason) => {
    expect(wolfActionAuthorization({ ...valid, ...patch })).toEqual({ allowed: false, reason });
  });

  it('accepts only the four source-defined action identifiers', () => {
    expect(WOLF_ACTION_KINDS).toEqual([
      'sabotage-console', 'sabotage-supplies', 'homing-beacon', 'provide-intel',
    ]);
    WOLF_ACTION_KINDS.forEach((kind) => expect(isWolfActionKind(kind)).toBe(true));
    expect(isWolfActionKind('investigate')).toBe(false);
  });
});

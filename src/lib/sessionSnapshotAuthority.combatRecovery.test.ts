import { expect, it } from 'vitest';
import type { GameSession } from '@/types/game';
import {
  acceptServerSessionAuthority,
  comparableSessionCursor,
  createSessionSnapshotAuthority,
} from './sessionSnapshotAuthority';

function snapshot(state: 'lifted' | 'restricted', phaseRevision: number, second: number): GameSession {
  return {
    id: 'combat-recovery', name: 'Fleet', joinCode: '123456', ownerUid: 'gm',
    phase: 'active', currentTurn: 2, turnLimit: 6,
    createdAt: '2026-10-04T12:00:00.000Z', updatedAt: `2026-10-04T12:00:0${second}.000Z`,
    turnPhase: { turn: 2, teamPhaseEndsAt: '2026-10-04T12:05:00.000Z',
      openAirspaceEndsAt: '2026-10-04T12:20:00.000Z',
      airspace: { state, tickerActive: true, pressAccess: false } },
    turnState: { currentTurn: 2, maxTurn: 6, phase: state === 'lifted' ? 'coordination' : 'team',
      phaseRevision, startedAt: state === 'lifted' ? '2026-10-04T12:05:00.000Z' : '2026-10-04T12:00:00.000Z',
      endsAt: state === 'lifted' ? '2026-10-04T12:20:00.000Z' : '2026-10-04T12:05:00.000Z' },
  };
}

it('accepts the current-cycle phase revision that closes airspace for a declared attack and its later reopening', () => {
  const authority = createSessionSnapshotAuthority();
  const open = snapshot('lifted', 2, 1);
  const declared = snapshot('restricted', 3, 2);
  const resolved = snapshot('lifted', 4, 3);
  expect(acceptServerSessionAuthority(authority, open, comparableSessionCursor(open.updatedAt))).toBe(true);
  expect(acceptServerSessionAuthority(authority, declared, comparableSessionCursor(declared.updatedAt))).toBe(true);
  expect(authority.latestSessionLifecycle).toMatchObject({ currentTurn: 2, airspaceState: 0 });
  expect(acceptServerSessionAuthority(authority, resolved, comparableSessionCursor(resolved.updatedAt))).toBe(true);
  expect(authority.latestSessionLifecycle).toMatchObject({ currentTurn: 2, airspaceState: 1 });
});

it('accepts the serialized member feed closure using its validated phase revision without inventing a timestamp', () => {
  const authority = createSessionSnapshotAuthority();
  expect(acceptServerSessionAuthority(authority, snapshot('lifted', 2, 1), undefined, false, true)).toBe(true);
  expect(acceptServerSessionAuthority(authority, snapshot('restricted', 3, 2), undefined, false, true)).toBe(true);
});

it.each([1, 2])('rejects same-cycle airspace regression with nonadvancing phase revision %s', phaseRevision => {
  const authority = createSessionSnapshotAuthority();
  const open = snapshot('lifted', 2, 1);
  const stale = snapshot('restricted', phaseRevision, 2);
  expect(acceptServerSessionAuthority(authority, open, comparableSessionCursor(open.updatedAt))).toBe(true);
  expect(acceptServerSessionAuthority(authority, stale, comparableSessionCursor(stale.updatedAt))).toBe(false);
});

it.each(['cycle', 'phase', 'missing', 'invalid'] as const)('rejects an unbound %s phase marker on an apparent airspace regression', kind => {
  const authority = createSessionSnapshotAuthority();
  const open = snapshot('lifted', 2, 1);
  const stale = snapshot('restricted', 3, 2);
  const marker = stale.turnState!;
  const unbound = { ...stale, ...(kind === 'missing' ? { turnState: undefined } : { turnState: {
    ...marker, ...(kind === 'cycle' ? { currentTurn: 3 } : kind === 'phase' ? { phase: 'coordination' as const }
      : { phaseRevision: Number.NaN }),
  } }) };
  expect(acceptServerSessionAuthority(authority, open, comparableSessionCursor(open.updatedAt))).toBe(true);
  expect(acceptServerSessionAuthority(authority, unbound, comparableSessionCursor(unbound.updatedAt))).toBe(false);
});

it('rejects a stale phase revision after combat reopened airspace even when a legacy writer supplies a later timestamp', () => {
  const authority = createSessionSnapshotAuthority();
  const resolved = snapshot('lifted', 4, 3);
  const oldDeclaration = snapshot('restricted', 3, 4);
  expect(acceptServerSessionAuthority(authority, resolved, comparableSessionCursor(resolved.updatedAt))).toBe(true);
  expect(acceptServerSessionAuthority(authority, oldDeclaration, comparableSessionCursor(oldDeclaration.updatedAt))).toBe(false);
});

import { afterEach, beforeEach, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import type { GameSession, Player, Seat } from '@/types/game';
import {
  acceptServerSessionAuthority, comparableSessionCursor, beginAdmiralFirstEntry, beginMemberSessionResume,
  createSessionSnapshotAuthority, finishAdmiralFirstEntry, pendingAdmiralFirstEntry,
  admiralFirstEntryMatches, admiralFirstEntryProjectionIsCurrent, withholdAdmiralFirstEntry, awaitAdmiralFirstEntryReader,
} from './sessionSnapshotAuthority';

// Producer/lifecycle contract fixtures, not mounted/backend acceptance. The
// coupled mounted test separately exercises the real accepted CAS callback.
function context() {
  const uid = 'source-admiral', doc = performance.timeOrigin;
  const scope = { groupId: 'fleet-1', vesselIds: ['aegis'], craftIds: [] };
  const me = { uid, sessionId: 'source-session', role: 'player', connected: true, fleetGroupId: scope.groupId,
    assignedRoleId: 'admiral', activeConsoleRoleId: null, seatId: null,
    connectionGeneration: 2, replacementRoleId: null, replacementStatus: null } as Player;
  const session = { id: me.sessionId, phase: 'casting', currentTurn: 0, setupConfirmed: true, setupRevision: 4,
    updatedAt: new Date().toISOString(), memberSessionScope: scope, currentActorBerthAuthority: {
      sessionId: me.sessionId, actorUid: uid, groupId: scope.groupId, role: 'player', shipId: 'aegis',
      connectionGeneration: 2, assignedRoleId: 'admiral', activeConsoleRoleId: null,
      replacementRoleId: null, replacementStatus: null } } as GameSession;
  const before = { session, me, identityHydrationRevision: 1, connection: 'live', sessionSnapshotFreshness: 'server' };
  const current = { ...before, session: { ...session, setupRevision: 5 }, me: { ...me, seatId: 'admiral' },
    seats: [{ id: 'admiral', roleId: 'admiral', status: 'claimed', holderUid: uid }] as Seat[] };
  const authority = createSessionSnapshotAuthority();
  assert.equal(acceptServerSessionAuthority(authority, session, comparableSessionCursor(session.updatedAt), true), true);
  return { uid, doc, before, current, authority, receipt: { requestId: 'validated-receipt-source-fixture', setupRevision: 5 } };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime('2026-10-14T00:10:00.000Z'); });
afterEach(() => { vi.useRealTimers(); });

it('rejects inconsistent or unaccepted Admiral producer contexts, including an extra untrusted raw berth seat', () => {
  const cases = ['server-unconfirmed', 'resume-fenced', 'cache', 'foreign-holder', 'wrong-revision', 'empty-request',
    'canonical-null', 'already-seated', 'extra-raw-berth-seat', 'wrong-role', 'expired', 'unbounded-deadline'] as const;
  for (const name of cases) {
    const c = context(); let before = c.before, current = c.current, receipt = c.receipt, deadline = Date.now()+15_000;
    if (name === 'server-unconfirmed') c.authority.hasServerSessionAuthority = false;
    if (name === 'resume-fenced') beginMemberSessionResume(c.authority);
    if (name === 'cache') before = { ...before, sessionSnapshotFreshness: 'cache' };
    if (name === 'foreign-holder') current = { ...current, seats: [{ ...current.seats[0]!, holderUid: 'foreign' }] };
    if (name === 'wrong-revision') receipt = { ...receipt, setupRevision: 6 };
    if (name === 'empty-request') receipt = { ...receipt, requestId: '' };
    if (name === 'canonical-null') before = { ...before, session: { ...before.session, currentActorBerthAuthority: null } };
    if (name === 'already-seated') before = { ...before, me: { ...before.me, seatId: 'admiral' } };
    if (name === 'extra-raw-berth-seat') {
      // This is an untrusted extra property, not a canonical wire/type field.
      const session = { ...before.session, currentActorBerthAuthority: { ...before.session.currentActorBerthAuthority!, seatId: 'admiral' } };
      before = { ...before, session }; current = { ...current, session: { ...session, setupRevision: 5 } };
    }
    if (name === 'wrong-role') before = { ...before, me: { ...before.me, assignedRoleId: 'wing-commander' } };
    if (name === 'expired') deadline = Date.now();
    if (name === 'unbounded-deadline') deadline += 1;
    assert.equal(beginAdmiralFirstEntry(c.authority, before, current, c.uid, c.doc, receipt, deadline), undefined, name);
  }
});

it('retires claimed provenance on generic stale state despite SDK serverSeen and requires actual withdrawal before accepting a Store marker', () => {
  const c = context();
  const entry = beginAdmiralFirstEntry(c.authority, c.before, c.current, c.uid, c.doc, c.receipt, Date.now()+15_000);
  assert.ok(entry); assert.equal(c.authority.hasServerSessionAuthority, true);
  assert.equal(admiralFirstEntryProjectionIsCurrent(c.authority, entry, c.current, c.uid, c.doc), false);
  const stale = { ...c.current, connection: 'offline', sessionSnapshotFreshness: 'cache' };
  assert.equal(admiralFirstEntryMatches(entry, stale, c.uid, c.doc), false);
  assert.equal(pendingAdmiralFirstEntry(c.authority, stale, c.uid, c.doc), undefined);
  assert.equal(pendingAdmiralFirstEntry(c.authority, c.current, c.uid, c.doc), undefined);
  assert.equal(c.authority.hasServerSessionAuthority, true);
});

it('keeps only the actual withdrawn receipt lineage, denies changed scopes and forgery, and clears on normal resume or final failure', () => {
  const c = context();
  const entry = beginAdmiralFirstEntry(c.authority, c.before, c.current, c.uid, c.doc, c.receipt, Date.now()+15_000);
  assert.ok(entry);
  assert.equal(awaitAdmiralFirstEntryReader(c.authority, c.current, c.uid, c.doc), entry);
  const waiting = { ...c.current, connection: 'offline', sessionSnapshotFreshness: 'cache' };
  assert.equal(pendingAdmiralFirstEntry(c.authority, waiting, c.uid, c.doc), entry);
  assert.equal(waiting.session.currentActorBerthAuthority?.activeConsoleRoleId, null);
  assert.equal(admiralFirstEntryProjectionIsCurrent(c.authority, entry, waiting, c.uid, c.doc), false);
  const active = { ...waiting, me: { ...waiting.me, activeConsoleRoleId: 'admiral' } };
  assert.equal(withholdAdmiralFirstEntry(c.authority, active, c.uid, c.doc), entry);
  const origin = { ...entry, activeConsoleRoleId: 'admiral' as const };
  const held = { ...active, session: { ...active.session, currentActorBerthAuthority: null }, connection: 'offline',
    sessionSnapshotFreshness: 'cache', currentActorBerthProjectionPending: origin };
  assert.equal(admiralFirstEntryProjectionIsCurrent(c.authority, origin, held, c.uid, c.doc), true);
  const changes: Array<Partial<Player>> = [{ uid: 'foreign' }, { sessionId: 'foreign' }, { fleetGroupId: 'foreign' },
    { role: 'gm' }, { assignedRoleId: 'wing-commander' }, { activeConsoleRoleId: 'wing-commander' },
    { seatId: null }, { connectionGeneration: 3 }, { connected: false },
    { replacementRoleId: 'admiral' }, { replacementStatus: 'awaiting-re-role' }];
  for (const change of changes) assert.equal(admiralFirstEntryMatches(origin, { ...held, me: { ...held.me, ...change } }, c.uid, c.doc), false);
  assert.equal(admiralFirstEntryMatches(origin, held, 'foreign', c.doc), false);
  assert.equal(admiralFirstEntryMatches(origin, held, c.uid, c.doc+1), false);
  assert.equal(admiralFirstEntryMatches(origin, { ...held, identityHydrationRevision: 2 }, c.uid, c.doc), false);
  assert.equal(admiralFirstEntryMatches(origin, { ...held, session: { ...held.session, currentTurn: 1 } }, c.uid, c.doc), false);
  assert.equal(admiralFirstEntryMatches(origin, { ...held, session: { ...held.session,
    memberSessionScope: { groupId: 'fleet-1', vesselIds: [], craftIds: [] } } }, c.uid, c.doc), false);
  const revoked = { ...held.me, kickedAt: 'source-revoked' };
  assert.equal(admiralFirstEntryMatches(origin, { ...held, me: revoked }, c.uid, c.doc), false);
  assert.equal(admiralFirstEntryProjectionIsCurrent(c.authority, { ...origin, claimRequestId: 'forged' }, held, c.uid, c.doc), false);
  assert.equal(admiralFirstEntryProjectionIsCurrent(c.authority, { ...origin, deadlineAt: origin.deadlineAt+1 }, held, c.uid, c.doc), false);
  finishAdmiralFirstEntry(c.authority, { ...entry });
  assert.equal(pendingAdmiralFirstEntry(c.authority, held, c.uid, c.doc), entry);
  beginMemberSessionResume(c.authority);
  assert.equal(pendingAdmiralFirstEntry(c.authority, held, c.uid, c.doc), undefined);
  const other = context();
  const final = beginAdmiralFirstEntry(other.authority, other.before, other.current, other.uid, other.doc, other.receipt, Date.now()+15_000);
  assert.ok(final); finishAdmiralFirstEntry(other.authority, final);
  assert.equal(pendingAdmiralFirstEntry(other.authority, other.current, other.uid, other.doc), undefined);
});

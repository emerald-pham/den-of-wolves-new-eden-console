import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
import { acceptCallableSessionAuthority } from './sessionSnapshotAuthority';
import { readClosedSessionHistory } from './sessionService';

const identity = vi.hoisted(() => ({ uid: 'u1' as string | null }));

vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({
  auth: () => ({ currentUser: identity.uid === null ? null : { uid: identity.uid } }),
  functions: vi.fn(() => ({ kind: 'functions' })),
}));

let sequence = 0;
function closedHistory(currentTurn = 4) {
  const id = `bounded-closed-history-${++sequence}`;
  const before: GameSession = {
    id, name: 'Table one', joinCode: '', phase: 'closed', currentTurn,
    createdAt: '2026-10-05T10:00:00.000Z', updatedAt: '2026-10-05T12:00:00.000Z',
  };
  const member: Player = {
    uid: 'u1', sessionId: id, displayName: 'Returning member', role: 'player',
    seatId: null, fleetGroupId: 'fleet-1', connectionGeneration: 4, connected: false,
    joinedAt: '2026-10-05T10:00:00.000Z',
  };
  const outcome = {
    type: 'game-outcome', result: 'success', cause: 'candidate-complete',
    candidateCode: 'N', cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z',
  } as const;
  const debrief = {
    type: 'session-debrief', version: 1, source: 'candidate', result: 'success',
    cause: 'candidate-complete', cycle: 4, occurredAt: outcome.occurredAt,
    committedAt: '2026-10-05T12:01:00.000Z', outcome,
    candidate: { code: 'N', groups: [{
      requirements: [{ id: 'paid-crossing', status: 'met' }],
      rolls: [{ id: 'passage', face: 4, result: 'success' }], losses: [], humanCalls: [],
      path: [{ action: 'ring-passage', result: 'crossed', shipId: 'aegis', fuelSpent: 5 }],
    }] },
  } as const;
  const history = { ...before, updatedAt: '2099-10-05T12:01:00.000Z', gameOutcome: outcome,
    debriefSnapshot: debrief };
  const response = { type: 'current-member-session', sessionId: id, actorUid: 'u1',
    groupId: 'fleet-1', connectionGeneration: 4, assignedRoleId: null,
    activeConsoleRoleId: null, session: history };
  useSessionStore.getState().setIdentity(before, member);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  return { id, before, member, outcome, debrief, history, response };
}

function reply(data: unknown) {
  const read = vi.fn().mockResolvedValue({ data });
  vi.mocked(httpsCallable).mockReturnValue(read as never);
  return read;
}

beforeEach(() => {
  identity.uid = 'u1';
  vi.mocked(httpsCallable).mockReset();
  useSessionStore.getState().reset();
});

describe('bounded closed-member history service', () => {
  it('installs only the entitled history fields and retains both safe public outcomes', async () => {
    const fixture = closedHistory();
    const read = reply(fixture.response);

    await expect(readClosedSessionHistory(fixture.id)).resolves.toBe(true);

    expect(useSessionStore.getState().session).toEqual(fixture.history);
    expect(useSessionStore.getState().session?.gameOutcome).toEqual(fixture.outcome);
    expect(useSessionStore.getState().session?.debriefSnapshot?.outcome).toEqual(fixture.outcome);
    expect(useSessionStore.getState().me).toEqual(fixture.member);
    expect(useSessionStore.getState().gmInstance).toBeNull();
    expect(httpsCallable).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'getCurrentMemberSession');
    expect(read).toHaveBeenCalledExactlyOnceWith({ sessionId: fixture.id });
  });

  it('keeps an exact validated zero cycle without generic operational defaults', async () => {
    const fixture = closedHistory(0);
    reply(fixture.response);

    await expect(readClosedSessionHistory(fixture.id)).resolves.toBe(true);

    expect(useSessionStore.getState().session).toEqual(fixture.history);
    expect(useSessionStore.getState().session?.currentTurn).toBe(0);
    expect(useSessionStore.getState().session).not.toHaveProperty('shipResources');
    expect(useSessionStore.getState().session).not.toHaveProperty('activeRoleIds');
  });

  it('retains legitimate optional history for the original GM audience without operational state', async () => {
    const fixture = closedHistory();
    const gm: Player = { ...fixture.member, role: 'gm', fleetGroupId: null };
    useSessionStore.getState().setIdentity(fixture.before, gm);
    const history = { ...fixture.history, playerCount: 8, turnLimit: 6,
      fullGameDemo: { status: 'complete', progression: 'manual' } as const };
    const read = reply({ ...fixture.response, groupId: 'gm', session: history });

    await expect(readClosedSessionHistory(fixture.id)).resolves.toBe(true);

    expect(useSessionStore.getState().session).toEqual(history);
    expect(useSessionStore.getState().me).toEqual(gm);
    expect(read).toHaveBeenCalledExactlyOnceWith({ sessionId: fixture.id });
  });

  it('rejects a valid public outcome polluted with unexpected private fields', async () => {
    const fixture = closedHistory();
    reply({ ...fixture.response, session: { ...fixture.history,
      gameOutcome: { ...fixture.outcome, privateChoice: 'not-public' } } });

    await expect(readClosedSessionHistory(fixture.id)).resolves.toBe(false);

    expect(useSessionStore.getState().session).toEqual(fixture.before);
  });

  it.each([
    ['shipResources', { aegis: { fuel: 999 } }],
    ['activeRoleIds', ['wolf-commander']],
    ['activeVesselIds', ['aegis']],
    ['playerDiscovery', { private: 'not-history' }],
    ['memberSessionScope', { groupId: 'fleet-1', vesselIds: ['aegis'], craftIds: [] }],
    ['fleetRedAlert', { active: true, revision: 1 }],
  ] as const)('rejects unexpected operational DTO field %s rather than installing it', async (field, value) => {
    const fixture = closedHistory();
    const read = reply({ ...fixture.response, session: { ...fixture.history, [field]: value } });

    await expect(readClosedSessionHistory(fixture.id)).resolves.toBe(false);

    expect(useSessionStore.getState().session).toEqual(fixture.before);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['name', 7], ['joinCode', 'LIVE'], ['currentTurn', -1], ['currentTurn', 1.5],
    ['playerCount', 7], ['playerCount', 21], ['turnLimit', -1],
    ['createdAt', 'not-a-date'], ['updatedAt', 'not-a-date'],
    ['gameOutcome', { type: 'game-outcome', privateChoice: 'not-public' }],
    ['survivorOutcome', { privateChoice: 'not-public' }],
    ['fullGameDemo', { status: 'active', progression: 'manual' }],
  ] as const)('rejects malformed bounded history %s=%j', async (field, value) => {
    const fixture = closedHistory();
    reply({ ...fixture.response, session: { ...fixture.history, [field]: value } });

    await expect(readClosedSessionHistory(fixture.id)).resolves.toBe(false);

    expect(useSessionStore.getState().session).toEqual(fixture.before);
  });

  it.each([
    ['actorUid', 'other'], ['sessionId', 'other-session'], ['groupId', 'fleet-2'],
    ['connectionGeneration', 3], ['connectionGeneration', 0],
    ['assignedRoleId', ''], ['activeConsoleRoleId', ''],
  ] as const)('rejects a mismatched or malformed original reply identity %s=%j', async (field, value) => {
    const fixture = closedHistory();
    reply({ ...fixture.response, [field]: value });

    await expect(readClosedSessionHistory(fixture.id)).resolves.toBe(false);

    expect(useSessionStore.getState().session).toEqual(fixture.before);
  });

  it.each(['auth', 'member', 'group', 'generation', 'session', 'phase', 'connection',
    'freshness', 'version', 'debrief'] as const)(
    'drops an already requested history after original %s authority changes', async drift => {
      const fixture = closedHistory();
      let complete!: (value: { data: unknown }) => void;
      const read = vi.fn(() => new Promise<{ data: unknown }>(resolve => { complete = resolve; }));
      vi.mocked(httpsCallable).mockReturnValue(read as never);
      const pending = readClosedSessionHistory(fixture.id);
      const store = useSessionStore.getState();
      if (drift === 'auth') identity.uid = 'other';
      if (drift === 'member') store.setIdentity(fixture.before, { ...fixture.member, uid: 'other' });
      if (drift === 'group') store.setIdentity(fixture.before, { ...fixture.member, fleetGroupId: 'fleet-2' });
      if (drift === 'generation') store.setIdentity(fixture.before, { ...fixture.member, connectionGeneration: 5 });
      if (drift === 'session') store.setIdentity({ ...fixture.before, id: 'another-session' },
        { ...fixture.member, sessionId: 'another-session' });
      if (drift === 'phase') store.setSession({ ...fixture.before, phase: 'debrief' });
      if (drift === 'connection') store.setConnection('idle');
      if (drift === 'freshness') store.setSessionSnapshotFreshness('cache');
      if (drift === 'version') {
        expect(acceptCallableSessionAuthority({ ...fixture.before, updatedAt: '2099-10-05T12:02:00.000Z' },
          fixture.member.uid)).toBe(true);
      }
      if (drift === 'debrief') store.setSession(fixture.history as GameSession);
      const beforeReply = useSessionStore.getState().session;
      complete({ data: fixture.response });

      await expect(pending).resolves.toBe(false);

      expect(useSessionStore.getState().session).toEqual(beforeReply);
      expect(read).toHaveBeenCalledExactlyOnceWith({ sessionId: fixture.id });
    },
  );

  it('rejects a source timestamp older than this original actor session authority', async () => {
    const fixture = closedHistory();
    expect(acceptCallableSessionAuthority({ ...fixture.before, updatedAt: '2099-10-05T12:02:00.000Z' },
      fixture.member.uid)).toBe(true);
    reply(fixture.response);

    await expect(readClosedSessionHistory(fixture.id)).resolves.toBe(false);

    expect(useSessionStore.getState().session).toEqual(fixture.before);
  });

  it('requires a valid public debrief rather than a root outcome alone', async () => {
    const fixture = closedHistory();
    reply({ ...fixture.response, session: { ...fixture.before, gameOutcome: fixture.outcome } });

    await expect(readClosedSessionHistory(fixture.id)).resolves.toBe(false);

    expect(useSessionStore.getState().session).toEqual(fixture.before);
  });

  it.each(['auth', 'group', 'connection', 'freshness', 'debrief'] as const)(
    'does not issue a read without original %s eligibility', async absent => {
      const fixture = closedHistory();
      const read = reply(fixture.response);
      const store = useSessionStore.getState();
      if (absent === 'auth') identity.uid = null;
      if (absent === 'group') store.setIdentity(fixture.before, { ...fixture.member, fleetGroupId: null });
      if (absent === 'connection') store.setConnection('idle');
      if (absent === 'freshness') store.setSessionSnapshotFreshness('cache');
      if (absent === 'debrief') store.setSession(fixture.history as GameSession);
      const beforeRead = useSessionStore.getState().session;

      await expect(readClosedSessionHistory(fixture.id)).resolves.toBe(false);

      expect(useSessionStore.getState().session).toEqual(beforeRead);
      expect(httpsCallable).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    },
  );
});

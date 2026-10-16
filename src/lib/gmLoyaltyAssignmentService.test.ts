import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import {
  acceptServerSessionAuthority,
  comparableSessionCursor,
  sessionSnapshotAuthorityFor,
} from './sessionSnapshotAuthority';

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  callable: vi.fn(),
  auth: vi.fn(),
  functions: vi.fn(),
}));

vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ auth: mocks.auth, functions: mocks.functions }));

import { submitExplicitGmLoyaltyAssignment } from './gmLoyaltyAssignmentService';

function configureGm(
  overrides: Record<string, unknown> = {},
  identity: { sessionId: string; instanceId: string } = {
    sessionId: 's1',
    instanceId: 'gm-instance-1',
  },
) {
  const session = {
    id: identity.sessionId, name: 'Fleet', joinCode: '1234', phase: 'casting', currentTurn: 0,
    setupConfirmed: true, configurationLocked: false, setupRevision: 6, playerCount: 14,
    universalArbourEnabled: true, wolfCultEnabled: false,
    activeRoleIds: ['aegis-engineer', 'aegis-captain'], ...overrides,
  };
  useSessionStore.getState().setIdentity(session as never, {
    uid: 'gm-1', sessionId: identity.sessionId, displayName: 'GM', role: 'gm', seatId: null,
  } as never);
  useSessionStore.getState().setGmInstance({
    id: identity.instanceId, sessionId: identity.sessionId, uid: 'gm-1',
  } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  mocks.auth.mockReturnValue({
    currentUser: { uid: 'gm-1' },
    authStateReady: vi.fn().mockResolvedValue(undefined),
  });
  mocks.functions.mockReturnValue('functions');
}

function acceptServerProjection(overrides: Record<string, unknown>, sessionId = 's1') {
  const before = useSessionStore.getState();
  const current = before.session;
  if (!current) throw new Error('Server projection requires an established fixture session.');
  const authority = sessionSnapshotAuthorityFor(sessionId, 'gm-1');
  const previous = authority.latestServerAuthorityCursor;
  const nextMillis = previous
    ? previous.seconds * 1_000 + Math.floor(previous.nanoseconds / 1_000_000) + 1
    : Date.now();
  const session = {
    ...current,
    ...overrides,
    updatedAt: new Date(nextMillis).toISOString(),
  };

  expect(acceptServerSessionAuthority(
    authority,
    session as never,
    comparableSessionCursor(session.updatedAt),
  )).toBe(true);
  useSessionStore.getState().setIdentity(session as never, before.me as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

const request = {
  sessionId: 's1',
  instanceId: 'gm-instance-1',
  requestId: 'bound-loyalty-request-1',
  targetUid: 'u1',
  kind: 'universal-arbour' as const,
  suspicion: 10,
};

describe('authenticated explicit loyalty adapter', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    mocks.call.mockReset();
    mocks.callable.mockReset().mockReturnValue(mocks.call);
    mocks.auth.mockReset();
    mocks.functions.mockReset();
    configureGm();
  });

  it('sends the exact bound request to the existing assignLoyalty callable and exposes only its safe revision', async () => {
    mocks.call.mockResolvedValue({ data: {
      sessionId: 's1', setupRevision: 7, assignedUids: ['u1'],
    } });
    const result = await submitExplicitGmLoyaltyAssignment(request);
    expect(result).toEqual({ setupRevision: 7 });
    expect(mocks.callable).toHaveBeenCalledWith('functions', 'assignLoyalty');
    expect(mocks.call).toHaveBeenCalledWith(request);
    expect(JSON.stringify(result)).not.toContain('assignedUids');
  });

  it('accepts the authorized exact replay at the already-current revision', async () => {
    configureGm({ setupRevision: 7 });
    mocks.call.mockResolvedValue({ data: {
      sessionId: 's1', setupRevision: 7, assignedUids: ['u1'],
    } });
    await expect(submitExplicitGmLoyaltyAssignment(request)).resolves.toEqual({ setupRevision: 7 });
  });

  it('rejects a receipt revision that is not exactly one beyond the captured revision', async () => {
    mocks.call.mockResolvedValue({ data: {
      sessionId: 's1', setupRevision: 8, assignedUids: ['u1'],
    } });
    await expect(submitExplicitGmLoyaltyAssignment(request)).rejects.toThrow(/receipt|authority|revision/i);
  });

  it('rejects non-GM or non-live authority before invoking the callable', async () => {
    useSessionStore.getState().setMe({
      uid: 'u1', sessionId: 's1', role: 'player', seatId: 'aegis-engineer',
    } as never);
    await expect(submitExplicitGmLoyaltyAssignment(request)).rejects.toThrow(/facilitator|GM/i);
    expect(mocks.call).not.toHaveBeenCalled();

    configureGm();
    useSessionStore.getState().setConnection('offline');
    await expect(submitExplicitGmLoyaltyAssignment(request)).rejects.toThrow(/reconnect|live/i);
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it('requires a confirmed optional mode and a current casting window', async () => {
    configureGm({ setupConfirmed: false });
    await expect(submitExplicitGmLoyaltyAssignment(request)).rejects.toThrow(/confirm/i);
    expect(mocks.call).not.toHaveBeenCalled();

    configureGm({ configurationLocked: true });
    await expect(submitExplicitGmLoyaltyAssignment(request)).rejects.toThrow(/casting|locked/i);
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it('rejects a late result when the active session or GM instance changes', async () => {
    let resolveCall!: (value: unknown) => void;
    mocks.call.mockImplementation(() => new Promise((resolve) => { resolveCall = resolve; }));
    const pending = submitExplicitGmLoyaltyAssignment(request);
    await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(1));
    useSessionStore.getState().setGmInstance({
      id: 'gm-instance-2', sessionId: 's1', uid: 'gm-1',
    } as never);
    resolveCall({ data: { sessionId: 's1', setupRevision: 7, assignedUids: ['u1'] } });
    await expect(pending).rejects.toThrow(/authority|changed|refresh/i);
  });

  it('accepts the one fresh server revision written by this exact assignment', async () => {
    let resolveCall!: (value: unknown) => void;
    mocks.call.mockImplementation(() => new Promise((resolve) => { resolveCall = resolve; }));
    const pending = submitExplicitGmLoyaltyAssignment(request);
    await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(1));

    acceptServerProjection({ setupRevision: 7, phase: 'casting' });
    resolveCall({ data: { sessionId: 's1', setupRevision: 7, assignedUids: ['u1'] } });
    await expect(pending).resolves.toEqual({ setupRevision: 7 });
  });

  it('rejects a second accepted snapshot even when it repeats the receipt revision', async () => {
    let resolveCall!: (value: unknown) => void;
    mocks.call.mockImplementation(() => new Promise((resolve) => { resolveCall = resolve; }));
    const pending = submitExplicitGmLoyaltyAssignment(request);
    await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(1));

    acceptServerProjection({ setupRevision: 7 });
    acceptServerProjection({ setupRevision: 7, name: 'Fleet with a later server update' });
    resolveCall({ data: { sessionId: 's1', setupRevision: 7, assignedUids: ['u1'] } });
    await expect(pending).rejects.toThrow(/authority changed|refresh/i);
  });

  it('rejects a newer setup revision that no longer matches this receipt', async () => {
    let resolveCall!: (value: unknown) => void;
    mocks.call.mockImplementation(() => new Promise((resolve) => { resolveCall = resolve; }));
    const pending = submitExplicitGmLoyaltyAssignment(request);
    await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(1));

    acceptServerProjection({ setupRevision: 8 });
    resolveCall({ data: { sessionId: 's1', setupRevision: 7, assignedUids: ['u1'] } });
    await expect(pending).rejects.toThrow(/authority changed|refresh/i);
  });

  it('rejects a newer displayed setup revision even before its cursor is accepted', async () => {
    let resolveCall!: (value: unknown) => void;
    mocks.call.mockImplementation(() => new Promise((resolve) => { resolveCall = resolve; }));
    const pending = submitExplicitGmLoyaltyAssignment(request);
    await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(1));

    const current = useSessionStore.getState();
    useSessionStore.getState().setIdentity({
      ...current.session,
      setupRevision: 8,
    } as never, current.me as never);
    resolveCall({ data: { sessionId: 's1', setupRevision: 7, assignedUids: ['u1'] } });
    await expect(pending).rejects.toThrow(/authority changed|refresh/i);
  });

  it('rejects the receipt after the session advances out of the casting window', async () => {
    const identity = { sessionId: 's-phase-advance', instanceId: 'gm-phase-advance' };
    configureGm({}, identity);
    let resolveCall!: (value: unknown) => void;
    mocks.call.mockImplementation(() => new Promise((resolve) => { resolveCall = resolve; }));
    const pending = submitExplicitGmLoyaltyAssignment({
      ...request,
      sessionId: identity.sessionId,
      instanceId: identity.instanceId,
    });
    await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(1));

    acceptServerProjection({ setupRevision: 7, phase: 'briefing' }, identity.sessionId);
    resolveCall({
      data: { sessionId: identity.sessionId, setupRevision: 7, assignedUids: ['u1'] },
    });
    await expect(pending).rejects.toThrow(/authority changed|refresh/i);
  });

  it('rejects a late result after Firebase authentication switches to another UID', async () => {
    let resolveCall!: (value: unknown) => void;
    const authenticatedClient = {
      currentUser: { uid: 'gm-1' },
      authStateReady: vi.fn().mockResolvedValue(undefined),
    };
    mocks.auth.mockReturnValue(authenticatedClient);
    mocks.call.mockImplementation(() => new Promise((resolve) => { resolveCall = resolve; }));
    const pending = submitExplicitGmLoyaltyAssignment(request);
    await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(1));
    authenticatedClient.currentUser = { uid: 'another-gm' };
    resolveCall({ data: { sessionId: 's1', setupRevision: 7, assignedUids: ['u1'] } });
    await expect(pending).rejects.toThrow(/authenticated GM identity changed/i);
  });

  it('does not accept malformed or private assignment projections as a receipt', async () => {
    mocks.call.mockResolvedValue({ data: {
      sessionId: 's1', setupRevision: 7, assignedUids: ['u1'], privateLoyalty: { kind: 'wolf-agent' },
    } });
    await expect(submitExplicitGmLoyaltyAssignment(request)).rejects.toThrow(/receipt|projection/i);
  });
});

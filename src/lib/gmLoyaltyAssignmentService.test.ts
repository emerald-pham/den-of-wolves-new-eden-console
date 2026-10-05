import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  callable: vi.fn(),
  auth: vi.fn(),
  functions: vi.fn(),
}));

vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ auth: mocks.auth, functions: mocks.functions }));

import { submitExplicitGmLoyaltyAssignment } from './gmLoyaltyAssignmentService';

function configureGm(overrides: Record<string, unknown> = {}) {
  const session = {
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'casting', currentTurn: 0,
    setupConfirmed: true, configurationLocked: false, setupRevision: 6, playerCount: 14,
    universalArbourEnabled: true, wolfCultEnabled: false,
    activeRoleIds: ['aegis-engineer', 'aegis-captain'], ...overrides,
  };
  useSessionStore.getState().setIdentity(session as never, {
    uid: 'gm-1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null,
  } as never);
  useSessionStore.getState().setGmInstance({
    id: 'gm-instance-1', sessionId: 's1', uid: 'gm-1',
  } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  mocks.auth.mockReturnValue({
    currentUser: { uid: 'gm-1' },
    authStateReady: vi.fn().mockResolvedValue(undefined),
  });
  mocks.functions.mockReturnValue('functions');
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

  it('does not accept malformed or private assignment projections as a receipt', async () => {
    mocks.call.mockResolvedValue({ data: {
      sessionId: 's1', setupRevision: 7, assignedUids: ['u1'], privateLoyalty: { kind: 'wolf-agent' },
    } });
    await expect(submitExplicitGmLoyaltyAssignment(request)).rejects.toThrow(/receipt|projection/i);
  });
});

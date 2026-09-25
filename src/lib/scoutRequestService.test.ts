import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({ functions: vi.fn(() => ({ kind: 'functions' })) }));

const { httpsCallable } = await import('firebase/functions');
const { requestScout } = await import('./scoutRequestService');
const { isScoutEntitlementHolder } = await import('./scoutRequestAuthority');

const entitlements = [
  ['starlight', 'wing-commander', 'aegis', 'craft'],
  ['hummingbird', 'quellon-explorer', 'quellon', 'craft'],
  ['endeavour', 'shepherd-scientist', 'shepherd', 'craft'],
  ['comms-officer', 'comms-officer', 'aegis', 'replacement-role'],
] as const;

function setEntitlement(entitlementId: string): void {
  const current = useSessionStore.getState();
  const session = current.session!;
  const player = current.me!;
  const entitlement = entitlements.find(([id]) => id === entitlementId);
  if (!entitlement) throw new Error('Unknown fixture entitlement.');
  const [, ownerRoleId, , source] = entitlement;
  current.setMe(source === 'replacement-role'
    ? {
        ...player,
        assignedRoleId: 'wing-commander',
        seatId: 'wing-commander',
        replacementRoleId: 'comms-officer',
        activeConsoleRoleId: null,
      }
    : {
        ...player,
        assignedRoleId: ownerRoleId,
        seatId: ownerRoleId,
        replacementRoleId: null,
        activeConsoleRoleId: ownerRoleId,
      });
  current.setSession({ ...session });
}

beforeEach(() => {
  vi.mocked(httpsCallable).mockReset();
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table', joinCode: '4821', phase: 'active', currentTurn: 2,
      activeRoleIds: ['wing-commander', 'quellon-explorer', 'shepherd-scientist'],
      activeVesselIds: ['aegis', 'quellon', 'shepherd'],
      turnPhase: {
        turn: 2, teamPhaseEndsAt: '2099-01-01T00:00:00.000Z',
        openAirspaceEndsAt: '2099-01-01T00:10:00.000Z',
        airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
      },
      ownerUid: 'gm1', createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'Operator', role: 'player', seatId: 'wing-commander',
      assignedRoleId: 'wing-commander', replacementRoleId: null,
      activeConsoleRoleId: 'wing-commander', joinedAt: '2026-01-01T00:00:00.000Z',
    },
  );
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it.each(entitlements)('sends only the printed %s request identity and coordinate', async (
  entitlementId, ownerRoleId, anchorShipId, source,
) => {
  setEntitlement(entitlementId);
  const call = vi.fn().mockResolvedValue({ data: {
    status: 'requested', resolution: 'pending', requestId: 'scout-1', sessionId: 's1', cycle: 2,
    entitlementId, source, ownerRoleId, anchorShipId, targetCoordinate: '5143',
  } });
  vi.mocked(httpsCallable).mockReturnValue(call as never);

  await expect(requestScout({ entitlementId, targetCoordinate: '5143', requestId: 'scout-1' }))
    .resolves.toEqual({
      status: 'requested', resolution: 'pending', requestId: 'scout-1', sessionId: 's1', cycle: 2,
      entitlementId, source, ownerRoleId, anchorShipId, targetCoordinate: '5143',
    });
  expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'requestScout');
  expect(call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'scout-1', entitlementId, targetCoordinate: '5143',
  });
  expect(call.mock.calls[0]?.[0]).not.toHaveProperty('origin');
  expect(call.mock.calls[0]?.[0]).not.toHaveProperty('chartFact');
});

it.each([
  ['wrong core role', 'starlight', { assignedRoleId: 'quellon-explorer', seatId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer' }],
  ['replacement cannot reuse historical core role', 'starlight', { replacementRoleId: 'comms-officer', activeConsoleRoleId: null }],
  ['different replacement', 'comms-officer', { replacementRoleId: 'doctor', activeConsoleRoleId: null }],
  ['replacement with active core console', 'comms-officer', { replacementRoleId: 'comms-officer', activeConsoleRoleId: 'wing-commander' }],
] as const)('hides %s request authority from the wrong player', (_label, entitlementId, patch) => {
  setEntitlement(entitlementId);
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, ...patch });

  expect(isScoutEntitlementHolder(entitlementId, useSessionStore.getState().session, useSessionStore.getState().me))
    .toBe(false);
});

it.each([
  ['invalid coordinate', { targetCoordinate: '9999x' }],
  ['invalid request id', { requestId: 'contains spaces' }],
] as const)('rejects %s before calling the server', async (_label, patch) => {
  await expect(requestScout({
    entitlementId: 'starlight', targetCoordinate: '5143', requestId: 'scout-1', ...patch,
  })).rejects.toThrow();
  expect(httpsCallable).not.toHaveBeenCalled();
});

it('requires a fresh live snapshot and the active Coordination phase', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(requestScout({
    entitlementId: 'starlight', targetCoordinate: '5143', requestId: 'scout-cache',
  })).rejects.toThrow(/reconnect/i);
  expect(httpsCallable).not.toHaveBeenCalled();

  useSessionStore.getState().setSessionSnapshotFreshness('server');
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    turnPhase: {
      ...useSessionStore.getState().session!.turnPhase!,
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  await expect(requestScout({
    entitlementId: 'starlight', targetCoordinate: '5143', requestId: 'scout-team-phase',
  })).rejects.toThrow(/coordination/i);
  expect(httpsCallable).not.toHaveBeenCalled();
});

it('rejects replies that include chart or organiser data', async () => {
  const call = vi.fn().mockResolvedValue({ data: {
    status: 'requested', resolution: 'pending', requestId: 'scout-1', sessionId: 's1', cycle: 2,
    entitlementId: 'starlight', source: 'craft', ownerRoleId: 'wing-commander', anchorShipId: 'aegis',
    targetCoordinate: '5143', chartFact: 'GM-only',
  } });
  vi.mocked(httpsCallable).mockReturnValue(call as never);

  await expect(requestScout({
    entitlementId: 'starlight', targetCoordinate: '5143', requestId: 'scout-1',
  })).rejects.toThrow(/invalid/i);
});

it('rejects replies bound to a different target or session', async () => {
  const call = vi.fn().mockResolvedValue({ data: {
    status: 'requested', resolution: 'pending', requestId: 'scout-1', sessionId: 's2', cycle: 2,
    entitlementId: 'starlight', source: 'craft', ownerRoleId: 'wing-commander', anchorShipId: 'aegis',
    targetCoordinate: '8378',
  } });
  vi.mocked(httpsCallable).mockReturnValue(call as never);

  await expect(requestScout({
    entitlementId: 'starlight', targetCoordinate: '5143', requestId: 'scout-1',
  })).rejects.toThrow(/invalid/i);
});

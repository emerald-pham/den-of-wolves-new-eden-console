import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { INITIAL_SHIP_RESOURCES } from '@/data/resources';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Voyage33Admission, Voyage33MaintenanceState, Voyage33MovementState } from '@/types/game';
import { emptyVoyage33MaintenanceState } from '../../functions/src/voyage33Maintenance';
import { VOYAGE_33_ID } from '../../functions/src/voyageAdmission';
import { dockVoyage33Movement, jumpVoyage33Movement } from './voyage33MovementService';

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ functions: vi.fn(() => ({ name: 'test-functions' })) }));

const admission = (sessionId: string): Voyage33Admission => ({
  type: 'voyage-admission',
  sessionId: sessionId as Voyage33Admission['sessionId'],
  id: VOYAGE_33_ID,
  status: 'admitted',
  crisisId: 'arrival-1',
  crisisRevision: 3,
  population: 40_000,
  unrest: 0,
  hostShipId: null,
  commitments: {
    requiresHostDocking: true,
    hostProvidesResources: true,
    maintenanceSteps: [1, 2, 3, 4],
    maxConsoleCharges: 1,
  },
});

function phase(kind: 'team' | 'coordination') {
  const now = Date.now();
  return {
    turn: 1,
    teamPhaseEndsAt: new Date(kind === 'team' ? now + 60_000 : now - 60_000).toISOString(),
    openAirspaceEndsAt: new Date(now + 60_000).toISOString(),
    airspace: {
      state: kind === 'team' ? 'restricted' as const : 'lifted' as const,
      tickerActive: true,
      pressAccess: false,
    },
  };
}

function movementState(coordinate = '0000', revision = 0, lastJumpTurn?: number): Voyage33MovementState {
  return {
    id: VOYAGE_33_ID,
    coordinate,
    revision,
    jumpState: lastJumpTurn === undefined ? {} : { lastJumpTurn },
  };
}

function maintenanceState(
  hostShipId: string | null = null,
  dockingRevision = 0,
): Voyage33MaintenanceState {
  const base = emptyVoyage33MaintenanceState(hostShipId);
  return {
    ...base,
    dockingRevision,
    cycle: {
      ...base.cycle,
      turn: 1,
      charges: [],
    },
  };
}

function sessionFixture(
  sessionId = 'voyage-session-a',
  overrides: Partial<GameSession> = {},
): GameSession {
  return {
    id: sessionId as GameSession['id'],
    name: 'Movement test',
    joinCode: '4821',
    phase: 'active',
    currentTurn: 1,
    activeVesselIds: ['aegis', 'dione'],
    admittedVesselIds: [VOYAGE_33_ID],
    voyage33Admission: admission(sessionId),
    voyage33Maintenance: maintenanceState(),
    turnPhase: phase('team'),
    shipGalacticCoordinates: { aegis: '0000', dione: '5143' },
    shipResources: {
      aegis: { ...INITIAL_SHIP_RESOURCES.aegis, fuel: 5 },
      dione: { ...INITIAL_SHIP_RESOURCES.dione, fuel: 3 },
    },
    shipDamage: {},
    organiserSystems: {
      'system-01': '0000',
      'system-02': '5143',
      'system-03': '1413',
      'system-04': '9997',
    },
    organiserSites: {
      '0000': { code: 'A', name: 'Origin site', candidate: false, summary: '' },
      '5143': { code: 'B', name: 'Known nearby site', candidate: false, summary: '' },
    },
    ...overrides,
  } as GameSession;
}

function installGm(session: GameSession, role: 'gm' | 'player' = 'gm', instanceId = 'gm-instance-1') {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(session, {
    uid: 'gm-user',
    sessionId: session.id,
    displayName: 'Facilitator',
    role,
    seatId: null,
    joinedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setGmInstance({
    id: instanceId,
    sessionId: session.id,
    uid: 'gm-user',
    name: 'Bridge console',
    deviceLabel: 'test browser',
    claimedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

function dockReply(sessionId: string, requestId: string, expectedMovementRevision = 0, expectedDockingRevision = 0) {
  const movement = movementState('0000', expectedMovementRevision);
  const maintenance = maintenanceState('aegis', expectedDockingRevision + 1);
  return {
    status: 'committed',
    sessionId,
    requestId,
    shipId: VOYAGE_33_ID,
    hostShipId: 'aegis',
    expectedMovementRevision,
    committedMovementRevision: movement.revision,
    expectedDockingRevision,
    currentDockingRevision: maintenance.dockingRevision,
    movementState: movement,
    maintenanceState: maintenance,
  };
}

function jumpReply(sessionId: string, requestId: string) {
  const movement = movementState('5143', 6, 1);
  const maintenance = maintenanceState(null, 8);
  return {
    status: 'jumped',
    sessionId,
    requestId,
    shipId: VOYAGE_33_ID,
    previousHostShipId: 'aegis',
    expectedMovementRevision: 5,
    committedMovementRevision: movement.revision,
    expectedDockingRevision: 7,
    currentDockingRevision: maintenance.dockingRevision,
    movementState: movement,
    maintenanceState: maintenance,
    transition: {
      id: `voyage-jump-${requestId}`,
      shipId: VOYAGE_33_ID,
      origin: '0000',
      destination: '5143',
      occurredAt: '2026-01-01T00:00:00.000Z',
    },
    fuelSpent: 1,
  };
}

beforeEach(() => {
  vi.mocked(httpsCallable).mockReset();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

describe('authenticated Voyage 33-0 movement service', () => {
  it('sends the exact docking command from a fresh GM session and validates its receipt', async () => {
    const session = sessionFixture();
    installGm(session);
    const call = vi.fn(async (payload: { requestId: string }) => ({
      data: dockReply(session.id, payload.requestId),
    }));
    vi.mocked(httpsCallable).mockReturnValue(call as never);

    await expect(dockVoyage33Movement('aegis')).resolves.toMatchObject({ status: 'committed' });

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'dockVoyage33');
    const payload = call.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toEqual({
      sessionId: session.id,
      shipId: VOYAGE_33_ID,
      hostShipId: 'aegis',
      instanceId: 'gm-instance-1',
      requestId: expect.stringMatching(/^[A-Za-z0-9_-]{1,128}$/),
      expectedMovementRevision: 0,
      expectedDockingRevision: 0,
    });
  });

  it('sends a currently projected jump without a Jump Drive charge and accepts the host-fuel receipt', async () => {
    const sessionId = 'voyage-session-jump';
    const session = sessionFixture(sessionId, {
      turnPhase: phase('coordination'),
      voyage33Movement: movementState('0000', 5),
      voyage33Maintenance: maintenanceState('aegis', 7),
    });
    installGm(session);
    const call = vi.fn(async (payload: { requestId: string }) => ({
      data: jumpReply(sessionId, payload.requestId),
    }));
    vi.mocked(httpsCallable).mockReturnValue(call as never);

    await expect(jumpVoyage33Movement('5143')).resolves.toMatchObject({ status: 'jumped', fuelSpent: 1 });

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'jumpVoyage33');
    expect(call.mock.calls[0]?.[0]).toEqual({
      sessionId,
      shipId: VOYAGE_33_ID,
      hostShipId: 'aegis',
      destination: '5143',
      instanceId: 'gm-instance-1',
      requestId: expect.stringMatching(/^[A-Za-z0-9_-]{1,128}$/),
      expectedMovementRevision: 5,
      expectedDockingRevision: 7,
    });
  });

  it('blocks non-GM or cached-session commands before calling Firebase', async () => {
    const session = sessionFixture('voyage-session-stale');
    installGm(session, 'player');
    await expect(dockVoyage33Movement('aegis')).rejects.toThrow();
    useSessionStore.getState().setIdentity(session, {
      uid: 'gm-user', sessionId: session.id, displayName: 'Facilitator', role: 'gm', seatId: null,
      joinedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setSessionSnapshotFreshness('cache');
    await expect(dockVoyage33Movement('aegis')).rejects.toThrow(/server snapshot|reconnect|live/i);
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it('keeps one request id for the exact same command after an ambiguous transport failure', async () => {
    const session = sessionFixture('voyage-session-retry');
    installGm(session);
    const call = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('response lost'), { code: 'functions/unavailable' }))
      .mockImplementationOnce(async (payload: { requestId: string }) => ({
        data: dockReply(session.id, payload.requestId),
      }));
    vi.mocked(httpsCallable).mockReturnValue(call as never);

    await expect(dockVoyage33Movement('aegis')).rejects.toMatchObject({
      name: 'Voyage33MovementUncertainError',
    });
    await expect(dockVoyage33Movement('aegis')).resolves.toMatchObject({ status: 'committed' });

    const first = call.mock.calls[0]?.[0] as { requestId: string };
    const second = call.mock.calls[1]?.[0] as { requestId: string };
    expect(first.requestId).toBe(second.requestId);
  });

  it('does not accept a late receipt after the GM instance changes and reuses its id after recovery', async () => {
    const session = sessionFixture('voyage-session-context-switch');
    installGm(session);
    const originalInstance = useSessionStore.getState().gmInstance!;
    const call = vi.fn()
      .mockImplementationOnce(async (payload: { requestId: string }) => {
        useSessionStore.getState().setGmInstance({
          ...originalInstance,
          id: 'replacement-instance',
        });
        return { data: dockReply(session.id, payload.requestId) };
      })
      .mockImplementationOnce(async (payload: { requestId: string }) => ({
        data: dockReply(session.id, payload.requestId),
      }));
    vi.mocked(httpsCallable).mockReturnValue(call as never);

    await expect(dockVoyage33Movement('aegis')).rejects.toMatchObject({
      name: 'Voyage33MovementUncertainError',
    });
    useSessionStore.getState().setGmInstance(originalInstance);
    await expect(dockVoyage33Movement('aegis')).resolves.toMatchObject({ status: 'committed' });

    const first = call.mock.calls[0]?.[0] as { requestId: string };
    const second = call.mock.calls[1]?.[0] as { requestId: string };
    expect(first.requestId).toBe(second.requestId);
  });

  it('returns a stale receipt without treating it as a committed docking command', async () => {
    const session = sessionFixture('voyage-session-stale-receipt');
    installGm(session);
    const call = vi.fn(async (payload: { requestId: string }) => ({
      data: {
        status: 'stale',
        sessionId: session.id,
        requestId: payload.requestId,
        shipId: VOYAGE_33_ID,
        expectedMovementRevision: 0,
        currentMovementRevision: 1,
        expectedDockingRevision: 0,
        currentDockingRevision: 0,
      },
    }));
    vi.mocked(httpsCallable).mockReturnValue(call as never);

    await expect(dockVoyage33Movement('aegis')).resolves.toMatchObject({
      status: 'stale',
      currentMovementRevision: 1,
    });
  });

  it('rejects a jump outside the current facilitator navigation projection', async () => {
    const session = sessionFixture('voyage-session-private-route', {
      turnPhase: phase('coordination'),
      voyage33Movement: movementState('0000', 1),
      voyage33Maintenance: maintenanceState('aegis', 2),
    });
    installGm(session);

    await expect(jumpVoyage33Movement('4888')).rejects.toThrow(/current.*navigation|projected|known/i);
    expect(httpsCallable).not.toHaveBeenCalled();
  });
});

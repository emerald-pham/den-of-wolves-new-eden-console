import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
import { runSmallShipMaintenance } from './smallShipService';
import { getSmallShipJumpWorkspace, jumpSmallShip } from './smallShipJumpService';

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ functions: vi.fn(() => ({ name: 'test-functions' })) }));
vi.mock('./smallShipService', () => ({ runSmallShipMaintenance: vi.fn() }));

const session = {
  id: 'small-jump-session', name: 'Jump test', joinCode: '4821', phase: 'active', currentTurn: 4,
  expansion: 'base', capybaraEnabled: true,
  smallShipStates: {
    gorgoneion: {
      id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 3, population: 1000, unrest: 0,
      cycle: { step: 0, revision: 8, results: {}, charges: ['jump-drive'], turn: 4 },
    },
  },
} as GameSession;

function installCaptain(overrides: Partial<Player> = {}) {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(session, {
    uid: 'captain-1', sessionId: session.id, displayName: 'Captain', role: 'player', seatId: null,
    replacementRoleId: 'gorgoneion-captain', replacementStatus: null, activeConsoleRoleId: null,
    joinedAt: '2026-01-01T00:00:00.000Z', ...overrides,
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  vi.mocked(httpsCallable).mockReset();
  vi.mocked(runSmallShipMaintenance).mockReset();
  installCaptain();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

describe('authenticated small-craft jump service', () => {
  it('loads the private callable projection for only the entitled Captain', async () => {
    const projection = {
      viewer: 'captain', sessionId: session.id, smallShipId: 'gorgoneion', actorUid: 'captain-1',
      hostShipId: 'aegis', currentCoordinate: '0000', movementRevision: 2, dockingRevision: 3,
      cycleRevision: 8, currentTurn: 4, charged: true, hostFuel: 5,
      knownDestinations: [{ coordinate: '5143', length: 'short', fuelCost: 1 }],
    };
    const call = vi.fn(async () => ({ data: projection }));
    vi.mocked(httpsCallable).mockReturnValue(call as never);

    await expect(getSmallShipJumpWorkspace('gorgoneion')).resolves.toEqual(projection);
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'getSmallShipJumpWorkspace');
    expect(call).toHaveBeenCalledWith({ sessionId: session.id, smallShipId: 'gorgoneion' });
  });

  it('sends server-owned revisions, host, destination, and stable request identity', async () => {
    const reply = {
      status: 'committed', sessionId: session.id, smallShipId: 'gorgoneion',
      requestId: 'jump-stable', origin: '0000', destination: '5143', length: 'short',
      fuelCost: 1, remainingHostFuel: 4, movementRevision: 3, dockingRevision: 4,
      cycleRevision: 9,
    };
    const call = vi.fn(async () => ({ data: reply }));
    vi.mocked(httpsCallable).mockReturnValue(call as never);

    await expect(jumpSmallShip({
      smallShipId: 'gorgoneion', hostShipId: 'aegis', destination: '5143',
      expectedMovementRevision: 2, expectedDockingRevision: 3, expectedCycleRevision: 8,
      requestId: 'jump-stable',
    })).resolves.toEqual(reply);
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'jumpSmallShip');
    expect(call).toHaveBeenCalledWith({
      sessionId: session.id, smallShipId: 'gorgoneion', hostShipId: 'aegis',
      destination: '5143', expectedMovementRevision: 2, expectedDockingRevision: 3,
      expectedCycleRevision: 8, requestId: 'jump-stable',
    });
  });

  it('fails before a callable when the Captain role is pending, host projection is absent, or session is cached', async () => {
    installCaptain({ replacementStatus: 'awaiting-re-role' });
    await expect(getSmallShipJumpWorkspace('gorgoneion')).rejects.toThrow(/current small-craft Captain/i);
    expect(httpsCallable).not.toHaveBeenCalled();

    installCaptain();
    useSessionStore.getState().setSession({ ...session, smallShipStates: {} });
    await expect(jumpSmallShip({
      smallShipId: 'gorgoneion', hostShipId: 'aegis', destination: '5143',
      expectedMovementRevision: 2, expectedDockingRevision: 3, expectedCycleRevision: 8,
      requestId: 'jump-no-host',
    })).rejects.toThrow(/dock/i);
    expect(httpsCallable).not.toHaveBeenCalled();

    installCaptain();
    useSessionStore.getState().setSessionSnapshotFreshness('cache');
    await expect(getSmallShipJumpWorkspace('gorgoneion')).rejects.toThrow(/refresh/i);
    expect(httpsCallable).not.toHaveBeenCalled();
  });
});

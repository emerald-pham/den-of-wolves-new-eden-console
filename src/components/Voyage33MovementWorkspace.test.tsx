import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_SHIP_RESOURCES } from '@/data/resources';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Voyage33Admission, Voyage33MaintenanceState, Voyage33MovementState } from '@/types/game';
import { emptyVoyage33MaintenanceState } from '../../functions/src/voyage33Maintenance';
import { VOYAGE_33_ID } from '../../functions/src/voyageAdmission';
import Voyage33MovementWorkspace from './Voyage33MovementWorkspace';
import { dockVoyage33Movement, jumpVoyage33Movement } from '@/lib/voyage33MovementService';

vi.mock('@/lib/voyage33MovementService', () => ({
  dockVoyage33Movement: vi.fn(),
  jumpVoyage33Movement: vi.fn(),
}));

const movementService = await import('@/lib/voyage33MovementService');

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
  charged = false,
): Voyage33MaintenanceState {
  const base = emptyVoyage33MaintenanceState(hostShipId);
  return {
    ...base,
    dockingRevision,
    cycle: {
      ...base.cycle,
      turn: 1,
      charges: charged ? ['jump-drive'] : [],
    },
  };
}

function sessionFixture(
  sessionId = 'voyage-workspace-a',
  overrides: Partial<GameSession> = {},
): GameSession {
  return {
    id: sessionId as GameSession['id'],
    name: 'Movement review',
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
      'system-22': '4888',
    },
    organiserSites: {
      '0000': { code: 'A', name: 'Origin site', candidate: false, summary: '' },
      '5143': { code: 'B', name: 'Known nearby site', candidate: false, summary: '' },
    },
    ...overrides,
  } as GameSession;
}

function installGm(session: GameSession, freshness: 'server' | 'cache' = 'server') {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(session, {
    uid: 'gm-user',
    sessionId: session.id,
    displayName: 'Facilitator',
    role: 'gm',
    seatId: null,
    joinedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setGmInstance({
    id: 'gm-instance-1',
    sessionId: session.id,
    uid: 'gm-user',
    name: 'Bridge console',
    deviceLabel: 'test browser',
    claimedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness(freshness);
}

beforeEach(() => {
  vi.mocked(dockVoyage33Movement).mockReset();
  vi.mocked(jumpVoyage33Movement).mockReset();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

describe('Voyage 33-0 movement workspace', () => {
  it('offers only active core hosts and leaves the initial origin unresolved until docking', () => {
    const session = sessionFixture('voyage-workspace-dock', {
      activeVesselIds: ['aegis', 'dione'],
      voyage33Movement: undefined,
      voyage33Maintenance: maintenanceState(),
      shipDamage: { dione: { damagedSystemIds: [], destroyed: true } },
    });
    installGm(session);
    render(<Voyage33MovementWorkspace />);

    const workspace = screen.getByRole('region', { name: 'Voyage 33-0 movement workspace' });
    expect(within(workspace).getByText(/origin will be set by the selected host/i)).toBeInTheDocument();
    expect(within(workspace).getAllByRole('button', { name: /dock with/i })).toHaveLength(1);
    expect(within(workspace).queryByRole('button', { name: /dock with.*dione/i })).not.toBeInTheDocument();
    expect(within(workspace).queryByRole('button', { name: /dock with.*voyage/i })).not.toBeInTheDocument();
  });

  it('uses only GM-projected destinations, displays 1/1/2 host fuel, and sends jumps through the service', async () => {
    const session = sessionFixture('voyage-workspace-jump', {
      turnPhase: phase('coordination'),
      voyage33Movement: movementState('0000', 5),
      voyage33Maintenance: maintenanceState('aegis', 7, true),
    });
    installGm(session);
    vi.mocked(jumpVoyage33Movement).mockResolvedValue({
      status: 'jumped',
      movementState: movementState('5143', 6, 1),
      maintenanceState: maintenanceState(null, 8),
      fuelSpent: 1,
    } as never);
    render(<Voyage33MovementWorkspace />);

    const workspace = screen.getByRole('region', { name: 'Voyage 33-0 movement workspace' });
    expect(within(workspace).getByRole('button', { name: 'Jump to Known nearby site // short // 1 host fuel' })).toBeInTheDocument();
    expect(within(workspace).getByRole('button', { name: 'Jump to 9997 // medium // 1 host fuel' })).toBeInTheDocument();
    expect(within(workspace).getByRole('button', { name: 'Jump to 4888 // long // 2 host fuel' })).toBeInTheDocument();
    expect(within(workspace).queryByRole('button', { name: /Jump to 0408/i })).not.toBeInTheDocument();
    expect(within(workspace).getByText(/Voyage 33-0 is an extra ship, not a base small ship/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(workspace).getByRole('button', { name: /Jump to Known nearby site/i }));
    });

    expect(jumpVoyage33Movement).toHaveBeenCalledWith('5143');
    expect(within(workspace).getByText(/Current location/i).parentElement).toHaveTextContent('0000');
    expect(within(workspace).getByRole('status')).toHaveTextContent(/committed|server projection/i);
  });

  it('does not expose jump actions without a current-cycle charge or from a cached session', () => {
    const uncharged = sessionFixture('voyage-workspace-uncharged', {
      turnPhase: phase('coordination'),
      voyage33Movement: movementState('0000', 2),
      voyage33Maintenance: maintenanceState('aegis', 3, false),
    });
    installGm(uncharged);
    const { rerender } = render(<Voyage33MovementWorkspace />);
    expect(screen.getByText(/charge the voyage.*jump drive|jump drive charge.*current/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /jump to/i })).not.toBeInTheDocument();

    const stale = sessionFixture('voyage-workspace-stale');
    installGm(stale, 'cache');
    rerender(<Voyage33MovementWorkspace />);
    expect(screen.getByRole('status')).toHaveTextContent(/waiting for a current live server snapshot/i);
    expect(screen.queryByRole('button', { name: /dock with|jump to/i })).not.toBeInTheDocument();
    expect(movementService.jumpVoyage33Movement).not.toHaveBeenCalled();
  });
});

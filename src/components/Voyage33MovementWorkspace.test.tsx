import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_SHIP_RESOURCES } from '@/data/resources';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Voyage33Admission, Voyage33MaintenanceState, Voyage33MovementState } from '@/types/game';
import { emptyVoyage33MaintenanceState } from '../../functions/src/voyage33Maintenance';
import { VOYAGE_33_ID } from '../../functions/src/voyageAdmission';
import Voyage33MovementWorkspace from './Voyage33MovementWorkspace';
import { dockVoyage33Movement, jumpVoyage33Movement } from '@/lib/voyage33MovementService';

const { runVoyage33Maintenance } = vi.hoisted(() => ({
  runVoyage33Maintenance: vi.fn(),
}));

vi.mock('@/lib/voyage33MovementService', () => {
  class MockUncertainError extends Error {
    constructor(readonly attempt: Record<string, unknown>, message = 'connection result unavailable') {
      super(message);
      this.name = 'Voyage33MovementUncertainError';
    }
  }
  class MockRejectedError extends Error {
    constructor(readonly attempt: Record<string, unknown>, message = 'movement rejected') {
      super(message);
      this.name = 'Voyage33MovementRejectedError';
    }
  }
  return {
    Voyage33MovementUncertainError: MockUncertainError,
    Voyage33MovementRejectedError: MockRejectedError,
    dockVoyage33Movement: vi.fn(),
    jumpVoyage33Movement: vi.fn(),
  };
});

vi.mock('@/lib/smallShipService', () => ({ runVoyage33Maintenance }));

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

function maintenanceCommit(
  session: GameSession,
  requestId: string,
  action: 'rations' | 'unrest',
  expectedRevision: number,
  expectedDockingRevision: number,
  nextState: Voyage33MaintenanceState,
) {
  return {
    status: 'committed',
    requestId,
    sessionId: session.id,
    shipId: VOYAGE_33_ID,
    hostShipId: 'aegis',
    action,
    expectedRevision,
    committedRevision: expectedRevision + 1,
    expectedDockingRevision,
    currentDockingRevision: expectedDockingRevision,
    currentTurn: 1,
    cycle: nextState.cycle,
    result: { state: nextState, hostResources: session.shipResources!.aegis },
  };
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
  runVoyage33Maintenance.mockReset();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

describe('Voyage 33-0 movement workspace', () => {
  it('offers only active core hosts and leaves the initial origin unresolved until docking', async () => {
    const session = sessionFixture('voyage-workspace-dock', {
      activeVesselIds: ['aegis', 'dione'],
      voyage33Maintenance: maintenanceState(),
      shipDamage: { dione: { damagedSystemIds: [], destroyed: true } },
    });
    installGm(session);
    vi.mocked(dockVoyage33Movement).mockResolvedValue({
      status: 'committed',
      movementState: movementState('0000', 0),
      maintenanceState: maintenanceState('aegis', 1),
    } as never);
    render(<Voyage33MovementWorkspace />);

    const workspace = screen.getByRole('region', { name: 'Voyage 33-0 movement workspace' });
    expect(within(workspace).getByText(/origin will be set by the selected host/i)).toBeInTheDocument();
    expect(within(workspace).getAllByRole('button', { name: /dock with/i })).toHaveLength(1);
    expect(within(workspace).queryByRole('button', { name: /dock with.*dione/i })).not.toBeInTheDocument();
    expect(within(workspace).queryByRole('button', { name: /dock with.*voyage/i })).not.toBeInTheDocument();

    fireEvent.click(within(workspace).getByRole('button', { name: /dock with.*aegis/i }));
    expect(dockVoyage33Movement).toHaveBeenCalledWith('aegis');
    expect(await within(workspace).findByText(/COMMITTED.*Waiting for live movement revision 0 and docking revision 1/i)).toBeInTheDocument();
    expect(within(workspace).queryByRole('button', { name: /dock with/i })).not.toBeInTheDocument();
    expect(within(workspace).queryByText('Current location')).not.toBeInTheDocument();
  });

  it('offers only live core hosts co-located with the existing Voyage position', () => {
    const session = sessionFixture('voyage-workspace-colocation', {
      voyage33Movement: movementState('0000', 2),
      voyage33Maintenance: maintenanceState(),
      shipDamage: {},
    });
    installGm(session);
    render(<Voyage33MovementWorkspace />);

    const workspace = screen.getByRole('region', { name: 'Voyage 33-0 movement workspace' });
    expect(within(workspace).getAllByRole('button', { name: /dock with/i })).toHaveLength(1);
    expect(within(workspace).getByRole('button', { name: /dock with.*aegis.*0000/i })).toBeInTheDocument();
    expect(within(workspace).queryByRole('button', { name: /dock with.*dione/i })).not.toBeInTheDocument();
  });

  it('uses only GM-projected destinations, displays 1/1/2 host fuel, and sends jumps through the service', async () => {
    const session = sessionFixture('voyage-workspace-jump', {
      turnPhase: phase('coordination'),
      voyage33Movement: movementState('0000', 5),
      voyage33Maintenance: maintenanceState('aegis', 7),
      shipDamage: { aegis: { damagedSystemIds: ['engine'], destroyed: false } },
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
    expect(within(workspace).getByText('Host state').parentElement).toHaveTextContent(/Damaged/);
    expect(within(workspace).getByRole('button', { name: /Jump to Known nearby site/i })).not.toBeDisabled();
    expect(within(workspace).getByText(/Voyage 33-0 is an extra ship, not a base small ship/i)).toBeInTheDocument();
    expect(workspace).toHaveTextContent(/Server-authorized movement.*current session projection/i);

    expect(within(workspace).getByText('Current location').parentElement).toHaveTextContent('0000');
    await act(async () => {
      fireEvent.click(within(workspace).getByRole('button', { name: /Jump to Known nearby site/i }));
    });

    expect(jumpVoyage33Movement).toHaveBeenCalledWith('5143');
    expect(await within(workspace).findByText(/COMMITTED.*Waiting for live movement revision 6 and docking revision 8/i)).toBeInTheDocument();
    expect(within(workspace).queryByText('Current location')).not.toBeInTheDocument();
  });

  it('offers an exact retry after an uncertain response and disables alternate movement choices', async () => {
    const sessionId = 'voyage-workspace-uncertain';
    const session = sessionFixture(sessionId, {
      turnPhase: phase('coordination'),
      voyage33Movement: movementState('0000', 5),
      voyage33Maintenance: maintenanceState('aegis', 7),
    });
    installGm(session);
    const uncertain = new movementService.Voyage33MovementUncertainError({
      action: 'jump',
      sessionId,
      instanceId: 'gm-instance-1',
      hostShipId: 'aegis',
      destination: '5143',
      expectedMovementRevision: 5,
      expectedDockingRevision: 7,
    } as never);
    vi.mocked(jumpVoyage33Movement)
      .mockRejectedValueOnce(uncertain)
      .mockResolvedValueOnce({
        status: 'jumped',
        movementState: movementState('5143', 6, 1),
        maintenanceState: maintenanceState(null, 8),
        fuelSpent: 1,
      } as never);
    render(<Voyage33MovementWorkspace />);

    const workspace = screen.getByRole('region', { name: 'Voyage 33-0 movement workspace' });
    fireEvent.click(within(workspace).getByRole('button', { name: /Jump to Known nearby site/i }));
    expect(await within(workspace).findByRole('alert')).toHaveTextContent(/UNCERTAIN/i);
    expect(within(workspace).getByRole('button', { name: 'Retry exact jump // 5143' })).toBeInTheDocument();
    expect(within(workspace).getByRole('button', { name: /Jump to 9997/i })).toBeDisabled();

    fireEvent.click(within(workspace).getByRole('button', { name: 'Retry exact jump // 5143' }));
    expect(jumpVoyage33Movement).toHaveBeenCalledTimes(2);
    expect(await within(workspace).findByText(/COMMITTED.*Waiting for live movement revision 6 and docking revision 8/i)).toBeInTheDocument();
  });

  it('holds movement actions after a stale receipt until the live revisions catch up', async () => {
    const sessionId = 'voyage-workspace-stale-receipt';
    const session = sessionFixture(sessionId, {
      turnPhase: phase('coordination'),
      voyage33Movement: movementState('0000', 5),
      voyage33Maintenance: maintenanceState('aegis', 7),
    });
    installGm(session);
    vi.mocked(jumpVoyage33Movement).mockResolvedValue({
      status: 'stale',
      currentMovementRevision: 6,
      currentDockingRevision: 8,
    });
    render(<Voyage33MovementWorkspace />);

    const workspace = screen.getByRole('region', { name: 'Voyage 33-0 movement workspace' });
    fireEvent.click(within(workspace).getByRole('button', { name: /Jump to Known nearby site/i }));
    expect(await within(workspace).findByText(/STALE.*Waiting for live movement revision 6/i)).toBeInTheDocument();
    expect(within(workspace).queryByRole('button', { name: /Jump to/i })).not.toBeInTheDocument();

    await act(async () => {
      useSessionStore.getState().setSession({
        ...session,
        voyage33Movement: movementState('0000', 6),
        voyage33Maintenance: maintenanceState('aegis', 8),
      });
    });
    expect(await within(workspace).findByRole('button', { name: /Jump to Known nearby site/i })).toBeInTheDocument();
  });

  it('mounts Voyage 33-0 maintenance in Team when the admitted vessel has a current host', () => {
    const base = emptyVoyage33MaintenanceState('aegis');
    const session = sessionFixture('voyage-workspace-maintenance', {
      voyage33Movement: movementState('0000', 2),
      voyage33Maintenance: {
        ...base,
        dockingRevision: 4,
        cycle: { ...base.cycle, step: 0, revision: 2 },
      },
    });
    installGm(session);
    render(<Voyage33MovementWorkspace />);

    const workspace = screen.getByRole('region', { name: 'Voyage 33-0 movement workspace' });
    const maintenance = within(workspace).getByRole('region', { name: 'Voyage 33-0 maintenance' });
    expect(maintenance).toHaveTextContent(/AEGIS.*host/i);
    expect(maintenance).toHaveTextContent(/8 food.*6 water/i);
    expect(within(maintenance).getByRole('button', { name: /begin maintenance cycle/i })).toBeEnabled();
  });

  it('shows only the two printed production choices in the Voyage reactor step', () => {
    const base = emptyVoyage33MaintenanceState('aegis');
    const session = sessionFixture('voyage-workspace-maintenance-charge', {
      voyage33Movement: movementState('0000', 2),
      voyage33Maintenance: {
        ...base,
        dockingRevision: 4,
        cycle: { ...base.cycle, step: 4, revision: 4, turn: 1 },
      },
    });
    installGm(session);
    render(<Voyage33MovementWorkspace />);

    const maintenance = screen.getByRole('region', { name: 'Voyage 33-0 maintenance' });
    expect(within(maintenance).getByRole('radio', { name: /Hydroponics/i })).toBeInTheDocument();
    expect(within(maintenance).getByRole('radio', { name: /Water Reclimator/i })).toBeInTheDocument();
    expect(within(maintenance).queryByRole('radio', { name: /Jump Drive/i })).not.toBeInTheDocument();
  });

  it('waits for the server receipt before showing the actual unrest dice result', async () => {
    const base = emptyVoyage33MaintenanceState('aegis');
    const session = sessionFixture('voyage-workspace-maintenance-receipt', {
      voyage33Movement: movementState('0000', 2),
      voyage33Maintenance: {
        ...base,
        dockingRevision: 4,
        unrest: 0,
        cycle: {
          ...base.cycle,
          step: 2,
          revision: 2,
          turn: 1,
          rationBonus: 9,
          results: { '1': 'Ration choice recorded by the server.' },
        },
      },
    });
    installGm(session);

    let resolveReceipt!: (value: unknown) => void;
    runVoyage33Maintenance.mockImplementation(() => new Promise((resolve) => {
      resolveReceipt = resolve;
    }));
    render(<Voyage33MovementWorkspace />);

    const maintenance = screen.getByRole('region', { name: 'Voyage 33-0 maintenance' });
    fireEvent.click(within(maintenance).getByRole('button', { name: /roll.*unrest/i }));

    expect(runVoyage33Maintenance).toHaveBeenCalledWith(
      'unrest', 2, 4, {}, expect.any(String),
    );
    expect(within(maintenance).getByText(/waiting for the server receipt for roll unrest/i)).toBeInTheDocument();
    expect(within(maintenance).queryByText(/Rolled 5 \+ 5 \+ 9 = 19/i)).not.toBeInTheDocument();

    const requestId = runVoyage33Maintenance.mock.calls[0]?.[4] as string;
    const nextState = {
      ...session.voyage33Maintenance!,
      unrest: 1,
      cycle: {
        ...session.voyage33Maintenance!.cycle,
        step: 3,
        revision: 3,
        results: {
          ...session.voyage33Maintenance!.cycle.results,
          '2': 'Rolled 5 + 5 + 9 = 19. Added 1 unrest; unrest 1.',
        },
      },
    };
    await act(async () => resolveReceipt({
      status: 'committed',
      requestId,
      sessionId: session.id,
      shipId: VOYAGE_33_ID,
      hostShipId: 'aegis',
      action: 'unrest',
      expectedRevision: 2,
      committedRevision: 3,
      expectedDockingRevision: 4,
      currentDockingRevision: 4,
      currentTurn: 1,
      cycle: nextState.cycle,
      result: {
        state: nextState,
        hostResources: session.shipResources!.aegis,
      },
    }));

    expect(await within(maintenance).findByText(/Rolled 5 \+ 5 \+ 9 = 19\. Added 1 unrest; unrest 1\./)).toBeInTheDocument();
    expect(within(maintenance).getByText(/waiting for the live session projection to reflect this result and the current host resource ledger/i)).toBeInTheDocument();

    const originalHostResources = session.shipResources!.aegis!;
    const changedBalances = {
      ...originalHostResources,
      food: originalHostResources.food - 1,
    };
    const sameRevisionMismatch: Voyage33MaintenanceState = {
      ...nextState,
      unrest: 2,
      cycle: {
        ...nextState.cycle,
        results: { ...nextState.cycle.results, '2': 'Mismatched same-revision projection.' },
      },
    };
    await act(async () => useSessionStore.getState().setSession({
      ...session,
      voyage33Maintenance: sameRevisionMismatch,
      shipResources: { ...session.shipResources, aegis: changedBalances },
    }));
    expect(within(maintenance).getByText(/waiting for the live session projection to reflect this result and the current host resource ledger/i)).toBeInTheDocument();
    expect(within(maintenance).getByRole('button', { name: /roll population \/ riot/i })).toBeDisabled();

    await act(async () => useSessionStore.getState().setSession({
      ...session,
      voyage33Maintenance: nextState,
      shipResources: { ...session.shipResources, aegis: changedBalances },
    }));
    expect(await within(maintenance).findByText(/live session projection now matches the server maintenance receipt/i)).toBeInTheDocument();
    expect(within(maintenance).getByRole('button', { name: /roll population \/ riot/i })).toBeEnabled();
    expect(within(maintenance).getByText(/7 food \/\/ 6 water \/\/ 5 fuel/i)).toBeInTheDocument();
  });

  it('sends explicit ration levels to the current host and waits for the receipt', async () => {
    const base = emptyVoyage33MaintenanceState('aegis');
    const session = sessionFixture('voyage-workspace-rations', {
      voyage33Movement: movementState('0000', 2),
      voyage33Maintenance: {
        ...base,
        dockingRevision: 4,
        cycle: { ...base.cycle, step: 1, revision: 1, turn: 1 },
      },
    });
    installGm(session);
    runVoyage33Maintenance.mockImplementation(() => new Promise(() => undefined));
    render(<Voyage33MovementWorkspace />);

    const maintenance = screen.getByRole('region', { name: 'Voyage 33-0 maintenance' });
    fireEvent.change(within(maintenance).getByLabelText('Voyage 33-0 food ration level'), { target: { value: '1' } });
    fireEvent.change(within(maintenance).getByLabelText('Voyage 33-0 water ration level'), { target: { value: '2' } });
    fireEvent.click(within(maintenance).getByRole('button', { name: /apply host-funded rations/i }));

    expect(runVoyage33Maintenance).toHaveBeenCalledWith('rations', 1, 4, {
      foodLevel: 1,
      waterLevel: 2,
    }, expect.any(String));
    expect(within(maintenance).getByText(/waiting for the server receipt for apply rations/i)).toBeInTheDocument();
  });

  it('keeps a stale maintenance action held until the live projection catches up', async () => {
    const base = emptyVoyage33MaintenanceState('aegis');
    const session = sessionFixture('voyage-workspace-maintenance-stale', {
      voyage33Movement: movementState('0000', 2),
      voyage33Maintenance: {
        ...base,
        dockingRevision: 4,
        cycle: { ...base.cycle, step: 1, revision: 1, turn: 1 },
      },
    });
    installGm(session);
    runVoyage33Maintenance.mockImplementation(async (_action, _revision, _dockingRevision, _choices, requestId) => ({
      status: 'stale',
      requestId,
      sessionId: session.id,
      shipId: VOYAGE_33_ID,
      hostShipId: 'aegis',
      action: 'rations',
      expectedRevision: 1,
      currentRevision: 2,
      expectedDockingRevision: 4,
      currentDockingRevision: 4,
    }));
    render(<Voyage33MovementWorkspace />);

    const maintenance = screen.getByRole('region', { name: 'Voyage 33-0 maintenance' });
    fireEvent.click(within(maintenance).getByRole('button', { name: /apply host-funded rations/i }));
    expect(await within(maintenance).findByText(/STALE \/\/ maintenance or host state changed/i)).toBeInTheDocument();
    expect(within(maintenance).getByRole('button', { name: /apply host-funded rations/i })).toBeDisabled();

    await act(async () => useSessionStore.getState().setSession({
      ...session,
      voyage33Maintenance: {
        ...session.voyage33Maintenance!,
        cycle: { ...session.voyage33Maintenance!.cycle, step: 2, revision: 2 },
      },
    }));
    expect(await within(maintenance).findByRole('button', { name: /roll unrest/i })).toBeEnabled();
  });

  it('offers the exact same maintenance request after an ambiguous response', async () => {
    const sessionId = 'voyage-workspace-maintenance-retry';
    const base = emptyVoyage33MaintenanceState('aegis');
    const session = sessionFixture(sessionId, {
      voyage33Movement: movementState('0000', 2),
      voyage33Maintenance: {
        ...base,
        dockingRevision: 4,
        cycle: { ...base.cycle, step: 2, revision: 2, turn: 1, rationBonus: 9 },
      },
    });
    installGm(session);
    const nextState: Voyage33MaintenanceState = {
      ...session.voyage33Maintenance!,
      unrest: 1,
      cycle: {
        ...session.voyage33Maintenance!.cycle,
        step: 3,
        revision: 3,
        results: { '2': 'Rolled 5 + 5 + 9 = 19. Added 1 unrest; unrest 1.' },
      },
    };
    runVoyage33Maintenance
      .mockRejectedValueOnce(Object.assign(new Error('response lost'), { code: 'functions/unavailable' }))
      .mockImplementationOnce(async (_action, _revision, _dockingRevision, _choices, requestId) =>
        maintenanceCommit(session, requestId as string, 'unrest', 2, 4, nextState));
    render(<Voyage33MovementWorkspace />);

    const maintenance = screen.getByRole('region', { name: 'Voyage 33-0 maintenance' });
    fireEvent.click(within(maintenance).getByRole('button', { name: /roll unrest/i }));
    fireEvent.click(await within(maintenance).findByRole('button', { name: /retry exact roll unrest request/i }));

    expect(runVoyage33Maintenance).toHaveBeenCalledTimes(2);
    expect(runVoyage33Maintenance.mock.calls[1]).toEqual(runVoyage33Maintenance.mock.calls[0]);
    expect(await within(maintenance).findByText(/Rolled 5 \+ 5 \+ 9 = 19\. Added 1 unrest; unrest 1\./)).toBeInTheDocument();
  });

  it('reports a denied ration choice and allows a corrected submission', async () => {
    const base = emptyVoyage33MaintenanceState('aegis');
    const session = sessionFixture('voyage-workspace-maintenance-denied', {
      voyage33Movement: movementState('0000', 2),
      voyage33Maintenance: {
        ...base,
        dockingRevision: 4,
        cycle: { ...base.cycle, step: 1, revision: 1, turn: 1 },
      },
    });
    installGm(session);
    runVoyage33Maintenance.mockRejectedValueOnce(Object.assign(new Error('host cannot fund'), {
      code: 'functions/failed-precondition',
      details: { kind: 'conflict' },
    }));
    render(<Voyage33MovementWorkspace />);

    const maintenance = screen.getByRole('region', { name: 'Voyage 33-0 maintenance' });
    fireEvent.click(within(maintenance).getByRole('button', { name: /apply host-funded rations/i }));
    expect(await within(maintenance).findByText(/DENIED \/\/ Another command won this update/i)).toBeInTheDocument();
    expect(within(maintenance).queryByRole('button', { name: /retry exact/i })).not.toBeInTheDocument();
    expect(within(maintenance).getByRole('button', { name: /apply host-funded rations/i })).toBeEnabled();
  });

  it('does not offer any console choice after the server records charging skipped', () => {
    const base = emptyVoyage33MaintenanceState('aegis');
    const session = sessionFixture('voyage-workspace-charging-skipped', {
      voyage33Movement: movementState('0000', 2),
      voyage33Maintenance: {
        ...base,
        dockingRevision: 4,
        cycle: { ...base.cycle, step: 4, revision: 4, turn: 1, chargingSkipped: true },
      },
    });
    installGm(session);
    render(<Voyage33MovementWorkspace />);

    const maintenance = screen.getByRole('region', { name: 'Voyage 33-0 maintenance' });
    expect(within(maintenance).queryByRole('radio')).not.toBeInTheDocument();
    expect(within(maintenance).getByRole('button', { name: /confirm skipped console charging/i })).toBeEnabled();
  });

  it('offers a legal current host route without a Jump Drive charge and still requires a live snapshot', () => {
    const uncharged = sessionFixture('voyage-workspace-uncharged', {
      turnPhase: phase('coordination'),
      voyage33Movement: movementState('0000', 2),
      voyage33Maintenance: maintenanceState('aegis', 3),
    });
    installGm(uncharged);
    const { unmount } = render(<Voyage33MovementWorkspace />);
    expect(screen.queryByText(/charge the voyage.*jump drive|jump drive charge.*current/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Jump to Known nearby site/i })).toBeEnabled();

    const stale = sessionFixture('voyage-workspace-stale');
    unmount();
    installGm(stale, 'cache');
    render(<Voyage33MovementWorkspace />);
    expect(screen.getByRole('status')).toHaveTextContent(/waiting for a current live server snapshot/i);
    expect(screen.queryByRole('button', { name: /dock with|jump to/i })).not.toBeInTheDocument();
    expect(movementService.jumpVoyage33Movement).not.toHaveBeenCalled();
  });
});

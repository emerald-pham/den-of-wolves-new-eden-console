import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SHUTTLECRAFT } from '@/data/shuttles';
import type { MacawRepairResult } from '@/lib/macawRepairService';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, ShuttleControlEntry, ShuttleDocking } from '@/types/game';

const mocks = vi.hoisted(() => ({ repair: vi.fn() }));
vi.mock('@/lib/macawRepairService', () => ({ repairConsolesFromMacaw: mocks.repair }));
vi.mock('./ShuttleControl', () => ({ default: () => <div aria-label="Shuttle control" /> }));

import ShuttleConsoleTemplate from './ShuttleConsoleTemplate';

const macaw = SHUTTLECRAFT.find((craft) => craft.id === 'macaw')!;
const control = {
  shuttleId: 'macaw', ownerRoleId: 'capybara-captain', ownerUid: 'owner', holderUid: 'holder', revision: 2,
} as ShuttleControlEntry;
const docking = { shuttleId: 'macaw', shipId: 'capybara', dockedAt: 'now' } as ShuttleDocking;

function installSession(overrides: Partial<GameSession> = {}): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner', createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'capybara-captain', activeConsoleRoleId: 'capybara-captain', joinedAt: '',
    fleetGroupId: 'fleet-1',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, currentTurn: 3,
    activeRoleIds: ['capybara-captain'], activeVesselIds: ['capybara', 'aegis'],
    shuttleControl: { macaw: control }, shuttleDockings: [docking],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-22T11:45:00.000Z', openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shipDamage: {
      capybara: { damagedSystemIds: ['reactor', 'storage'], destroyed: false },
      aegis: { damagedSystemIds: ['reactor'], destroyed: false },
    },
    shipResources: {
      capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 },
      aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
    },
    shuttleFuelled: { macaw: true },
    ...overrides,
  } as GameSession);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

function macawTree(
  currentControl = control,
  currentDocking: ShuttleDocking | undefined = docking,
  fuelled = true,
) {
  return <MemoryRouter><ShuttleConsoleTemplate shuttle={macaw}
    captainName="Capybara Captain" canLeave={false} control={currentControl}
    docking={currentDocking} fuelled={fuelled} /></MemoryRouter>;
}

function renderMacaw(
  currentControl = control,
  currentDocking: ShuttleDocking | undefined = docking,
  fuelled = true,
) {
  return render(macawTree(currentControl, currentDocking, fuelled));
}

function updateSession(patch: Partial<GameSession>): void {
  const current = useSessionStore.getState().session!;
  act(() => useSessionStore.getState().setSession({ ...current, ...patch } as GameSession));
}

function staleReply(overrides: Record<string, unknown> = {}) {
  return {
    status: 'stale', sessionId: 's1', requestId: 'macaw-repair-request-1', shuttleId: 'macaw',
    expectedHostShipId: 'capybara', systemIds: ['reactor', 'storage'],
    expectedControlRevision: 2, currentControlRevision: 3,
    expectedRepairRevision: 0, currentRepairRevision: 1,
    expectedCycle: 3, currentCycle: 3,
    ...overrides,
  };
}

function catchUpSnapshot(): Partial<GameSession> {
  return {
    shuttleControl: { macaw: { ...control, revision: 3 } },
    macawRepairs: { cycle: 3, revision: 1, hosts: [{ shipId: 'aegis', systemIds: ['reactor'] }] },
  };
}

beforeEach(() => {
  mocks.repair.mockReset();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'macaw-repair-stable-id') });
  installSession();
});

afterEach(() => vi.unstubAllGlobals());

it('retains the two-host limit when prior hosts are redacted after a split', () => {
  installSession({ macawRepairs: { cycle: 3, revision: 2, hosts: [], totalHostsUsed: 2 } } as Partial<GameSession>);
  renderMacaw();
  expect(screen.getByText('Macaw may repair at most two ships this cycle.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Repair selected consoles' })).toBeDisabled();
});

it('renders a Scrap repair control and submits up to two selected consoles', async () => {
  const result: MacawRepairResult = {
    status: 'committed', hostShipId: 'capybara', systemIds: ['reactor', 'storage'],
    scrapRemaining: 1, cycle: 3, repairRevision: 1,
  };
  mocks.repair.mockResolvedValue(result);
  renderMacaw();
  const repair = screen.getByRole('region', { name: 'Macaw console repair' });
  expect(within(repair).getByText(/spend 1 Scrap.*up to 2 consoles.*fuelled Macaw.*second ship/i)).toBeInTheDocument();
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Storage' }));
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledWith({
    requestId: 'macaw-repair-stable-id', systemIds: ['reactor', 'storage'],
    expectedControlRevision: 2, expectedRepairRevision: 0, expectedCycle: 3, expectedHostShipId: 'capybara',
  }));
  expect(await within(repair).findByRole('status')).toHaveTextContent('Repaired 2 consoles // 1 Scrap remain.');
});

it('keeps foreign role holders from submitting Macaw repairs', () => {
  installSession();
  useSessionStore.getState().setIdentity(useSessionStore.getState().session!, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'capybara-recycler', activeConsoleRoleId: 'capybara-recycler', joinedAt: '',
  });
  renderMacaw();
  const repair = screen.getByRole('region', { name: 'Macaw console repair' });
  expect(within(repair).getByText(/current Capybara Captain holding Macaw controls/i)).toBeInTheDocument();
  expect(within(repair).getByRole('button', { name: 'Repair selected consoles' })).toBeDisabled();
});

it('fails closed when the current repair ledger is malformed', () => {
  installSession({ macawRepairs: { cycle: 3, revision: 1, hosts: 'unknown' } as unknown as NonNullable<GameSession['macawRepairs']> });
  renderMacaw();
  const repair = screen.getByRole('region', { name: 'Macaw console repair' });
  expect(within(repair).getByText(/repair history is unavailable/i)).toBeInTheDocument();
  expect(within(repair).getByRole('button', { name: 'Repair selected consoles' })).toBeDisabled();
});

it('fails closed when the repair ledger is from a future cycle', () => {
  installSession({ macawRepairs: {
    cycle: 4, revision: 1, hosts: [{ shipId: 'capybara', systemIds: ['reactor'] }],
  } });
  renderMacaw();
  const repair = screen.getByRole('region', { name: 'Macaw console repair' });
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  expect(within(repair).getByText(/repair history is unavailable/i)).toBeInTheDocument();
  expect(within(repair).getByRole('button', { name: 'Repair selected consoles' })).toBeDisabled();
});

it('fails closed when the current damage or Scrap projection is malformed', () => {
  installSession({
    shipDamage: { capybara: { damagedSystemIds: 'reactor', destroyed: false } } as unknown as NonNullable<GameSession['shipDamage']>,
    shipResources: { capybara: { scrap: '3' } } as unknown as NonNullable<GameSession['shipResources']>,
  });
  renderMacaw();
  const repair = screen.getByRole('region', { name: 'Macaw console repair' });
  expect(within(repair).getByRole('button', { name: 'Repair selected consoles' })).toBeDisabled();
});

it('uses Capybara Scrap for an eligible fuelled second host', async () => {
  mocks.repair.mockResolvedValue({
    status: 'committed', hostShipId: 'aegis', systemIds: ['reactor'],
    scrapRemaining: 2, cycle: 3, repairRevision: 2,
  } satisfies MacawRepairResult);
  installSession({
    shuttleDockings: [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'later' }],
    macawRepairs: {
      cycle: 3, revision: 1, hosts: [{ shipId: 'capybara', systemIds: ['reactor'] }],
    },
  });
  renderMacaw(control, { shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'later' });
  const repair = screen.getByRole('region', { name: 'Macaw console repair' });
  expect(within(repair).getByText(/Capybara Scrap \/\/ 3/)).toBeInTheDocument();
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  expect(within(repair).getByRole('button', { name: 'Repair selected consoles' })).toBeEnabled();
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledWith(expect.objectContaining({
    expectedRepairRevision: 1, expectedHostShipId: 'aegis', systemIds: ['reactor'],
  })));
});

it('uses Capybara Scrap for a first repair on an Aegis host without host Scrap', async () => {
  mocks.repair.mockResolvedValue({
    status: 'committed', hostShipId: 'aegis', systemIds: ['reactor'],
    scrapRemaining: 2, cycle: 3, repairRevision: 1,
  } satisfies MacawRepairResult);
  installSession();
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    shuttleDockings: [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'now' }],
  });
  renderMacaw(control, { shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'now' });
  const repair = screen.getByRole('region', { name: 'Macaw console repair' });
  expect(within(repair).getByText(/Capybara Scrap \/\/ 3/)).toBeInTheDocument();
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  expect(within(repair).getByRole('button', { name: 'Repair selected consoles' })).toBeEnabled();
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledWith(expect.objectContaining({
    expectedRepairRevision: 0, expectedHostShipId: 'aegis', systemIds: ['reactor'],
  })));
});

it.each(['reply arrives before snapshot', 'snapshot arrives before reply'])(
  'keeps selected consoles and sends a fresh CAS retry when the %s', async (arrivalOrder) => {
    let finishStale!: (value: unknown) => void;
    mocks.repair.mockReturnValueOnce(new Promise((resolve) => { finishStale = resolve; }));
    mocks.repair.mockResolvedValueOnce({
      status: 'committed', hostShipId: 'capybara', systemIds: ['reactor', 'storage'],
      scrapRemaining: 1, cycle: 3, repairRevision: 2,
    });
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValueOnce('macaw-repair-request-1')
      .mockReturnValueOnce('macaw-repair-request-2') });
    const view = renderMacaw();
    const repair = screen.getByRole('region', { name: 'Macaw console repair' });
    fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
    fireEvent.click(within(repair).getByRole('checkbox', { name: 'Storage' }));
    fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
    await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(1));

    if (arrivalOrder === 'snapshot arrives before reply') {
      updateSession(catchUpSnapshot());
      view.rerender(macawTree({ ...control, revision: 3 }));
    }
    await act(async () => { finishStale(staleReply()); });
    expect(await within(repair).findByRole('status')).toHaveTextContent(/state changed/i);
    expect(within(repair).getByRole('checkbox', { name: 'Reactor' })).toBeChecked();
    expect(within(repair).getByRole('checkbox', { name: 'Storage' })).toBeChecked();

    if (arrivalOrder === 'reply arrives before snapshot') {
      expect(within(repair).getByRole('button', { name: /using current state/i })).toBeDisabled();
      updateSession(catchUpSnapshot());
      view.rerender(macawTree({ ...control, revision: 3 }));
    }
    const retry = await within(repair).findByRole('button', { name: /using current state/i });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(2));
    expect(mocks.repair).toHaveBeenLastCalledWith({
      requestId: 'macaw-repair-request-2', systemIds: ['reactor', 'storage'],
      expectedControlRevision: 3, expectedRepairRevision: 1, expectedCycle: 3, expectedHostShipId: 'capybara',
    });
  },
);

it('allows explicit stale retry on the first host when Macaw is unfuelled', async () => {
  vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValueOnce('macaw-repair-request-1')
    .mockReturnValueOnce('macaw-repair-request-2') });
  mocks.repair.mockResolvedValueOnce(staleReply({
    systemIds: ['reactor'], currentControlRevision: 3, currentRepairRevision: 0,
  }));
  mocks.repair.mockResolvedValueOnce({
    status: 'committed', hostShipId: 'capybara', systemIds: ['reactor'],
    scrapRemaining: 2, cycle: 3, repairRevision: 1,
  } satisfies MacawRepairResult);
  installSession({ shuttleFuelled: { macaw: false } });
  const view = renderMacaw(control, docking, false);
  const repair = screen.getByRole('region', { name: 'Macaw console repair' });
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  await within(repair).findByRole('status');

  updateSession({
    shuttleControl: { macaw: { ...control, revision: 3 } },
  });
  view.rerender(macawTree({ ...control, revision: 3 }, docking, false));
  const retry = await within(repair).findByRole('button', { name: /using current state/i });
  expect(retry).toBeEnabled();
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(2));
  expect(mocks.repair).toHaveBeenLastCalledWith({
    requestId: 'macaw-repair-request-2', systemIds: ['reactor'],
    expectedControlRevision: 3, expectedRepairRevision: 0, expectedCycle: 3, expectedHostShipId: 'capybara',
  });
});

it('checkbox edits discard an obsolete uncertain request and use a fresh request for the edited selection', async () => {
  vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValueOnce('macaw-uncertain-id')
    .mockReturnValueOnce('macaw-edited-id') });
  mocks.repair.mockRejectedValueOnce(new Error('temporary network failure'));
  mocks.repair.mockResolvedValueOnce({
    status: 'committed', hostShipId: 'capybara', systemIds: ['reactor'],
    scrapRemaining: 2, cycle: 3, repairRevision: 1,
  });
  renderMacaw();
  const repair = screen.getByRole('region', { name: 'Macaw console repair' });
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Storage' }));
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  await within(repair).findByRole('alert');
  expect(within(repair).getByRole('button', { name: 'Retry exact repair request' })).toBeEnabled();
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Storage' }));
  expect(within(repair).getByRole('button', { name: 'Repair selected consoles' })).toBeEnabled();
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(2));
  expect(mocks.repair).toHaveBeenLastCalledWith({
    requestId: 'macaw-edited-id', systemIds: ['reactor'],
    expectedControlRevision: 2, expectedRepairRevision: 0, expectedCycle: 3, expectedHostShipId: 'capybara',
  });
});

it.each(['role', 'holder', 'group', 'host', 'dock', 'phase'])(
  'drops stale recovery if %s authority changes while the callable is pending', async (change) => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'macaw-repair-request-1') });
    let finishStale!: (value: unknown) => void;
    mocks.repair.mockReturnValueOnce(new Promise((resolve) => { finishStale = resolve; }));
    const view = renderMacaw();
    const repair = screen.getByRole('region', { name: 'Macaw console repair' });
    fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
    fireEvent.click(within(repair).getByRole('checkbox', { name: 'Storage' }));
    fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
    await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(1));

    const current = useSessionStore.getState();
    if (change === 'role' || change === 'group') {
      act(() => current.setIdentity(current.session!, {
        uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
        assignedRoleId: change === 'role' ? 'capybara-recycler' : 'capybara-captain',
        activeConsoleRoleId: change === 'role' ? 'capybara-recycler' : 'capybara-captain',
        fleetGroupId: change === 'group' ? 'fleet-2' : 'fleet-1', joinedAt: '',
      }));
    } else if (change === 'holder') {
      updateSession({ shuttleControl: { macaw: { ...control, holderUid: 'other', revision: 3 } } });
    } else if (change === 'host') {
      updateSession({ shuttleDockings: [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'later' }] });
    } else if (change === 'dock') {
      updateSession({ shuttleDockings: [] });
    } else {
      updateSession({ phase: 'debrief' });
    }
    view.rerender(macawTree());
    await act(async () => { finishStale(staleReply()); });
    expect(await within(repair).findByRole('alert')).toHaveTextContent(/authority|coordination changed/i);
    expect(within(repair).queryByRole('button', { name: /using current state/i })).not.toBeInTheDocument();
  },
);

it.each(['role', 'holder', 'group', 'host', 'dock', 'phase'])(
  'discards an uncertain exact retry if %s authority changes before the retry', async (change) => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'macaw-uncertain-authority-id') });
    mocks.repair.mockRejectedValueOnce(new Error('temporary network failure'));
    renderMacaw();
    const repair = screen.getByRole('region', { name: 'Macaw console repair' });
    fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
    fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
    await within(repair).findByRole('alert');
    expect(within(repair).getByRole('button', { name: 'Retry exact repair request' })).toBeEnabled();

    const current = useSessionStore.getState();
    if (change === 'role' || change === 'group') {
      act(() => current.setIdentity(current.session!, {
        uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
        assignedRoleId: change === 'role' ? 'capybara-recycler' : 'capybara-captain',
        activeConsoleRoleId: change === 'role' ? 'capybara-recycler' : 'capybara-captain',
        fleetGroupId: change === 'group' ? 'fleet-2' : 'fleet-1', joinedAt: '',
      }));
    } else if (change === 'holder') {
      updateSession({ shuttleControl: { macaw: { ...control, holderUid: 'other', revision: 3 } } });
    } else if (change === 'host') {
      updateSession({ shuttleDockings: [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'later' }] });
    } else if (change === 'dock') {
      updateSession({ shuttleDockings: [] });
    } else {
      updateSession({ phase: 'debrief' });
    }
    await waitFor(() => expect(within(repair).queryByRole('button', { name: 'Retry exact repair request' })).not.toBeInTheDocument());
    const button = within(repair).getByRole('button', { name: 'Repair selected consoles' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mocks.repair).toHaveBeenCalledTimes(1);
  },
);

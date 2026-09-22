import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SHUTTLECRAFT } from '@/data/shuttles';
import type { PhiliaRepairResult } from '@/lib/philiaRepairService';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, ShuttleControlEntry, ShuttleDocking } from '@/types/game';

const mocks = vi.hoisted(() => ({ repair: vi.fn() }));
vi.mock('@/lib/philiaRepairService', () => ({ repairConsolesFromPhilia: mocks.repair }));
vi.mock('./ShuttleControl', () => ({ default: () => <div aria-label="Shuttle control" /> }));

import ShuttleConsoleTemplate from './ShuttleConsoleTemplate';

const philia = SHUTTLECRAFT.find((craft) => craft.id === 'philia')!;
const control = {
  shuttleId: 'philia', ownerRoleId: 'dione-engineer', ownerUid: 'owner',
  holderUid: 'holder', revision: 2,
} as ShuttleControlEntry;
const dioneDocking = { shuttleId: 'philia', shipId: 'dione', dockedAt: 'now' } as ShuttleDocking;
const dioneDamage = { damagedSystemIds: ['reactor', 'storage'], destroyed: false };
const shipResources = {
  dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 12, securityTeams: 2 },
  aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 8, securityTeams: 9 },
  shepherd: { ore: 0, fuel: 4, food: 10, water: 8, materials: 8, securityTeams: 2 },
};

function installSession(overrides: Partial<GameSession> = {}): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'dione-engineer', activeConsoleRoleId: 'dione-engineer', joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    currentTurn: 3,
    activeRoleIds: ['dione-engineer'],
    activeVesselIds: ['dione', 'aegis', 'shepherd'],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-22T11:45:00.000Z',
      openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shipDamage: {
      dione: dioneDamage,
      aegis: { damagedSystemIds: ['reactor'], destroyed: false },
      shepherd: { damagedSystemIds: ['reactor'], destroyed: false },
    },
    shipResources,
    shuttleFuelled: { philia: false },
    ...overrides,
  } as GameSession);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

function renderPhilia(
  docking: ShuttleDocking | undefined = dioneDocking,
  fuelled = false,
  currentControl: ShuttleControlEntry = control,
) {
  return render(<MemoryRouter><ShuttleConsoleTemplate shuttle={philia}
    captainName="Dione Engineer" canLeave={false} control={currentControl}
    docking={docking} fuelled={fuelled} /></MemoryRouter>);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mocks.repair.mockReset();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'philia-repair-stable-id') });
  installSession();
});

afterEach(() => vi.unstubAllGlobals());

it('places a playable repair control in Philia operations and sends the selected console', async () => {
  mocks.repair.mockResolvedValue({
    status: 'committed', hostShipId: 'dione', systemIds: ['reactor', 'storage'],
    materialsRemaining: 4, cycle: 3, repairRevision: 1,
  });
  renderPhilia();

  const repair = screen.getByRole('region', { name: 'Philia console repair' });
  expect(within(repair).getByText(/4 materials.*up to 2 consoles.*fuelled Philia.*second ship/i)).toBeInTheDocument();
  await within(repair).findByRole('checkbox', { name: 'Reactor' });
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Storage' }));
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));

  await waitFor(() => expect(mocks.repair).toHaveBeenCalledWith({
    requestId: 'philia-repair-stable-id', systemIds: ['reactor', 'storage'],
    expectedControlRevision: 2, expectedRepairRevision: 0,
    expectedCycle: 3, expectedHostShipId: 'dione',
  }));
  expect(await within(repair).findByRole('status'))
    .toHaveTextContent('Repaired 2 consoles // 4 materials remain.');
});

it('requires fuel before choosing a second ship and enables the control after refuelling', () => {
  installSession({
    philiaRepairs: {
      cycle: 3, revision: 1, hosts: [{ shipId: 'dione', systemIds: ['reactor'] }],
    },
  });
  const aegisDocking = { shuttleId: 'philia', shipId: 'aegis', dockedAt: 'now' } as ShuttleDocking;
  const { rerender } = renderPhilia(aegisDocking, false);
  let repair = screen.getByRole('region', { name: 'Philia console repair' });
  expect(within(repair).getByText(/fuel Philia before repairing a second ship/i)).toBeInTheDocument();
  expect(within(repair).getByRole('checkbox', { name: 'Reactor' })).toBeDisabled();

  rerender(<MemoryRouter><ShuttleConsoleTemplate shuttle={philia}
    captainName="Dione Engineer" canLeave={false} control={control}
    docking={aegisDocking} fuelled={true} /></MemoryRouter>);
  repair = screen.getByRole('region', { name: 'Philia console repair' });
  expect(within(repair).getByRole('checkbox', { name: 'Reactor' })).toBeEnabled();

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    philiaRepairs: {
      cycle: 3, revision: 2,
      hosts: [
        { shipId: 'dione', systemIds: ['reactor'] },
        { shipId: 'aegis', systemIds: ['reactor'] },
      ],
    },
  }));
  const shepherdDocking = { shuttleId: 'philia', shipId: 'shepherd', dockedAt: 'now' } as ShuttleDocking;
  rerender(<MemoryRouter><ShuttleConsoleTemplate shuttle={philia}
    captainName="Dione Engineer" canLeave={false} control={control}
    docking={shepherdDocking} fuelled={true} /></MemoryRouter>);
  repair = screen.getByRole('region', { name: 'Philia console repair' });
  expect(within(repair).getByText(/at most two ships this cycle/i)).toBeInTheDocument();
  expect(within(repair).getByRole('checkbox', { name: 'Reactor' })).toBeDisabled();
});

it('keeps a failed request id for exact replay and exposes pending and error states', async () => {
  let rejectFirst!: (cause: Error) => void;
  mocks.repair.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectFirst = reject; }))
    .mockResolvedValueOnce({
      status: 'replayed', hostShipId: 'dione', systemIds: ['reactor'],
      materialsRemaining: 8, cycle: 3, repairRevision: 1,
    });
  renderPhilia();
  const repair = screen.getByRole('region', { name: 'Philia console repair' });
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  const repairButton = within(repair).getByRole('button', { name: 'Repair selected consoles' });
  fireEvent.click(repairButton);
  expect(within(repair).getByRole('button', { name: 'Repairing consoles…' })).toBeDisabled();
  const firstCommand = mocks.repair.mock.calls[0]![0];

  await act(async () => rejectFirst(new Error('Connection lost before confirmation.')));
  expect(await within(repair).findByRole('alert')).toHaveTextContent('Connection lost before confirmation.');
  const retry = within(repair).getByRole('button', { name: 'Retry exact repair request' });
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(2));
  expect(mocks.repair.mock.calls[1]![0]).toEqual(firstCommand);
  expect(await within(repair).findByRole('status'))
    .toHaveTextContent('This repair was already recorded // 8 materials remain.');
});

it.each(['success', 'error'] as const)(
  'ignores an old-session %s callback after the member changes identity',
  async (oldOutcome) => {
    const first = deferred<PhiliaRepairResult>();
    const second = deferred<PhiliaRepairResult>();
    mocks.repair.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = renderPhilia();
    const repair = screen.getByRole('region', { name: 'Philia console repair' });
    fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
    fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
    expect(within(repair).getByRole('button', { name: 'Repairing consoles…' })).toBeDisabled();

    const current = useSessionStore.getState();
    const nextSession = { ...current.session!, id: 's2' };
    const nextMember = { ...current.me!, uid: 'holder-b', sessionId: 's2', displayName: 'Holder B' };
    act(() => useSessionStore.getState().setIdentity(nextSession, nextMember));
    const nextControl = { ...control, holderUid: 'holder-b', revision: 3 };
    view.rerender(<MemoryRouter><ShuttleConsoleTemplate shuttle={philia}
      captainName="Dione Engineer" canLeave={false} control={nextControl}
      docking={dioneDocking} fuelled={false} /></MemoryRouter>);
    expect(within(repair).queryByRole('button', { name: 'Repairing consoles…' })).not.toBeInTheDocument();
    expect(within(repair).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(repair).queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
    fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
    expect(mocks.repair).toHaveBeenCalledTimes(2);
    expect(within(repair).getByRole('button', { name: 'Repairing consoles…' })).toBeDisabled();

    await act(async () => {
      if (oldOutcome === 'success') {
        first.resolve({
          status: 'committed', hostShipId: 'dione', systemIds: ['reactor'],
          materialsRemaining: 8, cycle: 3, repairRevision: 1,
        });
      } else {
        first.reject(new Error('Old session failed.'));
      }
    });
    expect(within(repair).getByRole('button', { name: 'Repairing consoles…' })).toBeDisabled();
    expect(within(repair).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(repair).queryByRole('status')).not.toBeInTheDocument();

    await act(async () => second.resolve({
      status: 'committed', hostShipId: 'dione', systemIds: ['reactor'],
      materialsRemaining: 8, cycle: 3, repairRevision: 1,
    }));
    expect(await within(repair).findByRole('status'))
      .toHaveTextContent('Repaired 1 console // 8 materials remain.');
  },
);

it('does not add the repair control to another shuttle workspace', () => {
  const blacksmith = SHUTTLECRAFT.find((craft) => craft.id === 'blacksmith')!;
  render(<MemoryRouter><ShuttleConsoleTemplate shuttle={blacksmith}
    captainName="Icebreaker Engineer" canLeave={false} /></MemoryRouter>);
  expect(screen.queryByRole('region', { name: 'Philia console repair' })).not.toBeInTheDocument();
});

it('fails closed when the displayed repair history is malformed', () => {
  installSession({ philiaRepairs: {
    cycle: 3, revision: 1, hosts: 'invalid',
  } as unknown as NonNullable<GameSession['philiaRepairs']> });
  renderPhilia();
  const repair = screen.getByRole('region', { name: 'Philia console repair' });
  expect(within(repair).getByText(/repair history is unavailable/i)).toBeInTheDocument();
  expect(within(repair).getByRole('checkbox', { name: 'Reactor' })).toBeDisabled();
});

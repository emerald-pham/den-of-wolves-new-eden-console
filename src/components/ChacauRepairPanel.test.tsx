import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ChacauRepairResult, ChacauRepairServiceResult } from '@/lib/chacauRepairService';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, ShuttleControlEntry, ShuttleDocking } from '@/types/game';

const mocks = vi.hoisted(() => ({ repair: vi.fn() }));
vi.mock('@/lib/chacauRepairService', async importOriginal => ({
  ...(await importOriginal()),
  repairConsolesFromChacau: mocks.repair,
}));

import ChacauRepairPanel from './ChacauRepairPanel';

const control = {
  shuttleId: 'chacau', ownerRoleId: 'refinery-124-engineer', ownerUid: 'owner',
  holderUid: 'holder', revision: 2,
} as ShuttleControlEntry;
const refineryDocking = { shuttleId: 'chacau', shipId: 'refinery-124', dockedAt: 'now' } as ShuttleDocking;
const refineryDamage = { damagedSystemIds: ['reactor', 'storage'], destroyed: false };
const shipResources = {
  'refinery-124': { ore: 6, fuel: 2, food: 10, water: 8, materials: 12, securityTeams: 2 },
  dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 8, securityTeams: 2 },
  aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 8, securityTeams: 9 },
};

let generatedRequestId = 'chacau-repair-stable-id';

function installSession(overrides: Readonly<Record<string, unknown>> = {}): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'refinery-124-engineer', activeConsoleRoleId: 'refinery-124-engineer',
    fleetGroupId: 'fleet-1', connected: true, joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    currentTurn: 3,
    activeRoleIds: ['refinery-124-engineer'],
    activeVesselIds: ['refinery-124', 'dione', 'aegis'],
    shuttleControl: { chacau: control },
    shuttleDockings: [refineryDocking],
    playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['refinery-124', 'dione', 'aegis'],
      knownCoordinates: ['0000'], knownSystems: { 'system-01': '0000' },
      pursuitDistance: 0, navigationLogs: [], revision: 1,
    },
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-22T11:45:00.000Z',
      openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shipDamage: {
      'refinery-124': refineryDamage,
      dione: { damagedSystemIds: ['reactor', 'storage'], destroyed: false },
      aegis: { damagedSystemIds: ['reactor'], destroyed: false },
    },
    shipResources,
    shuttleFuelled: { chacau: false },
    ...overrides,
  } as unknown as GameSession);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

function renderRepair(
  docking: ShuttleDocking | undefined = refineryDocking,
  fuelled = false,
  currentControl: ShuttleControlEntry = control,
) {
  return render(<ChacauRepairPanel control={currentControl} docking={docking} fuelled={fuelled} />);
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
  generatedRequestId = 'chacau-repair-stable-id';
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => generatedRequestId) });
  installSession();
});

afterEach(() => vi.unstubAllGlobals());

it('uses the Refinery 124 Chacau control to submit the selected damaged consoles', async () => {
  mocks.repair.mockResolvedValue({
    status: 'committed', hostShipId: 'refinery-124', systemIds: ['reactor', 'storage'],
    materialsRemaining: 4, cycle: 3, repairRevision: 1,
  });
  renderRepair();
  const repair = screen.getByRole('region', { name: 'Chacau console repair' });
  expect(within(repair).getByText(/4 materials per console.*up to 2 consoles.*fuelled Chacau.*second ship/i)).toBeInTheDocument();
  await within(repair).findByRole('checkbox', { name: 'Reactor' });
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Storage' }));
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));

  await waitFor(() => expect(mocks.repair).toHaveBeenCalledWith({
    requestId: 'chacau-repair-stable-id', systemIds: ['reactor', 'storage'],
    expectedControlRevision: 2, expectedRepairRevision: 0,
    expectedCycle: 3, expectedHostShipId: 'refinery-124',
  }));
  expect(await within(repair).findByRole('status'))
    .toHaveTextContent('Repaired 2 consoles // 4 materials remain.');
});

it('requires fuel for one second ship and blocks a third ship in the same cycle', () => {
  installSession({
    chacauRepairs: {
      cycle: 3, revision: 1, hosts: [{ shipId: 'refinery-124', systemIds: ['reactor'] }],
    },
  });
  const dioneDocking = { shuttleId: 'chacau', shipId: 'dione', dockedAt: 'now' } as ShuttleDocking;
  const { rerender } = renderRepair(dioneDocking, false);
  let repair = screen.getByRole('region', { name: 'Chacau console repair' });
  expect(within(repair).getByText(/fuel Chacau before repairing a second ship/i)).toBeInTheDocument();
  expect(within(repair).getByRole('checkbox', { name: 'Reactor' })).toBeDisabled();

  rerender(<ChacauRepairPanel control={control} docking={dioneDocking} fuelled />);
  repair = screen.getByRole('region', { name: 'Chacau console repair' });
  expect(within(repair).getByRole('checkbox', { name: 'Reactor' })).toBeEnabled();

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    chacauRepairs: {
      cycle: 3, revision: 2,
      hosts: [
        { shipId: 'refinery-124', systemIds: ['reactor'] },
        { shipId: 'dione', systemIds: ['reactor'] },
      ],
    },
  } as unknown as GameSession));
  const aegisDocking = { shuttleId: 'chacau', shipId: 'aegis', dockedAt: 'now' } as ShuttleDocking;
  rerender(<ChacauRepairPanel control={control} docking={aegisDocking} fuelled />);
  repair = screen.getByRole('region', { name: 'Chacau console repair' });
  expect(within(repair).getByText(/at most two ships this cycle/i)).toBeInTheDocument();
  expect(within(repair).getByRole('checkbox', { name: 'Reactor' })).toBeDisabled();
});

it.each(['success', 'error'] as const)(
  'ignores an old-session %s callback after the member changes identity',
  async (oldOutcome) => {
    const first = deferred<ChacauRepairResult>();
    const second = deferred<ChacauRepairResult>();
    mocks.repair.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = renderRepair();
    const repair = screen.getByRole('region', { name: 'Chacau console repair' });
    fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
    fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));

    const current = useSessionStore.getState();
    const nextControl = { ...control, holderUid: 'holder-b', revision: 3 };
    act(() => useSessionStore.getState().setIdentity(
      {
        ...current.session!, id: 's2',
        shuttleControl: { ...current.session!.shuttleControl, chacau: nextControl },
      },
      { ...current.me!, uid: 'holder-b', sessionId: 's2', displayName: 'Holder B' },
    ));
    view.rerender(<ChacauRepairPanel control={nextControl} docking={refineryDocking} fuelled={false} />);
    expect(within(repair).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(repair).queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
    fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
    expect(mocks.repair).toHaveBeenCalledTimes(2);

    await act(async () => {
      if (oldOutcome === 'success') {
        first.resolve({
          status: 'committed', hostShipId: 'refinery-124', systemIds: ['reactor'],
          materialsRemaining: 8, cycle: 3, repairRevision: 1,
        });
      } else {
        first.reject(new Error('Old session failed.'));
      }
    });
    expect(within(repair).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(repair).queryByRole('status')).not.toBeInTheDocument();

    await act(async () => second.resolve({
      status: 'committed', hostShipId: 'refinery-124', systemIds: ['reactor'],
      materialsRemaining: 8, cycle: 3, repairRevision: 1,
    }));
    expect(await within(repair).findByRole('status'))
      .toHaveTextContent('Repaired 1 console // 8 materials remain.');
  },
);

it('fails closed on malformed repair history and a copied Philia owner', () => {
  const wrongOwner = { ...control, ownerRoleId: 'dione-engineer' } as ShuttleControlEntry;
  installSession({
    chacauRepairs: { cycle: 3, revision: 1, hosts: 'invalid' },
    shuttleControl: { chacau: wrongOwner },
  });
  renderRepair(refineryDocking, false, wrongOwner);
  const repair = screen.getByRole('region', { name: 'Chacau console repair' });
  expect(within(repair).getByText(/repair history is unavailable/i)).toBeInTheDocument();
  expect(within(repair).getByRole('checkbox', { name: 'Reactor' })).toBeDisabled();
  expect(within(repair).getByText(/current Refinery 124 Engineer holding Chacau/)).toBeInTheDocument();
});

it('fails closed when persisted repair history names a non-deck console', () => {
  installSession({
    chacauRepairs: {
      cycle: 3, revision: 1,
      hosts: [{ shipId: 'aegis', systemIds: ['not-a-damage-card'] }],
    },
  });
  renderRepair();
  const repair = screen.getByRole('region', { name: 'Chacau console repair' });
  expect(within(repair).getByText(/repair history is unavailable/i)).toBeInTheDocument();
  expect(within(repair).getByRole('checkbox', { name: 'Reactor' })).toBeDisabled();
});


function staleReply(requestId: string): ChacauRepairServiceResult {
  return {
    status: 'stale', sessionId: 's1', requestId, shuttleId: 'chacau',
    expectedHostShipId: 'refinery-124', systemIds: ['reactor'],
    expectedControlRevision: 2, currentControlRevision: 3,
    expectedRepairRevision: 0, currentRepairRevision: 1,
    expectedCycle: 3, currentCycle: 4,
  };
}

function advanceRepairProjection(): ShuttleControlEntry {
  const nextControl = { ...control, revision: 3 };
  const current = useSessionStore.getState().session!;
  act(() => useSessionStore.getState().setSession({
    ...current, currentTurn: 4, shuttleControl: { ...current.shuttleControl, chacau: nextControl },
    chacauRepairs: {
      cycle: 4, revision: 1, hosts: [{ shipId: 'refinery-124', systemIds: ['jump-drive'] }],
    },
    turnPhase: { ...current.turnPhase!, turn: 4 },
  } as unknown as GameSession));
  return nextControl;
}

it('waits for a fresh live projection, keeps eligible selection, and retries with new CAS and request id', async () => {
  const stale = deferred<ChacauRepairServiceResult>();
  mocks.repair.mockReturnValueOnce(stale.promise).mockResolvedValueOnce({
    status: 'committed', hostShipId: 'refinery-124', systemIds: ['reactor'],
    materialsRemaining: 8, cycle: 4, repairRevision: 2,
  });
  const view = renderRepair();
  const repair = screen.getByRole('region', { name: 'Chacau console repair' });
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledWith({
    requestId: 'chacau-repair-stable-id', systemIds: ['reactor'],
    expectedControlRevision: 2, expectedRepairRevision: 0,
    expectedCycle: 3, expectedHostShipId: 'refinery-124',
  }));

  await act(async () => stale.resolve(staleReply('chacau-repair-stable-id')));
  expect(await within(repair).findByRole('status')).toHaveTextContent(/state changed/i);
  expect(within(repair).getByRole('checkbox', { name: 'Reactor' })).toBeChecked();
  expect(within(repair).getByRole('button', { name: 'Retry repair with current revision' })).toBeDisabled();
  expect(within(repair).getByText(/state is still updating/i)).toBeInTheDocument();

  const nextControl = advanceRepairProjection();
  view.rerender(<ChacauRepairPanel control={nextControl} docking={refineryDocking} fuelled={false} />);
  const freshRetry = within(repair).getByRole('button', { name: 'Retry repair with current revision' });
  await waitFor(() => expect(freshRetry).toBeEnabled());
  generatedRequestId = 'chacau-repair-fresh-id';
  fireEvent.click(freshRetry);
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(2));
  expect(mocks.repair).toHaveBeenLastCalledWith({
    requestId: 'chacau-repair-fresh-id', systemIds: ['reactor'],
    expectedControlRevision: 3, expectedRepairRevision: 1,
    expectedCycle: 4, expectedHostShipId: 'refinery-124',
  });
  expect(await within(repair).findByRole('status')).toHaveTextContent(/Repaired 1 console/);
});

it('allows a fresh retry when the live projection arrived before the stale response', async () => {
  const stale = deferred<ChacauRepairServiceResult>();
  mocks.repair.mockReturnValueOnce(stale.promise).mockResolvedValueOnce({
    status: 'committed', hostShipId: 'refinery-124', systemIds: ['reactor'],
    materialsRemaining: 8, cycle: 4, repairRevision: 2,
  });
  const view = renderRepair();
  const repair = screen.getByRole('region', { name: 'Chacau console repair' });
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  advanceRepairProjection();
  view.rerender(<ChacauRepairPanel control={{ ...control, revision: 3 }} docking={refineryDocking} fuelled={false} />);
  await act(async () => stale.resolve(staleReply('chacau-repair-stable-id')));
  const freshRetry = await within(repair).findByRole('button', { name: 'Retry repair with current revision' });
  await waitFor(() => expect(freshRetry).toBeEnabled());
  generatedRequestId = 'chacau-repair-fresh-after-snapshot';
  fireEvent.click(freshRetry);
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(2));
  expect(mocks.repair).toHaveBeenLastCalledWith({
    requestId: 'chacau-repair-fresh-after-snapshot', systemIds: ['reactor'],
    expectedControlRevision: 3, expectedRepairRevision: 1,
    expectedCycle: 4, expectedHostShipId: 'refinery-124',
  });
});

it('drops stale recovery when Chacau holder authority changes while the request is pending', async () => {
  const stale = deferred<ChacauRepairServiceResult>();
  mocks.repair.mockReturnValueOnce(stale.promise);
  const view = renderRepair();
  const repair = screen.getByRole('region', { name: 'Chacau console repair' });
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  const changedControl = { ...control, holderUid: 'new-holder' };
  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    shuttleControl: { ...useSessionStore.getState().session!.shuttleControl, chacau: changedControl },
  } as unknown as GameSession));
  view.rerender(<ChacauRepairPanel control={changedControl} docking={refineryDocking} fuelled={false} />);
  await act(async () => stale.resolve(staleReply('chacau-repair-stable-id')));
  expect(await within(repair).findByRole('alert')).toHaveTextContent(/authority or Coordination changed/i);
  expect(within(repair).queryByRole('button', { name: 'Retry repair with current revision' })).not.toBeInTheDocument();
  expect(mocks.repair).toHaveBeenCalledTimes(1);
});

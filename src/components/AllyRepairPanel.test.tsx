import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AllyRepairAuthorityBinding, AllyRepairResult } from '@/lib/allyRepairService';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, ShuttleControlEntry, ShuttleDocking } from '@/types/game';

const mocks = vi.hoisted(() => ({ repair: vi.fn() }));
interface AllyRepairServiceExports {
  hasCurrentAllyHolderAuthority(binding: AllyRepairAuthorityBinding, requireCoordination: boolean): boolean;
}
vi.mock('@/lib/allyRepairService', async (importOriginal) => ({
  ...await importOriginal<AllyRepairServiceExports>(),
  repairConsolesFromAlly: mocks.repair,
}));

import AllyRepairPanel from './AllyRepairPanel';

const control = {
  shuttleId: 'ally', ownerRoleId: 'joint-engineering-shepherd-icebreaker', ownerUid: 'owner',
  holderUid: 'holder', revision: 2,
} as ShuttleControlEntry;
const docking = { shuttleId: 'ally', shipId: 'shepherd', dockedAt: 'now' } as ShuttleDocking;

function installSession(overrides: Readonly<Record<string, unknown>> = {}): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'joint-engineering-shepherd-icebreaker',
    activeConsoleRoleId: 'joint-engineering-shepherd-icebreaker', fleetGroupId: 'fleet-1', joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, currentTurn: 3,
    activeRoleIds: ['joint-engineering-shepherd-icebreaker'],
    activeVesselIds: ['shepherd', 'icebreaker'],
    shuttleControl: { ally: control },
    shuttleDockings: [docking],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-22T11:45:00.000Z',
      openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shipDamage: {
      shepherd: { damagedSystemIds: ['reactor', 'storage', 'jump-drive'], destroyed: false },
      icebreaker: { damagedSystemIds: ['reactor', 'storage'], destroyed: false },
    },
    shipResources: {
      shepherd: { ore: 0, fuel: 4, food: 10, water: 8, materials: 12, securityTeams: 2 },
      icebreaker: { ore: 0, fuel: 4, food: 11, water: 9, materials: 8, securityTeams: 2 },
    },
    shuttleFuelled: { ally: false },
    ...overrides,
  } as unknown as GameSession);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  mocks.repair.mockReset();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'ally-repair-stable-id') });
  installSession();
});

afterEach(() => vi.unstubAllGlobals());

it('submits the Union Ally repair authority and reports the server result', async () => {
  mocks.repair.mockResolvedValue({
    status: 'committed', hostShipId: 'shepherd', systemIds: ['reactor', 'storage'],
    materialsRemaining: 4, cycle: 3, repairRevision: 1,
  } satisfies AllyRepairResult);
  render(<AllyRepairPanel control={control} docking={docking} fuelled={false} />);
  const repair = screen.getByRole('region', { name: 'Ally console repair' });
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Storage' }));
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledWith({
    requestId: 'ally-repair-stable-id', systemIds: ['reactor', 'storage'],
    expectedControlRevision: 2, expectedRepairRevision: 0,
    expectedCycle: 3, expectedHostShipId: 'shepherd',
  }));
  expect(await within(repair).findByRole('status'))
    .toHaveTextContent('Repaired 2 consoles // 4 materials remain.');
});

it('fails closed on malformed persisted Ally history and copied authority', () => {
  installSession({ allyRepairs: {
    cycle: 3, revision: 1, hosts: [{ shipId: 'aegis', systemIds: ['fighter-bay-alpha'] }],
  } });
  const wrongControl = { ...control, ownerRoleId: 'dione-engineer' } as ShuttleControlEntry;
  render(<AllyRepairPanel control={wrongControl} docking={docking} fuelled={false} />);
  const repair = screen.getByRole('region', { name: 'Ally console repair' });
  expect(within(repair).getByText(/repair history is unavailable/i)).toBeInTheDocument();
  expect(within(repair).getByRole('checkbox', { name: 'Reactor' })).toBeDisabled();
  expect(within(repair).getByText(/current Joint Engineering Union Engineer/i)).toBeInTheDocument();
});

function staleReply(
  requestId = 'ally-repair-stable-id',
  revisions: Readonly<{ currentControlRevision?: number; currentRepairRevision?: number }> = {},
) {
  return {
    status: 'stale', sessionId: 's1', requestId, shuttleId: 'ally',
    expectedHostShipId: 'shepherd', systemIds: ['reactor'],
    expectedControlRevision: 2, currentControlRevision: revisions.currentControlRevision ?? 2,
    expectedRepairRevision: 0, currentRepairRevision: revisions.currentRepairRevision ?? 1,
    expectedCycle: 3, currentCycle: 3,
  };
}

function advanceRepairProjection(): void {
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...session,
    allyRepairs: { cycle: 3, revision: 1, hosts: [{ shipId: 'shepherd', systemIds: ['storage'] }] },
    shipDamage: {
      ...session.shipDamage,
      shepherd: { damagedSystemIds: ['reactor', 'jump-drive'], destroyed: false },
    },
    shipResources: {
      ...session.shipResources,
      shepherd: { ...(session.shipResources?.shepherd ?? {}), materials: 8 },
    },
  } as GameSession);
}

it('preserves an eligible selection and creates a fresh current-revision retry after the snapshot catches up', async () => {
  let resolveStale!: (reply: ReturnType<typeof staleReply>) => void;
  mocks.repair.mockReturnValueOnce(new Promise((resolve) => { resolveStale = resolve; }));
  vi.stubGlobal('crypto', { randomUUID: vi.fn()
    .mockReturnValueOnce('ally-repair-stable-id').mockReturnValueOnce('ally-repair-fresh-id') });
  const { rerender } = render(<AllyRepairPanel control={control} docking={docking} fuelled={false} />);
  const repair = screen.getByRole('region', { name: 'Ally console repair' });
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(1));
  await act(async () => { resolveStale(staleReply()); });
  expect(await within(repair).findByRole('status')).toHaveTextContent(/state changed/i);
  expect(within(repair).getByRole('checkbox', { name: 'Reactor' })).toBeChecked();
  expect(within(repair).getByRole('button', { name: 'Retry repair with current revision' })).toBeDisabled();
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Jump Drive' }));
  expect(within(repair).getByRole('button', { name: 'Retry repair with current revision' })).toBeDisabled();

  act(() => advanceRepairProjection());
  rerender(<AllyRepairPanel control={control} docking={docking} fuelled={false} />);
  const retry = within(repair).getByRole('button', { name: 'Retry repair with current revision' });
  expect(retry).toBeEnabled();
  expect(within(repair).getByRole('checkbox', { name: 'Jump Drive' })).toBeChecked();
  mocks.repair.mockResolvedValueOnce({
    status: 'committed', hostShipId: 'shepherd', systemIds: ['jump-drive'],
    materialsRemaining: 4, cycle: 3, repairRevision: 2,
  });
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(2));
  expect(mocks.repair.mock.calls[1]?.[0]).toMatchObject({
    requestId: 'ally-repair-fresh-id', systemIds: ['jump-drive'],
    expectedControlRevision: 2, expectedRepairRevision: 1,
    expectedCycle: 3, expectedHostShipId: 'shepherd',
  });
});

it('accepts a stale reply that arrives after the matching projection and offers a fresh retry', async () => {
  let resolveStale!: (reply: ReturnType<typeof staleReply>) => void;
  mocks.repair.mockReturnValueOnce(new Promise((resolve) => { resolveStale = resolve; }));
  vi.stubGlobal('crypto', { randomUUID: vi.fn()
    .mockReturnValueOnce('ally-repair-stable-id').mockReturnValueOnce('ally-repair-fresh-id') });
  const { rerender } = render(<AllyRepairPanel control={control} docking={docking} fuelled={false} />);
  const repair = screen.getByRole('region', { name: 'Ally console repair' });
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(1));
  const revisedControl = { ...control, revision: 3 };
  const session = useSessionStore.getState().session!;
  act(() => useSessionStore.getState().setSession({
    ...session, shuttleControl: { ally: revisedControl },
  } as GameSession));
  rerender(<AllyRepairPanel control={revisedControl} docking={docking} fuelled={false} />);
  await act(async () => { resolveStale(staleReply('ally-repair-stable-id', {
    currentControlRevision: 3, currentRepairRevision: 0,
  })); });
  expect(await within(repair).findByRole('button', { name: 'Retry repair with current revision' })).toBeEnabled();
  expect(within(repair).getByRole('checkbox', { name: 'Reactor' })).toBeChecked();
});

it('ignores a superseded dock request when overlapping attempts settle in reverse order', async () => {
  let resolveOld!: (reply: ReturnType<typeof staleReply>) => void;
  let resolveCurrent!: (reply: ReturnType<typeof staleReply>) => void;
  mocks.repair
    .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
    .mockReturnValueOnce(new Promise((resolve) => { resolveCurrent = resolve; }));
  vi.stubGlobal('crypto', { randomUUID: vi.fn()
    .mockReturnValueOnce('ally-repair-shepherd-id').mockReturnValueOnce('ally-repair-icebreaker-id') });
  const { rerender } = render(<AllyRepairPanel control={control} docking={docking} fuelled={false} />);
  const repair = screen.getByRole('region', { name: 'Ally console repair' });
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(1));

  const icebreakerDocking = { ...docking, shipId: 'icebreaker' } as ShuttleDocking;
  act(() => {
    const session = useSessionStore.getState().session!;
    useSessionStore.getState().setSession({ ...session, shuttleDockings: [icebreakerDocking] } as GameSession);
  });
  rerender(<AllyRepairPanel control={control} docking={icebreakerDocking} fuelled={false} />);
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(2));
  expect(mocks.repair.mock.calls[1]?.[0]).toMatchObject({
    requestId: 'ally-repair-icebreaker-id', expectedHostShipId: 'icebreaker', systemIds: ['reactor'],
  });

  await act(async () => {
    resolveCurrent({ ...staleReply('ally-repair-icebreaker-id'), expectedHostShipId: 'icebreaker' });
  });
  const currentRetry = within(repair).getByRole('button', { name: 'Retry repair with current revision' });
  expect(currentRetry).toBeDisabled();

  await act(async () => { resolveOld(staleReply('ally-repair-shepherd-id')); });
  expect(within(repair).getByRole('button', { name: 'Retry repair with current revision' })).toBeDisabled();
  expect(within(repair).queryByRole('alert')).toBeNull();
});

it.each(['holder', 'fleet group'] as const)('drops stale recovery when %s authority is lost', async (authority) => {
  let resolveStale!: (reply: ReturnType<typeof staleReply>) => void;
  mocks.repair.mockReturnValueOnce(new Promise((resolve) => { resolveStale = resolve; }));
  render(<AllyRepairPanel control={control} docking={docking} fuelled={false} />);
  const repair = screen.getByRole('region', { name: 'Ally console repair' });
  fireEvent.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  fireEvent.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(1));
  if (authority === 'holder') {
    const session = useSessionStore.getState().session!;
    act(() => useSessionStore.getState().setSession({
      ...session, shuttleControl: { ally: { ...control, holderUid: 'another-player', revision: 3 } },
    } as GameSession));
  } else {
    const me = useSessionStore.getState().me!;
    act(() => useSessionStore.getState().setMe({ ...me, fleetGroupId: 'fleet-2' }));
  }
  await act(async () => { resolveStale(staleReply()); });
  expect(await within(repair).findByRole('alert')).toHaveTextContent(/authority or Coordination changed/i);
  expect(within(repair).queryByRole('button', { name: 'Retry repair with current revision' })).toBeNull();
});

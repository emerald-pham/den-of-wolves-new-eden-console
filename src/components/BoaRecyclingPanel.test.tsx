import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { SHUTTLECRAFT } from '@/data/shuttles';
import type { BoaRecyclingResult } from '@/lib/boaRecyclingService';
import { useSessionStore } from '@/store/useSessionStore';
import { acceptCallableSessionAuthority } from '@/lib/sessionSnapshotAuthority';
import type { GameSession, ShuttleControlEntry, ShuttleDocking } from '@/types/game';

const mocks = vi.hoisted(() => ({ recycle: vi.fn() }));
vi.mock('@/lib/boaRecyclingService', () => ({ recycleWithBoa: mocks.recycle }));
vi.mock('./ShuttleControl', () => ({ default: () => <div aria-label="Shuttle control" /> }));

import ShuttleConsoleTemplate from './ShuttleConsoleTemplate';

const boa = SHUTTLECRAFT.find((craft) => craft.id === 'boa')!;
const control = {
  shuttleId: 'boa', ownerRoleId: 'capybara-recycler', ownerUid: 'holder', holderUid: 'holder', revision: 2,
} as ShuttleControlEntry;
const docking = { shuttleId: 'boa', shipId: 'aegis', dockedAt: 'now' } as ShuttleDocking;

function installSession(overrides: Partial<GameSession> = {}): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner', createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'capybara-recycler', activeConsoleRoleId: 'capybara-recycler', joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, currentTurn: 3,
    activeRoleIds: ['capybara-captain', 'capybara-recycler'], activeVesselIds: ['capybara', 'aegis'],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-22T11:45:00.000Z', openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shipResources: {
      capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 },
      aegis: { ore: 6, fuel: 6, food: 8, water: 7, materials: 3, securityTeams: 9 },
    },
    shuttleCargo: { boa: { scrap: 3 } }, shuttleFuelled: { boa: true },
    ...overrides,
  } as GameSession);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

function renderBoa(currentControl = control, currentDocking: ShuttleDocking | undefined = docking, fuelled = true) {
  return render(<MemoryRouter><ShuttleConsoleTemplate shuttle={boa}
    captainName="Capybara Recycler" canLeave={false} control={currentControl}
    docking={currentDocking} fuelled={fuelled} /></MemoryRouter>);
}

beforeEach(() => {
  mocks.recycle.mockReset();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'boa-recycling-stable-id') });
  installSession();
});

afterEach(() => vi.unstubAllGlobals());

it('offers the printed recipes and submits one exchange against Boa’s current host', async () => {
  mocks.recycle.mockResolvedValue({
    status: 'committed', hostShipId: 'aegis', recipeId: 'water', resourceId: 'water',
    resourceCost: 6, hostResourceRemaining: 1, scrapRemaining: 4,
    cycle: 3, recyclingRevision: 1, exchangesThisCycle: 1,
  } satisfies BoaRecyclingResult);
  renderBoa();
  const panel = screen.getByRole('region', { name: 'Boa recycling' });
  expect(within(panel).getByText(/trade one printed recipe from Boa’s docked host for 1 Scrap.*twice each cycle/i))
    .toBeInTheDocument();
  expect(within(panel).getByText(/Docked host \/\/ AEGIS \/\/ Boa Scrap \/\/ 3 \/\/ exchanges remaining this cycle \/\/ 2/))
    .toBeInTheDocument();
  fireEvent.change(within(panel).getByRole('combobox', { name: 'Resource to recycle' }), { target: { value: 'water' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Recycle 6 Water for 1 Scrap' }));
  await waitFor(() => expect(mocks.recycle).toHaveBeenCalledWith({
    requestId: 'boa-recycling-stable-id', recipeId: 'water',
    expectedControlRevision: 2, expectedRecyclingRevision: 0,
    expectedCycle: 3, expectedHostShipId: 'aegis',
  }));
  expect(await within(panel).findByRole('status')).toHaveTextContent('Recycled 6 Water from AEGIS // Boa carries 4 Scrap.');
  expect(useSessionStore.getState().session?.shipResources?.aegis?.water).toBe(7);
  expect(useSessionStore.getState().session?.shuttleCargo?.boa?.scrap).toBe(3);
});

it.each([
  ['unfuelled', { fuelled: false }],
  ['stale phase', { turnPhase: { turn: 3, teamPhaseEndsAt: '2099-09-22T11:45:00.000Z', openAirspaceEndsAt: '2099-09-22T12:15:00.000Z', airspace: { state: 'restricted' as const, tickerActive: true, pressAccess: false } } }],
  ['quota', { boaRecycling: { cycle: 3, revision: 2, exchangesThisCycle: 2 } }],
  ['low host stock', { shipResources: { capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 }, aegis: { ore: 6, fuel: 6, food: 5, water: 7, materials: 3, securityTeams: 9 } } }],
])('disables the exchange for %s', (_label, setup) => {
  const { fuelled, ...overrides } = setup as { fuelled?: boolean } & Partial<GameSession>;
  installSession(overrides);
  renderBoa(control, docking, fuelled ?? true);
  const panel = screen.getByRole('region', { name: 'Boa recycling' });
  expect(within(panel).getByRole('button', { name: 'Recycle 6 Food for 1 Scrap' })).toBeDisabled();
  expect(mocks.recycle).not.toHaveBeenCalled();
});

it('keeps a foreign role holder from recycling and explains the active holder boundary', () => {
  useSessionStore.getState().setIdentity(useSessionStore.getState().session!, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'capybara-captain', activeConsoleRoleId: 'capybara-captain', joinedAt: '',
  });
  renderBoa();
  const panel = screen.getByRole('region', { name: 'Boa recycling' });
  expect(within(panel).getByText(/current Capybara Recycler holding Boa controls recycling/i)).toBeInTheDocument();
  expect(within(panel).getByRole('button', { name: 'Recycle 6 Food for 1 Scrap' })).toBeDisabled();
});

it('fails closed when the live Boa recycling projection is malformed', () => {
  installSession({ boaRecycling: null });
  renderBoa();
  const panel = screen.getByRole('region', { name: 'Boa recycling' });
  expect(within(panel).getByText(/recycling history is unavailable/i)).toBeInTheDocument();
  expect(within(panel).getByRole('button', { name: 'Recycle 6 Food for 1 Scrap' })).toBeDisabled();
});

it('ignores an overtaken reply and releases only its own pending state', async () => {
  let resolveExchange!: (result: BoaRecyclingResult) => void;
  mocks.recycle.mockReturnValueOnce(new Promise<BoaRecyclingResult>((resolve) => {
    resolveExchange = resolve;
  }));
  renderBoa();
  const panel = screen.getByRole('region', { name: 'Boa recycling' });
  const button = within(panel).getByRole('button', { name: 'Recycle 6 Food for 1 Scrap' });
  fireEvent.click(button);
  expect(button).toBeDisabled();

  const current = useSessionStore.getState().session!;
  expect(acceptCallableSessionAuthority({ ...current, updatedAt: new Date().toISOString() }, 'holder')).toBe(true);
  await act(async () => {
    resolveExchange({
      status: 'committed', hostShipId: 'aegis', recipeId: 'food', resourceId: 'food',
      resourceCost: 6, hostResourceRemaining: 2, scrapRemaining: 4,
      cycle: 3, recyclingRevision: 1, exchangesThisCycle: 1,
    });
  });

  expect(within(panel).queryByRole('status')).not.toBeInTheDocument();
  await waitFor(() => expect(button).not.toBeDisabled());
});

it('retries the exact command id after an uncertain response', async () => {
  mocks.recycle.mockRejectedValueOnce(new Error('temporary timeout'));
  mocks.recycle.mockResolvedValueOnce({
    status: 'replayed', hostShipId: 'aegis', recipeId: 'food', resourceId: 'food',
    resourceCost: 6, hostResourceRemaining: 2, scrapRemaining: 4,
    cycle: 3, recyclingRevision: 1, exchangesThisCycle: 1,
  } satisfies BoaRecyclingResult);
  renderBoa();
  const panel = screen.getByRole('region', { name: 'Boa recycling' });
  fireEvent.click(within(panel).getByRole('button', { name: 'Recycle 6 Food for 1 Scrap' }));
  expect(await within(panel).findByRole('alert')).toHaveTextContent('temporary timeout');
  fireEvent.click(within(panel).getByRole('button', { name: 'Retry exact recycling request' }));
  await waitFor(() => expect(mocks.recycle).toHaveBeenCalledTimes(2));
  expect(mocks.recycle.mock.calls[1]?.[0]).toEqual(mocks.recycle.mock.calls[0]?.[0]);
  expect(await within(panel).findByRole('status')).toHaveTextContent('already recorded');
});

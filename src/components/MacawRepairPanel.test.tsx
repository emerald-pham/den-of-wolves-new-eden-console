import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, currentTurn: 3,
    activeRoleIds: ['capybara-captain'], activeVesselIds: ['capybara', 'aegis'],
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

function renderMacaw(currentControl = control, currentDocking: ShuttleDocking | undefined = docking) {
  return render(<MemoryRouter><ShuttleConsoleTemplate shuttle={macaw}
    captainName="Capybara Captain" canLeave={false} control={currentControl}
    docking={currentDocking} fuelled /></MemoryRouter>);
}

beforeEach(() => {
  mocks.repair.mockReset();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'macaw-repair-stable-id') });
  installSession();
});

afterEach(() => vi.unstubAllGlobals());

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

it('uses Capybara Scrap for an eligible fuelled second host', async () => {
  mocks.repair.mockResolvedValue({
    status: 'committed', hostShipId: 'aegis', systemIds: ['reactor'],
    scrapRemaining: 2, cycle: 3, repairRevision: 2,
  } satisfies MacawRepairResult);
  installSession({
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

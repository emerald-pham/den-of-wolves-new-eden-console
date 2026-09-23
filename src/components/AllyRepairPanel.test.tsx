import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AllyRepairResult } from '@/lib/allyRepairService';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, ShuttleControlEntry, ShuttleDocking } from '@/types/game';

const mocks = vi.hoisted(() => ({ repair: vi.fn() }));
vi.mock('@/lib/allyRepairService', () => ({ repairConsolesFromAlly: mocks.repair }));

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
    activeConsoleRoleId: 'joint-engineering-shepherd-icebreaker', joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, currentTurn: 3,
    activeRoleIds: ['joint-engineering-shepherd-icebreaker'],
    activeVesselIds: ['shepherd', 'icebreaker'],
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

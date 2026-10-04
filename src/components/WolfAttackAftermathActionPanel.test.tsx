import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfAttackMemberView } from '@/types/game';

const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), commit: vi.fn() }));
vi.mock('@/lib/firestore', () => ({ subscribeWolfAttackMemberView: mocks.subscribe }));
vi.mock('@/lib/wolfAttackAftermathService', () => ({ commitWolfAttackAftermath: mocks.commit }));

import WolfAttackAftermathActionPanel from './WolfAttackAftermathActionPanel';

let publish: ((view: WolfAttackMemberView | null) => void) | undefined;
const member: WolfAttackMemberView = {
  type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 's1', attackId: 'attack-7',
  turn: 7, revision: 4, status: 'resolved', phase: 'active', currentStep: 'resolved', range: null,
  deadlineAt: '2026-10-04T10:00:00.000Z', serverTime: '2026-10-04T09:59:00.000Z', visibility: 'members',
  redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'],
  results: [{ range: 'boarding', sourceId: 'wolf-attack-damage', targetId: 'aegis', bearing: null,
    contactReference: 'AEGIS damage record', effect: 'Wolf attack applies 3 damage to AEGIS',
    outcome: { damage: 3, destroyed: false, populationLoss: 500 }, serverTime: '2026-10-04T09:59:00.000Z' }],
};

function installIdentity(replacementRoleId: string | null, assignedRoleId = 'admiral', activeConsoleRoleId: string | null = null) {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({ id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'gm',
    createdAt: '', updatedAt: '', currentTurn: 7, activeVesselIds: ['aegis', 'capybara'], capybaraEnabled: true } as never,
  { uid: 'actor-1', sessionId: 's1', displayName: 'Operator', role: 'player', seatId: null, assignedRoleId,
    replacementRoleId, activeConsoleRoleId, joinedAt: '', fleetGroupId: 'fleet-1' } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  mocks.commit.mockReset().mockResolvedValue({ status: 'committed', sessionId: 's1', attackId: 'attack-7',
    requestId: 'request-1', action: 'doctor', mitigated: [] });
  mocks.subscribe.mockReset().mockImplementation((_sessionId, callback) => { publish = callback; return vi.fn(); });
  installIdentity('doctor');
});
afterEach(() => { publish = undefined; });

it('lets the current Doctor choose only a damaged ship and submits that server-receipted choice', async () => {
  render(<WolfAttackAftermathActionPanel operator="doctor" />);
  publish?.(member);

  const panel = screen.getByRole('region', { name: 'Doctor Medical Aid' });
  const target = within(panel).getByRole('checkbox', { name: /AEGIS.*500 population loss/i });
  fireEvent.click(target);
  fireEvent.click(within(panel).getByRole('button', { name: 'Record Medical Aid' }));

  await waitFor(() => expect(mocks.commit).toHaveBeenCalledWith('attack-7', {
    action: 'doctor', selectedShipIds: ['aegis'],
  }, expect.any(String)));
  expect(await within(panel).findByRole('status')).toHaveTextContent(/Medical Aid committed/i);
});

it('offers server-owned Salvage Drones only to the charged current Warrior', () => {
  installIdentity('warrior-captain');
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({ ...session, smallShipStates: { warrior: { id: 'warrior', hostShipId: 'aegis',
    dockingRevision: 1, population: 2_000, unrest: 0,
    cycle: { step: 5, revision: 2, results: {}, charges: ['salvage-drones'], turn: 7,
      rationBonus: 0, chargingSkipped: false } } } } as never);
  render(<WolfAttackAftermathActionPanel operator="warrior" />);
  publish?.(member);
  fireEvent.click(screen.getByRole('button', { name: 'Resolve Salvage Drones' }));

  expect(mocks.commit).toHaveBeenCalledWith('attack-7', { action: 'warrior-salvage' }, expect.any(String));
});

it('lets the current Macaw operator collect one threshold Scrap opportunity', () => {
  installIdentity(null, 'capybara-captain', 'capybara-captain');
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({ ...session, shuttleControl: { macaw: { shuttleId: 'macaw',
    ownerRoleId: 'capybara-captain', ownerUid: 'actor-1', holderUid: 'actor-1', revision: 1 } } } as never);
  render(<WolfAttackAftermathActionPanel operator={{ shuttleId: 'macaw' }} />);
  publish?.(member);
  fireEvent.click(screen.getByRole('button', { name: 'Collect Scrap from AEGIS' }));

  expect(mocks.commit).toHaveBeenCalledWith('attack-7', {
    action: 'collect-scrap', shuttleId: 'macaw', targetShipId: 'aegis',
  }, expect.any(String));
});

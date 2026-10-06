import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { SHUTTLECRAFT } from '@/data/shuttles';
import type { Player } from '@/types/game';
import PrivateLoyaltyPanel from './PrivateLoyaltyPanel';

const actions = vi.hoisted(() => ({ beacon: vi.fn(), intelligence: vi.fn(), sabotage: vi.fn() }));
vi.mock('@/lib/androidProofService', () => ({ revealAndroidProof: vi.fn() }));
vi.mock('@/lib/wolfActionService', () => ({ submitWolfHomingBeacon: actions.beacon,
  submitWolfIntelligence: actions.intelligence, submitWolfSupplySabotage: actions.sabotage }));
vi.mock('@/lib/intelligenceInvestigationService', () => ({ investigatePlayer: vi.fn() }));
vi.mock('@/lib/firestore', () => ({ subscribeConnectedPlayers: vi.fn(() => vi.fn()),
  subscribeIntelligenceInvestigation: vi.fn(() => vi.fn()) }));

beforeEach(() => {
  useSessionStore.getState().reset(); vi.clearAllMocks();
  useSessionStore.getState().setIdentity({ id: 'guidance-session', phase: 'active', currentTurn: 2,
    activeRoleIds: ['executive-officer', 'dione-engineer', 'wing-commander'],
    shuttleCargo: { pallas: { securityTeams: 0 }, philia: { food: 0 }, starlight: { materials: 8 } },
  } as never, { uid: 'original-wolf', sessionId: 'guidance-session', role: 'player',
    displayName: 'EO', assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer',
    seatId: null, connectionGeneration: 1, joinedAt: '2026-10-06T12:00:00.000Z' });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  useSessionStore.getState().setPrivateLoyalty({ kind: 'wolf-cult', suspicion: 0 });
});
afterEach(() => { cleanup(); useSessionStore.getState().reset(); });

function wolf() { return within(screen.getByRole('region', { name: 'Private Wolf action' })); }
function untouched() {
  expect(actions.beacon).not.toHaveBeenCalled(); expect(actions.intelligence).not.toHaveBeenCalled();
  expect(actions.sabotage).not.toHaveBeenCalled();
}

it('uses the real EO/Pallas cargo configuration to direct its entitled holder to normal Load while sabotage remains unavailable', () => {
  const pallas = SHUTTLECRAFT.find(craft => craft.id === 'pallas');
  expect(pallas?.captainRoleId).toBe('executive-officer');
  expect(pallas?.cargoTransferTypes).toEqual(['securityTeams']);
  render(<PrivateLoyaltyPanel />); const view = wolf();
  expect(view.getByRole('combobox', { name: 'Shuttle cargo target' })).toBeDisabled();
  expect(view.getByRole('button', { name: 'Sabotage selected supply' })).toBeDisabled();
  expect(view.getAllByRole('option')).toHaveLength(1); untouched();
  expect(view.getByText(/Next actor.*Pallas.*holder.*Transfer cargo.*Load.*host stock.*capacity/i)).toBeVisible();
  expect(view.getByText(/Pallas.*Security teams only/i)).toBeVisible();
  expect(view.queryByRole('button', { name: /Load cargo|create cargo|claim Pallas/i })).not.toBeInTheDocument();
});

it('points a current Dione Engineer only to its real load-capable Philia instead of foreign Starlight or non-cargo Maliades', () => {
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, assignedRoleId: 'dione-engineer',
    activeConsoleRoleId: 'dione-engineer' });
  // The actual store invalidates the prior role's private card. This fresh
  // rendering fixture delivers the current same-UID card after that boundary.
  expect(useSessionStore.getState().privateLoyalty).toBeNull();
  useSessionStore.getState().setPrivateLoyalty({ kind: 'wolf-cult', suspicion: 0 });
  expect(SHUTTLECRAFT.find(craft => craft.id === 'philia')?.cargoTransferTypes).toContain('food');
  expect(SHUTTLECRAFT.find(craft => craft.id === 'maliades')?.cargoTransferTypes).toBeUndefined();
  render(<PrivateLoyaltyPanel />); const view = wolf();
  expect(view.getByRole('button', { name: 'Sabotage selected supply' })).toBeDisabled(); untouched();
  expect(view.getByText(/Next actor.*Philia.*holder.*Transfer cargo.*Load/i)).toBeVisible();
  expect(view.queryByText(/Next actor.*Starlight|Next actor.*Maliades|Next actor.*Pallas/i)).not.toBeInTheDocument();
});

it('removes the empty-cargo handoff when the current source publishes positive entitled Pallas cargo and retains the real target selector', async () => {
  render(<PrivateLoyaltyPanel />); const view = wolf();
  expect(view.getByRole('button', { name: 'Sabotage selected supply' })).toBeDisabled();
  act(() => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!,
    shuttleCargo: { pallas: { securityTeams: 2 }, starlight: { materials: 8 } } }));
  await userEvent.selectOptions(view.getByRole('combobox', { name: 'Shuttle cargo target' }), 'pallas|securityTeams');
  expect(view.getByRole('button', { name: 'Sabotage selected supply' })).toBeEnabled();
  expect(view.queryByText(/Next actor.*holder.*Transfer cargo/i)).not.toBeInTheDocument();
  expect(view.queryByRole('option', { name: /Starlight/ })).not.toBeInTheDocument(); untouched();
});

it('does not advertise a cargo loader after the cover role is removed from the active roster', () => {
  useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, activeRoleIds: [] });
  render(<PrivateLoyaltyPanel />); const view = wolf();
  expect(view.getByRole('button', { name: 'Sabotage selected supply' })).toBeDisabled();
  expect(view.queryByText(/Next actor.*Pallas.*holder/i)).not.toBeInTheDocument(); untouched();
});

it.each([
  { activeConsoleRoleId: 'wing-commander' },
  { escapeState: { shipId: 'aegis', status: 'pending', destructionEventId: 'destroyed-aegis', revision: 1 } },
] satisfies Partial<Player>[])('does not turn a lost current cover-role entitlement %j into cargo-loading guidance', patch => {
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, ...patch });
  render(<PrivateLoyaltyPanel />); const view = wolf();
  expect(view.getByRole('button', { name: 'Sabotage selected supply' })).toBeDisabled();
  expect(view.queryByText(/Next actor.*Pallas.*holder/i)).not.toBeInTheDocument(); untouched();
});

it.each([
  { role: 'gm' as const }, { sessionId: 'foreign-session' }, { replacementStatus: 'awaiting-re-role' as const },
  { replacementRoleId: 'doctor' },
] satisfies Partial<Player>[])('preserves the original private-card audience loss %j without exposing a named cargo handoff', patch => {
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, ...patch });
  render(<PrivateLoyaltyPanel />);
  expect(screen.queryByRole('region', { name: 'Private Wolf action' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Next actor.*Pallas/i)).not.toBeInTheDocument(); untouched();
});

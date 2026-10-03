import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfAttackMemberView } from '@/types/game';
const mocks = vi.hoisted(() => ({ read: vi.fn(), commit: vi.fn(), subscribe: vi.fn(), fighterRead: vi.fn(), fighterCommit: vi.fn(), enrichedRead: vi.fn(), enrichedCommit: vi.fn() }));
vi.mock('@/lib/wolfEscortRangeService', () => ({ getWolfEscortRangeActionChoice: mocks.read, commitWolfEscortRangeActionChoice: mocks.commit }));
vi.mock('@/lib/firestore', () => ({ subscribeWolfAttackMemberView: mocks.subscribe }));
vi.mock('@/lib/sessionService', () => ({ getWolfFighterRangeActionChoice: mocks.fighterRead, commitWolfFighterRangeActionChoice: mocks.fighterCommit,
  getAegisEnrichedWarheadChoice: mocks.enrichedRead, commitAegisEnrichedWarheadChoice: mocks.enrichedCommit }));
import WolfEscortRangeActionPanel from './WolfEscortRangeActionPanel';
import WolfFighterRangeActionPanel from './WolfFighterRangeActionPanel';
import AegisEnrichedWarheadPanel from './AegisEnrichedWarheadPanel';
const member: WolfAttackMemberView = { type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 's1', attackId: 'attack-2',
  turn: 2, revision: 8, status: 'declared', phase: 'active', currentStep: 'medium-range', range: 'medium',
  deadlineAt: '2099-01-01T12:00:00Z', serverTime: '2099-01-01T12:00:00Z', visibility: 'members',
  redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'], results: [] };
const common = { sessionId: 's1', attackId: 'attack-2', turn: 2, revision: 8, range: 'medium-range',
  choiceStatus: 'pending', launched: true, targets: [{ instanceId: 'contact-1', label: 'Wolf contact 1', targetNumber: 1 }] };
let publish: (view: WolfAttackMemberView | null) => void;
beforeEach(() => {
  useSessionStore.getState().reset();
  mocks.read.mockReset(); mocks.commit.mockReset().mockResolvedValue({ status: 'committed' });
  mocks.subscribe.mockReset().mockImplementation((_session, callback) => { publish = callback; return vi.fn(); });
});
function connect(roleId: 'dione-engineer' | 'refinery-124-pdf-colonel') {
  useSessionStore.getState().setIdentity({ id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'gm',
    createdAt: '', updatedAt: '', currentTurn: 2,
    shuttleControl: { maliades: { shuttleId: 'maliades', ownerRoleId: 'dione-engineer', ownerUid: 'u1', holderUid: 'u1', revision: 0 } },
  }, { uid: 'u1', sessionId: 's1', displayName: 'Crew', role: 'player', seatId: null,
    assignedRoleId: roleId, activeConsoleRoleId: roleId, fleetGroupId: 'fleet-1', joinedAt: '' });
  useSessionStore.setState({ connection: 'live', sessionSnapshotFreshness: 'server' });
}
it('mounts the actual PDF fighter presenter and commits a pass only for a fresh current attack', async () => {
  connect('refinery-124-pdf-colonel');
  const view = { ...common, type: 'wolf-fighter-range-action-view', wingId: 'pdf-escort-fighter-wing',
    wingLabel: 'P.D.F. Escort Fighter Wing', fighters: [{ fighterIndex: 0 }] };
  mocks.read.mockResolvedValue(view);
  render(<WolfEscortRangeActionPanel sourceId="pdf-escort-fighter-wing" range="medium-range" />);
  act(() => publish(member));
  await userEvent.click(await screen.findByRole('button', { name: 'Pass Medium Range' }));
  expect(mocks.commit).toHaveBeenCalledWith(view, 'pdf-escort-fighter-wing', []);
  act(() => useSessionStore.setState({ connection: 'offline', sessionSnapshotFreshness: 'cache' }));
  expect(screen.queryByRole('button', { name: 'Pass Medium Range' })).not.toBeInTheDocument();
});
it('mounts the actual Maliades presenter and withdraws it after custody changes', async () => {
  connect('dione-engineer');
  mocks.read.mockResolvedValue({ ...common, type: 'dione-maliades-range-action-view', damage: 2, destroyed: false });
  render(<WolfEscortRangeActionPanel sourceId="maliades" range="medium-range" />);
  act(() => publish(member));
  expect(await screen.findByText('Maliades // damage 2 of 3')).toBeVisible();
  act(() => {
    const state = useSessionStore.getState();
    state.setSession({ ...state.session!, shuttleControl: { maliades: { ...state.session!.shuttleControl!.maliades!, holderUid: 'u2', revision: 1 } } });
  });
  expect(screen.queryByRole('button', { name: 'Pass Maliades Medium Range' })).not.toBeInTheDocument();
  expect(mocks.commit).not.toHaveBeenCalled();
});

it('keeps a launched AEGIS wing view mounted through the asynchronous read and choice render', async () => {
  connect('dione-engineer');
  const state = useSessionStore.getState();
  state.setMe({ ...state.me!, assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander' });
  const view = { ...common, type: 'wolf-fighter-range-action-view', wingId: 'fighter-wing-alpha', wingLabel: 'Fighter Wing Alpha', fighters: [{ fighterIndex: 0 }] };
  mocks.fighterRead.mockResolvedValue(view);
  mocks.fighterCommit.mockResolvedValue({ status: 'committed' });
  render(<WolfFighterRangeActionPanel sourceId="fighter-wing-alpha" range="medium-range" />);
  act(() => publish(member));
  await userEvent.click(await screen.findByRole('button', { name: 'Pass Medium Range' }));
  expect(mocks.fighterCommit).toHaveBeenCalledWith(2, 8, 'medium-range', 'fighter-wing-alpha', []);
});

it('keeps the attack-start enriched choice mounted and commits its explicit pass once', async () => {
  connect('dione-engineer');
  const state = useSessionStore.getState();
  state.setMe({ ...state.me!, assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer' });
  mocks.enrichedRead.mockResolvedValue({ type: 'aegis-enriched-warhead-view', sessionId: 's1', attackId: 'attack-2', turn: 2, revision: 8,
    choiceStatus: 'pending', eligible: true, oreCost: 5 });
  mocks.enrichedCommit.mockResolvedValue({ status: 'committed' });
  render(<AegisEnrichedWarheadPanel />);
  act(() => publish({ ...member, currentStep: 'targeting', range: null }));
  await userEvent.click(await screen.findByRole('button', { name: 'Pass enriched warheads' }));
  expect(mocks.enrichedCommit).toHaveBeenCalledWith(2, 8, 'pass');
});

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfAttackMemberView, WolfBoardingSpecialChoiceReadResult } from '@/types/game';

const mocks = vi.hoisted(() => ({ read: vi.fn(), commit: vi.fn(), subscribe: vi.fn() }));
vi.mock('@/lib/firestore', () => ({ subscribeWolfAttackMemberView: mocks.subscribe }));
vi.mock('@/lib/sessionService', () => ({
  getWolfBoardingSpecialChoice: mocks.read,
  commitWolfBoardingSpecialChoice: mocks.commit,
}));
import WolfBoardingSpecialChoicePanel from './WolfBoardingSpecialChoicePanel';

const member: WolfAttackMemberView = { type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 's1',
  attackId: 'attack-1', turn: 1, revision: 12, status: 'declared', phase: 'active', currentStep: 'boarding', range: null,
  deadlineAt: '2099-01-01T12:00:00Z', serverTime: '2099-01-01T12:00:00Z', visibility: 'members',
  redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'], results: [] };
const chepuChoice: WolfBoardingSpecialChoiceReadResult = { type: 'wolf-boarding-special-choice-view', sessionId: 's1',
  turn: 1, revision: 12, choice: { kind: 'relocation', craftId: 'chepu', currentHostId: 'refinery-124', fuelled: true,
    controlRevision: 0, legalHostIds: ['dione', 'refinery-124'] } };
const lostReply = Object.assign(new Error('The connection was lost before the server confirmed this boarding choice.'),
  { code: 'deadline-exceeded' });
let publish: (view: WolfAttackMemberView | null) => void;

beforeEach(() => {
  useSessionStore.getState().reset();
  mocks.read.mockReset();
  mocks.commit.mockReset();
  mocks.subscribe.mockReset().mockImplementation((_session, callback) => { publish = callback; return vi.fn(); });
  useSessionStore.getState().setIdentity({ id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'gm',
    createdAt: '', updatedAt: '', currentTurn: 1 }, { uid: 'colonel-1', sessionId: 's1', displayName: 'Colonel',
    role: 'player', seatId: null, assignedRoleId: 'refinery-124-pdf-colonel',
    activeConsoleRoleId: 'refinery-124-pdf-colonel', fleetGroupId: 'fleet-2', joinedAt: '' });
  useSessionStore.setState({ connection: 'live', sessionSnapshotFreshness: 'server' });
});

it('offers the Colonel the Chepu choice again after a lost reply and retries that same choice', async () => {
  mocks.read.mockResolvedValue(chepuChoice);
  mocks.commit.mockRejectedValueOnce(lostReply).mockResolvedValueOnce({ status: 'committed' });
  render(<WolfBoardingSpecialChoicePanel />);
  act(() => publish(member));

  await userEvent.click(await screen.findByRole('button', { name: 'Move Chepu to Dione' }));
  // The server still reports the choice as pending, so the same choice is offered again.
  await userEvent.click(await screen.findByRole('button', { name: 'Move Chepu to Dione' }));
  const expected = [1, 12, { kind: 'relocation', craftId: 'chepu', targetShipId: 'dione', expectedControlRevision: 0 }];
  expect(mocks.commit.mock.calls).toEqual([expected, expected]);
});

it('withdraws the Chepu choice without a second commit when the lost reply had already committed', async () => {
  mocks.read.mockResolvedValueOnce(chepuChoice)
    .mockResolvedValue({ type: 'wolf-boarding-special-choice-unavailable', sessionId: 's1', reason: 'not-your-choice' });
  mocks.commit.mockRejectedValueOnce(lostReply);
  render(<WolfBoardingSpecialChoicePanel />);
  act(() => publish(member));

  await userEvent.click(await screen.findByRole('button', { name: 'Move Chepu to Dione' }));
  act(() => publish({ ...member, revision: 13 }));
  await vi.waitFor(() => expect(screen.queryByRole('button', { name: /Chepu/ })).not.toBeInTheDocument());
  expect(screen.queryByRole('region', { name: 'Current boarding special choice' })).not.toBeInTheDocument();
  expect(mocks.commit).toHaveBeenCalledTimes(1);
});

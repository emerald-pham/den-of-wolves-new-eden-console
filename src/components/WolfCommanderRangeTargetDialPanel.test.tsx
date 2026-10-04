import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import WolfCommanderRangeTargetDialPanel from './WolfCommanderRangeTargetDialPanel';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfAttackMemberView } from '@/types/game';

const mocks = vi.hoisted(() => ({ get: vi.fn(), apply: vi.fn(), subscribe: vi.fn() }));

vi.mock('@/lib/sessionService', () => ({
  getWolfCommanderRangeTargetDial: mocks.get,
  applyWolfCommanderRangeTargetAdjustment: mocks.apply,
}));
vi.mock('@/lib/firestore', () => ({ subscribeWolfAttackMemberView: mocks.subscribe }));

function member(currentStep: WolfAttackMemberView['currentStep'] = 'long-range'): WolfAttackMemberView {
  return {
    type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 's1', attackId: 'attack-1',
    turn: 4, revision: 7, status: 'declared', phase: 'active', currentStep,
    range: currentStep === 'long-range' ? 'long' : currentStep === 'medium-range' ? 'medium' : null,
    deadlineAt: '2026-10-03T12:10:00.000Z', serverTime: '2026-10-03T12:00:00.000Z',
    visibility: 'members', redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'],
    results: [],
  };
}

const dial = {
  type: 'wolf-commander-range-target-dial-view', sessionId: 's1', attackId: 'attack-1',
  turn: 4, revision: 7, range: 'long-range', targetGroupId: 'fleet-2',
  ring: [
    { targetId: 'aegis', targetNumber: 1 }, { targetId: 'dione', targetNumber: 2 },
    { targetId: 'icebreaker', targetNumber: 3 }, { targetId: 'quellon', targetNumber: 4 },
    { targetId: 'shepherd', targetNumber: 5 }, { targetId: 'refinery-124', targetNumber: 6 },
  ],
  ships: [
    { rosterIndex: 0, shipId: 'wolf-cruiser', currentTarget: 'dione', currentTargetNumber: 2 },
    { rosterIndex: 1, shipId: 'wolf-fighter-wing', currentTarget: 'refinery-124', currentTargetNumber: 6 },
  ],
  adjustmentUsed: false,
};

beforeEach(() => {
  useSessionStore.getState().reset();
  mocks.get.mockReset().mockResolvedValue(dial);
  mocks.apply.mockReset().mockResolvedValue({
    status: 'committed', type: 'wolf-commander-range-target-adjustment', sessionId: 's1',
    requestId: 'r1', turn: 4, revision: 8, attackId: 'attack-1', range: 'long-range',
    rosterIndex: 1, instanceId: '1:wolf-fighter-wing', shipId: 'wolf-fighter-wing',
    fromTarget: 'refinery-124', toTarget: 'aegis', fromTargetNumber: 6, toTargetNumber: 1, delta: 1,
  });
  mocks.subscribe.mockImplementation((sessionId: string, onView: (view: WolfAttackMemberView | null) => void) => {
    onView({ ...member(), sessionId });
    return () => undefined;
  });
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', currentTurn: 4,
      ownerUid: 'gm1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { uid: 'u1', sessionId: 's1', displayName: 'Commander', role: 'player', seatId: null,
      assignedRoleId: null, replacementRoleId: 'wolf-commander', fleetGroupId: 'fleet-1',
      joinedAt: '2026-01-01T00:00:00.000Z' },
  );
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('shows only the current group ring and applies one selected ship target adjustment', async () => {
  const user = userEvent.setup();
  render(<WolfCommanderRangeTargetDialPanel />);

  expect(await screen.findByRole('heading', { name: 'Range target dial' })).toBeVisible();
  expect(screen.getByText((_content, element) => element?.textContent === 'Fleet 2 // Long Range range')).toBeVisible();
  const selectedShip = screen.getByRole('combobox', { name: 'Wolf ship' });
  await user.selectOptions(selectedShip, '1');
  expect(screen.getByText('Current target // Refinery 124 // 6')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Move target one step up the ring' }));

  await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith(dial, 1, 1));
  expect(await screen.findByText(/target adjusted.*refinery 124.*aegis/i)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Move target one step up the ring' })).toBeDisabled();
  expect(screen.queryByText(/composition|remaining force|notes/i)).not.toBeInTheDocument();
});

it('does not read a range dial for a historical Commander assignment', () => {
  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, replacementRoleId: null, assignedRoleId: 'wolf-commander',
  }));
  const { container } = render(<WolfCommanderRangeTargetDialPanel />);
  expect(container).toBeEmptyDOMElement();
  expect(mocks.get).not.toHaveBeenCalled();
});

it('waits for an active long medium or short range member step before reading', async () => {
  mocks.subscribe.mockImplementation((_sessionId: string, onView: (view: WolfAttackMemberView | null) => void) => {
    onView(member('targeting'));
    return () => undefined;
  });
  render(<WolfCommanderRangeTargetDialPanel />);
  await screen.findByText(/waiting for an active attack range/i);
  expect(mocks.get).not.toHaveBeenCalled();
});

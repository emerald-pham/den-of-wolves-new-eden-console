import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TurnPhaseCoordinator from './TurnPhaseCoordinator';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfAttackMemberView } from '@/types/game';

const transport = vi.hoisted(() => ({
  begin: vi.fn(), subscribe: vi.fn(), receive: undefined as undefined | ((view: WolfAttackMemberView | null) => void),
}));
vi.mock('@/lib/sessionService', () => ({ beginOpenAirspacePhase: transport.begin }));
vi.mock('@/lib/firestore', () => ({ subscribeWolfAttackMemberView: transport.subscribe }));

function audience(overrides: Partial<WolfAttackMemberView> = {}): WolfAttackMemberView {
  return {
    type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 's1', attackId: 'attack-1',
    turn: 2, revision: 1, status: 'declared', phase: 'active', currentStep: 'targeting', range: null,
    deadlineAt: '2026-09-06T12:05:00.000Z', serverTime: '2026-09-06T12:00:00.000Z',
    visibility: 'members', redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'],
    results: [], ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  transport.begin.mockReset().mockResolvedValue(undefined);
  transport.receive = undefined;
  transport.subscribe.mockReset().mockImplementation((_id, receive) => {
    transport.receive = receive;
    receive(null);
    return vi.fn();
  });
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'u1',
    createdAt: '2026-09-06T12:00:00.000Z', updatedAt: '2026-09-06T12:00:00.000Z', currentTurn: 2,
    turnPhase: { turn: 2, teamPhaseEndsAt: '2026-09-06T12:00:01.000Z',
      openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
  }, { uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
    joinedAt: '2026-09-06T12:00:00.000Z' });
  useSessionStore.getState().setConnection('live');
});
afterEach(() => vi.useRealTimers());

async function mountAndReceive(view: WolfAttackMemberView) {
  render(<TurnPhaseCoordinator />);
  await act(async () => { await Promise.resolve(); });
  await act(async () => { transport.receive?.(view); });
}

it('does not repeatedly open normal airspace during a current declared attack', async () => {
  await mountAndReceive(audience());
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(transport.begin).not.toHaveBeenCalled();
});

it('cancels the pending clock promotion when the attack locks before the deadline', async () => {
  render(<TurnPhaseCoordinator />);
  await act(async () => { await Promise.resolve(); await vi.advanceTimersByTimeAsync(500); });
  await act(async () => { transport.receive?.(audience({ currentStep: 'medium-range', range: 'medium' })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(transport.begin).not.toHaveBeenCalled();
});

it.each([
  ['another session', { sessionId: 's2' }], ['an old cycle', { turn: 1 }],
  ['resolved', { status: 'resolved' as const, currentStep: 'resolved' as const }],
])('retains ordinary Team promotion when the audience is %s', async (_label, overrides) => {
  await mountAndReceive(audience(overrides));
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(transport.begin).toHaveBeenCalledWith(2);
});

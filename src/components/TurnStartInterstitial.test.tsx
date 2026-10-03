import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import TurnStartAnnouncement from './TurnStartAnnouncement';
vi.mock('@/lib/turnInterstitialService', () => ({ clearTurnAdvanceInterstitial: vi.fn() }));
const { clearTurnAdvanceInterstitial } = await import('@/lib/turnInterstitialService');
const phase = {turn: 2, teamPhaseEndsAt: '2026-10-03T01:05:00.000Z',
  openAirspaceEndsAt: '2026-10-03T01:20:00.000Z',
  airspace: {state: 'restricted' as const, tickerActive: true, pressAccess: false},
  timerPause: {reason: 'turn-interstitial' as const, window: 'restricted' as const,
    remainingMs: 300000, pausedAt: '2026-10-03T01:00:00.000Z'}};
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T01:10:00.000Z'));
  useSessionStore.getState().reset();
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSession({id: 's1',name:'PC07',joinCode:'123456',ownerUid:'u1',phase:'active',
    currentTurn:2,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',
    turnStartAnnouncement:{turn:2,survivorPopulation:242500},turnPhase:phase});
  vi.mocked(clearTurnAdvanceInterstitial).mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());
it('restores an uncleared interstitial on reconnect, hides its timer and exposes one explicit clear', async () => {
  render(<TurnStartAnnouncement />);
  expect(screen.getByText('CYCLE 2')).toBeInTheDocument();
  expect(screen.queryByRole('status',{name:/Airspace closed/,hidden:true})).not.toBeInTheDocument();
  const clear = screen.getByRole('button',{name:'Clear cycle briefing // resume clock'});
  expect(clear.closest('[aria-hidden="true"]')).toBeNull();
  for(let i=0;i<4;i++) act(() => vi.advanceTimersByTime(3000));
  expect(document.querySelector('.intrusion--fleet')).toBeInTheDocument();
  await act(async () => fireEvent.click(clear));
  expect(clearTurnAdvanceInterstitial).toHaveBeenCalledWith(expect.objectContaining({
    expectedCycle:2,expectedPausedAt:phase.timerPause.pausedAt,requestId:expect.any(String)}));
  act(() => useSessionStore.getState().setSession({...useSessionStore.getState().session!,
    turnPhase:{...phase,timerPause:undefined} as never}));
  expect(document.querySelector('.intrusion--fleet')).not.toBeInTheDocument();
});
it('keeps the same clear identity after a temporary error and blocks offline dismissal', async () => {
  vi.mocked(clearTurnAdvanceInterstitial).mockRejectedValueOnce(new Error('CIC link unavailable'));
  render(<TurnStartAnnouncement />);
  const clear = screen.getByRole('button',{name:'Clear cycle briefing // resume clock'});
  await act(async () => fireEvent.click(clear));
  expect(screen.getByRole('alert')).toHaveTextContent('CIC link unavailable');
  await act(async () => fireEvent.click(clear));
  expect(vi.mocked(clearTurnAdvanceInterstitial).mock.calls[0]).toEqual(vi.mocked(clearTurnAdvanceInterstitial).mock.calls[1]);
  act(() => useSessionStore.getState().setConnection('offline'));
  expect(clear).toBeDisabled();
});

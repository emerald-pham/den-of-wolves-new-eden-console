import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import PursuitEmergencyWindowPanel from './PursuitEmergencyWindowPanel';

vi.mock('@/lib/sessionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sessionService')>();
  return { ...actual, advanceTurn: vi.fn() };
});

const { advanceTurn } = await import('@/lib/sessionService');
const windowState = {
  type: 'pursuit-emergency-window' as const,
  status: 'awaiting-gm-decision' as const,
  cycle: 3,
  navigationRevision: 42,
  groupIds: ['fleet-1', 'fleet-3'],
  openedAt: '2026-09-28T12:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(advanceTurn).mockReset().mockResolvedValue(undefined);
});

it('does not expose the facilitator decision outside an active, authorized GM view', () => {
  render(<PursuitEmergencyWindowPanel active={false} window={windowState} />);
  expect(screen.queryByRole('region', { name: /pursuit emergency decision/i })).not.toBeInTheDocument();
  expect(advanceTurn).not.toHaveBeenCalled();
});

it('offers the source-authorized emergency to the at-risk groups or explicitly ends the run', async () => {
  const user = userEvent.setup();
  render(<PursuitEmergencyWindowPanel active window={windowState} />);

  expect(screen.getByRole('region', { name: /pursuit emergency decision/i }))
    .toHaveTextContent(/FLEET-1.*FLEET-3/i);
  expect(screen.getByText(/waiting for facilitator decision/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /offer emergency jump/i }));
  expect(advanceTurn).toHaveBeenCalledWith(expect.objectContaining({
    pursuitEmergencyDecision: 'offer', expectedPursuitNavigationRevision: 42,
  }));
});

it('requires a second confirmation before declining the emergency and ending the game', async () => {
  const user = userEvent.setup();
  render(<PursuitEmergencyWindowPanel active window={{ ...windowState, status: 'offered' }} />);

  await user.click(screen.getByRole('button', { name: /end pursuit-limit run/i }));
  expect(advanceTurn).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: /are you sure.*end game/i }));
  expect(advanceTurn).toHaveBeenCalledWith(expect.objectContaining({
    pursuitEmergencyDecision: 'decline', expectedPursuitNavigationRevision: 42,
  }));
});

it('retries the exact same decision request after an uncertain response', async () => {
  const user = userEvent.setup();
  vi.mocked(advanceTurn).mockRejectedValueOnce({ code: 'functions/unavailable' })
    .mockResolvedValueOnce(undefined);
  render(<PursuitEmergencyWindowPanel active window={windowState} />);

  await user.click(screen.getByRole('button', { name: /offer emergency jump/i }));
  expect(await screen.findByRole('status')).toHaveTextContent(/decision status unconfirmed/i);
  await user.click(screen.getByRole('button', { name: /retry exact emergency offer/i }));

  expect(advanceTurn).toHaveBeenCalledTimes(2);
  expect(vi.mocked(advanceTurn).mock.calls[0]?.[0]).toEqual(vi.mocked(advanceTurn).mock.calls[1]?.[0]);
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import type { FailedJumpSummary } from '@/lib/sessionService';
import JumpFailureAdjudicationPanel from './JumpFailureAdjudicationPanel';

const failure: FailedJumpSummary = {
  requestId: 'failed-jump-1', shipId: 'aegis', origin: '0000', destination: '5143',
  failureStatus: 'fuel-shortage', failureRevision: 4, currentTurn: 2, fuelAtFailure: 1,
  requiredFuel: 3,
};
const attempt = {
  sessionId: 's1', instanceId: 'bridge', requestId: 'adjudication-1', expectedRevision: 4,
  failureRequestId: failure.requestId, shipId: failure.shipId, destination: '5143',
};

vi.mock('@/lib/sessionService', () => ({
  listUnresolvedJumpFailures: vi.fn(),
  createFailedJumpAdjudicationAttempt: vi.fn(() => attempt),
  adjudicateFailedJump: vi.fn(),
  isFailedJumpOutcomeUncertain: vi.fn((cause: unknown) =>
    typeof cause === 'object' && cause !== null && 'uncertain' in cause),
}));

const {
  listUnresolvedJumpFailures,
  createFailedJumpAdjudicationAttempt,
  adjudicateFailedJump,
} = await import('@/lib/sessionService');

beforeEach(() => {
  vi.mocked(listUnresolvedJumpFailures).mockReset().mockResolvedValue({ failures: [failure] });
  vi.mocked(createFailedJumpAdjudicationAttempt).mockReset().mockReturnValue(attempt);
  vi.mocked(adjudicateFailedJump).mockReset().mockResolvedValue({
    status: 'jumped', shipId: 'aegis', origin: '0000', destination: '5143', fuelSpent: 1,
    failureRoll: 6, damageDraws: Array.from({ length: 6 }, (_, index) => ({
      card: `Damage ${index + 1}`, systemId: `system-${index + 1}`, systemName: `System ${index + 1}`,
      recycled: false,
    })),
  });
});

it('lets an active facilitator inspect an exact failure and complete it with a full d6 damage draw', async () => {
  const user = userEvent.setup();
  render(<JumpFailureAdjudicationPanel active />);

  await user.click(screen.getByRole('button', { name: /check failed jumps/i }));
  expect(await screen.findByText(/FUEL SHORTAGE/)).toBeInTheDocument();
  expect(screen.getByLabelText('Adjudication destination for AEGIS')).toHaveValue('5143');
  expect(screen.getByText(/1 fuel available; 3 required/i)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /complete failed jump for aegis/i }));

  expect(createFailedJumpAdjudicationAttempt).toHaveBeenCalledWith(failure, '5143');
  expect(adjudicateFailedJump).toHaveBeenCalledWith(attempt);
  expect(await screen.findByRole('status')).toHaveTextContent(/jump completed.*6 damage draws/i);
});

it('does not show a failed-jump list returned after facilitator authority changes', async () => {
  const user = userEvent.setup();
  vi.mocked(listUnresolvedJumpFailures).mockResolvedValue({ failures: [], stale: true });
  render(<JumpFailureAdjudicationPanel active />);

  await user.click(screen.getByRole('button', { name: /check failed jumps/i }));

  expect(await screen.findByRole('status')).toHaveTextContent(/facilitator session changed.*check failed jumps again/i);
  expect(screen.queryByText(/FUEL SHORTAGE/)).not.toBeInTheDocument();
});

it('keeps the exact adjudication request available after an uncertain reply', async () => {
  const user = userEvent.setup();
  vi.mocked(adjudicateFailedJump)
    .mockRejectedValueOnce({ uncertain: true })
    .mockResolvedValueOnce({ status: 'jumped', shipId: 'aegis', destination: '5143', damageDraws: [] });
  render(<JumpFailureAdjudicationPanel active />);
  await user.click(screen.getByRole('button', { name: /check failed jumps/i }));
  await screen.findByText(/FUEL SHORTAGE/);

  await user.click(screen.getByRole('button', { name: /complete failed jump for aegis/i }));
  expect(await screen.findByRole('status')).toHaveTextContent(/confirmation was lost/i);
  await user.click(screen.getByRole('button', { name: /retry exact adjudication for aegis/i }));

  await waitFor(() => expect(adjudicateFailedJump).toHaveBeenCalledTimes(2));
  expect(adjudicateFailedJump).toHaveBeenNthCalledWith(1, attempt);
  expect(adjudicateFailedJump).toHaveBeenNthCalledWith(2, attempt);
});

it('does not expose facilitator controls outside an active session', () => {
  render(<JumpFailureAdjudicationPanel active={false} />);
  expect(screen.queryByRole('region', { name: /failed jump adjudication/i })).not.toBeInTheDocument();
  expect(listUnresolvedJumpFailures).not.toHaveBeenCalled();
  expect(createFailedJumpAdjudicationAttempt).not.toHaveBeenCalled();
});

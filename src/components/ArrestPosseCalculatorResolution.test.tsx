import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import ArrestPosseCalculator from './ArrestPosseCalculator';

it('lets a facilitator record named attendance against the private current threshold', async () => {
  const onResolve = vi.fn().mockResolvedValue({
    status: 'committed', type: 'arrest-posse-outcome', sessionId: 's1', requestId: 'case-1',
    turn: 3, revision: 1, targetUid: 'target', requiredPlayers: 2, presentPlayers: 2,
    outcome: 'arrested', deadlineCycle: 4,
  });
  const user = userEvent.setup();
  render(<ArrestPosseCalculator
    targetOptions={[{ uid: 'target', label: 'Target' }]}
    presentPlayerOptions={[{ uid: 'u1', label: 'Alex' }, { uid: 'u2', label: 'Bea' }]}
    censusRevision={8} expectedRevision={1} expectedCycle={3}
    calculation={{ type: 'arrest-posse-calculation', sessionId: 's1', revision: 1,
      requestId: 'calc-1', targetUid: 'target', defenders: 0, requiredPlayers: 2, censusRevision: 8 }}
    calculationGeneration={0} caseOutcome={null}
    onCalculate={vi.fn()} onResolve={onResolve}
  />);

  const attendance = within(screen.getByRole('group', { name: 'Posse attendance' }));
  await user.click(attendance.getByLabelText('Alex'));
  await user.click(attendance.getByLabelText('Bea'));
  await user.click(screen.getByRole('button', { name: 'Resolve attendance' }));
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith('target', ['u1', 'u2'], 3, 1));
  expect(await screen.findByText('Arrested; resolve the prisoner by the end of Team Phase 4.')).toBeVisible();
});

it('shows a private not-arrested result without exposing suspicion', async () => {
  const user = userEvent.setup();
  const onResolve = vi.fn().mockResolvedValue({
    status: 'committed', type: 'arrest-posse-outcome', sessionId: 's1', requestId: 'case-2',
    turn: 3, revision: 1, targetUid: 'target', requiredPlayers: 2, presentPlayers: 1,
    outcome: 'not-arrested',
  });
  render(<ArrestPosseCalculator
    targetOptions={[{ uid: 'target', label: 'Target' }]}
    presentPlayerOptions={[{ uid: 'u1', label: 'Alex' }]}
    censusRevision={8} expectedRevision={1} expectedCycle={3}
    calculation={{ type: 'arrest-posse-calculation', sessionId: 's1', revision: 1,
      requestId: 'calc-1', targetUid: 'target', defenders: 0, requiredPlayers: 2, censusRevision: 8 }}
    calculationGeneration={0} caseOutcome={null}
    onCalculate={vi.fn()} onResolve={onResolve}
  />);
  await user.click(within(screen.getByRole('group', { name: 'Posse attendance' })).getByLabelText('Alex'));
  await user.click(screen.getByRole('button', { name: 'Resolve attendance' }));
  expect(await screen.findByText('Posse did not reach the required number.')).toBeVisible();
  expect(document.body.textContent).not.toMatch(/suspicion|loyalty|wolf-agent/i);
});

it('makes simulated demo attendance an explicit labeled choice distinct from real people', async () => {
  const onResolve = vi.fn().mockResolvedValue({
    status: 'committed', type: 'arrest-posse-outcome', sessionId: 's1', requestId: 'case-demo',
    turn: 3, revision: 1, targetUid: 'target', requiredPlayers: 2, presentPlayers: 1,
    outcome: 'not-arrested', attendanceEvidence: 'simulated-demo',
  });
  const user = userEvent.setup();
  render(<ArrestPosseCalculator
    targetOptions={[{ uid: 'target', label: 'Target' }]}
    presentPlayerOptions={[{ uid: 'u1', label: 'Virtual Alex' }]}
    censusRevision={8} expectedRevision={1} expectedCycle={3}
    calculation={{ type: 'arrest-posse-calculation', sessionId: 's1', revision: 1,
      requestId: 'calc-1', targetUid: 'target', defenders: 0, requiredPlayers: 2, censusRevision: 8 }}
    attendanceEvidence="simulated-demo" onCalculate={vi.fn()} onResolve={onResolve}
  />);
  expect(screen.getByText(/virtual crew.*does not record physical attendance/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Resolve attendance$/ })).not.toBeInTheDocument();
  await user.click(within(screen.getByRole('group', { name: 'Simulated posse attendance' })).getByLabelText('Virtual Alex'));
  await user.click(screen.getByRole('button', { name: /^Simulate attendance$/ }));
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith('target', ['u1'], 3, 1, 'simulated-demo'));
});

it('shows a newer authoritative case instead of retaining an older local attendance reply', async () => {
  const props = {
    targetOptions: [{ uid: 'target', label: 'Target' }],
    presentPlayerOptions: [{ uid: 'u1', label: 'Alex' }],
    censusRevision: 8, expectedRevision: 1, expectedCycle: 3,
    calculation: { type: 'arrest-posse-calculation' as const, sessionId: 's1', revision: 1,
      requestId: 'calc-1', targetUid: 'target', defenders: 0, requiredPlayers: 2, censusRevision: 8 },
    onCalculate: vi.fn(), onResolve: vi.fn().mockResolvedValue({
      status: 'committed', type: 'arrest-posse-outcome', sessionId: 's1', requestId: 'case-1',
      turn: 3, revision: 1, targetUid: 'target', requiredPlayers: 2, presentPlayers: 1, outcome: 'not-arrested',
    }),
  };
  const user = userEvent.setup();
  const view = render(<ArrestPosseCalculator {...props} />);
  await user.click(within(screen.getByRole('group', { name: 'Posse attendance' })).getByLabelText('Alex'));
  await user.click(screen.getByRole('button', { name: 'Resolve attendance' }));
  expect(await screen.findByText('Posse did not reach the required number.')).toBeVisible();
  view.rerender(<ArrestPosseCalculator {...props} caseOutcome={{
    status: 'committed', type: 'arrest-posse-outcome', sessionId: 's1', requestId: 'case-2',
    turn: 3, revision: 2, targetUid: 'target', requiredPlayers: 2, presentPlayers: 2,
    outcome: 'arrested', deadlineCycle: 4,
  }} />);
  expect(screen.getByText('Arrested; resolve the prisoner by the end of Team Phase 4.')).toBeVisible();
  expect(screen.queryByText('Posse did not reach the required number.')).not.toBeInTheDocument();
});

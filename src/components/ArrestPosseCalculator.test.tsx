import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import ArrestPosseCalculator from './ArrestPosseCalculator';
import type { ArrestCase, ArrestPosseCalculation } from '@/types/game';

const result: ArrestPosseCalculation = {
  type: 'arrest-posse-calculation', sessionId: 's1', revision: 1,
  requestId: 'arrest-1', targetUid: 'u2', defenders: 2, adjustment: 1,
  requiredPlayers: 8, censusRevision: 9,
};

it('submits only the selected target, defenders, optional adjustment and current projection revision', async () => {
  const user = userEvent.setup();
  const onCalculate = vi.fn().mockResolvedValue(result);
  render(
    <ArrestPosseCalculator
      targetOptions={[{ uid: 'u2', label: 'Rae (u2)' }]}
      censusRevision={9}
      expectedRevision={0}
      calculation={null}
      onCalculate={onCalculate}
    />,
  );

  fireEvent.change(screen.getByLabelText('Defenders'), { target: { value: '2' } });
  await user.selectOptions(screen.getByLabelText('Optional adjustment'), '1');
  await user.click(screen.getByRole('button', { name: 'Calculate required players' }));

  await waitFor(() => expect(onCalculate).toHaveBeenCalledWith('u2', 2, 1, 0));
  expect(await screen.findByRole('status')).toHaveTextContent('8 players needed');
  expect(screen.queryByText(/suspicion/i)).not.toBeInTheDocument();
  expect(screen.queryByText('14')).not.toBeInTheDocument();
});

it('hides an old count when the input or authoritative census revision changes', async () => {
  const user = userEvent.setup();
  const onCalculate = vi.fn();
  const { rerender } = render(
    <ArrestPosseCalculator
      targetOptions={[{ uid: 'u2', label: 'Rae (u2)' }]}
      censusRevision={9}
      expectedRevision={1}
      calculation={result}
      onCalculate={onCalculate}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('8 players needed');

  fireEvent.change(screen.getByLabelText('Defenders'), { target: { value: '3' } });
  expect(screen.queryByText('8 players needed')).not.toBeInTheDocument();
  expect(screen.getByText(/inputs changed/i)).toBeInTheDocument();

  rerender(
    <ArrestPosseCalculator
      targetOptions={[{ uid: 'u2', label: 'Rae (u2)' }]}
      censusRevision={10}
      expectedRevision={2}
      calculation={result}
      onCalculate={onCalculate}
    />,
  );
  expect(screen.queryByText('8 players needed')).not.toBeInTheDocument();
  expect(screen.getByText(/census changed/i)).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Optional adjustment'), '-1');
  expect(onCalculate).not.toHaveBeenCalled();
});

it('hides a successful local reply when the live projection is invalidated', async () => {
  const user = userEvent.setup();
  const onCalculate = vi.fn().mockResolvedValue(result);
  const props = {
    targetOptions: [{ uid: 'u2', label: 'Rae (u2)' }],
    censusRevision: 9,
    expectedRevision: 0,
    calculation: null,
    onCalculate,
  };
  const { rerender } = render(<ArrestPosseCalculator {...props} calculationGeneration={0} />);

  fireEvent.change(screen.getByLabelText('Defenders'), { target: { value: '2' } });
  await user.selectOptions(screen.getByLabelText('Optional adjustment'), '1');
  await user.click(screen.getByRole('button', { name: 'Calculate required players' }));
  expect(await screen.findByRole('status')).toHaveTextContent('8 players needed');

  rerender(<ArrestPosseCalculator {...props} calculationGeneration={1} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('fails closed when no target is available or the defender input is not a non-negative integer', () => {
  render(
    <ArrestPosseCalculator
      targetOptions={[]}
      censusRevision={9}
      expectedRevision={0}
      calculation={null}
      onCalculate={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Calculate required players' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(/no eligible target/i);
});

it('hides a stored count as soon as its target leaves the current selectable census', () => {
  const { rerender } = render(
    <ArrestPosseCalculator
      targetOptions={[{ uid: 'u2', label: 'Rae (u2)' }]}
      censusRevision={9}
      expectedRevision={1}
      calculation={result}
      onCalculate={vi.fn()}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('8 players needed');

  rerender(
    <ArrestPosseCalculator
      targetOptions={[]}
      censusRevision={9}
      expectedRevision={1}
      calculation={result}
      onCalculate={vi.fn()}
    />,
  );

  expect(screen.queryByText('8 players needed')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(/no eligible target/i);
});

const pendingCase: ArrestCase = {
  type: 'arrest-case', sessionId: 's1', targetUid: 'u2', status: 'pending-resolution',
  outcome: 'arrested', turn: 3, revision: 1, requiredPlayers: 5, presentPlayers: 5,
  deadlineCycle: 4, requestId: 'arrest-1',
};

it('blocks ordinary disposition after the next Team deadline and requires a reasoned facilitator resolution', async () => {
  const user = userEvent.setup();
  const onDisposition = vi.fn().mockResolvedValue({ status: 'committed' });
  const props = {
    targetOptions: [{ uid: 'u2', label: 'Rae (u2)' }],
    censusRevision: 9,
    expectedRevision: 1,
    calculation: result,
    caseRecord: pendingCase,
    currentCycle: 4,
    deadlineTeamPhaseOpen: false,
    onCalculate: vi.fn(),
    onDisposition,
  };
  render(<ArrestPosseCalculator {...props} />);
  expect(screen.getByRole('heading', { name: /prisoner ruling.*Team Phase 4/i })).toBeInTheDocument();
  expect(screen.getByText('The Team Phase ruling window is closed. Record a reasoned facilitator resolution.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Release prisoner' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Execute prisoner' })).not.toBeInTheDocument();
  const resolve = screen.getByRole('button', { name: 'Record facilitator resolution' });
  expect(resolve).toBeDisabled();
  await user.type(screen.getByLabelText('Facilitator ruling'), 'The table agrees on a final ruling.');
  await user.click(resolve);
  await waitFor(() => expect(onDisposition).toHaveBeenCalledWith(
    'u2', 'facilitator-resolution', 4, 1, 'The table agrees on a final ruling.',
  ));
});

it('offers ordinary release or execution during the next Team Phase', async () => {
  const user = userEvent.setup();
  const onDisposition = vi.fn().mockResolvedValue({ status: 'committed' });
  render(<ArrestPosseCalculator
    targetOptions={[{ uid: 'u2', label: 'Rae (u2)' }]}
    censusRevision={9}
    expectedRevision={1}
    calculation={result}
    caseRecord={pendingCase}
    currentCycle={4}
    deadlineTeamPhaseOpen
    onCalculate={vi.fn()}
    onDisposition={onDisposition}
  />);

  expect(screen.getByText(/release or execute by the end of team phase 4/i)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Execute prisoner' }));
  await waitFor(() => expect(onDisposition).toHaveBeenCalledWith('u2', 'executed', 4, 1, undefined));
});

it('offers same-cycle release or execution in the current Team Phase and confirms the saved case', async () => {
  const user = userEvent.setup();
  const onDisposition = vi.fn().mockResolvedValue({
    status: 'committed', type: 'arrest-case-disposition', sessionId: 's1', requestId: 'same-cycle-release',
    targetUid: 'u2', turn: 3, revision: 2, deadlineCycle: 4, deadlineMet: true,
    disposition: 'released', setupRevision: 2,
  });
  render(<ArrestPosseCalculator
    targetOptions={[{ uid: 'u2', label: 'Rae (u2)' }]}
    censusRevision={9}
    expectedRevision={1}
    calculation={result}
    caseRecord={pendingCase}
    currentCycle={3}
    deadlineTeamPhaseOpen
    onCalculate={vi.fn()}
    onDisposition={onDisposition}
  />);

  expect(screen.getByText(/release or execute now during team phase 3, or by the end of team phase 4/i)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Release prisoner' }));
  await waitFor(() => expect(onDisposition).toHaveBeenCalledWith('u2', 'released', 3, 1, undefined));
  expect(await screen.findByText('Prisoner case recorded // released.')).toBeVisible();
});

it('keeps ordinary ruling actions available during same-cycle Coordination before the next-Team deadline', async () => {
  const user = userEvent.setup();
  const onDisposition = vi.fn().mockResolvedValue({ status: 'committed' });
  render(<ArrestPosseCalculator
    targetOptions={[{ uid: 'u2', label: 'Rae (u2)' }]}
    censusRevision={9}
    expectedRevision={1}
    calculation={result}
    caseRecord={pendingCase}
    currentCycle={3}
    deadlineTeamPhaseOpen={false}
    onCalculate={vi.fn()}
    onDisposition={onDisposition}
  />);

  expect(screen.getByRole('button', { name: 'Release prisoner' })).toBeVisible();
  expect(screen.getByText(/before the end of team phase 4/i)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Release prisoner' }));
  await waitFor(() => expect(onDisposition).toHaveBeenCalledWith('u2', 'released', 3, 1, undefined));
});

it('shows a recovered terminal case without retaining the pending deadline notice', () => {
  const releasedCase: ArrestCase = { ...pendingCase, status: 'released', revision: 2 };
  render(<ArrestPosseCalculator
    targetOptions={[{ uid: 'u2', label: 'Rae (u2)' }]}
    censusRevision={9}
    expectedRevision={1}
    calculation={result}
    caseRecord={releasedCase}
    caseOutcome={{
      status: 'committed', type: 'arrest-posse-outcome', sessionId: 's1', requestId: 'released-1',
      turn: 3, revision: 2, targetUid: 'u2', requiredPlayers: 5, presentPlayers: 5,
      outcome: 'arrested', deadlineCycle: 4,
    }}
    currentCycle={4}
    deadlineTeamPhaseOpen
    onCalculate={vi.fn()}
  />);

  expect(screen.getByText('Prisoner case recorded // released.')).toBeVisible();
  expect(screen.queryByText('Arrested; resolve the prisoner by the end of Team Phase 4.')).not.toBeInTheDocument();
});

it('requires a reason for facilitator resolution after the deadline', async () => {
  const user = userEvent.setup();
  const onDisposition = vi.fn().mockResolvedValue({ status: 'committed' });
  render(<ArrestPosseCalculator
    targetOptions={[{ uid: 'u2', label: 'Rae (u2)' }]}
    censusRevision={9}
    expectedRevision={1}
    calculation={result}
    caseRecord={pendingCase}
    currentCycle={5}
    deadlineTeamPhaseOpen={false}
    onCalculate={vi.fn()}
    onDisposition={onDisposition}
  />);
  const resolve = screen.getByRole('button', { name: 'Record facilitator resolution' });
  expect(resolve).toBeDisabled();
  await user.type(screen.getByLabelText('Facilitator ruling'), 'The table confirms the missed deadline.');
  expect(resolve).toBeEnabled();
  await user.click(resolve);
  await waitFor(() => expect(onDisposition).toHaveBeenCalledWith(
    'u2', 'facilitator-resolution', 5, 1, 'The table confirms the missed deadline.',
  ));
});

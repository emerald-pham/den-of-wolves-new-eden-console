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

it('offers release or execution only during the next Team Phase and binds the ruling to the case revision', async () => {
  const user = userEvent.setup();
  const onDisposition = vi.fn().mockResolvedValue({ status: 'committed' });
  const props = {
    targetOptions: [{ uid: 'u2', label: 'Rae (u2)' }],
    censusRevision: 9,
    expectedRevision: 1,
    calculation: result,
    caseRecord: pendingCase,
    currentCycle: 3,
    deadlineTeamPhaseOpen: false,
    onCalculate: vi.fn(),
    onDisposition,
  };
  const { rerender } = render(<ArrestPosseCalculator {...props} />);
  expect(screen.getByRole('heading', { name: /prisoner ruling.*Team Phase 4/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Execute prisoner' })).not.toBeInTheDocument();

  rerender(<ArrestPosseCalculator {...props} currentCycle={4} deadlineTeamPhaseOpen />);
  await user.click(screen.getByRole('button', { name: 'Execute prisoner' }));
  await waitFor(() => expect(onDisposition).toHaveBeenCalledWith('u2', 'executed', 4, 1, undefined));
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

import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresidentialElectionWorkspaceView } from './PresidentialElectionWorkspace';
import type { PresidentialElectionProjection } from '@/types/presidentialElection';

const projection: PresidentialElectionProjection = {
  type: 'presidential-election', revision: 2, state: 'open',
  policy: { votingSystem: 'plurality', populationWeighting: 'equal', openCycle: 2, closeCycle: 2,
    vicePresidentEnabled: true, campaigning: 'prohibited', supplyUse: 'prohibited',
    campaignInstructions: 'No supplies.', tieRule: 'facilitator-choice' },
  candidates: [
    { id: 'candidate-president', displayName: 'President candidate' },
    { id: 'candidate-other', displayName: 'Other candidate' },
  ],
};

it('shows a current GM the no-write vacancy explanation and requires a second explicit acknowledgement', async () => {
  const onResolveElection = vi.fn()
    .mockRejectedValueOnce(Object.assign(new Error('A GM decision is required.'), { details: {
      resolutionRequired: 'vice-president-vacancy',
      explanation: 'The same candidate uniquely leads both ballots, and no other eligible candidate received a VP vote. No offices have changed. A current GM must explicitly record the VP office vacant.',
    } }))
    .mockResolvedValueOnce(undefined);
  render(<PresidentialElectionWorkspaceView projection={projection} live currentUserUid="gm" isFacilitator
    currentCycle={2} ballotSubmitted={false} onConfigurePolicy={vi.fn()} onCastBallot={vi.fn()}
    onResolveElection={onResolveElection} />);

  fireEvent.click(screen.getByRole('button', { name: 'Calculate and resolve election' }));
  expect(await screen.findByText(/no other eligible candidate received a VP vote/i)).toBeVisible();
  expect(screen.getByText(/No offices have changed/i)).toBeVisible();
  const confirm = screen.getByRole('button', { name: 'Confirm Vice President office vacant' });
  expect(confirm).toBeEnabled();

  fireEvent.click(confirm);
  await waitFor(() => expect(onResolveElection).toHaveBeenLastCalledWith({ confirmVicePresidentVacancy: true }));
});

it('does not expose the vacancy confirmation action to a non-facilitator', () => {
  render(<PresidentialElectionWorkspaceView projection={projection} live currentUserUid="member" isFacilitator={false}
    currentCycle={2} ballotSubmitted={false} onConfigurePolicy={vi.fn()} onCastBallot={vi.fn()}
    onResolveElection={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Calculate and resolve election' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Confirm Vice President office vacant' })).toBeNull();
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { PresidentWorkspaceView } from './PresidentWorkspace';
import type { GameSession } from '@/types/game';

const session = {
  id: 's1', name: 'Session', joinCode: '123456', phase: 'active', ownerUid: 'u1',
  createdAt: '', updatedAt: '', currentTurn: 2,
  presidentWorkspace: { revision: 0, entries: [] },
  politicalCapital: { revision: 1, balance: 2, entries: [] },
  resolvedCrisisOutcome: { crisisId: 'c1', revision: 1, title: 'Settlement' },
  activeVesselIds: ['dione', 'shepherd'], shipUnrest: { dione: 0, shepherd: 3 },
  turnPhase: { turn: 2, teamPhaseEndsAt: '', openAirspaceEndsAt: '',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
  turnState: { currentTurn: 2, maxTurn: 6, phase: 'team', phaseRevision: 3, startedAt: '', endsAt: '' },
} as unknown as GameSession;

it('renders the real President workspace from props and calls injected actions', async () => {
  const user = userEvent.setup();
  const onRecordPresidentAction = vi.fn().mockResolvedValue(undefined);
  const onChangePoliticalCapital = vi.fn().mockResolvedValue(undefined);
  const onPresidentialVisit = vi.fn().mockResolvedValue(undefined);
  const { rerender } = render(<PresidentWorkspaceView session={session} live
    onRecordPresidentAction={onRecordPresidentAction}
    onChangePoliticalCapital={onChangePoliticalCapital}
    onPresidentialVisit={onPresidentialVisit} />);

  await user.selectOptions(screen.getByLabelText('Action family'), 'address');
  await user.type(screen.getByLabelText('Decision record'), 'Fleet priorities and needs.');
  await user.click(screen.getByRole('button', { name: 'Record presidential address' }));
  await waitFor(() => expect(onRecordPresidentAction).toHaveBeenCalledWith('address', 'Fleet priorities and needs.'));

  const coordinationSession = {
    ...session,
    turnPhase: { ...session.turnPhase!, airspace: { ...session.turnPhase!.airspace, state: 'lifted' } },
    turnState: { ...session.turnState!, phase: 'coordination' },
  } as GameSession;
  rerender(<PresidentWorkspaceView session={coordinationSession} live
    onRecordPresidentAction={onRecordPresidentAction}
    onChangePoliticalCapital={onChangePoliticalCapital}
    onPresidentialVisit={onPresidentialVisit} />);
  const visit = screen.getByRole('region', { name: 'Presidential visit' });
  await user.click(within(visit).getByRole('button', { name: 'Spend 1 and reduce unrest' }));
  await waitFor(() => expect(onPresidentialVisit).toHaveBeenCalledWith('shepherd'));
  await user.click(screen.getByRole('button', { name: 'Claim 1 legacy award' }));
  await waitFor(() => expect(onChangePoliticalCapital).toHaveBeenCalledWith('gain'));
});

it('does not offer a manual gain after the source award has been applied automatically', () => {
  const awardedSession = {
    ...session,
    resolvedCrisisOutcome: { crisisId: 'c1', revision: 2, title: 'Settlement', capitalApplied: true, capitalDelta: 1 },
  } as unknown as GameSession;
  render(<PresidentWorkspaceView session={awardedSession} live
    onRecordPresidentAction={vi.fn().mockResolvedValue(undefined)}
    onChangePoliticalCapital={vi.fn().mockResolvedValue(undefined)}
    onPresidentialVisit={vi.fn().mockResolvedValue(undefined)} />);
  expect(screen.queryByRole('button', { name: 'Claim 1 legacy award' })).not.toBeInTheDocument();
});

it('explains when the resolved-crisis capital award was handled at the ledger cap', () => {
  const cappedCrisisSession = {
    ...session,
    politicalCapital: { revision: 8, balance: 8, entries: [] },
    resolvedCrisisOutcome: { crisisId: 'c1', revision: 2, title: 'Settlement', capitalApplied: false, capitalDelta: 0 },
  } as unknown as GameSession;
  render(<PresidentWorkspaceView session={cappedCrisisSession} live
    onRecordPresidentAction={vi.fn().mockResolvedValue(undefined)}
    onChangePoliticalCapital={vi.fn().mockResolvedValue(undefined)}
    onPresidentialVisit={vi.fn().mockResolvedValue(undefined)} />);
  expect(screen.getByText(/capital award was recorded but not added because the ledger is at its maximum/i)).toBeVisible();
});

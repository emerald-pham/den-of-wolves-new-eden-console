import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import CandidateRevealPanel from './CandidateRevealPanel';

const session = {
  id: 'session-1', phase: 'active' as const,
  currentGroupCandidateReveals: {
    groupId: 'fleet-1', candidateReveals: [{ code: 'O' as const, title: 'Deep Nebula' }], revision: 1,
  },
};
const player = { uid: 'player-1', sessionId: 'session-1', displayName: 'Player', role: 'player' as const,
  joinedAt: new Date().toISOString(), fleetGroupId: 'fleet-1' };

it('shows only candidate code and title for the fresh current group', () => {
  render(<CandidateRevealPanel session={session} player={player} sessionSnapshotFreshness="server" />);

  const panel = screen.getByRole('region', { name: 'Candidate discoveries' });
  expect(within(panel).getByText('O')).toBeInTheDocument();
  expect(within(panel).getByText('Deep Nebula')).toBeInTheDocument();
  expect(panel).not.toHaveTextContent(/coordinate|bonus|summary|organiser chart/i);
});

it('renders no empty candidate section', () => {
  const { container } = render(<CandidateRevealPanel
    session={{ ...session, currentGroupCandidateReveals: { ...session.currentGroupCandidateReveals, candidateReveals: [] } }}
    player={player}
    sessionSnapshotFreshness="server"
  />);
  expect(container).toBeEmptyDOMElement();
});

it.each([
  ['cached session', session, player, 'cache', false],
  ['wrong group', { ...session, currentGroupCandidateReveals: { ...session.currentGroupCandidateReveals, groupId: 'fleet-2' } }, player, 'server', false],
  ['non-player', session, { ...player, role: 'gm' as const }, 'server', false],
  ['observer', session, player, 'server', true],
] as const)('hides the projection for %s', (_label, nextSession, nextPlayer, freshness, observer) => {
  const { container } = render(<CandidateRevealPanel
    session={nextSession}
    player={nextPlayer}
    sessionSnapshotFreshness={freshness}
    observer={observer}
  />);
  expect(container).toBeEmptyDOMElement();
});

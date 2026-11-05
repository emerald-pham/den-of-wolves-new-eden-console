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

// A session with no current-group reveals: the key is absent, as the server omits it.
const cycleSix = { id: session.id, phase: session.phase, currentTurn: 6 };

it.each([5, 7])('keeps the Cycle 6 plan prompt out of cycle %i while discoveries keep their help', (currentTurn) => {
  render(<CandidateRevealPanel session={{ ...session, currentTurn }} player={player} sessionSnapshotFreshness="server" />);

  expect(screen.queryByRole('region', { name: 'Cycle 6 plan encouragement' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Candidate preparation requirements' })).toBeVisible();
});

it.each([
  ['cached session', cycleSix, player, 'cache', false],
  ['lobby phase', { ...cycleSix, phase: 'lobby' as const }, player, 'server', false],
  ['facilitator', cycleSix, { ...player, role: 'gm' as const }, 'server', false],
  ['player without a fleet group', cycleSix, { ...player, fleetGroupId: null }, 'server', false],
  ['GM observer', cycleSix, player, 'server', true],
] as const)('hides the Cycle 6 plan prompt for %s', (_label, nextSession, nextPlayer, freshness, observer) => {
  const { container } = render(<CandidateRevealPanel
    session={nextSession} player={nextPlayer} sessionSnapshotFreshness={freshness} observer={observer}
  />);
  expect(container).toBeEmptyDOMElement();
});

it('keeps preparation help to the three printed requirements without hidden bonuses, locations, or Wolf facts', () => {
  render(<CandidateRevealPanel
    session={{
      ...session, currentTurn: 6,
      currentGroupCandidateReveals: {
        groupId: 'fleet-1', revision: 2,
        candidateReveals: [
          { code: 'N', title: 'Ancient Jump Ring' },
          { code: 'O', title: 'Deep Nebula' },
          { code: 'P', title: 'Ancient Space Station' },
        ],
      },
    }}
    player={player}
    sessionSnapshotFreshness="server"
  />);

  const help = screen.getByRole('region', { name: 'Candidate preparation requirements' });
  expect(within(help).getAllByRole('listitem')).toHaveLength(3);
  expect(help).not.toHaveTextContent(/\b\d{4}\b|accrued|lost ship|bonus is|Wolf (count|location|agent)|chart [ABC]/i);
});

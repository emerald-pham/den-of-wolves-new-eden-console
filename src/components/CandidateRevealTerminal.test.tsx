import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import CandidateRevealPanel from './CandidateRevealPanel';
vi.mock('./CandidatePreparationPanel', () => ({ default: () => <section aria-label="Candidate original result recovery" /> }));
it.each(['debrief', 'closed'] as const)('keeps authenticated original-result recovery reachable in %s', phase => {
  render(<CandidateRevealPanel session={{ phase }} player={{ role: 'player', fleetGroupId: 'fleet-1' }}
    sessionSnapshotFreshness="server" />);
  expect(screen.getByRole('region', { name: 'Candidate original result recovery' })).toBeInTheDocument();
});
it('keeps cached terminal identity and observer reads hidden', () => {
  const { container } = render(<CandidateRevealPanel session={{ phase: 'debrief' }}
    player={{ role: 'player', fleetGroupId: 'fleet-1' }} sessionSnapshotFreshness="cache" />);
  expect(container).toBeEmptyDOMElement();
});

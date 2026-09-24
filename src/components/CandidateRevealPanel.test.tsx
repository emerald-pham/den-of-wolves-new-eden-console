import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import CandidateRevealPanel from './CandidateRevealPanel';

it('shows only candidate code and title for the current group', () => {
  render(<CandidateRevealPanel candidateReveals={[{ code: 'O', title: 'Deep Nebula' }]} />);

  const panel = screen.getByRole('region', { name: 'Candidate discoveries' });
  expect(within(panel).getByText('O')).toBeInTheDocument();
  expect(within(panel).getByText('Deep Nebula')).toBeInTheDocument();
  expect(panel).not.toHaveTextContent(/coordinate|bonus|summary|organiser chart/i);
});

it('renders no empty candidate section', () => {
  const { container } = render(<CandidateRevealPanel candidateReveals={[]} />);
  expect(container).toBeEmptyDOMElement();
});

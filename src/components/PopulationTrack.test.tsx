import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import PopulationTrack from './PopulationTrack';

it.each([
  ['dione', 100000], ['icebreaker', 40000], ['shepherd', 30000],
  ['quellon', 30000], ['refinery-124', 20000],
] as const)('shows the %s census even when the complete printed track is missing', (shipId, population) => {
  const { rerender } = render(<PopulationTrack shipId={shipId} population={population} />);
  expect(screen.getByText(population.toLocaleString('en-US'))).toBeVisible();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  rerender(<PopulationTrack shipId={shipId} population={population - 500} />);
  expect(screen.getByText((population - 500).toLocaleString('en-US'))).toBeVisible();
});

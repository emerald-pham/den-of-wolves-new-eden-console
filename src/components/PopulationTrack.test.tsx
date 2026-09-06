import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import PopulationTrack from './PopulationTrack';

it.each([
  ['dione', 100000], ['icebreaker', 40000], ['shepherd', 30000],
  ['quellon', 30000], ['refinery-124', 20000],
] as const)('shows the %s census with the complete printed track', (shipId, population) => {
  const { rerender } = render(<PopulationTrack shipId={shipId} population={population} />);
  expect(screen.getAllByText(population.toLocaleString('en-US'))[0]).toBeVisible();
  expect(screen.getByRole('list', { name: 'Survivor Population steps' })).toBeVisible();
  rerender(<PopulationTrack shipId={shipId} population={population - 500} />);
  expect(screen.getByText((population - 500).toLocaleString('en-US'))).toBeVisible();
});

import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import PursuitTracker from './PursuitTracker';

it('tracks only the current ship and reads pursuit depth from the galactic map', () => {
  render(
    <PursuitTracker
      currentTurn={4}
      shipId="shepherd"
      shipName="Shepherd"
      shipCoordinate="8378"
    />,
  );

  const tracker = screen.getByRole('region', { name: 'Pursuit tracker' });
  expect(tracker).not.toHaveTextContent('Relative to Shepherd // 8378');
  expect(tracker).toHaveTextContent('Current track // 2 / 10');
  expect(tracker).toHaveTextContent('Distance from Home Systems // -6 pursuit distance');
  expect(tracker).not.toHaveTextContent('Map depth //');
  expect(tracker).not.toHaveTextContent('Map depth is shared; position is ship-local.');
  expect(tracker).not.toHaveTextContent('Dione');
});

it('rebases the score when a split ship has a different position', () => {
  const { rerender } = render(
    <PursuitTracker
      currentTurn={4}
      shipId="dione"
      shipName="Dione"
      shipCoordinate="5143"
    />,
  );

  expect(screen.getByRole('region', { name: 'Pursuit tracker' })).toHaveTextContent('Current track // 7 / 10');

  rerender(
    <PursuitTracker
      currentTurn={4}
      shipId="shepherd"
      shipName="Shepherd"
      shipCoordinate="8378"
    />,
  );

  expect(screen.getByRole('region', { name: 'Pursuit tracker' })).toHaveTextContent('Current track // 2 / 10');
});

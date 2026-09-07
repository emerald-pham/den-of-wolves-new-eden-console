import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import ShipNavigationMap from './ShipNavigationMap';

it('shows only the ship fix and the coordinates it has visited', () => {
  render(
    <ShipNavigationMap
      shipId="aegis"
      shipName="AEGIS"
      currentCoordinate="5143"
      visitedCoordinates={['0000']}
    />,
  );

  const map = screen.getByRole('region', { name: 'Ship navigation map' });
  expect(map).toHaveTextContent(/current ship.*5143/i);
  expect(map).toHaveTextContent(/places you have come from.*0000/i);
  expect(map).toHaveTextContent(/22 systems.*40 jump links/i);
  expect(map.querySelector('[data-current-ship="true"]')).toBeTruthy();
  expect(map.querySelector('[data-visited-coordinate="0000"]')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Chart A' })).not.toBeInTheDocument();
  expect(map).not.toHaveTextContent(/lichen-covered asteroids/i);
});

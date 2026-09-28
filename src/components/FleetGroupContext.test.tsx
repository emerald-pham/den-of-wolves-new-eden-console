import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import FleetGroupContext from './FleetGroupContext';

it('labels the current group, location, roster, pursuit, and communication boundary', () => {
  render(<FleetGroupContext
    groupId="fleet-2"
    currentCoordinate="6798"
    vesselIds={['dione', 'shepherd']}
    pursuitValue={7}
  />);

  const context = screen.getByRole('region', { name: 'Current fleet group and location' });
  expect(context).toHaveAttribute('data-fleet-group-id', 'fleet-2');
  expect(context).toHaveTextContent('FLEET-2');
  expect(context).toHaveTextContent('6798');
  expect(context).toHaveTextContent('DIONE');
  expect(context).toHaveTextContent('SHEPHERD');
  expect(context).toHaveTextContent('7 / 10');
  expect(context).toHaveTextContent('This fleet group only');
  expect(context).toHaveTextContent('Current group and entitled ship only');
});

it('fails closed when group roster or pursuit is not projected', () => {
  render(<FleetGroupContext groupId="fleet-1" currentCoordinate="5143" />);

  const context = screen.getByRole('region', { name: 'Current fleet group and location' });
  expect(context).toHaveTextContent('Roster unavailable');
  expect(context).toHaveTextContent('Pursuit unavailable');
  expect(context).not.toHaveTextContent('AEGIS');
});

it('does not turn unknown vessel identifiers into invented ship names', () => {
  render(<FleetGroupContext
    groupId="fleet-3"
    currentCoordinate="4454"
    vesselIds={['aegis', 'unknown-vessel']}
    pursuitValue={4}
  />);

  const context = screen.getByRole('region', { name: 'Current fleet group and location' });
  expect(context).toHaveTextContent('AEGIS');
  expect(context).toHaveTextContent('UNKNOWN-VESSEL');
});

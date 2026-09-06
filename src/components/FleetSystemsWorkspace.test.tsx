import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import FleetSystemsWorkspace from './FleetSystemsWorkspace';
import FleetConsoleWorkspace from './FleetConsoleWorkspace';
import { SHIPS } from '@/data/ships';

describe('fleet system reference workspaces', () => {
  it.each(SHIPS.flatMap(ship => ship.roles.map(role => ({ ship, role }))))(
    'gives $role.id real reference pages without gameplay mutations', async ({ ship, role }) => {
      render(<FleetConsoleWorkspace ship={ship} role={role} fuel={7} galacticCoordinate="0102" />);
      expect(screen.queryByText('Scaffold ready')).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: `${ship.name} ${role.name} console` })).toBeInTheDocument();
      if (role.id === 'admiral') {
        expect(screen.getByRole('heading', { name: 'Maintenance cycle' })).toBeVisible();
        return;
      }
      const pages = screen.getAllByRole('button');
      expect(pages.length).toBeGreaterThanOrEqual(2);
      await userEvent.click(pages[1]!);
      expect(pages[1]).toHaveAttribute('aria-pressed', 'true');
      await userEvent.click(pages[0]!);
      expect(pages[0]).toHaveAttribute('aria-pressed', 'true');
    },
  );
  it('shows the expansion production rules for the recycler', () => {
    const ship = SHIPS.find(s => s.id === 'capybara')!;
    render(<FleetConsoleWorkspace ship={ship} role={ship.roles[1]} fuel={3} galacticCoordinate="0101" />);
    expect(screen.getByRole('heading', { name: 'Scrap Refinery' })).toBeInTheDocument();
    expect(screen.getByText(/1 scrap → 3 materials/)).toBeInTheDocument();
    expect(screen.queryByText(/Macaw|Boa/)).not.toBeInTheDocument();
  });
});

it.each(SHIPS.filter(ship => ship.maintenance))('shows $name systems and maintenance together', async (ship) => {
  const role = ship.roles[0];
  if (!role) throw new Error('Expected a ship role');
  render(<FleetSystemsWorkspace ship={ship} role={role} fuel={3} galacticCoordinate="0000" />);
  expect(screen.getByRole('heading', { name: 'Maintenance cycle' })).toBeVisible();
  expect(screen.getByRole('list', { name: `${ship.name} maintenance sequence` })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Storage' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Role procedures' }));
  await userEvent.click(screen.getByRole('button', { name: 'Ship systems' }));
  expect(screen.getByRole('heading', { name: 'Maintenance cycle' })).toBeVisible();
});

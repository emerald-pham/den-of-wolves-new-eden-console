import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import FleetSystemsWorkspace from './FleetSystemsWorkspace';
import FleetConsoleWorkspace from './FleetConsoleWorkspace';
import { SHIPS } from '@/data/ships';

describe('fleet system reference workspaces', () => {
  it.each(SHIPS.flatMap(ship => ship.roles.map(role => ({ ship, role }))))(
    'gives $role.id real references without gameplay mutations', async ({ ship, role }) => {
      render(<FleetConsoleWorkspace ship={ship} role={role} fuel={7} galacticCoordinate="0102" />);
      expect(screen.queryByText('Scaffold ready')).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: `${ship.name} ${role.name} console` })).toBeInTheDocument();
      if (role.id === 'admiral') {
        expect(screen.getByRole('heading', { name: 'Maintenance cycle' })).toBeVisible();
        return;
      }
      if (role.id === 'wing-commander') {
        const pages = screen.getAllByRole('button');
        expect(pages.length).toBeGreaterThanOrEqual(2);
        await userEvent.click(pages[1]!);
        expect(pages[1]).toHaveAttribute('aria-pressed', 'true');
        return;
      }
      expect(screen.getByRole('heading', { name: 'Role procedures' })).toBeVisible();
    },
  );
  it('shows the expansion production rules for the recycler', () => {
    const ship = SHIPS.find(s => s.id === 'capybara')!;
    render(<FleetConsoleWorkspace ship={ship} role={ship.roles[1]} fuel={3} galacticCoordinate="0101" />);
    expect(screen.getByRole('heading', { name: 'Scrap Refinery' })).toBeInTheDocument();
    expect(screen.getByText(/1 scrap → 3 materials/)).toBeInTheDocument();
    expect(screen.queryByText(/Macaw|Boa/)).not.toBeInTheDocument();
  });

  it.each(SHIPS.flatMap(ship => ship.roles.map(role => ({ ship, role }))))(
    'keeps $ship.name $role.name aligned with the AEGIS Admiral command presentation',
    ({ ship, role }) => {
      render(<FleetConsoleWorkspace ship={ship} role={role} fuel={7} galacticCoordinate="0102" />);

      const workspace = screen.getByRole('region', {
        name: `${ship.name} ${role.name} console`,
      });
      expect(workspace).toHaveTextContent(`${ship.name} command console // ${role.name}`);
      expect(workspace).toHaveTextContent(/galactic coordinates.*0102/i);
      expect(workspace).toHaveTextContent(/fuel in stores.*7/i);
      expect(workspace).toHaveTextContent(/reactor capacity.*consoles/i);
      expect(workspace).toHaveTextContent(/damage state.*0 systems/i);
      expect(workspace).toHaveTextContent(/jump requirement.*short.*medium.*long/i);
      expect(workspace).toHaveTextContent(
        /console reference.*charges, upgrades and procedure outcomes are tracked at the table.*damage state synchronized/i,
      );
      if (role.id !== 'admiral' && role.id !== 'wing-commander') {
        expect(screen.queryByRole('navigation', {
          name: `${ship.name} ${role.name} console pages`,
        })).not.toBeInTheDocument();
      }
    },
  );
});

it.each(SHIPS.filter(ship => ship.maintenance))('shows $name systems and maintenance together', (ship) => {
  const role = ship.roles[0];
  if (!role) throw new Error('Expected a ship role');
  render(<FleetSystemsWorkspace ship={ship} role={role} fuel={3} galacticCoordinate="0000" />);
  expect(screen.getByRole('heading', { name: 'Maintenance cycle' })).toBeVisible();
  expect(screen.getByRole('list', { name: `${ship.name} maintenance sequence` })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Storage' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Role procedures' })).toBeVisible();
});

it.each(SHIPS.filter(ship => ship.maintenance))('reads out the normal jump-drive failure roll for $name', (ship) => {
  render(<FleetSystemsWorkspace ship={ship} role={ship.roles[0]!} fuel={3} galacticCoordinate="0000" />);

  const jump = within(screen.getByRole('article', { name: 'Jump Drive system // operational' }));
  const baseline = jump.getByText(/charged:|coordination phase|short \/\//i, { selector: 'p' });
  const normalFailure = jump.getByText('A jump fails on a roll of 1–2.', { selector: 'p' });
  const condition = jump.getByText('Condition', { selector: 'dt' });

  expect(jump.queryByText('Normal', { selector: 'dt' })).not.toBeInTheDocument();
  expect(baseline.compareDocumentPosition(normalFailure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(normalFailure.compareDocumentPosition(condition) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it.each(SHIPS.filter(ship => ship.maintenance))('places $name system cards inside the printed maintenance steps', (ship) => {
  render(<FleetSystemsWorkspace ship={ship} role={ship.roles[0]!} fuel={3} galacticCoordinate="0000" />);
  const steps = screen.getByRole('list', { name: `${ship.name} maintenance sequence` });
  const entries = Array.from(steps.children);
  expect(entries).toHaveLength(6);
  expect(entries[0]).toContainElement(screen.getByRole('heading', { name: 'Storage' }));
  expect(entries[1]).toContainElement(screen.getByRole('table', { name: `${ship.name} initial ration schedule` }));
  expect(entries[4]).toContainElement(screen.getByRole('heading', { name: 'Reactor' }));
  expect(entries[4]?.querySelector('h3')).toHaveTextContent('Reactor');
  expect(entries[5]).toContainElement(screen.getByRole('heading', { name: 'Shuttle Bay' }));
  expect(steps).not.toContainElement(screen.getByRole('heading', { name: 'Jump Drive' }));
  const production = (ship.systems ?? []).filter(system => !['Storage', 'Reactor', 'Shuttle Bay', 'Jump Drive', 'Fighter Bay', 'Ram Scoop'].includes(system.name));
  for (const system of production) expect(entries[4]).toContainElement(screen.getByRole('heading', { name: system.name }));
});


it.each(['capybara', 'icebreaker'])('separates conditional rules for %s into readable labeled rows', (id) => {
  const ship = SHIPS.find(ship => ship.id === id)!;
  render(<FleetSystemsWorkspace ship={ship} role={ship.roles[0]!} fuel={3} galacticCoordinate="0000" />);
  const jump = within(screen.getByRole('article', { name: 'Jump Drive system // operational' }));
  expect(jump.getByText('If Upgraded (By Shepherd)', { selector: 'dt' })).toBeVisible();
  expect(jump.getByText('If Damaged', { selector: 'dt' })).toBeVisible();
  expect(jump.getByText('jumps fail on 1–3.', { selector: 'dd' })).toBeVisible();
  expect(jump.getByText('Condition', { selector: 'dt' })).toBeVisible();
});

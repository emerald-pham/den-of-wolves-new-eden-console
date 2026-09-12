import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import FleetSystemsWorkspace from './FleetSystemsWorkspace';
import FleetConsoleWorkspace from './FleetConsoleWorkspace';
import { SHIPS } from '@/data/ships';
import type { ShipConsoleProjection } from '@/lib/shipStateProjection';

const renderWorkspace = (children: ReactNode) => render(<MemoryRouter>{children}</MemoryRouter>);

describe('fleet system reference workspaces', () => {
  it('uses the selected vessel projection instead of legacy cross-session props', () => {
    const ship = SHIPS.find(candidate => candidate.id === 'dione')!;
    const role = ship.roles[0]!;
    const shipState: ShipConsoleProjection = {
      shipId: ship.id,
      currentTurn: 4,
      galacticCoordinate: '5143',
      resources: { ore: 0, fuel: 11, food: 13, water: 14, materials: 0, securityTeams: 2 },
      unrest: 0,
      navigationLogs: { [ship.id]: [] },
      upgrades: [],
      consoleLocked: false,
    };

    renderWorkspace(<FleetConsoleWorkspace
      ship={ship}
      role={role}
      fuel={0}
      galacticCoordinate="0000"
      damage={{ damagedSystemIds: ['reactor'], destroyed: true }}
      navigationLogs={{ aegis: [{
        id: 'event:foreign', shipId: 'aegis', type: 'self-jump', origin: '0000', destination: '0102',
        occurredAt: '2026-09-12T00:00:00.000Z', stardate: '001.000000',
      }] }}
      shipState={shipState}
    />);

    const workspace = screen.getByRole('region', { name: 'Dione Captain console' });
    expect(workspace).toHaveTextContent(/galactic coordinates.*5143/i);
    expect(workspace).toHaveTextContent(/fuel in stores.*11/i);
    expect(workspace).toHaveTextContent(/damage state.*0 systems/i);
    expect(workspace).not.toHaveTextContent('0102');
  });

  it.each(SHIPS.flatMap(ship => ship.roles.map(role => ({ ship, role }))))(
    'gives $role.id complete command references without gameplay mutations', async ({ ship, role }) => {
      renderWorkspace(<FleetConsoleWorkspace ship={ship} role={role} fuel={7} galacticCoordinate="0102" />);
      expect(screen.queryByText('Scaffold ready')).not.toBeInTheDocument();
      const workspace = screen.getByRole('region', {
        name: `${ship.name} ${role.name} console`,
      });
      expect(workspace).toBeInTheDocument();
      expect(workspace).toHaveTextContent(`${ship.name} command console // ${role.name}`);
      expect(workspace).toHaveTextContent(/galactic coordinates.*0102/i);
      expect(workspace).toHaveTextContent(/fuel in stores.*7/i);
      expect(workspace).toHaveTextContent(/reactor capacity.*consoles/i);
      expect(workspace).toHaveTextContent(/damage state.*0 systems/i);
      expect(workspace).toHaveTextContent(/jump requirement.*short.*medium.*long/i);
      expect(workspace).toHaveTextContent(
        /maintenance and damage synchronized.*upgrades and procedure outcomes are tracked at the table/i,
      );
      expect(screen.getByRole('navigation', {
        name: `${ship.name} ${role.name} console pages`,
      })).toBeInTheDocument();
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
    renderWorkspace(<FleetConsoleWorkspace ship={ship} role={ship.roles[1]} fuel={3} galacticCoordinate="0101" />);
    expect(screen.getByRole('heading', { name: 'Scrap Refinery' })).toBeInTheDocument();
    expect(screen.getByText(/1 scrap → 3 materials/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open boa shuttle console/i }))
      .toHaveAttribute('href', '/shuttles/boa');
    expect(screen.queryByRole('link', { name: /open macaw shuttle console/i })).not.toBeInTheDocument();
  });

  it('links each role to the real shuttlecraft assigned on its printed sheet', () => {
    const ship = SHIPS.find((candidate) => candidate.id === 'dione')!;
    const role = ship.roles.find((candidate) => candidate.id === 'dione-engineer')!;
    renderWorkspace(<FleetConsoleWorkspace ship={ship} role={role} fuel={3} galacticCoordinate="0101" />);

    expect(screen.getByRole('link', { name: /open philia shuttle console/i }))
      .toHaveAttribute('href', '/shuttles/philia');
    expect(screen.getByRole('link', { name: /open maliades shuttle console/i }))
      .toHaveAttribute('href', '/shuttles/maliades');
  });
});

it.each(SHIPS.filter(ship => ship.maintenance))('keeps the complete $name maintenance reference together', (ship) => {
  const role = ship.roles[0];
  if (!role) throw new Error('Expected a ship role');
  renderWorkspace(<FleetSystemsWorkspace ship={ship} role={role} fuel={3} galacticCoordinate="0000" />);
  expect(screen.getByRole('heading', { name: 'Maintenance cycle' })).toBeVisible();
  expect(screen.getByRole('list', { name: `${ship.name} maintenance sequence` })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Storage' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Role procedures' })).toBeVisible();

  const jump = within(screen.getByRole('article', { name: 'Jump Drive system // operational' }));
  const baseline = jump.getByText(/charged:|airspace open|short \/\//i, { selector: 'p' });
  const normalFailure = jump.getByText('A jump fails on a roll of 1–2.', { selector: 'p' });
  const condition = jump.getByText('Condition', { selector: 'dt' });

  expect(jump.queryByText('Normal', { selector: 'dt' })).not.toBeInTheDocument();
  expect(baseline.compareDocumentPosition(normalFailure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(normalFailure.compareDocumentPosition(condition) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

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

  if (ship.id === 'capybara' || ship.id === 'icebreaker') {
    expect(jump.getByText('If Upgraded (By Shepherd)', { selector: 'dt' })).toBeVisible();
    expect(jump.getByText('If Damaged', { selector: 'dt' })).toBeVisible();
    expect(jump.getByText('jumps fail on 1–3.', { selector: 'dd' })).toBeVisible();
    expect(jump.getByText('Condition', { selector: 'dt' })).toBeVisible();
  }
});

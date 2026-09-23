import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import FleetSystemsWorkspace from './FleetSystemsWorkspace';
import FleetConsoleWorkspace from './FleetConsoleWorkspace';
import { SHIPS } from '@/data/ships';
import type { ShipConsoleProjection } from '@/lib/shipStateProjection';
import { useSessionStore } from '@/store/useSessionStore';

const renderWorkspace = (children: ReactNode) => render(<MemoryRouter>{children}</MemoryRouter>);

describe('fleet system reference workspaces', () => {
  it('adds live C&C to the Executive Officer console while retaining its systems and maintenance shell', () => {
    const ship = SHIPS.find(candidate => candidate.id === 'aegis')!;
    const role = ship.roles.find(candidate => candidate.id === 'executive-officer')!;
    useSessionStore.getState().reset();
    useSessionStore.getState().setIdentity(
      { id: 's1', name: 'Table', joinCode: '1234', phase: 'active', ownerUid: 'gm1', createdAt: '', updatedAt: '' },
      { uid: 'xo1', sessionId: 's1', displayName: 'Executive Officer', role: 'player', seatId: null,
        assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', joinedAt: '' },
    );
    useSessionStore.getState().setConnection('offline');

    renderWorkspace(<FleetConsoleWorkspace ship={ship} role={role} fuel={3} galacticCoordinate="0000" />);

    expect(screen.getByRole('heading', { name: 'Role procedures' })).toBeVisible();
    expect(screen.getAllByRole('heading', { name: 'Command and Control' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: /redirect selected ship/i })).toBeDisabled();
    expect(screen.getByText(/reconnect to the live executive officer authority/i)).toBeVisible();
    expect(screen.getByRole('article', { name: /fighter bay alpha system/i })).toBeVisible();
    expect(screen.getByRole('link', { name: /open pallas shuttle console/i })).toBeVisible();
  });

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
        const reference = screen.getByRole('complementary', { name: `${ship.name} maintenance reference` });
        expect(reference).toHaveTextContent(/sequence.*1 storage.*7 shuttle bay omega/i);
        expect(reference).toHaveTextContent(/rations.*food 0 \/ 3 \/ 5 \/ 8.*water 0 \/ 2 \/ 3 \/ 6/i);
        expect(reference).toHaveTextContent(/fuel expiry.*shuttle fuel.*next cycle/i);
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

  it('keeps the expansion Captain on Macaw supply and repair work without Boa access', () => {
    const ship = SHIPS.find(s => s.id === 'capybara')!;
    renderWorkspace(<FleetConsoleWorkspace ship={ship} role={ship.roles[0]} fuel={3} galacticCoordinate="0101" />);

    const macaw = screen.getByRole('link', { name: /open macaw shuttle console/i }).closest('article');
    expect(macaw).toHaveTextContent(/salvage shuttle.*repairs or salvages consoles with scrap/i);
    expect(screen.getByRole('link', { name: /open macaw shuttle console/i }))
      .toHaveAttribute('href', '/shuttles/macaw');
    expect(screen.queryByRole('link', { name: /open boa shuttle console/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Scrap allocation' })).not.toBeInTheDocument();
  });

  it('renders the expansion Capybara identity from its full-ship definition', () => {
    const ship = SHIPS.find(candidate => candidate.id === 'capybara')!;
    expect(ship.printedStatistics).toMatchObject({
      population: 20_000,
      reactorCapacity: 3,
      jumpCosts: { short: 3, medium: 6, long: 12 },
      maintenanceSteps: [1, 2, 3, 4, 5, 6],
    });
    expect(ship.maintenance).toEqual({
      reactor: 3,
      jump: [3, 6, 12],
      food: [0, 3, 7, 11],
      water: [0, 2, 5, 8],
    });

    const role = ship.roles[0]!;
    renderWorkspace(<FleetSystemsWorkspace ship={ship} role={role} fuel={3} galacticCoordinate="0000" />);

    const table = screen.getByRole('table', { name: 'Capybara active ration schedule' });
    expect(within(table).getByRole('row', { name: /Food/ })).toHaveTextContent(/Food.*0.*3.*7.*11/);
    expect(within(table).getByRole('row', { name: /Water/ })).toHaveTextContent(/Water.*0.*2.*5.*8/);
    expect(screen.getByText(/Jump requirement/i)).toHaveTextContent(/Short.*3.*Medium.*6.*Long.*12/i);
    expect(screen.getByRole('list', { name: 'Capybara maintenance sequence' }).children).toHaveLength(6);
  });

  it('shows Capybara replacement rations from the live population band', () => {
    const ship = SHIPS.find(candidate => candidate.id === 'capybara')!;
    const shipState: ShipConsoleProjection = {
      shipId: 'capybara', galacticCoordinate: '0000', population: 15_000, unrest: 0,
      navigationLogs: { capybara: [] }, upgrades: [], consoleLocked: false,
    };
    renderWorkspace(<FleetSystemsWorkspace ship={ship} role={ship.roles[0]!} fuel={3}
      galacticCoordinate="0000" shipState={shipState} />);

    const table = screen.getByRole('table', { name: 'Capybara active ration schedule' });
    expect(within(table).getByRole('row', { name: /Food/ })).toHaveTextContent(/Food.*0.*3.*6.*10/);
    expect(within(table).getByRole('row', { name: /Water/ })).toHaveTextContent(/Water.*0.*2.*4.*7/);
    expect(screen.getByText('Active replacement schedule // 5001-15000 survivors.')).toBeVisible();
  });

  it('keeps the Capybara console rendered when survivor state is off the printed track', () => {
    const ship = SHIPS.find(candidate => candidate.id === 'capybara')!;
    const shipState: ShipConsoleProjection = {
      shipId: 'capybara', galacticCoordinate: '0000', population: 14_999, unrest: 0,
      navigationLogs: { capybara: [] }, upgrades: [], consoleLocked: false,
    };
    renderWorkspace(<FleetSystemsWorkspace ship={ship} role={ship.roles[0]!} fuel={3}
      galacticCoordinate="0000" shipState={shipState} />);

    expect(screen.getByRole('region', { name: 'Capybara Capybara Captain console' })).toBeVisible();
    expect(screen.getByText(/ration schedule unavailable.*off the printed track/i)).toBeVisible();
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

  it('routes the Dione President to the bounded action workspace', () => {
    const ship = SHIPS.find((candidate) => candidate.id === 'dione')!;
    const role = ship.roles.find((candidate) => candidate.id === 'dione-president')!;
    renderWorkspace(<FleetConsoleWorkspace ship={ship} role={role} fuel={3}
      galacticCoordinate="0101" writable />);

    expect(screen.getByRole('region', { name: 'President workspace' })).toBeVisible();
    expect(screen.getByLabelText('Action family')).toHaveTextContent(
      'Fleet policyCrisis decisionPolitical capitalPresidential addressPresidential visitElection action',
    );
  });

  it('renders the PDF wing registration separately from the Colonel’s shuttlecraft', () => {
    const ship = SHIPS.find((candidate) => candidate.id === 'refinery-124')!;
    const role = ship.roles.find((candidate) => candidate.id === 'refinery-124-pdf-colonel')!;
    renderWorkspace(<FleetConsoleWorkspace ship={ship} role={role} fuel={3} galacticCoordinate="0408" />);

    const wing = screen.getByRole('region', { name: 'PDF Escort Fighter Wing' });
    expect(within(wing).getAllByRole('heading', { name: 'PDF Escort Fighter Wing' })).toHaveLength(2);
    expect(wing).toHaveTextContent(/owner.*refinery-124-pdf-colonel/i);
    expect(wing).toHaveTextContent(/fighter cap.*up to 4 fighters.*PDF wing cap/i);
    expect(wing).toHaveTextContent(/away mission.*independent of Fighter Bay charge.*search.*rescue \+2.*salvage \+1/i);
    expect(wing).toHaveTextContent(/combat launch.*fighter bay.*charged and undamaged.*wolf attack/i);
    expect(wing).toHaveTextContent(/target number.*±1.*damage on 5+.*one die per fighter.*damage on 3+.*destroyed.*1 or 2/i);
    expect(screen.getByRole('link', { name: /open chepu shuttle console/i }))
      .toHaveAttribute('href', '/shuttles/chepu');
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
  const reference = screen.getByRole('complementary', { name: `${ship.name} maintenance reference` });
  expect(reference).toHaveTextContent(/sequence.*1 storage.*6 shuttle bay/i);
  expect(reference).toHaveTextContent(new RegExp(
    `Rations.*Food ${ship.maintenance!.food.join(' / ')}.*Water ${ship.maintenance!.water.join(' / ')}`,
    'i',
  ));
  expect(reference).toHaveTextContent(/unrest.*step 3.*damage.*step 4.*charging.*step 5.*fuel expiry.*next cycle/i);

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
  expect(entries[1]).toContainElement(screen.getByRole('table', {
    name: `${ship.name} ${ship.id === 'capybara' ? 'active' : 'initial'} ration schedule`,
  }));
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

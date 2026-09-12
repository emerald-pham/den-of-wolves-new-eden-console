import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MaintenanceSystems from './MaintenanceSystems';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
const rollback = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const run = vi.hoisted(() => vi.fn());
const assign = vi.hoisted(() => vi.fn());
const repair = vi.hoisted(() => vi.fn());
vi.mock('@/lib/shipDamageService', () => ({ assignShipDamage: assign, repairAllShipDamage: repair }));
vi.mock('@/lib/maintenanceService', () => ({ runMaintenance: run, rollbackMaintenance: rollback }));
const session: GameSession = { id: 's1', name: 'Test', joinCode: 'TEST', phase: 'active', ownerUid: 'u1', createdAt: '', updatedAt: '' };
const me: Player = { uid: 'u1', sessionId: 's1', displayName: 'Engineer', role: 'player', seatId: null, activeConsoleRoleId: 'admiral', joinedAt: '' };
beforeEach(() => { useSessionStore.setState({ session, me, connection: 'live' }); run.mockReset(); assign.mockResolvedValue(undefined); repair.mockResolvedValue(undefined); });
it.each(['aegis', 'capybara'])('keeps %s controls visible and only unlocks the current step', async shipId => {
  render(<MaintenanceSystems name={shipId} shipId={shipId} systems={[]} renderSystem={() => null} rations={null} />);
  expect(screen.getByRole('button', { name: 'Check storage' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Proceed with rations' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'End maintenance cycle' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Turn 1' }));
  expect(run).not.toHaveBeenCalled();
  const confirm = screen.getByRole('button', { name: 'ARE YOU SURE?' });
  expect(confirm).toHaveStyle({ color: 'var(--cic-danger)', borderColor: 'var(--cic-danger)' });
  await userEvent.click(confirm);
  expect(run).toHaveBeenCalledWith(shipId, 'begin', 0, {}, undefined);
  act(() => useSessionStore.setState({ session: { ...session, maintenanceCycles: { [shipId]: { step: 1, revision: 1, results: {}, charges: [], refuelled: [] } } } }));
  expect(screen.getByRole('button', { name: 'Check storage' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Turn 1' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Food ration level' })).toBeDisabled();
  run.mockClear();
  await userEvent.click(screen.getByRole('button', { name: 'Check storage' }));
  expect(run).toHaveBeenCalledWith(shipId, 'storage', 1, {}, undefined);
});
it('keeps completed maintenance locked until the GM advances the turn', () => {
  useSessionStore.setState({ session: {
    ...session,
    currentTurn: 4,
    maintenanceCycles: { aegis: {
      step: 0, revision: 8, turn: 4, results: { '7': 'Maintenance cycle complete.' },
      charges: [], refuelled: [], completedAt: '2026-09-06T12:04:00.000Z',
    } },
  } });
  render(<MaintenanceSystems name="AEGIS" shipId="aegis" systems={[]} renderSystem={() => null} rations={null} />);

  expect(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Turn 4' })).toBeDisabled();

  act(() => useSessionStore.setState({ session: { ...useSessionStore.getState().session!, currentTurn: 5 } }));
  expect(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Turn 5' })).toBeEnabled();
});

it('holds player maintenance controls during Turn 0 while GM setup is underway', () => {
  useSessionStore.setState({ session: { ...session, currentTurn: 0 } });
  render(<MaintenanceSystems name="AEGIS" shipId="aegis" systems={[]} renderSystem={() => null} rations={null} />);

  expect(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Turn 0' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Turn 0 // Awaiting Iris Authentication');
});
it('presents every maintenance command as a boxed CIC action', () => {
  render(<MaintenanceSystems name="AEGIS" shipId="aegis" systems={[]} renderSystem={() => null} rations={null} />);

  for (const button of screen.getAllByRole('button')) {
    expect(button).toHaveClass('cic-action-button');
    expect(button).not.toHaveClass('cic-text-button');
  }
});

it('does not rebuild maintenance modules for seat-only snapshots', () => {
  const renderSystem = vi.fn(() => <span key="reactor">Reactor module</span>);
  render(
    <MaintenanceSystems
      name="AEGIS"
      shipId="aegis"
      systems={[{ id: 'reactor', name: 'Reactor', timing: 5 }]}
      renderSystem={renderSystem}
      rations={null}
    />,
  );
  expect(renderSystem).toHaveBeenCalled();
  renderSystem.mockClear();

  act(() => useSessionStore.getState().setSeats([{
    id: 'seat-1', sessionId: 's1', label: 'Bridge', factionId: null,
    status: 'open', holderUid: null, claimedAt: null,
  }]));

  expect(renderSystem).not.toHaveBeenCalled();
});

it('sends separate ration choices and displays server results across remounts', async () => {
  useSessionStore.setState({ session: { ...session, maintenanceCycles: { aegis: { step: 2, revision: 2, results: { '1': 'Storage intact. No resources lost.' }, charges: [], refuelled: [] } } } });
  render(<MaintenanceSystems name="AEGIS" shipId="aegis" systems={[]} renderSystem={() => null} rations={null} />);
  expect(screen.getByText('Storage intact. No resources lost.')).toBeVisible();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Food ration level' }), '1');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Water ration level' }), '2');
  await userEvent.click(screen.getByRole('button', { name: 'Proceed with rations' }));
  expect(run).toHaveBeenCalledWith('aegis', 'rations', 2, { foodLevel: 1, waterLevel: 2 }, undefined);
});

it('renders Dione production controls from live charges and resource state', async () => {
  useSessionStore.setState({ session: {
    ...session,
    shipResources: { dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 0, securityTeams: 2 } },
    shipDamage: { dione: { damagedSystemIds: [], destroyed: false } },
    maintenanceCycles: { dione: { step: 6, revision: 3, results: { '5': 'Reactor powered up.' }, charges: ['hydroponics', 'water-reclamation'], refuelled: [] } },
  } });
  render(<MaintenanceSystems name="Dione" shipId="dione"
    systems={[
      { id: 'hydroponics', name: 'Hydroponics', timing: 5 },
      { id: 'water-reclamation', name: 'Water Reclamation', timing: 5 },
      { id: 'shuttle-bay', name: 'Shuttle Bay', timing: 6 },
    ]}
    renderSystem={() => null} rations={null} />);

  expect(screen.getByText(/Live stores: 13 food \/\/ 14 water/)).toBeVisible();
  const hydroponics = screen.getByRole('button', { name: 'Run Hydroponics' });
  const reclamation = screen.getByRole('button', { name: 'Run Water Reclamation' });
  expect(hydroponics).toBeEnabled();
  expect(reclamation).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Skip Hydroponics' })).toBeEnabled();
  await userEvent.click(hydroponics);
  expect(run).toHaveBeenCalledWith('dione', 'production', 3, { productionConsoleId: 'hydroponics' }, undefined);

  act(() => useSessionStore.setState({ session: {
    ...useSessionStore.getState().session!,
    shipResources: { dione: { ore: 0, fuel: 3, food: 16, water: 13, materials: 0, securityTeams: 2 } },
    maintenanceCycles: { dione: { step: 6, revision: 4, results: { '5': 'Hydroponics generated 3 food.' }, charges: ['water-reclamation'], refuelled: [] } },
  } }));
  expect(screen.getByRole('button', { name: 'Run Water Reclamation' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Run Hydroponics' })).toBeDisabled();
});

it('disables damaged consoles before reactor charge while preserving the damaged Jump Drive control', () => {
  useSessionStore.setState({ session: {
    ...session,
    maintenanceCycles: { aegis: { step: 5, revision: 5, results: {}, charges: [], refuelled: [] } },
    shipDamage: { aegis: { damagedSystemIds: ['construction-bay', 'jump-drive'], destroyed: false } },
  } });
  render(<MaintenanceSystems
    name="AEGIS"
    shipId="aegis"
    systems={[
      { id: 'construction-bay', name: 'Construction Bay', timing: 5 },
      { id: 'jump-drive', name: 'Jump Drive', timing: 'ftl' },
    ]}
    renderSystem={() => null}
    rations={null}
  />);

  expect(screen.getByLabelText('Construction Bay')).toBeDisabled();
  expect(screen.getByLabelText('Jump Drive')).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Power up reactor' })).toBeEnabled();
});

function renderReactor() {
  useSessionStore.setState({ session: {
    ...session,
    maintenanceCycles: { aegis: { step: 5, revision: 5, results: {}, charges: ['jump-drive'], refuelled: [] } },
  } });
  return render(<MaintenanceSystems name="AEGIS" shipId="aegis"
    systems={[{ id: 'jump-drive', name: 'Jump Drive', timing: 'ftl' }]}
    renderSystem={() => null} rations={null} />);
}

it('summarizes Reactor replacement before confirmation and submits only once while pending', async () => {
  let finish!: () => void;
  run.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  renderReactor();
  await userEvent.click(screen.getByRole('checkbox', { name: /Jump Drive/ }));
  const power = screen.getByRole('button', { name: 'Power up reactor' });
  await userEvent.click(power);
  expect(run).not.toHaveBeenCalled();
  expect(power).toHaveAccessibleName('ARE YOU SURE?');
  expect(power).toHaveAccessibleDescription('Charge: Jump Drive. Previous unused charges will be lost: Jump Drive.');
  expect(power).toHaveStyle({ color: 'var(--cic-danger)', borderColor: 'var(--cic-danger)' });
  await userEvent.dblClick(power);
  expect(run).toHaveBeenCalledExactlyOnceWith('aegis', 'reactor', 5, { consoles: ['jump-drive'] }, undefined);
  expect(power).toBeDisabled();
  await act(async () => finish());
});

it('cancels Reactor confirmation with Cancel, Escape or blur without losing the selection', async () => {
  renderReactor();
  const selected = screen.getByRole('checkbox', { name: /Jump Drive/ });
  await userEvent.click(selected);
  const power = screen.getByRole('button', { name: 'Power up reactor' });
  await userEvent.click(power);
  await userEvent.tab();
  expect(screen.getByRole('button', { name: 'Cancel reactor power-up' })).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  expect(power).toHaveFocus();
  expect(power).toHaveAccessibleName('Power up reactor');
  await userEvent.keyboard('{Enter}{Escape}');
  expect(power).toHaveFocus();
  expect(power).toHaveAccessibleName('Power up reactor');
  await userEvent.click(power);
  await userEvent.tab({ shift: true });
  expect(power).toHaveAccessibleName('Power up reactor');
  expect(selected).toBeChecked();
  expect(run).not.toHaveBeenCalled();
});

it('invalidates Reactor confirmation after a live revision change or route remount', async () => {
  const view = renderReactor();
  await userEvent.click(screen.getByRole('button', { name: 'Power up reactor' }));
  expect(screen.getByRole('status')).toHaveTextContent('No consoles selected.');
  act(() => useSessionStore.setState({ session: {
    ...useSessionStore.getState().session!,
    maintenanceCycles: { aegis: { step: 5, revision: 6, results: {}, charges: [], refuelled: [] } },
  } }));
  expect(screen.queryByRole('button', { name: 'ARE YOU SURE?' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Power up reactor' }));
  view.unmount();
  renderReactor();
  expect(screen.queryByRole('button', { name: 'ARE YOU SURE?' })).not.toBeInTheDocument();
  expect(run).not.toHaveBeenCalled();
});

it.each(['aegis', 'capybara'])('lets only a GM assign damage beneath %s maintenance', async shipId => {
  const props = { name: shipId, shipId, systems: [], renderSystem: () => null, rations: null };
  const view = render(<MaintenanceSystems {...props} />);
  expect(screen.queryByRole('button', { name: 'Assign damage' })).not.toBeInTheDocument();
  act(() => useSessionStore.setState({ me: { ...me, role: 'gm' }, gmInstance: { id: 'gm1', uid: 'u1', sessionId: 's1', name: 'GM', deviceLabel: '', claimedAt: '' } }));
  const button = screen.getByRole('button', { name: 'Assign damage' });
  expect(screen.getByRole('button', { name: 'End maintenance cycle' }).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await userEvent.click(button);
  expect(assign).toHaveBeenCalledWith(shipId);
  act(() => useSessionStore.setState({ session: { ...session, shipDamage: { [shipId]: { damagedSystemIds: [], destroyed: true } } } }));
  expect(button).toBeDisabled();
  view.unmount();
});

it('notes the drawn card beside the GM control that applied damage', async () => {
  assign.mockResolvedValue({
    destroyed: false,
    card: { card: '10♥', systemId: 'reactor', systemName: 'Reactor' },
    recycled: false,
  });
  useSessionStore.setState({
    me: { ...me, role: 'gm' },
    gmInstance: { id: 'gm1', uid: 'u1', sessionId: 's1', name: 'GM', deviceLabel: '', claimedAt: '' },
  });
  render(<MaintenanceSystems name="AEGIS" shipId="aegis" systems={[]} renderSystem={() => null} rations={null} />);
  expect(screen.getByText('Roll 1d6. Below current unrest causes a riot: draw and apply 1 damage card.')).toBeVisible();

  await userEvent.click(screen.getByRole('button', { name: 'Assign damage' }));

  expect(await screen.findByRole('status')).toHaveTextContent('Damage applied // card 10♥ // Reactor damaged.');
});

it('stacks GM-assigned damage outcomes without clearing the current log line', async () => {
  assign
    .mockResolvedValueOnce({
      destroyed: false,
      card: { card: '10♥', systemId: 'reactor', systemName: 'Reactor' },
      recycled: false,
    })
    .mockResolvedValueOnce({
      destroyed: false,
      card: { card: 'Q♥', systemId: 'command', systemName: 'Command and Control' },
      recycled: false,
    });
  useSessionStore.setState({
    me: { ...me, role: 'gm' },
    gmInstance: { id: 'gm1', uid: 'u1', sessionId: 's1', name: 'GM', deviceLabel: '', claimedAt: '' },
  });
  render(<MaintenanceSystems name="AEGIS" shipId="aegis" systems={[]} renderSystem={() => null} rations={null} />);

  await userEvent.click(screen.getByRole('button', { name: 'Assign damage' }));
  expect(await screen.findByText('Damage applied // card 10♥ // Reactor damaged.')).toBeVisible();

  await userEvent.click(screen.getByRole('button', { name: 'Assign damage' }));
  expect(await screen.findByText('Damage applied // card Q♥ // Command and Control damaged.')).toBeVisible();
  expect(screen.getByText('Damage applied // card 10♥ // Reactor damaged.')).toBeVisible();
});

it.each(['player', 'gm'] as const)('notes a maintenance-drawn card inside the damage-causing step for a %s', (role) => {
  useSessionStore.setState({
    session: { ...session, maintenanceCycles: { aegis: {
      step: 5,
      revision: 5,
      results: { '4': 'Rolled 1 against unrest 4. Riot: Fighter Bay Alpha damaged. Population 2000.' },
      charges: [],
      refuelled: [],
      damageDrawId: 'riot-draw',
    } } },
    me: { ...me, role },
  });
  render(<MaintenanceSystems
    name="AEGIS"
    shipId="aegis"
    systems={[]}
    renderSystem={() => null}
    rations={null}
    damageDraws={[{
      id: 'riot-draw', sessionId: 's1', shipId: 'aegis', type: 'ship-damage', card: 'A♥',
      systemId: 'fighter-bay-alpha', systemName: 'Fighter Bay Alpha', recycled: false,
      createdAt: '2026-09-06T12:00:00.000Z',
    }]}
  />);

  const riotStep = screen.getByText('Riot check').closest('li');
  expect(riotStep).not.toBeNull();
  expect(within(riotStep!).getByText('Damage card A♥ // Fighter Bay Alpha damaged.')).toBeVisible();
});

it('shows repair only to GMs and repairs a destroyed ship', async () => {
  useSessionStore.setState({ session: { ...session, shipDamage: { aegis: { damagedSystemIds: ['reactor'], destroyed: true } } } });
  render(<MaintenanceSystems name="AEGIS" shipId="aegis" systems={[]} renderSystem={() => null} rations={null} />);
  expect(screen.queryByRole('button', { name: 'Repair all damage' })).not.toBeInTheDocument();
  act(() => useSessionStore.setState({ me: { ...me, role: 'gm' } }));
  await userEvent.click(screen.getByRole('button', { name: 'Repair all damage' }));
  expect(repair).toHaveBeenCalledWith('aegis');
});

it('offers rollback only to the GM and sends the current revision', async () => {
  const coordinationPhase = { turn: 1, teamPhaseEndsAt: '2026-09-09T16:00:00.000Z', openAirspaceEndsAt: '2026-09-09T16:40:00.000Z', airspace: { state: 'lifted' as const, tickerActive: true, pressAccess: false } };
  const teamPhase = { ...coordinationPhase, airspace: { ...coordinationPhase.airspace, state: 'restricted' as const } };
  useSessionStore.setState({ session: { ...session, currentTurn: 1, turnPhase: coordinationPhase, maintenanceCycles: { aegis: { step: 2, revision: 2, results: {}, charges: [], refuelled: [] } } } });
  render(<MaintenanceSystems name="AEGIS" shipId="aegis" systems={[]} renderSystem={() => null} rations={null} />);
  expect(screen.queryByRole('button', { name: 'Roll back maintenance step' })).not.toBeInTheDocument();
  act(() => useSessionStore.setState({ me: { ...me, role: 'gm' } }));
  const rollbackButton = screen.getByRole('button', { name: 'Roll back maintenance step' });
  expect(rollbackButton).toBeDisabled();
  expect(rollbackButton).toHaveAccessibleDescription('Roll back maintenance step is available only during Team Phase.');
  act(() => useSessionStore.setState({ session: { ...useSessionStore.getState().session!, turnPhase: teamPhase } }));
  expect(rollbackButton).toBeEnabled();
  await userEvent.click(rollbackButton);
  expect(rollback).toHaveBeenCalledWith('aegis', 2);
});

it('resets start confirmation when the ship or turn changes and on blur', async () => {
  const view = (shipId: string) => <MaintenanceSystems name={shipId} shipId={shipId} systems={[]} renderSystem={() => null} rations={null} />;
  const { rerender } = render(view('aegis'));
  await userEvent.click(screen.getByRole('button', { name: /Begin Maintenance/ }));
  rerender(view('capybara'));
  expect(screen.queryByRole('button', { name: 'ARE YOU SURE?' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Begin Maintenance/ }));
  act(() => useSessionStore.setState({ session: { ...session, currentTurn: 2 } }));
  expect(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Turn 2' })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: /Begin Maintenance/ }));
  await userEvent.tab();
  expect(screen.queryByRole('button', { name: 'ARE YOU SURE?' })).not.toBeInTheDocument();
  expect(run).not.toHaveBeenCalled();
});

import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MaintenanceSystems from './MaintenanceSystems';
import DioneVipCards from './DioneVipCards';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
const rollback = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const run = vi.hoisted(() => vi.fn());
const assign = vi.hoisted(() => vi.fn());
const repair = vi.hoisted(() => vi.fn());
const vipHandSubscription = vi.hoisted(() => vi.fn((_sessionId: string, _uid: string, onCards: (value: unknown) => void) => {
  onCards({ sessionId: 's1', ownerUid: 'u1', revision: 0, cards: [] });
  return () => undefined;
}));
const connectedPlayersSubscription = vi.hoisted(() => vi.fn((_sessionId: string, onPlayers: (value: readonly Player[]) => void) => {
  onPlayers([]);
  return () => undefined;
}));
vi.mock('@/lib/shipDamageService', () => ({ assignShipDamage: assign, repairAllShipDamage: repair }));
vi.mock('@/lib/maintenanceService', () => ({ runMaintenance: run, rollbackMaintenance: rollback }));
vi.mock('@/lib/firestore', () => ({
  subscribeVipCards: vipHandSubscription,
  subscribeConnectedPlayers: connectedPlayersSubscription,
}));
const session: GameSession = { id: 's1', name: 'Test', joinCode: 'TEST', phase: 'active', ownerUid: 'u1', createdAt: '', updatedAt: '' };
const me: Player = { uid: 'u1', sessionId: 's1', displayName: 'Engineer', role: 'player', seatId: null, activeConsoleRoleId: 'admiral', joinedAt: '' };
beforeEach(() => { useSessionStore.setState({ session, me, connection: 'live' }); run.mockReset(); assign.mockResolvedValue(undefined); repair.mockResolvedValue(undefined); });
it.each(['aegis', 'capybara'])('keeps %s controls visible and only unlocks the current step', async shipId => {
  render(<MaintenanceSystems name={shipId} shipId={shipId} systems={[]} renderSystem={() => null} rations={null} />);
  expect(screen.getByRole('button', { name: 'Check storage' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Proceed with rations' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'End maintenance cycle' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Cycle 1' }));
  expect(run).not.toHaveBeenCalled();
  const confirm = screen.getByRole('button', { name: 'ARE YOU SURE?' });
  expect(confirm).toHaveStyle({ color: 'var(--cic-danger)', borderColor: 'var(--cic-danger)' });
  await userEvent.click(confirm);
  expect(run).toHaveBeenCalledWith(shipId, 'begin', 0, {}, undefined);
  act(() => useSessionStore.setState({ session: { ...session, maintenanceCycles: { [shipId]: { step: 1, revision: 1, results: {}, charges: [], refuelled: [] } } } }));
  expect(screen.getByRole('button', { name: 'Check storage' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Cycle 1' })).toBeDisabled();
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

  expect(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Cycle 4' })).toBeDisabled();

  act(() => useSessionStore.setState({ session: { ...useSessionStore.getState().session!, currentTurn: 5 } }));
  expect(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Cycle 5' })).toBeEnabled();
});

it('holds player maintenance controls during Turn 0 while GM setup is underway', () => {
  useSessionStore.setState({ session: { ...session, currentTurn: 0 } });
  render(<MaintenanceSystems name="AEGIS" shipId="aegis" systems={[]} renderSystem={() => null} rations={null} />);

  expect(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Cycle 0' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Maintenance begins on Cycle 1');
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

it('keeps malformed Capybara survivor state rendered and locks ration submission', () => {
  useSessionStore.setState({ session: {
    ...session,
    shipSurvivors: { capybara: 14_999 },
    maintenanceCycles: { capybara: { step: 2, revision: 2, results: {}, charges: [], refuelled: [] } },
  } });
  render(<MaintenanceSystems name="Capybara" shipId="capybara" systems={[]}
    renderSystem={() => null} rations={null} />);

  expect(screen.getByRole('alert')).toHaveTextContent(/rations locked.*off the printed track/i);
  expect(screen.getByRole('button', { name: 'Proceed with rations' })).toBeDisabled();
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
  expect(screen.getByRole('button', { name: 'Skip Water Reclamation' })).toBeDisabled();
  await userEvent.click(hydroponics);
  expect(run).toHaveBeenCalledWith('dione', 'production', 3, { productionConsoleId: 'hydroponics' }, undefined);

  act(() => useSessionStore.setState({ session: {
    ...useSessionStore.getState().session!,
    shipResources: { dione: { ore: 0, fuel: 3, food: 16, water: 13, materials: 0, securityTeams: 2 } },
    maintenanceCycles: { dione: { step: 6, revision: 4, results: { '5': 'Hydroponics generated 3 food.' }, charges: ['water-reclamation'], refuelled: [] } },
  } }));
  expect(screen.getByRole('button', { name: 'Run Water Reclamation' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Run Hydroponics' })).toBeDisabled();

  act(() => useSessionStore.setState({ session: {
    ...useSessionStore.getState().session!,
    shipResources: { dione: { ore: 0, fuel: 3, food: 13, water: 0, materials: 0, securityTeams: 2 } },
    maintenanceCycles: { dione: { step: 6, revision: 5, results: { '5': 'Water Reclamation skipped.' }, charges: ['hydroponics'], refuelled: [] } },
  } }));
  expect(screen.getByRole('button', { name: 'Run Hydroponics' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Skip Hydroponics' })).toBeDisabled();
});

it('renders the Dione VIP Lounge as a private step-5 action with a later-use boundary', async () => {
  useSessionStore.setState({ session: {
    ...session,
    currentTurn: 1,
    shipDamage: { dione: { damagedSystemIds: [], destroyed: false } },
    maintenanceCycles: { dione: { step: 5, revision: 3, results: {}, charges: ['vip-lounge'], refuelled: [] } },
  } });
  render(<DioneVipCards shipId="dione"
    cycle={{ step: 5, revision: 3, charges: ['vip-lounge'] }}
    damaged={false} />);

  expect(await screen.findByRole('button', { name: 'Draw private VIP card' })).toBeEnabled();
  expect(screen.getByText(/Prompt 191 owns the printed effect/i)).toBeVisible();
  expect(screen.getByText(/That use action is not available yet/i)).toBeVisible();
});

it('keeps an owned card available for Coordination transfer after maintenance advances', async () => {
  vipHandSubscription.mockImplementationOnce((_sessionId: string, _uid: string, onCards: (value: unknown) => void) => {
    onCards({ sessionId: 's1', ownerUid: 'u1', revision: 3, cards: [{ id: 'party-deck', name: 'Party Deck', status: 'available' }] });
    return () => undefined;
  });
  connectedPlayersSubscription.mockImplementationOnce((_sessionId: string, onPlayers: (value: readonly Player[]) => void) => {
    onPlayers([{ ...me, uid: 'u2', displayName: 'Recipient', activeConsoleRoleId: 'dione-president' }]);
    return () => undefined;
  });
  useSessionStore.setState({ session: {
    ...session,
    currentTurn: 1,
    turnPhase: {
      turn: 1, teamPhaseEndsAt: '2026-09-13T00:00:00.000Z', openAirspaceEndsAt: '2026-09-14T00:00:00.000Z',
      airspace: { state: 'lifted', tickerActive: false, pressAccess: true },
    },
    maintenanceCycles: { dione: { step: 6, revision: 3, results: {}, charges: [], refuelled: [] } },
  } });
  render(<DioneVipCards shipId="dione"
    cycle={{ step: 6, revision: 3, charges: [] }}
    damaged={false} />);

  expect(await screen.findByText('Transfer a VIP card')).toBeVisible();
  expect(screen.getByRole('option', { name: 'Party Deck' })).toBeVisible();
  expect(screen.getByRole('option', { name: 'Recipient' })).toBeVisible();
});

it('renders Capybara production controls with optional Scrap spending', async () => {
  useSessionStore.setState({ session: {
    ...session,
    shipResources: { capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 2 } },
    shipDamage: { capybara: { damagedSystemIds: [], destroyed: false } },
    maintenanceCycles: { capybara: { step: 6, revision: 3, results: { '5': 'Reactor powered up.' }, charges: ['advanced-hydroponics', 'water-production'], refuelled: [] } },
  } });
  render(<MaintenanceSystems name="Capybara" shipId="capybara"
    systems={[
      { id: 'advanced-hydroponics', name: 'Advanced Hydroponics', timing: 5 },
      { id: 'water-production', name: 'Water Production', timing: 5 },
      { id: 'shuttle-bay', name: 'Shuttle Bay', timing: 6 },
    ]}
    renderSystem={() => null} rations={null} />);

  expect(screen.getByText(/Live stores: 9 food \/\/ 4 water \/\/ 0 materials \/\/ 0 ore \/\/ 3 fuel \/\/ 2 Scrap/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Run Advanced Hydroponics' })).toBeEnabled();
  expect(screen.getByRole('checkbox', { name: 'Spend 1 Scrap on Advanced Hydroponics' })).toBeEnabled();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Spend 1 Scrap on Advanced Hydroponics' }));
  await userEvent.click(screen.getByRole('button', { name: 'Skip Advanced Hydroponics' }));
  expect(run).toHaveBeenCalledWith('capybara', 'production', 3, {
    productionConsoleId: 'advanced-hydroponics', productionMode: 'skip',
  }, undefined);
  run.mockClear();
  await userEvent.click(screen.getByRole('button', { name: 'Run Advanced Hydroponics' }));
  expect(run).toHaveBeenCalledWith('capybara', 'production', 3, {
    productionConsoleId: 'advanced-hydroponics', productionScrap: true,
  }, undefined);

  act(() => useSessionStore.setState({ session: {
    ...useSessionStore.getState().session!,
    shipResources: { capybara: { ore: 0, fuel: 3, food: 15, water: 10, materials: 0, securityTeams: 2, scrap: 0 } },
    maintenanceCycles: { capybara: { step: 6, revision: 4, results: { '5': 'Advanced Hydroponics generated 12 food.' }, charges: ['water-production'], refuelled: [] } },
  } }));
  expect(screen.getByRole('button', { name: 'Run Water Production' })).toBeEnabled();
  expect(screen.getByRole('checkbox', { name: 'Spend 1 Scrap on Water Production' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Skip Water Production' })).toBeEnabled();
});

it.each([
  ['icebreaker', ['hydroponics', 'water-reclamation', 'mining-drone-control']],
  ['shepherd', ['water-reclamation', 'advanced-hydroponics', 'advanced-hydroponics-ii']],
  ['quellon', ['hydroponics', 'water-production', 'water-production-ii']],
] as const)('exposes each charged %s production console as an independent action', (shipId, consoleIds) => {
  useSessionStore.setState({ session: {
    ...session,
    shipResources: { [shipId]: { ore: 12, fuel: 5, food: 20, water: 20, materials: 3, securityTeams: 2 } },
    shipDamage: { [shipId]: { damagedSystemIds: [], destroyed: false } },
    maintenanceCycles: { [shipId]: { step: 6, revision: 3, results: {}, charges: [...consoleIds], refuelled: [] } },
  } });
  render(<MaintenanceSystems name={shipId} shipId={shipId}
    systems={consoleIds.map(id => ({ id, name: id, timing: 5 as const }))}
    renderSystem={() => null} rations={null} />);

  for (const consoleId of consoleIds) {
    expect(screen.getByRole('button', { name: `Run ${consoleId}` })).toBeEnabled();
    expect(screen.getByRole('button', { name: `Skip ${consoleId}` })).toBeEnabled();
  }
});

it('submits a bounded ore amount for each Refinery 124 Fuel Refinery', async () => {
  const user = userEvent.setup();
  useSessionStore.setState({ session: {
    ...session,
    shipResources: { 'refinery-124': { ore: 12, fuel: 5, food: 9, water: 4, materials: 0, securityTeams: 6 } },
    shipDamage: { 'refinery-124': { damagedSystemIds: [], destroyed: false } },
    shipUpgrades: { 'refinery-124': ['fuel-refinery-ii'] },
    maintenanceCycles: { 'refinery-124': {
      step: 6, revision: 3, results: {}, charges: ['fuel-refinery', 'fuel-refinery-ii'], refuelled: [],
    } },
  } });
  render(<MaintenanceSystems name="Refinery 124" shipId="refinery-124"
    systems={[
      { id: 'fuel-refinery', name: 'Fuel Refinery', timing: 5 },
      { id: 'fuel-refinery-ii', name: 'Fuel Refinery II', timing: 5 },
    ]}
    renderSystem={() => null} rations={null} />);

  const firstAmount = screen.getByRole('spinbutton', { name: 'Fuel Refinery ore to refine' });
  const secondAmount = screen.getByRole('spinbutton', { name: 'Fuel Refinery II ore to refine' });
  expect(firstAmount).toHaveAttribute('max', '10');
  expect(secondAmount).toHaveAttribute('max', '15');
  await user.clear(firstAmount);
  await user.type(firstAmount, '10');
  await user.click(screen.getByRole('button', { name: 'Run Fuel Refinery' }));
  expect(run).toHaveBeenCalledWith('refinery-124', 'production', 3, {
    productionConsoleId: 'fuel-refinery', productionOreAmount: 10,
  }, undefined);
  expect(screen.getByRole('button', { name: 'Run Fuel Refinery II' })).toBeEnabled();
});

it('renders Capybara\'s single bay with exactly the two docked shuttle choices', async () => {
  useSessionStore.setState({ session: {
    ...session,
    shipResources: { capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 } },
    shipDamage: { capybara: { damagedSystemIds: [], destroyed: false } },
    maintenanceCycles: { capybara: { step: 6, revision: 3, results: { '5': 'Reactor powered up.' }, charges: [], refuelled: [] } },
    shuttleDockings: [
      { shipId: 'capybara', shuttleId: 'macaw', dockedAt: 'SESSION START' },
      { shipId: 'capybara', shuttleId: 'boa', dockedAt: 'SESSION START' },
    ],
  } });
  render(<MaintenanceSystems name="Capybara" shipId="capybara"
    systems={[{ id: 'shuttle-bay', name: 'Shuttle Bay', timing: 6 }]}
    renderSystem={() => null} rations={null} />);

  const refuelling = screen.getByRole('combobox', { name: 'Shuttle Bay refuelling' });
  expect(refuelling).toBeEnabled();
  expect(within(refuelling).getAllByRole('option')).toHaveLength(3);
  expect(within(refuelling).getByRole('option', { name: 'S.A.N.S. Macaw' })).toBeVisible();
  expect(within(refuelling).getByRole('option', { name: 'S.A.N.S. Boa' })).toBeVisible();
  await userEvent.selectOptions(refuelling, 'boa');
  await userEvent.click(screen.getByRole('button', { name: 'Proceed with refuelling' }));
  expect(run).toHaveBeenCalledWith('capybara', 'bays', 3, { refuels: { 'shuttle-bay': 'boa' } }, undefined);
});

it('offers AEGIS Shuttle Bay Zeta before Shuttle Bay Omega and clears the prior bay choice', async () => {
  useSessionStore.setState({ session: {
    ...session,
    shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 2 } },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    maintenanceCycles: { aegis: {
      step: 6, revision: 3, results: { '5': 'Reactor powered up.' }, charges: [], refuelled: [],
    } },
    shuttleDockings: [
      { shipId: 'aegis', shuttleId: 'starlight', dockedAt: 'SESSION START' },
      { shipId: 'aegis', shuttleId: 'pallas', dockedAt: 'SESSION START' },
    ],
  } });
  render(<MaintenanceSystems name="AEGIS" shipId="aegis"
    systems={[
      { id: 'shuttle-bay-zeta', name: 'Shuttle Bay Zeta', timing: 6 },
      { id: 'shuttle-bay-omega', name: 'Shuttle Bay Omega', timing: 7 },
    ]}
    renderSystem={() => null} rations={null} />);

  expect(screen.getByText(/6 Shuttle Bay Zeta \/\/ 7 Shuttle Bay Omega/)).toBeVisible();
  const zeta = screen.getByRole('combobox', { name: 'Shuttle Bay Zeta refuelling' });
  const lockedOmega = screen.getByRole('combobox', { name: 'Shuttle Bay Omega refuelling' });
  expect(zeta).toBeEnabled();
  expect(lockedOmega).toBeDisabled();
  await userEvent.selectOptions(zeta, 'starlight');
  await userEvent.click(within(zeta.closest('fieldset')!).getByRole('button', { name: 'Proceed with refuelling' }));
  expect(run).toHaveBeenCalledWith('aegis', 'bays', 3, {
    refuels: { 'shuttle-bay-zeta': 'starlight' },
  }, undefined);

  run.mockClear();
  act(() => useSessionStore.setState({ session: {
    ...useSessionStore.getState().session!,
    shipResources: { aegis: { ore: 0, fuel: 3, food: 8, water: 6, materials: 1, securityTeams: 2 } },
    maintenanceCycles: { aegis: {
      step: 7, revision: 4, results: { '5': 'Reactor powered up.', '6': 'Shuttle Bay Zeta complete.' },
      charges: [], refuelled: ['starlight'],
    } },
    shuttleFuelled: { starlight: true, pallas: false },
  } }));
  const lockedZeta = screen.getByRole('combobox', { name: 'Shuttle Bay Zeta refuelling' });
  const omega = screen.getByRole('combobox', { name: 'Shuttle Bay Omega refuelling' });
  expect(lockedZeta).toBeDisabled();
  expect(lockedZeta).toHaveValue('');
  expect(omega).toBeEnabled();
  expect(omega).toHaveValue('');
  await userEvent.selectOptions(omega, 'pallas');
  await userEvent.click(within(omega.closest('fieldset')!).getByRole('button', { name: 'Proceed with refuelling' }));
  expect(run).toHaveBeenCalledWith('aegis', 'bays', 4, {
    refuels: { 'shuttle-bay-omega': 'pallas' },
  }, undefined);
});

it('renders Scrap Refinery generate and conversion choices without conflating skip', async () => {
  useSessionStore.setState({ session: {
    ...session,
    shipResources: { capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 2 } },
    shipDamage: { capybara: { damagedSystemIds: [], destroyed: false } },
    maintenanceCycles: { capybara: { step: 6, revision: 3, results: { '5': 'Reactor powered up.' }, charges: ['scrap-refinery'], refuelled: [] } },
  } });
  render(<MaintenanceSystems name="Capybara" shipId="capybara"
    systems={[{ id: 'scrap-refinery', name: 'Scrap Refinery', timing: 5 }]}
    renderSystem={() => null} rations={null} />);

  const generate = screen.getByRole('radio', { name: 'Generate 1 Scrap' });
  const spend = screen.getByRole('radio', { name: 'Spend 1 Scrap for 3 Materials' });
  expect(generate).toBeChecked();
  expect(spend).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Run Scrap Refinery' }));
  expect(run).toHaveBeenCalledWith('capybara', 'production', 3, {
    productionConsoleId: 'scrap-refinery',
  }, undefined);

  run.mockClear();
  await userEvent.click(spend);
  expect(spend).toBeChecked();
  expect(screen.getByRole('button', { name: 'Skip Scrap Refinery' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Run Scrap Refinery' }));
  expect(run).toHaveBeenCalledWith('capybara', 'production', 3, {
    productionConsoleId: 'scrap-refinery', productionScrap: true,
  }, undefined);
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
  expect(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Cycle 2' })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: /Begin Maintenance/ }));
  await userEvent.tab();
  expect(screen.queryByRole('button', { name: 'ARE YOU SURE?' })).not.toBeInTheDocument();
  expect(run).not.toHaveBeenCalled();
});

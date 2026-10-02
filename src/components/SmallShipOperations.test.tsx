import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import SmallShipOperations from './SmallShipOperations';

const { runSmallShipMaintenance, setSmallShipDocking } = vi.hoisted(() => ({
  runSmallShipMaintenance: vi.fn().mockResolvedValue(undefined),
  setSmallShipDocking: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/smallShipService', () => ({ runSmallShipMaintenance, setSmallShipDocking }));

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setSession({
    id: 's1', phase: 'active', currentTurn: 2, activeVesselIds: ['aegis'],
    smallShipStates: {
      gorgoneion: {
        id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 1,
        population: 1_000, unrest: 0,
        cycle: { step: 0, revision: 0, results: {}, charges: [] },
      },
    },
  } as never);
});

it('shows the registered Missile Array rule while withholding its future firing action', () => {
  render(<SmallShipOperations />);

  const gorgoneion = screen.getByRole('region', { name: 'Gorgoneion small-ship operations' });
  const systems = within(gorgoneion).getByRole('region', { name: 'Gorgoneion registered systems' });
  const missileArray = within(systems).getByRole('article', {
    name: 'Missile Array system // unavailable',
  });
  expect(missileArray).toHaveTextContent('Wolf attack // not charged');
  expect(missileArray).toHaveTextContent('3 dice total: one at long, one at medium, and one at short range');
  expect(missileArray).toHaveTextContent('6+ / 5+ / 4+');
  expect(missileArray).toHaveTextContent('each target at most once per phase');
  expect(missileArray).toHaveTextContent(/action unavailable.*range-phase.*prompt 455/i);
  expect(within(missileArray).queryByRole('button')).not.toBeInTheDocument();
});

it('keeps a mutinous craft visible while disabling its ordinary operations', () => {
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...session,
    smallShipStates: {
      ...session.smallShipStates,
      gorgoneion: {
        ...session.smallShipStates!.gorgoneion!,
        unrest: 8,
        mutiny: { status: 'active', revision: 1, triggerUnrest: 8, triggeredAt: 'now' },
      },
    },
  });

  render(<SmallShipOperations />);
  const gorgoneion = screen.getByRole('region', { name: 'Gorgoneion small-ship operations' });
  expect(within(gorgoneion).getByText(/mutiny.*new captain/i)).toBeVisible();
  expect(within(gorgoneion).getByRole('button', { name: /Begin small-ship cycle/i })).toBeDisabled();
  expect(within(gorgoneion).getByRole('button', { name: /Undock after cycle/i })).toBeDisabled();
});

it('shows the Force Field before-targeting deadline without offering retroactive selection', () => {
  render(<SmallShipOperations />);

  const gorgoneion = screen.getByRole('region', { name: 'Gorgoneion small-ship operations' });
  const forceField = within(gorgoneion).getByRole('article', {
    name: 'Force Field Projector system // unavailable',
  });
  expect(forceField).toHaveTextContent('Wolf attack // not charged');
  expect(forceField).toHaveTextContent('Before targeting, choose 1 ship');
  expect(forceField).toHaveTextContent('end of the Wolf attack');
  expect(forceField).toHaveTextContent('damage that ship takes by 2');
  expect(forceField).toHaveTextContent(/selection is unavailable.*before-targeting.*cannot occur after targeting begins.*prompt 437/i);
  expect(within(forceField).queryByRole('button')).not.toBeInTheDocument();
});

it('charges the canonical Missile Array id and renders only authoritative charge state', async () => {
  const user = userEvent.setup();
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...session,
    smallShipStates: {
      ...session.smallShipStates,
      gorgoneion: {
        ...session.smallShipStates!.gorgoneion!,
        cycle: { step: 4, revision: 7, results: {}, charges: [], turn: 2 },
      },
    },
  });
  render(<SmallShipOperations />);

  const gorgoneion = screen.getByRole('region', { name: 'Gorgoneion small-ship operations' });
  const missileArray = within(gorgoneion).getByRole('article', {
    name: 'Missile Array system // unavailable',
  });
  expect(missileArray).toHaveTextContent('not charged');
  await user.click(within(gorgoneion).getByRole('checkbox', { name: 'Missile Array' }));
  await user.click(within(gorgoneion).getByRole('button', { name: 'Charge selected consoles' }));
  expect(runSmallShipMaintenance).toHaveBeenCalledWith(
    'gorgoneion', 'reactor', 7, { consoles: ['missile-array'] },
  );

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    smallShipStates: {
      ...useSessionStore.getState().session!.smallShipStates,
      gorgoneion: {
        ...useSessionStore.getState().session!.smallShipStates!.gorgoneion!,
        cycle: { step: 5, revision: 8, results: {}, charges: ['missile-array'], turn: 2 },
      },
    },
  }));
  expect(missileArray).toHaveTextContent('Wolf attack // charged');
  expect(within(missileArray).queryByRole('button')).not.toBeInTheDocument();
});

it('charges the canonical Force Field Projector id and renders only authoritative charge state', async () => {
  const user = userEvent.setup();
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...session,
    smallShipStates: {
      ...session.smallShipStates,
      gorgoneion: {
        ...session.smallShipStates!.gorgoneion!,
        cycle: { step: 4, revision: 9, results: {}, charges: [], turn: 2 },
      },
    },
  });
  render(<SmallShipOperations />);

  const gorgoneion = screen.getByRole('region', { name: 'Gorgoneion small-ship operations' });
  const forceField = within(gorgoneion).getByRole('article', {
    name: 'Force Field Projector system // unavailable',
  });
  await user.click(within(gorgoneion).getByRole('checkbox', { name: 'Force Field Projector' }));
  await user.click(within(gorgoneion).getByRole('button', { name: 'Charge selected consoles' }));
  expect(runSmallShipMaintenance).toHaveBeenCalledWith(
    'gorgoneion', 'reactor', 9, { consoles: ['force-field-projector'] },
  );

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    smallShipStates: {
      ...useSessionStore.getState().session!.smallShipStates,
      gorgoneion: {
        ...useSessionStore.getState().session!.smallShipStates!.gorgoneion!,
        cycle: { step: 5, revision: 10, results: {}, charges: ['force-field-projector'], turn: 2 },
      },
    },
  }));
  expect(forceField).toHaveTextContent('Wolf attack // charged');
  expect(within(forceField).queryByRole('button')).not.toBeInTheDocument();
});

it('registers and charges the Vulcan Laser Cannon without exposing a firing control', async () => {
  const user = userEvent.setup();
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...session,
    smallShipStates: {
      ...session.smallShipStates,
      vulcan: {
        id: 'vulcan', hostShipId: 'aegis', dockingRevision: 1, population: 15_000, unrest: 0,
        cycle: { step: 4, revision: 11, results: {}, charges: [], turn: 2 },
      },
    },
  });
  render(<SmallShipOperations />);

  const vulcan = screen.getByRole('region', { name: 'Vulcan small-ship operations' });
  const laser = within(vulcan).getByRole('article', { name: 'Laser Cannon system // unavailable' });
  expect(laser).toHaveTextContent('Wolf attack // not charged');
  expect(laser).toHaveTextContent('medium and short range');
  expect(laser).toHaveTextContent('roll 2 dice');
  expect(laser).toHaveTextContent('1 damage on a 4+');
  expect(laser).toHaveTextContent(/action unavailable.*prompts 439 \/ 440/i);
  expect(within(laser).queryByRole('button')).not.toBeInTheDocument();

  await user.click(within(vulcan).getByRole('checkbox', { name: 'Laser Cannon' }));
  await user.click(within(vulcan).getByRole('button', { name: 'Charge selected consoles' }));
  expect(runSmallShipMaintenance).toHaveBeenCalledWith(
    'vulcan', 'reactor', 11, { consoles: ['laser-cannon'] },
  );
});

it.each([
  ['gorgoneion', 'Gorgoneion', 2],
  ['warrior', 'Warrior', 1],
] as const)('offers the working Repair Drones charge for %s within its reactor capacity', async (id, name, capacity) => {
  const user = userEvent.setup();
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...session,
    smallShipStates: {
      ...session.smallShipStates,
      [id]: {
        id, hostShipId: 'aegis', dockingRevision: 1, population: 1_000, unrest: 0,
        cycle: { step: 4, revision: 12, results: {}, charges: [], turn: 2 },
      },
    },
  });
  render(<SmallShipOperations />);
  const craft = screen.getByRole('region', { name: `${name} small-ship operations` });
  const drones = within(craft).getByRole('checkbox', { name: 'Repair Drones' });
  await user.click(drones);
  const otherChoices = within(craft).getAllByRole('checkbox').filter((choice) => choice !== drones);
  if (capacity === 1) otherChoices.forEach((choice) => expect(choice).toBeDisabled());
  else {
    await user.click(within(craft).getByRole('checkbox', { name: 'Missile Array' }));
    expect(within(craft).getByRole('checkbox', { name: 'Force Field Projector' })).toBeDisabled();
  }
  await user.click(within(craft).getByRole('button', { name: 'Charge selected consoles' }));
  expect(runSmallShipMaintenance).toHaveBeenCalledWith(id, 'reactor', 12, {
    consoles: capacity === 1 ? ['repair-drones'] : ['repair-drones', 'missile-array'],
  });
});

it.each([
  ['Gorgoneion', 'gorgoneion', 'Repair Drones', 'repair-drones'],
  ['base Capybara', 'capybara-small', 'Water Reclimator', 'water-reclimator'],
] as const)('lets the GM charge %s Jump Drive alongside %s within two charges', async (name, id, secondConsole, secondId) => {
  const user = userEvent.setup();
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...session,
    smallShipStates: {
      ...session.smallShipStates,
      [id]: {
        id, hostShipId: 'aegis', dockingRevision: 1, population: id === 'gorgoneion' ? 1_000 : 2_000, unrest: 0,
        cycle: { step: 4, revision: 12, results: {}, charges: [], turn: 2, chargingSkipped: false },
      },
    },
  } as never);
  render(<SmallShipOperations />);

  const craft = screen.getByRole('region', { name: `${name} small-ship operations` });
  const jumpDrive = within(craft).getByRole('checkbox', { name: 'Jump Drive' });
  const second = within(craft).getByRole('checkbox', { name: secondConsole });
  await user.click(jumpDrive);
  await user.click(second);

  for (const choice of within(craft).getAllByRole('checkbox')) {
    if (choice === jumpDrive || choice === second) expect(choice).toBeEnabled();
    else expect(choice).toBeDisabled();
  }

  await user.click(within(craft).getByRole('button', { name: 'Charge selected consoles' }));
  expect(runSmallShipMaintenance).toHaveBeenCalledWith(id, 'reactor', 12, {
    consoles: ['jump-drive', secondId],
  });
});

it('keeps the base Capybara Jump Drive selector unavailable when the expansion ship is active', () => {
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...session,
    expansion: 'capybara', capybaraEnabled: true,
    smallShipStates: {
      ...session.smallShipStates,
      'capybara-small': {
        id: 'capybara-small', hostShipId: 'aegis', dockingRevision: 1, population: 2_000, unrest: 0,
        cycle: { step: 4, revision: 12, results: {}, charges: [], turn: 2 },
      },
    },
  } as never);
  render(<SmallShipOperations />);

  const capybara = screen.getByRole('region', { name: 'Capybara small-ship operations' });
  expect(within(capybara).getByText(/unavailable.*expansion Capybara uses the full-ship rules/i)).toBeVisible();
  expect(within(capybara).queryByRole('checkbox', { name: 'Jump Drive' })).not.toBeInTheDocument();
});

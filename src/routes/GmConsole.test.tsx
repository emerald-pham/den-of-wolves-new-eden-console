import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import { INITIAL_SHIP_RESOURCES } from '@/data/resources';
import { recommendedRoleIds } from '@/data/rolePresets';
import GmConsole from './GmConsole';

vi.mock('@/lib/sessionService', () => ({
  assignWolves: vi.fn(),
  assignWolfRoles: vi.fn(),
  resetWolves: vi.fn(),
  kickGmInstance: vi.fn(),
  setCapybaraEnabled: vi.fn(),
  setDioneEnabled: vi.fn(),
  setDebriefMode: vi.fn(),
  setGmControlsLocked: vi.fn(),
  advanceTurn: vi.fn(),
  setActiveRoleConfiguration: vi.fn(),
  applyShipCounterSteps: vi.fn(),
  triggerDradisContact: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeConnectedPlayers: vi.fn(),
  subscribeGmInstances: vi.fn(),
  subscribeSessionEvents: vi.fn(),
  subscribeDamageDraws: vi.fn(),
}));

const { assignWolves, assignWolfRoles, resetWolves, kickGmInstance, setCapybaraEnabled, setDioneEnabled, setDebriefMode, setGmControlsLocked,
  advanceTurn, setActiveRoleConfiguration, applyShipCounterSteps, triggerDradisContact } =
  await import('@/lib/sessionService');
const { subscribeConnectedPlayers, subscribeGmInstances, subscribeSessionEvents, subscribeDamageDraws } =
  await import('@/lib/firestore');

const local = {
  id: 'local-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
  deviceLabel: 'macOS / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
};
const other = {
  id: 'other-1', sessionId: 's1', uid: 'u2', name: 'Tablet',
  deviceLabel: 'iPad / Safari', claimedAt: '2026-01-01T00:01:00.000Z',
};

function renderConsole() {
  return render(
    <MemoryRouter initialEntries={['/gm']}>
      <Routes>
        <Route
          path="/console"
          element={<><p>Role selection route</p><Link to="/gm">Return to GM console</Link></>}
        />
        <Route path="/gm" element={<GmConsole />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null,
      joinedAt: '2026-01-01T00:00:00.000Z',
    },
  );
  vi.mocked(subscribeSessionEvents).mockImplementation((_sessionId, onEvents) => {
    onEvents([]);
    return vi.fn();
  });
  vi.mocked(subscribeDamageDraws).mockImplementation((_sessionId, onDraws) => {
    onDraws([]);
    return vi.fn();
  });
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([]);
    return vi.fn();
  });
});

afterEach(() => vi.clearAllMocks());

function streamInstances(instances: readonly typeof local[]) {
  vi.mocked(subscribeGmInstances).mockImplementation((_sessionId, onInstances) => {
    onInstances(instances);
    return vi.fn();
  });
}

it('redirects browsers without a local GM claim', () => {
  renderConsole();
  expect(screen.getByText('Role selection route')).toBeInTheDocument();
});

it('lists every GM instance and only offers to kick other instances', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local, other]);
  renderConsole();

  expect(await screen.findByText('Bridge laptop')).toBeInTheDocument();
  expect(screen.getByText('Tablet')).toBeInTheDocument();
  expect(screen.getByText('iPad / Safari')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /kick/i })).toHaveLength(1);
});

it('returns to role selection', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await screen.findByText('Bridge laptop');
  await user.click(screen.getByRole('link', { name: /back to role selection/i }));

  expect(screen.getByText('Role selection route')).toBeInTheDocument();
});

it('kicks another instance and removes it from the list', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local, other]);
  vi.mocked(kickGmInstance).mockResolvedValue('applied');
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /kick tablet/i }));

  expect(kickGmInstance).toHaveBeenCalledWith('other-1');
  await waitFor(() => expect(screen.queryByText('Tablet')).not.toBeInTheDocument());
});

it('updates when the live GM instance stream changes', async () => {
  let publish: ((instances: readonly typeof local[]) => void) | undefined;
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(subscribeGmInstances).mockImplementation((_sessionId, onInstances) => {
    publish = onInstances;
    onInstances([local]);
    return vi.fn();
  });
  renderConsole();
  await screen.findByText('Bridge laptop');

  act(() => publish?.([local, other]));

  expect(await screen.findByText('Tablet')).toBeInTheDocument();
});

it('groups connected players by command role in the GM console', async () => {
  const stopPlayers = vi.fn();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([
      {
        uid: 'u1', sessionId: 's1', displayName: 'Morgan', role: 'gm', seatId: null,
        activeConsoleRoleId: null, joinedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        uid: 'u2', sessionId: 's1', displayName: 'Ari', role: 'player', seatId: null,
        activeConsoleRoleId: 'dione-captain', joinedAt: '2026-01-01T00:01:00.000Z',
      },
      {
        uid: 'u3', sessionId: 's1', displayName: 'Bea', role: 'player', seatId: null,
        activeConsoleRoleId: 'dione-captain', joinedAt: '2026-01-01T00:02:00.000Z',
      },
      {
        uid: 'u4', sessionId: 's1', displayName: 'Cy', role: 'player', seatId: null,
        activeConsoleRoleId: null, joinedAt: '2026-01-01T00:03:00.000Z',
      },
    ]);
    return stopPlayers;
  });

  const { unmount } = renderConsole();
  const roster = await screen.findByRole('region', { name: /connected players by role/i });

  expect(within(roster).getByText('Dione // Captain')).toBeInTheDocument();
  expect(within(roster).getByText('Ari')).toBeInTheDocument();
  expect(within(roster).getByText('Bea')).toBeInTheDocument();
  expect(within(roster).getByText('GM')).toBeInTheDocument();
  expect(within(roster).getByText('Morgan')).toBeInTheDocument();
  expect(within(roster).getByText('Unassigned')).toBeInTheDocument();
  expect(within(roster).getByText('Cy')).toBeInTheDocument();

  unmount();
  expect(stopPlayers).toHaveBeenCalledOnce();
});

it('shows fleet DRADIS and jumps between ship perspectives', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const { container } = renderConsole();

  expect(await screen.findByRole('region', { name: /fleet dradis/i })).toBeInTheDocument();
  expect(screen.getByText(/dradis perspective.*aegis/i)).toBeInTheDocument();
  expect(screen.getByText('DRADIS perspective // AEGIS // GALACTIC COORDINATES // 0000'))
    .toBeInTheDocument();
  const aegisScan = container.querySelector('.gm-dradis .contact-plot__rig');

  await user.click(screen.getByRole('button', { name: /view dradis from shepherd/i }));

  expect(screen.getByText(/dradis perspective.*shepherd/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /view dradis from shepherd/i }))
    .toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('.gm-dradis .contact-plot__rig')).not.toBe(aegisScan);
});

it('forwards gameplay-defined fleet ranges into the GM DRADIS without recalculating coordinates', () => {
  const console = readFileSync('src/routes/GmConsole.tsx', 'utf8');

  expect(console).toMatch(/color: ship\.color,\s+combatRange: ship\.combatRange,/);
});

it('shows live resource stock for every flagged ship', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const activeSession = useSessionStore.getState().session;
  if (activeSession) useSessionStore.getState().setSession({
    ...activeSession,
    shipResources: {
      ...INITIAL_SHIP_RESOURCES,
      dione: { ...INITIAL_SHIP_RESOURCES.dione!, fuel: 6 },
    },
    shipUnrest: { dione: 4 },
  });
  renderConsole();

  const fleet = await screen.findByRole('region', { name: /fleet resource controls/i });
  for (const shipName of [
    'AEGIS', 'Dione', 'Icebreaker', 'Capybara', 'Shepherd', 'Quellon', 'Refinery 124',
  ]) {
    const ship = within(fleet).getByRole('group', { name: `${shipName} resource controls` });
    expect(within(ship).getByRole('img', { name: `${shipName} flag` })).toBeInTheDocument();
  }
  const dione = within(fleet).getByRole('group', { name: 'Dione resource controls' });
  expect(within(dione).getByRole('heading', { name: 'Census' })).toBeInTheDocument();
  expect(within(dione).getByLabelText('Strytium Fuel: 6')).toBeInTheDocument();
  expect(within(dione).getByRole('img', { name: 'Strytium Fuel icon' })).toBeInTheDocument();
  expect(within(dione).getByLabelText('Civil Unrest: 4')).toBeInTheDocument();
  expect(within(dione).getByRole('img', { name: 'Civil Unrest icon' })).toBeInTheDocument();
  expect(within(dione).getByLabelText('Survivor Population: 100000')).toBeInTheDocument();
  expect(within(dione).getByRole('button', { name: /increase survivor population/i }))
    .toBeDisabled();
  expect(within(dione).getByRole('button', { name: /increase strytium fuel/i })).toBeDisabled();
  expect(within(dione).getByRole('button', { name: /decrease survivor population/i }))
    .toBeDisabled();
  expect(within(dione).getByRole('button', { name: /increase civil unrest/i })).toBeDisabled();

  await user.click(within(fleet).getByRole('button', { name: /ship numbers write mode/i }));

  expect(within(dione).getByRole('button', { name: /decrease survivor population/i }))
    .toBeEnabled();
  expect(within(dione).getByRole('button', { name: /increase civil unrest/i })).toBeEnabled();
});

it('keeps resource stores read-only until enabled and resets after leaving', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const fleet = await screen.findByRole('region', { name: /fleet resource controls/i });
  const dione = within(fleet).getByRole('group', { name: 'Dione resource controls' });
  const writeMode = within(fleet).getByRole('button', { name: /ship numbers write mode/i });
  const increaseFuel = within(dione).getByRole('button', { name: /increase strytium fuel/i });

  expect(writeMode).toHaveAttribute('aria-pressed', 'false');
  expect(within(fleet).getByText(/ship number access.*read only/i)).toBeInTheDocument();
  expect(increaseFuel).toBeDisabled();

  await user.click(writeMode);
  expect(writeMode).toHaveAttribute('aria-pressed', 'true');
  expect(within(fleet).getByText(/ship number access.*write mode/i)).toBeInTheDocument();
  expect(increaseFuel).toBeEnabled();

  await user.click(screen.getByRole('link', { name: /back to role selection/i }));
  await user.click(screen.getByRole('link', { name: /return to gm console/i }));

  const returnedFleet = await screen.findByRole('region', { name: /fleet resource controls/i });
  expect(within(returnedFleet).getByRole('button', { name: /ship numbers write mode/i }))
    .toHaveAttribute('aria-pressed', 'false');
  expect(within(
    within(returnedFleet).getByRole('group', { name: 'Dione resource controls' }),
  ).getByRole('button', { name: /increase strytium fuel/i })).toBeDisabled();
});

it('updates a GM counter immediately and sends rapid changes in one ordered batch', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const activeSession = useSessionStore.getState().session;
  if (activeSession) useSessionStore.getState().setSession({
    ...activeSession,
    shipResources: {
      ...INITIAL_SHIP_RESOURCES,
      dione: { ...INITIAL_SHIP_RESOURCES.dione!, fuel: 6 },
    },
  });
  renderConsole();
  const fleet = await screen.findByRole('region', { name: /fleet resource controls/i });

  vi.useFakeTimers();
  try {
    const dione = within(fleet).getByRole('group', { name: 'Dione resource controls' });
    fireEvent.click(within(fleet).getByRole('button', { name: /ship numbers write mode/i }));
    const increaseFuel = within(dione).getByRole('button', { name: /increase strytium fuel/i });
    fireEvent.click(increaseFuel);
    fireEvent.click(increaseFuel);
    fireEvent.click(increaseFuel);

    expect(within(dione).getByLabelText('Strytium Fuel: 9, pending transmission')).toBeInTheDocument();
    expect(applyShipCounterSteps).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(250); });

    expect(applyShipCounterSteps).toHaveBeenCalledTimes(1);
    expect(applyShipCounterSteps).toHaveBeenCalledWith(
      'dione', { counter: 'resource', resourceId: 'fuel' }, [1, 1, 1],
    );
  } finally {
    vi.useRealTimers();
  }
});

it('keeps a locally crossed threshold locked until its alert reaches the session snapshot', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const activeSession = useSessionStore.getState().session;
  if (activeSession) useSessionStore.getState().setSession({
    ...activeSession,
    shipUnrest: { dione: 7 },
  });
  vi.mocked(applyShipCounterSteps).mockImplementation(async () => {
    const current = useSessionStore.getState().session;
    if (current) useSessionStore.getState().setSession({
      ...current,
      shipUnrest: { ...current.shipUnrest, dione: 8 },
    });
    return { amount: 8, alertRaised: true } as never;
  });
  renderConsole();
  const fleet = await screen.findByRole('region', { name: /fleet resource controls/i });

  vi.useFakeTimers();
  try {
    const dione = within(fleet).getByRole('group', { name: 'Dione resource controls' });
    fireEvent.click(within(fleet).getByRole('button', { name: /ship numbers write mode/i }));
    const increaseUnrest = within(dione).getByRole('button', { name: /increase civil unrest/i });
    fireEvent.click(increaseUnrest);

    expect(within(dione).getByLabelText('Civil Unrest: 8, pending transmission')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(within(dione).getByLabelText('Civil Unrest: 8')).toBeInTheDocument();
    expect(within(dione).getByRole('button', { name: /increase civil unrest/i })).toBeDisabled();
    expect(within(dione).getByRole('button', { name: /decrease civil unrest/i })).toBeDisabled();
  } finally {
    vi.useRealTimers();
  }
});

it('starts with a compact DRADIS and expands it on demand', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const dradis = await screen.findByRole('region', { name: /fleet dradis/i });
  expect(dradis).toHaveAttribute('data-expanded', 'false');
  expect(screen.queryByRole('complementary', { name: 'Combat range bands' }))
    .not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /expand dradis display/i }));

  expect(dradis).toHaveAttribute('data-expanded', 'true');
  expect(screen.getByRole('button', { name: /collapse dradis display/i })).toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Combat range bands' }))
    .toHaveTextContent('COMBAT RANGES // LONG // MEDIUM // SHORT');
});

it('keeps each airspace-window countdown in compact and expanded fleet DRADIS', async () => {
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    currentTurn: 1,
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  } as never);
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  expect(await screen.findByRole('status', {
    name: /Airspace restricted \/\/ \d{2}:\d{2} remaining/i,
  })).toHaveAttribute('data-tone', 'blue');
  fireEvent.click(screen.getByRole('button', { name: /expand dradis display/i }));
  expect(screen.getByRole('status', {
    name: /Airspace restricted \/\/ \d{2}:\d{2} remaining/i,
  })).toHaveAttribute('data-tone', 'blue');

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
  }));

  expect(screen.getByRole('status', {
    name: /Airspace open \/\/ \d{2}:\d{2} remaining/i,
  })).toHaveAttribute('data-tone', 'blue');
});

it('lets the active GM trigger a fleetwide contact only from expanded DRADIS', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  useSessionStore.getState().setConnection('live');
  streamInstances([local]);
  vi.mocked(triggerDradisContact).mockResolvedValue(undefined);
  renderConsole();

  await screen.findByRole('region', { name: /fleet dradis/i });
  expect(screen.queryByRole('button', { name: /trigger unknown contact/i }))
    .not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /expand dradis display/i }));
  await user.click(screen.getByRole('button', { name: /trigger unknown contact/i }));

  expect(triggerDradisContact).toHaveBeenCalledOnce();
});

it('eases the GM DRADIS through both expansion and collapse', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const dradis = await screen.findByRole('region', { name: /fleet dradis/i });
  const compact = { left: 600, top: 180, width: 320, height: 420 } as DOMRect;
  const expanded = { left: 0, top: 0, width: 1200, height: 800 } as DOMRect;
  const measure = vi.spyOn(dradis, 'getBoundingClientRect')
    .mockReturnValueOnce(compact)
    .mockReturnValueOnce(expanded)
    .mockReturnValueOnce(expanded)
    .mockReturnValueOnce(compact);
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }) as unknown as Animation);
  Object.defineProperty(dradis, 'animate', { configurable: true, value: animate });

  await user.click(screen.getByRole('button', { name: /expand dradis display/i }));

  expect(animate).toHaveBeenNthCalledWith(1, [
    { transform: 'translate(600px, 180px) scale(0.26666666666666666, 0.525)' },
    { transform: 'none' },
  ], { duration: 200, easing: 'ease-in-out' });

  await user.click(screen.getByRole('button', { name: /collapse dradis display/i }));

  expect(cancel).toHaveBeenCalledOnce();
  expect(animate).toHaveBeenNthCalledWith(2, [
    { transform: 'translate(-600px, -180px) scale(3.75, 1.9047619047619047)' },
    { transform: 'none' },
  ], { duration: 200, easing: 'ease-in-out' });
  expect(measure).toHaveBeenCalledTimes(4);
});

it('keeps Capybara convoy setup under a GM Console Setup subsection', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const setup = await screen.findByRole('button', { name: /^setup$/i });
  expect(setup).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: /turn capybara off/i })).not.toBeInTheDocument();

  await user.click(setup);

  expect(setup).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: /turn capybara off/i })).toBeInTheDocument();
});

it('keeps roster edits local until the GM confirms one complete configuration', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(setActiveRoleConfiguration).mockImplementation(async (activeRoleIds) => {
    const activeSession = useSessionStore.getState().session;
    if (activeSession) useSessionStore.getState().setSession({
      ...activeSession,
      activeRoleIds,
    });
    return 'applied';
  });
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  const playerCount = screen.getByRole('combobox', { name: /^recommended player count$/i });
  expect(screen.getByText(/edit the roster locally, then confirm it once/i)).toBeInTheDocument();
  expect(screen.getByText(/union replacements are available only in their printed low-count roster rows/i)).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: /press officer role availability/i })).toBeChecked();
  expect(screen.queryByRole('switch', {
    name: /quellon \/ refinery engineer role availability/i,
  })).not.toBeInTheDocument();

  await user.selectOptions(playerCount, '14');
  expect(setActiveRoleConfiguration).not.toHaveBeenCalled();
  expect(screen.getByText(/unconfirmed changes/i)).toBeInTheDocument();
  expect(screen.getByRole('switch', {
    name: /quellon \/ refinery engineer role availability/i,
  })).toBeChecked();
  for (const switchControl of screen.getAllByRole('switch', {
    name: /^engineer role availability$/i,
  })) {
    expect(switchControl).not.toBeChecked();
  }

  await user.selectOptions(playerCount, '20');
  expect(screen.queryByRole('switch', {
    name: /quellon \/ refinery engineer role availability/i,
  })).not.toBeInTheDocument();

  await user.click(screen.getByRole('switch', { name: /executive officer role availability/i }));
  expect(setActiveRoleConfiguration).not.toHaveBeenCalled();
  expect(screen.getByText(/^custom$/i)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /confirm roster/i }));
  expect(setActiveRoleConfiguration).toHaveBeenCalledOnce();
  const confirmedRoleIds = vi.mocked(setActiveRoleConfiguration).mock.calls[0]?.[0] ?? [];
  expect(confirmedRoleIds).toEqual(expect.arrayContaining(
    recommendedRoleIds(20).filter((roleId) => roleId !== 'executive-officer'),
  ));
  expect(confirmedRoleIds).toHaveLength(19);
  expect(confirmedRoleIds).not.toContain('executive-officer');
  await waitFor(() => expect(screen.getByText(/roster synchronized/i)).toBeInTheDocument());
});

it('stages a correction when an older roster has an invalid Union replacement', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    activeRoleIds: [...recommendedRoleIds(20), 'joint-engineering-quellon-refinery'],
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));

  expect(screen.getByText(/unconfirmed changes/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /confirm roster/i })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: /confirm roster/i }));

  const correctedRoleIds = vi.mocked(setActiveRoleConfiguration).mock.calls[0]?.[0] ?? [];
  expect(correctedRoleIds).toEqual(expect.arrayContaining([...recommendedRoleIds(20)]));
  expect(correctedRoleIds).toHaveLength(recommendedRoleIds(20).length);
});

it('groups setup roles by ship and labels every ship with its flag', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));

  const activeRoles = screen.getByRole('group', { name: /^active roles$/i });
  for (const shipName of [
    'AEGIS', 'Dione', 'Icebreaker', 'Capybara', 'Shepherd', 'Quellon', 'Refinery 124',
  ]) {
    const ship = within(activeRoles).getByRole('group', { name: `${shipName} roles` });
    expect(within(ship).getByRole('img', { name: `${shipName} flag` })).toBeInTheDocument();
  }
  expect(within(
    within(activeRoles).getByRole('group', { name: 'AEGIS roles' }),
  ).getByRole('switch', { name: /admiral role availability/i })).toBeInTheDocument();
  expect(within(
    within(activeRoles).getByRole('group', { name: 'Dione roles' }),
  ).getByRole('switch', { name: /captain role availability/i })).toBeInTheDocument();

  expect(screen.queryByRole('group', { name: /^wolf eligibility$/i })).not.toBeInTheDocument();
});

it('sends only the final draft after a GM confirms it', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await userEvent.setup().click(await screen.findByRole('button', { name: /^setup$/i }));
  const playerCount = screen.getByRole('combobox', { name: /^recommended player count$/i });
  fireEvent.change(playerCount, { target: { value: '18' } });
  fireEvent.change(playerCount, { target: { value: '20' } });

  expect(setActiveRoleConfiguration).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole('button', { name: /confirm roster/i }));
  expect(setActiveRoleConfiguration).toHaveBeenCalledOnce();
  expect(vi.mocked(setActiveRoleConfiguration).mock.calls[0]?.[0])
    .toEqual(expect.arrayContaining([...recommendedRoleIds(20)]));
});

it('offers random or manual wolf assignments from the active roles', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(assignWolves).mockResolvedValue(['press-officer']);
  vi.mocked(assignWolfRoles).mockResolvedValue(['press-officer']);
  vi.mocked(resetWolves).mockResolvedValue(undefined);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  expect(screen.queryByRole('group', { name: /^wolf eligibility$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('switch', { name: /wolf/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /randomly assign 1 wolf/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /randomly assign 2 wolves/i })).toBeEnabled();

  await user.click(screen.getByRole('button', { name: /randomly assign 1 wolf/i }));
  expect(assignWolves).toHaveBeenCalledWith(1);
  expect(await screen.findByText(/assigned.*press officer/i)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /reset wolves/i }));

  await user.click(screen.getByRole('checkbox', { name: /press officer manual wolf assignment/i }));
  await user.click(screen.getByRole('button', { name: /assign selected wolves/i }));
  expect(assignWolfRoles).toHaveBeenCalledWith(['press-officer']);

});

it('locks assigned wolf checkmarks until the GM resets them', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(assignWolfRoles).mockResolvedValue(['press-officer']);
  vi.mocked(resetWolves).mockResolvedValue(undefined);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  const pressOfficer = screen.getByRole('checkbox', {
    name: /press officer manual wolf assignment/i,
  });
  await user.click(pressOfficer);
  await user.click(screen.getByRole('button', { name: /assign selected wolves/i }));

  expect(pressOfficer).toBeChecked();
  expect(pressOfficer).toBeDisabled();
  expect(screen.getByRole('button', { name: /assign selected wolves/i })).toBeDisabled();

  await user.click(screen.getByRole('button', { name: /reset wolves/i }));

  expect(resetWolves).toHaveBeenCalledOnce();
  expect(pressOfficer).not.toBeChecked();
  expect(pressOfficer).toBeEnabled();
});

it('toggles Capybara off for the session and removes its perspective', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(setCapybaraEnabled).mockImplementation(async (enabled) => {
    const session = useSessionStore.getState().session;
    if (session) useSessionStore.getState().setSession({ ...session, capybaraEnabled: enabled });
    return 'applied';
  });
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  expect(screen.getByRole('button', { name: /turn capybara off/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /view dradis from capybara/i })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /turn capybara off/i }));

  expect(setCapybaraEnabled).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog', { name: /change convoy manifest/i }))
    .toHaveTextContent(/remove capybara/i);
  await user.click(screen.getByRole('button', { name: /confirm remove capybara/i }));

  expect(setCapybaraEnabled).toHaveBeenCalledWith(false);
  expect(await screen.findByRole('button', { name: /turn capybara on/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /view dradis from capybara/i }))
    .not.toBeInTheDocument();
});

it('toggles Dione off for the session and removes its perspective', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(setDioneEnabled).mockImplementation(async (enabled) => {
    const session = useSessionStore.getState().session;
    if (session) useSessionStore.getState().setSession({ ...session, dioneEnabled: enabled });
    return 'applied';
  });
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  expect(screen.getByRole('button', { name: /turn dione off/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /view dradis from dione/i })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /turn dione off/i }));

  expect(setDioneEnabled).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog', { name: /change convoy manifest/i }))
    .toHaveTextContent(/remove dione/i);
  await user.click(screen.getByRole('button', { name: /confirm remove dione/i }));

  expect(setDioneEnabled).toHaveBeenCalledWith(false);
  expect(await screen.findByRole('button', { name: /turn dione on/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /view dradis from dione/i }))
    .not.toBeInTheDocument();
});

it('can cancel adding Capybara back to the convoy', async () => {
  const user = userEvent.setup();
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...session, capybaraEnabled: false });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  await user.click(screen.getByRole('button', { name: /turn capybara on/i }));
  expect(screen.getByRole('alertdialog', { name: /change convoy manifest/i }))
    .toHaveTextContent(/add capybara/i);
  await user.click(screen.getByRole('button', { name: /cancel convoy change/i }));

  expect(setCapybaraEnabled).not.toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /turn capybara on/i })).toBeInTheDocument();
});

it('locks and unlocks subsequent GM registration without locking Setup', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(setGmControlsLocked).mockImplementation(async (locked) => {
    const activeSession = useSessionStore.getState().session;
    if (activeSession) {
      useSessionStore.getState().setSession({ ...activeSession, gmControlsLocked: locked });
    }
    return 'applied';
  });
  renderConsole();

  await user.click(await screen.findByRole('button', {
    name: /lock gm registration/i,
  }));

  expect(setGmControlsLocked).toHaveBeenCalledWith(true);
  expect(await screen.findByRole('button', {
    name: /unlock gm registration/i,
  })).toHaveAttribute('aria-pressed', 'true');
  const setup = screen.getByRole('button', { name: /^setup$/i });
  expect(setup).toBeEnabled();
  await user.click(setup);
  expect(screen.getByRole('group', { name: /active roles/i })).toBeInTheDocument();
});

it('requires a deliberate second GM advance while either phase timer is active', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    currentTurn: 3,
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 20 * 60_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  } as never);
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(advanceTurn).mockResolvedValue(undefined);
  renderConsole();

  expect(screen.getByText('Turn 3')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Advance to Turn 4' }));
  expect(advanceTurn).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'ARE YOU SURE? // Advance to Turn 4' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'ARE YOU SURE? // Advance to Turn 4' }));
  expect(advanceTurn).toHaveBeenCalledOnce();
  expect(advanceTurn).toHaveBeenCalledWith({ overridePhaseTimer: true });
});

it('requires a deliberate second press to lower the finale, then lets the GM retract it', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(setDebriefMode).mockImplementation(async (active) => {
    const activeSession = useSessionStore.getState().session;
    if (activeSession) {
      const revision = activeSession.debriefMode?.revision ?? 0;
      useSessionStore.getState().setSession({
        ...activeSession,
        debriefMode: { active, revision: revision + 1 },
      });
    }
    return 'applied';
  });
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /finale.*enable debrief mode/i }));
  expect(setDebriefMode).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /are you sure.*enable finale/i })).toBeVisible();

  await user.click(screen.getByRole('button', { name: /are you sure.*enable finale/i }));
  expect(setDebriefMode).toHaveBeenCalledWith(true);
  expect(await screen.findByRole('button', { name: /retract finale.*stop confetti/i })).toBeVisible();

  await user.click(screen.getByRole('button', { name: /retract finale.*stop confetti/i }));
  expect(setDebriefMode).toHaveBeenLastCalledWith(false);
});

it('shows Emergency Bridge Confetti Dispenser activations in the console log', async () => {
  let publish: ((events: readonly [{
    id: string; sessionId: string; type: 'ship-confetti'; shipId: string;
    shipName: string; actorName: string; actorRoleName: string; createdAt: string;
  }]) => void) | undefined;
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeSessionEvents).mockImplementation((_sessionId, onEvents) => {
    publish = onEvents;
    onEvents([]);
    return vi.fn();
  });
  renderConsole();
  await waitFor(() => expect(publish).toBeDefined());

  act(() => publish?.([{
      id: 'event-1', sessionId: 's1', type: 'ship-confetti', shipId: 'quellon',
      shipName: 'Quellon', actorName: 'Player', actorRoleName: 'Explorer',
      createdAt: '2026-01-01T00:02:00.000Z',
  }]));

  await screen.findByText(/quellon.*emergency bridge confetti dispenser.*explorer.*player/i);
  expect(screen.getByRole('list', { name: /gm event log/i })).toHaveTextContent(
    /quellon.*emergency bridge confetti dispenser.*explorer.*player/i,
  );
});

it('relays maintenance cycle starts and completions to the GM event log', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeSessionEvents).mockImplementation((_sessionId, onEvents) => {
    onEvents([
      {
        id: 'maintenance-complete', sessionId: 's1', type: 'maintenance',
        shipId: 'aegis', shipName: 'AEGIS', action: 'end',
        createdAt: '2026-01-01T00:04:00.000Z',
      },
      {
        id: 'maintenance-start', sessionId: 's1', type: 'maintenance',
        shipId: 'aegis', shipName: 'AEGIS', action: 'begin',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    return vi.fn();
  });

  renderConsole();

  const log = await screen.findByRole('list', { name: /gm event log/i });
  expect(log).toHaveTextContent(/aegis.*maintenance cycle completed/i);
  expect(log).toHaveTextContent(/aegis.*maintenance cycle started/i);
});

it('flags maintenance cycles that remain incomplete for five minutes', async () => {
  vi.setSystemTime('2026-01-01T00:06:00.000Z');
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    maintenanceCycles: {
      aegis: {
        step: 3, revision: 3, results: {}, charges: [], refuelled: [],
        startedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  });

  renderConsole();

  const alert = await screen.findByRole('alert', { name: /overdue maintenance/i });
  expect(alert).toHaveTextContent(/aegis.*incomplete for 6 minutes/i);
  vi.useRealTimers();
});

it('shows damage draws in the GM log obscured until hover or keyboard focus', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeDamageDraws).mockImplementation((_sessionId, onDraws) => {
    onDraws([{
      id: 'draw-1', sessionId: 's1', type: 'ship-damage', shipId: 'aegis', card: '10♥',
      systemId: 'reactor', systemName: 'Reactor', recycled: false,
      createdAt: '2026-01-01T00:02:00.000Z',
    }]);
    return vi.fn();
  });

  renderConsole();

  const concealed = await screen.findByText(/10♥.*reactor/i);
  expect(concealed).toHaveClass('gm-damage-draw__secret');
  expect(concealed).toHaveAttribute('tabindex', '0');
});

it('mirrors an in-game fullscreen alert as a red GM activity banner', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeSessionEvents).mockImplementation((_sessionId, onEvents) => {
    onEvents([{
      id: 'alert-1', sessionId: 's1', type: 'fullscreen-alert',
      sourceRoleName: 'Admiral', message: 'Reactor containment failure',
      createdAt: '2026-01-01T00:03:00.000Z',
    }]);
    return vi.fn();
  });
  renderConsole();

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/admiral.*reactor containment failure/i);
  expect(alert).toHaveClass('gm-event-alert--critical');
  expect(screen.getByRole('list', { name: /gm event log/i })).toHaveTextContent(
    /reactor containment failure/i,
  );
});

it('moves survivors by printed steps through GM controls and locks pending thresholds', async () => {
  streamInstances([local]);
  useSessionStore.getState().setGmInstance(local);
  renderConsole();
  const controls = screen.getByRole('group', { name: 'Capybara resource controls' });
  expect(within(controls).getByRole('button', { name: 'Increase Survivor Population' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: /ship numbers write mode/i }));
  const decreasePopulation = within(controls).getByRole('button', { name: 'Decrease Survivor Population' });
  fireEvent.click(decreasePopulation);
  fireEvent.click(decreasePopulation);
  fireEvent.click(decreasePopulation);
  fireEvent.click(decreasePopulation);
  expect(within(controls).getByLabelText('Survivor Population: 15000, pending transmission'))
    .toBeInTheDocument();
  expect(within(controls).getByRole('button', { name: 'Decrease Survivor Population' })).toBeDisabled();
  act(() => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!,
    shipSurvivors: { capybara: 15000 },
    populationAlerts: { capybara: { shipId: 'capybara', shipName: 'Capybara', population: 15000, targetGmInstanceIds: [local.id], createdAt: 'now' } },
  }));
  expect(within(controls).getByRole('button', { name: 'Decrease Survivor Population' })).toBeDisabled();
});


it('uses the role workspace with a separate persistent GM instrument rail', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const workspace = screen.getByRole('region', { name: 'GM operations console' });
  expect(within(workspace).getByRole('heading', { name: 'Fleet oversight' })).toBeVisible();
  expect(within(workspace).getByText('Available ships')).toBeVisible();
  expect(within(workspace).getByRole('region', { name: 'Fleet resource controls' })).toBeVisible();
  const instruments = screen.getByRole('complementary', { name: 'GM instruments' });
  expect(within(instruments).getByRole('region', { name: 'Fleet DRADIS' })).toBeVisible();
  expect(within(workspace).queryByRole('region', { name: 'Fleet DRADIS' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Back to role selection' }));
  expect(screen.getByText('Role selection route')).toBeVisible();
});

// Exercise the real render, callable parser and private subscriber; replace external Firebase IO only.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import HummingbirdHarvest from '@/components/HummingbirdHarvest';
import { useSessionStore } from '@/store/useSessionStore';
import { acceptCallableSessionAuthority } from '@/lib/sessionSnapshotAuthority';

const io = vi.hoisted(() => ({
  reply: null as null | ((name: string, data: Record<string, unknown>) => unknown),
  listeners: [] as Array<(snapshot: unknown) => void>,
  calls: [] as Array<{ name: string; data: Record<string, unknown> }>,
}));
vi.mock('firebase/app', () => ({
  getApps: () => [], getApp: () => ({}), initializeApp: () => ({}),
}));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: () => ({}), ReCaptchaEnterpriseProvider: class {},
}));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}), connectFunctionsEmulator: () => undefined,
  httpsCallable: (_instance: unknown, name: string) => async (data: Record<string, unknown>) => {
    io.calls.push({ name, data });
    if (!io.reply) throw new Error('No external callable fixture');
    return { data: await io.reply(name, data) };
  },
}));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  getFirestore: () => ({}), connectFirestoreEmulator: () => undefined,
  doc: (_instance: unknown, path: string) => ({ path }),
  onSnapshot: (_reference: unknown, _options: unknown, next: (value: unknown) => void) => {
    io.listeners.push(next);
    next({ metadata: { fromCache: false }, exists: () => false });
    return () => { io.listeners = io.listeners.filter(listener => listener !== next); };
  },
}));

const timestamp = '2026-10-18T10:42:37.070Z';
let fixtureNumber = 0;
const docking = { shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: timestamp } as const;
const privatePending = {
  sessionId: 's1', ownerUid: 'u1', turn: 1, hostShipId: 'quellon', revision: 1,
  status: 'pending', rolls: [2, 5], requestId: 'fixture-roll', createdAt: timestamp,
};
function publish(value: Record<string, unknown>) {
  for (const listener of io.listeners) listener({
    metadata: { fromCache: false, hasPendingWrites: false },
    exists: () => true, data: () => value,
  });
}
function packet(data: Record<string, unknown>, harvest: Record<string, unknown>) {
  return {
    status: 'committed', sessionId: 's1', requestId: data.requestId, harvest,
    actorUid: 'u1', actorRoleId: 'quellon-explorer', vesselId: 'hummingbird',
    hostShipId: 'quellon', turn: 1, phase: 'active', revision: harvest.revision,
    idempotencyKey: data.requestId, auditId: `hummingbird-harvest-${data.requestId}`,
  };
}
afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  io.calls = []; io.listeners = []; io.reply = null;
  vi.stubGlobal('fetch', () => { throw new Error('NETWORK_FORBIDDEN'); });
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Synthetic feedback', joinCode: '0000', phase: 'active', ownerUid: 'gm1',
    currentTurn: 1, activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon'],
    shuttleDockings: [docking], shuttleFuelled: { hummingbird: true },
    turnPhase: {
      turn: 1, teamPhaseEndsAt: timestamp, openAirspaceEndsAt: timestamp,
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    createdAt: timestamp, updatedAt: timestamp,
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Explorer', role: 'player', seatId: 'quellon-explorer',
    assignedRoleId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer',
    connectionGeneration: 1, fleetGroupId: 'fleet-1',
    joinedAt: timestamp,
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  // Each test starts from a genuinely accepted server cursor, including when
  // this file shares the module's session/UID authority cache between cases.
  const session = useSessionStore.getState().session!;
  const snapshot = { ...session, updatedAt: new Date(Date.parse(timestamp) + ++fixtureNumber * 60_000).toISOString() };
  expect(acceptCallableSessionAuthority(snapshot, 'u1')).toBe(true);
  useSessionStore.getState().setSession(snapshot);
});

it('renders the resolved harvest after the original Explorer selects Die 1 through real callable and projection consumers', async () => {
  const user = userEvent.setup();
  io.reply = (name, data) => {
    if (name === 'rollHummingbirdHarvest') {
      const pending = { ...privatePending, requestId: data.requestId };
      publish(pending);
      return packet(data, pending);
    }
    if (name !== 'allocateHummingbirdHarvest') throw new Error('Unexpected endpoint');
    const resolved = {
      ...privatePending, requestId: data.requestId, status: 'resolved', revision: 2,
      foodDieIndex: 0, food: 2, water: 5, resolvedAt: timestamp,
    };
    publish(resolved);
    return packet(data, resolved);
  };
  render(<HummingbirdHarvest docking={docking} fuelled />);
  await user.click(screen.getByRole('button', { name: 'Roll 2d6 for harvest' }));
  expect(await screen.findByText('Roll ready // choose which die becomes food.', { exact: true })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Die 1: 2 food / 5 water' }));
  expect(await within(screen.getByRole('region', { name: 'Hummingbird resource harvesting' }))
    .findByText(/^Resolved this cycle \/\//)).toHaveTextContent('2 food and 5 water added to Hummingbird cargo.');
  expect(screen.queryByText('Die 1 remains selected for food.', { exact: true })).toBeNull();
  expect(io.calls.map(call => call.name)).toEqual(['rollHummingbirdHarvest', 'allocateHummingbirdHarvest']);
});

it.each([
  ['public cargo first, private snapshot delayed', true, false],
  ['no public authority advance', false, false],
  ['private result delivered before reply', true, true],
] as const)('shows the committed allocation with %s', async (_label, publicFirst, privateFirst) => {
  const user = userEvent.setup();
  io.reply = (name, data) => {
    if (name !== 'allocateHummingbirdHarvest') throw new Error('Unexpected endpoint');
    const current = useSessionStore.getState().session!;
    const cargoSnapshot = {
      ...current, shuttleCargo: { hummingbird: { food: 2, water: 5 } },
      updatedAt: new Date(Date.parse(current.updatedAt) + 733).toISOString(),
    };
    if (publicFirst) {
      expect(acceptCallableSessionAuthority(cargoSnapshot, 'u1')).toBe(true);
      useSessionStore.getState().setSession(cargoSnapshot);
    }
    // The committed server reply is available before the separate private
    // listener delivers revision2. Scope, actor, turn and docking stay current.
    const resolved = {
      ...privatePending, requestId: data.requestId, status: 'resolved', revision: 2,
      foodDieIndex: 0, food: 2, water: 5, resolvedAt: timestamp,
    };
    if (privateFirst) publish(resolved);
    return packet(data, resolved);
  };
  render(<HummingbirdHarvest docking={docking} fuelled />);
  act(() => publish(privatePending));
  await user.click(await screen.findByRole('button', { name: 'Die 1: 2 food / 5 water' }));
  expect(await within(screen.getByRole('region', { name: 'Hummingbird resource harvesting' }))
    .findByText(/^Resolved this cycle \/\//)).toHaveTextContent('2 food and 5 water added to Hummingbird cargo.');
});


it('renders a valid resolved private server projection on subscription and remount', async () => {
  const resolved = {
    ...privatePending, status: 'resolved', revision: 2, requestId: 'fixture-allocation',
    foodDieIndex: 0, food: 2, water: 5, resolvedAt: '2026-10-18T10:42:37.803Z',
  };
  const view = render(<HummingbirdHarvest docking={docking} fuelled />);
  act(() => publish(resolved));
  expect(within(screen.getByRole('region', { name: 'Hummingbird resource harvesting' }))
    .getByText(/^Resolved this cycle \/\//)).toBeVisible();
  view.unmount();
  render(<HummingbirdHarvest docking={docking} fuelled />);
  act(() => publish(resolved));
  expect(within(screen.getByRole('region', { name: 'Hummingbird resource harvesting' }))
    .getByText(/^Resolved this cycle \/\//)).toBeVisible();
});

it.each([
  ['same-UID connection generation', () => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, connectionGeneration: 2,
  })],
  ['seat', () => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, seatId: 'quellon-captain',
  })],
  ['fleet group', () => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, fleetGroupId: 'fleet-2',
  })],
  ['same-UID identity hydration', () => {
    const { session, me, setIdentity } = useSessionStore.getState();
    setIdentity(session!, me!);
  }],
] as const)('does not reveal a delayed allocation after the original %s changes', async (_label, supersede) => {
  io.reply = (_name, data) => {
    supersede();
    return packet(data, {
      ...privatePending, status: 'resolved', revision: 2, requestId: data.requestId,
      foodDieIndex: 0, food: 2, water: 5, resolvedAt: timestamp,
    });
  };
  render(<HummingbirdHarvest docking={docking} fuelled />);
  act(() => publish(privatePending));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Die 1: 2 food / 5 water' }));
  expect(screen.queryByText(/^Resolved this cycle \/\//)).toBeNull();
});


it('retains the newer private revision when a lower committed allocation arrives later', async () => {
  io.reply = (_name, data) => {
    publish({
      ...privatePending, status: 'resolved', revision: 3, requestId: 'newer-allocation',
      foodDieIndex: 1, food: 5, water: 2, resolvedAt: timestamp,
    });
    return packet(data, {
      ...privatePending, status: 'resolved', revision: 2, requestId: data.requestId,
      foodDieIndex: 0, food: 2, water: 5, resolvedAt: timestamp,
    });
  };
  render(<HummingbirdHarvest docking={docking} fuelled />);
  act(() => publish(privatePending));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Die 1: 2 food / 5 water' }));
  expect(screen.getByText(/^Resolved this cycle \/\//))
    .toHaveTextContent('5 food and 2 water added to Hummingbird cargo.');
});

it.each(['connectionGeneration', 'seatId', 'fleetGroupId'] as const)(
  'keeps strict snapshot rejection when legacy identity lacks %s', async missing => {
    const me = { ...useSessionStore.getState().me! };
    if (missing === 'seatId') me.seatId = null;
    else delete me[missing];
    useSessionStore.getState().setMe(me);
    io.reply = (_name, data) => {
      const current = useSessionStore.getState().session!;
      const snapshot = { ...current, shuttleCargo: { hummingbird: { food: 2, water: 5 } },
        updatedAt: new Date(Date.parse(current.updatedAt) + 733).toISOString() };
      expect(acceptCallableSessionAuthority(snapshot, 'u1')).toBe(true);
      useSessionStore.getState().setSession(snapshot);
      return packet(data, {
        ...privatePending, status: 'resolved', revision: 2, requestId: data.requestId,
        foodDieIndex: 0, food: 2, water: 5, resolvedAt: timestamp,
      });
    };
    render(<HummingbirdHarvest docking={docking} fuelled />);
    act(() => publish(privatePending));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Die 1: 2 food / 5 water' }));
    expect(screen.queryByText(/^Resolved this cycle \/\//)).toBeNull();
  },
);

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { acceptServerSessionAuthority, sessionSnapshotAuthorityFor } from '@/lib/sessionSnapshotAuthority';
import { useWolfAttackChoiceAuthority, wolfAttackChoiceAuthorityIsCurrent } from '@/lib/wolfAttackChoiceController';
import type { GameSession, Player, WolfAttackMemberView, WolfRangeActionChoiceView } from '@/types/game';
import WolfRangeActionPanel from './WolfRangeActionPanel';

const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), read: vi.fn(), commit: vi.fn(), assign: vi.fn() }));
vi.mock('@/lib/firestore', () => ({ subscribeWolfAttackMemberView: mocks.subscribe }));
vi.mock('@/lib/sessionService', () => ({
  getWolfRangeActionChoice: mocks.read,
  commitWolfRangeActionChoice: mocks.commit,
  assignWolfRangeTargets: mocks.assign,
}));

const callbacks: Array<(view: WolfAttackMemberView | null) => void> = [];
const deadlineAt = '2026-10-06T06:00:00.000Z';
let fixtureNumber = 0;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function connect() {
  const sessionId = `range-revalidation-${++fixtureNumber}`;
  const player: Player = {
    uid: `eo-${fixtureNumber}` as Player['uid'], sessionId, displayName: 'Executive Officer',
    role: 'player', connected: true, seatId: 'executive-officer', assignedRoleId: 'executive-officer',
    activeConsoleRoleId: 'executive-officer', replacementRoleId: null, replacementStatus: null,
    fleetGroupId: 'fleet-1' as NonNullable<Player['fleetGroupId']>, connectionGeneration: 5, joinedAt: 'now' as never,
  };
  const session = {
    id: sessionId, phase: 'active', currentTurn: 1,
    turnState: { currentTurn: 1, maxTurn: 6, phase: 'coordination', phaseRevision: 4,
      startedAt: deadlineAt, endsAt: deadlineAt },
    turnPhase: { turn: 1, progression: 'manual', teamPhaseEndsAt: deadlineAt, openAirspaceEndsAt: deadlineAt,
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
    playerDiscovery: { groupId: 'fleet-1', shipId: 'aegis', revision: 1,
      fleetGroupVesselIds: ['aegis', 'dione'], knownCoordinates: [], knownSystems: {}, navigationLogs: [], pursuitDistance: 0 },
    shipResources: { aegis: { fuel: 5, food: 4, water: 4, ammo: 8, security: 3 } },
  } as unknown as GameSession;
  useSessionStore.getState().setIdentity(session, player);
  useSessionStore.setState({ connection: 'live', sessionSnapshotFreshness: 'server' });
  expect(acceptServerSessionAuthority(sessionSnapshotAuthorityFor(sessionId, player.uid), session,
    undefined, false, true)).toBe(true);
  const member: WolfAttackMemberView = {
    type: 'wolf-attack-member-view', schemaVersion: 1, sessionId, attackId: 'attack-original',
    turn: 1, revision: 8, status: 'declared', phase: 'active', currentStep: 'long-range', range: 'long',
    deadlineAt, serverTime: deadlineAt, visibility: 'members',
    redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'], results: [],
  };
  const view: WolfRangeActionChoiceView = {
    type: 'wolf-range-action-choice-view', sessionId, turn: 1, revision: 8,
    currentStep: 'long-range', range: 'long-range', choiceStatus: 'pending', deadlineAt,
    eligibleActions: [{ actionId: 'opaque-original-action', sourceId: 'aegis-missile-launchers', range: 'long-range' }],
    hitSlots: [], contacts: [{ contactId: 'opaque-original-contact', targetShipId: 'aegis', available: true }],
  };
  return { session, player, member, view };
}

function publish(member: WolfAttackMemberView | null) {
  act(() => callbacks.at(-1)?.(member));
}

function acceptResourceSnapshot() {
  const store = useSessionStore.getState();
  const next = { ...store.session!, shipResources: { ...store.session!.shipResources,
    aegis: { ...store.session!.shipResources!.aegis!, fuel: 4 } } };
  expect(acceptServerSessionAuthority(sessionSnapshotAuthorityFor(next.id, store.me!.uid), next,
    undefined, false, true)).toBe(true);
  store.setSession(next);
}

// Mount the production wrapper/controller/store. Only SDK I/O is deferred; no
// fixture toggles a key, remounts the view, or implements its draft behaviour.
async function selectedThenSuperseded() {
  const fixture = connect();
  const refresh = deferred<WolfRangeActionChoiceView>();
  const recovery = deferred<WolfRangeActionChoiceView>();
  mocks.read.mockResolvedValue(fixture.view)
    .mockResolvedValueOnce(fixture.view).mockReturnValueOnce(refresh.promise).mockReturnValueOnce(recovery.promise);
  render(<WolfRangeActionPanel />);
  publish(fixture.member);
  const checkbox = await screen.findByRole('checkbox', { name: 'Missile launchers' });
  await userEvent.setup().click(checkbox);
  const originalButton = screen.getByRole('button', { name: 'Use selected actions' });
  expect(checkbox).toBeChecked();
  expect(originalButton).toBeEnabled();
  publish({ ...fixture.member });
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
  act(acceptResourceSnapshot);
  await act(async () => refresh.resolve({ ...fixture.view }));
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(3));
  expect(originalButton).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Use selected actions' })).not.toBeInTheDocument();
  expect(mocks.commit).not.toHaveBeenCalled();
  expect(mocks.assign).not.toHaveBeenCalled();
  expect(useSessionStore.getState().me).toEqual(fixture.player);
  expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
  return { ...fixture, recovery };
}

beforeEach(() => {
  callbacks.length = 0;
  useSessionStore.getState().reset();
  mocks.subscribe.mockReset().mockImplementation((_sessionId: string, callback: (view: WolfAttackMemberView | null) => void) => {
    callbacks.push(callback);
    return vi.fn();
  });
  mocks.read.mockReset();
  mocks.commit.mockReset().mockResolvedValue(undefined);
  mocks.assign.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

it('keeps the sole deliberate EO selection after identical same-actor source revalidation withdraws and restores controls', async () => {
  const { recovery, view } = await selectedThenSuperseded();
  await act(async () => recovery.resolve({ ...view }));
  const restored = await screen.findByRole('checkbox', { name: 'Missile launchers' });
  expect(restored).toBeChecked();
  expect(screen.getByRole('button', { name: 'Use selected actions' })).toBeEnabled();
  expect(mocks.read).toHaveBeenCalledTimes(3);
  expect(mocks.subscribe).toHaveBeenCalledTimes(1);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Use selected actions' }));
  await waitFor(() => expect(mocks.commit).toHaveBeenCalledTimes(1));
  expect(mocks.commit).toHaveBeenCalledWith(1, 8, 'long-range', ['opaque-original-action']);
  expect(mocks.assign).not.toHaveBeenCalled();
});

it('does not mutate or restore controls when the entitled bounded recovery read is denied', async () => {
  const { recovery } = await selectedThenSuperseded();
  await act(async () => recovery.reject(new Error('Original actor authority was revoked.')));
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Use selected actions' })).not.toBeInTheDocument();
  expect(screen.getByText('Original actor authority was revoked.')).toBeInTheDocument();
  expect(mocks.read).toHaveBeenCalledTimes(3);
  expect(mocks.commit).not.toHaveBeenCalled();
});

it.each(['sessionId', 'turn', 'revision', 'currentStep', 'range'] as const)(
  'does not restore a recovered private view with changed %s', async (field) => {
    const { recovery, view } = await selectedThenSuperseded();
    const changed = { ...view, [field]: field === 'turn' || field === 'revision'
      ? view[field] + 1 : field === 'sessionId' ? 'foreign-session' : 'medium-range' };
    await act(async () => recovery.resolve(changed as WolfRangeActionChoiceView));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use selected actions' })).not.toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledTimes(3);
    expect(mocks.commit).not.toHaveBeenCalled();
  },
);

it.each(['actionId', 'sourceId', 'contactId', 'targetShipId', 'available', 'hitSlots'] as const)(
  'discards the selection when the newly entitled form changes its %s', async (field) => {
    const { recovery, view } = await selectedThenSuperseded();
    const changed: WolfRangeActionChoiceView = {
      ...view,
      eligibleActions: [{ ...view.eligibleActions[0]!, ...(field === 'actionId' ? { actionId: 'opaque-new-action' } : {}),
        ...(field === 'sourceId' ? { sourceId: 'aegis-point-defence-lasers' } : {}) }],
      contacts: [{ ...view.contacts[0]!, ...(field === 'contactId' ? { contactId: 'opaque-new-contact' } : {}),
        ...(field === 'targetShipId' ? { targetShipId: 'dione' } : {}), ...(field === 'available' ? { available: false } : {}) }],
      hitSlots: field === 'hitSlots' ? [{ actionId: view.eligibleActions[0]!.actionId, count: 1 }] : view.hitSlots,
    };
    await act(async () => recovery.resolve(changed));
    const checkbox = await screen.findByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Use selected actions' })).toBeDisabled();
    expect(mocks.commit).not.toHaveBeenCalled();
  },
);

it('discards the prior selection when the source member changes to another attack at the same private form tuple', async () => {
  const { recovery, member, view } = await selectedThenSuperseded();
  publish({ ...member, attackId: 'attack-different' });
  await act(async () => recovery.resolve({ ...view }));
  const checkbox = await screen.findByRole('checkbox');
  expect(checkbox).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Use selected actions' })).toBeDisabled();
  expect(mocks.commit).not.toHaveBeenCalled();
});

it.each(['uid', 'sessionId', 'activeConsoleRoleId', 'assignedRoleId', 'seatId', 'fleetGroupId',
  'connectionGeneration', 'connected', 'identityHydrationRevision', 'freshness', 'connection', 'discovery'] as const)(
  'never transfers a suspended selection across original %s loss, even if the original account later returns', async (field) => {
    const { recovery, member, view } = await selectedThenSuperseded();
    const original = useSessionStore.getState();
    act(() => {
      if (field === 'identityHydrationRevision') useSessionStore.setState({ identityHydrationRevision: 2 });
      else if (field === 'freshness') useSessionStore.getState().setSessionSnapshotFreshness('cache');
      else if (field === 'connection') useSessionStore.getState().setConnection('offline');
      else if (field === 'discovery') useSessionStore.getState().setSession({ ...original.session!,
        playerDiscovery: { ...original.session!.playerDiscovery!, revision: 2 } });
      else useSessionStore.getState().setMe({ ...original.me!, [field]: field === 'connectionGeneration' ? 6
        : field === 'connected' ? false : field === 'activeConsoleRoleId' ? null : 'foreign-original-field' } as Player);
    });
    expect(screen.queryByRole('button', { name: 'Use selected actions' })).not.toBeInTheDocument();
    await act(async () => recovery.resolve({ ...view }));
    expect(mocks.commit).not.toHaveBeenCalled();
    act(() => useSessionStore.setState({ session: original.session, me: original.me,
      identityHydrationRevision: original.identityHydrationRevision,
      connection: original.connection, sessionSnapshotFreshness: original.sessionSnapshotFreshness }));
    publish(member);
    const restored = await screen.findByRole('checkbox');
    expect(restored).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Use selected actions' })).toBeDisabled();
    expect(mocks.commit).not.toHaveBeenCalled();
  },
);

it('keeps the source authority key unchanged for an accepted resource snapshot while advancing its cursor', () => {
  const { session, player } = connect();
  let originalKey = '';
  function Authority() {
    const authority = useWolfAttackChoiceAuthority('executive-officer');
    originalKey ||= authority.key;
    return <span>{authority.key === originalKey ? 'same original actor' : 'changed actor'}</span>;
  }
  render(<Authority />);
  const cursor = sessionSnapshotAuthorityFor(session.id, player.uid);
  const version = cursor.authorityVersion;
  act(acceptResourceSnapshot);
  expect(cursor.authorityVersion).toBeGreaterThan(version!);
  expect(screen.getByText('same original actor')).toBeInTheDocument();
  expect(wolfAttackChoiceAuthorityIsCurrent('executive-officer', originalKey, session.id)).toBe(true);
});

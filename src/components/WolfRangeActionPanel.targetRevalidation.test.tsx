import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { acceptServerSessionAuthority, sessionSnapshotAuthorityFor } from '@/lib/sessionSnapshotAuthority';
import { useWolfAttackChoiceAuthority, wolfAttackChoiceAuthorityIsCurrent } from '@/lib/wolfAttackChoiceController';
import type { GameSession, Player, WolfAttackMemberView, WolfRangeActionChoiceReadResult,
  WolfRangeActionChoiceView } from '@/types/game';
// @ts-expect-error The existing native proof module has no TypeScript declaration.
import { selectBaseRangeTargetControls, certifyBaseRangeTargetControls } from '../../scripts/pc10-base-range-target-controls.mjs';
import WolfRangeActionPanel from './WolfRangeActionPanel';

const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), read: vi.fn(), commit: vi.fn(), assign: vi.fn() }));
vi.mock('@/lib/firestore', () => ({ subscribeWolfAttackMemberView: mocks.subscribe }));
vi.mock('@/lib/sessionService', () => ({ getWolfRangeActionChoice: mocks.read,
  commitWolfRangeActionChoice: mocks.commit, assignWolfRangeTargets: mocks.assign }));

const callbacks: Array<(view: WolfAttackMemberView | null) => void> = [];
const sourceDeadline = '2026-10-06T08:00:00.000Z';
const stopAfterFirstSelection = new Error('Native boundary after the sole first field selection.');
let fixtureNumber = 0;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function connect() {
  const sessionId = `target-revalidation-${++fixtureNumber}`;
  const player: Player = {
    uid: `original-eo-${fixtureNumber}` as Player['uid'], sessionId, displayName: 'Executive Officer',
    role: 'player', connected: true, seatId: 'executive-officer', assignedRoleId: 'executive-officer',
    activeConsoleRoleId: 'executive-officer', replacementRoleId: null, replacementStatus: null,
    fleetGroupId: 'fleet-1' as NonNullable<Player['fleetGroupId']>, connectionGeneration: 8, joinedAt: 'now' as never,
  };
  const session = {
    id: sessionId, phase: 'active', currentTurn: 1,
    turnState: { currentTurn: 1, maxTurn: 6, phase: 'coordination', phaseRevision: 4,
      startedAt: sourceDeadline, endsAt: sourceDeadline },
    turnPhase: { turn: 1, progression: 'manual', teamPhaseEndsAt: sourceDeadline, openAirspaceEndsAt: sourceDeadline,
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
    type: 'wolf-attack-member-view', schemaVersion: 1, sessionId, attackId: 'original-attack',
    turn: 1, revision: 14, status: 'declared', phase: 'active', currentStep: 'medium-range', range: 'medium',
    deadlineAt: sourceDeadline, serverTime: sourceDeadline, visibility: 'members',
    redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'], results: [],
  };
  const view: WolfRangeActionChoiceView = {
    type: 'wolf-range-action-choice-view', sessionId, turn: 1, revision: 14,
    currentStep: 'medium-range', range: 'medium-range', choiceStatus: 'targets-required', deadlineAt: sourceDeadline,
    eligibleActions: [
      { actionId: 'opaque-missile-action', sourceId: 'aegis-missile-launchers', range: 'medium-range' },
      { actionId: 'opaque-support-action', sourceId: 'gorgoneion-missile-array', range: 'medium-range' },
    ],
    hitSlots: [{ actionId: 'opaque-missile-action', count: 1, damagePerHit: 1 },
      { actionId: 'opaque-support-action', count: 1, damagePerHit: 1 }],
    contacts: [{ contactId: 'opaque-contact-1', targetShipId: 'shepherd', available: true, requiredCoverageDamage: null },
      { contactId: 'opaque-contact-2', targetShipId: 'aegis', available: true, requiredCoverageDamage: null }],
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
  const authority = sessionSnapshotAuthorityFor(next.id, store.me!.uid);
  const version = authority.authorityVersion!;
  expect(acceptServerSessionAuthority(authority, next, undefined, false, true)).toBe(true);
  expect(authority.authorityVersion).toBeGreaterThan(version);
  store.setSession(next);
}

// Only native SDK I/O is deferred. The real controller causes the withdrawal
// and remount; no fixture key toggle, draft refill, or extra selection occurs.
async function mountTargets() {
  const fixture = connect();
  const refresh = deferred<WolfRangeActionChoiceReadResult>();
  const recovery = deferred<WolfRangeActionChoiceReadResult>();
  mocks.read.mockResolvedValue(fixture.view).mockResolvedValueOnce(fixture.view)
    .mockReturnValueOnce(refresh.promise).mockReturnValueOnce(recovery.promise);
  let originalAuthorityKey = '';
  function AuthorityWitness() {
    const authority = useWolfAttackChoiceAuthority('executive-officer');
    originalAuthorityKey ||= authority.key;
    return <span>{authority.key === originalAuthorityKey ? 'same original authority' : 'changed authority'}</span>;
  }
  render(<><AuthorityWitness /><WolfRangeActionPanel /></>);
  publish(fixture.member);
  await screen.findByRole('combobox', { name: 'Missile launchers hit 1' });
  const selected: Array<{ index: number; label: string | null; value: string }> = [];
  const fields = () => screen.queryAllByRole('combobox') as HTMLSelectElement[];
  const root = () => screen.getByRole('region', { name: 'Wolf range actions' });
  const panel = {
    getByRole: (role: string) => {
      expect(role).toBe('combobox');
      return { all: async () => fields().map((_node, index) => ({
        getAttribute: async (attribute: string) => fields()[index]!.getAttribute(attribute),
        isVisible: async () => fields()[index]!.isConnected,
        isEnabled: async () => !fields()[index]!.matches(':disabled'),
        locator: (selector: string) => {
          expect(selector).toBe('option');
          return { evaluateAll: async (callback: (nodes: HTMLOptionElement[]) => unknown) =>
            callback(Array.from(fields()[index]!.options)) };
        },
        selectOption: async (value: string) => {
          const node = fields()[index]!;
          expect(node).toBeEnabled();
          selected.push({ index, label: node.getAttribute('aria-label'), value });
          await act(async () => fireEvent.change(node, { target: { value } }));
          return [value];
        },
      })) };
    },
    // jsdom has no layout engine. The explicit inert rect seam below exercises
    // the unchanged serialized certificate, without claiming browser paint.
    evaluate: async (callback: (node: HTMLElement) => unknown) => structuredClone(callback(root())),
  };
  const deadlineAt = Date.now() + 10_000;
  let withdrawn = false;
  const originalButton = screen.getByRole('button', { name: 'Commit target assignments' });
  async function withdraw() {
    expect(withdrawn).toBe(false);
    withdrawn = true;
    publish({ ...fixture.member });
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
    act(acceptResourceSnapshot);
    await act(async () => refresh.resolve(structuredClone(fixture.view)));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(3));
    expect(originalButton).not.toBeInTheDocument();
    expect(fields()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Commit target assignments' })).not.toBeInTheDocument();
    expect(useSessionStore.getState().me).toEqual(fixture.player);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
    expect(wolfAttackChoiceAuthorityIsCurrent('executive-officer', originalAuthorityKey, fixture.session.id)).toBe(true);
    expect(screen.getByText('same original authority')).toBeInTheDocument();
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  }
  async function firstOnly() {
    await expect(selectBaseRangeTargetControls({ panel, view: fixture.view, deadlineAt,
      checkpoint: async () => { if (selected.length === 1) throw stopAfterFirstSelection; },
    })).rejects.toBe(stopAfterFirstSelection);
    expect(selected).toHaveLength(1);
    expect(fields()[0]).toHaveValue(selected[0]!.value);
    expect(fields()[1]).toHaveValue('');
  }
  return { ...fixture, refresh, recovery, panel, fields, selected, deadlineAt, withdraw, firstOnly };
}

beforeEach(() => {
  callbacks.length = 0;
  useSessionStore.getState().reset();
  mocks.subscribe.mockReset().mockImplementation((_sessionId: string, callback: (view: WolfAttackMemberView | null) => void) => {
    callbacks.push(callback); return vi.fn();
  });
  mocks.read.mockReset();
  mocks.assign.mockReset().mockResolvedValue(undefined);
  mocks.commit.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this.isConnected ? [{ width: 100, height: 20 }] : []) as unknown as DOMRectList;
  });
});

it('retains the sole first public-helper target selection across actual same-window source-version withdrawal before the sole second selection', async () => {
  const f = await mountTargets();
  let sourceTransition = false;
  const checkpoint = async () => {
    expect(Date.now()).toBeLessThan(f.deadlineAt);
    if (f.selected.length === 1 && !sourceTransition) {
      sourceTransition = true;
      expect(f.fields()[0]).toHaveValue(f.selected[0]!.value);
      await f.withdraw();
      await act(async () => f.recovery.resolve(structuredClone(f.view)));
      await screen.findByRole('combobox', { name: 'Missile launchers hit 1' });
    }
    expect(useSessionStore.getState().me).toEqual(f.player);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
  };
  const assignments = await selectBaseRangeTargetControls({ panel: f.panel, view: f.view,
    checkpoint, deadlineAt: f.deadlineAt });
  expect(sourceTransition).toBe(true);
  expect(f.selected.map(({ index }) => index)).toEqual([0, 1]);
  expect(mocks.read).toHaveBeenCalledTimes(3);
  expect(mocks.subscribe).toHaveBeenCalledTimes(1);
  const record = vi.fn();
  const certificate = await certifyBaseRangeTargetControls({ panel: f.panel, view: f.view, assignments,
    expected: { sessionId: f.session.id, attackId: f.member.attackId, turn: 1, revision: 14, currentStep: 'medium-range' },
    checkpoint, deadlineAt: f.deadlineAt, record }).catch((cause: unknown) => {
    // Retain the unchanged public observer's safe certificate on native failure.
    console.info('Native failed target certificate:', JSON.stringify(record.mock.calls[0]?.[0]));
    throw cause;
  });
  expect(certificate.matched).toBe(true);
  expect(certificate.gameplayCredit).toBe(false);
  expect(record).toHaveBeenCalledTimes(1);
  expect(f.fields().map(node => node.value)).toEqual(f.selected.map(({ value }) => value));
  expect(mocks.assign).not.toHaveBeenCalled();
  expect(mocks.commit).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Commit target assignments' }));
  await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(1));
  expect(mocks.assign).toHaveBeenCalledWith(1, 14, 'medium-range', assignments);
  expect(f.selected).toHaveLength(2);
  expect(mocks.commit).not.toHaveBeenCalled();
});

it.each(['unavailable', 'denied', 'malformed'] as const)(
  'keeps target controls and mutation withdrawn for a %s recovery source', async (kind) => {
    const f = await mountTargets(); await f.firstOnly(); await f.withdraw();
    await act(async () => {
      if (kind === 'unavailable') f.recovery.resolve({ type: 'wolf-range-action-choice-unavailable', sessionId: f.session.id, reason: 'waiting' });
      else f.recovery.reject(new Error(kind === 'denied' ? 'Original SDK authority denied.' : 'Malformed SDK projection rejected.'));
    });
    expect(f.fields()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Commit target assignments' })).not.toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledTimes(3);
    expect(f.selected).toHaveLength(1);
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  },
);

it.each(['sessionId', 'turn', 'revision', 'currentStep', 'range'] as const)(
  'rejects a recovered private target view with changed %s without adopting its targets', async (field) => {
    const f = await mountTargets(); await f.firstOnly(); await f.withdraw();
    const changed = { ...f.view, [field]: field === 'turn' || field === 'revision'
      ? f.view[field] + 1 : field === 'sessionId' ? 'foreign-session' : 'short-range' };
    await act(async () => f.recovery.resolve(changed as WolfRangeActionChoiceView));
    expect(f.fields()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Commit target assignments' })).not.toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledTimes(3);
    expect(f.selected).toHaveLength(1);
    expect(mocks.assign).not.toHaveBeenCalled();
  },
);

it.each(['actionId', 'sourceId', 'contactId', 'targetShipId', 'available', 'count', 'damagePerHit', 'requiredCoverageDamage'] as const)(
  'clears the target draft when the newly entitled form changes %s', async (field) => {
    const f = await mountTargets(); await f.firstOnly(); await f.withdraw();
    const changed: WolfRangeActionChoiceView = {
      ...f.view,
      eligibleActions: f.view.eligibleActions.map((action, index) => index === 0 ? { ...action,
        ...(field === 'actionId' ? { actionId: 'opaque-new-action' } : {}),
        ...(field === 'sourceId' ? { sourceId: 'aegis-point-defence-lasers' } : {}) } : action),
      hitSlots: f.view.hitSlots.map((slot, index) => index === 0 ? { ...slot,
        ...(field === 'actionId' ? { actionId: 'opaque-new-action' } : {}),
        ...(field === 'count' ? { count: 2 } : {}), ...(field === 'damagePerHit' ? { damagePerHit: 2 } : {}) } : slot),
      contacts: f.view.contacts.map((contact, index) => index === 0 ? { ...contact,
        ...(field === 'contactId' ? { contactId: 'opaque-new-contact' } : {}),
        ...(field === 'targetShipId' ? { targetShipId: 'dione' } : {}),
        ...(field === 'available' ? { available: false } : {}),
        ...(field === 'requiredCoverageDamage' ? { requiredCoverageDamage: 2 } : {}) } : contact),
    };
    await act(async () => f.recovery.resolve(changed));
    await waitFor(() => expect(f.fields().length).toBeGreaterThan(0));
    expect(f.fields().every(node => node.value === '')).toBe(true);
    expect(screen.getByRole('button', { name: 'Commit target assignments' })).toBeDisabled();
    expect(f.selected).toHaveLength(1);
    expect(mocks.read).toHaveBeenCalledTimes(3);
    expect(mocks.assign).not.toHaveBeenCalled();
  },
);

it('clears targets when another attack uses the identical private form and ignores the superseded reply', async () => {
  const f = await mountTargets(); await f.firstOnly(); await f.withdraw();
  publish({ ...f.member, attackId: 'different-attack' });
  await act(async () => f.recovery.resolve(structuredClone(f.view)));
  await waitFor(() => expect(f.fields().length).toBeGreaterThan(0));
  expect(f.fields().every(node => node.value === '')).toBe(true);
  expect(screen.getByRole('button', { name: 'Commit target assignments' })).toBeDisabled();
  expect(mocks.read).toHaveBeenCalledTimes(4);
  expect(f.selected).toHaveLength(1);
  expect(mocks.assign).not.toHaveBeenCalled();
});

it.each(['uid', 'sessionId', 'activeConsoleRoleId', 'assignedRoleId', 'seatId', 'fleetGroupId',
  'connectionGeneration', 'connected', 'identityHydrationRevision', 'freshness', 'connection', 'discovery'] as const)(
  'does not let a stale recovery reply repopulate target controls after original %s loss', async (field) => {
    const f = await mountTargets(); await f.firstOnly(); await f.withdraw();
    const original = useSessionStore.getState();
    act(() => {
      if (field === 'identityHydrationRevision') useSessionStore.setState({ identityHydrationRevision: 2 });
      else if (field === 'freshness') useSessionStore.getState().setSessionSnapshotFreshness('cache');
      else if (field === 'connection') useSessionStore.getState().setConnection('offline');
      else if (field === 'discovery') useSessionStore.getState().setSession({ ...original.session!,
        playerDiscovery: { ...original.session!.playerDiscovery!, revision: 2 } });
      else useSessionStore.getState().setMe({ ...original.me!, [field]: field === 'connectionGeneration' ? 9
        : field === 'connected' ? false : field === 'activeConsoleRoleId' ? null : 'foreign-original-field' } as Player);
    });
    expect(f.fields()).toHaveLength(0);
    await act(async () => f.recovery.resolve(structuredClone(f.view)));
    expect(f.fields()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Commit target assignments' })).not.toBeInTheDocument();
    expect(f.selected).toHaveLength(1);
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  },
);

it('keeps the public helper original deadline without issuing a field selection after expiry', async () => {
  const f = await mountTargets();
  await expect(selectBaseRangeTargetControls({ panel: f.panel, view: f.view,
    checkpoint: async () => undefined, deadlineAt: Date.now() - 1 })).rejects.toThrow('Keep the original combat decision deadline.');
  expect(f.selected).toHaveLength(0);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(mocks.assign).not.toHaveBeenCalled();
});

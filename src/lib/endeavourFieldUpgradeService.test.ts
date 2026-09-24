import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const callable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({ httpsCallable: callable }));
vi.mock('./firebase', () => ({ functions: () => ({ name: 'functions' }) }));

import {
  availableEndeavourFieldUpgradeOptions,
  purchaseEndeavourFieldTargets,
} from './endeavourFieldUpgradeService';
import type { EndeavourResearchWorkspace } from './endeavourResearchService';
import type { GameSession, ShuttleControlEntry } from '@/types/game';

const control: ShuttleControlEntry = {
  shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', ownerUid: 'scientist',
  holderUid: 'scientist', revision: 4,
};

const workspace: EndeavourResearchWorkspace = {
  status: 'ready', sessionId: 's1', cycle: 3, researchRevision: 2,
  cadence: { cycle: 3, revision: 2, choices: [] },
  progress: { reactor: 1, 'jump-drive': 0, 'advanced-hydroponics': 0, 'water-reclamation': 0 },
  tracks: [
    { trackId: 'reactor', name: 'Reactor', crossedBoxes: 1, totalBoxes: 5, currentMaterialCost: 7, complete: false },
    { trackId: 'jump-drive', name: 'Jump Drive', crossedBoxes: 0, totalBoxes: 5, currentMaterialCost: 14, complete: false },
    { trackId: 'advanced-hydroponics', name: 'Advanced Hydroponics', crossedBoxes: 0, totalBoxes: 5, currentMaterialCost: 18, complete: false },
    { trackId: 'water-reclamation', name: 'Water Reclamation', crossedBoxes: 0, totalBoxes: 5, currentMaterialCost: 8, complete: false },
  ],
  shepherdOre: 10,
};

const purchaseState = {
  status: 'ready' as const, sessionId: 's1', cycle: 3, researchRevision: 2,
  upgradeRevision: 6, targetsUsedThisCycle: 0,
} as const;

const reply = {
  status: 'committed', sessionId: 's1', requestId: 'request-1', shuttleId: 'endeavour',
  cycle: 3, upgradeRevision: 7,
  appliedTargets: [{ shipId: 'shepherd', systemId: 'reactor' }],
};

function makeSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    currentTurn: 3, activeRoleIds: ['shepherd-scientist', 'admiral'],
    activeVesselIds: ['shepherd', 'aegis', 'quellon'],
    shuttleControl: { endeavour: control }, shuttleFuelled: { endeavour: false },
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-24T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-24T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: false, pressAccess: false },
    },
    playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['shepherd', 'aegis', 'quellon'],
      knownCoordinates: [], knownSystems: {}, pursuitDistance: 0, navigationLogs: [], revision: 1,
    },
    shipUpgrades: { shepherd: [], aegis: [], quellon: [] },
    createdAt: '', updatedAt: '',
    ...overrides,
  };
}

function setScientist(session = makeSession()): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(session, {
    uid: 'scientist', sessionId: 's1', displayName: 'Scientist', role: 'player', seatId: null,
    assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist',
    fleetGroupId: 'fleet-1', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  callable.mockReset();
  callable.mockReturnValue(vi.fn().mockResolvedValue({ data: reply }));
  vi.stubGlobal('crypto', { randomUUID: () => 'request-1' });
  setScientist();
});

it('offers only current-group active, canonical, not-yet-upgraded consoles at the private current research cost', () => {
  const session = makeSession({
    playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['shepherd', 'aegis', 'quellon', 'dione'],
      knownCoordinates: [], knownSystems: {}, pursuitDistance: 0, navigationLogs: [], revision: 1,
    },
    activeVesselIds: ['shepherd', 'aegis', 'quellon'],
    shipUpgrades: { shepherd: ['jump-drive'], aegis: [], quellon: [] },
  });
  const options = availableEndeavourFieldUpgradeOptions(session, 'fleet-1', workspace);

  expect(options).toContainEqual(expect.objectContaining({
    shipId: 'shepherd', systemId: 'reactor', trackId: 'reactor', materialCost: 7,
  }));
  expect(options).toContainEqual(expect.objectContaining({
    shipId: 'shepherd', systemId: 'advanced-hydroponics-ii',
    trackId: 'advanced-hydroponics',
  }));
  expect(options.some((option) => option.shipId === 'shepherd' && option.systemId === 'jump-drive')).toBe(false);
  expect(options.some((option) => option.shipId === 'dione')).toBe(false);
  expect(options.some((option) => option.systemId === 'storage' || option.systemId === 'shuttle-bay')).toBe(false);
  const legacySession = { ...session };
  delete legacySession.activeVesselIds;
  expect(availableEndeavourFieldUpgradeOptions(legacySession, 'fleet-1', workspace)).toEqual([]);
});

it('submits the current Scientist, cycle, control revision, server purchase revision, and selected targets', async () => {
  const targets = [{ shipId: 'shepherd', systemId: 'reactor' }];
  await expect(purchaseEndeavourFieldTargets({ workspace, purchaseState, targets })).resolves.toMatchObject({
    status: 'committed', cycle: 3, upgradeRevision: 7, appliedTargets: targets,
  });

  expect(callable).toHaveBeenCalledWith({ name: 'functions' }, 'upgradeEndeavourFieldTargets');
  const invoke = callable.mock.results[0]?.value as ReturnType<typeof vi.fn>;
  expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
    sessionId: 's1', expectedControlRevision: 4, expectedUpgradeRevision: 6,
    expectedCycle: 3, targets,
  }));
});

it('rejects mismatched research snapshots, foreign targets, duplicate targets, and quota overflow before calling', async () => {
  await expect(purchaseEndeavourFieldTargets({
    workspace, purchaseState: { ...purchaseState, researchRevision: 1 },
    targets: [{ shipId: 'shepherd', systemId: 'reactor' }],
  })).rejects.toThrow(/research pricing changed/i);
  await expect(purchaseEndeavourFieldTargets({
    workspace, purchaseState, targets: [{ shipId: 'dione', systemId: 'reactor' }],
  })).rejects.toThrow(/current fleet group/i);
  await expect(purchaseEndeavourFieldTargets({
    workspace, purchaseState, targets: [
      { shipId: 'shepherd', systemId: 'reactor' }, { shipId: 'shepherd', systemId: 'reactor' },
    ],
  })).rejects.toThrow(/distinct/i);
  await expect(purchaseEndeavourFieldTargets({
    workspace, purchaseState: { ...purchaseState, targetsUsedThisCycle: 1 },
    targets: [
      { shipId: 'shepherd', systemId: 'reactor' },
      { shipId: 'shepherd', systemId: 'water-reclamation' },
    ],
  })).rejects.toThrow(/remaining Endeavour upgrades/i);
  expect(callable).not.toHaveBeenCalled();
});

it('rejects stale session authority before dispatch and after a delayed callable reply', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(purchaseEndeavourFieldTargets({
    workspace, purchaseState, targets: [{ shipId: 'shepherd', systemId: 'reactor' }],
  })).rejects.toThrow(/Reconnect/i);
  expect(callable).not.toHaveBeenCalled();

  setScientist();
  let finish!: (value: { data: typeof reply }) => void;
  callable.mockReturnValueOnce(vi.fn(() => new Promise((resolve) => { finish = resolve; })));
  const result = purchaseEndeavourFieldTargets({
    workspace, purchaseState, targets: [{ shipId: 'shepherd', systemId: 'reactor' }],
  });
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'shepherd-engineer',
  });
  finish({ data: reply });
  await expect(result).rejects.toThrow(/authority changed/i);
});

it('does not dispatch outside the live Coordination window or to a non-holder', async () => {
  setScientist(makeSession({ turnPhase: {
    turn: 3, teamPhaseEndsAt: '2099-09-24T12:00:00.000Z',
    openAirspaceEndsAt: '2099-09-24T12:15:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  } }));
  await expect(purchaseEndeavourFieldTargets({
    workspace, purchaseState, targets: [{ shipId: 'shepherd', systemId: 'reactor' }],
  })).rejects.toThrow(/live Coordination window/i);

  setScientist();
  useSessionStore.getState().setIdentity(useSessionStore.getState().session!, {
    ...useSessionStore.getState().me!, uid: 'other',
  });
  await expect(purchaseEndeavourFieldTargets({
    workspace, purchaseState, targets: [{ shipId: 'shepherd', systemId: 'reactor' }],
  })).rejects.toThrow(/current Shepherd Scientist/i);
  expect(callable).not.toHaveBeenCalled();
});

it('fails closed on malformed private purchase state and malformed callable replies', async () => {
  await expect(purchaseEndeavourFieldTargets({
    workspace, purchaseState: { ...purchaseState, upgradeRevision: -1 },
    targets: [{ shipId: 'shepherd', systemId: 'reactor' }],
  })).rejects.toThrow(/research pricing changed/i);
  expect(callable).not.toHaveBeenCalled();

  callable.mockReturnValueOnce(vi.fn().mockResolvedValue({ data: { ...reply, materialCost: 7 } }));
  await expect(purchaseEndeavourFieldTargets({
    workspace, purchaseState, targets: [{ shipId: 'shepherd', systemId: 'reactor' }],
  })).rejects.toThrow(/invalid Endeavour field-upgrade data/i);
});

import { beforeEach, expect, it, vi } from 'vitest';

interface MockCurrent {
  session: {
    id: string;
    phase: string;
    currentTurn: number;
    activeRoleIds: string[];
    activeVesselIds: string[];
    turnPhase: { turn: number; openAirspaceEndsAt: string; airspace: { state: string } };
    shuttleControl: { ally: {
      shuttleId: string; ownerRoleId: string; ownerUid: string; holderUid: string; revision: number;
    } };
    shuttleDockings: { shuttleId: string; shipId: string; dockedAt: string }[];
    allyRepairs?: unknown;
  };
  me: {
    uid: string; sessionId: string; role: string; assignedRoleId: string;
    activeConsoleRoleId: string; fleetGroupId: string;
  };
}
const mocks = vi.hoisted(() => ({ callable: vi.fn(), current: {} as MockCurrent }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: vi.fn(() => 'functions') }));
vi.mock('./sessionMutationAuthority', () => ({
  requireFreshSessionAuthority: vi.fn(), hasFreshSessionAuthority: vi.fn(() => true),
}));
vi.mock('@/store/useSessionStore', () => ({
  useSessionStore: { getState: () => mocks.current },
}));

import { repairConsolesFromAlly } from './allyRepairService';

const command = {
  requestId: 'ally-1', systemIds: ['storage', 'reactor'], expectedControlRevision: 2,
  expectedRepairRevision: 0, expectedCycle: 3, expectedHostShipId: 'shepherd',
};

const staleResponse = () => ({ data: {
  status: 'stale', sessionId: 's1', requestId: 'ally-1', shuttleId: 'ally',
  expectedHostShipId: 'shepherd', systemIds: ['reactor', 'storage'],
  expectedControlRevision: 2, currentControlRevision: 3,
  expectedRepairRevision: 0, currentRepairRevision: 1,
  expectedCycle: 3, currentCycle: 3,
} });

beforeEach(() => {
  mocks.callable.mockReset();
  mocks.current = {
    session: {
      id: 's1', phase: 'active', currentTurn: 3,
      activeRoleIds: ['joint-engineering-shepherd-icebreaker'],
      activeVesselIds: ['shepherd', 'icebreaker'],
      turnPhase: { turn: 3, openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
        airspace: { state: 'lifted' } },
      shuttleControl: { ally: {
        shuttleId: 'ally', ownerRoleId: 'joint-engineering-shepherd-icebreaker',
        ownerUid: 'owner', holderUid: 'holder', revision: 2,
      } },
      shuttleDockings: [{ shuttleId: 'ally', shipId: 'shepherd', dockedAt: 'now' }],
    },
    me: { uid: 'holder', sessionId: 's1', role: 'player',
      assignedRoleId: 'joint-engineering-shepherd-icebreaker',
      activeConsoleRoleId: 'joint-engineering-shepherd-icebreaker', fleetGroupId: 'fleet-1' },
  };
});

it('calls the production Ally callable and validates the canonical response', async () => {
  const call = vi.fn().mockResolvedValue({ data: {
    status: 'committed', sessionId: 's1', requestId: 'ally-1', shuttleId: 'ally',
    hostShipId: 'shepherd', systemIds: ['reactor', 'storage'], materialsRemaining: 4,
    cycle: 3, repairRevision: 1,
  } });
  mocks.callable.mockReturnValue(call);
  await expect(repairConsolesFromAlly(command)).resolves.toMatchObject({
    status: 'committed', systemIds: ['reactor', 'storage'], materialsRemaining: 4,
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'repairConsolesFromAlly');
  expect(call).toHaveBeenCalledWith(expect.objectContaining({ systemIds: ['storage', 'reactor'] }));
});

it('fails closed on a malformed response', async () => {
  mocks.callable.mockReturnValue(vi.fn().mockResolvedValue({ data: {
    status: 'committed', sessionId: 's1', requestId: 'ally-1', shuttleId: 'ally',
    hostShipId: 'shepherd', systemIds: ['reactor'], materialsRemaining: 4,
    cycle: 3, repairRevision: 1,
  } }));
  await expect(repairConsolesFromAlly(command)).rejects.toThrow(/malformed/i);
});

it('accepts only a minimal stale envelope bound to this Ally request and target', async () => {
  mocks.callable.mockReturnValue(vi.fn().mockResolvedValue(staleResponse()));
  await expect(repairConsolesFromAlly(command)).resolves.toMatchObject({
    status: 'stale', sessionId: 's1', requestId: 'ally-1', shuttleId: 'ally',
    currentControlRevision: 3, currentRepairRevision: 1, currentCycle: 3,
  });
  mocks.callable.mockReturnValue(vi.fn().mockResolvedValue({ data: {
    ...staleResponse().data, holderUid: 'holder',
  } }));
  await expect(repairConsolesFromAlly(command)).rejects.toThrow(/stale response was malformed/i);
  mocks.callable.mockReturnValue(vi.fn().mockResolvedValue({ data: {
    ...staleResponse().data, systemIds: ['jump-drive'],
  } }));
  await expect(repairConsolesFromAlly(command)).rejects.toThrow(/stale response was malformed/i);
  mocks.callable.mockReturnValue(vi.fn().mockResolvedValue({ data: {
    ...staleResponse().data, currentControlRevision: 2, currentRepairRevision: 0,
  } }));
  await expect(repairConsolesFromAlly(command)).rejects.toThrow(/stale response was malformed/i);
});

it.each(['actor', 'session', 'holder', 'fleet group', 'host'] as const)(
  'rejects a stale reply after the current %s authority changes while awaiting it', async (changed) => {
    let resolveResponse!: (value: unknown) => void;
    mocks.callable.mockReturnValue(vi.fn(() => new Promise((resolve) => { resolveResponse = resolve; })));
    const pending = repairConsolesFromAlly(command);
    if (changed === 'actor') mocks.current.me.uid = 'another-player';
    if (changed === 'session') {
      mocks.current.session.id = 's2';
      mocks.current.me.sessionId = 's2';
    }
    if (changed === 'holder') mocks.current.session.shuttleControl.ally.holderUid = 'another-player';
    if (changed === 'fleet group') mocks.current.me.fleetGroupId = 'fleet-2';
    if (changed === 'host') mocks.current.session.shuttleDockings = [
      { shuttleId: 'ally', shipId: 'icebreaker', dockedAt: 'now' },
    ];
    resolveResponse(staleResponse());
    await expect(pending).rejects.toThrow(/authority or Coordination changed/i);
  },
);

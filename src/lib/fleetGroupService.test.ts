import { expect, it, vi } from 'vitest';
import { createFleetGroupActions } from './fleetGroupService';
vi.mock('@/lib/firebase', () => ({ functions: {} }));
let context = { sessionId: 's1', actorUid: 'alice', groupId: 'fleet-1', live: true, fresh: true, active: true,
  gmInstanceId: 'bridge', navigationRevision: 4 };
it('binds group notes to the current actor and group and retries an ambiguous send with the same request', async () => {
  context = { ...context, groupId: 'fleet-1', live: true };
  const transport = vi.fn().mockRejectedValueOnce({ code: 'functions/unavailable' }).mockResolvedValue({
    status: 'committed', groupId: 'fleet-1', messageId: 'request-1',
  });
  const actions = createFleetGroupActions(() => context, transport, () => 'request-1');
  await expect(actions.send('Hold position.')).rejects.toThrow(/uncertain/i);
  await actions.send('Hold position.');
  expect(transport.mock.calls[0]).toEqual(transport.mock.calls[1]);
  expect(transport).toHaveBeenCalledWith('sendFleetGroupMessage', {
    sessionId: 's1', expectedGroupId: 'fleet-1', text: 'Hold position.', requestId: 'request-1',
  });
  context = { ...context, groupId: 'fleet-2', live: false };
  await expect(actions.read()).rejects.toThrow(/live/i);
});
it('refuses a delayed read after group reassignment and confirms only a fresh GM navigation revision', async () => {
  context = { ...context, groupId: 'fleet-1', live: true };
  let finish!: (value: unknown) => void;
  const transport = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const actions = createFleetGroupActions(() => context, transport, () => 'request-1');
  const read = actions.read();
  context = { ...context, groupId: 'fleet-2' };
  finish({ groupId: 'fleet-1', messages: [] });
  await expect(read).rejects.toThrow(/changed/i);
  const confirmed = actions.confirmPartition();
  expect(transport).toHaveBeenLastCalledWith('confirmFleetPartition', {
    sessionId: 's1', instanceId: 'bridge', expectedNavigationRevision: 4, requestId: 'request-1',
  });
  finish({ status: 'committed', navigationRevision: 5, groupIds: ['fleet-1', 'fleet-2'] });
  await confirmed;
});

it('strictly accepts host-bound fighter-wing rows without exposing another group', async () => {
  context = { ...context, groupId: 'fleet-1', fleetPartitionRevision: 2 };
  const projection = {
    groupId: 'fleet-1', navigationRevision: 4, fleetPartitionRevision: 2,
    sampledAt: '2026-10-03T14:00:00.000Z',
    ships: [{ shipId: 'aegis', fleetGroupId: 'fleet-1', coordinate: '0000' }],
    dockedShuttles: [], transits: [],
    dockedFighterWings: [{ wingId: 'fighter-wing-alpha', fleetGroupId: 'fleet-1', hostShipId: 'aegis' }],
  };
  const transport = vi.fn().mockResolvedValue(projection);
  const actions = createFleetGroupActions(() => context, transport, () => 'wing-sample');
  await expect(actions.readNavigation()).resolves.toMatchObject({
    dockedFighterWings: [{ wingId: 'fighter-wing-alpha', fleetGroupId: 'fleet-1', hostShipId: 'aegis' }],
  });
  expect(transport).toHaveBeenCalledWith('readFleetGroupNavigation', {
    sessionId: 's1', expectedGroupId: 'fleet-1', expectedNavigationRevision: 4,
    expectedFleetPartitionRevision: 2, requestId: 'wing-sample',
  });

  const foreign = { ...projection, dockedFighterWings: [
    { wingId: 'pdf-escort-fighter-wing', fleetGroupId: 'fleet-2', hostShipId: 'refinery-124' },
  ] };
  const rejected = createFleetGroupActions(() => context, vi.fn().mockResolvedValue(foreign));
  await expect(rejected.readNavigation()).rejects.toThrow(/malformed/i);
});

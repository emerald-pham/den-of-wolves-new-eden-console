import { expect, it, vi } from 'vitest';
import { createFleetGroupActions, type FleetGroupContext } from './fleetGroupService';
vi.mock('@/lib/firebase', () => ({ functions: {} }));
let context: FleetGroupContext = { sessionId: 's1', actorUid: 'alice', groupId: 'fleet-1', live: true, fresh: true, active: true,
  role: 'gm' as const, gmInstanceId: 'bridge', navigationRevision: 4, fleetPartitionRevision: 1 };
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

it('records explicit merge values and sends only the recorded decision id when applying it', async () => {
  context = { ...context, groupId: 'fleet-1', role: 'gm', live: true, navigationRevision: 4, fleetPartitionRevision: 1 };
  const candidates = [{ coordinate: '1413', groupIds: ['fleet-1', 'fleet-2'], pursuitBefore: { 'fleet-1': 2, 'fleet-2': 5 } }];
  const transport = vi.fn()
    .mockResolvedValueOnce({ status: 'adjudication-required', navigationRevision: 4, fleetPartitionRevision: 1, candidates })
    .mockResolvedValueOnce({ status: 'recorded', adjudicationId: 'decision-1', navigationRevision: 4, fleetPartitionRevision: 1 })
    .mockResolvedValueOnce({ status: 'committed', navigationRevision: 5, groupIds: ['fleet-1'] });
  const ids = vi.fn().mockReturnValueOnce('preview-1').mockReturnValueOnce('decision-1').mockReturnValueOnce('apply-1');
  const actions = createFleetGroupActions(() => context, transport, ids);

  await expect(actions.confirmPartition()).resolves.toEqual({ status: 'adjudication-required',
    navigationRevision: 4, fleetPartitionRevision: 1, candidates });
  await expect(actions.recordRejoinAdjudication([{ coordinate: '1413', groupIds: ['fleet-1', 'fleet-2'], pursuitAfter: 4 }]))
    .resolves.toMatchObject({ status: 'recorded', adjudicationId: 'decision-1' });
  await expect(actions.confirmPartition('decision-1')).resolves.toMatchObject({ status: 'committed', navigationRevision: 5 });
  expect(transport.mock.calls).toEqual([
    ['confirmFleetPartition', { sessionId: 's1', instanceId: 'bridge', expectedNavigationRevision: 4, requestId: 'preview-1' }],
    ['recordFleetGroupRejoinAdjudication', { decisions: [{ coordinate: '1413', groupIds: ['fleet-1', 'fleet-2'], pursuitAfter: 4 }],
      sessionId: 's1', instanceId: 'bridge', expectedNavigationRevision: 4, expectedFleetPartitionRevision: 1, requestId: 'decision-1' }],
    ['confirmFleetPartition', { rejoinAdjudicationId: 'decision-1', sessionId: 's1', instanceId: 'bridge',
      expectedNavigationRevision: 4, requestId: 'apply-1' }],
  ]);
});

it('holds an uncertain decision to the exact GM choice and refuses player adjudication actions', async () => {
  context = { ...context, role: 'gm', groupId: 'fleet-1', navigationRevision: 4, fleetPartitionRevision: 1 };
  const transport = vi.fn().mockRejectedValueOnce({ code: 'functions/unavailable' }).mockResolvedValue({
    status: 'recorded', adjudicationId: 'request-1', navigationRevision: 4, fleetPartitionRevision: 1,
  });
  const actions = createFleetGroupActions(() => context, transport, () => 'request-1');
  const original = [{ coordinate: '1413', groupIds: ['fleet-1', 'fleet-2'], pursuitAfter: 4 }];
  await expect(actions.recordRejoinAdjudication(original)).rejects.toThrow(/uncertain/i);
  await expect(actions.recordRejoinAdjudication([{ ...original[0]!, pursuitAfter: 3 }])).rejects.toThrow(/exact action/i);
  await expect(actions.recordRejoinAdjudication(original)).resolves.toMatchObject({ adjudicationId: 'request-1' });
  expect(transport.mock.calls[0]).toEqual(transport.mock.calls[1]);

  context = { ...context, role: 'player', gmInstanceId: undefined };
  const playerActions = createFleetGroupActions(() => context, vi.fn());
  await expect(playerActions.recordRejoinAdjudication(original)).rejects.toThrow(/facilitator/i);
});

it('does not accept a recorded decision response after the current navigation or partition revision changes', async () => {
  context = { ...context, role: 'gm', gmInstanceId: 'bridge', groupId: 'fleet-1', navigationRevision: 4, fleetPartitionRevision: 1 };
  let finish!: (value: unknown) => void;
  const transport = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const actions = createFleetGroupActions(() => context, transport, () => 'decision-1');
  const recording = actions.recordRejoinAdjudication([
    { coordinate: '1413', groupIds: ['fleet-1', 'fleet-2'], pursuitAfter: 4 },
  ]);
  context = { ...context, navigationRevision: 5 };
  finish({ status: 'recorded', adjudicationId: 'decision-1', navigationRevision: 4, fleetPartitionRevision: 1 });
  await expect(recording).rejects.toThrow(/changed while the rejoin decision was being recorded/i);
});

it('accepts a committed partition when the live store observes its server revision advance before the reply', async () => {
  context = { ...context, role: 'gm', gmInstanceId: 'bridge', groupId: 'fleet-1', navigationRevision: 4, fleetPartitionRevision: 1 };
  let finish!: (value: unknown) => void;
  const transport = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const actions = createFleetGroupActions(() => context, transport, () => 'apply-1');
  const applying = actions.confirmPartition('decision-1');
  context = { ...context, navigationRevision: 5, fleetPartitionRevision: 2 };
  finish({ status: 'committed', navigationRevision: 5, groupIds: ['fleet-1'] });
  await expect(applying).resolves.toEqual({ status: 'committed', navigationRevision: 5, groupIds: ['fleet-1'] });
});

it('strictly accepts host-bound fighter-wing rows without exposing another group', async () => {
  context = { ...context, role: 'player', groupId: 'fleet-1', navigationRevision: 4, fleetPartitionRevision: 2 };
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

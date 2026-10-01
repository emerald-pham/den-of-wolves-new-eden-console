import { expect, it, vi } from 'vitest';
import { createScoutTaxiCommunicationActions, type ScoutTaxiCommunicationContext } from './scoutTaxiCommunicationService';

const context: ScoutTaxiCommunicationContext = { sessionId: 's1', actorUid: 'explorer', groupId: 'fleet-2',
  shuttleId: 'hummingbird', cycle: 3, controlRevision: 0, navigationRevision: 2, ready: true };
const reply = { status: 'committed', requestId: 'taxi-1', shuttleId: 'hummingbird', targetShipId: 'aegis', cycle: 3 };

it('sends one bounded separate courier action without choosing an audience or coordinate', async () => {
  const transport = vi.fn().mockResolvedValue(reply);
  const actions = createScoutTaxiCommunicationActions(() => context, transport, () => 'taxi-1');
  expect(await actions.send('aegis', '  Hold position.  ')).toEqual(reply);
  expect(transport).toHaveBeenCalledWith({ sessionId: 's1', requestId: 'taxi-1', shuttleId: 'hummingbird',
    targetShipId: 'aegis', text: 'Hold position.', expectedCycle: 3, expectedControlRevision: 0, expectedNavigationRevision: 2 });
});

it('retains the same request after an uncertain response and blocks edited retries', async () => {
  const transport = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(reply);
  const ids = vi.fn().mockReturnValue('taxi-1');
  const actions = createScoutTaxiCommunicationActions(() => context, transport, ids);
  await expect(actions.send('aegis', 'Hold position.')).rejects.toThrow(/uncertain/i);
  await expect(actions.send('aegis', 'Changed note.')).rejects.toThrow(/exact/i);
  expect(transport).toHaveBeenCalledTimes(1);
  await actions.send('aegis', 'Hold position.');
  expect(transport.mock.calls[0]).toEqual(transport.mock.calls[1]);
  expect(ids).toHaveBeenCalledTimes(1);
});

it('allows corrected input after definitive server rejection without reusing its request', async () => {
  const transport = vi.fn().mockRejectedValueOnce({ code: 'functions/failed-precondition' })
    .mockResolvedValue({ ...reply, requestId: 'taxi-2' });
  const ids = vi.fn().mockReturnValueOnce('taxi-1').mockReturnValueOnce('taxi-2');
  const actions = createScoutTaxiCommunicationActions(() => context, transport, ids);
  await expect(actions.send('aegis', 'First note.')).rejects.toThrow();
  await actions.send('aegis', 'Corrected note.');
  expect(transport.mock.calls[1][0].requestId).toBe('taxi-2');
});

it('rejects a late receipt after the actor, group or authority revision changes', async () => {
  let current = context;
  const transport = vi.fn(async () => { current = { ...context, navigationRevision: 3 }; return reply; });
  const actions = createScoutTaxiCommunicationActions(() => current, transport, () => 'taxi-1');
  await expect(actions.send('aegis', 'Hold position.')).rejects.toThrow(/changed/i);
});

it('does not accept a response exposing another audience or hidden chart fields', async () => {
  const transport = vi.fn().mockResolvedValue({ ...reply, targetCoordinate: '5143', targetGroupId: 'fleet-1' });
  const actions = createScoutTaxiCommunicationActions(() => context, transport, () => 'taxi-1');
  await expect(actions.send('aegis', 'Hold position.')).rejects.toThrow(/uncertain/i);
});

it.each(['', 'x'.repeat(201)])('rejects an invalid bounded note before transport', async text => {
  const transport = vi.fn();
  const actions = createScoutTaxiCommunicationActions(() => context, transport);
  await expect(actions.send('aegis', text)).rejects.toThrow(/200/i);
  expect(transport).not.toHaveBeenCalled();
});

it('fails closed while fresh holder and phase authority are unavailable', async () => {
  const transport = vi.fn();
  const actions = createScoutTaxiCommunicationActions(() => ({ ...context, ready: false }), transport);
  await expect(actions.send('aegis', 'Hold position.')).rejects.toThrow(/live/i);
  expect(transport).not.toHaveBeenCalled();
});

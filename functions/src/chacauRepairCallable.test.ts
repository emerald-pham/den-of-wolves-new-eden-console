import { describe, expect, it } from 'vitest';
import {
  chacauRepairCommandFingerprint,
  isChacauRepairCallableReply,
  parseChacauRepairCallableCommand,
} from './chacauRepairCallable';

const command = {
  sessionId: 's1', requestId: 'chacau-repair-1',
  expectedControlRevision: 2, expectedRepairRevision: 4,
  expectedCycle: 3, expectedHostShipId: 'refinery-124', systemIds: ['storage', 'reactor'],
};

describe('Chacau repair callable contract', () => {
  it('accepts only an exact bounded command and sorts console ids for stable replay identity', () => {
    expect(parseChacauRepairCallableCommand(command)).toEqual({
      ...command, systemIds: ['reactor', 'storage'],
    });
  });

  it.each([
    ['extra input', { ...command, actorUid: 'forged' }],
    ['wrong host', { ...command, expectedHostShipId: 'not-a-ship' }],
    ['stale cycle', { ...command, expectedCycle: 0 }],
    ['unsafe repair revision', { ...command, expectedRepairRevision: Number.MAX_SAFE_INTEGER }],
    ['duplicate system', { ...command, systemIds: ['reactor', 'reactor'] }],
    ['oversized system list', { ...command, systemIds: ['a', 'b', 'c'] }],
    ['invalid system id', { ...command, systemIds: [''] }],
  ])('rejects %s', (_label, value) => {
    expect(parseChacauRepairCallableCommand(value)).toBeNull();
  });

  it('binds the exact actor, owner-craft command, host, cycle, revision, and systems for replay', () => {
    const parsed = parseChacauRepairCallableCommand(command)!;
    expect(chacauRepairCommandFingerprint('holder', parsed)).toEqual({
      action: 'chacau-repair', sessionId: 's1', requestId: 'chacau-repair-1',
      actorUid: 'holder', instanceId: null, expectedRevision: 4,
      payload: {
        expectedControlRevision: 2, expectedCycle: 3,
        hostShipId: 'refinery-124', systemIds: ['reactor', 'storage'],
      },
    });
    expect(() => chacauRepairCommandFingerprint('', parsed)).toThrow(/current actor/);
  });

  it('accepts a matching committed or replayed reply and rejects a Philia or foreign reply', () => {
    const parsed = parseChacauRepairCallableCommand(command)!;
    const fingerprint = chacauRepairCommandFingerprint('holder', parsed);
    const reply = {
      status: 'committed', sessionId: 's1', requestId: 'chacau-repair-1', shuttleId: 'chacau',
      hostShipId: 'refinery-124', systemIds: ['reactor', 'storage'],
      materialsRemaining: 4, cycle: 3, repairRevision: 5,
    };
    expect(isChacauRepairCallableReply(reply, fingerprint)).toBe(true);
    expect(isChacauRepairCallableReply({ ...reply, status: 'replayed' }, fingerprint)).toBe(true);
    expect(isChacauRepairCallableReply({ ...reply, shuttleId: 'philia' }, fingerprint)).toBe(false);
    expect(isChacauRepairCallableReply({ ...reply, hostShipId: 'dione' }, fingerprint)).toBe(false);
    expect(isChacauRepairCallableReply({ ...reply, requestId: 'another-request' }, fingerprint)).toBe(false);
    expect(isChacauRepairCallableReply({ ...reply, repairRevision: 7 }, fingerprint)).toBe(false);
    expect(isChacauRepairCallableReply({ ...reply, extra: true }, fingerprint)).toBe(false);
  });
});

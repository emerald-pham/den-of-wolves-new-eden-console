import { describe, expect, it } from 'vitest';
import { totalFleetLossOutcome } from './totalFleetLoss';

const occurredAt = '2026-09-20T14:30:00.000Z';

describe('total fleet loss', () => {
  it('creates a distinct cycle-zero outcome when every active full ship is destroyed', () => {
    expect(totalFleetLossOutcome(
      ['aegis', 'dione'],
      {
        aegis: { damagedSystemIds: ['reactor'], destroyed: true },
        dione: { damagedSystemIds: ['jump-drive'], destroyed: true },
      },
      0,
      occurredAt,
    )).toEqual({
      type: 'game-outcome', result: 'failure', cause: 'total-fleet-loss',
      cycle: 0, occurredAt,
    });
  });

  it('stays open while any active full ship remains usable', () => {
    expect(totalFleetLossOutcome(
      ['aegis', 'dione'],
      {
        aegis: { damagedSystemIds: [], destroyed: true },
        dione: { damagedSystemIds: ['reactor'], destroyed: false },
      },
      3,
      occurredAt,
    )).toBeUndefined();
  });

  it('fails closed for an empty or malformed active fleet tuple', () => {
    expect(totalFleetLossOutcome([], {}, 2, occurredAt)).toBeUndefined();
    expect(totalFleetLossOutcome(
      ['aegis', 'snn-press-shuttle'],
      { aegis: { damagedSystemIds: [], destroyed: true } },
      2,
      occurredAt,
    )).toBeUndefined();
  });
});

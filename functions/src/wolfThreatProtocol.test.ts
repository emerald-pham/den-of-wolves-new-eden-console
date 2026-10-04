import { describe, expect, it } from 'vitest';
import {
  applyWolfCommanderTargetAdjustment,
  commanderAttackRequirement,
  resolveWolfAmnestyDecision,
  wolfThreatComposition,
  wolfThreatPursuit,
} from './wolfThreatProtocol';

describe('group-bound Wolf threat protocol', () => {
  it('uses only the selected split group pursuit for a threat dial', () => {
    const groups = [
      { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['a'] },
      { id: 'fleet-2', vesselIds: ['dione'], memberUids: ['b'] },
    ];
    expect(wolfThreatPursuit('fleet-2', { 'fleet-1': 2, 'fleet-2': 7 }, groups)).toBe(7);
    expect(() => wolfThreatPursuit('fleet-3', { 'fleet-1': 2, 'fleet-2': 7 }, groups))
      .toThrow(/target fleet group/i);
  });

  it.each([
    ['L', 1, 20],
    ['M', 1, 20],
    ['P', 1, 20],
  ] as const)('enforces the printed %s entry force using separate station and other-ship capacity',
    (siteCode, stations, otherCapacity) => {
      const shipIds = [
        ...Array<string>(stations).fill('wolf-battlestation'),
        ...Array<string>(otherCapacity / 5).fill('wolf-strikecarrier'),
      ];
      expect(wolfThreatComposition(siteCode, shipIds)).toMatchObject({
        siteCode,
        counts: { 'wolf-battlestation': stations },
        otherDamageCapacity: otherCapacity,
        damageCapacity: otherCapacity + stations * 6,
      });
      expect(() => wolfThreatComposition(siteCode, shipIds.slice(0, -1))).toThrow(/entry attack/i);
    });

  it('requires the Commander dial to cover ten capacity plus only the target group pursuit', () => {
    expect(commanderAttackRequirement(7)).toBe(17);
    expect(() => commanderAttackRequirement(-1)).toThrow(/pursuit/i);
  });

  it('applies one Commander target adjustment with the printed circular 1-to-6 dial', () => {
    expect(applyWolfCommanderTargetAdjustment({
      cycle: 3,
      range: 'long',
      targetShipId: 'aegis',
      currentTargetNumber: 6,
      delta: 1,
      usedRanges: [],
    })).toMatchObject({ targetShipId: 'aegis', targetNumber: 1, range: 'long' });
    expect(() => applyWolfCommanderTargetAdjustment({
      cycle: 3,
      range: 'long',
      targetShipId: 'aegis',
      currentTargetNumber: 2,
      delta: -1,
      usedRanges: ['long'],
    })).toThrow(/already used/i);
  });

  it('records explicit amnesty responses without accepting a bargain or inventing a GM consequence', () => {
    const offer = {
      cycle: 5,
      offerId: 'amnesty-5-aegis',
      targetShipId: 'aegis',
      condition: 'surrender-by-medium-jump-to-0101' as const,
      responseDeadline: '2026-10-04T12:00:00.000Z',
      facilitatorConsequence: 'Facilitator will rule whether the surrendered crew are spared.',
      status: 'offered' as const,
    };
    expect(resolveWolfAmnestyDecision(offer, { kind: 'response', answer: 'accept' }, 5, '2026-10-04T10:00:00.000Z'))
      .toMatchObject({ status: 'accepted-pending-facilitator', response: 'accept' });
    expect(resolveWolfAmnestyDecision(offer, { kind: 'response', answer: 'decline' }, 5, '2026-10-04T10:00:00.000Z'))
      .toMatchObject({ status: 'declined', response: 'decline' });
    expect(resolveWolfAmnestyDecision({
      ...offer, status: 'accepted-pending-facilitator', response: 'accept',
    }, { kind: 'facilitator-consequence', text: 'Recorded ruling.' }, 5, '2026-10-04T10:00:00.000Z'))
      .toMatchObject({ status: 'facilitator-ruled', ruling: 'Recorded ruling.' });
    expect(() => resolveWolfAmnestyDecision(
      { ...offer, responseDeadline: '2026-10-04T11:00:00.000Z' },
      { kind: 'response', answer: 'accept' },
      5,
      '2026-10-04T12:00:00.000Z',
    )).toThrow(/deadline/i);
  });
});

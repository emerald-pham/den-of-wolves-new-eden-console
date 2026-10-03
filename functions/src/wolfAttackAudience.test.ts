import { describe, expect, it } from 'vitest';
import {
  isWolfAttackMemberView,
  projectWolfAttackMemberView,
} from './wolfAttackAudience';

const hiddenAttack = {
  type: 'wolf-attack-state',
  status: 'declared',
  attackId: 'wolf-attack-request-1',
  turn: 2,
  revision: 7,
  currentStep: 'medium-range',
  deadlineAt: '2026-10-02T20:00:00.000Z',
  declaredAt: '2026-10-02T19:30:00.000Z',
  preparation: {
    shipIds: ['wolf-destroyer', 'wolf-fighter-wing'],
    targetMode: 'pre-rolled',
    notes: 'Keep the players focused on Dione.',
  },
  calculationReceipt: {
    targeting: {
      rolls: [{ rosterIndex: 0, shipId: 'wolf-destroyer', initialDie: 2, finalDie: 2, target: 'dione' }],
    },
  },
  memberResults: [
    {
      range: 'long-range',
      status: 'committed',
      serverTime: '2026-10-02T19:34:00.000Z',
      sourceId: 'aegis:missile-launchers',
      targetId: 'dione',
      bearing: null,
      contactReference: 'ship:dione',
      effect: 'damage',
      outcome: { damage: 2, destroyed: false },
      rolls: [6],
      actorUid: 'private-actor',
      gmNote: 'Do not reveal the hidden ship list.',
    },
  ],
};

describe('Wolf attack audience projection', () => {
  it('publishes stable current progress and only committed audience-safe results', () => {
    const view = projectWolfAttackMemberView({
      sessionId: 'session-1',
      state: hiddenAttack,
      serverTime: '2026-10-02T19:40:00.000Z',
    });

    expect(view).toMatchObject({
      type: 'wolf-attack-member-view',
      schemaVersion: 1,
      sessionId: 'session-1',
      attackId: 'wolf-attack-request-1',
      turn: 2,
      revision: 7,
      status: 'declared',
      phase: 'active',
      currentStep: 'medium-range',
      range: 'medium',
      deadlineAt: '2026-10-02T20:00:00.000Z',
      serverTime: '2026-10-02T19:40:00.000Z',
      visibility: 'members',
      redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'],
      results: [{
        range: 'long', sourceId: 'aegis:missile-launchers', targetId: 'dione',
        bearing: null, contactReference: 'ship:dione', effect: 'damage',
        outcome: { damage: 2, destroyed: false }, serverTime: '2026-10-02T19:34:00.000Z',
      }],
    });
    expect(view).not.toHaveProperty('preparation');
    expect(view).not.toHaveProperty('calculationReceipt');
    expect(JSON.stringify(view)).not.toMatch(/wolf-destroyer|initialDie|private-actor|hidden ship list|rolls/);
    expect(isWolfAttackMemberView(view)).toBe(true);
  });

  it('omits results until a server-committed range receipt exists', () => {
    const view = projectWolfAttackMemberView({
      sessionId: 'session-1',
      state: { ...hiddenAttack, memberResults: undefined },
      serverTime: '2026-10-02T19:40:00.000Z',
    });

    expect(view.results).toEqual([]);
    expect(JSON.stringify(view)).not.toMatch(/wolf-destroyer|initialDie|rolls/);
  });

  it('fails closed on malformed private state and rejects injected hidden fields', () => {
    expect(() => projectWolfAttackMemberView({
      sessionId: 'session-1',
      state: { ...hiddenAttack, revision: -1 },
      serverTime: '2026-10-02T19:40:00.000Z',
    })).toThrow(/malformed/i);

    expect(isWolfAttackMemberView({
      type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 's', attackId: 'a',
      turn: 1, revision: 1, status: 'declared', phase: 'active', currentStep: 'targeting',
      range: null, deadlineAt: '2026-10-02T20:00:00.000Z', serverTime: '2026-10-02T19:00:00.000Z',
      visibility: 'members', redaction: [], results: [], calculationReceipt: { rolls: [] },
    })).toBe(false);
  });
});

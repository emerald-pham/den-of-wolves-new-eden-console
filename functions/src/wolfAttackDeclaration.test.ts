import { describe, expect, it } from 'vitest';
import { pStationRepeatPlanForFinalization } from './wolfAttackDeclaration';

const state = {
  type: 'wolf-attack-state',
  status: 'resolved',
  currentStep: 'resolved',
  attackId: 'wolf-attack-p-station-3',
  turn: 1,
  attackNumber: 3,
  targetGroupId: 'fleet-2',
  threatSiteCode: 'P',
  threatSourceId: 'arrival-transition-p',
  pStationSequence: {
    type: 'p-station-sequence',
    sequenceId: 'wolf-p-station-transition-p',
    groupId: 'fleet-2',
    chart: 'B',
    coordinate: '1964',
    stationId: 'P',
    sourceTransitionId: 'transition-p',
    sourceCycle: 1,
    attackNumber: 3,
  },
};

const revisions = { windowRevision: 8, preparationRevision: 5 };

describe('pStationRepeatPlanForFinalization', () => {
  it('atomically plans an exact same-cycle due window and survivor-only preparation', () => {
    const receipt = {
      survivingWolfShips: [
        { instanceId: '15:wolf-battlestation', shipId: 'wolf-battlestation', target: 'aegis' },
        { instanceId: '4:wolf-fighter-wing', shipId: 'wolf-fighter-wing', target: 'dione' },
      ],
    };

    expect(pStationRepeatPlanForFinalization(state, receipt, revisions)).toEqual({
      status: 'repeat',
      sequenceId: 'wolf-p-station-transition-p',
      context: {
        type: 'p-station-repeat',
        sequenceId: 'wolf-p-station-transition-p',
        groupId: 'fleet-2',
        chart: 'B',
        coordinate: '1964',
        stationId: 'P',
        sourceTransitionId: 'transition-p',
        sourceCycle: 1,
        parentAttackId: 'wolf-attack-p-station-3',
        parentAttackNumber: 3,
        parentTurn: 1,
        nextAttackNumber: 4,
      },
      targetGroupId: 'fleet-2',
      threatSourceId: 'arrival-transition-p',
      turn: 1,
      nextAttackNumber: 4,
      sourceInstanceIds: ['15:wolf-battlestation', '4:wolf-fighter-wing'],
      survivors: [
        { instanceId: '15:wolf-battlestation', shipId: 'wolf-battlestation' },
        { instanceId: '4:wolf-fighter-wing', shipId: 'wolf-fighter-wing' },
      ],
      window: {
        status: 'due',
        turn: 1,
        revision: 9,
        targetGroupId: 'fleet-2',
        threatSiteCode: 'P',
        threatSourceId: 'arrival-transition-p',
      },
      preparation: {
        turn: 1,
        shipIds: ['wolf-battlestation', 'wolf-fighter-wing'],
        targetMode: 'pre-rolled',
        targetAssignments: [],
        modifiers: [],
        notes: '',
        revision: 6,
        compositionKind: 'p-station-repeat',
        targetGroupId: 'fleet-2',
      },
    });
  });

  it('stops the sequence when the final receipt has no surviving force', () => {
    expect(pStationRepeatPlanForFinalization(state, { survivingWolfShips: [] }, revisions)).toEqual({
      status: 'stopped',
      sequenceId: 'wolf-p-station-transition-p',
      groupId: 'fleet-2',
      attackId: 'wolf-attack-p-station-3',
      attackNumber: 3,
      turn: 1,
    });
  });

  it('does not plan a repeat for ordinary or non-P attacks', () => {
    expect(pStationRepeatPlanForFinalization({ ...state, threatSiteCode: 'L' }, { survivingWolfShips: [] }, revisions))
      .toBeUndefined();
    expect(pStationRepeatPlanForFinalization({ ...state, pStationSequence: undefined }, { survivingWolfShips: [] }, revisions))
      .toBeUndefined();
  });

  it.each([
    ['wrong target group', { ...state, targetGroupId: 'fleet-1' }, { survivingWolfShips: [] }],
    ['wrong source', { ...state, threatSourceId: 'arrival-other' }, { survivingWolfShips: [] }],
    ['sequence marker attack mismatch', { ...state, pStationSequence: { ...state.pStationSequence, attackNumber: 2 } }, { survivingWolfShips: [] }],
    ['duplicate survivor identity', state, { survivingWolfShips: [
      { instanceId: '4:wolf-fighter-wing', shipId: 'wolf-fighter-wing', target: 'aegis' },
      { instanceId: '4:wolf-fighter-wing', shipId: 'wolf-fighter-wing', target: 'dione' },
    ] }],
    ['tampered survivor identity', state, { survivingWolfShips: [
      { instanceId: '4:wolf-destroyer', shipId: 'wolf-fighter-wing', target: 'aegis' },
    ] }],
  ])('fails closed for %s', (_label, candidate, receipt) => {
    expect(() => pStationRepeatPlanForFinalization(candidate, receipt, revisions)).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { facilitatorQueueFor, type FacilitatorQueueState } from './facilitatorQueue';

const setupState: FacilitatorQueueState = {
  phase: 'casting',
  currentTurn: 0,
  maxTurn: 6,
  setupSynchronized: false,
  productionStartAvailable: true,
  turnPhase: undefined,
  timerPaused: false,
  wolfAttackStatus: 'planned',
  debriefActive: false,
  overdueMaintenance: [],
  alertShips: [],
  pendingCommands: [],
};

describe('facilitatorQueueFor', () => {
  it('keeps setup and production actions available to one facilitator', () => {
    expect(facilitatorQueueFor(setupState)).toEqual([
      {
        id: 'confirm-setup', label: 'Confirm setup',
        detail: expect.stringContaining('roster'), state: 'action',
      },
      {
        id: 'start-production', label: 'Start production',
        detail: expect.stringContaining('server'), state: 'action',
      },
    ]);
  });

  it('keeps every outstanding exception in the same server-backed queue', () => {
    const items = facilitatorQueueFor({
      ...setupState,
      phase: 'active',
      currentTurn: 2,
      setupSynchronized: true,
      productionStartAvailable: false,
      turnPhase: 'complete',
      timerPaused: true,
      wolfAttackStatus: 'due',
      overdueMaintenance: [{ shipId: 'aegis', shipName: 'AEGIS', minutes: 6 }],
      alertShips: ['AEGIS'],
      pendingCommands: ['Roster confirmation pending'],
    });

    expect(items.map((item) => item.id)).toEqual([
      'pending:Roster confirmation pending',
      'maintenance:aegis',
      'alert:AEGIS',
      'resume-timer',
      'resolve-wolf-timing',
      'advance-turn',
    ]);
    expect(items.every((item) => item.detail.length > 0)).toBe(true);
  });

  it('reports terminal and debrief state without inventing another action', () => {
    expect(facilitatorQueueFor({ ...setupState, phase: 'debrief' })).toContainEqual(
      expect.objectContaining({ id: 'enable-finale', state: 'action' }),
    );
    expect(facilitatorQueueFor({ ...setupState, phase: 'closed' })).toContainEqual(
      expect.objectContaining({ id: 'closed', state: 'complete' }),
    );
  });
});

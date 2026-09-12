import type { GameSession } from '@/types/game';

export type FacilitatorQueueState = {
  readonly phase: GameSession['phase'];
  readonly currentTurn: number;
  readonly maxTurn: number;
  readonly setupSynchronized: boolean;
  readonly productionStartAvailable: boolean;
  readonly turnPhase: 'team' | 'open' | 'complete' | undefined;
  readonly timerPaused: boolean;
  readonly wolfAttackStatus: 'planned' | 'due' | 'resolved' | 'deferred';
  readonly debriefActive: boolean;
  readonly overdueMaintenance: readonly { shipId: string; shipName: string; minutes: number }[];
  readonly alertShips: readonly string[];
  readonly pendingCommands: readonly string[];
};

export type FacilitatorQueueItem = {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly state: 'action' | 'attention' | 'pending' | 'waiting' | 'complete';
};

/**
 * Derive the current GM work queue from server projections and local transport
 * state. The list is a readout: none of its entries author shared progress.
 */
export function facilitatorQueueFor(state: FacilitatorQueueState): readonly FacilitatorQueueItem[] {
  const items: FacilitatorQueueItem[] = [];
  for (const pending of state.pendingCommands) {
    items.push({
      id: `pending:${pending}`,
      label: pending,
      detail: 'Awaiting the authoritative server receipt; retry remains bound to this request.',
      state: 'pending',
    });
  }

  for (const maintenance of state.overdueMaintenance) {
    items.push({
      id: `maintenance:${maintenance.shipId}`,
      label: `Complete maintenance // ${maintenance.shipName}`,
      detail: `This cycle has been open for ${maintenance.minutes} minutes.`,
      state: 'attention',
    });
  }
  for (const shipId of state.alertShips) {
    items.push({
      id: `alert:${shipId}`,
      label: `Acknowledge ship alert // ${shipId}`,
      detail: 'The alert remains server-owned and can block the affected correction until acknowledged.',
      state: 'attention',
    });
  }

  if (state.phase === 'closed') {
    items.push({
      id: 'closed',
      label: 'Session closed',
      detail: 'Review the final outcome and retained audit history.',
      state: 'complete',
    });
    return items;
  }

  if (state.phase === 'debrief') {
    items.push(state.debriefActive
      ? {
        id: 'debrief-live', label: 'Debrief live',
        detail: 'The shared finale is visible across the table.', state: 'waiting',
      }
      : {
        id: 'enable-finale', label: 'Enable the debrief finale',
        detail: 'Lower the finale only after the endgame outcome is ready.', state: 'action',
      });
    return items;
  }

  if (state.phase === 'briefing') {
    items.push({
      id: 'briefing', label: 'Briefing in progress',
      detail: 'Wait for the shared briefing projection before taking the next game action.',
      state: 'waiting',
    });
    return items;
  }

  if (state.phase === 'success' || state.phase === 'failure') {
    items.push({
      id: 'outcome', label: `Session ${state.phase}`,
      detail: 'Review the outcome and move through the server-authorized debrief path.',
      state: 'attention',
    });
    return items;
  }

  if (state.phase === 'retained-empty') {
    items.push({
      id: 'retained-empty', label: 'Session retained without players',
      detail: 'Reconnect an eligible participant before resuming table operations.',
      state: 'waiting',
    });
    return items;
  }

  if (state.currentTurn === 0 && (state.phase === 'lobby' || state.phase === 'casting')) {
    if (!state.setupSynchronized) {
      items.push({
        id: 'confirm-setup', label: 'Confirm setup',
        detail: 'Synchronize the roster, chart, components, and optional stations before production starts.',
        state: 'action',
      });
    }
    if (state.productionStartAvailable) {
      items.push({
        id: 'start-production', label: 'Start production',
        detail: 'The server will validate the live roster, seats, loyalty, vessels, and GM staffing.',
        state: 'action',
      });
    } else if (state.phase === 'casting') {
      items.push({
        id: 'prepare-production', label: 'Prepare production',
        detail: 'Resolve the server-reported setup requirements before advancing to Turn 1.',
        state: 'waiting',
      });
    }
    return items;
  }

  if (state.timerPaused) {
    items.push({
      id: 'resume-timer', label: 'Resume the emergency timer',
      detail: 'The current shared phase is paused by an authoritative GM hold.',
      state: 'action',
    });
  }
  if (state.wolfAttackStatus === 'due') {
    items.push({
      id: 'resolve-wolf-timing', label: 'Resolve Wolf-attack timing',
      detail: 'Record the facilitator timing decision before continuing the turn.',
      state: 'attention',
    });
  }

  if (state.currentTurn >= 1 && state.turnPhase === 'complete') {
    items.push(state.currentTurn < state.maxTurn
      ? {
        id: 'advance-turn', label: `Advance to Turn ${state.currentTurn + 1}`,
        detail: 'The current shared phase has ended; the server owns the next turn transition.',
        state: 'action',
      }
      : {
        id: 'evaluate-endgame', label: 'Evaluate the final turn',
        detail: 'The final turn is complete; review the outcome before enabling debrief.',
        state: 'attention',
      });
  } else if (state.currentTurn >= 1 && state.turnPhase !== undefined) {
    items.push({
      id: 'current-phase', label: `Turn ${state.currentTurn} // ${state.turnPhase === 'team' ? 'Team Time' : 'Open Airspace'}`,
      detail: 'Monitor the shared phase and use the authoritative controls when an intervention is required.',
      state: 'waiting',
    });
  } else if (state.currentTurn >= 1) {
    items.push({
      id: 'reconcile-phase', label: `Turn ${state.currentTurn} // awaiting phase state`,
      detail: 'Reconnect or refresh the authoritative session projection before taking action.',
      state: 'waiting',
    });
  }

  return items;
}

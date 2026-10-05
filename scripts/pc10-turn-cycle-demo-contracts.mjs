import assert from 'node:assert/strict';

export const TURN_CYCLE_CASES = Object.freeze({
  'sole-player-cycle-demo': { protocol: 'separate-fresh-sole-player', endpoints: ['startSinglePlayerDemo'] },
  'gm-only-transmission': { protocol: 'local-presentation', endpoints: [] },
  'fleet-transmission': { protocol: 'new-revision-each-call', endpoints: ['replayTurnStartAnnouncement'] },
  'briefing-clearance': { protocol: 'receipt', endpoints: ['clearTurnAdvanceInterstitial'] },
  'manual-coordination': { protocol: 'receipt', endpoints: ['advanceFullGameDemoPhase'] },
  'cycle-advance': { protocol: 'receipt', endpoints: ['advanceTurn'] },
  'cycle-skip': { protocol: 'receipt', endpoints: ['advanceTurn'] },
  'airspace-restricted-extension': { protocol: 'adds-time-each-call', endpoints: ['extendAirspaceWindow'] },
  'airspace-open-extension': { protocol: 'adds-time-each-call', endpoints: ['extendAirspaceWindow'] },
  'natural-open': { protocol: 'observe-app-at-natural-deadline', endpoints: ['beginOpenAirspacePhase'] },
  'emergency-timer': { protocol: 'normal-three-confirmations', endpoints: ['setEmergencyTimerPaused'] },
  'game-finale': { protocol: 'state-idempotent', endpoints: ['setDebriefMode'] },
  'bridge-confetti': { protocol: 'one-use-two-officer-choice-no-receipt', endpoints: ['popShipConfetti'] },
  'newspaper-confetti': { protocol: 'receipt', endpoints: ['popShipConfetti'] },
  'genuine-terminal': { protocol: 'actual-source-debrief-and-close', endpoints: ['beginSessionDebrief', 'closeSession'] },
});

export function assertSolePlayerCycleDemo(state) {
  assert.ok(state.sessionId && state.uidHash); assert.equal(state.hasAuth, true); assert.equal(state.sameActor, true);
  assert.equal(state.connection, 'live'); assert.equal(state.freshness, 'server');
  assert.equal(state.cycle, 0); assert.equal(state.connectedPlayers, 1);
  assert.ok(['lobby', 'casting'].includes(state.phase));
  assert.equal(state.fullGameDemo, null); assert.equal(state.singlePlayerDemo, null);
}

export function turnCaseAvailability(id, state) {
  assert.ok(TURN_CYCLE_CASES[id], `Unknown finite turn case ${id}`);
  if (id === 'sole-player-cycle-demo') return { status: 'blocked', reason: 'Use the separately exported fresh sole-player driver; this full-game hook never calls the Cycle 0 demo.' };
  if (['genuine-terminal'].includes(id)) return { status: 'ready' };
  if (state.phase !== 'active') return { status: 'blocked', reason: 'Next actor: live GM must start ordinary full gameplay; terminal gameplay cannot resume.' };
  const timed = ['airspace-restricted-extension', 'airspace-open-extension', 'natural-open', 'emergency-timer'].includes(id);
  if (timed && state.progression === 'manual') return { status: 'blocked', reason: 'Separate ordinary timed session required; unlimited full-game demo has no natural countdown.' };
  if (id === 'manual-coordination' && (state.progression !== 'manual' || state.airspace !== 'restricted' ||
    state.timerPause || state.attackLocked || state.pursuitEmergency)) return { status: 'blocked', reason: 'Next actor: resolve the actually offered attack, pursuit or briefing blocker before manual Coordination.' };
  if (id === 'briefing-clearance' && state.timerPause?.reason !== 'turn-interstitial') return { status: 'blocked', reason: 'No genuine held cycle briefing was produced; do not fabricate an acknowledgement opportunity.' };
  if (id.startsWith('airspace-') && (state.timerPause || state.attackLocked ||
    state.airspace !== (id.includes('restricted') ? 'restricted' : 'lifted'))) return { status: 'blocked', reason: 'The named current airspace window must be offered without pause/attack.' };
  return { status: 'ready' };
}

export function assertNaturalOpenRequest(state, data, observedAt) {
  assert.notEqual(state.progression, 'manual'); assert.equal(state.airspace, 'restricted');
  assert.equal(state.timerPause, null); assert.ok(Number.isFinite(Date.parse(state.teamEndsAt)));
  assert.ok(observedAt >= Date.parse(state.teamEndsAt), 'Only real elapsed time qualifies.');
  assert.equal(data.sessionId, state.sessionId); assert.equal(data.expectedTurn, state.cycle);
}

export function assertNoUnsafeTurnReplay(endpoint) {
  assert.ok(['advanceTurn', 'advanceFullGameDemoPhase', 'clearTurnAdvanceInterstitial',
    'popShipConfetti'].includes(endpoint), 'This source endpoint has no exact receipt; automatic repeat is forbidden.');
}

export function assertActualCycleTransition(before, after, result) {
  assert.equal(after.uidHash, before.uidHash); assert.equal(after.sessionId, before.sessionId);
  assert.equal(after.sameActor, true); assert.equal(after.connection, 'live'); assert.equal(after.freshness, 'server');
  assert.equal(after.cycle, before.cycle + 1); assert.equal(result.currentTurn, after.cycle);
}

export function assertObservedTerminal(state) {
  assert.ok(['debrief', 'closed'].includes(state.phase), 'Visual debriefMode is not a terminal game.');
  const snapshot = state.debriefSnapshot;
  assert.ok(snapshot && snapshot.cycle === state.cycle);
  // SessionDebriefSnapshot is nested in the authenticated session projection.
  // It has no sessionId field. Reject a contradictory field if supplied.
  assert.ok(snapshot.sessionId === undefined || snapshot.sessionId === state.sessionId);
  assert.ok(typeof snapshot.source === 'string' && typeof snapshot.result === 'string');
  return { cycle: snapshot.cycle, source: snapshot.source, result: snapshot.result, cause: snapshot.cause ?? null };
}

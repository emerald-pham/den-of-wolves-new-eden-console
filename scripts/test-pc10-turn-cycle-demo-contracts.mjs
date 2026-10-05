import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TURN_CYCLE_CASES, turnCaseAvailability, assertSolePlayerCycleDemo, assertActualCycleTransition,
  assertNaturalOpenRequest, assertNoUnsafeTurnReplay, assertObservedTerminal,
} from './pc10-turn-cycle-demo-contracts.mjs';

const original = { sessionId: 'sole-fresh', uidHash: '0123456789abcdef', hasAuth: true,
  sameActor: true, connection: 'live', freshness: 'server', cycle: 0, connectedPlayers: 1,
  phase: 'lobby', fullGameDemo: null, singlePlayerDemo: null };
test('sole-player Cycle 0 demo is a separate fresh path, never full-game start credit', () => {
  assert.doesNotThrow(() => assertSolePlayerCycleDemo(original));
  for (const fields of [{ cycle: 1 }, { connectedPlayers: 2 }, { fullGameDemo: { status: 'preparing' } },
    { sameActor: false }, { freshness: 'cache' }, { phase: 'active' }]) {
    assert.throws(() => assertSolePlayerCycleDemo({ ...original, ...fields }));
  }
});
test('manual demo never claims timed extension, emergency pause or natural Team deadline', () => {
  const state = { phase: 'active', cycle: 1, progression: 'manual', airspace: 'restricted' };
  assert.equal(turnCaseAvailability('manual-coordination', state).status, 'ready');
  for (const id of ['airspace-restricted-extension', 'airspace-open-extension', 'natural-open', 'emergency-timer']) {
    assert.equal(turnCaseAvailability(id, state).status, 'blocked');
  }
});
test('manual phase cannot bypass pursuit emergency, attack or held briefing', () => {
  const state = { phase: 'active', cycle: 2, progression: 'manual', airspace: 'restricted' };
  for (const fields of [{ pursuitEmergency: true }, { attackLocked: true }, { timerPause: { reason: 'turn-interstitial' } }]) {
    assert.equal(turnCaseAvailability('manual-coordination', { ...state, ...fields }).status, 'blocked');
  }
});
test('natural open observes the actual app request at the real deadline without injected time', () => {
  const state = { ...original, phase: 'active', cycle: 1, progression: 'timed', airspace: 'restricted',
    teamEndsAt: '2026-10-05T12:00:00Z', timerPause: null };
  assert.doesNotThrow(() => assertNaturalOpenRequest(state, { sessionId: original.sessionId,
    expectedTurn: 1 }, Date.parse('2026-10-05T12:00:01Z')));
  assert.throws(() => assertNaturalOpenRequest(state, { sessionId: original.sessionId,
    expectedTurn: 1 }, Date.parse('2026-10-05T11:59:59Z')));
  assert.throws(() => assertNaturalOpenRequest({ ...state, progression: 'manual' }, {
    sessionId: original.sessionId, expectedTurn: 1 }, Date.parse('2026-10-05T12:00:01Z')));
});
test('fleet replay/extension never fabricate an idempotent exact replay', () => {
  for (const endpoint of ['replayTurnStartAnnouncement', 'extendAirspaceWindow', 'startSinglePlayerDemo']) {
    assert.throws(() => assertNoUnsafeTurnReplay(endpoint));
  }
  assert.doesNotThrow(() => assertNoUnsafeTurnReplay('advanceTurn'));
  assert.doesNotThrow(() => assertNoUnsafeTurnReplay('advanceFullGameDemoPhase'));
  assert.equal(TURN_CYCLE_CASES['gm-only-transmission'].protocol, 'local-presentation');
});
test('advance requires an actual matching source result and current original actor', () => {
  const before = { ...original, cycle: 1, phase: 'active' };
  const after = { ...before, cycle: 2 };
  assert.doesNotThrow(() => assertActualCycleTransition(before, after, { currentTurn: 2 }));
  assert.throws(() => assertActualCycleTransition(before, { ...after, uidHash: 'other' }, { currentTurn: 2 }));
  assert.throws(() => assertActualCycleTransition(before, { ...after, cycle: 1 }, { currentTurn: 2 }));
  assert.throws(() => assertActualCycleTransition(before, after, { currentTurn: 3 }));
  assert.throws(() => assertActualCycleTransition(before, after, { turn: 2 }));
});
test('debrief visual mode is not a genuine terminal; actual snapshot must match session and cycle', () => {
  assert.throws(() => assertObservedTerminal({ ...original, phase: 'active', debriefMode: { active: true } }));
  const ended = { ...original, phase: 'debrief', cycle: 4,
    debriefSnapshot: { sessionId: original.sessionId, cycle: 4, source: 'failure-review', result: 'failure', cause: 'pursuit-limit' } };
  assert.doesNotThrow(() => assertObservedTerminal(ended));
  assert.throws(() => assertObservedTerminal({ ...ended, debriefSnapshot: { ...ended.debriefSnapshot, sessionId: 'foreign' } }));
});
test('the source debrief schema is document-bound and has no invented sessionId field', () => {
  assert.doesNotThrow(() => assertObservedTerminal({ ...original, phase: 'debrief', cycle: 8,
    debriefSnapshot: { type: 'session-debrief', version: 1, cycle: 8,
      source: 'final-cycle', result: 'completed', cause: 'final-cycle' } }));
});

import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { completeOfferedTurnAdvance, isObservedGameEnding } from './pc10-full-game-demo-proof-helpers.mjs';

/** Acceptance must match the actual server branch, including early failures. */
export function assertFreshEndingBranch(snapshot, { branch, cycle, limit }) {
  assert.equal(snapshot.cycle, cycle);
  if (branch === 'final-cycle') {
    assert.equal(cycle, limit);
    assert.equal(snapshot.source, 'final-cycle');
    assert.equal(snapshot.result, 'completed');
    assert.equal(snapshot.cause, 'final-cycle');
  } else {
    assert.equal(branch, 'pursuit-limit');
    assert.ok(cycle <= limit);
    assert.equal(snapshot.source, 'failure-review');
    assert.equal(snapshot.result, 'failure');
    assert.equal(snapshot.cause, 'pursuit-limit');
  }
}

/** Compose a real full-demo admission/role tour with ordinary GM UI progression.
 * This proves the fresh final-cycle branch; it does not claim all game functions.
 * No gameplay document, clock, store, identity or callable response is injected.
 */
export async function runEnding({ gm, crew, initial, directory }, { branch = 'final-cycle' } = {}) {
  assert.ok(['final-cycle', 'pursuit-limit'].includes(branch));
  const advances = [], phases = [];
  let lastAdvance;
  const capture = request => {
    if (new URL(request.url()).pathname.endsWith('/us-central1/advanceTurn') && request.method() === 'POST') {
      lastAdvance = request.postDataJSON()?.data;
    }
  };
  gm.page.on('request', capture);
  async function state() {
    return gm.page.evaluate(async moduleUrl => {
      const { useSessionStore } = await import(moduleUrl);
      const { session, me, gmInstance, connection, sessionSnapshotFreshness } = useSessionStore.getState();
      return { cycle: session?.currentTurn, limit: session?.turnLimit, phase: session?.phase,
        airspace: session?.turnPhase?.airspace.state, progression: session?.turnPhase?.progression,
        trainingStatus: session?.fullGameDemo?.status, sessionId: session?.id,
        instanceId: gmInstance?.id, live: connection === 'live' && sessionSnapshotFreshness === 'server',
        ownsGm: me?.role === 'gm' && gmInstance?.uid === me?.uid,
        pursuitEmergencyStatus: session?.pursuitEmergencyWindowAuthority?.status ?? session?.pursuitEmergencyWindow?.status,
        debriefSource: session?.debriefSnapshot?.source, debriefResult: session?.debriefSnapshot?.result };
    }, gm.storeModuleUrl());
  }
  try {
    for (let count = 0; count < 8; count++) {
      const current = await state();
      assert.equal(current.sessionId, initial.sessionId);
      assert.equal(current.ownsGm, true, 'Every cycle uses the normally authenticated live GM.');
      assert.equal(current.live, true);
      if (current.phase === 'debrief') break;
      assert.equal(current.phase, 'active');
      assert.equal(current.progression, 'manual');
      assert.equal(current.trainingStatus, 'active');
      if (current.pursuitEmergencyStatus) {
        assert.equal(branch, 'pursuit-limit', 'Final-cycle proof needs genuine pursuit-lowering gameplay before this source gate.');
        assert.equal(current.pursuitEmergencyStatus, 'awaiting-gm-decision');
        const decision = gm.page.getByRole('region', { name: 'Pursuit emergency decision' });
        lastAdvance = null;
        await decision.getByRole('button', { name: 'End pursuit-limit run', exact: true }).click();
        await decision.getByRole('button', { name: 'Are you sure you want to end game?', exact: true }).click();
        await gm.until('Source-normal GM pursuit failure decision', value => value.phase === 'failure');
        assert.equal(lastAdvance?.sessionId, initial.sessionId);
        assert.equal(lastAdvance?.expectedTurn, current.cycle);
        assert.equal(lastAdvance?.pursuitEmergencyDecision, 'decline');
        const replay = await gm.callable('advanceTurn', lastAdvance);
        assert.equal(replay.status, 'committed');
        assert.equal(replay.result.phase, 'failure');
        phases.push({ cycle: current.cycle, mechanism: 'actual offered GM pursuit-limit decision and unchanged-request SDK replay' });
        await gm.page.getByRole('dialog', { name: 'Endgame evaluation', exact: true }).waitFor();
        await gm.page.getByRole('button', { name: 'Freeze failure into debrief', exact: true }).click();
        await gm.until('Actual GM freeze of source-normal pursuit failure', value => value.phase === 'debrief');
        break;
      }
      if (current.airspace === 'restricted') {
        await gm.page.getByRole('button', { name: 'Open Coordination manually', exact: true }).click();
        await gm.until(`Manual Coordination ${current.cycle}`, value => value.cycle === current.cycle && value.airspace === 'lifted');
        phases.push({ cycle: current.cycle, mechanism: 'actual GM UI manual phase action' });
      }
      await delay(1_000);
      const held = await state();
      assert.equal(held.cycle, current.cycle, 'Elapsed time does not advance a manual game.');
      assert.equal(held.airspace, 'lifted');
      lastAdvance = null;
      const before = await gm.observe();
      const offered = gm.page.getByRole('button', { name: `ARE YOU SURE? // Advance to Cycle ${current.cycle + 1}`, exact: true });
      const uiAdvance = await completeOfferedTurnAdvance({
        expected: { sessionId: initial.sessionId, uidHash: before.uidHash,
          instanceId: before.instanceId, cycle: current.cycle },
        inspect: async () => ({ ...(await gm.observe()), confirmationOffered: await offered.isVisible() }),
        clickAdvance: () => gm.page.getByRole('button', { name: `Advance to Cycle ${current.cycle + 1}`, exact: true }).click(),
        clickConfirmation: () => offered.click(),
      });
      assert.equal(lastAdvance?.sessionId, initial.sessionId);
      assert.equal(lastAdvance?.expectedTurn, current.cycle, 'Replay the exact UI-issued request.');
      const replay = await gm.callable('advanceTurn', lastAdvance);
      assert.equal(replay.status, 'committed', 'A lost cycle acknowledgement remains recoverable.');
      const after = await state();
      assert.equal(replay.result.currentTurn, after.cycle);
      advances.push({ fromCycle: current.cycle, toCycle: after.cycle, phase: after.phase,
        requestId: lastAdvance.requestId, uiCommitted: true, confirmationActuallyOffered: uiAdvance.confirmationClicked, exactSdkReplayAccepted: true });
    }
    // The action receipt updates phase before the live projection arrives.
    // Accept the complete server-backed debrief, not that optimistic phase.
    await gm.until('Complete server-produced fresh training debrief', value =>
      value.fullGameDemo?.status === 'complete' && isObservedGameEnding(value));
    const terminal = await state();
    assert.equal(terminal.phase, 'debrief');
    assert.equal(terminal.trainingStatus, 'complete');
    const read = { sessionId: initial.sessionId, instanceId: terminal.instanceId };
    const debrief = await gm.callable('getSessionDebrief', read);
    assert.equal(debrief.status, 'committed');
    assertFreshEndingBranch(debrief.result.snapshot, { branch, cycle: terminal.cycle, limit: terminal.limit });
    const ordinary = await crew.callable('getSessionDebrief', read);
    assert.equal(ordinary.status, 'denied');
    assert.match(ordinary.code, /permission-denied$/);
    await gm.page.getByRole('dialog', { name: 'Endgame evaluation', exact: true }).waitFor();
    await gm.page.screenshot({ path: `${directory}/fresh-${branch}-debrief.png` });
    await gm.page.getByRole('button', { name: 'Close session', exact: true }).click();
    await gm.until('Actual GM closure of frozen fresh-game debrief', value => value.phase === 'closed');
    const closed = await gm.callable('getSessionDebrief', read);
    assert.equal(closed.status, 'committed');
    assert.deepEqual(closed.result, debrief.result, 'Closure preserves the frozen final-cycle outcome.');
    await crew.page.reload();
    const recovered = await crew.until('Entitled closed-session crew history after real reload', value =>
      value.sameActor && value.sessionId === initial.sessionId && value.phase === 'closed');
    await crew.page.getByRole('dialog', { name: 'Endgame evaluation', exact: true }).waitFor();
    await crew.page.screenshot({ path: `${directory}/fresh-closed-history-crew.png` });
    await writeFile(`${directory}/${branch}-ending.json`, `${JSON.stringify({
      status: 'passed', actualBrowserContexts: 2, actualHumanDevices: 0,
      freshOrdinaryAdmission: true, adminGameplayWrites: false, acceleratedClock: false,
      scope: `Fresh manual full-game ${branch} progression, GM UI closure, exact cycle retries and entitled crew reload; every-function and other ending branches remain separate.`,
      advances, phases, terminal: { cycle: terminal.cycle, result: debrief.result.snapshot.result,
        source: debrief.result.snapshot.source, cause: debrief.result.snapshot.cause }, ordinaryDetailedGmReadDenied: true,
      closurePreservedSnapshot: true, recovered: { phase: recovered.phase, sameActor: recovered.sameActor },
    }, null, 2)}\n`);
  } finally { gm.page.off('request', capture); }
}

export const runPursuitLimitEnding = context => runEnding(context, { branch: 'pursuit-limit' });

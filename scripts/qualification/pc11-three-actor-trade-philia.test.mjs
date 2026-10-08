import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PC11_NORMAL_START } from './pc11-normal-start-adapter.mjs';

const runnerUrl = new URL('./pc11-three-actor-trade-philia.mjs', import.meta.url);
const runnerSource = await readFile(runnerUrl, 'utf8');

function functionSource(name, nextName) {
  const start = runnerSource.indexOf(`function ${name}`);
  const end = runnerSource.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `Expected bounded ${name} source region`);
  return runnerSource.slice(start, end);
}

test('normal casting readiness requires original identity and canonical seat without training markers', () => {
  const readiness = functionSource('castingStationReady', 'currentMemberBerthReady');
  assert.match(readiness, /pc11MemberReadiness\(value,\{sessionId:sid,uidHash:short\(actorUids\.get\(label\)\),roleId,stage:'station'\}\)/);
  assert.match(readiness, /value\.cycle===0/);
  assert.match(readiness, /value\.phase==='casting'/);
  assert.match(readiness, /value\.setupConfirmed/);
  assert.doesNotMatch(readiness, /fullGameDemo|training|preparing|manual/i);

  const join = functionSource('normalJoin', 'enterRole');
  assert.match(join, /joinSession/);
  assert.match(join, /v\.hasAuth&&v\.sameActor&&v\.sessionId===sid/);
  assert.match(join, /v\.cycle===0/);
  assert.match(join, /v\.phase==='casting'/);
  assert.match(join, /admissionActors\.set\(label,\{roleId:roleIds\[label\],sessionId:sid,uidHash:admitted\.uidHash\}\)/);
  assert.doesNotMatch(join, /fullGameDemo|training|preparing|manual/i);
});

test('normal game start uses ordinary production and clears the actual briefing', () => {
  assert.ok(runnerSource.includes('PC11_NORMAL_START.ui.productionButton'));
  assert.equal(PC11_NORMAL_START.ui.productionButton, 'Start production // Advance to Cycle 1');
  assert.equal(PC11_NORMAL_START.ui.briefingClearButton, 'Clear cycle briefing // resume clock');
  assert.ok(runnerSource.includes('clearTurnAdvanceInterstitial'));
  assert.ok(runnerSource.includes('pc11NormalStartPreflight'));
  assert.ok(runnerSource.includes('recommendedRoleIds(playerCount)'));
  assert.ok(runnerSource.includes('},PC11_NORMAL_START.setup.playerCount)'));
  assert.ok(runnerSource.includes('expectedMembers'));
  assert.ok(runnerSource.includes('expectedGm'));
  assert.ok(runnerSource.includes('occupiedSeatCount'));
});

test('normal PC11 path has no prepared-demo or manual Coordination gate', () => {
  for (const forbidden of [
    'prepareFullGameDemo',
    'advanceFullGameDemoPhase',
    'Full-game demo preparation',
    'Start full-game demo // Advance to Cycle 1',
    'Open Coordination manually',
    'Coordination Cycle1',
  ]) {
    assert.equal(runnerSource.includes(forbidden), false, `${forbidden} must not gate normal PC11 flow`);
  }
});

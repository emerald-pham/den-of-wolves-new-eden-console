import assert from 'node:assert/strict';
import test from 'node:test';
import * as helpers from './pc10-candidate-proof-helpers.mjs';

function fixture() {
  const roles = [...new Set(Object.values(helpers.CANDIDATE_PROOF_SHIPS)
    .filter(ship => ship.name !== 'Capybara').flatMap(ship => [ship.engineer, ship.captain]))];
  roles.push('wing-commander', 'icebreaker-miner', 'shepherd-scientist', 'quellon-explorer');
  const roster = roles.map(roleId => ({ roleId, uidHash: `actor-${roleId}` }));
  const started = { hasAuth: true, sameActor: true, sessionId: 'fresh-candidate', uidHash: 'original-gm',
    instanceId: 'owned-instance', playerRole: 'gm', gmInstanceOwned: true, connection: 'live', freshness: 'server',
    phase: 'active', cycle: 1, phaseProgression: 'manual', airspace: 'restricted', turnStatePhase: 'team',
    fullGameDemo: { status: 'active', progression: 'manual' }, activeRoleIds: roles,
    activeVesselIds: Object.keys(helpers.CANDIDATE_PROOF_SHIPS).filter(id => id !== 'capybara') };
  return { started, roster };
}

test('candidate start waits for the original server projection after a committed start, using reads alone', async () => {
  assert.equal(typeof helpers.waitForFreshCandidateStart, 'function');
  const { started, roster } = fixture();
  const observations = [{ ...started, connection: 'offline', freshness: 'cache' }, started];
  let reads = 0, waits = 0;
  const actual = await helpers.waitForFreshCandidateStart({ started, roster,
    inspect: async () => observations[reads++], wait: async () => { waits++; } });
  assert.equal(actual, started);
  assert.equal(reads, 2);
  assert.equal(waits, 1);
  assert.equal(observations[0].freshness, 'cache', 'The adapter cannot relabel cached evidence.');
});

test('candidate start refuses a changed GM identity while waiting for live authority', async () => {
  assert.equal(typeof helpers.waitForFreshCandidateStart, 'function');
  const { started, roster } = fixture();
  let waits = 0;
  await assert.rejects(helpers.waitForFreshCandidateStart({ started, roster,
    inspect: async () => ({ ...started, uidHash: 'different-gm', connection: 'offline', freshness: 'cache' }),
    wait: async () => { waits++; } }), /original GM/);
  assert.equal(waits, 0);
});

test('candidate start leaves a persistent cached projection failed at the unchanged bounded deadline', async () => {
  assert.equal(typeof helpers.waitForFreshCandidateStart, 'function');
  const { started, roster } = fixture();
  let time = 0, reads = 0;
  await assert.rejects(helpers.waitForFreshCandidateStart({ started, roster, timeoutMs: 5, now: () => time,
    inspect: async () => { reads++; return { ...started, connection: 'offline', freshness: 'cache' }; },
    wait: async () => { time += 5; } }), /live original GM.*deadline/);
  assert.equal(reads, 1);
  assert.equal(time, 5);
});

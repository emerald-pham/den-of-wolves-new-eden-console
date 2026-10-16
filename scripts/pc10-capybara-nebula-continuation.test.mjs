import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runNebulaEnding } from './pc10-candidate-manual-ui-proof.mjs';

const sessionId = 'h1-existing-session';
const continuationSource = await readFile(new URL('./pc10-candidate-manual-ui-proof.mjs', import.meta.url), 'utf8');
const jumpDriveSource = await readFile(new URL('../functions/src/jumpDrive.ts', import.meta.url), 'utf8');
const continuationStart = continuationSource.indexOf('async function continueCapybaraNebula');
const continuationEnd = continuationSource.indexOf('/** One genuine paid loss', continuationStart);
const continuationActionsSource = continuationSource.slice(continuationStart, continuationEnd);

function currentH1Coordination() {
  return {
    hasAuth: true,
    sameActor: true,
    sessionId,
    uidHash: 'original-gm-identity',
    instanceId: 'original-gm-instance',
    playerRole: 'gm',
    gmInstanceOwned: true,
    connection: 'live',
    freshness: 'server',
    phase: 'active',
    cycle: 4,
    phaseProgression: 'manual',
    airspace: 'lifted',
  };
}

test('Nebula continuation boundary preserves the H1-shaped Cycle 4 Coordination snapshot', async () => {
  const activeRoleIds = ['admiral', 'executive-officer', 'wing-commander', 'dione-engineer', 'dione-captain',
    'icebreaker-engineer', 'icebreaker-captain', 'shepherd-scientist', 'shepherd-captain', 'quellon-explorer',
    'quellon-captain', 'refinery-124-engineer', 'refinery-124-captain', 'gorgoneion-captain', 'highwall-miner',
    'capybara-captain', 'capybara-recycler', 'wolf-agent', 'wolf-cult', 'intelligence-agent'];
  const activeVesselIds = ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'];
  const gmState = currentH1Coordination();
  Object.assign(gmState, { activeRoleIds, activeVesselIds,
    fullGameDemo: { status: 'active', progression: 'manual' }, turnStatePhase: 'coordination',
    pressEnabled: true, capybaraEnabled: true });
  const context = {
    initial: { sessionId, joinCode: 'ordinary-join' },
    started: { sessionId, uidHash: gmState.uidHash, instanceId: gmState.instanceId },
    roster: [...activeRoleIds, 'press-officer'].map((roleId, index) => ({ roleId, uidHash: `actor-${index}` })),
    gm: { observe: async () => gmState },
    crew: {},
    directory: '/tmp/pc10-capybara-nebula-continuation-boundary',
  };

  const observed = new Error('H1 continuation checkpoint observed');
  await assert.rejects(runNebulaEnding(context, { onContinuationCheckpoint: async current => {
    assert.equal(current.sessionId, sessionId);
    assert.equal(current.uidHash, gmState.uidHash);
    assert.equal(current.instanceId, gmState.instanceId);
    assert.equal(current.cycle, 4);
    assert.equal(current.airspace, 'lifted');
    assert.equal(current.phaseProgression, 'manual');
    assert.deepEqual([...current.activeRoleIds].sort(), [...activeRoleIds].sort());
    assert.deepEqual([...current.activeVesselIds].sort(), [...activeVesselIds].sort());
    assert.equal(context.roster.length, 21);
    throw observed;
  } }), error => error === observed);
});

test('same-session continuation budgets both source-priced long jumps and every scanner refuel before spending fuel', () => {
  const floor = Number(continuationSource.match(/const fuelFloor = (\d+);/)?.[1]);
  const costsBlock = jumpDriveSource.match(/const JUMP_COSTS:[\s\S]*?= \{([\s\S]*?)\n\};/)?.[1];
  assert.ok(Number.isSafeInteger(floor), 'The ordinary visible GM continuation fuel minimum must be explicit.');
  assert.ok(costsBlock, 'Use the source-owned Jump Drive profile table for the upper bound.');
  const maximumUnupgradedLongJump = Math.max(...[...costsBlock.matchAll(/:\s*\[\d+,\s*\d+,\s*(\d+)\]/g)]
    .map(match => Number(match[1])));
  const scannerRefuels = 3; // Endeavour and Hummingbird each consume one host fuel in C5, C6 and C7.
  const minimumScannerBudget = maximumUnupgradedLongJump * 2 + scannerRefuels;
  assert.equal(maximumUnupgradedLongJump, 12, 'The printed source profile caps each paid long jump at 12 fuel.');
  assert.equal(minimumScannerBudget, 27);
  assert.ok(floor >= minimumScannerBudget,
    `The continuation gives each ship ${floor} fuel, below the scanner-host route budget ${minimumScannerBudget} ` +
    `(${maximumUnupgradedLongJump} outbound + ${scannerRefuels} maintenance refuels + ${maximumUnupgradedLongJump} Nebula attempt).`);
});

test('post-loss continuation follows the mounted workspace rule that removes the lost ship action', () => {
  assert.ok(continuationActionsSource.includes("const retainedLossAction = lostCandidate.getByRole('button'") &&
    continuationActionsSource.includes('assert.equal(await retainedLossAction.count(), 0,'),
  'Keep the original disposition and maintenance lock checks; the mounted workspace has no action for the lost ship.');
});

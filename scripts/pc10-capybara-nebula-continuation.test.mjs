import test from 'node:test';
import assert from 'node:assert/strict';
import { runNebulaEnding } from './pc10-candidate-manual-ui-proof.mjs';

const sessionId = 'h1-existing-session';

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

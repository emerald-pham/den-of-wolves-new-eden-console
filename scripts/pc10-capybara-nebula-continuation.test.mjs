import test from 'node:test';
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

test('Nebula continuation consumes the real H1 Cycle 4 Coordination session', async () => {
  const gmState = currentH1Coordination();
  const context = {
    initial: { sessionId, joinCode: 'ordinary-join' },
    started: { sessionId, uidHash: gmState.uidHash, instanceId: gmState.instanceId },
    roster: [{ roleId: 'executive-officer' }],
    gm: { observe: async () => gmState },
    crew: {},
    directory: '/tmp/pc10-capybara-nebula-continuation-red',
  };

  await runNebulaEnding(context);
});

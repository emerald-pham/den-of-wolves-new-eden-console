import assert from 'node:assert/strict';
import test from 'node:test';
import { qualifyMinimumCandidateActors } from './pc10-minimum-candidate-success.mjs';

// Synthetic observer snapshots only; these tests do not admit Auth actors.
const actor = (uidHash, role, assignedRoleId = null) => ({ uidHash, sessionId: 'owned-s1',
  hasAuth: true, sameActor: true, connection: 'live', freshness: 'server', playerRole: role,
  assignedRoleId, activeConsoleRoleId: assignedRoleId, seatId: assignedRoleId,
  currentCanonicalSeatOwned: true, phase: 'active', cycle: 2,
  ...(role === 'gm' ? { gmInstanceOwned: true, instanceId: 'owned-gm' } : {}) });
const fixture = code => ({ code, sessionId: 'owned-s1', configuredRoleCount: 14,
  gm: actor('gm-hash', 'gm'), scientist: actor('scientist-hash', 'player', 'shepherd-scientist'),
  representative: actor('representative-hash', 'player', code === 'N' ? 'dione-captain' : 'admiral') });

function legacyInput(code) {
  const input = fixture(code);
  const roles = ['admiral', 'wing-commander', 'dione-captain', 'dione-president', 'icebreaker-captain',
    'icebreaker-miner', 'shepherd-captain', 'shepherd-scientist', 'quellon-captain', 'quellon-explorer',
    'refinery-124-captain', 'refinery-124-pdf-colonel', 'joint-engineering-quellon-refinery',
    'joint-engineering-shepherd-icebreaker'];
  const lobby = value => ({ ...value, cycle: 0 });
  input.legacyAdmission = {
    confirmed: { sessionId: input.sessionId, setupConfirmed: true, cycle: 0, activeRoleIds: roles,
      pressEnabled: false, capybaraEnabled: false, uidHash: input.gm.uidHash, instanceId: input.gm.instanceId },
    gm: lobby(input.gm), controller: { ...lobby(input.representative), profileRoleId: 'controller' },
    roster: [{ roleId: 'shepherd-scientist', uidHash: input.scientist.uidHash }],
  };
  input.legacyConfiguration = { playerCount: 14, includePress: false, capybaraEnabled: false };
  return input;
}

test('fourteen configured roles with open unused seats require only three actual N/O actors', () => {
  for (const code of ['N', 'O']) {
    const result = qualifyMinimumCandidateActors(legacyInput(code));
    assert.equal(result.actualAuthenticatedActors, 3);
    assert.equal(result.configuredRoleCount, 14);
    assert.equal(result.fullRosterAdmission, false);
  }
});

test('small-cohort qualification rejects reused identity, foreign session and stale/wrong entitled actor', () => {
  for (const patch of [
    { uidHash: 'gm-hash' }, { sessionId: 'foreign' }, { sameActor: false },
    { connection: 'offline' }, { freshness: 'cache' }, { playerRole: 'gm' },
    { assignedRoleId: 'shepherd-engineer' }, { seatId: null }, { currentCanonicalSeatOwned: false },
  ]) {
    const input = fixture('O'); Object.assign(input.scientist, patch);
    assert.throws(() => qualifyMinimumCandidateActors(input));
  }
});

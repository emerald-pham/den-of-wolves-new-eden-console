import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chooseAvailableBaseShipRole, recheckChosenBaseShipRole } from './pc10-base-post-combat-choice-policy.mjs';

test('reselects and holds the chosen original role after other candidates reuse the shared crew surface', async () => {
  const source = await readFile(new URL('./pc10-base-gameplay-composed-post-combat.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function chooseCurrentShipRole(');
  const end = source.indexOf('async function compose(', start);
  assert.ok(start >= 0 && end > start, 'The mounted role selector remains inspectable.');
  assert.match(source.slice(start, end), /recheckChosenBaseShipRole\(/,
    'The UI path must use the same reselect callback tested here.');

  const sharedCrewSurface = { profileRoleId: null, heldRoleId: null };
  const candidates = ['shepherd-engineer', 'shepherd-captain'];
  const readinessByRoleId = {};
  for (const roleId of candidates) {
    // a.select() mutates one shared browser surface. A previous result keeps
    // that same surface object even after the next candidate changes its actor.
    sharedCrewSurface.profileRoleId = roleId;
    readinessByRoleId[roleId] = { status: 'eligible', cycle: 2,
      surface: sharedCrewSurface, actorRoleId: roleId };
  }
  const selection = chooseAvailableBaseShipRole({ candidates, readinessByRoleId, expectedCycle: 2 });
  assert.equal(selection.roleId, 'shepherd-engineer');
  assert.equal(readinessByRoleId[selection.roleId].surface.profileRoleId, 'shepherd-captain',
    'The fixture reproduces the shared surface now holding the later-probed actor.');

  const result = await recheckChosenBaseShipRole({ selection, expectedCycle: 2,
    inspectCurrentRole: async roleId => {
      sharedCrewSurface.profileRoleId = roleId;
      sharedCrewSurface.heldRoleId = roleId;
      return { ...readinessByRoleId[roleId], actorRoleId: roleId };
    } });
  assert.equal(result.status, 'eligible');
  assert.equal(result.readiness.actorRoleId, selection.roleId);
  assert.equal(result.readiness.surface.profileRoleId, selection.roleId);
  assert.equal(result.readiness.surface.heldRoleId, selection.roleId);

  const pending = await recheckChosenBaseShipRole({ selection, expectedCycle: 2,
    inspectCurrentRole: async () => ({ status: 'pending', cycle: 2, blockers: ['original-actor-no-longer-current'] }) });
  assert.equal(pending.status, 'pending', 'A role that cannot be reselected stays unoffered.');
});

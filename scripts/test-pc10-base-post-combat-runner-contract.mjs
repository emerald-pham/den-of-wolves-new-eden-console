import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = () => readFile(new URL('./pc10-base-gameplay-composed-post-combat.mjs', import.meta.url), 'utf8');

test('post-Wolf paid actions and the four separate research choices recheck the current source before credit', async () => {
  const source = await read();
  assert.match(source, /async function currentRoleReadiness\(/);
  assert.match(source, /await currentRoleReadiness\(shipId, roleId, cycle/);
  assert.match(source, /pendingActions\.push/);
  assert.match(source, /await currentRoleReadiness\('shepherd', 'shepherd-scientist', cycle/);
  assert.match(source, /protectedShipPriority:\s*\['shepherd', 'quellon'\]/);
  assert.doesNotMatch(source, /for \(const \[ship, , name\] of ships\) \{\s*const captain =/);
  assert.doesNotMatch(source, /checks\.sixChargedJumpsAndExactRetries = true;\s*$/m);
});

test('mission start binds the current mounted group to a source-verified carrier and exact receipt before credit', async () => {
  const source = await read();
  assert.match(source, /selectCurrentBaseMissionCarriers\(/);
  assert.match(source, /selectBaseMissionTeam\(/);
  assert.match(source, /getDocsFromServer/);
  assert.match(source, /getDocFromServer/);
  assert.match(source, /validateBaseMissionStartReceipt\(/);
  assert.match(source, /checks\.realMissionStartAndExactRetry\s*=\s*true/);
  assert.doesNotMatch(source, /const participants = \['wing-commander', 'shepherd-scientist', 'quellon-explorer'\]/);
  assert.match(source, /pendingActions/);
});

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

test('last real participant assignment receipt drives automatic resolution and original mission delivery', async () => {
  const source = await read();
  const submit = source.indexOf('Submit mission assignments');
  const assignmentStart = source.lastIndexOf("if (complete) for (const roleId of mission.participantRoleIds) {", submit);
  const assignmentEnd = source.indexOf('missionPrivateComplete = complete;', assignmentStart);
  assert.ok(assignmentStart >= 0 && assignmentEnd > assignmentStart, 'The mounted participant assignment consumer remains present.');
  const assignments = source.slice(assignmentStart, assignmentEnd);
  assert.match(assignments, /lastAssignmentReceipt\s*=\s*result/,
    'Keep the actual final participant submission reply that automatically resolves this mission.');
  assert.doesNotMatch(source, /Add facilitator cards|Resolve away mission/,
    'The server resolves atomically on the last participant assignment; obsolete GM buttons are not mounted afterward.');
  assert.match(source, /lastAssignmentReceipt\.missionId,\s*mission\.id/,
    'Consume the committed reply for the same original mission.');
  assert.match(source, /lastAssignmentReceipt\.revision,\s*lastAssignmentReceipt\.publicState\.revision/,
    'Preserve the server resolution at the original assignment receipt revision.');
  assert.match(source, /lastAssignmentReceipt\.publicState\.status,\s*'resolved'/,
    'Only the automatic resolved result may proceed to current leader custody delivery.');
  assert.match(source, /missionUi\(mission\.missionLeaderRoleId,\s*mission\.id[\s\S]*?Drop mission rewards at selected ship/,
    'Deliver results through the original mission leader and mission panel.');
});

test('Base prepares mission privacy through the ordinary GM control before the current mission deal', async () => {
  const source = await read();
  const deal = source.indexOf("uiRpc('gm', 'dealPrivateInitialCards'");
  const preparation = source.indexOf('await prepareCurrentMissionPrivacy(candidate);');
  assert.ok(preparation >= 0 && deal > preparation,
    'Run normal privacy preparation after source selection and before dealing any private cards.');
  assert.match(source, /getByRole\('button', \{ name: 'Prepare participant missions', exact: true \}\)/,
    'Use the offered mission-start control that owns the ordinary three-step server preparation.');
  assert.match(source, /getByRole\('status', \{ name: 'Participant mission preparation', exact: true \}\)/,
    'Wait for the mounted preparation consumer to confirm readiness.');
  assert.match(source, /Participant missions are prepared\./,
    'Do not start the mission while the mounted current session remains held.');
  assert.match(source, /name: 'Open private brief', exact: true/,
    'Resume each original participant through its normal private-brief route after cutover.');
});

test('scout request checks require the validated current craft-owner receipt and retain exact SDK replay', async () => {
  const source = await read();
  assert.ok(/validateBaseScoutRequestReceipt\(\{ receipt: result, sessionId: initial\.sessionId/.test(source),
    'Validate the actual server scout reply against the originally selected role and coordinate.');
  assert.ok(/checks\.scoutRequestsAndExactRetries = scoutResults\.every\(result => result\?\.status === 'committed'\)/.test(source),
    'Credit the scout branch only after every source receipt has been normalized as committed.');
  assert.ok(!/scoutResults\.every\(result => result\?\.status !== 'pending'\)/.test(source),
    'A missing or unexpected source reply cannot count as a scout commit.');
  assert.ok(/assert\.equal\(again\.status, 'committed'/.test(source),
    'Keep the original exact SDK replay requirement.');
  assert.ok(/assert\.deepEqual\(clean\(again\.result\), clean\(body\.result\)\)/.test(source),
    'Keep the exact result comparison across UI and replay receipts.');
});

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

test('Cycle 1 carries one current Core retarget witness to the source-timed arrival consumer before Wolf', async () => {
  const source = await read();
  assert.ok(/import \{ readActionState \} from '\.\/pc10-pending-procedure-ui-recipes\.mjs'/.test(source),
    'Bind the Core holder from its current member document authority.');
  assert.ok(/async function currentBaseCoreShuttleOrigin\(/.test(source),
    'Select the existing Core origin from the live Base source and admitted roster.');
  assert.ok(/async function waitForBaseShuttleArrivalWindow\(/.test(source),
    'Wait outside mounted capture against the actual current source arrivesAt.');
  assert.ok(/coordinationResult\?\.coordination\?\.evidence\?\.cases/.test(source),
    'Take the exact completed retarget witness from the original Coordination result.');
  assert.ok(/onShuttleAutoArrivalArmed/.test(source),
    'Use the existing arrival-only observer hook instead of rerunning Coordination.');
  assert.ok(/shuttleArrivalWitness:\s*retargetCase\.shuttleArrivalWitness/.test(source),
    'Preserve the original validated retarget witness for arrival.');
  assert.ok(/readServerSource\(`shuttleDepartures\/\$\{origin\.shuttleId\}`\)/.test(source),
    'Read actual source transit identity and arrivesAt before arming.');
  assert.ok(/await waitForBaseShuttleArrivalWindow\(/.test(source),
    'Complete the source-time arrival handoff before the opening Wolf sequence.');
  assert.ok(!/pressShuttleOriginAuthority/.test(source),
    'The Base Core consumer must not fall back across the distinct Press authority.');
});

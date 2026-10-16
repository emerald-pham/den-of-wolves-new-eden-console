import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = () => readFile(new URL('./pc10-capybara-full-gameplay.mjs', import.meta.url), 'utf8');

test('Capybara prepares mission privacy through the ordinary mounted GM consumer before the deal', async () => {
  const source = await read();
  const deal = source.indexOf("uiRpc('gm', 'dealPrivateInitialCards'");
  const preparation = source.indexOf('await prepareCurrentMissionPrivacy();');
  assert.ok(preparation >= 0 && deal > preparation,
    'Prepare the current mission through the ordinary GM UI before dealing private cards.');
  assert.match(source, /getByRole\('button', \{ name: 'Prepare participant missions', exact: true \}\)/,
    'Use the mounted GM control that owns ordinary mission privacy preparation.');
  assert.match(source, /getByRole\('status', \{ name: 'Participant mission preparation', exact: true \}\)/,
    'Wait for the mounted current-session privacy consumer to report readiness.');
  assert.match(source, /Participant missions are prepared\./,
    'Do not deal until the current ordinary consumer has finished cutover.');
});

test('Capybara accepts automatic final-assignment resolution and original leader delivery', async () => {
  const source = await read();
  const completion = source.indexOf('checks.privateMissionCardsAndLeaderChoices = true;');
  const assignmentStart = source.lastIndexOf('for (const role of participants) {', completion);
  const assignments = source.slice(assignmentStart, completion);
  assert.ok(assignmentStart >= 0 && completion > assignmentStart,
    'The current participant assignment loop remains the resolution trigger.');
  assert.match(assignments, /lastAssignmentReceipt\s*=\s*await missionUi\(role, missionId/,
    'Retain the actual last participant assignment reply.');
  assert.doesNotMatch(source, /Add facilitator cards|Resolve away mission/,
    'Automatic resolution leaves no mounted manual facilitator or resolve controls.');
  assert.match(source, /lastAssignmentReceipt\.missionId,\s*missionId/,
    'Require resolution for the same original mission.');
  assert.match(source, /lastAssignmentReceipt\.revision,\s*lastAssignmentReceipt\.publicState\.revision/,
    'Tie the automatic result to the committed assignment revision.');
  assert.match(source, /lastAssignmentReceipt\.publicState\.status,\s*'resolved'/,
    'Only the final assignment receipt may authorize proceeding to delivery.');
  assert.match(source, /missionUi\('wing-commander',\s*missionId[\s\S]*?Drop mission rewards at selected ship/,
    'Deliver via the original mission leader and mission panel.');
  assert.match(source, /checks\.serverMissionResolutionAndCustodyDelivery\s*=\s*missionLifecycleReceiptConfirmed/,
    'Core lifecycle evidence must depend on an actual same-mission resolution and delivery receipt.');
  assert.match(source, /if \(boaTaskOpportunityId && boaMissionOutcome &&\s*\['success', 'critical-success'\]/,
    'Keep the optional Boa successful-reward claim gated by an actual successful outcome.');
  assert.match(source, /await updateCapybaraStage\('mission-successful-delivery', \{ status: 'pending'/,
    'A failed random outcome must leave the source-dependent success stage pending.');
});

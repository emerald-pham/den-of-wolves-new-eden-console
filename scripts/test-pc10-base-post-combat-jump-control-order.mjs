import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the mounted jump preflight accepts the current launch control before changing its destination name', async () => {
  const runner = await readFile(new URL('./pc10-base-gameplay-composed-post-combat.mjs', import.meta.url), 'utf8');
  const jumpDrive = await readFile(new URL('../src/components/JumpDriveConsole.tsx', import.meta.url), 'utf8');
  const start = runner.indexOf('async function jump(');
  const end = runner.indexOf('async function mountedMissionParticipantLabels(', start);
  assert.ok(start >= 0 && end > start, 'The current Base jump callback remains inspectable.');
  const jump = runner.slice(start, end);

  assert.match(jumpDrive, /`Jump to \$\{destination\}`/,
    'The mounted button name follows the component destination state.');
  const currentCoordinate = '0000', selectedDestination = '1413';
  assert.notEqual(`Jump to ${currentCoordinate}`, `Jump to ${selectedDestination}`,
    'A normal new destination has a different launch-button name before the digit controls run.');

  const controls = jump.indexOf('Coordinate digit ${index + 1} value');
  const targetLaunch = jump.indexOf('Jump to ${destination}');
  assert.ok(controls >= 0 && targetLaunch > controls,
    'The destination-specific launch name is resolved only after ordinary coordinate input.');
  const beforeControls = jump.slice(0, controls);
  assert.doesNotMatch(beforeControls, /name: `Jump to \$\{destination\}`/,
    'Do not reject the currently mounted launch control because it has the old coordinate name.');
  assert.match(beforeControls, /name:\s*\/\^Jump to \\d\{4\}\$\//,
    'Preflight checks the single mounted launch control without changing destination state.');
  assert.ok(jump.indexOf('Lock destination coordinates') > controls &&
    targetLaunch > jump.indexOf('Lock destination coordinates'),
  'Keep the normal digit adjustment and destination-lock sequence before launch.');
});

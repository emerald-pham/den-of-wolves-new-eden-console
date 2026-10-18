import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRiskGates } from './risk-gates.mjs';
import { isTrackerPath, trackerValidationCommands } from './tracker-paths.mjs';

test('GitHub tracker files select their focused consumer gate and roadmap view check', () => {
  const crosswalk = classifyRiskGates(['docs/tracker/github-crosswalk.json']);
  const adapter = classifyRiskGates(['scripts/github-prompt-tracker.mjs']);
  assert.equal(crosswalk.trackerChanged, true);
  assert.equal(crosswalk.roadmapChanged, true);
  assert.equal(adapter.trackerChanged, true);
  assert.equal(classifyRiskGates(['scripts/generate-prompt-views.mjs']).trackerChanged, true);
  assert.equal(isTrackerPath('scripts/generate-prompt-views.mjs'), true);
  assert.deepEqual(trackerValidationCommands(['scripts/generate-prompt-views.mjs']), ['npm run test:prompt-tracker']);
  assert.equal(classifyRiskGates(['README.md']).trackerChanged, false);
});

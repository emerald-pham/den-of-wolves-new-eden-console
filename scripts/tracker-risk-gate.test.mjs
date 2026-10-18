import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRiskGates } from './risk-gates.mjs';

test('GitHub tracker files select their focused consumer gate and roadmap view check', () => {
  const crosswalk = classifyRiskGates(['docs/tracker/github-crosswalk.json']);
  const adapter = classifyRiskGates(['scripts/github-prompt-tracker.mjs']);
  assert.equal(crosswalk.trackerChanged, true);
  assert.equal(crosswalk.roadmapChanged, true);
  assert.equal(adapter.trackerChanged, true);
  assert.equal(classifyRiskGates(['README.md']).trackerChanged, false);
});

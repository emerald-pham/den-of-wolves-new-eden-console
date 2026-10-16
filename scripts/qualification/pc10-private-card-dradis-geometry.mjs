import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Consume measured browser rectangles, not stylesheet strings or predicted layout.
// Prepared rendering proves layout only; it never supplies Auth/gameplay credit.
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.ok(Array.isArray(input.measurements) && input.measurements.length > 0,
  'A real rendered geometry observation is required.');
function clipped(rect, viewport) {
  for (const field of ['left', 'right', 'top', 'bottom']) assert.ok(Number.isFinite(rect[field]));
  return { left: Math.max(0, rect.left), right: Math.min(viewport.width, rect.right),
    top: Math.max(0, rect.top), bottom: Math.min(viewport.height, rect.bottom) };
}
let visibleSamples = 0;
for (const sample of input.measurements) {
  assert.ok(Number.isFinite(sample.viewport.width) && sample.viewport.width > 0);
  assert.ok(Number.isFinite(sample.viewport.height) && sample.viewport.height > 0);
  const heading = clipped(sample.heading, sample.viewport);
  const plot = clipped(sample.plot, sample.viewport);
  if (heading.right <= heading.left || heading.bottom <= heading.top) continue;
  visibleSamples++;
  const width = Math.max(0, Math.min(heading.right, plot.right) - Math.max(heading.left, plot.left));
  const height = Math.max(0, Math.min(heading.bottom, plot.bottom) - Math.max(heading.top, plot.top));
  assert.equal(width * height, 0,
    `${sample.label}: compact DRADIS obscures the visible private-card heading`);
}
assert.ok(visibleSamples > 0, 'No visible private-card heading was measured.');
console.log(`Private-card/DRADIS geometry passed ${visibleSamples} visible rendered samples.`);

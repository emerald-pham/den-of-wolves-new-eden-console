import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Consume browser measurements. A stylesheet match cannot prove containment.
const geometry = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const diagnosis = JSON.parse(readFileSync(process.argv[3], 'utf8'));
assert.ok(Array.isArray(geometry.measurements) && geometry.measurements.length > 0);
assert.ok(Number.isFinite(diagnosis.viewport) && diagnosis.viewport > 0);
assert.ok(Array.isArray(diagnosis.elements));
const failures = [];
for (const sample of geometry.measurements) {
  assert.ok(Number.isFinite(sample.viewport.width) && sample.viewport.width > 0);
  assert.ok(Number.isFinite(sample.documentWidth) && sample.documentWidth > 0);
  if (sample.documentWidth > sample.viewport.width) {
    failures.push(`${sample.label}: document width ${sample.documentWidth} exceeds viewport ${sample.viewport.width}`);
  }
}
for (const className of ['session-readouts', 'session-badge__code', 'ship-console__identity', 'ship-console__back']) {
  const element = diagnosis.elements.find((item) => item.class.split(/\s+/).includes(className));
  assert.ok(element, `A measured ${className} is required.`);
  assert.ok(Number.isFinite(element.left) && Number.isFinite(element.right));
  assert.ok(element.right > element.left, `${className} must retain positive width.`);
  if (element.left < 0 || element.right > diagnosis.viewport) {
    failures.push(`${className}: horizontal bounds ${element.left}..${element.right} exceed viewport 0..${diagnosis.viewport}`);
  }
}
// Report every observed failure, including the code clipped at the left edge.
assert.equal(failures.length, 0, failures.join('\n'));
console.log(`Console containment passed ${geometry.measurements.length} rendered widths and four identity/readout bounds.`);

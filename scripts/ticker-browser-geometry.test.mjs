import assert from 'node:assert/strict';
import test from 'node:test';
import { assessTickerGeometry } from './ticker-browser-geometry.mjs';

const frame = { left: 100, right: 200, width: 100 };
const initialPosition = {
  id: 'edge-group',
  left: frame.right,
  right: frame.right + 100,
  width: 100,
  frame,
  startX: frame.width,
  elapsed: 0,
};

function createSamples({ visibleJumpAt = -1, offscreenJumpAt = -1 } = {}) {
  return Array.from({ length: 18 }, (_, sampleIndex) => {
    const frameIndex = sampleIndex + 1;
    const elapsed = frameIndex * (1_000 / 60);
    const edgeLeft = initialPosition.left - (48 * elapsed / 1_000) -
      (frameIndex === visibleJumpAt ? 8 : 0);
    const startupLeft = 250 - (48 * Math.max(0, elapsed - (1_000 / 60)) / 1_000) -
      (frameIndex >= 2 ? 4.8 : 0) -
      (frameIndex === offscreenJumpAt ? 8 : 0);
    return {
      elapsed,
      frame,
      groups: [
        { id: 'edge-group', left: edgeLeft, right: edgeLeft + 100, width: 100 },
        { id: 'offscreen-group', left: startupLeft, right: startupLeft + 100, width: 100 },
      ],
    };
  });
}

test('allows one offscreen first-frame compositor sample and checks entry motion', () => {
  const result = assessTickerGeometry({ initialPosition, samples: createSamples() });

  assert.equal(result.initialEdgeValid, true);
  assert.equal(result.movedTowardViewport, true);
  assert.equal(result.entryTransitionObserved, true);
  assert.equal(result.ignoredOffscreenFirstFrameSamples, 1);
  assert.equal(result.speedStable, true);
});

test('rejects a speed jump during or after visible entry', () => {
  const result = assessTickerGeometry({
    initialPosition,
    samples: createSamples({ visibleJumpAt: 8 }),
  });

  assert.equal(result.entryTransitionObserved, true);
  assert.equal(result.speedStable, false);
  assert.ok(result.failures.some((failure) => failure.includes('constant-speed')));
});

test('rejects an additional offscreen jump after the first sampled frame', () => {
  const result = assessTickerGeometry({
    initialPosition,
    samples: createSamples({ offscreenJumpAt: 5 }),
  });

  assert.equal(result.ignoredOffscreenFirstFrameSamples, 1);
  assert.equal(result.speedStable, false);
  assert.ok(result.failures.some((failure) => failure.includes('constant-speed')));
});

test('fails closed when the physical track did not start at the offscreen edge', () => {
  const result = assessTickerGeometry({
    initialPosition: { ...initialPosition, left: initialPosition.left - 12, startX: frame.width - 12 },
    samples: createSamples(),
  });

  assert.equal(result.initialEdgeValid, false);
  assert.ok(result.failures.some((failure) => failure.includes('offscreen edge')));
});

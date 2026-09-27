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

function createSamples({
  visibleJumpAt = -1,
  startupCompositorDisplacement = 0,
  teleportAtStart = 0,
  reflowAt = -1,
  reflowJumpAt = -1,
  reflowJumpPx = 0,
} = {}) {
  return Array.from({ length: 36 }, (_, sampleIndex) => {
    const frameIndex = sampleIndex + 1;
    const elapsed = frameIndex * (1_000 / 60);
    const edgeLeft = initialPosition.left + 0.8 - (48 * elapsed / 1_000) -
      (frameIndex === visibleJumpAt ? 8 : 0) -
      (frameIndex === 1 ? teleportAtStart : 0) +
      (frameIndex === 1 ? startupCompositorDisplacement : 0) +
      (frameIndex >= 2 && startupCompositorDisplacement > 0 ? 0.8 : 0);
    const startupLeft = 250 - (48 * Math.max(0, elapsed - (2 * 1_000 / 60)) / 1_000) +
      (reflowJumpAt >= 0 && sampleIndex >= reflowJumpAt ? reflowJumpPx : 0);
    const sampleFrame = reflowAt >= 0 && sampleIndex >= reflowAt
      ? { left: frame.left, right: frame.right - 10, width: frame.width - 10 }
      : frame;
    return {
      elapsed,
      frame: sampleFrame,
      groups: [
        { id: 'edge-group', left: edgeLeft, right: edgeLeft + 100, width: 100 },
        { id: 'offscreen-group', left: startupLeft, right: startupLeft + 100, width: 100 },
      ],
    };
  });
}

function createInitialEdgeStartSamples(firstStep = 0.8, stationaryIntervals = 2, initialOffset = 0) {
  return Array.from({ length: 24 }, (_, sampleIndex) => {
    const elapsed = (sampleIndex + 1) * (1_000 / 60);
    const left = sampleIndex <= stationaryIntervals
      ? initialPosition.left + initialOffset
      : initialPosition.left + initialOffset - firstStep -
        ((sampleIndex - stationaryIntervals - 1) * 0.8);
    return {
      elapsed,
      frame,
      groups: [{ id: initialPosition.id, left, right: left + initialPosition.width, width: initialPosition.width }],
    };
  });
}

test('allows one offscreen first-frame compositor sample and checks entry motion', () => {
  const result = assessTickerGeometry({
    initialPosition,
    samples: createSamples({ startupCompositorDisplacement: 4.8 }),
  });

  assert.equal(result.initialEdgeValid, true);
  assert.equal(result.initialSampleEdgeValid, true);
  assert.equal(result.movedTowardViewport, true);
  assert.equal(result.entryTransitionObserved, true);
  assert.equal(result.ignoredOffscreenFirstFrameSamples, 1);
  assert.ok(result.ignoredMountDelayTracks.includes('offscreen-group'));
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

test('checks a non-anchor group speed after it enters the frame', () => {
  const secondStart = {
    id: 'second-group',
    left: 208,
    right: 308,
    width: 100,
    frame,
    startX: 208,
  };
  const samples = Array.from({ length: 24 }, (_, sampleIndex) => {
    const frameIndex = sampleIndex + 1;
    const elapsed = frameIndex * (1_000 / 60);
    const anchorLeft = initialPosition.left + 0.8 - (48 * elapsed / 1_000);
    const secondLeft = secondStart.left - (48 * elapsed / 1_000) - (frameIndex >= 14 ? 8 : 0);
    return {
      elapsed,
      frame,
      groups: [
        { id: 'edge-group', left: anchorLeft, right: anchorLeft + 100, width: 100 },
        { id: 'second-group', left: secondLeft, right: secondLeft + 100, width: 100 },
      ],
    };
  });
  const result = assessTickerGeometry({
    initialPosition,
    initialPositions: [initialPosition, secondStart],
    samples,
  });

  assert.equal(result.entryTransitionObserved, true);
  assert.equal(result.speedStable, false);
  assert.ok(result.failures.some((failure) => failure.includes('second-group constant-speed')));
});

test('rejects alternating adjacent-frame jumps hidden by a two-frame average', () => {
  const samples = Array.from({ length: 36 }, (_, sampleIndex) => {
    const elapsed = (sampleIndex + 1) * (1_000 / 60);
    const baseline = initialPosition.left - (48 * elapsed / 1_000);
    const left = sampleIndex === 0
      ? initialPosition.left
      : sampleIndex === 1
        ? baseline
        : baseline + (sampleIndex % 2 === 0 ? 4 : -4);
    return {
      elapsed,
      frame,
      groups: [{ id: initialPosition.id, left, right: left + 100, width: 100 }],
    };
  });
  const result = assessTickerGeometry({ initialPosition, samples });

  assert.equal(result.initialSampleEdgeValid, true);
  assert.equal(result.entryTransitionObserved, true);
  assert.equal(result.speedStable, false);
  assert.ok(result.failures.some((failure) => failure.includes('constant-speed')));
});

test('allows one sub-1.5px first motion sample at the offscreen edge after mount delay', () => {
  const result = assessTickerGeometry({
    initialPosition,
    samples: createInitialEdgeStartSamples(1.5, 2, 1.5),
  });

  assert.equal(result.entryTransitionObserved, true);
  assert.deepEqual(result.ignoredInitialEdgeStepTracks, [initialPosition.id]);
  assert.equal(result.speedStable, true);
});

test('rejects a larger first motion jump at the offscreen edge after mount delay', () => {
  const result = assessTickerGeometry({
    initialPosition,
    samples: createInitialEdgeStartSamples(8),
  });

  assert.equal(result.entryTransitionObserved, true);
  assert.deepEqual(result.ignoredInitialEdgeStepTracks, []);
  assert.equal(result.speedStable, false);
  assert.ok(result.failures.some((failure) => failure.includes('constant-speed')));
});

test('rejects an offscreen mount delay after the bounded startup window', () => {
  const result = assessTickerGeometry({
    initialPosition,
    samples: createInitialEdgeStartSamples(0.8, 4),
  });

  assert.equal(result.ignoredMountDelayTracks.includes(initialPosition.id), true);
  assert.equal(result.speedStable, false);
  assert.ok(result.failures.some((failure) => failure.includes('constant-speed sample 0.00px/s')));
});

test('does not excuse a stationary first interval after the track is visible', () => {
  const visibleFrame = { left: 0, right: 200, width: 200 };
  const visibleStart = {
    id: 'visible-mount-delay', left: 200, right: 300, width: 100,
    frame: visibleFrame, startX: 200,
  };
  const samples = Array.from({ length: 24 }, (_, sampleIndex) => {
    const elapsed = (sampleIndex + 1) * (1_000 / 60);
    const left = sampleIndex < 2 ? 197 : 197 - (48 * (elapsed - (2 * 1_000 / 60)) / 1_000);
    return {
      elapsed,
      frame: visibleFrame,
      groups: [{ id: visibleStart.id, left, right: left + 100, width: 100 }],
    };
  });
  const result = assessTickerGeometry({ initialPosition: visibleStart, samples });

  assert.deepEqual(result.ignoredMountDelayTracks, []);
  assert.equal(result.speedStable, false);
  assert.ok(result.failures.some((failure) => failure.includes('constant-speed')));
});

test('rejects a first compositor jump that crosses into the frame', () => {
  const samples = Array.from({ length: 24 }, (_, sampleIndex) => {
    const elapsed = (sampleIndex + 1) * (1_000 / 60);
    const left = sampleIndex === 0
      ? initialPosition.left + 6
      : sampleIndex === 1
        ? initialPosition.left - 2
        : initialPosition.left - 2 - (48 * (elapsed - (2 * 1_000 / 60)) / 1_000);
    return {
      elapsed,
      frame,
      groups: [{ id: initialPosition.id, left, right: left + 100, width: 100 }],
    };
  });
  const result = assessTickerGeometry({ initialPosition, samples });

  assert.equal(result.initialSampleEdgeValid, true);
  assert.equal(result.speedStable, false);
  assert.ok(result.failures.some((failure) => failure.includes('constant-speed')));
});

test('does not waive an initial step after the ticker has entered the frame', () => {
  const visibleFrame = { left: 0, right: 100, width: 100 };
  const visibleStart = {
    id: 'visible-first-step', left: 100, right: 200, width: 100,
    frame: visibleFrame, startX: 100,
  };
  const samples = Array.from({ length: 24 }, (_, sampleIndex) => {
    const elapsed = (sampleIndex + 1) * (1_000 / 60);
    const left = sampleIndex === 0
      ? 100
      : 98.5 - ((sampleIndex - 1) * 0.8);
    return {
      elapsed,
      frame: visibleFrame,
      groups: [{ id: visibleStart.id, left, right: left + 100, width: 100 }],
    };
  });
  const result = assessTickerGeometry({ initialPosition: visibleStart, samples });

  assert.equal(result.initialSampleEdgeValid, true);
  assert.equal(result.entryTransitionObserved, true);
  assert.equal(result.ignoredOffscreenFirstFrameSamples, 0);
  assert.equal(result.speedStable, false);
  assert.ok(result.failures.some((failure) => failure.includes('constant-speed')));
});

test('allows one offscreen correction frame after the initial container reflow', () => {
  const result = assessTickerGeometry({
    initialPosition,
    samples: createSamples({ reflowAt: 3, reflowJumpAt: 4, reflowJumpPx: -1.6 }),
  });

  assert.equal(result.speedStable, true);
  assert.equal(result.entryTransitionObserved, true);
});

test('rejects another offscreen jump after the container reflow settles', () => {
  const result = assessTickerGeometry({
    initialPosition,
    samples: createSamples({ reflowAt: 3, reflowJumpAt: 7, reflowJumpPx: -1.6 }),
  });

  assert.equal(result.speedStable, false);
  assert.ok(result.failures.some((failure) => failure.includes('constant-speed')));
});

test('rejects an offscreen teleport larger than the initial frame-width correction', () => {
  const result = assessTickerGeometry({
    initialPosition,
    samples: createSamples({ reflowAt: 3, reflowJumpAt: 4, reflowJumpPx: 500 }),
  });

  assert.equal(result.entryTransitionObserved, true);
  assert.equal(result.speedStable, false);
  assert.ok(result.failures.some((failure) => (
    failure.includes('offscreen-group constant-speed')
  )));
});

test('rejects a first actual rAF sample that teleported away from the expected offscreen edge', () => {
  const result = assessTickerGeometry({
    initialPosition,
    samples: createSamples({ teleportAtStart: 8 }),
  });

  assert.equal(result.initialEdgeValid, true);
  assert.equal(result.initialSampleEdgeValid, false);
  assert.equal(result.speedStable, false);
  assert.ok(result.failures.some((failure) => failure.includes('first actual rAF sample')));
});

test('fails closed when the physical track did not start at the offscreen edge', () => {
  const result = assessTickerGeometry({
    initialPosition: { ...initialPosition, left: initialPosition.left - 12, startX: frame.width - 12 },
    samples: createSamples(),
  });

  assert.equal(result.initialEdgeValid, false);
  assert.ok(result.failures.some((failure) => failure.includes('offscreen edge')));
});

test('requires actual rAF samples to show the offscreen-to-visible entry', () => {
  const teleportedSamples = Array.from({ length: 12 }, (_, sampleIndex) => {
    const elapsed = 1_000 + sampleIndex * (1_000 / 60);
    const left = 152 - sampleIndex * 0.8;
    return {
      elapsed,
      frame,
      groups: [{ id: 'edge-group', left, right: left + 100, width: 100 }],
    };
  });
  const result = assessTickerGeometry({ initialPosition, samples: teleportedSamples });

  assert.equal(result.initialEdgeValid, true);
  assert.equal(result.entryTransitionObserved, false);
  assert.ok(result.failures.some((failure) => failure.includes('entry transition')));
});

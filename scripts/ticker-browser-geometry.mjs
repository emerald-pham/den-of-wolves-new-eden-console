const DEFAULT_MIN_SPEED = -64;
const DEFAULT_MAX_SPEED = -32;
const DEFAULT_MINIMUM_VELOCITY_SAMPLES = 8;
const EDGE_TOLERANCE_PX = 2;

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizePosition(position, sampleIndex) {
  const frame = position.frame ?? {};
  return {
    ...position,
    frameLeft: position.frameLeft ?? frame.left,
    frameRight: position.frameRight ?? frame.right,
    sampleIndex,
  };
}

function isBeyondRightEdge(position) {
  return finite(position.left) && finite(position.frameRight) &&
    position.left >= position.frameRight;
}

function overlapsFrame(position) {
  return finite(position.left) && finite(position.right) &&
    finite(position.frameLeft) && finite(position.frameRight) &&
    position.left < position.frameRight && position.right > position.frameLeft;
}

export function assessTickerGeometry({
  initialPosition,
  samples = [],
  minimumVelocitySamples = DEFAULT_MINIMUM_VELOCITY_SAMPLES,
  minimumSpeed = DEFAULT_MIN_SPEED,
  maximumSpeed = DEFAULT_MAX_SPEED,
} = {}) {
  const failures = [];
  const initial = initialPosition ? normalizePosition(initialPosition, -1) : null;
  if (initial && finite(initial.frameRight) && finite(initial.left) &&
      Math.abs(initial.left - initial.frameRight) <= EDGE_TOLERANCE_PX) {
    const edgeAdjustment = initial.frameRight - initial.left;
    initial.left += edgeAdjustment;
    if (finite(initial.right)) initial.right += edgeAdjustment;
  }
  const frameWidth = initial && finite(initial.frameLeft) && finite(initial.frameRight)
    ? initial.frameRight - initial.frameLeft
    : NaN;
  const initialEdgeValid = Boolean(initial && finite(initial.startX) && finite(frameWidth) &&
    finite(initial.left) && Math.abs(initial.startX - frameWidth) <= EDGE_TOLERANCE_PX &&
    Math.abs(initial.left - initial.frameRight) <= EDGE_TOLERANCE_PX);

  if (!initialEdgeValid) failures.push('initial group did not start at the expected offscreen edge');

  const normalizedSamples = Array.isArray(samples) ? samples : [];
  const anchorPositions = [initial].filter(Boolean);
  const tracks = new Map();
  for (const [sampleIndex, sample] of normalizedSamples.entries()) {
    if (!finite(sample?.elapsed) || !Array.isArray(sample.groups)) continue;
    for (const group of sample.groups) {
      if (typeof group?.id !== 'string' || !group.id || !finite(group.left) || !finite(group.right)) continue;
      const position = normalizePosition({
        ...group,
        elapsed: sample.elapsed,
        frame: sample.frame,
      }, sampleIndex);
      const positions = tracks.get(group.id) ?? [];
      positions.push(position);
      tracks.set(group.id, positions);
      if (group.id === initial?.id) anchorPositions.push(position);
    }
  }
  anchorPositions.sort((left, right) => left.elapsed - right.elapsed);

  const movedTowardViewport = Boolean(initial && anchorPositions.some((position) => (
    position.sampleIndex >= 0 && position.elapsed > initial.elapsed &&
    position.left < initial.left - 0.25
  )));
  if (!movedTowardViewport) failures.push('initial group did not move toward the viewport');

  let entryTransitionObserved = false;
  for (let index = 1; index < anchorPositions.length; index += 1) {
    const previous = anchorPositions[index - 1];
    const current = anchorPositions[index];
    if (isBeyondRightEdge(previous) && overlapsFrame(current)) {
      entryTransitionObserved = true;
      break;
    }
  }
  if (!entryTransitionObserved) failures.push('initial group entry transition was not sampled');

  if (initial?.id && tracks.has(initial.id)) {
    tracks.set(initial.id, anchorPositions);
  }

  const velocitiesByTrack = new Map();
  let ignoredStartupSample = false;
  for (const [id, rawPositions] of tracks) {
    const positions = [...rawPositions].sort((left, right) => left.elapsed - right.elapsed);
    const velocities = [];
    for (let index = 1; index < positions.length; index += 1) {
      const previous = positions[index - 1];
      const current = positions[index];
      const elapsed = current.elapsed - previous.elapsed;
      if (!finite(elapsed) || elapsed <= 0) {
        failures.push(`track ${id} has non-increasing rAF timestamps`);
        continue;
      }
      const speed = (current.left - previous.left) / elapsed * 1_000;
      velocities.push({
        speed,
        previous,
        current,
        sampleIndex: current.sampleIndex,
      });
    }
    velocitiesByTrack.set(id, velocities);
  }

  const allVelocitySamples = [...velocitiesByTrack.entries()].flatMap(([id, velocities]) => (
    velocities.map((velocity) => ({ id, ...velocity }))
  )).sort((left, right) => left.current.elapsed - right.current.elapsed);

  const checkedVelocitySamples = [];
  for (const velocity of allVelocitySamples) {
    const withinRange = velocity.speed >= minimumSpeed && velocity.speed <= maximumSpeed;
    if (withinRange) {
      checkedVelocitySamples.push(velocity);
      continue;
    }

    const isFirstObservedInterval = velocity.current.sampleIndex === 0 ||
      (velocity.previous.sampleIndex === 0 && velocity.current.sampleIndex === 1);
    const isOffscreenFirstFrame = isFirstObservedInterval &&
      isBeyondRightEdge(velocity.previous) && isBeyondRightEdge(velocity.current);
    if (!ignoredStartupSample && isOffscreenFirstFrame) {
      ignoredStartupSample = true;
      continue;
    }

    failures.push(
      `track ${velocity.id} constant-speed sample ${velocity.speed.toFixed(2)}px/s ` +
      `outside ${minimumSpeed}..${maximumSpeed}px/s`,
    );
    checkedVelocitySamples.push(velocity);
  }

  const anchorVelocityCount = velocitiesByTrack.get(initial?.id)?.length ?? 0;
  if (anchorVelocityCount < minimumVelocitySamples) {
    failures.push(`initial track has only ${anchorVelocityCount} velocity samples`);
  }

  const speedStable = failures.every((failure) => !failure.includes('constant-speed')) &&
    anchorVelocityCount >= minimumVelocitySamples;

  return {
    initialEdgeValid,
    movedTowardViewport,
    entryTransitionObserved,
    checkedVelocitySampleCount: checkedVelocitySamples.length,
    ignoredOffscreenFirstFrameSamples: Number(ignoredStartupSample),
    speedStable,
    failures,
  };
}

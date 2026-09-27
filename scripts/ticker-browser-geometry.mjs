const DEFAULT_MIN_SPEED = -64;
const DEFAULT_MAX_SPEED = -32;
const DEFAULT_MINIMUM_VELOCITY_SAMPLES = 8;
const EDGE_TOLERANCE_PX = 2;
const START_SAMPLE_TOLERANCE_PX = 6;
const INITIAL_EDGE_STEP_TOLERANCE_PX = 1.5;
const MAX_OFFSCREEN_MOUNT_DELAY_INTERVALS = 3;
const MAX_OFFSCREEN_STARTUP_CATCHUP_INTERVALS = 3;
const INITIAL_FRAME_CORRECTION_TOLERANCE_PX = 1.5;

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
  initialPositions,
  samples = [],
  requireAnimationClock = false,
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
  const starts = Array.isArray(initialPositions) && initialPositions.length > 0
    ? initialPositions
    : (initialPosition ? [initialPosition] : []);
  const startsById = new Map(starts.filter((start) => typeof start?.id === 'string' && start.id)
    .map((start) => [start.id, normalizePosition(start, -1)]));
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
    }
  }
  const anchorPositions = [...(tracks.get(initial?.id) ?? [])]
    .sort((left, right) => left.elapsed - right.elapsed);

  const firstAnchorPosition = anchorPositions[0];
  const initialSampleEdgeValid = Boolean(initial && firstAnchorPosition &&
    Math.abs(firstAnchorPosition.left - initial.left) <= START_SAMPLE_TOLERANCE_PX);
  if (!initialSampleEdgeValid) {
    failures.push('first actual rAF sample did not match the configured offscreen start');
  }
  for (const [id, start] of startsById) {
    const firstPosition = [...(tracks.get(id) ?? [])]
      .sort((left, right) => left.elapsed - right.elapsed)[0];
    if (!firstPosition || Math.abs(firstPosition.left - start.left) > START_SAMPLE_TOLERANCE_PX) {
      failures.push(`track ${id} first actual rAF sample did not match its configured start`);
    }
  }
  const movedTowardViewport = Boolean(firstAnchorPosition && anchorPositions.some((position) => (
    position.sampleIndex > firstAnchorPosition.sampleIndex &&
    position.left < firstAnchorPosition.left - 0.25
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

  const firstReflowCorrection = (() => {
    for (let index = 1; index < normalizedSamples.length; index += 1) {
      const beforeWidth = normalizedSamples[index - 1]?.frame?.width;
      const afterWidth = normalizedSamples[index]?.frame?.width;
      if (finite(beforeWidth) && finite(afterWidth) && Math.abs(beforeWidth - afterWidth) > 0.5) {
        return {
          sampleIndex: index,
          widthChangePx: Math.abs(afterWidth - beforeWidth),
        };
      }
    }
    return null;
  })();
  const isFullyOffscreen = (position) => finite(position.left) &&
    finite(position.frameRight) && position.left >= position.frameRight;

  const velocitiesByTrack = new Map();
  const ignoredMountDelayTracks = [];
  const ignoredInitialEdgeStepTracks = [];
  let ignoredStartupSampleIndex = null;
  const checkedVelocitySamples = [];
  for (const [id, rawPositions] of tracks) {
    const positions = [...rawPositions].sort((left, right) => left.elapsed - right.elapsed);
    const velocities = [];
    const firstInterval = positions.length >= 2 ? positions.slice(0, 2) : null;
    const firstIntervalWallMs = firstInterval
      ? firstInterval[1].elapsed - firstInterval[0].elapsed
      : NaN;
    const firstIntervalAnimationMs = firstInterval
      ? firstInterval[1].animationTimeMs - firstInterval[0].animationTimeMs
      : NaN;
    const firstIntervalDurationMs = firstInterval && finite(firstIntervalAnimationMs) &&
      firstIntervalAnimationMs > 0
      ? firstIntervalAnimationMs
      : firstIntervalWallMs;
    const firstIntervalSpeed = firstInterval && firstIntervalDurationMs > 0
      ? (firstInterval[1].left - firstInterval[0].left) / firstIntervalDurationMs * 1_000
      : NaN;
    const firstIntervalIsMountDelay = firstInterval && finite(firstIntervalSpeed) &&
      Math.abs(firstIntervalSpeed) <= 0.5 && firstInterval.every(isFullyOffscreen);
    if (firstIntervalIsMountDelay) ignoredMountDelayTracks.push(id);
    let ignoredInitialEdgeStep = false;
    let initialMotionStarted = false;
    let acceptedStartupClockCatchup = false;
    let usedFrameReflowCorrection = false;

    for (let index = 1; index < positions.length; index += 1) {
      const previous = positions[index - 1];
      const current = positions[index];
      const wallElapsed = current.elapsed - previous.elapsed;
      if (!finite(wallElapsed) || wallElapsed <= 0) {
        failures.push(`track ${id} has non-increasing rAF timestamps`);
        continue;
      }
      const animationElapsed = current.animationTimeMs - previous.animationTimeMs;
      const displacement = current.left - previous.left;
      const noEarlierMotion = positions.slice(0, index).every((position) => (
        Math.abs(position.left - positions[0].left) <= 0.25
      ));
      const windowOffscreen = isFullyOffscreen(previous) && isFullyOffscreen(current);
      const animationTimesAreFinite = finite(previous.animationTimeMs) && finite(current.animationTimeMs);
      const validAnimationTimes = animationTimesAreFinite && previous.animationTimeMs >= 0 &&
        current.animationTimeMs >= 0;
      const missingAnimationClockEndpoint = previous.animationTimeMs == null ||
        current.animationTimeMs == null;
      const invalidAnimationClockEndpoint = [previous.animationTimeMs, current.animationTimeMs].some((time) => (
        time !== null && time !== undefined && (!finite(time) || time < 0)
      ));
      const idleOffscreenBeforeStart = index <= MAX_OFFSCREEN_STARTUP_CATCHUP_INTERVALS &&
        noEarlierMotion && Math.abs(displacement) <= 0.25 && windowOffscreen;
      if (requireAnimationClock && invalidAnimationClockEndpoint) {
        failures.push(`track ${id} has missing, negative, or reset animation currentTime`);
        continue;
      }
      if (requireAnimationClock && missingAnimationClockEndpoint && !idleOffscreenBeforeStart) {
        failures.push(`track ${id} has missing, negative, or reset animation currentTime`);
        continue;
      }
      const startupClockCatchup = !acceptedStartupClockCatchup &&
        index <= MAX_OFFSCREEN_STARTUP_CATCHUP_INTERVALS &&
        noEarlierMotion && isFullyOffscreen(previous) && displacement < -0.25 &&
        validAnimationTimes && previous.animationTimeMs <= 1 &&
        animationElapsed > 0 &&
        animationElapsed < wallElapsed;
      const adjacentToInitialFrameReflow = firstReflowCorrection !== null && (
        (previous.sampleIndex === firstReflowCorrection.sampleIndex - 1 &&
          current.sampleIndex === firstReflowCorrection.sampleIndex) ||
        (previous.sampleIndex === firstReflowCorrection.sampleIndex &&
          current.sampleIndex === firstReflowCorrection.sampleIndex + 1)
      );
      const withinFrameCorrectionBound = adjacentToInitialFrameReflow &&
        Math.abs(displacement) <= firstReflowCorrection.widthChangePx + INITIAL_FRAME_CORRECTION_TOLERANCE_PX;
      const reflowCorrectionAvailable = !usedFrameReflowCorrection &&
        adjacentToInitialFrameReflow && withinFrameCorrectionBound &&
        isFullyOffscreen(previous) && isFullyOffscreen(current);
      const discontinuousAnimationClock = requireAnimationClock && validAnimationTimes &&
        animationElapsed > 0 && Math.abs(animationElapsed - wallElapsed) > 3 &&
        !startupClockCatchup;
      const reflowClockCorrection = requireAnimationClock && reflowCorrectionAvailable &&
        validAnimationTimes && (animationElapsed < 0 || discontinuousAnimationClock);
      const resetAnimationClock = validAnimationTimes && animationElapsed < 0;
      if (requireAnimationClock && resetAnimationClock && !reflowClockCorrection) {
        failures.push(`track ${id} has missing, negative, or reset animation currentTime`);
        continue;
      }
      if (discontinuousAnimationClock && !reflowClockCorrection) {
        failures.push(`track ${id} has discontinuous animation currentTime`);
        continue;
      }
      if (reflowClockCorrection) {
        // Reflow may deliberately rebase the CSS timeline for one bounded,
        // still-offscreen correction interval.
        usedFrameReflowCorrection = true;
      }
      const animationClockStoppedDuringMovement = requireAnimationClock && validAnimationTimes &&
        animationElapsed === 0 && (overlapsFrame(previous) || overlapsFrame(current) ||
          Math.abs(displacement) > 0.25);
      if (animationClockStoppedDuringMovement && !reflowClockCorrection) {
        failures.push(`track ${id} animation currentTime stopped during visible or offscreen movement`);
        continue;
      }
      const elapsed = validAnimationTimes && animationElapsed > 0
        ? animationElapsed
        : wallElapsed;
      const speed = displacement / elapsed * 1_000;
      const velocity = {
        speed,
        previous,
        current,
        firstWindow: index === 1,
        sampleIndex: current.sampleIndex,
      };
      velocities.push(velocity);
      if (startupClockCatchup) {
        acceptedStartupClockCatchup = true;
        if (speed < minimumSpeed || speed > maximumSpeed) {
          failures.push(
            `track ${id} constant-speed sample ${speed.toFixed(2)}px/s ` +
            `outside ${minimumSpeed}..${maximumSpeed}px/s`,
          );
          if (Math.abs(displacement) > 0.25) initialMotionStarted = true;
          // This interval is exempt only from the wall-clock discontinuity
          // check. Its CSS-clock speed must pass before any startup waiver.
          continue;
        }
        checkedVelocitySamples.push({ id, ...velocity });
        if (Math.abs(displacement) > 0.25) initialMotionStarted = true;
        continue;
      }

      if (speed >= minimumSpeed && speed <= maximumSpeed) {
        checkedVelocitySamples.push({ id, ...velocity });
        if (Math.abs(displacement) > 0.25) initialMotionStarted = true;
        continue;
      }

      const boundedOffscreenMountDelay = !initialMotionStarted && index <= MAX_OFFSCREEN_MOUNT_DELAY_INTERVALS &&
        Math.abs(displacement) <= 0.5 && windowOffscreen;
      if (boundedOffscreenMountDelay) continue;

      const expectedStart = startsById.get(id);
      const firstActualSampleMatchesStart = expectedStart && firstInterval &&
        Math.abs(firstInterval[0].left - expectedStart.left) <= START_SAMPLE_TOLERANCE_PX;
      const firstIntervalCompositor = velocity.firstWindow && firstInterval &&
        firstInterval[0].sampleIndex === 0 && firstInterval[1].sampleIndex === 1 &&
        finite(firstIntervalSpeed) && (firstIntervalSpeed < minimumSpeed || firstIntervalSpeed > maximumSpeed) &&
        Math.abs(firstInterval[1].left - firstInterval[0].left) <= START_SAMPLE_TOLERANCE_PX &&
        firstActualSampleMatchesStart && firstInterval.every(isFullyOffscreen);
      if (firstIntervalCompositor && (ignoredStartupSampleIndex === null ||
          ignoredStartupSampleIndex === firstInterval[1].sampleIndex)) {
        ignoredStartupSampleIndex = firstInterval[1].sampleIndex;
        initialMotionStarted = true;
        continue;
      }

      const initialEdgeStep = !ignoredInitialEdgeStep && index <= 4 && noEarlierMotion &&
        !initialMotionStarted && Math.abs(displacement) > 0.25 &&
        Math.abs(displacement) <= INITIAL_EDGE_STEP_TOLERANCE_PX &&
        isFullyOffscreen(previous) && isFullyOffscreen(current);
      if (initialEdgeStep) {
        ignoredInitialEdgeStep = true;
        ignoredInitialEdgeStepTracks.push(id);
        initialMotionStarted = true;
        continue;
      }

      if (reflowCorrectionAvailable || reflowClockCorrection) {
        usedFrameReflowCorrection = true;
        continue;
      }

      failures.push(
        `track ${id} constant-speed sample ${speed.toFixed(2)}px/s ` +
        `outside ${minimumSpeed}..${maximumSpeed}px/s`,
      );
      if (Math.abs(displacement) > 0.25) initialMotionStarted = true;
    }
    velocitiesByTrack.set(id, velocities);
  }

  const anchorVelocityCount = velocitiesByTrack.get(initial?.id)?.length ?? 0;
  if (anchorVelocityCount < minimumVelocitySamples) {
    failures.push(`initial track has only ${anchorVelocityCount} velocity samples`);
  }

  const visibleTrackIds = [...tracks.entries()].flatMap(([id, positions]) => (
    positions.some(overlapsFrame) ? [id] : []
  ));
  const insufficientVisibleTracks = visibleTrackIds.filter((id) => (
    (velocitiesByTrack.get(id) ?? []).filter((velocity) => (
      overlapsFrame(velocity.previous) || overlapsFrame(velocity.current)
    )).length < minimumVelocitySamples
  ));
  for (const id of insufficientVisibleTracks) {
    failures.push(`visible track ${id} has fewer than ${minimumVelocitySamples} constant-speed samples`);
  }

  const speedStable = failures.length === 0 && anchorVelocityCount >= minimumVelocitySamples &&
    insufficientVisibleTracks.length === 0;

  return {
    initialEdgeValid,
    initialSampleEdgeValid,
    movedTowardViewport,
    entryTransitionObserved,
    checkedVelocitySampleCount: checkedVelocitySamples.length,
    ignoredOffscreenFirstFrameSamples: Number(ignoredStartupSampleIndex !== null),
    ignoredMountDelayTracks,
    ignoredInitialEdgeStepTracks,
    speedStable,
    failures,
  };
}

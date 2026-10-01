/** Harness-only scheduling. performance.now stays native for cost measurement. */
export interface RenderClockEnvironment {
  Date: { now(): number };
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(id: number): void;
  setTimeout(callback: TimerHandler, delay?: number, ...args: unknown[]): number;
  clearTimeout(id?: number): void;
}

const FRAME_MS = 1000 / 60;
const EPOCH_MS = Date.UTC(2026, 0, 1);

export function installRenderClock(environment: RenderClockEnvironment) {
  const originals = {
    requestAnimationFrame: environment.requestAnimationFrame,
    cancelAnimationFrame: environment.cancelAnimationFrame,
    setTimeout: environment.setTimeout,
    clearTimeout: environment.clearTimeout,
    now: environment.Date.now,
  };
  let nowMs = 0;
  let frame = 0;
  let nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, { dueMs: number; callback(): void }>();
  environment.Date.now = () => EPOCH_MS + Math.floor(nowMs);
  environment.requestAnimationFrame = (callback) => {
    const id = ++nextId;
    frames.set(id, callback);
    return id;
  };
  environment.cancelAnimationFrame = (id) => { frames.delete(id); };
  environment.setTimeout = (callback, delay = 0, ...args) => {
    if (typeof callback !== 'function') throw new TypeError('Render clock requires a function timer.');
    const id = ++nextId;
    timers.set(id, { dueMs: nowMs + Math.max(1, delay), callback: () => callback(...args) });
    return id;
  };
  environment.clearTimeout = (id) => { if (id !== undefined) timers.delete(id); };
  return {
    get nowMs() { return nowMs; },
    stepFrame(beforeFrame: (now: number) => void = () => undefined) {
      const target = ++frame * FRAME_MS;
      // Fire timers in deadline/registration order before the next frame.
      // A callback queued by a frame belongs to the following frame batch.
      try {
        for (;;) {
          const due = [...timers.entries()]
            .filter(([, timer]) => timer.dueMs <= target)
            .sort(([a, left], [b, right]) => left.dueMs - right.dueMs || a - b)[0];
          if (!due) break;
          timers.delete(due[0]);
          nowMs = due[1].dueMs;
          due[1].callback();
        }
      } finally {
        nowMs = target;
      }
      beforeFrame(nowMs);
      for (const id of [...frames.keys()]) {
        const callback = frames.get(id);
        frames.delete(id);
        callback?.(nowMs);
      }
    },
    restore() {
      environment.requestAnimationFrame = originals.requestAnimationFrame;
      environment.cancelAnimationFrame = originals.cancelAnimationFrame;
      environment.setTimeout = originals.setTimeout;
      environment.clearTimeout = originals.clearTimeout;
      environment.Date.now = originals.now;
      frames.clear();
      timers.clear();
    },
  };
}

type SampledAnimation = Pick<Animation, 'pause' | 'currentTime'>;

/** CSS sweeps and scan-created Web Animations use the same simulated timeline. */
export function createAnimationSampler() {
  const starts = new WeakMap<SampledAnimation, number>();
  return (animations: Iterable<SampledAnimation>, nowMs: number) => {
    for (const animation of animations) {
      let start = starts.get(animation);
      if (start === undefined) {
        start = nowMs;
        starts.set(animation, start);
      }
      animation.pause();
      animation.currentTime = nowMs - start;
    }
  };
}

export async function measureRenderWork(
  update: () => void,
  settleWork: () => Promise<void>,
  realNow: () => number = () => performance.now(),
): Promise<number> {
  const started = realNow();
  update();
  await settleWork();
  return realNow() - started;
}

/** Keep native frame/paint waits in the original budgeted metric. */
export async function measureRenderUpdate(
  update: () => void,
  settleWork: () => Promise<void>,
  settlePaint: () => Promise<void>,
  realNow: () => number = () => performance.now(),
): Promise<{ totalMs: number; workMs: number }> {
  const started = realNow();
  const workMs = await measureRenderWork(update, settleWork, realNow);
  await settlePaint();
  return { totalMs: realNow() - started, workMs };
}

/** Frame durations use native timestamps, regardless of simulated sweep time. */
export async function measureRenderFrames(
  iterations: number,
  update: (index: number) => void,
  nextNativeFrame: () => Promise<number>,
  realNow: () => number = () => performance.now(),
): Promise<number[]> {
  const samples: number[] = [];
  let previous = realNow();
  for (let index = 0; index < iterations; index += 1) {
    update(index);
    const now = await nextNativeFrame();
    samples.push(now - previous);
    previous = now;
  }
  return samples;
}

import { describe, expect, it } from 'vitest';
import { createAnimationSampler, installRenderClock, measureRenderFrames, measureRenderUpdate, measureRenderWork } from '../../scripts/render-performance-clock';
import type { RenderClockEnvironment } from '../../scripts/render-performance-clock';

function environment() {
  let wallTime = 90_000;
  const realFrame = () => { throw new Error('Unexpected native frame scheduling'); };
  const realTimer = () => { throw new Error('Unexpected native timer scheduling'); };
  const target: RenderClockEnvironment = {
    Date: { now: () => wallTime },
    requestAnimationFrame: realFrame,
    cancelAnimationFrame: () => undefined,
    setTimeout: realTimer,
    clearTimeout: () => undefined,
  };
  return { target, stall: (ms: number) => { wallTime += ms; } };
}

describe('render benchmark clock', () => {
  it('runs the same frames and timers despite different waits on the host', () => {
    const run = (stallMs: number) => {
      const { target, stall } = environment();
      const clock = installRenderClock(target);
      const events: string[] = [];
      const frame = (now: number) => {
        events.push(`frame:${now}`);
        target.requestAnimationFrame(frame);
      };
      target.requestAnimationFrame(frame);
      target.setTimeout(() => events.push(`timer:${target.Date.now()}`), 25);
      for (let index = 0; index < 4; index += 1) {
        stall(stallMs);
        clock.stepFrame();
      }
      clock.restore();
      return events;
    };
    expect(run(0)).toEqual(run(10_000));
    expect(run(0).filter((event) => event.startsWith('timer:'))).toHaveLength(1);
    expect(run(0).filter((event) => event.startsWith('frame:'))).toHaveLength(4);
  });

  it('defers nested frames and honors cancellation, including within a frame batch', () => {
    const { target } = environment();
    const clock = installRenderClock(target);
    const events: string[] = [];
    let cancelledFrame = 0;
    target.requestAnimationFrame(() => {
      events.push('first');
      target.cancelAnimationFrame(cancelledFrame);
      target.requestAnimationFrame(() => events.push('next'));
    });
    cancelledFrame = target.requestAnimationFrame(() => events.push('cancelled'));
    const timer = target.setTimeout(() => events.push('cancelled timer'), 1);
    target.clearTimeout(timer);
    clock.stepFrame();
    expect(events).toEqual(['first']);
    clock.stepFrame();
    expect(events).toEqual(['first', 'next']);
    clock.restore();
  });

  it('restores native APIs and discards queued callbacks after a failed sample', () => {
    const { target } = environment();
    const originals = { ...target, now: target.Date.now };
    const clock = installRenderClock(target);
    target.requestAnimationFrame(() => { throw new Error('broken render'); });
    expect(() => clock.stepFrame()).toThrow('broken render');
    clock.restore();
    expect(target.requestAnimationFrame).toBe(originals.requestAnimationFrame);
    expect(target.cancelAnimationFrame).toBe(originals.cancelAnimationFrame);
    expect(target.setTimeout).toBe(originals.setTimeout);
    expect(target.clearTimeout).toBe(originals.clearTimeout);
    expect(target.Date.now).toBe(originals.now);
  });

  it('pins CSS and newly created scan animations to their own fixed start times', () => {
    const sample = createAnimationSampler();
    const animation = () => ({
      currentTime: 9_999 as number | null,
      pause() { this.currentTime = 8_888; },
    });
    const sweep = animation();
    const flare = animation();
    sample([sweep], 0);
    expect(sweep.currentTime).toBe(0);
    sample([sweep, flare], 100);
    expect(sweep.currentTime).toBe(100);
    expect(flare.currentTime).toBe(0);
    sample([sweep, flare], 125);
    expect(sweep.currentTime).toBe(125);
    expect(flare.currentTime).toBe(25);
  });

  it('measures real render and layout cost, so a fixed clock cannot hide a slow update', async () => {
    const { target } = environment();
    const clock = installRenderClock(target);
    let realElapsed = 0;
    const sample = await measureRenderWork(
      () => { realElapsed += 120; },
      async () => {
        clock.stepFrame(() => { realElapsed += 20; });
        await Promise.resolve();
        clock.stepFrame(() => { realElapsed += 20; });
      },
      () => realElapsed,
    );
    expect(sample).toBe(160);
    expect(sample).toBeGreaterThan(150);
    expect(clock.nowMs).toBeCloseTo(1000 / 30);
    clock.restore();
  });

  it('retains native frame waits in the budgeted update duration, with work cost reported separately', async () => {
    let realElapsed = 0;
    const sample = await measureRenderUpdate(
      () => { realElapsed += 80; },
      async () => { realElapsed += 20; },
      async () => { realElapsed += 51; },
      () => realElapsed,
    );
    expect(sample).toEqual({ totalMs: 151, workMs: 100 });
    expect(sample.totalMs).toBeGreaterThan(150);
  });

  it('keeps mobile sweep work fixed while retaining genuine long native frames', async () => {
    const { target } = environment();
    const clock = installRenderClock(target);
    const phases: number[] = [];
    const sweep = (now: number) => {
      phases.push(now);
      target.requestAnimationFrame(sweep);
    };
    target.requestAnimationFrame(sweep);
    let nativeNow = 0;
    const waits = [17, 50, 133];
    let next = 0;
    const samples = await measureRenderFrames(
      3,
      () => clock.stepFrame(),
      async () => { nativeNow += waits[next++]!; return nativeNow; },
      () => nativeNow,
    );
    expect(samples).toEqual(waits);
    expect(samples[2]).toBeGreaterThan(120);
    expect(phases).toEqual([1000 / 60, 2000 / 60, 3000 / 60]);
    clock.restore();
  });
});

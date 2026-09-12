import { describe, expect, it } from 'vitest';
import { fleetTickerState } from './fleetTickerState';

const message = (overrides: Record<string, unknown> = {}) => ({
  id: 's1:fleet-ticker:1',
  sequence: 1,
  source: 'automatic',
  priority: 40,
  text: 'AIRSPACE CLOSED',
  tone: 'normal',
  gap: 'long',
  createdAt: '2026-09-12T13:00:00.000Z',
  ...overrides,
});

describe('fleetTickerState', () => {
  it('promotes a queued message after a server deadline without writing progress', () => {
    const state = fleetTickerState({
      revision: 4,
      nextSequence: 2,
      replayCursor: 2,
      current: message({ expiresAt: '2026-09-12T13:00:00.000Z' }),
      queued: [message({
        id: 's1:fleet-ticker:2', sequence: 2, priority: 20, text: 'SNN // REPORT',
      })],
      draining: [],
      dismissed: [],
    }, new Date('2026-09-12T13:01:00.000Z'));

    expect(state.current?.id).toBe('s1:fleet-ticker:2');
    expect(state.queued).toHaveLength(0);
    expect(state.revision).toBe(4);
  });

  it('preserves authoritative drain order while applying priority to queued copy', () => {
    const state = fleetTickerState({
      revision: 3,
      nextSequence: 3,
      replayCursor: 3,
      current: message({ id: 's1:fleet-ticker:3', sequence: 3, priority: 80, text: 'RED ALERT' }),
      queued: [
        message({ id: 's1:fleet-ticker:1', sequence: 1, priority: 20, text: 'PRESS' }),
        message({ id: 's1:fleet-ticker:2', sequence: 2, priority: 60, text: 'EMERGENCY' }),
      ],
      draining: [
        message({ id: 's1:fleet-ticker:1', sequence: 1, priority: 20, text: 'PRESS' }),
        message({ id: 's1:fleet-ticker:2', sequence: 2, priority: 60, text: 'EMERGENCY' }),
      ],
      dismissed: [],
    });

    expect(state.queued.map(({ id }) => id)).toEqual([
      's1:fleet-ticker:2', 's1:fleet-ticker:1',
    ]);
    expect(state.draining.map(({ id }) => id)).toEqual([
      's1:fleet-ticker:1', 's1:fleet-ticker:2',
    ]);
  });

  it('fails closed for malformed or untrusted current copy', () => {
    expect(fleetTickerState({
      revision: 2,
      nextSequence: 2,
      replayCursor: 2,
      current: { text: 'forged' },
      queued: [message({ id: 's1:fleet-ticker:2', sequence: 2 })],
    }).current?.id).toBe('s1:fleet-ticker:2');
  });
});

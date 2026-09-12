import { describe, expect, it } from 'vitest';
import {
  dismissFleetTicker,
  dismissFleetTickerSource,
  emptyFleetTickerState,
  fleetTickerState,
  publishFleetTicker,
  reconcileFleetTicker,
  standDownExpiry,
} from './fleetTickerState';

const now = '2026-09-12T13:00:00.000Z';
const alert = {
  source: 'admiral' as const, priority: 80, text: 'RED ALERT', tone: 'danger' as const,
  sourceId: 'red-alert:1',
};
const airspace = { source: 'automatic' as const, priority: 40, text: 'AIRSPACE CLOSED', tone: 'normal' as const, gap: 'long' as const };

describe('fleet ticker state', () => {
  it('assigns deterministic session scoped sequence identities and revisions', () => {
    const first = publishFleetTicker('s1', emptyFleetTickerState(), airspace, now);
    const second = publishFleetTicker('s1', first, alert, now);

    expect(first).toMatchObject({ revision: 1, nextSequence: 1, replayCursor: 1 });
    expect(first.current?.id).toBe('s1:fleet-ticker:1');
    expect(second).toMatchObject({ revision: 2, nextSequence: 2, replayCursor: 2 });
    expect(second.current?.id).toBe('s1:fleet-ticker:2');
    expect(second.draining.map(({ id }) => id)).toEqual(['s1:fleet-ticker:1']);
  });

  it('queues lower priority copy behind the current urgent message', () => {
    const current = publishFleetTicker('s1', emptyFleetTickerState(), alert, now);
    const next = publishFleetTicker('s1', current, airspace, now);

    expect(next.current?.text).toBe('RED ALERT');
    expect(next.queued.map(({ text }) => text)).toEqual(['AIRSPACE CLOSED']);
    expect(next.draining).toHaveLength(0);
  });

  it('dismisses current copy into the drain and promotes the queued message once', () => {
    const current = publishFleetTicker('s1', emptyFleetTickerState(), alert, now);
    const queued = publishFleetTicker('s1', current, airspace, now);
    const dismissed = dismissFleetTicker('s1', queued, current.current!.id, now);

    expect(dismissed.current?.text).toBe('AIRSPACE CLOSED');
    expect(dismissed.queued).toHaveLength(0);
    expect(dismissed.draining.map(({ text }) => text)).toEqual(['RED ALERT']);
    expect(dismissed.dismissed).toMatchObject([{ id: current.current!.id, revision: 3 }]);
  });

  it('records a source dismissal while retaining an already-draining visual tail', () => {
    const current = publishFleetTicker('s1', emptyFleetTickerState(), alert, now);
    const replaced = publishFleetTicker('s1', current, {
      source: 'automatic', priority: 100, text: 'FINALE', tone: 'normal',
      sourceId: 'debrief:1',
    }, now);
    const dismissed = dismissFleetTickerSource(
      's1', replaced, current.current!.sourceId!, now,
    );

    expect(dismissed.revision).toBe(3);
    expect(dismissed.current?.id).toBe('s1:fleet-ticker:2');
    expect(dismissed.draining.map(({ id }) => id)).toEqual(['s1:fleet-ticker:1']);
    expect(dismissed.dismissed).toMatchObject([{
      id: current.current!.id,
      sequence: current.current!.sequence,
      revision: 3,
    }]);
  });

  it('uses a server deadline for stand-down rather than visual completion', () => {
    expect(standDownExpiry(now)).toBe('2026-09-12T13:01:00.000Z');
    const state = publishFleetTicker('s1', emptyFleetTickerState(), {
      ...alert,
      text: 'RED ALERT CANCELLED',
      tone: 'normal',
      passCount: 2,
      expiresAt: standDownExpiry(now),
    }, now);

    expect(state.current).toMatchObject({ passCount: 2, expiresAt: '2026-09-12T13:01:00.000Z' });
    expect(fleetTickerState(state).current?.id).toBe(state.current?.id);
    expect(reconcileFleetTicker({ ...state, current: { ...state.current!, expiresAt: now } }, standDownExpiry(now)).current).toBeNull();
  });

  it('fails closed on malformed stream data', () => {
    expect(fleetTickerState({ revision: 'one', current: { text: 'secret' } })).toEqual(emptyFleetTickerState());
  });

  it('projects only the public stream fields from stored data', () => {
    const projected = fleetTickerState({
      revision: 1,
      nextSequence: 1,
      replayCursor: 1,
      internal: 'secret',
      current: {
        id: 's1:fleet-ticker:1', sequence: 1, source: 'automatic', priority: 40,
        text: 'AIRSPACE OPEN', tone: 'normal', gap: 'long', createdAt: now,
        internal: 'secret',
      },
      queued: [], draining: [], dismissed: [],
    });

    expect(projected).not.toHaveProperty('internal');
    expect(projected.current).not.toHaveProperty('internal');
    expect(projected.current).toMatchObject({ id: 's1:fleet-ticker:1', text: 'AIRSPACE OPEN' });
  });
});

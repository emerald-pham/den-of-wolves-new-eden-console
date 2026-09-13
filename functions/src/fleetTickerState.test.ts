import { describe, expect, it } from 'vitest';
import {
  dismissFleetTicker,
  dismissFleetTickerSource,
  emptyFleetTickerState,
  fleetTickerState,
  publishFleetTicker,
  recoverActivePressMessages,
  reconcileFleetTicker,
  retireAirspaceFleetTicker,
  standDownExpiry,
} from './fleetTickerState';

const now = '2026-09-12T13:00:00.000Z';
const alert = {
  source: 'admiral' as const, priority: 80, text: 'RED ALERT', tone: 'danger' as const,
  sourceId: 'red-alert:1',
};
const airspace = { source: 'automatic' as const, priority: 40, text: 'AIRSPACE CLOSED', tone: 'normal' as const, gap: 'long' as const };
const pressOne = {
  source: 'press' as const, priority: 20, text: 'SNN // FIRST REPORT', tone: 'normal' as const,
  gap: 'long' as const, sourceId: 'press-1',
};
const pressTwo = { ...pressOne, text: 'SNN // SECOND REPORT', sourceId: 'press-2' };

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

  it('retires current and queued airspace notices before Press takes over', () => {
    const current = publishFleetTicker('s1', emptyFleetTickerState(), {
      ...airspace, sourceId: 'airspace:1:lifted',
    }, now);
    const queued = {
      ...current,
      revision: 2,
      nextSequence: 2,
      replayCursor: 2,
      queued: [{
        ...airspace, sourceId: 'airspace:2:restricted', text: 'AIRSPACE CLOSED AGAIN',
        id: 's1:fleet-ticker:2', sequence: 2, createdAt: now,
      }],
    };

    const retired = retireAirspaceFleetTicker(queued, now);
    expect(retired.current).toBeNull();
    expect(retired.queued).toHaveLength(0);
    expect(retired.draining.map(({ sourceId }) => sourceId)).toEqual(['airspace:1:lifted']);
    expect(retired.dismissed.map(({ id }) => id)).toEqual([
      current.current!.id, queued.queued[0]!.id,
    ]);

    const press = publishFleetTicker('s1', retired, pressOne, now);
    expect(press.current?.sourceId).toBe('press-1');
    expect([
      press.current?.sourceId,
      ...press.queued.map(({ sourceId }) => sourceId),
      ...press.draining.map(({ sourceId }) => sourceId),
    ]).not.toContain('airspace:2:restricted');
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

  it('keeps an active press dispatch queued through alert and expiring stand-down copy', () => {
    const press = publishFleetTicker('s1', emptyFleetTickerState(), pressOne, now);
    const alertState = publishFleetTicker('s1', press, alert, now);
    const standDown = publishFleetTicker('s1', alertState, {
      source: 'automatic', priority: 80, text: 'RED ALERT CANCELLED', tone: 'normal',
      passCount: 2, sourceId: 'red-alert:1', expiresAt: standDownExpiry(now),
    }, now);

    expect(alertState.queued.map(({ sourceId }) => sourceId)).toEqual(['press-1']);
    expect(standDown.queued.map(({ sourceId }) => sourceId)).toEqual(['press-1']);
    const afterExpiry = reconcileFleetTicker(standDown, standDownExpiry(now));
    expect(afterExpiry.current?.sourceId).toBe('press-1');
    expect(afterExpiry.queued).toHaveLength(0);
  });

  it('promotes the older active press when the latest same-priority press is dismissed', () => {
    const first = publishFleetTicker('s1', emptyFleetTickerState(), pressOne, now);
    const second = publishFleetTicker('s1', first, pressTwo, now);
    expect(second.current?.sourceId).toBe('press-2');
    expect(second.queued.map(({ sourceId }) => sourceId)).toEqual(['press-1']);

    const dismissed = dismissFleetTickerSource('s1', second, 'press-2', now);
    expect(dismissed.current?.sourceId).toBe('press-1');
    expect(dismissed.queued).toHaveLength(0);
  });

  it('removes a queued press without resurrecting it after dismissal', () => {
    const current = publishFleetTicker('s1', emptyFleetTickerState(), alert, now);
    const queued = publishFleetTicker('s1', current, pressOne, now);
    const dismissed = dismissFleetTickerSource('s1', queued, 'press-1', now);

    expect(dismissed.current?.sourceId).toBe('red-alert:1');
    expect(dismissed.queued).toHaveLength(0);
    expect(dismissed.draining).toHaveLength(0);
  });

  it('recovers an active press from an old drain but not a dismissed source', () => {
    const stored = {
      ...emptyFleetTickerState(),
      revision: 2,
      nextSequence: 2,
      replayCursor: 2,
      draining: [{ ...pressOne, id: 's1:fleet-ticker:1', sequence: 1, createdAt: now }],
    };

    const recovered = recoverActivePressMessages(stored, ['press-1'], now);
    expect(recovered.current?.sourceId).toBe('press-1');
    expect(recoverActivePressMessages(stored, [], now).current).toBeNull();
    const dismissed = {
      ...stored,
      dismissed: [{ id: 's1:fleet-ticker:1', sequence: 1, revision: 3, dismissedAt: now }],
    };
    expect(recoverActivePressMessages(dismissed, ['press-1'], now).current).toBeNull();
  });

  it('deduplicates a press already queued and draining while retaining the queue cap', () => {
    const queued = Array.from({ length: 12 }, (_, index) => ({
      source: 'automatic' as const, priority: 40, text: `AIRSPACE ${index}`,
      tone: 'normal' as const, gap: 'standard' as const, sourceId: `airspace:${index}`,
      id: `s1:fleet-ticker:${index + 1}`, sequence: index + 1, createdAt: now,
    }));
    const stored = {
      ...emptyFleetTickerState(), revision: 12, nextSequence: 12, replayCursor: 12,
      current: { ...pressOne, id: 's1:fleet-ticker:13', sequence: 13, createdAt: now },
      queued: [{ ...pressOne, id: 's1:fleet-ticker:14', sequence: 14, createdAt: now }, ...queued],
      draining: [{ ...pressOne, id: 's1:fleet-ticker:13', sequence: 13, createdAt: now }],
    };
    const replaced = publishFleetTicker('s1', stored, alert, now);
    expect(replaced.queued).toHaveLength(12);
    expect(replaced.queued.filter(({ sourceId }) => sourceId === 'press-1')).toHaveLength(1);
    expect(replaced.draining.filter(({ sourceId }) => sourceId === 'press-1')).toHaveLength(1);
    const dismissed = dismissFleetTickerSource('s1', replaced, 'press-1', now);
    expect(dismissed.queued.filter(({ sourceId }) => sourceId === 'press-1')).toHaveLength(0);
    expect(dismissed.draining.filter(({ sourceId }) => sourceId === 'press-1')).toHaveLength(0);
  });

  it('retains a newly published press when the lower-priority queue is full', () => {
    const queued = Array.from({ length: 12 }, (_, index) => ({
      source: 'automatic' as const, priority: 40, text: `AIRSPACE ${index}`,
      tone: 'normal' as const, gap: 'standard' as const, sourceId: `airspace:${index}`,
      id: `s1:fleet-ticker:${index + 1}`, sequence: index + 1, createdAt: now,
    }));
    const stored = {
      ...emptyFleetTickerState(), revision: 13, nextSequence: 13, replayCursor: 13,
      current: { ...alert, gap: 'standard' as const, id: 's1:fleet-ticker:13', sequence: 13, createdAt: now },
      queued,
    };

    const published = publishFleetTicker('s1', stored, pressOne, now);

    expect(published.current?.sourceId).toBe('red-alert:1');
    expect(published.queued).toHaveLength(12);
    expect(published.queued.filter(({ sourceId }) => sourceId === 'press-1')).toHaveLength(1);
    expect(published.queued.filter(({ source }) => source !== 'press')).toHaveLength(11);
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

it('retires obsolete Iris notices from stored and replayed queues without suppressing current airspace', () => {
  const old = { ...airspace, id: 'old-iris', sequence: 1, sourceId: 'turn-zero', createdAt: now };
  const stored = { ...emptyFleetTickerState(), revision: 2, nextSequence: 2, current: old,
    queued: [old], draining: [old] };
  expect(fleetTickerState(stored)).toMatchObject({ current: null, queued: [], draining: [] });
  const next = publishFleetTicker('s1', stored, { ...airspace, sourceId: 'airspace:1:restricted' }, now);
  expect(next.current?.sourceId).toBe('airspace:1:restricted');
  expect(next.queued).toEqual([]);
  expect(next.draining).toEqual([]);
});

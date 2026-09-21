import { describe, expect, it } from 'vitest';
import {
  acceptQuarantineDocking, parseQuarantineDockingState, setQuarantineDockingPolicy,
} from './quarantineDocking';

const active = setQuarantineDockingPolicy({
  existing: null, action: 'activate', crisisId: 'outbreak-1', crisisRevision: 3,
  affectedShipIds: ['aegis'],
});

describe('quarantine docking', () => {
  it('accepts one inbound shuttle per affected ship and cycle while preserving communications', () => {
    const first = acceptQuarantineDocking({
      state: active, previousHostShipId: 'dione', hostShipId: 'aegis', shuttleId: 'philia',
      cycle: 2, requestId: 'dock-1', acceptedAt: '2026-09-21T12:00:00.000Z',
    })!;
    expect(first).toMatchObject({ communications: 'allowed', acceptedByShip: {
      aegis: { shuttleId: 'philia', cycle: 2 },
    } });
    expect(() => acceptQuarantineDocking({
      state: first, previousHostShipId: 'icebreaker', hostShipId: 'aegis', shuttleId: 'highwall',
      cycle: 2, requestId: 'dock-2', acceptedAt: '2026-09-21T12:01:00.000Z',
    })).toThrow(/already accepted one shuttle this cycle/i);
  });

  it('allows the next cycle and ignores same-host or unaffected docking', () => {
    const first = acceptQuarantineDocking({
      state: active, previousHostShipId: 'dione', hostShipId: 'aegis', shuttleId: 'philia',
      cycle: 2, requestId: 'dock-1', acceptedAt: '2026-09-21T12:00:00.000Z',
    })!;
    expect(acceptQuarantineDocking({
      state: first, previousHostShipId: 'dione', hostShipId: 'aegis', shuttleId: 'starlight',
      cycle: 3, requestId: 'dock-3', acceptedAt: '2026-09-21T12:02:00.000Z',
    })?.acceptedByShip.aegis).toMatchObject({ shuttleId: 'starlight', cycle: 3 });
    expect(acceptQuarantineDocking({
      state: first, previousHostShipId: 'aegis', hostShipId: 'aegis', shuttleId: 'starlight',
      cycle: 2, requestId: 'same', acceptedAt: '2026-09-21T12:02:00.000Z',
    })).toBe(first);
    expect(acceptQuarantineDocking({
      state: first, previousHostShipId: 'aegis', hostShipId: 'dione', shuttleId: 'starlight',
      cycle: 2, requestId: 'open', acceptedAt: '2026-09-21T12:02:00.000Z',
    })).toBe(first);
  });

  it('preserves the ledger across release and same-crisis reactivation', () => {
    const first = acceptQuarantineDocking({
      state: active, previousHostShipId: 'dione', hostShipId: 'aegis', shuttleId: 'philia',
      cycle: 2, requestId: 'dock-1', acceptedAt: '2026-09-21T12:00:00.000Z',
    })!;
    const released = setQuarantineDockingPolicy({
      existing: first, action: 'release', crisisId: 'outbreak-1', crisisRevision: 4,
      affectedShipIds: ['aegis'],
    });
    const restored = setQuarantineDockingPolicy({
      existing: released, action: 'activate', crisisId: 'outbreak-1', crisisRevision: 5,
      affectedShipIds: ['aegis'],
    });
    expect(restored.acceptedByShip).toEqual(first.acceptedByShip);
    expect(parseQuarantineDockingState(restored)).toEqual(restored);
  });

  it('does not let a depart-return loop reset the destination slot', () => {
    const first = acceptQuarantineDocking({
      state: active, previousHostShipId: 'dione', hostShipId: 'aegis', shuttleId: 'philia',
      cycle: 2, requestId: 'dock-1', acceptedAt: '2026-09-21T12:00:00.000Z',
    })!;
    const departed = acceptQuarantineDocking({
      state: first, previousHostShipId: 'aegis', hostShipId: 'dione', shuttleId: 'philia',
      cycle: 2, requestId: 'depart-1', acceptedAt: '2026-09-21T12:01:00.000Z',
    });
    expect(departed).toBe(first);
    expect(() => acceptQuarantineDocking({
      state: departed, previousHostShipId: 'dione', hostShipId: 'aegis', shuttleId: 'philia',
      cycle: 2, requestId: 'return-1', acceptedAt: '2026-09-21T12:02:00.000Z',
    })).toThrow(/already accepted one shuttle this cycle/i);
  });

  it('rejects malformed persisted state', () => {
    expect(parseQuarantineDockingState({ ...active, communications: 'blocked' })).toBeNull();
    expect(parseQuarantineDockingState({ ...active, affectedShipIds: ['aegis', 'aegis'] })).toBeNull();
    expect(parseQuarantineDockingState({ ...active, affectedShipIds: ['prototype-ship'] })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  parseWolfArrivalPressure,
  parseWolfArrivalPressureState,
  wolfArrivalPressureBlocksMissions,
  wolfArrivalPressureForMovement,
} from './arrivalPressure';

const group = { id: 'fleet-1', vesselIds: ['aegis', 'dione'], memberUids: ['u1'] } as const;

describe('Wolf base arrival pressure', () => {
  it.each([
    ['A', '5143', 'L', 1, 20],
    ['A', '4454', 'M', 2, 25],
    ['B', '1413', 'L', 1, 20],
    ['C', '1096', 'M', 2, 25],
  ] as const)('schedules exact chart %s pressure at %s', (chart, coordinate, code, stations, damage) => {
    const transition = wolfArrivalPressureForMovement({
      chart, group, coordinates: { aegis: coordinate, dione: '0000' },
      movedShipId: 'aegis', destination: coordinate, sourceTransitionId: 'jump-1', cycle: 3,
    });
    expect(transition).toEqual({
      scheduled: expect.objectContaining({
        type: 'wolf-base-arrival-pressure', status: 'operational', groupId: 'fleet-1', chart,
        coordinate, siteCode: code, minimumBattleStations: stations,
        minimumOtherShipDamage: damage, attackStatus: 'scheduled', arrivalTiming: 'immediate',
        missionAccess: 'blockedWhileWolfBaseOperational',
        recurringUntil: ['baseDestroyed', 'jumpAway'], revision: 1,
      }),
      state: expect.objectContaining({
        type: 'wolf-base-arrival-pressure-state', groupId: 'fleet-1', chart, revision: 1,
        entries: [expect.objectContaining({ coordinate, siteCode: code })],
      }),
    });
    expect(wolfArrivalPressureBlocksMissions(transition.state, 'fleet-1')).toBe(true);
    expect(wolfArrivalPressureBlocksMissions(transition.state, 'fleet-2')).toBe(false);
  });

  it('does not schedule ordinary systems or duplicate an operational group arrival', () => {
    const first = wolfArrivalPressureForMovement({
      chart: 'A', group, coordinates: { aegis: '5143', dione: '0000' },
      movedShipId: 'aegis', destination: '5143', sourceTransitionId: 'jump-1', cycle: 2,
    });
    expect(wolfArrivalPressureForMovement({
      chart: 'A', group, coordinates: { aegis: '5143', dione: '5143' },
      movedShipId: 'dione', destination: '5143', sourceTransitionId: 'jump-2', cycle: 2,
      current: first.state,
    })).toEqual({ state: first.state, scheduled: undefined });
    expect(wolfArrivalPressureForMovement({
      chart: 'A', group, coordinates: { aegis: '1413', dione: '0000' },
      movedShipId: 'aegis', destination: '1413', sourceTransitionId: 'jump-3', cycle: 2,
    })).toEqual({ state: undefined, scheduled: undefined });
  });

  it('tracks simultaneous occupied bases and releases each lock only when its site is empty', () => {
    const first = wolfArrivalPressureForMovement({
      chart: 'A', group, coordinates: { aegis: '5143', dione: '0000' },
      movedShipId: 'aegis', destination: '5143', sourceTransitionId: 'jump-1', cycle: 2,
    }).state!;
    const second = wolfArrivalPressureForMovement({
      chart: 'A', group, coordinates: { aegis: '5143', dione: '4454' },
      movedShipId: 'dione', destination: '4454', sourceTransitionId: 'jump-2', cycle: 2, current: first,
    });
    expect(second.scheduled).toMatchObject({ siteCode: 'M', revision: 2 });
    expect(second.state?.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ coordinate: '5143', status: 'operational' }),
      expect.objectContaining({ coordinate: '4454', status: 'operational' }),
    ]));
    const partialDeparture = wolfArrivalPressureForMovement({
      chart: 'A', group, coordinates: { aegis: '1413', dione: '4454' },
      movedShipId: 'aegis', destination: '1413', sourceTransitionId: 'jump-3', cycle: 2,
      current: second.state,
    });
    expect(partialDeparture.state?.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ coordinate: '5143', status: 'departed', endedBy: 'jumpAway' }),
      expect.objectContaining({ coordinate: '4454', status: 'operational' }),
    ]));
    expect(wolfArrivalPressureBlocksMissions(partialDeparture.state, 'fleet-1')).toBe(true);
  });

  it('fails closed when stored pressure changes printed requirements or lifecycle shape', () => {
    const validState = wolfArrivalPressureForMovement({
      chart: 'A', group, coordinates: { aegis: '5143', dione: '0000' },
      movedShipId: 'aegis', destination: '5143', sourceTransitionId: 'jump-1', cycle: 2,
    }).state!;
    const valid = validState.entries[0]!;
    expect(parseWolfArrivalPressure(valid)).toEqual(valid);
    expect(parseWolfArrivalPressureState(validState)).toEqual(validState);
    expect(parseWolfArrivalPressure({ ...valid, minimumOtherShipDamage: 25 })).toBeUndefined();
    expect(parseWolfArrivalPressure({ ...valid, coordinate: '9997' })).toBeUndefined();
    expect(parseWolfArrivalPressure({ ...valid, endedBy: 'jumpAway' })).toBeUndefined();
    expect(parseWolfArrivalPressureState(validState, 'B')).toBeUndefined();
    expect(parseWolfArrivalPressureState({
      ...validState, entries: [valid, { ...valid, sourceTransitionId: 'duplicate' }],
    })).toBeUndefined();
    expect(() => wolfArrivalPressureForMovement({
      chart: 'A', group, coordinates: { aegis: '5143' }, movedShipId: 'shepherd',
      destination: '5143', sourceTransitionId: 'jump-2', cycle: 2,
    })).toThrow(/no authority/i);
  });
});

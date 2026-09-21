import { describe, expect, it } from 'vitest';
import {
  HOMING_BEACON_ARRIVAL_TIMING,
  HOMING_BEACON_SUSPICION_INCREMENT,
  resolveWolfHomingBeaconTarget,
} from './wolfHomingBeacon';

const group = {
  id: 'fleet-1',
  vesselIds: ['aegis', 'dione'],
  memberUids: ['wolf-1', 'crew-1'],
} as const;

describe('Wolf homing beacon target', () => {
  it('schedules the canonical shared system for the next cycle after cycle start', () => {
    expect(resolveWolfHomingBeaconTarget({
      actorUid: 'wolf-1', actorGroupId: 'fleet-1', group,
      activeVesselIds: ['aegis', 'dione'],
      navigation: { shipGalacticCoordinates: { aegis: '5143', dione: '5143' } },
      sourceCycle: 4,
    })).toEqual({
      groupId: 'fleet-1', coordinate: '5143', sourceCycle: 4, dueCycle: 5,
      arrivalTiming: HOMING_BEACON_ARRIVAL_TIMING,
    });
    expect(HOMING_BEACON_SUSPICION_INCREMENT).toBe(5);
  });

  it.each([
    ['foreign member', { actorUid: 'outsider' }],
    ['mismatched group', { actorGroupId: 'fleet-2' }],
    ['inactive vessel', { activeVesselIds: ['aegis'] }],
    ['missing navigation', { navigation: {} }],
    ['invalid coordinate', { navigation: { shipGalacticCoordinates: { aegis: 'BAD', dione: '5143' } } }],
    ['split coordinates', { navigation: { shipGalacticCoordinates: { aegis: '5143', dione: '0000' } } }],
    ['overflowing cycle', { sourceCycle: Number.MAX_SAFE_INTEGER }],
  ])('rejects %s authority', (_label, override) => {
    expect(() => resolveWolfHomingBeaconTarget({
      actorUid: 'wolf-1', actorGroupId: 'fleet-1', group,
      activeVesselIds: ['aegis', 'dione'],
      navigation: { shipGalacticCoordinates: { aegis: '5143', dione: '5143' } },
      sourceCycle: 4,
      ...override,
    })).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import type { FleetGroupRecord } from './fleetGroups';
import {
  firstArrivalMissionOpportunity,
  missionOpportunityDocumentPath,
  parseStoredMissionOpportunity,
} from './missionEligibility';
import type { SystemHistory } from './systemHistory';

const group: FleetGroupRecord = {
  id: 'fleet-1',
  vesselIds: ['aegis', 'dione'],
  memberUids: ['alice', 'bob'],
};

const base = {
  chart: 'A' as const,
  group,
  coordinates: { aegis: '0000', dione: '0000' },
  systemHistory: undefined,
  movedShipId: 'aegis',
  destination: '1413',
  sourceTransitionId: 'navigation-arrival-1',
  cycle: 2,
};

describe('group first-arrival mission eligibility', () => {
  it('creates one chart-bound opportunity for a newly reached printed mission system', () => {
    const opportunity = firstArrivalMissionOpportunity(base);

    expect(opportunity).toEqual({
      type: 'mission-opportunity',
      status: 'available',
      id: 'arrival-fleet-1-A-1413',
      groupId: 'fleet-1',
      chart: 'A',
      coordinate: '1413',
      siteCode: 'A',
      sourceShipId: 'aegis',
      sourceTransitionId: 'navigation-arrival-1',
      sourceCycle: 2,
    });
    expect(missionOpportunityDocumentPath('s1', opportunity!.id))
      .toBe('sessions/s1/missionOpportunities/arrival-fleet-1-A-1413');
  });

  it('does not create another opportunity after any vessel in the group reached that system', () => {
    const systemHistory: SystemHistory = {
      dione: {
        '1413': {
          coordinate: '1413',
          discovery: { id: 'navigation-prior-0', occurredAt: '2026-09-22T00:00:00.000Z' },
          attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
        },
      },
    };

    expect(firstArrivalMissionOpportunity({ ...base, systemHistory })).toBeUndefined();
    expect(firstArrivalMissionOpportunity({
      ...base,
      movedShipId: 'dione',
      coordinates: { aegis: '1413', dione: '0000' },
    })).toBeUndefined();
  });

  it('keeps first arrival group-local when another fleet has visited the same system', () => {
    const systemHistory: SystemHistory = {
      aegis: {
        '1413': {
          coordinate: '1413',
          discovery: { id: 'navigation-other-0', occurredAt: '2026-09-22T00:00:00.000Z' },
          attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
        },
      },
    };
    const splitGroup: FleetGroupRecord = {
      id: 'fleet-2', vesselIds: ['quellon'], memberUids: ['quinn'],
    };

    expect(firstArrivalMissionOpportunity({
      ...base,
      group: splitGroup,
      movedShipId: 'quellon',
      coordinates: { aegis: '1413', quellon: '0000' },
      systemHistory,
    })).toMatchObject({ id: 'arrival-fleet-2-A-1413', groupId: 'fleet-2', siteCode: 'A' });
  });

  it('uses the locked chart and excludes the origin and New Eden candidates', () => {
    expect(firstArrivalMissionOpportunity({ ...base, chart: 'B' }))
      .toMatchObject({ chart: 'B', siteCode: 'L' });
    expect(firstArrivalMissionOpportunity({ ...base, destination: '0000' })).toBeUndefined();
    expect(firstArrivalMissionOpportunity({ ...base, destination: '6798' })).toBeUndefined();
  });

  it('rejects malformed group and movement authority', () => {
    expect(() => firstArrivalMissionOpportunity({
      ...base,
      group: { ...group, id: 'fleet' },
    })).toThrow(/group/i);
    expect(() => firstArrivalMissionOpportunity({ ...base, movedShipId: 'quellon' }))
      .toThrow(/moving ship/i);
    expect(() => firstArrivalMissionOpportunity({ ...base, cycle: -1 })).toThrow(/cycle/i);
  });

  it('accepts only a stored opportunity bound to the computed arrival identity', () => {
    const opportunity = firstArrivalMissionOpportunity(base)!;
    const stored = { ...opportunity, sessionId: 's1', createdAt: 'server-time' };

    expect(parseStoredMissionOpportunity(stored, 's1', opportunity)).toEqual(opportunity);
    for (const malformed of [
      { ...stored, sessionId: 's2' },
      { ...stored, groupId: 'fleet-2' },
      { ...stored, chart: 'B' },
      { ...stored, coordinate: '5143' },
      { ...stored, siteCode: 'L' },
      { ...stored, sourceShipId: '' },
      { ...stored, sourceShipId: 'forged-ship' },
      { ...stored, sourceTransitionId: '' },
      { ...stored, sourceTransitionId: 'anything' },
      { ...stored, sourceTransitionId: 'navigation-move/1' },
      { ...stored, sourceCycle: -1 },
    ]) {
      expect(() => parseStoredMissionOpportunity(malformed, 's1', opportunity)).toThrow(/stored/i);
    }
  });
});

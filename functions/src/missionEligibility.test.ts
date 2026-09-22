import { describe, expect, it } from 'vitest';
import type { FleetGroupRecord } from './fleetGroups';
import {
  firstArrivalMissionOpportunity,
  legacyCycleRepeatableMissionOpportunity,
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

  it('creates one Unstable Star opportunity per cycle after the group leaves and returns', () => {
    const systemHistory: SystemHistory = {
      dione: {
        '8378': {
          coordinate: '8378',
          discovery: { id: 'navigation-prior-star', occurredAt: '2026-09-21T00:00:00.000Z' },
          attempts: [{ id: 'attempt-cycle-1', occurredAt: '2026-09-21T00:01:00.000Z' }],
          hazards: [], rewards: [{ id: 'reward-cycle-1', occurredAt: '2026-09-21T00:02:00.000Z' }],
          clearedThreats: [], candidateProgress: [],
        },
      },
    };

    const cycleTwo = firstArrivalMissionOpportunity({
      ...base,
      destination: '8378',
      cycle: 2,
      systemHistory,
    });
    expect(cycleTwo).toMatchObject({
      id: 'arrival-fleet-1-A-8378-cycle-2',
      siteCode: 'J',
      sourceCycle: 2,
    });
    expect(firstArrivalMissionOpportunity({
      ...base,
      destination: '8378',
      cycle: 3,
      systemHistory,
    })).toMatchObject({ id: 'arrival-fleet-1-A-8378-cycle-3', sourceCycle: 3 });
  });

  it('keeps Unstable Star cycle eligibility group-local and requires the group to leave first', () => {
    expect(firstArrivalMissionOpportunity({
      ...base,
      destination: '8378',
      coordinates: { aegis: '0000', dione: '8378' },
    })).toBeUndefined();

    const first = firstArrivalMissionOpportunity({ ...base, destination: '8378' });
    const duplicateTransition = firstArrivalMissionOpportunity({
      ...base,
      destination: '8378',
      sourceTransitionId: 'jump-another-arrival',
    });
    expect(duplicateTransition?.id).toBe(first?.id);
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

  it('rejects a stored Unstable Star opportunity whose source cycle conflicts with its identity', () => {
    const opportunity = firstArrivalMissionOpportunity({ ...base, destination: '8378' })!;
    expect(() => parseStoredMissionOpportunity({
      ...opportunity,
      sessionId: 's1',
      sourceCycle: opportunity.sourceCycle + 1,
    }, 's1', opportunity)).toThrow(/stored/i);
  });

  it('validates a legacy Unstable Star identity without treating an older cycle as malformed', () => {
    const opportunity = firstArrivalMissionOpportunity({ ...base, destination: '8378', cycle: 3 })!;
    const legacy = legacyCycleRepeatableMissionOpportunity(opportunity)!;
    expect(legacy.id).toBe('arrival-fleet-1-A-8378');
    expect(parseStoredMissionOpportunity({
      ...legacy,
      sessionId: 's1',
      sourceCycle: 2,
    }, 's1', legacy, 'any')).toMatchObject({
      id: 'arrival-fleet-1-A-8378',
      sourceCycle: 2,
    });
  });

  it('creates one hidden-difficulty Wolf Supply Outpost opportunity per cycle', () => {
    const systemHistory: SystemHistory = {
      dione: {
        '6943': {
          coordinate: '6943',
          discovery: { id: 'navigation-prior-outpost', occurredAt: '2026-09-21T00:00:00.000Z' },
          attempts: [{ id: 'attempt-cycle-1', occurredAt: '2026-09-21T00:01:00.000Z' }],
          hazards: [], rewards: [{ id: 'reward-cycle-1', occurredAt: '2026-09-21T00:02:00.000Z' }],
          clearedThreats: [], candidateProgress: [],
        },
      },
    };
    const opportunity = firstArrivalMissionOpportunity({
      ...base,
      destination: '6943',
      cycle: 2,
      systemHistory,
    });

    expect(opportunity).toEqual({
      type: 'mission-opportunity',
      status: 'available',
      id: 'arrival-fleet-1-A-6943-cycle-2',
      groupId: 'fleet-1',
      chart: 'A',
      coordinate: '6943',
      siteCode: 'K',
      sourceShipId: 'aegis',
      sourceTransitionId: 'navigation-arrival-1',
      sourceCycle: 2,
    });
    expect(JSON.stringify(opportunity)).not.toMatch(/difficulty|secret|multiplier/i);
    expect(() => parseStoredMissionOpportunity({
      ...opportunity,
      sessionId: 's1',
      sourceCycle: 3,
    }, 's1', opportunity!)).toThrow(/stored/i);
  });
});

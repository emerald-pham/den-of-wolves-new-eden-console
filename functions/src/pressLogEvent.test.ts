import { describe, expect, it } from 'vitest';
import {
  buildCommissarPurgePressLogEntry,
  buildPresidentActionPressLogEntry,
  buildShuttleSurvivorTransferPressLogEntry,
  buildSurvivorChangePressLogEntry,
  pressLogDocumentId,
} from './pressLogEvent';

const recordedAt = '2026-09-27T21:00:00.000Z';

describe('Press log event contract', () => {
  it('records a committed survivor-track change with its cause and before/after counts', () => {
    const entry = buildSurvivorChangePressLogEntry({
      sourceId: 'population-adjustment:request-1',
      cause: 'population-adjustment',
      vesselId: 'aegis',
      cycle: 3,
      recordedAt,
      fromPopulation: 2_500,
      toPopulation: 2_000,
    });

    expect(entry).toEqual({
      type: 'survivor-change',
      sourceId: 'population-adjustment:request-1',
      cause: 'population-adjustment',
      vesselId: 'aegis',
      cycle: 3,
      recordedAt,
      fromPopulation: 2_500,
      toPopulation: 2_000,
    });
  });

  it('records a shuttle transfer as one event with both authoritative destination counts', () => {
    expect(buildShuttleSurvivorTransferPressLogEntry({
      sourceId: 'shuttle-evacuation:request-2',
      shuttleId: 'endeavour',
      sourceShipId: 'aegis',
      destinationShipId: 'icebreaker',
      cycle: 3,
      recordedAt,
      amount: 500,
      sourcePopulationBefore: 2_500,
      sourcePopulationAfter: 2_000,
      destinationPopulationBefore: 8_000,
      destinationPopulationAfter: 8_500,
    })).toEqual({
      type: 'survivor-transfer',
      sourceId: 'shuttle-evacuation:request-2',
      shuttleId: 'endeavour',
      sourceShipId: 'aegis',
      destinationShipId: 'icebreaker',
      cycle: 3,
      recordedAt,
      amount: 500,
      sourcePopulationBefore: 2_500,
      sourcePopulationAfter: 2_000,
      destinationPopulationBefore: 8_000,
      destinationPopulationAfter: 8_500,
    });
  });

  it('records a Commissar purge as one event containing both survivor and unrest outcomes', () => {
    expect(buildCommissarPurgePressLogEntry({
      sourceId: 'commissar-purge:request-3',
      shipId: 'icebreaker',
      cycle: 3,
      recordedAt,
      populationBefore: 2_000,
      populationAfter: 1_500,
      unrestBefore: 4,
      unrestAfter: 3,
    })).toEqual({
      type: 'commissar-purge',
      sourceId: 'commissar-purge:request-3',
      shipId: 'icebreaker',
      cycle: 3,
      recordedAt,
      survivorsRemoved: 500,
      populationBefore: 2_000,
      populationAfter: 1_500,
      unrestBefore: 4,
      unrestAfter: 3,
    });
  });

  it('hands the recorded presidential event and copy to the restricted Press projection', () => {
    expect(buildPresidentActionPressLogEntry({
      sourceId: 'president-action:request-4',
      actionKind: 'address',
      text: 'The fleet will hold course.',
      cycle: 3,
      recordedAt,
    })).toEqual({
      type: 'president-action',
      sourceId: 'president-action:request-4',
      actionKind: 'address',
      text: 'The fleet will hold course.',
      cycle: 3,
      recordedAt,
    });
  });

  it('assigns a deterministic, safe document id to each source event', () => {
    const populationChange = buildSurvivorChangePressLogEntry({
      sourceId: 'population-adjustment:request-1', cause: 'population-adjustment',
      vesselId: 'aegis', cycle: 3, recordedAt, fromPopulation: 2_500, toPopulation: 2_000,
    });
    const purge = buildCommissarPurgePressLogEntry({
      sourceId: 'commissar-purge:request-1', shipId: 'aegis', cycle: 3, recordedAt,
      populationBefore: 2_500, populationAfter: 2_000, unrestBefore: 4, unrestAfter: 3,
    });

    expect(pressLogDocumentId(populationChange)).toBe(pressLogDocumentId(populationChange));
    expect(pressLogDocumentId(populationChange)).not.toBe(pressLogDocumentId(purge));
    expect(pressLogDocumentId(populationChange)).toMatch(/^press-[a-f0-9]{64}$/);
  });

  it('rejects records that cannot describe a committed state change', () => {
    expect(() => buildSurvivorChangePressLogEntry({
      sourceId: 'same', cause: 'ship-damage', vesselId: 'aegis', cycle: 3, recordedAt,
      fromPopulation: 2_500, toPopulation: 2_500,
    })).toThrow(/change/i);
    expect(() => buildShuttleSurvivorTransferPressLogEntry({
      sourceId: 'transfer', shuttleId: 'endeavour', sourceShipId: 'aegis',
      destinationShipId: 'icebreaker', cycle: 3, recordedAt, amount: 500,
      sourcePopulationBefore: 2_500, sourcePopulationAfter: 2_001,
      destinationPopulationBefore: 8_000, destinationPopulationAfter: 8_500,
    })).toThrow(/transfer/i);
    expect(() => buildCommissarPurgePressLogEntry({
      sourceId: 'purge', shipId: 'icebreaker', cycle: 3, recordedAt,
      populationBefore: 2_000, populationAfter: 1_500, unrestBefore: 4, unrestAfter: 2,
    })).toThrow(/unrest/i);
    expect(() => buildPresidentActionPressLogEntry({
      sourceId: 'president', actionKind: 'gm-command' as never, text: 'Not a President action',
      cycle: 3, recordedAt,
    })).toThrow(/President action/i);
  });
});

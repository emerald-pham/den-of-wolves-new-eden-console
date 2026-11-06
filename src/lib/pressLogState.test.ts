import { describe, expect, it } from 'vitest';
import { parsePressLogEntry } from './pressLogState';

const recordedAt = '2026-09-27T21:00:00.000Z';

describe('Press log projection', () => {
  it('projects only the authoritative survivor-change fields', () => {
    expect(parsePressLogEntry('press-1', {
      type: 'survivor-change', sourceId: 'maintenance:req-1', cause: 'ship-maintenance',
      vesselId: 'aegis', cycle: 3, recordedAt, fromPopulation: 2_500, toPopulation: 2_000,
      actorUid: 'private-uid', loyalty: 'hidden',
    })).toEqual({
      id: 'press-1', type: 'survivor-change', sourceId: 'maintenance:req-1',
      cause: 'ship-maintenance', vesselId: 'aegis', cycle: 3, recordedAt,
      fromPopulation: 2_500, toPopulation: 2_000,
    });
  });

  it('projects purge and President records while rejecting malformed events', () => {
    expect(parsePressLogEntry('purge-1', {
      type: 'commissar-purge', sourceId: 'purge:req-2', shipId: 'icebreaker',
      cycle: 4, recordedAt, survivorsRemoved: 500, populationBefore: 2_000,
      populationAfter: 1_500, unrestBefore: 4, unrestAfter: 3,
    })).toMatchObject({ type: 'commissar-purge', survivorsRemoved: 500, unrestAfter: 3 });
    expect(parsePressLogEntry('president-1', {
      type: 'president-action', sourceId: 'president:req-3', actionKind: 'address',
      text: 'The fleet will hold course.', cycle: 4, recordedAt,
    })).toMatchObject({ type: 'president-action', actionKind: 'address', text: 'The fleet will hold course.' });
    expect(parsePressLogEntry('bad', {
      type: 'president-action', sourceId: 'president:req-4', actionKind: 'elevate-gm',
      text: 'Not a President action.', cycle: 4, recordedAt,
    })).toBeNull();
  });

  it('projects a P.D.F. news hand-off as text only, without sender or audience fields', () => {
    expect(parsePressLogEntry('relay-1', {
      type: 'pdf-news-relay', sourceId: 'pdf-news-relay:req-8', text: 'Outer marker clear.',
      cycle: 2, recordedAt, actorUid: 'colonel-uid', groupId: 'fleet-1',
    })).toEqual({
      id: 'relay-1', type: 'pdf-news-relay', sourceId: 'pdf-news-relay:req-8',
      text: 'Outer marker clear.', cycle: 2, recordedAt,
    });
    expect(parsePressLogEntry('relay-bad', {
      type: 'pdf-news-relay', sourceId: 'pdf-news-relay:req-9', text: 'x'.repeat(241), cycle: 2, recordedAt,
    })).toBeNull();
  });

  it('requires internally consistent transfer counts and safe source identity', () => {
    expect(parsePressLogEntry('transfer-1', {
      type: 'survivor-transfer', sourceId: 'evacuation:req-5', shuttleId: 'endeavour',
      sourceShipId: 'aegis', destinationShipId: 'icebreaker', cycle: 4, recordedAt,
      amount: 500, sourcePopulationBefore: 2_500, sourcePopulationAfter: 2_000,
      destinationPopulationBefore: 8_000, destinationPopulationAfter: 8_500,
    })).toMatchObject({ type: 'survivor-transfer', amount: 500 });
    expect(parsePressLogEntry('bad', {
      type: 'survivor-transfer', sourceId: 'evacuation:req-6', shuttleId: 'endeavour',
      sourceShipId: 'aegis', destinationShipId: 'icebreaker', cycle: 4, recordedAt,
      amount: 500, sourcePopulationBefore: 2_500, sourcePopulationAfter: 2_001,
      destinationPopulationBefore: 8_000, destinationPopulationAfter: 8_500,
    })).toBeNull();
    expect(parsePressLogEntry('../sessions/s1', {
      type: 'survivor-change', sourceId: 'maintenance:req-7', cause: 'ship-maintenance',
      vesselId: 'aegis', cycle: 4, recordedAt, fromPopulation: 2_500, toPopulation: 2_000,
    })).toBeNull();
  });
});

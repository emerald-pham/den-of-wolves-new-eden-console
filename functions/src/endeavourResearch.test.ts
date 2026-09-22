import { describe, expect, it } from 'vitest';
import { CONSOLE_METADATA } from './consoleMetadata';
import {
  advanceEndeavourResearch,
  ENDEAVOUR_RESEARCH_TRACKS,
  endeavourResearchTrack,
  endeavourResearchTrackForConsole,
  type EndeavourResearchTrackId,
} from './endeavourResearch';

const expectedCosts: Readonly<Record<EndeavourResearchTrackId, readonly number[]>> = {
  reactor: [8, 7, 6, 5, 4],
  'jump-drive': [14, 10, 6, 4, 3],
  hydroponics: [8, 4, 2, 1, 1],
  'water-reclamation': [8, 4, 2, 1, 1],
  'advanced-hydroponics': [18, 14, 10, 6, 3],
  'water-production': [18, 14, 10, 6, 3],
  'fuel-refinery': [14, 12, 8, 6, 5],
  'mining-drone-control': [18, 14, 10, 6, 4],
  'ram-scoop': [14, 12, 10, 8, 5],
  'command-and-control': [12, 9, 7, 5, 6],
  'point-defence-lasers': [12, 11, 8, 5, 2],
  'missile-launchers': [12, 10, 7, 5, 3],
  'ecm-device': [18, 13, 9, 7, 5],
  'wolf-agent-detector': [18, 12, 7, 5],
};

const expectedConsoleTracks: Readonly<Record<string, EndeavourResearchTrackId>> = {
  reactor: 'reactor',
  'jump-drive': 'jump-drive',
  hydroponics: 'hydroponics',
  'water-reclamation': 'water-reclamation',
  'advanced-hydroponics': 'advanced-hydroponics',
  'advanced-hydroponics-ii': 'advanced-hydroponics',
  'water-production': 'water-production',
  'water-production-ii': 'water-production',
  'fuel-refinery': 'fuel-refinery',
  'fuel-refinery-ii': 'fuel-refinery',
  'mining-drone-control': 'mining-drone-control',
  'ram-scoop': 'ram-scoop',
  'command-and-control': 'command-and-control',
  'point-defence-lasers': 'point-defence-lasers',
  'missile-launchers': 'missile-launchers',
};

describe('Endeavour research tracks', () => {
  it('encodes every printed material-cost track exactly', () => {
    expect(Object.fromEntries(Object.entries(ENDEAVOUR_RESEARCH_TRACKS)
      .map(([trackId, track]) => [trackId, track.materialCosts]))).toEqual(expectedCosts);
    expect(Object.isFrozen(ENDEAVOUR_RESEARCH_TRACKS)).toBe(true);
    expect(Object.values(ENDEAVOUR_RESEARCH_TRACKS)
      .every((definition) => Object.isFrozen(definition) && Object.isFrozen(definition.materialCosts))).toBe(true);
  });

  it.each(Object.keys(expectedCosts) as EndeavourResearchTrackId[])(
    'advances the left-most remaining %s box and exposes the next cost',
    (trackId) => {
      const costs = expectedCosts[trackId];
      const first = advanceEndeavourResearch({}, trackId);
      expect(first).toMatchObject({
        crossedBox: 0,
        previousMaterialCost: costs[0],
        progress: { [trackId]: 1 },
        track: {
          trackId,
          crossedBoxes: 1,
          currentMaterialCost: costs[1] ?? null,
          complete: costs.length === 1,
        },
      });

      const later = advanceEndeavourResearch({ [trackId]: costs.length - 1 }, trackId);
      expect(later).toMatchObject({
        crossedBox: costs.length - 1,
        previousMaterialCost: costs.at(-1),
        progress: { [trackId]: costs.length },
        track: { currentMaterialCost: null, complete: true },
      });
      expect(() => advanceEndeavourResearch(later.progress, trackId)).toThrow(/already complete/i);
    },
  );

  it('rejects malformed progress before reading or advancing a track', () => {
    expect(() => endeavourResearchTrack({ reactor: -1 }, 'reactor')).toThrow(/invalid crossed-box/i);
    expect(() => endeavourResearchTrack({ reactor: 1.5 }, 'reactor')).toThrow(/invalid crossed-box/i);
    expect(() => endeavourResearchTrack({ reactor: 6 }, 'reactor')).toThrow(/invalid crossed-box/i);
    expect(() => endeavourResearchTrack({ unknown: 1 } as never, 'reactor')).toThrow(/unknown track/i);
    for (const malformed of [null, 0, '', true, [], new Date(), Object.create(null)]) {
      expect(() => advanceEndeavourResearch(malformed, 'reactor')).toThrow(/canonical record/i);
    }
    expect(() => advanceEndeavourResearch({}, 'unknown' as never)).toThrow(/unknown.*track/i);
  });

  it('preserves every unrelated canonical track while advancing one box', () => {
    expect(advanceEndeavourResearch({ reactor: 1, 'jump-drive': 2 }, 'reactor').progress).toEqual({
      reactor: 2,
      'jump-drive': 2,
    });
  });

  it('maps every eligible canonical console id to the shared printed track', () => {
    const mapped = Object.values(CONSOLE_METADATA)
      .map((metadata) => [metadata.consoleId,
        endeavourResearchTrackForConsole(metadata.shipId, metadata.consoleId.slice(metadata.shipId.length + 1))] as const)
      .filter((entry): entry is readonly [string, EndeavourResearchTrackId] => entry[1] !== null);

    expect(mapped).toEqual(expect.arrayContaining([
      ['aegis:reactor', 'reactor'],
      ['aegis:command-and-control', 'command-and-control'],
      ['icebreaker:mining-drone-control', 'mining-drone-control'],
      ['icebreaker:ram-scoop', 'ram-scoop'],
      ['shepherd:advanced-hydroponics-ii', 'advanced-hydroponics'],
      ['quellon:water-production-ii', 'water-production'],
      ['refinery-124:fuel-refinery-ii', 'fuel-refinery'],
    ]));
    for (const [systemId, trackId] of Object.entries(expectedConsoleTracks)) {
      const canonical = Object.values(CONSOLE_METADATA).filter((metadata) =>
        metadata.consoleId === `${metadata.shipId}:${systemId}`);
      expect(canonical.length, `${systemId} must name a canonical console`).toBeGreaterThan(0);
      expect(canonical.every((metadata) =>
        endeavourResearchTrackForConsole(metadata.shipId, systemId) === trackId)).toBe(true);
    }
    expect(endeavourResearchTrackForConsole('aegis', 'storage')).toBeNull();
    expect(endeavourResearchTrackForConsole('not-a-ship', 'reactor')).toBeNull();
  });
});

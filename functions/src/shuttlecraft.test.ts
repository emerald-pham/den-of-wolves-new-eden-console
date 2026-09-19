import { describe, expect, it } from 'vitest';
import { recommendedRoleIds } from './roleConfiguration';
import {
  INITIAL_SHUTTLE_DOCKINGS,
  INITIAL_SHUTTLE_VISITS,
  initialShuttleDockingsForRoles,
  sanitizeShuttleCargo,
  scrapShuttleIdsForRoles,
} from './shuttlecraft';

it('creates sessions with every non-Union printed shuttle docked at its home ship', () => {
  expect(INITIAL_SHUTTLE_DOCKINGS).toEqual([
    { shuttleId: 'snn-press-shuttle', shipId: 'dione', dockedAt: 'SESSION START' },
    { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' },
    { shuttleId: 'pallas', shipId: 'aegis', dockedAt: 'SESSION START' },
    { shuttleId: 'philia', shipId: 'dione', dockedAt: 'SESSION START' },
    { shuttleId: 'maliades', shipId: 'dione', dockedAt: 'SESSION START' },
    { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'SESSION START' },
    { shuttleId: 'blacksmith', shipId: 'icebreaker', dockedAt: 'SESSION START' },
    { shuttleId: 'macaw', shipId: 'capybara', dockedAt: 'SESSION START' },
    { shuttleId: 'boa', shipId: 'capybara', dockedAt: 'SESSION START' },
    { shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'SESSION START' },
    { shuttleId: 'black-sheep', shipId: 'shepherd', dockedAt: 'SESSION START' },
    { shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'SESSION START' },
    { shuttleId: 'condor', shipId: 'quellon', dockedAt: 'SESSION START' },
    { shuttleId: 'chacau', shipId: 'refinery-124', dockedAt: 'SESSION START' },
    { shuttleId: 'chepu', shipId: 'refinery-124', dockedAt: 'SESSION START' },
  ]);
  expect(INITIAL_SHUTTLE_VISITS).toEqual(
    INITIAL_SHUTTLE_DOCKINGS.map((docking) => expect.objectContaining({
      shuttleId: docking.shuttleId,
      shipId: docking.shipId,
      action: 'docked',
      occurredAt: 'SESSION START',
    })),
  );
});

it.each([
  [8, 'aegis'],
  [11, 'aegis'],
  [12, 'dione'],
  [18, 'dione'],
  [19, 'dione'],
  [20, 'dione'],
] as const)('derives the SNN host from the locked %i-player core roster', (playerCount, shipId) => {
  expect(initialShuttleDockingsForRoles(recommendedRoleIds(playerCount))).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId }),
    ]),
  );
});

it('seeds only shuttles owned by enabled printed roles', () => {
  const dockings = initialShuttleDockingsForRoles(recommendedRoleIds(8));
  expect(dockings.map(({ shuttleId }) => shuttleId)).toEqual([
    'snn-press-shuttle', 'starlight', 'highwall', 'endeavour',
    'hummingbird', 'chepu',
  ]);
  expect(dockings).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'pallas' }),
    expect.objectContaining({ shuttleId: 'blacksmith' }),
  ]));
});

describe('Scrap shuttle ledger authority', () => {
  const expansionRoles = ['admiral', 'capybara-captain', 'capybara-recycler'];

  it('enables Scrap only for Macaw and Boa when the expansion pair is active', () => {
    expect([...scrapShuttleIdsForRoles(expansionRoles)]).toEqual(['macaw', 'boa']);
    expect([...scrapShuttleIdsForRoles(['admiral', 'capybara-captain'])]).toEqual([]);
    expect([...scrapShuttleIdsForRoles(['admiral'])]).toEqual([]);
  });

  it('strips unauthorized Scrap while preserving valid non-Scrap cargo', () => {
    const stored = {
      macaw: { scrap: 4, ore: 2 },
      boa: { scrap: 3, food: 1 },
      starlight: { scrap: 9, water: 2 },
      hummingbird: { scrap: 8, food: 3 },
      unknown: { scrap: 12 },
    };

    expect(sanitizeShuttleCargo(stored, expansionRoles)).toEqual({
      macaw: { scrap: 4, ore: 2 },
      boa: { scrap: 3, food: 1 },
      starlight: { water: 2 },
      hummingbird: { food: 3 },
    });
    expect(sanitizeShuttleCargo({ macaw: { scrap: -1 }, boa: { scrap: 1.5 } }, expansionRoles))
      .toEqual({ macaw: {}, boa: {} });
    expect(sanitizeShuttleCargo(stored, ['admiral'])).toEqual({
      macaw: { ore: 2 },
      boa: { food: 1 },
      starlight: { water: 2 },
      hummingbird: { food: 3 },
    });
  });
});

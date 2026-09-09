import { expect, it } from 'vitest';
import { recommendedRoleIds } from './roleConfiguration';
import {
  INITIAL_SHUTTLE_DOCKINGS,
  INITIAL_SHUTTLE_VISITS,
  initialShuttleDockingsForRoles,
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

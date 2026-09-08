import { expect, it, vi } from 'vitest';
import { recommendedRoleIds } from '@/data/rolePresets';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  doc: vi.fn(),
  getFirestore: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));
vi.mock('./firebase', () => ({ app: vi.fn() }));
vi.mock('./firebaseConfig', () => ({
  emulatorPorts: { firestore: 8080 },
  useEmulators: false,
}));

const { sessionFrom } = await import('./firestore');

function sessionData(playerCount: number) {
  return {
    name: 'Table one',
    joinCode: `${4000 + playerCount}`,
    phase: 'lobby',
    currentTurn: 0,
    playerCount,
    activeRoleIds: recommendedRoleIds(playerCount),
    ownerUid: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

it.each([
  [8, 'aegis'],
  [11, 'aegis'],
  [12, 'dione'],
  [18, 'dione'],
  [19, 'dione'],
  [20, 'dione'],
] as const)('hydrates the persisted %i-player SNN host from Firestore data', (playerCount, shipId) => {
  const session = sessionFrom(`s-${playerCount}`, sessionData(playerCount));

  expect(session.shuttleDockings).toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId }),
  ]));
});

it('adds missing legacy SNN state without replacing stored docking or visit history', () => {
  const oldDocking = {
    shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START',
  };
  const oldVisit = {
    id: 'starlight-initial-aegis-docking', shuttleId: 'starlight', shipId: 'aegis',
    action: 'docked', occurredAt: 'SESSION START',
  };
  const session = sessionFrom('legacy-11', {
    ...sessionData(11),
    shuttleDockings: [oldDocking],
    shuttleVisitLog: [oldVisit],
  });

  expect(session.shuttleDockings).toEqual(expect.arrayContaining([
    oldDocking,
    expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId: 'aegis' }),
  ]));
  expect(session.shuttleVisitLog).toEqual(expect.arrayContaining([
    oldVisit,
    expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId: 'aegis' }),
  ]));
});

it('preserves a valid nondefault SNN docking and visit history', () => {
  const storedDocking = {
    shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'TURN 3',
  };
  const storedVisit = {
    id: 'snn-visit-3', shuttleId: 'snn-press-shuttle', shipId: 'aegis',
    action: 'docked', occurredAt: 'TURN 3',
  };
  const session = sessionFrom('legacy-visit', {
    ...sessionData(20),
    shuttleDockings: [storedDocking],
    shuttleVisitLog: [storedVisit],
  });

  expect(session.shuttleDockings).toEqual([storedDocking]);
  expect(session.shuttleVisitLog).toEqual([storedVisit]);
});

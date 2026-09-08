import { expect, it, vi } from 'vitest';
import { recommendedRoleIds } from '@/data/rolePresets';
import type { GameSession } from '@/types/game';

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

const { sessionFrom, subscribeGmInstances, subscribeSessionState } = await import('./firestore');
const { onSnapshot } = await import('firebase/firestore');

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

it('hydrates the canonical setup tuple and derived vessels for reconnect consumers', () => {
  const session = sessionFrom('canonical-setup', {
    ...sessionData(8),
    chartId: 'B',
    expansion: 'base',
    turnLimit: 7,
    dioneEnabled: true,
    capybaraEnabled: false,
    setupRevision: 3,
    setup: {
      playerCount: 8,
      chartId: 'B',
      expansion: 'base',
      turnLimit: 7,
      dioneEnabled: true,
      capybaraEnabled: false,
      activeRoleIds: sessionData(8).activeRoleIds,
      activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    },
    activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
  }) as GameSession & {
    setup: { playerCount: number; chartId: string; expansion: string; turnLimit: number };
    activeVesselIds: readonly string[];
  };

  expect(session.setup).toMatchObject({
    playerCount: 8,
    chartId: 'B',
    expansion: 'base',
    turnLimit: 7,
  });
  expect(session.activeVesselIds).toEqual([
    'aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124',
  ]);
});

it('projects normalized dual-lane GM responsibilities during hydration', () => {
  const onInstances = vi.fn();
  vi.mocked(onSnapshot).mockImplementation(((_query: unknown, callback: unknown) => {
    (callback as (snapshot: unknown) => void)({
      docs: [{
        id: 'bridge',
        data: () => ({
          uid: 'gm1', name: 'Bridge', deviceLabel: 'Chrome',
          responsibilities: ['main', 'assistant'], responsibility: 'main',
          claimedAt: '2026-09-08T19:00:00.000Z',
        }),
      }],
    });
    return vi.fn();
  }) as never);

  subscribeGmInstances('s1', onInstances, vi.fn());

  expect(onInstances).toHaveBeenCalledWith([
    expect.objectContaining({
      id: 'bridge',
      responsibility: 'main',
      responsibilities: ['main', 'assistant'],
    }),
  ]);
});

it('hydrates stable seat role ids without treating Press as a core seat', () => {
  const onSeats = vi.fn();
  let snapshotNumber = 0;
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown) => {
    snapshotNumber += 1;
    if (snapshotNumber === 3) {
      (callback as (snapshot: unknown) => void)({
        docs: [{
          id: 'admiral',
          data: () => ({
            roleId: 'admiral', label: 'AEGIS // Admiral', factionId: 'aegis',
            status: 'open', holderUid: null, claimedAt: null,
          }),
        }, {
          id: 'press-officer',
          data: () => ({
            roleId: 'press-officer', label: 'SNN // Press Officer', factionId: 'press',
            status: 'open', holderUid: null, claimedAt: null,
          }),
        }],
      });
    } else {
      (callback as (snapshot: unknown) => void)({
        exists: () => true,
        id: 's1',
        data: () => ({}),
        get: () => undefined,
      });
    }
    return vi.fn();
  }) as never);

  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats, onError: vi.fn(),
  });

  expect(onSeats).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ id: 'admiral', label: 'AEGIS // Admiral', roleId: 'admiral' }),
  ]));
  expect(onSeats.mock.calls[0]?.[0]).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'press-officer' }),
  ]));
});

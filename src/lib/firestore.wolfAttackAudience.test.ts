import { expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  doc: vi.fn(),
  getDocFromServer: vi.fn(),
  getFirestore: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  query: vi.fn(),
  Timestamp: class MockTimestamp {
    constructor(private readonly seconds: number, private readonly nanoseconds: number) {}
    toDate() { return new Date(this.seconds * 1_000 + this.nanoseconds / 1_000_000); }
  },
  where: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({ app: vi.fn(), functions: vi.fn() }));
vi.mock('./firebaseConfig', () => ({ emulatorPorts: { firestore: 8080 }, useEmulators: false }));

const { subscribeWolfAttackMemberView } = await import('./firestore');
const { onSnapshot } = await import('firebase/firestore');

const memberView = {
  type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 's1', attackId: 'attack-1',
  turn: 1, revision: 4, status: 'declared', phase: 'active', currentStep: 'long-range', range: 'long',
  deadlineAt: '2026-10-03T12:10:00.000Z', serverTime: '2026-10-03T12:00:00.000Z', visibility: 'members',
  redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'], results: [],
} as const;

function snapshot(value: unknown, fromCache = false) {
  return { metadata: { fromCache }, exists: () => true, data: () => value };
}

function capture() {
  const callbacks: Array<(snapshot: unknown) => void> = [];
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, _options: unknown, next: unknown) => {
    callbacks.push(next as (snapshot: unknown) => void);
    return vi.fn();
  }) as never);
  const onView = vi.fn();
  subscribeWolfAttackMemberView('s1', onView);
  return { callbacks, onView };
}

it('hydrates exact targetless support misses and withdraws malformed or private variants', () => {
  const miss = { range: 'short', sourceId: 'highwall', targetId: null, bearing: null,
    contactReference: 'Highwall Cannon', effect: 'Highwall Cannon missed', outcome: { damage: 0 },
    serverTime: memberView.serverTime };
  const { callbacks, onView } = capture();
  let revision = memberView.revision;
  const publish = (result: Record<string, unknown>) => {
    const current = { ...memberView, revision: ++revision, results: [result] };
    callbacks[0]?.(snapshot(current));
    return current;
  };
  expect(onView).not.toHaveBeenCalled();
  expect(publish(miss)).toEqual(onView.mock.lastCall?.[0]);
  for (const invalid of [
    { ...miss, outcome: { damage: 1 } },
    { ...miss, range: 'boarding' },
    { ...miss, sourceId: 'foreign-source' },
    { ...miss, contactReference: 'Wolf contact 1' },
    { ...miss, bearing: 40 },
    { ...miss, outcome: { damage: 0, destroyed: true } },
    { ...miss, rolls: [1] },
    { ...miss, actorUid: 'private-actor' },
  ]) {
    publish(invalid);
    expect(onView).toHaveBeenLastCalledWith(null);
    expect(publish(miss)).toEqual(onView.mock.lastCall?.[0]);
  }
});

it('withdraws an unsafe future member schema and fences out older raw revisions', () => {
  const { callbacks, onView } = capture();
  callbacks[0]?.(snapshot(memberView));
  callbacks[0]?.(snapshot({ ...memberView, revision: 5, schemaVersion: 2 }));

  expect(onView.mock.calls).toEqual([[memberView], [null]]);
  callbacks[0]?.(snapshot(memberView));
  expect(onView).toHaveBeenCalledTimes(2);
  callbacks[0]?.(snapshot({ ...memberView, revision: 6, currentStep: 'medium-range', range: 'medium' }));
  expect(onView).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 6, currentStep: 'medium-range' }));
});

it('hydrates a resolved authoritative result with Firestore map ordering', () => {
  const result = { bearing: null, contactReference: 'ship:dione', effect: 'damage',
    outcome: { destroyed: false, damage: 2 }, range: 'long', serverTime: memberView.serverTime,
    sourceId: 'aegis-missile-launchers', targetId: 'dione' };
  const resolved = { ...memberView, currentStep: 'resolved', range: null, status: 'resolved',
    remainingThreatCount: 3, returningThreatCount: 0, results: [result] };
  const { callbacks, onView } = capture();
  callbacks[0]?.(snapshot(resolved));
  expect(onView).toHaveBeenLastCalledWith(resolved);
  callbacks[0]?.(snapshot({ ...resolved, revision: resolved.revision + 1,
    results: [{ ...result, actorUid: 'private-actor' }] }));
  expect(onView).toHaveBeenLastCalledWith(null);
});

it('withdraws a cached member snapshot and does not restore it from an older server event', () => {
  const { callbacks, onView } = capture();
  callbacks[0]?.(snapshot(memberView));
  callbacks[0]?.(snapshot({ ...memberView, revision: 5 }, true));

  expect(onView.mock.calls).toEqual([[memberView], [null]]);
  callbacks[0]?.(snapshot(memberView));
  expect(onView).toHaveBeenCalledTimes(2);
});

it('withdraws a stale cached event but accepts the matching authoritative server revision again', () => {
  const current = { ...memberView, revision: 6, currentStep: 'medium-range', range: 'medium' };
  const { callbacks, onView } = capture();
  callbacks[0]?.(snapshot(current));
  callbacks[0]?.(snapshot(memberView, true));

  expect(onView.mock.calls).toEqual([[current], [null]]);
  callbacks[0]?.(snapshot(memberView));
  expect(onView).toHaveBeenCalledTimes(2);
  callbacks[0]?.(snapshot(current));
  expect(onView).toHaveBeenLastCalledWith(current);
});

it('withdraws malformed audience data without a raw revision and waits for a newer valid revision', () => {
  const { callbacks, onView } = capture();
  callbacks[0]?.(snapshot(memberView));
  callbacks[0]?.(snapshot({ type: 'wolf-attack-member-view', sessionId: 's1' }));

  expect(onView.mock.calls).toEqual([[memberView], [null]]);
  callbacks[0]?.(snapshot(memberView));
  expect(onView).toHaveBeenLastCalledWith(null);
  callbacks[0]?.(snapshot({ ...memberView, revision: 5 }));
  expect(onView).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 5 }));
});

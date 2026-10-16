import type { DocumentReference, DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import {
  closeSessionInTransaction,
  commitTerminal,
  sessionDebriefProjection,
} from './sessionDebrief';

const survivorOutcome = {
  type: 'survivor-outcome', cycle: 8, occurredAt: '2026-10-05T12:00:00.000Z',
  fleetShipPopulation: 100, survivingShipPopulation: 80, evacuatedPopulation: 0,
  escapePodCapacity: 0, lostPopulation: 20, smallVesselPopulation: 0,
  admittedVesselPopulation: 0, finalSurvivors: 80,
  survivingShipIds: ['aegis', 'dione'], lostOrDestroyedShipIds: ['capybara'],
};

function harness(initial: Record<string, unknown>) {
  let current = { ...initial };
  const updates: Record<string, unknown>[] = [];
  const snapshot = () => ({
    exists: true,
    get: (key: string) => current[key],
    data: () => current,
  }) as unknown as DocumentSnapshot;
  const tx = {
    update: (_ref: unknown, patch: Record<string, unknown>) => {
      updates.push(patch);
      current = { ...current, ...patch };
    },
  } as unknown as Transaction;
  const ref = {} as DocumentReference;
  return { get current() { return current; }, updates, tx, ref, snapshot };
}

describe('authoritative immutable session debrief', () => {
  it('freezes the final-cycle result once and completes the full-game demo marker', () => {
    const h = harness({
      phase: 'active', currentTurn: 8,
      fullGameDemo: { status: 'active', progression: 'manual' },
    });

    const result = commitTerminal(h.tx, h.ref, h.snapshot(), {
      source: 'final-cycle', committedAt: '2026-10-05T12:01:00.000Z',
      survivorOutcome,
      sessionPatch: { currentTurn: 8, pendingTeamAnnouncements: null },
    });

    expect(h.current.phase).toBe('debrief');
    expect(result.committed).toBe(true);
    expect(result.snapshot).toMatchObject({
      type: 'session-debrief', version: 1, source: 'final-cycle', result: 'completed',
      cycle: 8, survivorOutcome,
    });
    expect(h.current.fullGameDemo).toEqual({ status: 'complete', progression: 'manual' });
    expect(h.current.currentTurn).toBe(8);
  });

  it('projects only the reader entitled group and strips private or foreign detail', () => {
    const h = harness({ phase: 'active' });
    const result = commitTerminal(h.tx, h.ref, h.snapshot(), {
      source: 'candidate', committedAt: '2026-10-05T12:01:00.000Z',
      outcome: {
        type: 'game-outcome', result: 'success', cause: 'candidate-complete',
        candidateCode: 'N', cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z',
        groupId: 'fleet-a', sourceId: 'private-receipt', successfulShipIds: ['aegis'],
        leftBehindShipIds: ['dione'],
      },
      candidate: { code: 'N', groups: [
        { groupId: 'fleet-a', requirements: [{ id: 'paid-crossing', status: 'met' }],
          rolls: [{ id: 'passage', face: 4, result: 'success', audience: 'members' },
            { id: 'nebula-bonus', face: 2, result: 'success', audience: 'gm' }],
          losses: [{ shipId: 'aegis', reason: 'candidate-loss', audience: 'members' },
            { shipId: 'dione', reason: 'foreign-loss', audience: 'members' }],
          humanCalls: [{ id: 'opposite-side-sabotage', cycle: 4, audience: 'members' },
            { id: 'private-adjudication', cycle: 4, audience: 'gm' }] },
        { groupId: 'fleet-b', requirements: [{ id: 'private-chart-route', status: 'met' }],
          rolls: [{ id: 'route-roll', face: 1, result: 'failure', audience: 'members' }],
          losses: [], humanCalls: [] },
      ] },
      survivorOutcome,
      sessionPatch: { candidateVesselOutcomes: { aegis: { outcome: 'crossed', groupId: 'fleet-a' } } },
    });

    const projected = sessionDebriefProjection(result.snapshot, {
      groupId: 'fleet-a', vesselIds: ['aegis'],
    });
    expect(projected?.outcome).toEqual({
      type: 'game-outcome', result: 'success', cause: 'candidate-complete',
      candidateCode: 'N', cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z',
    });
    expect(projected?.candidate).toEqual({ code: 'N', groups: [{
      requirements: [{ id: 'paid-crossing', status: 'met' }],
      rolls: [{ id: 'passage', face: 4, result: 'success' }],
      losses: [{ shipId: 'aegis', reason: 'candidate-loss' }],
      humanCalls: [{ id: 'opposite-side-sabotage', cycle: 4 }],
    }] });
    expect(projected?.survivorOutcome?.survivingShipIds).toEqual(['aegis']);
    expect(JSON.stringify(projected)).not.toMatch(/private-receipt|groupId|nebula-bonus|private-adjudication|dione|fleet-b/);
  });

  it('explains the committed route while filtering GM-only and foreign-group path steps', () => {
    const h = harness({ phase: 'active' });
    const result = commitTerminal(h.tx, h.ref, h.snapshot(), {
      source: 'candidate', committedAt: '2026-10-05T12:01:00.000Z',
      outcome: { type: 'game-outcome', result: 'success', cause: 'candidate-complete',
        candidateCode: 'N', cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z' },
      candidate: { code: 'N', groups: [
        { groupId: 'fleet-a', requirements: [{ id: 'paid-crossing', status: 'met' }], rolls: [], losses: [], humanCalls: [],
          path: [
            { action: 'ring-passage', result: 'crossed', shipId: 'aegis', fuelSpent: 2, audience: 'members' },
            { action: 'sabotage-ring', result: 'completed', shipId: 'aegis', audience: 'gm' },
            { action: 'ring-repair', result: 'completed', shipId: 'dione', audience: 'members' },
          ] },
        { groupId: 'fleet-b', requirements: [], rolls: [], losses: [], humanCalls: [],
          path: [{ action: 'nebula-jump', result: 'reached', shipId: 'shepherd', audience: 'members' }] },
      ] },
    });

    const member = sessionDebriefProjection(result.snapshot, { groupId: 'fleet-a', vesselIds: ['aegis'] });
    expect(member?.candidate).toMatchObject({ code: 'N', groups: [{
      requirements: [{ id: 'paid-crossing', status: 'met' }],
      path: [{ action: 'ring-passage', result: 'crossed', shipId: 'aegis', fuelSpent: 2 }],
    }] });
    expect(JSON.stringify(member)).not.toMatch(/sabotage-ring|fleet-b|dione|shepherd/);

    const gm = sessionDebriefProjection(result.snapshot, { groupId: 'gm', vesselIds: ['aegis', 'dione', 'shepherd'], gm: true });
    expect(gm?.candidate).toMatchObject({ code: 'N', groups: [
      { groupId: 'fleet-a', path: [
        { action: 'ring-passage', result: 'crossed', shipId: 'aegis', fuelSpent: 2 },
        { action: 'sabotage-ring', result: 'completed', shipId: 'aegis' },
        { action: 'ring-repair', result: 'completed', shipId: 'dione' },
      ] },
      { groupId: 'fleet-b', path: [{ action: 'nebula-jump', result: 'reached', shipId: 'shepherd' }] },
    ] });
  });

  it('commits the authoritative O-candidate all-fleet-loss failure without inventing survivors or arrivals', () => {
    const lossSurvivors = {
      ...survivorOutcome,
      cycle: 6,
      fleetShipPopulation: 100,
      survivingShipPopulation: 0,
      evacuatedPopulation: 12,
      escapePodCapacity: 12,
      lostPopulation: 88,
      smallVesselPopulation: 2,
      admittedVesselPopulation: 3,
      finalSurvivors: 17,
      survivingShipIds: [],
      lostOrDestroyedShipIds: ['aegis', 'dione'],
    };
    const h = harness({ phase: 'active' });
    const input = {
      source: 'candidate' as const,
      committedAt: '2026-10-05T12:01:00.000Z',
      outcome: { type: 'game-outcome', result: 'failure', cause: 'total-fleet-loss',
        cycle: 6, occurredAt: '2026-10-05T12:00:00.000Z' },
      survivorOutcome: lossSurvivors,
      candidate: { code: 'O' as const, groups: [{ groupId: 'fleet-a',
        requirements: [{ id: 'O-requirements', status: 'met' as const }],
        rolls: [{ id: 'aegis', result: 'failure' as const, audience: 'members' as const },
          { id: 'dione', result: 'failure' as const, audience: 'members' as const }],
        losses: [{ shipId: 'aegis', reason: 'lost-in-nebula', audience: 'members' as const },
          { shipId: 'dione', reason: 'lost-in-nebula', audience: 'members' as const }],
        humanCalls: [] }] },
      sessionPatch: { candidateVesselOutcomes: {
        aegis: { outcome: 'lost', groupId: 'fleet-a' }, dione: { outcome: 'lost', groupId: 'fleet-a' },
      } },
    };

    const committed = commitTerminal(h.tx, h.ref, h.snapshot(), input);
    const replay = commitTerminal(h.tx, h.ref, h.snapshot(), {
      ...input, committedAt: '2026-10-05T12:02:00.000Z',
    });
    const projected = sessionDebriefProjection(committed.snapshot, { groupId: 'fleet-a', vesselIds: ['aegis', 'dione'] });

    expect(committed.committed).toBe(true);
    expect(committed.snapshot).toMatchObject({ source: 'candidate', result: 'failure', cause: 'total-fleet-loss',
      outcome: { result: 'failure', cause: 'total-fleet-loss' }, candidate: { code: 'O' },
      survivorOutcome: lossSurvivors });
    expect(replay.committed).toBe(false);
    expect(replay.snapshot).toEqual(committed.snapshot);
    expect(h.current.phase).toBe('debrief');
    expect(h.current.debriefSnapshot).toEqual(committed.snapshot);
    expect(projected?.candidate).toEqual({ code: 'O', groups: [{
      requirements: [{ id: 'O-requirements', status: 'met' }],
      rolls: [{ id: 'aegis', result: 'failure' }, { id: 'dione', result: 'failure' }],
      losses: [{ shipId: 'aegis', reason: 'lost-in-nebula' }, { shipId: 'dione', reason: 'lost-in-nebula' }],
      humanCalls: [],
    }] });
    expect(projected?.survivorOutcome?.survivingShipIds).toEqual([]);
    expect(JSON.stringify(projected)).not.toMatch(/arrived|crossed|safe|groupId|candidateVesselOutcomes/);
  });

  it('rejects a non-O or survivor-inconsistent candidate failure before writing', () => {
    const h = harness({ phase: 'active' });
    const input = {
      source: 'candidate' as const, committedAt: '2026-10-05T12:01:00.000Z',
      outcome: { type: 'game-outcome', result: 'failure', cause: 'total-fleet-loss',
        cycle: 6, occurredAt: '2026-10-05T12:00:00.000Z' },
      candidate: { code: 'P' as const, groups: [] }, survivorOutcome,
    };
    expect(() => commitTerminal(h.tx, h.ref, h.snapshot(), input)).toThrow();
    expect(h.updates).toHaveLength(0);
  });

  it('returns the original snapshot on an exact replay and rejects a conflicting terminal result', () => {
    const h = harness({ phase: 'failure', gameOutcome: {
      type: 'game-outcome', result: 'failure', cause: 'total-fleet-loss', cycle: 8,
      occurredAt: '2026-10-05T12:00:00.000Z',
    }, survivorOutcome });
    const first = commitTerminal(h.tx, h.ref, h.snapshot(), {
      source: 'failure-review', committedAt: '2026-10-05T12:01:00.000Z',
    });
    const replay = commitTerminal(h.tx, h.ref, h.snapshot(), {
      source: 'failure-review', committedAt: '2026-10-05T12:02:00.000Z',
    });

    expect(first.committed).toBe(true);
    expect(replay.committed).toBe(false);
    expect(replay.snapshot).toEqual(first.snapshot);
    expect(h.updates).toHaveLength(1);
    expect(() => commitTerminal(h.tx, h.ref, h.snapshot(), {
      source: 'candidate', committedAt: '2026-10-05T12:03:00.000Z',
      outcome: { type: 'game-outcome', result: 'success', cause: 'candidate-complete',
        candidateCode: 'P', cycle: 8, occurredAt: '2026-10-05T12:00:00.000Z' },
      candidate: { code: 'P', groups: [] },
    })).toThrow(/conflict|immutable/i);
  });

  it('rejects private-note fields before persisting any debrief detail', () => {
    const h = harness({ phase: 'active' });
    expect(() => commitTerminal(h.tx, h.ref, h.snapshot(), {
      source: 'candidate', committedAt: '2026-10-05T12:01:00.000Z',
      outcome: { type: 'game-outcome', result: 'success', cause: 'candidate-complete',
        candidateCode: 'P', cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z' },
      candidate: { code: 'P', groups: [{ groupId: 'fleet-a', gmNote: 'loyalty chart and notes',
        requirements: [], rolls: [], losses: [], humanCalls: [] }] },
    } as never)).toThrow();
    expect(h.updates).toHaveLength(0);
  });

  it('closes only a committed debrief, preserves its frozen snapshot, and is idempotent', () => {
    const h = harness({ phase: 'active' });
    const committed = commitTerminal(h.tx, h.ref, h.snapshot(), {
      source: 'final-cycle', committedAt: '2026-10-05T12:01:00.000Z', survivorOutcome,
    });
    const beforeClose = h.current.debriefSnapshot;
    const firstClose = closeSessionInTransaction(h.tx, h.ref, h.snapshot());
    const replayClose = closeSessionInTransaction(h.tx, h.ref, h.snapshot());

    expect(committed.snapshot).toBe(beforeClose);
    expect(firstClose.closed).toBe(true);
    expect(replayClose.closed).toBe(false);
    expect(h.current.phase).toBe('closed');
    expect(h.current.debriefSnapshot).toEqual(beforeClose);
    expect(h.updates).toHaveLength(2);
  });
});

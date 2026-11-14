import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

/**
 * P630 / U1: every ordinary callable that samples dice, accuracy or combat
 * uncertainty on the server accepts only the player's choices. A client that
 * adds its own result to an otherwise well-formed command is refused before
 * any authoritative state is read or any server entropy is drawn, so a forged
 * outcome can never replace (or be replayed over) the committed server result.
 * Each action's own callable suite proves its committed result, denied actors
 * and exact replay; this table guards the shared "no client result" boundary.
 */

const entropy = vi.hoisted(() => ({
  randomInt: vi.fn(() => 1),
  randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000000'),
}));
const authority = vi.hoisted(() => {
  const state = { reads: 0 };
  class AuthorityReached extends Error {}
  // Any Firestore access means the request passed validation and reached the
  // server-owned authority checks. The sentinel stops the command there.
  const db: unknown = new Proxy({}, {
    get: () => () => {
      state.reads += 1;
      throw new AuthorityReached('reached server authority');
    },
  });
  return { state, db, AuthorityReached };
});

vi.mock('node:crypto', async (importOriginal) => ({ ...await importOriginal(), ...entropy }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => authority.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  onCall: (optionsOrHandler: unknown, maybeHandler?: (request: unknown) => unknown) =>
    ({ run: maybeHandler ?? optionsOrHandler }),
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_path: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));

import {
  applyWolfCommanderTargetRerolls,
  commitPdfFighterAceCombat,
  commitWolfBoardingSpecialChoice,
  commitWolfEscortRangeActionChoice,
  commitWolfRangeActionChoice,
  declareWolfAttack,
  investigateAsIntelligenceAgent,
  rerollHostedShipMaintenance,
  rerollVipUnrest,
  resolveWolfAttackAftermath,
  rollHummingbirdHarvest,
  runHighwallMining,
  runMaintenance,
  runSmallShipMaintenance,
  runVoyage33Maintenance,
  runWolfAgentDetectorTest,
} from './index';

type Payload = Record<string, unknown>;
type Callable = { run: (request: CallableRequest<Payload>) => Promise<unknown> | unknown };

/** Result-shaped keys a client might add to claim its own outcome. */
const forgedDice: readonly Payload[] = [
  { rolls: [6, 6] }, { roll: 6 }, { die: 6 }, { dice: [6] }, { result: 'success' }, { total: 12 },
];
const forgedAccuracy: readonly Payload[] = [
  { accuracyRoll: 1 }, { accurate: true }, { hit: true }, { hits: 3 }, { successes: 3 },
];
const forgedCombat: readonly Payload[] = [
  { targetDie: 1 }, { rerollDie: 1 }, { targeting: { rolls: [] } }, { damage: 0 }, { outcome: 'destroyed' },
];

const cases: ReadonlyArray<Readonly<{
  family: 'dice' | 'accuracy' | 'combat';
  name: string;
  callable: Callable;
  payload: Payload;
  forged: readonly Payload[];
}>> = [
  {
    family: 'dice', name: 'rollHummingbirdHarvest', callable: rollHummingbirdHarvest,
    payload: { sessionId: 's1', requestId: 'hummingbird-roll-1', expectedRevision: 0 },
    forged: forgedDice,
  },
  {
    family: 'dice', name: 'runHighwallMining', callable: runHighwallMining,
    payload: {
      sessionId: 's1', requestId: 'mine-1', resource: 'materials',
      expectedRevision: 0, expectedControlRevision: 2, expectedCycle: 2,
    },
    forged: forgedDice,
  },
  {
    family: 'dice', name: 'runMaintenance', callable: runMaintenance,
    payload: {
      sessionId: 's1', shipId: 'aegis', requestId: 'maintenance-1', instanceId: 'bridge',
      action: 'begin', expectedRevision: 0,
    },
    forged: forgedDice,
  },
  {
    family: 'dice', name: 'runSmallShipMaintenance', callable: runSmallShipMaintenance,
    payload: {
      sessionId: 's1', smallShipId: 'gorgoneion', instanceId: 'gm1',
      requestId: 'maint-1', action: 'begin', expectedRevision: 0,
    },
    forged: forgedDice,
  },
  {
    family: 'dice', name: 'runVoyage33Maintenance', callable: runVoyage33Maintenance,
    payload: {
      sessionId: 's1', shipId: 'voyage-33-0', instanceId: 'gm1', requestId: 'voyage-maint-1',
      action: 'begin', expectedRevision: 0, expectedDockingRevision: 0, expectedCycle: 1,
    },
    forged: forgedDice,
  },
  {
    family: 'dice', name: 'rerollHostedShipMaintenance', callable: rerollHostedShipMaintenance,
    payload: {
      sessionId: 's1', shipId: 'aegis', requestId: 'reroll-1', expectedCycle: 4,
      expectedGrantRevision: 1, expectedMaintenanceRevision: 1, dieIndex: 0, instanceId: 'gm-1',
    },
    forged: forgedDice,
  },
  {
    family: 'dice', name: 'rerollVipUnrest', callable: rerollVipUnrest,
    payload: {
      sessionId: 's1', shipId: 'dione', requestId: 'reroll-1',
      expectedRevision: 4, cardId: 'party-deck', dieIndex: 0,
    },
    forged: forgedDice,
  },
  {
    family: 'accuracy', name: 'investigateAsIntelligenceAgent', callable: investigateAsIntelligenceAgent,
    payload: { sessionId: 's1', requestId: 'investigate-1', expectedCycle: 2, targetUid: 'u3' },
    forged: forgedAccuracy,
  },
  {
    family: 'accuracy', name: 'runWolfAgentDetectorTest', callable: runWolfAgentDetectorTest,
    payload: {
      sessionId: 's1', requestId: 'detector-1', expectedCycle: 1, expectedRevision: 0, targetUid: 'u2',
    },
    forged: forgedAccuracy,
  },
  {
    family: 'accuracy', name: 'commitWolfRangeActionChoice', callable: commitWolfRangeActionChoice,
    payload: {
      sessionId: 's1', requestId: 'eo-medium-1', expectedTurn: 1, expectedRevision: 4,
      range: 'medium-range', actionIds: [],
    },
    forged: [...forgedAccuracy, ...forgedDice],
  },
  {
    family: 'accuracy', name: 'commitWolfEscortRangeActionChoice', callable: commitWolfEscortRangeActionChoice,
    payload: {
      sessionId: 's1', sourceId: 'pdf-escort-fighter-wing', range: 'medium-range',
      requestId: 'escort-medium-1', expectedTurn: 1, expectedRevision: 4,
      actions: [{ fighterIndex: 0, kind: 'attack', targetContactId: 'contact-1' }],
    },
    forged: [...forgedAccuracy, ...forgedDice],
  },
  {
    family: 'combat', name: 'declareWolfAttack', callable: declareWolfAttack,
    payload: { sessionId: 's1', instanceId: 'gm-1', requestId: 'wolf-declare-1', expectedRevision: 1 },
    forged: forgedCombat,
  },
  {
    family: 'combat', name: 'applyWolfCommanderTargetRerolls', callable: applyWolfCommanderTargetRerolls,
    payload: {
      sessionId: 's1', requestId: 'wolf-reroll-1', expectedTurn: 1, expectedRevision: 1,
      rosterIndexes: [2, 0],
    },
    forged: forgedCombat,
  },
  {
    family: 'combat', name: 'commitWolfBoardingSpecialChoice', callable: commitWolfBoardingSpecialChoice,
    payload: {
      sessionId: 's1', requestId: 'commander-board-1', expectedTurn: 1, expectedRevision: 10,
      choice: { kind: 'commander', targetShipId: 'aegis' },
    },
    forged: [...forgedCombat, ...forgedDice],
  },
  {
    family: 'combat', name: 'commitPdfFighterAceCombat', callable: commitPdfFighterAceCombat,
    payload: {
      sessionId: 's1', requestId: 'ace-action-1', attackId: 'attack-1', expectedRevision: 4,
      targetId: 'contact-11', range: 'medium', sourceId: 'fighter-wing-alpha', fighterIndex: 0,
      permissionRequestId: 'ace-permission-1', permissionRevision: 1,
    },
    forged: [...forgedCombat, ...forgedAccuracy],
  },
  {
    family: 'combat', name: 'resolveWolfAttackAftermath', callable: resolveWolfAttackAftermath,
    payload: {
      sessionId: 's-1', attackId: 'attack-7', requestId: 'doctor-order-7',
      action: 'doctor', selectedShipIds: ['aegis', 'dione'],
    },
    forged: [...forgedCombat, ...forgedDice],
  },
];

function request(data: Payload): CallableRequest<Payload> {
  return { data, auth: { uid: 'u1' } } as CallableRequest<Payload>;
}

async function rejection(callable: Callable, data: Payload): Promise<unknown> {
  try {
    await callable.run(request(data));
  } catch (error) {
    return error;
  }
  throw new Error('expected the command to stop');
}

beforeEach(() => {
  authority.state.reads = 0;
  entropy.randomInt.mockClear();
});

describe.each(cases)('$family: $name', ({ callable, payload, forged }) => {
  it('accepts the well-formed choice as far as server authority', async () => {
    const error = await rejection(callable, payload);
    expect(error).toBeInstanceOf(authority.AuthorityReached);
    expect(authority.state.reads).toBeGreaterThan(0);
  });

  it.each(forged)('refuses a client-supplied result %o before reading state or drawing', async (extra) => {
    const error = await rejection(callable, { ...payload, ...extra });
    expect(error).toMatchObject({ code: 'invalid-argument' });
    expect(authority.state.reads).toBe(0);
    expect(entropy.randomInt).not.toHaveBeenCalled();
  });
});

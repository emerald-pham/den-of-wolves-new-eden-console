import { FieldValue, Timestamp, getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { auditedOnCall } from './securityCallable';
import { boundCoreConsoleRole } from './consoleRolePolicy';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import { commandError } from './commandErrors';
import { requireCandidateCraftActionAvailable } from './candidateAvailability';
import { FIGHTER_WING_IDS, fighterWingCapacity, fighterWingCounts, type FighterWingId } from './fighterWings';
import { isPresenceStale } from './sessionLifecycle';
import { turnPhaseDeadlinePassed, turnPhaseState } from './turnZero';
import { requirePursuitEmergencyWindowAbsent } from './pursuitEmergencyWindow';
import { ROLE_IDS, recommendedRoleIds } from './roleConfiguration';
import { replacementAuthorityAllowsRole } from './replacementRoles';

type Fields = Record<string, unknown>;
type ExchangeResult = Readonly<{
  status: 'committed' | 'replayed';
  sessionId: string;
  requestId: string;
  sourceWingId: FighterWingId;
  amount: number;
  turn: number;
  capacity: 4 | 6;
  counts: Readonly<Record<FighterWingId, Readonly<{ count: number; revision: number }>>>;
}>;

function record(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function id(value: unknown): value is string {
  return typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
}

function activePlayer(player: DocumentSnapshot, now: number): boolean {
  if (!player.exists || player.get('role') !== 'player' || player.get('connected') !== true ||
      player.get('kickedAt') != null || player.get('escapeState') != null ||
      player.get('replacementStatus') != null || player.get('candidateDisposition') != null) return false;
  const seen = player.get('lastSeenAt');
  if (seen === undefined) return true;
  return seen instanceof Timestamp && !isPresenceStale(seen.toDate(), new Date(now));
}

function activeRoles(session: DocumentSnapshot): readonly string[] | null {
  const stored = session.get('activeRoleIds');
  if (stored !== undefined && (!Array.isArray(stored) || stored.some((value) =>
    typeof value !== 'string' || !ROLE_IDS.includes(value as typeof ROLE_IDS[number])))) return null;
  const playerCount = session.get('playerCount');
  const fallback = Number.isSafeInteger(playerCount) && (playerCount as number) >= 8 &&
    (playerCount as number) <= 20 ? playerCount as number : 18;
  const configured = Array.isArray(stored) ? ROLE_IDS.filter((roleId) => stored.includes(roleId))
    : recommendedRoleIds(fallback);
  return configured.filter((roleId) => roleId !== 'press-officer');
}

function validResult(value: unknown, sessionId: string, requestId: string): value is ExchangeResult {
  if (!record(value) || (value.status !== 'committed' && value.status !== 'replayed') ||
      value.sessionId !== sessionId || value.requestId !== requestId ||
      !(FIGHTER_WING_IDS as readonly unknown[]).includes(value.sourceWingId) ||
      !Number.isSafeInteger(value.amount) || (value.amount as number) < 1 ||
      !Number.isSafeInteger(value.turn) || (value.turn as number) < 1 ||
      (value.capacity !== 4 && value.capacity !== 6) || !record(value.counts)) return false;
  return FIGHTER_WING_IDS.every((wingId) => {
    const count = value.counts[wingId];
    return record(count) && Number.isSafeInteger(count.count) && (count.count as number) >= 0 &&
      Number.isSafeInteger(count.revision) && (count.revision as number) >= 1;
  });
}

/** Transfer surviving fighters between Alpha and Bravo in one Team transaction. */
export const exchangeAegisFighterWings = auditedOnCall<{
  sessionId?: unknown;
  requestId?: unknown;
  sourceWingId?: unknown;
  amount?: unknown;
  expectedTurn?: unknown;
  expectedAlphaRevision?: unknown;
  expectedBravoRevision?: unknown;
}>('exchangeAegisFighterWings', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in before exchanging Fighter Wing strength.');
  const raw = request.data;
  const allowed = new Set([
    'sessionId', 'requestId', 'sourceWingId', 'amount', 'expectedTurn',
    'expectedAlphaRevision', 'expectedBravoRevision',
  ]);
  if (!record(raw) || Object.keys(raw).length !== allowed.size ||
      Object.keys(raw).some((key) => !allowed.has(key)) || !id(raw.sessionId) || !id(raw.requestId) ||
      !(FIGHTER_WING_IDS as readonly unknown[]).includes(raw.sourceWingId) ||
      !Number.isSafeInteger(raw.amount) || (raw.amount as number) < 1 || (raw.amount as number) > 6 ||
      !Number.isSafeInteger(raw.expectedTurn) || (raw.expectedTurn as number) < 1 ||
      !Number.isSafeInteger(raw.expectedAlphaRevision) || (raw.expectedAlphaRevision as number) < 0 ||
      !Number.isSafeInteger(raw.expectedBravoRevision) || (raw.expectedBravoRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'Invalid Fighter Wing exchange request.');
  }
  const sessionId = raw.sessionId as string;
  const requestId = raw.requestId as string;
  const sourceWingId = raw.sourceWingId as FighterWingId;
  const amount = raw.amount as number;
  const expectedTurn = raw.expectedTurn as number;
  const expectedAlphaRevision = raw.expectedAlphaRevision as number;
  const expectedBravoRevision = raw.expectedBravoRevision as number;
  const fingerprint: CommandFingerprint = {
    action: 'fighter-wing-exchange', sessionId, requestId, actorUid: uid,
    instanceId: null, expectedRevision: null,
    payload: { sourceWingId, amount, expectedTurn, expectedAlphaRevision, expectedBravoRevision },
  };
  const db = getFirestore();
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const actorRef = db.doc(`sessions/${sessionId}/players/${uid}`);
  const receiptRef = db.doc(`sessions/${sessionId}/commandReceipts/${requestId}`);

  return db.runTransaction(async (tx) => {
    const [session, actor, receipt] = await Promise.all([
      tx.get(sessionRef), tx.get(actorRef), tx.get(receiptRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (receipt.exists) {
      const disposition = commandReceiptDisposition(receipt.get('fingerprint'), fingerprint);
      if (disposition.kind === 'foreign-actor') {
        throw new HttpsError('permission-denied', 'This Fighter Wing exchange belongs to a different player.');
      }
      if (disposition.kind === 'collision') {
        throw commandError('failed-precondition', 'This Fighter Wing exchange request id is bound to another command.', 'conflict');
      }
      const prior = receipt.get('result');
      if (!validResult(prior, sessionId, requestId)) {
        throw commandError('failed-precondition', 'This Fighter Wing exchange has no replayable result.', 'conflict');
      }
      return { ...prior, status: 'replayed' as const };
    }

    const now = Date.now();
    if (!activePlayer(actor, now) || actor.id !== uid ||
        actor.get('activeConsoleRoleId') !== 'wing-commander' ||
        boundCoreConsoleRole(actor.get('assignedRoleId'), actor.get('seatId')) !== 'wing-commander' ||
        !replacementAuthorityAllowsRole(actor.get('replacementRoleId'), 'wing-commander', actor.get('replacementStatus'))) {
      throw new HttpsError('permission-denied', 'Only the active AEGIS Wing Commander may exchange fighters.');
    }
    requirePursuitEmergencyWindowAbsent(session);
    requireCandidateCraftActionAvailable(session, [...FIGHTER_WING_IDS], ['aegis']);
    if (session.get('phase') !== 'active') {
      throw commandError('failed-precondition', 'Fighter Wing exchange is available only during active gameplay.', 'invalid-phase');
    }
    const roles = activeRoles(session);
    const activeVessels = session.get('activeVesselIds');
    if (!roles || !roles.includes('wing-commander') || !Array.isArray(activeVessels) ||
        !activeVessels.includes('aegis')) {
      throw commandError('failed-precondition', 'The active AEGIS Wing Commander authority is unavailable.', 'conflict');
    }
    const currentTurn = session.get('currentTurn');
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!Number.isSafeInteger(currentTurn) || (currentTurn as number) < 1 || !phase ||
        phase.turn !== currentTurn || phase.airspace.state !== 'restricted' ||
        turnPhaseDeadlinePassed(phase, 'team', now) || expectedTurn !== currentTurn) {
      throw commandError('failed-precondition', 'Fighter Wing exchange is available only during the current Team Phase.', 'invalid-phase');
    }
    const parsed = fighterWingCounts(session.get('fighterWingCounts'));
    const alpha = parsed['fighter-wing-alpha'];
    const bravo = parsed['fighter-wing-bravo'];
    if (!alpha || !bravo) {
      throw commandError('failed-precondition', 'The current surviving Fighter Wing counts are unavailable.', 'conflict');
    }
    if (alpha.revision !== expectedAlphaRevision || bravo.revision !== expectedBravoRevision) {
      throw commandError('failed-precondition', 'The Fighter Wing counts changed. Refresh before exchanging fighters.', 'conflict');
    }
    const capacity = fighterWingCapacity(session.get('shipUpgrades'));
    const source = sourceWingId === 'fighter-wing-alpha' ? alpha : bravo;
    const target = sourceWingId === 'fighter-wing-alpha' ? bravo : alpha;
    if (amount > source.count) {
      throw commandError('failed-precondition', 'The selected Wing no longer has that many surviving fighters.', 'conflict');
    }
    if (target.count + amount > capacity) {
      throw commandError('failed-precondition', `That exchange exceeds the current ${capacity}-fighter wing capacity.`, 'conflict');
    }
    const nextAlpha = {
      count: alpha.count + (sourceWingId === 'fighter-wing-bravo' ? amount : -amount),
      revision: alpha.revision + 1,
    };
    const nextBravo = {
      count: bravo.count + (sourceWingId === 'fighter-wing-alpha' ? amount : -amount),
      revision: bravo.revision + 1,
    };
    const result: ExchangeResult = {
      status: 'committed', sessionId, requestId, sourceWingId, amount,
      turn: currentTurn as number, capacity,
      counts: { 'fighter-wing-alpha': nextAlpha, 'fighter-wing-bravo': nextBravo },
    };
    tx.update(sessionRef, {
      'fighterWingCounts.fighter-wing-alpha': nextAlpha,
      'fighterWingCounts.fighter-wing-bravo': nextBravo,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

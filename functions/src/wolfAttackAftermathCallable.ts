import { randomInt } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { isExtraShipAdmitted } from './extraShipAdmission';
import { fleetGroupRecord } from './fleetGroups';
import {
  resolveDoctorMedicalAid,
  resolveWarriorSalvage,
  wolfDamageScrapOpportunities,
} from './wolfAttackAftermath';
import { projectWolfAttackMemberView } from './wolfAttackAudience';
import { isWolfCalculationReceipt } from './wolfCombatMath';
import { isResourceShipId, type ResourceId } from './resources';
import { parseShuttleControl } from './shuttleControl';
import { shuttleDockingsAreParked, shuttleHostIsAllowed } from './craftOwnership';
import { parseSmallShipState, isSmallShipInMutiny } from './smallShip';
import { SHUTTLE_CARGO_TYPES } from './shuttleCargoTransfer';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
import { isPresenceStale } from './sessionLifecycle';

type RecordValue = Record<string, unknown>;
type WolfAttackAftermathAction = 'doctor' | 'warrior-salvage' | 'collect-scrap';

export type WolfAttackAftermathCommand = Readonly<{
  sessionId: string;
  attackId: string;
  requestId: string;
  action: WolfAttackAftermathAction;
  selectedShipIds?: readonly string[];
  shuttleId?: 'macaw' | 'boa';
  targetShipId?: string;
}>;

function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fingerprintValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => fingerprintValuesEqual(value, right[index]));
  }
  if (!record(left) || !record(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && fingerprintValuesEqual(left[key], right[key]));
}

function canonicalId(value: unknown, max = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && /^[\w-]+$/.test(value);
}

/** Exact command allowlist: results, dice, targets outside the printed choice, and extras are never accepted. */
export function parseWolfAttackAftermathCommand(value: unknown): WolfAttackAftermathCommand | null {
  if (!record(value) || !canonicalId(value.sessionId) || !canonicalId(value.attackId, 160) ||
      !canonicalId(value.requestId) || typeof value.action !== 'string') return null;
  const common = ['sessionId', 'attackId', 'requestId', 'action'];
  if (value.action === 'doctor') {
    if (Object.keys(value).length !== common.length + 1 ||
        !Object.hasOwn(value, 'selectedShipIds') || !Array.isArray(value.selectedShipIds) ||
        value.selectedShipIds.length < 1 || value.selectedShipIds.length > 8 ||
        value.selectedShipIds.some((id) => typeof id !== 'string' || !isResourceShipId(id)) ||
        new Set(value.selectedShipIds).size !== value.selectedShipIds.length) return null;
    return { sessionId: value.sessionId, attackId: value.attackId, requestId: value.requestId,
      action: 'doctor', selectedShipIds: [...value.selectedShipIds] as string[] };
  }
  if (value.action === 'warrior-salvage') {
    if (Object.keys(value).length !== common.length) return null;
    return { sessionId: value.sessionId, attackId: value.attackId, requestId: value.requestId,
      action: 'warrior-salvage' };
  }
  if (value.action === 'collect-scrap') {
    if (Object.keys(value).length !== common.length + 2 ||
        (value.shuttleId !== 'macaw' && value.shuttleId !== 'boa') ||
        !canonicalId(value.targetShipId) || !isResourceShipId(value.targetShipId)) return null;
    return { sessionId: value.sessionId, attackId: value.attackId, requestId: value.requestId,
      action: 'collect-scrap', shuttleId: value.shuttleId, targetShipId: value.targetShipId };
  }
  return null;
}

function requireUid(auth: { uid?: string } | undefined): string {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in before recording attack aftermath.');
  return auth.uid;
}

function connectedPlayer(actor: DocumentSnapshot): boolean {
  if (!actor.exists || actor.get('role') !== 'player' || actor.get('connected') !== true ||
      actor.get('kickedAt') != null || actor.get('escapeState') != null || actor.get('replacementStatus') != null) return false;
  const lastSeenAt = actor.get('lastSeenAt');
  return lastSeenAt === undefined || lastSeenAt instanceof Timestamp && !isPresenceStale(lastSeenAt.toDate(), new Date());
}

function currentRole(actor: DocumentSnapshot, uid: string, roleId: string): void {
  if (actor.id !== uid || !connectedPlayer(actor) || actor.get('replacementRoleId') !== roleId ||
      actor.get('activeConsoleRoleId') !== null || actor.get('seatId') !== null) {
    throw new HttpsError('permission-denied', `Only the current ${roleId} may record this aftermath action.`);
  }
}

function currentAftermathActor(actor: DocumentSnapshot, uid: string, command: WolfAttackAftermathCommand,
  session: RecordValue): void {
  if (command.action === 'doctor') {
    currentRole(actor, uid, 'doctor');
    return;
  }
  if (command.action === 'warrior-salvage') {
    currentRole(actor, uid, 'warrior-captain');
    return;
  }
  if (!connectedPlayer(actor)) {
    throw new HttpsError('permission-denied', 'A connected shuttle operator is required.');
  }
  const shuttleId = command.shuttleId!;
  const roleId = shuttleId === 'macaw' ? 'capybara-captain' : 'capybara-recycler';
  if (actor.get('assignedRoleId') !== roleId ||
      shuttleId === 'macaw' && actor.get('activeConsoleRoleId') !== roleId) {
    throw new HttpsError('permission-denied', `Only the current ${shuttleId === 'macaw' ? 'Macaw holder' : 'Boa Recycler'} may collect Scrap.`);
  }
  const control = parseShuttleControl(session.shuttleControl)?.[shuttleId];
  if (!control || control.holderUid !== uid || control.ownerRoleId !== roleId) {
    throw new HttpsError('permission-denied', `Only the current ${shuttleId === 'macaw' ? 'Macaw holder' : 'Boa Recycler'} may collect Scrap.`);
  }
}

function safeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function boundFingerprint(command: WolfAttackAftermathCommand, actorUid: string): RecordValue {
  return {
    action: `wolf-attack-aftermath:${command.action}`,
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid,
    attackId: command.attackId,
    payload: command.action === 'doctor'
      ? { selectedShipIds: command.selectedShipIds }
      : command.action === 'collect-scrap'
        ? { shuttleId: command.shuttleId, targetShipId: command.targetShipId }
        : {},
  };
}

function replayResult(snapshot: DocumentSnapshot, fingerprint: RecordValue): RecordValue | undefined {
  if (!snapshot.exists) return undefined;
  const prior = snapshot.get('fingerprint');
  if (!record(prior)) throw new HttpsError('failed-precondition', 'This request id is already bound to another action.');
  if (prior.actorUid !== fingerprint.actorUid) {
    throw new HttpsError('permission-denied', 'This request id belongs to a different player.');
  }
  if (!fingerprintValuesEqual(prior, fingerprint)) {
    throw new HttpsError('failed-precondition', 'This aftermath request id is bound to a different choice.');
  }
  const result = snapshot.get('result');
  if (!record(result) || result.status !== 'committed') {
    throw new HttpsError('failed-precondition', 'This aftermath request has no replayable result.');
  }
  return { ...result, status: 'replayed' };
}

function actionState(value: unknown): RecordValue {
  if (value === undefined) return {};
  if (!record(value)) throw new HttpsError('failed-precondition', 'The private aftermath ledger is malformed.');
  return { ...value };
}

function damageResults(receipt: RecordValue): Array<{
  target: string; amount: number; draws: Array<{ casualty: boolean }>;
  population: number; state: { damagedSystemIds: string[]; destroyed: boolean };
}> {
  if (!Array.isArray(receipt.fleetDamage)) throw new HttpsError('failed-precondition', 'The combat damage receipt is unavailable.');
  return receipt.fleetDamage.map((raw) => {
    const target = record(raw) ? raw.target : undefined;
    if (!record(raw) || typeof target !== 'string' || !isResourceShipId(target) || !safeCounter(raw.amount) ||
        !safeCounter(raw.population) || !safeCounter(raw.populationBefore) || !record(raw.state) ||
        typeof raw.state.destroyed !== 'boolean' || !Array.isArray(raw.state.damagedSystemIds) ||
        !Array.isArray(raw.draws) || raw.draws.some((draw) => !record(draw) || typeof draw.casualty !== 'boolean')) {
      throw new HttpsError('failed-precondition', 'The combat damage receipt is malformed.');
    }
    return { target, amount: raw.amount, population: raw.population,
      draws: raw.draws.map((draw) => ({ casualty: (draw as RecordValue).casualty as boolean })),
      state: { destroyed: raw.state.destroyed,
        damagedSystemIds: raw.state.damagedSystemIds as string[] } };
  });
}

function safeCargo(value: unknown, shuttleId: 'macaw' | 'boa'): RecordValue {
  if (value === undefined) return { scrap: 0 };
  if (!record(value)) throw new HttpsError('failed-precondition', 'The shuttle cargo ledger is malformed.');
  const allowed = SHUTTLE_CARGO_TYPES[shuttleId] as readonly ResourceId[];
  if (Object.keys(value).some((key) => !allowed.includes(key as ResourceId)) ||
      Object.values(value).some((amount) => !safeCounter(amount))) {
    throw new HttpsError('failed-precondition', 'The shuttle cargo ledger is malformed.');
  }
  return { ...value, scrap: (value.scrap as number | undefined) ?? 0 };
}

function currentView(sessionId: string, state: RecordValue, serverTime: string): RecordValue {
  try {
    return projectWolfAttackMemberView({ sessionId, state, serverTime }) as unknown as RecordValue;
  } catch {
    throw new HttpsError('failed-precondition', 'The member-safe attack result cannot be projected.');
  }
}

export const resolveWolfAttackAftermath = onCall<{
  sessionId?: unknown; attackId?: unknown; requestId?: unknown; action?: unknown;
  selectedShipIds?: unknown; shuttleId?: unknown; targetShipId?: unknown;
}>(CALLABLE_RUNTIME_OPTIONS, async (request) => {
  const uid = requireUid(request.auth);
  const command = parseWolfAttackAftermathCommand(request.data);
  if (!command) throw new HttpsError('invalid-argument', 'Invalid Wolf attack aftermath choice.');

  const db = getFirestore();
  const sessionRef = db.doc(`sessions/${command.sessionId}`);
  const actorRef = db.doc(`sessions/${command.sessionId}/players/${uid}`);
  const stateRef = db.doc(`sessions/${command.sessionId}/wolfAttackState/current`);
  const receiptRef = db.doc(`sessions/${command.sessionId}/commandReceipts/${command.requestId}`);
  const audienceRef = db.doc(`sessions/${command.sessionId}/wolfAttackAudience/current`);
  const fingerprint = boundFingerprint(command, uid);

  return db.runTransaction(async (tx) => {
    const [session, actor, attack, receiptDoc] = await Promise.all([
      tx.get(sessionRef), tx.get(actorRef), tx.get(stateRef), tx.get(receiptRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const sessionData = session.data() ?? {};
    currentAftermathActor(actor, uid, command, sessionData);
    if (session.get('phase') !== 'active' || !attack.exists || attack.get('status') !== 'resolved' ||
        attack.get('attackId') !== command.attackId || !Number.isSafeInteger(attack.get('turn')) ||
        attack.get('turn') !== session.get('currentTurn')) {
      throw new HttpsError('failed-precondition', 'This aftermath belongs to a stale or unresolved attack.');
    }
    const replay = replayResult(receiptDoc, fingerprint);
    if (replay) return replay;
    const receipt = attack.get('calculationReceipt');
    if (!isWolfCalculationReceipt(receipt)) throw new HttpsError('failed-precondition', 'The private combat receipt is unavailable.');
    const damage = damageResults(receipt as unknown as RecordValue);
    const turn = attack.get('turn') as number;
    const now = new Date().toISOString();
    const stateData = attack.data() ?? {};
    const privateAftermath = actionState(attack.get('aftermath'));
    const memberResults = Array.isArray(attack.get('memberResults'))
      ? [...attack.get('memberResults') as unknown[]] : [];
    const sessionPatch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    let publicResults: RecordValue[] = [];
    let privateResult: RecordValue;
    let actorRoleId = command.action === 'doctor' ? 'doctor'
      : command.action === 'warrior-salvage' ? 'warrior-captain'
        : command.shuttleId === 'macaw' ? 'capybara-captain' : 'capybara-recycler';

    if (command.action === 'doctor') {
      if (privateAftermath.doctor !== undefined) {
        throw new HttpsError('failed-precondition', 'Doctor Medical Aid was already committed for this attack.');
      }
      const selected = command.selectedShipIds ?? [];
      const populations = record(sessionData.shipSurvivors) ? sessionData.shipSurvivors : {};
      const rawResources = record(sessionData.shipResources) ? sessionData.shipResources : {};
      const populationBeforeByTarget: Record<string, number> = Object.fromEntries(damage.map(({ target }) => {
        const item = (receipt as unknown as RecordValue).fleetDamage as RecordValue[];
        const source = item.find((entry) => entry.target === target)!;
        return [target, source.populationBefore as number];
      }));
      const resourcesByTarget: Record<string, { food: number; water: number }> = {};
      selected.forEach((shipId) => {
        const stored = rawResources[shipId];
        if (!record(stored) || !safeCounter(stored.food) || !safeCounter(stored.water)) {
          throw new HttpsError('failed-precondition', `The ${shipId} food and water stores are unavailable.`);
        }
        resourcesByTarget[shipId] = { food: stored.food, water: stored.water };
      });
      for (const target of damage) {
        if (selected.includes(target.target) && populations[target.target] !== target.population) {
          throw new HttpsError('failed-precondition', `${target.target} survivors changed after this attack.`);
        }
      }
      let result: ReturnType<typeof resolveDoctorMedicalAid>;
      try {
        result = resolveDoctorMedicalAid({ shipResults: damage, populationBeforeByTarget,
          resourcesByTarget, selectedShipIds: selected });
      } catch (cause) {
        throw new HttpsError('failed-precondition', cause instanceof Error ? cause.message : 'Doctor Medical Aid was rejected.');
      }
      for (const shipId of selected) {
        const newPopulation = result.populationByTarget[shipId];
        sessionPatch[`shipSurvivors.${shipId}`] = newPopulation;
        const resources = result.resourcesByTarget[shipId];
        if (resources) {
          sessionPatch[`shipResources.${shipId}.food`] = resources.food;
          sessionPatch[`shipResources.${shipId}.water`] = resources.water;
        }
      }
      publicResults = result.mitigated.map((entry) => ({
        status: 'committed', range: 'boarding', sourceId: 'doctor-medical-aid',
        targetId: entry.shipId, bearing: null, contactReference: `${entry.shipId} medical-aid result`,
        effect: `Doctor Medical Aid prevents ${entry.casualtiesPrevented} population casualty${entry.casualtiesPrevented === 1 ? '' : 'ies'}`,
        outcome: { casualtiesPrevented: entry.casualtiesPrevented,
          foodSpent: entry.foodSpent, waterSpent: entry.waterSpent }, serverTime: now,
      }));
      privateResult = { action: command.action, actorUid: uid, actorRoleId, turn,
        selectedShipIds: [...selected], mitigated: result.mitigated, committedAt: now };
      privateAftermath.doctor = privateResult;
    } else if (command.action === 'warrior-salvage') {
      if (privateAftermath.warriorSalvage !== undefined) {
        throw new HttpsError('failed-precondition', 'Warrior Salvage Drones were already resolved for this attack.');
      }
      const activeVesselIds = sessionData.activeVesselIds;
      const smallShipStates = sessionData.smallShipStates;
      const smallShip = record(smallShipStates) ? parseSmallShipState(smallShipStates.warrior, 'warrior') : undefined;
      if (!Array.isArray(activeVesselIds) || activeVesselIds.some((id) => typeof id !== 'string' || !isResourceShipId(id)) ||
          !isExtraShipAdmitted({ smallShipId: 'warrior', activeVesselIds,
            smallShipStates: smallShipStates ?? {}, expansion: sessionData.expansion ?? 'base',
            capybaraEnabled: sessionData.capybaraEnabled }) || !smallShip ||
          smallShip.hostShipId === null || !activeVesselIds.includes(smallShip.hostShipId) ||
          smallShip.cycle.turn !== turn || !smallShip.cycle.charges.includes('salvage-drones') ||
          isSmallShipInMutiny(smallShip)) {
        throw new HttpsError('failed-precondition', 'Warrior must be admitted, charged for Salvage Drones, and free of mutiny.');
      }
      const rangeReceipts = (receipt as unknown as RecordValue).ranges as RecordValue[];
      if (!Array.isArray(rangeReceipts) || rangeReceipts.some((range) => !record(range) || !record(range.damageByInstance))) {
        throw new HttpsError('failed-precondition', 'The private range damage receipts are malformed.');
      }
      let result: ReturnType<typeof resolveWarriorSalvage>;
      try {
        result = resolveWarriorSalvage({
          ranges: rangeReceipts.map((range) => {
            const values = range.damageByInstance as RecordValue;
            if (Object.values(values).some((amount) => !safeCounter(amount))) {
              throw new HttpsError('failed-precondition', 'The private range damage receipts are malformed.');
            }
            return { damageByInstance: values as unknown as Record<string, number> };
          }),
          fleetDamage: damage.map(({ target, amount }) => ({ target, amount })),
          memberResults: memberResults.filter(record).map((row) => ({
            sourceId: String(row.sourceId), outcome: record(row.outcome) ? row.outcome : {},
          })),
          randomInt: (upperBound) => randomInt(upperBound),
        });
      } catch (cause) {
        throw new HttpsError('failed-precondition', cause instanceof Error ? cause.message : 'Warrior Salvage Drones were rejected.');
      }
      const hostResources = sessionData.shipResources;
      const host = record(hostResources) ? hostResources[smallShip.hostShipId] : undefined;
      if (!record(host) || !safeCounter(host.materials) || result.materialsGained > Number.MAX_SAFE_INTEGER - host.materials) {
        throw new HttpsError('failed-precondition', 'The docked host material ledger is unavailable.');
      }
      sessionPatch[`shipResources.${smallShip.hostShipId}.materials`] = host.materials + result.materialsGained;
      publicResults = [{ status: 'committed', range: 'boarding', sourceId: 'warrior-salvage-drones',
        targetId: smallShip.hostShipId, bearing: null, contactReference: `${smallShip.hostShipId} materials`,
        effect: 'Warrior salvage recovered materials from the committed attack damage',
        outcome: { materialsGained: result.materialsGained }, serverTime: now }];
      privateResult = { action: command.action, actorUid: uid, actorRoleId, turn,
        hostShipId: smallShip.hostShipId, damageDice: result.damageDice,
        materialsGained: result.materialsGained, committedAt: now };
      privateAftermath.warriorSalvage = privateResult;
    } else {
      const shuttleId = command.shuttleId!;
      const targetShipId = command.targetShipId!;
      const actorExpectedRole = shuttleId === 'macaw' ? 'capybara-captain' : 'capybara-recycler';
      actorRoleId = actorExpectedRole;
      if (shuttleId === 'macaw') {
        if (actor.get('activeConsoleRoleId') !== actorExpectedRole || actor.get('assignedRoleId') !== actorExpectedRole) {
          throw new HttpsError('permission-denied', 'Only the current Macaw holder may collect Scrap.');
        }
      } else if (actor.get('assignedRoleId') !== actorExpectedRole) {
        throw new HttpsError('permission-denied', 'Only the current Boa Recycler may collect Scrap.');
      }
      if (sessionData.phase !== 'active' || sessionData.capybaraEnabled === false) {
        throw new HttpsError('failed-precondition', 'The Capybara Scrap authority is unavailable.');
      }
      const activeVesselIds = sessionData.activeVesselIds;
      const rawDockings = sessionData.shuttleDockings;
      const controls = parseShuttleControl(sessionData.shuttleControl);
      const control = controls?.[shuttleId];
      if (!Array.isArray(activeVesselIds) || !activeVesselIds.includes('capybara') ||
          !activeVesselIds.includes(targetShipId) ||
          activeVesselIds.some((id) => typeof id !== 'string' || !isResourceShipId(id)) ||
          !Array.isArray(rawDockings) || !shuttleDockingsAreParked(rawDockings as never, activeVesselIds) ||
          !shuttleHostIsAllowed(shuttleId, targetShipId) ||
          !control || control.holderUid !== uid || control.ownerRoleId !== actorExpectedRole) {
        throw new HttpsError('failed-precondition', 'The authoritative Capybara shuttle and fleet state is unavailable.');
      }
      const groupId = actor.get('fleetGroupId');
      if (typeof groupId !== 'string' || groupId.length < 1) {
        throw new HttpsError('permission-denied', 'This shuttle holder has no current fleet group.');
      }
      const groupSnapshot = await tx.get(db.doc(`sessions/${command.sessionId}/fleetGroups/${groupId}`));
      const group = groupSnapshot.exists ? fleetGroupRecord(groupSnapshot.data()) : undefined;
      if (!group || group.id !== groupId || !group.memberUids.includes(uid) || !group.vesselIds.includes(targetShipId)) {
        throw new HttpsError('permission-denied', 'The selected ship is outside this shuttle holder’s fleet group.');
      }
      const dockingRows = rawDockings.filter((row) => record(row) && row.shuttleId === shuttleId);
      if (dockingRows.length !== 1 || dockingRows[0]?.shipId !== targetShipId) {
        throw new HttpsError('failed-precondition', `${shuttleId === 'macaw' ? 'Macaw' : 'Boa'} must be docked uniquely at the Scrap target.`);
      }
      const targetDamage = damage.find((row) => row.target === targetShipId);
      if (!targetDamage || targetDamage.amount < 3 || targetDamage.state.destroyed) {
        throw new HttpsError('failed-precondition', 'That ship has no collectable Scrap opportunity from this attack.');
      }
      const opportunities = wolfDamageScrapOpportunities(command.attackId,
        damage.map(({ target, amount, draws }) => ({ target, amount, draws })));
      if (!opportunities.some((row) => row.shipId === targetShipId)) {
        throw new HttpsError('failed-precondition', 'That ship has no collectable Scrap opportunity from this attack.');
      }
      const claims = record(privateAftermath.scrapClaims) ? { ...privateAftermath.scrapClaims } : {};
      if (claims[targetShipId] !== undefined) {
        throw new HttpsError('failed-precondition', 'This attack’s Scrap opportunity has already been collected.');
      }
      const cargoRoot = record(sessionData.shuttleCargo) ? { ...sessionData.shuttleCargo } : {};
      const cargo = safeCargo(cargoRoot[shuttleId], shuttleId);
      if (!safeCounter(cargo.scrap) || cargo.scrap >= Number.MAX_SAFE_INTEGER) {
        throw new HttpsError('failed-precondition', 'The shuttle cannot safely hold another Scrap.');
      }
      cargoRoot[shuttleId] = { ...cargo, scrap: cargo.scrap + 1 };
      sessionPatch.shuttleCargo = cargoRoot;
      const claim = { shuttleId, actorUid: uid, actorRoleId, requestId: command.requestId, scrap: 1, committedAt: now };
      claims[targetShipId] = claim;
      privateAftermath.scrapClaims = claims;
      publicResults = [{ status: 'committed', range: 'boarding', sourceId: `capybara-scrap-collection-${shuttleId}`,
        targetId: targetShipId, bearing: null, contactReference: `${targetShipId} Scrap opportunity`,
        effect: `${shuttleId === 'macaw' ? 'Macaw' : 'Boa'} collected one Scrap from the attack aftermath`,
        outcome: { scrapGained: 1 }, serverTime: now }];
      privateResult = { action: command.action, actorUid: uid, actorRoleId, turn,
        targetShipId, shuttleId, scrapGained: 1, committedAt: now };
    }

    const nextRevision = (attack.get('revision') as number) + 1;
    if (!Number.isSafeInteger(nextRevision) || nextRevision < 2) {
      throw new HttpsError('failed-precondition', 'The attack result revision is invalid.');
    }
    const nextState: RecordValue = {
      ...stateData,
      revision: nextRevision,
      memberResults: [...memberResults, ...publicResults],
      aftermath: privateAftermath,
      updatedAt: FieldValue.serverTimestamp(),
    };
    const publicView = currentView(command.sessionId, nextState, now);
    const reply = command.action === 'warrior-salvage'
      ? { status: 'committed', sessionId: command.sessionId, attackId: command.attackId,
        action: command.action,
        requestId: command.requestId, materialsGained: privateResult.materialsGained,
        damageDice: privateResult.damageDice }
      : { status: 'committed', sessionId: command.sessionId, attackId: command.attackId,
        requestId: command.requestId, action: command.action,
        ...(command.action === 'doctor' ? { mitigated: privateResult.mitigated } :
          { targetShipId: privateResult.targetShipId, shuttleId: privateResult.shuttleId, scrapGained: 1 }) };

    tx.update(sessionRef, sessionPatch);
    tx.update(stateRef, nextState);
    tx.set(audienceRef, publicView);
    tx.set(receiptRef, { fingerprint, actorRoleId, result: reply, createdAt: FieldValue.serverTimestamp() });
    return reply;
  });
});

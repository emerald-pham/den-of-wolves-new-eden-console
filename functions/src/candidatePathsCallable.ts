import { writePlayerRemovalAlert } from './playerRemovalAlert';
import type { CandidateDebriefPathStep } from './sessionDebrief';
import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { randomInt } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { HttpsError } from 'firebase-functions/v2/https';
import { candidateWorkspace, parseCandidateAction, parseCandidateState, resolveCandidateAction,
  isCandidateEdition, type CandidateAction, type CandidateActionReply, type CandidateAuthority, type CandidateCode,
  type CandidateEdition, type CandidateSiteState } from './candidatePaths';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import { fleetGroupRecord } from './fleetGroups';
import { shipForRole } from './crewAccess';
import { boundCoreConsoleRole } from './consoleRolePolicy';
import { parseShuttleControl } from './shuttleControl';
import { parseMaintenanceCycle, MAINTENANCE_RULES } from './maintenance';
import { shipDamage } from './shipDamage';
import { jumpFuelCost } from './jumpDrive';
import { serviceRechargeResourceState, serviceRechargeUpgradeState } from './serviceShuttleRecharge';
import { turnPhaseState } from './turnZero';
import { isLiveSetupGm } from './gameSetup';
import { isPresenceStale } from './sessionLifecycle';
import { organiserSitesForChart } from './starChartLookup';
import { parseCandidateStationLiberations } from './candidateStationLiberation';
import { writeStandardActionAudit } from './actionAudit';
import { CANDIDATE_ENGINEERING_SHUTTLES, parseCandidateCraftReservations,
  reserveCandidateEngineeringCraft } from './candidateAvailability';

type Fields = Record<string, unknown>;
type Request = { data: unknown; auth?: { uid: string } | null };
export interface CandidateTerminalInput {
  source: 'candidate'; outcome: Fields; committedAt: string; sessionPatch?: Fields;
  survivorOutcome?: unknown;
  candidate: { code: CandidateCode; groups: {
    groupId: string; requirements: { id: string; status: 'met' | 'unmet' }[];
    rolls: { id: string; result: 'success' | 'failure'; audience: 'members' | 'gm' }[];
    losses: { shipId: string; reason: string; audience: 'members' | 'gm' }[];
    humanCalls: { id: string; cycle: number; audience: 'members' | 'gm' }[];
    path: CandidateDebriefPathStep[];
  }[] };
}
/** Public-safe explanation copied only from the candidate transaction's committed site facts. */
export function candidateDebriefPath(site: CandidateSiteState): CandidateDebriefPathStep[] {
  const path: CandidateDebriefPathStep[] = [];
  if (site.code === 'N' && site.repairedAt) path.push({ action: 'ring-repair', result: 'completed', audience: 'members' });
  if (site.code === 'P' && site.liberatedSourceId) path.push({ action: 'station-liberation', result: 'completed', audience: 'members' });
  for (const [shipId, receipt] of Object.entries(site.ships)) {
    if (site.code === 'N' && receipt.outcome === 'crossed') path.push({ action: 'ring-passage', result: 'crossed',
      shipId, ...(receipt.fuelSpent === undefined ? {} : { fuelSpent: receipt.fuelSpent }), audience: 'members' });
    if (site.code === 'O' && (receipt.outcome === 'reached' || receipt.outcome === 'lost')) path.push({ action: 'nebula-jump',
      result: receipt.outcome, shipId, ...(receipt.fuelSpent === undefined ? {} : { fuelSpent: receipt.fuelSpent }), audience: 'members' });
  }
  if (site.code === 'N' && site.sabotagedAt) path.push({ action: 'sabotage-ring', result: 'completed', audience: 'members' });
  if (site.code === 'P') for (const [shipId, capacity] of Object.entries(site.reactors)) {
    path.push({ action: 'contribute-reactor', result: 'completed', shipId, capacity, audience: 'members' });
  }
  if (site.code === 'P' && site.activatedAt) path.push({ action: 'station-activation', result: 'activated',
    capacity: Object.values(site.reactors).reduce((total, capacity) => total + capacity, 0), audience: 'members' });
  return path;
}

interface Dependencies {
  db: Firestore; now?: () => Date; die?: () => number; serverTimestamp: () => unknown;
  requireShipAuthority: (tx: Transaction, sessionId: string, uid: string, shipId: string,
    instanceId?: string, crewWrite?: boolean) => Promise<unknown>;
  commitTerminal?: (tx: Transaction, ref: DocumentReference, session: DocumentSnapshot,
    input: CandidateTerminalInput) => Promise<unknown> | unknown;
  survivorOutcome?: (session: DocumentSnapshot, cycle: number, occurredAt: string) => unknown;
}
const record = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const precondition = (message: string): never => { throw new HttpsError('failed-precondition', message); };
function active(player: DocumentSnapshot, now: Date): boolean {
  if (!player.exists || player.get('connected') !== true || player.get('kickedAt') != null) return false;
  const seen = player.get('lastSeenAt');
  return seen === undefined || (record(seen) && typeof seen.toDate === 'function' &&
    !isPresenceStale(seen.toDate() as Date, now));
}
function validateRead(raw: unknown): { sessionId: string; expectedGroupId: string; instanceId?: string } {
  if (!record(raw) || Object.keys(raw).some(k => !['sessionId', 'expectedGroupId', 'instanceId'].includes(k)) ||
      !id(raw.sessionId) || typeof raw.expectedGroupId !== 'string' || !/^fleet-[1-9]\d*$/.test(raw.expectedGroupId) ||
      (raw.instanceId !== undefined && !id(raw.instanceId))) throw new HttpsError('invalid-argument', 'Choose a current candidate fleet group.');
  return raw as unknown as { sessionId: string; expectedGroupId: string; instanceId?: string };
}
type CandidateEditionSelection = {
  sessionId: string; requestId: string; expectedRevision: number; expectedGroupId: string;
  instanceId: string; edition: CandidateEdition;
};
function validateEditionSelection(raw: unknown): CandidateEditionSelection {
  const keys = ['sessionId', 'requestId', 'expectedRevision', 'expectedGroupId', 'instanceId', 'edition'];
  if (!record(raw) || Object.keys(raw).length !== keys.length || Object.keys(raw).some(key => !keys.includes(key)) ||
      !id(raw.sessionId) || !id(raw.requestId) || !Number.isSafeInteger(raw.expectedRevision) ||
      (raw.expectedRevision as number) < 0 || (raw.expectedRevision as number) >= Number.MAX_SAFE_INTEGER ||
      typeof raw.expectedGroupId !== 'string' || !/^fleet-[1-9]\d*$/.test(raw.expectedGroupId) ||
      !id(raw.instanceId) || !isCandidateEdition(raw.edition)) {
    throw new HttpsError('invalid-argument', 'Choose an N/O rules edition from the current GM connection.');
  }
  return raw as unknown as CandidateEditionSelection;
}
function editionFingerprint(choice: CandidateEditionSelection, uid: string): CommandFingerprint {
  return { action: 'candidate-edition-selection', actorUid: uid, sessionId: choice.sessionId,
    requestId: choice.requestId, instanceId: choice.instanceId, expectedRevision: choice.expectedRevision,
    payload: { groupId: choice.expectedGroupId, edition: choice.edition } };
}
function safeEditionReply(raw: unknown, sessionId: string) {
  const fields = ['type', 'status', 'sessionId', 'requestId', 'revision', 'edition', 'summary'];
  if (!record(raw) || Object.keys(raw).some(key => !fields.includes(key)) ||
      raw.type !== 'candidate-edition-result' || raw.status !== 'committed' || raw.sessionId !== sessionId ||
      !id(raw.requestId) || !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 ||
      !isCandidateEdition(raw.edition) || typeof raw.summary !== 'string' || raw.summary.length > 1000) {
    return precondition('The original candidate edition receipt needs recovery.');
  }
  return raw as { type: 'candidate-edition-result'; status: 'committed' | 'replayed'; sessionId: string;
    requestId: string; revision: number; edition: CandidateEdition; summary: string };
}
function fingerprint(command: CandidateAction, uid: string): CommandFingerprint {
  return { action: 'candidate-action', actorUid: uid, sessionId: command.sessionId,
    requestId: command.requestId, instanceId: command.instanceId ?? null, expectedRevision: command.expectedRevision,
    payload: { code: command.code, coordinate: command.coordinate, groupId: command.expectedGroupId,
      action: command.action, shipId: command.shipId ?? null, amount: command.amount ?? null,
      trackIds: command.trackIds ?? [], shuttleId: command.shuttleId ?? null } };
}
function safeReply(raw: unknown, sessionId: string): CandidateActionReply {
  const fields = ['type', 'status', 'sessionId', 'requestId', 'revision', 'code', 'action', 'summary',
    'outcome', 'fuelSpent', 'remainingFuel'];
  if (!record(raw) || Object.keys(raw).some(k => !fields.includes(k)) || raw.type !== 'candidate-action-result' ||
      raw.status !== 'committed' || raw.sessionId !== sessionId || !id(raw.requestId) ||
      !Number.isSafeInteger(raw.revision) || typeof raw.summary !== 'string' || raw.summary.length > 1000 ||
      !['N', 'O', 'P'].includes(String(raw.code))) return precondition('The original candidate receipt needs recovery.');
  return raw as unknown as CandidateActionReply;
}
function valueAt(fields: Fields, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => record(value) ? value[key] : undefined, fields);
}
function mergedSession(session: DocumentSnapshot, patch: Fields): DocumentSnapshot {
  const data = { ...(session.data() ?? {}) };
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split('.'); let cursor = data;
    for (const key of keys.slice(0, -1)) { cursor[key] = { ...(record(cursor[key]) ? cursor[key] : {}) }; cursor = cursor[key] as Fields; }
    cursor[keys.at(-1)!] = value;
  }
  return { ...session, id: session.id, ref: session.ref, exists: true,
    data: () => data, get: (field: string) => valueAt(data, field) } as unknown as DocumentSnapshot;
}

/** Adapters use the existing authenticated session/GM instance and protected ship write handlers. */
export function createCandidateCallables(d: Dependencies) {
  const db = d.db; const now = d.now ?? (() => new Date());
  async function authority(tx: Transaction, data: ReturnType<typeof validateRead>, uid: string, at: Date) {
    const base = `sessions/${data.sessionId}`;
    const [session, actor, state, navigation, groups, players, research, attack, scans,
      instance, audits, liberations] = await Promise.all([
      tx.get(db.doc(base)), tx.get(db.doc(`${base}/players/${uid}`)),
      tx.get(db.doc(`${base}/serverState/candidates`)), tx.get(db.doc(`${base}/serverState/navigation`)),
      tx.get(db.collection(`${base}/fleetGroups`)), tx.get(db.collection(`${base}/players`)),
      tx.get(db.doc(`${base}/serverState/endeavourResearch`)), tx.get(db.doc(`${base}/wolfAttackState/current`)),
      tx.get(db.collection(`${base}/deepNebulaScans`)),
      data.instanceId ? tx.get(db.doc(`${base}/gmInstances/${data.instanceId}`)) : undefined,
      tx.get(db.collection(`${base}/candidateCalculationAudits`)),
      tx.get(db.doc(`${base}/serverState/candidateStationLiberations`)),
    ]);
    if (!session.exists || !active(actor, at)) throw new HttpsError('permission-denied', 'A live joined session member is required.');
    const gm = actor.get('role') === 'gm';
    if (gm && (!instance?.exists || instance.get('uid') !== uid || instance.get('connected') === false ||
        !isLiveSetupGm({ id: instance.id, uid, connected: true,
          lastSeenAt: instance.get('lastSeenAt') ?? instance.get('claimedAt') ?? '' }, at.getTime()))) {
      throw new HttpsError('permission-denied', 'A current owned GM instance is required.');
    }
    if (!gm && (actor.get('role') !== 'player' || actor.get('fleetGroupId') !== data.expectedGroupId)) {
      throw new HttpsError('permission-denied', 'Candidate operations stay within the current fleet group.');
    }
    const activeIds = session.get('activeVesselIds');
    if (!Array.isArray(activeIds) || activeIds.length === 0 || new Set(activeIds).size !== activeIds.length ||
        activeIds.some(v => typeof v !== 'string')) return precondition('The active fleet authority is malformed.');
    const parsedGroups = groups.docs.map(s => fleetGroupRecord(s.data()));
    if (parsedGroups.some(group => !group) || new Set(parsedGroups.flatMap(group => group!.vesselIds)).size !== activeIds.length ||
        parsedGroups.flatMap(group => group!.vesselIds).length !== activeIds.length ||
        parsedGroups.some(group => group!.vesselIds.some(ship => !activeIds.includes(ship)))) return precondition('Current fleet group authority is unavailable.');
    const group = parsedGroups.find(g => g?.id === data.expectedGroupId);
    if (!group || (!gm && !group.memberUids.includes(uid))) throw new HttpsError('permission-denied', 'Current fleet group membership is required.');
    const cycle = session.get('currentTurn');
    const chart = session.get('chartId');
    if (!Number.isSafeInteger(cycle) || cycle < 1 || !['A', 'B', 'C'].includes(chart) ||
        (session.get('configurationLocked') !== true && session.get('chartSelectionLocked') !== true)) return precondition('The locked game chart and cycle are required.');
    const sites = organiserSitesForChart(chart as 'A' | 'B' | 'C');
    const discovered = new Map<string, { code: CandidateCode; coordinate: string }>();
    const history = navigation.get('systemHistory');
    for (const ship of group.vesselIds) {
      const entries = record(history) && record(history[ship]) ? history[ship] as Fields : {};
      for (const [coordinate, entry] of Object.entries(entries)) {
        const found = record(entry) ? entry.candidateDiscovery : undefined;
        if (!record(found) || Object.keys(found).length !== 5 || !sites[coordinate]?.candidate ||
            found.code !== sites[coordinate]?.code || found.title !== sites[coordinate]?.name ||
            !['arrival', 'scout'].includes(String(found.source))) continue;
        discovered.set(coordinate, { coordinate, code: found.code as CandidateCode });
      }
    }
    const control = parseShuttleControl(session.get('shuttleControl')) ?? {};
    const dockings = session.get('shuttleDockings');
    const damage = shipDamage(session.get('shipDamage'));
    const phases = turnPhaseState(session.get('turnPhase'));
    const maintenance = session.get('maintenanceCycles');
    const coordinates = navigation.get('shipGalacticCoordinates');
    const jumpStates = session.get('shipJumpStates');
    const candidateOutcomes = session.get('candidateVesselOutcomes');
    const role = boundCoreConsoleRole(actor.get('assignedRoleId'), actor.get('seatId'));
    const actorShip = shipForRole(role);
    const alive = actor.get('candidateDisposition') == null && actor.get('replacementStatus') == null && actor.get('escapeState') == null;
    const shipIds = actorShip && group.vesselIds.includes(actorShip) ? [actorShip] : [];
    const engineeringIds = CANDIDATE_ENGINEERING_SHUTTLES;
    const consumedCraft = parseCandidateCraftReservations(session.get('candidateCraftReservations'));
    const craftCommitments = session.get('missionCraftCommitments');
    const availableEngineering = engineeringIds.flatMap(craft => {
      const holder = control[craft]; const docks = Array.isArray(dockings) ? dockings.filter(raw => record(raw) && raw.shuttleId === craft) : [];
      const dock = docks.length === 1 && record(docks[0]) ? docks[0].shipId : undefined;
      const available = !Object.hasOwn(consumedCraft, craft) && !!holder && typeof dock === 'string' && group.vesselIds.includes(dock) &&
        !damage[dock]?.destroyed && !(record(craftCommitments) && Object.hasOwn(craftCommitments, craft)) &&
        !(attack.exists && attack.get('status') !== 'resolved');
      return holder ? [{ id: craft, available }] : [];
    });
    const ships = Object.fromEntries(group.vesselIds.map(ship => {
      const resources = serviceRechargeResourceState(session.get('shipResources'), ship);
      const upgrades = serviceRechargeUpgradeState(session.get('shipUpgrades'), ship) ?? [];
      const current = record(maintenance) ? parseMaintenanceCycle(maintenance[ship]) : undefined;
      const rules = MAINTENANCE_RULES[ship];
      const settled = record(candidateOutcomes) && Object.hasOwn(candidateOutcomes, ship);
      const damaged = damage[ship];
      return [ship, { fuel: resources?.fuel ?? 0, materials: resources?.materials ?? 0,
        destroyed: damaged?.destroyed === true || settled,
        reactorCapacity: rules ? Math.max(0, rules.reactor + (upgrades.includes('reactor') ? 1 : 0) -
          (damaged?.damagedSystemIds.includes('reactor') ? rules.damagedPenalty : 0)) : 0,
        jumpCharged: !!current && current.turn === cycle && current.step === 0 && current.charges.includes('jump-drive'),
        jumpDamaged: damaged?.damagedSystemIds.includes('jump-drive') === true,
        longJumpCost: (() => { try { return jumpFuelCost(ship, 'long', upgrades.includes('jump-drive')); } catch { return 0; } })(),
        atCandidate: record(coordinates) && typeof coordinates[ship] === 'string',
        ...(record(coordinates) && typeof coordinates[ship] === 'string' ? { coordinate: coordinates[ship] as string } : {}),
        jumpedThisCycle: record(jumpStates) && record(jumpStates[ship]) && jumpStates[ship].lastJumpTurn === cycle,
      }];
    }));
    const privateResearch = research.exists && record(research.data()) ? research.data() as Record<string, number> : {};
    const scientist = alive && role === 'shepherd-scientist' && control.endeavour?.holderUid === uid && group.vesselIds.includes('shepherd');
    let station: CandidateAuthority['station'];
    const durableLiberations = parseCandidateStationLiberations(liberations.exists ? liberations.data() : undefined);
    const durableStation = Object.values(durableLiberations).find(entry => entry.groupId === group.id && entry.chart === chart && entry.sessionId === data.sessionId);
    if (durableStation) station = { coordinate: durableStation.coordinate, groupId: group.id,
      liberated: true, sourceId: durableStation.sourceId };
    const sequence = attack.get('pStationSequence');
    if (record(sequence) && sequence.groupId === group.id && typeof sequence.coordinate === 'string' && sequence.chart === chart &&
        sites[sequence.coordinate]?.code === 'P' && attack.get('status') === 'resolved' && attack.get('currentStep') === 'resolved') {
      const audit = await tx.get(db.doc(`${base}/wolfAttackState/current/audit/wolf-finalized-${attack.get('turn')}`));
      const repeat = attack.get('pStationRepeat'); const receipt = attack.get('calculationReceipt');
      if (record(repeat) && repeat.status === 'stopped' && repeat.groupId === group.id &&
          repeat.sequenceId === sequence.sequenceId && audit.exists &&
          isDeepStrictEqual(audit.get('pStationSequence'), sequence) && isDeepStrictEqual(audit.get('pStationRepeat'), repeat) &&
          record(receipt) && Array.isArray(receipt.survivingWolfShips) && receipt.survivingWolfShips.length === 0 &&
          isDeepStrictEqual(audit.get('receipt'), receipt)) {
        station = { coordinate: sequence.coordinate, groupId: group.id, liberated: true, sourceId: String(attack.get('attackId')) };
      }
    }
    const a: CandidateAuthority = { sessionId: data.sessionId, cycle, phase: session.get('phase'),
      coordination: !!phases && phases.turn === cycle && phases.airspace.state === 'lifted' &&
        !session.get('pursuitEmergencyWindow') && !(attack.exists && attack.get('status') !== 'resolved'),
      now: at.toISOString(), groupId: group.id, vesselIds: [...group.vesselIds],
      actor: { uid, gm, shipIds, research: scientist,
        shuttleIds: alive ? Object.values(control).filter(craft => craft.holderUid === uid).map(craft => craft.shuttleId) : [] },
      discovered: [...discovered.values()], ships, research: privateResearch,
      engineeringShuttles: availableEngineering, hiddenScoutCount: 0, ...(station ? { station } : {}) };
    return { a, session, actor, state: parseCandidateState(state.exists ? state.data() : undefined),
      players: players.docs, scans: scans.docs, audits: audits.docs, coordinates, activeIds: activeIds as string[] };
  }
  async function read(request: Request) {
    if (!id(request.auth?.uid)) throw new HttpsError('unauthenticated', 'Sign in to read candidate operations.');
    const data = validateRead(request.data); const at = now();
    return db.runTransaction(async tx => {
      const world = await authority(tx, data, request.auth!.uid, at);
      const view = candidateWorkspace(world.a, world.state);
      return { ...view, ...(world.a.actor.gm ? { privateCalculations: world.audits
        .filter(audit => audit.get('groupId') === data.expectedGroupId).map(audit => audit.data()) } : {}) };
    });
  }
  async function selectEdition(request: Request) {
    if (!id(request.auth?.uid)) throw new HttpsError('unauthenticated', 'Sign in before selecting an N/O rules edition.');
    const choice = validateEditionSelection(request.data);
    const uid = request.auth.uid; const at = now(); const fingerprintValue = editionFingerprint(choice, uid);
    const base = `sessions/${choice.sessionId}`;
    const stateRef = db.doc(`${base}/serverState/candidates`);
    const receiptRef = db.doc(`${base}/candidateActionReceipts/${choice.requestId}`);
    return db.runTransaction(async tx => {
      const [world, receipt] = await Promise.all([
        authority(tx, { sessionId: choice.sessionId, expectedGroupId: choice.expectedGroupId,
          instanceId: choice.instanceId }, uid, at), tx.get(receiptRef),
      ]);
      if (world.actor.get('role') !== 'gm') throw new HttpsError('permission-denied', 'Only the current GM may select the N/O rules edition.');
      if (receipt.exists) {
        const disposition = commandReceiptDisposition(receipt.get('fingerprint'), fingerprintValue);
        if (disposition.kind !== 'replay') throw new HttpsError(disposition.kind === 'foreign-actor' ? 'permission-denied' : 'failed-precondition',
          'This candidate edition request is bound to its original GM and choice.');
        return { ...safeEditionReply(receipt.get('result'), choice.sessionId), status: 'replayed' as const };
      }
      if (world.a.phase !== 'active') return precondition('The N/O rules edition can be selected only while the game is active.');
      if (world.state.revision !== choice.expectedRevision) return precondition('Candidate revision changed; refresh the live record.');
      const priorEdition = world.state.edition ?? 'home';
      const locked = Object.values(world.state.sites).some(site => site.code === 'N' || site.code === 'O');
      if (locked && choice.edition !== priorEdition) return precondition('The N/O rules edition is locked after candidate actions begin in any fleet group.');
      const changed = choice.edition !== priorEdition;
      const nextRevision = world.state.revision + (changed ? 1 : 0);
      const nextState = changed ? { ...world.state, edition: choice.edition, revision: nextRevision } : world.state;
      const summary = changed ? `N/O rules edition set to ${choice.edition === 'home' ? 'Home' : 'Deluxe'}.` :
        `N/O rules edition remains ${choice.edition === 'home' ? 'Home' : 'Deluxe'}.`;
      const result = { type: 'candidate-edition-result' as const, status: 'committed' as const,
        sessionId: choice.sessionId, requestId: choice.requestId, revision: nextRevision,
        edition: choice.edition, summary };
      writeStandardActionAudit(tx, db, {
        sessionId: choice.sessionId, actorUid: uid, actorRoleId: world.actor.get('assignedRoleId') ?? null,
        action: 'candidate-edition-selection', phase: world.session.get('phase'),
        requestId: choice.requestId, revision: nextRevision, outcome: 'committed',
        resolutionSource: 'facilitator', createdAt: d.serverTimestamp(),
      }, {
        sourceId: `${choice.edition}-v1-1-candidate-edition`,
        requiredChoices: [{ actor: 'facilitator', kind: 'candidate-edition-selection',
          value: { groupId: choice.expectedGroupId, edition: choice.edition, changed } }],
        calculation: { revisionBefore: world.state.revision, revisionAfter: nextRevision,
          previousEdition: priorEdition, editionLocked: locked },
        consequences: { edition: choice.edition, editionLocked: locked },
        audience: { operational: 'members' },
      });
      if (changed) tx.set(stateRef, nextState);
      tx.set(receiptRef, { fingerprint: fingerprintValue, result, createdAt: d.serverTimestamp() });
      return result;
    });
  }
  async function execute(request: Request) {
    if (!id(request.auth?.uid)) throw new HttpsError('unauthenticated', 'Sign in before choosing a candidate action.');
    let command: CandidateAction;
    try { command = parseCandidateAction(request.data); } catch (error) {
      throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid candidate choices.');
    }
    const uid = request.auth.uid; const at = now(); const f = fingerprint(command, uid);
    const base = `sessions/${command.sessionId}`; const receiptRef = db.doc(`${base}/candidateActionReceipts/${command.requestId}`);
    let stableDie: number | undefined;
    return db.runTransaction(async tx => {
      const [world, receipt] = await Promise.all([authority(tx, command, uid, at), tx.get(receiptRef)]);
      if (receipt.exists) {
        const disposition = commandReceiptDisposition(receipt.get('fingerprint'), f);
        if (disposition.kind !== 'replay') throw new HttpsError(disposition.kind === 'foreign-actor' ? 'permission-denied' : 'failed-precondition',
          'This candidate request is bound to its original actor and choices.');
        return { ...safeReply(receipt.get('result'), command.sessionId), status: 'replayed' as const };
      }
      const a = world.a;
      if (command.shipId && a.ships[command.shipId]) a.ships[command.shipId]!.atCandidate =
        record(world.coordinates) && world.coordinates[command.shipId] === command.coordinate;
      a.hiddenScoutCount = world.scans.filter(scan => scan.get('type') === 'deep-nebula-scan' &&
        scan.get('sessionId') === command.sessionId && scan.get('requestId') === scan.id &&
        scan.get('targetCoordinate') === command.coordinate && Number.isSafeInteger(scan.get('cycle')) &&
        scan.get('cycle') <= a.cycle).length;
      let plan;
      try {
        plan = resolveCandidateAction(a, world.state, command, command.action === 'nebula-jump' ? 1 : undefined);
        if (plan.reply.status === 'replayed') return plan.reply;
        if (world.actor.get('candidateDisposition') != null && !a.actor.gm) return precondition('This vessel already has a committed candidate disposition.');
        if (command.shipId) await d.requireShipAuthority(tx, command.sessionId, uid, command.shipId, command.instanceId, false);
        if (command.action === 'nebula-jump') {
          stableDie ??= (d.die ?? (() => randomInt(1, 7)))();
          plan = resolveCandidateAction(a, world.state, command, stableDie);
        }
      } catch (error) { if (error instanceof HttpsError) throw error;
        return precondition(error instanceof Error ? error.message : 'Candidate authority could not be resolved.'); }
      const patch: Fields = {}; const outcomes: Fields = { ...(record(world.session.get('candidateVesselOutcomes')) ? world.session.get('candidateVesselOutcomes') : {}) };
      if (command.action === 'commit-engineering-shuttle') {
        patch.candidateCraftReservations = reserveCandidateEngineeringCraft(world.session.get('candidateCraftReservations'),
          command.shuttleId!, { code: 'N', groupId: a.groupId, coordinate: command.coordinate,
            sourceId: command.requestId, cycle: a.cycle });
        const dockings = world.session.get('shuttleDockings');
        if (!Array.isArray(dockings)) return precondition('The consumed Engineering Shuttle docking is unavailable.');
        patch.shuttleDockings = dockings.filter(docking => record(docking) && docking.shuttleId !== command.shuttleId);
      }
      const dispositionShips = new Set<string>();
      for (const [shipId, delta] of Object.entries(plan.shipPatches)) {
        if (delta.fuel !== undefined) patch[`shipResources.${shipId}.fuel`] = delta.fuel;
        if (delta.materials !== undefined) patch[`shipResources.${shipId}.materials`] = delta.materials;
        if (delta.destroyed) { patch[`shipDamage.${shipId}`] = { ...shipDamage(world.session.get('shipDamage'))[shipId], destroyed: true }; patch[`shipSurvivors.${shipId}`] = 0; }
        if (command.action === 'ring-passage' || command.action === 'nebula-jump' || delta.cannibalised) {
          outcomes[shipId] = { code: command.code, groupId: a.groupId, shipId, sourceId: command.requestId,
            cycle: a.cycle, outcome: delta.cannibalised ? 'cannibalised' : plan.reply.outcome };
          dispositionShips.add(shipId);
        }
        if (command.action === 'nebula-jump') patch[`shipJumpStates.${shipId}.lastJumpTurn`] = a.cycle;
      }
      if (plan.groupOutcome) for (const shipId of a.vesselIds) {
        outcomes[shipId] ??= { code: command.code, groupId: a.groupId, shipId, sourceId: command.requestId,
          cycle: a.cycle, outcome: plan.groupOutcome.successfulShipIds.includes(shipId) ? 'settled' : 'left-behind' };
        dispositionShips.add(shipId);
      }
      if (dispositionShips.size) patch.candidateVesselOutcomes = outcomes;
      const damage = shipDamage(world.session.get('shipDamage'));
      const globallySettled = plan.groupOutcome && world.activeIds.every(ship => outcomes[ship] || damage[ship]?.destroyed);
      if (globallySettled) {
        if (!d.commitTerminal) return precondition('The ending transaction handler is unavailable; preserve the candidate choices and retry after recovery.');
        const successfulShipIds = world.activeIds.filter(ship => record(outcomes[ship]) &&
          ['crossed', 'reached', 'cannibalised', 'settled'].includes(String(outcomes[ship].outcome)));
        const outcome = successfulShipIds.length ? { type: 'game-outcome', result: 'success', cause: 'candidate-complete',
          candidateCode: command.code, cycle: a.cycle, occurredAt: a.now } :
          { type: 'game-outcome', result: 'failure', cause: 'total-fleet-loss', cycle: a.cycle, occurredAt: a.now };
        const committedSession = mergedSession(world.session, patch);
        await d.commitTerminal(tx, db.doc(base), committedSession, {
          source: 'candidate', outcome, committedAt: a.now,
          ...(d.survivorOutcome ? { survivorOutcome: d.survivorOutcome(committedSession, a.cycle, a.now) } : {}),
          sessionPatch: { candidateVesselOutcomes: outcomes }, candidate: { code: command.code,
            groups: Object.values(plan.state.sites).filter(site => site.completed).map(site => ({
              groupId: site.groupId, path: candidateDebriefPath(site), requirements: [{ id: `${site.code}-requirements`, status: 'met' as const }],
              rolls: Object.entries(site.ships).map(([ship, result]) => ({ id: ship,
                result: result.outcome === 'lost' ? 'failure' as const : 'success' as const, audience: 'members' as const })),
              losses: site.completed!.leftBehindShipIds.map(shipId => ({ shipId,
                reason: site.code === 'O' ? 'lost-in-nebula' : 'left-behind', audience: 'members' as const })),
              humanCalls: site.sabotagedAt ? [{ id: 'ring-far-side-sabotage', cycle: site.completed!.cycle, audience: 'members' as const }] : [],
            })) } });
      }
      tx.set(db.doc(`${base}/serverState/candidates`), plan.state);
      if (Object.keys(patch).length) tx.update(db.doc(base), { ...patch, updatedAt: d.serverTimestamp() });
      for (const player of world.players) {
        const ship = shipForRole(boundCoreConsoleRole(player.get('assignedRoleId'), player.get('seatId')));
        if (ship && dispositionShips.has(ship) && player.get('role') === 'player') {
          const disposition = outcomes[ship] as Fields;
          if (player.get('candidateDisposition') == null && ['lost', 'left-behind', 'cannibalised'].includes(String(disposition.outcome))) {
            writePlayerRemovalAlert(tx, db, { sessionId: command.sessionId, sourceId: command.requestId,
              player, cause: 'candidate-loss', shipId: ship, cycle: a.cycle,
              recordedAt: a.now, createdAt: d.serverTimestamp() });
          }
          tx.update(player.ref, { candidateDisposition: { code: disposition.code, outcome: disposition.outcome, cycle: disposition.cycle },
            updatedAt: d.serverTimestamp() });
        }
      }
      tx.set(receiptRef, { fingerprint: f, result: plan.reply, createdAt: d.serverTimestamp() });
      tx.set(db.doc(`${base}/candidateCalculationAudits/${command.requestId}`), {
        type: 'candidate-calculation-audit', sessionId: command.sessionId, actorUid: uid,
        groupId: a.groupId, code: command.code, coordinate: command.coordinate,
        requestId: command.requestId, revision: plan.state.revision, cycle: a.cycle,
        choices: { action: command.action, ...(command.shipId ? { shipId: command.shipId } : {}),
          ...(command.trackIds ? { trackIds: command.trackIds } : {}), ...(command.amount ? { amount: command.amount } : {}),
          ...(command.shuttleId ? { shuttleId: command.shuttleId } : {}) },
        calculation: plan.calculation, consequences: plan.shipPatches,
        result: plan.reply.outcome ?? 'contribution-committed', recordedAt: a.now,
      });
      writeStandardActionAudit(tx, db, {
        sessionId: command.sessionId, actorUid: uid, actorRoleId: world.actor.get('assignedRoleId') ?? null,
        action: command.action === 'nebula-jump' ? 'candidate-nebula-jump' : 'candidate-action',
        phase: a.phase, requestId: command.requestId, revision: plan.state.revision, outcome: 'committed',
        resolutionSource: command.action === 'nebula-jump' ? 'server-random' : 'server-calculated',
        createdAt: d.serverTimestamp(),
      }, {
        sourceId: command.code === 'P' ? `base-v1-1-candidate-${command.code}` :
          `${world.state.edition ?? 'home'}-v1-1-candidate-${command.code}`,
        requiredChoices: [{ actor: a.actor.gm ? 'facilitator' : 'player', kind: command.action,
          value: { ...(command.shipId ? { shipId: command.shipId } : {}),
            ...(command.amount ? { amount: command.amount } : {}), ...(command.trackIds ? { trackIds: command.trackIds } : {}),
            ...(command.shuttleId ? { shuttleId: command.shuttleId } : {}) } }],
        calculation: plan.calculation, consequences: plan.shipPatches,
        audience: { operational: 'group', groupId: a.groupId },
      });
      return plan.reply;
    });
  }
  return { read, execute, selectEdition };
}

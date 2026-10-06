import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import { CORE_CRAFT_PROCEDURES, GM_RULING_COUNTER_PROCEDURES } from './pc10-pending-procedure-ui-proof.mjs';
import { observeLifecycleActor, inspectLifecycleObserverMount, recordLifecycleAffordance } from './pc10-member-gm-lifecycle-ui-proof.mjs';
import { assertOriginalActor, assertLateReplyAuthority } from './pc10-member-gm-lifecycle-contracts.mjs';

const RESOURCE_COSTS = Object.freeze({ food: 6, water: 6, ore: 6, fuel: 6, materials: 3 });
const ARRIVAL_RESOURCE_IDS = Object.freeze(['ore', 'fuel', 'food', 'water', 'materials', 'securityTeams', 'scrap']);
const SHIP_FOR_ROLE = Object.freeze({
  'quellon-explorer': 'quellon', 'icebreaker-miner': 'icebreaker',
  'icebreaker-engineer': 'icebreaker', 'refinery-124-engineer': 'refinery-124',
  'capybara-captain': 'capybara', 'dione-engineer': 'dione',
  'admiral': 'aegis', 'gm': 'aegis',
});
const REPAIR_PANELS = Object.freeze({
  repairConsolesFromAlly: 'Ally console repair',
  repairConsolesFromBlacksmith: 'Blacksmith console repair',
  repairConsolesFromChacau: 'Chacau console repair',
  repairConsolesFromMacaw: 'Macaw console repair',
  repairConsolesFromPhilia: 'Philia console repair',
});
const UNVERIFIABLE_GM_CHOICES = new Set([
  'setFacilitatorResponsibility', 'setGmControlsLocked', 'setCandidatePlanCheckpoint',
]);
const CERTIFIED_GM_RECIPES = new Set(['setGmShipConsoleWriteGrant', 'setShipConsoleLock',
  'setFacilitatorCensusNote', 'authorFacilitatorRuleCall']);
const CURRENT_DOCUMENT_AUTHORITY_KEYS = Object.freeze(['sessionId', 'uidHash', 'groupId', 'roleId',
  'connectionGeneration', 'identityHydrationRevision', 'documentTimeOrigin', 'audienceHash', 'authorityHash',
  'shuttleAuthorized']);
const SHUTTLE_ORIGIN_AUTHORITY_KEYS = Object.freeze(['sessionId', 'uidHash', 'shuttleId', 'groupId', 'cycle',
  'controlRevision', 'sourceAuthority']);

function isRevision(value) { return Number.isSafeInteger(value) && value >= 0; }
function hashUid(uid) { return typeof uid === 'string' && uid ? createHash('sha256').update(uid).digest('hex').slice(0, 16) : null; }
function proofHash(value) { return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 20); }
function exactKeys(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key)); }

function validCurrentDocumentAuthority(value, { sessionId, uidHash, groupId, roleId, shuttleId } = {}) {
  return exactKeys(value, CURRENT_DOCUMENT_AUTHORITY_KEYS) && value.sessionId === sessionId &&
    value.uidHash === uidHash && /^[0-9a-f]{16}$/.test(value.uidHash ?? '') && value.groupId === groupId &&
    typeof value.roleId === 'string' && value.roleId === roleId &&
    Number.isSafeInteger(value.connectionGeneration) && value.connectionGeneration >= 1 &&
    Number.isSafeInteger(value.identityHydrationRevision) && value.identityHydrationRevision >= 1 &&
    Number.isFinite(value.documentTimeOrigin) && value.documentTimeOrigin > 0 &&
    /^[0-9a-f]{64}$/.test(value.audienceHash ?? '') && /^[0-9a-f]{64}$/.test(value.authorityHash ?? '') &&
    value.shuttleAuthorized === true && typeof shuttleId === 'string' && shuttleId.length > 0;
}

function sameCurrentDocumentAuthority(left, right) {
  return exactKeys(left, CURRENT_DOCUMENT_AUTHORITY_KEYS) && exactKeys(right, CURRENT_DOCUMENT_AUTHORITY_KEYS) &&
    CURRENT_DOCUMENT_AUTHORITY_KEYS.every(key => left[key] === right[key]);
}

function validShuttleOriginAuthority(origin, expected = {}) {
  return exactKeys(origin, SHUTTLE_ORIGIN_AUTHORITY_KEYS) && origin.sessionId === expected.sessionId &&
    origin.uidHash === expected.uidHash && /^[0-9a-f]{16}$/.test(origin.uidHash ?? '') &&
    origin.shuttleId === expected.shuttleId && typeof origin.shuttleId === 'string' && origin.shuttleId.length > 0 &&
    origin.groupId === expected.groupId && typeof origin.groupId === 'string' && origin.groupId.length > 0 &&
    origin.cycle === expected.cycle && Number.isSafeInteger(origin.cycle) && origin.cycle >= 1 &&
    origin.controlRevision === expected.controlRevision && Number.isSafeInteger(origin.controlRevision) &&
    origin.controlRevision >= 0 && validCurrentDocumentAuthority(origin.sourceAuthority, {
      sessionId: origin.sessionId, uidHash: origin.uidHash, groupId: origin.groupId,
      roleId: expected.roleId, shuttleId: origin.shuttleId,
    });
}

function shuttleOriginAuthorityMatches(origin, state, expected, shuttleId) {
  const control = state?.shuttleControl?.[shuttleId];
  return validShuttleOriginAuthority(origin, { ...expected, shuttleId }) &&
    state?.sessionId === origin.sessionId && state?.cycle === origin.cycle && state?.phase === 'active' &&
    state?.holderGroupId === origin.groupId && state?.live === true &&
    control?.shuttleId === shuttleId && hashUid(control?.holderUid) === origin.uidHash &&
    control?.revision === origin.controlRevision &&
    sameCurrentDocumentAuthority(state?.currentDocumentAuthority, origin.sourceAuthority);
}

/** Select an actual option that is both offered and enabled under its current budget. */
export function chooseOfferedAffordableOption(options, budget) {
  if (!Array.isArray(options) || !Number.isFinite(budget) || budget < 0) return null;
  const eligible = options.filter(option => option && option.offered === true && option.enabled === true &&
    typeof option.value === 'string' && option.value && Number.isFinite(option.cost) && option.cost >= 0 && option.cost <= budget);
  eligible.sort((left, right) => left.cost - right.cost || left.value.localeCompare(right.value));
  return eligible[0] ?? null;
}

export async function readActionState(surface, shuttleId) {
  return surface.page.evaluate(async ({ moduleUrl, shuttleId }) => {
    const { useSessionStore } = await import(moduleUrl);
    const current = useSessionStore.getState();
    const session = current.session;
    if (!session) return null;
    let currentDocumentAuthority;
    if (typeof shuttleId === 'string' && shuttleId) {
      currentDocumentAuthority = null;
      const me = current.me;
      const berth = session.currentActorBerthAuthority;
      const scope = session.memberSessionScope;
      const { auth } = await import('/src/lib/firebase.ts');
      const user = auth().currentUser;
      const berthKeys = ['sessionId', 'actorUid', 'groupId', 'role', 'connectionGeneration',
        'assignedRoleId', 'activeConsoleRoleId', 'replacementRoleId', 'replacementStatus', 'shipId'];
      const record = value => typeof value === 'object' && value !== null && !Array.isArray(value);
      const hashObject = async value => {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      };
      const hashUid = async value => {
        if (typeof value !== 'string' || !value) return null;
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
      };
      const scopeKeys = ['groupId', 'vesselIds', 'craftIds'];
      const scopeValid = record(scope) && Object.keys(scope).length === scopeKeys.length &&
        Object.keys(scope).every(key => scopeKeys.includes(key)) && typeof scope.groupId === 'string' &&
        Array.isArray(scope.vesselIds) && scope.vesselIds.every(value => typeof value === 'string') &&
        Array.isArray(scope.craftIds) && scope.craftIds.every(value => typeof value === 'string');
      const berthValid = record(berth) && Object.keys(berth).length === berthKeys.length &&
        Object.keys(berth).every(key => berthKeys.includes(key));
      const generation = me?.connectionGeneration;
      const hydrationRevision = current.identityHydrationRevision;
      const documentTimeOrigin = globalThis.performance?.timeOrigin;
      const audience = scopeValid ? { groupId: scope.groupId,
        vesselIds: [...scope.vesselIds].sort(), craftIds: [...scope.craftIds].sort() } : null;
      const berthProjection = berthValid ? {
        sessionId: berth.sessionId, actorUid: berth.actorUid, groupId: berth.groupId, role: berth.role,
        connectionGeneration: berth.connectionGeneration, assignedRoleId: berth.assignedRoleId,
        activeConsoleRoleId: berth.activeConsoleRoleId, replacementRoleId: berth.replacementRoleId,
        replacementStatus: berth.replacementStatus, shipId: berth.shipId,
      } : null;
      const actorCurrent = !!user && !!me && berthValid && scopeValid &&
        current.connection === 'live' && current.sessionSnapshotFreshness === 'server' &&
        me.role === 'player' && me.connected === true && me.replacementStatus == null &&
        session.phase !== 'closed' && session.id === me.sessionId && session.id === berth.sessionId &&
        user.uid === me.uid && user.uid === berth.actorUid && berth.role === 'player' &&
        berth.replacementStatus === null && scope.groupId === berth.groupId && scope.groupId === me.fleetGroupId &&
        scope.vesselIds.includes(berth.shipId) && scope.craftIds.includes(shuttleId) &&
        Number.isSafeInteger(generation) && generation >= 1 && generation === berth.connectionGeneration &&
        Number.isSafeInteger(hydrationRevision) && hydrationRevision >= 1 &&
        Number.isFinite(documentTimeOrigin) && documentTimeOrigin > 0 &&
        me.activeConsoleRoleId === berth.activeConsoleRoleId && me.assignedRoleId === berth.assignedRoleId;
      if (actorCurrent) {
        const uidHash = await hashUid(user.uid);
        const audienceHash = await hashObject(audience);
        const authorityHash = await hashObject({ sessionId: session.id, authUid: user.uid, meUid: me.uid,
          connection: current.connection, freshness: current.sessionSnapshotFreshness, role: me.role,
          connected: me.connected, generation, hydrationRevision, documentTimeOrigin,
          audience, berth: berthProjection });
        currentDocumentAuthority = { sessionId: session.id, uidHash, groupId: scope.groupId,
          roleId: me.activeConsoleRoleId, connectionGeneration: generation,
          identityHydrationRevision: hydrationRevision, documentTimeOrigin,
          audienceHash, authorityHash, shuttleAuthorized: scope.craftIds.includes(shuttleId) };
      }
    }
    return {
      live: current.connection === 'live' && current.sessionSnapshotFreshness === 'server',
      sessionId: session.id, cycle: session.currentTurn, phase: session.phase, turnPhase: session.turnPhase,
      holderGroupId: session.playerDiscovery?.groupId,
      ...(typeof shuttleId === 'string' && shuttleId ? { currentDocumentAuthority } : {}),
      activeVesselIds: session.activeVesselIds, activeRoleIds: session.activeRoleIds,
      shipResources: session.shipResources, shipDamage: session.shipDamage,
      shipSurvivors: session.shipSurvivors, shipMutinies: session.shipMutinies,
      populationAlerts: session.populationAlerts, unrestAlerts: session.unrestAlerts,
      maintenanceCycles: session.maintenanceCycles, vesselActionRevisions: session.vesselActionRevisions,
      shuttleControl: session.shuttleControl, shuttleDockings: session.shuttleDockings,
      shuttleFuelled: session.shuttleFuelled, shuttleCargo: session.shuttleCargo,
      shuttleEvacuations: session.shuttleEvacuations,
      shipFleetGroupIds: session.shipFleetGroupIds, boaRecycling: session.boaRecycling,
      highwallMining: session.highwallMining, fighterWings: session.fighterWings,
      fighterWingCounts: session.fighterWingCounts, maliadesState: session.maliadesState,
      smallShipStates: session.smallShipStates, shipConsoleLocks: session.shipConsoleLocks,
      allyRepairs: session.allyRepairs, blacksmithRepairs: session.blacksmithRepairs,
      chacauRepairs: session.chacauRepairs, macawRepairs: session.macawRepairs,
      philiaRepairs: session.philiaRepairs, serviceShuttleRecharges: session.serviceShuttleRecharges,
      setupRevision: session.setupRevision, gmControlsLocked: session.gmControlsLocked,
      gmLoyaltyCensus: current.gmLoyaltyCensus, gmLoyaltyCensusStatus: current.gmLoyaltyCensusStatus,
      gmFacilitatorRuleCall: current.gmFacilitatorRuleCall,
      shuttleVisitLog: session.shuttleVisitLog,
      gameOutcome: session.gameOutcome,
    };
  }, { moduleUrl: surface.storeModuleUrl(), shuttleId });
}

async function readHarvest(surface) {
  return surface.page.evaluate(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const current = useSessionStore.getState(), session = current.session, me = current.me;
    if (!session || !me || current.connection !== 'live' || current.sessionSnapshotFreshness !== 'server') return null;
    const source = await (await fetch('/src/lib/firestore.ts')).text();
    const match = source.match(/from\s+["']([^"']*firebase_firestore\.js[^"']*)["']/);
    if (!match) return null;
    const sdk = await import(match[1]);
    const { db } = await import('/src/lib/firestore.ts');
    const ref = sdk.doc(db(), `sessions/${session.id}/hummingbirdHarvests/${me.uid}`);
    const snapshot = await sdk.getDoc(ref);
    if (!snapshot.exists()) return { revision: 0, status: 'absent', turn: session.currentTurn };
    const value = snapshot.data();
    return { revision: value.revision, status: value.status, turn: value.turn,
      hostShipId: value.hostShipId, sessionId: value.sessionId };
  }, surface.storeModuleUrl());
}

async function readBoaWorkspace(surface, sessionId) {
  return surface.page.evaluate(async ({ moduleUrl, sessionId }) => {
    const { useSessionStore } = await import(moduleUrl);
    const state = useSessionStore.getState();
    if (state.session?.id !== sessionId || state.connection !== 'live' || state.sessionSnapshotFreshness !== 'server') return null;
    const { readBoaMissionReclamationWorkspace } = await import('/src/lib/boaMissionReclamationService.ts');
    const workspace = await readBoaMissionReclamationWorkspace(sessionId);
    if (workspace.status !== 'available' || workspace.sessionId !== sessionId) return null;
    return { status: workspace.status, cycle: workspace.cycle, controlRevision: workspace.controlRevision,
      groupId: workspace.groupId, hostShipId: workspace.hostShipId,
      opportunities: workspace.opportunities.map(opportunity => ({
        id: opportunity.missionOpportunityId, choiceRevision: opportunity.choiceRevision,
        taskIds: opportunity.taskOpportunities.map(task => task.id),
      })) };
  }, { moduleUrl: surface.storeModuleUrl(), sessionId });
}

async function readShuttleMovement(surface, sessionId, shuttleId) {
  return surface.page.evaluate(async ({ moduleUrl, sessionId, shuttleId }) => {
    const { useSessionStore } = await import(moduleUrl);
    const state = useSessionStore.getState();
    if (state.session?.id !== sessionId || state.connection !== 'live' || state.sessionSnapshotFreshness !== 'server') return undefined;
    const source = await (await fetch('/src/lib/firestore.ts')).text();
    const match = source.match(/from\s+["']([^"']*firebase_firestore\.js[^"']*)["']/);
    if (!match) return undefined;
    const sdk = await import(match[1]);
    const { db } = await import('/src/lib/firestore.ts');
    const snapshot = await sdk.getDoc(sdk.doc(db(), `sessions/${sessionId}/shuttleDepartures/${shuttleId}`));
    if (!snapshot.exists()) return null;
    const raw = snapshot.data();
    const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
    const requestKeys = ['status', 'requestId', 'shuttleId', 'holderUid', 'fleetGroupId', 'originShipId',
      'destinationShipId', 'cycle', 'controlRevision', 'requestedAt'];
    const transitKeys = [...requestKeys.filter(key => key !== 'originShipId'), 'transitRequestId', 'revision',
      'currentPosition', 'destinationPosition', 'velocity', 'departedAt', 'arrivesAt'];
    const allowed = raw?.status === 'requested' ? requestKeys : raw?.status === 'in-transit' ? transitKeys : [];
    if (!isRecord(raw) || !allowed.length || Object.keys(raw).some(key => !allowed.includes(key)) ||
        raw.shuttleId !== shuttleId || typeof raw.requestId !== 'string' || !raw.requestId ||
        typeof raw.holderUid !== 'string' || !raw.holderUid ||
        typeof raw.fleetGroupId !== 'string' || !raw.fleetGroupId ||
        typeof raw.destinationShipId !== 'string' || !Number.isSafeInteger(raw.cycle) ||
        raw.cycle < 1 || !Number.isSafeInteger(raw.controlRevision) || raw.controlRevision < 0 ||
        typeof raw.requestedAt !== 'string' || !Number.isFinite(Date.parse(raw.requestedAt))) return undefined;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw.holderUid));
    const holderUidHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
    const projection = { status: raw.status, requestId: raw.requestId, shuttleId: raw.shuttleId,
      holderUidHash, groupId: raw.fleetGroupId, destinationShipId: raw.destinationShipId,
      controlRevision: raw.controlRevision, cycle: raw.cycle };
    if (raw.status === 'in-transit') {
      if (typeof raw.transitRequestId !== 'string' || !raw.transitRequestId ||
          !Number.isSafeInteger(raw.revision) || raw.revision < 1) return undefined;
      if (typeof raw.departedAt !== 'string' || typeof raw.arrivesAt !== 'string' ||
          !Number.isFinite(Date.parse(raw.departedAt)) || !Number.isFinite(Date.parse(raw.arrivesAt)) ||
          Date.parse(raw.requestedAt) > Date.parse(raw.departedAt) ||
          Date.parse(raw.arrivesAt) - Date.parse(raw.departedAt) !== 60_000) return undefined;
      return { ...projection, transitRequestId: raw.transitRequestId, revision: raw.revision,
        requestedAt: raw.requestedAt, departedAt: raw.departedAt, arrivesAt: raw.arrivesAt };
    }
    return projection;
  }, { moduleUrl: surface.storeModuleUrl(), sessionId, shuttleId });
}

function actorUidHash(actor) {
  return actor?.uidHash;
}

function liveState(state, sessionId) {
  return state?.live === true && state.sessionId === sessionId && Number.isSafeInteger(state.cycle) && state.phase === 'active';
}

function expectedGroup(state, target) {
  const hostShipId = target.hostShipId ?? state?.shuttleDockings?.find(row => row.shuttleId === target.shuttleId)?.shipId;
  return hostShipId ? state.shipFleetGroupIds?.[hostShipId] : undefined;
}

function shuttleMovementWitness(sessionId, shuttleId, holderUidHash, groupId, controlRevision, cycle, movement) {
  if (movement === null) return { kind: 'shuttle-movement', exists: false, sessionId, shuttleId,
    holderUidHash, groupId, controlRevision, cycle };
  if (!movement) return null;
  return { kind: 'shuttle-movement', exists: true, status: movement.status, sessionId,
    requestId: movement.requestId, ...(movement.transitRequestId ? { transitRequestId: movement.transitRequestId } : {}),
    shuttleId, holderUidHash: movement.holderUidHash, groupId: movement.groupId,
    destinationShipId: movement.destinationShipId, controlRevision: movement.controlRevision,
    cycle: movement.cycle, ...(Number.isSafeInteger(movement.revision) ? { revision: movement.revision } : {}) };
}

function shuttleArrivalBefore(sessionId, shuttleId, holderUidHash, movement) {
  if (!movement || movement.status !== 'in-transit') return null;
  return { kind: 'shuttle-arrival-before', status: movement.status, sessionId,
    departureRequestId: movement.requestId, transitRequestId: movement.transitRequestId,
    shuttleId, holderUidHash: movement.holderUidHash, groupId: movement.groupId,
    destinationShipId: movement.destinationShipId, controlRevision: movement.controlRevision,
    cycle: movement.cycle, transitRevision: movement.revision, requestedAt: movement.requestedAt,
    departedAt: movement.departedAt, arrivesAt: movement.arrivesAt };
}

function arrivalInventory(value, absentAllowed) {
  if (value === undefined && absentAllowed) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !ARRIVAL_RESOURCE_IDS.includes(key)) ||
      Object.values(value).some(amount => !Number.isSafeInteger(amount) || amount < 0)) return null;
  return Object.fromEntries(ARRIVAL_RESOURCE_IDS.filter(key => Object.hasOwn(value, key))
    .map(key => [key, value[key]]));
}

function shuttleArrivalBalances(state, before) {
  return {
    host: arrivalInventory(state?.shipResources?.[before.destinationShipId], false),
    shuttle: arrivalInventory(state?.shuttleCargo?.[before.shuttleId], true),
  };
}

const SHUTTLE_ARRIVAL_WITNESS_KEYS = Object.freeze(['status', 'endpoint', 'sessionId', 'roleId', 'uidHash',
  'shuttleId', 'groupId', 'cycle', 'controlRevision', 'departureRequestId', 'transitRequestId',
  'destinationShipId', 'transitRevision', 'sourceAuthority']);

function validShuttleArrivalWitness(witness) {
  return witness && typeof witness === 'object' && !Array.isArray(witness) &&
    Object.keys(witness).length === SHUTTLE_ARRIVAL_WITNESS_KEYS.length &&
    Object.keys(witness).every(key => SHUTTLE_ARRIVAL_WITNESS_KEYS.includes(key)) &&
    witness.status === 'completed' && witness.endpoint === 'retargetShuttleTransit' &&
    typeof witness.sessionId === 'string' && typeof witness.roleId === 'string' &&
    typeof witness.uidHash === 'string' && /^[0-9a-f]{16}$/.test(witness.uidHash) &&
    typeof witness.shuttleId === 'string' && typeof witness.groupId === 'string' &&
    Number.isSafeInteger(witness.cycle) && witness.cycle >= 1 &&
    Number.isSafeInteger(witness.controlRevision) && witness.controlRevision >= 0 &&
    typeof witness.departureRequestId === 'string' && witness.departureRequestId.length > 0 &&
    typeof witness.transitRequestId === 'string' && witness.transitRequestId.length > 0 &&
    typeof witness.destinationShipId === 'string' &&
    Number.isSafeInteger(witness.transitRevision) && witness.transitRevision >= 1 &&
    validCurrentDocumentAuthority(witness.sourceAuthority, { sessionId: witness.sessionId,
      uidHash: witness.uidHash, groupId: witness.groupId, roleId: witness.roleId, shuttleId: witness.shuttleId });
}

function shuttleOriginAuthorityFromArrivalWitness(witness) {
  if (!validShuttleArrivalWitness(witness)) return null;
  return {
    sessionId: witness.sessionId, uidHash: witness.uidHash, shuttleId: witness.shuttleId,
    groupId: witness.groupId, cycle: witness.cycle, controlRevision: witness.controlRevision,
    sourceAuthority: witness.sourceAuthority,
  };
}

function sameShuttleOriginAuthority(left, right) {
  return exactKeys(left, SHUTTLE_ORIGIN_AUTHORITY_KEYS) && exactKeys(right, SHUTTLE_ORIGIN_AUTHORITY_KEYS) &&
    SHUTTLE_ORIGIN_AUTHORITY_KEYS.every(key => key === 'sourceAuthority'
      ? sameCurrentDocumentAuthority(left[key], right[key]) : left[key] === right[key]);
}

function priorWitnessMatchesTransit(witness, state, movement, sessionId, shuttleId, holderUidHash, roleId,
  originAuthority) {
  return validShuttleArrivalWitness(witness) && witness.sessionId === sessionId &&
    witness.roleId === roleId && witness.uidHash === holderUidHash && witness.shuttleId === shuttleId &&
    validShuttleOriginAuthority(originAuthority, { sessionId, uidHash: holderUidHash, roleId,
      shuttleId, groupId: witness.groupId, cycle: witness.cycle, controlRevision: witness.controlRevision }) &&
    sameCurrentDocumentAuthority(witness.sourceAuthority, originAuthority.sourceAuthority) &&
    sameCurrentDocumentAuthority(state?.currentDocumentAuthority, witness.sourceAuthority) &&
    witness.groupId === state?.holderGroupId && witness.cycle === state?.cycle &&
    witness.controlRevision === state?.shuttleControl?.[shuttleId]?.revision &&
    witness.departureRequestId === movement?.requestId &&
    witness.transitRequestId === movement?.transitRequestId &&
    witness.destinationShipId === movement?.destinationShipId &&
    witness.transitRevision === movement?.revision &&
    witness.groupId === state?.shipFleetGroupIds?.[movement?.destinationShipId];
}

function shuttleArrivalProjection(state, before, { movementAbsent = false, observedAt } = {}) {
  const control = state?.shuttleControl?.[before.shuttleId];
  const dockings = state?.shuttleDockings?.filter(row => row.shuttleId === before.shuttleId) ?? [];
  const visitIds = new Set([
    `shuttle-arrival-${before.transitRequestId}-departed`,
    `shuttle-arrival-${before.transitRequestId}-docked`,
  ]);
  const projection = {
    kind: 'shuttle-arrival-projection', live: state?.live === true,
    sessionId: state?.sessionId, cycle: state?.cycle, phase: state?.phase,
    turn: state?.turnPhase?.turn, progression: state?.turnPhase?.progression ?? null,
    airspaceState: state?.turnPhase?.airspace?.state ?? null,
    pressAccess: state?.turnPhase?.airspace?.pressAccess ?? null,
    timerPaused: state?.turnPhase?.timerPause !== undefined,
    holderUidHash: hashUid(control?.holderUid), controlRevision: control?.revision,
    holderGroupId: state?.holderGroupId ?? null,
    destinationGroupId: state?.shipFleetGroupIds?.[before.destinationShipId] ?? null,
    destinationActive: state?.activeVesselIds?.includes(before.destinationShipId) === true,
    resourceBalances: shuttleArrivalBalances(state, before),
  };
  if (!movementAbsent) return { ...projection, dockingCount: dockings.length };
  return { ...projection, movementAbsent: movementAbsent === true,
    dockings: dockings.map(row => ({ ...row })),
    visits: (state?.shuttleVisitLog ?? []).filter(row => visitIds.has(row.id)).map(row => ({ ...row })),
    observedAt };
}

function sourceTimedArrivalReady(state, movement, sessionId, shuttleId, holderUidHash, roleId, priorWitness,
  originAuthority,
  { armAutomatic = false } = {}) {
  const before = shuttleArrivalBefore(sessionId, shuttleId, holderUidHash, movement);
  const control = state?.shuttleControl?.[shuttleId];
  const arrivalsAt = Date.parse(before?.arrivesAt ?? '');
  const observedAtMs = Date.now();
  const remainingMs = arrivalsAt - observedAtMs;
  const manualCoordination = state?.phase === 'active' && state?.live === true &&
    state.sessionId === sessionId && state.cycle === movement?.cycle &&
    state.turnPhase?.turn === state.cycle && state.turnPhase?.progression === 'manual' &&
    state.turnPhase?.timerPause === undefined &&
    (state.turnPhase?.airspace?.state === 'lifted' ||
      shuttleId === 'snn-press-shuttle' && state.turnPhase?.airspace?.pressAccess === true);
  if (!before || !isRevision(control?.revision) || control.shuttleId !== shuttleId ||
      hashUid(control.holderUid) !== holderUidHash || control.revision !== before.controlRevision ||
      !priorWitnessMatchesTransit(priorWitness, state, movement, sessionId, shuttleId, holderUidHash, roleId,
        originAuthority) ||
      before.holderUidHash !== holderUidHash || before.groupId !== state.shipFleetGroupIds?.[before.destinationShipId] ||
      !state.activeVesselIds?.includes(before.destinationShipId) ||
      (state.shuttleDockings?.filter(row => row.shuttleId === shuttleId) ?? []).length !== 0 ||
      !manualCoordination || !Number.isFinite(arrivalsAt) ||
      (armAutomatic ? remainingMs <= 0 || remainingMs > 35_000 : remainingMs > 0)) return null;
  return { before, beforeProjection: shuttleArrivalProjection(state, before),
    sourceAuthority: state.currentDocumentAuthority, arrivalsAt, observedAtMs, remainingMs };
}

function shuttleCargoWitness(sessionId, cycle, shuttleId, holderUidHash, groupId, controlRevision,
  hostShipId, resourceId, direction, amount, shipAmount, shuttleAmount) {
  return { kind: 'shuttle-cargo', sessionId, cycle, shuttleId, holderUidHash, groupId,
    controlRevision, hostShipId, resourceId, direction, amount, shipAmount, shuttleAmount };
}

function shuttleEvacuationWitness(state, target, holderUidHash, groupId) {
  const ledger = state?.shuttleEvacuations?.[target.shuttleId];
  const currentCycleLedger = ledger?.cycle === state?.cycle;
  const sourcePopulation = state?.shipSurvivors?.[target.sourceShipId];
  const destinationPopulation = state?.shipSurvivors?.[target.destinationShipId];
  if (!isRevision(state?.shuttleControl?.[target.shuttleId]?.revision) ||
      !isRevision(ledger?.revision ?? 0) || !Number.isSafeInteger(sourcePopulation) ||
      !Number.isSafeInteger(destinationPopulation)) return null;
  return { kind: 'shuttle-evacuation', sessionId: state.sessionId, cycle: state.cycle,
    shuttleId: target.shuttleId, holderUidHash, groupId,
    controlRevision: state.shuttleControl[target.shuttleId].revision,
    sourceShipId: target.sourceShipId, destinationShipId: target.destinationShipId, amount: target.amount,
    sourcePopulation, destinationPopulation,
    ledgerCycle: ledger?.cycle ?? 0, movedThisCycle: currentCycleLedger ? ledger.moved : 0,
    evacuationRevision: ledger?.revision ?? 0 };
}

function resultRevision(result) {
  for (const key of ['revision', 'choiceRevision', 'repairRevision', 'controlRevision', 'movementRevision',
    'currentRevision', 'upgradeRevision', 'wingRevision', 'counterRevision', 'evacuationRevision',
    'rechargeRevision', 'transitRevision']) {
    if (isRevision(result?.[key])) return result[key];
  }
  if (isRevision(result?.cycle?.revision)) return result.cycle.revision;
  return null;
}

function revisionFor(endpoint, state, target, auxiliary) {
  if (endpoint === 'setGmShipConsoleWriteGrant') return undefined;
  if (endpoint === 'completeShuttleArrival') return undefined;
  if (endpoint === 'setFacilitatorCensusNote') return state?.gmLoyaltyCensus?.revision;
  if (endpoint === 'authorFacilitatorRuleCall') return state?.gmFacilitatorRuleCall?.revision ?? 0;
  if (endpoint === 'chooseBoaMissionReclamationOpportunity') {
    const opportunity = auxiliary?.opportunities?.find(row => row.id === target.opportunityId);
    return opportunity?.choiceRevision;
  }
  if (endpoint === 'recycleWithBoa') return state?.boaRecycling?.revision ?? 0;
  if (endpoint === 'runHighwallMining') return state?.highwallMining?.revision ?? 0;
  if (endpoint === 'repairMaliades') return state?.maliadesState?.revision;
  if (endpoint === 'repairConsolesFromAlly') return state?.allyRepairs?.revision ?? 0;
  if (endpoint === 'repairConsolesFromBlacksmith') return state?.blacksmithRepairs?.revision ?? 0;
  if (endpoint === 'repairConsolesFromChacau') return state?.chacauRepairs?.revision ?? 0;
  if (endpoint === 'repairConsolesFromMacaw') return state?.macawRepairs?.revision ?? 0;
  if (endpoint === 'repairConsolesFromPhilia') return state?.philiaRepairs?.revision ?? 0;
  if (endpoint === 'rechargeHostConsoleFromShuttle') return state?.serviceShuttleRecharges?.[target.shuttleId]?.revision ?? 0;
  if (endpoint === 'evacuateShuttleSurvivorsCommand') return state?.shuttleEvacuations?.[target.shuttleId]?.revision ?? 0;
  if (endpoint === 'retargetShuttleTransit') return target?.movementRevision;
  if (endpoint === 'resolveShipMutiny') return state?.shipMutinies?.[target.shipId]?.revision;
  if (endpoint === 'setFighterWingCount') return target.wingId ? state?.fighterWingCounts?.[target.wingId]?.revision : undefined;
  if (endpoint === 'rollHummingbirdHarvest' || endpoint === 'allocateHummingbirdHarvest') return auxiliary?.revision;
  if (endpoint === 'runMaintenance' || endpoint === 'rollbackMaintenance') return state?.maintenanceCycles?.[target.shipId]?.revision;
  if (target.shipId && isRevision(state?.vesselActionRevisions?.[target.shipId])) return state.vesselActionRevisions[target.shipId];
  if (target.shuttleId && isRevision(state?.shuttleControl?.[target.shuttleId]?.revision)) return state.shuttleControl[target.shuttleId].revision;
  if (target.shipId && isRevision(state?.shipDamage?.[target.shipId]?.revision)) return state.shipDamage[target.shipId].revision;
  return undefined;
}

function afterRevision(endpoint, state, target, result, auxiliary) {
  if (endpoint === 'setGmShipConsoleWriteGrant') return undefined;
  if (endpoint === 'completeShuttleArrival') return undefined;
  if (endpoint === 'setFacilitatorCensusNote') return state?.gmLoyaltyCensus?.revision;
  if (endpoint === 'authorFacilitatorRuleCall') return state?.gmFacilitatorRuleCall?.revision;
  if (endpoint === 'chooseBoaMissionReclamationOpportunity') {
    const opportunity = auxiliary?.opportunities?.find(row => row.id === target.opportunityId);
    return opportunity?.choiceRevision ?? result?.choiceRevision;
  }
  if (endpoint === 'recycleWithBoa') return state?.boaRecycling?.revision;
  if (endpoint === 'runHighwallMining') return state?.highwallMining?.revision;
  if (endpoint === 'repairMaliades') return state?.maliadesState?.revision;
  if (endpoint === 'repairConsolesFromAlly') return state?.allyRepairs?.revision;
  if (endpoint === 'repairConsolesFromBlacksmith') return state?.blacksmithRepairs?.revision;
  if (endpoint === 'repairConsolesFromChacau') return state?.chacauRepairs?.revision;
  if (endpoint === 'repairConsolesFromMacaw') return state?.macawRepairs?.revision;
  if (endpoint === 'repairConsolesFromPhilia') return state?.philiaRepairs?.revision;
  if (endpoint === 'rechargeHostConsoleFromShuttle') return state?.serviceShuttleRecharges?.[target.shuttleId]?.revision;
  if (endpoint === 'evacuateShuttleSurvivorsCommand') return state?.shuttleEvacuations?.[target.shuttleId]?.revision;
  if (endpoint === 'retargetShuttleTransit') return target?.movementRevisionAfter;
  if (endpoint === 'resolveShipMutiny') return state?.shipMutinies?.[target.shipId]?.revision;
  if (endpoint === 'setFighterWingCount') return target.wingId ? state?.fighterWingCounts?.[target.wingId]?.revision : undefined;
  if (endpoint === 'rollHummingbirdHarvest' || endpoint === 'allocateHummingbirdHarvest') return auxiliary?.revision;
  if (endpoint === 'runMaintenance' || endpoint === 'rollbackMaintenance') return state?.maintenanceCycles?.[target.shipId]?.revision;
  if (target.shipId && isRevision(state?.vesselActionRevisions?.[target.shipId])) return state.vesselActionRevisions[target.shipId];
  if (target.shuttleId && isRevision(state?.shuttleControl?.[target.shuttleId]?.revision)) return state.shuttleControl[target.shuttleId].revision;
  return resultRevision(result);
}

function resourceBalance(state, target, resource) {
  if (target.balanceSource === 'boa-host') return state?.shipResources?.[target.hostShipId]?.[resource];
  if (target.balanceSource === 'macaw-cargo') return state?.shipResources?.capybara?.[resource];
  if (target.balanceSource === 'maliades-host') return state?.shipResources?.[target.hostShipId]?.[resource];
  return undefined;
}

async function one(locator) {
  if (!locator || await locator.count() !== 1) return null;
  if (!await locator.isVisible() || !await locator.isEnabled()) return null;
  return locator;
}

async function selectActualOption(select, predicate = () => true) {
  if (!select || await select.count() !== 1 || !await select.isVisible() || !await select.isEnabled()) return null;
  const options = await select.locator('option').evaluateAll(nodes => nodes.map(node => ({
    value: node.value, text: node.textContent?.trim() ?? '',
    offered: !node.disabled && node.value !== '', enabled: !node.disabled,
  })));
  const option = options.find(candidate => predicate(candidate));
  if (!option) return null;
  await select.selectOption(option.value);
  return option;
}

export async function positiveRenderedStatus(surface, endpoint, result) {
  const texts = await surface.page.getByRole('status').allTextContents().catch(() => []);
  const joined = texts.join(' ').replace(/\s+/g, ' ').trim();
  const patterns = {
    recycleWithBoa: /recycl|scrap|exchange/i,
    runHighwallMining: /operation committed|materials|strytium ore/i,
    allocateHummingbirdHarvest: /resolved this cycle|harvest/i,
    rollHummingbirdHarvest: /roll ready|harvest/i,
    repairMaliades: /repair|damage/i,
    runMaintenance: /maintenance|step|storage|ration|reactor|production|refuell/i,
    rollbackMaintenance: /rollback|rolled back|maintenance/i,
    requestShuttleDeparture: /departure requested/i,
    beginShuttleTransit: /transit begun|in transit/i,
    completeShuttleArrival: /shuttle arrived at /i,
    retargetShuttleTransit: /course changed|retarget/i,
    transferShuttleCargoCommand: /loaded|unloaded|cargo transfer/i,
    transferShuttleControlCommand: /handed off|reclaimed/i,
    evacuateShuttleSurvivorsCommand: /moved \d[\d,]* survivors/i,
    rechargeHostConsoleFromShuttle: /recharge|recharged|charge added/i,
    authorFacilitatorRuleCall: /RULE CALL APPLIED/i,
  };
  const matches = patterns[endpoint]
    ? patterns[endpoint].test(joined) && !(endpoint === 'authorFacilitatorRuleCall' && /RULE CALL QUEUED/i.test(joined))
    : /committed|replayed|installed|dismiss|repair|transfer|arrival|departure|damage|resolved|saved|updated/i.test(joined);
  return { visible: joined.length > 0 && matches, resultStatus: result?.status ?? 'committed' };
}

function remainingGmOperation(operation, maximum = 60_000) {
  const remaining = Math.min(maximum, operation.deadlineAt - Date.now());
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('The original GM recipe operation deadline is exhausted.');
  return remaining;
}

async function verifyGmOperation(surface, operation) {
  remainingGmOperation(operation);
  const current = await observeLifecycleActor(surface, operation.original.sessionId);
  assertLateReplyAuthority(operation.current, current);
  if (!Number.isSafeInteger(current.hydrationRevision) || current.hydrationRevision < 1 ||
      current.phase !== operation.original.phase || current.cycle !== operation.original.cycle) {
    throw new Error('The accepted original GM document, phase or cycle changed during the recipe.');
  }
  remainingGmOperation(operation);
  return current;
}

async function waitForMountedGmForm(surface, panel, operation) {
  const deadlineAt = operation.readinessDeadlineAt;
  while (Date.now() < deadlineAt) {
    await verifyGmOperation(surface, operation);
    const mount = await surface.page.evaluate(() => ({
      routePath: window.location.hash.slice(1).split('?')[0],
      mainCount: document.querySelectorAll('main.gm-console').length,
      loading: Array.from(document.querySelectorAll('[role="status"]')).some(element =>
        element.textContent?.trim() === 'Opening GM console…'),
    }));
    const count = await panel.count(), visible = count === 1 && await panel.isVisible();
    await verifyGmOperation(surface, operation);
    if (Date.now() >= deadlineAt || mount.routePath !== '/gm') return false;
    if (visible) return true;
    // Only the exact source lazy fallback may wait. Mounted absent/ambiguous
    // forms remain unavailable; this never retries a disabled UI action.
    if (count > 1 || mount.mainCount !== 0 || !mount.loading) return false;
    await new Promise(resolve => setTimeout(resolve, Math.min(200, deadlineAt - Date.now())));
  }
  return false;
}

async function goToGmFormRoute(surface, operation) {
  const page = surface.page;
  const route = () => new URL(page.url()).hash.slice(1).split('?')[0];
  const budget = () => remainingGmOperation(operation, Math.min(35_000,
    operation.readinessDeadlineAt - Date.now()));
  const follow = async locator => {
    await verifyGmOperation(surface, operation);
    budget();
    const control = await one(locator);
    if (!control) return false;
    await control.click({ timeout: budget() });
    await verifyGmOperation(surface, operation);
    budget();
    return true;
  };
  await verifyGmOperation(surface, operation);
  budget();
  // Canonical GM selection certifies live authority without changing routes.
  // Use only the source's current normal links; this never reloads, reclaims
  // authority or navigates another actor's document.
  if (route() === '/ships/aegis/observer') {
    const back = page.getByRole('link', { name: '← Change role', exact: true }).and(
      page.locator('a.ship-console__back.cic-text-button[href="#/ships/aegis/roles"]'));
    if (!await follow(back) || route() !== '/ships/aegis/roles') return false;
  }
  if (route() === '/ships/aegis/roles') {
    const back = page.locator('main.ship-role-select a.session-mode__back.cic-text-button[href="#/console"]');
    if (!await follow(back) || route() !== '/console') return false;
  }
  if (route() === '/console') {
    const gmLink = page.getByRole('link', { name: 'GM Console', exact: true }).and(
      page.locator('a.role-card.cic-frame[href="#/gm"]'));
    while (Date.now() < operation.readinessDeadlineAt) {
      await verifyGmOperation(surface, operation);
      const count = await gmLink.count();
      if (count !== 0) break;
      const mounting = await page.evaluate(() => window.location.hash.slice(1).split('?')[0] === '/console' &&
        Array.from(document.querySelectorAll('[role="status"]')).some(element =>
          element.textContent?.trim() === 'Opening stations…'));
      await verifyGmOperation(surface, operation);
      if (!mounting) return false;
      await new Promise(resolve => setTimeout(resolve, Math.min(200, budget())));
    }
    if (!await follow(gmLink)) return false;
  }
  await verifyGmOperation(surface, operation);
  budget();
  return route() === '/gm';
}

async function goToShipObserver(surface, operation) {
  const page = surface.page;
  const original = operation.current;
  await verifyGmOperation(surface, operation);
  const routeHash = '#/ships/aegis/observer';
  if (new URL(page.url()).hash !== routeHash) {
    const route = new URL(page.url());
    route.hash = routeHash;
    await page.goto(route.href, { waitUntil: 'domcontentloaded', timeout: remainingGmOperation(operation, 35_000) });
  }
  // Authority and lazy mount share the original twenty-second readiness wait.
  const deadlineAt = operation.readinessDeadlineAt;
  await surface.until('Original owned GM on the AEGIS observer route', value =>
    value.sameActor === true && value.sessionId === original.sessionId && value.uidHash === original.uidHash &&
    value.playerRole === 'gm' && value.instanceId === original.instanceId && value.gmInstanceOwned === true &&
    value.connection === 'live' && value.freshness === 'server' &&
    new URL(page.url()).hash === routeHash, remainingGmOperation({ deadlineAt }, 20_000));
  const affordance = await recordLifecycleAffordance(page.getByRole('button', {
    name: 'GM ship console read write access', exact: true,
  }), { original, shipId: 'aegis', deadlineAt,
    inspectActor: () => verifyGmOperation(surface, operation),
    inspectMount: () => inspectLifecycleObserverMount(surface) });
  if (!affordance.offered) throw new Error(`Original AEGIS observer is unavailable: ${affordance.mountStatus}.`);
  return verifyGmOperation(surface, operation);
}

async function readCurrentWriteGrant(surface, expected) {
  return surface.page.evaluate(async ({ moduleUrl, expected }) => {
    const { useSessionStore } = await import(moduleUrl);
    const state = useSessionStore.getState();
    if (!state.session || !state.me || state.connection !== 'live' || state.sessionSnapshotFreshness !== 'server' ||
        state.session.id !== expected.sessionId || state.me.role !== 'gm' ||
        state.gmInstance?.sessionId !== expected.sessionId || state.gmInstance?.id !== expected.instanceId ||
        state.gmInstance?.uid !== state.me.uid) return null;
    const { listGmInstances, reconcileGmAuthority } = await import('/src/lib/sessionService.ts');
    await reconcileGmAuthority();
    const instances = await listGmInstances();
    const matching = instances.filter(instance => instance.id === expected.instanceId &&
      instance.sessionId === expected.sessionId && instance.uid === state.me.uid);
    if (matching.length !== 1) return null;
    const instance = matching[0];
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state.me.uid));
    const uidHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
    const grantShipId = instance.shipConsoleWriteGrant?.shipId ?? null;
    const claimedAt = typeof instance.claimedAt === 'string' ? instance.claimedAt : null;
    if (uidHash !== expected.uidHash || !claimedAt || !Number.isFinite(Date.parse(claimedAt)) ||
        state.gmInstance.claimedAt !== claimedAt) return null;
    const claimedAtDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(claimedAt)));
    const claimedAtHash = [...new Uint8Array(claimedAtDigest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 20);
    return {
      projection: { kind: 'gm-ship-console-write-grant', live: true, sessionId: expected.sessionId,
        cycle: state.session.currentTurn, uidHash, instanceId: expected.instanceId,
        shipId: grantShipId === 'aegis' ? 'aegis' : null, targetShipId: 'aegis',
        enabled: grantShipId === 'aegis',
        claimedAtHash },
      claimedAt,
    };
  }, { moduleUrl: surface.storeModuleUrl(), expected });
}

async function readCertifiedWriteGrant(surface, expected, operation) {
  await verifyGmOperation(surface, operation);
  const grant = await readCurrentWriteGrant(surface, expected);
  await verifyGmOperation(surface, operation);
  return grant?.claimedAt === operation.original.claimedAt ? grant : null;
}

async function reloadMountedGm(surface, expected, operation) {
  await verifyGmOperation(surface, operation);
  await surface.page.reload({ waitUntil: 'domcontentloaded', timeout: remainingGmOperation(operation, 35_000) });
  const deadlineAt = Math.min(operation.deadlineAt, Date.now() + 20_000), original = operation.original;
  operation.readinessDeadlineAt = deadlineAt;
  while (Date.now() < deadlineAt) {
    const actor = await observeLifecycleActor(surface, expected.sessionId);
    if (actor.hasAuth && actor.uidHash !== original.uidHash || actor.sessionId !== null && actor.sessionId !== original.sessionId ||
        actor.instanceId !== null && actor.instanceId !== original.instanceId ||
        actor.claimedAt !== null && actor.claimedAt !== original.claimedAt || actor.privateAudienceMatches !== true ||
        actor.foreignPendingCount !== 0 || actor.playerRole !== null && actor.playerRole !== 'gm' ||
        actor.hasAuth && actor.instanceId !== null && actor.gmInstanceOwned !== true ||
        actor.phase !== null && actor.phase !== original.phase || actor.cycle !== null && actor.cycle !== original.cycle) {
      assert.fail('The genuine GM reload lost its original identity, claim, private audience, phase or cycle.');
    }
    if (actor.hasAuth && actor.sameActor && actor.sessionId === original.sessionId &&
        actor.playerRole === 'gm' && actor.gmInstanceOwned === true && actor.instanceId === original.instanceId &&
        actor.claimedAt === original.claimedAt && actor.connection === 'live' && actor.freshness === 'server' &&
        Number.isSafeInteger(actor.hydrationRevision) && actor.hydrationRevision >= 1) {
      // A genuine reload accepts its new document generation/hydration. Pin
      // that certificate while retaining the original Auth UID and GM claim.
      assertOriginalActor(actor, actor, { gm: true });
      operation.current = actor;
      const state = await readActionState(surface);
      await verifyGmOperation(surface, operation);
      return { actor, state };
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(200, deadlineAt - Date.now())));
  }
  assert.fail('The genuine GM reload was not accepted within its original remaining operation budget.');
}

async function waitForActionState(surface, predicate, operation, timeoutMs = 15_000) {
  const deadline = Math.min(operation.deadlineAt, Date.now() + timeoutMs);
  while (Date.now() < deadline) {
    await verifyGmOperation(surface, operation);
    const state = await readActionState(surface).catch(() => null);
    await verifyGmOperation(surface, operation);
    if (state && predicate(state)) return state;
    await new Promise(resolve => setTimeout(resolve, Math.min(100, deadline - Date.now())));
  }
  return null;
}

async function censusProjection(state, targetUid, expected, surface, operation) {
  await verifyGmOperation(surface, operation);
  const entry = state?.gmLoyaltyCensus?.entries?.find(value => value.uid === targetUid);
  if (!entry || state.gmLoyaltyCensusStatus !== 'present' || !isRevision(state.gmLoyaltyCensus?.revision) ||
      !liveState(state, expected.sessionId) || state.cycle !== expected.cycle) return null;
  return { kind: 'facilitator-census', live: true,
    sessionId: state.sessionId, cycle: state.cycle, uidHash: expected.uidHash,
    instanceId: expected.instanceId, revision: state.gmLoyaltyCensus.revision,
    targetUidHash: hashUid(targetUid), noteHash: proofHash(entry.note ?? '') };
}

function ruleCallProjection(state, expected) {
  const call = state?.gmFacilitatorRuleCall;
  if (!call) return null;
  return { kind: 'facilitator-rule-call', live: state.live === true, sessionId: call.sessionId,
    cycle: state.cycle, uidHash: expected.uidHash, instanceId: expected.instanceId,
    revision: call.revision, callId: call.callId, actorUidHash: hashUid(call.actorUid),
    label: call.label, audience: call.audience,
    ambiguityHash: proofHash(call.ambiguity), sourceHash: proofHash(call.source), decisionHash: proofHash(call.decision) };
}

async function captureMountedUiCallable(surface, endpoint, click, operation) {
  const response = await observeUiReceipt({
    waitForResponse: () => surface.page.waitForResponse(value => value.request().method() === 'POST' &&
      new URL(value.url()).pathname.endsWith(`/us-central1/${endpoint}`), { timeout: remainingGmOperation(operation, 20_000) }),
    choose: click,
  });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  return { request: response.request().postDataJSON()?.data,
    response: { httpStatus: response.status(), result: body?.result } };
}

async function enableMountedGmGrant(surface, expected, claimedAt, operation) {
  const access = surface.page.getByRole('button', { name: 'GM ship console read write access', exact: true });
  const captured = await captureMountedUiCallable(surface, 'setGmShipConsoleWriteGrant', async () => {
    await verifyGmOperation(surface, operation);
    const before = await readCertifiedWriteGrant(surface, expected, operation);
    if (!before || before.claimedAt !== claimedAt || before.projection.enabled !== false ||
        !await one(access) || await access.getAttribute('aria-pressed') !== 'false') {
      throw new Error('The original observer is not read-only for its own explicit UI grant.');
    }
    await access.click({ timeout: remainingGmOperation(operation, 35_000) });
    const dialog = surface.page.getByRole('alertdialog', { name: 'Are you sure?', exact: true });
    const confirm = await one(dialog.getByRole('button', { name: 'ARE YOU SURE?', exact: true }));
    if (!confirm) throw new Error('The original observer grant confirmation is unavailable.');
    await verifyGmOperation(surface, operation);
    await confirm.click({ timeout: remainingGmOperation(operation, 35_000) });
  }, operation);
  await verifyGmOperation(surface, operation);
  const after = await readCertifiedWriteGrant(surface, expected, operation);
  const request = captured.request, result = captured.response.result;
  if (Object.keys(request ?? {}).length !== 5 || request?.sessionId !== expected.sessionId ||
      request.instanceId !== expected.instanceId || request.shipId !== 'aegis' || request.enabled !== true ||
      request.claimedAt !== claimedAt || captured.response.httpStatus !== 200 ||
      Object.keys(result ?? {}).length !== 2 || result?.enabled !== true || result.shipId !== 'aegis' ||
      after?.projection.enabled !== true || after.claimedAt !== claimedAt ||
      await access.getAttribute('aria-pressed') !== 'true' ||
      await surface.page.locator('.ship-console').getAttribute('data-observer-mode') !== 'write') {
    throw new Error('The exact original same-document UI enable receipt and source grant are not verified.');
  }
  return { ...captured, rendered: { visible: true, controlPressed: true, observerMode: 'write' },
    afterEnable: { actor: await verifyGmOperation(surface, operation), projection: after.projection } };
}

async function revokeMountedGmGrant(surface, expected, claimedAt, operation) {
  await verifyGmOperation(surface, operation);
  // A cleanup receipt must come from the still-mounted original observer.
  // Returning to that route could mount a new cleanup lifecycle and is not
  // the explicit same-document UI revoke certified by this procedure.
  if (new URL(surface.page.url()).hash !== '#/ships/aegis/observer') return null;
  const mount = await inspectLifecycleObserverMount(surface);
  await verifyGmOperation(surface, operation);
  if (mount.routePath !== '/ships/aegis/observer' || mount.observerMainCount !== 1 ||
      mount.shipId !== 'aegis' || mount.observerMode !== 'write' || mount.roleControlCount !== 1 ||
      !mount.selectedRoleId || mount.selectedRoleValid !== true || mount.loading || mount.failed) return null;
  const before = await readCertifiedWriteGrant(surface, expected, operation).catch(() => null);
  if (!before?.projection.enabled || before.claimedAt !== claimedAt) return null;
  const access = surface.page.getByRole('button', { name: 'GM ship console read write access', exact: true });
  const captured = await captureMountedUiCallable(surface, 'setGmShipConsoleWriteGrant', async () => {
    await verifyGmOperation(surface, operation);
    if (await access.count() !== 1 || !await access.isVisible() || !await access.isEnabled() ||
        await access.getAttribute('aria-pressed') !== 'true' ||
        await surface.page.locator('.ship-console').getAttribute('data-observer-mode') !== 'write') {
      throw new Error('The owned AEGIS write grant is not visible and enabled for revocation.');
    }
    await access.click({ timeout: remainingGmOperation(operation, 35_000) });
  }, operation).catch(() => null);
  if (!captured) return null;
  await verifyGmOperation(surface, operation);
  let visible = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    await verifyGmOperation(surface, operation);
    visible = await access.count() === 1 && await access.isVisible() &&
      await access.getAttribute('aria-pressed') === 'false' &&
      await surface.page.locator('.ship-console').getAttribute('data-observer-mode') === 'read';
    if (visible) break;
    await new Promise(resolve => setTimeout(resolve, remainingGmOperation(operation, 100)));
  }
  const reloaded = await reloadMountedGm(surface, expected, operation);
  const after = await readCertifiedWriteGrant(surface, expected, operation).catch(() => null);
  if (!visible || !after || after.claimedAt !== claimedAt) return null;
  return {
    restore: { request: captured.request, response: captured.response,
      rendered: { visible: true, enabled: false, controlPressed: false, observerMode: 'read' },
      afterReload: { actor: reloaded.actor, projection: after.projection } },
    state: reloaded.state,
    sourceAfter: { live: reloaded.state?.live === true && after.projection.enabled === false, sessionId: reloaded.state?.sessionId,
      cycle: reloaded.state?.cycle, revision: reloaded.state?.vesselActionRevisions?.aegis },
  };
}

function currentShip(state, roleId) {
  const preferred = SHIP_FOR_ROLE[roleId];
  if (preferred && state?.activeVesselIds?.includes(preferred)) return preferred;
  return state?.activeVesselIds?.find(shipId => state.vesselActionRevisions?.[shipId] !== undefined);
}

function mountedTarget(spec, actor, state, expectedOverrides = {}) {
  const target = { ...(expectedOverrides.target ?? {}) };
  const roleId = expectedOverrides.roleId ?? (spec.actorRoleId === 'current-shuttle-holder'
    ? actor?.activeConsoleRoleId : spec.actorRoleId === 'current-ally-holder' ? actor?.activeConsoleRoleId : spec.actorRoleId);
  if (!target.shipId && spec.endpoint === 'repairMaliades') target.shipId = 'dione';
  if (!target.shuttleId && spec.endpoint === 'repairMaliades') target.shuttleId = 'maliades';
  if (!target.shuttleId && spec.endpoint === 'recycleWithBoa') target.shuttleId = 'boa';
  if (!target.shuttleId && spec.endpoint === 'runHighwallMining') target.shuttleId = 'highwall';
  if (!target.shuttleId && (spec.endpoint === 'rollHummingbirdHarvest' || spec.endpoint === 'allocateHummingbirdHarvest')) target.shuttleId = 'hummingbird';
  if (!target.shuttleId && REPAIR_PANELS[spec.endpoint]) target.shuttleId = ({
    repairConsolesFromAlly: 'ally', repairConsolesFromBlacksmith: 'blacksmith',
    repairConsolesFromChacau: 'chacau', repairConsolesFromMacaw: 'macaw',
    repairConsolesFromPhilia: 'philia',
  })[spec.endpoint];
  if (!target.shipId && spec.endpoint === 'runHighwallMining') target.shipId = 'icebreaker';
  if (!target.shipId && ['addShipDamage', 'repairAllShipDamage', 'applyShipCounterSteps', 'dismissPopulationAlert',
    'dismissUnrestAlert', 'resolveShipMutiny', 'scavengeDestroyedShipStores', 'setFighterWingCount',
    'setGmShipConsoleWriteGrant', 'setShipConsoleLock']
    .includes(spec.endpoint)) target.shipId = currentShip(state, roleId);
  if (!target.shipId && REPAIR_PANELS[spec.endpoint]) target.shipId = currentShip(state, roleId);
  if (!target.shuttleId && spec.actorRoleId === 'current-ally-holder') target.shuttleId = 'ally';
  return { target, roleId };
}

async function planFor({ spec, surface, actor, state, context, target, gmOperation }) {
  const page = surface.page;
  const endpoint = spec.endpoint;
  const block = reason => ({ offered: false, reason });
  const click = async locator => {
    const actual = await one(locator);
    if (!actual) return block('the exact source-rendered control is absent, disabled, or ambiguous');
    return { offered: true, click: () => actual.click() };
  };
  if (UNVERIFIABLE_GM_CHOICES.has(endpoint)) return block('requires an explicit live GM-authored choice and a source receipt not safely verifiable by this finite recipe');
  let originalGm;
  if (CERTIFIED_GM_RECIPES.has(endpoint)) {
    try {
      remainingGmOperation(gmOperation);
      originalGm = await observeLifecycleActor(surface, context.initial.sessionId);
      assertOriginalActor(originalGm, originalGm, { gm: true });
      if (originalGm.uidHash !== context.initial.uidHash || originalGm.uidHash !== context.started?.uidHash ||
          originalGm.instanceId !== context.started?.instanceId ||
          originalGm.uidHash !== actor.uidHash || originalGm.sessionId !== context.initial.sessionId ||
          originalGm.instanceId !== actor.instanceId || originalGm.phase !== 'active' || originalGm.cycle !== state.cycle ||
          !Number.isSafeInteger(originalGm.hydrationRevision) || originalGm.hydrationRevision < 1 ||
          typeof originalGm.claimedAt !== 'string' || !Number.isFinite(Date.parse(originalGm.claimedAt))) {
        return block('the original current GM document, claim or private audience is not verified');
      }
    } catch { return block('the original current GM document, claim or private audience is not verified'); }
    target.gmRecipeAuthority = originalGm;
    gmOperation.original = originalGm;
    gmOperation.current = originalGm;
    gmOperation.readinessDeadlineAt = Math.min(gmOperation.deadlineAt, Date.now() + 20_000);
  }
  const verifyGmDocument = () => verifyGmOperation(surface, gmOperation);
  if (target.shuttleId && new URL(page.url()).hash !== `#/shuttles/${target.shuttleId}`) {
    const route = page.locator(`a[href$="/shuttles/${target.shuttleId}"]`);
    const offeredRoute = await one(route);
    if (!offeredRoute) return block('the selected original actor has no current visible normal-navigation link to this craft console');
    await offeredRoute.click();
    await page.waitForURL(url => url.hash === `#/shuttles/${target.shuttleId}`, { timeout: 10_000 });
    const afterNavigation = await surface.observe();
    if (afterNavigation.uidHash !== actor.uidHash || afterNavigation.sessionId !== context.initial.sessionId ||
        afterNavigation.activeConsoleRoleId !== actor.activeConsoleRoleId || afterNavigation.connection !== 'live' ||
        afterNavigation.freshness !== 'server') return block('normal craft navigation changed actor, role, session, or freshness');
  }

  if (endpoint === 'setGmShipConsoleWriteGrant' || endpoint === 'setShipConsoleLock') {
    if (target.shipId !== 'aegis' || !state.activeVesselIds?.includes('aegis')) {
      return block('AEGIS is not the source-projected active vessel for this current GM instance');
    }
    const gmExpected = { sessionId: context.initial.sessionId, uidHash: actor.uidHash,
      instanceId: actor.instanceId, cycle: state.cycle };
    const onRouteActor = await goToShipObserver(surface, gmOperation)
      .catch(() => null);
    if (!onRouteActor || onRouteActor.playerRole !== 'gm') return block('the original owned GM could not reach the mounted AEGIS observer UI');
    const grant = await readCertifiedWriteGrant(surface, gmExpected, gmOperation).catch(() => null);
    if (!grant || grant.projection.cycle !== state.cycle) return block('the current owned GM lease and AEGIS grant projection could not be verified');
    target.gmGrantBefore = grant.projection;
    target.gmClaimedAt = grant.claimedAt;
    const lockRevision = state.vesselActionRevisions?.aegis;
    const lockPanel = page.getByRole('region', { name: 'ICN console lock', exact: true });
    const releaseControl = lockPanel.getByRole('button', { name: 'Release ICN console lock', exact: true });
    const lockMounted = state.shipConsoleLocks?.aegis === true && isRevision(lockRevision) &&
      await releaseControl.count() === 1 && await releaseControl.isVisible();

    if (endpoint === 'setGmShipConsoleWriteGrant') {
      if (grant.projection.enabled) return block('the current owned GM already has the AEGIS write grant; no toggle is attempted');
      if (!lockMounted) return block('AEGIS is not source-locked at a current vessel action revision before grant enablement');
      const control = await one(page.getByRole('button', { name: 'GM ship console read write access', exact: true }));
      if (!control || await control.getAttribute('aria-pressed') !== 'false') return block('the actual AEGIS observer access control is not visibly read-only');
      return { offered: true, beforeProjection: grant.projection, click: async () => {
        await verifyGmDocument();
        const latestGrant = await readCertifiedWriteGrant(surface, gmExpected, gmOperation);
        const currentState = await readActionState(surface);
        if (!latestGrant || latestGrant.projection.enabled || latestGrant.claimedAt !== target.gmClaimedAt ||
            !liveState(currentState, gmExpected.sessionId) || currentState.shipConsoleLocks?.aegis !== true ||
            currentState.vesselActionRevisions?.aegis !== lockRevision ||
            currentState.cycle !== state.cycle || !currentState.activeVesselIds?.includes('aegis') ||
            await control.getAttribute('aria-pressed') !== 'false') {
          throw new Error('Current GM lease, AEGIS activity, or source write-grant control changed before the UI confirmation.');
        }
        await control.click({ timeout: remainingGmOperation(gmOperation, 35_000) });
        const dialog = page.getByRole('alertdialog', { name: 'Are you sure?', exact: true });
        const confirm = await one(dialog.getByRole('button', { name: 'ARE YOU SURE?', exact: true }));
        if (!confirm) throw new Error('The visible source confirmation for AEGIS write access is unavailable.');
        await verifyGmDocument();
        await confirm.click({ timeout: remainingGmOperation(gmOperation, 35_000) });
        target.gmGrantEnableAttempted = true;
      } };
    }

    if (grant.projection.enabled !== false || !lockMounted) {
      return block('AEGIS must be source-locked at a current vessel action revision with the original GM visibly read-only before its own UI grant');
    }
    target.gmLockBefore = { kind: 'ship-console-lock', live: true, sessionId: state.sessionId,
      cycle: state.cycle, uidHash: actor.uidHash, instanceId: actor.instanceId, shipId: 'aegis',
      locked: true, revision: lockRevision, grantEnabled: false };
    if (await releaseControl.count() !== 1 || !await releaseControl.isVisible()) {
      return block('the actual AEGIS release-lock control is absent or ambiguous');
    }
    return { offered: true, click: async () => {
      await verifyGmDocument();
      const latestGrant = await readCertifiedWriteGrant(surface, gmExpected, gmOperation);
      const currentState = await readActionState(surface);
      if (latestGrant?.projection.enabled !== false || currentState.shipConsoleLocks?.aegis !== true ||
          currentState.vesselActionRevisions?.aegis !== lockRevision ||
          latestGrant.claimedAt !== target.gmClaimedAt) {
        throw new Error('The current AEGIS lock, read-only authority or vessel revision changed before the explicit UI grant.');
      }
      target.gmLockGrantEnable = await enableMountedGmGrant(surface, gmExpected, target.gmClaimedAt, gmOperation);
      const grantedState = await readActionState(surface);
      await verifyGmDocument();
      if (!liveState(grantedState, gmExpected.sessionId) || grantedState.cycle !== state.cycle ||
          grantedState.shipConsoleLocks?.aegis !== true || grantedState.vesselActionRevisions?.aegis !== lockRevision ||
          !grantedState.activeVesselIds?.includes('aegis') || !await one(releaseControl)) {
        throw new Error('The enabled original observer no longer offers this exact current source lock release.');
      }
      target.gmLockBefore.grantEnabled = target.gmLockGrantEnable.afterEnable.projection.enabled;
      await releaseControl.click({ timeout: remainingGmOperation(gmOperation, 35_000) });
    } };
  }

  if (endpoint === 'setFacilitatorCensusNote') {
    const census = state.gmLoyaltyCensus;
    if (!liveState(state, context.initial.sessionId) || state.gmLoyaltyCensusStatus !== 'present' ||
        !isRevision(census?.revision) || !Array.isArray(census.entries)) {
      return block('the current facilitator census and revision are not source-projected');
    }
    const entry = census.entries.find(value => typeof value?.uid === 'string' && value.uid.length > 0);
    if (!entry) return block('the current source census has no eligible target entry');
    target.censusUid = entry.uid;
    target.censusNote = 'Automated virtual personas only; 0 physical humans.';
    target.censusBefore = { kind: 'facilitator-census', live: true, sessionId: state.sessionId,
      cycle: state.cycle, uidHash: actor.uidHash, instanceId: actor.instanceId, revision: census.revision,
      targetUidHash: hashUid(entry.uid), entryPresent: true };
    if (!await goToGmFormRoute(surface, gmOperation)) return block('the original GM has no exact mounted normal route to the census form');
    const noteField = page.getByLabel(`Facilitator note for ${entry.uid}`, { exact: true });
    if (!await waitForMountedGmForm(surface, noteField, gmOperation)) return block('the actual current census row note control is not offered');
    const row = noteField.locator('xpath=ancestor::tr');
    const save = await one(row.getByRole('button', { name: 'Save note', exact: true }));
    if (!save || !await one(noteField)) return block('the actual current census row note control is not offered');
    return { offered: true, click: async () => {
      await verifyGmDocument();
      const latest = await readActionState(surface);
      const liveEntry = latest.gmLoyaltyCensus?.entries?.find(value => value.uid === target.censusUid);
      if (!liveState(latest, context.initial.sessionId) || latest.cycle !== state.cycle ||
          latest.gmLoyaltyCensusStatus !== 'present' || latest.gmLoyaltyCensus?.revision !== census.revision || !liveEntry ||
          await noteField.isEnabled() !== true) {
        throw new Error('The actual census target or source revision changed before saving the note.');
      }
      await noteField.fill(target.censusNote, { timeout: remainingGmOperation(gmOperation, 35_000) });
      await verifyGmDocument();
      const afterInput = await readActionState(surface);
      if (!liveState(afterInput, context.initial.sessionId) || afterInput.cycle !== state.cycle ||
          afterInput.gmLoyaltyCensusStatus !== 'present' || afterInput.gmLoyaltyCensus?.revision !== census.revision ||
          !afterInput.gmLoyaltyCensus.entries.some(value => value.uid === target.censusUid)) {
        throw new Error('The actual census source changed while filling the mounted note.');
      }
      if (!await one(save)) throw new Error('The actual census save control is no longer enabled.');
      await save.click({ timeout: remainingGmOperation(gmOperation, 35_000) });
    } };
  }

  if (endpoint === 'authorFacilitatorRuleCall') {
    const rule = state.gmFacilitatorRuleCall;
    if (rule && (rule.sessionId !== context.initial.sessionId || !isRevision(rule.revision))) {
      return block('the existing facilitator rule-call source revision is malformed or foreign');
    }
    target.ruleCallRevision = rule?.revision ?? 0;
    target.ruleCallInput = { ambiguity: 'How is attendance represented in this virtual rehearsal?',
      source: 'The mounted full-game training disclosure and simulated-demo attendance mode',
      decision: 'Only named automated Auth personas are represented; no physical humans or device attendance is proved.',
      audience: 'gm-only' };
    if (!await goToGmFormRoute(surface, gmOperation)) return block('the original GM has no exact mounted normal route to the rule-call form');
    const panel = page.getByRole('region', { name: 'Facilitator rule call', exact: true });
    if (!await waitForMountedGmForm(surface, panel, gmOperation)) return block('the actual source rule-call form is not mounted and writable');
    const ambiguity = panel.getByLabel('Question or ambiguity', { exact: true });
    const source = panel.getByLabel('Source or reference', { exact: true });
    const decision = panel.getByLabel('Decision', { exact: true });
    const audience = panel.getByLabel('Audience', { exact: true });
    const supersedes = panel.getByLabel('Supersedes call ID (optional)', { exact: true });
    const record = panel.getByRole('button', { name: 'Record rule call', exact: true });
    if (!await one(panel) || await record.count() !== 1 || !await record.isVisible() ||
        !await one(ambiguity) || !await one(source) || !await one(decision) ||
        !await one(audience) || !await one(supersedes)) return block('the actual source rule-call form is not mounted and writable');
    return { offered: true, click: async () => {
      await verifyGmDocument();
      const latest = await readActionState(surface);
      const latestRule = latest.gmFacilitatorRuleCall;
      if (!liveState(latest, context.initial.sessionId) || latest.cycle !== state.cycle ||
          (latestRule?.revision ?? 0) !== target.ruleCallRevision ||
          latestRule && latestRule.sessionId !== context.initial.sessionId) {
        throw new Error('The facilitator rule-call revision changed before recording the mounted decision.');
      }
      await ambiguity.fill(target.ruleCallInput.ambiguity, { timeout: remainingGmOperation(gmOperation, 35_000) });
      await source.fill(target.ruleCallInput.source, { timeout: remainingGmOperation(gmOperation, 35_000) });
      await decision.fill(target.ruleCallInput.decision, { timeout: remainingGmOperation(gmOperation, 35_000) });
      await audience.selectOption('gm-only', { timeout: remainingGmOperation(gmOperation, 35_000) });
      await supersedes.fill('', { timeout: remainingGmOperation(gmOperation, 35_000) });
      await verifyGmDocument();
      const afterInput = await readActionState(surface), afterRule = afterInput.gmFacilitatorRuleCall;
      if (!liveState(afterInput, context.initial.sessionId) || afterInput.cycle !== state.cycle ||
          (afterRule?.revision ?? 0) !== target.ruleCallRevision ||
          afterRule && afterRule.sessionId !== context.initial.sessionId) {
        throw new Error('The facilitator rule-call source changed while filling the mounted decision.');
      }
      if (!await one(record)) throw new Error('The filled source rule-call form does not enable Record rule call.');
      await record.click({ timeout: remainingGmOperation(gmOperation, 35_000) });
    } };
  }

  if (endpoint === 'allocateHummingbirdHarvest' || endpoint === 'rollHummingbirdHarvest') {
    const panel = page.getByRole('region', { name: 'Hummingbird resource harvesting', exact: true });
    const name = endpoint === 'rollHummingbirdHarvest' ? 'Roll 2d6 for harvest' : /^Die [12]:/;
    const locator = panel.getByRole('button', { name, exact: typeof name === 'string' });
    const actual = await one(locator.first());
    return actual ? { offered: true, click: () => actual.click() } : block('no current server-authorized Hummingbird roll/allocation control is offered');
  }

  if (endpoint === 'chooseBoaMissionReclamationOpportunity') {
    const workspace = await readBoaWorkspace(surface, context.initial.sessionId).catch(() => null);
    const available = workspace?.opportunities?.find(item => item.taskIds.length > 0);
    if (!workspace || !available) return block('the authenticated Boa workspace has no current unstarted printed task');
    target.opportunityId = available.id;
    target.opportunityIndex = workspace.opportunities.indexOf(available);
    target.taskId = available.taskIds[0];
    target.expectedChoiceRevision = available.choiceRevision;
    const locations = page.getByRole('region', { name: 'Current fleet mission locations', exact: true });
    const selection = page.getByRole('region', { name: 'Mission task selection', exact: true });
    return { offered: true, expectedChoiceRevision: available.choiceRevision,
      click: async () => {
        if (!await selection.count() || !await selection.isVisible()) {
          const locationButtons = locations.getByRole('button');
          if (!await locationButtons.count()) throw new Error('Boa mission locations disappeared before selection.');
          const first = locationButtons.nth(target.opportunityIndex);
          if (!await first.isEnabled()) throw new Error('The printed Boa location is no longer selectable.');
          await first.click();
        }
        const chosen = await one(selection.locator(`input[type="radio"][value="${target.taskId}"]`));
        if (!chosen) throw new Error('No live printed mission task is selectable.');
        const apply = await one(selection.getByRole('button', { name: /^Apply Boa reclamation to / }));
        if (!apply) throw new Error('The selected task is not available for the current mission.');
        await chosen.check();
        await apply.click();
      } };
  }

  if (endpoint === 'recycleWithBoa') {
    const panel = page.getByRole('region', { name: 'Boa recycling', exact: true });
    const docking = state.shuttleDockings?.filter(row => row.shuttleId === 'boa') ?? [];
    if (docking.length !== 1 || state.shuttleFuelled?.boa !== true || state.turnPhase?.airspace?.state !== 'lifted')
      return block('Boa must be uniquely docked, fuelled, and in the live Coordination window');
    const host = docking[0].shipId, resources = state.shipResources?.[host];
    if (!resources) return block('the current docked host inventory is not server-projected');
    const options = Object.entries(RESOURCE_COSTS).map(([value, cost]) => ({ value, cost,
      offered: true, enabled: Number.isSafeInteger(resources[value]) && resources[value] >= cost }));
    const chosen = chooseOfferedAffordableOption(options, Number.MAX_SAFE_INTEGER);
    if (!chosen) return block('no printed Boa recipe is currently affordable from the docked host');
    target.hostShipId = host;
    target.balanceSource = 'boa-host';
    target.expectedCost = { resource: chosen.value, amount: chosen.cost, direction: 'debit' };
    const select = panel.getByLabel('Resource to recycle', { exact: true });
    const button = panel.getByRole('button', { name: /^Recycle .* for 1 Scrap$/ });
    return { offered: true, expectedCost: { resource: chosen.value, amount: chosen.cost, direction: 'debit' },
      click: async () => { await select.selectOption(chosen.value); const actual = await one(button); if (!actual) throw new Error('The actual Boa exchange is not enabled.'); await actual.click(); } };
  }

  if (REPAIR_PANELS[endpoint]) {
    const panel = page.getByRole('region', { name: REPAIR_PANELS[endpoint], exact: true });
    const boxes = panel.getByRole('checkbox');
    const apply = panel.getByRole('button', { name: 'Repair selected consoles', exact: true });
    const shuttleId = endpoint === 'repairConsolesFromAlly' ? 'ally' : endpoint === 'repairConsolesFromBlacksmith' ? 'blacksmith'
      : endpoint === 'repairConsolesFromChacau' ? 'chacau' : endpoint === 'repairConsolesFromMacaw' ? 'macaw' : 'philia';
    const docking = state.shuttleDockings?.filter(row => row.shuttleId === shuttleId) ?? [];
    if (docking.length === 1) target.hostShipId = docking[0].shipId;
    target.balanceSource = endpoint === 'repairConsolesFromMacaw' ? 'macaw-cargo' : 'maliades-host';
    target.expectedCost = endpoint === 'repairConsolesFromMacaw'
      ? { resource: 'scrap', amount: 1, direction: 'debit' }
      : { resource: 'materials', amount: 4, direction: 'debit' };
    return { offered: true, expectedCost: target.expectedCost, click: async () => {
      const first = await one(boxes.first());
      if (!first) throw new Error('No actually damaged console is offered for this repair.');
      await first.check();
      target.selectedRepairCount = 1;
      const actual = await one(apply); if (!actual) throw new Error('The selected current damage is not repairable.');
      await actual.click();
    } };
  }

  if (endpoint === 'repairMaliades') {
    const panel = page.getByRole('region', { name: 'Maliades operations', exact: true });
    const docking = state.shuttleDockings?.filter(row => row.shuttleId === 'maliades') ?? [];
    if (docking.length === 1) target.hostShipId = docking[0].shipId;
    target.balanceSource = 'maliades-host';
    target.expectedCost = { resource: 'materials', amount: 1, direction: 'debit' };
    return click(panel.getByRole('button', { name: 'Repair 1 damage', exact: true }));
  }
  if (endpoint === 'runHighwallMining') {
    const panel = page.getByRole('region', { name: 'Highwall mining operations', exact: true });
    const options = ['Roll 1d6 materials', 'Roll 3d6 strytium ore'];
    for (const name of options) {
      const action = await one(panel.getByRole('button', { name, exact: true }));
      if (action) return { offered: true, click: () => action.click() };
    }
    return block('no source-authorized Highwall operation is offered this cycle');
  }

  if (endpoint === 'rechargeHostConsoleFromShuttle') {
    const panel = page.getByRole('region', { name: 'Service shuttle recharge', exact: true });
    const docking = state.shuttleDockings?.filter(row => row.shuttleId === target.shuttleId) ?? [];
    const control = state.shuttleControl?.[target.shuttleId];
    if (docking.length !== 1 || !control || hashUid(control.holderUid) !== actor.uidHash || !isRevision(control.revision)) {
      return block('the current actor must hold the service shuttle at one unique docked host');
    }
    target.hostShipId = docking[0].shipId;
    const hostMaintenance = state.maintenanceCycles?.[target.hostShipId];
    const serviceLedger = state.serviceShuttleRecharges?.[target.shuttleId];
    const serviceRevision = serviceLedger?.revision ?? 0;
    const groupId = state.shipFleetGroupIds?.[target.hostShipId];
    if (!state.activeVesselIds?.includes(target.hostShipId) || typeof groupId !== 'string' ||
        state.turnPhase?.turn !== state.cycle || state.turnPhase?.airspace?.state !== 'lifted' ||
        state.turnPhase?.timerPause !== undefined || state.shuttleFuelled?.[target.shuttleId] !== true ||
        state.shipDamage?.[target.hostShipId]?.destroyed === true ||
        !hostMaintenance || hostMaintenance.turn !== state.cycle || typeof hostMaintenance.completedAt !== 'string' ||
        !isRevision(hostMaintenance.revision) || !isRevision(serviceRevision) || serviceLedger?.cycle === state.cycle) {
      return block('the current Coordination window, fuel, host maintenance, and unused recharge ledger must be source-confirmed');
    }
    target.maintenanceRevision = hostMaintenance.revision;
    target.serviceRevision = serviceRevision;
    target.hostGroupId = groupId;
    const select = panel.getByLabel('Host console', { exact: true });
    return { offered: true, click: async () => {
      const latest = await readActionState(surface);
      const currentDockings = latest?.shuttleDockings?.filter(row => row.shuttleId === target.shuttleId) ?? [];
      const currentControl = latest?.shuttleControl?.[target.shuttleId];
      const currentMaintenance = latest?.maintenanceCycles?.[target.hostShipId];
      const currentLedger = latest?.serviceShuttleRecharges?.[target.shuttleId];
      if (!liveState(latest, context.initial.sessionId) || latest.cycle !== state.cycle ||
          latest.turnPhase?.turn !== state.cycle || latest.turnPhase?.airspace?.state !== 'lifted' ||
          latest.turnPhase?.timerPause !== undefined || currentDockings.length !== 1 ||
          currentDockings[0].shipId !== target.hostShipId || hashUid(currentControl?.holderUid) !== actor.uidHash ||
          currentControl?.revision !== control.revision || !latest.activeVesselIds?.includes(target.hostShipId) ||
          latest.shipFleetGroupIds?.[target.hostShipId] !== groupId || latest.shuttleFuelled?.[target.shuttleId] !== true ||
          latest.shipDamage?.[target.hostShipId]?.destroyed === true || !currentMaintenance ||
          currentMaintenance.turn !== state.cycle || currentMaintenance.completedAt !== hostMaintenance.completedAt ||
          currentMaintenance.revision !== hostMaintenance.revision ||
          (currentLedger?.revision ?? 0) !== serviceRevision || currentLedger?.cycle === state.cycle) {
        throw new Error('The current service-shuttle holder, host, maintenance, phase, fuel, or recharge ledger changed before the mounted action.');
      }
      if (!await selectActualOption(select, option => option.offered && option.enabled)) throw new Error('No eligible host console is offered for recharge.');
      const action = await one(panel.getByRole('button', { name: /Recharge console/ })); if (!action) throw new Error('The live recharge choice is not enabled.');
      await action.click();
    } };
  }

  if (endpoint === 'requestShuttleDeparture' || endpoint === 'beginShuttleTransit' || endpoint === 'retargetShuttleTransit' || endpoint === 'completeShuttleArrival') {
    const panel = page.getByRole('region', { name: 'Shuttle departure', exact: true });
    const originAuthority = context.shuttleOriginAuthority;
    const originGroupId = originAuthority?.groupId;
    if (!shuttleOriginAuthorityMatches(originAuthority, state, {
      sessionId: context.initial.sessionId, uidHash: actor.uidHash, roleId: actor.activeConsoleRoleId,
      groupId: originGroupId, cycle: state.cycle,
      controlRevision: state.shuttleControl?.[target.shuttleId]?.revision,
    }, target.shuttleId)) {
      return block('the original pre-departure holder, group, custody, cycle, or current-document authority is missing or changed');
    }
    if (target.movementBefore === undefined) {
      target.movementBefore = await readShuttleMovement(surface, context.initial.sessionId, target.shuttleId).catch(() => undefined);
    }
    if (target.movementBefore === undefined) return block('the current source movement document is not readable under this authenticated actor');
    const dockings = state.shuttleDockings?.filter(row => row.shuttleId === target.shuttleId) ?? [];
    if (dockings.length === 1) target.hostShipId = dockings[0].shipId;
    if (endpoint === 'requestShuttleDeparture') {
      if (expectedGroup(state, target) !== originGroupId) return block('the original fleet group conflicts with the current docked host');
      if (target.movementBefore !== null) return block('a server departure or transit is already recorded for this shuttle');
      const select = panel.getByLabel('Destination ship', { exact: true });
      const option = await selectActualOption(select, candidate => candidate.offered && candidate.enabled && candidate.value !== target.hostShipId);
      if (!option) return block('no same-group destination is currently offered for this docked craft');
      target.destinationShipId = option.value;
      const action = await one(panel.getByRole('button', { name: 'Request departure', exact: true }));
      if (!action) return block('departure is not currently authorized in the source movement window');
      const transitionBefore = shuttleMovementWitness(context.initial.sessionId, target.shuttleId, actor.uidHash,
        originGroupId, state.shuttleControl?.[target.shuttleId]?.revision, state.cycle, null);
      return { offered: true, transitionBefore, originAuthority,
        sourceAuthorityBefore: state.currentDocumentAuthority, click: async () => {
        const latest = await readActionState(surface, target.shuttleId);
        const current = await readShuttleMovement(surface, context.initial.sessionId, target.shuttleId);
        if (!shuttleOriginAuthorityMatches(originAuthority, latest, {
          sessionId: context.initial.sessionId, uidHash: actor.uidHash, roleId: actor.activeConsoleRoleId,
          groupId: originGroupId, cycle: state.cycle, controlRevision: state.shuttleControl?.[target.shuttleId]?.revision,
        }, target.shuttleId) || current !== null || current === undefined) {
          throw new Error('The original source departure authority or movement state changed before the mounted request.');
        }
        await action.click();
      } };
    }
    if (endpoint === 'beginShuttleTransit') {
      const departure = target.movementBefore;
      if (!departure || departure.status !== 'requested') return block('the same holder has no current server-accepted departure request');
      if (departure.holderUidHash !== actor.uidHash || departure.groupId !== originGroupId ||
          departure.controlRevision !== state.shuttleControl?.[target.shuttleId]?.revision || departure.cycle !== state.cycle) {
        return block('the source departure request no longer matches current holder, group, cycle, and custody');
      }
      target.departureRequestId = departure.requestId;
      const action = await one(panel.getByRole('button', { name: 'Begin transit', exact: true }));
      if (!action) return block('the current source departure is not enabled for transit');
      const transitionBefore = shuttleMovementWitness(context.initial.sessionId, target.shuttleId, actor.uidHash,
        departure.groupId, departure.controlRevision, departure.cycle, departure);
      return { offered: true, transitionBefore, originAuthority,
        sourceAuthorityBefore: state.currentDocumentAuthority, click: async () => {
        const latest = await readActionState(surface, target.shuttleId);
        const current = await readShuttleMovement(surface, context.initial.sessionId, target.shuttleId);
        if (!shuttleOriginAuthorityMatches(originAuthority, latest, {
          sessionId: context.initial.sessionId, uidHash: actor.uidHash, roleId: actor.activeConsoleRoleId,
          groupId: originGroupId, cycle: state.cycle, controlRevision: state.shuttleControl?.[target.shuttleId]?.revision,
        }, target.shuttleId) || !current || current.status !== 'requested' || current.requestId !== departure.requestId ||
            current.holderUidHash !== actor.uidHash || current.groupId !== departure.groupId ||
            current.destinationShipId !== departure.destinationShipId || current.controlRevision !== departure.controlRevision ||
            current.cycle !== departure.cycle) throw new Error('The accepted source departure changed before transit.');
        await action.click();
      } };
    }
    if (endpoint === 'retargetShuttleTransit') {
      const transit = target.movementBefore;
      if (!transit || transit.status !== 'in-transit') return block('no current in-flight source transit can be retargeted');
      if (transit.holderUidHash !== actor.uidHash || transit.groupId !== originGroupId ||
          transit.controlRevision !== state.shuttleControl?.[target.shuttleId]?.revision || transit.cycle !== state.cycle) {
        return block('the in-flight transit no longer matches current holder, group, cycle, and custody');
      }
      target.departureRequestId = transit.requestId;
      target.transitRequestId = transit.transitRequestId;
      target.movementRevision = transit.revision;
      const select = panel.getByLabel('New destination ship', { exact: true });
      const option = await selectActualOption(select, candidate => candidate.offered && candidate.enabled && candidate.value !== transit.destinationShipId);
      if (!option) return block('no different source-legal destination is currently offered for retargeting');
      target.destinationShipId = option.value;
      const action = await one(panel.getByRole('button', { name: 'Retarget shuttle', exact: true }));
      if (!action) return block('retargeting is not currently authorized in the source movement window');
      const transitionBefore = shuttleMovementWitness(context.initial.sessionId, target.shuttleId, actor.uidHash,
        transit.groupId, transit.controlRevision, transit.cycle, transit);
      return { offered: true, transitionBefore, sourceAuthorityBefore: state.currentDocumentAuthority,
        originAuthority, click: async () => {
        const latest = await readActionState(surface, target.shuttleId);
        const current = await readShuttleMovement(surface, context.initial.sessionId, target.shuttleId);
        if (!shuttleOriginAuthorityMatches(originAuthority, latest, {
          sessionId: context.initial.sessionId, uidHash: actor.uidHash, roleId: actor.activeConsoleRoleId,
          groupId: originGroupId, cycle: state.cycle, controlRevision: state.shuttleControl?.[target.shuttleId]?.revision,
        }, target.shuttleId) || !sameCurrentDocumentAuthority(latest?.currentDocumentAuthority, state.currentDocumentAuthority) ||
            !current || current.status !== 'in-transit' || current.revision !== transit.revision ||
            current.transitRequestId !== transit.transitRequestId || current.destinationShipId !== transit.destinationShipId ||
            current.holderUidHash !== actor.uidHash || current.groupId !== transit.groupId) throw new Error('The source transit changed before retarget.');
        await action.click();
      } };
    }
    if (endpoint === 'completeShuttleArrival') {
      const automatic = context.shuttleArrivalCaptureMode === 'automatic-source-effect';
      const readiness = sourceTimedArrivalReady(state, target.movementBefore, context.initial.sessionId,
        target.shuttleId, actor.uidHash, actor.activeConsoleRoleId, context.shuttleArrivalWitness,
        originAuthority, { armAutomatic: automatic });
      if (!readiness) return block('the live manual Coordination projection, current holder, transit chain, destination group, or source arrival timing is not ready');
      if (automatic) {
        const completeCount = await panel.getByRole('button', { name: 'Complete arrival', exact: true }).count();
        const retryCount = await panel.getByRole('button', { name: 'Retry arrival', exact: true }).count();
        if (completeCount !== 0 || retryCount !== 0) {
          return block('the automatic arrival observer must arm before the source exposes a manual or retry control');
        }
        target.departureRequestId = readiness.before.departureRequestId;
        target.transitRequestId = readiness.before.transitRequestId;
        target.destinationShipId = readiness.before.destinationShipId;
        target.movementRevision = readiness.before.transitRevision;
        const automaticObservation = { kind: 'source-useEffect', panel: 'Shuttle departure',
          armedAt: new Date(readiness.observedAtMs).toISOString(), arrivesAt: readiness.before.arrivesAt,
          remainingMs: readiness.remainingMs, responseObservedAt: null };
        const arrival = { captureMode: 'automatic-source-effect', priorWitness: context.shuttleArrivalWitness,
          authorityBefore: readiness.sourceAuthority,
          automaticObservation, before: readiness.before, beforeProjection: readiness.beforeProjection };
        target.arrival = arrival;
        return { offered: true, arrival, originAuthority, observe: async () => {
          const latest = await readActionState(surface, target.shuttleId);
          const current = await readShuttleMovement(surface, context.initial.sessionId, target.shuttleId);
          const latestReadiness = sourceTimedArrivalReady(latest, current, context.initial.sessionId,
            target.shuttleId, actor.uidHash, actor.activeConsoleRoleId, context.shuttleArrivalWitness,
            originAuthority, { armAutomatic: true });
          const latestActor = await surface.observe();
          const currentCompleteCount = await panel.getByRole('button', { name: 'Complete arrival', exact: true }).count();
          const currentRetryCount = await panel.getByRole('button', { name: 'Retry arrival', exact: true }).count();
          if (!latestReadiness || !sameCurrentDocumentAuthority(latestReadiness.sourceAuthority, readiness.sourceAuthority) ||
              JSON.stringify(latestReadiness.before) !== JSON.stringify(readiness.before) ||
              JSON.stringify(latestReadiness.beforeProjection) !== JSON.stringify(readiness.beforeProjection) ||
              currentCompleteCount !== 0 || currentRetryCount !== 0 || latestActor.uidHash !== actor.uidHash ||
              latestActor.sessionId !== state.sessionId || latestActor.activeConsoleRoleId !== actor.activeConsoleRoleId) {
            throw new Error('The automatic source-arrival observer lost the original holder, transit, group, cycle, or pre-arrival window before arming.');
          }
          automaticObservation.armedAt = new Date(latestReadiness.observedAtMs).toISOString();
          automaticObservation.remainingMs = latestReadiness.remainingMs;
        } };
      }
      const retryCount = await panel.getByRole('button', { name: 'Retry arrival', exact: true }).count();
      if (retryCount !== 0) return block('the mounted shuttle arrival control is a retry; this single-shot proof does not repeat it');
      const action = await one(panel.getByRole('button', { name: 'Complete arrival', exact: true }));
      if (!action) return block('the actual source-timed Complete arrival control is not visible and enabled');
      target.departureRequestId = readiness.before.departureRequestId;
      target.transitRequestId = readiness.before.transitRequestId;
      target.destinationShipId = readiness.before.destinationShipId;
      target.movementRevision = readiness.before.transitRevision;
      const arrival = { readyControl: { panel: 'Shuttle departure', label: 'Complete arrival',
        visible: true, enabled: true, sessionId: state.sessionId, cycle: state.cycle,
        transitRequestId: readiness.before.transitRequestId, observedAt: new Date().toISOString() },
      priorWitness: context.shuttleArrivalWitness, authorityBefore: readiness.sourceAuthority,
      before: readiness.before, beforeProjection: readiness.beforeProjection };
      target.arrival = arrival;
      return { offered: true, arrival, originAuthority, click: async () => {
        const latest = await readActionState(surface, target.shuttleId);
        const current = await readShuttleMovement(surface, context.initial.sessionId, target.shuttleId);
        const latestReadiness = sourceTimedArrivalReady(latest, current, context.initial.sessionId,
          target.shuttleId, actor.uidHash, actor.activeConsoleRoleId, context.shuttleArrivalWitness, originAuthority);
        const latestActor = await surface.observe();
        const currentRetryCount = await panel.getByRole('button', { name: 'Retry arrival', exact: true }).count();
        const currentAction = await one(panel.getByRole('button', { name: 'Complete arrival', exact: true }));
        if (!latestReadiness || !sameCurrentDocumentAuthority(latestReadiness.sourceAuthority, readiness.sourceAuthority) ||
            JSON.stringify(latestReadiness.before) !== JSON.stringify(readiness.before) ||
            JSON.stringify(latestReadiness.beforeProjection) !== JSON.stringify(readiness.beforeProjection) ||
            currentRetryCount !== 0 || !currentAction || latestActor.uidHash !== actor.uidHash ||
            latestActor.sessionId !== state.sessionId || latestActor.activeConsoleRoleId !== actor.activeConsoleRoleId) {
          throw new Error('The source arrival chain, holder, group, cycle, manual Coordination, or ready control changed before the mounted arrival.');
        }
        await currentAction.click();
      } };
    }
  }

  if (endpoint === 'transferShuttleCargoCommand') {
    const panel = page.getByRole('region', { name: 'Shuttle cargo transfer', exact: true });
    const select = panel.getByLabel('Resource', { exact: true });
    const host = state.shuttleDockings?.filter(row => row.shuttleId === target.shuttleId) ?? [];
    const control = state.shuttleControl?.[target.shuttleId];
    if (host.length !== 1 || !control || hashUid(control.holderUid) !== actor.uidHash) return block('current shuttle holder and unique host docking are required');
    target.hostShipId = host[0].shipId;
    if (state.shipFleetGroupIds?.[target.hostShipId] !== expectedGroup(state, target)) return block('the docked host is outside the current actor group');
    const options = await select.locator('option').evaluateAll(nodes => nodes.map(node => ({ value: node.value,
      offered: node.value !== '' && !node.disabled, enabled: !node.disabled })));
    const resource = options.find(option => option.offered && option.enabled &&
      ((state.shipResources?.[target.hostShipId]?.[option.value] ?? 0) > 0 ||
       (state.shuttleCargo?.[target.shuttleId]?.[option.value] ?? 0) > 0));
    if (!resource) return block('no currently offered resource has a positive balance on either side of the dock');
    target.resourceId = resource.value;
    target.amount = 1;
    await select.selectOption(resource.value);
    const amount = panel.getByLabel('Amount', { exact: true });
    if (await amount.count() !== 1 || !await amount.isEnabled()) return block('the current authenticated actor cannot edit the source cargo amount');
    await amount.fill('1');
    const load = await one(panel.getByRole('button', { name: 'Load shuttle', exact: true }));
    const unload = await one(panel.getByRole('button', { name: 'Unload shuttle', exact: true }));
    const direction = load ? 'load' : unload ? 'unload' : null;
    if (!direction) return block('the current server balances offer no one-unit cargo direction');
    target.direction = direction;
    const hostAmount = state.shipResources?.[target.hostShipId]?.[resource.value];
    const shuttleAmount = state.shuttleCargo?.[target.shuttleId]?.[resource.value] ?? 0;
    const transitionBefore = shuttleCargoWitness(state.sessionId, state.cycle, target.shuttleId, actor.uidHash,
      expectedGroup(state, target), control.revision, target.hostShipId, resource.value, direction, 1, hostAmount, shuttleAmount);
    return { offered: true, transitionBefore, click: async () => {
      const latest = await readActionState(surface);
      const docking = latest.shuttleDockings?.filter(row => row.shuttleId === target.shuttleId) ?? [];
      const latestControl = latest.shuttleControl?.[target.shuttleId];
      if (!liveState(latest, context.initial.sessionId) || latest.cycle !== state.cycle || docking.length !== 1 ||
          docking[0].shipId !== target.hostShipId || hashUid(latestControl?.holderUid) !== actor.uidHash ||
          latestControl?.revision !== control.revision || latest.shipFleetGroupIds?.[target.hostShipId] !== expectedGroup(state, target)) {
        throw new Error('The live holder, group, docking, or control revision changed before cargo transfer.');
      }
      if (latest.shipResources?.[target.hostShipId]?.[target.resourceId] !== hostAmount ||
          (latest.shuttleCargo?.[target.shuttleId]?.[target.resourceId] ?? 0) !== shuttleAmount) {
        throw new Error('The authoritative cargo balances changed before transfer; reselect the live amount.');
      }
      await (direction === 'load' ? load : unload).click();
    } };
  }

  if (endpoint === 'evacuateShuttleSurvivorsCommand') {
    const panel = page.getByRole('region', { name: 'Survivor evacuation', exact: true });
    const dockings = state.shuttleDockings?.filter(row => row.shuttleId === target.shuttleId) ?? [];
    const control = state.shuttleControl?.[target.shuttleId];
    if (dockings.length !== 1 || !control || hashUid(control.holderUid) !== actor.uidHash ||
        !Number.isSafeInteger(control.revision)) return block('the current actor must hold the shuttle at one unique docked source');
    target.sourceShipId = dockings[0].shipId;
    target.hostShipId = target.sourceShipId;
    const groupId = expectedGroup(state, target);
    if (typeof groupId !== 'string' || state.shipFleetGroupIds?.[target.sourceShipId] !== groupId) {
      return block('the source shuttle host has no current fleet-group authority');
    }
    const destination = panel.getByLabel('Receiving ship', { exact: true });
    const selectedDestination = await selectActualOption(destination, option => option.offered && option.enabled &&
      option.value !== target.sourceShipId && state.activeVesselIds?.includes(option.value) &&
      state.shipFleetGroupIds?.[option.value] === groupId &&
      Number.isSafeInteger(state.shipSurvivors?.[option.value]));
    if (!selectedDestination) return block('no current same-group receiving ship with a server-projected population is offered');
    target.destinationShipId = selectedDestination.value;
    const amounts = panel.getByLabel('Survivors', { exact: true });
    const selectedAmount = await selectActualOption(amounts, option => option.offered && option.enabled &&
      Number.isSafeInteger(Number(option.value)) && Number(option.value) > 0 && Number(option.value) <= 5_000);
    if (!selectedAmount) return block('no current printed survivor quantity fits the source UI limits');
    target.amount = Number(selectedAmount.value);
    if (!Number.isSafeInteger(target.amount)) return block('the selected survivor amount is not a whole printed quantity');
    const transitionBefore = shuttleEvacuationWitness(state, target, actor.uidHash, groupId);
    if (!transitionBefore || transitionBefore.controlRevision !== control.revision ||
        transitionBefore.evacuationRevision !== (state.shuttleEvacuations?.[target.shuttleId]?.revision ?? 0) ||
        transitionBefore.movedThisCycle + target.amount > 5_000 || transitionBefore.sourcePopulation < target.amount) {
      return block('the selected evacuation no longer fits current custody, ledger, population, or cycle capacity');
    }
    const action = await one(panel.getByRole('button', { name: 'Move survivors', exact: true }));
    if (!action) return block('no remaining evacuation capacity is available for the selected source choices');
    return { offered: true, transitionBefore, click: async () => {
      const latest = await readActionState(surface);
      const latestDockings = latest?.shuttleDockings?.filter(row => row.shuttleId === target.shuttleId) ?? [];
      const latestControl = latest?.shuttleControl?.[target.shuttleId];
      const currentWitness = shuttleEvacuationWitness(latest, target, actor.uidHash, groupId);
      if (!liveState(latest, context.initial.sessionId) || latest.cycle !== state.cycle ||
          latestDockings.length !== 1 || latestDockings[0].shipId !== target.sourceShipId ||
          hashUid(latestControl?.holderUid) !== actor.uidHash || latestControl?.revision !== control.revision ||
          latest.shipFleetGroupIds?.[target.sourceShipId] !== groupId ||
          latest.shipFleetGroupIds?.[target.destinationShipId] !== groupId ||
          !currentWitness || JSON.stringify(currentWitness) !== JSON.stringify(transitionBefore) ||
          await destination.inputValue() !== target.destinationShipId ||
          Number(await amounts.inputValue()) !== target.amount) {
        throw new Error('The live holder, group, population ledger, or selected evacuation choices changed before transfer.');
      }
      await action.click();
    } };
  }

  if (endpoint === 'transferShuttleControlCommand') {
    const panel = page.getByRole('region', { name: 'Shuttle control', exact: true });
    const recipient = panel.getByLabel('Hand off to', { exact: true });
    const option = await selectActualOption(recipient, candidate => candidate.offered && candidate.enabled);
    if (option) return click(panel.getByRole('button', { name: 'Hand off control', exact: true }));
    return click(panel.getByRole('button', { name: 'Reclaim control', exact: true }));
  }

  if (endpoint === 'addShipDamage' || endpoint === 'repairAllShipDamage' || endpoint === 'rollbackMaintenance') {
    const name = endpoint === 'addShipDamage' ? 'Assign damage' : endpoint === 'repairAllShipDamage' ? 'Repair all damage' : 'Roll back maintenance step';
    const panels = page.getByRole('region', { name: / maintenance cycle$/i });
    const count = await panels.count();
    for (let index = 0; index < count; index++) {
      const panel = panels.nth(index), controls = panel.getByRole('region', { name: 'GM damage controls', exact: true });
      const display = String(await panel.getAttribute('aria-label') ?? '').replace(/ maintenance cycle$/i, '');
      const panelShipId = Object.entries({ AEGIS: 'aegis', Dione: 'dione', Shepherd: 'shepherd', Quellon: 'quellon',
        'Refinery 124': 'refinery-124', Icebreaker: 'icebreaker', Capybara: 'capybara' })
        .find(([name]) => name.toLowerCase() === display.toLowerCase())?.[1];
      if (target.shipId && panelShipId !== target.shipId) continue;
      const action = await one(controls.getByRole('button', { name, exact: true }));
      if (action) return { offered: true, click: () => action.click() };
    }
    return block(`no active maintenance panel offers ${name}`);
  }

    if (endpoint === 'runMaintenance') {
    const panels = page.getByRole('region', { name: / maintenance cycle$/i });
    for (let index = 0; index < await panels.count(); index++) {
      const panel = panels.nth(index), label = await panel.getAttribute('aria-label');
      const display = String(label ?? '').replace(/ maintenance cycle$/i, '');
      const shipId = Object.entries({ AEGIS: 'aegis', Dione: 'dione', Shepherd: 'shepherd', Quellon: 'quellon',
        'Refinery 124': 'refinery-124', Icebreaker: 'icebreaker', Capybara: 'capybara' })
        .find(([name]) => name.toLowerCase() === display.toLowerCase())?.[1];
      if (!shipId) continue;
      const current = state.maintenanceCycles?.[shipId];
      if (!current || current.step < 1 || current.step > 7) continue;
      const names = ['Begin Maintenance Cycle', 'Check storage', 'Proceed with rations', 'Run unrest check', 'Run riot check',
        'Power up reactor', 'Run ', 'Proceed with refuelling', 'End maintenance cycle'];
      let action;
      if (current.step === 6) {
        const production = panel.getByRole('button', { name: /^Run / });
        action = await one(production.first());
      } else {
        const name = names[current.step];
        action = await one(panel.getByRole('button', { name: name === 'Begin Maintenance Cycle' ? /^Begin Maintenance Cycle: Cycle \d+$/ : name, exact: name !== 'Begin Maintenance Cycle' }));
      }
      if (!action) continue;
      const receiptButton = current.step === 5 ? panel.getByRole('button', { name: 'Power up reactor', exact: true }) : action;
      target.shipId = shipId;
      return { offered: true, targetShipId: shipId, click: async () => {
        if (current.step === 5) { await receiptButton.click(); const confirm = await one(panel.getByRole('button', { name: 'ARE YOU SURE?', exact: true })); if (!confirm) throw new Error('Reactor confirmation is not currently offered.'); await confirm.click(); }
        else await action.click();
      } };
    }
    return block('no live ordered maintenance step is currently enabled');
  }

  if (endpoint === 'dismissPopulationAlert' || endpoint === 'dismissUnrestAlert') {
    const name = endpoint === 'dismissPopulationAlert' ? 'Dismiss population alert' : 'Dismiss unrest alert';
    return click(page.getByRole('alertdialog').getByRole('button', { name, exact: true }));
  }

  if (endpoint === 'resolveShipMutiny') {
    const panels = page.getByRole('region', { name: / mutiny recovery$/i });
    for (let index = 0; index < await panels.count(); index++) {
      const panel = panels.nth(index), select = panel.getByLabel('New captain', { exact: true });
      if (!await selectActualOption(select, option => option.offered && option.enabled)) continue;
      const action = await one(panel.getByRole('button', { name: 'Install replacement captain', exact: true }));
      if (action) return { offered: true, click: () => action.click(), trainingChoice: 'gm-training:deliberate-choice' };
    }
    return block('no source-eligible mutiny with a currently offered active officer exists');
  }

  if (endpoint === 'applyShipCounterSteps') {
    const groups = page.getByRole('group', { name: / resource controls$/i });
    for (let index = 0; index < await groups.count(); index++) {
      const group = groups.nth(index), mode = group.getByRole('button', { name: 'Ship numbers write mode', exact: true });
      if (await mode.count() && await mode.getAttribute('aria-pressed') !== 'true') await mode.click();
      const buttons = group.getByRole('button', { name: /^(?:Increase|Decrease) / });
      const action = await one(buttons.first());
      if (action) return { offered: true, targetShipName: await group.getAttribute('aria-label'), click: () => action.click(), trainingChoice: 'gm-training:deliberate-choice' };
    }
    return block('no actual one-step GM resource control is currently enabled');
  }

  if (endpoint === 'scavengeDestroyedShipStores') {
    const groups = page.getByRole('group', { name: / destroyed-ship store transfer$/i });
    for (let index = 0; index < await groups.count(); index++) {
      const group = groups.nth(index), recipient = group.getByLabel(/store recipient$/i);
      if (!await selectActualOption(recipient, option => option.offered && option.enabled)) continue;
      const action = await one(group.getByRole('button', { name: 'Transfer all retained stores', exact: true }));
      if (action) return { offered: true, click: () => action.click(), trainingChoice: 'gm-training:deliberate-choice' };
    }
    return block('no actually destroyed source ship and active eligible destination are offered');
  }

  if (endpoint === 'setFighterWingCount') {
    const groups = page.getByRole('group', { name: / resource controls$/i });
    for (let index = 0; index < await groups.count(); index++) {
      const group = groups.nth(index), fields = group.getByRole('spinbutton', { name: /^Set .* fighter count$/ });
      if (!await fields.count()) continue;
      const input = fields.first();
      const wingName = await input.getAttribute('aria-label');
      target.wingId = String(wingName ?? '').replace(/^Set\s+/, '').replace(/\s+fighter count$/i, '');
      const current = Number(await input.inputValue()), max = Number(await input.getAttribute('max'));
      if (!Number.isSafeInteger(current) || !Number.isSafeInteger(max) || current >= max || !await input.isEnabled()) continue;
      const button = await one(group.getByRole('button', { name: /^Apply .* fighter count$/ }));
      if (button) return { offered: true, click: async () => { await input.fill(String(current + 1)); await button.click(); }, trainingChoice: 'gm-training:deliberate-choice' };
    }
    return block('AEGIS has no source-projected available fighter construction capacity');
  }

  return block('no safe mounted action recipe is available for this endpoint');
}

async function inspectMountedGmControl({ surface, request, result, spec, expected, target, gmOperation }) {
  await verifyGmOperation(surface, gmOperation);
  if (spec.endpoint === 'setGmShipConsoleWriteGrant') {
    const access = surface.page.getByRole('button', { name: 'GM ship console read write access', exact: true });
    const liveUi = await access.count() === 1 && await access.isVisible() &&
      await access.getAttribute('aria-pressed') === 'true' &&
      await surface.page.locator('.ship-console').getAttribute('data-observer-mode') === 'write';
    const grant = await readCertifiedWriteGrant(surface, expected, gmOperation).catch(() => null);
    const leaseMatches = grant?.claimedAt === request.claimedAt &&
      request.sessionId === expected.sessionId && request.instanceId === expected.instanceId &&
      request.shipId === 'aegis' && request.enabled === true && result?.enabled === true && result?.shipId === 'aegis';
    const afterEnable = { actor: await verifyGmOperation(surface, gmOperation), projection: grant?.projection };
    // Write access belongs to this mounted observer. Source unmount/StrictMode
    // cleanup revokes it, so explicit UI revoke precedes the genuine reload.
    const revoked = liveUi && leaseMatches && grant?.projection.enabled === true
      ? await revokeMountedGmGrant(surface, expected, request.claimedAt, gmOperation) : null;
    const cleanupGrant = async () =>
      (await revokeMountedGmGrant(surface, expected, request.claimedAt, gmOperation))?.restore ?? null;
    return {
      sourceAfter: { live: revoked?.sourceAfter.live === true && leaseMatches,
        sessionId: revoked?.sourceAfter.sessionId, cycle: revoked?.sourceAfter.cycle, revision: undefined },
      rendered: { visible: liveUi, controlPressed: true, observerMode: 'write' },
      beforeProjection: target.gmGrantBefore,
      afterEnable, afterReload: revoked?.restore.afterReload, restore: revoked?.restore,
      cleanupGrant,
    };
  }

  if (spec.endpoint === 'setShipConsoleLock') {
    const panel = surface.page.getByRole('region', { name: 'ICN console lock', exact: true });
    const engage = panel.getByRole('button', { name: 'Engage ICN console lock', exact: true });
    const clearLabel = panel.getByText('ICN console lock // clear', { exact: true });
    const releaseRendered = await engage.count() === 1 && await engage.isVisible() && await engage.isEnabled() &&
      await clearLabel.count() === 1 && await clearLabel.isVisible();
    const afterCommit = await waitForActionState(surface, state =>
      state.live && state.sessionId === expected.sessionId && state.cycle === expected.cycle &&
      state.shipConsoleLocks?.aegis === false &&
      state.vesselActionRevisions?.aegis === expected.sourceRevision + 1, gmOperation);
    const revoked = await revokeMountedGmGrant(surface, expected, target.gmClaimedAt, gmOperation).catch(() => null);
    const lockState = revoked?.state;
    const lockRevision = lockState?.vesselActionRevisions?.aegis;
    const lockProjection = {
      kind: 'ship-console-lock', live: revoked?.sourceAfter.live === true &&
        lockState?.shipConsoleLocks?.aegis === false && lockRevision === expected.sourceRevision + 1,
      sessionId: lockState?.sessionId, cycle: lockState?.cycle,
      uidHash: expected.uidHash, instanceId: expected.instanceId, shipId: 'aegis',
      locked: lockState?.shipConsoleLocks?.aegis, revision: lockRevision,
    };
    return {
      sourceAfter: { live: afterCommit !== null && lockProjection.live === true &&
        revoked?.sourceAfter?.live === true && revoked.sourceAfter.revision === lockRevision,
        sessionId: revoked?.sourceAfter?.sessionId, cycle: revoked?.sourceAfter?.cycle, revision: lockRevision },
      rendered: { visible: releaseRendered && afterCommit !== null, locked: false,
        lockLabel: releaseRendered ? 'ICN console lock // clear' : null },
      sourceSpecificBefore: target.gmLockBefore,
      enableGrant: target.gmLockGrantEnable,
      afterReload: { actor: revoked?.restore.afterReload.actor, projection: lockProjection },
      restore: revoked?.restore,
    };
  }

  if (spec.endpoint === 'setFacilitatorCensusNote') {
    const before = target.censusBefore;
    const savedState = await waitForActionState(surface, state => {
      const entry = state.gmLoyaltyCensus?.entries?.find(value => value.uid === target.censusUid);
      return state.live && state.sessionId === expected.sessionId && state.cycle === expected.cycle &&
        state.gmLoyaltyCensus?.revision === before.revision + 1 && entry?.note === target.censusNote;
    }, gmOperation);
    const field = surface.page.getByLabel(`Facilitator note for ${target.censusUid}`, { exact: true });
    const fieldValue = await field.count() === 1 ? await field.inputValue() : null;
    const visible = fieldValue === target.censusNote && await field.isVisible();
    const reloaded = await reloadMountedGm(surface, expected, gmOperation);
    const projection = await censusProjection(reloaded.state, target.censusUid, expected, surface, gmOperation);
    return {
      sourceAfter: { live: savedState !== null && reloaded.state?.live === true && projection?.live === true,
        sessionId: reloaded.state?.sessionId, cycle: reloaded.state?.cycle,
        revision: reloaded.state?.gmLoyaltyCensus?.revision },
      sourceSpecificBefore: before,
      rendered: { visible, targetUidHash: hashUid(target.censusUid),
        noteFieldValueHash: proofHash(fieldValue) },
      afterReload: { actor: reloaded.actor, projection },
    };
  }

  if (spec.endpoint === 'authorFacilitatorRuleCall') {
    let rendered = { visible: false, resultStatus: result?.status ?? 'committed' };
    for (let attempt = 0; attempt < 40; attempt++) {
      await verifyGmOperation(surface, gmOperation);
      rendered = await positiveRenderedStatus(surface, spec.endpoint, result);
      if (rendered.visible) break;
      await new Promise(resolve => setTimeout(resolve, remainingGmOperation(gmOperation, 100)));
    }
    const committedState = await waitForActionState(surface, state =>
      state.gmFacilitatorRuleCall?.callId === request.requestId &&
      state.gmFacilitatorRuleCall?.revision === expected.sourceRevision + 1, gmOperation);
    const reloaded = await reloadMountedGm(surface, expected, gmOperation);
    const projection = ruleCallProjection(reloaded.state, expected);
    await verifyGmOperation(surface, gmOperation);
    return {
      sourceAfter: { live: committedState !== null && reloaded.state?.live === true && projection?.live === true,
        sessionId: reloaded.state?.sessionId, cycle: reloaded.state?.cycle,
        revision: reloaded.state?.gmFacilitatorRuleCall?.revision },
      rendered,
      afterReload: { actor: reloaded.actor, projection },
    };
  }
  return {};
}

async function recipeFor({ context, game, spec }) {
  // The existing sixty-second capture operation includes GM preparation and
  // navigation; every phase consumes this same absolute remaining budget.
  const gmOperation = CERTIFIED_GM_RECIPES.has(spec.endpoint) ? { deadlineAt: Date.now() + 60_000 } : null;
  const movementEndpoints = ['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit',
    'completeShuttleArrival'];
  const movementEndpoint = movementEndpoints.includes(spec.endpoint);
  const refuse = reason => {
    const pending = async () => ({ offered: false, reason });
    return { expected: {}, prepare: pending, inspect: async () => ({}) };
  };
  let movementOrigin = context.shuttleOriginAuthority;
  if (movementEndpoint) {
    const witness = context.shuttleArrivalWitness;
    const witnessOrigin = spec.endpoint === 'completeShuttleArrival'
      ? shuttleOriginAuthorityFromArrivalWitness(witness) : null;
    if (spec.endpoint === 'completeShuttleArrival' && witness !== undefined && !witnessOrigin) {
      return refuse('the original retarget witness is invalid for the current holder, group, or document authority');
    }
    if (movementOrigin !== undefined && movementOrigin !== null &&
        !validShuttleOriginAuthority(movementOrigin, {
          sessionId: context.initial.sessionId, uidHash: movementOrigin.uidHash,
          roleId: movementOrigin.sourceAuthority?.roleId, groupId: movementOrigin.groupId,
          cycle: movementOrigin.cycle, controlRevision: movementOrigin.controlRevision,
          shuttleId: movementOrigin.shuttleId,
        })) {
      const admitted = context.roster.filter(candidate => candidate.uidHash === movementOrigin.uidHash);
      if (movementOrigin.shuttleId === 'snn-press-shuttle' && admitted.length === 1 &&
          admitted[0].roleId === 'press-officer') {
        return refuse('Press movement remains pending: no current berth or vessel scope is available in its member projection.');
      }
      return refuse('the original shuttle holder authority is missing, malformed, or no longer admitted');
    }
    if (movementOrigin && witnessOrigin && !sameShuttleOriginAuthority(movementOrigin, witnessOrigin)) {
      return refuse('the original holder authority disagrees with the completed retarget witness');
    }
    movementOrigin ??= witnessOrigin;
    if (!movementOrigin) return refuse('the exact original shuttle holder authority is missing; no holder fallback is allowed');
    context = { ...context, shuttleOriginAuthority: movementOrigin };
  }
  let roleToUse = spec.actorRoleId;
  let holderTarget = {};
  if (spec.family === 'pending-core-craft-actions' &&
      !['current-shuttle-holder', 'current-ally-holder'].includes(roleToUse) &&
      !context.roster.some(candidate => candidate.roleId === roleToUse)) return null;
  if (spec.actorRoleId === 'current-shuttle-holder' || spec.actorRoleId === 'current-ally-holder') {
    const sourceSurface = await game.select('gm');
    const sourceActor = await sourceSurface.observe();
    const sourceState = await readActionState(sourceSurface);
    if (sourceActor?.sameActor !== true || sourceActor.gmInstanceOwned !== true ||
        sourceActor.connection !== 'live' || sourceActor.freshness !== 'server' ||
        !liveState(sourceState, context.initial.sessionId)) {
      const refuse = async () => ({ offered: false, reason: 'the source custody projection is not current under the live owned GM' });
      return { expected: {}, prepare: refuse, inspect: async () => ({}) };
    }
    const entries = Object.entries(sourceState.shuttleControl ?? {});
    let holders;
    if (movementEndpoint) {
      const origin = context.shuttleOriginAuthority;
      const control = sourceState.shuttleControl?.[origin.shuttleId];
      const admitted = context.roster.filter(candidate => candidate.uidHash === origin.uidHash);
      const roleId = origin.sourceAuthority.roleId;
      if (origin.shuttleId === 'snn-press-shuttle' && admitted.length === 1 &&
          admitted[0].roleId === 'press-officer') {
        return refuse('Press movement remains pending: no current berth or vessel scope is available in its member projection.');
      }
      if (!validShuttleOriginAuthority(origin, { sessionId: context.initial.sessionId,
        uidHash: origin.uidHash, roleId, groupId: origin.groupId, cycle: origin.cycle,
        controlRevision: origin.controlRevision, shuttleId: origin.shuttleId }) ||
          sourceState.sessionId !== context.initial.sessionId || sourceState.phase !== 'active' ||
          sourceState.cycle !== origin.cycle || control?.shuttleId !== origin.shuttleId ||
          hashUid(control?.holderUid) !== origin.uidHash || control?.revision !== origin.controlRevision ||
          admitted.length !== 1 || admitted[0].roleId !== roleId) {
        return refuse('the exact original shuttle holder, admitted role, cycle, or control revision is stale or ambiguous');
      }
      if (spec.endpoint === 'requestShuttleDeparture') {
        const dockings = sourceState.shuttleDockings?.filter(row => row.shuttleId === origin.shuttleId) ?? [];
        if (dockings.length !== 1 || sourceState.shipFleetGroupIds?.[dockings[0].shipId] !== origin.groupId) {
          return refuse('the original shuttle holder has no unique same-group pre-departure docking');
        }
      }
      holders = [{ shuttleId: origin.shuttleId, roleId, uidHash: origin.uidHash }];
    } else {
      const selected = spec.actorRoleId === 'current-ally-holder'
        ? entries.filter(([id]) => id === 'ally')
        : entries;
      holders = selected.flatMap(([shuttleId, control]) => {
        const uidHash = hashUid(control?.holderUid);
        const matches = context.roster.filter(candidate => candidate.uidHash === uidHash);
        return matches.length === 1 ? [{ shuttleId, roleId: matches[0].roleId, uidHash }] : [];
      });
    }
    if (!holders.length) {
      const refuse = async () => ({ offered: false, reason: 'no uniquely admitted current shuttle-holder profile is source-projected' });
      return { expected: {}, prepare: refuse, inspect: async () => ({}) };
    }
    holderTarget = { shuttleId: holders[0].shuttleId };
    roleToUse = holders[0].roleId;
  }
  const preserveMountedShuttleRoute = spec.actorRoleId === 'current-shuttle-holder' &&
    ['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit',
      'completeShuttleArrival'].includes(spec.endpoint);
  const initialSurface = gmOperation ? await game.select('gm', { deadlineAt: gmOperation.deadlineAt })
    : preserveMountedShuttleRoute ? await game.select(roleToUse, { enter: false }) : await game.select(roleToUse);
  const actor = await initialSurface.observe();
  if (actor?.sessionId !== context.initial.sessionId || actor.sameActor !== true || actor.connection !== 'live' || actor.freshness !== 'server') {
    const refuse = async () => ({ offered: false, reason: 'the original actor/session is not currently live from a server snapshot' });
    return { expected: {}, prepare: refuse, inspect: async () => ({}) };
  }
  const documentAuthorityShuttleId = ['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit',
    'completeShuttleArrival'].includes(spec.endpoint) ? holderTarget.shuttleId : undefined;
  const state = await readActionState(initialSurface, documentAuthorityShuttleId);
  if (!liveState(state, context.initial.sessionId)) {
    const refuse = async () => ({ offered: false, reason: 'the required current server session projection is unavailable' });
    return { expected: {}, prepare: refuse, inspect: async () => ({}) };
  }
  const resolved = mountedTarget(spec, actor, state, { roleId: roleToUse, target: holderTarget });
  const roleId = resolved.roleId;
  const uidHash = actorUidHash(actor);
  const expected = { sessionId: context.initial.sessionId, roleId, uidHash, cycle: state.cycle,
    ...(actor.playerRole === 'gm' ? { instanceId: actor.instanceId } : {}),
    ...(resolved.target.shipId ? { shipId: resolved.target.shipId } : {}),
    ...(resolved.target.shuttleId ? { shuttleId: resolved.target.shuttleId } : {}),
    ...(resolved.target.targetShipName ? { targetShipName: resolved.target.targetShipName } : {}) };
  if (resolved.target.shipId) expected.groupId = state.shipFleetGroupIds?.[resolved.target.shipId];
  if (resolved.target.shuttleId) {
    const docking = state.shuttleDockings?.filter(row => row.shuttleId === resolved.target.shuttleId) ?? [];
    if (docking.length === 1) expected.groupId = state.shipFleetGroupIds?.[docking[0].shipId];
    const controlRevision = state.shuttleControl?.[resolved.target.shuttleId]?.revision;
    if (isRevision(controlRevision)) expected.controlRevision = controlRevision;
  }
  if (['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit'].includes(spec.endpoint) &&
      context.shuttleOriginAuthority?.groupId) {
    expected.groupId = context.shuttleOriginAuthority.groupId;
    expected.sourceAuthority = context.shuttleOriginAuthority.sourceAuthority;
  }
  if (spec.endpoint === 'completeShuttleArrival' && validShuttleArrivalWitness(context.shuttleArrivalWitness)) {
    expected.groupId = context.shuttleArrivalWitness.groupId;
    expected.departureRequestId = context.shuttleArrivalWitness.departureRequestId;
    expected.transitRequestId = context.shuttleArrivalWitness.transitRequestId;
    expected.destinationShipId = context.shuttleArrivalWitness.destinationShipId;
    expected.transitRevision = context.shuttleArrivalWitness.transitRevision;
    expected.sourceAuthority = context.shuttleArrivalWitness.sourceAuthority;
  }
  if (resolved.target.hostShipId) expected.groupId = state.shipFleetGroupIds?.[resolved.target.hostShipId];
  let auxiliary = null;
  if (spec.endpoint === 'rollHummingbirdHarvest' || spec.endpoint === 'allocateHummingbirdHarvest') auxiliary = await readHarvest(initialSurface).catch(() => null);
  if (spec.endpoint === 'chooseBoaMissionReclamationOpportunity') auxiliary = await readBoaWorkspace(initialSurface, context.initial.sessionId).catch(() => null);
  const initialPlan = await planFor({ spec, surface: initialSurface, actor, state, context, target: resolved.target, gmOperation });
  if (resolved.target.shipId && expected.shipId === undefined) expected.shipId = resolved.target.shipId;
  if (resolved.target.hostShipId) expected.groupId = state.shipFleetGroupIds?.[resolved.target.hostShipId];
  if (resolved.target.hostShipId && spec.endpoint === 'rechargeHostConsoleFromShuttle') {
    expected.expectedHostShipId = resolved.target.hostShipId;
    expected.maintenanceRevision = resolved.target.maintenanceRevision;
  }
  for (const field of ['shuttleId', 'hostShipId', 'destinationShipId', 'resourceId', 'direction', 'amount',
    'sourceShipId', 'departureRequestId', 'transitRequestId']) {
    if (resolved.target[field] !== undefined) expected[field] = resolved.target[field];
  }
  if (spec.endpoint === 'chooseBoaMissionReclamationOpportunity' && initialPlan.expectedChoiceRevision !== undefined) {
    expected.sourceRevision = initialPlan.expectedChoiceRevision;
    expected.expectedChoiceRevision = initialPlan.expectedChoiceRevision;
    expected.groupId = auxiliary?.groupId;
    expected.opportunityId = resolved.target.opportunityId;
  } else {
    const revision = revisionFor(spec.endpoint, state, resolved.target, auxiliary);
    if (isRevision(revision)) expected.sourceRevision = revision;
  }
  if (initialPlan.expectedCost) expected.cost = initialPlan.expectedCost;
  else if (resolved.target.expectedCost) expected.cost = resolved.target.expectedCost;
  if (state.shipFleetGroupIds?.[resolved.target.shipId] && !expected.groupId) expected.groupId = state.shipFleetGroupIds[resolved.target.shipId];
  const preparedPlan = initialPlan;
  return {
    expected,
    ...(gmOperation ? { gmOperation } : {}),
    trainingChoice: spec.trainingChoice ? (preparedPlan.trainingChoice ?? 'gm-training:deliberate-choice') : null,
    ...(spec.endpoint === 'setGmShipConsoleWriteGrant' ? { cleanupMountedGmGrant: async () => {
      if (resolved.target.gmGrantEnableAttempted !== true) return null;
      return revokeMountedGmGrant(initialSurface, expected, resolved.target.gmClaimedAt, gmOperation);
    } } : {}),
    prepare: async ({ surface, actor: currentActor, source }) => {
      if (currentActor.uidHash !== uidHash || currentActor.sessionId !== expected.sessionId || currentActor.profileRoleId !== roleId && currentActor.playerRole !== 'gm')
        return { offered: false, reason: 'the selected original account or current role changed before the mounted action' };
      if (source.cycle !== state.cycle || source.phase !== 'active') return { offered: false, reason: 'the active phase changed before the mounted action' };
      if (expected.shuttleId && currentActor.activeConsoleRoleId !== roleId) return { offered: false, reason: 'the original current shuttle-holder console is no longer active' };
      if (!isRevision(expected.sourceRevision) && spec.endpoint !== 'setGmShipConsoleWriteGrant' &&
          spec.endpoint !== 'completeShuttleArrival') {
        return { offered: false, reason: 'the exact source revision is not safely readable for this case' };
      }
      const movementEndpoint = ['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit',
        'completeShuttleArrival'].includes(spec.endpoint);
      const latest = await readActionState(surface, movementEndpoint ? resolved.target.shuttleId : undefined);
      if (!liveState(latest, expected.sessionId)) return { offered: false, reason: 'current server projection became stale before action' };
      const latestRevision = revisionFor(spec.endpoint, latest, resolved.target, auxiliary);
      if (isRevision(latestRevision) && latestRevision !== expected.sourceRevision) return { offered: false, reason: 'source revision changed before action' };
      if (spec.endpoint === 'rechargeHostConsoleFromShuttle') {
        const hostShipId = expected.expectedHostShipId;
        const dockings = latest.shuttleDockings?.filter(row => row.shuttleId === expected.shuttleId) ?? [];
        const control = latest.shuttleControl?.[expected.shuttleId];
        const maintenance = latest.maintenanceCycles?.[hostShipId];
        const ledger = latest.serviceShuttleRecharges?.[expected.shuttleId];
        const serviceRevision = ledger?.revision ?? 0;
        if (dockings.length !== 1 || dockings[0].shipId !== hostShipId ||
            hashUid(control?.holderUid) !== uidHash || control?.revision !== expected.controlRevision ||
            !latest.activeVesselIds?.includes(hostShipId) || latest.shipFleetGroupIds?.[hostShipId] !== expected.groupId ||
            latest.shuttleFuelled?.[expected.shuttleId] !== true || latest.shipDamage?.[hostShipId]?.destroyed === true ||
            !maintenance || maintenance.turn !== expected.cycle || typeof maintenance.completedAt !== 'string' ||
            maintenance.revision !== expected.maintenanceRevision || !isRevision(serviceRevision) ||
            serviceRevision !== expected.sourceRevision || ledger?.cycle === expected.cycle ||
            latest.turnPhase?.turn !== expected.cycle || latest.turnPhase?.airspace?.state !== 'lifted' ||
            latest.turnPhase?.timerPause !== undefined) {
          return { offered: false, reason: 'current service-shuttle holder, host, maintenance, Coordination phase, fuel, or ledger no longer matches the prepared action' };
        }
      }
      if (['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit'].includes(spec.endpoint)) {
        if (!shuttleOriginAuthorityMatches(context.shuttleOriginAuthority, latest, {
          sessionId: expected.sessionId, uidHash, roleId,
          groupId: context.shuttleOriginAuthority?.groupId, cycle: expected.cycle,
          controlRevision: context.shuttleOriginAuthority?.controlRevision,
        }, resolved.target.shuttleId) || expected.groupId !== context.shuttleOriginAuthority?.groupId) {
          return { offered: false, reason: 'the original pre-departure group or same-document holder authority changed before the movement action' };
        }
        const movement = await readShuttleMovement(surface, expected.sessionId, resolved.target.shuttleId).catch(() => undefined);
        const witness = shuttleMovementWitness(expected.sessionId, resolved.target.shuttleId, uidHash,
          context.shuttleOriginAuthority.groupId, latest.shuttleControl?.[resolved.target.shuttleId]?.revision,
          latest.cycle, movement);
        if (!witness || JSON.stringify(witness) !== JSON.stringify(preparedPlan.transitionBefore)) {
          return { offered: false, reason: 'source shuttle movement changed before the mounted action' };
        }
      }
      if (spec.endpoint === 'completeShuttleArrival') {
        const armAutomatic = context.shuttleArrivalCaptureMode === 'automatic-source-effect';
        const movement = await readShuttleMovement(surface, expected.sessionId, resolved.target.shuttleId).catch(() => undefined);
        const readiness = sourceTimedArrivalReady(latest, movement, expected.sessionId,
          resolved.target.shuttleId, uidHash, roleId, context.shuttleArrivalWitness,
          context.shuttleOriginAuthority, { armAutomatic });
        const panel = surface.page.getByRole('region', { name: 'Shuttle departure', exact: true });
        const retryCount = await panel.getByRole('button', { name: 'Retry arrival', exact: true }).count();
        const completeCount = await panel.getByRole('button', { name: 'Complete arrival', exact: true }).count();
        if (!readiness || !sameCurrentDocumentAuthority(readiness.sourceAuthority, preparedPlan.arrival?.authorityBefore) ||
            JSON.stringify(readiness.before) !== JSON.stringify(preparedPlan.arrival?.before) ||
            JSON.stringify(readiness.beforeProjection) !== JSON.stringify(preparedPlan.arrival?.beforeProjection) ||
            retryCount !== 0 || armAutomatic && completeCount !== 0) {
          return { offered: false, reason: 'the actual source-timed holder, transit, Coordination window, or single-shot ready control changed before arrival' };
        }
      }
      if (!preparedPlan.offered) return preparedPlan;
      return preparedPlan;
    },
    inspect: async ({ surface, result, request }) => {
      if (CERTIFIED_GM_RECIPES.has(spec.endpoint)) {
        return inspectMountedGmControl({ context, surface, request, result, spec, expected, target: resolved.target, gmOperation });
      }
      const movementEndpoint = ['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit',
        'completeShuttleArrival'].includes(spec.endpoint);
      const latest = await readActionState(surface, movementEndpoint ? resolved.target.shuttleId : undefined);
      if (spec.endpoint === 'completeShuttleArrival') {
        const movementAfter = await readShuttleMovement(surface, expected.sessionId, resolved.target.shuttleId).catch(() => undefined);
        const arrivalAfter = shuttleArrivalProjection(latest, resolved.target.arrival.before,
          { movementAbsent: movementAfter === null, observedAt: new Date().toISOString() });
        return {
          sourceAfter: { live: latest?.live === true, sessionId: latest?.sessionId,
            cycle: latest?.cycle, phase: latest?.phase, groupId: latest?.holderGroupId },
          rendered: await positiveRenderedStatus(surface, spec.endpoint, result),
          arrivalAfter, authorityAfter: latest?.currentDocumentAuthority,
        };
      }
      let movementAfter;
      if (['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit'].includes(spec.endpoint)) {
        movementAfter = await readShuttleMovement(surface, expected.sessionId, resolved.target.shuttleId).catch(() => undefined);
      }
      let afterAuxiliary = null;
      if (spec.endpoint === 'rollHummingbirdHarvest' || spec.endpoint === 'allocateHummingbirdHarvest') afterAuxiliary = await readHarvest(surface).catch(() => null);
      if (spec.endpoint === 'chooseBoaMissionReclamationOpportunity') afterAuxiliary = await readBoaWorkspace(surface, expected.sessionId).catch(() => null);
      if (spec.endpoint === 'retargetShuttleTransit') resolved.target.movementRevisionAfter = movementAfter?.revision;
      const revision = afterRevision(spec.endpoint, latest, resolved.target, result, afterAuxiliary);
      const visible = await positiveRenderedStatus(surface, spec.endpoint, result);
      const resource = resolved.target.expectedCost?.resource;
      const cost = resource ? { ...resolved.target.expectedCost,
        before: resourceBalance(state, resolved.target, resource), after: resourceBalance(latest, resolved.target, resource) } : undefined;
      if (resolved.target.hostShipId && expected.groupId && latest.shipFleetGroupIds?.[resolved.target.hostShipId] !== expected.groupId) {
        return { sourceAfter: { live: false, sessionId: latest?.sessionId, cycle: latest?.cycle, revision } };
      }
      const transitionAfter = spec.endpoint === 'evacuateShuttleSurvivorsCommand'
        ? shuttleEvacuationWitness(latest, resolved.target, uidHash, expected.groupId)
        : ['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit']
        .includes(spec.endpoint) && movementAfter !== undefined
        ? shuttleMovementWitness(expected.sessionId, resolved.target.shuttleId, uidHash,
          context.shuttleOriginAuthority?.groupId, latest.shuttleControl?.[resolved.target.shuttleId]?.revision,
          latest.cycle, movementAfter)
        : spec.endpoint === 'transferShuttleCargoCommand'
          ? shuttleCargoWitness(latest.sessionId, latest.cycle, resolved.target.shuttleId, uidHash,
            expectedGroup(latest, resolved.target), latest.shuttleControl?.[resolved.target.shuttleId]?.revision,
            resolved.target.hostShipId, resolved.target.resourceId, resolved.target.direction, resolved.target.amount,
            latest.shipResources?.[resolved.target.hostShipId]?.[resolved.target.resourceId],
            latest.shuttleCargo?.[resolved.target.shuttleId]?.[resolved.target.resourceId] ?? 0)
          : undefined;
      return {
        sourceAfter: { live: latest?.live === true, sessionId: latest?.sessionId, cycle: latest?.cycle,
          revision, ...(expected.groupId ? { groupId: expected.groupId } : {}) },
        rendered: visible, ...(cost ? { cost } : {}), ...(transitionAfter ? { transitionAfter } : {}),
        ...(['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit'].includes(spec.endpoint)
          ? { sourceAuthorityAfter: latest?.currentDocumentAuthority } : {}),
      };
    },
  };
}

/** Finite action map for the existing core-craft and GM checkpoint callbacks. */
export function createPendingProcedureDefaultSteps() {
  const rows = [...CORE_CRAFT_PROCEDURES, ...GM_RULING_COUNTER_PROCEDURES];
  return Object.freeze(Object.fromEntries(rows.map(spec => [spec.id, input => recipeFor({ ...input, spec })])));
}

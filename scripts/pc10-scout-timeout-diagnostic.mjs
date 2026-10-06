import { createHash } from 'node:crypto';

const hash = value => typeof value === 'string'
  ? createHash('sha256').update(value).digest('hex') : null;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const boolean = value => typeof value === 'boolean' ? value : null;
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const label = (value, labels) => labels.includes(value) ? value : null;
const vessels = ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'];
const craft = ['starlight', 'hummingbird', 'endeavour', 'comms-officer'];
const roles = ['wing-commander', 'quellon-explorer', 'shepherd-scientist', 'comms-officer'];
const maxRetainedEntries = 64;
const fields = ['sessionId', 'requestId', 'entitlementId', 'targetCoordinate', 'status', 'resolution',
  'cycle', 'source', 'ownerRoleId', 'anchorShipId', 'receivingShipId', 'live', 'phase', 'turnPhase',
  'activeVesselIds', 'shuttleDockings', 'fullGameDemo', 'shipResources', 'shipDamage', 'shipSurvivors',
  'turnLimit', 'maintenanceCycles', 'shuttleFuelled', 'shuttleControl', 'shipGalacticCoordinates',
  'organiserSites', 'setupRevision', 'chartId', 'turnState', 'shipFleetGroupIds', 'vesselActionRevisions',
  'gameOutcome', 'debriefSnapshot', 'currentMemberGroupAuthority', 'player'];

function keyset(value) {
  if (!record(value)) return null;
  const keys = Object.keys(value).sort();
  return { count: keys.length, publicKeys: keys.filter(key => fields.includes(key)),
    otherKeyHashes: keys.filter(key => !fields.includes(key)).slice(0, maxRetainedEntries).map(hash),
    otherKeysTruncated: keys.filter(key => !fields.includes(key)).length > maxRetainedEntries };
}

function receipt(value) {
  return { present: record(value), keyset: keyset(value),
    sessionIdHash: hash(value?.sessionId), requestIdHash: hash(value?.requestId),
    targetCoordinateHash: hash(value?.targetCoordinate),
    entitlementId: label(value?.entitlementId, craft),
    status: label(value?.status, ['requested', 'replayed']),
    resolution: label(value?.resolution, ['pending']), cycle: integer(value?.cycle),
    source: label(value?.source, ['craft', 'replacement-role']),
    ownerRoleId: label(value?.ownerRoleId, roles),
    anchorShipId: label(value?.anchorShipId, vessels), receivingShipId: label(value?.receivingShipId, vessels) };
}

function state(value) {
  return { present: record(value), keyset: keyset(value), sessionIdHash: hash(value?.sessionId),
    live: boolean(value?.live), cycle: integer(value?.cycle),
    phase: label(value?.phase, ['lobby', 'casting', 'briefing', 'active', 'debrief', 'closed']),
    phaseCycle: integer(value?.turnPhase?.turn),
    airspace: label(value?.turnPhase?.airspace?.state, ['restricted', 'lifted']),
    activeVesselIdsApplicable: Array.isArray(value?.activeVesselIds),
    activeVesselCount: Array.isArray(value?.activeVesselIds) ? value.activeVesselIds.length : null,
    activeVesselIds: Array.isArray(value?.activeVesselIds)
      ? value.activeVesselIds.slice(0, maxRetainedEntries).map(id => label(id, vessels) ?? { otherIdHash: hash(id) }) : null,
    activeVesselsTruncated: Array.isArray(value?.activeVesselIds) && value.activeVesselIds.length > maxRetainedEntries,
    dockingsApplicable: Array.isArray(value?.shuttleDockings),
    dockingCount: Array.isArray(value?.shuttleDockings) ? value.shuttleDockings.length : null,
    dockingsTruncated: Array.isArray(value?.shuttleDockings) && value.shuttleDockings.length > maxRetainedEntries,
    dockings: Array.isArray(value?.shuttleDockings) ? value.shuttleDockings.slice(0, maxRetainedEntries).map(entry => ({
      shuttleId: label(entry?.shuttleId, craft), shipId: label(entry?.shipId, vessels),
      ...(label(entry?.shuttleId, craft) === null ? { otherShuttleIdHash: hash(entry?.shuttleId) } : {}),
      ...(label(entry?.shipId, vessels) === null ? { otherShipIdHash: hash(entry?.shipId) } : {}),
    })) : null };
}

/** Held inputs only. This projection cannot perform a read, write or action. */
export function projectScoutTimeoutDiagnostic({ request, result, replay, latest, before,
  timeoutMs, intervalMs, exactReplay }) {
  const inspect = latest?.scoutInspection;
  const actor = latest?.currentActor;
  return { schema: 'pc10-scout-convergence-timeout-v1', endpoint: 'requestScout',
    acceptance: 'not-claimed', scope: 'recorded-request-convergence-only', timeoutMs, intervalMs,
    receipt: { request: receipt(request), result: receipt(result), replay: receipt(replay),
      exactReplay: exactReplay === true },
    actor: { uidHash: typeof actor?.uidHash === 'string' && /^[a-f0-9]{16}$/.test(actor.uidHash) ? actor.uidHash : null,
      sessionIdHash: hash(actor?.sessionId), sameActor: boolean(actor?.sameActor),
      profileRoleId: label(actor?.profileRoleId, roles), activeConsoleRoleId: label(actor?.activeConsoleRoleId, roles),
      connection: label(actor?.connection, ['live', 'connecting', 'offline']),
      freshness: label(actor?.freshness, ['server', 'cache']) },
    source: { before: state(before), gm: state(latest?.gmState), crew: state(latest?.crewState) },
    inspection: { applicable: inspect !== null && inspect !== undefined,
      ready: boolean(latest?.scoutInspectReady),
      boundary: label(inspect?.boundary, ['result-status', 'scout-record', 'rendered-status', 'ready']),
      outerBoundary: label(inspect?.outerBoundary, ['source-not-ready', 'scout-guard', 'ready']),
      sourceRequestRecordQualified: boolean(inspect?.sourceRequestRecordQualified),
      renderedStatusQualified: boolean(inspect?.renderedStatusQualified),
      renderedStatusNodeCount: integer(inspect?.renderedStatusNodeCount),
      outerRequestRecordQualified: boolean(inspect?.outerRequestRecordQualified),
      outerRenderedQualified: boolean(inspect?.outerRenderedQualified) },
    privateReportDeliveryClaimed: false };
}

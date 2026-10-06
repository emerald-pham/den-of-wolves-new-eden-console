import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';

const hash = value => createHash('sha256').update(String(value ?? '')).digest('hex');

const REQUEST_FIELDS = Object.freeze({
  repairConsolesFromMacaw: ['requestId', 'systemIds', 'expectedControlRevision', 'expectedRepairRevision', 'expectedCycle', 'expectedHostShipId'],
  proposePermissionedDismantling: ['requestId', 'craftId', 'targetShipId', 'targetConsoleId', 'expectedTargetRevision'],
  consentToPermissionedDismantling: ['proposalId', 'consentId', 'expectedTargetRevision'],
  applyPermissionedDismantling: ['requestId', 'proposalId', 'consentId', 'expectedTargetRevision'],
  recycleWithBoa: ['requestId', 'recipeId', 'expectedControlRevision', 'expectedRecyclingRevision', 'expectedCycle', 'expectedHostShipId'],
  chooseBoaMissionReclamationOpportunity: ['requestId', 'missionOpportunityId', 'taskOpportunityId', 'expectedChoiceRevision', 'expectedControlRevision', 'expectedCycle'],
  resolveWolfAttackAftermath: ['requestId', 'attackId', 'choice'],
  rollHummingbirdHarvest: ['requestId', 'expectedRevision'],
  allocateHummingbirdHarvest: ['requestId', 'expectedRevision', 'foodDieIndex'],
  buildFighter: ['requestId', 'wingId', 'expectedRevision'],
  requestScout: ['requestId', 'entitlementId', 'targetCoordinate'],
  advanceEndeavourResearchTrack: ['requestId', 'trackId', 'funding', 'expectedControlRevision', 'expectedResearchRevision', 'expectedCycle'],
  activateEndeavourEcmDevice: ['requestId', 'expectedControlRevision', 'expectedDeviceRevision', 'expectedCycle'],
  upgradeEndeavourFieldTargets: ['requestId', 'expectedHostShipId', 'targets', 'expectedControlRevision', 'expectedUpgradeRevision', 'expectedCycle'],
  launchAegisFighterWing: ['requestId', 'wingId', 'expectedTurn', 'expectedRevision', 'expectedWingRevision'],
  launchPdfEscortWing: ['requestId', 'expectedTurn', 'expectedRevision', 'expectedWingRevision'],
  sendFleetGroupMessage: ['requestId', 'expectedGroupId', 'text'],
  commitAwayMissionLifecycleCommand: ['requestId', 'missionId', 'expectedRevision', 'type', 'count', 'opportunityId', 'shipId'],
  commitWolfBoardingDefenceChoice: ['requestId', 'attackId', 'choice'],
  commitWolfFighterRangeActionChoice: ['requestId', 'attackId', 'choice'],
  requestShuttleDeparture: ['requestId', 'shuttleId', 'destinationShipId', 'expectedControlRevision', 'expectedCycle'],
  beginShuttleTransit: ['requestId', 'shuttleId', 'expectedDepartureRequestId', 'expectedControlRevision', 'expectedCycle'],
  retargetShuttleTransit: ['requestId', 'shuttleId', 'transitRequestId', 'destinationShipId', 'expectedControlRevision', 'expectedCycle'],
  completeShuttleArrival: ['shuttleId', 'transitRequestId', 'expectedControlRevision'],
});

const RESULT_FIELDS = Object.freeze({
  repairConsolesFromMacaw: ['status', 'requestId', 'repairRevision', 'currentRepairRevision', 'scrapAfter', 'hostShipId'],
  proposePermissionedDismantling: ['status', 'proposalId', 'targetShipId', 'targetConsoleId', 'targetRevision'],
  consentToPermissionedDismantling: ['status', 'consentStatus', 'proposalId', 'targetRevision'],
  applyPermissionedDismantling: ['status', 'proposalId', 'targetShipId', 'targetConsoleId', 'targetRevision', 'scrapAfter'],
  recycleWithBoa: ['status', 'revision', 'scrapRemaining', 'hostShipId'],
  chooseBoaMissionReclamationOpportunity: ['status', 'taskOpportunityId', 'choiceRevision'],
  resolveWolfAttackAftermath: ['status', 'revision', 'currentRevision', 'scrapRemaining'],
  rollHummingbirdHarvest: ['status', 'revision', 'currentRevision'],
  allocateHummingbirdHarvest: ['status', 'revision', 'currentRevision'],
  buildFighter: ['status', 'revision', 'currentRevision', 'fighterWingRevision', 'wingId', 'count', 'materials'],
  requestScout: ['status', 'revision', 'currentRevision', 'targetCoordinate'],
  advanceEndeavourResearchTrack: ['status', 'revision', 'currentRevision', 'trackId', 'funding'],
  activateEndeavourEcmDevice: ['status', 'revision', 'currentRevision', 'deviceStatus'],
  upgradeEndeavourFieldTargets: ['status', 'revision', 'currentRevision', 'upgradeRevision'],
  launchAegisFighterWing: ['status', 'revision', 'wingRevision', 'launched', 'wingId'],
  launchPdfEscortWing: ['status', 'revision', 'wingRevision', 'launched'],
  sendFleetGroupMessage: ['status', 'revision', 'groupId'],
  commitAwayMissionLifecycleCommand: ['status', 'revision', 'expectedRevision', 'currentRevision'],
  commitWolfBoardingDefenceChoice: ['status', 'revision', 'choiceStatus'],
  commitWolfFighterRangeActionChoice: ['status', 'revision', 'choiceStatus'],
  requestShuttleDeparture: ['status', 'requestId', 'revision', 'shuttleId', 'destinationShipId', 'cycle'],
  beginShuttleTransit: ['status', 'requestId', 'revision', 'shuttleId', 'transitRequestId', 'destinationShipId', 'cycle'],
  retargetShuttleTransit: ['status', 'requestId', 'revision', 'shuttleId', 'transitRequestId', 'destinationShipId', 'cycle'],
  completeShuttleArrival: ['status', 'revision', 'shuttleId', 'transitRequestId', 'hostShipId', 'arrivedAt'],
});

const RENDERED_STATUS_CODES = new Set([
  'public-result-visible', 'private-result-visible', 'current-group-note-visible',
  'mission-choice-visible', 'post-attack-scrap-visible',
]);
const PRIVATE_CHOICE_FIELDS = new Set([
  'targetCoordinate', 'trackId', 'missionOpportunityId', 'taskOpportunityId',
  'missionId', 'opportunityId', 'destinationShipId', 'transitRequestId',
  'expectedDepartureRequestId', 'hostShipId',
]);

/**
 * Source map for actions that must be exercised through current, ordinary controls.
 * Costs and gates summarize the checked local UI/server sources; live affordability,
 * current phase, holder, receipts and actual rendered result still come from the run.
 */
export const SPECIALIST_ACTION_MAP = Object.freeze([
  { prompt: '181', roleId: 'wing-commander', endpoint: 'requestScout', control: 'Starlight // Record request', sources: ['src/components/ScoutRequestControls.tsx', 'src/components/ShuttleConsoleTemplate.tsx', 'functions/src/index.ts'], gate: 'live Starlight holder, current scout entitlement and phase/range', cost: 'printed current Starlight sortie fuel', outcome: 'server scout receipt; keep private scan details out of the evidence file' },
  { prompt: '181', roleId: 'wing-commander', endpoint: 'buildFighter', control: 'Build 1 fighter // 1 material', sources: ['src/components/AegisConsoleWorkspace.tsx', 'src/lib/sessionService.ts', 'functions/src/index.ts'], gate: 'Team phase, charged undamaged Construction Bay, current Wing Commander, available bay capacity', cost: '1 AEGIS material', outcome: 'server fighter count, material balance and wing revision' },
  { prompt: '181', roleId: 'wing-commander', endpoint: 'launchAegisFighterWing', control: 'Launch Fighter Wing Alpha/Bravo', sources: ['src/components/AegisFighterWingLaunchPanel.tsx', 'src/lib/sessionService.ts', 'functions/src/index.ts'], gate: 'actual offered attack window, current Wing Commander, charged undamaged bay, available fighters', cost: 'fighters at actual attack losses only', outcome: 'committed launch for the current attack and wing revision' },
  { prompt: '215b', roleId: 'shepherd-scientist', endpoint: 'advanceEndeavourResearchTrack', control: 'Advance standard research', sources: ['src/components/EndeavourResearchPanel.tsx', 'src/components/EndeavourResearchChoices.tsx', 'functions/src/endeavourResearchWriter.ts'], gate: 'current Scientist authority, Endeavour Team phase, available private track and cadence', cost: 'standard printed research choice; 5 Shepherd ore for its separate extra choice', outcome: 'private research receipt; persist status/revision only' },
  { prompt: '215b', roleId: 'shepherd-scientist', endpoint: 'activateEndeavourEcmDevice', control: 'Use ECM Device', sources: ['src/components/EndeavourEcmDevicePanel.tsx', 'src/components/EndeavourEcmDeviceView.tsx', 'functions/src/endeavourEcmDeviceWriter.ts'], gate: 'live holder, researched device, current unspent device', cost: 'one-use device; server resolves its printed effect', outcome: 'device-use revision and public consequence only' },
  { prompt: '215b', roleId: 'shepherd-scientist', endpoint: 'upgradeEndeavourFieldTargets', control: 'Purchase selected upgrades', sources: ['src/components/EndeavourFieldUpgradePanel.tsx', 'src/lib/endeavourFieldUpgradeService.ts', 'functions/src/index.ts'], gate: 'current private Scientist workspace, live Coordination window and an eligible displayed target', cost: 'displayed per-target materials; honor live remaining cycle allowance', outcome: 'purchase revision and public upgraded-system projection' },
  { prompt: '215b', roleId: 'shepherd-scientist', endpoint: 'commitAwayMissionLifecycleCommand', control: 'actual current mission participant action', sources: ['src/routes/RoleBrief.tsx', 'src/components/AwayMissionLifecycleWorkspace.tsx', 'src/components/AwayMissionLifecyclePanel.tsx'], gate: 'current private mission assignment and its live revision', cost: 'only the displayed current mission opportunity', outcome: 'private participant receipt plus entitled public mission state' },
  { prompt: '215b', roleId: 'shepherd-scientist', endpoint: 'requestScout', control: 'Endeavour // Record request', sources: ['src/components/ScoutRequestControls.tsx', 'src/components/ShuttleConsoleTemplate.tsx', 'functions/src/index.ts'], gate: 'live Endeavour holder and current scout entitlement', cost: 'printed current Endeavour sortie fuel', outcome: 'server scout receipt; do not record private scan contents' },
  { prompt: '223b', roleId: 'quellon-explorer', endpoint: 'requestScout', control: 'Hummingbird // Record request', sources: ['src/components/ScoutRequestControls.tsx', 'src/components/ShuttleConsoleTemplate.tsx', 'functions/src/index.ts'], gate: 'live Quellon Explorer, fuelled Hummingbird, current phase/range', cost: 'printed current Hummingbird sortie fuel', outcome: 'server scout receipt; do not record private scan contents' },
  { prompt: '223b', roleId: 'quellon-explorer', endpoint: 'rollHummingbirdHarvest', control: 'Roll 2d6 for harvest', sources: ['src/components/HummingbirdHarvest.tsx', 'src/lib/hummingbirdHarvestService.ts', 'functions/src/index.ts'], gate: 'current Explorer console, active live Coordination, Hummingbird fuelled and docked to an active host', cost: 'one live 2d6 harvest roll', outcome: 'private roll receipt; never persist dice values' },
  { prompt: '223b', roleId: 'quellon-explorer', endpoint: 'allocateHummingbirdHarvest', control: 'Die 1 or Die 2 allocation', sources: ['src/components/HummingbirdHarvest.tsx', 'src/lib/hummingbirdHarvestService.ts', 'functions/src/index.ts'], gate: 'same authenticated Explorer and the current private pending roll', cost: 'choose which actual die adds Food; other die adds Water to Hummingbird cargo', outcome: 'resolved private harvest status/revision; never persist die values' },
  { prompt: '223b', roleId: 'quellon-explorer', endpoint: 'commitAwayMissionLifecycleCommand', control: 'actual current mission participant action', sources: ['src/routes/RoleBrief.tsx', 'src/components/AwayMissionLifecycleWorkspace.tsx', 'src/components/AwayMissionLifecyclePanel.tsx'], gate: 'current private mission assignment and its live revision', cost: 'only the displayed current mission opportunity', outcome: 'private participant receipt plus entitled public mission state' },
  { prompt: '233b', roleId: 'refinery-124-pdf-colonel', endpoint: 'launchPdfEscortWing', control: 'Launch PDF Escort Wing', sources: ['src/components/PdfEscortWingReference.tsx', 'src/lib/sessionService.ts', 'functions/src/index.ts'], gate: 'real offered attack launch window and current PDF Colonel authority', cost: 'fighters at actual attack losses only', outcome: 'server launch receipt and member-safe wing projection' },
  { prompt: '233b', roleId: 'refinery-124-pdf-colonel', endpoint: 'sendFleetGroupMessage', control: 'Relay message to current group', sources: ['src/components/PdfNewsRelayPanel.tsx', 'src/lib/fleetGroupService.ts', 'functions/src/index.ts'], gate: 'current PDF Colonel and the actor’s current live fleet group', cost: 'none', outcome: 'local group note only; never save or publish message text in evidence' },
  { prompt: '233b', roleId: 'refinery-124-pdf-colonel', endpoint: 'commitAwayMissionLifecycleCommand', control: 'actual current mission participant action', sources: ['src/routes/RoleBrief.tsx', 'src/components/AwayMissionLifecycleWorkspace.tsx', 'src/components/AwayMissionLifecyclePanel.tsx'], gate: 'current private mission assignment and its live revision', cost: 'only the displayed current mission opportunity', outcome: 'private participant receipt plus entitled public mission state' },
  { prompt: '233b', roleId: 'refinery-124-pdf-colonel', endpoint: 'commitWolfBoardingDefenceChoice', control: 'actual enabled PDF/boarding decision', sources: ['src/routes/ShuttleConsole.tsx', 'src/components/BoardingSecurityTeamPanel.tsx', 'src/lib/sessionService.ts', 'functions/src/index.ts'], gate: 'actual current boarding window and offered defence choice', cost: 'only the offered security-team/reroll cost', outcome: 'committed choice and public receipt; preserve the chooser’s genuine decision' },
  { prompt: '576', roleId: 'capybara-captain', endpoint: 'proposePermissionedDismantling', control: 'Request target-player permission', sources: ['src/routes/ShuttleConsole.tsx', 'src/components/PermissionedDismantlingPanel.tsx', 'src/lib/permissionedDismantlingService.ts', 'functions/src/permissionedDismantlingCallable.ts'], gate: 'Macaw held by its current Capybara Captain, docked valid host, live Coordination and a distinct current target-player approval', cost: 'damage one undamaged host console; gain 1 Capybara Scrap after approved apply', outcome: 'exact proposal/consent/apply receipts; Capybara self-target stays blocked absent facilitator ruling' },
  { prompt: '576', roleId: 'capybara-captain', endpoint: 'applyPermissionedDismantling', control: 'Apply consented dismantling', sources: ['src/components/PermissionedDismantlingPanel.tsx', 'src/lib/permissionedDismantlingService.ts', 'functions/src/permissionedDismantlingCallable.ts'], gate: 'same Macaw holder and current matching target-player consent', cost: '+1 Scrap on success', outcome: 'one target damage and current Capybara Scrap projection' },
  { prompt: '576', roleId: 'capybara-captain', endpoint: 'repairConsolesFromMacaw', control: 'Repair selected consoles', sources: ['src/components/MacawRepairPanel.tsx', 'functions/src/macawRepair.ts', 'functions/src/index.ts'], gate: 'Macaw holder, live Coordination, settled available Capybara source, undestroyed current docked host; shared two-console/two-host cycle ledger', cost: '1 Capybara Scrap per repaired console; fuel for a second host', outcome: 'current ship repair and Capybara Scrap projections' },
  { prompt: '579', roleId: 'capybara-recycler', endpoint: 'chooseBoaMissionReclamationOpportunity', control: 'Apply Boa reclamation to selected task', sources: ['src/components/BoaMissionReclamationPanel.tsx', 'functions/src/boaMissionReclamationCallable.ts', 'functions/src/boaMissionReclamationCallables.ts'], gate: 'current Boa Recycler, current fleet group and one unstarted mission-card task before initial deal', cost: 'choice uses source-registered Boa opportunity; no resource cost to record choice', outcome: 'freeze actual selected task and server-computed floor-half difficulty assumption; on success award exactly 1 Boa Scrap without critical bonus' },
  { prompt: '579', roleId: 'capybara-recycler', endpoint: 'recycleWithBoa', control: 'Recycle [displayed resource] for 1 Scrap', sources: ['src/components/BoaRecyclingPanel.tsx', 'functions/src/boaRecyclingCallable.ts', 'functions/src/index.ts'], gate: 'current Boa Recycler, fuelled Boa, live Coordination, active docked host, live quota and displayed balance', cost: 'one printed recipe: 6 Food/Water/Ore/Fuel or 3 Materials; up to two exchanges per cycle', outcome: 'exact resource debit and +1 Boa Scrap' },
  { prompt: '581', roleId: 'capybara-captain', endpoint: 'resolveWolfAttackAftermath', control: 'Collect Scrap from [actual qualifying target]', sources: ['src/components/WolfAttackAftermathActionPanel.tsx', 'src/lib/wolfAttackAftermathService.ts', 'functions/src/wolfAttackAftermathCallable.ts'], gate: 'only a real resolved attack with at least 3 damage to this current docked/retained target and the current Macaw holder', cost: 'one existing post-attack collectible per qualifying ship', outcome: 'exactly 1 Scrap per eligible ship/attack; never manufacture or infer an opportunity' },
  { prompt: '581', roleId: 'capybara-recycler', endpoint: 'resolveWolfAttackAftermath', control: 'Collect Scrap from [actual qualifying target]', sources: ['src/components/WolfAttackAftermathActionPanel.tsx', 'src/lib/wolfAttackAftermathService.ts', 'functions/src/wolfAttackAftermathCallable.ts'], gate: 'only a real resolved attack with at least 3 damage to this current docked/retained target and the current Boa Recycler', cost: 'one existing post-attack collectible per qualifying ship', outcome: 'exactly 1 Scrap per eligible ship/attack; never manufacture or infer an opportunity' },
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function allowlisted(source, fields) {
  if (!isRecord(source)) return {};
  const result = {};
  for (const field of fields) {
    const value = source[field];
    if (field === 'text' && typeof value === 'string') {
      result.textLength = value.length;
      result.textHash = hash(value);
      continue;
    }
    if (PRIVATE_CHOICE_FIELDS.has(field) && typeof value === 'string') {
      result[`${field}Hash`] = hash(value);
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[field] = typeof value === 'string' ? value.slice(0, 120) : value;
    } else if (Array.isArray(value) && value.length <= 12 && value.every(item => typeof item === 'string')) {
      result[field] = value.map(item => item.slice(0, 80));
    } else if (field === 'choice' && isRecord(value)) {
      const choice = {};
      for (const key of ['action', 'shuttleId', 'targetShipId', 'wingId', 'range', 'selectedShipIds']) {
        const nested = value[key];
        if (typeof nested === 'string') choice[key] = nested.slice(0, 80);
        else if (Array.isArray(nested) && nested.length <= 12 && nested.every(item => typeof item === 'string')) choice[key] = [...nested];
      }
      if (Number.isSafeInteger(value.securityTeams) && value.securityTeams >= 0 && value.securityTeams <= 99) {
        choice.securityTeams = value.securityTeams;
      }
      result.choice = choice;
    } else if (field === 'targets' && Array.isArray(value) && value.length <= 8) {
      result.targets = value.flatMap(target => isRecord(target) && typeof target.shipId === 'string' && typeof target.systemId === 'string'
        ? [{ shipId: target.shipId.slice(0, 80), systemId: target.systemId.slice(0, 80) }] : []);
    }
  }
  return result;
}

function actionRevision(value) {
  if (!isRecord(value)) return null;
  for (const key of ['revision', 'repairRevision', 'choiceRevision', 'purchaseRevision', 'upgradeRevision', 'wingRevision', 'fighterWingRevision', 'currentRevision']) {
    if (Number.isSafeInteger(value[key])) return value[key];
  }
  if (isRecord(value.cycle) && Number.isSafeInteger(value.cycle.revision)) return value.cycle.revision;
  return null;
}

function comparable(value) {
  if (!isRecord(value)) return value;
  const entries = Object.entries(value).filter(([key]) => key !== 'status')
    .sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries.map(([key, item]) => [key,
    isRecord(item) ? comparable(item) : Array.isArray(item) ? item.map(entry => isRecord(entry) ? comparable(entry) : entry) : item,
  ]));
}

/** Compare an exact request's original and replayed result, ignoring only receipt status. */
export function sameActionReceipt(first, replay) {
  return JSON.stringify(comparable(first)) === JSON.stringify(comparable(replay));
}

/** Build a redacted receipt record from a real UI POST and its unchanged SDK replay. */
export function projectSpecialistActionEvidence({
  roleId, endpoint, actor, request, response, replay, cost, projection,
}) {
  const requestFields = REQUEST_FIELDS[endpoint];
  const resultFields = RESULT_FIELDS[endpoint];
  if (!requestFields || !resultFields) throw new Error(`Specialist action endpoint is unmapped: ${String(endpoint)}`);
  const actualResult = response?.result;
  const replayResult = replay?.result;
  const selectedCost = isRecord(cost) ? Object.fromEntries(Object.entries(cost).filter(([key, value]) =>
    ['resource', 'amount', 'result', 'unit'].includes(key) &&
    (typeof value === 'string' || typeof value === 'number'))) : null;
  const sourceProjection = isRecord(projection) ? {
    ...(isRecord(projection.gm) ? { gm: allowlisted(projection.gm, ['source', 'cycle', 'revision', 'status']) } : {}),
    ...(isRecord(projection.crew) ? { crew: allowlisted(projection.crew, ['source', 'cycle', 'revision', 'status']) } : {}),
    ...(RENDERED_STATUS_CODES.has(projection.renderedStatus) ? { renderedStatus: projection.renderedStatus } : {}),
    ...(projection.privateActorStatus === 'private-result-visible'
      ? { privateActorStatus: 'private-result-visible' } : {}),
  } : {};
  const requested = allowlisted(request, requestFields);
  const summarized = allowlisted(actualResult, resultFields);
  const summarizedReplay = allowlisted(replayResult, resultFields);
  const resultStatus = typeof summarized.status === 'string' ? summarized.status
    : endpoint === 'completeShuttleArrival' && typeof actualResult?.hostShipId === 'string' &&
      Number.isFinite(Date.parse(actualResult.arrivedAt)) ? 'arrived' : null;
  const resultSummary = Object.fromEntries(Object.entries(summarized).filter(([key]) => key !== 'status'));
  const replaySummary = Object.fromEntries(Object.entries(summarizedReplay).filter(([key]) => key !== 'status'));
  const projectionRevision = sourceProjection.gm?.revision ?? sourceProjection.crew?.revision ?? null;
  return {
    schemaVersion: 1,
    endpoint,
    roleId,
    actor: {
      uidHash: typeof actor?.uidHash === 'string' ? actor.uidHash.slice(0, 80) : null,
      sessionIdHash: hash(actor?.sessionId),
      activeConsoleRoleId: typeof actor?.activeConsoleRoleId === 'string' ? actor.activeConsoleRoleId.slice(0, 80) : null,
      connection: actor?.connection === 'live' ? 'live' : 'not-live',
      freshness: actor?.freshness === 'server' ? 'server' : 'not-server',
    },
    request: requested,
    cost: selectedCost,
    response: {
      httpStatus: Number.isSafeInteger(response?.httpStatus) ? response.httpStatus : null,
      ...(typeof response?.errorCategory === 'string' ? { errorCategory: response.errorCategory.slice(0, 80) } : {}),
      resultStatus,
      revision: actionRevision(actualResult),
      ...resultSummary,
      replayStatus: typeof replayResult?.status === 'string' ? replayResult.status
        : typeof replay?.status === 'string' ? replay.status : null,
      replayRevision: actionRevision(replayResult),
      exactReplay: sameActionReceipt(actualResult, replayResult),
      projectionRevision,
    },
    projection: sourceProjection,
  };
}

/**
 * Capture a mutation from the current UI. `click` must operate an enabled rendered
 * control; `waitForProjection` must confirm its real server-owned result before return.
 */
export async function captureSpecialistUiAction({
  game, roleId, endpoint, click, prepare, originalActor, waitForProjection, cost = null, requireConsole = true,
}) {
  assert.ok(game?.context?.initial?.sessionId, 'Use the current fresh full-game demo context.');
  assert.equal(typeof click, 'function');
  assert.equal(typeof waitForProjection, 'function', 'Wait for source projections and visible server result.');
  if (prepare !== undefined) assert.equal(typeof prepare, 'function');
  if (!REQUEST_FIELDS[endpoint]) throw new Error(`Specialist action endpoint is unmapped: ${String(endpoint)}`);
  const surface = await game.select(roleId);
  // Finish the current control's preparation after normal rich selection and
  // before the mutation observer. Navigation can unmount a shuttle form.
  await prepare?.(surface.page);
  const before = await surface.observe();
  assert.equal(before.sameActor, true, 'Only the normally authenticated current actor can act.');
  assert.equal(before.sessionId, game.context.initial.sessionId);
  assert.equal(before.connection, 'live');
  assert.equal(before.freshness, 'server');
  assert.equal(before.profileRoleId, roleId);
  if (requireConsole) assert.equal(before.activeConsoleRoleId, roleId, 'Enter the current role-bound station first.');
  if (originalActor) for (const key of ['uidHash', 'sessionId', 'profileRoleId', 'activeConsoleRoleId',
    'documentTimeOrigin', 'profileSessionId', 'playerRole', 'assignedRoleId']) {
    assert.equal(before[key], originalActor[key], `The original ${roleId} actor remains bound through preparation.`);
  }

  const response = await observeUiReceipt({
    waitForResponse: () => surface.page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.endsWith(`/us-central1/${endpoint}`) && response.request().method() === 'POST';
    }),
    choose: () => click(surface.page),
  });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  const request = response.request().postDataJSON()?.data;
  const actualResult = isRecord(body) && isRecord(body.result) ? body.result : undefined;
  const failed = !response.ok() || !actualResult;
  let replay = null;
  let projection = {};
  if (!failed) {
    const currentActor = await surface.observe();
    for (const key of ['uidHash', 'sessionId', 'profileRoleId', 'activeConsoleRoleId']) {
      assert.equal(currentActor[key], before[key], `The original ${roleId} actor and console remain bound.`);
    }
    assert.equal(currentActor.sameActor, true);
    assert.equal(currentActor.connection, 'live');
    assert.equal(currentActor.freshness, 'server');
    replay = await surface.callable(endpoint, request);
    assert.equal(replay.status, 'committed', `Exact original ${endpoint} request remains recoverable.`);
    assert.equal(sameActionReceipt(actualResult, replay.result), true,
      `Original ${endpoint} response and its exact same-actor replay must agree.`);
    projection = await waitForProjection({ game, surface, actor: before, request, result: actualResult, replay: replay.result });
  }
  const evidence = projectSpecialistActionEvidence({
    roleId, endpoint, actor: before, request,
    response: {
      httpStatus: response.status(),
      ...(failed ? { errorCategory: body?.error?.status ?? body?.error?.code ?? 'unclassified-http-error' } : { result: actualResult }),
    },
    replay: failed ? null : replay,
    cost,
    projection,
  });
  game.actions?.push({ ...evidence, transport: 'real connected UI POST followed by exact same-actor Firebase SDK replay' });
  await game.save?.('specialist-gameplay-progress.json', { status: failed ? 'action-failed' : 'action-committed' });
  return { evidence, result: actualResult, replay: replay?.result ?? null, projection, failed };
}

/**
 * Bind specialist proof steps to the ordinary two-browser adapter. A caller supplies
 * the live, source-specific readiness check; the driver additionally requires both
 * session projections and the original role account to remain current before credit.
 */
export function createSpecialistGameplayDriver(game, {
  timeoutMs = 60_000,
  intervalMs = 250,
  now = Date.now,
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
} = {}) {
  assert.ok(game?.context?.gm && game?.context?.initial?.sessionId,
    'Specialist proof needs the actual fresh two-browser gameplay context.');
  assert.equal(typeof game.state, 'function', 'Use the connected adapter’s public server projection.');
  assert.equal(typeof game.select, 'function', 'Select an existing, normally admitted actor.');
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs >= 0);
  assert.ok(Number.isSafeInteger(intervalMs) && intervalMs >= 0);
  assert.equal(typeof now, 'function');
  assert.equal(typeof wait, 'function');

  async function waitForCommit({ surface, actor, inspect, timeoutMs: callTimeout = timeoutMs }) {
    assert.equal(typeof surface?.observe, 'function');
    assert.equal(typeof inspect, 'function');
    assert.ok(Number.isSafeInteger(callTimeout) && callTimeout >= 0);
    const sessionId = game.context.initial.sessionId;
    const deadline = now() + callTimeout;
    let latest;
    do {
      const [gmState, crewState, currentActor] = await Promise.all([
        game.state(game.context.gm), game.state(surface), surface.observe(),
      ]);
      latest = { gmState, crewState, currentActor };
      for (const [name, state] of [['GM', gmState], ['crew', crewState]]) {
        assert.equal(state?.sessionId, sessionId, `${name} view must remain bound to the fresh session.`);
      }
      for (const key of ['uidHash', 'sessionId', 'profileRoleId', 'activeConsoleRoleId']) {
        assert.equal(currentActor?.[key], actor?.[key], `The same normally authenticated actor must hold ${key}.`);
      }
      assert.equal(currentActor?.sameActor, true, 'Current SDK identity must match the server member.');
      if (gmState?.live && crewState?.live && gmState?.cycle === crewState?.cycle &&
          currentActor?.connection === 'live' &&
          currentActor?.freshness === 'server') {
        const observed = await inspect({ game, surface, actor: currentActor, gmState, crewState });
        if (observed?.ready === true) {
          assert.ok(Number.isSafeInteger(observed.gmRevision) && observed.gmRevision >= 0,
            'Capture the actual GM-visible source revision.');
          assert.ok(Number.isSafeInteger(observed.crewRevision) && observed.crewRevision >= 0,
            'Capture the actual original-actor source revision.');
          assert.ok(RENDERED_STATUS_CODES.has(observed.renderedStatusCode),
            'Confirm an actual rendered result without saving private or user-authored text.');
          if (observed.privateResultVisible !== undefined) assert.equal(typeof observed.privateResultVisible, 'boolean');
          return {
            gm: { source: 'server', cycle: gmState.cycle, revision: observed.gmRevision, status: 'committed' },
            crew: { source: 'server', cycle: crewState.cycle, revision: observed.crewRevision, status: 'committed' },
            renderedStatus: observed.renderedStatusCode,
            ...(observed.privateResultVisible ? { privateActorStatus: 'private-result-visible' } : {}),
          };
        }
      }
      if (now() >= deadline) break;
      await wait(intervalMs);
    } while (now() <= deadline);
    throw new Error(`Fresh specialist projections and a rendered result did not converge: ${JSON.stringify({
      gmSessionId: latest?.gmState?.sessionId, gmLive: latest?.gmState?.live, gmCycle: latest?.gmState?.cycle,
      crewSessionId: latest?.crewState?.sessionId, crewLive: latest?.crewState?.live,
      crewCycle: latest?.crewState?.cycle, actorUidHash: latest?.currentActor?.uidHash,
      activeConsoleRoleId: latest?.currentActor?.activeConsoleRoleId,
    })}`);
  }

  async function capture({ roleId, endpoint, click, prepare, originalActor, inspect, cost = null, requireConsole = true,
    timeoutMs: callTimeout = timeoutMs }) {
    assert.equal(typeof inspect, 'function', 'Inspect source projections and the actual rendered result.');
    return captureSpecialistUiAction({ game, roleId, endpoint, click, prepare, originalActor, cost, requireConsole,
      waitForProjection: ({ surface, actor, request, result, replay }) => waitForCommit({
        surface, actor, timeoutMs: callTimeout,
        inspect: context => inspect({ ...context, request, result, replay }),
      }),
    });
  }

  return Object.freeze({ capture, waitForCommit });
}

/** Build a callback for the fresh-game runner without changing its lifecycle hooks. */
export function createSpecialistGameplayCallback({ createTwoBrowserGameplay, steps, name = 'specialist gameplay' }) {
  assert.equal(typeof createTwoBrowserGameplay, 'function');
  assert.ok(Array.isArray(steps) && steps.every(step => typeof step === 'function'),
    'Pass only explicit, source-backed ordinary UI action steps.');
  assert.equal(typeof name, 'string');
  return async context => {
    const game = createTwoBrowserGameplay(context);
    const driver = createSpecialistGameplayDriver(game);
    const outcomes = [];
    for (const step of steps) outcomes.push(await step({ context, game, driver }));
    const committedActions = outcomes.filter(outcome => outcome?.failed !== true &&
      (outcome?.evidence?.response?.resultStatus === 'committed' ||
        outcome?.evidence?.endpoint === 'completeShuttleArrival' && outcome?.evidence?.response?.resultStatus === 'arrived') &&
      outcome?.evidence?.response?.exactReplay === true &&
      Number.isSafeInteger(outcome?.evidence?.response?.projectionRevision)).length;
    const failedActions = outcomes.filter(outcome => outcome?.failed === true).length;
    await game.save?.('specialist-gameplay-progress.json', {
      status: 'recorded', acceptance: 'not-claimed', callback: name,
      committedActions, failedActions, uncreditedActions: outcomes.length - committedActions - failedActions,
      limitations: ['Only fresh actions with original actor replay and converged GM/crew projections earn action proof.',
        'Unavailable controls, failed requests, and skipped source opportunities remain uncredited.'],
    });
    return { game, driver, outcomes };
  };
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ANCHORS as endingAnchors, REVIEWS as endings } from './pc10-action-review-source-endings.mjs';
import { ANCHORS as workspaceAnchors, REVIEWS as workspaces } from './pc10-action-review-source-workspaces.mjs';
import { REVIEWS as demo } from './pc10-action-review-source-demo.mjs';

const repositoryDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const reviewByName = new Map([...endings, ...workspaces, ...demo].map(row => [row.exportName, row]));
const annotationSource = readFileSync(resolve(repositoryDirectory, 'scripts/pc10-action-review-annotations.mjs'), 'utf8');

function productSource(path) {
  return readFileSync(resolve(repositoryDirectory, path), 'utf8');
}

function primaryReview(name) {
  const start = annotationSource.indexOf(`exportName: '${name}'`);
  assert.notEqual(start, -1, `${name} remains in the primary review list`);
  const end = annotationSource.indexOf('\n  },', start);
  assert.notEqual(end, -1, `${name} review has a bounded row`);
  return annotationSource.slice(start, end);
}

function requireReview(name) {
  const row = reviewByName.get(name);
  assert.ok(row, `${name} has an additive source review`);
  return row;
}

function assertCurrentServedReview(name, expected) {
  const row = requireReview(name);
  assert.equal(row.classification, 'served-ui-path', `${name} current source classification`);
  assert.equal(row.productPath.status, 'source-reviewed-ui-path; runtime visibility pending', `${name} remains source-only`);
  assert.equal(row.productPath.surface, expected.surface, `${name} served surface`);
  assert.equal(row.productPath.invocation, expected.invocation, `${name} client invocation`);
  assert.deepEqual(row.productPath.sourceAnchorIds, expected.sourceAnchorIds, `${name} product-path anchors`);
  assert.equal(row.actor.family, expected.actor, `${name} actor`);
  assert.deepEqual(row.actor.identities, expected.identities, `${name} actor identities`);
  assert.deepEqual(row.actor.sourceAnchorIds, expected.sourceAnchorIds, `${name} actor anchors`);
  assert.deepEqual(row.actor.conditions, [expected.requirements], `${name} actor requirements`);
  for (const field of ['requirements', 'costs', 'consequences', 'blockers', 'nextActor']) {
    assert.equal(row[field].summary, expected[field], `${name} ${field}`);
    assert.deepEqual(row[field].sourceAnchorIds, expected.sourceAnchorIds, `${name} ${field} anchors`);
  }
  assert.equal(row.guidance.status, 'source-guidance-in-mounted-component; visibility pending', `${name} guidance status`);
  assert.equal(row.guidance.summary, expected.guidance, `${name} current guidance`);
  assert.deepEqual(row.guidance.sourceAnchorIds, expected.sourceAnchorIds, `${name} guidance anchors`);
}

test('current review traces candidate post-terminal results and exact request recovery', () => {
  const read = requireReview('readCandidateWorkspace');
  const action = requireReview('executeCandidateAction');
  assert.match(read.productPath.surface, /Candidate Preparation/);
  assert.match(read.requirements.summary, /Cycle 1|currentTurn|current cycle/i);
  assert.match(read.consequences.summary, /ended|terminal|committed result/i);
  assert.match(read.guidance.summary, /original candidate result|ended result/i);
  assert.match(action.requirements.summary, /active phase/i);
  assert.match(action.consequences.summary, /receipt|replay/i);
  assert.match(action.blockers.summary, /terminal|ended/i);
  assert.match(action.guidance.summary, /exact|original request|retry/i);
});

test('scout review keeps live instance, session identity, phase and freshness gates distinct', () => {
  for (const name of ['listPendingScoutRequests', 'listGmScoutResolutionLog', 'resolvePendingScoutRequest']) {
    const row = primaryReview(name);
    assert.match(row, /session|sessionId/i, `${name} binds the current session`);
    assert.match(row, /owned live instance|instanceId/i, `${name} requires the owned facilitator lease`);
    assert.match(row, /server-fresh|freshness|server snapshot/i, `${name} has a source-backed current snapshot gate`);
    assert.match(row, /active phase|phase === 'active'/i, `${name} is phase-scoped`);
  }
});

test('P.D.F. launch and Fighter Ace reviews account for current phase and the PDF pass mount', () => {
  for (const name of ['getPdfEscortWingLaunch', 'launchPdfEscortWing', 'getPdfFighterAcePermissionView',
    'grantPdfFighterAcePermission', 'passWolfFighterLaunchChoice']) {
    const row = requireReview(name);
    assert.match(row.requirements.summary, /active gameplay|active attack/i, `${name} phase gate`);
    assert.match(row.productPath.surface, /P\.D\.F\.|PdfEscortWingReference|Fighter Ace/i, `${name} current surface`);
  }
  const pdfPassAnchor = endingAnchors.find(([id]) => id === 'ending.passWolfFighterLaunchChoice.pdfUi');
  assert.deepEqual(pdfPassAnchor, ['ending.passWolfFighterLaunchChoice.pdfUi',
    'src/components/PdfEscortWingReference.tsx', 'PdfEscortWingReference']);
});

test('loyalty review describes listener-first acknowledgement and App census rebinding', () => {
  const row = requireReview('assignLoyalty');
  assert.match(row.consequences.summary, /listener-first|accepted.*snapshot/i);
  assert.match(row.blockers.summary, /stale|changed.*revision/i);
  assert.ok(row.productPath.sourceAnchorIds.some(id => id === 'workspace.mount.app'));
  assert.ok(workspaceAnchors.some(([id, path, symbol]) => id === 'workspace.mount.app' &&
    path === 'src/App.tsx' && symbol === 'App'));
});

test('App recovery annotations retain closed-history and census-refresh boundaries', () => {
  const resume = primaryReview('resumeSession');
  assert.match(resume, /closed-session history/i);
  assert.match(resume, /read-only|ephemeral/i);
  assert.match(resume, /seat|presence/i);
  const presence = primaryReview('refreshPresence');
  assert.match(presence, /heartbeat/i);
  assert.match(presence, /closed|terminal/i);
});

test('current source keeps four standalone UI gaps and traces IA, damage, and Wolf controls precisely', () => {
  const unserved = ['getSessionPresence', 'adjustShipResource', 'adjustShipUnrest', 'adjustShipPopulation'];
  for (const name of unserved) {
    const row = requireReview(name);
    assert.equal(row.classification, 'genuinely-unserved', name);
    assert.equal(row.productPath.status, 'source-reviewed-no-current-mounted-action-path', `${name} has no mounted direct action`);
    assert.equal(row.guidance.status, 'current-source-ui-gap', `${name} remains an explicit current source gap`);
  }

  const intelligenceAnchorIds = [
    'ending.investigateAsIntelligenceAgent.server', 'ending.investigateAsIntelligenceAgent.service',
    'ending.investigateAsIntelligenceAgent.ui', 'ending.investigateAsIntelligenceAgent.rule1',
    'ending.investigateAsIntelligenceAgent.rule2',
  ];
  const damageAnchorIds = [
    'ending.addShipDamage.server', 'ending.addShipDamage.service', 'ending.addShipDamage.ui',
    'ending.addShipDamage.rule1',
  ];
  const intelligenceAnchors = [
    ['ending.investigateAsIntelligenceAgent.server', 'functions/src/index.ts', 'investigateAsIntelligenceAgent'],
    ['ending.investigateAsIntelligenceAgent.service', 'src/lib/intelligenceInvestigationService.ts', 'investigatePlayer'],
    ['ending.investigateAsIntelligenceAgent.ui', 'src/components/PrivateLoyaltyPanel.tsx', 'PrivateLoyaltyPanel'],
    ['ending.investigateAsIntelligenceAgent.rule1', 'src/App.tsx', 'AppRoutes'],
    ['ending.investigateAsIntelligenceAgent.rule2', 'functions/src/index.ts', 'requireActiveGameplayPhase'],
  ];
  const damageAnchors = [
    ['ending.addShipDamage.server', 'functions/src/index.ts', 'addShipDamage'],
    ['ending.addShipDamage.service', 'src/lib/shipDamageService.ts', 'assignShipDamage'],
    ['ending.addShipDamage.ui', 'src/components/MaintenanceSystems.tsx', 'MaintenanceSystems'],
    ['ending.addShipDamage.rule1', 'functions/src/shipDamage.ts', 'drawShipDamage'],
  ];
  assert.deepEqual(endingAnchors.filter(([id]) => id.startsWith('ending.investigateAsIntelligenceAgent.')),
    intelligenceAnchors, 'IA endpoint, adapter, component, App mount, and phase guard anchors');
  assert.deepEqual(endingAnchors.filter(([id]) => id.startsWith('ending.addShipDamage.')),
    damageAnchors, 'damage endpoint, adapter, component, and draw-rule anchors');
  assert.deepEqual(requireReview('investigateAsIntelligenceAgent').productPath.sourceAnchorIds, intelligenceAnchorIds);
  assert.deepEqual(requireReview('addShipDamage').productPath.sourceAnchorIds, damageAnchorIds);

  assertCurrentServedReview('investigateAsIntelligenceAgent', {
    surface: 'PrivateLoyaltyPanel',
    invocation: 'investigatePlayer service → investigateAsIntelligenceAgent callable',
    sourceAnchorIds: intelligenceAnchorIds,
    actor: 'a connected, active, unreplaced player whose private loyalty is Intelligence Agent',
    identities: ['intelligence-agent'],
    requirements: 'Requires an active, unreplaced Intelligence Agent with a canonical census entry and suspicion of at least 6; choose a different active connected player in the same fleet group and current gameplay cycle. Only one investigation may commit per cycle.',
    costs: 'Consumes the one investigation per cycle and adds 2 suspicion; no separate inventory resource is spent.',
    consequences: 'Writes the Agent’s private report, updated suspicion/census record, and audit. The target’s true loyalty remains private; the server returns an accurate report on rolls 1–4 and an inverted report on roll 5 (4-in-5 accuracy).',
    blockers: 'Wrong role/group, self-target, inactive or disconnected target, insufficient suspicion, stale cycle, malformed census, or prior investigation this cycle blocks the request.',
    nextActor: 'The investigator reviews the private result in the mounted panel; no other actor is selected by this action.',
    guidance: 'The mounted PrivateLoyaltyPanel labels the action “Investigate a player,” offers connected players in the investigator’s fleet group, and displays the private report.',
  });

  assertCurrentServedReview('addShipDamage', {
    surface: 'MaintenanceSystems',
    invocation: 'assignShipDamage service → addShipDamage callable',
    sourceAnchorIds: damageAnchorIds,
    actor: 'a live facilitator with selected-ship counter authority',
    identities: ['GM with owned live instance and selected-ship write grant'],
    requirements: 'Requires active gameplay, a supported damage deck, an owned live GM instance, selected-ship write authority and current vessel revision. The mounted GM Assign damage control invokes the assignShipDamage alias, which sends addShipDamage with a bound request ID.',
    costs: 'Adds one server-drawn damage card; no player resource is paid. The draw is bounded by authoritative deck state.',
    consequences: 'Adds the server-drawn damage card and its system/result notice. A non-destroying non-armoured hit moves surviving population down one printed-track step when anyone remains. Vessel-specific armour and deck-exhaustion rules remain authoritative; a genuine destruction marks affected players escaped, retains eligible shuttles and can commit total-fleet-loss.',
    blockers: 'Unsupported deck, inactive/locked ship, stale revision, exhausted/inconsistent draw state or missing GM grant blocks it.',
    nextActor: 'The facilitator and entitled crew review the drawn card and current ship state; normal maintenance and repair controls re-evaluate the resulting availability. This action does not advance the cycle.',
    guidance: 'MaintenanceSystems mounts the GM Assign damage control beside source-specific remaining-deck, armour, survivor-track and exhaustion guidance, and displays the actual drawn card or terminal result.',
  });

  const intelligencePanel = productSource('src/components/PrivateLoyaltyPanel.tsx');
  const intelligenceService = productSource('src/lib/intelligenceInvestigationService.ts');
  const wolfService = productSource('src/lib/wolfActionService.ts');
  const damagePanel = productSource('src/components/MaintenanceSystems.tsx');
  const damageService = productSource('src/lib/shipDamageService.ts');
  const app = productSource('src/App.tsx');
  const shipRoute = productSource('src/routes/ShipConsole.tsx');
  const fleetConsole = productSource('src/components/FleetConsoleWorkspace.tsx');
  const fleetSystems = productSource('src/components/FleetSystemsWorkspace.tsx');
  assert.ok(intelligencePanel.includes("import { investigatePlayer } from '@/lib/intelligenceInvestigationService';"));
  assert.ok(intelligencePanel.includes('investigatePlayer(dispatchedTargetUid)'));
  assert.ok(intelligenceService.includes("functions(), 'investigateAsIntelligenceAgent'"));
  assert.ok(app.includes('<PrivateLoyaltyPanel />'), 'App mounts the loyalty panel');
  assert.ok(intelligencePanel.includes('submitWolfSupplySabotage('));
  assert.ok(wolfService.includes("functions(), 'submitWolfSupplySabotage'"));
  assert.ok(app.includes("const GmConsole = lazy(() => import('@/routes/GmConsole'))"));
  assert.ok(damagePanel.includes("import { assignShipDamage, repairAllShipDamage } from '@/lib/shipDamageService'"));
  assert.ok(damagePanel.includes('assignShipDamage(shipId).then(result =>'));
  assert.ok(damageService.includes("damageCommand<AssignShipDamageResult>(shipId, 'addShipDamage')"));
  assert.ok(app.includes("const ShipConsole = lazy(() => import('@/routes/ShipConsole'))"));
  assert.ok(app.includes('<Route path="/ships/:shipId" element={<DeferredShipConsole />} />'));
  assert.ok(shipRoute.includes('<FleetConsoleWorkspace'));
  assert.ok(fleetConsole.includes('<FleetSystemsWorkspace'));
  assert.ok(fleetSystems.includes('<MaintenanceSystems shipId={ship.id}'));

  const supply = primaryReview('submitWolfSupplySabotage');
  const exactSupplyFields = [
    "exportName: 'submitWolfSupplySabotage', classification: 'served-ui-path'",
    "status: 'served-ui-path',\n      currentSurface: 'PrivateLoyaltyPanel Wolf supply action',\n      currentMount: 'src/App.tsx → ScreenFade → PrivateLoyaltyPanel',",
    "invocation: 'PrivateLoyaltyPanel → wolfActionService.submitWolfSupplySabotage → submitWolfSupplySabotage callable'",
    "family: 'active connected player holding Wolf Agent or Wolf Cult loyalty in the matching setup-assigned cover role'",
    "identities: ['wolf-agent', 'wolf-cult']",
    "Requires an active gameplay cycle and an authenticated, connected active player; actor-only Wolf Agent or Wolf Cult loyalty; an unreplaced, non-escaped player with the setup-assigned cover role; one unused Wolf action for that cycle; a positive selected resource balance on an active shuttle owned by that cover; and a current facilitator loyalty census. A Press cover requires the Press station enabled and either no holder or this actor as holder.",
    'Destroys floor(current selected cargo / 2), half rounded down, from the chosen cover-owned shuttle; cargo must be positive, though cargo of one loses zero units. The action adds exactly 2 suspicion and consumes the cycle’s single Wolf action slot after validation succeeds.',
    'The server reduces selected shuttle cargo, updates the actor’s private loyalty and the facilitator census, records a private clue, action receipt, and audit, and creates a pending private hacking alert. The actor receives a receipt with the cargo remaining and new suspicion; clue details stay in the private facilitator path.',
    'A stale cycle; unauthenticated or inactive actor; replacement status or escape state; non-Wolf loyalty or mismatched assigned cover; disabled or differently held Press station; inactive/wrong-cover shuttle; empty cargo; already-used same-cycle Wolf action; malformed roster, loyalty, census, or alert history; or a conflicting request receipt rejects the fresh action.',
    'The facilitator receives the pending private hacking alert and must acknowledge that exact alert; only after acknowledgement does the server publish an actor-free player notice.',
    'The mounted private loyalty panel explains half-cargo loss rounded down, the two-suspicion increase, and the one-action-per-cycle limit. It labels the shuttle cargo target selector and explains when no positive cargo is available.',
    "sourceAnchorIds: ['supply.appMount', 'supply.otherWolfControls', 'supply.clientAdapter', 'supply.handler']",
    "sourceAnchorIds: ['supply.handler', 'supply.authorization', 'supply.otherWolfControls']",
    "sourceAnchorIds: ['supply.handler', 'supply.authorization', 'supply.calculation', 'supply.request', 'supply.otherWolfControls', 'supply.clientAdapter']",
    "sourceAnchorIds: ['supply.handler', 'supply.authorization', 'supply.calculation']",
    "sourceAnchorIds: ['supply.handler', 'supply.calculation', 'supply.receiptUi']",
    "sourceAnchorIds: ['supply.handler', 'supply.authorization', 'supply.calculation', 'supply.request', 'supply.otherWolfControls']",
    "sourceAnchorIds: ['supply.handler', 'supply.alertAcknowledgement']",
    "sourceAnchorIds: ['supply.appMount', 'supply.otherWolfControls']",
  ];
  for (const field of exactSupplyFields) assert.ok(supply.includes(field), `Wolf current review includes exact source-backed field: ${field}`);
  for (const anchor of [
    "['supply.handler', 'functions/src/index.ts', 'submitWolfSupplySabotage']",
    "['supply.otherWolfControls', 'src/components/PrivateLoyaltyPanel.tsx', 'PrivateLoyaltyPanel']",
    "['supply.appMount', 'src/App.tsx', 'AppRoutes']",
    "['supply.clientAdapter', 'src/lib/wolfActionService.ts', 'submitWolfSupplySabotage']",
  ]) assert.ok(annotationSource.includes(anchor), `Wolf endpoint, component, App, and adapter anchors include ${anchor}`);
  assert.match(annotationSource, /explicitPc11GuidanceGaps: \[\]/);
  assert.match(annotationSource, /canonicalSnapshotModified: false/);
  assert.match(annotationSource, /callableRoleCellsReviewed: 0/);
  assert.match(annotationSource, /gameplayAcceptanceCredit: 0/);
});

test('obsolete Wolf expectations remain verifiable only against their exact historical snapshot', () => {
  const fixturePath = resolve(repositoryDirectory, 'scripts/fixtures/pc10-current-refresh-obsolete-expectations.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const originalCase = fixture.originalTest.caseBody;
  assert.equal(createHash('sha256').update(originalCase).digest('hex'), fixture.originalTest.caseSha256);
  assert.equal(fixture.originalTest.sha256, '78c649a98797760628020ea48f0e70fbcb3fe46efa7477697136b7891d6b2815');
  assert.match(originalCase, /investigateAsIntelligenceAgent.*getSessionPresence/s);
  assert.match(originalCase, /addShipDamage.*adjustShipPopulation/s);
  assert.match(originalCase, /external\\\/manual-only/);
  assert.match(fixture.originalTest.interpretation, /not factual product history/);
  assert.equal(fixture.historicalSnapshot.explicitSnapshotOnly, true);

  const historicalSnapshotPath = resolve(repositoryDirectory, fixture.historicalSnapshot.path);
  const snapshotBytes = readFileSync(historicalSnapshotPath);
  assert.equal(createHash('sha256').update(snapshotBytes).digest('hex'), fixture.historicalSnapshot.sha256);
  const snapshot = JSON.parse(snapshotBytes.toString('utf8'));
  const historicalWolf = snapshot.annotations.find(row => row.exportName === fixture.historicalSnapshot.exportName);
  assert.ok(historicalWolf, 'the exact retained history snapshot contains the old Wolf row');
  assert.equal(historicalWolf.classification, fixture.historicalSnapshot.classification);
  const historicalGap = snapshot.coverageAccounting.explicitPc11GuidanceGaps
    .find(row => row.exportName === fixture.historicalSnapshot.exportName);
  assert.ok(historicalGap, 'the exact retained history snapshot contains the old Wolf guidance gap');
  assert.equal(historicalGap.status, fixture.historicalSnapshot.guidanceGapStatus);
  assert.equal(fixture.historicalSnapshot.explicitSnapshotOnly, true, 'the old values are never current assertions');
});

test('the bounded refresh contains exactly the 22 source-traced callable rows', () => {
  const expected = [
    'resumeSession', 'refreshPresence',
    'shareKnownSystemDetails', 'readFleetGroupNavigation', 'sendScoutTaxiTransfer',
    'confirmFleetPartition', 'logoutGmAccess', 'listGmInstances', 'startSinglePlayerDemo',
    'beginOpenAirspacePhase', 'discardPrivateMissionCard',
    'readCandidateWorkspace', 'executeCandidateAction',
    'listPendingScoutRequests', 'listGmScoutResolutionLog', 'resolvePendingScoutRequest',
    'getPdfEscortWingLaunch', 'launchPdfEscortWing', 'getPdfFighterAcePermissionView',
    'grantPdfFighterAcePermission', 'passWolfFighterLaunchChoice', 'assignLoyalty',
  ];
  assert.equal(expected.length, 22);
  const supplementalNames = [...endings, ...workspaces, ...demo].map(row => row.exportName)
    .filter(name => expected.includes(name));
  const primaryNames = ['resumeSession', 'refreshPresence', 'listPendingScoutRequests',
    'listGmScoutResolutionLog', 'resolvePendingScoutRequest']
    .filter(name => annotationSource.includes(`exportName: '${name}'`));
  const actual = [...supplementalNames, ...primaryNames];
  assert.deepEqual(actual.sort(), [...expected].sort());
  assert.equal(actual.length, 22, 'each scoped callable has one and only one reviewed row');
});

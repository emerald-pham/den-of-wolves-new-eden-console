import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHORS as ENDING_ANCHORS, REVIEWS as endingSourceReviews } from './pc10-action-review-source-endings.mjs';
import { ANCHORS as WORKSPACE_ANCHORS, REVIEWS as workspaceSourceReviews } from './pc10-action-review-source-workspaces.mjs';
import { ANCHORS as DEMO_ANCHORS, REVIEWS as demoSourceReviews } from './pc10-action-review-source-demo.mjs';
import { ANCHORS as PRODUCT_DELTA_ANCHORS, REVIEWS as productDeltaReviews } from './pc10-action-review-source-product-deltas.mjs';

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const productSourceRoot = resolve(process.env.PC10_REVIEW_SOURCE_ROOT ?? repositoryDirectory);
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const ts = require('typescript');
const outputPath = resolve(repositoryDirectory, process.argv[2] ?? 'docs/PC10_ACTION_REVIEW_ANNOTATIONS.json');

const ANCHORS = [
  ['maliades.mediumCallable', 'functions/src/maliadesCallable.ts', 'resolveMaliadesMedium'],
  ['maliades.shortCallable', 'functions/src/maliadesCallable.ts', 'resolveMaliadesShort'],
  ['maliades.actionRunner', 'functions/src/maliadesCallable.ts', 'runMaliadesRangeAction'],
  ['maliades.engineerAuthority', 'functions/src/maliadesCallable.ts', 'requireDioneEngineer'],
  ['maliades.custodyAuthority', 'functions/src/maliadesCallable.ts', 'requireMaliadesControl'],
  ['maliades.clientMediumStub', 'src/lib/maliadesService.ts', 'resolveMaliadesMedium'],
  ['maliades.clientShortStub', 'src/lib/maliadesService.ts', 'resolveMaliadesShort'],
  ['maliades.activeUi', 'src/components/WolfEscortRangeActionPanel.tsx', 'WolfEscortRangeActionPanel'],
  ['maliades.activeChoiceService', 'src/lib/wolfEscortRangeService.ts', 'commitWolfEscortRangeActionChoice'],
  ['maliades.activeChoiceRead', 'src/lib/wolfEscortRangeService.ts', 'getWolfEscortRangeActionChoice'],
  ['maliades.choiceReaderServer', 'functions/src/index.ts', 'getWolfEscortRangeActionChoice'],
  ['maliades.choiceCommitServer', 'functions/src/index.ts', 'commitWolfEscortRangeActionChoice'],
  ['maliades.escortAuthorityServer', 'functions/src/index.ts', 'requireWolfEscortActor'],
  ['maliades.choiceReconcile', 'functions/src/index.ts', 'reconcileWolfAttackProgress'],
  ['maliades.collector', 'functions/src/wolfEscortRange.ts', 'collectWolfEscortRange'],
  ['maliades.rangeApply', 'functions/src/index.ts', 'applyLockedWolfRangeChoiceBundles'],
  ['maliades.rangeRollResolver', 'functions/src/wolfCombatMath.ts', 'resolveLockedWolfRange'],
  ['maliades.fleetConsoleMount', 'src/components/FleetConsoleWorkspace.tsx', 'FleetConsoleWorkspace'],
  ['maliades.currentGuidance', 'src/components/DioneMaliadesRangeActions.tsx', 'DioneMaliadesRangeActionPanelView'],

  ['preference.handler', 'functions/src/index.ts', 'setShipPreference'],
  ['preference.activePlayer', 'functions/src/index.ts', 'isActivePlayer'],
  ['preference.window', 'functions/src/index.ts', 'requireCastingWindow'],
  ['preference.request', 'functions/src/requestGuards.ts', 'requireCastingPreferenceRequest'],

  ['supply.handler', 'functions/src/index.ts', 'submitWolfSupplySabotage'],
  ['supply.authorization', 'functions/src/wolfActionAuthorization.ts', 'wolfActionAuthorization'],
  ['supply.calculation', 'functions/src/wolfSupplySabotage.ts', 'resolveWolfSupplySabotage'],
  ['supply.request', 'functions/src/requestGuards.ts', 'requireWolfSupplySabotageRequest'],
  ['supply.alertAcknowledgement', 'functions/src/index.ts', 'acknowledgeWolfHackingAlert'],
  ['supply.receiptUi', 'src/routes/GmConsole.tsx', 'GmConsole'],
  ['supply.otherWolfControls', 'src/components/PrivateLoyaltyPanel.tsx', 'PrivateLoyaltyPanel'],
  ['supply.appMount', 'src/App.tsx', 'AppRoutes'],
  ['supply.clientAdapter', 'src/lib/wolfActionService.ts', 'submitWolfSupplySabotage'],

  ['elevation.handler', 'functions/src/index.ts', 'elevateToGm'],
  ['elevation.request', 'functions/src/requestGuards.ts', 'requireElevationRequest'],
  ['elevation.liveGm', 'functions/src/index.ts', 'isLiveGmInstance'],
  ['elevation.activePlayer', 'functions/src/index.ts', 'isActivePlayer'],
  ['elevation.coreSeat', 'functions/src/index.ts', 'hasCoreSeat'],
  ['elevation.coreAssignment', 'functions/src/index.ts', 'hasCoreAssignment'],
  ['elevation.pressState', 'functions/src/index.ts', 'hasPressState'],
  ['elevation.claimInstance', 'functions/src/index.ts', 'claimGmInstance'],

  ['dice.handler', 'functions/src/index.ts', 'rollDice'],
  ['dice.request', 'functions/src/requestGuards.ts', 'requireDiceRequest'],
  ['dice.activePlayer', 'functions/src/index.ts', 'isActivePlayer'],
  ['dice.activePhase', 'functions/src/index.ts', 'requireActiveGameplayPhase'],
  ['dice.ratePolicy', 'functions/src/callableRateLimit.ts', 'CALLABLE_RATE_LIMIT_POLICIES'],

  ['auth.create', 'functions/src/index.ts', 'createSession'],
  ['auth.createRequest', 'functions/src/requestGuards.ts', 'requireSessionCreationRequest'],
  ['auth.createClient', 'src/lib/sessionService.ts', 'createSession'],
  ['auth.landing', 'src/routes/Landing.tsx', 'Landing'],
  ['auth.join', 'functions/src/index.ts', 'joinSession'],
  ['auth.joinClient', 'src/lib/sessionService.ts', 'joinSession'],
  ['auth.resume', 'functions/src/index.ts', 'resumeSession'],
  ['auth.resumeClient', 'src/lib/sessionService.ts', 'resumeSession'],
  ['auth.closedHistoryClient', 'src/lib/sessionService.ts', 'readClosedSessionHistory'],
  ['auth.appRecovery', 'src/App.tsx', 'App'],
  ['auth.memberReader', 'functions/src/memberSessionCallable.ts', 'createCurrentMemberSessionReader'],
  ['auth.memberExport', 'functions/src/index.ts', 'getCurrentMemberSession'],
  ['auth.memberClient', 'src/lib/firestore.ts', 'subscribeSessionState'],
  ['auth.presence', 'functions/src/index.ts', 'refreshPresence'],
  ['auth.presenceClient', 'src/lib/sessionService.ts', 'refreshPresence'],

  ['gmAccess.login', 'functions/src/index.ts', 'loginGmAccess'],
  ['gmAccess.passwordPolicy', 'functions/src/gmAccess.ts', 'isGmAccessPassword'],
  ['gmAccess.leasePolicy', 'functions/src/gmAccess.ts', 'isGmAccessActive'],
  ['gmAccess.loginClient', 'src/lib/sessionService.ts', 'loginGmAccess'],
  ['gmAccess.settingsUi', 'src/components/AppHeader.tsx', 'AppHeader'],
  ['gmAccess.claimInstance', 'functions/src/index.ts', 'claimGmInstance'],

  ['setup.handler', 'functions/src/index.ts', 'confirmSetup'],
  ['setup.request', 'functions/src/requestGuards.ts', 'requireSetupConfirmationRequest'],
  ['setup.client', 'src/lib/sessionService.ts', 'confirmSetup'],
  ['setup.ui', 'src/routes/GmConsole.tsx', 'GmConsole'],
  ['start.handler', 'functions/src/index.ts', 'startGame'],
  ['start.request', 'functions/src/requestGuards.ts', 'requireGameStartRequest'],
  ['start.client', 'src/lib/sessionService.ts', 'startGame'],
  ['start.ui', 'src/routes/GmConsole.tsx', 'GmConsole'],
  ['demo.handler', 'functions/src/index.ts', 'prepareFullGameDemo'],
  ['demo.client', 'src/lib/sessionService.ts', 'prepareFullGameDemo'],
  ['demo.ui', 'src/routes/GmConsole.tsx', 'GmConsole'],

  ['debrief.commands', 'functions/src/sessionDebriefCallable.ts', 'createSessionDebriefCommands'],
  ['debrief.beginExport', 'functions/src/index.ts', 'beginSessionDebrief'],
  ['debrief.closeExport', 'functions/src/index.ts', 'closeSession'],
  ['debrief.readExport', 'functions/src/index.ts', 'getSessionDebrief'],
  ['debrief.clientBegin', 'src/lib/sessionService.ts', 'beginSessionDebrief'],
  ['debrief.clientClose', 'src/lib/sessionService.ts', 'closeSession'],
  ['debrief.clientRead', 'src/lib/sessionService.ts', 'getSessionDebrief'],
  ['debrief.ui', 'src/components/EndgameDialog.tsx', 'EndgameDialog'],

  ['group.request', 'functions/src/index.ts', 'groupNoteRequest'],
  ['group.authority', 'functions/src/index.ts', 'groupNoteAuthority'],
  ['group.read', 'functions/src/index.ts', 'readFleetGroupMessages'],
  ['group.send', 'functions/src/index.ts', 'sendFleetGroupMessage'],
  ['group.clientActions', 'src/lib/fleetGroupService.ts', 'createFleetGroupActions'],
  ['group.currentActions', 'src/lib/fleetGroupService.ts', 'createCurrentFleetGroupActions'],
  ['group.workspace', 'src/components/FleetGroupWorkspace.tsx', 'FleetGroupWorkspace'],

  ['scout.resolveFactory', 'functions/src/scoutResultCallable.ts', 'createResolvePendingScoutRequest'],
  ['scout.resolveFlow', 'functions/src/scoutResultCallable.ts', 'resolveCommittedScoutRequest'],
  ['scout.privateResultReader', 'functions/src/scoutResultCallable.ts', 'readPrivateScoutResult'],
  ['scout.pendingQueueReader', 'functions/src/scoutResultCallable.ts', 'listPendingScoutRequests'],
  ['scout.gmLogReader', 'functions/src/scoutResultCallable.ts', 'listGmScoutResolutionLog'],
  ['scout.ownReportReader', 'functions/src/scoutResultCallable.ts', 'listMyScoutReports'],
  ['scout.discoveryNoteReader', 'functions/src/scoutResultCallable.ts', 'readMyScoutDiscoveryNote'],
  ['scout.resultProjection', 'functions/src/scoutResultProjection.ts', 'projectPrivateScoutResult'],
  ['scout.resolutionPlan', 'functions/src/scoutResolutionPlan.ts', 'buildScoutResolutionPlan'],
  ['scout.commitMapKnowledge', 'functions/src/index.ts', 'commitScoutMapKnowledge'],
  ['scout.automaticResolver', 'functions/src/index.ts', 'automaticallyResolveScoutRequest'],
  ['scout.serviceInvoke', 'src/lib/scoutResultService.ts', 'invoke'],
  ['scout.servicePrivateResult', 'src/lib/scoutResultService.ts', 'readPrivateScoutResult'],
  ['scout.servicePendingQueue', 'src/lib/scoutResultService.ts', 'listPendingScoutRequests'],
  ['scout.serviceGmLog', 'src/lib/scoutResultService.ts', 'listGmScoutResolutionLog'],
  ['scout.serviceOwnReports', 'src/lib/scoutResultService.ts', 'listMyScoutReports'],
  ['scout.serviceDiscoveryNote', 'src/lib/scoutResultService.ts', 'readMyScoutDiscoveryNote'],
  ['scout.serviceResolve', 'src/lib/scoutResultService.ts', 'resolvePendingScoutRequest'],
  ['scout.playerReportUi', 'src/components/ScoutReportController.tsx', 'ScoutReportController'],
  ['scout.gmRevealUi', 'src/components/GmScoutRevealController.tsx', 'GmScoutRevealController'],
  ['scout.requestUi', 'src/components/ScoutRequestControls.tsx', 'ScoutRequestControls'],
  ['scout.gmConsoleUi', 'src/routes/GmConsole.tsx', 'GmConsole'],
];

const reviewed = [
  {
    exportName: 'resolveMaliadesMedium', classification: 'legacy/deprecated-internal-compatibility',
    productPath: { status: 'legacy-endpoint-not-used-by-current-control', currentSurface: 'Maliades range panel', currentCallable: 'commitWolfEscortRangeActionChoice', servedAlternative: { callable: 'commitWolfEscortRangeActionChoice' }, sourceAnchorIds: ['maliades.activeUi', 'maliades.activeChoiceService', 'maliades.fleetConsoleMount'] },
    actor: { family: 'active connected Dione Engineer holding the live Maliades shuttle control', identities: ['dione-engineer'], sourceAnchorIds: ['maliades.engineerAuthority', 'maliades.custodyAuthority', 'maliades.activeChoiceService'] },
    requirements: { summary: 'The old endpoint validates the Dione Engineer core role and current Maliades control holder before returning its unavailable-service failure. The current panel reads and commits a sourceId=maliades range choice through the shared escort endpoints.', sourceAnchorIds: ['maliades.actionRunner', 'maliades.engineerAuthority', 'maliades.custodyAuthority', 'maliades.activeChoiceRead', 'maliades.choiceReaderServer', 'maliades.choiceCommitServer', 'maliades.escortAuthorityServer'] },
    costs: { summary: 'The old callable spends no resources because it throws before mutation. The current UI choice commit also stores only the selection and uses the shared server-owned range roll lock; combat damage/loss is resolved later by that shared engine.', sourceAnchorIds: ['maliades.actionRunner', 'maliades.choiceCommitServer', 'maliades.collector', 'maliades.rangeRollResolver'] },
    consequences: { summary: 'A valid request to this endpoint still fails with failed-precondition/unavailable-service. The current UI stores the Dione range choice as pending resolution; reconciliation waits for other required source choices, then applies the locked combat result and member projection.', sourceAnchorIds: ['maliades.actionRunner', 'maliades.choiceCommitServer', 'maliades.choiceReconcile', 'maliades.rangeApply', 'maliades.rangeRollResolver'] },
    blockers: { summary: 'Missing active Dione Engineer or matching Maliades custody fails authorization first; even a valid actor then hits the unconditional unavailable-service branch.', sourceAnchorIds: ['maliades.actionRunner', 'maliades.engineerAuthority', 'maliades.custodyAuthority'] },
    nextActor: { summary: 'No next actor is produced by the old endpoint. In the current UI, the Dione Engineer submits a range choice through the shared endpoint; that endpoint records pending resolution.', sourceAnchorIds: ['maliades.choiceCommitServer', 'maliades.choiceReconcile', 'maliades.activeUi'] },
    clientCallTrace: { status: 'service-stub-only', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'The same-named client helpers validate local authority then throw before making a callable request; FleetConsoleWorkspace mounts WolfEscortRangeActionPanel, which instead calls the shared endpoint. The client source hash and anchor hashes bind this trace.', sourceAnchorIds: ['maliades.clientMediumStub', 'maliades.clientShortStub', 'maliades.activeUi', 'maliades.activeChoiceService', 'maliades.fleetConsoleMount'] },
    guidance: { status: 'current-guidance-on-served-alternative', summary: 'The current Dione range panel contains contextual Medium/Short choices and target guidance; it is reached through the fleet console. No guidance directs users to the disabled old endpoint.', sourceAnchorIds: ['maliades.currentGuidance', 'maliades.activeUi', 'maliades.fleetConsoleMount'] },
  },
  {
    exportName: 'resolveMaliadesShort', classification: 'legacy/deprecated-internal-compatibility',
    productPath: { status: 'legacy-endpoint-not-used-by-current-control', currentSurface: 'Maliades range panel', currentCallable: 'commitWolfEscortRangeActionChoice', servedAlternative: { callable: 'commitWolfEscortRangeActionChoice' }, sourceAnchorIds: ['maliades.activeUi', 'maliades.activeChoiceService', 'maliades.fleetConsoleMount'] },
    actor: { family: 'active connected Dione Engineer holding the live Maliades shuttle control', identities: ['dione-engineer'], sourceAnchorIds: ['maliades.engineerAuthority', 'maliades.custodyAuthority', 'maliades.activeChoiceService'] },
    requirements: { summary: 'The old endpoint validates the Dione Engineer core role and current Maliades control holder before returning its unavailable-service failure. The current panel reads and commits a sourceId=maliades range choice through the shared escort endpoints.', sourceAnchorIds: ['maliades.actionRunner', 'maliades.engineerAuthority', 'maliades.custodyAuthority', 'maliades.activeChoiceRead', 'maliades.choiceReaderServer', 'maliades.choiceCommitServer', 'maliades.escortAuthorityServer'] },
    costs: { summary: 'The old callable spends no resources because it throws before mutation. The current UI choice commit also stores only the selection and uses the shared server-owned range roll lock; combat damage/loss is resolved later by that shared engine.', sourceAnchorIds: ['maliades.actionRunner', 'maliades.choiceCommitServer', 'maliades.collector', 'maliades.rangeRollResolver'] },
    consequences: { summary: 'A valid request to this endpoint still fails with failed-precondition/unavailable-service. The current UI stores the Dione range choice as pending resolution; reconciliation waits for other required source choices, then applies the locked combat result and member projection.', sourceAnchorIds: ['maliades.actionRunner', 'maliades.choiceCommitServer', 'maliades.choiceReconcile', 'maliades.rangeApply', 'maliades.rangeRollResolver'] },
    blockers: { summary: 'Missing active Dione Engineer or matching Maliades custody fails authorization first; even a valid actor then hits the unconditional unavailable-service branch.', sourceAnchorIds: ['maliades.actionRunner', 'maliades.engineerAuthority', 'maliades.custodyAuthority'] },
    nextActor: { summary: 'No next actor is produced by the old endpoint. In the current UI, the Dione Engineer submits a range choice through the shared endpoint; that endpoint records pending resolution.', sourceAnchorIds: ['maliades.choiceCommitServer', 'maliades.choiceReconcile', 'maliades.activeUi'] },
    clientCallTrace: { status: 'service-stub-only', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'The same-named client helpers validate local authority then throw before making a callable request; FleetConsoleWorkspace mounts WolfEscortRangeActionPanel, which instead calls the shared endpoint. The client source hash and anchor hashes bind this trace.', sourceAnchorIds: ['maliades.clientMediumStub', 'maliades.clientShortStub', 'maliades.activeUi', 'maliades.activeChoiceService', 'maliades.fleetConsoleMount'] },
    guidance: { status: 'current-guidance-on-served-alternative', summary: 'The current Dione range panel contains contextual Medium/Short choices and target guidance; it is reached through the fleet console. No guidance directs users to the disabled old endpoint.', sourceAnchorIds: ['maliades.currentGuidance', 'maliades.activeUi', 'maliades.fleetConsoleMount'] },
  },
  {
    exportName: 'setShipPreference', classification: 'external/manual-only',
    productPath: { status: 'no-current-client-control-found', sourceAnchorIds: ['preference.handler', 'preference.request'] },
    actor: { family: 'any authenticated active player', identities: ['active player; role-specific privilege not required'], sourceAnchorIds: ['preference.handler', 'preference.activePlayer'] },
    requirements: { summary: 'Requires a valid session/request/ship ID, a connected active player, an unlocked lobby/casting window, and a vessel in the canonical active roster. Request receipts bind retries and collisions.', sourceAnchorIds: ['preference.handler', 'preference.request', 'preference.activePlayer', 'preference.window'] },
    costs: { summary: 'No in-game resource or action slot is spent; the handler writes the caller’s nonbinding shipPreferenceId and increments setupRevision.', sourceAnchorIds: ['preference.handler'] },
    consequences: { summary: 'The session stays in casting and the preference is stored as advisory state; it does not assign the vessel or change role readiness.', sourceAnchorIds: ['preference.handler'] },
    blockers: { summary: 'No session, inactive player, closed/locked setup, or vessel absent from the active roster rejects the request; request-ID replay collisions also fail.', sourceAnchorIds: ['preference.handler', 'preference.activePlayer', 'preference.window', 'preference.request'] },
    nextActor: { summary: 'The handler defines no turn order or next player. A facilitator may later confirm the setup through the separate setup command.', sourceAnchorIds: ['preference.handler', 'setup.handler'] },
    clientCallTrace: { status: 'no-current-client-call-found', sourceTreeSha256: null, identifierReferenceCount: 0, interpretation: 'No matching identifier or callable literal occurs in the application source tree; the callable remains exported. The current setup UI’s client path is separately anchored, and the complete client-source hash scopes the absence scan.', sourceAnchorIds: ['preference.handler', 'setup.client', 'setup.ui'] },
    guidance: { status: 'not-present-in-current-ui', summary: 'No current preference control or adjacent in-console guidance was located. This is an API-only path in the reviewed client source, so no current action hint is credited or marked as a blanket PC11 deferral.', sourceAnchorIds: ['preference.handler', 'setup.ui'] },
  },
  {
    exportName: 'submitWolfSupplySabotage', classification: 'served-ui-path',
    productPath: {
      status: 'served-ui-path',
      currentSurface: 'PrivateLoyaltyPanel Wolf supply action',
      currentMount: 'src/App.tsx → ScreenFade → PrivateLoyaltyPanel',
      invocation: 'PrivateLoyaltyPanel → wolfActionService.submitWolfSupplySabotage → submitWolfSupplySabotage callable',
      currentCallable: 'submitWolfSupplySabotage',
      sourceAnchorIds: ['supply.appMount', 'supply.otherWolfControls', 'supply.clientAdapter', 'supply.handler'],
    },
    actor: { family: 'active connected player holding Wolf Agent or Wolf Cult loyalty in the matching setup-assigned cover role', identities: ['wolf-agent', 'wolf-cult'], sourceAnchorIds: ['supply.handler', 'supply.authorization', 'supply.otherWolfControls'] },
    requirements: { summary: 'Requires an active gameplay cycle and an authenticated, connected active player; actor-only Wolf Agent or Wolf Cult loyalty; an unreplaced, non-escaped player with the setup-assigned cover role; one unused Wolf action for that cycle; a positive selected resource balance on an active shuttle owned by that cover; and a current facilitator loyalty census. A Press cover requires the Press station enabled and either no holder or this actor as holder.', sourceAnchorIds: ['supply.handler', 'supply.authorization', 'supply.calculation', 'supply.request', 'supply.otherWolfControls', 'supply.clientAdapter'] },
    costs: { summary: 'Destroys floor(current selected cargo / 2), half rounded down, from the chosen cover-owned shuttle; cargo must be positive, though cargo of one loses zero units. The action adds exactly 2 suspicion and consumes the cycle’s single Wolf action slot after validation succeeds.', sourceAnchorIds: ['supply.handler', 'supply.authorization', 'supply.calculation'] },
    consequences: { summary: 'The server reduces selected shuttle cargo, updates the actor’s private loyalty and the facilitator census, records a private clue, action receipt, and audit, and creates a pending private hacking alert. The actor receives a receipt with the cargo remaining and new suspicion; clue details stay in the private facilitator path.', sourceAnchorIds: ['supply.handler', 'supply.calculation', 'supply.receiptUi'] },
    blockers: { summary: 'A stale cycle; unauthenticated or inactive actor; replacement status or escape state; non-Wolf loyalty or mismatched assigned cover; disabled or differently held Press station; inactive/wrong-cover shuttle; empty cargo; already-used same-cycle Wolf action; malformed roster, loyalty, census, or alert history; or a conflicting request receipt rejects the fresh action.', sourceAnchorIds: ['supply.handler', 'supply.authorization', 'supply.calculation', 'supply.request', 'supply.otherWolfControls'] },
    nextActor: { summary: 'The facilitator receives the pending private hacking alert and must acknowledge that exact alert; only after acknowledgement does the server publish an actor-free player notice.', sourceAnchorIds: ['supply.handler', 'supply.alertAcknowledgement'] },
    clientCallTrace: { status: 'current-ui-service-call', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'App mounts PrivateLoyaltyPanel inside ScreenFade. Its active-cycle Wolf supply control calls the wolfActionService adapter, which invokes the same-name callable; the current component, adapter, and mount references are hash-bound below. Static source and import evidence do not prove that a control is rendered, enabled, or usable in a running session.', sourceAnchorIds: ['supply.appMount', 'supply.otherWolfControls', 'supply.clientAdapter'] },
    guidance: { status: 'current-member-action-guidance', summary: 'The mounted private loyalty panel explains half-cargo loss rounded down, the two-suspicion increase, and the one-action-per-cycle limit. It labels the shuttle cargo target selector and explains when no positive cargo is available.', sourceAnchorIds: ['supply.appMount', 'supply.otherWolfControls'] },
  },
  {
    exportName: 'elevateToGm', classification: 'external/manual-only',
    productPath: { status: 'no-current-client-control-found', sourceAnchorIds: ['elevation.handler', 'elevation.request'] },
    actor: { family: 'session owner or active GM with a live GM instance; target is another active connected member', identities: ['owner', 'gm'], sourceAnchorIds: ['elevation.handler', 'elevation.liveGm', 'elevation.activePlayer'] },
    requirements: { summary: 'Requires a valid target UID and caller authority; non-owner GMs must supply their owned live instance. The target must be active and have no core seat, core assignment, Press state, or current Press-holder claim.', sourceAnchorIds: ['elevation.handler', 'elevation.request', 'elevation.liveGm', 'elevation.activePlayer', 'elevation.coreSeat', 'elevation.coreAssignment', 'elevation.pressState'] },
    costs: { summary: 'No in-game resource or cycle slot is spent.', sourceAnchorIds: ['elevation.handler'] },
    consequences: { summary: 'The target player record’s role changes to gm. This handler does not mint a GM browser instance or session lease.', sourceAnchorIds: ['elevation.handler', 'elevation.claimInstance'] },
    blockers: { summary: 'Unauthenticated/inactive callers, non-owner non-GMs, missing/expired live instances, disconnected targets, and targets retaining core or Press authority are rejected.', sourceAnchorIds: ['elevation.handler', 'elevation.liveGm', 'elevation.activePlayer', 'elevation.coreSeat', 'elevation.coreAssignment', 'elevation.pressState'] },
    nextActor: { summary: 'The elevated target must complete the separate normal GM-instance claim before using lease-bound facilitator actions.', sourceAnchorIds: ['elevation.handler', 'elevation.claimInstance'] },
    clientCallTrace: { status: 'no-current-client-call-found', sourceTreeSha256: null, identifierReferenceCount: 0, interpretation: 'The current application source has no exact client caller for this callable; the authenticated endpoint remains exposed for external/manual use. The client-source hash binds the scan.', sourceAnchorIds: ['elevation.handler'] },
    guidance: { status: 'not-present-in-current-ui', summary: 'No current in-console elevation control or guidance was located; current GmConsole surfaces the already-authorized facilitator mode.', sourceAnchorIds: ['elevation.handler', 'elevation.claimInstance'] },
  },
  {
    exportName: 'rollDice', classification: 'external/manual-only',
    productPath: { status: 'no-current-client-control-found', sourceAnchorIds: ['dice.handler', 'dice.request'] },
    actor: { family: 'any authenticated active player in active gameplay', identities: ['active player; role-specific privilege not required'], sourceAnchorIds: ['dice.handler', 'dice.activePlayer', 'dice.activePhase'] },
    requirements: { summary: 'Requires active player membership, an active gameplay phase, sides from 2 through 1,000, count from 1 through 50, and remaining per-UID/session rate budget.', sourceAnchorIds: ['dice.handler', 'dice.request', 'dice.activePlayer', 'dice.activePhase', 'dice.ratePolicy'] },
    costs: { summary: 'No game resource or action slot is spent; a 30-per-minute callable limit applies.', sourceAnchorIds: ['dice.handler', 'dice.ratePolicy'] },
    consequences: { summary: 'The server generates the requested values, writes a privacy-safe roll event with the caller and total, and returns the sampled values.', sourceAnchorIds: ['dice.handler'] },
    blockers: { summary: 'Invalid arguments, missing/inactive member, non-active gameplay phase, or exhausted rate budget rejects the request.', sourceAnchorIds: ['dice.handler', 'dice.request', 'dice.activePlayer', 'dice.activePhase', 'dice.ratePolicy'] },
    nextActor: { summary: 'The result returns to the requesting caller; this general utility does not schedule another player or consume a role action.', sourceAnchorIds: ['dice.handler'] },
    clientCallTrace: { status: 'no-current-client-call-found', sourceTreeSha256: null, identifierReferenceCount: 0, interpretation: 'No current application client invokes the generic dice callable. Action-specific gameplay resolvers use their own server calculations. The client-source hash binds the absence scan.', sourceAnchorIds: ['dice.handler'] },
    guidance: { status: 'not-present-in-current-ui', summary: 'No current general-purpose dice control or contextual guidance was located; the callable is not credited as an in-console role action.', sourceAnchorIds: ['dice.handler'] },
  },
  {
    exportName: 'createSession', classification: 'served-ui-path',
    productPath: { status: 'served-ui-path', surface: 'Landing session creation', invocation: 'sessionService.createSession → createSession callable', sourceAnchorIds: ['auth.landing', 'auth.createClient', 'auth.create'] },
    actor: { family: 'authenticated account creating a session', identities: ['authenticated UID; server initially records player role and ownerUid'], sourceAnchorIds: ['auth.create', 'auth.landing'] },
    requirements: { summary: 'Requires authentication, a valid creation configuration, a request ID, and no conflicting active session membership; the creation receipt makes an identical retry return the original session result.', sourceAnchorIds: ['auth.create', 'auth.createRequest'] },
    costs: { summary: 'No in-game resources are spent.', sourceAnchorIds: ['auth.create'] },
    consequences: { summary: 'Creates a Cycle 0 lobby with a join code, canonical setup and initial player/membership state; the owner UID is retained for later facilitator authority.', sourceAnchorIds: ['auth.create'] },
    blockers: { summary: 'Invalid configuration/request, conflicting membership, foreign/colliding request IDs, or exhausted join-code attempts prevents creation.', sourceAnchorIds: ['auth.create', 'auth.createRequest'] },
    nextActor: { summary: 'No participant order is imposed. The creator receives the join code and can continue the normal GM setup/start flow or admit players.', sourceAnchorIds: ['auth.createClient', 'auth.landing', 'gmAccess.loginClient'] },
    clientCallTrace: { status: 'current-ui-service-call', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'Landing calls the session service; the service invokes the createSession callable after ensuring a signed-in identity.', sourceAnchorIds: ['auth.landing', 'auth.createClient'] },
    guidance: { status: 'current-entry-guidance', summary: 'Landing provides the current create/join entry controls and their adjacent session setup context.', sourceAnchorIds: ['auth.landing'] },
  },
  {
    exportName: 'joinSession', classification: 'served-ui-path',
    productPath: { status: 'served-ui-path', surface: 'Landing join-code admission', invocation: 'sessionService.joinSession → joinSession callable', sourceAnchorIds: ['auth.landing', 'auth.joinClient', 'auth.join'] },
    actor: { family: 'authenticated person entering a session code', identities: ['authenticated UID; becomes an ordinary active player'], sourceAnchorIds: ['auth.join', 'auth.joinClient'] },
    requirements: { summary: 'Requires a valid join code and no conflicting active membership. The server rejects closed or retiring sessions and kicked identities, then transactionally reconciles membership, connection generation, fleet group and presence.', sourceAnchorIds: ['auth.join'] },
    costs: { summary: 'No in-game resources are spent.', sourceAnchorIds: ['auth.join'] },
    consequences: { summary: 'Registers or reconnects the member and returns the current session projection to the joining browser.', sourceAnchorIds: ['auth.join', 'auth.joinClient'] },
    blockers: { summary: 'Malformed or unknown code, closed/deleting session, kicked member, conflicting active membership, or inconsistent fleet/seat authority rejects admission.', sourceAnchorIds: ['auth.join'] },
    nextActor: { summary: 'The admitted member receives the current session state; no fixed player turn order is created by admission.', sourceAnchorIds: ['auth.join', 'auth.joinClient'] },
    clientCallTrace: { status: 'current-ui-service-call', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'Landing passes the entered code to the session service, which invokes the joinSession callable.', sourceAnchorIds: ['auth.landing', 'auth.joinClient'] },
    guidance: { status: 'current-entry-guidance', summary: 'Landing is the current join-code entry and admission surface.', sourceAnchorIds: ['auth.landing'] },
  },
  {
    exportName: 'resumeSession', classification: 'served-ui-path',
    productPath: { status: 'served-ui-path', surface: 'session recovery', invocation: 'App/sessionService recovery → resumeSession; closed history uses a separate entitled member refresh', sourceAnchorIds: ['auth.resumeClient', 'auth.resume', 'auth.appRecovery', 'auth.closedHistoryClient'] },
    actor: { family: 'authenticated identity with an existing session player record', identities: ['same UID bound to the prior member record'], sourceAnchorIds: ['auth.resume', 'auth.resumeClient'] },
    requirements: { summary: 'Requires a session ID and the prior authenticated member identity. Active recovery follows the ordinary membership/presence path. For the separate closed-session history debrief refresh, App waits for a closed, live, server-fresh snapshot and unchanged authenticated UID/session/group/connection-generation authority.', sourceAnchorIds: ['auth.resume', 'auth.resumeClient', 'auth.closedHistoryClient', 'auth.appRecovery'] },
    costs: { summary: 'No in-game resources or gameplay action slots are spent.', sourceAnchorIds: ['auth.resume', 'auth.closedHistoryClient'] },
    consequences: { summary: 'Active resume restores the current authorized member view. The server’s closed-phase resume branch returns the current member-safe projection without restoring membership, seat, or presence. App then makes one explicit readClosedSessionHistory fetch per session/UID/connection generation, ignores stale actor/group replies, and holds the safe debrief only in ephemeral state.', sourceAnchorIds: ['auth.resume', 'auth.closedHistoryClient', 'auth.appRecovery'] },
    blockers: { summary: 'Missing/unauthorized prior member identity, kicked state, conflicting membership, malformed session authority, stale identity/group/connection-generation reply, or a non-live/non-server-fresh closed snapshot rejects the history read.', sourceAnchorIds: ['auth.resume', 'auth.closedHistoryClient', 'auth.appRecovery'] },
    nextActor: { summary: 'The recovered member continues from the server-entitled current projection; no game actor is advanced by resume.', sourceAnchorIds: ['auth.resumeClient', 'auth.closedHistoryClient'] },
    clientCallTrace: { status: 'current-lifecycle-service-call', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'App starts reconnect through sessionService.resumeSession; the server has a distinct read-only closed-phase branch. After the closed server snapshot is live/fresh, App makes a bounded separate getCurrentMemberSession read; duplicate pending/confirmed requests are fenced by session, UID and connection generation.', sourceAnchorIds: ['auth.appRecovery', 'auth.resumeClient', 'auth.closedHistoryClient'] },
    guidance: { status: 'recovery-state-guidance', summary: 'The application resumes active session state in the background. For closed history it performs a guarded one-shot refresh and keeps the safe debrief ephemeral; this is a recovery path rather than a game action control.', sourceAnchorIds: ['auth.appRecovery', 'auth.closedHistoryClient'] },
  },
  {
    exportName: 'getCurrentMemberSession', classification: 'served-ui-path',
    productPath: { status: 'served-ui-path', surface: 'current member projection and closed-history refresh', invocation: 'firestore/sessionService → getCurrentMemberSession callable', sourceAnchorIds: ['auth.memberExport', 'auth.memberReader', 'auth.memberClient', 'auth.closedHistoryClient'] },
    actor: { family: 'authenticated current or retained entitled member', identities: ['current member; closed-history path revalidates the same UID and group'], sourceAnchorIds: ['auth.memberReader', 'auth.memberExport', 'auth.closedHistoryClient'] },
    requirements: { summary: 'The server derives a safe session projection from the authenticated member record and current group. Closed history requires a prior entitled member, while detailed facilitator debrief reads use the separate live-instance endpoint.', sourceAnchorIds: ['auth.memberReader', 'auth.memberExport', 'auth.closedHistoryClient', 'debrief.readExport'] },
    costs: { summary: 'Read-only; it does not create membership, seat, presence, or game-action writes.', sourceAnchorIds: ['auth.memberReader', 'auth.memberClient', 'auth.closedHistoryClient'] },
    consequences: { summary: 'Returns only the actor-entitled current member projection; the dedicated cold closed-history flow can hydrate the safe debrief summary after confirming actor/session/group identity.', sourceAnchorIds: ['auth.memberReader', 'auth.memberClient', 'auth.closedHistoryClient'] },
    blockers: { summary: 'Unknown, kicked, mismatched, or no-longer-entitled member/group identity is rejected; generic reads do not grant historical GM private detail.', sourceAnchorIds: ['auth.memberReader', 'auth.closedHistoryClient', 'debrief.readExport'] },
    nextActor: { summary: 'The same client continues rendering its authorized projection; the read does not schedule a gameplay actor.', sourceAnchorIds: ['auth.memberClient', 'auth.closedHistoryClient'] },
    clientCallTrace: { status: 'current-member-and-history-read', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'The ordinary client projection and explicit closed-history refresh use this callable; no raw session collection read replaces the server projection.', sourceAnchorIds: ['auth.memberExport', 'auth.memberClient', 'auth.closedHistoryClient'] },
    guidance: { status: 'background-entitlement-read', summary: 'No separate action hint is needed; this read silently refreshes the current entitled member view.', sourceAnchorIds: ['auth.memberReader', 'auth.memberClient'] },
  },
  {
    exportName: 'refreshPresence', classification: 'served-ui-path',
    productPath: { status: 'served-ui-path', surface: 'App presence heartbeat', invocation: 'App timer → sessionService.refreshPresence → callable', sourceAnchorIds: ['auth.presence', 'auth.presenceClient', 'auth.appRecovery'] },
    actor: { family: 'authenticated active player/GM device already attached to the session', identities: ['current UID and member record; GM instance checked when supplied'], sourceAnchorIds: ['auth.presence', 'auth.presenceClient'] },
    requirements: { summary: 'Requires an attached current session member; the server rechecks current identity and role/seat authority and binds GM presence to its live instance when applicable. App schedules the heartbeat only while the current session is non-closed and live.', sourceAnchorIds: ['auth.presence', 'auth.presenceClient', 'auth.appRecovery'] },
    costs: { summary: 'No game resource, cycle, or role-action cost; it is a periodic presence update.', sourceAnchorIds: ['auth.presence', 'auth.presenceClient'] },
    consequences: { summary: 'Refreshes presence/last-seen state for the existing member and current GM instance when applicable. The closed-history flow does not call this heartbeat; it uses a separate read-only current-member debrief fetch.', sourceAnchorIds: ['auth.presence', 'auth.appRecovery', 'auth.closedHistoryClient'] },
    blockers: { summary: 'Lost member identity, kicked/stale actor, mismatched role/seat, or invalid GM instance prevents an unauthorized refresh.', sourceAnchorIds: ['auth.presence'] },
    nextActor: { summary: 'No game actor is advanced; App schedules the next heartbeat while the session remains non-closed and live, and stops heartbeat renewal after closure.', sourceAnchorIds: ['auth.appRecovery', 'auth.presenceClient'] },
    clientCallTrace: { status: 'background-lifecycle-caller', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'App starts and clears the heartbeat with session lifecycle state; this is not a player action control.', sourceAnchorIds: ['auth.appRecovery', 'auth.presenceClient'] },
    guidance: { status: 'not-a-player-action', summary: 'No contextual action hint is shown for the background presence heartbeat. Closed sessions use the separate safe-history read and skip heartbeat guidance/renewal.', sourceAnchorIds: ['auth.appRecovery', 'auth.presence', 'auth.closedHistoryClient'] },
  },
  {
    exportName: 'confirmSetup', classification: 'served-ui-path',
    productPath: { status: 'served-ui-path', surface: 'GM setup controls', invocation: 'GmConsole → sessionService.confirmSetup → callable', sourceAnchorIds: ['setup.handler', 'setup.client', 'setup.ui'] },
    actor: { family: 'authenticated GM with current live GM instance', identities: ['gm'], sourceAnchorIds: ['setup.handler', 'setup.request'] },
    requirements: { summary: 'Requires a live facilitator instance, exact expectedSetupRevision, a valid complete setup tuple and allowed role roster; a bound request can replay its original result.', sourceAnchorIds: ['setup.handler', 'setup.request'] },
    costs: { summary: 'No in-game resources are spent.', sourceAnchorIds: ['setup.handler'] },
    consequences: { summary: 'Commits canonical setup choices and advances the setup revision; setup confirmation does not itself start gameplay.', sourceAnchorIds: ['setup.handler', 'setup.client'] },
    blockers: { summary: 'Missing/expired GM lease, malformed or incomplete tuple, stale setup revision, invalid roster, or conflicting request ID rejects confirmation.', sourceAnchorIds: ['setup.handler', 'setup.request'] },
    nextActor: { summary: 'The facilitator reviews the committed setup and uses the separate startGame action when ready.', sourceAnchorIds: ['setup.handler', 'start.handler', 'setup.ui'] },
    clientCallTrace: { status: 'current-gm-ui-service-call', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'GmConsole dispatches the complete setup tuple through sessionService; the callable performs the authoritative validation and commit.', sourceAnchorIds: ['setup.client', 'setup.ui'] },
    guidance: { status: 'current-gm-setup-guidance', summary: 'GmConsole contains the setup controls and current confirmation/start flow.', sourceAnchorIds: ['setup.ui'] },
  },
  {
    exportName: 'startGame', classification: 'served-ui-path',
    productPath: { status: 'served-ui-path', surface: 'GM game start', invocation: 'GmConsole → sessionService.startGame → callable', sourceAnchorIds: ['start.handler', 'start.client', 'start.ui'] },
    actor: { family: 'authenticated GM with current live GM instance', identities: ['gm'], sourceAnchorIds: ['start.handler', 'start.request'] },
    requirements: { summary: 'Requires the exact setup revision, live GM instance, current start request identity, valid roster and completed authoritative setup/admission checks. The full-game demo option is a distinct authorized start mode.', sourceAnchorIds: ['start.handler', 'start.request'] },
    costs: { summary: 'No in-game resources are spent by starting; setup requirements and roster admission still apply.', sourceAnchorIds: ['start.handler', 'start.ui'] },
    consequences: { summary: 'Transitions the confirmed session into active Cycle 1, locks setup, and returns the committed start receipt; when authorized full-game demo is selected, the server marks manual progression.', sourceAnchorIds: ['start.handler', 'start.client'] },
    blockers: { summary: 'Missing/expired GM lease, stale setup revision, invalid or incomplete roster/seats, prior incompatible request, or invalid demo mode rejects start.', sourceAnchorIds: ['start.handler', 'start.request'] },
    nextActor: { summary: 'The game is active and available member consoles can act; the callable does not encode one fixed first player.', sourceAnchorIds: ['start.handler', 'start.ui'] },
    clientCallTrace: { status: 'current-gm-ui-service-call', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'GmConsole dispatches the start command and applies only the validated start reply.', sourceAnchorIds: ['start.client', 'start.ui'] },
    guidance: { status: 'current-gm-start-guidance', summary: 'GmConsole exposes the normal and full-game-demo start controls with setup/authorization context.', sourceAnchorIds: ['start.ui'] },
  },
  {
    exportName: 'prepareFullGameDemo', classification: 'served-ui-path',
    productPath: { status: 'served-ui-path', surface: 'GM full-game demo preparation', invocation: 'GmConsole → sessionService.prepareFullGameDemo → callable', sourceAnchorIds: ['demo.handler', 'demo.client', 'demo.ui'] },
    actor: { family: 'authenticated GM with current live GM instance', identities: ['gm'], sourceAnchorIds: ['demo.handler', 'demo.client'] },
    requirements: { summary: 'Requires fresh Cycle 0, confirmed casting window, exact setup revision, active GM lease and no ordinary participant admission before preparation; the single-cycle demo is excluded.', sourceAnchorIds: ['demo.handler', 'demo.client'] },
    costs: { summary: 'No in-game resources are spent.', sourceAnchorIds: ['demo.handler'] },
    consequences: { summary: 'Writes a permanent manual-progression training marker while remaining in Cycle 0; the separate fullGameDemo start then enters the live game.', sourceAnchorIds: ['demo.handler', 'demo.client', 'start.handler'] },
    blockers: { summary: 'Nonzero cycle, wrong phase, stale revision, expired GM instance, existing ordinary participants, or single-cycle-demo session prevents preparation.', sourceAnchorIds: ['demo.handler', 'demo.client'] },
    nextActor: { summary: 'The authenticated GM starts the prepared session with the fullGameDemo option; authenticated demo actors then use ordinary admission and consent.', sourceAnchorIds: ['demo.handler', 'demo.client', 'demo.ui'] },
    clientCallTrace: { status: 'current-gm-ui-service-call', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'The service validates the preparation reply and GmConsole surfaces the preparation/start flow.', sourceAnchorIds: ['demo.client', 'demo.ui'] },
    guidance: { status: 'current-training-guidance', summary: 'GmConsole labels the training flow, manual advancement, actor admission, and normal consent boundaries.', sourceAnchorIds: ['demo.ui'] },
  },
  {
    exportName: 'beginSessionDebrief', classification: 'served-ui-path',
    productPath: { status: 'served-ui-path', surface: 'EndgameDialog failure review', invocation: 'EndgameDialog → sessionService.beginSessionDebrief → callable', sourceAnchorIds: ['debrief.commands', 'debrief.beginExport', 'debrief.clientBegin', 'debrief.ui'] },
    actor: { family: 'authenticated current GM with live instance', identities: ['gm'], sourceAnchorIds: ['debrief.commands', 'debrief.beginExport'] },
    requirements: { summary: 'Requires a source-committed failure and live GM instance; begins the immutable failure debrief rather than letting the facilitator choose or transcribe the result.', sourceAnchorIds: ['debrief.commands', 'debrief.beginExport'] },
    costs: { summary: 'No gameplay resources are spent; the transaction freezes the terminal failure snapshot.', sourceAnchorIds: ['debrief.commands'] },
    consequences: { summary: 'Validates the stored outcome, freezes an allowlisted debrief snapshot and moves the phase into debrief with replay-safe receipt semantics.', sourceAnchorIds: ['debrief.commands'] },
    blockers: { summary: 'No committed failure, malformed terminal snapshot, stale/expired GM instance, or conflicting lifecycle request prevents entry.', sourceAnchorIds: ['debrief.commands', 'debrief.beginExport'] },
    nextActor: { summary: 'The GM reviews the committed debrief and may close it through the separate closeSession control.', sourceAnchorIds: ['debrief.commands', 'debrief.closeExport', 'debrief.ui'] },
    clientCallTrace: { status: 'current-endgame-ui-service-call', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'EndgameDialog calls the GM-validated service only for the source-reported failure path.', sourceAnchorIds: ['debrief.clientBegin', 'debrief.ui'] },
    guidance: { status: 'current-endgame-guidance', summary: 'EndgameDialog presents the endgame summary and failure-freeze control.', sourceAnchorIds: ['debrief.ui'] },
  },
  {
    exportName: 'closeSession', classification: 'served-ui-path',
    productPath: { status: 'served-ui-path', surface: 'EndgameDialog close action', invocation: 'EndgameDialog → sessionService.closeSession → callable', sourceAnchorIds: ['debrief.commands', 'debrief.closeExport', 'debrief.clientClose', 'debrief.ui'] },
    actor: { family: 'authenticated current GM with live instance', identities: ['gm'], sourceAnchorIds: ['debrief.commands', 'debrief.closeExport'] },
    requirements: { summary: 'Requires an already committed valid debrief snapshot and current live GM instance; a close receipt binds the action to its actor and request.', sourceAnchorIds: ['debrief.commands', 'debrief.closeExport'] },
    costs: { summary: 'No gameplay resources are spent.', sourceAnchorIds: ['debrief.commands'] },
    consequences: { summary: 'Transitions debrief to closed while retaining the committed snapshot for entitled history reads.', sourceAnchorIds: ['debrief.commands', 'auth.closedHistoryClient'] },
    blockers: { summary: 'A missing/invalid debrief, stale GM instance, wrong phase, or conflicting request blocks closure.', sourceAnchorIds: ['debrief.commands', 'debrief.closeExport'] },
    nextActor: { summary: 'The closed session is immutable; previously entitled members may read their bounded history while live GM detail stays lease-gated.', sourceAnchorIds: ['debrief.commands', 'auth.closedHistoryClient', 'debrief.readExport'] },
    clientCallTrace: { status: 'current-endgame-ui-service-call', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'EndgameDialog calls closeSession only from the committed debrief view.', sourceAnchorIds: ['debrief.clientClose', 'debrief.ui'] },
    guidance: { status: 'current-endgame-guidance', summary: 'EndgameDialog presents the frozen debrief and close action.', sourceAnchorIds: ['debrief.ui'] },
  },
  {
    exportName: 'getSessionDebrief', classification: 'served-ui-path',
    productPath: { status: 'served-ui-path', surface: 'EndgameDialog facilitator summary', invocation: 'EndgameDialog → sessionService.getSessionDebrief → callable', sourceAnchorIds: ['debrief.commands', 'debrief.readExport', 'debrief.clientRead', 'debrief.ui'] },
    actor: { family: 'authenticated current GM with live instance; detailed projection is not inferred from historical role alone', identities: ['gm with owned live instance'], sourceAnchorIds: ['debrief.commands', 'debrief.readExport'] },
    requirements: { summary: 'Requires debrief/closed phase, validated committed snapshot, current GM role and owned live GM instance.', sourceAnchorIds: ['debrief.commands', 'debrief.readExport', 'debrief.clientRead'] },
    costs: { summary: 'Read-only; no gameplay state or resources are changed.', sourceAnchorIds: ['debrief.commands'] },
    consequences: { summary: 'Returns the allowlisted detailed facilitator debrief after revalidating the live lease; it does not modify the immutable snapshot.', sourceAnchorIds: ['debrief.commands', 'debrief.clientRead'] },
    blockers: { summary: 'No committed snapshot, wrong phase, expired/unowned instance, or invalid stored projection denies the read.', sourceAnchorIds: ['debrief.commands', 'debrief.readExport'] },
    nextActor: { summary: 'The facilitator reviews the returned snapshot; no game actor is advanced.', sourceAnchorIds: ['debrief.clientRead', 'debrief.ui'] },
    clientCallTrace: { status: 'current-endgame-ui-service-call', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'EndgameDialog fetches detailed debrief only while the client has a live GM instance.', sourceAnchorIds: ['debrief.clientRead', 'debrief.ui'] },
    guidance: { status: 'current-endgame-summary', summary: 'EndgameDialog presents the committed summary and candidate/survivor sections when entitled.', sourceAnchorIds: ['debrief.ui'] },
  },
  {
    exportName: 'readFleetGroupMessages', classification: 'served-ui-path',
    productPath: { status: 'served-ui-path', surface: 'FleetGroupWorkspace ordinary group notes', invocation: 'FleetGroupWorkspace → current fleet-group service → callable', sourceAnchorIds: ['group.read', 'group.clientActions', 'group.currentActions', 'group.workspace'] },
    actor: { family: 'active session member of the expected current fleet group', identities: ['current member in group membership'], sourceAnchorIds: ['group.authority', 'group.request'] },
    requirements: { summary: 'Requires an authenticated active member, active gameplay, matching current fleet-group membership and a valid expectedGroupId; current group merge history is actor-derived.', sourceAnchorIds: ['group.authority', 'group.request', 'group.read'] },
    costs: { summary: 'Read-only; no resource or action slot is spent.', sourceAnchorIds: ['group.read', 'group.authority'] },
    consequences: { summary: 'Returns at most the latest 20 validated messages from the member’s current/merged ordinary group history.', sourceAnchorIds: ['group.read', 'group.authority'] },
    blockers: { summary: 'Inactive member, wrong phase, malformed group membership, or a requested group outside the ordinary communication boundary denies the read.', sourceAnchorIds: ['group.authority', 'group.request'] },
    nextActor: { summary: 'Any active member of the same group may continue reading or send a note; no strict speaking order is encoded.', sourceAnchorIds: ['group.authority', 'group.workspace'] },
    clientCallTrace: { status: 'current-group-workspace-read', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'The client service dynamically dispatches the named read endpoint after deriving the current group and rechecks reply group identity.', sourceAnchorIds: ['group.clientActions', 'group.currentActions', 'group.workspace'] },
    guidance: { status: 'current-group-communication-surface', summary: 'FleetGroupWorkspace contains the group note read/send panel and its local constraints.', sourceAnchorIds: ['group.workspace', 'group.clientActions'] },
  },
  {
    exportName: 'sendFleetGroupMessage', classification: 'served-ui-path',
    productPath: { status: 'served-ui-path', surface: 'FleetGroupWorkspace ordinary group notes', invocation: 'FleetGroupWorkspace → current fleet-group service → callable', sourceAnchorIds: ['group.send', 'group.clientActions', 'group.currentActions', 'group.workspace'] },
    actor: { family: 'active session member of the expected current fleet group', identities: ['current member in group membership'], sourceAnchorIds: ['group.authority', 'group.request'] },
    requirements: { summary: 'Requires authenticated active membership, active gameplay, matching current group, request ID and trimmed text from 1 to 240 characters. The transaction records an idempotent receipt.', sourceAnchorIds: ['group.authority', 'group.request', 'group.send'] },
    costs: { summary: 'No game resource or cycle action slot is spent.', sourceAnchorIds: ['group.send', 'group.request'] },
    consequences: { summary: 'Adds the message to the current group history, retaining at most 20 notes; the same-group members can read it.', sourceAnchorIds: ['group.send', 'group.authority'] },
    blockers: { summary: 'Inactive member, wrong phase/group, invalid text, request collision or malformed stored group history rejects the send.', sourceAnchorIds: ['group.authority', 'group.request', 'group.send'] },
    nextActor: { summary: 'Any active member in the same ordinary fleet group may read or respond; no role-specific speaker is selected.', sourceAnchorIds: ['group.authority', 'group.workspace'] },
    clientCallTrace: { status: 'current-group-workspace-send', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'The fleet-group service sends the current actor/group context through its transport and validates the returned receipt.', sourceAnchorIds: ['group.clientActions', 'group.currentActions', 'group.workspace'] },
    guidance: { status: 'current-group-communication-surface', summary: 'FleetGroupWorkspace contains the group note composer and its local length/availability handling.', sourceAnchorIds: ['group.workspace', 'group.clientActions'] },
  },
  {
    exportName: 'loginGmAccess', classification: 'served-ui-path',
    productPath: { status: 'served-ui-path', surface: 'Settings GM access panel', invocation: 'AppHeader/sessionService.loginGmAccess → loginGmAccess callable', sourceAnchorIds: ['gmAccess.login', 'gmAccess.loginClient', 'gmAccess.settingsUi'] },
    actor: { family: 'authenticated account with the valid GM access credential', identities: ['authenticated UID; not yet a session GM instance'], sourceAnchorIds: ['gmAccess.login', 'gmAccess.passwordPolicy'] },
    requirements: { summary: 'Requires signed-in UID and a valid GM access password; server records the authentication timestamp, bounded by the existing access expiry policy.', sourceAnchorIds: ['gmAccess.login', 'gmAccess.passwordPolicy', 'gmAccess.leasePolicy'] },
    costs: { summary: 'No gameplay resource or session action is spent.', sourceAnchorIds: ['gmAccess.login'] },
    consequences: { summary: 'Grants persistent device/account GM access until its server-defined expiry. It does not itself join a session, change a player role, or create a live GM instance.', sourceAnchorIds: ['gmAccess.login', 'gmAccess.leasePolicy', 'gmAccess.claimInstance'] },
    blockers: { summary: 'Unauthenticated request or rejected password denies GM access.', sourceAnchorIds: ['gmAccess.login', 'gmAccess.passwordPolicy'] },
    nextActor: { summary: 'After joining and releasing any core station, the account must claim a separate live GM instance for session-scoped facilitator authority.', sourceAnchorIds: ['gmAccess.claimInstance'] },
    clientCallTrace: { status: 'current-settings-ui-service-call', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'AppHeader presents the GM access setting and calls the session service, which validates the server confirmation before updating local access state.', sourceAnchorIds: ['gmAccess.loginClient', 'gmAccess.settingsUi'] },
    guidance: { status: 'current-settings-guidance', summary: 'Settings explains GM access and exposes the password entry and authorization state.', sourceAnchorIds: ['gmAccess.settingsUi'] },
  },
];

const supplementalSourceReviews = [
  {
    exportName: 'readPrivateScoutResult', classification: 'served-ui-path',
    productPath: { status: 'ScoutRequestControls → ScoutReportController → scoutResultService → callable', sourceAnchorIds: ['scout.requestUi', 'scout.playerReportUi', 'scout.servicePrivateResult'] },
    actor: { family: 'connected active player who requested this result; server also supports a current live GM with the owned instance supplied', identities: ['requester UID or current live GM instance'], sourceAnchorIds: ['scout.privateResultReader', 'scout.resultProjection', 'scout.playerReportUi'] },
    requirements: { summary: 'Requires an active session, a connected active viewer, and a valid stored result. The player view is limited to the exact requester UID; GM detail requires the current owned live instance. The app uses the player requester path.', sourceAnchorIds: ['scout.privateResultReader', 'scout.resultProjection', 'scout.servicePrivateResult'] },
    costs: { summary: 'Read-only; no resource or turn action is spent.', sourceAnchorIds: ['scout.privateResultReader', 'scout.servicePrivateResult'] },
    consequences: { summary: 'Returns only the requester-bound result fields and one system fact; it does not export a chart or change game state.', sourceAnchorIds: ['scout.resultProjection', 'scout.privateResultReader'] },
    blockers: { summary: 'Wrong session or phase, inactive/disconnected viewer, non-requester player, expired/unowned GM instance, or invalid/missing result denies the read.', sourceAnchorIds: ['scout.privateResultReader', 'scout.resultProjection'] },
    nextActor: { summary: 'The requester reviews the private result and saved note; no turn actor is advanced.', sourceAnchorIds: ['scout.playerReportUi', 'scout.servicePrivateResult'] },
    guidance: { status: 'current-player-report-guidance', summary: 'The live report controller displays loading, reconnect, empty, and saved-result states after the request controls; the UI source does not prove runtime visibility.', sourceAnchorIds: ['scout.requestUi', 'scout.playerReportUi'] },
  },
  {
    exportName: 'listPendingScoutRequests', classification: 'served-ui-path',
    productPath: { status: 'GmConsole → GmScoutRevealController → scoutResultService → callable', sourceAnchorIds: ['scout.gmConsoleUi', 'scout.gmRevealUi', 'scout.servicePendingQueue'] },
    actor: { family: 'active facilitator with the current owned live GM instance', identities: ['gm role with owned live instance'], sourceAnchorIds: ['scout.pendingQueueReader', 'scout.gmRevealUi'] },
    requirements: { summary: 'Requires the active phase and a connected current GM whose sessionId, UID and supplied instanceId match an owned live lease. The mounted controller additionally requires the matching current session/instance, live connection and server-fresh session snapshot. The response includes only validated pending request identity and coordinates without result facts.', sourceAnchorIds: ['scout.pendingQueueReader', 'scout.gmRevealUi', 'scout.servicePendingQueue'] },
    costs: { summary: 'Read-only; no resource or facilitator action slot is spent.', sourceAnchorIds: ['scout.pendingQueueReader'] },
    consequences: { summary: 'Returns validated pending requests that do not yet have stored results; no request is resolved by this read.', sourceAnchorIds: ['scout.pendingQueueReader'] },
    blockers: { summary: 'Inactive or mismatched session, wrong phase, disconnected or stale client snapshot, expired/foreign GM instance, and malformed pending request records block or omit the request.', sourceAnchorIds: ['scout.pendingQueueReader', 'scout.gmRevealUi'] },
    nextActor: { summary: 'The live GM may choose one displayed pending request and invoke the separate resolve action.', sourceAnchorIds: ['scout.gmRevealUi', 'scout.serviceResolve'] },
    guidance: { status: 'current-facilitator-queue-guidance', summary: 'GmConsole mounts the queue with reveal feedback and explicit refresh; the controller checks the matching session and owned live instance plus live/server-fresh state before loading. Source inspection does not claim live browser availability.', sourceAnchorIds: ['scout.gmConsoleUi', 'scout.gmRevealUi'] },
  },
  {
    exportName: 'listGmScoutResolutionLog', classification: 'served-ui-path',
    productPath: { status: 'GmConsole → GmScoutRevealController → scoutResultService → callable', sourceAnchorIds: ['scout.gmConsoleUi', 'scout.gmRevealUi', 'scout.serviceGmLog'] },
    actor: { family: 'active facilitator with the current owned live GM instance', identities: ['gm role with owned live instance'], sourceAnchorIds: ['scout.gmLogReader', 'scout.gmRevealUi'] },
    requirements: { summary: 'Requires an active phase and connected current GM whose sessionId, UID and supplied instanceId match the owned live lease. The mounted controller reads only with matching session/instance identity plus connection=live and server-fresh session state. Returned audit rows are validated and limited to the most recent 50.', sourceAnchorIds: ['scout.gmLogReader', 'scout.gmRevealUi', 'scout.serviceGmLog'] },
    costs: { summary: 'Read-only; no resource or facilitator action slot is spent.', sourceAnchorIds: ['scout.gmLogReader'] },
    consequences: { summary: 'Returns the facilitator log fields for committed results, including source and vessel identities; it does not return a chart or requester UID.', sourceAnchorIds: ['scout.gmLogReader'] },
    blockers: { summary: 'Inactive or mismatched session, wrong phase, disconnected or stale client snapshot, expired/foreign GM instance, or malformed audit records blocks or omits the read.', sourceAnchorIds: ['scout.gmLogReader', 'scout.gmRevealUi'] },
    nextActor: { summary: 'The GM may review the log or return to the pending queue; no next player action is imposed by reading it.', sourceAnchorIds: ['scout.gmRevealUi', 'scout.serviceGmLog'] },
    guidance: { status: 'current-facilitator-log-guidance', summary: 'The controller loads the committed log beside the pending queue only for the matching live, server-fresh GM session; refresh reloads both. Source inspection does not claim live browser availability.', sourceAnchorIds: ['scout.gmConsoleUi', 'scout.gmRevealUi'] },
  },
  {
    exportName: 'listMyScoutReports', classification: 'served-ui-path',
    productPath: { status: 'ScoutRequestControls → ScoutReportController → scoutResultService → callable', sourceAnchorIds: ['scout.requestUi', 'scout.playerReportUi', 'scout.serviceOwnReports'] },
    actor: { family: 'connected active non-replacement player', identities: ['authenticated player; requester UID is used to filter the report index'], sourceAnchorIds: ['scout.ownReportReader', 'scout.playerReportUi'] },
    requirements: { summary: 'Requires an active session, connected active player role, and no replacement state. The handler filters scout requests to the authenticated requester.', sourceAnchorIds: ['scout.ownReportReader', 'scout.playerReportUi', 'scout.serviceOwnReports'] },
    costs: { summary: 'Read-only; no resource or turn action is spent.', sourceAnchorIds: ['scout.ownReportReader'] },
    consequences: { summary: 'Returns the player’s request IDs, cycles, coordinates, pending/resolved state, and note identity; it does not include chart facts.', sourceAnchorIds: ['scout.ownReportReader', 'scout.serviceOwnReports'] },
    blockers: { summary: 'Inactive or wrong-phase session, disconnected or non-player role, replacement state, and invalid result/request data prevent the report index.', sourceAnchorIds: ['scout.ownReportReader'] },
    nextActor: { summary: 'For a resolved report, the controller reads the private result and then its note when the receipt contains a note ID.', sourceAnchorIds: ['scout.playerReportUi', 'scout.servicePrivateResult', 'scout.serviceDiscoveryNote'] },
    guidance: { status: 'current-player-report-guidance', summary: 'The report panel explains pending, empty, reconnect, and saved-report states and offers a refresh action.', sourceAnchorIds: ['scout.requestUi', 'scout.playerReportUi'] },
  },
  {
    exportName: 'readMyScoutDiscoveryNote', classification: 'served-ui-path',
    productPath: { status: 'ScoutRequestControls → ScoutReportController → scoutResultService → callable', sourceAnchorIds: ['scout.requestUi', 'scout.playerReportUi', 'scout.serviceDiscoveryNote'] },
    actor: { family: 'connected active player still assigned to the note’s source ship and current fleet group', identities: ['note requester UID; current source-ship authority'], sourceAnchorIds: ['scout.discoveryNoteReader', 'scout.playerReportUi'] },
    requirements: { summary: 'Requires an active session and connected non-replacement player, a valid note ID, current role ship matching the note, an active vessel, and a current fleet group containing that ship.', sourceAnchorIds: ['scout.discoveryNoteReader', 'scout.playerReportUi', 'scout.serviceDiscoveryNote'] },
    costs: { summary: 'Read-only; no resource or turn action is spent.', sourceAnchorIds: ['scout.discoveryNoteReader'] },
    consequences: { summary: 'Returns the requester’s validated discovery-note fields; it does not expose the note to another player or change game state.', sourceAnchorIds: ['scout.discoveryNoteReader', 'scout.serviceDiscoveryNote'] },
    blockers: { summary: 'Inactive or wrong-phase session, replacement or disconnected player, changed ship/group authority, wrong requester, or malformed note denies the read.', sourceAnchorIds: ['scout.discoveryNoteReader'] },
    nextActor: { summary: 'The authorized player reviews the saved note in the private report panel; no other actor is scheduled.', sourceAnchorIds: ['scout.playerReportUi'] },
    guidance: { status: 'current-private-note-guidance', summary: 'The report panel retrieves a saved note after its result; unavailable ship/group notes produce a bounded notice.', sourceAnchorIds: ['scout.playerReportUi', 'scout.serviceDiscoveryNote'] },
  },
  {
    exportName: 'resolvePendingScoutRequest', classification: 'served-ui-path',
    productPath: { status: 'GmConsole → GmScoutRevealController → scoutResultService → callable', sourceAnchorIds: ['scout.gmConsoleUi', 'scout.gmRevealUi', 'scout.serviceResolve', 'scout.resolveFactory'] },
    actor: { family: 'active facilitator with the current owned live GM instance', identities: ['gm role with owned live instance'], sourceAnchorIds: ['scout.resolveFactory', 'scout.resolveFlow', 'scout.gmRevealUi'] },
    requirements: { summary: 'Requires the active phase (session.phase=active) and the current owned live GM instance, plus a matching controller session/instance and live, server-fresh client snapshot. The source request, player command receipt, cadence entry, active ships and unique fleet group are revalidated. Current chart resolution requires chartSelectionLocked or configurationLocked to be true.', sourceAnchorIds: ['scout.resolveFactory', 'scout.resolveFlow', 'scout.resolutionPlan', 'scout.gmRevealUi'] },
    costs: { summary: 'No game resource or facilitator action slot is spent. A successful reveal writes the committed result, private discovery note and audit/map-knowledge updates; exact request retries return the committed result.', sourceAnchorIds: ['scout.resolveFlow', 'scout.resolutionPlan', 'scout.commitMapKnowledge'] },
    consequences: { summary: 'The selected legal request resolves to one private system fact and requester-bound discovery note, with a facilitator audit; the handler does not return or write the full chart.', sourceAnchorIds: ['scout.resolveFlow', 'scout.resolutionPlan', 'scout.resultProjection', 'scout.commitMapKnowledge'] },
    blockers: { summary: 'Wrong/mismatched session or phase, stale client snapshot, expired/foreign GM lease, missing or malformed pending request/receipt/cadence, inactive ship/group, unlocked chart/configuration, or conflicting stored result records rejects the reveal.', sourceAnchorIds: ['scout.resolveFlow', 'scout.resolveFactory', 'scout.resolutionPlan', 'scout.gmRevealUi'] },
    nextActor: { summary: 'The requester’s report controller retrieves the result and saved note; the automatic resolver may also complete the same receipt-backed request.', sourceAnchorIds: ['scout.playerReportUi', 'scout.automaticResolver', 'scout.resolveFlow'] },
    guidance: { status: 'current-facilitator-reveal-guidance', summary: 'The GM console presents pending requests, reveal feedback and refresh only after matching live, server-fresh GM authority. The controller performs bounded periodic refresh while mounted; this source pass does not claim browser availability.', sourceAnchorIds: ['scout.gmConsoleUi', 'scout.gmRevealUi'] },
  },
];

const REQUIRED_NAMES = [
  'resolveMaliadesMedium', 'resolveMaliadesShort', 'setShipPreference', 'submitWolfSupplySabotage',
  'elevateToGm', 'rollDice', 'createSession', 'joinSession', 'resumeSession',
  'getCurrentMemberSession', 'refreshPresence', 'confirmSetup', 'startGame',
  'prepareFullGameDemo', 'beginSessionDebrief', 'closeSession', 'getSessionDebrief',
  'readFleetGroupMessages', 'sendFleetGroupMessage', 'loginGmAccess',
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function sourceFiles(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile() && /\.(?:tsx?|jsx?|mjs)$/.test(entry.name) &&
          !/\.test\./.test(entry.name) && !/\.d\.ts$/.test(entry.name)) result.push(absolutePath);
    }
  }
  await visit(resolve(productSourceRoot, root));
  return result.sort((a, b) => a.localeCompare(b));
}

async function bindSourceTree(root) {
  const paths = await sourceFiles(root);
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(relative(resolve(productSourceRoot, root), path).replaceAll('\\', '/'))
      .update('\0').update(await readFile(path));
  }
  return { fileCount: paths.length, sha256: hash.digest('hex') };
}

async function resolveAnchors(anchorSpecifications) {
  const output = [];
  for (const [id, relativePath, symbol] of anchorSpecifications) {
    const source = await readFile(resolve(productSourceRoot, relativePath), 'utf8');
    const filePath = resolve(productSourceRoot, relativePath);
    const parsed = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const declaration = parsed.statements.find((statement) => {
      if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
        return statement.name?.text === symbol;
      }
      if (ts.isVariableStatement(statement)) {
        return statement.declarationList.declarations.some((candidate) =>
          ts.isIdentifier(candidate.name) && candidate.name.text === symbol);
      }
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        return statement.exportClause.elements.some((specifier) => specifier.name.text === symbol);
      }
      return false;
    });
    if (!declaration) throw new Error(`Cannot resolve top-level source symbol ${symbol} in ${relativePath}`);
    const start = parsed.getLineAndCharacterOfPosition(declaration.getStart(parsed)).line + 1;
    const end = parsed.getLineAndCharacterOfPosition(declaration.getEnd()).line + 1;
    output.push({ id, path: relativePath, symbol, startLine: start, endLine: end, sha256: sha256(source) });
  }
  return output;
}

function referencedAnchorIds(value, result = new Set()) {
  if (Array.isArray(value)) for (const entry of value) referencedAnchorIds(entry, result);
  else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (key === 'sourceAnchorIds') for (const id of nested) result.add(id);
      else referencedAnchorIds(nested, result);
    }
  }
  return result;
}

function sourceCommit() {
  return execFileSync('git', ['log', '-n', '1', '--format=%H', 'HEAD', '--', 'functions/src', 'src'],
    { cwd: productSourceRoot, encoding: 'utf8' }).trim();
}

async function scanClientReferences(names, aliasesByExportName = {}) {
  const paths = await sourceFiles('src');
  const references = new Map(names.map(name => [name, { identifierOccurrences: [], quotedOccurrences: [] }]));
  const ownersByIdentifier = new Map(names.map(name => [name, [{ exportName: name }]]));
  for (const [exportName, aliases] of Object.entries(aliasesByExportName)) {
    if (!references.has(exportName)) throw new Error(`Client reference alias names unknown callable ${exportName}`);
    for (const alias of aliases) {
      if (!alias || names.includes(alias)) throw new Error(`Invalid client reference alias ${alias} for ${exportName}`);
      const owners = ownersByIdentifier.get(alias) ?? [];
      owners.push({ exportName, matchedSymbol: alias });
      ownersByIdentifier.set(alias, owners);
    }
  }
  const identifierNames = [...ownersByIdentifier.keys()];
  const alternatives = identifierNames.sort((left, right) => right.length - left.length)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const callableAlternatives = [...names].sort((left, right) => right.length - left.length)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const identifier = new RegExp(`(?<![\\w$])(${alternatives})(?![\\w$])`, 'g');
  const quoted = new RegExp(`(['"])(${callableAlternatives})\\1`, 'g');
  for (const path of paths) {
    const text = await readFile(path, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      identifier.lastIndex = 0;
      quoted.lastIndex = 0;
      const sourcePath = relative(productSourceRoot, path).replaceAll('\\', '/');
      for (const match of line.matchAll(identifier)) {
        for (const owner of ownersByIdentifier.get(match[1]) ?? []) {
          references.get(owner.exportName).identifierOccurrences.push({ path: sourcePath, line: index + 1,
            ...(owner.matchedSymbol ? { matchedSymbol: owner.matchedSymbol } : {}) });
        }
      }
      for (const match of line.matchAll(quoted)) {
        references.get(match[2]).quotedOccurrences.push({ path: sourcePath, line: index + 1 });
      }
    });
  }
  return references;
}

function indexExportEvidence(indexSource) {
  const parsed = ts.createSourceFile('functions/src/index.ts', indexSource, ts.ScriptTarget.Latest, true,
    ts.ScriptKind.TS);
  const result = new Map();
  const add = (name, node, bindingKind) => {
    const startLine = parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;
    const endLine = parsed.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    result.set(name, { path: 'functions/src/index.ts', symbol: name, bindingKind, startLine, endLine,
      sha256: sha256(indexSource) });
  };
  for (const statement of parsed.statements) {
    if (ts.isVariableStatement(statement) && statement.modifiers?.some(modifier =>
      modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) add(declaration.name.text, statement, 'exported-declaration');
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name && statement.modifiers?.some(modifier =>
      modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      add(statement.name.text, statement, 'exported-declaration');
    } else if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const specifier of statement.exportClause.elements) add(specifier.name.text, statement, 'named-export-binding');
    }
  }
  return result;
}

function moduleSpecifiers(sourceFile) {
  const values = [];
  for (const statement of sourceFile.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
        statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) values.push(statement.moduleSpecifier.text);
  }
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) values.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...new Set(values)];
}

function resolveImportedSource(importerPath, specifier, knownFiles) {
  let base;
  if (specifier.startsWith('@/')) base = resolve(productSourceRoot, 'src', specifier.slice(2));
  else if (specifier.startsWith('.')) base = resolve(dirname(importerPath), specifier);
  else return undefined;
  const candidates = [base, ...['.ts', '.tsx', '.mjs', '.js', '.jsx'].map(suffix => `${base}${suffix}`),
    ...['index.ts', 'index.tsx', 'index.mjs', 'index.js'].map(name => resolve(base, name))];
  return candidates.find(candidate => knownFiles.has(candidate));
}

async function buildAppImportGraph() {
  const paths = await sourceFiles('src');
  const knownFiles = new Set(paths);
  const importersByDependency = new Map();
  for (const path of paths) {
    const text = await readFile(path, 'utf8');
    const parsed = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    for (const specifier of moduleSpecifiers(parsed)) {
      const dependency = resolveImportedSource(path, specifier, knownFiles);
      if (!dependency) continue;
      const importers = importersByDependency.get(dependency) ?? new Set();
      importers.add(path);
      importersByDependency.set(dependency, importers);
    }
  }
  const appPath = resolve(productSourceRoot, 'src/App.tsx');
  return function pathToApp(seed) {
    const queue = [[seed]];
    const visited = new Set([seed]);
    while (queue.length) {
      const chain = queue.shift();
      const current = chain.at(-1);
      if (current === appPath) return chain.map(path => relative(productSourceRoot, path).replaceAll('\\', '/'));
      for (const importer of [...(importersByDependency.get(current) ?? [])].sort()) {
        if (visited.has(importer)) continue;
        visited.add(importer);
        queue.push([...chain, importer]);
      }
    }
    return undefined;
  };
}

function classifyExport(row, annotation, clientTrace) {
  if (row.kind === 'schedule') return 'automatic-scheduled';
  if (row.kind === 'background') return 'background-trigger';
  if (annotation?.classification === 'legacy/deprecated-internal-compatibility') return 'legacy-deprecated';
  if (annotation?.classification === 'external/manual-only') return 'external-manual-only';
  if (annotation?.classification === 'genuinely-unserved') return 'genuinely-unserved';
  if (annotation?.classification === 'served-ui-path' && /^Read-only(?:;|\s)/i.test(annotation.costs.summary)) {
    return 'read-projection-support';
  }
  if (annotation) return 'served-ui-path';
  if (clientTrace.identifierOccurrences.length || clientTrace.quotedOccurrences.length) {
    return 'client-source-reference-unverified';
  }
  return 'no-client-reference-unclassified';
}

function exportClassificationRows(canonicalMatrix, annotations, clientReferenceScans,
    exportEvidence, pathToApp) {
  const annotationsByName = new Map(annotations.map(row => [row.exportName, row]));
  const rows = [];
  for (const action of canonicalMatrix.actions) {
    const name = action.exportName;
    const annotation = annotationsByName.get(name);
    const clientTrace = clientReferenceScans.get(name);
    const referenceFiles = [...new Set([
      ...clientTrace.identifierOccurrences.map(item => item.path),
      ...clientTrace.quotedOccurrences.map(item => item.path),
    ])].sort();
    const exampleByFile = new Map();
    for (const item of clientTrace.quotedOccurrences) {
      if (!exampleByFile.has(item.path)) exampleByFile.set(item.path, { ...item, evidence: 'quoted-callable-name' });
    }
    for (const item of clientTrace.identifierOccurrences) {
      if (!exampleByFile.has(item.path)) exampleByFile.set(item.path, { ...item, evidence: 'identifier-reference' });
    }
    const chainCandidates = referenceFiles.flatMap(file => {
      const chain = pathToApp(resolve(productSourceRoot, file));
      return chain ? [{ file, chain }] : [];
    });
    const representativeChains = [];
    const addChain = (candidate) => {
      if (!candidate || representativeChains.some(row => row.chain.join(' -> ') === candidate.chain.join(' -> '))) return;
      representativeChains.push(candidate);
    };
    addChain(chainCandidates.find(row => /\/(?:components|routes)\//.test(`/${row.file}`)));
    addChain(chainCandidates.find(row => row.file.startsWith('src/lib/')));
    if (!representativeChains.length) addChain(chainCandidates[0]);
    const importChainsToApp = representativeChains.map(row => row.chain);
    const sourceEvidence = exportEvidence.get(name);
    if (!sourceEvidence) throw new Error(`Cannot locate current index export binding for ${name}`);
    const hasClientReference = clientTrace.identifierOccurrences.length > 0 || clientTrace.quotedOccurrences.length > 0;
    const compactEvidence = { path: sourceEvidence.path, symbol: sourceEvidence.symbol,
      bindingKind: sourceEvidence.bindingKind, lines: [sourceEvidence.startLine, sourceEvidence.endLine],
      sha256: sourceEvidence.sha256 };
    rows.push({
      exportName: name,
      runtimeKind: 'callable',
      sourceClassification: classifyExport({ kind: 'callable' }, annotation, clientTrace),
      productPath: annotation
        ? { status: 'source-reviewed', summary: annotation.productPath.status, reviewRow: name }
          : { status: hasClientReference ? 'static-client-reference; control binding unverified'
          : 'no-current-client-reference-found; product availability unresolved',
          controlStatus: 'visibility, enabled state, eligibility, and usability are not established by static references' },
      sourceEvidence: compactEvidence,
      clientTrace: {
        status: hasClientReference ? 'static-client-reference-found' : 'no-current-client-reference-found',
        identifierOccurrenceCount: clientTrace.identifierOccurrences.length,
        quotedOccurrenceCount: clientTrace.quotedOccurrences.length,
        referenceFileCount: referenceFiles.length,
        sourceReferenceExamples: [...exampleByFile.values()],
        importChainsToApp,
      },
      contract: annotation
        ? { status: 'source-reviewed', detailRef: name }
        : { status: 'unresolved', fields: ['actor', 'requirements', 'costs', 'consequences', 'blockers', 'nextActor', 'guidance'],
          reason: 'No action-specific source review in this pass; names and import paths do not establish authority or mechanics.' },
      acceptanceCredit: 0,
      proofStatus: 'pending; no runtime or gameplay evidence claimed',
    });
  }
  for (const entry of canonicalMatrix.nonInteractiveExports) {
    const sourceEvidence = exportEvidence.get(entry.exportName);
    if (!sourceEvidence) throw new Error(`Cannot locate current index export binding for ${entry.exportName}`);
    const compactEvidence = { path: sourceEvidence.path, symbol: sourceEvidence.symbol,
      bindingKind: sourceEvidence.bindingKind, lines: [sourceEvidence.startLine, sourceEvidence.endLine],
      sha256: sourceEvidence.sha256 };
    rows.push({
      exportName: entry.exportName,
      runtimeKind: entry.kind,
      sourceClassification: classifyExport(entry, undefined, { identifierOccurrences: [], quotedOccurrences: [] }),
      playerControl: false,
      invocationBoundary: entry.kind === 'schedule' ? 'scheduled server task' : 'background server trigger',
      productPath: { status: 'not a player-invoked callable' },
      sourceEvidence: compactEvidence,
      contract: { status: 'not-applicable-to-player-command', effects: 'not reviewed' },
      acceptanceCredit: 0,
      proofStatus: 'not applicable to player command; runtime not run',
    });
  }
  return rows;
}

const indexSource = await readFile(resolve(productSourceRoot, 'functions/src/index.ts'), 'utf8');
const exportEvidence = indexExportEvidence(indexSource);
const sourceInventoryDeltaReviews = exportEvidence.has('transferWarriorCargo') ? productDeltaReviews : [];
const allDetailedReviews = [...reviewed, ...supplementalSourceReviews, ...endingSourceReviews,
  ...workspaceSourceReviews, ...demoSourceReviews, ...sourceInventoryDeltaReviews];
const activeAnchorSpecifications = [...ANCHORS, ...ENDING_ANCHORS, ...WORKSPACE_ANCHORS, ...DEMO_ANCHORS,
  ...(sourceInventoryDeltaReviews.length ? PRODUCT_DELTA_ANCHORS : [])];
const ALL_ANCHOR_IDS = new Set(activeAnchorSpecifications.map(([id]) => id));
const [functionsSource, clientSource, sourceAnchors, canonicalMatrixRaw] = await Promise.all([
  bindSourceTree('functions/src'), bindSourceTree('src'), resolveAnchors(activeAnchorSpecifications),
  readFile(resolve(repositoryDirectory, 'docs/PC10_ACTION_ROLE_MATRIX.json'), 'utf8'),
]);
const canonicalMatrix = JSON.parse(canonicalMatrixRaw);
if (canonicalMatrix.actions.length !== 232 || canonicalMatrix.roles.length !== 42) {
  throw new Error('The canonical action/role matrix snapshot changed; this sidecar must not regenerate or replace it.');
}
if (canonicalMatrix.nonInteractiveExports.length !== 9) {
  throw new Error('The canonical SDK export inventory changed; this source overlay does not regenerate the matrix.');
}
const allCallableNames = canonicalMatrix.actions.map(row => row.exportName);
const allExportNames = [...allCallableNames, ...canonicalMatrix.nonInteractiveExports.map(row => row.exportName)];
const detailedNames = allDetailedReviews.map(row => row.exportName);
if (new Set(detailedNames).size !== detailedNames.length) {
  throw new Error('Source review modules contain duplicate callable rows.');
}
const detailedNameSet = new Set(detailedNames);
const missingCanonicalReviews = allCallableNames.filter(name => !detailedNameSet.has(name));
if (missingCanonicalReviews.length) {
  throw new Error(`Source review modules are missing canonical callable rows: ${missingCanonicalReviews.join(', ')}`);
}
for (const row of sourceInventoryDeltaReviews) {
  if (allCallableNames.includes(row.exportName)) {
    throw new Error(`${row.exportName} is already in the preserved canonical matrix and cannot be a source delta.`);
  }
}
const clientReferenceAliases = Object.fromEntries(allDetailedReviews
  .filter(row => row.clientReferenceAliases?.length)
  .map(row => [row.exportName, row.clientReferenceAliases]));
const [clientReferenceScans, pathToApp] = await Promise.all([
  scanClientReferences([...allCallableNames, ...sourceInventoryDeltaReviews.map(row => row.exportName)],
    clientReferenceAliases),
  buildAppImportGraph(),
]);
for (const name of allExportNames) {
  if (!exportEvidence.has(name)) throw new Error(`The current Functions entrypoint does not export inventory name ${name}`);
}
if (JSON.stringify(reviewed.map(row => row.exportName)) !== JSON.stringify(REQUIRED_NAMES)) {
  throw new Error('Reviewed annotation row set does not match the explicit bounded scope.');
}
for (const row of allDetailedReviews) {
  for (const id of referencedAnchorIds(row)) {
    if (!ALL_ANCHOR_IDS.has(id)) throw new Error(`${row.exportName} references missing anchor ${id}`);
  }
  if (!row.actor?.family || !row.actor?.sourceAnchorIds?.length) {
    throw new Error(`${row.exportName}.actor must have an actor family and source anchor`);
  }
  for (const field of ['requirements', 'costs', 'consequences', 'blockers', 'nextActor', 'guidance']) {
    if (!row[field]?.summary || !row[field]?.sourceAnchorIds?.length) {
      throw new Error(`${row.exportName}.${field} must have a concrete summary and source anchor`);
    }
  }
}
for (const row of reviewed) {
  row.clientCallTrace.sourceTreeSha256 = clientSource.sha256;
  const scan = clientReferenceScans.get(row.exportName);
  row.clientCallTrace.identifierReferenceCount = scan.identifierOccurrences.length;
  row.clientCallTrace.exactQuotedReferenceCount = scan.quotedOccurrences.length;
  row.clientCallTrace.clientSourceReferences = scan;
  if (row.classification === 'external/manual-only' &&
      (scan.identifierOccurrences.length !== 0 || scan.quotedOccurrences.length !== 0)) {
    throw new Error(`${row.exportName} has a current client source reference; revisit its manual-only classification`);
  }
}
for (const row of [...endingSourceReviews, ...workspaceSourceReviews, ...demoSourceReviews]) {
  const scan = clientReferenceScans.get(row.exportName);
  const uiReferences = [];
  for (const reference of [...scan.identifierOccurrences, ...scan.quotedOccurrences]) {
    if (!/^(?:src\/components|src\/routes)\//.test(reference.path)) continue;
    if (row.exportName === 'setGmControlsLocked' && reference.path === 'src/routes/GmConsole.tsx') {
      const source = await readFile(resolve(productSourceRoot, reference.path), 'utf8');
      const line = source.split(/\r?\n/)[reference.line - 1] ?? '';
      // This switch arm labels an already-pending command; it is not a mounted writer control.
      if (/^\s*case 'setGmControlsLocked': return 'GM registration lock pending';\s*$/.test(line)) continue;
    }
    uiReferences.push(reference);
  }
  row.clientCallTrace = {
    status: row.classification === 'served-ui-path' && uiReferences.length ? 'source-service-and-component-route-references' :
      row.classification === 'served-ui-path' ? 'service-path-source-reviewed; component-reference-unverified' :
        row.classification === 'legacy/deprecated-internal-compatibility' ? 'legacy-service-compatibility-reference' :
          uiReferences.length ? 'source-reference-found-ui-binding-unverified' : 'service-only-or-no-current-ui-reference',
    sourceTreeSha256: clientSource.sha256,
    identifierReferenceCount: scan.identifierOccurrences.length,
    exactQuotedReferenceCount: scan.quotedOccurrences.length,
    componentOrRouteReferenceCount: uiReferences.length,
    sourceReferences: scan,
    ...(row.clientReferenceAliases?.length ? { referenceAliases: row.clientReferenceAliases } : {}),
    interpretation: row.classification === 'genuinely-unserved'
      ? 'A client wrapper/source reference exists, but the full current component/route scan found no action control call site. This is a source classification only; it does not claim physical unavailability or runtime acceptance.'
      : row.clientReferenceAliases?.length
        ? `Current callable references and the reviewed client wrapper aliases (${row.clientReferenceAliases.join(', ')}) are statically recorded; the service and mount anchors bind the path, without proving rendered availability or usability.`
        : 'Current client identifiers and callable strings are recorded for source traceability; this does not prove that a control is rendered, enabled, or usable.',
  };
  if (row.classification === 'genuinely-unserved' && uiReferences.length > 0) {
    throw new Error(`${row.exportName} has a component/route reference; revisit the unserved classification`);
  }
}
for (const row of sourceInventoryDeltaReviews) {
  const scan = clientReferenceScans.get(row.exportName);
  row.clientCallTrace = {
    status: scan.identifierOccurrences.some(reference => /^(?:src\/components|src\/routes)\//.test(reference.path))
      ? 'source-service-and-component-route-references' : 'service-path-source-reviewed; component-reference-unverified',
    sourceTreeSha256: clientSource.sha256,
    identifierReferenceCount: scan.identifierOccurrences.length,
    exactQuotedReferenceCount: scan.quotedOccurrences.length,
    sourceReferences: scan,
    interpretation: 'Client source references are statically recorded and the product path is source-reviewed; no claim is made that the control is rendered, enabled, or usable in a running game.',
    sourceAnchorIds: row.productPath.sourceAnchorIds,
  };
}
const maliadesStubText = ['maliades.clientMediumStub', 'maliades.clientShortStub'].map((id) => {
  const anchor = sourceAnchors.find(item => item.id === id);
  const text = require('node:fs').readFileSync(resolve(productSourceRoot, anchor.path), 'utf8');
  return text.split(/\r?\n/).slice(anchor.startLine - 1, anchor.endLine).join('\n');
}).join('\n');
if (/httpsCallable\s*\(/.test(maliadesStubText) ||
    !maliadesStubText.includes('Maliades range choices are not available for this attack.')) {
  throw new Error('The Maliades client compatibility wrappers no longer match the reviewed no-network stub trace.');
}

const baselineMatrixHash = sha256(canonicalMatrixRaw);
const classificationRows = exportClassificationRows(canonicalMatrix, allDetailedReviews, clientReferenceScans,
  exportEvidence, pathToApp);
const sourceInventoryDeltaRows = sourceInventoryDeltaReviews.map(row => ({
  ...row,
  sourceEvidence: (() => {
    const evidence = exportEvidence.get(row.exportName);
    return { path: evidence.path, symbol: evidence.symbol, bindingKind: evidence.bindingKind,
      lines: [evidence.startLine, evidence.endLine], sha256: evidence.sha256 };
  })(),
  acceptanceCredit: 0,
  proofStatus: 'source-only supplemental current-export delta; no runtime or gameplay credit claimed',
}));
const classificationCounts = Object.fromEntries([...new Set(classificationRows.map(row => row.sourceClassification))]
  .sort().map(classification => [classification,
    classificationRows.filter(row => row.sourceClassification === classification).length]));
const currentOwnerRevision = sourceCommit();
const generatedAtRevision = execFileSync('git', ['rev-parse', 'HEAD'],
  { cwd: repositoryDirectory, encoding: 'utf8' }).trim();
const artifact = {
  schemaVersion: 1,
  sourceBinding: {
    ownerRevision: currentOwnerRevision,
    sourceCommit: sourceCommit(),
    generatedAtRevision,
    functionsSource,
    clientSource,
    buildArtifactsIncluded: false,
    runtimeChecks: 'not run',
    scope: 'Current source only. No Functions rebuild, browser, native, emulator, HTTP, or gameplay request was run for this annotation snapshot.',
  },
  coverageAccounting: {
    baselineCallableExports: canonicalMatrix.accounting.callableExports,
    annotatedCallables: reviewed.length,
    supplementalSourceReviewedCallables: supplementalSourceReviews.length,
    endingsShardSourceReviewedCallables: endingSourceReviews.length,
    workspaceShardSourceReviewedCallables: workspaceSourceReviews.length,
    demoShardSourceReviewedCallables: demoSourceReviews.length,
    sourceReviewedCanonicalCallableRows: allDetailedReviews.filter(row => canonicalMatrix.actions.some(action => action.exportName === row.exportName)).length,
    sourceInventoryDeltaCallableRows: sourceInventoryDeltaReviews.length,
    totalDetailedActionContractReviews: allDetailedReviews.length,
    callableRowsWithExplicitUnresolvedContractFields: Math.max(0, canonicalMatrix.accounting.callableExports - allDetailedReviews.filter(row => canonicalMatrix.actions.some(action => action.exportName === row.exportName)).length),
    remainingCallableRowsNotReviewed: Math.max(0, canonicalMatrix.accounting.callableExports - allDetailedReviews.filter(row => canonicalMatrix.actions.some(action => action.exportName === row.exportName)).length),
    baselineRoleIdentities: canonicalMatrix.accounting.roles,
    baselineCallableRoleCells: canonicalMatrix.actions.length * canonicalMatrix.roles.length,
    callableRoleCellsReviewed: 0,
    gameplayAcceptanceCredit: 0,
    canonicalSnapshotPath: 'docs/PC10_ACTION_ROLE_MATRIX.json',
    canonicalSnapshotSha256: baselineMatrixHash,
    canonicalSnapshotModified: false,
    clarification: 'The canonical 232-callable and 42-role generator snapshot is preserved. The 20 primary annotations, 6 Scout reviews, and three exact source shards cover its 232 callable contracts at the source-description layer. Role cells, actual usability, browser/native gameplay acceptance, and physical-play evidence remain uncredited. One additional transferWarriorCargo source export is recorded separately when present; it is not inserted into the frozen snapshot.',
    explicitPc11GuidanceGaps: [],
  },
  exportClassification: {
    counts: {
      sdkExports: classificationRows.length,
      callableExports: classificationRows.filter(row => row.runtimeKind === 'callable').length,
      scheduleExports: classificationRows.filter(row => row.runtimeKind === 'schedule').length,
      backgroundExports: classificationRows.filter(row => row.runtimeKind === 'background').length,
    },
    sourceClassificationCounts: classificationCounts,
    countsBasis: 'The canonical snapshot retains its 241 SDK export / 232 callable / 3 schedule / 6 background census and the generator verifies those bindings against the selected product source. A supplemental transferWarriorCargo row is recorded separately when that named export exists; this static generation does not inspect a current Functions build or SDK endpoint metadata.',
    meaning: 'Every callable and noninteractive export in the preserved canonical snapshot has a source classification row. The 232 baseline callable rows have explicit source contract reviews; a current transferWarriorCargo source delta is recorded outside that frozen snapshot when present. Static references do not prove rendering, enablement, runtime eligibility, or usability. No role cells or acceptance status are changed.',
    operationBoundary: 'The 20 primary annotations, 6 Scout reviews, and 206 endings/workspace/demo shard rows trace all 232 baseline callable actors, requirements, costs, consequences, blockers, next actors, and guidance against current source. Source classifications provide zero role-cell, runtime usability, human/physical, or gameplay acceptance credit. The additional Warrior cargo endpoint is maintained as a separate current-source delta until the canonical snapshot is regenerated by its owner.',
    physicalBoundary: 'No physical/human gameplay gap is inferred from source references. Human device and physical play evidence remain unclaimed.',
    rows: classificationRows,
  },
  annotationPolicy: {
    classifications: ['served-ui-path', 'read-projection-support', 'legacy/deprecated-internal-compatibility',
      'external/manual-only', 'genuinely-unserved', 'client-source-reference-unverified',
      'no-client-reference-unclassified', 'legacy-deprecated', 'external-manual-only',
      'automatic-scheduled', 'background-trigger'],
    clientTraceLimit: 'A source-tree scan and import/call-site trace do not prove a rendered control is visible or usable. No absence claim is a gameplay acceptance claim.',
    anchorPolicy: 'Every reviewed actor, requirement, cost, consequence, blocker, next-actor and guidance summary refers to a top-level source declaration or export binding with line ranges and a full-file SHA-256 hash.',
    privacy: 'No private source text, secret player values, hidden result payloads, or credentials are copied into this artifact.',
  },
  sourceAnchors,
  annotations: reviewed,
  supplementalSourceReviews,
  actionSourceReviews: [...endingSourceReviews, ...workspaceSourceReviews, ...demoSourceReviews],
  sourceReviewShards: { endings: endingSourceReviews, workspaces: workspaceSourceReviews, demo: demoSourceReviews },
  sourceInventoryDeltas: sourceInventoryDeltaRows,
};
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);

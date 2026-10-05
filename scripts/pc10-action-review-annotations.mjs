import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
    exportName: 'submitWolfSupplySabotage', classification: 'external/manual-only',
    productPath: { status: 'facilitator-receipt-only-no-member-action-control', sourceAnchorIds: ['supply.receiptUi', 'supply.otherWolfControls'] },
    actor: { family: 'active Wolf Agent or Wolf Cult with the exact assigned cover role and its eligible shuttle', identities: ['wolf-agent', 'wolf-cult'], sourceAnchorIds: ['supply.handler', 'supply.authorization'] },
    requirements: { summary: 'Requires an active gameplay cycle, one unused Wolf action for that cycle, actor-only Wolf loyalty, matching assigned cover, an active cover-owned shuttle with positive selected cargo, and a valid facilitator census. A Press cover also requires the station to be enabled and held by this actor.', sourceAnchorIds: ['supply.handler', 'supply.authorization', 'supply.calculation', 'supply.request'] },
    costs: { summary: 'Destroys floor(current selected cargo / 2) from the chosen cover-owned shuttle; cargo of one loses zero units but must be positive. The cycle’s Wolf action slot is consumed only after validation succeeds.', sourceAnchorIds: ['supply.handler', 'supply.calculation'] },
    consequences: { summary: 'The server updates shuttle cargo and adds exactly two suspicion to the private loyalty/census, stores the private clue and action receipt, and creates a pending facilitator alert. The alert’s clue details remain in the private server/Gm path.', sourceAnchorIds: ['supply.handler', 'supply.calculation'] },
    blockers: { summary: 'Stale cycle, malformed or mismatched loyalty/census, replacement/escape, inactive or wrong cover, unavailable shuttle, empty cargo, duplicate same-cycle Wolf action, or inconsistent alert history rejects before a fresh action commits.', sourceAnchorIds: ['supply.handler', 'supply.authorization', 'supply.calculation', 'supply.request'] },
    nextActor: { summary: 'The facilitator receives the pending private hacking alert and must acknowledge that exact alert; only after acknowledgement does the server publish an actor-free player notice.', sourceAnchorIds: ['supply.handler', 'supply.alertAcknowledgement'] },
    clientCallTrace: { status: 'no-current-client-call-found', sourceTreeSha256: null, identifierReferenceCount: 0, interpretation: 'The member panel currently wires intelligence and homing-beacon actions, not this callable. The GmConsole renders the supply-sabotage receipt after a committed action; it is not the initiating control. The client-source hash binds the no-member-call scan.', sourceAnchorIds: ['supply.otherWolfControls', 'supply.receiptUi'] },
    guidance: { status: 'facilitator-receipt-only', summary: 'The existing GM console explains committed supply loss and clue receipt. No current member-side supply-sabotage action control or pre-action guidance was located.', sourceAnchorIds: ['supply.receiptUi', 'supply.otherWolfControls'] },
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
    requirements: { summary: 'Requires a session ID and the prior authenticated member identity. Active recovery reconciles ordinary membership and presence; a closed session uses the dedicated read-only current-member history fetch rather than restoring a seat.', sourceAnchorIds: ['auth.resume', 'auth.resumeClient', 'auth.closedHistoryClient', 'auth.appRecovery'] },
    costs: { summary: 'No in-game resources or gameplay action slots are spent.', sourceAnchorIds: ['auth.resume', 'auth.closedHistoryClient'] },
    consequences: { summary: 'Active resume restores the current authorized member view. Closed-session history is fetched separately into ephemeral client state and does not rejoin, reclaim a seat, or refresh presence.', sourceAnchorIds: ['auth.resume', 'auth.closedHistoryClient', 'auth.appRecovery'] },
    blockers: { summary: 'Missing/unauthorized prior member identity, kicked state, conflicting membership, malformed session authority, or stale identity/group reply rejects recovery.', sourceAnchorIds: ['auth.resume', 'auth.closedHistoryClient'] },
    nextActor: { summary: 'The recovered member continues from the server-entitled current projection; no game actor is advanced by resume.', sourceAnchorIds: ['auth.resumeClient', 'auth.closedHistoryClient'] },
    clientCallTrace: { status: 'current-lifecycle-service-call', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'App invokes recovery through sessionService. Closed history then makes one separate getCurrentMemberSession read only when its authenticated actor/group snapshot remains current.', sourceAnchorIds: ['auth.appRecovery', 'auth.resumeClient', 'auth.closedHistoryClient'] },
    guidance: { status: 'recovery-state-guidance', summary: 'The application resumes session state in the background; the closed member history fetch is a recovery path rather than a game action control.', sourceAnchorIds: ['auth.appRecovery', 'auth.closedHistoryClient'] },
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
    requirements: { summary: 'Requires an attached current session member; the server rechecks current identity and role/seat authority and binds GM presence to its live instance when applicable.', sourceAnchorIds: ['auth.presence', 'auth.presenceClient'] },
    costs: { summary: 'No game resource, cycle, or role-action cost; it is a periodic presence update.', sourceAnchorIds: ['auth.presence', 'auth.presenceClient'] },
    consequences: { summary: 'Refreshes presence/last-seen state for the existing member and current GM instance when applicable.', sourceAnchorIds: ['auth.presence'] },
    blockers: { summary: 'Lost member identity, kicked/stale actor, mismatched role/seat, or invalid GM instance prevents an unauthorized refresh.', sourceAnchorIds: ['auth.presence'] },
    nextActor: { summary: 'No game actor is advanced; App schedules the next heartbeat while the session remains active.', sourceAnchorIds: ['auth.appRecovery', 'auth.presenceClient'] },
    clientCallTrace: { status: 'background-lifecycle-caller', sourceTreeSha256: null, identifierReferenceCount: null, interpretation: 'App starts and clears the heartbeat with session lifecycle state; this is not a player action control.', sourceAnchorIds: ['auth.appRecovery', 'auth.presenceClient'] },
    guidance: { status: 'not-a-player-action', summary: 'No contextual action hint is shown for the background presence heartbeat.', sourceAnchorIds: ['auth.appRecovery', 'auth.presence'] },
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

const ALL_ANCHOR_IDS = new Set(ANCHORS.map(([id]) => id));
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
  await visit(resolve(repositoryDirectory, root));
  return result.sort((a, b) => a.localeCompare(b));
}

async function bindSourceTree(root) {
  const paths = await sourceFiles(root);
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(relative(resolve(repositoryDirectory, root), path).replaceAll('\\', '/'))
      .update('\0').update(await readFile(path));
  }
  return { fileCount: paths.length, sha256: hash.digest('hex') };
}

async function resolveAnchors() {
  const output = [];
  for (const [id, relativePath, symbol] of ANCHORS) {
    const source = await readFile(resolve(repositoryDirectory, relativePath), 'utf8');
    const filePath = resolve(repositoryDirectory, relativePath);
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
    { cwd: repositoryDirectory, encoding: 'utf8' }).trim();
}

async function scanClientReferences(names) {
  const paths = await sourceFiles('src');
  const references = new Map(names.map(name => [name, { identifierOccurrences: [], quotedOccurrences: [] }]));
  for (const path of paths) {
    const text = await readFile(path, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const [name, value] of references) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const identifier = new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`, 'g');
      const quoted = new RegExp(`(['\"])${escaped}\\1`, 'g');
      lines.forEach((line, index) => {
        const identifierMatches = [...line.matchAll(identifier)];
        const quotedMatches = [...line.matchAll(quoted)];
        for (let occurrence = 0; occurrence < identifierMatches.length; occurrence += 1) {
          value.identifierOccurrences.push({ path: relative(repositoryDirectory, path).replaceAll('\\', '/'), line: index + 1 });
        }
        for (let occurrence = 0; occurrence < quotedMatches.length; occurrence += 1) {
          value.quotedOccurrences.push({ path: relative(repositoryDirectory, path).replaceAll('\\', '/'), line: index + 1 });
        }
      });
    }
  }
  return references;
}

const [functionsSource, clientSource, sourceAnchors, canonicalMatrixRaw] = await Promise.all([
  bindSourceTree('functions/src'), bindSourceTree('src'), resolveAnchors(),
  readFile(resolve(repositoryDirectory, 'docs/PC10_ACTION_ROLE_MATRIX.json'), 'utf8'),
]);
const clientReferenceScans = await scanClientReferences(REQUIRED_NAMES);
const canonicalMatrix = JSON.parse(canonicalMatrixRaw);
if (canonicalMatrix.actions.length !== 232 || canonicalMatrix.roles.length !== 42) {
  throw new Error('The canonical action/role matrix snapshot changed; this sidecar must not regenerate or replace it.');
}
if (JSON.stringify(reviewed.map(row => row.exportName)) !== JSON.stringify(REQUIRED_NAMES)) {
  throw new Error('Reviewed annotation row set does not match the explicit bounded scope.');
}
for (const row of reviewed) {
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
const maliadesStubText = ['maliades.clientMediumStub', 'maliades.clientShortStub'].map((id) => {
  const anchor = sourceAnchors.find(item => item.id === id);
  const text = require('node:fs').readFileSync(resolve(repositoryDirectory, anchor.path), 'utf8');
  return text.split(/\r?\n/).slice(anchor.startLine - 1, anchor.endLine).join('\n');
}).join('\n');
if (/httpsCallable\s*\(/.test(maliadesStubText) ||
    !maliadesStubText.includes('Maliades range choices are not available for this attack.')) {
  throw new Error('The Maliades client compatibility wrappers no longer match the reviewed no-network stub trace.');
}

const baselineMatrixHash = sha256(canonicalMatrixRaw);
const artifact = {
  schemaVersion: 1,
  sourceBinding: {
    ownerRevision: '9681f7aad0451f125dad4b2296f80ebe2b3330cc',
    sourceCommit: sourceCommit(),
    functionsSource,
    clientSource,
    buildArtifactsIncluded: false,
    runtimeChecks: 'not run',
    scope: 'Current TypeScript/JavaScript source only. No Functions rebuild, browser, native, emulator, HTTP, or gameplay request was run for this annotation snapshot.',
  },
  coverageAccounting: {
    baselineCallableExports: canonicalMatrix.accounting.callableExports,
    annotatedCallables: reviewed.length,
    remainingCallableRowsNotReviewed: canonicalMatrix.accounting.callableExports - reviewed.length,
    baselineRoleIdentities: canonicalMatrix.accounting.roles,
    baselineCallableRoleCells: canonicalMatrix.actions.length * canonicalMatrix.roles.length,
    callableRoleCellsReviewed: 0,
    gameplayAcceptanceCredit: 0,
    canonicalSnapshotPath: 'docs/PC10_ACTION_ROLE_MATRIX.json',
    canonicalSnapshotSha256: baselineMatrixHash,
    canonicalSnapshotModified: false,
    clarification: 'The canonical generator snapshot is preserved. Its unresolved inConsoleGuidance sentinel is not treated here as proof that every remaining action is a PC11 guidance gap; only the reviewed rows below have an explicit source-traced guidance status. Unreviewed rows remain unreviewed.',
    explicitPc11GuidanceGaps: [{
      exportName: 'submitWolfSupplySabotage',
      status: 'server-action-not-surfaced-to-member-ui',
      summary: 'The current member panel wires other Wolf actions while the GM console presents this action’s receipt. If this callable is later exposed as a member control, add adjacent requirements, selected-cargo loss and next-step guidance; this source pass does not claim that UI flow complete.',
      sourceAnchorIds: ['supply.handler', 'supply.otherWolfControls', 'supply.receiptUi'],
    }],
  },
  annotationPolicy: {
    classifications: ['served-ui-path', 'legacy/deprecated-internal-compatibility', 'external/manual-only', 'genuinely-unserved'],
    clientTraceLimit: 'A source-tree scan and import/call-site trace do not prove a rendered control is visible or usable. No absence claim is a gameplay acceptance claim.',
    anchorPolicy: 'Every reviewed actor, requirement, cost, consequence, blocker, next-actor and guidance summary refers to top-level source declaration line ranges and full-file SHA-256 hashes.',
    privacy: 'No private source text, secret player values, hidden result payloads, or credentials are copied into this artifact.',
  },
  sourceAnchors,
  annotations: reviewed,
};
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);

# PC09 test-change report

PC09 adds checks for server-owned results, real costs/deadlines, current authority,
and private versus entitled audiences. New behavior has separate permanent failing-test
commits before implementation. This table covers every changed test file and new
ordinary gameplay driver against the settled PC08 audit baseline `b36119e9`.

Existing tests remain enabled. No test file is deleted and no test is deliberately skipped.

Exact candidate CI `37254007624` at `c8173d91` passed 3,290 unit checks and
failed two AppHeader assertions that still expected PC08 progress for the
current release. Test-only repair `8f6227da` expects current 703/751 progress
and adds an explicit retained 0.5.67/654 snapshot assertion. Existing bounded
scroll, keyboard, display-copy and all older history checks remain enabled.
All 45 AppHeader tests and changed-file lint pass locally. The original CI
failure log is preserved; a new exact candidate run follows this correction.

The final render gate reproduced an oversized landing import graph under the
existing byte budgets. Route-only ship/governance modules and the joined-session
crisis report now load at their actual entry points. The same reviewer then
reproduced a rejected module download removing the entire app. Separate red
commit `6348e8e4` preserves all four failures before product repair `779c3081`;
the tests require a usable keyboard Back link, retained identity and a routed
console after crisis-report failure. The typed fixture correction `d15f21f8`
adds only the required join code; its earlier build failure remains in the log.
The prepared browser driver covers three pending-load cases and twelve actual
module-download rejections at phone, desktop and landscape sizes. A preserved
geometry failure led to the existing 44-pixel action style and readable notice
placement. The initial accessible-name correction accepts only the existing
CSS arrow and uppercase rendering. Every geometry, font, overflow, keyboard,
identity and page-error assertion remains enabled. Prepared results do not
establish authenticated gameplay.

The 0.5.68 metadata check reproduced two stale historical assertions: the live
catalog was still required to total 654, and P605a was required to stay incomplete
after its explicit activation. Separate test-only commit `93d8853c` retains the
PC07/PC08 49-ID release coverage, 605/654 historical totals and P605a exclusion
from those releases. The unchanged 654 completed IDs outside PC09 are still
counted. A new exact PC09 check requires all 49 IDs, 0.5.68 release references,
703 done/six partial/42 missing and the explicit P605a activation evidence.
The original two failures remain in `current-metadata-native.log`; all 44
metadata/history checks pass in the separately named corrected log. No prior
test case or historical boundary was removed.

The strict positive driver's future raw-output flag now correctly labels its
retained ephemeral UID/session identifiers. The already captured passing raw
result remains unchanged; its identity-free allowlisted summary documents the
original inaccurate flag. This metadata correction changes no gameplay or
assertion and needs no repeat of the complete authenticated proof.
Specific fixture repairs preserve the original assertions: pressure uses the current
`hold` value; elected President fixtures include current office authority; Voyage admission
includes its actual current GM ruling; the old force-field fixture includes the canonical
pursuit snapshot; a no-loss Ace source snapshot stays equivalent rather than inventing
an inventory revision; the DRADIS replacement-session fixture uses its own visible ship.
Client mocks include new subscriptions and wait for committed responses before checking
text. The PC08 release test names its actual runtime commit, not its documentation closeout.

Gameplay harness repairs follow real setup/subscriptions. Independent Press joins the live
session after the complete explicit core loyalty setup starts. EO/Ace recovery waits for
actual current browser authority. Optional empty lists are normalized for immutable receipt
comparison, while an empty survivor list remains meaningful. Real fighter capacity is
checked before Team advance; the two slots for callable plus browser rebuild remain
required. Failed runs stay failures and are never relabelled as a full acceptance pass
because earlier branch assertions completed.

The independent review repairs add discriminating regressions for five-outcome
Detector accuracy, current-cycle/current-actor receipt replay, semantic map
fingerprints, exact off-marker Doctor population, live election deadlines,
terminal election mutations, distinct office holders and queued discovery
epochs. The new `pc09VipHostHandlersCallable.test.ts` invokes both actual VIP
handlers with an explicitly simulated physical-visit input, and checks both
persisted receipts, private/public grant projections, one-use denial and exact
replay without another die or write.

Integration fixture corrections keep every existing behavioral assertion:
join/resume strict document mocks permit only the two new optional election
reads; current GM/App mocks include the new amnesty/VIP/arrest subscriptions;
delivered civil unrest includes the neutral `hold` choice; the read-only amnesty
reader is listed in the terminal-policy reader inventory; governance routes are
listed in return navigation inventory. A Rules denial diagnostic now narrows its
result union before displaying optional data, without changing the denial.
Regex escape and parameterized-test formatting corrections only satisfy ESLint.
The unchanged P602 prepared driver still stops at its obsolete player `/roles`
fixture and earns no new browser return credit; the corrected real Auth election
driver will cover the new governance return controls separately.

The public attack Rules regression additionally proves authorized observation of absence before the first server declaration, with outsider, disconnected-member, creation, listing and present-document privacy denials retained. The positive driver waits for and verifies all three actual conduct acknowledgements; an admission failure now saves its own diagnostic and closes its browsers. No countdown is bypassed.

The same review's ninth finding adds actual Doctor→ordinary next declaration
and Doctor→P continuation tests, plus tampered audit/counter rejection. These
preserve the immutable finalization audit/archive and verify the separate
post-finalization revision binding. `PresidentialOffice.test.tsx` now activates
both visible Back links with Enter and checks chooser navigation and retained
identity. The new authenticated P producer driver uses ordinary movement,
source windows, staging, source choices, finalization and automatic restaging;
the return/build driver records genuine depleted-store/riot blockers rather
than claiming a build.

The root composite driver pauses genuine browser networks during bulk setup
and verifies the same authenticated actors after recovery before gameplay.
Its optional `serializeFixtureCalls` mode serializes synthetic API commands and
keep-alive traffic and leaves real browser SDK calls independent; no failed
request is retried or hidden by that scheduler. Genuine browser actors renew
their own presence rather than receiving duplicate synthetic heartbeats.
All result, privacy, cost, capacity and browser-error assertions remain required.

The final build retry requires the exact original committed receipt, with no
count, material or revision change. Resuming setup browsers keeps their existing
documents alive instead of immediately reloading and overlapping three resume
requests; original UID/session/role, live projection and server state are still
required. Local App Check isolation tests keep production-provider controls.
The user-authorized Cycle 0 copy tests retain all other status meanings and
verify the Settings explanation disappears at Cycle 1. Earlier external test
logs were lost after reconnect; current artifact availability is recorded in
the execution record, without changing historical pass/failure outcomes.

Strict typing corrections omit a missing optional phase marker instead of
assigning `undefined`, and use an anchored accessible-name matcher for Testing
Library's keyboard Back query. All 13 relevant assertions still pass. A distinct
ordinary Quellon Engineer becomes Doctor in the composed driver, preserving the
already-assigned Gorgoneion Captain. The new Commander driver retains actual
address/offer, privacy, explicit ruling, expiry, dial, once-per-cycle and four
viewport checks. Its diagnostic trace preserves transient failures and source/
runtime identities; an unfinished run remains unfinished.

| Test or gameplay driver | Change | Reason |
|---|---|---|
| `src/config/implementationProgress.test.ts` | Changed | Preserve historical PC07/PC08 release allocation and visualization exclusion after the owner activated P605a; retain the 654 non-PC09 completed-ID count and add exact 49-ID/703/0.5.68 current release coverage. The old live-catalog assertions are recorded as two failing checks before this separate test-only correction. |
| `src/components/AegisFighterWingLaunchPanel.test.tsx` | Changed | Preserve independent Alpha/Bravo launch, explicit pass and active-range Ace permission controls; reproduce absent/resolved/foreign/old-cycle reads and delayed replies after resolution using real authority fixtures. The async enabled-state assertion waits for its committed view. |
| `src/components/TurnPhaseCoordinator.attackLock.test.tsx` | Added | Reproduce repeated normal-clock promotion during a current declared attack, cancel pending promotion, and preserve ordinary behavior for resolved, foreign-session and old-cycle views. |
| `src/components/TurnPhaseCoordinator.test.tsx` | Changed | Add the existing public audience transport mock; preserve the original Team-deadline and emergency-pause assertions. |
| `scripts/test-pc08-composed-attack-http.mjs` | Changed | Preserve the historical attack checks; add actual P605a entitled committed-row/local-contact comparisons, private preparation denial, all three real waiver acknowledgements, keyboard, responsive and recovery checks. Historical failures stay labelled. |
| `scripts/pc09-ordinary-return-rebuild-positive-proof.mjs` | Added | Reconstruct the lost finite positive fixture with explicit full-runtime verification, disclosed current-GM +1 supplies, source-backed budgets for both possible Storage losses, a normal Blacksmith fuel/flight/paid-console-repair contingency, two real durable losses, surviving Station return, paid drone repair, exact HTTP receipt retry, a separate Wing UI build and actual entitled DRADIS result rows; preserve all cost/capacity/error assertions. |
| `src/components/AppHeader.test.tsx` | Changed | Explain Cycle 0 CIC authentication in Settings and remove the note after real start state; preserve existing header navigation and connection states. Also preserve the two original CI failures while updating current PC09 progress and explicitly retaining the 0.5.67/654 historical release assertion; all 45 focused checks pass.  |
| `src/components/ConnectionIndicator.test.tsx` | Changed | Match the authorized Cycle 0 visible and accessible wording while retaining all other statuses. |
| `src/components/PresidentialElectionWorkspace.test.tsx` | Added | Show the approved VP fallback/vacancy explanation and preserve the keyboard-accessible election return route. |
| `src/lib/firebase.emulatorIsolation.test.ts` | Added | Prove explicit local mode does not initialize remote attestation; production still initializes and requires its key. |
| `src/routes/RoleBrief.test.tsx` | Changed | Keep the current actor on a fail-closed waiting screen during private hydration and reject absent, failed or foreign brief results. |
| `functions/src/approachingVesselResponse.test.ts` | Added | Keep the GM’s real/trap response private and validate explicit permitted timing/response choices. |
| `functions/src/approachingVesselResponseCallable.test.ts` | Added | Keep the GM’s real/trap response private and validate explicit permitted timing/response choices. |
| `functions/src/arrestCaseDispositionCallable.test.ts` | Added | Check private posse arithmetic, explicit current attendance, next-Team deadline and once-only disposition. |
| `functions/src/arrestPosseResolutionCallable.test.ts` | Added | Check private posse arithmetic, explicit current attendance, next-Team deadline and once-only disposition. |
| `functions/src/arrivalPressure.test.ts` | Changed | Preserve L/P pressure and the printed Fortress minimum of two Battlestations plus 25 other capacity. |
| `functions/src/crisisCallable.test.ts` | Changed | Require a current delivery pressure choice and preserve legal outcomes, automatic capital and exact retries. |
| `functions/src/jumpCallable.test.ts` | Changed | Bind failed-jump consequence/destination before resolution and record actual navigation/damage. |
| `functions/src/maintenanceCallable.test.ts` | Changed | Keep ordinary maintenance costs and consume only the current one-use hosted reroll. |
| `functions/src/memberSession.test.ts` | Changed | Deliver new entitled workspace facts without expanding access to private state. |
| `functions/src/pc09SpecialistMechanics.test.ts` | Added | Check Detector result ownership, private arrest arithmetic, hosted benefit and exact Fighter Ace receipts. |
| `functions/src/pc09SpecialistSurface.test.ts` | Added | Check Detector result ownership, private arrest arithmetic, hosted benefit and exact Fighter Ace receipts. |
| `functions/src/presidentWorkspaceCallable.test.ts` | Changed | Check printed timing, elected office, one-capital Coordination visit and bounded authority. |
| `functions/src/presidentialElection.test.ts` | Added | Check frozen procedure, eligible voter weights, private ballots and once-only auditable office transition. |
| `functions/src/presidentialElectionCallable.test.ts` | Added | Check frozen procedure, eligible voter weights, private ballots and once-only auditable office transition. |
| `functions/src/teamAnnouncements.test.ts` | Added | Deliver binding decisions once at the next Team start and retain pending decisions across reconnect. |
| `functions/src/voyageAdmissionCallable.test.ts` | Changed | Require the current real-vessel ruling and preserve once-only people/motivated-role activation. |
| `functions/src/wolfAgentDetectorCallable.test.ts` | Added | Check built-device readiness, three private server-randomized uses per cycle, fourth denial and truth separation. |
| `functions/src/wolfAttackAftermath.test.ts` | Added | Check exact casualties, Doctor costs, Warrior dice, Scrap threshold, craft/host limits and complete/safe receipts. |
| `functions/src/wolfAttackAftermathCallable.test.ts` | Added | Check exact casualties, Doctor costs, Warrior dice, Scrap threshold, craft/host limits and complete/safe receipts. |
| `functions/src/wolfAttackAudience.test.ts` | Changed | Check entitled combat facts, shifted targets, complete misses and rejection of private extra fields. |
| `functions/src/wolfAttackDeclaration.test.ts` | Added | Check original return-manifest defects, canonical survivors, source/group authority and bounded P/Commander exceptions. |
| `functions/src/wolfAttackDeclarationCallable.test.ts` | Changed | Check original return-manifest defects, canonical survivors, source/group authority and bounded P/Commander exceptions. |
| `functions/src/wolfAttackPreparationCallable.test.ts` | Changed | Check source-backed composition and reject manual reconstruction of automatically repeated survivors. |
| `functions/src/wolfAttackRangeCallable.test.ts` | Changed | Check destroyed-AEGIS/departed-holder progression, durable losses, mixed totals and current-attack/Ace retries. |
| `functions/src/wolfAttackWindowCallable.test.ts` | Changed | Bind current selected group and source pressure to each legal due attack window. |
| `functions/src/wolfBoardingCallable.test.ts` | Changed | Check canonical boarding roster and reject old-attack crew retries while retaining exact current retries. |
| `functions/src/wolfCombatMath.test.ts` | Changed | Check printed immunity, surviving-wing bonus, damage and canonical pre-range Ace consequences. |
| `functions/src/wolfCommanderPowersCallable.test.ts` | Added | Check group-local dial, address request binding, target adjustments and explicit private/public amnesty choices. |
| `functions/src/wolfCommanderTargetingCallable.test.ts` | Changed | Check group-local dial, address request binding, target adjustments and explicit private/public amnesty choices. |
| `functions/src/wolfPreRangeReplay.test.ts` | Added | Replay Commander/Ace choices in revision order; bind full snapshots and reject forged future mutations. |
| `functions/src/wolfThreatProtocol.test.ts` | Added | Check group-local pursuit and distinct L/M/P source, dial, address and amnesty policies. |
| `scripts/deployment-targets.pc08.test.mjs` | Changed | Pin the historical PC08 baseline to its actual runtime deployment rather than later documentation. |
| `scripts/deployment-targets.pc09.test.mjs` | Added | Check exact runtime consumers, new/re-exported endpoints, pure-helper exclusion and fail-closed source drift. |
| `scripts/pc07-authenticated-session.test.mjs` | Added | Join real browsers into configured core seats without authentication injection or duplicate assignments. |
| `scripts/pc07-explicit-loyalty-setup.test.mjs` | Added | Build a complete ordinary GM-authored optional loyalty setup with distinct occupied holders. |
| `scripts/pc09-aftermath-proof.test.mjs` | Added | Normalize optional empty receipt lists, retain required survivors and preflight two real build slots before Team advance. |
| `scripts/pc09-deduction-prelude.test.mjs` | Added | Keep the ordinary reusable deduction prelude bound to actual private calculation and actors. |
| `scripts/test-pc09-aftermath-branches-http.mjs` | Added | Run the bounded normal Auth/HTTP/browser scenario named by this driver, disclose setup/clock facts, and preserve labelled failure evidence. |
| `scripts/test-pc09-authenticated-recovery.emulator.mjs` | Added | Run the bounded normal Auth/HTTP/browser scenario named by this driver, disclose setup/clock facts, and preserve labelled failure evidence. |
| `scripts/test-pc09-composed-attack-http.mjs` | Added | Run the bounded normal Auth/HTTP/browser scenario named by this driver, disclose setup/clock facts, and preserve labelled failure evidence. |
| `scripts/test-pc09-crisis-election-http.mjs` | Added | Run the bounded normal Auth/HTTP/browser scenario named by this driver, disclose setup/clock facts, and preserve labelled failure evidence. |
| `scripts/test-pc09-deduction-prelude-http.mjs` | Added | Run the bounded normal Auth/HTTP/browser scenario named by this driver, disclose setup/clock facts, and preserve labelled failure evidence. |
| `scripts/test-pc09-dradis-recovery-http.mjs` | Added | Run the bounded normal Auth/HTTP/browser scenario named by this driver, disclose setup/clock facts, and preserve labelled failure evidence. |
| `scripts/test-pc09-executive-workspace-http.mjs` | Added | Run the bounded normal Auth/HTTP/browser scenario named by this driver, disclose setup/clock facts, and preserve labelled failure evidence. |
| `scripts/test-pc09-deferred-ship-route-browser.mjs` | Added | Verify landing module isolation, three pending-load exits and twelve actual module-rejection fallbacks; retain 44-pixel Back/reload, readable notice, monospace/font, overflow, keyboard, identity and page-error checks. Explicit prepared offline fixture; no authenticated gameplay claim. |
| `scripts/test-pc09-scene-layout.mjs` | Added | Check all five actual prepared scene presenters at eight viewport/motion combinations, keyboard/focus, 44-pixel controls, fonts, Back and zero Firebase writes; presentation evidence only. |
| `scripts/test-pc09-voyage-hooks-http.mjs` | Added | Run the bounded normal Auth/HTTP/browser scenario named by this driver, disclose setup/clock facts, and preserve labelled failure evidence. |
| `scripts/test-pc09-wolf-agent-detector-http.mjs` | Added | Run the bounded normal Auth/HTTP/browser scenario named by this driver, disclose setup/clock facts, and preserve labelled failure evidence. |
| `src/PC09ReviewScene.test.tsx` | Added | Check five isolated local steps, privacy labels, actual controls and visible parent return without live writes. |
| `src/components/ArrestPosseCalculator.test.tsx` | Changed | Keep private calculation and explicit attendance/deadline resolution current and source-bound. |
| `src/components/ArrestPosseCalculatorResolution.test.tsx` | Added | Keep private calculation and explicit attendance/deadline resolution current and source-bound. |
| `src/components/EndeavourResearchPanel.test.tsx` | Changed | Connect the completed Detector through real research controls and truth-free private reports. |
| `src/components/ExtraShipCaptainWorkspace.test.tsx` | Changed | Connect charged Warrior salvage and current printed host/role behavior. |
| `src/components/JumpFailureAdjudicationPanel.test.tsx` | Changed | Make documented consequence/destination choices explicit and label the committed adjudication. |
| `src/components/Pc09SpecialistPresenters.test.tsx` | Added | Check accessible Detector/hosted/Ace controls with injected state and no prepared-scene session writes. |
| `src/components/PresidentWorkspace.test.tsx` | Changed | Check bounded President controls, automatic capital status, source-defined visit cost and prepared presenter callbacks. |
| `src/components/PresidentWorkspaceView.test.tsx` | Added | Check injected prepared President presentation without live session writes. |
| `src/components/ShuttleConsoleTemplate.test.tsx` | Changed | Connect ordinary Macaw/Boa collection and current repair facts through existing craft controls. |
| `src/components/TeamStartFormalAnnouncementsView.test.tsx` | Added | Show binding decisions only at the next Team start, separately from optional Press publication. |
| `src/components/WolfAttackAftermathActionPanel.test.tsx` | Added | Show entitled opportunities, clear costs, current eligibility and committed aftermath results. |
| `src/components/WolfAttackDradis.test.tsx` | Added | Render only authoritative entitled contacts/phase/effects and fence group/session/recovery privacy. |
| `src/components/WolfAttackGmAftermathView.test.tsx` | Added | Show complete private damage/casualty/salvage/repair receipt and the next genuine decision. |
| `src/components/WolfAttackStatusPanel.test.tsx` | Added | Show safe immediate results and remaining-threat facts without disclosing hidden composition. |
| `src/components/WolfCommanderAmnestyPanels.test.tsx` | Added | Show bounded current Commander dial/target/address/amnesty controls and explicit consequence choices. |
| `src/components/WolfCommanderCycleAttackDialPanel.test.tsx` | Added | Show bounded current Commander dial/target/address/amnesty controls and explicit consequence choices. |
| `src/components/WolfCommanderRangeTargetDialPanel.test.tsx` | Added | Show bounded current Commander dial/target/address/amnesty controls and explicit consequence choices. |
| `src/components/WolfRangeActionPanel.test.tsx` | Changed | Keep selectable EO actions distinct while retaining committed support in the one authoritative lock. |
| `src/lib/arrestCaseDispositionService.test.ts` | Added | Check private posse arithmetic, explicit current attendance, next-Team deadline and once-only disposition. |
| `src/lib/firestore.memberDiscoveryRecovery.test.ts` | Added | Hold fresh discovery until member/session confirmation; fence errors, cache, revocation and group changes. |
| `src/lib/firestore.test.ts` | Changed | Hydrate only new entitled office/election/Team facts and preserve private projection boundaries. |
| `src/lib/firestore.wolfAttackAudience.test.ts` | Changed | Compare exact fields independent of Firestore map order while rejecting private extras. |
| `src/lib/pdfFighterAceService.test.ts` | Added | Validate frozen permission/action schema and reject stale current-role/source/range receipts. |
| `src/lib/presidentWorkspaceService.test.ts` | Changed | Check printed timing, elected office, one-capital Coordination visit and bounded authority. |
| `src/lib/sessionService.test.ts` | Changed | Accept valid mixed-source EO and same-cycle Commander receipts while rejecting actor/cycle/attack drift. |
| `src/lib/vipHostService.test.ts` | Added | Validate one current GM-attested benefit and one-use reroll without inferring physical presence. |
| `src/lib/wolfAgentDetectorService.test.ts` | Added | Check built-device readiness, three private server-randomized uses per cycle, fourth denial and truth separation. |
| `src/lib/wolfAttackAftermathService.test.ts` | Added | Check exact casualties, Doctor costs, Warrior dice, Scrap threshold, craft/host limits and complete/safe receipts. |
| `src/routes/GmConsole.test.tsx` | Changed | Connect genuine crisis/election/attendance/visit decisions while keeping private records separate. |
| `src/routes/PresidentialOffice.test.tsx` | Added | Check the elected-office route, current authority and visible return to stations. |
| `src/routes/ReplacementRoleWorkspace.test.tsx` | Changed | Connect reused Comms/Militia and current Ace controls with location and parent return. |
| `src/routes/ShipConsole.test.tsx` | Changed | Connect EO maintenance, source permission and specialist controls with current and visitor authority. |
| `tests/rules/firestore.rules.test.ts` | Changed | Allow only exact entitled projections; deny ballots/truth/private receipts and all direct privileged writes. |
| `functions/src/civilUnrestResolutionCallable.test.ts` | Changed | Supply the explicit neutral `hold` delivery choice required by the current crisis transition while retaining the grievances-after-delivery assertion. |
| `functions/src/joinSessionCallable.test.ts` | Changed | Let the strict transaction mock read the two optional current-election documents as absent; unrelated unexpected reads still throw. |
| `functions/src/sessionResumeCallable.test.ts` | Changed | Let the strict transaction mock read the two optional current-election documents as absent; retain the original resume authority assertions. |
| `functions/src/pc09VipHostHandlersCallable.test.ts` | Added | Compose the actual GM visit and maintenance-reroll handlers, explicitly simulate the physical visit, and verify persisted receipts, grant privacy, current GM/cycle authority and once-only spending/dice. |
| `functions/src/pdfEscortWingState.test.ts` | Changed | Permit only the exact source-bound same-cycle P continuation, preserve durable fighter losses, and reject missing or forged repeat context and attack numbering. |
| `functions/src/terminalFreezePolicy.test.ts` | Changed | Classify the new read-only amnesty projection with existing terminal readers; gameplay mutation freeze coverage remains required. |
| `scripts/pc07-authenticated-session.mjs` | Changed | Support genuine browser joins into existing core seats and optional FIFO synthetic fixture traffic; real browser SDK traffic and failed requests remain observable. |
| `scripts/pc09-aftermath-proof.mjs` | Added | Share ordinary current-actor aftermath actions, Rules-enforced audience reads, exact receipt comparison and required two-slot build preflight; preserve missing-outcome blockers. |
| `scripts/pc09-browser-proof.mjs` | Added | Join through the visible waiver and normal Auth, track the actually loaded store module, and inspect retained actor/session, recovery, errors and viewport geometry without injecting authentication. |
| `scripts/pc09-deduction-prelude.mjs` | Added | Compose actual investigation, timed GM-attested visit, sabotage, private alert, public notice and arrest setup with complete explicit loyalty actors and disclosed simulated attendance. |
| `scripts/pc09-ordinary-return-rebuild-proof.mjs` | Added | Bind an immutable runtime and perform ordinary durable fighter loss, subsequent launch, canonical return and paid rebuild checks; the recorded depleted-store/riot run remains a failure. |
| `scripts/pc09-p-station-producer-auth-proof.mjs` | Added | Exercise actual navigation-produced P staging, declaration, source gates, finalization and automatic same-cycle continuation; do not seed attack state, dice, survivors or preparation. |
| `scripts/prompt-602-return-navigation.mjs` | Changed | Add President and election routes to the existing prepared return inventory; its obsolete earlier role fixture still blocks that prepared run and earns no new route credit. |
| `src/App.deferredLoading.test.tsx` | Added | Reject each of the four new lazy-module promises through the real App; require the route Back control or routed console to survive, keyboard return, retained session/player identity and no error escaping App. Four recorded failures precede the bounded error-boundary repair. |
| `src/App.test.tsx` | Changed | Mock the new read-only amnesty projection for the current session so existing App behavior checks run with the added subscription. |
| `src/config/returnNavigationContract.test.ts` | Changed | Cover both new governance routes in the existing visible-parent return contract. |
| `functions/src/pc09SpecialistMechanics.rangeRecovery.test.ts` | Added | Compose real Long range math with later Ace application, preserving destroyed-contact overkill while denying forged destruction, destroyed targets and noncanonical live Ace damage. |
| `src/lib/sessionSnapshotAuthority.combatRecovery.test.ts` | Added | Accept legitimate same-cycle attack closure/reopening only with a validated advancing phase revision; retain stale, missing, malformed and wrongly bound marker denials. |
| `scripts/test-pc09-threats-http.mjs` | Added | Join a real Commander browser, perform source-bound address/amnesty/dial choices, preserve private/public audience and once-per-cycle checks, and inspect actual endpoint/recovery/viewport results with disclosed deadline acceleration. |

The positive proof's initial article-name scoping was invalid because the
existing construction article is unnamed. Its final locator filters the actual
`article.aegis-craft` by the exact visible Alpha/Bravo heading. It preserves the
one-card assertion, full-capacity Bravo denial and the distinct Alpha build;
no `.first()` fallback or cost/capacity relaxation is used.

A later genuine first-attack Storage hit halved Refinery 124's remaining ration
stock before cycle 3. The failed run retained the full-ration assertion and
zero browser-error result. The disclosed pregame plan now adds exactly one
extra full ration to Dione/Refinery 124, enough to cover that single post-combat
halving. Both ordinary printed maintenance choices and all actual storage
losses remain; no post-combat GM top-up, repair or dice patch is introduced.

The strict positive driver also reuses its finalized ordinary battle for the
assigned P605a committed-result readout check: exact current local-contact row
filtering, actual public Rules read, unknown bearings, no invented geometry and
no opaque Wolf IDs. Its screenshot crops the entitled instrument. The separate
fresh DRADIS proof supplies recovery/revocation and eight viewport/motion cases;
this adds no gameplay feature or second prepared-state claim.

## Directly blocking deployment quota regression

New scripts/deploy-firebase-surfaces.test.mjs retains eight necessary deployment
contract cases: complete 216-name scope in at-most-ten groups, rejection of broad/
duplicate/malformed targets, exact pinned CLI controls, serial completion, stop
before later batches/Hosting on failure, explicit project validation and WIF/
artifact/strict-verifier workflow wiring. The production helper is
scripts/deploy-firebase-surfaces.mjs; CI executes these tests directly with Node.
No prior tests are removed, disabled, weakened or replaced. This release-only
repair follows the preserved actual 200-success/16-failure provider result;
player-facing source, 0.5.68 scope, budgets and permissions are unchanged.

A read-only compatibility check also exercised the existing explicit manual
full-deployment selector. The workflow preserves that original pinned CLI path
only for a workflow_dispatch containing the broad Functions selector; automatic
releases require the audited named-target batches. The eighth regression covers
this event boundary. No broad automatic fallback is introduced.

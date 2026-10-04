# PC09 test-change report

PC09 adds checks for server-owned results, real costs/deadlines, current authority,
and private versus entitled audiences. New behavior has separate permanent failing-test
commits before implementation. This table covers every changed test file and new
ordinary gameplay driver against the settled PC08 audit baseline `b36119e9`.

Existing tests remain enabled. No test file is deleted and no test is deliberately skipped.
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

| Test or gameplay driver | Change | Reason |
|---|---|---|
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
| `scripts/test-pc09-scene-layout.mjs` | Added | Check all five actual prepared scene presenters at eight viewport/motion combinations, keyboard/focus, 44-pixel controls, fonts, Back and zero Firebase writes; presentation evidence only. |
| `scripts/test-pc09-voyage-hooks-http.mjs` | Added | Run the bounded normal Auth/HTTP/browser scenario named by this driver, disclose setup/clock facts, and preserve labelled failure evidence. |
| `scripts/test-pc09-wolf-agent-detector-http.mjs` | Added | Run the bounded normal Auth/HTTP/browser scenario named by this driver, disclose setup/clock facts, and preserve labelled failure evidence. |
| `src/PC09ReviewScene.test.tsx` | Added | Check five isolated local steps, privacy labels, actual controls and visible parent return without live writes. |
| `src/components/AegisFighterWingLaunchPanel.test.tsx` | Changed | Show current named source-officer Ace permission alongside ordinary AEGIS fighter controls. |
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

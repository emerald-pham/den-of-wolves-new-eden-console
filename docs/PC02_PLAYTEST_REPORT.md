# PC02 playtest report — setup, fleet board, and continuity

**Build:** 0.5.52 candidate. **Solo review:** [Open the prepared PC02 scene](https://dow-new-eden-console.web.app/pc02-review.html). The scene uses real interface components with clearly marked synthetic states. It does not join or change a live session. Deployment and ordinary authorized play are separate checks below.

## New rule reading to review first

**PC02-A1 — a deliberately vacated core station stays vacant until facilitator action.** The Facilitator's Guide v1.1, printed p. 12, permits a facilitator to give a removed or late player another role and mentions extra ships. It does not define automatic takeover of a departed core station. Accordingly, **Leave Session** ends that member's authority and private projection while the game continues for others. A temporary connection loss keeps the same member's assignment for resume. The [assumptions log](PRODUCT_MILESTONE_ASSUMPTIONS.md#pc02-a1--departed-core-stations-remain-vacant-without-facilitator-rerole) records the alternatives and affected tests. This is an assumption for the owner to correct during review; it is not a new printed rule.

## One-sitting owner UI walkthrough

Open the review link above. Its six numbered tabs are the review path. Each tab can be revisited without changing a live game.

1. **Setup — yes/no:** Select **GM // authenticated**. Read the single facilitator checklist, including its two printed duties and setup readiness, then read the ground rules and core cycle. Use **Open assigned console**, inspect the labeled sample first action, and **Return to briefing**. The role lobby links lead to reversible local station previews. Can one facilitator and one arriving player find their next step?
2. **Waiver — yes/no:** Select **First arrival**, complete all three Code of Conduct checks, and continue. Choose **Just acknowledged**, **Before 72 hours**, then **At 72 hours** from **Waiver sample time**. Are the accepted and renewed-check states clear? The real same-device acknowledgement uses the exact 72-hour boundary; the selector only previews those states.
3. **Fleet board — yes/no:** Read Cycle 1, rations, alert, action, and the pending pursuit readout. It should say **Awaiting CIC handshake**. Switch **Review perspective** between player, Press, and authenticated GM. Is the six-field Cycle 0 Primary Status absent for non-GM and readable for GM?
4. **Press handoff — yes/no:** Select **Press Officer**, then **Press handoff**. Find survivor change, survivor transfer, purge, and President event entries in the private log. Type and publish a sample dispatch; it appears only in this local scene. Is editorial review distinct from publication?
5. **DRADIS — yes/no:** Compare **First contact**, **Repeat sweep**, and **After first sweep**. The repeat ping should leave the initial contact enlarged until its original sweep time passes; only then does normal size resume. Toggle **Crowded contacts** and expand names on a narrow screen. Can you read every expanded name beside its own return, with the label on the clearer left or right side? The minimized plot is a lower priority preview.
6. **Leave and reconnect — yes/no:** Choose several **Non-GM station** entries, then compare **Temporary disconnect** → **Resume same role** with **Open sample settings** → **Leave Session**. Does the former restore the role/private state and the latter vacate it while the other players' session remains active? Is Leave Session in Settings rather than the top of the screen?

## What changed and what is proved

| Area | Candidate behavior | Evidence boundary |
|---|---|---|
| Press | Committed population, evacuation, maintenance, purge, and existing President actions append stable private Press intake records. Only Press may read them; publication remains a separate authorized Press action. | Callable replay/authority tests, Firestore rules tests, local emulator rules run, and component tests. Live production writer behavior remains to be observed after deployment. |
| Session continuity | A deliberate non-GM departure clears that role, seat, and private projection without ending the session. A transient disconnect retains the assignment for the same member, and resume rebinds private listeners. | Role-class composition/callable tests and client state tests. The solo scene demonstrates presentation only. |
| Waiver and status | All three checks are retained for 72 hours on the same device, including an open or resumed tab; Primary Status is limited to authenticated GM; Leave Session is in Settings. | Boundary, route, and accessibility unit tests plus rendered review checks. |
| Pursuit and DRADIS | Pending pursuit uses the requested CIC wording. Repeat pings do not restart or truncate the initial 1120 ms enlarged-contact beat. Expanded contact labels choose a clearer anchored side and avoid other labels and controls. | Timer/layout unit tests and browser geometry checks at phone, short landscape, and desktop sizes, including reduced motion. |
| Onboarding | Private role briefs explain source-backed ground rules and core loop, link to the assigned station, and expose a read-only GM setup checklist. | Component/route tests and synthetic solo walkthrough. The exact approved Wolf-humanity sentence and one ordinary authorized join → first action → return remain open, so P589/P590/P599/P600 stay partial. |

The source-backed scope excludes new Wolf policies, role replacement mechanics, President gameplay effects, and population/ration rules. The existing source does not authorize a generic midgame claim of a vacated core seat. The Press intake is a report of already committed game state, not proof that blocked population prompt chains are complete.

## Test-change inventory

Every new behavior was introduced with a failing test commit before its implementation. **Skipped tests: none. Deleted tests: none.** Existing tests that changed were extended to assert the new contract; none were weakened to clear a failure.

| Added tests | Why |
|---|---|
| `functions/src/pressLogEvent.test.ts`, `src/lib/pressLogState.test.ts`, `src/components/PressEventLog.test.tsx`, `src/components/PressDispatchDesk.test.tsx` | Define stable Press event identity, private projection, readable log, and separate publication UI. |
| `src/components/GmSetupChecklist.test.tsx`, `src/components/OnboardingFirstAction.test.tsx` | Check read-only setup readiness and the reversible assigned-station first-action guide. |
| `src/components/SessionWaiverGate.test.tsx`, `src/PC02ReviewScene.test.tsx` | Verify open-tab waiver expiry and each prepared owner step, including GM-only status and role continuity samples. |
| `scripts/test-pc02-contact-layout.mjs`, `scripts/test-pc02-scene-layout.mjs` | Measure expanded label anchoring/overlap and six-step viewport overflow in a real browser. |

| Extended tests | Why |
|---|---|
| `functions/src/commissarPurgeCallable.test.ts`, `maintenanceCallable.test.ts`, `presidentWorkspaceCallable.test.ts`, `shipCounterBatchCallables.test.ts`, `shipDamageCallable.test.ts`, `shipPopulationCallables.test.ts`, `shuttleEvacuationCallable.test.ts`, `smallShipCallable.test.ts`, `voyage33MaintenanceCallable.test.ts` | Confirm each authoritative event producer writes exactly one Press report only after a committed state change and does not duplicate on retry. |
| `functions/src/sessionComposition.test.ts`, `sessionLifecycleCallable.test.ts`, `tests/rules/firestore.rules.test.ts` | Verify deliberate departure, transient resume, role/private boundaries, continuation, and Press-only reads. |
| `scripts/deployment-targets.test.mjs` | Ensure the range selector deploys every changed event-writer callable and the standalone review page. |
| `src/App.test.tsx`, `src/routes/EscapeState.test.tsx`, `GmConsole.test.tsx`, `RoleSelect.test.tsx`, `src/components/PrimaryStatus.test.tsx`, `src/components/AppHeader.test.tsx` | Verify GM-only status, Settings-only departure, return navigation, and the release note. |
| `src/components/ContactPlot.test.tsx`, `ShipPlot.test.tsx`, `PursuitTracker.test.tsx` | Verify first-contact timing, label placement, and the exact pending readout. |
| `src/components/SessionWaiver.test.tsx`, `src/lib/sessionWaiver.test.ts`, `src/routes/RoleBrief.test.tsx`, `src/store/useSessionStore.test.ts` | Verify 72-hour expiry, onboarding route, and correct private-state rebinding or clearing. |

The existing `src/version.test.ts` and `src/config/playerCopyContract.test.ts` caught candidate metadata and selector issues during the full suite; the release catalog and layout marker were corrected without changing those tests.

## Release and remaining proof

- Local unit, Functions, rules, browser layout, lint, and build evidence will be recorded with the final validated commit. A green local emulator test is not a live Firebase observation.
- Deployment workflow, hosted build version, and hosted review-scene access are pending final release verification.
- Ordinary authorized join, private assignment, real first action, Press writer delivery, and same-member reconnect in a live game have not been observed for this checkpoint. They cannot be inferred from the prepared scene.
- P589 needs an owner-approved exact player-facing sentence on Wolf humanity. P590/P599/P600 retain their dependency and composed-play proof gaps. P654/P662 and the blocked population/ration chain remain later catalog work. The owner's PC01 UI walkthrough has not occurred; its ten cross-checkpoint notes are guidance, not a PC01 verdict.

The corresponding [feedback record](PRODUCT_MILESTONE_FEEDBACK.md) remains open for the owner's PC02 UI yes/no answers and corrections.

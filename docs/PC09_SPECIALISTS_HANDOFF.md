# PC09 Specialist Handoff

Evidence availability after the Mac reconnect: earlier external `/tmp` files
referenced here were lost. These paths identify historical reported runs;
committed sources and regressions survived. Fresh resumed artifacts and limits
are recorded in [the execution record](PC09_EXECUTION_RECORD.md#reconnection-and-evidence-availability)
and [the risk review](PC09_RISK_REVIEW.md). No missing file grants new proof.

Branch: `feat/pc09-specialists-20261004`  
Product commit: `9784421a850e539f884c48c2b526c29ac8d9179b`  
The product commit contains the specialist runtime/UI/rules only. Earlier isolated regression commits remain in the branch history, including `78fca0f1` (authenticated detector/prelude proof contracts and fixtures) and `845e41b9` (AEGIS permission-control regression).

## Delivered

- Wolf Agent Detector: server-only 4/5 accuracy, three tests per cycle, private sanitized investigator report, separate GM/private truth audit. The report never includes truth or accuracy.
- Arrest workflow: private automatic six-band posse calculation and ±1 defender modifier; source-current GM resolution requires an explicit roster-attendance list; arrest/deadline disposition is separately adjudicated through GM callables.
- P.D.F. Fighter Ace: current source officer grants one attack/source/slot-bound permission; current Ace commits one action before the selected range lock. The action updates the combat roster, emits opaque member-safe results with actual capped damage, persists source count/loss state, and applies death/replacement eligibility or escape state.
- VIP Host: the GM attests a current Team-time physical visit to one active non-Dione ship. Its private one-use grant is projected safely and consumed on one selected current unrest die at maintenance step four.
- Reused the existing Comms one-jump AEGIS scout and existing Militia replacement paths. The P.503a alert flow was preserved: private alert, GM acknowledgement/clue handling, then an actor/detail-free overlay notice to all 20 current player audiences.

Live adapters are in `src/lib/{wolfAgentDetectorService,arrestPosseService,arrestCaseDispositionService,vipHostService,pdfFighterAceService}.ts`. The main callables and private persistence are in `functions/src/index.ts`; deterministic mechanics and exact receipt validators are in `functions/src/pc09SpecialistMechanics.ts`. Presentational views accepting only injected props/actions are `WolfAgentDetectorPanel`, `VipHostPanel`, `VipHostMaintenanceRerollPanel`, `PdfFighterAcePanel`, and `PdfFighterAcePermissionPanel` in `src/components/Pc09SpecialistPresenters.tsx`. Live controls are wired into Endeavour, GM arrest/visit, source-officer AEGIS/PDF, maintenance, and replacement workspaces.

The frozen 27-key private `PdfFighterAceActionReceipt` plus permission and source snapshots are defined in `functions/src/pc09SpecialistMechanics.ts`. Its public audience rows contain only attack-scoped `contact-N` labels and `outcome: { damage, destroyed }`; they do not spread private roster identities, source permission, or dice.

The callable sequence is `getPdfFighterAcePermissionView` → source officer `grantPdfFighterAcePermission` → current Ace `getPdfFighterAceCombatView` / `commitPdfFighterAceCombat`. The AEGIS permission actor must be the unique current `wing-commander` aboard AEGIS; PDF permission must come from the unique current `refinery-124-pdf-colonel` aboard Refinery 124. The current `pdf-fighter-ace` actor must be aboard Refinery 124, share the current fleet group with that source officer, and use a launched source slot permitted for this attack. The chosen attack range must still be unlocked. A permission is keyed to attack, cycle, exact source/index, Ace UID, and current officer request/revision.

## Authenticated HTTP evidence

Both disposable proofs use `createPc07AuthenticatedSession`, a normal twenty-post roster, authenticated callable actions, and ordinary GM `assignLoyalty` for the explicit optional loyalty setup. No hidden truth or specialist state is seeded.

- `scripts/test-pc09-wolf-agent-detector-http.mjs`, run with `VITE_FIREBASE_PROJECT_ID=demo-pc09-specialists PC09_DETECTOR_EVIDENCE_DIRECTORY=/tmp/pc09-detector-proof`: advanced Endeavour research through its callable in cycles 1–4, committed three tests, rejected the fourth, confirmed the current Scientist can read only a truth-free report, and confirmed three separate private server truth audits. Sanitized evidence: `/tmp/pc09-detector-proof/pc09-wolf-agent-detector.json`.
- `scripts/test-pc09-deduction-prelude-http.mjs`, run with `VITE_FIREBASE_PROJECT_ID=demo-pc09-specialists PC09_DEDUCTION_EVIDENCE_DIRECTORY=/tmp/pc09-deduction-proof`: private investigation, timed physical Wolf console observation and sabotage, GM alert acknowledgement/clue handling, actor/detail-free notice read by all 20 players, private-read denials, and a private arrest calculation requiring six posse members. Sanitized evidence: `/tmp/pc09-deduction-proof/pc09-deduction-prelude.json`. The case intentionally remains `awaiting-facilitator-attendance`; the emulator actors did not attest physical presence.
- Reusable prelude: `runPc09DeductionPrelude(f, { directory })` in `scripts/pc09-deduction-prelude.mjs`. The returned contract includes arrest case path/target UID, revision/status, deadline when resolved, candidate role/UID mapping, private investigation result, required posse count, and actor-role aliases. The composed fixture should use `explicitLoyaltySetup` with Wolf Agent `refinery-124-pdf-colonel`, Wolf Cult `wing-commander`, and Intelligence Agent `quellon-explorer`.

Positive physical attendance and positive VIP physical-visit attestations are intentionally not represented as emulator proof. They require actual facilitator knowledge of who was present; ordinary authenticated test-account presence is not that evidence.

The current returned arrest case fields are `{ path, targetUid, revision, status, deadlineCycle }`; `targetUid` is also the case document ID. `revision` and `deadlineCycle` are `null` while awaiting attendance. `posseCandidates` returns current non-target `{ uid, roleId }` options so a facilitator can make a real attendance decision. To resolve only after that decision, call `resolveArrestPosse` as the current GM with `{ instanceId, requestId, expectedCycle, expectedRevision, targetUid, presentPlayerUids }`. The UIDs must be explicit current connected non-target attendees and satisfy the private required count. An arrest creates a `pending-resolution` case with `deadlineCycle = currentCycle + 1`; a missed posse creates `not-arrested` with no deadline. At the deadline Team Phase, `resolveArrestCaseDisposition` is a current-GM action with `{ instanceId, requestId, targetUid, expectedCycle, expectedRevision, expectedSetupRevision, disposition }`. A `ruling` is required for `facilitator-resolution` after that Team Phase deadline; `executed` makes the target eligible for replacement.

`attestVipHostVisit` is GM-only with `{ instanceId, requestId, expectedCycle, shipId }`. It requires the current Team Phase, an active non-Dione ship, and one current VIP Host. The operator is recording an actual visit; this field must not be inferred from authentication presence, docking, or browser state. The maintenance reroll is bound to the current ship/cycle, open unrest step, selected die, and one-use grant.

## Validation

- `npm run build` — passed (`tsc -b` and Vite production build).
- Functions: six focused files, 37 tests passed: specialist mechanics/surface, detector, arrest calculation, posse resolution, and disposition callables.
- Unit/UI/service: nine focused files, 96 tests passed: detector panel, arrest panels, Endeavour, VIP maintenance/grant, AEGIS source-permission controls, Ace service/presenter, and replacement-role workspace.
- Firestore rules: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8160 npx vitest run --project rules tests/rules/firestore.rules.test.ts` — 143 passed, including detector report, Intelligence Agent investigation, VIP Host projection, and actor/detail-free hacking notice boundaries.
- `git diff --cached --check` and `git diff --check` — clean before product commit.

## Integration ownership and open evidence

- Parent owns the revision-ordered Commander/Ace pre-range reader adapter and the complete P.524/P.645 composed replay. This producer captures its current combat-roster input in `rosterBefore` and persists `pdfFighterAceAction` before the selected range lock. Keep the frozen schema unchanged while integrating; the producer in this branch does not overlay a pending Commander targeting mutation itself.
- Parent owns the positive authenticated Fighter Ace action proof in the complete attack fixture, including source-officer permission and the ordinary current Fighter Ace actor. This slice has callable/unit/Rules and presenter coverage but does not claim a positive attack-scoped Ace HTTP action.
- Physical arrest attendance and VIP visit facts remain facilitator attestations. This slice proves calculation, auth/rules boundaries, input validation, and one-use mechanics; the authenticated prelude does not resolve an arrest without a real attendance list.
- No release metadata, catalog status, remote branch, deployment, or merge was changed by this slice.

The authenticated proofs used isolated demo Firebase emulator slot 8 (Auth 9179, Functions 5081, Firestore 8160, Hosting 5080, UI 4080, Hub 4480). The slot 8 emulator process is owned by this branch and is eligible for cleanup after the captured proof run.

## Fresh resumed Detector verification

Root's current frozen-runtime ordinary Auth proof is now inspectable under
`/tmp/dow-pc09-resumed-evidence/detector/`. Its pre-run source/runtime/Rules
sidecar binds `2ccd9762` driver to `296dd59b` Functions/207 JS/hash
`54d4c79e…7a260`. Ordinary four-cycle research builds the device, three tests
commit, a fourth denies, the current investigator reads a truth-free private
report and other members deny. Each result has a separate server truth audit.
The earlier lost files remain historical, without changing those outcomes.

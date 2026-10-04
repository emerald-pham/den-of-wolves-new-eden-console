# PC09 crises, President, and election handoff

Evidence availability after the Mac reconnect: earlier external `/tmp` files
referenced here were lost. These paths identify historical reported runs;
committed sources and regressions survived. Fresh resumed artifacts and limits
are recorded in [the execution record](PC09_EXECUTION_RECORD.md#reconnection-and-evidence-availability)
and [the risk review](PC09_RISK_REVIEW.md). No missing file grants new proof.

Branch `feat/pc09-crises-20261004`, based on `ffa3ccbe` (`main` audit: `b36119e9`, v0.5.67). Product-only implementation is `0039ea59`; test-only history precedes it. The parent task owns integrated review, checkpoint, release, and worktree cleanup. No catalog, release, version, changelog, push, merge, CI, or deployment changes were made here.

## Source-backed choices and boundaries

- **P523b crisis delivery pressure.** The facilitator must choose `decrease`, `hold`, or `increase` before delivery. The stored choice is public framing for this crisis only; it is not a hidden client rule, global pressure meter, or automatic mechanic. This implements the acceptance text for prompt 523b as an explicit, auditable choice.
- **P523c failed-jump adjudication — PC09-A3.** Source: *Facilitator Guide v1.1*, PDF p.18 / printed p.16. The printed emergency-jump procedure keeps its fixed cost (all fuel, drive, and half the remaining consoles). Separately documented failed-jump alternatives are selected and persisted before resolution: no additional effect, full d6 damage, half d6 damage, or a wrong printed location. Wrong-location alone is a normal jump to that validated chart location and adds no damage. A combined wrong-location-plus-damage branch is offered only as the facilitator's recorded choice, with full or half damage fixed before execution. The page does not specify how to round half of an odd d6 result; the implemented assumption is round down, labeled in the facilitator control and committed adjudication. Every branch stays tied to the current failed-jump receipt, ship/chart context, revision, live GM authority, and once-only request identity.
- **P524c Coordination visit — PC09-A2.** During Coordination, the current President chooses an eligible active ship; the server atomically spends one political capital and reduces that ship's unrest by one, once per committed request. No route selection, docking, or extra routine GM confirmation is required. It does not grant the separate P517 Team Time benefit.
- **P524b/524d bounded office powers.** Source: *Home Printing A4 Single-sided v1.1*, PDF p.37. Session-scoped elected office is projected separately from ship roles and seats. The elected President can use the existing bounded President controls while holding any ship seat; the replaced station President loses that authority. The Vice President receives no additional President powers, and no automatic succession or tie winner is invented. President actions do not grant ship resources, private information, or GM writes.
- **P528 Approaching Vessel — PC09-A5.** Source: *Home Printing A4 Single-sided v1.1*, PDF p.12. A live facilitator records the real/trap ruling, permitted response timing choices, coordination choices, public instructions, and private rationale. Timing and rationale have no invented automatic mechanical mapping. Private truth and rationale stay in the GM record; players see only the allowed response instructions and public facts. Voyage 33-0 admission requires the current recorded ruling to be real and reuses the existing admission path and once-only people/motivated-role activation. It does not choose a host or spend resources. P250 maintenance and P251 docking/movement are already marked done by PC06 v0.5.64; the bounded authenticated follow-up below verifies that an actual P249 admission enters those existing hooks.
- **P537/538 election — PC09-A6.** Source: *Home Printing A4 Single-sided v1.1*, PDF p.12. The facilitator fixes eligibility, voting system, population weighting, opening/closing cycle, VP inclusion, campaigning, supply-use instructions, and tie policy before ballots open. The service calculates eligibility/weights and server-tallies secret one-time ballots; the facilitator does not transcribe or total votes. A configured facilitator tie choice is persisted before voting; any permitted tied-candidate selection is recorded before the transition. Supply policy is instructional only and does not debit ship stores. Player projections expose candidate aliases, procedure, and aggregate tally, never voter-to-ship maps or ballot choices.
- **P540 crisis capital award.** A resolved eligible crisis records its one-capital award in the same authoritative transition. Below the cap, the applied delta is one. At the established cap of 8, the award remains handled with `capitalApplied: false` and `capitalDelta: 0`; balance and ledger remain unchanged. This gives truthful status and exact replay without a failing resolution or a separate claim action.
- **P539 Team-start announcements.** Formal crisis/election outcomes are queued for the next Team-start announcement and remain distinct from optional Press publication. Reconnect preserves any still-pending announcement.

## Implementation and presenter contracts

`0039ea59` adds the crisis delivery policy and failed-jump branch, the current Approaching Vessel adjudication, secret election policy/ballot/tally/office transition, elected-office authority projection and bounded route, atomic capital/visit behavior, and formal next-Team announcements. Existing ship seats and roles are preserved. `firestore.rules` keeps ballots, GM adjudications, and private receipts server-owned. The UI reuses existing Voyage admission rather than introducing a second activation path.

Prepared review scenes can inject local state and callbacks into these actual content exports without mounting the global store-backed workspace or issuing live reads/writes:

- `PresidentWorkspaceView({session, live, onRecordPresidentAction, onChangePoliticalCapital, onPresidentialVisit})`
- `PresidentialElectionWorkspaceView({projection, live, currentUserUid, isFacilitator, currentCycle, ballotSubmitted, facilitatorVoters?, onConfigurePolicy, onCastBallot, onResolveElection})`
- `ApproachingVesselResponseWorkspaceView({crisisId, projection, canEdit, live, onRecord})`
- `TeamStartFormalAnnouncementsView({announcements})`

Representative election projection: `{type:'presidential-election',revision:1,state:'open',policy:{votingSystem:'plurality',populationWeighting:'equal',openCycle:2,closeCycle:3,vicePresidentEnabled:true,campaigning:'structured',supplyUse:'prohibited',campaignInstructions:'No fleet supplies.',tieRule:'facilitator-choice'},candidates:[{id:'candidate-a',displayName:'Candidate A'},{id:'candidate-b',displayName:'Candidate B'}]}`. A formal announcement is `{id:'election-1',kind:'presidential-election',title:'New President elected',details:'...',decidedCycle:3}`. Election projections use opaque candidate IDs and aggregate counts; no secret ballot payload is accepted as presenter data.

## Ordered test-first commits and product commit

All permanent failing test commits are separate commits before the product implementation. The subsequent two test-only commits correct current fixtures/mock wiring while preserving the tested behavior.

```text
ae443a12 test: require explicit failed-jump adjudication choices
ef75c646 test: require facilitator to choose a jump destination
9c5fde38 test: label selected jump resolution in failure receipt
219370b1 test: verify wrong-location jump branch
3fb9bf89 test: assert wrong-location navigation projection
1794e507 test: define bounded presidential election policy and tally
5c577aea test: enforce distinct President and VP nominees
586dac12 test: require explicit crisis delivery pressure
87c744eb test: require phase-bound presidential visit effects
7b2a0ce4 test: model presidential visit audit reads
071d10b5 test: configure crisis delivery pressure in GM flow
2afce563 test: enforce Team phase presidential addresses
41c64adc test: add presidential visit client controls
6c7f0247 test: align crisis and capital fixtures with policy
9acf9372 test: await presidential visit response
3d98a712 test: assert visit status announcement
e68d425f test: assert mocked presidential visit call
0984fa2e test: add injected President workspace presenter
76e8b5ae test: use Coordination fixture for visit presenter
d854268a test: add formal Team-start announcement view
445a8a4d test: cover pending Team announcements
53832061 test: include explicit failed jump choices
33155926 test: cover formal crisis Team announcement
6cd74934 test: preserve queued formal Team outcomes
76bce670 test: cover formal crisis announcement queue
cc2b9a63 test: pin odd half-d6 jump adjudication rounding
e80204da test: specify private presidential election flow
04521c51 test: correct election callable fixtures
b287dbf5 test: add Approaching Vessel adjudication contracts
081126e8 test: correct vessel adjudication request revisions
42bb1b6b test: require vessel adjudication before admission
180854c4 test: require vessel ruling before crisis resolution
d461329b test: supply vessel ruling for crisis lifecycle
b38beb23 test: reject undefined election tie fields
946b548f test: verify elected President office authority
0034a496 test: require atomic crisis capital award
4ca0cc72 test: verify capped crisis capital award replay
59dddb15 test: show capped crisis capital reward
c40973d9 test: project capped capital status to President
62cafe6a test: hydrate capped capital award status
3d1e4295 test: remove routine crisis capital claim
b7401a2c test: require office routes clear fixed header
76df21f1 test: inspect office route style contract
9bb12b1a test: mock GM vessel response subscription
aed28052 test: require current vessel ruling for admission
0039ea59 feat: implement PC09 crisis and election systems
```

`6c7f0247` is a bounded test-fixture correction: the current delivery enum is `hold`, not the obsolete fixture value `steady`; visit expectations were updated to include both recorded capital gains and resulting revision. `04521c51`, `081126e8`, and `d461329b` align callable/test fixtures to the actual typed election and crisis contracts. `9bb12b1a` adds the new GM response subscription to the existing mock. `aed28052` supplies an actual current GM ruling to the retained Voyage admission test and asserts its distinct committed status text.

## Verification evidence

- Focused UI tests: 17 files, **758 passed**. Includes the 143-test GM console suite, app/routes, crisis delivery, failed-jump adjudication, President view, election office layout route, Team-start announcement view, Firestore projections, and session command service.
- Focused Functions tests: 11 files, **120 passed**. Includes all crisis/election/President/Voyage callables, server tallies, privacy, request replay, office replacement/VP denial, Coordination phase guard, capital under-cap/cap replay, and Team-start state.
- Firestore rules emulator suite: **4 files, 157 passed**, using isolated demo project `demo-pc09-crises` on reserved slot 3. This ran with the cached Firebase CLI 15.29.0.
- `npm run typecheck`, `npm run build`, and `npm run build --prefix functions` passed. `npm run lint` passed with 0 errors and 11 warnings; these warnings are existing hook, Fast Refresh, or type-import warnings in other unchanged sites. `git diff --check` passed.
- Normal emulator UI smoke used the actual browser against the app and emulator: created a session, granted local facilitator access, started the single-player demo, opened the actual `/president` route and saw its non-elected denial, and opened `/election` and saw the actual no-procedure state. `#/gm` redirected to `/console` in that demo setup, so this was not an exercised GM mutation route.
- Responsive/browser checks used 1280×720, 390×844, and 667×375; narrow and short-landscape widths had no horizontal overflow. The fixed app header clears President/election content after the CSS fix. Keyboard Enter on “Back to stations” navigated to `#/console`; reduced-motion mode was used on the emulator origin.
- A previously existing successful failed-jump projection assertion found that the client did not create `shipGalacticCoordinates` when the starting local projection omitted that map. `0039ea59` fixes the committed-jump path to seed the map from `{}`; the unchanged assertion passes in the 758-test UI batch.

## Review rejection and correction

Auto-review rejected an `apply_patch` request to restore the old Dione-assigned-role-only check in `requirePresidentActionAuthority` (`functions/src/index.ts`). Reviewer reason: it contradicted the acknowledged session-scoped elected-office model and would deny valid President actions for a newly elected officeholder occupying another ship seat. That rejected patch was not retried through another tool or path. The bounded implementation in `0039ea59` retains the server check against the current `presidentialOffices.presidentUid`; test commit `946b548f` proves cross-seat elected-President access and denial for the replaced Dione President and a VP without President authority. Ship seats remain unchanged. The separate fixture correction `6c7f0247` changes only an obsolete enum fixture from `steady` to `hold` and updates capital-revision expectations.

## Normal authenticated composed acceptance

`scripts/test-pc09-crisis-election-http.mjs` is the reusable authenticated HTTP/browser walkthrough. It uses ordinary Firebase Auth emulator signups for an 18-person roster, invokes the real Functions emulator HTTP callables with those actors, and joins an ordinary authenticated browser for the President route, address, next-Team reconnect, and office projection. The sanitized successful run is `/tmp/pc09-crisis-election-evidence/result.json` (20 named checks, 89 actions; no identities or tokens retained). It passed the frozen election policy, three private ballots, server population-weighted tally, audited President/VP transition, ballot/session Rules denials, safe crisis projections, delivery pressure and GM vessel ruling, Voyage 33-0 admission/once-only arrival/motivated-role activation, Disease Outbreak/Religious Zealotry/Civil Unrest/Presidential Election legal outcomes, automatic crisis capital and exact retry below and at the cap, former-President denial and new President browser authority, atomic Coordination visit, formal next-Team announcements, and reconnect persistence.

The run used the local `demo-pc09-crises` Auth/Functions/Firestore emulators only; it did not exercise production gameplay. Disclosures: the normal GM actor received `createPc07AuthenticatedSession`'s local demo-project facilitator grant; one Cycle 1 Team deadline was moved just past to activate the Coordination endpoint; Icebreaker unrest was set to 1 in emulator fixture state to make the visit endpoint eligible; the visit was a digital callable record, not a physical attestation; and the facilitator explicitly recorded a normal-roster scenario adaptation for Religious Zealotry because that roster has no Universal Arbour loyalty. No election supply debit was performed.

The exact source references for the new choices are *Facilitator Guide v1.1*, PDF p.18 / printed p.16 (P523c emergency failed-jump alternatives, distinguished from the fixed printed emergency cost); and *Home Printing A4 Single-sided v1.1*, PDF p.12 (P528 vessel response and P537/538 election policy), p.37 (President powers). P523c preserves wrong-location-alone as a normal jump without invented damage; a combined wrong-location/damage choice and full/half severity must be recorded before execution, with half-d6 rounded down as the labeled adjudication assumption. These facts are represented in the central PC09-A3/A5/A6 assumptions record.

The `/private/tmp/dow-pc09-crises-20261004` checkout and branch remain available for parent integration. My slot-3 emulator and Vite sessions were stopped after the successful run; coordination status showed no slot-3 live reservation. The workspace dependency symlinks `node_modules` and `functions/node_modules` remain untracked and intentionally untouched; generated `dist/` is ignored. Archive/cleanup is eligible after the parent confirms the candidate has been integrated and no longer needs this checkout.

## Bounded P529 admission-to-hook verification

The canonical prompt rows show P250 and P251 as `done`, with PC06 v0.5.64 acceptance evidence; P529's earlier description calling them outstanding hard prerequisites was stale. The targeted `scripts/test-pc09-voyage-hooks-http.mjs` walkthrough now composes the current P249 admission with those existing handlers through ordinary Auth-emulator callable requests. It records a real Approaching Vessel ruling and admission, confirms Voyage 33-0's admitted identity and printed commitments, docks it through `dockVoyage33` to an active core host in Team Phase, begins P250 maintenance, then applies step 1 rations. The resulting maintenance state retains the admitted 40,000 population and unrest 0; the host funds the printed step with four food and four water. Exact docking and ration retries preserve the recorded host binding and do not debit resources twice. The admission and docking actions do not alter core role seats or choose an automatic host.

Sanitized proof is `/tmp/pc09-voyage-hooks-evidence/result.json` (6 checks, no identities or tokens). It used 18 ordinary Firebase Auth emulator actors and authenticated callable HTTP writes; there were no direct gameplay fixture writes, production actions, cycle accelerations, or physical-visit claims. This is a bounded integration check only; the previous 20-check authenticated crisis/election run remains the evidence for exact-once motivated-role activation and privacy.

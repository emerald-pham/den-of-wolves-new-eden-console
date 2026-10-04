# PC09 crises, President, and election handoff

Evidence availability after the Mac reconnect: earlier external `/tmp` files
referenced here were lost. These paths identify historical reported runs;
committed sources and regressions survived. Fresh resumed artifacts and limits
are recorded in [the execution record](PC09_EXECUTION_RECORD.md#reconnection-and-evidence-availability)
and [the risk review](PC09_RISK_REVIEW.md). No missing file grants new proof.
Original crisis implementation: branch `feat/pc09-crises-20261004`, based on `ffa3ccbe` (`main` audit: `b36119e9`, v0.5.67), product commit `0039ea59`. The restored independent-review worktree is `/private/tmp/dow-pc09-crises-review-repairs-20261004`, branch `fix/pc09-crises-review-20261004`, based on `00fb7103`. The parent task owns integrated review, checkpoint, release, and worktree cleanup. No catalog, release, version, changelog, push, merge, CI, or deployment changes were made here.

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

## Historical normal-auth evidence (pre-reconnect)

The earlier 20-check/89-action authenticated run and separate Voyage hook run were completed before the Mac reconnect. At restore, `/private/tmp` and the external proof artifacts were cleared. The previously listed `/tmp/pc09-crisis-election-evidence/result.json` and `/tmp/pc09-voyage-hooks-evidence/result.json` are missing and must not be cited as surviving files. Their prior handoff descriptions are historical only; current surviving Auth evidence is recorded below.

The exact source references for the new choices are *Facilitator Guide v1.1*, PDF p.18 / printed p.16 (P523c emergency failed-jump alternatives, distinguished from the fixed printed emergency cost); and *Home Printing A4 Single-sided v1.1*, PDF p.12 (P528 vessel response and P537/538 election policy), p.37 (President powers). P523c preserves wrong-location-alone as a normal jump without invented damage; a combined wrong-location/damage choice and full/half severity must be recorded before execution, with half-d6 rounded down as the labeled adjudication assumption. These facts are represented in the central PC09-A3/A5/A6 assumptions record.

The original `/private/tmp/dow-pc09-crises-20261004` worktree and its proof files were removed during the host restore. The isolated review worktree named above remains available for parent integration; its restored `node_modules` directories are ignored installs, not dependency symlinks. Generated `dist/` is ignored.

## Bounded P529 admission-to-hook evidence status

Canonical prompt rows show P250 and P251 as `done` under PC06 v0.5.64; they are not prerequisites still waiting on PC09. A pre-reconnect ordinary-Auth hook run was previously reported to dock an admitted Voyage, run P250 step 1, and prove exact retry, but `/tmp/pc09-voyage-hooks-evidence/result.json` and its logs were removed at restore. The current surviving authenticated crisis/election proof rechecks the live P249 ruling and admission, printed commitments, once-only arrival, and motivated-role activation. It does not itself call `dockVoyage33` or run P250 maintenance. The parent has the earlier accepted hook result in its PC09 history; if that record is unavailable during final reconciliation, retain this as an evidence limitation rather than treating P250/P251 as pending implementation work.

## Independent-review election repair and current Auth acceptance

### Owner decision and narrow code delta

The parent recorded the exact owner-approved office rule in central PC09-A6 at `6439c867`; this handoff does not duplicate or alter the central assumptions ledger. When one UID is the unique winner on both raw office ballots, that UID becomes President and the next eligible distinct candidate from the VP ballot becomes VP. The configured tie rule continues to govern a tie for that VP runner-up. Exclude the President from VP fallback candidates. If no distinct eligible candidate received a VP vote, the tally remains pending until the current GM explicitly records the VP vacancy with the visible explanation; there is no automatic replacement or succession.

The review found that a configured President tie choice matching the unique VP leader could be passed into the runner-up helper as if the President were a unique vote winner. `e29d0e27` now enables fallback only when the raw President tally has a unique vote winner matching the recorded decision. A President tie decision that matches the unique VP leader fails before writes with an in-game explanation; choosing a distinct President candidate under the configured tie rule resolves without labeling VP as a runner-up. The permanent callable regression is separate in `4e0c9cc6`; it submits ballots in Team Phase, advances its fixture to valid post-close Coordination, checks no-write denial for the conflicting tie choice, and verifies the distinct choice. Before the fix, 1 of 13 focused election callable tests failed on the leaked runner-up outcome; after the fix all 13 passed.

### Current ordinary-auth proof

The surviving result is `/tmp/dow-pc09-crises-auth-proof-final/result.json`: 23 named checks and 91 authenticated callable actions. It is identity-free: it records `identitiesAndTokensRetained:false`, contains no UIDs or tokens, and preserves private ballots. Its separate runtime-binding manifest is `/tmp/dow-pc09-crises-auth-proof-final/runtime-binding.json`; the original result remains unchanged and honestly retains `sourceCommit:"not-specified"` because the driver did not self-stamp the commit. The result file SHA-256 is `ebffda50bff049bf12d75fde213822cbf599bc941ecd92e004f50991a0137567`; the manifest file SHA-256 is `d2157cf88c5786ce54dde903ada189cd80ada3cc522f53aed298b19d6811292f` (its declared canonical `bindingSha256` is `2056cea33cae173a8efceac1a7eeb13d825fa63c9a245b75c3eff44ca632cac5`). The sidecar binds the run to the clean review checkout SHA `f2f5d49aa833526cc103e47da7b809c013cd8910`, Git tree `f99e8c514da1d1891b66638685207fd9a5f684b6`, Functions source tree (485 files) SHA-256 `4c006e0db79d2aed0d47f0085520e086275db501a5b94023e898eea860d91e35`, and compiled Functions runtime tree (414 files) SHA-256 `0b2ca003d4645b2f554a3bacc43cdbf01bb854d075ba7aee3b6604f4084f7a26`. Key Functions files were `functions/src/index.ts` SHA-256 `3771e2c0890ea668bcbd1539ed7305024fe044733131e1e2a9121ed0101c9b2f` and `functions/lib/index.js` SHA-256 `628f4693966c8227771b1761e91360ee63e3eb2ac73732841bc34dc258142a63`. Client source and build tree SHA-256 values are `8bf69c2b988ee7e2caeb4e02d20a4bee425e73ace97142e878834561d0cc8dfb` and `6182bba378b98bb3d2acb35a1079e6def9b25c8647cc1f58631d59b880680202`. Those hashes were captured after the proof; no product/runtime source changed between the clean pre-run checkout and hash capture. The result itself did not contain a source SHA, so the sidecar is a corroborating post-run binding, not a self-stamped launch receipt.

The proof used 18 ordinary Firebase Auth emulator actors and an ordinary joined browser against demo project `demo-pc09-crises-review`; it was not a prepared scene or production gameplay. Ordinary authenticated callables committed the election policy, five ballots, tally, and office transition. The five ballots were submitted through `castPresidentialBallot`, not pre-seeded. The current ship-population-weighted fixture produces the same unique Captain winner on both ballots and Scientist as the distinct VP-ballot runner-up. It verifies secret-ballot projections, direct ballot read/write denial, session-root write denial, server tally, audited transition, new President authority, and replaced President denial.

The same run passed all five crisis legal outcomes and four custom closures, Approaching Vessel delivery pressure/private GM ruling/Voyage admission and once-only activation, automatic capital under the cap and exact retries, truthful zero-delta behavior at the 8-cap, atomic Coordination visit, and formal next-Team announcements plus reconnect. The proof records 10 announcements delivered at Cycle 2. Disclosures: one 1-second Cycle 1 Team deadline acceleration before entering Coordination; one fixture-only Icebreaker unrest value of 1 to make the visit eligible; and a Religious Zealotry adaptation for this normal roster without Universal Arbour loyalty. The visit is only a digital callable record; no physical visit is claimed. No election supply debit was performed.

The run observed no remote Firebase request origins before tally or over the whole browser session (`remoteFirebaseRequestOrigins:[]`). Client App Check was skipped only under `VITE_USE_EMULATORS=1`; ordinary browser and callable requests succeeded on the local Firebase Emulators. The app answered at `http://127.0.0.1:5183`; the cached Firebase CLI was 15.29.0 and Node was v23.10.0. The launch used `/tmp/start-pc09-crises-emulators.mjs`, which invoked `/opt/homebrew/bin/firebase` with `--config /private/tmp/dow-pc09-crises-review-repairs-20261004/firebase.local.json --project demo-pc09-crises-review --only auth,functions,firestore`; the client used `VITE_USE_EMULATORS=1`. Before the run, the manifest recorded row-10 emulator launcher/child PIDs 8177/8290, Firestore JVM PID 8340, Vite launcher/child PIDs 9002/9023 and listener PID 9042, ports 9199/5101/8180/9400/9399/9599 and 5183, and loopback-only listeners. The local generated `firebase.local.json` was removed during row cleanup; its exact byte hash was not captured before the run. The raw result also did not capture the checkout SHA before launch. Exact commands, process/config fields, emulator flags, and the post-run source hashes are retained in `runtime-binding.json`.

Pregame Settings guidance was visible without horizontal clipping at 390×844, 844×390, and 1440×900. After actual game start the subscribed note disappeared. The proof waits up to 10 seconds for React to commit the update, then retains the count-zero assertion. Both President and Election routes passed keyboard activation of “Back to stations” at all three sizes: each target was 44px high, returned to `/console`, retained the same authenticated identity, had no horizontal overflow, and generated no browser errors.

### Ordered repair and proof-driver commits

The complete restored branch history after `00fb7103`, oldest to newest, is:

```text
3dfd01c6 test: cover presidential election review guardrails
e109a5bd test: pin election resolution to coordination after close
8bcdc39a fix: guard presidential election close and ballot replay
a9d4d192 test: exercise election close and governance route returns
a1899ca3 test: require VP ballot runner-up for shared winner
a9d135a4 test: project election office conflict outcome
4f639544 test: project and prove VP election outcomes
659f6c4e fix: resolve shared election winner with VP runner-up
3e9ea14a test(pc09): isolate emulator clients from remote App Check
94c06474 fix(pc09): keep App Check exchange out of local emulators
4e0c9cc6 test(pc09): keep VP fallback inside unique winner policy
69119411 fix(pc09): explain awaiting CIC authentication before game start
e29d0e27 fix(pc09): limit VP fallback to unique dual-office leader
cd5f137c test(pc09): verify emulator-only election and office routes
c7ae2b01 test(pc09): keep the Settings name query type safe
1527cb51 test: keep denied-read diagnostics type safe
4d54226e test(pc09): wait for post-start settings update
db580e3d test(pc09): use a weighted shared-winner ballot fixture
f2f5d49a test(pc09): assert tally scores by server uid
```

The two type-only test corrections preserve their Rules and Settings assertions. The proof-driver commits bind Vite to IPv4 loopback, wait for the subscribed Settings update with timeout diagnostics, use legal ballots whose actual ship-population weights create the required shared unique winner, and read server tally scores by server UID. Member projections remain alias-based and direct ballot access is denied. Root-owned App Check and CIC waiting-copy commits are present in the branch but are not claimed as this repair's authored product delta.

### Failed proof attempts retained

All failed attempts remain at their original sanitized artifact paths; the passing run used a new directory.

| Artifact | Failure | Bounded correction |
| --- | --- | --- |
| `/tmp/dow-pc09-crises-auth-final/failure.json` | Vite initially listened only on IPv6 localhost; Playwright targeted IPv4 and was refused before browser join. | Stopped only the isolated Vite child and restarted with `--host 127.0.0.1`. |
| `/tmp/dow-pc09-crises-auth-final-corrected/failure.json` | Immediate Settings count ran before the subscribed React update committed. | `4d54226e` waits up to 10 seconds for note detachment and saves a screenshot plus sanitized identity booleans/current cycle/indicator/note state on timeout. |
| `/tmp/dow-pc09-crises-auth-final-complete/failure.json` | The initial synthetic weighted ballots tied the VP leaders. | `db580e3d` changes only the five ordinary actors’ submitted choices and asserts the server-computed weighted scores. |
| `/tmp/dow-pc09-crises-auth-final-weighted/failure.json` | The proof indexed facilitator tally scores by candidate aliases; the server tally is keyed by UIDs. | `f2f5d49a` uses server UIDs for GM tally-score assertions; member projections remain candidate-alias based. |

The type-only Rules correction `1527cb51` narrows the denied-read failure diagnostic at line 1417 without changing `expect(read.allowed).toBe(false)` or invalid-count assertions. After it, `npm run typecheck` passed. `npm run build`, Functions build, targeted ESLint, 56 UI/App Check isolation tests, 13 presidential election callable tests, `node --check scripts/test-pc09-crisis-election-http.mjs`, and `git diff --check` passed.

### Resource state and remaining evidence note

Only row 10 was used. Its Vite and Firebase processes are stopped, listeners are gone, and coordination status has no live row-10 reservation; root's row 2 services were left untouched. The row-10 local config was generated for this worktree and is being released. The review worktree remains for parent integration; cleanup is eligible after the parent confirms its commits are integrated.

No election gameplay implementation gap remains from the independent review. The pre-reconnect standalone P250/P251 hook artifact is unavailable; this final Auth proof revalidates admission, arrival, and motivation activation but does not repeat docking/maintenance. Reconcile the earlier accepted hook result from the parent's retained records. If unavailable, record it as an evidence limitation only; do not rewrite P250/P251 `done` or add a PC09 prerequisite.

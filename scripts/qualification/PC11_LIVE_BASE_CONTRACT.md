# PC11 clean .71 proof source-contract inventory

This is a source-only adapter qualification. It starts no browser, Auth/Admin client,
listener, server, emulator, or row reservation. It does not prove rendered controls,
Firestore rules, successful callable execution, production readiness, or acceptance.
Actual10 and Actual11 remain stopped failures. The product, Functions, and rules are
unchanged by this adapter repair. A fresh owner allocation is required for runtime.

`pc11-contract-preflight.mjs` executes the adapter, runner contract, and native
consumer tests before the launcher creates SDK clients or browser processes. Launcher
`--check` uses this same entry point. Test fixtures execute copied active callbacks;
they never import the executable runner. The runner independently invokes the entry
point before requiring Playwright. Node import initialization of the reused lifecycle
helper also executes the clean `ROLE_IDS`/`shipForRole` AST contract extraction.

## Exact imported-helper boundary

| Module (`scripts/`) | Normal-runner use and native coverage | Excluded exports |
| --- | --- | --- |
| pc10-browser-ui-receipt | observeUiReceipt, attachUiReceiptDiagnostics; positive UI receipts and original-error failure | none in active path |
| pc10-ui-receipt-diagnostics | active diagnostic creation/context/persistence through real receipt wrapper | no standalone browser run |
| pc10-proof-failure-evidence | originalProofError, rememberProofFailure, retainProofFailure; primary/secondary error tests and temporary-file persistence | none in active path |
| pc10-full-game-demo-proof-helpers | proofRuntimeFromViteSource/validateProofRuntime source binding; observeFullGameDemoPresentationMember executes actual normal store/SDK callback | training preparation, prepared start, turn advance, ending controllers |
| pc10-member-gm-lifecycle-ui-proof | observeLifecycleActor, captureLifecycleUiAction, publicLifecycleReceipt, open/close settings executed with normal published fixtures | recovery/controller and other campaign orchestration |
| pc10-member-gm-lifecycle-contracts | active original actor, late-reply authority, captured-request checks through capture; foreign session and denied reply negatives | other lifecycle scenario contracts |
| pc10-member-navigation-resume | explicit pc11-live-base observer; original document/UID/session, real request/response-shaped passive resume, epoch +1, listener teardown | default current-berth contract retained unchanged |
| pc10-normal-member-projection-contract | initialization reads actual Functions ROLE_IDS and shipForRole | broader normal crew controller |
| pc10-two-browser-gameplay | imported definition initializes dependency closure | createTwoBrowserGameplay is not invoked |
| pc10-candidate-proof-helpers | imported definition initializes dependency closure | candidate workflow/maintenance helpers not invoked |
| pc10-combat-choice-readiness | imported definition initializes dependency closure | Wolf/combat helpers not invoked |
| pc10-combat-target-diagnostics | imported definition initializes dependency closure | combat diagnostic functions not invoked |
| pc10-presentation-member-resume | imported definition initializes dependency closure | training presentation resume not invoked |

The surface factory's `callable` function remains an unused inherited definition;
the normal proof performs actions through mounted UI and captures real UI receipts.
Legacy excluded controllers are not made runnable or qualified by this preflight.

## Active browser callback/API inventory

The native AST consumer executes **15** active `evaluate`/`evaluateAll` callbacks
from the exact runner source. An added callback changes the asserted inventory count.
Each dynamic import must resolve to an explicit published module fixture. Actual
`sessionSnapshotAuthority.ts`, role presets and their relative source dependencies
are transpiled and executed; Vite asset imports are checked for file existence and
represented as URLs. Firebase SDK transport primitives have isolated no-network
fixtures. This verifies export and field binding, not transport authorization.

| Active callback/path | Published fields/API and asserted floors |
| --- | --- |
| passive admission UID and register | auth().currentUser.uid; retained original UID, distinct ordinary identities |
| surface observe | actual useSessionStore fields; same Auth/store actor, session, phase/cycle, connection/live, server freshness, primary role, exact GM instance; null demo profile adapter |
| paintTwoFrames | requestAnimationFrame only |
| liveGm SDK | sessionSnapshotAuthorityFor; own cursor true, absent-session control false, exact current Auth/member/session/GM UID |
| GM transition subscribe/teardown | actual store.subscribe/getState and sessionSnapshotAuthorityVersion; bounded 300 events; stop/delete own window observer |
| entitled | live/server store, Dione shipDamage/shipResources, Philia shuttleControl/shuttleDockings |
| held | actual published firestore db(); SDK doc/getDocFromServer; exact own session/UID path, balances and document existence |
| normal-start canonical roster | actual recommendedRoleIds(12), ordered exact twelve role IDs |
| normal-start projection/recovery | real activeCycle1 session, setupConfirmed/playerCount/chartId/activeRoleIds/dioneEnabled/activeVesselIds/shuttleDockings; exact claimed seat count; gmRecoveryPending false |
| recipient selector options/accept DOM | existing mounted select/options/labels and section DOM only; no authority inference; bounded diagnostics preserve primary error |
| Philia target options | real enabled nonempty option values; exact chosen console required by subsequent receipt |

Native active helper consumers additionally execute actual lifecycle/member callbacks
with clean fixtures and all original identity/cursor/seat negatives. The member map
reader reads only the exact original fleetGroup document, parses actual
`fleetGroupRecord`, rereads the mounted tuple and requires unchanged time origin,
UID/session/primary role/active role/seat/group/generation/hydration plus live/server,
SDK authority, current owned player/canonical seat and original member scope. It
requires the server map's own UID→Dione entry, vessel inclusion and group membership.
No absent-map applicability or role-derived berth is inferred. Actual Philia config
binds Dione Engineer and initial host Dione; hosted shuttle, reload and return fixtures
retain that original Dione seat/map. Invented Philia Engineer and foreign maps fail.

## UI requests, replies and receipt floors

The native receipt consumer exercises the lifecycle wrapper for every following
callable name, checks the actual Functions export, captures its request/reply-shaped
fixture and rejects foreign session and denied reply. These are wrapper consumers,
not executions of Functions handlers. Independent source inspection compares the
actual client submitters with Functions request/reply contracts.

| UI action | Runtime assertion retained |
| --- | --- |
| createSession / joinSession | actual HTTP200, normal result/session, original browser Auth capture, separate consent; create requestId captured before reply parsing |
| local GM authorization / claimGmInstance | local authorized reply, same original tuple; actual instance id/UID/session and canonical claimedAt; own live SDK cursor |
| confirmSetup / assignRole | normal ChartA12 preset; original target role/admission and canonical own seat; no prepared crew |
| startGame / clearTurnAdvanceInterstitial | actual committed/replayed receipt; original start requestId/instance/session captured before readback; normal activeCycle1, mounted briefing cleared/clock resumed |
| attestPlayerHeldTokenBaseline | exact target UID, attested reply, six-resource actual own server readback (2/0 materials) |
| createSameTableTradeOffer | exact original from/to UID, six-resource normalized one-material quantities; both inventories unchanged |
| acceptSameTableTradeOffer | same original offerId; actual server held balances1/1; original cold-document reload readback |
| propose / consent / applyPermissionedDismantling | original Philia/Dione/exact console and proposal IDs; propose/consent world unchanged; apply status applied, materialGain3, exact console damage; all unrelated resources/damage/control/docking unchanged |
| passive resumeSession | exact session request, successful actual response, original UID/session/player role/fleet/nullable station pointers, generation+1; post-response fresh owned member/seat/map; hydration+1 and same original document |

Original 35s page and 60s operation limits remain. Changed same-document navigation
requires its operation-local passive resume receipt; reload requires a new document
but retains original UID/role/seat/group and nonregressing generation. No SDK gameplay
writes, Auth credential injection, manual storage writes or Admin gameplay seeding.

## Cleanup and error floors

Original browser request events capture create/start request IDs before response
processing. Admission Auth UIDs are observed from the original browser at the actual
create/join request; their promises are retained and settled before browser teardown.
If create response parsing fails, recovery reads only the exact UID_requestId root
receipt and verifies fingerprint actor/request plus safe sessionId before recovering
scope. A foreign or malformed record fails cleanup; it never broadens queries.

Root cleanup validates all existing own gmAccess/create/start records **before** a
transaction deletes any. The returned count comes from the committed transaction,
so retries cannot overcount; evidence exposes record kinds, not raw UID-bearing paths.
Remaining deletes are the original session subtree, verified exact join-code pointer,
verified own session membership pointers, and Auth users born in this run. Absence is
read back. Unknown pointers/foreign UID/session/instance fingerprints refuse deletion.
Browser launches settle, owned browsers close, own Admin client terminates and source/
built Functions hashes remain bound. Cleanup errors and elapsed-cap overruns prevent
PASS. Effective executionCapMs is derived from the supplied absolute allocation end,
with a60s runner cleanup reserve and launcher reserve. Diagnostics are separate from
the primary failure and receive no retry/action authority.

Native proof gaps: real browsers, UI geometry, SDK transport/rules, live subscriptions,
actual mutation/reply chronology, actual reload/passive resume, physical tabletop counts
and final rendered acceptance require the separately allocated bounded proof. Native
fixtures do not establish those outcomes or override the two recorded runtime stops.

## Actual12 ordinary phase/wait correction

Actual12 earned ordinary GM create, owned live GM, and legal twelve-seat setup
claims, then stopped at the first join: the observer incorrectly required `casting`
while the published configured session remained `lobby`. No trade/Philia proof was
earned. The source-only correction changes admission observation, not product state.

The published create handler replies/writes `lobby` at Cycle0. `confirmSetup` writes
setupConfirmed and configuration without changing phase. `requireCastingWindow`
allows lobby/casting. `assignRole` writes the first primary role and `casting`;
normal station selection then owns the canonical seat. The second join can therefore
see casting. Ordinary `startGame` advances to active Cycle1 with the briefing held;
actual briefing clearance removes that hold. No helper name defines those phases.

The native test extracts and executes **all six actual runner until predicates** with
this faithful transition sequence, plus both actual casting-station consumers and
real admission/station authority helpers. A new wait changes the inventory count.

| Wait | Source/store contract and mounted action | Native positive/negative boundary |
| --- | --- | --- |
| fresh ordinary Cycle0 | createSession result/store currentTurn0; Create a session and existing consent | original authenticated same actor/session, server freshness |
| original live GM | claimGmInstance descriptor/member GM role and mounted SDK authority; Join as GM | owned original GM; active phase required when requested, lobby rejected then |
| legal12 roster | confirmSetup setupConfirmed/activeRoleIds; Confirm setup // Confirm roster | actual recommended12 ordered roster; final ordinary-start helper retains exact roster check |
| normal joined pre-start | joinSession projects confirmed lobby for first player or casting after first assignment; Join a session and existing consent | both phases with Cycle0, setupConfirmed, live/server and own actor/session; offline/cache/foreign/active/closed fail |
| original persisted member | cold-document reload retains member/seat, followed by strict memberReady/map readback | own live/server primary role; original identity assertions and lost-authority negatives retained |
| briefing cleared | startGame activeCycle1 then clearTurnAdvanceInterstitial; Clear cycle briefing // resume clock | held/mounted briefing fails; only both cleared flags succeed in activeCycle1 |

Unseated admission readiness permits only configured lobby/casting at Cycle0. Exact
assigned-station readiness still requires castingCycle0 or activeCycle1 and the owned
canonical seat. Hosted Philia and operational berth checks remain activeCycle1.
Untouched `about:blank` or foreign-origin surfaces skip first-failure actor observation
before importing App modules; mounted original App surfaces still run the full observer.
The diagnostic skip gives no actor/readiness/proof credit. Original identity, UID,
server/SDK authority, generation/hydration, epoch, seat/map, target and cleanup floors
are unchanged. This source correction has no runtime or rendered acceptance claim.

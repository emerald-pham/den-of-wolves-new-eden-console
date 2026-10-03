# PC07 independent risk review brief

Review the complete reconciled candidate against baseline/current main
`5e3d09d56a50aa712406a6f3cb6b64a81e70418e`. This brief is navigation, not approval.
The owner supplies the exact candidate SHA at dispatch. Use independent
GPT-6.1 Sol **xhigh** for the complex authority/privacy scope. Return all
actionable findings together with exact paths, reproduction and consequence;
the implementation owner repairs them. Follow-up is bounded to unresolved
findings or materially changed risk.

The [49-ID matrix](PC07_ACCEPTANCE_MATRIX.md), [execution record](PC07_EXECUTION_RECORD.md)
and [report](PC07_PLAYTEST_REPORT.md) separate implementation, normal local
gameplay, prepared UI, review, CI and production deployment. The October 2
owner correction authorizes future normal authenticated local/emulator proof;
it retains all functional criteria, independent review, CI and deployment.
PC08 and P605a gain no scope or completion credit. Private source material
stays outside Git; consult its routed index only for a concrete mechanic
question and paraphrase concise findings.

## Current authority and information boundaries

- Review `memberSession.ts`, its callable factory, join/resume adapters,
  `firestore.rules`, the ordinary member polling feed, App callbacks and actual
  store/client consumers together. GM-only raw root reads close a demonstrated
  foreign craft/cargo/host/history leak. The callable derives the actor's
  current group in one transaction and allowlists local vessel/craft fields.
  Press uses its entitled public header/SNN information. Ordinary members
  cannot select another audience or fall back to default foreign vessels.
- Cover role/group/connection-generation changes, malformed topology,
  wrong actor/session, kicked or disconnected actors, delayed old responses,
  stale persisted state and immediate withdrawal during a group transition.
  Preserve one shared cycle/phase clock and valid current console authority.
  Hosted small craft, Voyage, local repair ledgers and own retained craft must
  remain usable without disclosing foreign fields or resetting printed limits.
  Five repair ledgers retain their total host-use count and current local
  details only. Earlier foreign drone/service use becomes a strict cycle and
  revision marker. Review wire parsing and every actual repair consumer:
  withheld hosts must not restore a used action, waive second-host fuel, or
  fabricate a host/console label. The authoritative full server ledger is
  unchanged by these read-only projections.
- Review fleet partition/rejoin, notes, scout taxi passenger/fuel transfer,
  known-system sharing and navigation reads in `index.ts`, `fleetGroups.ts`,
  `fleetPartition.ts`, `fleetGroupOperations.ts` and `navigationProjection.ts`.
  Requests bind current actor/role/group/host, revisions and stable identity;
  mutation, private audit, receipts and audience projections commit together.
  No caller supplies hidden chart facts, arbitrary recipients, pursuit result
  or position. Exact replay must preserve its result without new writes.
  Navigation and topology have independent monotonic counters: physical
  partition/rejoin must increment current topology even after a taxi changed
  membership without navigation. No-op/replay preserves both, and null,
  malformed or exhausted topology authority cannot commit unsafe writes.
  Physical vessel movement must also advance shared navigation independently
  of that vessel's cursor; an earlier taxi or split must not cause the global
  revision to roll back. For mission lifecycle after an absorbed group, derive
  the current holder's uniquely pointer-matched physical group, source lineage,
  berth and navigation in the transaction. Shared historical lineage alone
  must not grant a foreign descendant's delivery location. Preserve immutable
  mission admission and deny absent/ambiguous custody before any write.
- An in-flight route is visible only when both validated endpoints belong to
  the current group. Partition changes revoke/rebind its audience. Current
  group navigation emits sampled positions at one instant, never the private
  route chain or a foreign destination. Rejoin preserves per-ship knowledge
  and applies the logged highest-pursuit assumption once.

## Automatic Comms scouting

Review the internal committed-request continuation and its durable Firestore
request-create trigger together with the original protected GM resolver. The
server verifies the exact request fingerprint/reply and cadence before looking
up one fact on the current locked chart. Result, note, audit, Nebula marker and
ship-map fanout must be atomic and exactly replayable across event retry and
group merge. A committed legal scan survives requester disconnect; current
reader authority governs later delivery. The automatic path is not a callable
client-selected authority. Its audit has no fabricated facilitator UID.
Check `listGmScoutResolutionLog` and current GM/player report consumers for
owned-instance authorization, bounded allowlists, delayed old responses,
serial polling and withdrawal on group/identity/generation/connection changes.
Direct chart, result, note and audit reads remain denied by Rules.

## Automatic attack, timing and recovery

- Review attack math, ring configuration, lifecycle, target actions, boarding,
  audience schema and real callable adapters together. Five/six/seven target
  configurations must use their actual enabled vessels; failed configuration
  cannot fabricate a target, result, damage or defence.
- Normal GM preparation submits server targeting with no per-card target
  transcription or fabricated player-owned benefit. Legacy stored draft mode
  and target annotations do not change source rolls and grant no intervention
  authority. The old stage retry is explicitly collapsed recovery, governed by
  real pending choices, shared holds, deadline and revision. Review the current
  GM form against the actual endpoint contract and readonly pending status.
- Reasoned targeting recovery requires the actual 8–400 character reason and
  explicit danger confirmation, expected revision, request identity and a
  strictly parsed scoped before/after receipt. Review exact replay and stale
  concurrent GM denial. The active-attack global emergency pause/resume path
  must use the same reasoned authority; the legacy non-attack clock endpoint
  must not bypass attack intervention checks. Ordinary phase extension and
  skip/override commands must deny a declared attack even after its deadline.
  Correlate nested pause/delta fields and forbid unexpected receipt fields;
  current GM identity and attack revision also govern delayed client hydration.
  Immutable committed rolls and choices have no rollback permission.
- Gorgoneion's current admitted Captain makes the printed before-targeting
  use/pass and local target choice. Valid current-cycle server charge is the
  recovered projector readiness model; PC07 adds no small-ship damage deck.
  Positive population, mutiny and any recognized explicit damage/destruction
  denial still gate use. Review current host/group privacy, stale offers,
  genuine disconnected pending choice, exact retry and final reduction once.
  Exact Captain replay is checked before demanding a pending-stage view, but
  after validating current Captain identity, admission, group, berth/host,
  docking revision, population/mutiny and committed-cycle charge. It must replay
  after automatic targeting/range/final progression with no new dice or writes;
  a new command or lost current authority remains denied.
- Declaration owns lock/parking/state/event atomically. Server randomness is
  committed before choices that depend on it; hidden assignments and modifiers
  remain private. Crew and GM projections are separate, direct privileged
  writes denied, and future-schema rejection revokes old visible state.
- Genuine current entitled player action/pass, target and boarding choices
  survive reconnect and exact retry. Unconfigured source actions are audited
  unavailable; a configured disconnected actor stays pending. Printed charged
  Missile/PDL actions remain reusable in their applicable ranges. Short Range
  fighter-first eligibility, destruction effects, full hit/unused-hit audit,
  survivor arithmetic and five-step order need complete source-consumer proof.
  Review all five player choice panels (Commander, C&C, Captain, range and
  boarding) and member-audience listener:
  cache/offline, identity, group, generation, host and console changes withdraw
  enabled controls immediately; manual reads and mutations bind their delayed
  callbacks to current authority. Repeated identical revisions preserve drafts,
  while a new attack/stage/revision resets them. Range reads must be serialized
  and obsolete reads must not replace current choices. Malformed or future
  audience schemas withdraw visible data and retain the raw revision fence.
  A current failed read withdraws the previous bound choices; an obsolete failure
  cannot clear a newer read. Fixture-enabled props confer no live role authority.
  Printed C&C activation is optional: explicit current-EO pass must be audited,
  consume no charge or redirect, exactly replay, reject stale/wrong actors and
  let the normal automatic targeting lifecycle continue.
  The current GM decision summary uses entitled names and truthful pending,
  disconnected, source-unavailable and completed status only. Its presence
  caption is the last server reconciliation, and cached/offline/old-instance
  callbacks must withdraw private status rather than imply current authority.
- Final boarding reads the current GM alert audience before any summary write.
  Review the transaction ordering when a casualty threshold creates an alert;
  final damage, decision summary, ticker and reopening remain one atomic result.
- Any shared timer hold blocks progress. Final resolution and damage reopen
  movement and ticker atomically without resetting the preserved clock or
  Press grant. Attack replay cannot repeat damage, parking or reopening.
  The owner P159 scenario composes normal start, maintenance, transit,
  declaration, player choices and final recovery through native/HTTP/UI paths.
- Review the cycle interstitial transaction/clear endpoint and every advance
  consumer. Clearance requires the exact current hold identity; competing
  devices clear once and replay preserves time. Cached/offline shuttle,
  airspace, GM claim and sampled navigation controls fail closed and recover.

## Release and presentation

Review the exact source-bound Functions consumer inventory, including shared
helper/factory/transitive consumers in both the baseline and candidate. Unknown
tuples fail closed; no broad `functions` fallback is permitted. Preserve WIF,
production local-GM exclusion and existing deployment/auth isolation.

The solo review scene uses local callback presentations and no shared writes.
Responsive, CIC font/geometry, navigation, reduced motion, ticker handoff,
DRADIS performance and bundle gates remain required. Catalog projections and
release notes must credit only the fixed49 and preserve historical counts.
The owner supplies the evidence root and exact candidate with the dispatch;
if approved, return the structured independent review receipt bound to that
SHA. Do not add a new gate or reopen a settled source decision without a
specific code conflict.

## Follow-up to the first complete independent review

The complete review of `12114f33` returned four findings and no approval. Owner test-only commit `080c38c4` precedes source repair `b517dc4f`: reserve absorbed identities during every partition allocation; keep the automatic unavailable EO outcome inside the existing strict audience schema; retain only current actor-entitled SNN operations without foreign vessel maps; and revoke actor epoch, retained connected state and pending reads on server disconnect/removal/kick or authoritative listener denial. All five choice consumers include disconnected state in their current authority key. Red logs reproduce 11 expanded failures; eight repaired focused suites pass 276/276.

The subsequent ordinary Press UI walk exposed a route listener denied while no departure exists. Its test-only `9479d0db` precedes `581fa75c`, which rebinds the exact route after the holder's authenticated departure commits; existing route Rules and server movement authority remain unchanged. Review this additional narrow client recovery, including late callbacks and current group/identity boundaries.

Review the resolved findings and the additional route-listener, SNN hydration and five-ship parser repairs below, retaining the earlier full review's unaffected conclusions. Check `split-resplit-http.json` for normal second split/old-note retention/new-note denial plus two labeled ECM Rule fixtures, and `unavailable-eo-press-http-repaired.json` for ordinary SNN movement and the real unavailable EO continuation through publication/finalization. Verify the current105-consumer inventory source hashes and exact candidate SHA before writing an approval receipt. These are evidence pointers; their successful outcomes must be verified from the files.

The same normal Press walk found the client’s second local projection removing SNN docking/history despite server craft entitlement. Test-only `a38b7cb2` precedes `4cb06d7b`. Review the narrow independent SNN preservation in `sessionFrom`: only the server-listed SNN craft and validated manifest survive, with empty vessel maps and no generated docking while in transit. The current 190 client parsing/movement/touch checks pass.

The real eight-station attack further exposed `parseWolfTargetingReceipt` accepting only six/seven rings despite PC07's source-backed five-ship declaration. Test-only `df3cdb4c` precedes `e26b8f33`. The parser now also accepts the exact canonical base ring without Dione; arbitrary subsets, reordering and out-of-ring dice still deny.110 affected native checks pass. Review this additional shared targeting consumer, regenerate/verify its actual Functions inventory consumers, and require the new normal low-roster continuation evidence to finish.

The new normal proof at served `1e0a707a` passes all four composed checks, including actual one-minute phone Press flight, canonical five-ship targeting, all three unavailable-EO results, normal boarding, exactly-once damage/reopening and a subsequent normal Press movement request. Browser errors are empty. The current inventory binds 20 changed runtime modules and 58 index exports to 105 named Functions; the selector passes 127 checks and classifies zero unknown files. Its exact source hashes must match the dispatched candidate.

The full final gate at approved `c88dcb0a` stopped on four lint errors before broader tests. The bounded renewal reviews only test-call formatting at `790cf18a` (unchanged parameters/names/assertions), equivalent copied passenger-map omission at `0a9774f0`, and the refreshed exact source hash in the unchanged 105-Function consumer inventory. Lint now passes; five affected native suites pass 188/188. Preserve both previous reviews' unaffected conclusions, and bind any approval receipt to the new exact dispatched candidate. The failed local gate and its reason remain recorded; no candidate CI has run.

## Bounded follow-up for full-suite findings

Review the delta after approved6ac25f24: the optional-data group-note loop (test3c19aaef/sourceb755c211), and the raw nested session projection regression (test2b28b983/ed6249c3, sourcec8b27208). Verify every field returned by publicMemberSessionSource and parsedMemberSessionDetails is constructed by a domain parser or a typed explicit allowlist before memberSessionProjection applies current transactional actor/group/craft scope. Check default compatibility, strict clock context, nested unknown fields, current Press SNN entitlement, valid AEGIS Escort preservation, repair limits/foreign host redaction, terminal aggregate parsing and readonly refresh. Independently check extraction did not drop a valid existing operational field. Keep source-only repairs and separate test/fixture commits distinct.

Review fixture-only97fda4d1/53947f8c/963fcdcd against the retained broad failure and the complete case delta in PC07_TEST_INVENTORY. Unreasoned attack pause/resume now rejects; the existing positive reasoned revision-bound recovery/replay test remains. Read getters are explicit terminal exemptions, while commitWolfRangeActionChoice remains bound to the actual requireWolfRangeState guard. No test may be disabled or an authority/privacy assertion weakened.

Verify701 focused checks and the new ordinary c8b27208 runtime proof in root-takeover/member-projection-ordinary-http.json, its normal Press UI JSON/image and runtime log. This repeats real one-minute phone movement plus unavailable EO finalization after typed projection. Earlier normal split/full-attack branches remain evidence for unaffected logic, with their source boundaries retained. Recompute the proposed20/58/105 Functions inventory and compare source hashes and actual reachability; no unknown tuple or broad fallback is acceptable. Full validation, CI and production deployment still await this exact-candidate approval.

The extraction follow-up found one valid-data loss: visit sanitization derived craft IDs only from current dockings, before the transactional reader adds in-transit craft entitlement. Native failing test-only `959fc990` precedes source-only `a5471669`. The parser now recognizes all printed known craft for sanitization; final current craft/host scope remains the authority, and absent histories still derive only actual dockings. Verify local transit history is retained, foreign hosts and unknown craft are withheld, no docking is invented and refresh remains readonly. The four session/member suites pass81 checks. The ordinary Press script tests this during an actual flight; its unsupported newly created departed-event expectation was corrected separately at `1a46f91f` with the failed proof preserved. No movement writer contract changes. The refreshed inventory keeps20 changed modules,58 index exports and105 named consumers, with a new index source hash.

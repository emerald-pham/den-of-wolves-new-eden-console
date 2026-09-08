# Implementation Contract Ledger — Prompts 003, 005, 006, and 009–010

This is a documentation-only contract ledger for the first 100 prompts in
[`docs/IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md). It describes the
current repository as inspected on 2026-09-07. It does not change the plan,
mark plan items complete, or claim that a contract is playable merely because
it is described here.

## How to read this ledger

The audit status is evidence status, not a progress-bar replacement:

| Status | Meaning |
|---|---|
| `verified` | The named current implementation and/or focused tests materially satisfy the stated acceptance. The evidence is still scoped to the behavior named; it is not a claim that adjacent gameplay exists. |
| `partial` | A real primitive, route, test, or data definition exists, but at least one acceptance boundary is missing. |
| `missing` | No production-path behavior and no dedicated acceptance evidence was found for the acceptance. |
| `ambiguous` | A source or product decision must be recorded before a truthful implementation can be exposed. |
| `verified-contract-only` | This ledger defines the contract or audit target, but no product behavior is being claimed. This status is used for prompts 003, 005, 006, and 010 where the requested documentation artifact is the deliverable in this file. |

Evidence paths are repository-relative. A test target names the test that must
be added or extended when the current evidence is not enough. `index.ts`
below means `functions/src/index.ts`.

## 1. Source and ambiguity ledger — Prompt 003

The source map in the plan is authoritative for routing. Printed ship,
shuttle, fighter, console, and card sheets win over generic rules text for
specific values. A facilitator call is not a deterministic rule result: it
must be recorded as an explicit decision with the source, scope, actor, reason,
and resulting state.

### Decisions and blocked items

| ID | Source evidence | Decision or block | Implementation consequence |
|---|---|---|---|
| `AMB-01` | `docs/IMPLEMENTATION_PLAN.md` known-reference-ambiguities section; `docs/reference/den-of-wolves-new-eden/references/REFERENCE_ONLY_SHIPS.md`; `REFERENCE_ONLY_CAPYBARA_EXPANSION.md` | Treat Refinery 124 Water Reclamation as `5♦` by elimination. Treat the Capybara Scrap Refinery as `7♠`; retain the stray `5♦` as errata. | Do not infer either card from a generic card-number lookup. Catalog entries and tests must carry the decision/errata note. |
| `AMB-02` | `docs/IMPLEMENTATION_PLAN.md`; `REFERENCE_ONLY_SHUTTLES.md` | Copied shuttle names on Wobbly/Condor and Ally/Philia/Chacau sheets are not identity evidence. The ability belongs to the actual sheet and vessel ID. | Resolve by stable vessel/shuttle ID and printed sheet, not display-name matching. Add a fixture with copied names and distinct IDs. |
| `AMB-03` | `docs/IMPLEMENTATION_PLAN.md`; `REFERENCE_ONLY_WOLF_ATTACKS.md` | Wolf Commander Boarding Action text is incomplete. The consequence is a facilitator adjudication, not an invented automatic effect. | Block a fully automatic boarding resolution. Expose a facilitator decision record with source excerpt/reference, chosen consequence, actor, and audit event. |
| `AMB-04` | `docs/IMPLEMENTATION_PLAN.md`; `REFERENCE_ONLY_SHIPS.md` | AEGIS Omega badge/order conflicts with a body label. Numbered order and the 1–7 maintenance flow win. | Keep the conflict in errata. Tests should assert numbered order and reject a body-label-only implementation. |
| `AMB-05` | `REFERENCE_ONLY_SHIPS.md`; `REFERENCE_ONLY_CAPYBARA_EXPANSION.md`; `src/data/vessels/capybara.ts`; `src/data/rolePresets.ts` | Base Capybara and expansion Capybara are different modes. They must not share population, damage, jump, resource, targeting, maintenance, role, or shuttle rules by convenience. | Configuration must select one mode before casting and persist that mode. A mixed-mode payload is invalid. |
| `AMB-06` | `docs/IMPLEMENTATION_PLAN.md`; `REFERENCE_ONLY_CAPYBARA_EXPANSION.md` | Empty expansion damage deck, Boa targeting after destruction, and Macaw dismantling its own console are under-specified. | These remain blocked until a facilitator/product decision is recorded. No UI control may imply an automatic result. |
| `AMB-07` | `docs/IMPLEMENTATION_PLAN.md` “Decisions required before affected implementation” | Game scope for base/Capybara/other extra ships and the 8–18 versus 20-player presentation is unresolved. | Treat supported player count, expansion mode, and active roster as immutable setup inputs. Reject unsupported combinations before writes. |
| `AMB-08` | Same plan section; `functions/src/index.ts` event-writing paths | Random source, audit shape, replay policy, and facilitator visibility for dice, damage, Wolf composition, suspicion, and mission cards are not one shared contract. | Existing random calls are not evidence of a complete random/replay contract. Add a server-owned random seam and event envelope before broadening hidden-state actions. |
| `AMB-09` | Same plan section; `src/lib/firestore.ts`; `firestore.rules` | Hidden-information visibility across loyalty, investigation, Wolf, chart, mission, candidate, GM, observer, and facilitator views is not fully centralized. | Use the projection table below as the target contract. Until implemented, a new secret collection or snapshot field needs an explicit rules test. |
| `AMB-10` | Same plan section; `functions/src/turnZero.ts`; navigation/pursuit tests | Split-fleet pursuit, communication restriction, rescue taxi, and rejoin semantics are not defined as one state model. | Do not expose split-fleet controls based only on coordinate filtering. Add group-local projections and a rejoin decision first. |
| `AMB-11` | Same plan section; `REFERENCE_ONLY_FACILITATION.md` | Endgame success/failure for candidates N/O/P, lost ships, survivors, and closure timing is not complete. | Keep success/failure/debrief/closed transitions as blocked lifecycle edges until the product decision is recorded. |
| `AMB-12` | Same plan section; repository coordination/load guidance | The 60-client target is an unverified capacity target. | No load or deployment claim belongs in a prompt audit until measured with latency, errors, contention, retry, reconnect, and resource results. |

## 2. First-100 capability matrix — Prompt 005

This is the minimum contract shape for an action. “Authority” means the
authoritative callable/transaction or server-owned state that must decide the
action; a client control is never authority. “Audit” means the durable record
needed for replay and facilitator review, not merely a UI toast. Rows marked
`target` are required seams, not claims that the action already exists.

| Capability / prompt range | Actor | Role | Phase | Vessel / scope | Inputs | Authority | Visible result | Denial | Audit | Test surface |
|---|---|---|---|---|---|---|---|---|---|---|
| Create session / 021–023 | authenticated creator | owner/facilitator candidate | lobby | session | name, player count, chart, expansion, turn limit, request ID | `createSession` callable; transaction; join-code lock | one lobby, owner metadata, config, join code | malformed/unsupported config, collision, duplicate/conflicting request | creation request and session identity; event envelope target | `functions/src/requestGuards.test.ts`; target `createSession` callable/idempotency test |
| Join / 024–028 | authenticated player | member | lobby or permitted retained state | session | join code, display name, identity | `joinSession`; membership transaction; rules deny listing | member/player projection and route authority | unauthenticated, malformed, kicked, throttled, foreign/nonexistent code | rate-limit attempt and membership mutation | `functions/src/joinSessionCallable.test.ts`; `tests/rules/firestore.rules.test.ts` |
| Resume / 034–043 | authenticated player/device | existing member | any retained playable phase | session, intended seat | session ID, authenticated UID, device state | `resumeSession`; server lease/seat reconciliation | current authoritative session/player/seat and stale-cache handling | foreign session, kicked player, active other membership | reconnect/presence/seat reconciliation | `functions/src/sessionResumeCallable.test.ts`; `functions/src/sessionLifecycleCallable.test.ts` |
| Presence / 036–039 | authenticated member device | member | lobby through active | player/session membership | own allowed presence fields, heartbeat | callable/rules owner-field boundary; server timestamp | connected/last-seen state | other UID, membership, seat, role, or game-state mutation | lease timestamp and expiry result | `tests/rules/firestore.rules.test.ts`; lifecycle tests |
| Seat claim/release / 029–033 | authenticated member | eligible player | lobby/casting before lock | printed seat | seat ID, expected ownership/revision | seat callable transaction | one seat/player pointer and roster update | occupied, stale, foreign seat, duplicate ownership | seat event and conflict result | `functions/src/seatCallable.test.ts`; `functions/src/seatPolicy.test.ts` |
| GM instance / 044–050 | authenticated eligible facilitator | GM/facilitator | setup and permitted GM phases | GM instance / observed vessel | instance ID, device label, scoped mode | `claimGmInstance` and GM access policy | read-only or authorized GM route | ordinary/stale/revoked/foreign grant, client GM flag | claim, lock, mode change | `functions/src/gmSessionCallable.test.ts`; `functions/src/gmAccess.test.ts`; `functions/src/gmControlsLock.test.ts` |
| Roster selection / 004, 051–058 | facilitator | active GM/facilitator | lobby before casting lock | session roster | player count, Dione/Capybara mode, Union/optional toggles | server roster catalog and configuration validator | active role/vessel roster | unsupported count, Dione below threshold, mixed Capybara mode, invalid Union | configuration revision and decision record | `src/data/rolePresets.test.ts`; `functions/src/roleConfiguration.test.ts`; `functions/src/gameSetup.test.ts` |
| Ship preference / 059 | player; facilitator resolves conflicts | member; facilitator adjudicates | casting | preferred vessel/role | nonbinding preference and revision | target callable; facilitator tie-break | own preference; no false assignment promise | locked casting, invalid role, oversubscription not auto-resolved | preference record and tie-break decision | target `castingPreferenceCallable.test.ts` |
| Role assignment / 060–062 | facilitator | active facilitator | casting unlocked | player + printed role/vessel | target player, role, request/revision | target assignment callable; transaction; `roleAssignmentDecision` policy | assigned player sees own brief/role; roster updates | unauthorized, locked, invalid role, duplicate holder, illegal Union | assignment/release/reassignment event | `functions/src/gameSetup.test.ts`; target callable/rules tests |
| Role brief / 063, 085 | member | assigned role | briefing/active/reconnect | assigned role and vessel | authenticated UID, session/revision | role-private projection at data boundary | own brief and common rules only | another member, unassigned, stale/foreign session | private-read/audience audit without secret payload leakage | target `rolePrivateProjection.test.ts`; rules test |
| Loyalty assignment / 064–067 | facilitator assigns; member reads own | facilitator; loyalty holder | casting/briefing before lock | player loyalty | loyalty kind, suspicion, Friend pair, Android proof | server secret docs + projection; facilitator-only census | own loyalty/suspicion; authorized census | member querying another secret, malformed pair, post-lock mutation | secret assignment/reveal/disclosure event | `functions/src/gameSetup.test.ts`; target loyalty callable/projection/rules tests |
| Craft ownership / 068 | server/facilitator setup | printed role holder | briefing/start | shuttle/fighter wing | active role roster and vessel mode | server catalog/setup transaction | owned craft in role-private/member-allowed view | client claim, inactive role, mixed mode | ownership initialization event | `functions/src/shuttlecraft.test.ts`; target setup composition test |
| Population/stores/security / 069–070 | server setup | facilitator observes | start | each active vessel | roster/mode | authoritative initialization transaction | permitted census/crew state | client edits, inactive vessel, negative/non-printed values | initialization snapshot/event | `src/data/printedPopulation.test.ts`; `functions/src/resources.test.ts`; target start fixture |
| Readiness / 071–073 | facilitator | active facilitator | lobby/casting/briefing | whole session | members, seats, roles, loyalties, craft, GM responsibilities | readiness policy; no client-only gate | nonsecret reason list and responsibility status | missing/duplicate/incomplete setup | readiness revision and failed-start audit | `functions/src/gameSetup.test.ts`; target readiness callable test |
| Start / 074–078 | authorized facilitator | active eligible GM instance | ready briefing | whole session/fleet groups | request ID, expected setup revision | target `startGame` transaction | active Turn 1, locked setup, timers, pursuit, durable announcement | wrong actor, stale revision, incomplete setup, duplicate request | one start event and idempotency result | target `startCallable.test.ts`; `functions/src/turnZero.test.ts` |
| Turn 1 timing / 079–081, 091–098 | facilitator/server scheduler | GM/facilitator for control; members read | Team then Coordination | session/phase | server time, phase revision, pause/extension request | `turnZero`, `advanceTurn`, timer callables; server timestamps | phase, remaining time, announcement, replay | wrong phase, stale revision, unauthorized pause/extension, duplicate expiry | transition/announcement/pause events | `functions/src/turnZero.test.ts`; `functions/src/turnStartReplayCallable.test.ts`; `functions/src/fleetAlertCallable.test.ts` |
| Public snapshot / 082–083, 088–090 | member/observer | member or entitled observer | any readable phase | session/fleet | session read and revision | Firestore rules + projection layer target | permitted turn, phase, active vessels, public status | nonmember, disconnected player, stale overwrite, hidden fields | revision and replay cursor | `tests/rules/firestore.rules.test.ts`; target projection/redaction test |
| Crew vessel state / 084 | member | crew of vessel | active Team/Coordination | assigned/entitled vessel | session snapshot, crew membership | crew projection + rules | permitted ship resources/actions/status | other vessel’s private facts, unrelated loyalty/role data | audience-scoped snapshot/revision | `src/components/FleetConsoleWorkspace.test.tsx`; target crew projection test |
| Facilitator private state / 086 | facilitator | authorized GM/facilitator | setup through debrief | session census/hidden state | GM instance authorization | GM-private projection and rules | census, suspicion, notes, hidden resolution state | member/observer/client direct secret read | GM audit event with redacted payload | `functions/src/gmSessionCallable.test.ts`; target facilitator projection/rules test |
| Direct-write boundary / 087 | any client | any | all | sessions, seats, roles, secrets, events, ships, shuttles, clocks, outcomes | Firestore rules deny; callable is only writer | no client write result; callable result only | unauthenticated/unauthorized/direct collection write | denied attempt is test evidence; authoritative callable event on success | `tests/rules/firestore.rules.test.ts` |
| Team actions / 099 | member/facilitator where printed exception applies | role/vessel authority | Team Phase | vessel, docked craft, console | action-specific resource/charge/revision inputs | maintenance/charge/ration/fuel callable | costs, production, alerts, permitted crew result | Coordination phase, wrong role/vessel, damaged/unavailable console, stale revision | maintenance/action event and retry identity | `functions/src/maintenanceCallable.test.ts`; `functions/src/maintenance.test.ts`; target explicit phase-gate tests |
| Coordination actions / 100 | member/facilitator where printed exception applies | role/holder authority | Coordination Phase | vessel, shuttle, fleet group | destination, route, cargo/mission/action inputs | movement/jump/transfer callable | authoritative movement/result and permitted local projection | Team phase, wrong holder/role, invalid route, stale revision | navigation/action event; no hidden coordinates | `functions/src/jumpCallable.test.ts`; `functions/src/navigation.test.ts`; target phase-gate tests |

## 3. Information projections and redaction rules — Prompt 006

Projection is an allowlist, not a “remove a few secrets” transform. The server
must construct each audience view from authoritative state. Firestore rules are
the data boundary; route hiding or a redacted React component is not sufficient.

| Projection | May contain | Must exclude | Reader boundary |
|---|---|---|---|
| Public | session existence only where the product deliberately publishes it; current public phase/turn; active vessel identities; permitted public fleet status; durable public transmissions; public revision | join-code enumeration; member identity beyond published policy; role/loyalty/briefs; deck order; candidate bonus; private notes; hidden coordinates; GM-only result | no general public collection listing; use a server/public projection if public spectators are later supported |
| Member | public fields plus own player identity, own route authority, own seat/connection state, permitted roster/census, and public event stream | another player’s private role, loyalty, suspicion, private card, hidden target, facilitator note, hidden deck, unrelated vessel private state | authenticated active member; disconnected/foreign member denied by rules |
| Crew | member fields plus the crew’s permitted vessel state: allowed resources, damage/status, console availability, docked craft facts, and action results | another crew’s private controls, role-private brief, loyalty, hidden coordinates, unentitled shuttle/group counts, facilitator notes | authenticated member whose server-authorized role/seat/crew scope matches the vessel |
| Role-private | the member’s assigned role ID/brief, common rules, own role-owned craft, own private decisions, and explicitly permitted role facts | any other role’s brief/loyalty/card; hidden global assignment; facilitator-only census; unearned control | exact authenticated player UID and current assignment; reconnect rehydrates only this UID’s projection |
| Loyalty-private | the holder’s loyalty kind, suspicion, Friend partner if printed/assigned, Android proof, and allowed self-disclosure state | all other loyalty records; global Wolf composition; unrelated Friend links; facilitator notes; private investigation results | exact holder UID; direct query by another member denied at rules/projection layer |
| GM / observer | GM-authorized public/member/crew inspection, selected ship read-only state, public event log, and scoped controls only where callable authority grants them | automatic mutation authority from local mode; unselected ship write scope; hidden secrets not granted to that GM instance | active eligible GM instance; observer resets scope when ship changes; all writes callable-only |
| Facilitator-private | authorized census, all setup readiness reasons, suspicion/loyalty census as policy allows, hidden resolution state, random outcomes, adjudication notes, and audit trail | client-writable authority; secrets that product policy intentionally withholds from a particular facilitator responsibility | explicit facilitator responsibility/instance, not merely `role === 'gm'`; exact scope must be recorded |

### Redaction invariants

1. A projection is computed from server state and an authenticated audience
   context; client-supplied audience, role, vessel, or `visibleToUids` is not
   authority.
2. Hidden data is absent, not `null`, masked with a stable placeholder, or
   included in an event that a lower audience can read. Event payloads follow
   the same audience allowlist as snapshots.
3. Counts, event timing, document existence, array length, and error text must
   not disclose a hidden loyalty, deck order, candidate bonus, split-fleet
   location, or facilitator note indirectly.
4. Reconnect and revision reconciliation may replace a projection with newer
   authority but may not widen its audience. A stale snapshot can render a
   stale indicator; it cannot authorize a mutation.
5. Direct reads and direct writes are tested separately. A member reading a
   session header does not imply permission to read every subcollection, and a
   GM reading a secret does not imply permission to write it.
6. After debrief, the product must apply the recorded endgame visibility
   decision. Until that decision is complete, completed hidden outcomes stay
   facilitator-private.

## 4. Deterministic ATDD fixture seams — Prompt 009

No production authority may be bypassed merely to make a test convenient. A
fixture is a deterministic input builder and reader; the callable, transaction,
rules emulator, projection, and audit path remain the system under test.

| Seam | Required shape | Determinism rule | Required negative use |
|---|---|---|---|
| `memberFixture` | authenticated UID, device ID, display name, membership/connection state, role/seat pointers | explicit IDs; no random default UID | foreign UID, disconnected member, kicked member |
| `configurationFixture` | player count, chart, expansion, turn limit, toggles, setup revision | explicit config; reject unsupported values before persistence | mixed Capybara modes, Dione below threshold, duplicate/unknown options |
| `roleFixture` | stable role ID, printed vessel, role kind, active/inactive state, Union pairing | source-catalog IDs only; no UI label as identity | duplicate role, invalid Union replacement, inactive role assignment |
| `vesselFixture` | vessel ID, variant/mode, population, resources, damage, security, console state | construct from server/catalog data; never import React state into Functions | base/expansion Capybara mix, inactive vessel, negative resource |
| `shuttleFixture` | stable shuttle ID, sheet identity, holder UID/role, host vessel, capability flags | preserve copied display names but distinct IDs | wrong holder, wrong host, noncombat craft in combat |
| `clockFixture` | server `now`, turn, phase, phase revision, start/end instants, pause state | inject a fixed clock; never use wall-clock sleep | stale deadline, wrong phase, duplicate expiry, client-time attempt |
| `randomFixture` | deterministic random source for dice, card/deck choice, Wolf composition, suspicion, mission cards | seed or scripted sequence recorded in the fixture; production audit still records the result | exhausted sequence, retry with same request, hidden random result to member |
| `snapshotFixture` | minimal Firestore-like authoritative snapshots for session/player/role/secret/event | explicit existence and fields; no fabricated client write | missing document, foreign member, stale revision, malformed field |
| `privateReaderFixture` | reader UID, role/facilitator responsibility, vessel/group scope, requested projection | projection computed from reader context, not pre-redacted fixture data | another UID’s brief/loyalty, member reading GM state, split-group leak |
| `callableHarness` | authenticated callable request, Firestore transaction mock/emulator, request ID, expected revision | request ID and all server time/random inputs are explicit | retry same request, conflicting request ID, direct Firestore write |
| `eventReaderFixture` | event ID, envelope fields, audience and replay cursor | stable event IDs and revision ordering | duplicate replay, lower-audience event, missing required envelope field |

The minimum composition target for Prompt 009 is a production-path scenario:
create a configured lobby, join two or more authenticated members, claim
seats, assign a role, create a private record, attempt an unauthorized read,
and assert that the callable/rules boundary—not fixture setup—produces the
allowed and denied results. A true lobby-to-Team-Phase fixture remains a
separate missing acceptance for Prompt 020 until casting, start, lifecycle,
and private setup are real.

## 5. Prompt-by-prompt audit — Prompt 010

This audit covers prompts 001–100 only. It names the strongest current evidence
and the next test target where evidence is insufficient. `verified` means the
current contract is materially exercised; it does not mean every future
composition or hidden-state story is complete.

| Prompt | Status | Current evidence / next test target |
|---:|---|---|
| 001 | verified | `docs/IMPLEMENTATION_PLAN.md` source map and `docs/reference/den-of-wolves-new-eden/REFERENCE_ONLY_OVERVIEW.md`; target source-map link audit if routes change. |
| 002 | verified | `docs/IMPLEMENTATION_PLAN.md` source-precedence policy and routed reference files; target conflicting-value catalog test. |
| 003 | verified-contract-only | This ledger §1 records known ambiguity decisions/blocks; runtime decision records remain future work. |
| 004 | partial | `src/data/rolePresets.ts`, `functions/src/roleConfiguration.ts`, and `src/data/rolePresets.test.ts`; current presets extend through 21 and do not alone prove every 8–18 setup projection. Target full matrix composition test. |
| 005 | verified-contract-only | This ledger §2 defines the required capability columns; target callable-by-callable matrix assertion. |
| 006 | verified-contract-only | This ledger §3 defines seven projections and redaction invariants; target serialized projection/rules tests. |
| 007 | verified | `functions/src/eventEnvelope.ts` defines the shared envelope and `functions/src/eventEnvelope.test.ts` validates required fields, counters, timestamps, and visibility. Existing mutation paths still need migration to this envelope. |
| 008 | verified | `functions/src/lifecycle.ts` and `functions/src/lifecycle.test.ts` define and reject the explicit lobby/casting/briefing/active/success/failure/debrief/closed/retained-empty edges. Callable migration for every edge remains future work. |
| 009 | partial | `functions/src/atddFixtures.ts` and `functions/src/atddFixtures.test.ts` provide deterministic members, roles, vessels, shuttles, clocks, random sources, snapshots, readers, configurations, and requests; the full rules-emulator composition remains a target. |
| 010 | verified-contract-only | This table audits 001–100 with status and named evidence/targets; it is an audit artifact, not green runtime proof. |
| 011 | partial | `functions/src/joinCodeSecurity.ts`, `functions/src/joinCodeSecurity.test.ts`, and join callable tests cover validation/throttling; lifetime/alphabet/collision policy is not one recorded callable contract. Target session-code contract test. |
| 012 | partial | Retry-safe behavior exists in selected callables such as `functions/src/maintenanceCallable.test.ts` and `functions/src/sessionLifecycleCallable.test.ts`; no universal command idempotency contract covers all first-100 mutations. Target command replay matrix. |
| 013 | verified | `functions/src/turnZero.ts`, `functions/src/sessionLifecycle.ts`, and server timestamp use in `functions/src/index.ts`; target emulator clock-skew/reconnect test. |
| 014 | partial | revision fields and client parsing in `src/lib/firestore.ts` exist, but stale snapshots are not one universal mutation guard. Target stale-revision projection and callable test. |
| 015 | partial | `functions/src/index.ts` uses Firebase callable errors and focused tests assert several codes; taxonomy is not centrally normalized for all listed cases. Target error taxonomy table/test. |
| 016 | verified | `functions/src/sessionResumeCallable.test.ts`, `functions/src/sessionLifecycleCallable.test.ts`, and `tests/rules/firestore.rules.test.ts`; target multi-device reconnect composition. |
| 017 | partial | Stable IDs are used throughout `src/types/game.ts`, data catalogs, and Functions paths; typed IDs for groups, missions, attacks, and every event are not unified. Target typed-ID catalog compile/test. |
| 018 | verified | `functions/src/actionMetadata.ts` and its tests define Team/Coordination actor and phase gates; `functions/src/index.ts` applies the gate to movement, jumps, and maintenance when a server phase clock exists. The remaining action families are future matrix rows. |
| 019 | partial | GM event-log paths and rules tests exist, but audience-safe event payloads are not centralized. Target event redaction test. |
| 020 | missing | No production-path create→join→cast→start→Turn 1 fixture was found. Target `functions/src/sessionComposition.test.ts` with emulator/rules boundary. |
| 021 | verified | `functions/src/requestGuards.test.ts`, `functions/src/gameSetup.test.ts`, and `functions/src/createSessionCallable.test.ts` cover unsupported configuration and duplicate-option rejection before writes. |
| 022 | partial | `functions/src/index.ts` and `functions/src/createSessionCallable.test.ts` cover atomic lobby/config/player/membership creation; the creation record is durable, but a standardized event-envelope write is still a target. |
| 023 | verified | `createSession` stores `sessionCreationRequests/{uid}_{requestId}` and `functions/src/createSessionCallable.test.ts` proves the same reply is replayed without a second write. |
| 024 | verified | `functions/src/joinSessionCallable.test.ts` and `tests/rules/firestore.rules.test.ts`. |
| 025 | verified | `functions/src/joinCodeSecurity.test.ts` and `functions/src/joinSessionCallable.test.ts`; no session listing is allowed by `tests/rules/firestore.rules.test.ts`. |
| 026 | verified | `functions/src/joinSessionCallable.test.ts` and active-membership transaction paths in `functions/src/index.ts`. |
| 027 | verified | `functions/src/joinSessionCallable.test.ts` covers limiter ordering and non-enumerating failures. |
| 028 | verified | `tests/rules/firestore.rules.test.ts` session-header/member/listing cases. |
| 029 | verified | `functions/src/seatCallable.test.ts` and `functions/src/seatPolicy.test.ts`. |
| 030 | verified | `functions/src/seatCallable.test.ts` transaction assertions. |
| 031 | verified | `functions/src/seatCallable.test.ts` race/conflict coverage. |
| 032 | verified | `functions/src/seatCallable.test.ts` release paths. |
| 033 | verified | `functions/src/seatCallable.test.ts` stale/foreign release denial. |
| 034 | verified | `functions/src/sessionResumeCallable.test.ts` and `src/lib/sessionService.test.ts`. |
| 035 | verified | `functions/src/sessionResumeCallable.test.ts` intended-seat reconciliation cases. |
| 036 | verified | `tests/rules/firestore.rules.test.ts` own presence-field boundary. |
| 037 | verified | `functions/src/sessionLifecycle.test.ts` and `functions/src/sessionLifecycleCallable.test.ts` presence lease behavior. |
| 038 | verified | `functions/src/sessionLifecycle.test.ts` stale presence expiry. |
| 039 | verified | `functions/src/sessionLifecycleCallable.test.ts` seat reconciliation on expiry. |
| 040 | verified | `functions/src/sessionLifecycle.test.ts` retention/deletion deadline behavior. |
| 041 | verified | `src/lib/sessionService.test.ts` local disconnect/outbox behavior. |
| 042 | verified | `src/lib/sessionService.test.ts` queued disconnect replay and ownership safety. |
| 043 | verified | `src/App.test.tsx`, `src/routes/Landing.test.tsx`, and session service tests. |
| 044 | verified | `functions/src/gmAccess.test.ts`, `functions/src/consoleRolePolicy.test.ts`, and route mode tests. |
| 045 | verified | `functions/src/gmSessionCallable.test.ts` and `functions/src/gmAccess.test.ts`. |
| 046 | verified | `functions/src/gmSessionCallable.test.ts` invalid elevation cases; rules tests deny GM field writes. |
| 047 | verified | `src/routes/RoleSelect.test.tsx`, console shell tests, and console role policy. |
| 048 | verified | `src/routes/GmConsole.test.tsx`, `functions/src/gmSessionCallable.test.ts`, and GM controls tests. |
| 049 | verified | `functions/src/gmControlsLock.test.ts` and GM route behavior. |
| 050 | verified | `src/routes/RoleSelect.test.tsx`, `src/routes/GmConsole.test.tsx`, and navigation/session tests. |
| 051 | partial | `src/data/rolePresets.ts` and `functions/src/roleConfiguration.ts` provide casting rows, but the current data also includes 19–21 and does not prove a complete setup roster projection. Target player-count composition test. |
| 052 | verified | Dione role/data gating in `functions/src/roleConfiguration.ts`, `src/data/rolePresets.test.ts`, and Dione-related callable tests. |
| 053 | verified | `functions/src/roleConfiguration.test.ts` and role preset tests cover Union substitutions. |
| 054 | verified | `functions/src/wolfAssignment.test.ts` and `functions/src/wolfAssignment.ts`. |
| 055 | missing | No dedicated Intelligence Agent setup authority/private projection was found. Target `loyaltySetupCallable.test.ts`. |
| 056 | missing | No complete Universal Arbour/Wolf Cult setup authority was found. Target optional-loyalty configuration test. |
| 057 | partial | `functions/src/gameSetup.ts`, `functions/src/gameSetup.test.ts`, `functions/src/requestGuards.ts`, and `src/types/game.ts` validate/store modes; casting lock and base/expansion setup composition remain absent. |
| 058 | partial | Capybara role/vessel catalogs exist in `src/data/rolePresets.ts` and `src/data/vessels/capybara.ts`; authoritative expansion initialization is not complete. Target expansion roster composition test. |
| 059 | verified | `setShipPreference` in `functions/src/index.ts` stores a nonbinding active-vessel preference with a setup revision and `functions/src/castingCallable.test.ts` covers success, invalid vessel, and lockout. |
| 060 | verified | `assignRole` in `functions/src/index.ts` uses a verified facilitator instance, active-role roster, and transaction; `functions/src/castingCallable.test.ts` covers the assignment path. |
| 061 | verified | `roleAssignmentDecision` plus the `assignRole` transaction reject duplicate player/role holders and invalid Union combinations; focused policy and callable tests are green. |
| 062 | missing | No release/reassign path covering seat, role, craft, and private pointers was found. Target reassignment composition test. |
| 063 | missing | No role-private brief collection/projection path was found. Target role-private rules/projection test. |
| 064 | missing | No complete loyalty-private card projection was found. Target loyalty projection/rules test. |
| 065 | verified | `loyaltyAssignmentDecision` and the loyalty callable validate the printed suspicion choices for fleet loyalist, Wolf, Intelligence, Arbour, Cult, Friend, and Android; `functions/src/gameSetup.test.ts` and `functions/src/loyaltyCallable.test.ts` cover the values. |
| 066 | verified | `assignLoyalty` writes reciprocal Friend records with target-only visibility and `functions/src/loyaltyCallable.test.ts` covers the pair and malformed values. |
| 067 | verified | `revealAndroidProof` requires the caller's own Android secret, writes only a proof flag, and records a public disclosure event; focused callable tests cover Android and non-Android denial. |
| 068 | verified | `functions/src/shuttlecraft.test.ts`, `src/data/shuttles.test.ts`, and role/vessel catalogs provide printed ownership primitives; full start composition remains a target. |
| 069 | partial | `src/data/printedPopulation.test.ts`, `functions/src/resources.test.ts`, and ship population callables cover catalogs/current state; one authoritative start initializer for every active mode is missing. |
| 070 | partial | security/resource primitives exist in `functions/src/resources.ts` and callable tests; printed start initialization across all rosters is not composed. |
| 071 | verified | `readinessForSetup` and `startGame` consume connected players, assignments, loyalty records, facilitator responsibilities, active roles, and vessels; `functions/src/startCallable.test.ts` covers precise blocked reasons. |
| 072 | verified | `startGame` sets `configurationLocked`; `requireCastingWindow` makes preference, assignment, release, and loyalty callables reject afterward. Preference lock and start tests cover the boundary. |
| 073 | verified | `setFacilitatorResponsibility` and `startGame` require distinct `main` and `assistant` responsibilities; `functions/src/startCallable.test.ts` covers the representation. |
| 074 | verified | `startGame` requires an active GM instance owned by the authenticated caller through `requireFacilitatorInstance`; the start callable test exercises the authorized path. |
| 075 | partial | `startGame` atomically transitions to active Turn 1, locks setup, starts timers, initializes pursuit, writes the start result and event; full deck/craft/resource composition remains a target. |
| 076 | verified | `sessionStartRequests/{sessionId}_{requestId}` stores the start reply and `functions/src/startCallable.test.ts` proves a retry returns it without another mutation. |
| 077 | missing | Pursuit primitives exist in `src/data/pursuit.ts`, but start-time per-group initialization is absent. Target start pursuit initialization test. |
| 078 | verified | `normalizeSessionConfiguration` accepts only 6–8 and `startGame` locks the persisted configuration at the selected setup revision; validation and start tests cover both boundaries. |
| 079 | verified | `functions/src/turnZero.ts`, `functions/src/turnZero.test.ts`, and timer tests cover Turn 1 extensions. |
| 080 | missing | No facilitator-marked approximate first-attack timing state was found. Target attack-window decision record test. |
| 081 | verified | `functions/src/turnStartReplayCallable.test.ts`, `functions/src/turnZero.test.ts`, and `src/components/TurnStartAnnouncement.test.tsx`. |
| 082 | partial | `src/lib/firestore.ts` and UI snapshot components expose public/session state; no explicit seven-audience projection/redaction implementation proves the full boundary. Target public snapshot serialization test. |
| 083 | verified | `tests/rules/firestore.rules.test.ts` member/nonmember and disconnected read cases. |
| 084 | partial | `src/components/FleetConsoleWorkspace.test.tsx` and ship-state parsing provide crew UI primitives; per-ship crew projection/redaction is not centralized. |
| 085 | missing | No role-private reconnect projection was found. Target reconnect-private-state test. |
| 086 | partial | `functions/src/gmSessionCallable.test.ts`, GM event/log paths, and rules tests cover some GM reads; census/suspicion/notes projection is incomplete. |
| 087 | verified | `tests/rules/firestore.rules.test.ts` broadly denies direct gameplay writes to sessions, seats, secrets, events, damage, clocks, and state. |
| 088 | partial | revision fields and client parsing exist in `src/lib/firestore.ts`; a complete delayed-snapshot ordering assertion across projections is missing. |
| 089 | missing | Existing replay tests cover selected announcements, not general event replay/reconstruction without duplicate effects. Target event replay composition test. |
| 090 | missing | No serialized public/crew redaction proof covering hidden loyalty, deck, candidate, and facilitator fields was found. Target projection redaction test with forbidden-key assertions. |
| 091 | partial | `functions/src/turnZero.ts` has server-owned `TurnPhase`; `src/types/game.ts` lacks one complete turn entity with phase revision/endgame state. Target turn entity schema test. |
| 092 | partial | `functions/src/turnZero.ts` and `functions/src/maintenanceCallable.test.ts` cover restricted/team timing, but complete duplicate/illegal transition coverage is not one transition machine. |
| 093 | partial | `functions/src/turnZero.ts` and `functions/src/index.ts` have open-airspace transitions; target explicit late-Team/Coordination transition test. |
| 094 | verified | `functions/src/turnZero.ts` duration helpers and `functions/src/turnZero.test.ts`. |
| 095 | verified | `functions/src/turnZero.ts` duration helpers and timer component tests. |
| 096 | verified | `functions/src/turnZero.test.ts` Turn 1-only duration coverage; target reconnect/retry composition if timer storage changes. |
| 097 | verified | `functions/src/turnZero.test.ts`, `functions/src/gmControlsLock.test.ts`, and timer pause callables. |
| 098 | partial | transaction/transition paths exist, but one explicit simultaneous-expiry idempotency assertion was not found. Target phase-expiry race test. |
| 099 | partial | `functions/src/maintenanceCallable.test.ts` and `functions/src/turnZero.test.ts` cover some Turn 0/phase guards; complete maintenance/rations/charging/fuelling wrong-phase matrix is a target. |
| 100 | partial | `functions/src/jumpCallable.test.ts`, `functions/src/navigation.test.ts`, and jump/move callables exist; a complete Coordination-only gate for movement, transfer, scouting, research, and jumps is not proven. Target coordination-action gate matrix. |

## 6. Contract closure criteria

The following are required before claiming the first-100 contract slice is
implemented rather than documented:

- Prompts 003, 005, 006, 009, and 010 have corresponding executable or
  emulator-backed acceptance where their tables identify a test target.
- Every `partial`, `missing`, or `ambiguous` row has either a bounded vertical
  implementation with a failing-first test, or an explicit decision/block
  record linked to the affected source.
- New callable mutations have server authority, malformed/unauthorized/wrong-
  phase/stale/retry behavior, an audience-safe visible result, and a durable
  audit result where the action changes shared state.
- Every new collection or projection has a rules read/write test. A UI route or
  hidden component is not evidence of redaction.
- The lobby-to-Team-Phase composition target remains open until casting,
  private setup, start transaction, lifecycle transition, and Turn 1 snapshot
  are all real on the production path.

This document intentionally leaves implementation work open where the current
repository does not provide evidence. It is a contract and audit ledger, not a
claim that the missing product behavior has been completed.

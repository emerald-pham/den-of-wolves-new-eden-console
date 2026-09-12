# Implementation Plan Progress

This tracker records every canonical prompt ID from the machine-readable
[`implementation-prompts.json`](./implementation-prompts.json). A prompt
counts as complete only after its `[PRESERVE]`, `[EXTEND]`, `[REPAIR]`, `[NEW]`,
`[PROVE]`, or `[DECISION]` acceptance has been fully satisfied with named evidence. A
`[DEFERRED-OWNER]` prompt remains missing until the owner explicitly activates
and accepts it. The
completed count is deliberately non-sequential: later prompts may be complete
while an earlier prompt remains partial or missing.

Completed prompts are also marked with `- [x]` in the execution checklist in
the source plan. Open or blocked prompts remain unchecked there so a later
session can resume at the first unresolved acceptance.

<!-- BEGIN GENERATED PROMPT CATALOG: progress -->
<!-- Generated from docs/implementation-prompts.json; edit the catalog and run the view generator. -->
## Progress

**112 / 747 prompts complete (14.99%)**

Status breakdown: **112 done · 10 partial · 625 missing**.

Active prompt: **none**

Resume pointer: Prompt 020a is the lowest-numbered unchecked acceptance and remains advisory for concurrency.
<!-- END GENERATED PROMPT CATALOG: progress -->

### Version 0.3.28 progress evidence

The current release boundary records Prompt 055 plus the non-feature Prompts 664
and 665 governance repairs complete at **93 / 734 = 12.67%** with
**93 done · 25 partial · 0 active · 616 missing**. Intelligence Agent setup now
requires canonical active non-GM holders, counts only valid current loyalty
secrets, removes released loyalty records atomically, binds retries to a
server-only actor/payload fingerprint, and keeps public events redacted.
Focused callable, casting, composition, and rules denial coverage includes
receipt replay/collision, Friend cleanup, optimistic assignment races,
disconnect/resume before start, and exact setup receipt/private projection
counts.
The country-flag regression report is retracted: P031a instead composes the
existing seat/console and flag-selection experiences while preserving the
historical bespoke flag choreography. The version 0.3.13 release snapshot below
therefore records the expanded 721-prompt denominator; older release snapshots
remain historical rather than being retroactively restated.

### Version 0.3.27 progress evidence

The release boundary records Prompt 106B complete at **90 / 730 = 12.33%** with
**90 done · 25 partial · 0 active · 615 missing**. Turn 0 console-lockout and
finale-credit transmissions now keep their accessible status announcement
visible while the outgoing ticker tail drains, then clear and replay only at
the next authorized lifecycle transition. Focused red/green evidence covers
Turn 0 lockout, Turn 1 replacement, ordinary-turn broadcast composition,
lockout tail drain and replay, finale tail drain and revision replay, and the
existing turn-start announcement timing/fade cases: 36 focused component tests
pass. The rendered review captured normal-motion desktop, normal-motion mobile,
reduced-motion 320x844 and 390x844 portrait, and reduced-motion 844x390
landscape states; the accessible `role=status` copy remained readable and
wrapped without clipping at the compact widths.

### Version 0.3.26 progress evidence

The release boundary records Prompt 109 complete at **87 / 730 = 11.92%** with
**87 done · 25 partial · 0 active · 618 missing**. The production
`subscribeSessionState` session-document listener now keeps a per-subscription
server lifecycle cursor: delayed lower-turn snapshots and earlier
Team-phase snapshots cannot replace a newer accepted window, while equal
lifecycle snapshots still deliver current-window resource and state changes.
The cursor follows the existing authoritative lifecycle transition graph and
normalized `TurnPhase` state, allows the server-authorized next-turn Team reset,
blocks actionable regressions after success/failure/debrief/closed outcomes,
and resets on listener teardown/re-subscribe. Focused
`src/lib/firestore.test.ts` regressions exercise the real listener callback,
malformed/legacy normalization, equal-window data flow, and unsubscribe
behavior. Prompt 088 remains partial because universal delayed ordering across
all projections is not claimed here; Prompt 109 covers this session listener
boundary only.

Version 0.3.13 closes Prompt 051 production roster-to-start composition, Prompt
054 authoritative routine Wolf derivation, and Prompt 071 one-GM readiness.
Prompt 054 is reclassified as a feature. Prompt 075 gains setup-receipt and
atomic Turn 1 evidence but remains partial because complete decks, craft,
resources/economy, and alert initialization are still outside this release.

### Version 0.3.23 progress evidence

The release boundary records Prompt 141 complete at **86 / 730 = 11.78%**
with **86 done · 24 partial · 0 active · 620 missing**. The authoritative
`beginOpenAirspacePhase` callable now rejects reopening restricted normal
airspace after its server-owned Coordination deadline while preserving active
session-member authorization, expected-turn CAS, write-free retries after a
lifted transition, and the deterministic member-visible `airspace-opened`
event. Focused callable regressions cover the stale-deadline and unauthorized
member guards; the existing rules suite continues to deny direct gameplay
writes. Shuttle departure, holder/dock binding, and legal movement remain the
separate Prompts 142–144. Prompt 663 is added as a missing/deferred roadmap
repair and is not counted as complete in this release.

### Version 0.3.22 progress evidence

The proof-only release boundary records Prompt 122 Reactor capacity preservation
at **85 / 729 = 11.66%** with **85 done · 24 partial · 0 active · 620 missing**.
The existing `advanceMaintenance` path is now covered by one focused,
all-enabled-vessel boundary matrix in `functions/src/maintenance.test.ts`:
AEGIS, Dione, Icebreaker, Shepherd, Quellon, Refinery 124, and the enabled
Capybara each accept exact nominal, upgraded, damaged, and damaged-plus-upgraded
printed capacities and reject capacity-plus-one selections with real eligible
console IDs wherever that printed console set permits the boundary. The
existing `runMaintenance` callable composition remains authoritative and is
covered by the focused callable suite for server authority, transaction/CAS
persistence, eligibility, replay, and client-write denial. Prompt 122 remains
non-feature proof-only work at application version 0.3.22; Prompt 122a's
confirmation/retry repair and Prompts 123–125, 128, and 138 remain separate.

### Version 0.3.21 progress evidence

The release boundary records Prompt 092 complete, proof-only Prompts 099, 101, 108, and 115, plus tooling-only Prompts 660 and 661, at **84 / 728 = 11.54%**
with **84 done · 24 partial · 0 active · 620 missing**. The authoritative
`advanceTurn` callable now keeps Turn 0 as setup-only, requires a structurally
valid phase whose turn matches the session, allows normal handoff only from an
expired lifted Coordination phase, and preserves explicit GM timer overrides
for valid numbered Team or Coordination phases. The existing transition test
covers absent, malformed, mismatched, restricted, and Turn 0 rejection without
writes, exact numbered-turn timing and resource expiry, deterministic handoff
events, and presentation-only announcement skipping; the existing optimistic
CAS overlap proof remains intact. `startGame` remains the sole production
Turn 0-to-1 path. The same proof extends the existing late-maintenance case with valid `begin`, `storage`, `rations`, `unrest`, `riot`, `reactor`, `bays`, and `end` requests while Coordination is lifted; each receives the stable Team-phase denial with no session, event, undo, damage, or receipt writes. The valid `bays` payload proves phase denial precedes docking/fuelling validation. Prompt 101 preserves the same authoritative transition: `beginOpenAirspacePhase` commits the lifted phase and deterministic `airspace-opened-${turn}` event, while the existing `src/components/FleetAlert.test.tsx` lifted-airspace case feeds that committed Firestore-shaped state through the actual `subscribeSessionState` listener callback, renders exactly one accessible `AIRSPACE CONTROL // AIRSPACE OPEN` bulletin, unsubscribes/unmounts, and reconnects the listener to observe the identical single bulletin. Prompt 108 preserves the same server-owned clock on reconnect: the existing `src/components/FleetAlert.test.tsx` case feeds an active Team phase through the actual `subscribeSessionState` listener, renders the timer and live action controls, advances the client clock, unsubscribes, re-subscribes, and observes the reduced server-deadline time before converging to the lifted Coordination timer and disabled Press exception action. Prompt 115 preserves the printed Storage rule: `functions/src/maintenance.test.ts` and the existing stateful `functions/src/maintenanceCallable.test.ts` case prove odd/even ship and docked-shuttle losses round down, undocked cargo stays unchanged, the exact loss audit is persisted in `cycle.results['1']`, and the callable atomically persists the resource/cargo result and member-visible maintenance event. Prompt 102 and Prompt 103a remain outside this release.

Exact validation now allocates a missing worktree emulator configuration
atomically and removes only its own unchanged files afterward; a committed
AST/diff proof derives a safe copy-only profile and sends mixed or uncertain
changes through the full gate. Application version 0.3.21 and player-facing
changelog wording remain unchanged.

### Version 0.3.20 progress evidence

The current release records Prompt 139 complete plus proof-only Prompts 103 and
093 preservation at **77 / 723 = 10.65%** with **77 done · 26 partial · 0 active ·
620 missing**. Maintenance events carry an explicit crew-safe projection of
costs and outcomes through the member-visible event stream; the client parser
accepts only those allowlisted fields and drops hidden deck order, private
facilitator data, and unknown payload fields. Existing maintenance receipts
remain private and retry-safe. Prompt 103 preserves the existing next-turn
initialization path: `functions/src/index.ts:597-654` and `:3217-3271` advance
the turn atomically, `functions/src/turnTransition.ts:8-27` resets turn-scoped
charges and shuttle fuel, and `functions/src/maintenanceCallable.test.ts:578-703`
and `:792-937` cover schedule/expiry and overlapping advance/CAS/stale
write-free behavior. Prompt 093 preserves the existing authoritative
Team-to-Coordination boundary: `functions/src/index.ts:3357-3397` enforces the
server deadline, expected-turn, closed, paused, and active-membership guards,
while the composed `functions/src/maintenanceCallable.test.ts` boundary proof
covers early and exact-deadline opens, the deterministic `airspace-opened`
event, stale and already-lifted no-write retries, and late maintenance denial.
The existing concurrent expiry proof remains the overlap coverage. Prompt 103a
remains outside this release.
Prompt 140 all-vessel maintenance coverage remains outside this release.

### Version 0.3.19 progress evidence

The release boundary records Prompt 138a complete at **74 / 723 = 10.24%**
with **74 done · 27 partial · 0 active · 622 missing**. The current-turn
maintenance rollback restores only the recorded reversible cycle, resource,
cargo, fuel, and non-damage alert state when the matching revision and turn
still hold; an active GM instance, ship authority, and Team phase are required
before replay or mutation. A stable actor-bound canonical request ID replays the
same result and deterministic event without writes; changed actor/payload reuse
is rejected, while a distinct stale contender records only a private replayable
receipt with no partial mutation. Damage state and its survivor/unrest
consequences plus existing maintenance/audit events remain immutable. A
stateful callable regression proves riot damage, prior events, exact replay,
changed-request denial, stale receipt replay, and deterministic event identity.
Prompt 598 is reopened as a partial connectivity repair; Prompts 654–656 are
queued missing repairs with no production evidence.
Prompt 139 audience projection and Prompt 140 all-vessel coverage remain
outside this release.

### Version 0.3.18 progress evidence

The release boundary records Prompt 138 complete at **75 / 721 = 10.40%**
with **75 done · 26 partial · 0 active · 620 missing**. The printed maintenance
path now requires an authority-bound client request ID, checks current authority
before replay and enforces phase/turn gates before a new mutation, and commits
the resource, charge, fuel, damage, undo,
event, and private replay receipt together. A stateful optimistic-CAS fixture
proves duplicate replay and two distinct same-revision requests produce one
winner, one resource/damage mutation, one event, and a write-free stale loser;
retries reuse one server timestamp and one server-owned entropy/dice outcome.
Firestore rules deny direct maintenance-receipt access. Prompt 138a rollback,
Prompt 139 audience projection, and Prompt 140 all-vessel coverage remain
outside this release.

### Version 0.3.17 progress evidence

Prompt 177 is complete at **74 / 721 = 10.26%** with **74 done · 26
partial · 0 active · 621 missing**. The existing AEGIS jump console now
enforces its printed 2/3/6 cost, charge, damage, upgrade, route,
integrity-lockout, and once-per-turn boundaries. Focused domain and callable
evidence cover upgraded damaged-drive rolls 1–4, exact and insufficient fuel,
write-free failures, one committed retry-stable transaction, and the persisted
coordinate, charge, transition, and navigation audit. Emergency jumps,
broader jump failure adjudication, and universal concurrency/replay coverage
remain outside this prompt.

### Version 0.3.16 progress evidence

The release boundary records Prompt 098 complete at **73 / 721 = 10.12%**
with **73 done · 26 partial · 0 active · 622 missing**. The existing
restricted→lifted airspace transition now writes one deterministic,
member-scoped `airspace-opened` event in the same transaction, while the
Coordination handoff writes one deterministic member-scoped `turn-advanced`
event. Lifecycle ordinals are 2*turn-1 for Team and 2*turn for Coordination;
a stateful optimistic-CAS test proves mixed Team/Press expiry observers and
two distinct GM advances commit once, expire resources once, and leave stale
retries write-free.

### Version 0.3.15 progress evidence

The release boundary is recorded reproducibly as **72 / 721 = 9.99%** with
**72 done · 27 partial · 0 active · 622 missing**. Prompt 603a extends the
existing measured `AppHeader` contract to Role Select and session-mode routes
on both narrow phones and short landscape screens. The focused red/green
static CSS cascade test and focused component/layout suites pass. The
checked-in CDP geometry command writes DOMRect evidence at 320×844, 390×844,
844×390, and 1440×900, records every rendered Role Select and Ship Role Select
region, derives shared-chrome/DRADIS intersections, and produces a normalized
comparison file. Its reviewed fixture covers connected-player variants,
simulated safe areas, long labels, role-control keyboard order/focus
rectangles, absolute-header scroll-away, settings, and a wrapped stationary
reduced-motion FleetBroadcast; touch-sized controls retain 44px targets. This
is local rendered evidence, not deployed or live-Firebase proof.

### Version 0.3.14 progress evidence

The release boundary is recorded reproducibly as **70 / 719 = 9.74%** with
**70 done · 27 partial · 0 active · 622 missing**. Prompt 022 now composes the
existing authoritative creation transaction with one deterministic
`session.created` event keyed by the authenticated actor and request ID. The
focused red/green callable evidence proves the member-visible envelope is
strictly redacted, retries do not emit a second event, and unauthenticated or
exhausted join-code-collision attempts emit none; the existing event rules
tests continue to prove member reads and client-write denial.

### Version 0.3.13 progress evidence

The release boundary is recorded reproducibly as **69 / 719 = 9.60%** with
**69 done · 28 partial · 0 active · 622 missing**. Chronological failing-first
evidence exposed six production gaps across three Functions suites before the
implementation: missing server-derived routine Wolf selection, legacy
two-human readiness assumptions, incomplete reciprocal seat-pointer checks,
missing atomic setup receipt/private writes, and unsafe conflicting request-id
replay. The focused green evidence covers 81 Functions assertions, 155 client
assertions, and 55 emulator-backed rules assertions.

The accepted production path validates the exact 8, 19, and 20 core roster and
stable seat pointers; permits one live GM while additional GMs remain optional;
keeps default-enabled Press distinct, non-counted, and eligible only when
claimed; derives one Wolf at core 8–13 and two at 14–20 without a third; writes
private loyalty/Wolf results plus an audience-correct GM receipt; replays one
request without rerolling; rejects stale/conflicting authority; and enters Turn
1 once with pursuit 2 and the existing clock and announcement. Legacy manual
Wolf mutation exports are retired rather than retained as hidden bypasses.

Prompt 020 remains missing until its separate full production-composition proof.
P122a/P275b/P602a/P603a and the future ticker/DRADIS/typography/selection prompts
remain outside release 0.3.13.

Version 0.3.12 closes Prompt 021 authoritative configuration, Prompt 030
production seating, and Prompt 073 one-GM staffing. Prompt 030 is reclassified
as a feature for this release. Prompt 051 remains partial: configuration and
seating evidence is appended, while readiness and start remain outside the
release boundary.

### Version 0.3.12 progress evidence

The release boundary is recorded reproducibly as **66 / 713 = 9.26%** with
**66 done · 31 partial · 0 active · 616 missing**. Focused server authority,
seat, responsibility, hydration, client-route, and rules-denial suites provide
the implementation evidence; the release makes no claim for Prompt 054, 071,
readiness, start, Wolf/setup receipt, Prompt 020, or the queued addenda
P122a/P275b/P602a/P603a. Prompt 051 remains partial by design.

The resume pointer is separate from the completion count. It is the
lowest-numbered prompt that is not done, not a sequential cursor or a claim
that only that many prompts have been completed. In this snapshot, Prompt 012
is the first unresolved prompt even though later prompts are already complete.

`[██░░░░░░░░░░░░░░░░░░]`

Each bar block represents approximately five completed prompts. Legend: `done`
= the acceptance is satisfied with named evidence, `partial` = a real seam
exists but at least one acceptance boundary remains, `missing` = no truthful
production-path acceptance exists yet, and `blocked` = a concrete external or
product decision is required. Only `done` prompts are checked in the source plan.

### Prompt 004/051 historical 0.3.9 failing-first evidence

Before changing production roster code, the underlying printed artifact was
inspected at `/Users/emeraldpham/Documents/DoWNE v1.1/Home Printing/DoWNE - Facilitator Guide v1.1.pdf`, PDF page 5 (printed page 3), and the new
matrix/readiness and production-path acceptance tests were run from the
dedicated Prompt 004 worktree with:

```text
npx vitest run --project unit --project functions src/data/rolePresets.test.ts functions/src/roleConfiguration.test.ts functions/src/gameSetup.test.ts functions/src/createSessionCallable.test.ts functions/src/startCallable.test.ts
```

Observed red result (Vitest start `09:16:59`, recorded from that run; this
summary is evidence of the run and is not being presented as a rerun): 5 test
files failed, with 11 failed and 35 passed tests. The client and server exact
ordered-roster assertions failed first at player count 8 because the current
implementation returned 7 roles instead of the required 8. The readiness
matrix failed at counts 8, 9, 10, and 11 because the current presets returned
7, 8, 9, and 10 roles respectively; the count-18 vessel-order assertion also
observed `quellon` before `shepherd` instead of the canonical order. The
negative readiness test showed the current production readiness accepted an
out-of-preset `press-officer`, and the production-path tests showed creation
and `applyRolePreset` persisted/returned the short 8-player roster while the
start test was blocked on `players` when it used that roster. This is the
durable preimplementation red evidence for the Prompt 004/051 production
change.

### Prompt 004 version 0.3.11 retrospective regression-sensitivity evidence

The chronological 0.3.11 red run was missed before production edits. A
separate retrospective baseline reconstruction applied only the nine intended
test diffs to the old runtime and ran the focused matrix/readiness and
production-path suite from the dedicated Prompt 004 worktree with:

```text
npx vitest run --project unit --project functions src/data/rolePresets.test.ts src/data/shuttles.test.ts src/lib/firestore.test.ts src/routes/GmConsole.test.tsx functions/src/roleConfiguration.test.ts functions/src/gameSetup.test.ts functions/src/requestGuards.test.ts functions/src/createSessionCallable.test.ts functions/src/shuttlecraft.test.ts
```

The retrospective red result was 9 failed files, 13 failed tests, and 171
passed tests. It covered the missing client/server 19-role rows, 19 wolf and
readiness rejection, invalid-guard rejection of newly valid 19, 19 creation
rejection, SNN 19 resolving to AEGIS instead of Dione, and missing GM 19
staging. This establishes regression sensitivity only; it is not a
chronological preimplementation TDD receipt.

### Prompt 004 completion evidence — version 0.3.11

The reconciled Prompt 004 focused proof passed with 9 test files and 184 tests:

```text
npx vitest run --project unit --project functions src/data/rolePresets.test.ts src/data/shuttles.test.ts src/lib/firestore.test.ts src/routes/GmConsole.test.tsx functions/src/roleConfiguration.test.ts functions/src/gameSetup.test.ts functions/src/requestGuards.test.ts functions/src/createSessionCallable.test.ts functions/src/shuttlecraft.test.ts
```

The client and server catalogs now prove the exact ordered, unique rows for
every integer count 8–20; the 19/20 rows are the exact base-17/base-18 rows
followed by the atomic Capybara Captain/Recycler pair. The same focused matrix
proves invalid count boundaries, two Wolves at 19/20, Press/GM exclusion,
Dione-derived SNN hosting at 19, and the existing GM surface's local 19-role
staging without a command before confirmation. Creation guards and hydration
tests cover only inherent shared-count propagation; this release does not claim
production configuration persistence, casting, readiness, start, or seat
provisioning, and does not close Prompts 021, 030, 051, 054, 071, 073, 075, or
020. Lower-count Capybara substitutions remain unresolved.

## Progress integrity gate

This page is a generated status view, not a second manually edited authority.
The machine-readable prompt catalog owns each prompt's status, class, release
mapping, and progress description; run the view generator after catalog edits.
`npm run validate:implementation-progress` checks the catalog-backed summary,
ledger shape, release-fragment references, changelog history, and resume
pointer. It accepts both base and lettered IDs without a 001–100 range
assumption.

## Read-only dependency lookup

When dependency context is needed, run
`npm run coordination:dependencies -- --prompt NNN` and read the compact
read-only packet generated from the catalog-backed
[`IMPLEMENTATION_PROMPT_DEPENDENCIES.md`](./IMPLEMENTATION_PROMPT_DEPENDENCIES.md).
Reconcile the exact row, hard prerequisites, evidence, and ownership with
current `main` and active coordination before continuing. Rerun the lookup
after a rebase or material movement of current `main`. A prompt cannot be
marked complete or merged while a hard prerequisite remains unmet.

`NEXT` (the first item in `READY_QUEUE`) is the primary resume/default lane, but
it is advisory for concurrency, not a serial execution lock. A separate
worktree may claim a later `READY_QUEUE` item concurrently only when its hard
prompt prerequisites are done, every hard milestone, hard contract, and
decision-owner gate is satisfied or explicitly confirmed, and the coordination
forecast shows conflict-free ownership with no active claim overlap. A worktree
must not bypass an unmet dependency, active claim, or unresolved decision-owner
gate merely because the prompt is independent.

When work starts, set `Active prompt` to the selected dependency-ready
unresolved prompt and change that ledger row to `in-progress`. The lowest-ID
resume pointer is the default triage suggestion, not a serial execution lock.
The coordination registry owns the active claim: worktrees may claim different
base or lettered IDs concurrently, but a second active claim for the same
normalized ID is rejected. The final move-on gate still fails while the current
branch leaves its selected row `in-progress`: mark it `done`, `partial`,
`missing`, or `blocked` with evidence before release.

Every ledger row also declares whether the prompt is a `feature` or
`non-feature` change. A feature row names its application release or releases
in the `Changelog` column. Each matching `src/changelog.ts` entry must list that
prompt in `implementationPrompts` and contain at least one concrete
player-facing change for it. The coordination preemptive changelog is only a
planning note; it cannot satisfy this gate. Non-feature rows use `—` and must
not be listed in changelog coverage metadata. Unexecuted prompts start as
`missing`/`non-feature` until an implementing agent establishes a truthful
release classification and evidence.

## Execution ledger

<!-- BEGIN GENERATED PROMPT CATALOG: progress-ledger -->
| Prompt | Status | Change | Changelog | Evidence / result |
| ---: | :--- | :--- | :--- | :--- |
| 001 | done | non-feature | — | Source map and precedence in `docs/IMPLEMENTATION_PLAN.md` and routed reference overview. |
| 002 | done | non-feature | — | Plan precedence rule plus routed printed references. |
| 003 | done | non-feature | — | Ambiguity and decision ledger in `docs/IMPLEMENTATION_CONTRACTS.md` §1. |
| 004 | done | feature | 0.3.9, 0.3.11 | Prompt 004 catalog slice complete: client/server tests prove exact ordered, unique 8–20 rows; 19 = base-17 plus Capybara Captain/Recycler and 20 = base-18 plus the same pair; invalid boundaries, Dione/SNN host at 19, vessels/Union, two Wolves, Press/GM exclusion, and GM-local 19 staging are covered. Creation/guard/hydration parity is inherited shared-count propagation only. Prompt 030 remains partial; no claims are made for Prompts 021, 030, 051, 054, 073, 075, or 020; lower-count Capybara substitutions remain unresolved. |
| 005 | done | non-feature | — | Capability matrix in `docs/IMPLEMENTATION_CONTRACTS.md` §2. |
| 006 | done | non-feature | — | Projection/redaction contract in `docs/IMPLEMENTATION_CONTRACTS.md` §3 and `projectPrivateSetup` tests. |
| 007 | done | non-feature | — | `functions/src/eventEnvelope.ts` and `eventEnvelope.test.ts`. |
| 008 | done | non-feature | — | `functions/src/lifecycle.ts` and `lifecycle.test.ts`. |
| 009 | done | non-feature | — | Deterministic fixture seams in `functions/src/atddFixtures.ts` with five focused tests. |
| 010 | done | non-feature | — | Prompt-by-prompt audit in `docs/IMPLEMENTATION_CONTRACTS.md` §5. |
| 011 | done | non-feature | — | `functions/src/joinCodeSecurity.ts` exports immutable `JOIN_CODE_POLICY` for legacy/current lengths, digits-only format, session-until-retirement lifetime, non-enumerating lookup, and transactional `joinCodes` collision ownership. `joinCodeSecurity.test.ts`, `joinSessionCallable.test.ts`, `createSessionCallable.test.ts`, and `sessionLifecycleCallable.test.ts` prove the contract, malformed-input boundary, both code formats, duplicate-code skip, and retirement deletion; focused run: 4 files, 29 tests passed. |
| 012 | done | non-feature | 0.3.30 | M1 production callables use server-only actor/action/payload/revision-bound receipts and exact replay before any mutation, cost, randomness, or audit write. Fully bound legacy domain receipts retain authorized exact replay; unbound event-only records fail closed with refresh/reconcile guidance. Focused Functions coverage includes cross-action legacy namespace collisions, old-event recovery wording, duplicate Android-disclosure prevention, and the 57-test rules denial matrix. |
| 013 | done | non-feature | — | `turnZero.ts`, `sessionLifecycle.ts`, and server timestamp paths. |
| 014 | done | feature | 0.3.29 | Shared session-authority cursors preserve visibly stale cached rendering while rejecting stale or late callable, listener, queued, and secondary-projection results from authorizing mutations or overwriting newer authority. |
| 015 | done | feature | 0.3.31 | Client and callable paths share explicit command-error categories with safe player guidance and no private detail leakage. |
| 016 | done | non-feature | — | Resume/lifecycle tests and rules identity boundary. |
| 017 | done | non-feature | — | Wire-safe branded ID aliases preserve session, player, seat, role, vessel, shuttle, and event identity at catalogs and snapshot boundaries; console, group, mission, and attack have identity-only contracts until persisted models exist. |
| 018 | done | feature | 0.3.5, 0.3.7 | `actionMetadata.ts`, wrong-phase maintenance/jump tests, callable gates, and stale bridge-dispenser authority rejection. |
| 019 | done | feature | 0.3.32 | Server-written member-readable events now use a per-event allowlist that preserves replay-safe attribution and public decision fields while excluding command fingerprints, hidden state, secrets, and server-only inputs; unknown event types fail closed, non-member visibility is rejected, and member-read/client-write rules are covered. |
| 020 | done | non-feature | — | `functions/src/sessionComposition.test.ts` composes production create→join→GM authority→setup tuple→role/seat casting→private setup→Turn 1 for 8, 19, and 20 (claimed Press) without direct Firestore gameplay writes; focused callable evidence covers replay, stale, unauthorized, reconnect redaction, roster/loyalty/GM-instance invariants, and the existing 57-test `tests/rules/firestore.rules.test.ts` matrix covers member reads plus client-write denials. |
| 020a | missing | non-feature | — | Planned [NEW] prompt: bound the existing single-player demo to setup and all supported actions through the end of Turn 1, deny jumps server-side with zero fuel/location/pursuit/event/turn mutation, and explain Demo mode in an accessible on-screen toast; no production-path evidence has been recorded. Depends on Prompt 020 plus Prompts 074–081, 177, and 287–304. |
| 021 | done | feature | 0.3.5, 0.3.12 | Version 0.3.12 closes the server-authoritative, revisioned, idempotent configuration tuple for the settled 8–20 core matrix. Full tuple validation, request replay/CAS, deterministic active-vessel derivation, and retired partial mutators are covered by the focused Functions suite; Press remains separate and GMs remain non-counted. |
| 022 | done | feature | 0.3.5, 0.3.14 | Version 0.3.14 completes the standardized member-visible `session.created` envelope inside the atomic creation transaction, bound to the authenticated actor and request ID, strictly redacted, replay-safe, and absent on authentication or code-collision failure. |
| 023 | done | non-feature | — | Request record replay tested in `createSessionCallable.test.ts`. |
| 024 | done | non-feature | — | `joinSessionCallable.test.ts` and rules tests. |
| 025 | done | non-feature | — | Join-code lookup/security tests and denied listing. |
| 026 | done | non-feature | — | Membership uniqueness transaction tests. |
| 027 | done | non-feature | — | Non-enumerating limiter tests. |
| 028 | done | non-feature | — | Session-header membership/listing rules tests. |
| 029 | done | non-feature | — | Seat policy/callable one-seat tests. |
| 030 | done | feature | 0.3.12 | Version 0.3.12 provisions canonical stable core seats, exposes callable-backed claim/release through the existing role route, and records revisioned request receipts and append-only events. Reconnect hydration, race/denial, pointer integrity, and Press exclusion remain covered; readiness/start stays outside this release. |
| 031 | done | non-feature | — | Seat race/conflict tests. |
| 031a | missing | non-feature | — | Future unified fleet/console entry: compose the separate fleet/flag and seat/console pages only after the active setup/readiness slice. Full enabled catalog viewing never claims; first authenticated entry to an open core console atomically claims it, a simultaneous race has one winner, and every client converges in real time. Preserve stable seat authority, CAS/idempotency/audit, reconnect, release/handoff/GM intervention, deep links/Back, Press as distinct and non-counted, claimed read-only state, and the exact shared-flag choreography/timing/layers recorded from `5ea9b74` through the named refinements. Require keyboard/screen-reader/44px touch, safe areas, rotation/reduced motion, interruption/performance, and nonoverlap at 320×844, 390×844, 1440×900, and 844×390. |
| 032 | done | non-feature | — | Seat release tests. |
| 033 | done | non-feature | — | Foreign/stale seat release denial tests. |
| 034 | done | non-feature | — | Resume callable and session service tests. |
| 035 | done | non-feature | — | Intended-seat reclaim tests. |
| 036 | done | non-feature | — | Own-presence rules tests. |
| 037 | done | non-feature | — | Presence lease tests. |
| 038 | done | non-feature | — | Stale-device expiry tests. |
| 039 | done | non-feature | — | Seat reconciliation on expiry tests. |
| 040 | done | non-feature | — | Empty-session retention tests. |
| 041 | done | non-feature | — | Local disconnect/outbox tests. |
| 042 | done | non-feature | — | Queued disconnect replay tests. |
| 043 | done | non-feature | — | Resume/disconnect route tests. |
| 044 | done | non-feature | — | GM eligibility/device-mode policy tests. |
| 045 | done | non-feature | — | GM instance claim tests. |
| 046 | done | non-feature | — | GM elevation denial tests. |
| 047 | done | non-feature | — | Console mode tests. |
| 048 | done | non-feature | — | GM Observer read-only tests. |
| 049 | done | non-feature | — | Observer elevation reset tests. |
| 050 | done | non-feature | — | Return-navigation route tests. |
| 051 | done | feature | 0.3.9, 0.3.12, 0.3.13 | Version 0.3.13 composes release 0.3.12's authoritative 8–20 configuration and stable seats into exact reciprocal seat-backed readiness, private loyalty hydration, and one authoritative Turn 1 transition. Functions/client/rules evidence covers 8, 19, 20, claimed/unclaimed/disabled Press, one and additional GMs, stale authority, retry, replay, and private projection; Prompt 020 remains the separate full create-to-Turn-1 proof. |
| 052 | done | non-feature | — | Dione threshold/configuration tests. |
| 053 | done | non-feature | — | Union substitution tests. |
| 054 | done | feature | 0.3.13 | The routine production start derives one hidden Wolf at 8–13 core players and two at 14–20 from locked authoritative setup, never accepts caller-selected routine cardinality, keeps Press outside the count while including one claimed holder in the eligible pool, and records private identities plus a redacted calculation receipt without a third Wolf. Same-request retry/replay cannot reroll; stale/conflicting authority rejects. Legacy manual Wolf mutation exports are retired. |
| 055 | done | feature | 0.3.28 | Intelligence Agent setup now requires authoritative canonical holders, replacement-aware Wolf/IA counts, atomic stale-secret cleanup, actor/payload-bound replay, and production/rules/concurrency evidence. |
| 056 | done | feature | 0.3.33 | Universal Arbour and Wolf Cult are explicit facilitator choices in the canonical setup tuple, with authoritative two-Wolf replacement validation, replay-safe confirmation, and private loyalty assignment. |
| 057 | done | feature | 0.3.34 | Canonical server setup resolves base Capybara, expansion Capybara, or neither; complete Capybara role composition is validated and mode changes are rejected after casting begins across confirm, casting, resume, and start. |
| 058 | done | feature | 0.3.35 | Creation and lobby setup compose only the locked vessels, resources, populations, geometry, and shuttle craft; expansion adds Capybara Scrap, Macaw, Boa, and full-ship state exactly once with replay-safe authoritative joins and resumes. |
| 059 | done | feature | 0.3.5 | `setShipPreference` and `castingCallable.test.ts`. |
| 060 | done | feature | 0.3.5 | `assignRole` facilitator callable and tests. |
| 061 | done | feature | 0.3.5 | Role exclusivity policy plus callable denial tests. |
| 062 | done | feature | 0.3.36 | `assignRole` and `releaseRole` reconcile canonical seats, role/console pointers, Press ownership guards, and reciprocal private Friend records before start; normal player seat claims remain authoritative. |
| 063 | done | non-feature | 0.3.37 | Server-owned per-player role briefs include common rules, exact current-assignment reads, lifecycle cleanup, and client authority-order handling. |
| 064 | done | feature | 0.3.38 | Each player hydrates only their own loyalty card and suspicion, while an authorized facilitator receives an allowlisted census that stays current across reconnect, demotion, disconnect, release, and removal. |
| 065 | done | feature | 0.3.5 | Loyalty suspicion policy and assignment tests cover all listed kinds. |
| 066 | done | feature | 0.3.5 | Reciprocal Friend secret records and privacy test. |
| 067 | done | feature | 0.3.5 | Android self-disclosure callable and denial test. |
| 068 | done | feature | 0.3.39 | Server-owned start composition derives every represented shuttle and fighter wing from the locked printed-role roster, validates the manifest before start, and exposes only each holder's active craft in their private role brief. |
| 069 | done | non-feature | 0.3.35 | Prompt 058's create/confirm composition initializes exact active-vessel survivor/resource maps, preserves deliberate lobby edits on reconfiguration, seeds newly active vessels, and filters removed vessels; startGame locks the prepared state without resetting stores. |
| 070 | done | non-feature | — | Prompt 058's create/confirm composition persists the authoritative securityTeams catalog for every active vessel across the production 8-, 19-, and 20-player rows; deliberate lobby resource edits remain preserved and startGame does not reset prepared stores. |
| 072 | done | feature | 0.3.5 | Start lock plus casting-window rejection. |
| 073 | done | feature | 0.3.5, 0.3.12 | Version 0.3.12 closes the singular/exclusive responsibility model: one active GM represents both printed labels, optional GMs may share or hand off lanes, and legacy singular data normalizes deterministically. Revisioned responsibility mutation and replay/audit evidence are covered; former Prompt 071 readiness evidence remains historical while Prompt 654 is the queued repair for zero/partial-occupancy start. |
| 074 | done | feature | 0.3.5 | Start requires authenticated active facilitator instance. |
| 075 | done | feature | 0.3.5, 0.3.13, 0.3.40 | The single startGame transaction now preserves prepared stores and existing Turn 1 state, materializes canonical intact damage and empty maintenance state for each active vessel (repairing malformed legacy cycles before maintenance reads), fills absent inactive fleet-alert and Press-dispatch defaults, composes routine private Wolf/default loyalty state, records the one-GM calculation receipt and safe event, initializes pursuit 2, and enters Turn 1 exactly once with the existing timer/announcement behavior. The persisted setup is additive and replay-safe; release 0.3.40 records the player-visible repair for legacy sessions that previously could crash when maintenance began. |
| 076 | done | non-feature | — | Durable start request replay test. |
| 077 | done | feature | 0.3.5 | The existing authoritative Turn 1 start initializes the canonical single initial fleet group as pursuit 2; production 8-, 19-, and 20-player starts and replay requests prove the exact group map without introducing split-group mechanics. |
| 078 | done | feature | 0.3.5 | Six-to-eight validation and start configuration lock. |
| 079 | done | non-feature | — | Turn 1 timer override tests. |
| 080 | done | feature | 0.3.41 | The GM console now lets an active facilitator mark the approximate first Wolf-attack timing as due, resolve it, or defer it to Turn 2. The marker is a private, revisioned server projection with retry-safe audit state; it never launches combat, advances the turn, enforces a client timer, or exposes timing to members. |
| 081 | done | non-feature | — | Durable Turn 1 announcement/replay tests. |
| 082 | done | non-feature | — | The server's explicit member session projection and persisted session roots expose turn, phase, active vessels, and permitted fleet status only; role briefs, loyalties, decks, setup receipts, and facilitator notes remain on separate protected paths. Create/start/join callable tests and Firestore member-boundary tests prove the public snapshot shape and audience boundary. |
| 083 | done | non-feature | — | Member/nonmember snapshot rules tests. |
| 084 | partial | feature | 0.3.5 | Crew UI/state exists; centralized per-ship projection remains open. |
| 085 | missing | non-feature | — | Role-private reconnect projection remains open. |
| 086 | partial | feature | 0.3.5 | GM reads exist; census/suspicion/note projection remains incomplete. |
| 087 | done | non-feature | — | Broad direct-write denial matrix in rules tests. |
| 088 | partial | non-feature | — | Revision parsing exists; universal delayed-snapshot ordering remains open. |
| 089 | missing | non-feature | — | General event replay/reconstruction remains open. |
| 090 | missing | non-feature | — | Full serialized hidden-state redaction proof remains open. |
| 091 | partial | non-feature | — | Server turn clock exists; complete turn entity remains open. |
| 092 | done | feature | 0.3.21 | `functions/src/index.ts` keeps Turn 0 setup-only, validates the current numbered phase, permits normal handoff only after lifted Coordination expiry, and preserves explicit numbered-phase GM overrides; the existing `functions/src/maintenanceCallable.test.ts` transition case proves illegal-phase no-write rejection, exact schedule/resource/event handoff, and presentation-only announcement skipping. |
| 093 | done | non-feature | — | Existing `beginOpenAirspacePhase` and Team-action boundary are preserved by the composed `functions/src/maintenanceCallable.test.ts` proof: early/exact-deadline/stale/duplicate transitions and late `runMaintenance` denial are write-free where required, with deterministic `airspace-opened` identity and the existing concurrent expiry proof retained. |
| 094 | done | non-feature | — | Server Team timer duration tests. |
| 095 | done | non-feature | — | Server Coordination timer duration tests. |
| 096 | done | non-feature | — | Turn 1-only override tests. |
| 097 | done | non-feature | — | Emergency pause interlock/audit tests. |
| 098 | done | feature | 0.3.16 | Version 0.3.16 makes Team expiry and Coordination handoff transaction-owned transitions with deterministic member-scoped `airspace-opened` and `turn-advanced` events. Lifecycle ordinals are 2*turn-1 and 2*turn (envelope ordinals, not stored phase revisions); the stateful optimistic-CAS fixture proves mixed expiry observers and distinct GM advances commit one transition/event, expire resources once, and leave stale retries write-free. Existing auth, membership, expected-turn, pause, deadline, override, and client-write denial guards remain covered. |
| 099 | done | non-feature | — | The existing `functions/src/maintenanceCallable.test.ts` late-maintenance case proves valid begin, storage, rations, unrest, riot, reactor, bays, and end requests are denied during lifted Coordination with the stable Team-phase error and no session, event, undo, damage, or receipt writes; the valid bays payload proves phase denial precedes docking/fuelling validation. |
| 100 | partial | non-feature | — | Movement/jump Coordination gates exist; transfer/scouting/research coverage remains open. |
| 101 | done | non-feature | — | Existing `beginOpenAirspacePhase` preserves the atomic lifted-phase state and deterministic `airspace-opened-${turn}` event; `src/components/FleetAlert.test.tsx` feeds that committed Firestore-shaped state through the actual `subscribeSessionState` listener callback, renders exactly one accessible `AIRSPACE CONTROL // AIRSPACE OPEN` bulletin, unsubscribes/unmounts, reconnects the listener, and observes the identical single bulletin. Proof-only; no production change. |
| 102 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 103 | done | non-feature | — | Existing next-turn initialization is preserved by the atomic transition in `functions/src/index.ts:597-654` and callable path at `:3217-3271`; `functions/src/turnTransition.ts:8-27` resets turn-scoped charges and shuttle fuel, while `functions/src/maintenanceCallable.test.ts:578-703` covers schedule/expiry and `:792-937` covers overlapping advance/CAS/stale write-free behavior. Proof-only; no runtime change. |
| 103a | missing | non-feature | — | Planned [NEW] prompt: hide AIRSPACE CLOSED on the turn-advance interstitial, freeze the authoritative deadline until clear/dismiss, resume from preserved remaining time, and cover stale/retry/reconnect/multi-client/accessibility behavior; no production-path evidence has been recorded. Depends on Prompts 091–096, 098, 101–103, 106b, 108–109, and 154–158. |
| 104 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 105 | partial | non-feature | — | PursuitTracker now exposes the remaining pursuit-10 distance as cycle/cycles copy in visible and progressbar ARIA text; authoritative terminal-failure outcome and action lockout remain open. |
| 106 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 106a | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 106b | done | feature | 0.3.27 | Prompt 106B preserves exact turn-transmission lifecycle timing: Turn 0 lockout and finale credits keep accessible status visible while outgoing tails drain, then clear and replay at the next authorized transition. Focused red/green and rendered evidence cover compact reduced-motion wrapping, ordinary-turn composition, lockout/finale drain, and revision replay. |
| 106c | missing | non-feature | — | Future server-authoritative FleetTicker lifecycle: deterministic session/message/revision identities, precedence, current/queued/draining state, pass counts, dismissals, and replay cursors must serialize concurrent automatic/Admiral/Press send-replace-dismiss and Red Alert activation/stand-down. Reconnect/replay/late join and every client converge; idempotent CAS, authenticated authority, privacy-safe projection/audit, schema bounds, and direct-write denial precede P652a/P652b. |
| 107 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 108 | done | non-feature | — | Existing `src/components/FleetAlert.test.tsx` feeds an active Team phase through the actual `subscribeSessionState` listener, renders the server-deadline timer and permitted action controls, advances the client clock, unsubscribes and reconnects with the same persisted snapshot, then observes the reduced remaining time and the lifted Coordination action gate. Proof-only; no production change. |
| 109 | done | feature | 0.3.26 | `subscribeSessionState` now suppresses delayed lower-turn and earlier same-turn Team snapshots at the production session listener boundary using the authoritative lifecycle transition graph plus normalized server `TurnPhase`; equal lifecycle snapshots still flow newer current-window data, next-turn Team resets are accepted, terminal/debrief/closed states cannot reopen actionable phases, malformed/legacy records remain safe, and teardown/re-subscribe gets a fresh cursor. Focused `src/lib/firestore.test.ts` regressions prove the listener callback path. Prompt 088 remains partial because this does not claim universal ordering across every projection. |
| 110 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 111 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 112 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 113 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 114 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 115 | done | non-feature | — | Existing `functions/src/maintenance.test.ts` and stateful `functions/src/maintenanceCallable.test.ts` evidence proves damaged Storage halves ship and docked-shuttle resources with printed floor rounding, leaves undocked cargo unchanged, and atomically persists exact `cycle.results['1']` audit detail plus the session resource/cargo update and maintenance event. |
| 116 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 117 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 118 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 119 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 120 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 121 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 122 | done | non-feature | — | Existing `functions/src/maintenance.test.ts` and `functions/src/maintenanceCallable.test.ts` evidence preserves authoritative Reactor capacity across all seven enabled vessels. The focused matrix covers exact nominal, upgraded, damaged, and damaged-plus-upgraded capacities with real eligible console IDs plus capacity-plus-one rejection; the callable suite retains authority, transaction/CAS persistence, input eligibility, replay, and no-client-write invariants. |
| 122a | missing | non-feature | — | Owner-requested Reactor confirmation repair: the current `MaintenanceSystems` control submits `runMaintenance(..., 'reactor', ...)` directly, while the transaction replaces prior charges and appends an event without request-id replay. A dedicated release must reuse the danger-red second-press `ARE YOU SURE?` pattern before mutation, make cancel/blur/Escape/navigation/backdrop paths no-ops with focus restoration, prevent pending/double-submit, add idempotent retry and accepted-only audit/replay, and prove stale/unauthorized/invalid denial plus accessible mobile/reduced-motion containment. |
| 123 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 124 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 125 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 126 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 127 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 128 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 129 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 130 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 131 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 132 | done | non-feature | — | Focused `addShipDamage` production-callable proof in `functions/src/shipDamageCallable.test.ts` covers both AEGIS Armoured Hull cards, survivor preservation, conditional recycling when another damage card remains, final-card retention, and transaction retry-stable randomness/audit identity; no production-path change. |
| 133 | done | non-feature | — | Focused `adjustShipPopulation` production-callable proof in `functions/src/shipPopulationCallables.test.ts` covers all seven printed tracks, next printed values, endpoints, off-track denial, threshold alert creation, and pending-alert no-write behavior; no production-path change. |
| 134 | missing | non-feature | — | Planned [REPAIR] prompt: current alerts can require every GM instance and let a stale optional GM deadlock maintenance. One-GM ownership/unblock, informational additional-GM delivery, stale-instance expiry, and one-winner acknowledgement remain open. |
| 135 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 136 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 137 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 138 | done | feature | 0.3.18 | Authority-bound request IDs, pre-replay guards, one atomic resource/charge/fuel/damage/undo/event/receipt transaction, stateful CAS winner/stale proof, and write-free exact replay prevent duplicate maintenance effects; 138a/139/140 remain separate. |
| 138a | done | feature | 0.3.19 | Current-turn rollback restores only reversible maintenance state under the matching revision, preserves damage and existing audit events, and rejects stale repeated rollback without writes; Prompt 139/140 remain separate. |
| 139 | done | feature | 0.3.20 | Maintenance events publish an explicit crew-safe projection of costs and outcomes; client parsing drops hidden deck order, private facilitator data, and unknown fields while existing private receipts and replay identity remain unchanged. Prompt 140 remains separate. |
| 140 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 140a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 140b | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 140c | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 140d | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 140e | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 140f | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 140g | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 141 | done | feature | 0.3.23 | The authoritative `beginOpenAirspacePhase` transition now rejects reopening restricted normal airspace after the server-owned Coordination deadline while preserving active-member authorization, expected-turn CAS, lifted retry idempotency, and the deterministic member-visible `airspace-opened` event; Prompts 142–144 remain separate shuttle behavior. |
| 142 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 143 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 144 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 145 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 146 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 147 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 148 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 149 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 150 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 151 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 152 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 153 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 154 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 155 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 156 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 157 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 158 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 159 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 160 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 161 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 162 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 163 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 164 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 165 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 166 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 167 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 168 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 169 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 170 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 171 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 172 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 173 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 174 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 175 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 176 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 177 | done | feature | 0.3.17 | Focused domain/callable evidence preserves AEGIS's printed 2/3/6 costs, upgrade discount, damaged-drive roll thresholds, charge/fuel bounds, route lockout, once-per-turn denial, retry-stable server roll, atomic transition, and navigation audit; emergency jumps and broader concurrency remain out of scope. |
| 178 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 179 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 180 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 181 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 182 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 183 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 184 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 185 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 186 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 187 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 188 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 189 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 190 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 191 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 192 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 193 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 193a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 193b | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 194 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 195 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 196 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 197 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 198 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 199 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 200 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 201 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 202 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 203 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 203a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 203b | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 204 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 205 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 206 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 207 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 208 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 209 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 210 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 211 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 212 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 213 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 214 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 215 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 215a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 215b | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 216 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 217 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 218 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 219 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 220 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 221 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 222 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 223 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 223a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 223b | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 224 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 225 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 226 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 227 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 228 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 229 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 230 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 231 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 232 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 233 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 233a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 233b | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 234 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 234a | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 235 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 236 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 237 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 238 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 239 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 240 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 241 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 241a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 241b | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 241c | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 241d | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 241e | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 242 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 243 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 244 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 245 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 246 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 247 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 248 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 249 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 250 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 251 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 252 | missing | non-feature | — | Planned [REPAIR] prompt; no production-path evidence has been recorded yet. The owner-revised 8–20 Capybara core target, source-defined substitution matrices, and Press/multiple-GM orthogonality must be composed without relying on stale 19/21 presets. |
| 253 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 254 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 255 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 256 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 257 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 258 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 259 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 260 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 261 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 262 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 263 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 264 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 265 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 266 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 267 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 268 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 269 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 270 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 271 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 272 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 273 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 274 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 275 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 275a | done | feature | 0.3.10 | Failing-first and production-path coverage restores the default-enabled, authoritatively toggleable SNN Press station outside the counted core roster: dedicated CAS/audit state, unique stale-safe claim/reconnect, distinct private loyalty and Wolf eligibility, release/disconnect/disable cleanup, server action denial, multiple-GM/core-readiness separation, visible return navigation, roster-derived AEGIS-at-8/11 and Dione-at-12/18/20 hosting, exact connection copy, and viewport-safe DRADIS names are composed. Final focused evidence is **469/469** changed-surface tests plus **53/53** Firestore rules. Real Chrome review at 1440×900, 320×844, and 844×390 found no horizontal overflow and kept measured routed DRADIS labels in bounds; 320×844 reduced motion, keyboard return/focus, AEGIS/Dione host projection, the connection matrix, the GM Press revision/status surface, and the corrected 44×44 mobile Settings target also passed. Provenance: `71b5ad7` → `9c48e5d` → `dced782`; `1418146` is the last default-working release point and direct parent of regression `9d68158`, with counted-readiness conflict cemented by `e5aca326`; `4703e43` introduced the blanket-Dione drift. This release does not claim the still-missing owner-set 19-player Capybara runtime row. Literal field placement, an instant pre-acquisition capture, reduced-motion desktop/landscape, and live Firebase mutation were not part of the local browser fixture; deterministic geometry, authority, and emulator suites cover those non-live seams without claiming deployment proof. |
| 275b | missing | non-feature | — | Owner-reported regression: the SNN Dispatch Desk is not working. A dedicated follow-on release must recover the last working implementation from git history and restore the complete route/model/callable/rules/UI/reconnect/audit path. The enabled claimed Press Officer must be able to use the desk during Turn Zero because it is explicitly excluded from generic Turn Zero restrictions. Add chronological failing end-to-end regression, authority, bridge/audience, accessibility, mobile/landscape/reduced-motion, and CIC evidence; classify it as a feature with its own version only when that repair release is reserved. Do not fold it into 0.3.12 or count Press as core. |
| 276 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 277 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 278 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 279 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 280 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 281 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 282 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 283 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 284 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 285 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 286 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 287 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 288 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 289 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 290 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 291 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 292 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 293 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 294 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 295 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 296 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 297 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 298 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 299 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 300 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 301 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 302 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 303 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 304 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 305 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 306 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 307 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 308 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 309 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 310 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 311 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 312 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 313 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 314 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 315 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 316 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 317 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 318 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 319 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 320 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 321 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 322 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 323 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 324 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 325 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 326 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 327 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 328 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 329 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 330 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 331 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 332 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 333 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 334 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 335 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 336 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 337 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 338 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 339 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 340 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 341 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 342 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 343 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 344 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 345 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 346 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 347 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 348 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 349 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 350 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 351 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 352 | partial | non-feature | — | Current transition presentation/data exists, but no composed authoritative departure/arrival projection proves it. Planned [EXTEND] prompt. |
| 353 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 354 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 355 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 356 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 357 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 358 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 359 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 360 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 361 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 362 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 363 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 364 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 365 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 366 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 367 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 368 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 369 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 370 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 371 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 372 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 373 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 374 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 375 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 376 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 377 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 378 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 379 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 380 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 381 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 382 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 383 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 384 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 385 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 386 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 387 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 388 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 389 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 390 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 391 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 392 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 393 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 394 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 395 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 396 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 397 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 398 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 399 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 400 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 401 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 402 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 403 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 404 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 405 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 406 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 407 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 408 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 409 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 410 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 411 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 412 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 413 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 414 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 415 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 416 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 416a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 416b | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 417 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 417a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 417b | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 418 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 418a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 418b | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 419 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 420 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 421 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 421a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 422 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 423 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 424 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 425 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 426 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 427 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 428 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 429 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 430 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 431 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 432 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 432a | missing | non-feature | — | Planned [EXTEND] one-GM GM-console declare/advance/pause/inspect/resume prompt; no playable attack control composition exists yet. |
| 433 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 433a | missing | non-feature | — | Planned [NEW] stable DRADIS-ready attack endpoint/event schema, privacy, reconnect, and projection contract; no attack visualization is implied. |
| 433b | missing | non-feature | — | Planned [EXTEND] affected-player-console choices/results prompt; existing consoles do not yet resolve a playable attack. |
| 434 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 434a | missing | non-feature | — | Planned [EXTEND] reasoned CAS/idempotent danger-confirmed intervention/recovery/audit prompt; no composed attack override path exists yet. |
| 435 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 436 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 437 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 438 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 439 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 440 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 441 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 442 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 443 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 444 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 445 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 446 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 447 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 448 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 449 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 450 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 451 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 452 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 453 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 454 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 455 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 456 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 457 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 458 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 459 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 460 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 461 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 462 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 463 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 464 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 465 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 466 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 467 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 468 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 469 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 469a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 469b | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 469c | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 469d | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 469e | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 470 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 471 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 472 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 473 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 474 | missing | non-feature | — | Planned [EXTEND] crew/broadcast projection prompt; existing surfaces are not composed with attack results. |
| 475 | missing | non-feature | — | Planned [EXTEND] prompt reusing the authoritative damage primitive for combat. |
| 476 | missing | non-feature | — | Planned [EXTEND] prompt reusing authoritative deck-exhaustion catastrophe handling. |
| 477 | missing | non-feature | — | Planned [EXTEND] prompt reusing population/threshold primitives for combat casualties. |
| 478 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 479 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 480 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 481 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 482 | missing | non-feature | — | Planned [EXTEND] prompt: existing damage/correction and craft catalogs do not yet compose ordinary post-attack repair. |
| 483 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 484 | missing | non-feature | — | Planned [EXTEND] crew/GM/broadcast aftermath and one-GM recovery-work projection prompt. |
| 485 | missing | non-feature | — | Planned [REPAIR] prompt: pursuit presentation/client calculation exists, but no authoritative group value drives attack scheduling/navigation/failure. |
| 485a | missing | non-feature | — | Future pursuit-color repair: restore `0215488`'s normal ship/faction treatment outside authoritative Red Alert and use danger red only while the shared alert is active; `0d64e25` records the always-danger departure. Preserve countdown, values, split-fleet scope, terminal text, reconnect/stand-down/reduced-motion truth, and do not claim P485's broader server-owned pursuit acceptance. |
| 486 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 487 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 488 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 489 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 490 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 491 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 492 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 493 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 494 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 495 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 496 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 497 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 498 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 499 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 500 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 501 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 502 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 503 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 503a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 504 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 505 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 506 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 507 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 508 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 509 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 510 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 511 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 512 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 513 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 514 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 515 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 516 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 517 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 518 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 519 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 520 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 521 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 521a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 521b | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 522 | missing | non-feature | — | Planned [REPAIR] prompt: current distinct main/assistant staffing must become one-GM ownership with optional multi-GM lanes/handoff and no stale-instance deadlock. |
| 523 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 523a | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 523b | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 523c | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 524 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 524a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 524b | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 524c | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 524d | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 525 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 526 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 527 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 528 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 529 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 530 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 531 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 532 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 533 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 534 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 535 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 536 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 537 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 538 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 539 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 540 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 541 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 542 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 543 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 544 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 545 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 546 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 547 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 548 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 549 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 550 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 551 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 552 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 553 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 554 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 555 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 556 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 557 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 558 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 559 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 560 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 561 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 562 | missing | non-feature | — | Planned [NEW] prompt: aggregate only authoritative survivor ledgers and exclude theatrical announcement adjustments. |
| 563 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 564 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 565 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 566 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 567 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 568 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 569 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 570 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 571 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 572 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 573 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 574 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 575 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 576 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 577 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 578 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 579 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 580 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 581 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 582 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 583 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 584 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 585 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 586 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 587 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 588 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 589 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 589a | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 589b | missing | non-feature | — | Future [REPAIR]: the authenticated-session waiver solely owns the exact human-first regulation body `Be bold. Remember the human on the other side.` Preserve title/eyebrow, lifetime, checkbox/focus semantics, reconnect, privacy/audit, and GM-expiry distinction; do not duplicate the live sentence into debrief or rewrite historical changelog evidence. |
| 590 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 591 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 592 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 593 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 594 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 595 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 596 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 597 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 598 | partial | feature | 0.3.6, 0.3.10 | Historical releases provide the connected/offline grace primitive and earlier no-session copy repair, but the current live joined Turn 0 surface still needs the exact `CONNECTED — AWAITING IRIS AUTHENTICATION` visible copy and accessible name/title; `NOT CONNECTED` must never describe live transport or session state. Preserve the 30-second sustained-pre-outage grace and do not remap Prompt 041. |
| 599 | missing | non-feature | — | Planned [EXTEND] single-facilitator checklist with optional nonblocking additional-GM lanes and automatic setup receipt. |
| 600 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 601 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 602 | partial | feature | 0.3.25 | 0.3.25 restores compact Finale presentation geometry: the decorative ball is placed in a safe top-right gap so the existing Back to roles and Settings controls remain reachable; focused CSS geometry coverage and the authorized-GM enable/retract service-path test preserve the existing route and authority behavior. Universal every-route return proof, route activation coverage, and full rendered viewport evidence remain open. |
| 602a | missing | non-feature | — | Owner-reported shuttle return regression: ordinary shuttle consoles currently receive no `returnTo`; only Press, Joint Engineering, and GM special cases have exits. A dedicated repair must audit route/catalog/docking authority and history, restore prior working behavior if found, resolve one deterministic entitled associated-ship target without client guessing, and preserve session/seat/role/shuttle state. Prove deep link, reconnect, browser Back/Forward, denial/fallback, mobile/short-landscape, 44px keyboard/screen-reader, nonoverlap, and reduced-motion behavior without changing Press/Union/GM return semantics. |
| 603 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 603a | done | feature | 0.3.15 | Shared measured session-header padding now applies to Role Select and session-mode routes at max-width 42rem or max-height 42rem, while a higher-specificity shared ship-role rule preserves DRADIS clearance at 320×844, 390×844, and 844×390 without changing the absolute scrolling header or adding a route-specific ticket. The red/green static cascade test, focused suites, and checked-in CDP DOMRect evidence cover every rendered Role Select region, derived nonintersection, connected-player variants, simulated safe areas, role-control keyboard focus/order, absolute-header scroll-away, settings, wrapped reduced-motion FleetBroadcast, and 44px touch targets. Evidence is local rendered review, not live-Firebase or deployed proof. |
| 604 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 605 | partial | feature | 0.3.10 | Prompt 275a's focused geometry tests now prove intrinsic complete-name containment and two-axis clamping at top/right/bottom/left across 320x844, 1440x900, 844x390, compact/expanded, acquisition/privacy, normal and reduced motion. Full group-local transit/parking projection remains open, so this viewport regression cannot complete Prompt 605. |
| 605a | missing | non-feature | — | [DEFERRED-OWNER] Ultimate Wolf-attack DRADIS visualization awaits explicit owner activation after Prompt 433a endpoint/privacy proof and is not a playable-attack blocker. |
| 606 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 607 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 608 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 609 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 610 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 611 | missing | non-feature | — | Planned [EXTEND] prompt now explicitly includes compact/minimized and expanded DRADIS: both must expose a stable non-color `RED ALERT` cue from authoritative `fleetRedAlert` and clear on stand-down/reconnect/replay without stale local color-only meaning. P605a remains deferred. |
| 611a | missing | non-feature | — | Future CIC typography repair: characterize the exact `CONSOLE ACCESS // WRITE // CREW INCOMPLETE` surface and directly comparable label/readout outliers, then repair only proven token/tracking/casing/contrast/wrapping inconsistencies. No redesign or global type-scale change; require accessibility and responsive evidence at all four supported viewports. |
| 612 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 613 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 614 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 615 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 616 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 617 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 618 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 619 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 620 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 621 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 622 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 623 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 624 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 625 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 626 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 627 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 628 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 629 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 630 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 631 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 632 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 633 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 634 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 635 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 636 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 637 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 638 | missing | non-feature | — | Planned [EXTEND] prompt: the catalog now contains the owner-set 8–20 rows, but one-GM 20-core production setup, optional Press-21, multiple-GM, reconnect/action, and measured capacity evidence remain open. |
| 639 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 640 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 641 | missing | non-feature | — | Planned [PROVE] one-GM complete base playthrough followed by optional multi-GM mutation races. |
| 642 | missing | non-feature | — | Planned [PROVE] one-GM complete Capybara playthrough with optional independent Press and multi-GM race proof. |
| 643 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 644 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 645 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 646 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 647 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 648 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 649 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 650 | missing | non-feature | — | Planned [PROVE] prompt: authoritative pursuit/outcome must drive terminal failure; current client presentation cannot freeze or end play. |
| 651 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 652 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 652a | missing | non-feature | — | Future ticker regression repair: restore `a91a020`'s continuous-tail baseline so every Red Alert glyph stays fully visible until its painted bounds are outside the viewport. Audit `080457e` and later geometry without reverting unrelated header work; prohibit clipping, fade, truncation, early unmount, remeasurement jump, and overlap across replacement/stand-down/font-load/resize/rotation, with single announcement and reduced-motion proof. |
| 652b | missing | feature | — | Owner-requested mobile ticker behavior supersedes the earlier optional scroll-threshold experiment: always pin the Press ticker on narrow viewports, allow narrow-only hide/reveal, temporarily expand hidden content for Red Alert or airspace-restriction changes, and refold after notification display. Wide viewports force visible state and remove hiding controls; preserve lifecycle, layout, accessibility, and non-GM DRADIS guarantees. |
| 653 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 654 | missing | non-feature | — | Planned [REPAIR] prompt: after a confirmed canonical roster, zero, partial, or full role occupancy must not block an authoritative one-time production start; preserve real blocker reasons, authority, private setup, client-RNG denial, accessible start status, and mobile/reduced-motion CIC behavior. Supersedes retired Prompt 071 and depends on Milestone 1. |
| 655 | missing | non-feature | — | Planned [REPAIR] prompt: restore the exact visible and accessible evidence-shredder warning for docked ship cockpits while preserving authoritative SNN targeting, no unrelated/client targets, no ordinary GM event, and replay/reconnect deduplication. |
| 656 | missing | non-feature | — | Planned [REPAIR] prompt: route a cached, current, or resume-in-flight launcher at `/` to the authoritative current session/last route without create/join, mutation, release, or misleading recovery copy. |
| 657 | missing | non-feature | — | Planned [REPAIR] prompt: remove standalone `prompt`/`prompts` jargon from rendered changelog changes while preserving meaning, numeric roadmap markers, internal provenance terminology, and deterministic player-field-only guard coverage. |
| 658 | missing | non-feature | — | Planned [POLISH] prompt: retain `/roles` seat-change confirmation as the exact visible and accessible `SEAT CHANGES COMMIT THROUGH THE CIC.` while preserving authoritative seat/retry/stale/reconnect/privacy behavior and existing layout. |
| 659 | missing | non-feature | — | Planned [PRESERVE] prompt: inventory reachable player-facing copy, check in the approved CIC lexicon, forbidden jargon, and reviewed exceptions, and enforce the contract deterministically; this includes removing `System reduced motion is off.` while preserving system/effective reduced-motion behavior and meaningful accessibility. |
| 660 | done | non-feature | — | Completed as tooling-only infrastructure: exact full validation self-prepares a missing local emulator configuration through the atomic allocator, records configuration/content identity, preserves pre-existing or replaced files, and releases only its own reservation/files with the exact `npm run emulators:configure -- auto` fallback. |
| 661 | done | non-feature | — | Completed as tooling-only infrastructure: exact validation derives an AST/diff-proven static-copy profile requiring an allowlisted player source plus focused test, runs focused copy/a11y and lightweight gates only for that profile, and fails closed to `test:all` for mixed, uncertain, structural, security, or infrastructure changes. |
| 662 | missing | non-feature | — | Low-priority/deferred [DECISION]: current ordinary Setup intentionally has no manual Wolf designation under Prompts 054/075, but residual exported caller-controlled `assignWolves`, `assignWolfRoles`, and `resetWolves` plus manual-assignment guards require an owner-approved policy. Audit printed references, current UI, callables, guards, secrets, tests, and history. Do not choose automatic versus bounded manual policy here; record the locked-roster/private-audience/replay-CAS/authorization or GM-only roster-derived/a11y/rules-denial acceptance and overlaps/dependencies 054, 071, 075, 496, and 586–588. Remains missing. |
| 663 | missing | non-feature | — | Owner-reported AEGIS Fleetwide Red Alert button is missing on most layouts. Repair responsive visibility and discoverability of the authorized trigger and verify actual phone, desktop, short-landscape, resize, and reduced-motion layouts, preserving existing authority and the non-GM DRADIS experience. |
| 664 | done | non-feature | — | Universal roadmap-registration enforcement binds every non-documentation commit to a canonical dependency-ready item across the plan, progress ledger, and dependency index; tracked hooks, CI, coordination validation, merge-resolution checks, and preserved/discarded closeout all fail closed through the same validator. |
| 665 | done | non-feature | — | Completed as non-feature coordination governance: durable session-goal lifecycle for coordination begin, checked/unchecked wrap-up comparison, fail-closed artifact cleanup, explicit P012/P014/P664 migration, role-specific model floors, and reconciled exact-SHA release evidence recorded by the coordination gate. |
| 666 | done | non-feature | — | Completed [EXTEND] tooling provides the shared compact/full/JSON dispatcher, full parity/cycle/typed-evidence/readiness validation, authority/main/milestone/evidence and relevant-coordination fingerprints, atomic ignored receipt integrity, begin/amend/validate gates, exact P012/P014 legacy refresh, CI/guidance drift checks, and a repeatable `npm run coordination:dependencies:measure -- --entry <id>` fixture. Strict issuance uses a worktree-only random nonce with a ledger commitment and exact digest; authoritative validation consumes it once for the canonical partial-to-done transition, preserves the predecessor lineage without the nonce, and rejects deletion, post-done recreation, replay, mismatch, half-write, or repeat consumption. Current measured content is 24 lines / 2,541 bytes versus 670 lines / 51,297 bytes for the complete view; a representative 25-iteration run took 0.159 ms compact versus 3.498 ms full wall time. |
| 667 | missing | non-feature | — | Planned [PROVE] security-governance prompt: codify trusted contributors but untrusted-until-reviewed output, retain mandatory independent review, inventory and map the existing Firebase Hosting CDN, reCAPTCHA Enterprise App Check, Firestore enforcement, callable instance cap, and join-code/throttle controls, and route any demonstrated runtime gap to a separately registered feature rather than duplicate or speculative security expansion. |
| 668 | missing | non-feature | — | Planned [POLISH] prompt: make the Write Mode Off control use the shared button visual and interaction language while preserving current guards, accessible state, responsive behavior, and authorization. |
| 669 | missing | non-feature | — | Planned [POLISH] prompt: bring the GM DRADIS console to visual and interaction parity with the current ship-console DRADIS reference, with regression proof for all non-GM DRADIS behavior and authority and no broader refactor. |
| 670 | missing | non-feature | — | Planned [REPAIR] prompt: remove the unwanted additional-GM registration lockout from Role Select and the GM console while preserving server-owned identity, legitimate authorization, existing authority, and focused denial coverage. |
| 671 | missing | non-feature | — | Owner-requested app-wide and fleet-wide button consistency audit and repair, including both Ship View Privacy toggles; preserve behavior, privacy, authorization, and the accepted non-GM DRADIS experience. |
| 672 | missing | feature | — | Owner-requested placement of existing right-sidebar shuttle docking history inside main ship consoles, preserving its data authority, access rules, and existing sidebar behavior. |
| 673 | missing | feature | — | Owner-requested addition of the existing galactic orientation compass to ship navigation jump maps, preserving the reference compass, map interactions, coordinate meaning, and jump authority. |
| 674 | missing | feature | — | Owner-requested removal of ship Observer roles in favor of unobtrusive authorized GM console viewing, default read-only access, and a shared two-step red confirmation button for scoped write intervention; no special empty-server branch. |
| 675 | missing | feature | — | Owner-requested automatic timer pause when everyone disconnects and immediate resume from preserved remaining time when one participant rejoins; explicitly resume rather than restart and preserve manual pause authority. |
| 676 | missing | non-feature | — | Owner-requested jump-map layering repair: render the scanline under other map elements while preserving animation, map behavior, accessibility, and other console rendering. |
| 677 | missing | feature | — | Owner-requested per-ship jump-coordinate knowledge and a separate Ship View Privacy control for location contents; only that ship's visits or authorized discoveries reveal coordinates. |
| 678 | missing | feature | — | Owner-requested ship-console sharing of selected scanned system information with the whole fleet or selected ships, using authoritative known facts, recipient eligibility, and per-ship knowledge. |
| 679 | missing | feature | — | Owner-requested blind jump option: server-random travel to one node connected to the ship's current jump-map node, preserving normal jump authority, costs, consequences, and private chart knowledge. During the active blind jump, coordinate digits cosmetically scramble through 0–9 twice per second at randomized staggered timing, with reduced-motion and cleanup behavior. |
| 680 | missing | non-feature | — | Owner-requested fighter-wing observability repair: replace Alpha and Bravo's table-tracking placeholder with authoritative live strength and effective capacity, and align each bay's charge, damage, and upgrade status with the shared ship-console system-status display without inventing values or changing launch/combat rules. |
<!-- END GENERATED PROMPT CATALOG: progress-ledger -->

## Working notes

- Historical audit records release 0.3.4 at commit `1418146` as the last
  default-working release point and direct parent of regression `9d68158`.
- The plan's status tag controls the action: preserve existing contracts,
  extend only missing seams, implement new behavior test-first, and record
  decisions before exposing ambiguous actions.
- Resume pointer: Prompt 012 is the lowest-numbered unchecked acceptance and
  the default triage suggestion, not a dependency or concurrency lock. Prompt
  020 is the landed production-path composition proof; Prompt 020a is a
  separate queued single-player-demo boundary follow-on after the documented
  preserve contracts.
- Application versions `0.3.9` and `0.3.11` cover the Prompt 004 player-facing
  roster slice, with matching changelog coverage; Prompt 051 remains partial.
- Prompt 011 implementation entry `1788869999219-85128-286eba87` is scoped to
  the non-feature join-code policy contract on branch
  `chore/prompt-011-join-code-policy-20260908`.
- Prompt 011 failing-first receipt (recorded before the policy export was
  implemented; this historical result was not rerun for this documentation
  amendment):

  ```text
  npm test -- --run functions/src/joinCodeSecurity.test.ts
  ```

  Observed red result: **1 failed / 4 passed (5 total)**. The new policy
  assertion reported `JOIN_CODE_POLICY` as `undefined` instead of the
  expected contract object. The subsequent focused green run covered four
  files and 29 tests, as recorded above.
- Prompt 011 proof is complete on the focused function tests; full release
  gates and reconciled-branch validation are recorded in the coordination
  receipt, with merge/push/close paused for independent review.

- Full-range migration note: Prompt 041 remains the existing `done`/`non-feature`
  local-disconnect evidence. Prompt 598 carries the 0.3.6 primitive and the
  0.3.10 copy/composition repair as a `partial`/`feature` row because its exact
  live joined Turn 0 copy remains open. The old first-100 validator could not
  represent Prompt 598 and forced the earlier behavior to be associated with
  Prompt 041; no behavior or release was rewritten here.

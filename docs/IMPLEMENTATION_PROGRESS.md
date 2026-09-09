# Implementation Plan Progress — All 721 Prompts

This tracker records all 721 canonical prompt IDs in
[`docs/IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md). A prompt counts as
complete only after its `[PRESERVE]`, `[EXTEND]`, `[REPAIR]`, `[NEW]`,
`[PROVE]`, or `[DECISION]` acceptance has been fully satisfied with named evidence. A
`[DEFERRED-OWNER]` prompt remains missing until the owner explicitly activates
and accepts it. The
completed count is deliberately non-sequential: later prompts may be complete
while an earlier prompt remains partial or missing.

Completed prompts are also marked with `- [x]` in the execution checklist in
the source plan. Open or blocked prompts remain unchecked there so a later
session can resume at the first unresolved acceptance.

## Progress

**75 / 721 prompts complete (10.40%)**

Status breakdown: **75 done · 26 partial · 0 active · 620 missing**.

Active prompt: **none**.

The six-prompt future roadmap addendum records P031a, P106c, P485a, P611a,
P652a, and P652b as missing without changing any landed implementation status.
P589b remains missing but is reclassified from preservation to a narrow copy
repair; P611 remains missing with an explicit compact-DRADIS Red Alert boundary.
The country-flag regression report is retracted: P031a instead composes the
existing seat/console and flag-selection experiences while preserving the
historical bespoke flag choreography. The version 0.3.13 release snapshot below
therefore records the expanded 721-prompt denominator; older release snapshots
remain historical rather than being retroactively restated.

Version 0.3.13 closes Prompt 051 production roster-to-start composition, Prompt
054 authoritative routine Wolf derivation, and Prompt 071 one-GM readiness.
Prompt 054 is reclassified as a feature. Prompt 075 gains setup-receipt and
atomic Turn 1 evidence but remains partial because complete decks, craft,
resources/economy, and alert initialization are still outside this release.

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

### Version 0.3.18 progress evidence

The release boundary records Prompt 138 complete at **75 / 721 = 10.40%**
with **75 done · 26 partial · 0 active · 620 missing**. The printed maintenance
path now requires an authority-bound client request ID, checks authority and
phase before replay, and commits the resource, charge, fuel, damage, undo,
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

This page is a checked status contract, not a manually edited progress
summary. Run `npm run validate:implementation-progress` after changing the
ledger and before reporting progress. The gate derives its allowed prompt IDs
from every canonical prompt heading in the source plan, cross-checks one status
row per ID, the headline count and percentage, the status breakdown, the checked
source-plan boxes, changelog coverage, and the resume pointer. It accepts both
base and lettered IDs without a 001–100 range assumption.

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

| Prompt | Status | Change | Changelog | Evidence / result |
| ---: | :--- | :--- | :--- | :--- |
| 001 | done | non-feature | — | Source map and precedence in `docs/IMPLEMENTATION_PLAN.md` and routed reference overview. |
| 002 | done | non-feature | — | Plan precedence rule plus routed printed references. |
| 003 | done | non-feature | — | Ambiguity and decision ledger in `docs/IMPLEMENTATION_CONTRACTS.md` §1. |
| 004 | done | feature | 0.3.9, 0.3.11 | Prompt 004 catalog slice complete: client/server tests prove exact ordered, unique 8–20 rows; 19 = base-17 plus Capybara Captain/Recycler and 20 = base-18 plus the same pair; invalid boundaries, Dione/SNN host at 19, vessels/Union, two Wolves, Press/GM exclusion, and GM-local 19 staging are covered. Creation/guard/hydration parity is inherited shared-count propagation only. Prompt 030 remains partial; no claims are made for Prompts 021, 030, 051, 054, 071, 073, 075, or 020; lower-count Capybara substitutions remain unresolved. |
| 005 | done | non-feature | — | Capability matrix in `docs/IMPLEMENTATION_CONTRACTS.md` §2. |
| 006 | done | non-feature | — | Projection/redaction contract in `docs/IMPLEMENTATION_CONTRACTS.md` §3 and `projectPrivateSetup` tests. |
| 007 | done | non-feature | — | `functions/src/eventEnvelope.ts` and `eventEnvelope.test.ts`. |
| 008 | done | non-feature | — | `functions/src/lifecycle.ts` and `lifecycle.test.ts`. |
| 009 | done | non-feature | — | Deterministic fixture seams in `functions/src/atddFixtures.ts` with five focused tests. |
| 010 | done | non-feature | — | Prompt-by-prompt audit in `docs/IMPLEMENTATION_CONTRACTS.md` §5. |
| 011 | done | non-feature | — | `functions/src/joinCodeSecurity.ts` exports immutable `JOIN_CODE_POLICY` for legacy/current lengths, digits-only format, session-until-retirement lifetime, non-enumerating lookup, and transactional `joinCodes` collision ownership. `joinCodeSecurity.test.ts`, `joinSessionCallable.test.ts`, `createSessionCallable.test.ts`, and `sessionLifecycleCallable.test.ts` prove the contract, malformed-input boundary, both code formats, duplicate-code skip, and retirement deletion; focused run: 4 files, 29 tests passed. |
| 012 | partial | non-feature | — | Selected callables replay results; no universal command matrix yet. |
| 013 | done | non-feature | — | `turnZero.ts`, `sessionLifecycle.ts`, and server timestamp paths. |
| 014 | partial | non-feature | — | Revision fields/parsing exist; universal stale-mutation semantics remain open. |
| 015 | partial | feature | 0.3.5 | Callable error codes are tested, but no centralized taxonomy yet. |
| 016 | done | non-feature | — | Resume/lifecycle tests and rules identity boundary. |
| 017 | partial | non-feature | — | Stable string IDs exist; unified typed IDs for all entities remain open. |
| 018 | done | feature | 0.3.5, 0.3.7 | `actionMetadata.ts`, wrong-phase maintenance/jump tests, callable gates, and stale bridge-dispenser authority rejection. |
| 019 | partial | non-feature | — | Event visibility exists; payload redaction is not centralized for every event. |
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
| 055 | missing | non-feature | — | Intelligence Agent gating is not yet explicit. |
| 056 | missing | non-feature | — | Universal Arbour/Wolf Cult setup is not yet explicit. |
| 057 | partial | feature | 0.3.5 | Base/expansion/none configuration validation exists; full lock/composition remains open. |
| 058 | partial | feature | 0.3.5 | Capybara catalogs and mode persistence exist; expansion start initialization remains open. |
| 059 | done | feature | 0.3.5 | `setShipPreference` and `castingCallable.test.ts`. |
| 060 | done | feature | 0.3.5 | `assignRole` facilitator callable and tests. |
| 061 | done | feature | 0.3.5 | Role exclusivity policy plus callable denial tests. |
| 062 | partial | feature | 0.3.5 | `releaseRole` clears assignment/console; seat/craft/private pointer composition remains open. |
| 063 | missing | non-feature | — | Role-private brief reader/projection path remains open. |
| 064 | partial | feature | 0.3.5 | Private loyalty records are written; a complete entitled reader projection remains open. |
| 065 | done | feature | 0.3.5 | Loyalty suspicion policy and assignment tests cover all listed kinds. |
| 066 | done | feature | 0.3.5 | Reciprocal Friend secret records and privacy test. |
| 067 | done | feature | 0.3.5 | Android self-disclosure callable and denial test. |
| 068 | partial | non-feature | — | Printed craft ownership primitives exist; start composition remains open. |
| 069 | partial | non-feature | — | Population/resource catalogs exist; one start initializer is still open. |
| 070 | partial | non-feature | — | Security/resource primitives exist; roster-wide start initialization is open. |
| 071 | done | feature | 0.3.5, 0.3.13 | Production start now requires the exact connected core count, canonical unique seat documents with reciprocal live player pointers, exact roles/vessels, private loyalty completeness, and at least one live authorized GM. One GM can carry both responsibilities; additional GMs never block. Enabled-unclaimed Press does not block, while claimed Press stays distinct and requires its own private loyalty. Precise nonsecret reasons, lease/authority checks, and stale/race denial are covered. |
| 072 | done | feature | 0.3.5 | Start lock plus casting-window rejection. |
| 073 | done | feature | 0.3.5, 0.3.12 | Version 0.3.12 closes the singular/exclusive responsibility model: one active GM represents both printed labels, optional GMs may share or hand off lanes, and legacy singular data normalizes deterministically. Revisioned responsibility mutation and replay/audit evidence are covered; Prompt 071 retains the separate readiness/start acceptance. |
| 074 | done | feature | 0.3.5 | Start requires authenticated active facilitator instance. |
| 075 | partial | feature | 0.3.5, 0.3.13 | Version 0.3.13 atomically locks validated setup, composes routine private Wolf/default loyalty state, records the one-GM calculation receipt and safe event, initializes pursuit 2, and enters Turn 1 exactly once with existing timer/announcement behavior. Complete deck, craft, resource/economy, and alert initialization remains open, so Prompt 075 stays partial. |
| 076 | done | non-feature | — | Durable start request replay test. |
| 077 | partial | feature | 0.3.5 | Start initializes fleet pursuit at 2; split-group pursuit remains open. |
| 078 | done | feature | 0.3.5 | Six-to-eight validation and start configuration lock. |
| 079 | done | non-feature | — | Turn 1 timer override tests. |
| 080 | missing | non-feature | — | Facilitator-marked approximate Wolf-attack window remains open. |
| 081 | done | non-feature | — | Durable Turn 1 announcement/replay tests. |
| 082 | partial | non-feature | — | Public state exists; complete projection serializer remains open. |
| 083 | done | non-feature | — | Member/nonmember snapshot rules tests. |
| 084 | partial | feature | 0.3.5 | Crew UI/state exists; centralized per-ship projection remains open. |
| 085 | missing | non-feature | — | Role-private reconnect projection remains open. |
| 086 | partial | feature | 0.3.5 | GM reads exist; census/suspicion/note projection remains incomplete. |
| 087 | done | non-feature | — | Broad direct-write denial matrix in rules tests. |
| 088 | partial | non-feature | — | Revision parsing exists; universal delayed-snapshot ordering remains open. |
| 089 | missing | non-feature | — | General event replay/reconstruction remains open. |
| 090 | missing | non-feature | — | Full serialized hidden-state redaction proof remains open. |
| 091 | partial | non-feature | — | Server turn clock exists; complete turn entity remains open. |
| 092 | partial | non-feature | — | Team transition exists; single transition-machine proof remains open. |
| 093 | partial | non-feature | — | Coordination transition exists; complete late/illegal edge proof remains open. |
| 094 | done | non-feature | — | Server Team timer duration tests. |
| 095 | done | non-feature | — | Server Coordination timer duration tests. |
| 096 | done | non-feature | — | Turn 1-only override tests. |
| 097 | done | non-feature | — | Emergency pause interlock/audit tests. |
| 098 | done | feature | 0.3.16 | Version 0.3.16 makes Team expiry and Coordination handoff transaction-owned transitions with deterministic member-scoped `airspace-opened` and `turn-advanced` events. Lifecycle ordinals are 2*turn-1 and 2*turn (envelope ordinals, not stored phase revisions); the stateful optimistic-CAS fixture proves mixed expiry observers and distinct GM advances commit one transition/event, expire resources once, and leave stale retries write-free. Existing auth, membership, expected-turn, pause, deadline, override, and client-write denial guards remain covered. |
| 099 | partial | non-feature | — | Maintenance wrong-phase gate exists; full Team-action family matrix remains open. |
| 100 | partial | non-feature | — | Movement/jump Coordination gates exist; transfer/scouting/research coverage remains open. |
| 101 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 102 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 103 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 103a | missing | non-feature | — | Planned [NEW] prompt: hide AIRSPACE CLOSED on the turn-advance interstitial, freeze the authoritative deadline until clear/dismiss, resume from preserved remaining time, and cover stale/retry/reconnect/multi-client/accessibility behavior; no production-path evidence has been recorded. Depends on Prompts 091–096, 098, 101–103, 106b, 108–109, and 154–158. |
| 104 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 105 | partial | non-feature | — | PursuitTracker now exposes the remaining pursuit-10 distance as cycle/cycles copy in visible and progressbar ARIA text; authoritative terminal-failure outcome and action lockout remain open. |
| 106 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 106a | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 106b | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 106c | missing | non-feature | — | Future server-authoritative FleetTicker lifecycle: deterministic session/message/revision identities, precedence, current/queued/draining state, pass counts, dismissals, and replay cursors must serialize concurrent automatic/Admiral/Press send-replace-dismiss and Red Alert activation/stand-down. Reconnect/replay/late join and every client converge; idempotent CAS, authenticated authority, privacy-safe projection/audit, schema bounds, and direct-write denial precede P652a/P652b. |
| 107 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 108 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 109 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 110 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 111 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 112 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 113 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 114 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 115 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 116 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 117 | missing | non-feature | — | Planned [DECISION] prompt; no production-path evidence has been recorded yet. |
| 118 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 119 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 120 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 121 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 122 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
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
| 132 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 133 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 134 | missing | non-feature | — | Planned [REPAIR] prompt: current alerts can require every GM instance and let a stale optional GM deadlock maintenance. One-GM ownership/unblock, informational additional-GM delivery, stale-instance expiry, and one-winner acknowledgement remain open. |
| 135 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 136 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 137 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 138 | done | feature | 0.3.18 | Authority-bound request IDs, pre-replay guards, one atomic resource/charge/fuel/damage/undo/event/receipt transaction, stateful CAS winner/stale proof, and write-free exact replay prevent duplicate maintenance effects; 138a/139/140 remain separate. |
| 138a | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 139 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 140 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 140a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 140b | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 140c | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 140d | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 140e | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 140f | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 140g | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 141 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
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
| 598 | done | feature | 0.3.6, 0.3.10 | Release 0.3.6 provides the connected/offline grace primitive; release 0.3.10 repairs the owner-revised exact no-session `CONNECTED`, joined pre-Turn-1 `NOT CONNECTED — AWAITING IRIS AUTHENTICATION`, truthful accessible title, legacy `currentTurn`, and composed live/offline-after-grace matrix. Focused component/AppHeader coverage and the real-browser no-session/Turn-0 matrix provide the current evidence without remapping Prompt 041. |
| 599 | missing | non-feature | — | Planned [EXTEND] single-facilitator checklist with optional nonblocking additional-GM lanes and automatic setup receipt. |
| 600 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 601 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 602 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
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
| 652b | missing | non-feature | — | Future explicit mobile experiment: keep the non-sticky baseline at scroll top and become a reserved-space sticky row only after the measured lower edge crosses `safe-area-inset-top`. Reflow around safe areas, session ticket, Role Select, controls, keyboard, resize/rotation, and wrapped/reduced-motion copy. Roll back under `TICKER-STICKY-OCCLUSION` for occlusion, oscillation, excess layout shift, material jank, or lost/duplicate announcement; never silently make it permanent. |
| 653 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |

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
  0.3.10 copy/composition repair as a `done`/`feature` row. The old first-100 validator could not represent
  Prompt 598 and forced the earlier behavior to be associated with Prompt 041;
  no behavior or release was rewritten here.

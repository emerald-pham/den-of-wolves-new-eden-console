# Implementation Plan Progress — Prompts 001–100

This tracker records the first 100 numbered prompts in
[`docs/IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md). A prompt counts as
complete only after its `[PRESERVE]`, `[EXTEND]`, `[NEW]`, `[PROVE]`, or
`[DECISION]` acceptance has been fully satisfied with named evidence. The
completed count is deliberately non-sequential: later prompts may be complete
while an earlier prompt remains partial or missing.

Completed prompts are also marked with `- [x]` in the execution checklist in
the source plan. Open or blocked prompts remain unchecked there so a later
session can resume at the first unresolved acceptance.

## Progress

**64 / 100 prompts complete (64%)**

Status breakdown: **64 done · 28 partial · 8 missing**.

Active prompt: **none**.

The resume pointer is separate from the completion count. It is the
lowest-numbered prompt that is not done, not a sequential cursor or a claim
that only that many prompts have been completed. In this snapshot, Prompt 004
is the first unresolved prompt even though later prompts are already complete.

`[█████████████░░░░░░░]`

Each bar block represents approximately five completed prompts. Legend: `done`
= the acceptance is satisfied with named evidence, `partial` = a real seam
exists but at least one acceptance boundary remains, `missing` = no truthful
production-path acceptance exists yet, and `blocked` = a concrete external or
product decision is required. Only `done` prompts are checked in the source
plan.

## Progress integrity gate

This page is a checked status contract, not a manually edited progress
summary. Run `npm run validate:implementation-progress` after changing the
ledger and before reporting progress. The gate cross-checks the prompt IDs and
statuses, the headline count and percentage, the status breakdown, the checked
source-plan boxes, and the resume pointer. It also prints the canonical
aggregate status sentence so “complete” and “resume” cannot be conflated.

When work starts, set `Active prompt` to the first unresolved prompt and change
that ledger row to `in-progress`. Exactly one prompt may be `in-progress`. The
move-on gate fails while that row is open: mark it `done`, `partial`, `missing`,
or `blocked` with evidence before selecting another prompt. A non-`done` result
remains the resume point, so marking a prompt partial, missing, or blocked does
not authorize silently skipping it.

Every ledger row also declares whether the prompt is a `feature` or
`non-feature` change. A feature row names its application release or releases
in the `Changelog` column. Each matching `src/changelog.ts` entry must list that
prompt in `implementationPrompts` and contain at least one concrete
player-facing change for it. The coordination preemptive changelog is only a
planning note; it cannot satisfy this gate. Non-feature rows use `—` and must
not be listed in changelog coverage metadata.

## Execution ledger

| Prompt | Status | Change | Changelog | Evidence / result |
| ---: | :--- | :--- | :--- | :--- |
| 001 | done | non-feature | — | Source map and precedence in `docs/IMPLEMENTATION_PLAN.md` and routed reference overview. |
| 002 | done | non-feature | — | Plan precedence rule plus routed printed references. |
| 003 | done | non-feature | — | Ambiguity and decision ledger in `docs/IMPLEMENTATION_CONTRACTS.md` §1. |
| 004 | partial | non-feature | — | `functions/src/roleConfiguration.ts` and `gameSetup.ts` validate 8–18; full roster composition proof remains open. |
| 005 | done | non-feature | — | Capability matrix in `docs/IMPLEMENTATION_CONTRACTS.md` §2. |
| 006 | done | non-feature | — | Projection/redaction contract in `docs/IMPLEMENTATION_CONTRACTS.md` §3 and `projectPrivateSetup` tests. |
| 007 | done | non-feature | — | `functions/src/eventEnvelope.ts` and `eventEnvelope.test.ts`. |
| 008 | done | non-feature | — | `functions/src/lifecycle.ts` and `lifecycle.test.ts`. |
| 009 | done | non-feature | — | Deterministic fixture seams in `functions/src/atddFixtures.ts` with five focused tests. |
| 010 | done | non-feature | — | Prompt-by-prompt audit in `docs/IMPLEMENTATION_CONTRACTS.md` §5. |
| 011 | partial | non-feature | — | `joinCodeSecurity.ts` validates/throttles codes; lifetime/alphabet policy still needs a single contract. |
| 012 | partial | non-feature | — | Selected callables replay results; no universal command matrix yet. |
| 013 | done | non-feature | — | `turnZero.ts`, `sessionLifecycle.ts`, and server timestamp paths. |
| 014 | partial | non-feature | — | Revision fields/parsing exist; universal stale-mutation semantics remain open. |
| 015 | partial | feature | 0.3.5 | Callable error codes are tested, but no centralized taxonomy yet. |
| 016 | done | non-feature | — | Resume/lifecycle tests and rules identity boundary. |
| 017 | partial | non-feature | — | Stable string IDs exist; unified typed IDs for all entities remain open. |
| 018 | done | feature | 0.3.5 | `actionMetadata.ts` plus wrong-phase maintenance/jump tests and callable gates. |
| 019 | partial | non-feature | — | Event visibility exists; payload redaction is not centralized for every event. |
| 020 | missing | non-feature | — | Full production create→join→cast→start→Turn 1 composition fixture remains open. |
| 021 | done | feature | 0.3.5 | `requestGuards.test.ts`, `gameSetup.test.ts`, and `createSessionCallable.test.ts`. |
| 022 | partial | feature | 0.3.5 | Atomic creation path and direct test exist; standardized envelope event is still open. |
| 023 | done | non-feature | — | Request record replay tested in `createSessionCallable.test.ts`. |
| 024 | done | non-feature | — | `joinSessionCallable.test.ts` and rules tests. |
| 025 | done | non-feature | — | Join-code lookup/security tests and denied listing. |
| 026 | done | non-feature | — | Membership uniqueness transaction tests. |
| 027 | done | non-feature | — | Non-enumerating limiter tests. |
| 028 | done | non-feature | — | Session-header membership/listing rules tests. |
| 029 | done | non-feature | — | Seat policy/callable one-seat tests. |
| 030 | done | non-feature | — | Authoritative seat transaction tests. |
| 031 | done | non-feature | — | Seat race/conflict tests. |
| 032 | done | non-feature | — | Seat release tests. |
| 033 | done | non-feature | — | Foreign/stale seat release denial tests. |
| 034 | done | non-feature | — | Resume callable and session service tests. |
| 035 | done | non-feature | — | Intended-seat reclaim tests. |
| 036 | done | non-feature | — | Own-presence rules tests. |
| 037 | done | non-feature | — | Presence lease tests. |
| 038 | done | non-feature | — | Stale-device expiry tests. |
| 039 | done | non-feature | — | Seat reconciliation on expiry tests. |
| 040 | done | non-feature | — | Empty-session retention tests. |
| 041 | done | non-feature | — | Local disconnect/outbox tests and connection-indicator eligibility tests. |
| 042 | done | non-feature | — | Queued disconnect replay tests. |
| 043 | done | non-feature | — | Resume/disconnect route tests. |
| 044 | done | non-feature | — | GM eligibility/device-mode policy tests. |
| 045 | done | non-feature | — | GM instance claim tests. |
| 046 | done | non-feature | — | GM elevation denial tests. |
| 047 | done | non-feature | — | Console mode tests. |
| 048 | done | non-feature | — | GM Observer read-only tests. |
| 049 | done | non-feature | — | Observer elevation reset tests. |
| 050 | done | non-feature | — | Return-navigation route tests. |
| 051 | partial | non-feature | — | Presets exist; exact all-count roster composition remains open. |
| 052 | done | non-feature | — | Dione threshold/configuration tests. |
| 053 | done | non-feature | — | Union substitution tests. |
| 054 | done | non-feature | — | Wolf count/assignment tests. |
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
| 071 | done | feature | 0.3.5 | Readiness policy and `startCallable.test.ts` precise reasons. |
| 072 | done | feature | 0.3.5 | Start lock plus casting-window rejection. |
| 073 | done | feature | 0.3.5 | Main/assistant responsibility callable and readiness test. |
| 074 | done | feature | 0.3.5 | Start requires authenticated active facilitator instance. |
| 075 | partial | feature | 0.3.5 | Atomic Turn 1/lock/timer/pursuit/event start exists; decks/craft/resources remain open. |
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
| 098 | partial | non-feature | — | Transition paths exist; explicit expiry race proof remains open. |
| 099 | partial | non-feature | — | Maintenance wrong-phase gate exists; full Team-action family matrix remains open. |
| 100 | partial | non-feature | — | Movement/jump Coordination gates exist; transfer/scouting/research coverage remains open. |

## Working notes

- Started from commit `1418146` on branch
  `chore/execute-plan-100-prompts-20260907`.
- The plan's status tag controls the action: preserve existing contracts,
  extend only missing seams, implement new behavior test-first, and record
  decisions before exposing ambiguous actions.
- Resume pointer: Prompt 004 is the lowest-numbered unchecked acceptance;
  this is independent of the 64 completed prompts. Prompt 020 is the first
  missing production-path composition proof after the documented preserve
  contracts.
- Application version `0.3.5` is reserved for this first-100 slice. If the
  final work is documentation-only, the version reservation must be reconciled
  before closeout rather than left as an unearned release.

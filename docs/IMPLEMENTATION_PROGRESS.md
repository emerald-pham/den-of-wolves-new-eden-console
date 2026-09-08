# Implementation Plan Progress — All 705 Prompts

This tracker records all 705 canonical prompt IDs in
[`docs/IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md). A prompt counts as
complete only after its `[PRESERVE]`, `[EXTEND]`, `[NEW]`, `[PROVE]`, or
`[DECISION]` acceptance has been fully satisfied with named evidence. The
completed count is deliberately non-sequential: later prompts may be complete
while an earlier prompt remains partial or missing.

Completed prompts are also marked with `- [x]` in the execution checklist in
the source plan. Open or blocked prompts remain unchecked there so a later
session can resume at the first unresolved acceptance.

## Progress

**66 / 705 prompts complete (9%)**

Status breakdown: **66 done · 28 partial · 611 missing**.

Active prompt: **none**.

The resume pointer is separate from the completion count. It is the
lowest-numbered prompt that is not done, not a sequential cursor or a claim
that only that many prompts have been completed. In this snapshot, Prompt 004
is the first unresolved prompt even though later prompts are already complete.

`[██░░░░░░░░░░░░░░░░░░]`

Each bar block represents approximately five completed prompts. Legend: `done`
= the acceptance is satisfied with named evidence, `partial` = a real seam
exists but at least one acceptance boundary remains, `missing` = no truthful
production-path acceptance exists yet, and `blocked` = a concrete external or
product decision is required. Only `done` prompts are checked in the source plan.

## Progress integrity gate

This page is a checked status contract, not a manually edited progress
summary. Run `npm run validate:implementation-progress` after changing the
ledger and before reporting progress. The gate derives its allowed prompt IDs
from every canonical prompt heading in the source plan, cross-checks one status
row per ID, the headline count and percentage, the status breakdown, the checked
source-plan boxes, changelog coverage, and the resume pointer. It accepts both
base and lettered IDs without a 001–100 range assumption.

When work starts, set `Active prompt` to the first unresolved prompt and change
that ledger row to `in-progress`. The coordination registry owns the active
claim: agents may claim different base or lettered IDs concurrently, but a
second active claim for the same normalized ID is rejected. The move-on gate
fails while an in-progress row is open: mark it `done`, `partial`, `missing`,
or `blocked` with evidence before selecting another prompt.

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
| 004 | partial | non-feature | — | `functions/src/roleConfiguration.ts` and `gameSetup.ts` validate 8–18; full roster composition proof remains open. |
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
| 101 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 102 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 103 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 104 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 105 | partial | non-feature | — | PursuitTracker now exposes the remaining pursuit-10 distance as cycle/cycles copy in visible and progressbar ARIA text; authoritative terminal-failure outcome and action lockout remain open. |
| 106 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 106a | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 106b | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
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
| 134 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 135 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 136 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 137 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 138 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
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
| 177 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
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
| 252 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
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
| 275a | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 275b | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
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
| 352 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
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
| 433 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 434 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
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
| 474 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 475 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 476 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 477 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 478 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 479 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 480 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 481 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 482 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 483 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 484 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
| 485 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
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
| 522 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
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
| 562 | missing | non-feature | — | Planned [NEW] prompt; no production-path evidence has been recorded yet. |
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
| 589b | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 590 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 591 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 592 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 593 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 594 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 595 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 596 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 597 | missing | non-feature | — | Planned [PRESERVE] prompt; no production-path evidence has been recorded yet. |
| 598 | done | feature | 0.3.6 | `src/components/AppHeader.tsx` and focused tests now derive connected/offline/stale state from real signals; this landed behavior is tracked directly under Prompt 598. |
| 599 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 600 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 601 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 602 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 603 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 604 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 605 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 606 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 607 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 608 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 609 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 610 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 611 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
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
| 638 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 639 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 640 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 641 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 642 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 643 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 644 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 645 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 646 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 647 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 648 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 649 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 650 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 651 | missing | non-feature | — | Planned [PROVE] prompt; no production-path evidence has been recorded yet. |
| 652 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |
| 653 | missing | non-feature | — | Planned [EXTEND] prompt; no production-path evidence has been recorded yet. |

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
  local-disconnect evidence. The 0.3.6 connectivity behavior is tracked directly
  under Prompt 598 as a `done`/`feature` row with changelog coverage. The old
  first-100 validator could not represent Prompt 598 and forced that behavior to
  be associated with Prompt 041; no behavior or release was rewritten here.

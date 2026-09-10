# Implementation prompt dependency index

This is the mandatory dependency authority and fast triage index for the
canonical prompt catalog. The acceptance narrative, source-of-truth decisions,
and completion evidence remain authoritative in
[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md),
[IMPLEMENTATION_MILESTONES.md](./IMPLEMENTATION_MILESTONES.md), and
[IMPLEMENTATION_PROGRESS.md](./IMPLEMENTATION_PROGRESS.md); the plan is not
standalone. This index records only dependencies that the source explicitly
states; an empty cell is written as none, not inferred as permission to skip
the prompt.

## Mandatory gate: read before prompt work

Every agent selecting, assigning, starting, or editing a numbered prompt must
read this document first. Before selection, reconcile its exact row, live
progress status, hard prerequisites, milestone/contract/owner gates, closure
scope, sequence/order context, and evidence entries with current `main` and the
active coordination registry. Run the deterministic dispatcher and claim only
the resulting dependency-ready scope. A plan definition, numeric adjacency, or
prose attestation cannot replace an unmet prerequisite.

If a branch is rebased, current `main` materially moves, or dependency status
or ownership changes, stop and re-read this document and the selected row,
refresh the dispatcher, and reconcile coordination before continuing. A prompt
cannot be marked complete or merged while a hard prerequisite remains unmet;
closure/evidence gates are checked at completion and do not silently become
start blockers.

## Fast path: choose the next prompt

1. Read the candidate prompt row here and confirm its status in
   `IMPLEMENTATION_PROGRESS.md`. The lowest unresolved ID is a resume pointer,
   not a dependency lock.
2. For a missing or partial prompt, only hard_prompt_prerequisites,
   hard_milestone, hard_contract, and decision_owner block start readiness.
   closure_evidence_gates are completion/audit gates, not start blockers;
   release_boundaries, sequence_rules, and related_consumes are context. Every
   hard prompt must be done; every named milestone, contract, or owner gate
   must be confirmed in the current source-of-truth documents.
3. Use milestone_hints, sequence_rules, release_boundaries, and related_consumes
   to pick a bounded slice with the right story context. These fields never
   become hidden readiness blockers.
4. Before assigning work, read the prompt definition, its progress row, the
   matching milestone, and the evidence_ids source entries below. Preserve the
   plan workflow: separate documentation/proof from implementation and do not
   turn this index into completion evidence.

Exact lookup for one prompt:

~~~sh
prompt_id=020a
rg -n "^\| $prompt_id \|" docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md
rg -n -A 2 "^- \*\*Prompt $prompt_id —" docs/IMPLEMENTATION_PLAN.md
rg -n "^\| $prompt_id \|" docs/IMPLEMENTATION_PROGRESS.md
~~~

## Coverage and integrity

At this commit the plan contains 730 canonical IDs: 662 numeric IDs plus 68 lettered IDs, with retired Prompt 071 excluded. The count is a source snapshot, not a second source of truth. Run this check after any catalog or progress edit:

~~~sh
plan_count=$(rg -c '^- \*\*Prompt [0-9]{3}[a-z]* —' docs/IMPLEMENTATION_PLAN.md)
index_count=$(rg -c '^\| [0-9]{3}[a-z]* \|' docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md)
progress_count=$(rg -c '^\| [0-9]{3}[a-z]* \|' docs/IMPLEMENTATION_PROGRESS.md)
test "$plan_count" -eq "$index_count"
test "$index_count" -eq "$progress_count"
awk '/^~~~js$/{inside=1; next} inside && /^~~~$/{exit} inside{print}' docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md | node
~~~

The full integrity checker, typed evidence/sequence rules, deterministic
dispatcher, current-ledger sample, and maintenance rules follow the generated
rows in this file.

## Field contract

| Field | Readiness meaning |
| --- | --- |
| prompt_id | Canonical ID copied from the plan definition; lettered IDs are explicit rows. |
| plan_tag | Acceptance class copied from the plan heading; the checker compares it with the live heading. |
| progress | Current status copied from the progress ledger; the checker requires parity before lookup. done is required for a hard prompt prerequisite. |
| hard_prompt_prerequisites | Explicit prompt IDs or inclusive numeric ranges that block this prompt until their progress rows are done. |
| hard_milestone | Explicit milestone or release gate that must be green/merged before selection. |
| hard_contract | Named source-of-truth contract explicitly required before selection; verify its current evidence rather than guessing from row order. |
| decision_owner | Explicit owner decision/approval gate. Treat it as blocking until the owner records the decision. |
| closure_evidence_gates | Explicit completion, evidence, or audit scope. These gates are checked when closing/proving a prompt and never block starting it; for example, P160 audits P001-159 coverage and P602 closes after P602a is green. |
| sequence_rules | Named delivery/order context. Inform selection, but never blocks readiness by itself. |
| release_boundaries | Explicit release-boundary or slice-order context. It is not a hard contract and does not block readiness by itself. |
| related_consumes | Explicitly related/consumed prompt context that is useful for navigation, but never blocks readiness. |
| evidence_ids | Source register entries supporting every non-none dependency, closure, release-boundary, or ordering field in the row. |
| milestone_hints | Exact primary-neighborhood hints from the compact milestone map; navigation only, not an ownership claim. |
| title | Short title copied from the plan definition for fast visual scanning. |

Numeric ranges are inclusive and fail closed: every expanded member must be canonical or explicitly listed as retired. The current retired set is 071, which has no row and is never a valid hard target. Lettered IDs are always explicit tokens; lettered ranges are not supported. A range never creates an edge to a lettered prompt, and none means that no explicit dependency was found in the current source.

## Prompt rows

| prompt_id | plan_tag | progress | hard_prompt_prerequisites | hard_milestone | hard_contract | decision_owner | closure_evidence_gates | sequence_rules | release_boundaries | related_consumes | evidence_ids | milestone_hints | title |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 001 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Build the canonical rule-source index. |
| 002 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Encode source precedence. |
| 003 | DECISION | done | none | none | none | none | none | none | none | none | none | M1 | Create the ambiguity ledger. |
| 004 | EXTEND | done | none | none | none | none | none | M1-SETUP | none | none | E-M1-SETUP | M1 | Encode the supported player-count matrix. |
| 005 | PROVE | done | none | none | none | none | none | none | none | none | none | M1 | Define the session capability matrix. |
| 006 | PROVE | done | none | none | none | none | none | none | none | none | none | M1 | Define information projections. |
| 007 | PROVE | done | none | none | none | none | none | none | none | none | none | M1 | Define the authoritative event envelope. |
| 008 | PROVE | done | none | none | none | none | none | none | none | none | none | M1 | Define the complete lifecycle state machine. |
| 009 | PROVE | done | none | none | none | none | none | none | none | none | none | M1 | Create deterministic ATDD fixtures. |
| 010 | PROVE | done | none | none | none | none | none | none | none | none | none | M1 | Audit current `main` against the rule matrix. |
| 011 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Decide the session-code contract. |
| 012 | PRESERVE | partial | none | none | none | none | none | none | none | none | none | M1 | Define command idempotency. |
| 013 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Define authoritative server time. |
| 014 | PRESERVE | partial | none | none | none | none | none | none | none | none | none | M1 | Define stale-snapshot semantics. |
| 015 | EXTEND | partial | none | none | none | none | none | none | none | none | none | M1 | Define the command error taxonomy. |
| 016 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Define member and device identity. |
| 017 | EXTEND | partial | none | none | none | none | none | none | none | none | none | M1 | Stabilize entity identifiers. |
| 018 | EXTEND | done | none | none | none | none | none | none | none | none | none | M1 | Define phase-eligible action metadata. |
| 019 | EXTEND | partial | none | none | none | none | none | none | none | none | none | M1 | Define privacy-safe audit records. |
| 020 | PROVE | done | none | none | none | none | none | M1-SETUP | none | none | E-M1-SETUP | M1 | Build the lobby-to-Team-Phase contract fixture. |
| 020a | NEW | missing | 020;074-081;177;287-304 | none | none | none | none | none | none | none | E-020A | M1 | Bound the single-player demo to Turn 1 without jump authority. |
| 021 | EXTEND | done | none | none | none | none | none | M1-SETUP | none | none | E-M1-SETUP | M1 | Validate session creation input. |
| 022 | EXTEND | done | none | none | none | none | none | none | none | none | none | M1 | Implement authoritative session creation. |
| 023 | EXTEND | done | none | none | none | none | none | none | none | none | none | M1 | Make session creation retry-safe. |
| 024 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Authenticate join requests. |
| 025 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Resolve a requested join code without listing sessions. |
| 026 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Enforce membership uniqueness. |
| 027 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Throttle invalid joins safely. |
| 028 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Authorize minimal session-header reads. |
| 029 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Enforce one seat per player. |
| 030 | REPAIR | done | none | none | none | none | none | M1-SETUP | none | none | E-M1-SETUP | M1 | Implement authoritative seat claiming. |
| 031 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Resolve seat-claim races. |
| 031a | EXTEND | missing | 030;031;032;034 | none | CURRENT-SETUP-READINESS | none | none | UNIFIED-ENTRY | none | none | E-031A;E-031A-SETUP | M1 | Unify fleet and console entry without weakening first-entry claims. |
| 032 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Implement authoritative seat release. |
| 033 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Deny forged or stale seat release. |
| 034 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Implement session resume. |
| 035 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Reconcile intended-seat reclaim. |
| 036 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Restrict client presence writes. |
| 037 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Renew presence leases. |
| 038 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Expire stale devices. |
| 039 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Reconcile seat ownership on expiry. |
| 040 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Retain empty sessions safely. |
| 041 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Make local disconnect idempotent. |
| 042 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Replay queued disconnect safely. |
| 043 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Guard routes during resume and disconnect. |
| 044 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Separate facilitator eligibility from device mode. |
| 045 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Claim a GM instance authoritatively. |
| 046 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Deny invalid GM elevation. |
| 047 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Enter member Console mode. |
| 048 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Enter GM Observer mode read-only. |
| 049 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Reset Observer elevation on ship change. |
| 050 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Add return paths to session modes. |
| 051 | REPAIR | done | none | none | none | none | none | M1-SETUP | none | none | E-M1-SETUP | M1 | Prove the roster through creation and start. |
| 052 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Exclude Dione below 12 players. |
| 053 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Configure Joint Engineering Union substitutions. |
| 054 | REPAIR | done | none | none | none | none | none | M1-SETUP | none | none | E-M1-SETUP | M1 | Derive Wolf-agent count authoritatively. |
| 055 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M1 | Gate Intelligence Agent setup. |
| 056 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M1 | Gate Universal Arbour and Wolf Cult setup. |
| 057 | EXTEND | partial | none | none | none | none | none | none | none | none | none | M1 | Select base or expansion vessel mode. |
| 058 | EXTEND | partial | none | none | none | none | none | none | none | none | none | M1 | Load expansion roster data. |
| 059 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Capture nonbinding ship preferences. |
| 060 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Assign casting authoritatively. |
| 061 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Enforce role exclusivity. |
| 062 | NEW | partial | none | none | none | none | none | none | none | none | none | M1 | Release and reassign before start. |
| 063 | NEW | missing | none | none | none | none | none | none | none | none | none | M1 | Deliver private role briefs. |
| 064 | NEW | partial | none | none | none | none | none | none | none | none | none | M1 | Deliver private loyalty cards. |
| 065 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Initialize loyalty suspicion. |
| 066 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Pair Friend loyalties. |
| 067 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Reveal Android proof deliberately. |
| 068 | PRESERVE | partial | none | none | none | none | none | none | none | none | none | M1 | Assign role-owned craft. |
| 069 | PRESERVE | partial | none | none | none | none | none | none | none | none | none | M1 | Initialize vessel populations and stores. |
| 070 | PRESERVE | partial | none | none | none | none | none | none | none | none | none | M1 | Initialize security teams. |
| 072 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Lock casting at start. |
| 073 | REPAIR | done | none | none | none | none | none | M1-SETUP | none | none | E-M1-SETUP | M1 | Represent facilitator responsibilities without a staffing dependency. |
| 074 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Authorize game start. |
| 075 | EXTEND | partial | none | none | none | none | none | M1-SETUP | none | none | E-M1-SETUP | M1 | Start the game atomically. |
| 076 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Make start retry-safe. |
| 077 | NEW | partial | none | none | none | none | none | none | none | none | none | M1 | Initialize pursuit at 2. |
| 078 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Configure the six-to-eight-turn limit. |
| 079 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Apply Turn 1 time extensions. |
| 080 | NEW | missing | none | none | none | none | none | none | none | none | none | M1 | Represent the first Wolf-attack timing window. |
| 081 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Publish the start announcement. |
| 082 | PRESERVE | partial | none | none | none | none | none | none | none | none | none | M1 | Publish the initial public snapshot. |
| 083 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Authorize member live snapshots. |
| 084 | EXTEND | partial | none | none | none | none | none | none | none | none | none | M1 | Project per-ship shared state. |
| 085 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M1 | Refresh role-private state. |
| 086 | EXTEND | partial | none | none | none | none | none | none | none | none | none | M1 | Refresh facilitator-private state. |
| 087 | EXTEND | done | none | none | none | none | none | none | none | none | none | M1 | Deny direct gameplay collection writes. |
| 088 | PRESERVE | partial | none | none | none | none | none | none | none | none | none | M1 | Order snapshots by revision. |
| 089 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M1 | Replay events without duplicate effects. |
| 090 | PROVE | missing | none | none | none | none | none | none | none | none | none | M1 | Prove hidden-state redaction. |
| 091 | PRESERVE | partial | none | none | none | none | none | none | none | none | none | M2 | Implement the turn entity. |
| 092 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Enter Team Phase authoritatively. |
| 093 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Enter Coordination Phase authoritatively. |
| 094 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Drive the Team timer from server time. |
| 095 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Drive the Coordination timer from server time. |
| 096 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Apply Turn 1 timer overrides once. |
| 097 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Audit the emergency timer pause slice. |
| 098 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Make phase expiry idempotent. |
| 099 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Gate Team actions. |
| 100 | PRESERVE | partial | none | none | none | none | none | none | none | none | none | M2 | Gate Coordination actions. |
| 101 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Announce Team completion. |
| 102 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Announce Coordination completion. |
| 103 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Initialize the next turn. |
| 103a | NEW | missing | 091-096;098;101-103;106b;108-109;154-158 | none | none | none | none | none | none | none | E-103A | M2 | Hold the airspace deadline behind turn-advance interstitials. |
| 104 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Complete the configured final turn. |
| 105 | NEW | partial | none | none | none | none | none | none | none | none | none | M2 | Trigger pursuit-10 failure. |
| 106 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Replay lifecycle announcements. |
| 106a | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Enforce FleetBroadcast precedence. |
| 106b | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Verify exact turn-transmission timing. |
| 106c | EXTEND | missing | none | none | none | none | none | TICKER-LIFECYCLE | none | none | E-TICKER | M2 | Make fleet-ticker lifecycle server-authoritative. |
| 107 | DECISION | missing | none | none | none | none | none | none | none | none | none | M2 | Decide split-fleet clock semantics. |
| 108 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Reconnect during a live timer. |
| 109 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Reconcile delayed lifecycle updates. |
| 110 | PROVE | missing | none | none | none | none | none | none | none | none | none | M2 | Run the lobby-to-two-turn scenario. |
| 111 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Define authoritative resource ledgers. |
| 112 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Resolve same-table trades. |
| 113 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Resolve shuttle-mediated transfers. |
| 114 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Register vessel-specific maintenance order. |
| 115 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Resolve damaged Storage. |
| 116 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Select food and water rations independently. |
| 117 | DECISION | missing | none | none | none | none | none | none | none | none | none | M2 | Resolve the ration-table wording conflict. |
| 118 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Swap population-dependent ration tables. |
| 119 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Resolve the two-dice unrest check. |
| 120 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Resolve a riot. |
| 121 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M2 | Resolve small-ship maintenance loss. |
| 122 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Enforce Reactor capacity. |
| 122a | REPAIR | missing | 122-125;128;138 | none | none | none | none | REACTOR-REPAIR | none | none | E-122A;E-REACTOR | M2 | Confirm Reactor power-up before authoritative mutation. |
| 123 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M2 | Apply vessel-specific damaged-Reactor penalties. |
| 124 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M2 | Apply Reactor upgrades. |
| 125 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Enforce console charge eligibility. |
| 126 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Resolve both AEGIS shuttle bays. |
| 127 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Resolve ordinary single-bay fuelling. |
| 128 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Expire unused charges and shuttle fuel. |
| 129 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Surface damaged-bay denial. |
| 130 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Draw damage cards authoritatively. |
| 131 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Destroy a ship on empty-deck draw. |
| 132 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Recycle AEGIS Armoured Hull. |
| 133 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Step discrete population tracks. |
| 134 | REPAIR | missing | none | none | none | none | none | none | none | none | none | M2 | Alert starred population thresholds without a multi-GM deadlock. |
| 135 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M2 | Add two unrest at population zero. |
| 136 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Enter mutiny at unrest 8. |
| 137 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Resolve replacement-captain mutiny recovery. |
| 138 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Make maintenance atomic and retry-safe. |
| 138a | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Bound maintenance rollback. |
| 139 | EXTEND | done | none | none | none | none | none | none | none | none | none | M2 | Publish maintenance results by audience. |
| 140 | PROVE | missing | none | none | none | none | none | none | none | none | none | M2 | Run the all-vessel maintenance matrix. |
| 140a | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Evacuate survivors by cargo shuttle. |
| 140b | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Enforce destination population capacity. |
| 140c | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Make evacuation retry-safe. |
| 140d | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Create escape pods on ship destruction. |
| 140e | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Move players into escape state. |
| 140f | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Preserve retained shuttles. |
| 140g | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Scavenge destroyed-ship stores. |
| 141 | NEW | done | none | none | none | none | none | none | none | none | none | M2 | Define normal airspace. |
| 142 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Enforce Team Phase docking. |
| 143 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Bind shuttle holder and dock. |
| 144 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Resolve a legal shuttle move. |
| 145 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M2 | Lock airspace for a Wolf attack. |
| 146 | DECISION | missing | none | none | none | none | none | none | none | none | none | M2 | Decide nearest-ship parking ties. |
| 147 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M2 | Restrict battle-table craft. |
| 148 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Preserve post-attack parking. |
| 149 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Restrict quarantined docking. |
| 150 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Prevent quarantine reset exploits. |
| 151 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Block split-fleet communications. |
| 152 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Redact split-fleet shuttle state. |
| 153 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Constrain cross-group docking. |
| 154 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Model airspace transitions. |
| 155 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Announce airspace status truthfully. |
| 156 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Reopen movement authoritatively. |
| 157 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Preserve an overrun attack into Team Phase. |
| 158 | NEW | missing | none | none | none | none | none | none | none | none | none | M2 | Reconnect during restricted airspace. |
| 159 | PROVE | missing | none | none | none | none | none | none | none | none | none | M2 | Run the start-to-airspace scenario. |
| 160 | PROVE | missing | none | none | none | none | 001-159:status,red-test,decision,proof | none | none | none | E-160-AUDIT | M2 | Publish the foundation regression matrix. |
| 161 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Register every vessel variant. |
| 162 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Encode printed vessel statistics. |
| 163 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Register the optional sixth resource. |
| 164 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Encode cargo permissions. |
| 165 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete console metadata. |
| 166 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Bind roles to vessel actions. |
| 167 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Standardize vessel action envelopes. |
| 168 | DECISION | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Record vessel rule calls. |
| 169 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Build shared vessel fixtures. |
| 170 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Project observer-safe vessel data. |
| 171 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete AEGIS identity and maintenance lane. |
| 172 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve AEGIS Armoured Hull I and II. |
| 173 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve AEGIS Storage. |
| 174 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve the AEGIS Reactor. |
| 175 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Shuttle Bay Zeta. |
| 176 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Shuttle Bay Omega. |
| 177 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M3;M5 | Audit the AEGIS Jump Drive. |
| 178 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve the Construction Bay. |
| 179 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Create the Admiral policy workspace. |
| 180 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Create the Executive Officer workspace. |
| 181 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Create the Wing Commander workspace. |
| 182 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete AEGIS combat-console registration. |
| 183 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Gate Dione by roster. |
| 184 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Dione rations and thresholds. |
| 185 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Dione Storage. |
| 186 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve the Dione Reactor. |
| 187 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve the Dione Shuttle Bay. |
| 188 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Dione Hydroponics. |
| 189 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Dione Water Reclamation. |
| 190 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Draw and own Dione VIP cards. |
| 191 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Spend a VIP unrest reroll. |
| 192 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Gate Dione's Fighter Bay and Maliades. |
| 193 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the Dione Captain workspace. |
| 193a | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the Dione Engineer workspace. |
| 193b | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the President workspace. |
| 194 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete Icebreaker identity and maintenance lane. |
| 195 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Icebreaker Storage. |
| 196 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve the Icebreaker Reactor. |
| 197 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve the Icebreaker Shuttle Bay. |
| 198 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Icebreaker Hydroponics. |
| 199 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Icebreaker Water Reclamation. |
| 200 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Mining Drone Control. |
| 201 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Audit the Icebreaker Jump Drive. |
| 202 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve the Ram Scoop. |
| 203 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the Icebreaker Captain workspace. |
| 203a | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the Icebreaker Engineer workspace. |
| 203b | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the Miner workspace. |
| 204 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete Shepherd identity and maintenance lane. |
| 205 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Shepherd Storage. |
| 206 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve the Shepherd Reactor. |
| 207 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve the Shepherd Shuttle Bay. |
| 208 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Shepherd Water Reclamation. |
| 209 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve both Shepherd Advanced Hydroponics consoles. |
| 210 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Audit the Shepherd Jump Drive. |
| 211 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Encode Endeavour console-upgrade research tracks. |
| 212 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Enforce Endeavour research cadence. |
| 213 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Build and use the ECM Device. |
| 214 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Build and use the Wolf Agent Detector. |
| 215 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the Shepherd Captain workspace. |
| 215a | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the Shepherd Engineer workspace. |
| 215b | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the Scientist workspace. |
| 216 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete Quellon identity and maintenance lane. |
| 217 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Quellon Storage. |
| 218 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve the Quellon Reactor. |
| 219 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve the Quellon Shuttle Bay. |
| 220 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Quellon Hydroponics. |
| 221 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve both Water Production consoles. |
| 222 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Audit the Quellon Jump Drive. |
| 223 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the Quellon Captain workspace. |
| 223a | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the Quellon Engineer workspace. |
| 223b | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the Explorer workspace. |
| 224 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete Refinery 124 identity and maintenance lane. |
| 225 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Refinery 124 Storage. |
| 226 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve the Refinery 124 Reactor. |
| 227 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve the Refinery 124 Shuttle Bay. |
| 228 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Refinery 124 Hydroponics. |
| 229 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve Refinery 124 Water Reclamation. |
| 230 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Resolve both Fuel Refinery consoles. |
| 231 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Gate the Refinery Fighter Bay. |
| 232 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Audit the Refinery 124 Jump Drive. |
| 233 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the Refinery 124 Captain workspace. |
| 233a | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the Refinery Engineer workspace. |
| 233b | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Complete the PDF Colonel workspace. |
| 234 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Implement shared small-ship rules. |
| 234a | DECISION | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Apply the extra-role balance dial. |
| 235 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Complete Gorgoneion identity and maintenance. |
| 236 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve the Gorgoneion Jump Drive. |
| 237 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve Gorgoneion Mission Support. |
| 238 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve Gorgoneion Repair Drones. |
| 239 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register the Gorgoneion Missile Array. |
| 240 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register the Gorgoneion Force Field Projector. |
| 241 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Complete base Capybara identity and maintenance. |
| 241a | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve the base Capybara Jump Drive. |
| 241b | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve base Capybara Bulk Haulage. |
| 241c | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve base Capybara Cargo Transfer. |
| 241d | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve base Capybara food and water production. |
| 241e | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve the base Capybara Fuel Processor. |
| 242 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Complete Warrior identity and maintenance. |
| 243 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve Warrior Reclamator. |
| 244 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve Warrior Repair Drones. |
| 245 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register Warrior Salvage Drones. |
| 246 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Complete Vulcan identity and maintenance. |
| 247 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register the Vulcan Laser Cannon. |
| 248 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve both Vulcan Additional Labour consoles. |
| 249 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Admit Voyage 33-0 through the crisis path. |
| 250 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve Voyage 33-0 maintenance. |
| 251 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve Voyage 33-0 movement. |
| 252 | REPAIR | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Gate the expansion Capybara. |
| 253 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Complete expansion Capybara identity. |
| 254 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve expansion Capybara Storage and Reactor. |
| 255 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve Capybara Advanced Hydroponics. |
| 256 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve Capybara Water Production. |
| 257 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve the Scrap Refinery. |
| 258 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Resolve Capybara Shuttle Bay choice. |
| 259 | PROVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Audit the expansion Capybara Jump Drive. |
| 260 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register Starlight completely. |
| 261 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register Pallas completely. |
| 262 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register Fighter Wings Alpha and Bravo. |
| 263 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register Philia completely. |
| 264 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register Maliades completely. |
| 265 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register Highwall completely. |
| 266 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register Blacksmith completely. |
| 267 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register Endeavour completely. |
| 268 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register Black Sheep completely. |
| 269 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register Hummingbird completely. |
| 270 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register Condor completely. |
| 271 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register Chacau completely. |
| 272 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register Chepu completely. |
| 273 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register the PDF Escort Fighter Wing. |
| 274 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register J.E.U. Wobbly completely. |
| 275 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Register J.E.U. Ally completely. |
| 275a | EXTEND | done | 004;051 | none | BASE-ROSTER-SETUP;PRESS-CATALOG-AUTHORITY | none | none | none | none | 598;605 | E-275A;E-275A-RELATED | M3;M5;M6 | Restore the optional SNN Independent Press Shuttle. |
| 275b | REPAIR | missing | none | none | none | none | none | PRESS-DESK | POST-CURRENT-DEPENDENCY-SLICE;SEPARATE-RELEASE-0.3.12 | none | E-275B | M3;M5;M6 | Recover and restore the SNN Dispatch Desk regression. |
| 276 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Assign the Quellon/Refinery Union pair. |
| 277 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Assign the Shepherd/Icebreaker Union pair. |
| 278 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Build extra-ship Captain workspaces. |
| 279 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Build expansion Capybara role workspaces. |
| 280 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Build replacement-role workspace shells. |
| 281 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Encode the canonical star-chart graph. |
| 282 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Select and lock chart A, B, or C. |
| 283 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Resolve system codes by chart. |
| 284 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Redact unknown systems. |
| 285 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Model per-ship position. |
| 286 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Model fleet-group identity. |
| 287 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Calculate jump distance. |
| 288 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Resolve per-ship jump costs. |
| 289 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Validate Jump Drive readiness. |
| 290 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Enforce one jump per ship per turn. |
| 291 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Reserve jump fuel atomically. |
| 292 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Validate coordinate shape. |
| 293 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Validate printed reachability. |
| 294 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Complete an independent ship jump. |
| 295 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Resolve unprinted coordinates. |
| 296 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Resolve uncharged and fuel-starved attempts. |
| 297 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Resolve damaged-drive randomness. |
| 298 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Apply upgraded-drive behavior. |
| 299 | DECISION | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Apply failed-jump damage. |
| 300 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Execute one emergency jump per ship. |
| 301 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Resolve concurrent fleet jumps. |
| 302 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Record every jump transition. |
| 303 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Audit jump-button truthfulness. |
| 304 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Reconcile jump retries. |
| 305 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Advance pursuit each turn. |
| 306 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Reduce pursuit by chart depth. |
| 307 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Isolate pursuit by fleet group. |
| 308 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Apply Ion Nebula pursuit behavior. |
| 309 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Apply the Level 5 Planet exception. |
| 310 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Make Unstable Star missions repeatable. |
| 311 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Make Abandoned Wolf Supply Outpost missions repeatable. |
| 312 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Trigger L/M arrival pressure. |
| 313 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Persist system history. |
| 314 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Remove destroyed ships from navigation. |
| 315 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Create first-arrival mission eligibility. |
| 316 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Make arrival effects idempotent. |
| 317 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Resolve environmental maintenance hazards. |
| 318 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Track candidate discovery. |
| 319 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Surface the Turn 6 planning checkpoint. |
| 320 | PROVE | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Run the jump-and-system scenario. |
| 321 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Define scout entitlements. |
| 322 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Resolve Starlight's first scan. |
| 323 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Resolve Starlight's fuelled second scan. |
| 324 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Resolve Hummingbird scouting. |
| 325 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Resolve Endeavour scouting. |
| 326 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Resolve Comms Officer scouting. |
| 327 | PROVE | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Measure scout range from current authority. |
| 328 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Deliver scout results privately. |
| 329 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Reveal a chart result as facilitator. |
| 330 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Persist player discovery notes safely. |
| 331 | PROVE | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Audit scouting events. |
| 332 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Accumulate Deep Nebula scans privately. |
| 333 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Hide the Deep Nebula total. |
| 334 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Apply two-system exploration rewards. |
| 335 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Constrain Athena's Wolf-system reveal. |
| 336 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Create a split after partial arrival. |
| 337 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Project a group-local roster. |
| 338 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Deny cross-group position reads. |
| 339 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Deny cross-group communications. |
| 340 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Permit local Coordination communication. |
| 341 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Keep Team actions group-local. |
| 342 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Scope jump announcements by audience. |
| 343 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Ferry up to two players by scout taxi. |
| 344 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Ferry up to two fuel by scout taxi. |
| 345 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Deny out-of-range taxi trips. |
| 346 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Validate group rejoin eligibility. |
| 347 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Merge rejoined membership. |
| 348 | DECISION | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Resolve rejoined pursuit. |
| 349 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Restore communication after commit. |
| 350 | NEW | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Make split/rejoin retries safe. |
| 351 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-433A;E-ATTACK-DRADIS | M7 | Show only arrived local ships on DRADIS. |
| 352 | EXTEND | partial | none | none | none | none | none | none | none | none | none | M7 | Represent jumping ships in transition. |
| 353 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Publish sampled transit contacts. |
| 354 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Remove stale contacts. |
| 355 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Fold docked shuttles into host contacts. |
| 356 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Show undocked shuttle samples. |
| 357 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Redact split-fleet contact metadata. |
| 358 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Reflect attack parking on DRADIS. |
| 359 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Merge contacts after rejoin. |
| 360 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Deny direct DRADIS writes. |
| 361 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M7 | Build the authoritative shuttle manifest. |
| 362 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Transfer shuttle control. |
| 363 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve holder-based docking. |
| 364 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Validate Team-start docking. |
| 365 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Request shuttle departure. |
| 366 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Enter authoritative shuttle transit. |
| 367 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Complete shuttle arrival. |
| 368 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Retarget in flight. |
| 369 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Fuel only eligible docked craft. |
| 370 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Expire unused shuttle fuel. |
| 371 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Park craft when airspace closes. |
| 372 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Apply the SNN/AEGIS movement exception. |
| 373 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Park every craft for a Wolf attack. |
| 374 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Preserve shuttle damage immunity. |
| 375 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Enforce ordinary bay capacity. |
| 376 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Enforce AEGIS dual-bay capacity. |
| 377 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Transfer permitted shuttle cargo. |
| 378 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Preserve security-team semantics. |
| 379 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Deny invalid cargo moves. |
| 380 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Reconcile movement conflicts. |
| 381 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve Philia repairs. |
| 382 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve Blacksmith repairs. |
| 383 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve Chacau repairs. |
| 384 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve Ally repairs. |
| 385 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve permissioned dismantling. |
| 386 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve service-shuttle recharge. |
| 387 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Trigger immediate effects from recharge. |
| 388 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve Highwall mining. |
| 389 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve Highwall combat. |
| 390 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve Hummingbird harvesting. |
| 391 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve Endeavour field upgrades. |
| 392 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Apply Starlight mission bonuses. |
| 393 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Apply Hummingbird mission bonuses. |
| 394 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve Pallas boarding support. |
| 395 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve Chepu boarding support. |
| 396 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve Alpha and Bravo fighter state. |
| 397 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve Maliades state. |
| 398 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve the PDF Escort Wing state. |
| 399 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve Macaw movement and cargo. |
| 400 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve Boa movement and cargo. |
| 401 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Validate mission eligibility and leader. |
| 402 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Build the mission deck. |
| 403 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Deal private initial cards. |
| 404 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Let the leader distribute extra cards blindly. |
| 405 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Accept private card requests. |
| 406 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve each private discard. |
| 407 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Assign cards to opportunities. |
| 408 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Add facilitator cards. |
| 409 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Calculate opportunity totals. |
| 410 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Apply only contribution-linked bonuses. |
| 411 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Fail empty opportunities. |
| 412 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Resolve critical success separately. |
| 413 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Place rewards in Mission Leader custody. |
| 414 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Preserve mission overruns. |
| 415 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Drop off oversized rewards. |
| 416 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Lichen-Covered Asteroids A. |
| 416a | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Ice Asteroids B. |
| 416b | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Rare Element Moon C. |
| 417 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Abandoned Explorer Outpost D. |
| 417a | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Athena Survivors E. |
| 417b | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Abandoned Refuelling Station F. |
| 418 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Level 5 Survivable Planet G. |
| 418a | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Derelict Research Vessel H. |
| 418b | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Ion Nebula I. |
| 419 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Unstable Star J. |
| 420 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Wolf Supply Outpost K. |
| 421 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Active Wolf Outpost L. |
| 421a | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Active Wolf Fortress M. |
| 422 | PROVE | missing | none | none | none | none | none | none | none | none | none | M7 | Run the complete away-mission scenario. |
| 423 | PROVE | missing | none | none | none | none | none | none | none | none | none | M7;M6 | Run the shuttle-airspace scenario. |
| 424 | PROVE | missing | none | none | none | none | none | none | none | none | none | M7;M8 | Run the split-fleet exploration scenario. |
| 425 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Define the Wolf ship catalog. |
| 426 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Define attack-composition rules. |
| 427 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Prepare an attack privately from the GM console. |
| 428 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Centralize combat math and randomness. |
| 429 | NEW | missing | none | none | none | none | none | none | none | none | none | M9 | Encode base targeting. |
| 430 | NEW | missing | none | none | none | none | none | none | none | none | none | M9 | Encode expansion targeting. |
| 431 | NEW | missing | none | none | none | none | none | none | none | none | none | M9 | Resolve target-number wraparound. |
| 432 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Declare the attack atomically. |
| 432a | EXTEND | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Operate the attack from the GM console. |
| 433 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Project attack state by audience. |
| 433a | NEW | missing | none | none | none | none | none | WOLF-ATTACK;ATTACK-DRADIS | none | none | E-WOLF;E-ATTACK-DRADIS | M9 | Publish a stable DRADIS-ready attack contract. |
| 433b | EXTEND | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve choices in affected player consoles. |
| 434 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Make attack commands retry-safe. |
| 434a | EXTEND | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Intervene and recover safely during an attack. |
| 435 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve Wolf Commander target rerolls. |
| 436 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | 435 | E-436;E-WOLF | M9 | Resolve AEGIS Command and Control. |
| 437 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Lock Gorgoneion Force Field timing. |
| 438 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve Long Range simultaneously. |
| 439 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve Medium Range simultaneously. |
| 440 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve Short Range simultaneously. |
| 441 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Enforce the five-step attack order. |
| 442 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Apply range-specific destruction effects. |
| 443 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Enforce Short Range fighter priority. |
| 444 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Close each range with an audit result. |
| 445 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve AEGIS Missile Launchers at Long Range. |
| 446 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Spend ore on enriched warheads. |
| 447 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve AEGIS Missile Launchers at Medium Range. |
| 448 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve AEGIS Point Defence. |
| 449 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Authorize Fighter Bay launches. |
| 450 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Shift targets with fleet fighters. |
| 451 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Attack at Medium Range with fleet fighters. |
| 452 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Attack at Short Range with fleet fighters. |
| 453 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve Maliades at range. |
| 454 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve Highwall at range. |
| 455 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve the Gorgoneion Missile Array. |
| 456 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Launch the PDF Fighter Wing. |
| 457 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve PDF fighters at Medium Range. |
| 458 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve PDF fighters at Short Range. |
| 459 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve Boa's range actions. |
| 460 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Apply Macaw boarding support. |
| 461 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Relocate Pallas or Chepu before boarding. |
| 462 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Apply engineering/service shuttle support. |
| 463 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Apply AEGIS and Pallas boarding rerolls. |
| 464 | DECISION | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Apply Wolf Commander boarding leadership. |
| 465 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Drop Assault Transport parties. |
| 466 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Roll security-team defence. |
| 467 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Apply surviving-boarder damage. |
| 468 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve Militia Leader defence. |
| 469 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve Wolf Fighter Wing destruction. |
| 469a | NEW | missing | none | none | none | none | none | none | none | none | none | M9 | Resolve Assault Transport destruction. |
| 469b | NEW | missing | none | none | none | none | none | none | none | none | none | M9 | Resolve Wolf Destroyer destruction. |
| 469c | NEW | missing | none | none | none | none | none | none | none | none | none | M9 | Resolve Wolf Cruiser destruction. |
| 469d | NEW | missing | none | none | none | none | none | none | none | none | none | M9 | Resolve Strikecarrier destruction. |
| 469e | NEW | missing | none | none | none | none | none | none | none | none | none | M9 | Resolve Battlestation destruction. |
| 470 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Carry surviving Wolf Fighter Wings forward. |
| 471 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Enforce Battlestation Short Range immunity. |
| 472 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Apply Strikecarrier wing bonus. |
| 473 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Apply surviving Wolf ship damage. |
| 474 | EXTEND | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Publish the immediate attack result. |
| 475 | EXTEND | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Reuse the common damage draw path. |
| 476 | EXTEND | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Destroy a ship on combat deck exhaustion. |
| 477 | EXTEND | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Apply combat casualties. |
| 478 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Apply Doctor casualty mitigation. |
| 479 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve Warrior post-attack salvage. |
| 480 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve Capybara post-attack Scrap. |
| 481 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Collect Scrap with Macaw or Boa. |
| 482 | EXTEND | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve post-attack repairs. |
| 483 | NEW | missing | none | none | none | none | none | none | none | none | none | M9 | Rebuild fighters after combat. |
| 484 | EXTEND | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Publish the complete aftermath. |
| 485 | REPAIR | missing | none | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE | M10 | Make pursuit authoritative from Turn 1. |
| 485a | REPAIR | missing | none | none | none | none | none | PRESENTATION-INDEPENDENT | none | none | E-PRESENTATION | M10 | Restore alert-scoped Pursuit Track color. |
| 486 | PROVE | missing | none | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE | M10 | Verify the per-turn pursuit rise. |
| 487 | PROVE | missing | none | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE | M10 | Verify jump-based pursuit reduction. |
| 488 | PROVE | missing | none | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE | M10 | Verify Ion Nebula threat suppression. |
| 489 | PROVE | missing | none | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE | M10 | Verify the Level 5 Planet exception. |
| 490 | NEW | missing | none | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE | M10 | Preserve independent split-group threat. |
| 491 | NEW | missing | none | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE | M10 | Trigger Active Wolf Outpost attacks. |
| 492 | NEW | missing | none | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE | M10 | Trigger Active Wolf Fortress attacks. |
| 493 | NEW | missing | none | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE | M10 | Trigger Ancient Space Station attacks. |
| 494 | NEW | missing | none | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE | M10 | Resolve the Wolf Commander attack dial. |
| 495 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Assign hidden loyalties authoritatively. |
| 496 | REPAIR | missing | none | none | none | none | none | none | none | none | none | M10 | Enforce the server-derived Wolf count. |
| 497 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Authorize one Wolf action per turn. |
| 498 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Resolve console sabotage. |
| 499 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Resolve supply sabotage. |
| 500 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Resolve a homing beacon. |
| 501 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Send Wolf intelligence privately. |
| 502 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Resolve suspicion and clue rolls. |
| 503 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Deliver Wolf action receipts by audience. |
| 503a | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Trigger the hacking overlay from authority. |
| 504 | PROVE | missing | none | none | none | none | none | none | none | none | none | M10 | Audit suspicion history privately. |
| 505 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Investigate as the Intelligence Agent. |
| 506 | PROVE | missing | none | none | none | none | none | none | none | none | none | M10 | Prove investigation randomness ownership. |
| 507 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Apply Intelligence Agent suspicion. |
| 508 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Test with the Wolf Agent Detector. |
| 509 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Publish Android proof. |
| 510 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Reveal Friend trust privately. |
| 511 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Deliver Universal Arbour visions. |
| 512 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Deliver Wolf Cult intelligence. |
| 513 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Calculate arrest posse size privately. |
| 514 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Resolve arrest and its deadline. |
| 515 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Assign a replacement role. |
| 516 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Activate the Comms Officer. |
| 517 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Activate the VIP Host. |
| 518 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Activate the Commissar. |
| 519 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Activate the Militia Leader. |
| 520 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Activate the PDF Fighter Ace. |
| 521 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Complete Wolf Commander powers. |
| 521a | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Resolve the Wolf Commander address. |
| 521b | DECISION | missing | none | none | none | none | none | none | none | none | none | M10 | Resolve Wolf Commander amnesty. |
| 522 | REPAIR | missing | none | none | none | none | none | none | none | none | none | M10 | Model one-facilitator ownership with optional GM lanes. |
| 523 | DECISION | missing | none | none | none | none | none | none | none | none | none | M10 | Record facilitator rule calls. |
| 523a | DECISION | missing | none | none | none | none | none | none | none | none | none | M10 | Configure Wolf Attack difficulty. |
| 523b | DECISION | missing | none | none | none | none | none | none | none | none | none | M10 | Configure Crisis difficulty. |
| 523c | DECISION | missing | none | none | none | none | none | none | none | none | none | M10 | Configure emergency-jump severity. |
| 524 | PROVE | missing | none | none | none | none | none | none | none | none | none | M10 | Run the complete Wolf-and-deduction scenario. |
| 524a | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Track political capital. |
| 524b | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Resolve the President's address. |
| 524c | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Resolve a presidential visit. |
| 524d | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Enforce presidential authority boundaries. |
| 525 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Create the crisis state machine. |
| 526 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Gate crises by configuration. |
| 527 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Deliver Approaching Vessel. |
| 528 | DECISION | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Resolve Approaching Vessel choices. |
| 529 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Integrate Voyage 33-0 arrival. |
| 530 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Deliver Disease Outbreak. |
| 531 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Resolve quarantine policy. |
| 532 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Deliver Religious Zealotry. |
| 533 | DECISION | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Resolve zealotry responses. |
| 534 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Deliver Civil Unrest. |
| 535 | DECISION | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Resolve Civil Unrest. |
| 536 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Deliver Presidential Election. |
| 537 | DECISION | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Configure election procedure. |
| 538 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Resolve the election privately. |
| 539 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Announce binding resolutions at Team start. |
| 540 | PROVE | missing | none | none | none | none | none | none | none | none | none | M3;M11;M12 | Run the full crisis scenario. |
| 541 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Reveal a New Eden candidate. |
| 542 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Make candidate discovery retry-safe. |
| 543 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Track candidate plans by Turn 6. |
| 544 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Validate Ancient Jump Ring prerequisites. |
| 545 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Repair the Ancient Jump Ring. |
| 546 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Prevent duplicate Ring contributions. |
| 547 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Fuel each Ring passage. |
| 548 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Resolve Ring passage. |
| 549 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Record blocked Wolf pursuit through the Ring. |
| 550 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Accumulate Deep Nebula scouting. |
| 551 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Attempt a Deep Nebula jump. |
| 552 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Lose a ship in the Deep Nebula. |
| 553 | DECISION | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Reach the Deep Nebula threshold. |
| 554 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Prevent repeat Nebula attempts. |
| 555 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Trigger Ancient Space Station arrival combat. |
| 556 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Repeat Station combat while Wolves survive. |
| 557 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Liberate the Ancient Space Station. |
| 558 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Validate Station Reactor contributions. |
| 559 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Power New Eden Station. |
| 560 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Freeze play at pursuit failure. |
| 561 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Distinguish total fleet loss. |
| 562 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Aggregate real survivor outcomes. |
| 563 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Explain candidate results. |
| 564 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Enter debrief once. |
| 565 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Close the session authoritatively. |
| 566 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11;M13 | Read debrief after closure. |
| 567 | PROVE | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Reverify Capybara mode selection. |
| 568 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Isolate Scrap reads and writes. |
| 569 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Cast Capybara Captain and Recycler. |
| 570 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Apply d8 Capybara targeting. |
| 571 | PROVE | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Run full Capybara maintenance. |
| 572 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Resolve Capybara population thresholds. |
| 573 | DECISION | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Resolve Capybara damage cards. |
| 574 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Resolve Macaw refuelling. |
| 575 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Resolve Macaw repairs. |
| 576 | DECISION | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Resolve Macaw salvage dismantling. |
| 577 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Resolve Macaw cargo. |
| 578 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Resolve Boa recycling. |
| 579 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Resolve Boa reclamation. |
| 580 | DECISION | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Resolve Boa combat ambiguity. |
| 581 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Create post-damage Scrap pickups. |
| 582 | NEW | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Expose Capybara objectives privately. |
| 583 | DECISION | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Apply the Capybara balance dial. |
| 584 | PROVE | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Run the Capybara vertical scenario. |
| 585 | PROVE | missing | none | none | none | none | none | none | none | none | none | M3;M11 | Run the base/expansion isolation scenario. |
| 586 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Build the roster configuration flow. |
| 587 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Present private casting assignments. |
| 588 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Present private loyalty assignment. |
| 589 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Teach the table ground rules. |
| 589a | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Audit the motion-safety gate. |
| 589b | REPAIR | missing | none | none | none | none | none | PRESENTATION-INDEPENDENT | none | none | E-PRESENTATION | X | Simplify the authenticated-session waiver's human-first copy. |
| 590 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Teach the core game loop. |
| 591 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Show vessel-specific maintenance help. |
| 592 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Show craft-specific help. |
| 593 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Show candidate preparation help. |
| 594 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Label facilitator decisions. |
| 595 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Display the derived application version. |
| 596 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Display bounded changelog history. |
| 597 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Complete exact disconnect confirmation. |
| 598 | REPAIR | partial | none | none | none | none | none | none | none | none | none | X | Explain connectivity truthfully. |
| 599 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Build the single-facilitator setup checklist. |
| 600 | PROVE | missing | none | none | none | none | none | none | none | none | none | X | Run the onboarding-to-first-action scenario. |
| 601 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Make primary status universal. |
| 602 | PROVE | partial | none | none | none | none | 602a:green | RETURN-REPAIR | none | none | E-602-CLOSURE;E-RETURN-REPAIR-SEQUENCE | X | Prove return navigation everywhere. |
| 602a | REPAIR | missing | none | none | AUTHORITATIVE-SHUTTLE-ASSOCIATION;CONSOLE-ROUTE-ENTITLEMENT | none | none | RETURN-REPAIR | none | none | E-602A;E-RETURN-REPAIR-SEQUENCE | X | Restore shuttle-to-associated-ship return navigation. |
| 603 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Make ship consoles work on narrow phones. |
| 603a | REPAIR | done | none | none | SHARED-SESSION-CHROME;ROLE-SELECT | none | none | TICKER-LIFECYCLE | none | none | E-603A;E-TICKER | X | Keep the mobile session ticket out of routed content. |
| 604 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Make maintenance work in short landscape. |
| 605 | EXTEND | partial | none | none | none | none | none | none | none | none | none | X | Make DRADIS responsive. |
| 605a | DEFERRED-OWNER | missing | 433a | none | none | OWNER-APPROVAL-DEFERRED-VISUALIZATION | none | ATTACK-DRADIS | none | none | E-605A;E-ATTACK-DRADIS | X | Visualize Wolf attacks on DRADIS. |
| 606 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Make shuttle travel touch-operable. |
| 607 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Make jump controls keyboard-complete. |
| 608 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Own dialog focus correctly. |
| 609 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Announce live changes once. |
| 610 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Honor reduced motion globally. |
| 611 | EXTEND | missing | none | none | none | none | none | PRESENTATION-INDEPENDENT | none | none | E-PRESENTATION | X | Distinguish status without color alone. |
| 611a | REPAIR | missing | none | none | none | none | none | PRESENTATION-INDEPENDENT | none | none | E-PRESENTATION | X | Repair CIC status typography without redesign. |
| 612 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Render a persisted snapshot before resume. |
| 613 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Clear invalid persisted sessions. |
| 614 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Reconcile presence leases under load. |
| 615 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Reclaim returning seats safely. |
| 616 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Make disconnect replay-safe. |
| 617 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Reconcile the command outbox. |
| 618 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Reconnect every live projection. |
| 619 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Make candidate retries survive reconnect. |
| 620 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Recover from stale revisions. |
| 621 | EXTEND | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | X;M9 | Recover during a Wolf attack. |
| 622 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Recover during an away mission. |
| 623 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Preserve PWA deep links. |
| 624 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Update the service worker safely. |
| 625 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Enforce App Check on mutations. |
| 626 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Deny unauthenticated and nonmember reads. |
| 627 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Deny all direct gameplay writes. |
| 628 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Enforce GM-instance authority everywhere. |
| 629 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Protect private projections comprehensively. |
| 630 | PROVE | missing | none | none | none | none | none | none | none | none | none | X | Prove server-owned randomness. |
| 631 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Rate-limit expensive callables. |
| 632 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Reject malformed and oversized payloads. |
| 633 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Return safe retry guidance. |
| 634 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Record security denials privately. |
| 635 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Standardize action audit records. |
| 636 | PROVE | missing | none | none | none | none | none | none | none | none | none | X | Measure callable and snapshot health. |
| 637 | PROVE | missing | none | none | none | none | none | none | none | none | none | X | Establish render-performance baselines. |
| 638 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Support and exercise the 20-player core target. |
| 639 | PROVE | missing | none | none | none | none | none | none | none | none | none | X | Exercise the 60-browser target. |
| 640 | PROVE | missing | none | none | none | none | none | none | none | none | none | X | Publish capacity conclusions. |
| 641 | PROVE | missing | none | none | none | none | none | none | none | none | none | M13 | Run a complete base-game playthrough. |
| 642 | PROVE | missing | none | none | none | none | none | none | none | none | none | M13 | Run a complete Capybara playthrough. |
| 643 | PROVE | missing | none | none | none | none | none | none | none | none | none | M13 | Run a complete split-fleet playthrough. |
| 644 | PROVE | missing | none | none | none | none | none | none | none | none | none | M13 | Run a complete shuttle-airspace playthrough. |
| 645 | PROVE | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M13;M9 | Run a complete Wolf attack playthrough. |
| 646 | PROVE | missing | none | none | none | none | none | none | none | none | none | M13 | Run a complete away-mission playthrough. |
| 647 | PROVE | missing | none | none | none | none | none | none | none | none | none | M13 | Prove Ancient Jump Ring success. |
| 648 | PROVE | missing | none | none | none | none | none | none | none | none | none | M13 | Prove Deep Nebula success and loss. |
| 649 | PROVE | missing | none | none | none | none | none | none | none | none | none | M13 | Prove Ancient Space Station success. |
| 650 | PROVE | missing | none | none | none | none | none | none | none | none | none | M13 | Prove authoritative terminal failure and recovery paths. |
| 651 | PROVE | missing | none | none | none | none | none | none | none | none | none | M13 | Run the final release-readiness audit. |
| 652 | EXTEND | missing | none | none | none | none | none | TICKER-LIFECYCLE | none | none | E-TICKER | none | Prevent FleetTicker messages from overlapping. |
| 652a | REPAIR | missing | 106c;652 | none | none | none | none | TICKER-LIFECYCLE | none | none | E-TICKER | none | Keep every moving ticker glyph visible through its real exit. |
| 652b | NEW | missing | 106c;603a;652;652a | none | none | none | none | TICKER-LIFECYCLE | none | none | E-TICKER | none | Run a reversible mobile sticky-ticker experiment. |
| 653 | EXTEND | missing | none | none | none | none | none | none | none | none | none | none | Remove the ICN/Iris fleet-wide console lock. |
| 654 | REPAIR | missing | none | M1 | none | OWNER-APPROVED-ZERO-ELIGIBLE-WOLF-OUTCOME | none | M1-REPAIR | none | none | E-M1-REPAIR;E-M1-REPAIR-SEQUENCE | M1 | Start production after a confirmed roster without treating unfilled roles as a blocker. |
| 655 | REPAIR | missing | none | none | none | none | none | none | none | none | none | none | Restore the Press evidence-shredder docked-cockpit warning. |
| 656 | REPAIR | missing | none | none | none | none | none | none | none | none | none | none | Route an already-connected launcher to its current session. |
| 657 | REPAIR | missing | none | none | none | none | none | none | none | none | none | none | Remove roadmap jargon from player-facing changelog history and future entries. |
| 658 | POLISH | missing | none | none | none | none | none | none | none | none | none | none | Use CIC language for seat-change confirmation when the page remains. |
| 659 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | none | Enforce in-universe player-facing copy app-wide. |
| 660 | REPAIR | done | none | none | none | none | none | none | none | none | none | none | Make exact validation self-prepare a collision-safe emulator slot. |
| 661 | POLISH | done | none | none | none | none | none | none | none | none | none | none | Add a safe copy-only validation fast path. |
| 662 | DECISION | missing | none | none | none | OWNER-APPROVED-WOLF-DESIGNATION-POLICY | none | none | none | 054;075;496;586-588 | E-662 | none | Resolve ordinary-start Wolf designation policy. |
| 663 | REPAIR | missing | none | none | none | none | none | none | none | none | none | X | Make Fleetwide Red Alert discoverable in a normal browser. |

## Explicit sequence rules

| Rule | Explicit order or meaning | Blocking? | Evidence |
| --- | --- | --- | --- |
| M1-SETUP | Historical order: Prompt 004 -> the separately evidenced 0.3.12 slice (021/030/073) -> the 0.3.13 slice (051/054/075 setup) -> Prompt 020. The current ledger records this sequence as satisfied. | No; this historical sequence is context, not a current readiness blocker. | E-M1-SETUP |
| UNIFIED-ENTRY | Prompt 031a follows the current setup/readiness slice and consumes the stable seat claim/release/race/resume contract. | No; its named hard prompt/contract fields govern. | E-031A; E-031A-SETUP |
| TICKER-LIFECYCLE | Prompt 106c precedes 652a and 652b; 652a runs alongside the still-open 652 contract; 603a is required before the 652b experiment; 652b runs only after its listed lifecycle/layout prerequisites. | No; only hard fields block. | E-TICKER; E-603A |
| WOLF-ATTACK | 425 -> 426 -> 428 -> 427 -> 432/432a -> 433/433a/433b -> 434/434a -> 435-444 -> 445-473 -> 475-482 -> 474/484 -> 621 -> 645. | No; this is delivery order, not a blanket range dependency. | E-WOLF |
| ATTACK-DRADIS | Stable 433a precedes the DRADIS consumers 351 and 353-360; deferred 605a also waits on 433a and owner approval. | No; only 605a hard prompt and owner fields block. | E-ATTACK-DRADIS; E-605A |
| ATTACK-PRESSURE | Prompts 485-494 become authoritative before attack pressure depends on them. | No; do not infer a target prompt from this statement. | E-ATTACK-PRESSURE |
| PRESS-DESK | Prompt 275b is a dedicated regression after the current dependency slice and outside release 0.3.12. These are sequence/release boundaries, not hard contracts. | No; the boundary selects a release slice but never blocks by itself. | E-275B |
| RETURN-REPAIR | Universal Prompt 602 is a closure/evidence gate: it cannot be complete until ordinary shuttle return repair 602a is green. This does not block starting Prompt 602. | No; the closure gate is separate from start readiness. | E-602-CLOSURE |
| REACTOR-REPAIR | Prompt 122a follows the capacity, damage/upgrade, eligibility, expiry, and atomicity contracts named in its definition. | No; its hard prompt field blocks. | E-REACTOR |
| PRESENTATION-INDEPENDENT | P485a and compact-DRADIS P611 consume existing fleetRedAlert independently of broader P485/P605a; P611a and P589b may ship independently after characterization/accessibility gates. | No; shared gates are not prompt edges. | E-PRESENTATION |
| M1-REPAIR | Prompt 654 is a Milestone 1 repair and needs an owner-approved zero-eligible-Wolf outcome. | No; milestone and owner fields block. | E-M1-REPAIR |

The sequence table intentionally does not convert adjacency, domain ranges, or the narrative order of unrelated prompts into hard edges. This keeps next-prompt selection fast without creating false blockers.

## Edge evidence register

| Evidence ID | Edge type | From -> target | Source anchor | Source language |
| --- | --- | --- | --- | --- |
| E-M1-SETUP | sequence | 004 -> 021/030/073 -> 051/054/075 setup -> 020 | IMPLEMENTATION_PLAN.md - Historical follow-on Milestone 1 release sequence | Historical release order culminated in Prompt 020 after the 0.3.13 setup slice; the current ledger records this sequence as satisfied, not as a current readiness blocker. |
| E-020A | hard_prompt | 020a -> 020; 074-081; 177; 287-304 | IMPLEMENTATION_PLAN.md - Prompt 020a definition | Dependencies: Prompt 020 plus setup/start/Turn 1 contracts in Prompts 074-081 and jump contracts in Prompts 177 and 287-304. |
| E-031A | hard_prompt / sequence | 031a -> 030;031;032;034 | IMPLEMENTATION_PLAN.md - Future roadmap addendum, Dependency and delivery order | Prompt 031a then consumes the stable P030/P031/P032/P034 claim, release, race, and resume authority. |
| E-031A-SETUP | hard_contract / sequence | 031a -> CURRENT-SETUP-READINESS | IMPLEMENTATION_PLAN.md - Future roadmap addendum, Dependency and delivery order | Preserve the existing P051/P054 readiness/start evidence before Prompt 031a consumes the stable seat authority. |
| E-103A | hard_prompt | 103a -> 091-096; 098; 101-103; 106b; 108-109; 154-158 | IMPLEMENTATION_PLAN.md - Prompt 103a definition | Dependencies: Prompts 091-096, 098, 101-103, 106b, 108-109, and 154-158. |
| E-122A | hard_prompt | 122a -> 122-125; 128; 138 | IMPLEMENTATION_PLAN.md - Prompt 122a definition | This repair depends on the capacity, damage/upgrade, eligibility, expiry, and atomicity contracts in Prompts 122-125, 128, and 138. |
| E-160-AUDIT | evidence/audit closure | 160 -> 001-159 | IMPLEMENTATION_PLAN.md - Prompt 160 definition | Prompts 001-159 each need current status, red-test target, decision dependency, and proof link; this is closure evidence scope, not a start prerequisite. |
| E-275A | hard_prompt / hard_contract | 275a -> 004;051 | IMPLEMENTATION_PLAN.md - Release objective - SNN Press and operational readout regressions | The Press release preserves the existing base-roster and setup/readiness evidence before its independent station contract. |
| E-275A-RELATED | related/consumes | 275a -> 598;605 | IMPLEMENTATION_PLAN.md - Release objective - SNN Press and operational readout regressions | This bounded release completes Prompt 275a while strengthening the connected Prompt 598 and Prompt 605 contracts. |
| E-275B | sequence / release-boundary | 275b -> POST-CURRENT-DEPENDENCY-SLICE; SEPARATE-RELEASE-0.3.12 | IMPLEMENTATION_PLAN.md - Queued regression objective - Prompt 275b SNN Dispatch Desk | A dedicated repair release follows the current dependency slice and is not part of 0.3.12; these are boundaries, not hard contracts. |
| E-WOLF | sequence | 425 -> 426 -> 428 -> 427 -> 432/432a -> 433/433a/433b -> 434/434a -> 435-444 -> 445-473 -> 475-482 -> 474/484 -> 621 -> 645 | IMPLEMENTATION_PLAN.md - Wolf attack engine, fleet combat, and boarding | Implement this block in dependency order: 425 -> 426 -> 428 -> 427 -> 432/432a -> 433/433a/433b -> 434/434a -> 435-444 -> 445-473 -> 475-482 -> 474/484 -> 621 -> 645. |
| E-433A | hard_prompt | 351, 353-360 -> 433a | IMPLEMENTATION_PLAN.md - Wolf attack engine, fleet combat, and boarding | Prompts 351 and 353-360 consume the stable 433a contract only after it exists. |
| E-436 | related/consumes | 436 -> 435 | IMPLEMENTATION_PLAN.md - Prompt 436 definition | AEGIS Command and Control is available only after Commander rerolls; this is related sequencing, not a hard prompt edge. |
| E-602-CLOSURE | evidence/audit closure | 602 -> 602a | IMPLEMENTATION_MILESTONES.md - audited baseline | Universal Prompt 602 cannot close until the ordinary shuttle return repair 602a is green; this is a closure gate, not a start blocker. |
| E-RETURN-REPAIR-SEQUENCE | sequence | 602a -> 602 | IMPLEMENTATION_MILESTONES.md - audited baseline | Deliver ordinary shuttle return repair 602a before the universal Prompt 602 proof. |
| E-602A | hard_contract | 602a -> AUTHORITATIVE-SHUTTLE-ASSOCIATION; CONSOLE-ROUTE-ENTITLEMENT | IMPLEMENTATION_MILESTONES.md - audited baseline and Prompt 602a definition | The ordinary return target is resolved from authoritative docking/association state and canonical route entitlement. |
| E-603A | hard_contract / sequence | 603a -> SHARED-SESSION-CHROME; ROLE-SELECT | IMPLEMENTATION_MILESTONES.md - audited baseline and addendum order | Prompt 603a is the measured shared session-ticket/header contract and remains a prerequisite for 652b. |
| E-605A | hard_prompt / decision_owner | 605a -> 433a; OWNER-APPROVAL-DEFERRED-VISUALIZATION | IMPLEMENTATION_PLAN.md - Prompt 605a definition | Only after Prompt 433a endpoint/schema/privacy proofs and explicit owner approval. |
| E-TICKER | sequence / hard_prompt | 106c -> 652a/652b; 652 -> 652a; 603a -> 652b | IMPLEMENTATION_PLAN.md - Future roadmap addendum, Dependency and delivery order | Implement Prompt 106c before P652a or P652b; P652a follows P106c and P652; P603a remains a prerequisite for P652b. |
| E-ATTACK-DRADIS | sequence | 433a -> 351; 353-360; 605a | IMPLEMENTATION_PLAN.md - Wolf attack engine and addendum | The stable endpoint precedes DRADIS consumers; deferred visualization is not the playable-attack exit gate. |
| E-ATTACK-PRESSURE | sequence | 485-494 -> attack pressure | IMPLEMENTATION_PLAN.md - Wolf attack engine, fleet combat, and boarding | Prompts 485-494 must become authoritative before attack pressure depends on them. |
| E-PRESENTATION | sequence | 485a -> fleetRedAlert; 611 -> fleetRedAlert; 611a/589b -> characterization/accessibility gates | IMPLEMENTATION_PLAN.md - Future roadmap addendum, Dependency and delivery order | Compact alert surfaces consume existing fleetRedAlert independently; typography/copy repairs may ship independently after their gates. |
| E-REACTOR | sequence | 122a -> named maintenance contracts | IMPLEMENTATION_PLAN.md - Prompt 122a definition | The repair depends on named contracts without claiming their broader vessel matrix complete. |
| E-M1-REPAIR | hard_milestone / decision_owner | 654 -> M1; owner-approved zero-eligible-Wolf outcome | IMPLEMENTATION_PLAN.md - Prompt 654 definition | The repair depends on Milestone 1 and requires an owner-approved server outcome for zero eligible Wolf/private-loyalty holders. |
| E-M1-REPAIR-SEQUENCE | sequence | 654 -> M1-REPAIR | IMPLEMENTATION_PLAN.md - Prompt 654 definition | Prompt 654 is the Milestone 1 repair slice after the owner-approved outcome is recorded. |
| E-662 | related/consumes / decision_owner | 662 -> 054;075;496;586-588; OWNER-APPROVED-WOLF-DESIGNATION-POLICY | IMPLEMENTATION_PLAN.md - Prompt 662 definition | The decision notes overlaps/dependencies 054, 071, 075, 496, and 586-588 and remains missing until the owner-approved policy is recorded; retired 071 is excluded from the canonical related set. |

## Integrity checker

Run the following from the repository root. It checks the row set, live plan tags/status parity, typed dependency graph, closure scopes, and evidence provenance; sequence and related/consumes edges are deliberately excluded from the hard cycle test.

~~~js
const fs = require('node:fs');
const artifact = 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md';
const text = fs.readFileSync(artifact, 'utf8');
const plan = fs.readFileSync('docs/IMPLEMENTATION_PLAN.md', 'utf8');
const progress = fs.readFileSync('docs/IMPLEMENTATION_PROGRESS.md', 'utf8');
const rows = [];
for (const line of text.split(/\n/)) {
  if (!/^\| [0-9]{3}[a-z]* \|/.test(line)) continue;
  const cells = line.slice(2, -1).split(' | ');
  if (cells.length !== 14) throw new Error('row must have 14 columns: ' + line);
  rows.push(cells);
}
const ids = rows.map((row) => row[0]);
const idSet = new Set(ids);
if (idSet.size !== ids.length) throw new Error('duplicate prompt row');
const retiredIds = new Set(['071']);
if (idSet.has('071')) throw new Error('retired prompt 071 must not have an index row');
const planRecords = Array.from(plan.matchAll(/^- \*\*Prompt ([0-9]{3}[a-z]*) — \[([^\]]+)\]/gm), (match) => [match[1], match[2]]);
const progressRecords = Array.from(progress.matchAll(/^\| ([0-9]{3}[a-z]*) \| ([^|]+) \|/gm), (match) => [match[1], match[2].trim()]);
const assertSourceSet = (name, records) => {
  const sourceSet = new Set(records.map((record) => record[0]));
  if (sourceSet.size !== records.length) throw new Error('duplicate ' + name + ' source ID');
  if (records.length !== ids.length) throw new Error(name + ' row count differs from index');
  for (const [id] of records) if (!idSet.has(id)) throw new Error('unknown ' + name + ' ID ' + id);
  for (const id of ids) if (!sourceSet.has(id)) throw new Error('index ID missing from ' + name + ': ' + id);
};
assertSourceSet('plan', planRecords);
assertSourceSet('progress', progressRecords);
const planTags = new Map(planRecords);
const liveProgress = new Map(progressRecords);
for (const row of rows) {
  if (row[1] !== planTags.get(row[0])) throw new Error('plan_tag mismatch on ' + row[0]);
  if (row[2] !== liveProgress.get(row[0])) throw new Error('progress mismatch on ' + row[0]);
}
const evidenceRows = [];
for (const line of text.split(/\n/)) {
  const match = line.match(/^\| (E-[A-Z0-9-]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (.+) \|$/);
  if (match) evidenceRows.push(match.slice(1));
}
const evidenceById = new Map();
for (const row of evidenceRows) {
  if (evidenceById.has(row[0])) throw new Error('duplicate evidence ' + row[0]);
  evidenceById.set(row[0], row);
  if (!row[3].includes(' - ')) throw new Error('evidence source anchor missing separator on ' + row[0]);
  const sourcePath = row[3].split(' - ')[0];
  if (!new Set(['IMPLEMENTATION_PLAN.md', 'IMPLEMENTATION_MILESTONES.md', 'IMPLEMENTATION_PROGRESS.md']).has(sourcePath)) throw new Error('evidence source path not source-of-truth on ' + row[0]);
  if (!row[4].trim()) throw new Error('evidence source language empty on ' + row[0]);
  if (!/->|↝/.test(row[2])) throw new Error('evidence edge direction missing on ' + row[0]);
  for (const token of row[2].match(/\b[0-9]{3}[a-z]?\b/g) || []) {
    if (!idSet.has(token) && !retiredIds.has(token)) throw new Error('unknown prompt token ' + token + ' in evidence ' + row[0]);
  }
}
const evidenceIds = new Set(evidenceById.keys());
const evidenceTypes = new Map(Array.from(evidenceById, ([id, row]) => [id, row[1].split(' / ')]));
const evidenceTypeForField = new Map([
  [3, 'hard_prompt'],
  [4, 'hard_milestone'],
  [5, 'hard_contract'],
  [6, 'decision_owner'],
  [7, 'evidence/audit closure'],
  [8, 'sequence'],
  [9, 'release-boundary'],
  [10, 'related/consumes']
]);
const parseTargets = (value, label) => {
  if (value === 'none') return [];
  const output = [];
  for (const token of value.split(';')) {
    if (token === 'none' || token.trim() === '') throw new Error('empty/none mixed into targets in ' + label);
    const range = token.match(/^([0-9]{3})-([0-9]{3})$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) throw new Error('reverse range ' + token + ' in ' + label);
      for (let n = start; n <= end; n += 1) {
        const id = String(n).padStart(3, '0');
        if (idSet.has(id)) output.push(id);
        else if (retiredIds.has(id)) continue;
        else throw new Error('unknown range member ' + id + ' in ' + label);
      }
    } else if (/^[0-9]{3}[a-z]*$/.test(token)) {
      if (retiredIds.has(token)) throw new Error('retired target ' + token + ' in ' + label);
      if (!idSet.has(token)) throw new Error('unknown target ' + token + ' in ' + label);
      output.push(token);
    } else {
      throw new Error('invalid target ' + token + ' in ' + label);
    }
  }
  return output;
};
const parseClosure = (value, label) => {
  if (value === 'none') return [];
  const output = [];
  for (const segment of value.split(';')) {
    const match = segment.match(/^([^:]+):(.+)$/);
    if (!match || !match[2].trim()) throw new Error('invalid closure gate ' + segment + ' in ' + label);
    const targets = parseTargets(match[1], label);
    if (!targets.length) throw new Error('closure gate has no target in ' + label);
    output.push(...targets);
  }
  return output;
};
const seenEdges = new Set();
const hardEdges = [];
for (const row of rows) {
  const id = row[0];
  for (const index of [3, 10]) {
    const field = index === 3 ? 'hard_prompt_prerequisites' : 'related_consumes';
    for (const target of parseTargets(row[index], id + '.' + field)) {
      if (target === id) throw new Error('self edge ' + id + ' -> ' + target);
      const edge = id + '>' + target;
      if (seenEdges.has(edge)) throw new Error('duplicate expanded edge ' + edge);
      seenEdges.add(edge);
      if (index === 3) hardEdges.push([id, target]);
    }
  }
  for (const target of parseClosure(row[7], id + '.closure_evidence_gates')) {
    if (target === id) throw new Error('self closure gate ' + id + ' -> ' + target);
  }
  if (row[9] !== 'none' && !row[9].trim()) throw new Error('empty release boundary on ' + id);
  const hasGate = [3, 4, 5, 6, 7, 8, 9, 10].some((index) => row[index] !== 'none');
  const refs = row[11] === 'none' ? [] : row[11].split(';');
  if (hasGate && refs.length === 0) throw new Error('dependency without evidence on ' + id);
  for (const ref of refs) if (!evidenceIds.has(ref)) throw new Error('unknown evidence ' + ref + ' on ' + id);
  for (const [index, expectedType] of evidenceTypeForField) {
    if (row[index] === 'none') continue;
    if (!refs.some((ref) => evidenceTypes.get(ref)?.includes(expectedType))) {
      throw new Error('typed evidence mismatch on ' + id + '.' + index + ': expected ' + expectedType);
    }
  }
}
const adjacency = new Map();
for (const [from, to] of hardEdges) {
  if (!adjacency.has(from)) adjacency.set(from, []);
  adjacency.get(from).push(to);
}
const visiting = new Set();
const visited = new Set();
const visit = (id) => {
  if (visiting.has(id)) throw new Error('hard-prompt cycle at ' + id);
  if (visited.has(id)) return;
  visiting.add(id);
  for (const target of adjacency.get(id) || []) visit(target);
  visiting.delete(id);
  visited.add(id);
};
for (const id of ids) visit(id);
const dispatcherStatuses = new Set(['missing', 'partial']);
const dispatcherCandidates = rows.filter((row) => {
  if (!dispatcherStatuses.has(row[2])) return false;
  if (parseTargets(row[3], row[0] + '.hard_prompt_prerequisites').some((target) => progressRecords.find(([id]) => id === target)?.[1] !== 'done')) return false;
  return [4, 5, 6].every((index) => row[index] === 'none');
});
if (dispatcherCandidates.some((row) => retiredIds.has(row[0]) || !idSet.has(row[0]))) throw new Error('dispatcher selected unknown/retired prompt');
if (dispatcherCandidates.some((row) => [4, 5, 6].some((index) => row[index] !== 'none'))) throw new Error('dispatcher selected manual-gated prompt');
console.log('OK: ' + rows.length + ' rows, ' + hardEdges.length + ' hard-prompt edges, ' + evidenceIds.size + ' evidence records; plan tags/progress parity, evidence provenance, cycles, and dispatcher gates verified');
~~~

## Deterministic dispatcher

Run this copy-paste dispatcher from the repository root. It refreshes live
plan/progress state and fails closed on ID, tag, or status drift before it
selects anything. It emits exactly one NEXT prompt, a ranked READY_QUEUE,
explicit NEEDS_CONFIRMATION and BLOCKED reasons with dependency statuses, and a
self-contained CONTEXT_PACKET for the selected prompt. A hard milestone, hard
contract, or owner gate is never mechanically proven by this document, so a
row carrying one is never printed as ready. Closure/evidence gates are
completion scope and never start blockers.

~~~sh
node --input-type=module <<'NODE'
import fs from 'node:fs';

const artifactText = fs.readFileSync('docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md', 'utf8');
const planText = fs.readFileSync('docs/IMPLEMENTATION_PLAN.md', 'utf8');
const progressText = fs.readFileSync('docs/IMPLEMENTATION_PROGRESS.md', 'utf8');
const milestoneText = fs.readFileSync('docs/IMPLEMENTATION_MILESTONES.md', 'utf8');
const artifactLines = artifactText.split(/\n/);
const planLines = planText.split(/\n/);
const progressLines = progressText.split(/\n/);
const milestoneLines = milestoneText.split(/\n/);
const rows = artifactLines
  .filter((line) => /^\| [0-9]{3}[a-z]* \|/.test(line))
  .map((line) => ({ line, cells: line.slice(2, -1).split(' | ').map((cell) => cell.trim()) }));
if (rows.some(({ cells }) => cells.length !== 14)) throw new Error('index row width is not 14');
const ids = rows.map(({ cells }) => cells[0]);
const idSet = new Set(ids);
if (idSet.size !== ids.length) throw new Error('duplicate index ID');
const retiredIds = new Set(['071']);
if (idSet.has('071')) throw new Error('retired prompt 071 must not be selectable');

const liveRecords = progressLines.flatMap((line) => {
  const match = line.match(/^\| ([0-9]{3}[a-z]*) \| ([^|]+) \|/);
  return match ? [[match[1], match[2].trim(), line]] : [];
});
const liveIds = new Set(liveRecords.map(([id]) => id));
if (liveIds.size !== liveRecords.length) throw new Error('duplicate live progress ID');
if (liveRecords.length !== rows.length) throw new Error('live progress/index count mismatch');
for (const id of ids) if (!liveIds.has(id)) throw new Error('index ID missing from live progress: ' + id);
for (const id of liveIds) if (!idSet.has(id)) throw new Error('unknown live progress ID: ' + id);
const liveStatus = new Map(liveRecords.map(([id, status]) => [id, status]));
const liveProgressLine = new Map(liveRecords.map(([id, , line]) => [id, line]));

const planRecords = planLines.flatMap((line) => {
  const match = line.match(/^- \*\*Prompt ([0-9]{3}[a-z]*) — \[([^\]]+)\]/);
  return match ? [[match[1], match[2], line]] : [];
});
const planIds = new Set(planRecords.map(([id]) => id));
if (planIds.size !== planRecords.length) throw new Error('duplicate plan ID');
if (planRecords.length !== rows.length) throw new Error('live plan/index count mismatch');
for (const id of ids) if (!planIds.has(id)) throw new Error('index ID missing from live plan: ' + id);
for (const id of planIds) if (!idSet.has(id)) throw new Error('unknown live plan ID: ' + id);
const planTags = new Map(planRecords.map(([id, tag]) => [id, tag]));
const planDefinition = new Map(planRecords.map(([id, , line]) => [id, line]));
for (const { cells } of rows) {
  if (cells[1] !== planTags.get(cells[0])) throw new Error('plan_tag mismatch on ' + cells[0]);
  if (cells[2] !== liveStatus.get(cells[0])) throw new Error('progress mismatch on ' + cells[0]);
}

const expand = (value, label) => {
  if (value === 'none') return [];
  const output = [];
  for (const token of value.split(';')) {
    if (token === 'none' || token.trim() === '') throw new Error('empty/none mixed into ' + label);
    const range = token.match(/^([0-9]{3})-([0-9]{3})$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) throw new Error('reverse range ' + token + ' in ' + label);
      for (let n = start; n <= end; n += 1) {
        const id = String(n).padStart(3, '0');
        if (idSet.has(id)) output.push(id);
        else if (retiredIds.has(id)) continue;
        else throw new Error('unknown range member ' + id + ' in ' + label);
      }
    } else {
      if (retiredIds.has(token)) throw new Error('retired target ' + token + ' in ' + label);
      if (!/^[0-9]{3}[a-z]*$/.test(token) || !idSet.has(token)) throw new Error('unknown target ' + token + ' in ' + label);
      output.push(token);
    }
  }
  return output;
};

const milestoneRank = (row) => {
  if (row[12] === 'none') return 999;
  const match = row[12].match(/M([0-9]+)/);
  return match ? Number(match[1]) : 998;
};
const sourceOrdinal = new Map(rows.map(({ cells: row }, index) => [row[0], index]));
const wolfOrderMatch = planText.match(/Implement this block in dependency order:\s*([\s\S]*?)\.\s*Prompts 351/);
if (!wolfOrderMatch) throw new Error('Wolf attack dependency order missing from IMPLEMENTATION_PLAN.md');
const expandSequenceToken = (value, label) => expand(value.trim().replace(/[–—]/g, '-'), label);
const wolfOrderGroups = wolfOrderMatch[1]
  .replace(/\s+/g, ' ')
  .replace(/→/g, '->')
  .split(/\s*->\s*/)
  .map((group) => group.trim())
  .filter(Boolean);
const wolfOrdinalById = new Map();
for (const [groupIndex, group] of wolfOrderGroups.entries()) {
  const members = group.split('/').flatMap((token) => expandSequenceToken(token, 'WOLF-ATTACK source order'));
  if (!members.length) throw new Error('empty WOLF-ATTACK source-order group ' + group);
  for (const [memberIndex, id] of members.entries()) {
    if (wolfOrdinalById.has(id)) throw new Error('duplicate WOLF-ATTACK source-order prompt ' + id);
    wolfOrdinalById.set(id, groupIndex * 1000 + memberIndex);
  }
}
const expectedWolfOrder = [
  '425', '426', '428', '427', '432', '432a', '433', '433a', '433b', '434', '434a',
  ...Array.from({ length: 10 }, (_, index) => String(435 + index)),
  ...Array.from({ length: 29 }, (_, index) => String(445 + index)),
  ...Array.from({ length: 8 }, (_, index) => String(475 + index)),
  '474', '484', '621', '645'
];
if (JSON.stringify([...wolfOrdinalById.keys()]) !== JSON.stringify(expectedWolfOrder)) {
  throw new Error('WOLF-ATTACK source order drifted: expected ' + expectedWolfOrder.join(' -> ') + ', got ' + [...wolfOrdinalById.keys()].join(' -> '));
}
const rowByPromptId = new Map(rows.map(({ cells: row }) => [row[0], row]));
for (const id of expectedWolfOrder) {
  const row = rowByPromptId.get(id);
  if (!row || !row[8].split(';').includes('WOLF-ATTACK')) throw new Error('WOLF-ATTACK prompt missing sequence tag: ' + id);
  const refs = row[11] === 'none' ? [] : row[11].split(';');
  if (!refs.includes('E-WOLF')) throw new Error('WOLF-ATTACK prompt missing E-WOLF evidence: ' + id);
}
const sequenceRank = (row) => wolfOrdinalById.get(row[0]) ?? Number.MAX_SAFE_INTEGER;
const dispatchCompare = (left, right) => {
  const milestoneDelta = milestoneRank(left) - milestoneRank(right);
  if (milestoneDelta) return milestoneDelta;
  const sequenceDelta = sequenceRank(left) - sequenceRank(right);
  if (sequenceDelta) return sequenceDelta;
  return sourceOrdinal.get(left[0]) - sourceOrdinal.get(right[0]);
};
const sorted = (items) => items.slice().sort(dispatchCompare);
const statusOf = (id) => liveStatus.get(id) || (retiredIds.has(id) ? 'retired' : 'unknown');
const dependencySummary = (row) => {
  const targets = expand(row[3], row[0] + '.hard_prompt_prerequisites');
  return {
    targets,
    all: targets.length ? targets.map((id) => id + '=' + statusOf(id)).join(',') : 'none',
    unresolved: targets.filter((id) => statusOf(id) !== 'done')
  };
};
const gatesOf = (row) => [
  ['hard_milestone', row[4]],
  ['hard_contract', row[5]],
  ['decision_owner', row[6]]
].filter(([, value]) => value !== 'none');
const busyStatuses = new Set(['active', 'in-progress', 'in_progress']);
const selectableStatuses = new Set(['missing', 'partial']);
const ready = [];
const needsConfirmation = [];
const blocked = [];
for (const { cells: row } of rows) {
  const status = statusOf(row[0]);
  if (status === 'done') continue;
  const dependency = dependencySummary(row);
  const gates = gatesOf(row);
  if (busyStatuses.has(status)) {
    blocked.push([row, ['progress=' + status + ' (agent already working)']]);
  } else if (!selectableStatuses.has(status)) {
    blocked.push([row, ['progress=' + status + ' (unsupported for automatic selection)']]);
  } else if (dependency.unresolved.length) {
    blocked.push([row, ['hard_prompt_prerequisites: ' + dependency.all]]);
  } else if (gates.length) {
    needsConfirmation.push([row, ['hard_prompt_prerequisites: ' + dependency.all, ...gates.map(([name, value]) => name + '=' + value + ' (not mechanically proven)')]]);
  } else {
    ready.push(row);
  }
}
const readyQueue = sorted(ready);
const readyWolfRanks = readyQueue
  .filter((row) => wolfOrdinalById.has(row[0]))
  .map((row) => wolfOrdinalById.get(row[0]));
if (readyWolfRanks.some((rank, index) => index > 0 && readyWolfRanks[index - 1] > rank)) {
  throw new Error('READY_QUEUE violates the explicit WOLF-ATTACK order');
}
const rowById = new Map(rows.map(({ cells: row, line }) => [row[0], { row, line }]));
const evidenceLine = new Map(artifactLines.flatMap((line) => {
  const match = line.match(/^\| (E-[A-Z0-9-]+) \|/);
  return match ? [[match[1], line]] : [];
}));
const routeFor = (hints) => {
  const names = hints.match(/M[0-9]+/g) || [];
  if (!names.length) return ['none'];
  const route = [];
  for (const name of names) {
    const start = milestoneLines.findIndex((line) => line.startsWith('### Milestone ' + name.slice(1) + ' —'));
    if (start < 0) {
      route.push(name + ': missing from IMPLEMENTATION_MILESTONES.md');
      continue;
    }
    const end = milestoneLines.findIndex((line, index) => index > start && /^### Milestone [0-9]+ —/.test(line));
    const section = milestoneLines.slice(start, end < 0 ? milestoneLines.length : end);
    let capturingField = false;
    for (const line of section) {
      if (/^### Milestone /.test(line)) {
        route.push(line);
        capturingField = false;
      } else if (/^\*\*(Outcome|Depends on|Primary prompt neighborhood|Exit fixture):/.test(line)) {
        route.push(line);
        capturingField = true;
      } else if (capturingField && line.trim()) {
        route.push(line);
      } else if (!line.trim()) {
        capturingField = false;
      }
    }
  }
  return route;
};
const milestoneOneRoute = routeFor('M1');
for (const fragment of [
  'the exact roster, privately assigns loyalties, seats players, and advances from',
  'privacy contracts.',
  'callable path, with unsupported rosters, leaked secrets, stale requests, and',
  'duplicate commands denied.'
]) {
  if (!milestoneOneRoute.some((line) => line.includes(fragment))) throw new Error('Milestone 1 route lost continuation: ' + fragment);
}
const printReasons = (items) => {
  for (const [row, reasons] of items) console.log(row[0] + '\t' + reasons.join('; ') + '\t' + row[13]);
};
const selected = readyQueue[0] || null;
console.log('NEXT: ' + (selected ? selected[0] : 'NONE'));
console.log('READY_QUEUE');
readyQueue.forEach((row, index) => console.log((index + 1) + '. ' + row[0] + '\t' + 'milestone=' + row[12] + '\tsequence=' + row[8] + '\t' + row[13]));
console.log('NEEDS_CONFIRMATION');
printReasons(needsConfirmation.sort(([left], [right]) => dispatchCompare(left, right)));
console.log('BLOCKED');
printReasons(blocked.sort(([left], [right]) => dispatchCompare(left, right)));
console.log('CONTEXT_PACKET');
if (!selected) {
  console.log('none: no mechanically selectable prompt exists in the current live ledger');
} else {
  const selectedRecord = rowById.get(selected[0]);
  const dependency = dependencySummary(selected);
  console.log('prompt_id: ' + selected[0]);
  console.log('index_row: ' + selectedRecord.line);
  console.log('plan_definition: ' + planDefinition.get(selected[0]));
  console.log('live_progress_row: ' + liveProgressLine.get(selected[0]));
  console.log('milestone_route:');
  for (const line of routeFor(selected[12])) console.log('  ' + line);
  console.log('dependency_evidence_anchors:');
  const refs = selected[11] === 'none' ? [] : selected[11].split(';');
  for (const ref of refs) console.log('  ' + (evidenceLine.get(ref) || ref + ': missing evidence row'));
  console.log('required_preceding_contracts:');
  console.log('  hard_prompt_prerequisites=' + selected[3] + ' [' + dependency.all + ']');
  console.log('  hard_milestone=' + selected[4]);
  console.log('  hard_contract=' + selected[5]);
  console.log('  decision_owner=' + selected[6]);
  console.log('  closure_evidence_gates=' + selected[7] + ' (closure only; never a start blocker)');
  console.log('proof_validation_expectation: Follow CLAUDE.md; state the Given/When/Then outcome; preserve current proof or observe the smallest missing acceptance fail; deliver one bounded authoritative retry-safe audience-correct result; record focused evidence and complete the single reconciled release gate.');
  console.log('coordination_claim_reminder: claim the first unclaimed READY item; if the claim fails, take the next READY item; never substitute the lowest unresolved prompt.');
}
NODE
~~~

Mechanical claim rule: claim the first unclaimed item in READY_QUEUE. If its
coordination claim fails, take the next ranked READY_QUEUE item. Never
substitute the lowest unresolved ID; that is only a resume pointer.

## Current-ledger sample

This sample was generated by the dispatcher above from the current plan and
progress ledgers. It is a compact transcript showing the required shape; rerun
the command for the live full queue and packet.

~~~text
NEXT: 012
READY_QUEUE
1. 012  milestone=M1  sequence=none      Define command idempotency.
2. 014  milestone=M1  sequence=none      Define stale-snapshot semantics.
3. 015  milestone=M1  sequence=none      Define the command error taxonomy.
...
NEEDS_CONFIRMATION
031a  hard_prompt_prerequisites: 030=done,031=done,032=done,034=done; hard_contract=CURRENT-SETUP-READINESS (not mechanically proven)
654   hard_prompt_prerequisites: none; hard_milestone=M1 (not mechanically proven); decision_owner=OWNER-APPROVED-ZERO-ELIGIBLE-WOLF-OUTCOME (not mechanically proven)
602a  hard_prompt_prerequisites: none; hard_contract=AUTHORITATIVE-SHUTTLE-ASSOCIATION;CONSOLE-ROUTE-ENTITLEMENT (not mechanically proven)
662   hard_prompt_prerequisites: none; decision_owner=OWNER-APPROVED-WOLF-DESIGNATION-POLICY (not mechanically proven)
BLOCKED
020a  hard_prompt_prerequisites: 020=done,074=done,075=partial,076=done,077=partial,078=done,079=done,080=missing,081=done,177=done,287=missing,...
CONTEXT_PACKET
prompt_id: 012
index_row: | 012 | PRESERVE | partial | none | none | none | none | none | none | none | none | none | M1 | Define command idempotency. |
plan_definition: - **Prompt 012 — [PRESERVE] Define command idempotency.** Acceptance: retrying a command returns its original result without duplicating state, cost, randomness, or audit events.
live_progress_row: | 012 | partial | non-feature | — | Selected callables replay results; no universal command matrix yet. |
milestone_route:
  ### Milestone 1 — Cast and start a real game
  **Outcome:** a facilitator selects a supported immutable configuration, casts
  the exact roster, privately assigns loyalties, seats players, and advances from
  Turn 0 to Turn 1 without invalid or orphaned authority.
  **Depends on:** session lifecycle, join/seat/GM authority, configuration and
  privacy contracts.
  **Primary prompt neighborhood:** 001–090.
  **Exit fixture:** create → join → cast → start → Turn 1 using the production
  callable path, with unsupported rosters, leaked secrets, stale requests, and
  duplicate commands denied.
dependency_evidence_anchors:
required_preceding_contracts:
  hard_prompt_prerequisites=none [none]
  hard_milestone=none
  hard_contract=none
  decision_owner=none
  closure_evidence_gates=none (closure only; never a start blocker)
proof_validation_expectation: Follow CLAUDE.md; state the Given/When/Then outcome; preserve current proof or observe the smallest missing acceptance fail; deliver one bounded authoritative retry-safe audience-correct result; record focused evidence and complete the single reconciled release gate.
coordination_claim_reminder: claim the first unclaimed READY item; if the claim fails, take the next READY item; never substitute the lowest unresolved prompt.
~~~

## Maintenance rules

- Treat this index as a required preflight, not optional navigation: re-read it
  before selecting, starting, editing, marking, or merging a numbered prompt,
  and after any rebase or material movement of current `main`.
- Never mark a prompt complete or merge its slice while a hard prompt
  prerequisite is not `done`. The executable documentation gate checks this
  completion invariant; closure/evidence gates remain completion scope and do
  not become hidden start blockers.
- Refresh this index whenever the plan adds, retires, renames, or reclassifies a canonical prompt, and rerun the coverage, parity, integrity, and deterministic-dispatcher checks above.
- Preserve typed edges and their evidence. If the source is silent, write none; do not infer a previous-prompt edge, numeric adjacency, a whole domain range, or a milestone edge from ordering alone.
- Reconcile the progress column and plan_tag with the live source ledgers whenever statuses or acceptance classes change. The embedded checker must fail before lookup on drift.
- Keep hard readiness limited to hard prompt, milestone, contract, and owner fields. Closure/evidence gates are completion audits; sequence, release-boundary, and related/consumes rows are planning context and must never become hidden start blockers.
- Numeric ranges must fail closed when any member is unknown; keep the explicit retired set synchronized with the plan. Lettered IDs remain explicit and are never silently expanded.
- Keep source evidence directionally explicit (from prompt to prerequisite/closure target), with a source-of-truth path, anchor, and source language for every non-none typed field.
- This is a documentation-only navigation aid. It does not authorize implementation, change player-facing behavior, replace source-of-truth acceptance, or bypass the repository test, security, accessibility, release, merge, or coordination gates.

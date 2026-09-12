# Implementation prompt dependency index

This is the generated dependency view for the canonical prompt catalog. The
single editable authority is
[`implementation-prompts.json`](./implementation-prompts.json); the generator
projects its prompt definitions, status, class, release mapping, hard gates,
sequence rules, and evidence into this view. The plan and progress documents
retain acceptance context and historical release prose, while milestones retain
their route narrative. Empty dependency fields are written as `none`, not
inferred as permission to skip a prompt.

## Read-only lookup

Use `npm run coordination:dependencies -- --prompt NNN` for a compact packet,
`--full` for the complete queue, `--json` for stable machine consumption, and
`--verify` to validate the catalog and dispatcher without changing the
worktree. The command reads only the catalog and never creates local state.
No prompt-registration trailer is required for ordinary tooling or fixes. When
work is intentionally tied to a roadmap prompt, the selected packet still
exposes hard prerequisites, milestone/contract/owner gates, and evidence so
the owner can make the correct decision.

## Fast path: choose the next prompt

1. Run the compact dispatcher for the candidate. It includes the exact catalog
   record, acceptance, progress, evidence, and readiness result. The lowest
   unresolved ID is a resume pointer, not a dependency lock.
2. For a missing or partial prompt, only hard_prompt_prerequisites,
   hard_milestone, hard_contract, and decision_owner block start readiness.
   closure_evidence_gates are completion/audit gates, not start blockers;
   release_boundaries, sequence_rules, and related_consumes are context. Every
   hard prompt must be done; every named milestone, contract, or owner gate
   must be confirmed in the current source-of-truth documents.
3. Use milestone_hints, sequence_rules, release_boundaries, and related_consumes
   to pick a bounded slice with the right story context. These fields never
   become hidden readiness blockers.
4. Read those generated packet fields before selecting bounded work. The packet
   is advisory context; coordination ownership and release gates remain their
   own concerns.

### Concurrent prompt selection

`NEXT` (the first item in `READY_QUEUE`) is the primary resume/default lane,
but it is advisory for concurrency, not a serial execution lock. A separate
worktree may claim a later `READY_QUEUE` item concurrently only when its hard
prompt prerequisites are done, every hard milestone, hard contract, and
decision-owner gate is satisfied or explicitly confirmed, and the coordination
forecast shows conflict-free ownership with no active claim overlap.
`NEEDS_CONFIRMATION` and `BLOCKED` rows are not ready; a worktree must not
bypass an unmet dependency, active claim, or unresolved decision-owner gate
merely because the prompt is independent.

Exact compact lookup for one prompt:

~~~sh
npm run coordination:dependencies -- --prompt 020a
~~~

## Coverage and integrity

Run the shared check after any catalog edit or generated-view change:

~~~sh
npm run validate:dependencies
~~~

The executable catalog validator checks IDs, typed evidence, hard cycles, and
dispatcher readiness. Generated rows remain below as a navigable view, never a
second editable authority.

## Field contract

| Field | Readiness meaning |
| --- | --- |
| prompt_id | Canonical ID copied from the plan definition; lettered IDs are explicit rows. |
| plan_tag | Projection of the catalog `tag`; generated with the plan definition. |
| progress | Projection of the catalog `status`; `done` is required for a hard prompt prerequisite. |
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
| title | Generated from the catalog definition title for fast visual scanning. |

Numeric ranges are inclusive and fail closed: every expanded member must be canonical or explicitly listed as retired. The current retired set is 071, which has no row and is never a valid hard target. Lettered IDs are always explicit tokens; lettered ranges are not supported. A range never creates an edge to a lettered prompt, and none means that no explicit dependency was found in the current source.

<!-- BEGIN GENERATED PROMPT CATALOG: dependency -->
<!-- Generated from docs/implementation-prompts.json; edit the catalog and run the view generator. -->
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
| 012 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Define command idempotency. |
| 013 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Define authoritative server time. |
| 014 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Define stale-snapshot semantics. |
| 015 | EXTEND | done | none | none | none | none | none | none | none | none | none | M1 | Define the command error taxonomy. |
| 016 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Define member and device identity. |
| 017 | EXTEND | done | none | none | none | none | none | none | none | none | none | M1 | Stabilize entity identifiers. |
| 018 | EXTEND | done | none | none | none | none | none | none | none | none | none | M1 | Define phase-eligible action metadata. |
| 019 | EXTEND | done | none | none | none | none | none | none | none | none | none | M1 | Define privacy-safe audit records. |
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
| 055 | EXTEND | done | none | none | none | none | none | none | none | none | none | M1 | Gate Intelligence Agent setup. |
| 056 | EXTEND | done | none | none | none | none | none | none | none | none | E-M1-SETUP | M1 | Gate Universal Arbour and Wolf Cult setup. |
| 057 | EXTEND | done | none | none | none | none | none | none | none | none | none | M1 | Select base or expansion vessel mode. |
| 058 | EXTEND | done | none | none | none | none | none | none | none | none | none | M1 | Load expansion roster data. |
| 059 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Capture nonbinding ship preferences. |
| 060 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Assign casting authoritatively. |
| 061 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Enforce role exclusivity. |
| 062 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Release and reassign before start. |
| 063 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Deliver private role briefs. |
| 064 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Deliver private loyalty cards. |
| 065 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Initialize loyalty suspicion. |
| 066 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Pair Friend loyalties. |
| 067 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Reveal Android proof deliberately. |
| 068 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Assign role-owned craft. |
| 069 | PRESERVE | done | none | none | none | none | none | none | none | none | E-069-START | M1 | Initialize vessel populations and stores. |
| 070 | PRESERVE | done | none | none | none | none | none | none | none | none | E-070-START | M1 | Initialize security teams. |
| 072 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Lock casting at start. |
| 073 | REPAIR | done | none | none | none | none | none | M1-SETUP | none | none | E-M1-SETUP | M1 | Represent facilitator responsibilities without a staffing dependency. |
| 074 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Authorize game start. |
| 075 | EXTEND | done | none | none | none | none | none | M1-SETUP | none | none | E-M1-SETUP;E-075-START | M1 | Start the game atomically. |
| 076 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Make start retry-safe. |
| 077 | NEW | done | none | none | none | none | none | none | none | none | E-077-START | M1 | Initialize pursuit at 2. |
| 078 | NEW | done | none | none | none | none | none | none | none | none | none | M1 | Configure the six-to-eight-turn limit. |
| 079 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Apply Turn 1 time extensions. |
| 080 | NEW | done | none | none | none | none | none | none | none | none | E-080-WOLF-TIMING | M1 | Represent the first Wolf-attack timing window. |
| 081 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Publish the start announcement. |
| 082 | PRESERVE | done | none | none | none | none | none | none | none | none | E-082-PUBLIC-SNAPSHOT | M1 | Publish the initial public snapshot. |
| 083 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M1 | Authorize member live snapshots. |
| 084 | EXTEND | done | none | none | none | none | none | none | none | none | E-084-CREW-VESSEL-STATE | M1 | Project per-ship shared state. |
| 085 | EXTEND | done | none | none | none | none | none | none | none | none | E-085-ROLE-PRIVATE-RECONNECT | M1 | Refresh role-private state. |
| 086 | EXTEND | done | none | none | none | none | none | none | none | none | E-086-FACILITATOR-PRIVATE | M1 | Refresh facilitator-private state. |
| 087 | EXTEND | done | none | none | none | none | none | none | none | none | none | M1 | Deny direct gameplay collection writes. |
| 088 | PRESERVE | done | none | none | none | none | none | none | none | none | E-088-SNAPSHOT-ORDER | M1 | Order snapshots by revision. |
| 089 | PRESERVE | done | none | none | none | none | none | none | none | none | E-089-EVENT-REPLAY | M1 | Replay events without duplicate effects. |
| 090 | PROVE | done | none | none | none | none | none | none | none | none | E-090-HIDDEN-REDACTION | M1 | Prove hidden-state redaction. |
| 091 | PRESERVE | done | none | none | none | none | none | none | none | none | E-091-TURN-ENTITY | M2 | Implement the turn entity. |
| 092 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Enter Team Phase authoritatively. |
| 093 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Enter Coordination Phase authoritatively. |
| 094 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Drive the Team timer from server time. |
| 095 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Drive the Coordination timer from server time. |
| 096 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Apply Turn 1 timer overrides once. |
| 097 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Audit the emergency timer pause slice. |
| 098 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Make phase expiry idempotent. |
| 099 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Gate Team actions. |
| 100 | PRESERVE | partial | 113;321;212 | none | none | none | none | none | none | none | E-100-COORDINATION-METADATA;E-AUDIT-100 | M2 | Gate Coordination actions. |
| 101 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Announce Team completion. |
| 102 | PRESERVE | done | none | none | none | none | none | none | none | none | E-102-COORDINATION-COMPLETION | M2 | Announce Coordination completion. |
| 103 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Initialize the next turn. |
| 103a | NEW | missing | 091-096;098;101-103;106b;108-109;154-158 | none | none | none | none | none | none | none | E-103A | M2 | Hold the airspace deadline behind turn-advance interstitials. |
| 104 | PROVE | done | 078;103 | none | none | none | none | none | none | none | E-104-FINAL-TURN;E-AUDIT-104 | M2 | Complete the configured final turn. |
| 105 | NEW | partial | 077;485 | none | none | none | none | none | none | none | E-AUDIT-105 | M2 | Trigger pursuit-10 failure. |
| 106 | PRESERVE | done | none | none | none | none | none | none | none | none | E-106-LIFECYCLE-REPLAY | M2 | Replay lifecycle announcements. |
| 106a | PRESERVE | done | none | none | none | none | none | none | none | none | E-106A | M2 | Enforce FleetBroadcast precedence. |
| 106b | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Verify exact turn-transmission timing. |
| 106c | EXTEND | done | none | none | none | none | none | TICKER-LIFECYCLE | none | none | E-TICKER | M2 | Make fleet-ticker lifecycle server-authoritative. |
| 107 | DECISION | missing | none | none | none | none | none | none | none | none | none | M2 | Decide split-fleet clock semantics. |
| 108 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Reconnect during a live timer. |
| 109 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Reconcile delayed lifecycle updates. |
| 110 | PROVE | done | 103 | none | none | none | none | none | none | none | E-AUDIT-110 | M2 | Run the lobby-to-two-turn scenario. |
| 111 | PRESERVE | done | none | none | none | none | none | none | none | none | E-AUDIT-111 | M2 | Define authoritative resource ledgers. |
| 112 | NEW | missing | 111 | none | none | none | none | none | none | none | E-AUDIT-112 | M2 | Resolve same-table trades. |
| 113 | NEW | missing | 111;164;361 | none | none | none | none | none | none | none | E-AUDIT-113 | M2 | Resolve shuttle-mediated transfers. |
| 114 | PRESERVE | partial | 161;162;234;249 | none | none | none | none | none | none | 121;235;241;242;246;250;571;591 | E-AUDIT-114;E-AUDIT-114-ORDER;E-AUDIT-114-RELATED | M2 | Register vessel-specific maintenance order. |
| 115 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Resolve damaged Storage. |
| 116 | PRESERVE | missing | 117;162 | none | none | none | none | none | none | none | E-AUDIT-116 | M2 | Select food and water rations independently. |
| 117 | DECISION | missing | none | none | none | none | none | none | none | none | none | M2 | Resolve the ration-table wording conflict. |
| 118 | PRESERVE | missing | 116;162 | none | none | none | none | none | none | none | E-AUDIT-118 | M2 | Swap population-dependent ration tables. |
| 119 | PRESERVE | missing | 111;116;117 | none | none | none | none | none | none | none | E-AUDIT-119 | M2 | Resolve the two-dice unrest check. |
| 120 | PRESERVE | missing | 119;130 | none | none | none | none | none | none | none | E-AUDIT-120 | M2 | Resolve a riot. |
| 121 | EXTEND | missing | 114;120 | none | none | none | none | none | none | none | E-AUDIT-121 | M2 | Resolve small-ship maintenance loss. |
| 122 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Enforce Reactor capacity. |
| 122a | REPAIR | done | 122-125;128;138 | none | none | none | none | REACTOR-REPAIR | none | none | E-122A;E-REACTOR;E-122A-VERIFIED | M2 | Confirm Reactor power-up before authoritative mutation. |
| 123 | EXTEND | done | 122;162 | none | none | none | none | none | none | none | E-AUDIT-123;E-123-VERIFIED | M2 | Apply vessel-specific damaged-Reactor penalties. |
| 124 | EXTEND | done | 122 | none | none | none | none | none | none | none | E-AUDIT-124 | M2 | Apply Reactor upgrades. |
| 125 | PRESERVE | done | 122;138 | none | none | none | none | none | none | none | E-AUDIT-125 | M2 | Enforce console charge eligibility. |
| 126 | PRESERVE | missing | 127;361 | none | none | none | none | none | none | none | E-AUDIT-126 | M2 | Resolve both AEGIS shuttle bays. |
| 127 | PRESERVE | missing | 361 | none | none | none | none | none | none | none | E-AUDIT-127 | M2 | Resolve ordinary single-bay fuelling. |
| 128 | PRESERVE | done | 103 | none | none | none | none | none | none | none | E-AUDIT-128;E-128-VERIFIED | M2 | Expire unused charges and shuttle fuel. |
| 129 | PRESERVE | missing | 127 | none | none | none | none | none | none | none | E-AUDIT-129 | M2 | Surface damaged-bay denial. |
| 130 | PRESERVE | done | none | none | none | none | none | none | none | none | E-130-VERIFIED | M2 | Draw damage cards authoritatively. |
| 131 | PRESERVE | done | 130 | none | none | none | none | none | none | none | E-AUDIT-131;E-131-VERIFIED | M2 | Destroy a ship on empty-deck draw. |
| 132 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Recycle AEGIS Armoured Hull. |
| 133 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Step discrete population tracks. |
| 134 | REPAIR | missing | 118 | none | none | none | none | none | none | none | E-AUDIT-134 | M2 | Alert starred population thresholds without a multi-GM deadlock. |
| 135 | PRESERVE | missing | 119;120 | none | none | none | none | none | none | none | E-AUDIT-135 | M2 | Add two unrest at population zero. |
| 136 | NEW | missing | 119 | none | none | none | none | none | none | none | E-AUDIT-136 | M2 | Enter mutiny at unrest 8. |
| 137 | NEW | missing | 136 | none | none | none | none | none | none | none | E-AUDIT-137 | M2 | Resolve replacement-captain mutiny recovery. |
| 138 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Make maintenance atomic and retry-safe. |
| 138a | PRESERVE | done | none | none | none | none | none | none | none | none | none | M2 | Bound maintenance rollback. |
| 139 | EXTEND | done | none | none | none | none | none | none | none | none | none | M2 | Publish maintenance results by audience. |
| 140 | PROVE | missing | 114;171;183;194;204;216;224;235;241;242;246;250;571 | none | none | none | none | none | none | none | E-AUDIT-140 | M2 | Run the all-vessel maintenance matrix. |
| 140a | NEW | missing | 111;164;361 | none | none | none | none | none | none | none | E-AUDIT-140A | M3;M11 | Evacuate survivors by cargo shuttle. |
| 140b | NEW | missing | 140a | none | none | none | none | none | none | none | E-AUDIT-140B | M3;M11 | Enforce destination population capacity. |
| 140c | NEW | missing | 140a;140b | none | none | none | none | none | none | none | E-AUDIT-140C | M3;M11 | Make evacuation retry-safe. |
| 140d | NEW | missing | 131 | none | none | none | none | none | none | none | E-AUDIT-140D | M3;M11 | Create escape pods on ship destruction. |
| 140e | NEW | missing | 140d | none | none | none | none | none | none | none | E-AUDIT-140E | M3;M11 | Move players into escape state. |
| 140f | NEW | missing | 140d;361 | none | none | none | none | none | none | none | E-AUDIT-140F | M3;M11 | Preserve retained shuttles. |
| 140g | NEW | missing | 140d;111 | none | none | none | none | none | none | none | E-AUDIT-140G | M3;M11 | Scavenge destroyed-ship stores. |
| 141 | NEW | done | none | none | none | none | none | none | none | none | none | M2 | Define normal airspace. |
| 142 | NEW | missing | 141;361 | none | none | none | none | none | none | none | E-AUDIT-142 | M2 | Enforce Team Phase docking. |
| 143 | NEW | missing | 361 | none | none | none | none | none | none | none | E-AUDIT-143 | M2 | Bind shuttle holder and dock. |
| 144 | NEW | missing | 141;143 | none | none | none | none | none | none | none | E-AUDIT-144 | M2 | Resolve a legal shuttle move. |
| 145 | EXTEND | missing | 141 | none | none | none | none | none | none | none | E-AUDIT-145 | M2 | Lock airspace for a Wolf attack. |
| 146 | DECISION | missing | none | none | none | none | none | none | none | none | none | M2 | Decide nearest-ship parking ties. |
| 147 | EXTEND | missing | none | none | none | none | none | none | none | 432;433 | E-147-RELATED | M2 | Restrict battle-table craft. |
| 148 | NEW | missing | 145 | none | none | none | none | none | none | none | E-AUDIT-148 | M2 | Preserve post-attack parking. |
| 149 | NEW | missing | 143 | none | none | none | none | none | none | none | E-AUDIT-149 | M2 | Restrict quarantined docking. |
| 150 | NEW | missing | 149 | none | none | none | none | none | none | none | E-AUDIT-150 | M2 | Prevent quarantine reset exploits. |
| 151 | NEW | missing | 286 | none | none | none | none | none | none | none | E-AUDIT-151 | M2 | Block split-fleet communications. |
| 152 | NEW | missing | 337;338 | none | none | none | none | none | none | none | E-AUDIT-152 | M2 | Redact split-fleet shuttle state. |
| 153 | NEW | missing | 143;336 | none | none | none | none | none | none | none | E-AUDIT-153 | M2 | Constrain cross-group docking. |
| 154 | NEW | missing | 142;141;145;149;336;414 | none | none | none | none | none | none | none | E-AUDIT-154 | M2 | Model airspace transitions. |
| 155 | NEW | missing | 154 | none | none | none | none | none | none | none | E-AUDIT-155 | M2 | Announce airspace status truthfully. |
| 156 | NEW | missing | 154 | none | none | none | none | none | none | none | E-AUDIT-156 | M2 | Reopen movement authoritatively. |
| 157 | NEW | missing | 145 | none | none | none | none | none | none | none | E-AUDIT-157 | M2 | Preserve an overrun attack into Team Phase. |
| 158 | NEW | missing | 154 | none | none | none | none | none | none | none | E-AUDIT-158 | M2 | Reconnect during restricted airspace. |
| 159 | PROVE | missing | 140;145;156;373 | none | none | none | none | none | none | none | E-AUDIT-159 | M2 | Run the start-to-airspace scenario. |
| 160 | PROVE | missing | none | none | none | none | 001-159:status,red-test,decision,proof | none | none | none | E-160-AUDIT | M2 | Publish the foundation regression matrix. |
| 161 | PRESERVE | done | none | none | none | none | none | none | none | none | E-AUDIT-161 | M3;M5 | Register every vessel variant. |
| 162 | PRESERVE | done | 161 | none | none | none | none | none | none | none | E-AUDIT-162;E-AUDIT-162-STATS | M3;M5 | Encode printed vessel statistics. |
| 163 | PRESERVE | done | none | none | none | none | none | none | none | none | E-163-VERIFIED | M3;M5 | Register the optional sixth resource. |
| 164 | PRESERVE | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-164 | M3;M5 | Encode cargo permissions. |
| 165 | EXTEND | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-165 | M3;M5 | Complete console metadata. |
| 166 | EXTEND | missing | 161;165 | none | none | none | none | none | none | none | E-AUDIT-166 | M3;M5 | Bind roles to vessel actions. |
| 167 | EXTEND | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Standardize vessel action envelopes. |
| 168 | DECISION | missing | none | none | none | none | none | none | none | none | none | M3;M5 | Record vessel rule calls. |
| 169 | EXTEND | missing | 161;162;165 | none | none | none | none | none | none | none | E-AUDIT-169 | M3;M5 | Build shared vessel fixtures. |
| 170 | EXTEND | missing | 048;049 | none | none | none | none | none | none | none | E-AUDIT-170 | M3;M5 | Project observer-safe vessel data. |
| 171 | PRESERVE | missing | 114;161;162 | none | none | none | none | none | none | none | E-AUDIT-171 | M3;M5 | Complete AEGIS identity and maintenance lane. |
| 172 | PRESERVE | missing | 130;161;162 | none | none | none | none | none | none | none | E-AUDIT-172 | M3;M5 | Resolve AEGIS Armoured Hull I and II. |
| 173 | PRESERVE | done | 115 | none | none | none | none | none | none | none | E-AUDIT-173;E-VESSEL-STORAGE-VERIFIED | M3;M5 | Resolve AEGIS Storage. |
| 174 | PRESERVE | done | 122;125 | none | none | none | none | none | none | none | E-AUDIT-174;E-VESSEL-REACTORS-VERIFIED | M3;M5 | Resolve the AEGIS Reactor. |
| 175 | PRESERVE | missing | 127;361 | none | none | none | none | none | none | none | E-AUDIT-175 | M3;M5 | Resolve Shuttle Bay Zeta. |
| 176 | PRESERVE | missing | 127;361 | none | none | none | none | none | none | none | E-AUDIT-176 | M3;M5 | Resolve Shuttle Bay Omega. |
| 177 | PRESERVE | done | none | none | none | none | none | none | none | none | none | M3;M5 | Audit the AEGIS Jump Drive. |
| 178 | NEW | missing | 161;162;262 | none | none | none | none | none | none | none | E-AUDIT-178 | M3;M5 | Resolve the Construction Bay. |
| 179 | NEW | missing | 166 | none | none | none | none | none | none | none | E-AUDIT-179 | M3;M5 | Create the Admiral policy workspace. |
| 180 | NEW | missing | 166;182 | none | none | none | none | none | none | none | E-AUDIT-180 | M3;M5 | Create the Executive Officer workspace. |
| 181 | NEW | missing | 166;260;262 | none | none | none | none | none | none | none | E-AUDIT-181 | M3;M5 | Create the Wing Commander workspace. |
| 182 | EXTEND | missing | 165 | none | none | none | none | none | none | none | E-AUDIT-182 | M3;M5 | Complete AEGIS combat-console registration. |
| 183 | PRESERVE | done | 161;162 | none | none | none | none | none | none | none | E-AUDIT-183;E-183-VERIFIED | M3;M5 | Gate Dione by roster. |
| 184 | PRESERVE | missing | 116;118 | none | none | none | none | none | none | none | E-AUDIT-184 | M3;M5 | Resolve Dione rations and thresholds. |
| 185 | PRESERVE | done | 115;183 | none | none | none | none | none | none | none | E-AUDIT-185;E-VESSEL-STORAGE-VERIFIED | M3;M5 | Resolve Dione Storage. |
| 186 | PRESERVE | done | 122;125 | none | none | none | none | none | none | none | E-AUDIT-186;E-VESSEL-REACTORS-VERIFIED | M3;M5 | Resolve the Dione Reactor. |
| 187 | PRESERVE | missing | 127;361 | none | none | none | none | none | none | none | E-AUDIT-187 | M3;M5 | Resolve the Dione Shuttle Bay. |
| 188 | NEW | missing | 122;125;183 | none | none | none | none | none | none | none | E-AUDIT-188 | M3;M5 | Resolve Dione Hydroponics. |
| 189 | NEW | missing | 122;125;183 | none | none | none | none | none | none | none | E-AUDIT-189 | M3;M5 | Resolve Dione Water Reclamation. |
| 190 | NEW | missing | 167 | none | none | none | none | none | none | none | E-AUDIT-190 | M3;M5 | Draw and own Dione VIP cards. |
| 191 | NEW | missing | 119;190 | none | none | none | none | none | none | none | E-AUDIT-191 | M3;M5 | Spend a VIP unrest reroll. |
| 192 | NEW | missing | 182;264 | none | none | none | none | none | none | none | E-AUDIT-192 | M3;M5 | Gate Dione's Fighter Bay and Maliades. |
| 193 | NEW | missing | 166 | none | none | none | none | none | none | none | E-AUDIT-193 | M3;M5 | Complete the Dione Captain workspace. |
| 193a | NEW | missing | 166;183 | none | none | none | none | none | none | none | E-AUDIT-193A | M3;M5 | Complete the Dione Engineer workspace. |
| 193b | NEW | missing | 166;183 | none | none | none | none | none | none | none | E-AUDIT-193B | M3;M5 | Complete the President workspace. |
| 194 | PRESERVE | missing | 114;161;162 | none | none | none | none | none | none | none | E-AUDIT-194 | M3;M5 | Complete Icebreaker identity and maintenance lane. |
| 195 | PRESERVE | done | 115 | none | none | none | none | none | none | none | E-AUDIT-195;E-VESSEL-STORAGE-VERIFIED | M3;M5 | Resolve Icebreaker Storage. |
| 196 | PRESERVE | done | 122;125 | none | none | none | none | none | none | none | E-AUDIT-196;E-VESSEL-REACTORS-VERIFIED | M3;M5 | Resolve the Icebreaker Reactor. |
| 197 | PRESERVE | missing | 127;361 | none | none | none | none | none | none | none | E-AUDIT-197 | M3;M5 | Resolve the Icebreaker Shuttle Bay. |
| 198 | NEW | missing | 114;122;125;194 | none | none | none | none | none | none | none | E-AUDIT-198 | M3;M5 | Resolve Icebreaker Hydroponics. |
| 199 | NEW | missing | 114;122;125;194 | none | none | none | none | none | none | none | E-AUDIT-199 | M3;M5 | Resolve Icebreaker Water Reclamation. |
| 200 | NEW | missing | 114;122;125;194 | none | none | none | none | none | none | none | E-AUDIT-200 | M3;M5 | Resolve Mining Drone Control. |
| 201 | PRESERVE | missing | 177;287-304 | none | none | none | none | none | none | none | E-AUDIT-201 | M3;M5 | Audit the Icebreaker Jump Drive. |
| 202 | NEW | missing | 201 | none | none | none | none | none | none | none | E-AUDIT-202 | M3;M5 | Resolve the Ram Scoop. |
| 203 | NEW | missing | 166 | none | none | none | none | none | none | none | E-AUDIT-203 | M3;M5 | Complete the Icebreaker Captain workspace. |
| 203a | NEW | missing | 166;194;361 | none | none | none | none | none | none | none | E-AUDIT-203A | M3;M5 | Complete the Icebreaker Engineer workspace. |
| 203b | NEW | missing | 166;194;265;388 | none | none | none | none | none | none | none | E-AUDIT-203B | M3;M5 | Complete the Miner workspace. |
| 204 | PRESERVE | missing | 114;161;162 | none | none | none | none | none | none | none | E-AUDIT-204 | M3;M5 | Complete Shepherd identity and maintenance lane. |
| 205 | PRESERVE | done | 115 | none | none | none | none | none | none | none | E-AUDIT-205;E-VESSEL-STORAGE-VERIFIED | M3;M5 | Resolve Shepherd Storage. |
| 206 | PRESERVE | done | 122;125 | none | none | none | none | none | none | none | E-AUDIT-206;E-VESSEL-REACTORS-VERIFIED | M3;M5 | Resolve the Shepherd Reactor. |
| 207 | PRESERVE | missing | 127;361 | none | none | none | none | none | none | none | E-AUDIT-207 | M3;M5 | Resolve the Shepherd Shuttle Bay. |
| 208 | NEW | missing | 122;125;204 | none | none | none | none | none | none | none | E-AUDIT-208 | M3;M5 | Resolve Shepherd Water Reclamation. |
| 209 | NEW | missing | 122;125;204 | none | none | none | none | none | none | none | E-AUDIT-209 | M3;M5 | Resolve both Shepherd Advanced Hydroponics consoles. |
| 210 | PRESERVE | missing | 177;287-304 | none | none | none | none | none | none | none | E-AUDIT-210 | M3;M5 | Audit the Shepherd Jump Drive. |
| 211 | NEW | missing | 165;204;267 | none | none | none | none | none | none | none | E-AUDIT-211 | M3;M5 | Encode Endeavour console-upgrade research tracks. |
| 212 | NEW | missing | 211 | none | none | none | none | none | none | none | E-AUDIT-212 | M3;M5 | Enforce Endeavour research cadence. |
| 213 | NEW | missing | 211 | none | none | none | none | none | none | none | E-AUDIT-213 | M3;M5 | Build and use the ECM Device. |
| 214 | NEW | missing | 211 | none | none | none | none | none | none | none | E-AUDIT-214 | M3;M5 | Build and use the Wolf Agent Detector. |
| 215 | NEW | missing | 166 | none | none | none | none | none | none | none | E-AUDIT-215 | M3;M5 | Complete the Shepherd Captain workspace. |
| 215a | NEW | missing | 166;204;361 | none | none | none | none | none | none | none | E-AUDIT-215A | M3;M5 | Complete the Shepherd Engineer workspace. |
| 215b | NEW | missing | 166;204;211;321 | none | none | none | none | none | none | none | E-AUDIT-215B | M3;M5 | Complete the Scientist workspace. |
| 216 | PRESERVE | missing | 114;161;162 | none | none | none | none | none | none | none | E-AUDIT-216 | M3;M5 | Complete Quellon identity and maintenance lane. |
| 217 | PRESERVE | done | 115 | none | none | none | none | none | none | none | E-AUDIT-217;E-VESSEL-STORAGE-VERIFIED | M3;M5 | Resolve Quellon Storage. |
| 218 | PRESERVE | done | 122;125 | none | none | none | none | none | none | none | E-AUDIT-218;E-VESSEL-REACTORS-VERIFIED | M3;M5 | Resolve the Quellon Reactor. |
| 219 | PRESERVE | missing | 127;361 | none | none | none | none | none | none | none | E-AUDIT-219 | M3;M5 | Resolve the Quellon Shuttle Bay. |
| 220 | NEW | missing | 122;125;216 | none | none | none | none | none | none | none | E-AUDIT-220 | M3;M5 | Resolve Quellon Hydroponics. |
| 221 | NEW | missing | 122;125;216 | none | none | none | none | none | none | none | E-AUDIT-221 | M3;M5 | Resolve both Water Production consoles. |
| 222 | PRESERVE | missing | 177;287-304 | none | none | none | none | none | none | none | E-AUDIT-222 | M3;M5 | Audit the Quellon Jump Drive. |
| 223 | NEW | missing | 166 | none | none | none | none | none | none | none | E-AUDIT-223 | M3;M5 | Complete the Quellon Captain workspace. |
| 223a | NEW | missing | 166;216;361 | none | none | none | none | none | none | none | E-AUDIT-223A | M3;M5 | Complete the Quellon Engineer workspace. |
| 223b | NEW | missing | 166;216;269;321 | none | none | none | none | none | none | none | E-AUDIT-223B | M3;M5 | Complete the Explorer workspace. |
| 224 | PRESERVE | missing | 114;161;162 | none | none | none | none | none | none | none | E-AUDIT-224 | M3;M5 | Complete Refinery 124 identity and maintenance lane. |
| 225 | PRESERVE | done | 115 | none | none | none | none | none | none | none | E-AUDIT-225;E-VESSEL-STORAGE-VERIFIED | M3;M5 | Resolve Refinery 124 Storage. |
| 226 | PRESERVE | done | 122;125 | none | none | none | none | none | none | none | E-AUDIT-226;E-VESSEL-REACTORS-VERIFIED | M3;M5 | Resolve the Refinery 124 Reactor. |
| 227 | PRESERVE | missing | 127;361 | none | none | none | none | none | none | none | E-AUDIT-227 | M3;M5 | Resolve the Refinery 124 Shuttle Bay. |
| 228 | NEW | missing | 122;125;224 | none | none | none | none | none | none | none | E-AUDIT-228 | M3;M5 | Resolve Refinery 124 Hydroponics. |
| 229 | NEW | missing | 122;125;224 | none | none | none | none | none | none | none | E-AUDIT-229 | M3;M5 | Resolve Refinery 124 Water Reclamation. |
| 230 | NEW | missing | 122;125;224 | none | none | none | none | none | none | none | E-AUDIT-230 | M3;M5 | Resolve both Fuel Refinery consoles. |
| 231 | NEW | missing | 182;273 | none | none | none | none | none | none | none | E-AUDIT-231 | M3;M5 | Gate the Refinery Fighter Bay. |
| 232 | PRESERVE | missing | 177;287-304 | none | none | none | none | none | none | none | E-AUDIT-232 | M3;M5 | Audit the Refinery 124 Jump Drive. |
| 233 | NEW | missing | 166 | none | none | none | none | none | none | none | E-AUDIT-233 | M3;M5 | Complete the Refinery 124 Captain workspace. |
| 233a | NEW | missing | 166;224;361 | none | none | none | none | none | none | none | E-AUDIT-233A | M3;M5 | Complete the Refinery Engineer workspace. |
| 233b | NEW | missing | 166;224;273 | none | none | none | none | none | none | none | E-AUDIT-233B | M3;M5 | Complete the PDF Colonel workspace. |
| 234 | EXTEND | missing | 161;162;111;141 | none | none | none | none | none | none | none | E-AUDIT-234 | M3;M5;M6 | Implement shared small-ship rules. |
| 234a | DECISION | missing | none | none | none | none | none | none | none | none | none | M3;M5;M6 | Apply the extra-role balance dial. |
| 235 | EXTEND | missing | 234;161;162 | none | none | none | none | none | none | none | E-AUDIT-235 | M3;M5;M6 | Complete Gorgoneion identity and maintenance. |
| 236 | NEW | missing | 234;287-304 | none | none | none | none | none | none | none | E-AUDIT-236 | M3;M5;M6 | Resolve the Gorgoneion Jump Drive. |
| 237 | NEW | missing | 234;402 | none | none | none | none | none | none | none | E-AUDIT-237 | M3;M5;M6 | Resolve Gorgoneion Mission Support. |
| 238 | NEW | missing | 234;361 | none | none | none | none | none | none | none | E-AUDIT-238 | M3;M5;M6 | Resolve Gorgoneion Repair Drones. |
| 239 | NEW | missing | 234;165 | none | none | none | none | none | none | none | E-AUDIT-239 | M3;M5;M6 | Register the Gorgoneion Missile Array. |
| 240 | NEW | missing | 234;165 | none | none | none | none | none | none | none | E-AUDIT-240 | M3;M5;M6 | Register the Gorgoneion Force Field Projector. |
| 241 | NEW | missing | 234;161;162 | none | none | none | none | none | none | none | E-AUDIT-241 | M3;M5;M6 | Complete base Capybara identity and maintenance. |
| 241a | NEW | missing | 234;287-304 | none | none | none | none | none | none | none | E-AUDIT-241A | M3;M5;M6 | Resolve the base Capybara Jump Drive. |
| 241b | NEW | missing | 241;401 | none | none | none | none | none | none | none | E-AUDIT-241B | M3;M5;M6 | Resolve base Capybara Bulk Haulage. |
| 241c | NEW | missing | 241;164 | none | none | none | none | none | none | none | E-AUDIT-241C | M3;M5;M6 | Resolve base Capybara Cargo Transfer. |
| 241d | NEW | missing | 241;122;125 | none | none | none | none | none | none | none | E-AUDIT-241D | M3;M5;M6 | Resolve base Capybara food and water production. |
| 241e | NEW | missing | 241;122;125 | none | none | none | none | none | none | none | E-AUDIT-241E | M3;M5;M6 | Resolve the base Capybara Fuel Processor. |
| 242 | NEW | missing | 234;161;162 | none | none | none | none | none | none | none | E-AUDIT-242 | M3;M5;M6 | Complete Warrior identity and maintenance. |
| 243 | NEW | missing | 242;402 | none | none | none | none | none | none | none | E-AUDIT-243 | M3;M5;M6 | Resolve Warrior Reclamator. |
| 244 | NEW | missing | 234;361 | none | none | none | none | none | none | none | E-AUDIT-244 | M3;M5;M6 | Resolve Warrior Repair Drones. |
| 245 | NEW | missing | 242 | none | none | none | none | none | none | none | E-AUDIT-245 | M3;M5;M6 | Register Warrior Salvage Drones. |
| 246 | NEW | missing | 234;161;162 | none | none | none | none | none | none | none | E-AUDIT-246 | M3;M5;M6 | Complete Vulcan identity and maintenance. |
| 247 | NEW | missing | 246;182 | none | none | none | none | none | none | none | E-AUDIT-247 | M3;M5;M6 | Register the Vulcan Laser Cannon. |
| 248 | NEW | missing | 246;122;125 | none | none | none | none | none | none | none | E-AUDIT-248 | M3;M5;M6 | Resolve both Vulcan Additional Labour consoles. |
| 249 | NEW | missing | 525 | none | none | none | none | none | none | none | E-AUDIT-249 | M3;M5;M6 | Admit Voyage 33-0 through the crisis path. |
| 250 | NEW | missing | 249;114 | none | none | none | none | none | none | none | E-AUDIT-250 | M3;M5;M6 | Resolve Voyage 33-0 maintenance. |
| 251 | NEW | missing | 249;287-304 | none | none | none | none | none | none | none | E-AUDIT-251 | M3;M5;M6 | Resolve Voyage 33-0 movement. |
| 252 | REPAIR | missing | 057;058 | none | none | none | none | none | none | none | E-AUDIT-252 | M3;M5;M6 | Gate the expansion Capybara. |
| 253 | EXTEND | missing | 252;161;162 | none | none | none | none | none | none | none | E-AUDIT-253 | M3;M5;M6 | Complete expansion Capybara identity. |
| 254 | EXTEND | missing | 253;122;125 | none | none | none | none | none | none | none | E-AUDIT-254 | M3;M5;M6 | Resolve expansion Capybara Storage and Reactor. |
| 255 | NEW | missing | 253;122;125 | none | none | none | none | none | none | none | E-AUDIT-255 | M3;M5;M6 | Resolve Capybara Advanced Hydroponics. |
| 256 | NEW | missing | 253;122;125 | none | none | none | none | none | none | none | E-AUDIT-256 | M3;M5;M6 | Resolve Capybara Water Production. |
| 257 | NEW | missing | 253;122;125 | none | none | none | none | none | none | none | E-AUDIT-257 | M3;M5;M6 | Resolve the Scrap Refinery. |
| 258 | NEW | missing | 253;122;125 | none | none | none | none | none | none | none | E-AUDIT-258 | M3;M5;M6 | Resolve Capybara Shuttle Bay choice. |
| 259 | PROVE | missing | 253;287-304 | none | none | none | none | none | none | none | E-AUDIT-259 | M3;M5;M6 | Audit the expansion Capybara Jump Drive. |
| 260 | PRESERVE | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-260 | M3;M5;M6 | Register Starlight completely. |
| 261 | PRESERVE | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-261 | M3;M5;M6 | Register Pallas completely. |
| 262 | PRESERVE | missing | 161;162;165 | none | none | none | none | none | none | none | E-AUDIT-262 | M3;M5;M6 | Register Fighter Wings Alpha and Bravo. |
| 263 | PRESERVE | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-263 | M3;M5;M6 | Register Philia completely. |
| 264 | PRESERVE | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-264 | M3;M5;M6 | Register Maliades completely. |
| 265 | PRESERVE | missing | 161;162;164 | none | none | none | none | none | none | none | E-AUDIT-265 | M3;M5;M6 | Register Highwall completely. |
| 266 | PRESERVE | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-266 | M3;M5;M6 | Register Blacksmith completely. |
| 267 | PRESERVE | missing | 161;162;165 | none | none | none | none | none | none | none | E-AUDIT-267 | M3;M5;M6 | Register Endeavour completely. |
| 268 | PRESERVE | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-268 | M3;M5;M6 | Register Black Sheep completely. |
| 269 | PRESERVE | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-269 | M3;M5;M6 | Register Hummingbird completely. |
| 270 | PRESERVE | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-270 | M3;M5;M6 | Register Condor completely. |
| 271 | PRESERVE | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-271 | M3;M5;M6 | Register Chacau completely. |
| 272 | PRESERVE | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-272 | M3;M5;M6 | Register Chepu completely. |
| 273 | PRESERVE | missing | 161;162;262 | none | none | none | none | none | none | none | E-AUDIT-273 | M3;M5;M6 | Register the PDF Escort Fighter Wing. |
| 274 | PRESERVE | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-274 | M3;M5;M6 | Register J.E.U. Wobbly completely. |
| 275 | PRESERVE | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-275 | M3;M5;M6 | Register J.E.U. Ally completely. |
| 275a | EXTEND | done | 004;051 | none | BASE-ROSTER-SETUP;PRESS-CATALOG-AUTHORITY | none | none | none | none | 598;605 | E-275A;E-275A-RELATED | M3;M5;M6 | Restore the optional SNN Independent Press Shuttle. |
| 275b | REPAIR | done | 275a | none | none | none | none | PRESS-DESK | POST-CURRENT-DEPENDENCY-SLICE;SEPARATE-RELEASE-0.3.12 | none | E-275B;E-AUDIT-275B | M3;M5;M6 | Recover and restore the SNN Dispatch Desk regression. |
| 276 | PRESERVE | missing | 053;166 | none | none | none | none | none | none | none | E-AUDIT-276 | M3;M5;M6 | Assign the Quellon/Refinery Union pair. |
| 277 | PRESERVE | missing | 053;166 | none | none | none | none | none | none | none | E-AUDIT-277 | M3;M5;M6 | Assign the Shepherd/Icebreaker Union pair. |
| 278 | EXTEND | missing | 166;234 | none | none | none | none | none | none | none | E-AUDIT-278 | M3;M5;M6 | Build extra-ship Captain workspaces. |
| 279 | EXTEND | missing | 166;252 | none | none | none | none | none | none | none | E-AUDIT-279 | M3;M5;M6 | Build expansion Capybara role workspaces. |
| 280 | EXTEND | missing | 060;166 | none | none | none | none | none | none | none | E-AUDIT-280 | M3;M5;M6 | Build replacement-role workspace shells. |
| 281 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Encode the canonical star-chart graph. |
| 282 | NEW | missing | 281 | none | none | none | none | none | none | none | E-AUDIT-282 | M4;M5 | Select and lock chart A, B, or C. |
| 283 | NEW | missing | 281;282 | none | none | none | none | none | none | none | E-AUDIT-283 | M4;M5 | Resolve system codes by chart. |
| 284 | NEW | missing | 283;006 | none | none | none | none | none | none | none | E-AUDIT-284 | M4;M5 | Redact unknown systems. |
| 285 | NEW | missing | 281 | none | none | none | none | none | none | none | E-AUDIT-285 | M4;M5 | Model per-ship position. |
| 286 | NEW | missing | 285 | none | none | none | none | none | none | none | E-AUDIT-286 | M4;M5 | Model fleet-group identity. |
| 287 | PRESERVE | missing | 281;285 | none | none | none | none | none | none | none | E-AUDIT-287 | M4;M5 | Calculate jump distance. |
| 288 | PRESERVE | missing | 162;287 | none | none | none | none | none | none | none | E-AUDIT-288 | M4;M5 | Resolve per-ship jump costs. |
| 289 | PRESERVE | missing | 177;287 | none | none | none | none | none | none | none | E-AUDIT-289 | M4;M5 | Validate Jump Drive readiness. |
| 290 | PRESERVE | missing | 287;103 | none | none | none | none | none | none | none | E-AUDIT-290 | M4;M5 | Enforce one jump per ship per turn. |
| 291 | PRESERVE | missing | 288;167 | none | none | none | none | none | none | none | E-AUDIT-291 | M4;M5 | Reserve jump fuel atomically. |
| 292 | PRESERVE | done | none | none | none | none | none | none | none | none | E-292-VERIFIED | M4;M5 | Validate coordinate shape. |
| 293 | PRESERVE | missing | 281;282;285 | none | none | none | none | none | none | none | E-AUDIT-293 | M4;M5 | Validate printed reachability. |
| 294 | PRESERVE | missing | 287-293 | none | none | none | none | none | none | none | E-AUDIT-294 | M4;M5 | Complete an independent ship jump. |
| 295 | PRESERVE | done | none | none | none | none | none | none | none | none | E-295-VERIFIED | M4;M5 | Resolve unprinted coordinates. |
| 296 | PRESERVE | missing | 289;291 | none | none | none | none | none | none | none | E-AUDIT-296 | M4;M5 | Resolve uncharged and fuel-starved attempts. |
| 297 | EXTEND | missing | 289;294;130 | none | none | none | none | none | none | none | E-AUDIT-297 | M4;M5 | Resolve damaged-drive randomness. |
| 298 | EXTEND | missing | 289;124 | none | none | none | none | none | none | none | E-AUDIT-298 | M4;M5 | Apply upgraded-drive behavior. |
| 299 | DECISION | missing | none | none | none | none | none | none | none | none | none | M4;M5 | Apply failed-jump damage. |
| 300 | EXTEND | missing | 289;291 | none | none | none | none | none | none | none | E-AUDIT-300 | M4;M5 | Execute one emergency jump per ship. |
| 301 | EXTEND | missing | 291;294 | none | none | none | none | none | none | none | E-AUDIT-301 | M4;M5 | Resolve concurrent fleet jumps. |
| 302 | EXTEND | missing | 294;167 | none | none | none | none | none | none | none | E-AUDIT-302 | M4;M5 | Record every jump transition. |
| 303 | PRESERVE | missing | 289;294 | none | none | none | none | none | none | none | E-AUDIT-303 | M4;M5 | Audit jump-button truthfulness. |
| 304 | EXTEND | missing | 294;291;302 | none | none | none | none | none | none | none | E-AUDIT-304 | M4;M5 | Reconcile jump retries. |
| 305 | NEW | missing | 103 | none | none | none | none | none | none | none | E-AUDIT-305 | M4;M5 | Advance pursuit each turn. |
| 306 | NEW | missing | 281;285;305 | none | none | none | none | none | none | none | E-AUDIT-306 | M4;M5 | Reduce pursuit by chart depth. |
| 307 | NEW | missing | 286;305 | none | none | none | none | none | none | none | E-AUDIT-307 | M4;M5 | Isolate pursuit by fleet group. |
| 308 | NEW | missing | 306 | none | none | none | none | none | none | none | E-AUDIT-308 | M4;M5 | Apply Ion Nebula pursuit behavior. |
| 309 | NEW | missing | 306 | none | none | none | none | none | none | none | E-AUDIT-309 | M4;M5 | Apply the Level 5 Planet exception. |
| 310 | NEW | missing | 313;315 | none | none | none | none | none | none | none | E-AUDIT-310 | M4;M5 | Make Unstable Star missions repeatable. |
| 311 | NEW | missing | 313;315 | none | none | none | none | none | none | none | E-AUDIT-311 | M4;M5 | Make Abandoned Wolf Supply Outpost missions repeatable. |
| 312 | NEW | missing | 283;313 | none | none | none | none | none | none | none | E-AUDIT-312 | M4;M5 | Trigger L/M arrival pressure. |
| 313 | NEW | missing | 281;283 | none | none | none | none | none | none | none | E-AUDIT-313 | M4;M5 | Persist system history. |
| 314 | NEW | missing | 285 | none | none | none | none | none | none | none | E-AUDIT-314 | M4;M5 | Remove destroyed ships from navigation. |
| 315 | NEW | missing | 283;313 | none | none | none | none | none | none | none | E-AUDIT-315 | M4;M5 | Create first-arrival mission eligibility. |
| 316 | NEW | missing | 313;315 | none | none | none | none | none | none | none | E-AUDIT-316 | M4;M5 | Make arrival effects idempotent. |
| 317 | NEW | missing | 114;313 | none | none | none | none | none | none | none | E-AUDIT-317 | M4;M5 | Resolve environmental maintenance hazards. |
| 318 | NEW | missing | 313 | none | none | none | none | none | none | none | E-AUDIT-318 | M4;M5 | Track candidate discovery. |
| 319 | NEW | missing | 318 | none | none | none | none | none | none | none | E-AUDIT-319 | M4;M5 | Surface the Turn 6 planning checkpoint. |
| 320 | PROVE | missing | 281;282;294;313;316 | none | none | none | none | none | none | none | E-AUDIT-320 | M4;M5 | Run the jump-and-system scenario. |
| 321 | NEW | missing | 260;267;269;280 | none | none | none | none | none | none | none | E-AUDIT-321 | M4;M5;M8 | Define scout entitlements. |
| 322 | NEW | missing | 321;177 | none | none | none | none | none | none | none | E-AUDIT-322 | M4;M5;M8 | Resolve Starlight's first scan. |
| 323 | NEW | missing | 321;322 | none | none | none | none | none | none | none | E-AUDIT-323 | M4;M5;M8 | Resolve Starlight's fuelled second scan. |
| 324 | NEW | missing | 321;216 | none | none | none | none | none | none | none | E-AUDIT-324 | M4;M5;M8 | Resolve Hummingbird scouting. |
| 325 | NEW | missing | 321;267 | none | none | none | none | none | none | none | E-AUDIT-325 | M4;M5;M8 | Resolve Endeavour scouting. |
| 326 | NEW | missing | 321;280;177 | none | none | none | none | none | none | none | E-AUDIT-326 | M4;M5;M8 | Resolve Comms Officer scouting. |
| 327 | PROVE | missing | 321;285 | none | none | none | none | none | none | none | E-AUDIT-327 | M4;M5;M8 | Measure scout range from current authority. |
| 328 | NEW | missing | 321;327;006 | none | none | none | none | none | none | none | E-AUDIT-328 | M4;M5;M8 | Deliver scout results privately. |
| 329 | NEW | missing | 283;328 | none | none | none | none | none | none | none | E-AUDIT-329 | M4;M5;M8 | Reveal a chart result as facilitator. |
| 330 | NEW | missing | 313;328 | none | none | none | none | none | none | none | E-AUDIT-330 | M4;M5;M8 | Persist player discovery notes safely. |
| 331 | PROVE | missing | 167;328;330 | none | none | none | none | none | none | none | E-AUDIT-331 | M4;M5;M8 | Audit scouting events. |
| 332 | NEW | missing | 313;328 | none | none | none | none | none | none | none | E-AUDIT-332 | M4;M5;M8 | Accumulate Deep Nebula scans privately. |
| 333 | NEW | missing | 332 | none | none | none | none | none | none | none | E-AUDIT-333 | M4;M5;M8 | Hide the Deep Nebula total. |
| 334 | NEW | missing | 315;313 | none | none | none | none | none | none | none | E-AUDIT-334 | M4;M5;M8 | Apply two-system exploration rewards. |
| 335 | NEW | missing | 315;313 | none | none | none | none | none | none | none | E-AUDIT-335 | M4;M5;M8 | Constrain Athena's Wolf-system reveal. |
| 336 | NEW | missing | 285;286;294 | none | none | none | none | none | none | none | E-AUDIT-336 | M4;M5;M8 | Create a split after partial arrival. |
| 337 | NEW | missing | 286;006 | none | none | none | none | none | none | none | E-AUDIT-337 | M4;M5;M8 | Project a group-local roster. |
| 338 | NEW | missing | 337 | none | none | none | none | none | none | none | E-AUDIT-338 | M4;M5;M8 | Deny cross-group position reads. |
| 339 | NEW | missing | 337 | none | none | none | none | none | none | none | E-AUDIT-339 | M4;M5;M8 | Deny cross-group communications. |
| 340 | NEW | missing | 337;339 | none | none | none | none | none | none | none | E-AUDIT-340 | M4;M5;M8 | Permit local Coordination communication. |
| 341 | NEW | missing | 337;099 | none | none | none | none | none | none | none | E-AUDIT-341 | M4;M5;M8 | Keep Team actions group-local. |
| 342 | NEW | missing | 336;337 | none | none | none | none | none | none | none | E-AUDIT-342 | M4;M5;M8 | Scope jump announcements by audience. |
| 343 | NEW | missing | 321;336 | none | none | none | none | none | none | none | E-AUDIT-343 | M4;M5;M8 | Ferry up to two players by scout taxi. |
| 344 | NEW | missing | 343 | none | none | none | none | none | none | none | E-AUDIT-344 | M4;M5;M8 | Ferry up to two fuel by scout taxi. |
| 345 | NEW | missing | 343 | none | none | none | none | none | none | none | E-AUDIT-345 | M4;M5;M8 | Deny out-of-range taxi trips. |
| 346 | NEW | missing | 285;336 | none | none | none | none | none | none | none | E-AUDIT-346 | M4;M5;M8 | Validate group rejoin eligibility. |
| 347 | NEW | missing | 346 | none | none | none | none | none | none | none | E-AUDIT-347 | M4;M5;M8 | Merge rejoined membership. |
| 348 | DECISION | missing | none | none | none | none | none | none | none | none | none | M4;M5;M8 | Resolve rejoined pursuit. |
| 349 | NEW | missing | 339;347 | none | none | none | none | none | none | none | E-AUDIT-349 | M4;M5;M8 | Restore communication after commit. |
| 350 | NEW | missing | 346;347 | none | none | none | none | none | none | none | E-AUDIT-350 | M4;M5;M8 | Make split/rejoin retries safe. |
| 351 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-433A;E-ATTACK-DRADIS | M7 | Show only arrived local ships on DRADIS. |
| 352 | EXTEND | partial | 294 | none | none | none | none | none | none | none | E-AUDIT-352 | M7 | Represent jumping ships in transition. |
| 353 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Publish sampled transit contacts. |
| 354 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Remove stale contacts. |
| 355 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Fold docked shuttles into host contacts. |
| 356 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Show undocked shuttle samples. |
| 357 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Redact split-fleet contact metadata. |
| 358 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Reflect attack parking on DRADIS. |
| 359 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Merge contacts after rejoin. |
| 360 | EXTEND | missing | 433a | none | none | none | none | ATTACK-DRADIS | none | none | E-ATTACK-DRADIS;E-433A | M7 | Deny direct DRADIS writes. |
| 361 | PRESERVE | missing | 161;162 | none | none | none | none | none | none | none | E-AUDIT-361 | M7 | Build the authoritative shuttle manifest. |
| 362 | NEW | missing | 361 | none | none | none | none | none | none | none | E-AUDIT-362 | M7 | Transfer shuttle control. |
| 363 | NEW | missing | 361;362 | none | none | none | none | none | none | none | E-AUDIT-363 | M7 | Resolve holder-based docking. |
| 364 | NEW | missing | 142;361 | none | none | none | none | none | none | none | E-AUDIT-364 | M7 | Validate Team-start docking. |
| 365 | NEW | missing | 141;363 | none | none | none | none | none | none | none | E-AUDIT-365 | M7 | Request shuttle departure. |
| 366 | NEW | missing | 365 | none | none | none | none | none | none | none | E-AUDIT-366 | M7 | Enter authoritative shuttle transit. |
| 367 | NEW | missing | 366;313 | none | none | none | none | none | none | none | E-AUDIT-367 | M7 | Complete shuttle arrival. |
| 368 | NEW | missing | 366 | none | none | none | none | none | none | none | E-AUDIT-368 | M7 | Retarget in flight. |
| 369 | NEW | missing | 361;363 | none | none | none | none | none | none | none | E-AUDIT-369 | M7 | Fuel only eligible docked craft. |
| 370 | NEW | missing | 369;128 | none | none | none | none | none | none | none | E-AUDIT-370 | M7 | Expire unused shuttle fuel. |
| 371 | NEW | missing | 145;146;366 | none | none | none | none | none | none | none | E-AUDIT-371 | M7 | Park craft when airspace closes. |
| 372 | NEW | missing | 145;275a | none | none | none | none | none | none | none | E-AUDIT-372 | M7 | Apply the SNN/AEGIS movement exception. |
| 373 | NEW | missing | 145;147 | none | none | none | none | none | none | none | E-AUDIT-373 | M7 | Park every craft for a Wolf attack. |
| 374 | NEW | missing | 130;373 | none | none | none | none | none | none | none | E-AUDIT-374 | M7 | Preserve shuttle damage immunity. |
| 375 | NEW | missing | 361;369 | none | none | none | none | none | none | none | E-AUDIT-375 | M7 | Enforce ordinary bay capacity. |
| 376 | NEW | missing | 126;369 | none | none | none | none | none | none | none | E-AUDIT-376 | M7 | Enforce AEGIS dual-bay capacity. |
| 377 | NEW | missing | 164;361;363 | none | none | none | none | none | none | none | E-AUDIT-377 | M7 | Transfer permitted shuttle cargo. |
| 378 | NEW | missing | 377 | none | none | none | none | none | none | none | E-AUDIT-378 | M7 | Preserve security-team semantics. |
| 379 | NEW | missing | 377 | none | none | none | none | none | none | none | E-AUDIT-379 | M7 | Deny invalid cargo moves. |
| 380 | NEW | missing | 365;366;367 | none | none | none | none | none | none | none | E-AUDIT-380 | M7 | Reconcile movement conflicts. |
| 381 | NEW | missing | 263;361 | none | none | none | none | none | none | none | E-AUDIT-381 | M7 | Resolve Philia repairs. |
| 382 | NEW | missing | 266;361 | none | none | none | none | none | none | none | E-AUDIT-382 | M7 | Resolve Blacksmith repairs. |
| 383 | NEW | missing | 271;361 | none | none | none | none | none | none | none | E-AUDIT-383 | M7 | Resolve Chacau repairs. |
| 384 | NEW | missing | 275;361 | none | none | none | none | none | none | none | E-AUDIT-384 | M7 | Resolve Ally repairs. |
| 385 | NEW | missing | 361;377 | none | none | none | none | none | none | none | E-AUDIT-385 | M7 | Resolve permissioned dismantling. |
| 386 | NEW | missing | 361;369 | none | none | none | none | none | none | none | E-AUDIT-386 | M7 | Resolve service-shuttle recharge. |
| 387 | NEW | missing | 386 | none | none | none | none | none | none | none | E-AUDIT-387 | M7 | Trigger immediate effects from recharge. |
| 388 | NEW | missing | 265;111 | none | none | none | none | none | none | none | E-AUDIT-388 | M7 | Resolve Highwall mining. |
| 389 | NEW | missing | 265;426 | none | none | none | none | none | none | none | E-AUDIT-389 | M7 | Resolve Highwall combat. |
| 390 | NEW | missing | 269;111 | none | none | none | none | none | none | none | E-AUDIT-390 | M7 | Resolve Hummingbird harvesting. |
| 391 | NEW | missing | 267;165;124 | none | none | none | none | none | none | none | E-AUDIT-391 | M7 | Resolve Endeavour field upgrades. |
| 392 | NEW | missing | 401 | none | none | none | none | none | none | none | E-AUDIT-392 | M7 | Apply Starlight mission bonuses. |
| 393 | NEW | missing | 401 | none | none | none | none | none | none | none | E-AUDIT-393 | M7 | Apply Hummingbird mission bonuses. |
| 394 | NEW | missing | 261;466 | none | none | none | none | none | none | none | E-AUDIT-394 | M7 | Resolve Pallas boarding support. |
| 395 | NEW | missing | 272;466 | none | none | none | none | none | none | none | E-AUDIT-395 | M7 | Resolve Chepu boarding support. |
| 396 | NEW | missing | 262;182 | none | none | none | none | none | none | none | E-AUDIT-396 | M7 | Resolve Alpha and Bravo fighter state. |
| 397 | NEW | missing | 264;182 | none | none | none | none | none | none | none | E-AUDIT-397 | M7 | Resolve Maliades state. |
| 398 | NEW | missing | 273;182 | none | none | none | none | none | none | none | E-AUDIT-398 | M7 | Resolve the PDF Escort Wing state. |
| 399 | NEW | missing | 253;164 | none | none | none | none | none | none | none | E-AUDIT-399 | M7 | Resolve Macaw movement and cargo. |
| 400 | NEW | missing | 253;164 | none | none | none | none | none | none | none | E-AUDIT-400 | M7 | Resolve Boa movement and cargo. |
| 401 | NEW | missing | 315;361 | none | none | none | none | none | none | none | E-AUDIT-401 | M7 | Validate mission eligibility and leader. |
| 402 | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Build the mission deck. |
| 403 | NEW | missing | 402 | none | none | none | none | none | none | none | E-AUDIT-403 | M7 | Deal private initial cards. |
| 404 | NEW | missing | 403 | none | none | none | none | none | none | none | E-AUDIT-404 | M7 | Let the leader distribute extra cards blindly. |
| 405 | NEW | missing | 403 | none | none | none | none | none | none | none | E-AUDIT-405 | M7 | Accept private card requests. |
| 406 | NEW | missing | 403 | none | none | none | none | none | none | none | E-AUDIT-406 | M7 | Resolve each private discard. |
| 407 | NEW | missing | 403;405 | none | none | none | none | none | none | none | E-AUDIT-407 | M7 | Assign cards to opportunities. |
| 408 | NEW | missing | 402 | none | none | none | none | none | none | none | E-AUDIT-408 | M7 | Add facilitator cards. |
| 409 | NEW | missing | 407;408 | none | none | none | none | none | none | none | E-AUDIT-409 | M7 | Calculate opportunity totals. |
| 410 | NEW | missing | 409 | none | none | none | none | none | none | none | E-AUDIT-410 | M7 | Apply only contribution-linked bonuses. |
| 411 | NEW | missing | 409 | none | none | none | none | none | none | none | E-AUDIT-411 | M7 | Fail empty opportunities. |
| 412 | NEW | missing | 409 | none | none | none | none | none | none | none | E-AUDIT-412 | M7 | Resolve critical success separately. |
| 413 | NEW | missing | 409 | none | none | none | none | none | none | none | E-AUDIT-413 | M7 | Place rewards in Mission Leader custody. |
| 414 | NEW | missing | 409 | none | none | none | none | none | none | none | E-AUDIT-414 | M7 | Preserve mission overruns. |
| 415 | NEW | missing | 413 | none | none | none | none | none | none | none | E-AUDIT-415 | M7 | Drop off oversized rewards. |
| 416 | NEW | missing | 281;283 | none | none | none | none | none | none | none | E-AUDIT-416 | M7 | Encode Lichen-Covered Asteroids A. |
| 416a | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Ice Asteroids B. |
| 416b | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Rare Element Moon C. |
| 417 | NEW | missing | 281;283 | none | none | none | none | none | none | none | E-AUDIT-417 | M7 | Encode Abandoned Explorer Outpost D. |
| 417a | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Athena Survivors E. |
| 417b | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Abandoned Refuelling Station F. |
| 418 | NEW | missing | 281;283 | none | none | none | none | none | none | none | E-AUDIT-418 | M7 | Encode Level 5 Survivable Planet G. |
| 418a | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Derelict Research Vessel H. |
| 418b | NEW | missing | none | none | none | none | none | none | none | none | none | M7 | Encode Ion Nebula I. |
| 419 | NEW | missing | 281;283 | none | none | none | none | none | none | none | E-AUDIT-419 | M7 | Encode Unstable Star J. |
| 420 | NEW | missing | 281;283 | none | none | none | none | none | none | none | E-AUDIT-420 | M7 | Encode Wolf Supply Outpost K. |
| 421 | NEW | missing | 281;283 | none | none | none | none | none | none | none | E-AUDIT-421 | M7 | Encode Active Wolf Outpost L. |
| 421a | NEW | missing | 281;283 | none | none | none | none | none | none | none | E-AUDIT-421A | M7 | Encode Active Wolf Fortress M. |
| 422 | PROVE | missing | 401;409;415;410;411;412;414;622 | none | none | none | none | none | none | none | E-AUDIT-422 | M7 | Run the complete away-mission scenario. |
| 423 | PROVE | missing | 361;367;371;373;352;353;368;377;156;380 | none | none | none | none | none | none | none | E-AUDIT-423 | M7;M6 | Run the shuttle-airspace scenario. |
| 424 | PROVE | missing | 336;337;328;347;338;339;343;401;409;307 | none | none | none | none | none | none | none | E-AUDIT-424 | M7;M8 | Run the split-fleet exploration scenario. |
| 425 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Define the Wolf ship catalog. |
| 426 | NEW | missing | 425 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-426 | M9 | Define attack-composition rules. |
| 427 | NEW | missing | 426 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-427 | M9 | Prepare an attack privately from the GM console. |
| 428 | NEW | missing | 425;426 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-428 | M9 | Centralize combat math and randomness. |
| 429 | NEW | missing | 425;428 | none | none | none | none | none | none | none | E-AUDIT-429 | M9 | Encode base targeting. |
| 430 | NEW | missing | 425;428 | none | none | none | none | none | none | none | E-AUDIT-430 | M9 | Encode expansion targeting. |
| 431 | NEW | missing | 425;428 | none | none | none | none | none | none | none | E-AUDIT-431 | M9 | Resolve target-number wraparound. |
| 432 | NEW | missing | 427;428 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-432 | M9 | Declare the attack atomically. |
| 432a | EXTEND | missing | 432 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-432A | M9 | Operate the attack from the GM console. |
| 433 | NEW | missing | 432 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-433 | M9 | Project attack state by audience. |
| 433a | NEW | missing | 432;433 | none | none | none | none | WOLF-ATTACK;ATTACK-DRADIS | none | none | E-WOLF;E-ATTACK-DRADIS;E-AUDIT-433A | M9 | Publish a stable DRADIS-ready attack contract. |
| 433b | EXTEND | missing | 433 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-433B | M9 | Resolve choices in affected player consoles. |
| 434 | NEW | missing | 432 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-434 | M9 | Make attack commands retry-safe. |
| 434a | EXTEND | missing | 432a;434 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-434A | M9 | Intervene and recover safely during an attack. |
| 435 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF | M9 | Resolve Wolf Commander target rerolls. |
| 436 | NEW | missing | none | none | none | none | none | WOLF-ATTACK | none | 435 | E-436;E-WOLF | M9 | Resolve AEGIS Command and Control. |
| 437 | NEW | missing | 426;428;240 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-437 | M9 | Lock Gorgoneion Force Field timing. |
| 438 | NEW | missing | 432;428 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-438 | M9 | Resolve Long Range simultaneously. |
| 439 | NEW | missing | 432;428 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-439 | M9 | Resolve Medium Range simultaneously. |
| 440 | NEW | missing | 432;428 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-440 | M9 | Resolve Short Range simultaneously. |
| 441 | NEW | missing | 438;439;440 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-441 | M9 | Enforce the five-step attack order. |
| 442 | NEW | missing | 438;439;440;130 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-442 | M9 | Apply range-specific destruction effects. |
| 443 | NEW | missing | 440;396 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-443 | M9 | Enforce Short Range fighter priority. |
| 444 | NEW | missing | 441;442 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-444 | M9 | Close each range with an audit result. |
| 445 | NEW | missing | 441;182 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-445 | M9 | Resolve AEGIS Missile Launchers at Long Range. |
| 446 | NEW | missing | 445 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-446 | M9 | Spend ore on enriched warheads. |
| 447 | NEW | missing | 441;182 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-447 | M9 | Resolve AEGIS Missile Launchers at Medium Range. |
| 448 | NEW | missing | 441;182 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-448 | M9 | Resolve AEGIS Point Defence. |
| 449 | NEW | missing | 443;396 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-449 | M9 | Authorize Fighter Bay launches. |
| 450 | NEW | missing | 449 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-450 | M9 | Shift targets with fleet fighters. |
| 451 | NEW | missing | 449 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-451 | M9 | Attack at Medium Range with fleet fighters. |
| 452 | NEW | missing | 449 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-452 | M9 | Attack at Short Range with fleet fighters. |
| 453 | NEW | missing | 264;397 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-453 | M9 | Resolve Maliades at range. |
| 454 | NEW | missing | 265 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-454 | M9 | Resolve Highwall at range. |
| 455 | NEW | missing | 239;441 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-455 | M9 | Resolve the Gorgoneion Missile Array. |
| 456 | NEW | missing | 273;449 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-456 | M9 | Launch the PDF Fighter Wing. |
| 457 | NEW | missing | 456 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-457 | M9 | Resolve PDF fighters at Medium Range. |
| 458 | NEW | missing | 456 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-458 | M9 | Resolve PDF fighters at Short Range. |
| 459 | NEW | missing | 400;441 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-459 | M9 | Resolve Boa's range actions. |
| 460 | NEW | missing | 399;466 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-460 | M9 | Apply Macaw boarding support. |
| 461 | NEW | missing | 261;272;363 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-461 | M9 | Relocate Pallas or Chepu before boarding. |
| 462 | NEW | missing | 361;386 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-462 | M9 | Apply engineering/service shuttle support. |
| 463 | NEW | missing | 394;395;428 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-463 | M9 | Apply AEGIS and Pallas boarding rerolls. |
| 464 | DECISION | missing | 435;466 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-464 | M9 | Apply Wolf Commander boarding leadership. |
| 465 | NEW | missing | 426;428 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-465 | M9 | Drop Assault Transport parties. |
| 466 | NEW | missing | 378;465 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-466 | M9 | Roll security-team defence. |
| 467 | NEW | missing | 466 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-467 | M9 | Apply surviving-boarder damage. |
| 468 | NEW | missing | 466;280 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-468 | M9 | Resolve Militia Leader defence. |
| 469 | NEW | missing | 442 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-469 | M9 | Resolve Wolf Fighter Wing destruction. |
| 469a | NEW | missing | 442 | none | none | none | none | none | none | none | E-AUDIT-469A | M9 | Resolve Assault Transport destruction. |
| 469b | NEW | missing | 442 | none | none | none | none | none | none | none | E-AUDIT-469B | M9 | Resolve Wolf Destroyer destruction. |
| 469c | NEW | missing | 442 | none | none | none | none | none | none | none | E-AUDIT-469C | M9 | Resolve Wolf Cruiser destruction. |
| 469d | NEW | missing | 442 | none | none | none | none | none | none | none | E-AUDIT-469D | M9 | Resolve Strikecarrier destruction. |
| 469e | NEW | missing | 442 | none | none | none | none | none | none | none | E-AUDIT-469E | M9 | Resolve Battlestation destruction. |
| 470 | NEW | missing | 469 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-470 | M9 | Carry surviving Wolf Fighter Wings forward. |
| 471 | NEW | missing | 469e;442 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-471 | M9 | Enforce Battlestation Short Range immunity. |
| 472 | NEW | missing | 469d;470 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-472 | M9 | Apply Strikecarrier wing bonus. |
| 473 | NEW | missing | 469;130 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-473 | M9 | Apply surviving Wolf ship damage. |
| 474 | EXTEND | missing | 444;473 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-474 | M9 | Publish the immediate attack result. |
| 475 | EXTEND | missing | 130 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-475 | M9 | Reuse the common damage draw path. |
| 476 | EXTEND | missing | 475 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-476 | M9 | Destroy a ship on combat deck exhaustion. |
| 477 | EXTEND | missing | 466;467 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-477 | M9 | Apply combat casualties. |
| 478 | NEW | missing | 477;280 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-478 | M9 | Apply Doctor casualty mitigation. |
| 479 | NEW | missing | 242;477 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-479 | M9 | Resolve Warrior post-attack salvage. |
| 480 | NEW | missing | 253;477 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-480 | M9 | Resolve Capybara post-attack Scrap. |
| 481 | NEW | missing | 399;400;480 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-481 | M9 | Collect Scrap with Macaw or Boa. |
| 482 | EXTEND | missing | 475 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-482 | M9 | Resolve post-attack repairs. |
| 483 | NEW | missing | 178;469;396 | none | none | none | none | none | none | none | E-AUDIT-483 | M9 | Rebuild fighters after combat. |
| 484 | EXTEND | missing | 474;477;482 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-484 | M9 | Publish the complete aftermath. |
| 485 | REPAIR | missing | 077 | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE;E-AUDIT-485 | M10 | Make pursuit authoritative from Turn 1. |
| 485a | REPAIR | missing | 485 | none | none | none | none | PRESENTATION-INDEPENDENT | none | none | E-PRESENTATION;E-AUDIT-485A | M10 | Restore alert-scoped Pursuit Track color. |
| 486 | PROVE | missing | 485;305 | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE;E-AUDIT-486 | M10 | Verify the per-turn pursuit rise. |
| 487 | PROVE | missing | 485;306 | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE;E-AUDIT-487 | M10 | Verify jump-based pursuit reduction. |
| 488 | PROVE | missing | 485;306 | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE;E-AUDIT-488 | M10 | Verify Ion Nebula threat suppression. |
| 489 | PROVE | missing | 485;306 | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE;E-AUDIT-489 | M10 | Verify the Level 5 Planet exception. |
| 490 | NEW | missing | 485;307 | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE;E-AUDIT-490 | M10 | Preserve independent split-group threat. |
| 491 | NEW | missing | 312 | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE;E-AUDIT-491 | M10 | Trigger Active Wolf Outpost attacks. |
| 492 | NEW | missing | 312 | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE;E-AUDIT-492 | M10 | Trigger Active Wolf Fortress attacks. |
| 493 | NEW | missing | 312 | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE;E-AUDIT-493 | M10 | Trigger Ancient Space Station attacks. |
| 494 | NEW | missing | 425;435 | none | none | none | none | ATTACK-PRESSURE | none | none | E-ATTACK-PRESSURE;E-AUDIT-494 | M10 | Resolve the Wolf Commander attack dial. |
| 495 | NEW | done | none | none | none | none | none | none | none | none | E-495-VERIFIED | M10 | Assign hidden loyalties authoritatively. |
| 496 | REPAIR | missing | none | none | none | none | none | none | none | none | none | M10 | Enforce the server-derived Wolf count. |
| 497 | NEW | missing | 495;496 | none | none | none | none | none | none | none | E-AUDIT-497 | M10 | Authorize one Wolf action per turn. |
| 498 | NEW | missing | 497 | none | none | none | none | none | none | none | E-AUDIT-498 | M10 | Resolve console sabotage. |
| 499 | NEW | missing | 497;111 | none | none | none | none | none | none | none | E-AUDIT-499 | M10 | Resolve supply sabotage. |
| 500 | NEW | missing | 497 | none | none | none | none | none | none | none | E-AUDIT-500 | M10 | Resolve a homing beacon. |
| 501 | NEW | missing | 497 | none | none | none | none | none | none | none | E-AUDIT-501 | M10 | Send Wolf intelligence privately. |
| 502 | NEW | missing | 497 | none | none | none | none | none | none | none | E-AUDIT-502 | M10 | Resolve suspicion and clue rolls. |
| 503 | NEW | missing | 497;167 | none | none | none | none | none | none | none | E-AUDIT-503 | M10 | Deliver Wolf action receipts by audience. |
| 503a | NEW | missing | 497;498 | none | none | none | none | none | none | none | E-AUDIT-503A | M10 | Trigger the hacking overlay from authority. |
| 504 | PROVE | missing | 502;503 | none | none | none | none | none | none | none | E-AUDIT-504 | M10 | Audit suspicion history privately. |
| 505 | NEW | missing | 280;501 | none | none | none | none | none | none | none | E-AUDIT-505 | M10 | Investigate as the Intelligence Agent. |
| 506 | PROVE | missing | 505;428 | none | none | none | none | none | none | none | E-AUDIT-506 | M10 | Prove investigation randomness ownership. |
| 507 | NEW | missing | 505;502 | none | none | none | none | none | none | none | E-AUDIT-507 | M10 | Apply Intelligence Agent suspicion. |
| 508 | NEW | missing | 214;506 | none | none | none | none | none | none | none | E-AUDIT-508 | M10 | Test with the Wolf Agent Detector. |
| 509 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Publish Android proof. |
| 510 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Reveal Friend trust privately. |
| 511 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Deliver Universal Arbour visions. |
| 512 | NEW | missing | none | none | none | none | none | none | none | none | none | M10 | Deliver Wolf Cult intelligence. |
| 513 | NEW | missing | 497 | none | none | none | none | none | none | none | E-AUDIT-513 | M10 | Calculate arrest posse size privately. |
| 514 | NEW | missing | 513;098 | none | none | none | none | none | none | none | E-AUDIT-514 | M10 | Resolve arrest and its deadline. |
| 515 | NEW | missing | 060;062 | none | none | none | none | none | none | none | E-AUDIT-515 | M10 | Assign a replacement role. |
| 516 | NEW | missing | 515;326 | none | none | none | none | none | none | none | E-AUDIT-516 | M10 | Activate the Comms Officer. |
| 517 | NEW | missing | 515;190 | none | none | none | none | none | none | none | E-AUDIT-517 | M10 | Activate the VIP Host. |
| 518 | NEW | missing | 515 | none | none | none | none | none | none | none | E-AUDIT-518 | M10 | Activate the Commissar. |
| 519 | NEW | missing | 515;468 | none | none | none | none | none | none | none | E-AUDIT-519 | M10 | Activate the Militia Leader. |
| 520 | NEW | missing | 515;456 | none | none | none | none | none | none | none | E-AUDIT-520 | M10 | Activate the PDF Fighter Ace. |
| 521 | NEW | missing | 515;494 | none | none | none | none | none | none | none | E-AUDIT-521 | M10 | Complete Wolf Commander powers. |
| 521a | NEW | missing | 521 | none | none | none | none | none | none | none | E-AUDIT-521A | M10 | Resolve the Wolf Commander address. |
| 521b | DECISION | missing | 521a | none | none | none | none | none | none | none | E-AUDIT-521B | M10 | Resolve Wolf Commander amnesty. |
| 522 | REPAIR | missing | 044;045 | none | none | none | none | none | none | none | E-AUDIT-522 | M10 | Model one-facilitator ownership with optional GM lanes. |
| 523 | DECISION | missing | 522;167 | none | none | none | none | none | none | none | E-AUDIT-523 | M10 | Record facilitator rule calls. |
| 523a | DECISION | missing | 522 | none | none | none | none | none | none | none | E-AUDIT-523A | M10 | Configure Wolf Attack difficulty. |
| 523b | DECISION | missing | 522 | none | none | none | none | none | none | none | E-AUDIT-523B | M10 | Configure Crisis difficulty. |
| 523c | DECISION | missing | 522 | none | none | none | none | none | none | none | E-AUDIT-523C | M10 | Configure emergency-jump severity. |
| 524 | PROVE | missing | 485;497;522 | none | none | none | none | none | none | none | E-AUDIT-524 | M10 | Run the complete Wolf-and-deduction scenario. |
| 524a | NEW | missing | 193b | none | none | none | none | none | none | none | E-AUDIT-524A | M10 | Track political capital. |
| 524b | NEW | missing | 524a | none | none | none | none | none | none | none | E-AUDIT-524B | M10 | Resolve the President's address. |
| 524c | NEW | missing | 524b | none | none | none | none | none | none | none | E-AUDIT-524C | M10 | Resolve a presidential visit. |
| 524d | NEW | missing | 524c;044 | none | none | none | none | none | none | none | E-AUDIT-524D | M10 | Enforce presidential authority boundaries. |
| 525 | NEW | missing | 008;522 | none | none | none | none | none | none | none | E-AUDIT-525 | M3;M11;M12 | Create the crisis state machine. |
| 526 | NEW | missing | 525 | none | none | none | none | none | none | none | E-AUDIT-526 | M3;M11;M12 | Gate crises by configuration. |
| 527 | NEW | missing | 525 | none | none | none | none | none | none | none | E-AUDIT-527 | M3;M11;M12 | Deliver Approaching Vessel. |
| 528 | DECISION | missing | 527 | none | none | none | none | none | none | none | E-AUDIT-528 | M3;M11;M12 | Resolve Approaching Vessel choices. |
| 529 | NEW | missing | 249;527 | none | none | none | none | none | none | none | E-AUDIT-529 | M3;M11;M12 | Integrate Voyage 33-0 arrival. |
| 530 | NEW | missing | 525 | none | none | none | none | none | none | none | E-AUDIT-530 | M3;M11;M12 | Deliver Disease Outbreak. |
| 531 | NEW | missing | 530;149 | none | none | none | none | none | none | none | E-AUDIT-531 | M3;M11;M12 | Resolve quarantine policy. |
| 532 | NEW | missing | 525 | none | none | none | none | none | none | none | E-AUDIT-532 | M3;M11;M12 | Deliver Religious Zealotry. |
| 533 | DECISION | missing | 532 | none | none | none | none | none | none | none | E-AUDIT-533 | M3;M11;M12 | Resolve zealotry responses. |
| 534 | NEW | missing | 525 | none | none | none | none | none | none | none | E-AUDIT-534 | M3;M11;M12 | Deliver Civil Unrest. |
| 535 | DECISION | missing | 534 | none | none | none | none | none | none | none | E-AUDIT-535 | M3;M11;M12 | Resolve Civil Unrest. |
| 536 | NEW | missing | 525 | none | none | none | none | none | none | none | E-AUDIT-536 | M3;M11;M12 | Deliver Presidential Election. |
| 537 | DECISION | missing | 536 | none | none | none | none | none | none | none | E-AUDIT-537 | M3;M11;M12 | Configure election procedure. |
| 538 | NEW | missing | 537 | none | none | none | none | none | none | none | E-AUDIT-538 | M3;M11;M12 | Resolve the election privately. |
| 539 | NEW | missing | 538;101 | none | none | none | none | none | none | none | E-AUDIT-539 | M3;M11;M12 | Announce binding resolutions at Team start. |
| 540 | PROVE | missing | 525;528;531;533;535;538 | none | none | none | none | none | none | none | E-AUDIT-540 | M3;M11;M12 | Run the full crisis scenario. |
| 541 | NEW | missing | 318;525 | none | none | none | none | none | none | none | E-AUDIT-541 | M3;M11;M13 | Reveal a New Eden candidate. |
| 542 | NEW | missing | 541 | none | none | none | none | none | none | none | E-AUDIT-542 | M3;M11;M13 | Make candidate discovery retry-safe. |
| 543 | NEW | missing | 541;319 | none | none | none | none | none | none | none | E-AUDIT-543 | M3;M11;M13 | Track candidate plans by Turn 6. |
| 544 | NEW | missing | 541 | none | none | none | none | none | none | none | E-AUDIT-544 | M3;M11;M13 | Validate Ancient Jump Ring prerequisites. |
| 545 | NEW | missing | 544;211;361;111 | none | none | none | none | none | none | none | E-AUDIT-545 | M3;M11;M13 | Repair the Ancient Jump Ring. |
| 546 | NEW | missing | 545 | none | none | none | none | none | none | none | E-AUDIT-546 | M3;M11;M13 | Prevent duplicate Ring contributions. |
| 547 | NEW | missing | 545;111 | none | none | none | none | none | none | none | E-AUDIT-547 | M3;M11;M13 | Fuel each Ring passage. |
| 548 | NEW | missing | 546;547 | none | none | none | none | none | none | none | E-AUDIT-548 | M3;M11;M13 | Resolve Ring passage. |
| 549 | NEW | missing | 548;485 | none | none | none | none | none | none | none | E-AUDIT-549 | M3;M11;M13 | Record blocked Wolf pursuit through the Ring. |
| 550 | NEW | missing | 328;332 | none | none | none | none | none | none | none | E-AUDIT-550 | M3;M11;M13 | Accumulate Deep Nebula scouting. |
| 551 | NEW | missing | 550;287-304 | none | none | none | none | none | none | none | E-AUDIT-551 | M3;M11;M13 | Attempt a Deep Nebula jump. |
| 552 | NEW | missing | 551;140d | none | none | none | none | none | none | none | E-AUDIT-552 | M3;M11;M13 | Lose a ship in the Deep Nebula. |
| 553 | DECISION | missing | 551;552 | none | none | none | none | none | none | none | E-AUDIT-553 | M3;M11;M13 | Reach the Deep Nebula threshold. |
| 554 | NEW | missing | 551;553 | none | none | none | none | none | none | none | E-AUDIT-554 | M3;M11;M13 | Prevent repeat Nebula attempts. |
| 555 | NEW | missing | 493;432 | none | none | none | none | none | none | none | E-AUDIT-555 | M3;M11;M13 | Trigger Ancient Space Station arrival combat. |
| 556 | NEW | missing | 555 | none | none | none | none | none | none | none | E-AUDIT-556 | M3;M11;M13 | Repeat Station combat while Wolves survive. |
| 557 | NEW | missing | 556 | none | none | none | none | none | none | none | E-AUDIT-557 | M3;M11;M13 | Liberate the Ancient Space Station. |
| 558 | NEW | missing | 557 | none | none | none | none | none | none | none | E-AUDIT-558 | M3;M11;M13 | Validate Station Reactor contributions. |
| 559 | NEW | missing | 558 | none | none | none | none | none | none | none | E-AUDIT-559 | M3;M11;M13 | Power New Eden Station. |
| 560 | NEW | missing | 105 | none | none | none | none | none | none | none | E-AUDIT-560 | M3;M11;M13 | Freeze play at pursuit failure. |
| 561 | NEW | missing | 560 | none | none | none | none | none | none | none | E-AUDIT-561 | M3;M11;M13 | Distinguish total fleet loss. |
| 562 | NEW | missing | 561;140e | none | none | none | none | none | none | none | E-AUDIT-562 | M3;M11;M13 | Aggregate real survivor outcomes. |
| 563 | NEW | missing | 562;541 | none | none | none | none | none | none | none | E-AUDIT-563 | M3;M11;M13 | Explain candidate results. |
| 564 | NEW | missing | 563 | none | none | none | none | none | none | none | E-AUDIT-564 | M3;M11;M13 | Enter debrief once. |
| 565 | NEW | missing | 560;564 | none | none | none | none | none | none | none | E-AUDIT-565 | M3;M11;M13 | Close the session authoritatively. |
| 566 | NEW | missing | 565 | none | none | none | none | none | none | none | E-AUDIT-566 | M3;M11;M13 | Read debrief after closure. |
| 567 | PROVE | missing | 252 | none | none | none | none | none | none | none | E-AUDIT-567 | M3;M11 | Reverify Capybara mode selection. |
| 568 | NEW | missing | 163;567 | none | none | none | none | none | none | none | E-AUDIT-568 | M3;M11 | Isolate Scrap reads and writes. |
| 569 | NEW | missing | 567;253 | none | none | none | none | none | none | none | E-AUDIT-569 | M3;M11 | Cast Capybara Captain and Recycler. |
| 570 | NEW | missing | 569 | none | none | none | none | none | none | none | E-AUDIT-570 | M3;M11 | Apply d8 Capybara targeting. |
| 571 | PROVE | missing | 114;253;569 | none | none | none | none | none | none | none | E-AUDIT-571 | M3;M11 | Run full Capybara maintenance. |
| 572 | NEW | missing | 571 | none | none | none | none | none | none | none | E-AUDIT-572 | M3;M11 | Resolve Capybara population thresholds. |
| 573 | DECISION | missing | 571;130 | none | none | none | none | none | none | none | E-AUDIT-573 | M3;M11 | Resolve Capybara damage cards. |
| 574 | NEW | missing | 369;399 | none | none | none | none | none | none | none | E-AUDIT-574 | M3;M11 | Resolve Macaw refuelling. |
| 575 | NEW | missing | 399 | none | none | none | none | none | none | none | E-AUDIT-575 | M3;M11 | Resolve Macaw repairs. |
| 576 | DECISION | missing | 385;575 | none | none | none | none | none | none | none | E-AUDIT-576 | M3;M11 | Resolve Macaw salvage dismantling. |
| 577 | NEW | missing | 164;377;399 | none | none | none | none | none | none | none | E-AUDIT-577 | M3;M11 | Resolve Macaw cargo. |
| 578 | NEW | missing | 400 | none | none | none | none | none | none | none | E-AUDIT-578 | M3;M11 | Resolve Boa recycling. |
| 579 | NEW | missing | 578 | none | none | none | none | none | none | none | E-AUDIT-579 | M3;M11 | Resolve Boa reclamation. |
| 580 | DECISION | missing | 459;578 | none | none | none | none | none | none | none | E-AUDIT-580 | M3;M11 | Resolve Boa combat ambiguity. |
| 581 | NEW | missing | 573;577 | none | none | none | none | none | none | none | E-AUDIT-581 | M3;M11 | Create post-damage Scrap pickups. |
| 582 | NEW | missing | 569;006 | none | none | none | none | none | none | none | E-AUDIT-582 | M3;M11 | Expose Capybara objectives privately. |
| 583 | DECISION | missing | 234a;569 | none | none | none | none | none | none | none | E-AUDIT-583 | M3;M11 | Apply the Capybara balance dial. |
| 584 | PROVE | missing | 567;571;577;580 | none | none | none | none | none | none | none | E-AUDIT-584 | M3;M11 | Run the Capybara vertical scenario. |
| 585 | PROVE | missing | 567;584 | none | none | none | none | none | none | none | E-AUDIT-585 | M3;M11 | Run the base/expansion isolation scenario. |
| 586 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Build the roster configuration flow. |
| 587 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Present private casting assignments. |
| 588 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Present private loyalty assignment. |
| 589 | EXTEND | missing | 586 | none | none | none | none | none | none | none | E-AUDIT-589 | X | Teach the table ground rules. |
| 589a | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Audit the motion-safety gate. |
| 589b | REPAIR | missing | none | none | none | none | none | PRESENTATION-INDEPENDENT | none | none | E-PRESENTATION | X | Simplify the authenticated-session waiver's human-first copy. |
| 590 | EXTEND | missing | 589 | none | none | none | none | none | none | none | E-AUDIT-590 | X | Teach the core game loop. |
| 591 | EXTEND | missing | 161;162;114 | none | none | none | none | none | none | none | E-AUDIT-591 | X | Show vessel-specific maintenance help. |
| 592 | EXTEND | missing | 361 | none | none | none | none | none | none | none | E-AUDIT-592 | X | Show craft-specific help. |
| 593 | EXTEND | missing | 541 | none | none | none | none | none | none | none | E-AUDIT-593 | X | Show candidate preparation help. |
| 594 | EXTEND | missing | 168 | none | none | none | none | none | none | none | E-AUDIT-594 | X | Label facilitator decisions. |
| 595 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Display the derived application version. |
| 596 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Display bounded changelog history. |
| 597 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Complete exact disconnect confirmation. |
| 598 | REPAIR | partial | 041;042 | none | none | none | none | none | none | none | E-AUDIT-598 | X | Explain connectivity truthfully. |
| 599 | EXTEND | missing | 586;589 | none | none | none | none | none | none | none | E-AUDIT-599 | X | Build the single-facilitator setup checklist. |
| 600 | PROVE | missing | 590;599 | none | none | none | none | none | none | none | E-AUDIT-600 | X | Run the onboarding-to-first-action scenario. |
| 601 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Make primary status universal. |
| 602 | PROVE | partial | none | none | none | none | 602a:green | RETURN-REPAIR | none | none | E-602-CLOSURE;E-RETURN-REPAIR-SEQUENCE | X | Prove return navigation everywhere. |
| 602a | REPAIR | missing | none | none | AUTHORITATIVE-SHUTTLE-ASSOCIATION;CONSOLE-ROUTE-ENTITLEMENT | none | none | RETURN-REPAIR | none | none | E-602A;E-RETURN-REPAIR-SEQUENCE | X | Restore shuttle-to-associated-ship return navigation. |
| 603 | EXTEND | missing | 361 | none | none | none | none | none | none | none | E-AUDIT-603 | X | Make ship consoles work on narrow phones. |
| 603a | REPAIR | done | none | none | SHARED-SESSION-CHROME;ROLE-SELECT | none | none | TICKER-LIFECYCLE | none | none | E-603A;E-TICKER | X | Keep the mobile session ticket out of routed content. |
| 604 | EXTEND | missing | 603 | none | none | none | none | none | none | none | E-AUDIT-604 | X | Make maintenance work in short landscape. |
| 605 | EXTEND | partial | 351 | none | none | none | none | none | none | none | E-AUDIT-605 | X | Make DRADIS responsive. |
| 605a | DEFERRED-OWNER | missing | 433a | none | none | OWNER-APPROVAL-DEFERRED-VISUALIZATION | none | ATTACK-DRADIS | none | none | E-605A;E-ATTACK-DRADIS | X | Visualize Wolf attacks on DRADIS. |
| 606 | EXTEND | missing | 361;365;367 | none | none | none | none | none | none | none | E-AUDIT-606 | X | Make shuttle travel touch-operable. |
| 607 | EXTEND | missing | 289;303 | none | none | none | none | none | none | none | E-AUDIT-607 | X | Make jump controls keyboard-complete. |
| 608 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Own dialog focus correctly. |
| 609 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Announce live changes once. |
| 610 | EXTEND | missing | 589a | none | none | none | none | none | none | none | E-AUDIT-610 | X | Honor reduced motion globally. |
| 611 | EXTEND | missing | 601 | none | none | none | none | PRESENTATION-INDEPENDENT | none | none | E-PRESENTATION;E-AUDIT-611 | X | Distinguish status without color alone. |
| 611a | REPAIR | missing | none | none | none | none | none | PRESENTATION-INDEPENDENT | none | none | E-PRESENTATION | X | Repair CIC status typography without redesign. |
| 612 | PRESERVE | missing | 088;089 | none | none | none | none | none | none | none | E-AUDIT-612 | X | Render a persisted snapshot before resume. |
| 613 | PRESERVE | missing | 612 | none | none | none | none | none | none | none | E-AUDIT-613 | X | Clear invalid persisted sessions. |
| 614 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | X | Reconcile presence leases under load. |
| 615 | PRESERVE | missing | 034;612 | none | none | none | none | none | none | none | E-AUDIT-615 | X | Reclaim returning seats safely. |
| 616 | PRESERVE | missing | 041;042 | none | none | none | none | none | none | none | E-AUDIT-616 | X | Make disconnect replay-safe. |
| 617 | PRESERVE | missing | 012;089 | none | none | none | none | none | none | none | E-AUDIT-617 | X | Reconcile the command outbox. |
| 618 | EXTEND | missing | 084;085;086;612 | none | none | none | none | none | none | none | E-AUDIT-618 | X | Reconnect every live projection. |
| 619 | EXTEND | missing | 542;612 | none | none | none | none | none | none | none | E-AUDIT-619 | X | Make candidate retries survive reconnect. |
| 620 | EXTEND | missing | 014;088 | none | none | none | none | none | none | none | E-AUDIT-620 | X | Recover from stale revisions. |
| 621 | EXTEND | missing | 433;434;612 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-621 | X;M9 | Recover during a Wolf attack. |
| 622 | EXTEND | missing | 401;402;612 | none | none | none | none | none | none | none | E-AUDIT-622 | X | Recover during an away mission. |
| 623 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Preserve PWA deep links. |
| 624 | EXTEND | missing | 623 | none | none | none | none | none | none | none | E-AUDIT-624 | X | Update the service worker safely. |
| 625 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Enforce App Check on mutations. |
| 626 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Deny unauthenticated and nonmember reads. |
| 627 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Deny all direct gameplay writes. |
| 628 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Enforce GM-instance authority everywhere. |
| 629 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Protect private projections comprehensively. |
| 630 | PROVE | missing | 007;019;428 | none | none | none | none | none | none | none | E-AUDIT-630 | X | Prove server-owned randomness. |
| 631 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Rate-limit expensive callables. |
| 632 | EXTEND | missing | 015 | none | none | none | none | none | none | none | E-AUDIT-632 | X | Reject malformed and oversized payloads. |
| 633 | EXTEND | missing | 012;015 | none | none | none | none | none | none | none | E-AUDIT-633 | X | Return safe retry guidance. |
| 634 | EXTEND | missing | 019;630 | none | none | none | none | none | none | none | E-AUDIT-634 | X | Record security denials privately. |
| 635 | EXTEND | missing | 007;019;167 | none | none | none | none | none | none | none | E-AUDIT-635 | X | Standardize action audit records. |
| 636 | PROVE | missing | 167 | none | none | none | none | none | none | none | E-AUDIT-636 | X | Measure callable and snapshot health. |
| 637 | PROVE | missing | 009 | none | none | none | none | none | none | none | E-AUDIT-637 | X | Establish render-performance baselines. |
| 638 | EXTEND | missing | none | none | none | none | none | none | none | none | none | X | Support and exercise the 20-player core target. |
| 639 | PROVE | missing | 636;638 | none | none | none | none | none | none | none | E-AUDIT-639 | X | Exercise the 60-browser target. |
| 640 | PROVE | missing | 638;639 | none | none | none | none | none | none | none | E-AUDIT-640 | X | Publish capacity conclusions. |
| 641 | PROVE | missing | 159;320;422;524;540 | none | none | none | none | none | none | none | E-AUDIT-641 | M13 | Run a complete base-game playthrough. |
| 642 | PROVE | missing | 584 | none | none | none | none | none | none | none | E-AUDIT-642 | M13 | Run a complete Capybara playthrough. |
| 643 | PROVE | missing | 424 | none | none | none | none | none | none | none | E-AUDIT-643 | M13 | Run a complete split-fleet playthrough. |
| 644 | PROVE | missing | 423 | none | none | none | none | none | none | none | E-AUDIT-644 | M13 | Run a complete shuttle-airspace playthrough. |
| 645 | PROVE | missing | 524;484 | none | none | none | none | WOLF-ATTACK | none | none | E-WOLF;E-AUDIT-645 | M13;M9 | Run a complete Wolf attack playthrough. |
| 646 | PROVE | missing | 422 | none | none | none | none | none | none | none | E-AUDIT-646 | M13 | Run a complete away-mission playthrough. |
| 647 | PROVE | missing | 548;559 | none | none | none | none | none | none | none | E-AUDIT-647 | M13 | Prove Ancient Jump Ring success. |
| 648 | PROVE | missing | 554 | none | none | none | none | none | none | none | E-AUDIT-648 | M13 | Prove Deep Nebula success and loss. |
| 649 | PROVE | missing | 559 | none | none | none | none | none | none | none | E-AUDIT-649 | M13 | Prove Ancient Space Station success. |
| 650 | PROVE | missing | 560;565;621;622;140c;136;514 | none | none | none | none | none | none | none | E-AUDIT-650 | M13 | Prove authoritative terminal failure and recovery paths. |
| 651 | PROVE | missing | 641-650 | none | none | none | none | none | none | none | E-AUDIT-651 | M13 | Run the final release-readiness audit. |
| 652 | EXTEND | done | 106c | none | none | none | none | TICKER-LIFECYCLE | none | none | E-TICKER;E-AUDIT-652 | none | Prevent FleetTicker messages from overlapping. |
| 652a | REPAIR | done | 106c;652 | none | none | none | none | TICKER-LIFECYCLE | none | none | E-TICKER;E-AUDIT-652A | none | Keep every moving ticker glyph visible through its real exit. |
| 652b | NEW | done | 106c;603a;652;652a | none | none | none | none | TICKER-LIFECYCLE | none | none | E-TICKER;E-AUDIT-652B | none | Keep the mobile Press ticker pinned with reversible hiding and alert expansion. |
| 653 | EXTEND | missing | none | none | none | none | none | none | none | none | none | none | Remove the ICN/Iris fleet-wide console lock. |
| 654 | REPAIR | missing | none | M1 | none | OWNER-APPROVED-ZERO-ELIGIBLE-WOLF-OUTCOME | none | M1-REPAIR | none | none | E-M1-REPAIR;E-M1-REPAIR-SEQUENCE | M1 | Start production after a confirmed roster without treating unfilled roles as a blocker. |
| 655 | REPAIR | missing | none | none | none | none | none | none | none | none | none | none | Restore the Press evidence-shredder docked-cockpit warning. |
| 656 | REPAIR | done | 034;050 | none | none | none | none | none | none | none | E-AUDIT-656 | none | Route an already-connected launcher to its current session. |
| 657 | REPAIR | missing | none | none | none | none | none | none | none | none | none | none | Remove roadmap jargon from player-facing changelog history and future entries. |
| 658 | POLISH | missing | 030;050 | none | none | none | none | none | none | none | E-AUDIT-658 | none | Use CIC language for seat-change confirmation when the page remains. |
| 659 | PRESERVE | missing | none | none | none | none | none | none | none | none | none | none | Enforce in-universe player-facing copy app-wide. |
| 660 | REPAIR | done | none | none | none | none | none | none | none | none | none | none | Make exact validation self-prepare a collision-safe emulator slot. |
| 661 | POLISH | done | none | none | none | none | none | none | none | none | none | none | Add a safe copy-only validation fast path. |
| 662 | DECISION | missing | none | none | none | OWNER-APPROVED-WOLF-DESIGNATION-POLICY | none | none | none | 054;075;496;586-588 | E-662 | none | Resolve ordinary-start Wolf designation policy. |
| 663 | REPAIR | missing | 106c | none | none | none | none | none | none | none | E-AUDIT-663 | X | Make the AEGIS Fleetwide Red Alert button visible across layouts. |
| 664 | REPAIR | done | 660;661 | none | none | none | none | none | none | none | E-664 | none | Enforce universal roadmap registration before non-documentation commits. |
| 665 | EXTEND | done | 664 | none | none | none | none | none | none | none | E-665 | none | Make session goals durable and machine-checked across coordination lifecycle. |
| 666 | EXTEND | done | 665 | none | none | none | none | none | none | none | E-666 | none | Generate a compact deterministic dependency packet and worktree receipt. |
| 667 | PROVE | missing | 665 | none | none | none | none | none | none | none | E-667 | none | Runtime threat-model rebaseline: session-code compromise and DDoS. |
| 668 | POLISH | missing | none | none | none | none | none | none | none | none | none | none | Render Write Mode Off as a shared button. |
| 669 | POLISH | missing | none | none | none | none | none | none | none | none | none | none | Align the GM DRADIS console with ship-console DRADIS. |
| 670 | REPAIR | missing | 044;045;046 | none | none | none | none | none | none | none | E-670-DEPENDENCIES | none | Allow authorized additional GMs to register from both surfaces. |
| 671 | POLISH | missing | none | none | none | none | none | none | none | 668 | E-671 | none | Align buttons across the fleet and application. |
| 672 | POLISH | missing | 361;367 | none | none | none | none | none | none | none | E-AUDIT-672 | none | Show shuttle docking history in main ship consoles. |
| 673 | POLISH | missing | none | none | none | none | none | none | none | none | none | none | Mirror the galactic orientation compass on the ship navigation jump map. |
| 674 | REPAIR | missing | 048;049;170;628 | none | none | none | none | none | none | none | E-674;E-674-DEPENDENCIES | none | Replace ship Observer roles with unobtrusive GM viewing and confirmed write access. |
| 675 | POLISH | missing | 034;038;040;097;108 | none | none | none | none | none | none | 098 | E-675;E-675-DEPENDENCIES | none | Pause an empty session timer and resume when someone rejoins. |
| 676 | POLISH | missing | none | none | none | none | none | none | none | none | none | none | Render the jump-map scanline beneath map content. |
| 677 | NEW | missing | 084;284;313;330 | none | none | none | none | none | none | 328 | E-677;E-677-DEPENDENCIES | none | Gate jump-map coordinates by ship knowledge and hide location details. |
| 678 | NEW | missing | 328;339;340;677 | none | none | none | none | none | none | 330;331 | E-678;E-678-DEPENDENCIES | none | Transmit scanned system details to all fleet ships or selected ships. |
| 679 | NEW | missing | 281;282;285;294;304;677 | none | none | none | none | none | none | 283;313 | E-679;E-679-DEPENDENCIES | none | Allow blind jumps to a random adjacent system. |
| 680 | POLISH | done | none | none | none | none | none | none | none | 178;262;396;449 | E-680-RELATED | none | Show authoritative live Alpha and Bravo fighter status. |

## Explicit sequence rules

| Rule | Explicit order or meaning | Blocking? | Evidence |
| --- | --- | --- | --- |
| M1-SETUP | Historical order: Prompt 004 -> the separately evidenced 0.3.12 slice (021/030/073) -> the 0.3.13 slice (051/054/075 setup) -> Prompt 020. The current ledger records this sequence as satisfied | No; this historical sequence is context, not a current readiness blocker. | E-M1-SETUP |
| UNIFIED-ENTRY | Prompt 031a follows the current setup/readiness slice and consumes the stable seat claim/release/race/resume contract | No; its named hard prompt/contract fields govern. | E-031A;E-031A-SETUP |
| TICKER-LIFECYCLE | Prompt 106c precedes 652a and 652b; 652a runs alongside the still-open 652 contract; 603a is required before the 652b mobile ticker change; 652b runs only after its listed lifecycle/layout prerequisites | No; only hard fields block. | E-TICKER;E-603A |
| WOLF-ATTACK | 425 -> 426 -> 428 -> 427 -> 432/432a -> 433/433a/433b -> 434/434a -> 435-444 -> 445-473 -> 475-482 -> 474/484 -> 621 -> 645 | No; this is delivery order, not a blanket range dependency. | E-WOLF |
| ATTACK-DRADIS | Stable 433a precedes the DRADIS consumers 351 and 353-360; deferred 605a also waits on 433a and owner approval | No; only 605a hard prompt and owner fields block. | E-ATTACK-DRADIS;E-605A |
| ATTACK-PRESSURE | Prompts 485-494 become authoritative before attack pressure depends on them | No; do not infer a target prompt from this statement. | E-ATTACK-PRESSURE |
| PRESS-DESK | Prompt 275b is a dedicated regression after the current dependency slice and outside release 0.3.12. These are sequence/release boundaries, not hard contracts | No; the boundary selects a release slice but never blocks by itself. | E-275B |
| RETURN-REPAIR | Universal Prompt 602 is a closure/evidence gate: it cannot be complete until ordinary shuttle return repair 602a is green. This does not block starting Prompt 602 | No; the closure gate is separate from start readiness. | E-602-CLOSURE |
| REACTOR-REPAIR | Prompt 122a follows the capacity, damage/upgrade, eligibility, expiry, and atomicity contracts named in its definition | No; its hard prompt field blocks. | E-REACTOR |
| PRESENTATION-INDEPENDENT | P485a and compact-DRADIS P611 consume existing fleetRedAlert independently of broader P485/P605a; P611a and P589b may ship independently after characterization/accessibility gates | No; shared gates are not prompt edges. | E-PRESENTATION |
| M1-REPAIR | Prompt 654 is a Milestone 1 repair and needs an owner-approved zero-eligible-Wolf outcome | No; milestone and owner fields block. | E-M1-REPAIR |

## Edge evidence register

| Evidence ID | Edge type | From -> target | Source anchor | Source language |
| --- | --- | --- | --- | --- |
| E-AUDIT-111 | evidence | 111 -> RESOURCE-LEDGER-INTEGRITY | functions/src/resources.ts; functions/src/shipCounterBatchCallables.test.ts; functions/src/shipDamage.ts; functions/src/shipDamage.test.ts; src/data/resources.ts; src/data/resources.test.ts; firestore.rules; tests/rules/firestore.rules.test.ts | Prompt 111's production resource paths parse ore, fuel, food, water, materials, security teams, and Capybara-only Scrap as nonnegative safe-integer server state. GM-only resource callables apply ordered +/-1 changes transactionally and re-read the latest count after a retry; malformed present values become zero while absent legacy fields retain printed starting stock. Damage cards remain an immutable server-owned deck projection: only known damaged system IDs persist and legacy client-supplied deck order is ignored. |
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
| E-147-RELATED | related/consumes | 147 -> 432;433 | IMPLEMENTATION_PLAN.md - Prompt 147 definition and Wolf attack engine sequence | Prompt 147 remains pending until the atomic attack declaration and audience-safe permitted-action projection exist; its capability filter must consume those future combat surfaces without adding combat resolution or nearest-host policy. |
| E-602-CLOSURE | evidence/audit closure | 602 -> 602a | IMPLEMENTATION_MILESTONES.md - audited baseline | Universal Prompt 602 cannot close until the ordinary shuttle return repair 602a is green; this is a closure gate, not a start blocker. |
| E-RETURN-REPAIR-SEQUENCE | sequence | 602a -> 602 | IMPLEMENTATION_MILESTONES.md - audited baseline | Deliver ordinary shuttle return repair 602a before the universal Prompt 602 proof. |
| E-602A | hard_contract | 602a -> AUTHORITATIVE-SHUTTLE-ASSOCIATION; CONSOLE-ROUTE-ENTITLEMENT | IMPLEMENTATION_MILESTONES.md - audited baseline and Prompt 602a definition | The ordinary return target is resolved from authoritative docking/association state and canonical route entitlement. |
| E-603A | hard_contract / sequence | 603a -> SHARED-SESSION-CHROME; ROLE-SELECT | IMPLEMENTATION_MILESTONES.md - audited baseline and addendum order | Prompt 603a is the measured shared session-ticket/header contract and remains a prerequisite for 652b. |
| E-605A | hard_prompt / decision_owner | 605a -> 433a; OWNER-APPROVAL-DEFERRED-VISUALIZATION | IMPLEMENTATION_PLAN.md - Prompt 605a definition | Only after Prompt 433a endpoint/schema/privacy proofs and explicit owner approval. |
| E-TICKER | evidence / sequence / hard_prompt | 106c -> 652a/652b; 652 -> 652a; 603a -> 652b | functions/src/fleetTickerState.ts; functions/src/index.ts; functions/src/fleetTickerState.test.ts; functions/src/joinSessionCallable.test.ts; functions/src/sessionResumeCallable.test.ts; functions/src/pressDispatchCallable.test.ts; src/components/FleetBroadcast.tsx; src/components/FleetBroadcast.test.tsx; src/components/FleetTicker.tsx; rendered lifecycle evidence | Prompt 106c now provides the server-owned FleetTicker stream: automatic, Admiral, and Press producers receive deterministic session-scoped identities, revisions, precedence, queue/drain state, dismissals, replay cursors, and server deadlines in one transaction. Server order/status/deadlines converge across reconnect and replay; each viewport finishes visible tails locally at constant speed without client frame or pass acknowledgements authoring shared progress. Red Alert stand-down has a 60-second server lifetime, while already-visible text may finish locally. Focused authority, projection, retry/race, rules, terminal/debrief, and rendered geometry evidence cover the closed lifecycle. Implement Prompt 106c before P652a or P652b; P652a follows P106c and P652; P603a remains a prerequisite for P652b. |
| E-ATTACK-DRADIS | sequence | 433a -> 351; 353-360; 605a | IMPLEMENTATION_PLAN.md - Wolf attack engine and addendum | The stable endpoint precedes DRADIS consumers; deferred visualization is not the playable-attack exit gate. |
| E-ATTACK-PRESSURE | sequence | 485-494 -> attack pressure | IMPLEMENTATION_PLAN.md - Wolf attack engine, fleet combat, and boarding | Prompts 485-494 must become authoritative before attack pressure depends on them. |
| E-PRESENTATION | sequence | 485a -> fleetRedAlert; 611 -> fleetRedAlert; 611a/589b -> characterization/accessibility gates | IMPLEMENTATION_PLAN.md - Future roadmap addendum, Dependency and delivery order | Compact alert surfaces consume existing fleetRedAlert independently; typography/copy repairs may ship independently after their gates. |
| E-REACTOR | sequence | 122a -> named maintenance contracts | IMPLEMENTATION_PLAN.md - Prompt 122a definition | The repair depends on named contracts without claiming their broader vessel matrix complete. |
| E-M1-REPAIR | hard_milestone / decision_owner | 654 -> M1; owner-approved zero-eligible-Wolf outcome | IMPLEMENTATION_PLAN.md - Prompt 654 definition | The repair depends on Milestone 1 and requires an owner-approved server outcome for zero eligible Wolf/private-loyalty holders. |
| E-M1-REPAIR-SEQUENCE | sequence | 654 -> M1-REPAIR | IMPLEMENTATION_PLAN.md - Prompt 654 definition | Prompt 654 is the Milestone 1 repair slice after the owner-approved outcome is recorded. |
| E-662 | related/consumes / decision_owner | 662 -> 054;075;496;586-588; OWNER-APPROVED-WOLF-DESIGNATION-POLICY | IMPLEMENTATION_PLAN.md - Prompt 662 definition | The decision notes overlaps/dependencies 054, 071, 075, 496, and 586-588 and remains missing until the owner-approved policy is recorded; retired 071 is excluded from the canonical related set. |
| E-664 | hard_prompt | 664 -> 660;661 | IMPLEMENTATION_PLAN.md - Prompt 664 definition | Dependencies: Prompts 660 and 661 provide exact validation execution and the canonical documentation-only classification; every non-documentation commit must resolve to one dependency-ready canonical item before it can land. |
| E-665 | hard_prompt | 665 -> 664 | IMPLEMENTATION_PLAN.md - Prompt 665 definition | Dependencies: Prompt 664 provides the universal roadmap-registration gate and typed source-backed authority; Prompt 665 extends its coordination lifecycle with durable session-goal evidence. |
| E-666 | hard_prompt | 666 -> 665 | IMPLEMENTATION_PLAN.md - Prompt 666 definition | Dependencies: Prompt 665 supplies the durable coordination lifecycle that owns and validates the compact dependency receipt. |
| E-667 | hard_prompt | 667 -> 665 | IMPLEMENTATION_PLAN.md - Prompt 667 definition | Dependencies: Prompt 665 supplies the durable reviewed coordination lifecycle; Prompt 667 independently rebaselines hostile-client and resource-exhaustion controls without blocking P012/P014 or depending on Prompt 666. |
| E-671 | related/consumes | 671 -> 668 | Owner request - application-wide button conventions, 2026-09-11 | The owner expanded the queued Write Mode Off button consistency request into an application-wide and fleet-wide button audit, explicitly including Ship View Privacy controls. Coordinate the shared case without imposing a hard prerequisite. |
| E-674 | related/consumes | 674 -> 048;049;628 | Owner request - GM ship-console observation and confirmed intervention, 2026-09-11 | The owner requested removing the ship Observer role while retaining read-only GM viewing and confirming scoped writes. Existing read-only entry, ship-change revocation, and GM-instance authority contracts remain related implementation boundaries. Related context is supplemented by the explicit planning prerequisites below; neither adds Git or CI enforcement. |
| E-675 | related/consumes | 675 -> 097;098;108 | Owner request - disconnect pause and first-rejoin resume, 2026-09-11 | The owner requested automatic empty-session pause and corrected restart to resume. Existing exact timer pause, idempotent expiry, and server-time reconnect contracts are related implementation boundaries. Related context is supplemented by the explicit planning prerequisites below; neither adds Git or CI enforcement. |
| E-677 | related/consumes | 677 -> 084;284;313;328;330 | Owner request - ship-specific map knowledge and selected system sharing, 2026-09-11 | The owner requested ship-specific visited/discovered coordinate knowledge plus independent location-content privacy. Existing ship projections, chart redaction, discovery history, and private scout results are related contracts. |
| E-678 | related/consumes | 678 -> 677;328;330;331;339;340 | Owner request - ship-specific map knowledge and selected system sharing, 2026-09-11 | The owner requested all-fleet or selected-ship transmission of known scanned system details. Per-ship knowledge, private scouting, discovery persistence, audit, and communication eligibility are related contracts. |
| E-679 | related/consumes | 679 -> 281;282;283;313;677 | Owner request - random adjacent-node blind jumps, 2026-09-11 | The owner requested random travel to an adjacent map node via blind jump. Locked graph resolution, arrival history, and per-ship knowledge are related contracts; lack of prior destination knowledge must not prevent the blind jump. |
| E-670-DEPENDENCIES | hard_prompt | 670 -> 044;045;046 | Owner clarification - written hard prerequisites without Git or CI enforcement, 2026-09-11 | Planning prerequisites for realistic implementation order, not commit, merge, push, or deployment gates. Removing an additional-GM registration lockout consumes authoritative eligibility, unique GM-instance claiming, and invalid-elevation denial; UI changes must not replace those grants. |
| E-674-DEPENDENCIES | hard_prompt | 674 -> 048;049;170;628 | Owner clarification - written hard prerequisites without Git or CI enforcement, 2026-09-11 | Planning prerequisites for realistic implementation order, not commit, merge, push, or deployment gates. Unobtrusive GM viewing and scoped intervention consume read-only entry, elevation revocation on ship change, audience-safe vessel projection, and GM-instance authority across privileged commands. |
| E-675-DEPENDENCIES | hard_prompt | 675 -> 034;038;040;097;108 | Owner clarification - written hard prerequisites without Git or CI enforcement, 2026-09-11 | Planning prerequisites for realistic implementation order, not commit, merge, push, or deployment gates. Automatic empty-session pause/resume consumes authoritative resume, stale-device expiry, empty-session retention, exact pause/resume time, and authoritative timer hydration. |
| E-677-DEPENDENCIES | hard_prompt | 677 -> 084;284;313;330 | Owner clarification - written hard prerequisites without Git or CI enforcement, 2026-09-11 | Planning prerequisites for realistic implementation order, not commit, merge, push, or deployment gates. Per-ship coordinate redaction consumes entitled ship projections, unknown-system redaction, persisted visit/discovery history, and safe discovery-note storage before privacy controls can consume them. |
| E-678-DEPENDENCIES | hard_prompt | 678 -> 328;339;340;677 | Owner clarification - written hard prerequisites without Git or CI enforcement, 2026-09-11 | Planning prerequisites for realistic implementation order, not commit, merge, push, or deployment gates. Selective system sharing consumes private scout facts, enforced communication recipient eligibility, and the per-ship knowledge projection supplied by 677; it must not create an alternate knowledge or cross-group disclosure path. |
| E-679-DEPENDENCIES | hard_prompt | 679 -> 281;282;285;294;304;677 | Owner clarification - written hard prerequisites without Git or CI enforcement, 2026-09-11 | Planning prerequisites for realistic implementation order, not commit, merge, push, or deployment gates. Blind jumps consume a canonical graph and locked chart, authoritative per-ship origin, working independent ship jump execution, retry-safe committed outcomes, and the per-ship knowledge boundary for undiscovered destinations. |
| E-680-RELATED | related/consumes | 680 -> 178;262;396;449 | Owner request and explicit ruling - live Alpha and Bravo fighter-wing status, 2026-09-12 | The owner requested live Alpha and Bravo fighter-wing strength and bay status in the shared ship-console presentation. Existing construction-capacity, wing-registration, fighter-state, and launch-eligibility prompts are related implementation boundaries; the queued observability slice must not invent mechanics, duplicate authority, or block on their future completion. Owner ruling: every new game starts Alpha and Bravo at four fighters each; until combat or repair automation exists, only an active GM may correct a wing count. Capacity remains a separate authoritative Construction Bay value. |
| E-069-START | evidence | 058 -> 069 | functions/src/sessionComposition.ts; functions/src/index.ts; functions/src/resources.test.ts; functions/src/shipPopulation.test.ts; functions/src/createSessionCallable.test.ts; functions/src/sessionComposition.test.ts | Prompt 058's initialSessionComposition feeds atomic createSession initialization and confirmSetup reconciliation: active vessels receive exact server survivor/resource catalogs, newly active vessels are seeded, removed vessels are filtered, and existing active lobby values are preserved. startGame locks the prepared state without resetting stores. Focused resources, population, create-session, and session-composition tests cover the printed base and expansion values plus these transitions. |
| E-070-START | evidence | 069 -> 070 | functions/src/sessionComposition.ts; functions/src/index.ts; functions/src/resources.ts; functions/src/sessionComposition.test.ts | Prompt 058's initialSessionComposition feeds atomic createSession initialization and confirmSetup reconciliation: each active vessel's persisted shipResources.securityTeams matches the authoritative INITIAL_SHIP_RESOURCES catalog across the production 8-, 19-, and 20-player rows. The existing bidirectional composition test preserves a deliberate lobby resource edit, and startGame locks the prepared state without resetting it. |
| E-075-START | evidence | 068;069;070;075 -> M1-START-COMPOSITION | functions/src/startState.ts; functions/src/index.ts; functions/src/startCallable.test.ts; functions/src/sessionComposition.test.ts; functions/src/shipDamage.ts; functions/src/maintenance.ts; functions/src/pressDispatchState.ts | The single startGame transaction validates the locked roster and craft manifest, preserves prepared stores and any existing Turn 1 state, materializes canonical intact damage and empty maintenance state for every active vessel, initializes inactive fleet alert and empty Press dispatch defaults when absent, composes private Wolf/loyalty state, starts Turn 1 with pursuit 2 and timers, and writes one setup receipt and privacy-safe event. The start callable and production 8-, 19-, and 20-player matrix cover defaults, preservation, replay, and race behavior. |
| E-077-START | evidence | 075 -> 077 | functions/src/index.ts; functions/src/startCallable.test.ts; functions/src/sessionComposition.test.ts; src/lib/sessionService.ts; src/lib/firestore.ts | The existing authoritative start transition persists exactly one initial pursuit group, fleet, at value 2. The start callable and production 8-, 19-, and 20-player matrix assert the exact map, while the existing replay and concurrent-start assertions prove repeated requests do not mutate it. Initial fleet splitting and later pursuit changes remain separate mechanics. |
| E-080-WOLF-TIMING | evidence | 080 -> M1-WOLF-TIMING | functions/src/index.ts; functions/src/wolfAttackWindow.ts; functions/src/wolfAttackWindowCallable.test.ts; tests/rules/firestore.rules.test.ts; src/lib/firestore.ts; src/lib/sessionService.ts; src/routes/GmConsole.tsx | The active-GM setWolfAttackWindow callable stores a private due/resolved/deferred marker with a monotonic revision, one GM-only audit record, and a shared command receipt in one transaction. Callable, rules, Firestore listener, service, and GM-console tests cover authorization, stale and replay handling, Turn 1 defer to Turn 2, member privacy, and the absence of automatic attack/combat/turn advancement. |
| E-082-PUBLIC-SNAPSHOT | evidence | 082 -> M1-PUBLIC-SNAPSHOT | functions/src/createSessionCallable.test.ts; functions/src/startCallable.test.ts; functions/src/joinSessionCallable.test.ts; tests/rules/firestore.rules.test.ts | The create/start callables persist only the explicit member session fields, while join reprojects the persisted root into that same public shape. Role briefs, loyalty secrets/census, setup receipts, and facilitator-only paths remain separate; callable and rules tests cover the public field allowlist and connected-member boundary. |
| E-084-CREW-VESSEL-STATE | evidence | 084 -> M1-CREW-VESSEL-STATE | src/lib/shipStateProjection.ts; src/lib/shipStateProjection.test.ts; src/routes/ShipConsole.tsx; src/components/FleetConsoleWorkspace.tsx; src/components/FleetSystemsWorkspace.tsx; src/components/AegisConsoleWorkspace.tsx; firestore.rules; tests/rules/firestore.rules.test.ts | Ship consoles consume an allowlisted projection of the selected vessel's public operational state: stores, damage, population, unrest, navigation, maintenance, upgrades, jump status, coordinate, and console lock. Projection tests prove other-vessel entries and role/loyalty-shaped fields are excluded; protected role briefs and loyalty paths remain separate. |
| E-085-ROLE-PRIVATE-RECONNECT | evidence | 085 -> M1-ROLE-PRIVATE-RECONNECT | src/lib/firestore.ts; src/lib/firestore.test.ts; src/App.tsx; src/App.test.tsx; firestore.rules; tests/rules/firestore.rules.test.ts | The authenticated session listener hydrates only the current UID's role brief and loyalty projection, clears private projections when its session/UID subscription is replaced or removed, and ignores delayed callbacks from an older listener. Assignment UID and role guards remain in the App layer; protected roleBrief and loyalty paths remain rules enforced. |
| E-088-SNAPSHOT-ORDER | evidence | 088 -> M1-SNAPSHOT-ORDER | src/lib/firestore.ts; src/lib/firestore.test.ts | The revisioned facilitator census and Wolf timing listeners accept equal or newer server revisions only for the lifetime of one subscription, so a delayed lower revision cannot replace a newer GM projection. Deletion, malformed data, errors, teardown, and a new subscription preserve the existing clear and lifecycle behavior without adding ordering to unversioned streams. |
| E-089-EVENT-REPLAY | evidence | 089 -> M1-EVENT-REPLAY | src/lib/firestore.ts; src/lib/firestore.test.ts; src/routes/GmConsole.tsx | The member-visible event listener reconstructs each server snapshot as a replacement list, so reconnecting with overlapping documents leaves each server event ID represented once and removes events no longer in the latest snapshot. The projection derives EventId only from the Firestore document ID; payload IDs cannot spoof or duplicate a visible event. The GM console renders the projection by that stable ID without replaying event effects. |
| E-086-FACILITATOR-PRIVATE | evidence | 086 -> M1-FACILITATOR-PRIVATE | functions/src/index.ts; functions/src/requestGuards.ts; functions/src/censusNoteCallable.test.ts; functions/src/loyaltyCallable.test.ts; src/lib/firestore.ts; src/lib/firestore.test.ts; src/routes/GmConsole.tsx; src/routes/GmConsole.test.tsx; firestore.rules; tests/rules/firestore.rules.test.ts | The existing wolf-assignment secret now hydrates a typed GM-only projection. The facilitator loyalty census accepts bounded optional notes, and an authorized revisioned callable persists, audits, replays, and clears those notes without publishing a member event. Census rebuilds preserve notes for the same current UID and removal patches drop them; callable, lifecycle, client, GM-console, and rules tests cover authorization, stale/replay behavior, teardown, and member denial. |
| E-090-HIDDEN-REDACTION | evidence | 090 -> M1-HIDDEN-REDACTION | src/lib/firestore.ts; src/lib/firestore.test.ts; functions/src/index.ts; functions/src/joinSessionCallable.test.ts; functions/src/sessionResumeCallable.test.ts; functions/src/startState.ts; functions/src/startCallable.test.ts; functions/src/maintenance.ts; functions/src/maintenance.test.ts; firestore.rules; tests/rules/firestore.rules.test.ts | Typed public projections now remove nested hidden-state fields and unknown craft or vessel keys at client and callable boundaries while preserving valid operational state and SNN Press escort data. Existing member-readable session roots remain intentionally public; role briefs, loyalty, and facilitator notes stay on protected paths. Focused start, join, resume, and client projection tests cover malformed hidden fields, unknown IDs, valid-data preservation, and inactive prepared maintenance cycles. |
| E-091-TURN-ENTITY | evidence | 091 -> M2-TURN-ENTITY | functions/src/turnZero.ts; functions/src/index.ts; functions/src/turnZero.test.ts; functions/src/startCallable.test.ts; functions/src/sessionComposition.test.ts; functions/src/maintenanceCallable.test.ts; src/lib/turnPhase.ts; src/lib/turnPhase.test.ts; src/lib/firestore.ts; src/lib/sessionService.ts | The existing server-owned Team and Coordination clock now persists one complete turnState alongside its compatibility fields: current and maximum turn, phase, monotonic phase revision, and authoritative phase start/end instants. The start/advance, Team-to-Coordination, timer extension, emergency pause/resume, join, resume, and client callable paths preserve the entity; malformed records are rejected and legacy sessions are backfilled only at a real phase boundary. Focused turn-zero, start, production 8/19/20, airspace transition, and client parser tests cover the schema and lifecycle. |
| E-100-COORDINATION-METADATA | evidence | 100 -> M2-COORDINATION-ACTIONS | functions/src/actionMetadata.ts; functions/src/actionMetadata.test.ts; authorized source review | The shared action metadata classifies transfer as a Coordination action, and policy tests prove transfer is denied during Team and allowed during Coordination. Transfer, scouting, and research callable coverage remains open, so Prompt 100 stays partial. |
| E-102-COORDINATION-COMPLETION | evidence | 102 -> M2-COORDINATION-COMPLETION | functions/src/index.ts; functions/src/maintenanceCallable.test.ts; firestore.rules; tests/rules/firestore.rules.test.ts | The authoritative advanceTurn transaction derives one server-owned next-turn announcement and commits it atomically with currentTurn and turnPhase, alongside the deterministic member-visible turn-advanced event. Focused callable coverage proves one generated announcement/state commit and event identity while ignoring a forged request field; Firestore emulator coverage denies client writes to the combined next-turn state/announcement and the transition event. The atomic commit is the ordering guarantee; no separate timing semantics are introduced. |
| E-106-LIFECYCLE-REPLAY | evidence | 106 -> M2-LIFECYCLE-REPLAY | src/lib/firestore.ts; src/components/TurnStartAnnouncement.tsx; src/components/FleetAlert.test.tsx; src/components/TurnStartAnnouncement.test.tsx; src/lib/firestore.test.ts | The authoritative session listener hydrates the latest parsed turn, phase, and announcement snapshot, while TurnStartAnnouncement opens a visual transmission only for a newer live turn or server revision. The production listener integration test drives Turn 1 to Turn 2, confirms one transmission, unsubscribes and reconnects with the same server snapshot, then verifies the current state rehydrates without a duplicate visual effect. Existing announcement timing and event-snapshot replacement tests continue to cover intentional replay and stable server IDs. |
| E-106A | evidence | 106a -> FLEET-BROADCAST-PRECEDENCE | src/components/FleetBroadcast.tsx; src/components/FleetTicker.tsx; src/components/FleetAlert.test.tsx; src/components/FleetTicker.test.tsx | Existing FleetBroadcast standing-message precedence routes Turn 0, emergency pause, airspace, and Press copy below an authoritative fleet red alert. A focused FleetAlert regression drives a restricted-airspace ticker into an urgent alert, confirms the lower-priority groups remain on the shared track while the alert is queued exactly once, drains the standing tail once, and keeps the urgent alert visible after the standing state clears. FleetTicker tests cover finite replacement, fallback drain, and seamless moving-group preservation. Proof-only; no production change. |
| E-104-FINAL-TURN | evidence | 104 -> M2-FINAL-TURN | functions/src/index.ts; functions/src/maintenanceCallable.test.ts; functions/src/requestGuards.ts; src/lib/sessionService.ts; src/lib/sessionService.test.ts; src/routes/GmConsole.tsx; src/routes/GmConsole.test.tsx; src/routes/ShipConsole.tsx; src/routes/ShipConsole.test.tsx; firestore.rules; tests/rules/firestore.rules.test.ts | The authoritative final-turn advance keeps the configured maximum turn, expires only turn-scoped maintenance charges and shuttle fuel flags, transitions the session atomically from active to debrief, and clears the live phase entity and announcement without creating a next-turn event. A shared command receipt replays the terminal result exactly and blocks a distinct re-entry; focused callable, client, and console tests cover stale-state cleanup, normal mutation denial, and visible evaluation state. Firestore client writes remain denied by the existing server-owned session, lifecycle, and command-receipt rules. |
| E-AUDIT-104 | hard_prompt | 104 -> 078;103 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Final-turn evaluation consumes the configured turn limit and committed next-turn/phase transition. |
| E-AUDIT-105 | hard_prompt | 105 -> 077;485 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Terminal pursuit evaluation consumes initial pursuit and the authoritative pursuit state. |
| E-AUDIT-110 | hard_prompt | 110 -> 103 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | The production callable two-turn proof consumes server-timed Team and Coordination completion, the committed Turn 2 transition, and its exactly-once event/retry behavior. |
| E-AUDIT-112 | hard_prompt | 112 -> 111 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | A trade needs the authoritative typed resource ledgers. |
| E-AUDIT-113 | hard_prompt | 113 -> 111;164;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Shuttle transfer needs typed ledgers, cargo allowlists, and authoritative craft manifest/dock state. |
| E-AUDIT-114 | hard_prompt | 114 -> 161;162;234;249 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Maintenance order is defined by the registered vessel and printed statistics; all-vessel coverage also consumes the shared small-ship rules and Voyage 33-0 admission foundations. |
| E-AUDIT-114-ORDER | evidence | 114 -> MAINTENANCE-ORDER | functions/src/maintenanceOrder.ts; functions/src/maintenance.ts; functions/src/maintenance.test.ts; functions/src/maintenanceCallable.test.ts; src/components/MaintenanceSystems.tsx; src/routes/ShipConsole.test.tsx | The server-owned maintenance callable resolves the registered full-vessel order: AEGIS runs Shuttle Bay Zeta at step 6 and Shuttle Bay Omega at step 7, while the other six active full vessels run steps 1–6. Supplemental identities remain explicit metadata-only registrations until their runtime foundations land. |
| E-AUDIT-114-RELATED | related/consumes | 114 -> 121;235;241;242;246;250;571;591 | docs/implementation-prompts.json - Prompt 114 related implementation boundaries | Small-ship population loss, variant maintenance, Voyage 33-0 maintenance, full Capybara execution, and vessel-specific help are related consumers of the maintenance order foundation; their runtime ownership remains with those prompts. |
| E-AUDIT-116 | hard_prompt | 116 -> 117;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Ration selection needs the recorded wording decision and printed vessel tables. |
| E-AUDIT-118 | hard_prompt | 118 -> 116;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Population table switching consumes the ration selection and printed thresholds. |
| E-AUDIT-119 | hard_prompt | 119 -> 111;116;117 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | The unrest check consumes typed resources, both ration choices, and their recorded interpretation. |
| E-AUDIT-120 | hard_prompt | 120 -> 119;130 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Riot resolution consumes the authoritative unrest result and common damage draw. |
| E-AUDIT-121 | hard_prompt | 121 -> 114;120 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Small-ship maintenance exceptions extend the ordered maintenance and riot paths. |
| E-AUDIT-123 | hard_prompt | 123 -> 122;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Damaged Reactor penalties extend the capacity contract and printed vessel values. |
| E-AUDIT-124 | hard_prompt | 124 -> 122 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Reactor capacity applies each printed vessel's +1 upgrade modifier only from server-owned completed upgrade state. |
| E-AUDIT-125 | hard_prompt | 125 -> 122;138 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Charge eligibility uses Reactor capacity and atomic maintenance authority: unknown, duplicate, and damaged non-Jump consoles are rejected while the printed damaged Jump Drive integrity case remains chargeable. |
| E-AUDIT-126 | hard_prompt | 126 -> 127;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | The two-bay behavior consumes the ordinary bay and authoritative craft-manifest contracts. |
| E-AUDIT-127 | hard_prompt | 127 -> 361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Single-bay fuelling resolves against the authoritative shuttle manifest. |
| E-AUDIT-128 | hard_prompt | 128 -> 103 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Expiry is applied at the authoritative turn rollover. |
| E-AUDIT-129 | hard_prompt | 129 -> 127 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | The denial surface consumes the single-bay eligibility result. |
| E-AUDIT-131 | hard_prompt | 131 -> 130 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Empty-deck destruction is the terminal branch of the common damage draw. |
| E-AUDIT-134 | hard_prompt | 134 -> 118 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | The threshold alert consumes the authoritative population-dependent ration table. |
| E-AUDIT-135 | hard_prompt | 135 -> 119;120 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Population-zero unrest extends the unrest and riot transition path. |
| E-AUDIT-136 | hard_prompt | 136 -> 135 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Mutiny consumes authoritative unrest state; population-zero unrest is a separate consequence and is not a prerequisite. |
| E-AUDIT-137 | hard_prompt | 137 -> 136 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Replacement-captain recovery consumes the authoritative mutiny state. |
| E-AUDIT-140 | hard_prompt | 140 -> 114;171;183;194;204;216;224;235;241;242;246;250;571 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | The all-vessel matrix needs ordered maintenance plus each core, small-ship, Voyage 33-0, and Capybara maintenance producer. |
| E-AUDIT-140A | hard_prompt | 140a -> 111;164;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Evacuation transfers need typed ledgers, cargo permissions, and the craft manifest. |
| E-AUDIT-140B | hard_prompt | 140b -> 140a | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Destination capacity is checked within the evacuation transfer contract. |
| E-AUDIT-140C | hard_prompt | 140c -> 140a;140b | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Retry safety composes evacuation transfer and capacity decisions. |
| E-AUDIT-140D | hard_prompt | 140d -> 131 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Escape pods are created from the authoritative ship-destruction flow. |
| E-AUDIT-140E | hard_prompt | 140e -> 140d | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Escape state follows durable pod creation. |
| E-AUDIT-140F | hard_prompt | 140f -> 140d;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Retained craft state follows destruction and the authoritative manifest. |
| E-AUDIT-140G | hard_prompt | 140g -> 140d;111 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Scavenging follows destruction and typed resource reconciliation. |
| E-AUDIT-142 | hard_prompt | 142 -> 141;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Team-start docking consumes normal airspace and the craft manifest. |
| E-AUDIT-143 | hard_prompt | 143 -> 361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Holder and dock identity are fields of the authoritative craft manifest. |
| E-AUDIT-144 | hard_prompt | 144 -> 141;143 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | A legal shuttle move needs open airspace and holder/dock authority. |
| E-AUDIT-145 | hard_prompt | 145 -> 141 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf locking extends the existing normal airspace contract. |
| E-AUDIT-148 | hard_prompt | 148 -> 145 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Post-attack parking follows the authoritative Wolf lock. |
| E-AUDIT-149 | hard_prompt | 149 -> 143 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Quarantine docking consumes holder and host identity. |
| E-AUDIT-150 | hard_prompt | 150 -> 149 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Quarantine reset protection extends the per-turn docking limit. |
| E-AUDIT-151 | hard_prompt | 151 -> 286 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Split-fleet communication scope needs authoritative fleet-group identity. |
| E-AUDIT-152 | hard_prompt | 152 -> 337;338 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Shuttle-state redaction consumes the group-local roster and cross-group denial contracts. |
| E-AUDIT-153 | hard_prompt | 153 -> 143;336 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Cross-group docking needs holder/dock authority and an authoritative split. |
| E-AUDIT-155 | hard_prompt | 155 -> 154 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Status announcements follow the committed airspace state machine. |
| E-AUDIT-156 | hard_prompt | 156 -> 154 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Movement reopens only from the committed airspace state machine. |
| E-AUDIT-157 | hard_prompt | 157 -> 145 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Attack overrun behavior extends the authoritative attack lock. |
| E-AUDIT-158 | hard_prompt | 158 -> 154 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Reconnect during restriction consumes the authoritative airspace state. |
| E-AUDIT-159 | hard_prompt | 159 -> 140;145;156;373 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | The start-to-airspace proof composes the vessel matrix, attack lock, movement reopening, and actual craft parking producer. |
| E-AUDIT-161 | evidence | 161 -> VESSEL-REGISTRATION | src/data/vessels/templates.ts; src/data/vessels/gorgoneion.ts; src/data/vessels/capybara-small.ts; src/data/vessels/warrior.ts; src/data/vessels/vulcan.ts; src/data/vessels/voyage-33-0.ts; src/data/ships.ts; src/data/vesselTemplates.test.ts | The typed vessel catalog registers six core ships, four optional base small ships, the Voyage 33-0 approaching vessel, and a separate expansion Capybara identity. The base small-ship Capybara and expansion Capybara cannot be selected together; optional registrations stay outside the core session roster until their gameplay prompts land. |
| E-AUDIT-162 | hard_prompt | 162 -> 161 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Printed statistics belong to a registered vessel definition. |
| E-AUDIT-162-STATS | evidence | 162 -> VESSEL-STATISTICS | src/data/vessels/templates.ts; src/data/vessels/aegis.ts; src/data/vessels/gorgoneion.ts; src/data/vessels/capybara-small.ts; src/data/vessels/warrior.ts; src/data/vessels/vulcan.ts; src/data/vessels/voyage-33-0.ts; src/data/shipPopulation.ts; src/components/FleetSystemsWorkspace.tsx; src/components/AegisConsoleWorkspace.tsx; src/data/vesselTemplates.test.ts | The shared typed vessel registration and statistics profile records source-aligned identity, capacity applicability, population, jump costs, Reactor capacity, and maintenance-step ranges for every registered full and supplemental vessel. Full-ship population/specification consumers and ship console telemetry read the profile; supplemental profiles remain metadata-only until their gameplay prompts land. |
| E-AUDIT-164 | hard_prompt | 164 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Cargo permissions are typed by registered vessels and their printed statistics. |
| E-AUDIT-165 | hard_prompt | 165 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Console metadata is attached to registered vessel and printed-system definitions. |
| E-AUDIT-166 | hard_prompt | 166 -> 161;165 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Role action binding consumes vessel and console metadata. |
| E-AUDIT-169 | hard_prompt | 169 -> 161;162;165 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Shared fixtures exercise the common vessel and console contracts. |
| E-AUDIT-170 | hard_prompt | 170 -> 048;049 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Observer-safe projections extend the existing observer entry and reset contracts. |
| E-AUDIT-171 | hard_prompt | 171 -> 114;161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each full-ship maintenance lane consumes ordered maintenance, vessel registration, and printed statistics. |
| E-AUDIT-172 | hard_prompt | 172 -> 130;161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Armoured Hull behavior consumes common damage draws and vessel data. |
| E-AUDIT-173 | hard_prompt | 173 -> 115 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each Storage lane extends the existing damaged-Storage contract. |
| E-AUDIT-174 | hard_prompt | 174 -> 122;125 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each Reactor lane consumes capacity and charge eligibility. |
| E-AUDIT-175 | hard_prompt | 175 -> 127;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each shuttle-bay lane consumes single-bay eligibility and the craft manifest. |
| E-AUDIT-176 | hard_prompt | 176 -> 127;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each shuttle-bay lane consumes single-bay eligibility and the craft manifest. |
| E-AUDIT-178 | hard_prompt | 178 -> 161;162;262 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Construction Bay uses vessel data and the registered fighter-wing state. |
| E-AUDIT-179 | hard_prompt | 179 -> 166 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Role workspaces consume authoritative role-to-action binding. |
| E-AUDIT-180 | hard_prompt | 180 -> 166;182 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Executive Officer actions consume role binding and AEGIS combat-console registration. |
| E-AUDIT-181 | hard_prompt | 181 -> 166;260;262 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wing Commander workspace consumes role binding and the registered scouting/fighter craft. |
| E-AUDIT-182 | hard_prompt | 182 -> 165 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Combat-console registration extends shared console metadata. |
| E-AUDIT-183 | hard_prompt | 183 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Dione roster gating consumes vessel registration and printed capacity/population data. |
| E-AUDIT-184 | hard_prompt | 184 -> 116;118 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Dione ration thresholds consume the common ration and population-table contracts. |
| E-AUDIT-185 | hard_prompt | 185 -> 115;183 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Dione Storage consumes damaged-Storage behavior and Dione roster identity. |
| E-AUDIT-186 | hard_prompt | 186 -> 122;125 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each Reactor lane consumes capacity and charge eligibility. |
| E-AUDIT-187 | hard_prompt | 187 -> 127;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each shuttle-bay lane consumes single-bay eligibility and the craft manifest. |
| E-AUDIT-188 | hard_prompt | 188 -> 122;125;183 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Dione production consumes Reactor eligibility and Dione identity. |
| E-AUDIT-189 | hard_prompt | 189 -> 122;125;183 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Dione production consumes Reactor eligibility and Dione identity. |
| E-AUDIT-190 | hard_prompt | 190 -> 167 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Private VIP ownership uses the standard authoritative action envelope. |
| E-AUDIT-191 | hard_prompt | 191 -> 119;190 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | The VIP reroll consumes the unrest roll and private card ownership. |
| E-AUDIT-192 | hard_prompt | 192 -> 182;264 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Dione fighter-bay gating consumes combat registration and Maliades craft identity. |
| E-AUDIT-193 | hard_prompt | 193 -> 166 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Role workspaces consume authoritative role-to-action binding. |
| E-AUDIT-193A | hard_prompt | 193a -> 166;183 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Dione Engineer actions consume role binding and Dione identity. |
| E-AUDIT-193B | hard_prompt | 193b -> 166;183 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | President actions consume role binding and Dione identity. |
| E-AUDIT-194 | hard_prompt | 194 -> 114;161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each full-ship maintenance lane consumes ordered maintenance, vessel registration, and printed statistics. |
| E-AUDIT-195 | hard_prompt | 195 -> 115 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each Storage lane extends the existing damaged-Storage contract. |
| E-AUDIT-196 | hard_prompt | 196 -> 122;125 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each Reactor lane consumes capacity and charge eligibility. |
| E-AUDIT-197 | hard_prompt | 197 -> 127;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each shuttle-bay lane consumes single-bay eligibility and the craft manifest. |
| E-AUDIT-198 | hard_prompt | 198 -> 114;122;125;194 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Icebreaker production consumes ordered maintenance, Reactor eligibility, and Icebreaker identity. |
| E-AUDIT-199 | hard_prompt | 199 -> 114;122;125;194 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Icebreaker production consumes ordered maintenance, Reactor eligibility, and Icebreaker identity. |
| E-AUDIT-200 | hard_prompt | 200 -> 114;122;125;194 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Icebreaker production consumes ordered maintenance, Reactor eligibility, and Icebreaker identity. |
| E-AUDIT-201 | hard_prompt | 201 -> 177;287-304 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each vessel jump audit extends the existing AEGIS/common jump contract. |
| E-AUDIT-202 | hard_prompt | 202 -> 201 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Ram Scoop uses the authoritative Icebreaker jump result. |
| E-AUDIT-203 | hard_prompt | 203 -> 166 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Role workspaces consume authoritative role-to-action binding. |
| E-AUDIT-203A | hard_prompt | 203a -> 166;194;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Icebreaker Engineer actions consume role, vessel, and craft contracts. |
| E-AUDIT-203B | hard_prompt | 203b -> 166;194;265;388 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Miner workspace consumes role, vessel, Highwall, and mining contracts. |
| E-AUDIT-204 | hard_prompt | 204 -> 114;161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each full-ship maintenance lane consumes ordered maintenance, vessel registration, and printed statistics. |
| E-AUDIT-205 | hard_prompt | 205 -> 115 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each Storage lane extends the existing damaged-Storage contract. |
| E-AUDIT-206 | hard_prompt | 206 -> 122;125 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each Reactor lane consumes capacity and charge eligibility. |
| E-AUDIT-207 | hard_prompt | 207 -> 127;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each shuttle-bay lane consumes single-bay eligibility and the craft manifest. |
| E-AUDIT-208 | hard_prompt | 208 -> 122;125;204 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Shepherd production consumes Reactor eligibility and Shepherd identity. |
| E-AUDIT-209 | hard_prompt | 209 -> 122;125;204 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Shepherd production consumes Reactor eligibility and Shepherd identity. |
| E-AUDIT-210 | hard_prompt | 210 -> 177;287-304 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each vessel jump audit extends the existing AEGIS/common jump contract. |
| E-AUDIT-211 | hard_prompt | 211 -> 165;204;267 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Research tracks consume console metadata, Shepherd identity, and Endeavour registration. |
| E-AUDIT-212 | hard_prompt | 212 -> 211 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Research cadence consumes the research-track contract. |
| E-AUDIT-213 | hard_prompt | 213 -> 211 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Endeavour devices consume research-track state. |
| E-AUDIT-214 | hard_prompt | 214 -> 211 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Endeavour devices consume research-track state. |
| E-AUDIT-215 | hard_prompt | 215 -> 166 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Role workspaces consume authoritative role-to-action binding. |
| E-AUDIT-215A | hard_prompt | 215a -> 166;204;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Shepherd Engineer actions consume role, vessel, and craft contracts. |
| E-AUDIT-215B | hard_prompt | 215b -> 166;204;211;321 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Scientist workspace consumes role, vessel, research, and scout-entitlement contracts. |
| E-AUDIT-216 | hard_prompt | 216 -> 114;161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each full-ship maintenance lane consumes ordered maintenance, vessel registration, and printed statistics. |
| E-AUDIT-217 | hard_prompt | 217 -> 115 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each Storage lane extends the existing damaged-Storage contract. |
| E-AUDIT-218 | hard_prompt | 218 -> 122;125 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each Reactor lane consumes capacity and charge eligibility. |
| E-AUDIT-219 | hard_prompt | 219 -> 127;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each shuttle-bay lane consumes single-bay eligibility and the craft manifest. |
| E-AUDIT-220 | hard_prompt | 220 -> 122;125;216 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Quellon production consumes Reactor eligibility and Quellon identity. |
| E-AUDIT-221 | hard_prompt | 221 -> 122;125;216 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Quellon production consumes Reactor eligibility and Quellon identity. |
| E-AUDIT-222 | hard_prompt | 222 -> 177;287-304 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each vessel jump audit extends the existing AEGIS/common jump contract. |
| E-AUDIT-223 | hard_prompt | 223 -> 166 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Role workspaces consume authoritative role-to-action binding. |
| E-AUDIT-223A | hard_prompt | 223a -> 166;216;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Quellon Engineer actions consume role, vessel, and craft contracts. |
| E-AUDIT-223B | hard_prompt | 223b -> 166;216;269;321 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Explorer workspace consumes role, vessel, Hummingbird, and scout-entitlement contracts. |
| E-AUDIT-224 | hard_prompt | 224 -> 114;161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each full-ship maintenance lane consumes ordered maintenance, vessel registration, and printed statistics. |
| E-AUDIT-225 | hard_prompt | 225 -> 115 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each Storage lane extends the existing damaged-Storage contract. |
| E-AUDIT-226 | hard_prompt | 226 -> 122;125 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each Reactor lane consumes capacity and charge eligibility. |
| E-AUDIT-227 | hard_prompt | 227 -> 127;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each shuttle-bay lane consumes single-bay eligibility and the craft manifest. |
| E-AUDIT-228 | hard_prompt | 228 -> 122;125;224 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Refinery production consumes Reactor eligibility and Refinery identity. |
| E-AUDIT-229 | hard_prompt | 229 -> 122;125;224 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Refinery production consumes Reactor eligibility and Refinery identity. |
| E-AUDIT-230 | hard_prompt | 230 -> 122;125;224 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Refinery production consumes Reactor eligibility and Refinery identity. |
| E-AUDIT-231 | hard_prompt | 231 -> 182;273 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Refinery fighter-bay gating consumes combat registration and the PDF wing identity. |
| E-AUDIT-232 | hard_prompt | 232 -> 177;287-304 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each vessel jump audit extends the existing AEGIS/common jump contract. |
| E-AUDIT-233 | hard_prompt | 233 -> 166 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Role workspaces consume authoritative role-to-action binding. |
| E-AUDIT-233A | hard_prompt | 233a -> 166;224;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Refinery Engineer actions consume role, vessel, and craft contracts. |
| E-AUDIT-233B | hard_prompt | 233b -> 166;224;273 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | PDF Colonel workspace consumes role, vessel, and Escort Wing contracts. |
| E-AUDIT-234 | hard_prompt | 234 -> 161;162;111;141 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Small-ship rules consume vessel/ledger definitions and normal airspace. |
| E-AUDIT-235 | hard_prompt | 235 -> 234;161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Small-ship identity lanes consume shared small-ship rules and printed vessel data. |
| E-AUDIT-236 | hard_prompt | 236 -> 234;287-304 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Small-ship jump lanes consume small-ship identity and the common jump contract. |
| E-AUDIT-237 | hard_prompt | 237 -> 234;402 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Mission support consumes small-ship identity and the mission deck. |
| E-AUDIT-238 | hard_prompt | 238 -> 234;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Small-ship repair actions consume small-ship identity and craft authority. |
| E-AUDIT-239 | hard_prompt | 239 -> 234;165 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Small-ship combat registration consumes shared small-ship and console metadata. |
| E-AUDIT-240 | hard_prompt | 240 -> 234;165 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Small-ship combat registration consumes shared small-ship and console metadata. |
| E-AUDIT-241 | hard_prompt | 241 -> 234;161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Small-ship identity lanes consume shared small-ship rules and printed vessel data. |
| E-AUDIT-241A | hard_prompt | 241a -> 234;287-304 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Small-ship jump lanes consume small-ship identity and the common jump contract. |
| E-AUDIT-241B | hard_prompt | 241b -> 241;401 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Bulk haulage consumes Capybara identity and mission eligibility. |
| E-AUDIT-241C | hard_prompt | 241c -> 241;164 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara cargo transfer consumes Capybara identity and cargo permissions. |
| E-AUDIT-241D | hard_prompt | 241d -> 241;122;125 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara production consumes identity and Reactor eligibility. |
| E-AUDIT-241E | hard_prompt | 241e -> 241;122;125 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara fuel processing consumes identity and Reactor eligibility. |
| E-AUDIT-242 | hard_prompt | 242 -> 234;161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Warrior identity consumes shared small-ship and printed vessel data. |
| E-AUDIT-243 | hard_prompt | 243 -> 242;402 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Warrior salvage consumes Warrior identity and the mission deck. |
| E-AUDIT-244 | hard_prompt | 244 -> 234;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Small-ship repair actions consume small-ship identity and craft authority. |
| E-AUDIT-245 | hard_prompt | 245 -> 242 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Warrior Salvage Drones consume Warrior identity. |
| E-AUDIT-246 | hard_prompt | 246 -> 234;161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Small-ship identity lanes consume shared small-ship rules and printed vessel data. |
| E-AUDIT-247 | hard_prompt | 247 -> 246;182 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Vulcan combat consumes Vulcan identity and combat-console registration. |
| E-AUDIT-248 | hard_prompt | 248 -> 246;122;125 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Vulcan labour actions consume Vulcan identity and Reactor/charge eligibility. |
| E-AUDIT-249 | hard_prompt | 249 -> 525 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Voyage admission is a crisis-path outcome. |
| E-AUDIT-250 | hard_prompt | 250 -> 249;114 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Voyage maintenance consumes its admission and ordered maintenance. |
| E-AUDIT-251 | hard_prompt | 251 -> 249;287-304 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Voyage movement consumes its admission and common jump authority. |
| E-AUDIT-252 | hard_prompt | 252 -> 057;058 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Expansion mode consumes the existing mode-selection and expansion-roster contracts. |
| E-AUDIT-253 | hard_prompt | 253 -> 252;161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Expansion identity consumes the mode gate and printed vessel data. |
| E-AUDIT-254 | hard_prompt | 254 -> 253;122;125 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Expansion consoles consume expansion identity and Reactor eligibility. |
| E-AUDIT-255 | hard_prompt | 255 -> 253;122;125 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Expansion consoles consume expansion identity and Reactor eligibility. |
| E-AUDIT-256 | hard_prompt | 256 -> 253;122;125 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Expansion consoles consume expansion identity and Reactor eligibility. |
| E-AUDIT-257 | hard_prompt | 257 -> 253;122;125 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Expansion consoles consume expansion identity and Reactor eligibility. |
| E-AUDIT-258 | hard_prompt | 258 -> 253;122;125 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Expansion consoles consume expansion identity and Reactor eligibility. |
| E-AUDIT-259 | hard_prompt | 259 -> 253;287-304 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Expansion jump audit consumes expansion identity and common jump authority. |
| E-AUDIT-260 | hard_prompt | 260 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Craft registration consumes the canonical vessel/statistics definitions. |
| E-AUDIT-261 | hard_prompt | 261 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Craft registration consumes the canonical vessel/statistics definitions. |
| E-AUDIT-262 | hard_prompt | 262 -> 161;162;165 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Fighter-wing registration consumes vessel, statistics, and console metadata. |
| E-AUDIT-263 | hard_prompt | 263 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Craft registration consumes the canonical vessel/statistics definitions. |
| E-AUDIT-264 | hard_prompt | 264 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Craft registration consumes the canonical vessel/statistics definitions. |
| E-AUDIT-265 | hard_prompt | 265 -> 161;162;164;388 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Highwall registration consumes the canonical vessel/statistics and cargo definitions; its mining action is a later consumer. |
| E-AUDIT-266 | hard_prompt | 266 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Craft registration consumes the canonical vessel/statistics definitions. |
| E-AUDIT-267 | hard_prompt | 267 -> 161;162;165 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Endeavour registration consumes vessel and console metadata. |
| E-AUDIT-268 | hard_prompt | 268 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Craft registration consumes the canonical vessel/statistics definitions. |
| E-AUDIT-269 | hard_prompt | 269 -> 161;162;321 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Hummingbird registration consumes the canonical vessel/statistics definition; scout entitlements are a later consumer. |
| E-AUDIT-270 | hard_prompt | 270 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Craft registration consumes the canonical vessel/statistics definitions. |
| E-AUDIT-271 | hard_prompt | 271 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Craft registration consumes the canonical vessel/statistics definitions. |
| E-AUDIT-272 | hard_prompt | 272 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Craft registration consumes the canonical vessel/statistics definitions. |
| E-AUDIT-273 | hard_prompt | 273 -> 161;162;262 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | PDF wing registration consumes vessel and fighter-wing contracts. |
| E-AUDIT-274 | hard_prompt | 274 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Craft registration consumes the canonical vessel/statistics definitions. |
| E-AUDIT-275 | hard_prompt | 275 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Craft registration consumes the canonical vessel/statistics definitions. |
| E-AUDIT-275B | hard_prompt | 275b -> 275a | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Dispatch Desk restoration consumes the optional Press station contract. |
| E-AUDIT-276 | hard_prompt | 276 -> 053;166 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Union assignment consumes the configured Union substitution and role binding. |
| E-AUDIT-277 | hard_prompt | 277 -> 053;166 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Union assignment consumes the configured Union substitution and role binding. |
| E-AUDIT-278 | hard_prompt | 278 -> 166;234 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Extra-ship Captain workspaces consume role binding and small-ship rules. |
| E-AUDIT-279 | hard_prompt | 279 -> 166;252 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Expansion role workspaces consume role binding and expansion mode. |
| E-AUDIT-280 | hard_prompt | 280 -> 060;166 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Replacement workspaces consume authoritative casting and role-action binding. |
| E-AUDIT-282 | hard_prompt | 282 -> 281 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Chart selection consumes the immutable chart graph. |
| E-AUDIT-283 | hard_prompt | 283 -> 281;282 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | System codes consume the selected chart graph. |
| E-AUDIT-284 | hard_prompt | 284 -> 283;006 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Unknown-system redaction consumes chart lookup and projection authority. |
| E-AUDIT-285 | hard_prompt | 285 -> 281 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Per-ship position consumes the canonical graph nodes. |
| E-AUDIT-286 | hard_prompt | 286 -> 285 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Fleet-group identity is attached to authoritative ship positions. |
| E-AUDIT-287 | hard_prompt | 287 -> 281;285 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Jump distance consumes graph adjacency and current position. |
| E-AUDIT-288 | hard_prompt | 288 -> 162;287 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Jump cost consumes printed vessel statistics and distance. |
| E-AUDIT-289 | hard_prompt | 289 -> 177;287 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Jump readiness consumes the existing jump-drive contract and distance. |
| E-AUDIT-290 | hard_prompt | 290 -> 287;103 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Once-per-turn jump state consumes distance and turn transitions. |
| E-AUDIT-291 | hard_prompt | 291 -> 288;167 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Atomic fuel reservation consumes jump cost and request-envelope identity. |
| E-AUDIT-293 | hard_prompt | 293 -> 281;282;285 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Printed reachability consumes selected graph and current position. |
| E-AUDIT-294 | hard_prompt | 294 -> 287-293 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Independent jump execution composes distance, cost, readiness, validation, reachability, and reservation. |
| E-AUDIT-296 | hard_prompt | 296 -> 289;291 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Denials consume readiness and atomic fuel reservation. |
| E-AUDIT-297 | hard_prompt | 297 -> 289;294;130 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Damaged-drive randomness consumes jump authority and the common damage path. |
| E-AUDIT-298 | hard_prompt | 298 -> 289;124 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Upgrade behavior consumes jump readiness and authoritative upgrades. |
| E-AUDIT-300 | hard_prompt | 300 -> 289;291 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Emergency jump consumes jump readiness and atomic fuel reservation. |
| E-AUDIT-301 | hard_prompt | 301 -> 291;294 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Concurrent jumps compose reservation and committed jump execution. |
| E-AUDIT-302 | hard_prompt | 302 -> 294;167 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Jump events consume committed execution and the standard action envelope. |
| E-AUDIT-303 | hard_prompt | 303 -> 289;294 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Jump-button truthfulness consumes readiness and committed jump state. |
| E-AUDIT-304 | hard_prompt | 304 -> 294;291;302 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Retry reconciliation consumes committed jump, reservation, and event identity. |
| E-AUDIT-305 | hard_prompt | 305 -> 103 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Pursuit rise occurs at the committed turn transition. |
| E-AUDIT-306 | hard_prompt | 306 -> 281;285;305 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Chart-depth reduction consumes graph distance, ship position, and pursuit timing. |
| E-AUDIT-307 | hard_prompt | 307 -> 286;305 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Split pursuit consumes group identity and pursuit transition. |
| E-AUDIT-308 | hard_prompt | 308 -> 306 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Location exceptions consume chart-depth pursuit calculation. |
| E-AUDIT-309 | hard_prompt | 309 -> 306 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Location exceptions consume chart-depth pursuit calculation. |
| E-AUDIT-310 | hard_prompt | 310 -> 313;315 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Repeatable system missions consume history and first-arrival eligibility. |
| E-AUDIT-311 | hard_prompt | 311 -> 313;315 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Repeatable system missions consume history and first-arrival eligibility. |
| E-AUDIT-312 | hard_prompt | 312 -> 283;313 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Outpost pressure consumes system identity and persisted history. |
| E-AUDIT-313 | hard_prompt | 313 -> 281;283 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | System history is keyed by canonical graph and system-code identity. |
| E-AUDIT-314 | hard_prompt | 314 -> 285 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Destroyed ships are removed from authoritative position state. |
| E-AUDIT-315 | hard_prompt | 315 -> 283;313 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | First-arrival eligibility consumes system identity and history. |
| E-AUDIT-316 | hard_prompt | 316 -> 313;315 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Arrival idempotency composes history and mission eligibility. |
| E-AUDIT-317 | hard_prompt | 317 -> 114;313 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Environmental maintenance uses ordered maintenance and authoritative location history. |
| E-AUDIT-318 | hard_prompt | 318 -> 313 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Candidate discovery consumes persisted system history. |
| E-AUDIT-319 | hard_prompt | 319 -> 318 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Turn 6 planning consumes candidate discovery. |
| E-AUDIT-320 | hard_prompt | 320 -> 281;282;294;313;316 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | The jump-and-system proof composes chart, jump, history, and arrival contracts. |
| E-AUDIT-321 | hard_prompt | 321 -> 260;267;269;280 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Scout entitlements consume the registered eligible craft and replacement role. |
| E-AUDIT-322 | hard_prompt | 322 -> 321;177 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Starlight scan consumes scout entitlement and AEGIS position authority. |
| E-AUDIT-323 | hard_prompt | 323 -> 321;322 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | The second scan consumes entitlement and the first-scan contract. |
| E-AUDIT-324 | hard_prompt | 324 -> 321;216 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Hummingbird scan consumes entitlement and Quellon identity. |
| E-AUDIT-325 | hard_prompt | 325 -> 321;267 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Endeavour scan consumes entitlement and Endeavour identity. |
| E-AUDIT-326 | hard_prompt | 326 -> 321;280;177 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Comms Officer scan consumes entitlement, replacement role, and AEGIS position. |
| E-AUDIT-327 | hard_prompt | 327 -> 321;285 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Scout range consumes entitlement and current authoritative position. |
| E-AUDIT-328 | hard_prompt | 328 -> 321;327;006 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Private scout results consume entitlement/range and projection authority. |
| E-AUDIT-329 | hard_prompt | 329 -> 283;328 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Facilitator reveal consumes chart lookup and private scout result state. |
| E-AUDIT-330 | hard_prompt | 330 -> 313;328 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Discovery notes consume history and private scout results. |
| E-AUDIT-331 | hard_prompt | 331 -> 167;328;330 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Scouting audit consumes action identity, result privacy, and persisted notes. |
| E-AUDIT-332 | hard_prompt | 332 -> 313;328 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Deep Nebula scan accumulation consumes history and private scout results. |
| E-AUDIT-333 | hard_prompt | 333 -> 332 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Hidden Nebula total consumes the accumulated private state. |
| E-AUDIT-334 | hard_prompt | 334 -> 315;313 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Exploration rewards consume arrival eligibility and history. |
| E-AUDIT-335 | hard_prompt | 335 -> 315;313 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Exploration rewards consume arrival eligibility and history. |
| E-AUDIT-336 | hard_prompt | 336 -> 285;286;294 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Partial arrival split consumes position, group, and committed jump state. |
| E-AUDIT-337 | hard_prompt | 337 -> 286;006 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Group-local roster consumes group identity and projection authority. |
| E-AUDIT-338 | hard_prompt | 338 -> 337 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Cross-group denial consumes the group-local roster. |
| E-AUDIT-339 | hard_prompt | 339 -> 337 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Cross-group denial consumes the group-local roster. |
| E-AUDIT-340 | hard_prompt | 340 -> 337;339 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Local Coordination messaging consumes local roster and cross-group denial. |
| E-AUDIT-341 | hard_prompt | 341 -> 337;100 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Group-local Team actions consume the group projection and existing Team action metadata; Coordination gating is a separate contract. |
| E-AUDIT-342 | hard_prompt | 342 -> 336;337 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Audience-scoped announcements consume split and group projection. |
| E-AUDIT-343 | hard_prompt | 343 -> 321;336 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Scout taxi consumes scout entitlement and split state. |
| E-AUDIT-344 | hard_prompt | 344 -> 343 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Taxi fuel and illegal-route denial extend scout taxi authority. |
| E-AUDIT-345 | hard_prompt | 345 -> 343 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Taxi fuel and illegal-route denial extend scout taxi authority. |
| E-AUDIT-346 | hard_prompt | 346 -> 285;336 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Rejoin eligibility consumes current position and split state. |
| E-AUDIT-347 | hard_prompt | 347 -> 346 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Membership merge consumes rejoin eligibility. |
| E-AUDIT-349 | hard_prompt | 349 -> 339;347 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Communication restoration follows denial and committed merge. |
| E-AUDIT-350 | hard_prompt | 350 -> 346;347 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Split/rejoin retries compose eligibility and merge identity. |
| E-AUDIT-352 | hard_prompt | 352 -> 294 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Transit presentation consumes authoritative jump departure state. |
| E-AUDIT-361 | hard_prompt | 361 -> 161;162 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | The craft manifest is typed by vessel and printed statistics. |
| E-AUDIT-362 | hard_prompt | 362 -> 361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Control transfer consumes the craft manifest. |
| E-AUDIT-363 | hard_prompt | 363 -> 361;362 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Holder-based docking consumes manifest and current-holder authority. |
| E-AUDIT-364 | hard_prompt | 364 -> 142;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Team-start docking consumes Team docking and manifest authority. |
| E-AUDIT-365 | hard_prompt | 365 -> 141;363 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Departure consumes open airspace and holder-based docking. |
| E-AUDIT-366 | hard_prompt | 366 -> 365 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Transit begins from an authorized departure. |
| E-AUDIT-367 | hard_prompt | 367 -> 366;313 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Arrival consumes transit state and persisted visit history. |
| E-AUDIT-368 | hard_prompt | 368 -> 366 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Retargeting consumes authoritative transit state. |
| E-AUDIT-369 | hard_prompt | 369 -> 361;363 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Shuttle fuelling consumes manifest and host/dock authority. |
| E-AUDIT-370 | hard_prompt | 370 -> 369;128 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Shuttle-fuel expiry consumes fuelling state and rollover expiry. |
| E-AUDIT-371 | hard_prompt | 371 -> 145;146;366 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Restriction parking consumes attack lock, tie policy, and transit state. |
| E-AUDIT-372 | hard_prompt | 372 -> 145;275a | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | The SNN exception consumes the airspace restriction and optional Press station. |
| E-AUDIT-373 | hard_prompt | 373 -> 145;147 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Attack parking consumes airspace lock and combat-capability filtering. |
| E-AUDIT-374 | hard_prompt | 374 -> 130;373 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Shuttle damage immunity is evaluated alongside damage draws and attack parking. |
| E-AUDIT-375 | hard_prompt | 375 -> 361;369 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Ordinary bay capacity consumes manifest and fuelling eligibility. |
| E-AUDIT-376 | hard_prompt | 376 -> 126;369 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | AEGIS bay capacity consumes dual-bay and fuelling contracts. |
| E-AUDIT-377 | hard_prompt | 377 -> 164;361;363 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Cargo transfer consumes permissions, manifest, and dock authority. |
| E-AUDIT-378 | hard_prompt | 378 -> 377 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Security semantics and invalid-move denial extend cargo transfer. |
| E-AUDIT-379 | hard_prompt | 379 -> 377 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Security semantics and invalid-move denial extend cargo transfer. |
| E-AUDIT-380 | hard_prompt | 380 -> 365;366;367 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Movement conflict recovery consumes departure, transit, and arrival states. |
| E-AUDIT-381 | hard_prompt | 381 -> 263;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Philia repair consumes craft registration and manifest authority. |
| E-AUDIT-382 | hard_prompt | 382 -> 266;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Blacksmith repair consumes craft registration and manifest authority. |
| E-AUDIT-383 | hard_prompt | 383 -> 271;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Chacau repair consumes craft registration and manifest authority. |
| E-AUDIT-384 | hard_prompt | 384 -> 275;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Ally repair consumes craft registration and manifest authority. |
| E-AUDIT-385 | hard_prompt | 385 -> 361;377 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Dismantling consumes manifest and permissioned cargo/action authority. |
| E-AUDIT-386 | hard_prompt | 386 -> 361;369 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Service recharge consumes manifest and fuelling eligibility. |
| E-AUDIT-387 | hard_prompt | 387 -> 386 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Immediate effects follow committed recharge. |
| E-AUDIT-388 | hard_prompt | 388 -> 265;111 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Highwall mining consumes craft identity and typed resource ledgers. |
| E-AUDIT-389 | hard_prompt | 389 -> 265;426 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Highwall combat consumes craft identity and attack composition. |
| E-AUDIT-390 | hard_prompt | 390 -> 269;111 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Hummingbird harvesting consumes craft identity and typed ledgers. |
| E-AUDIT-391 | hard_prompt | 391 -> 267;165;124 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Endeavour upgrades consume craft identity, console metadata, and upgrade authority. |
| E-AUDIT-392 | hard_prompt | 392 -> 401 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Craft mission bonuses consume mission eligibility and contribution identity. |
| E-AUDIT-393 | hard_prompt | 393 -> 401 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Craft mission bonuses consume mission eligibility and contribution identity. |
| E-AUDIT-394 | hard_prompt | 394 -> 261;466 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Pallas boarding support consumes craft identity and boarding defence. |
| E-AUDIT-395 | hard_prompt | 395 -> 272;466 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Chepu boarding support consumes craft identity and boarding defence. |
| E-AUDIT-396 | hard_prompt | 396 -> 262;182 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Fighter state consumes wing registration and combat-console registration. |
| E-AUDIT-397 | hard_prompt | 397 -> 264;182 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Maliades state consumes craft and combat-console registration. |
| E-AUDIT-398 | hard_prompt | 398 -> 273;182 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | PDF wing state consumes wing and combat-console registration. |
| E-AUDIT-399 | hard_prompt | 399 -> 253;164 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara craft actions consume expansion identity and cargo permissions. |
| E-AUDIT-400 | hard_prompt | 400 -> 253;164 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara craft actions consume expansion identity and cargo permissions. |
| E-AUDIT-401 | hard_prompt | 401 -> 315;361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Mission eligibility consumes first-arrival state and craft manifest. |
| E-AUDIT-403 | hard_prompt | 403 -> 402 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Private card dealing consumes the authoritative mission deck. |
| E-AUDIT-404 | hard_prompt | 404 -> 403 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Private card operations consume private initial hands. |
| E-AUDIT-405 | hard_prompt | 405 -> 403 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Private card operations consume private initial hands. |
| E-AUDIT-406 | hard_prompt | 406 -> 403 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Private card operations consume private initial hands. |
| E-AUDIT-407 | hard_prompt | 407 -> 403;405 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Opportunity assignment consumes private hands and request state. |
| E-AUDIT-408 | hard_prompt | 408 -> 402 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Facilitator cards consume the mission deck. |
| E-AUDIT-409 | hard_prompt | 409 -> 407;408 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Opportunity totals consume player and facilitator card assignments. |
| E-AUDIT-410 | hard_prompt | 410 -> 409 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Bonus, empty, and critical branches consume opportunity totals. |
| E-AUDIT-411 | hard_prompt | 411 -> 409 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Bonus, empty, and critical branches consume opportunity totals. |
| E-AUDIT-412 | hard_prompt | 412 -> 409 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Bonus, empty, and critical branches consume opportunity totals. |
| E-AUDIT-413 | hard_prompt | 413 -> 409 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Rewards and overruns consume resolved opportunity totals. |
| E-AUDIT-414 | hard_prompt | 414 -> 409 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Rewards and overruns consume resolved opportunity totals. |
| E-AUDIT-415 | hard_prompt | 415 -> 413 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Oversized drop-off consumes mission custody. |
| E-AUDIT-416 | hard_prompt | 416 -> 281;283 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Mission-system entries consume the canonical graph and code registry. |
| E-AUDIT-417 | hard_prompt | 417 -> 281;283 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Mission-system entries consume the canonical graph and code registry. |
| E-AUDIT-418 | hard_prompt | 418 -> 281;283 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Mission-system entries consume the canonical graph and code registry. |
| E-AUDIT-419 | hard_prompt | 419 -> 281;283 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Mission-system entries consume the canonical graph and code registry. |
| E-AUDIT-420 | hard_prompt | 420 -> 281;283 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Mission-system entries consume the canonical graph and code registry. |
| E-AUDIT-421 | hard_prompt | 421 -> 281;283 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Mission-system entries consume the canonical graph and code registry. |
| E-AUDIT-421A | hard_prompt | 421a -> 281;283 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Mission-system entries consume the canonical graph and code registry. |
| E-AUDIT-422 | hard_prompt | 422 -> 401;409;415;410;411;412;414;622 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Away-mission proof composes eligibility, totals, reward custody, bonus/failure branches, overrun custody, and mission reconnect. |
| E-AUDIT-423 | hard_prompt | 423 -> 361;367;371;373;352;353;368;377;156;380 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Shuttle-airspace proof composes manifest, arrival, parking, attack parking, transit/contact presentation, retarget, transfer, reopen, and conflict reconciliation. |
| E-AUDIT-424 | hard_prompt | 424 -> 336;337;328;347;338;339;343;401;409;307 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Split-fleet proof composes split/roster state, scouting, jump, privacy, communications, scout taxi, mission eligibility/totals, and group-isolated pursuit. |
| E-AUDIT-426 | hard_prompt | 426 -> 425 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Attack composition consumes the Wolf ship catalog. |
| E-AUDIT-427 | hard_prompt | 427 -> 426 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Private attack preparation consumes attack composition. |
| E-AUDIT-428 | hard_prompt | 428 -> 425;426 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Combat math consumes Wolf catalog and composition. |
| E-AUDIT-429 | hard_prompt | 429 -> 425;428 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Targeting consumes Wolf catalog and centralized combat math. |
| E-AUDIT-430 | hard_prompt | 430 -> 425;428 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Targeting consumes Wolf catalog and centralized combat math. |
| E-AUDIT-431 | hard_prompt | 431 -> 425;428 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Targeting consumes Wolf catalog and centralized combat math. |
| E-AUDIT-432 | hard_prompt | 432 -> 427;428 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Atomic attack declaration consumes prepared composition and combat math. |
| E-AUDIT-432A | hard_prompt | 432a -> 432 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | GM attack operation consumes the declared attack state. |
| E-AUDIT-433 | hard_prompt | 433 -> 432 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Audience projection consumes declared attack state. |
| E-AUDIT-433A | hard_prompt | 433a -> 432;433 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | The stable DRADIS attack contract consumes declared and projected attack state. |
| E-AUDIT-433B | hard_prompt | 433b -> 433 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Affected-console choices consume audience-safe attack projection. |
| E-AUDIT-434 | hard_prompt | 434 -> 432 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Attack retry safety consumes atomic declaration. |
| E-AUDIT-434A | hard_prompt | 434a -> 432a;434 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Intervention consumes GM operation and retry-safe attack state. |
| E-AUDIT-437 | hard_prompt | 437 -> 426;428;240 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Force-field timing consumes composition/math and the registered projector. |
| E-AUDIT-438 | hard_prompt | 438 -> 432;428 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Range resolution consumes declared attack and combat math. |
| E-AUDIT-439 | hard_prompt | 439 -> 432;428 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Range resolution consumes declared attack and combat math. |
| E-AUDIT-440 | hard_prompt | 440 -> 432;428 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Range resolution consumes declared attack and combat math. |
| E-AUDIT-441 | hard_prompt | 441 -> 438;439;440 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Five-step order consumes the three range resolvers. |
| E-AUDIT-442 | hard_prompt | 442 -> 438;439;440;130 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Destruction effects consume range resolution and damage draws. |
| E-AUDIT-443 | hard_prompt | 443 -> 440;396 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Short-range fighter priority consumes short-range order and fighter state. |
| E-AUDIT-444 | hard_prompt | 444 -> 441;442 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Range audit consumes ordered resolution and destruction effects. |
| E-AUDIT-445 | hard_prompt | 445 -> 441;182 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | AEGIS missile actions consume attack order and combat-console registration. |
| E-AUDIT-446 | hard_prompt | 446 -> 445 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Enriched warheads extend missile-launcher authority. |
| E-AUDIT-447 | hard_prompt | 447 -> 441;182 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | AEGIS missile actions consume attack order and combat-console registration. |
| E-AUDIT-448 | hard_prompt | 448 -> 441;182 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Point Defence consumes attack order and combat-console registration. |
| E-AUDIT-449 | hard_prompt | 449 -> 443;396 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Fighter launch consumes short-range priority and wing state. |
| E-AUDIT-450 | hard_prompt | 450 -> 449 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Fleet-fighter actions consume fighter launch authority. |
| E-AUDIT-451 | hard_prompt | 451 -> 449 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Fleet-fighter actions consume fighter launch authority. |
| E-AUDIT-452 | hard_prompt | 452 -> 449 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Fleet-fighter actions consume fighter launch authority. |
| E-AUDIT-453 | hard_prompt | 453 -> 264;397 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Maliades combat consumes craft and Maliades state. |
| E-AUDIT-454 | hard_prompt | 454 -> 265 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Highwall combat consumes Highwall craft identity. |
| E-AUDIT-455 | hard_prompt | 455 -> 239;441 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Gorgoneion missiles consume registration and attack order. |
| E-AUDIT-456 | hard_prompt | 456 -> 273;449 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | PDF launch consumes wing registration and fighter launch authority. |
| E-AUDIT-457 | hard_prompt | 457 -> 456 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | PDF range actions consume PDF launch authority. |
| E-AUDIT-458 | hard_prompt | 458 -> 456 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | PDF range actions consume PDF launch authority. |
| E-AUDIT-459 | hard_prompt | 459 -> 400;441 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Boa combat consumes craft identity and attack order. |
| E-AUDIT-460 | hard_prompt | 460 -> 399;466 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Macaw boarding consumes craft identity and boarding defence. |
| E-AUDIT-461 | hard_prompt | 461 -> 261;272;363 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Boarding relocation consumes craft identities and docking authority. |
| E-AUDIT-462 | hard_prompt | 462 -> 361;386 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Engineering support consumes manifest and service recharge. |
| E-AUDIT-463 | hard_prompt | 463 -> 394;395;428 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Boarding rerolls consume support actions and combat randomness. |
| E-AUDIT-464 | hard_prompt | 464 -> 435;466 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Commander boarding consumes rerolls and boarding defence. |
| E-AUDIT-465 | hard_prompt | 465 -> 426;428 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Assault Transport drop consumes composition and combat math. |
| E-AUDIT-466 | hard_prompt | 466 -> 378;465 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Security defence consumes team semantics and boarder drop. |
| E-AUDIT-467 | hard_prompt | 467 -> 466 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Boarder damage follows security defence. |
| E-AUDIT-468 | hard_prompt | 468 -> 466;280 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Militia defence consumes boarding defence and replacement-role identity. |
| E-AUDIT-469 | hard_prompt | 469 -> 442 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf-ship destruction consumes range-specific destruction effects. |
| E-AUDIT-469A | hard_prompt | 469a -> 442 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf-ship destruction consumes range-specific destruction effects. |
| E-AUDIT-469B | hard_prompt | 469b -> 442 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf-ship destruction consumes range-specific destruction effects. |
| E-AUDIT-469C | hard_prompt | 469c -> 442 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf-ship destruction consumes range-specific destruction effects. |
| E-AUDIT-469D | hard_prompt | 469d -> 442 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf-ship destruction consumes range-specific destruction effects. |
| E-AUDIT-469E | hard_prompt | 469e -> 442 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf-ship destruction consumes range-specific destruction effects. |
| E-AUDIT-470 | hard_prompt | 470 -> 469 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Surviving fighters follow Wolf-fighter destruction. |
| E-AUDIT-471 | hard_prompt | 471 -> 469e;442 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Battlestation immunity consumes its destruction branch and combat effects. |
| E-AUDIT-472 | hard_prompt | 472 -> 469d;470 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Strikecarrier bonus consumes destruction and surviving fighters. |
| E-AUDIT-473 | hard_prompt | 473 -> 469;130 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Surviving Wolf damage consumes destruction state and damage draws. |
| E-AUDIT-474 | hard_prompt | 474 -> 444;473 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Immediate result consumes range audit and surviving-ship damage. |
| E-AUDIT-475 | hard_prompt | 475 -> 130 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Common combat damage reuses the existing damage draw. |
| E-AUDIT-476 | hard_prompt | 476 -> 475 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Combat-deck exhaustion consumes common damage draw. |
| E-AUDIT-477 | hard_prompt | 477 -> 466;467 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Casualties consume boarding defence and boarder damage. |
| E-AUDIT-478 | hard_prompt | 478 -> 477;280 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Doctor mitigation consumes casualties and replacement-role identity. |
| E-AUDIT-479 | hard_prompt | 479 -> 242;477 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Warrior salvage consumes Warrior identity and casualties. |
| E-AUDIT-480 | hard_prompt | 480 -> 253;477 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara Scrap consumes expansion identity and casualties. |
| E-AUDIT-481 | hard_prompt | 481 -> 399;400;480 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Macaw/Boa Scrap consumes craft actions and Scrap result. |
| E-AUDIT-482 | hard_prompt | 482 -> 475 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Post-attack repairs consume common damage state. |
| E-AUDIT-483 | hard_prompt | 483 -> 178;469;396 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Fighter rebuilding consumes construction, destruction, and wing state. |
| E-AUDIT-484 | hard_prompt | 484 -> 474;477;482 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Complete aftermath consumes result, casualties, and repairs. |
| E-AUDIT-485 | hard_prompt | 485 -> 077 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Authoritative pursuit starts from the server-owned initial pursuit. |
| E-AUDIT-485A | hard_prompt | 485a -> 485 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Pursuit color consumes authoritative pursuit state. |
| E-AUDIT-486 | hard_prompt | 486 -> 485;305 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Per-turn pursuit rise consumes authority and transition logic. |
| E-AUDIT-487 | hard_prompt | 487 -> 485;306 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Jump reduction consumes pursuit and chart-depth calculation. |
| E-AUDIT-488 | hard_prompt | 488 -> 485;306 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Pursuit exceptions consume authoritative pursuit calculation. |
| E-AUDIT-489 | hard_prompt | 489 -> 485;306 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Pursuit exceptions consume authoritative pursuit calculation. |
| E-AUDIT-490 | hard_prompt | 490 -> 485;307 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Split-group threat consumes pursuit and group isolation. |
| E-AUDIT-491 | hard_prompt | 491 -> 312 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Outpost/Fortress attacks consume arrival pressure. |
| E-AUDIT-492 | hard_prompt | 492 -> 312 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Outpost/Fortress attacks consume arrival pressure. |
| E-AUDIT-493 | hard_prompt | 493 -> 312 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Station attack consumes arrival pressure. |
| E-AUDIT-494 | hard_prompt | 494 -> 425;435 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Commander attack dial consumes Wolf catalog and reroll authority. |
| E-AUDIT-497 | hard_prompt | 497 -> 495;100 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf action authorization consumes hidden loyalty assignment and the server-derived Wolf count; phase metadata is not its producer. |
| E-AUDIT-498 | hard_prompt | 498 -> 497 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf actions consume one-action-per-turn authorization. |
| E-AUDIT-499 | hard_prompt | 499 -> 497 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Supply sabotage consumes one-action authorization and typed resource ledgers. |
| E-AUDIT-500 | hard_prompt | 500 -> 497 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf actions consume one-action-per-turn authorization. |
| E-AUDIT-501 | hard_prompt | 501 -> 497 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf actions consume one-action-per-turn authorization. |
| E-AUDIT-502 | hard_prompt | 502 -> 497 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf actions consume one-action-per-turn authorization. |
| E-AUDIT-503 | hard_prompt | 503 -> 497;167 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf receipts consume action authorization and action envelopes. |
| E-AUDIT-503A | hard_prompt | 503a -> 497;498 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Hacking overlay consumes authorized Wolf action and sabotage state. |
| E-AUDIT-504 | hard_prompt | 504 -> 502;503 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Suspicion history consumes clue results and receipts. |
| E-AUDIT-505 | hard_prompt | 505 -> 280;501 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Investigation consumes replacement-role identity and private Wolf intelligence. |
| E-AUDIT-506 | hard_prompt | 506 -> 505;428 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Investigation randomness consumes investigator action and server randomness. |
| E-AUDIT-507 | hard_prompt | 507 -> 505;502 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Investigator suspicion consumes investigation and clue rolls. |
| E-AUDIT-508 | hard_prompt | 508 -> 214;506 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Detector tests consume the device and randomness ownership. |
| E-AUDIT-513 | hard_prompt | 513 -> 497 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf actions consume one-action-per-turn authorization. |
| E-AUDIT-514 | hard_prompt | 514 -> 513;098 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Arrest deadline consumes posse calculation and idempotent expiry. |
| E-AUDIT-515 | hard_prompt | 515 -> 060;062 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Replacement role assignment consumes casting and pre-start reassignment. |
| E-AUDIT-516 | hard_prompt | 516 -> 515;326 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Comms Officer activation consumes replacement role and scout action. |
| E-AUDIT-517 | hard_prompt | 517 -> 515;190 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | VIP Host activation consumes replacement role and VIP card ownership. |
| E-AUDIT-518 | hard_prompt | 518 -> 515 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Commissar activation consumes replacement role. |
| E-AUDIT-519 | hard_prompt | 519 -> 515;468 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Militia activation consumes replacement role and defence behavior. |
| E-AUDIT-520 | hard_prompt | 520 -> 515;456 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Fighter Ace activation consumes replacement role and PDF launch. |
| E-AUDIT-521 | hard_prompt | 521 -> 515;494 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf Commander powers consume replacement role and attack dial. |
| E-AUDIT-521A | hard_prompt | 521a -> 521 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Commander address consumes Commander powers. |
| E-AUDIT-521B | hard_prompt | 521b -> 521a | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Commander amnesty consumes the address state. |
| E-AUDIT-522 | hard_prompt | 522 -> 044;045 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Facilitator ownership consumes eligibility and GM instance authority. |
| E-AUDIT-523 | hard_prompt | 523 -> 522;167 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Facilitator calls consume ownership and action envelopes. |
| E-AUDIT-523A | hard_prompt | 523a -> 522 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Difficulty configuration consumes facilitator ownership. |
| E-AUDIT-523B | hard_prompt | 523b -> 522 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Difficulty configuration consumes facilitator ownership. |
| E-AUDIT-523C | hard_prompt | 523c -> 522 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Difficulty configuration consumes facilitator ownership. |
| E-AUDIT-524 | hard_prompt | 524 -> 485;497;522 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf/deduction proof composes pursuit, Wolf actions, and facilitator ownership. |
| E-AUDIT-524A | hard_prompt | 524a -> 193b | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Political capital consumes the President workspace. |
| E-AUDIT-524B | hard_prompt | 524b -> 524a | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | President address consumes political capital. |
| E-AUDIT-524C | hard_prompt | 524c -> 524b | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Presidential visit consumes the address. |
| E-AUDIT-524D | hard_prompt | 524d -> 524c;044 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Presidential authority boundaries consume visit and eligibility. |
| E-AUDIT-525 | hard_prompt | 525 -> 008;522 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Crisis state machine consumes lifecycle state and facilitator ownership. |
| E-AUDIT-526 | hard_prompt | 526 -> 525 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Crisis configuration consumes the crisis state machine. |
| E-AUDIT-527 | hard_prompt | 527 -> 525 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each crisis delivery consumes the crisis state machine. |
| E-AUDIT-528 | hard_prompt | 528 -> 527 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Approaching Vessel choices consume its delivered state. |
| E-AUDIT-529 | hard_prompt | 529 -> 249;527 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Voyage arrival consumes Voyage admission and crisis delivery. |
| E-AUDIT-530 | hard_prompt | 530 -> 525 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each crisis delivery consumes the crisis state machine. |
| E-AUDIT-531 | hard_prompt | 531 -> 530;149 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Quarantine policy consumes Disease Outbreak and docking restrictions. |
| E-AUDIT-532 | hard_prompt | 532 -> 525 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each crisis delivery consumes the crisis state machine. |
| E-AUDIT-533 | hard_prompt | 533 -> 532 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Zealotry response consumes its delivered crisis. |
| E-AUDIT-534 | hard_prompt | 534 -> 525 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each crisis delivery consumes the crisis state machine. |
| E-AUDIT-535 | hard_prompt | 535 -> 534 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Civil Unrest resolution consumes its delivered crisis. |
| E-AUDIT-536 | hard_prompt | 536 -> 525 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Each crisis delivery consumes the crisis state machine. |
| E-AUDIT-537 | hard_prompt | 537 -> 536 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Election procedure consumes election delivery. |
| E-AUDIT-538 | hard_prompt | 538 -> 537 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Private election resolution consumes election procedure. |
| E-AUDIT-539 | hard_prompt | 539 -> 538;101 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Binding resolution announcement consumes private resolution and lifecycle announcement. |
| E-AUDIT-540 | hard_prompt | 540 -> 525;528;531;533;535;538 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Crisis proof composes the state machine and each resolved branch. |
| E-AUDIT-541 | hard_prompt | 541 -> 318;525 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Candidate reveal consumes discovery and crisis/session state. |
| E-AUDIT-542 | hard_prompt | 542 -> 541 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Candidate retry safety consumes candidate reveal. |
| E-AUDIT-543 | hard_prompt | 543 -> 541;319 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Candidate plans consume reveal and Turn 6 checkpoint. |
| E-AUDIT-544 | hard_prompt | 544 -> 541 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Ring prerequisites consume candidate state. |
| E-AUDIT-545 | hard_prompt | 545 -> 544;211;361;111 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Ring repair consumes prerequisites, research, craft, and materials. |
| E-AUDIT-546 | hard_prompt | 546 -> 545 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Contribution uniqueness consumes Ring repair state. |
| E-AUDIT-547 | hard_prompt | 547 -> 545;111 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Ring fuel consumes repair and typed ledgers. |
| E-AUDIT-548 | hard_prompt | 548 -> 546;547 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Ring passage consumes unique contributions and fuel. |
| E-AUDIT-549 | hard_prompt | 549 -> 548;485 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Blocked pursuit consumes passage and pursuit authority. |
| E-AUDIT-550 | hard_prompt | 550 -> 328;332 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Deep Nebula accumulation consumes private scouting and hidden scan state. |
| E-AUDIT-551 | hard_prompt | 551 -> 550;287-304 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Nebula jump consumes scouting threshold and common jump authority. |
| E-AUDIT-552 | hard_prompt | 552 -> 551;140d | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Nebula loss consumes jump state and destruction/pod flow. |
| E-AUDIT-553 | hard_prompt | 553 -> 551;552 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Nebula threshold consumes attempts and loss state. |
| E-AUDIT-554 | hard_prompt | 554 -> 551;553 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Repeat prevention consumes Nebula attempt and threshold state. |
| E-AUDIT-555 | hard_prompt | 555 -> 493;432 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Station combat consumes station attack trigger and attack declaration. |
| E-AUDIT-556 | hard_prompt | 556 -> 555 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Repeat Station combat consumes the first combat state. |
| E-AUDIT-557 | hard_prompt | 557 -> 556 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Liberation consumes surviving Station combat. |
| E-AUDIT-558 | hard_prompt | 558 -> 557 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Station Reactor contributions consume liberation state. |
| E-AUDIT-559 | hard_prompt | 559 -> 558 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Station power consumes Reactor contributions. |
| E-AUDIT-560 | hard_prompt | 560 -> 105 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Pursuit-failure freeze consumes terminal failure state. |
| E-AUDIT-561 | hard_prompt | 561 -> 560 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Total-loss distinction consumes the frozen terminal state. |
| E-AUDIT-562 | hard_prompt | 562 -> 561;140e | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Survivor outcomes consume total-loss evaluation and escape state. |
| E-AUDIT-563 | hard_prompt | 563 -> 562;541 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Candidate results consume survivors and candidate state. |
| E-AUDIT-564 | hard_prompt | 564 -> 563 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Debrief consumes resolved outcomes. |
| E-AUDIT-565 | hard_prompt | 565 -> 560;564 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Closure consumes terminal failure/debrief state. |
| E-AUDIT-566 | hard_prompt | 566 -> 565 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Debrief read access consumes authoritative closure. |
| E-AUDIT-567 | hard_prompt | 567 -> 252 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara mode revalidation consumes expansion-mode gating. |
| E-AUDIT-568 | hard_prompt | 568 -> 163;567 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Scrap access consumes optional resource and Capybara mode. |
| E-AUDIT-569 | hard_prompt | 569 -> 567;253 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara casting consumes mode and expansion identity. |
| E-AUDIT-570 | hard_prompt | 570 -> 569 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara targeting consumes Capybara role/casting. |
| E-AUDIT-571 | hard_prompt | 571 -> 114;253;569 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara maintenance consumes ordered maintenance, identity, and casting. |
| E-AUDIT-572 | hard_prompt | 572 -> 571 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara thresholds consume maintenance state. |
| E-AUDIT-573 | hard_prompt | 573 -> 571;130 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara damage consumes maintenance and common damage draws. |
| E-AUDIT-574 | hard_prompt | 574 -> 369;399 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Macaw refuelling consumes fuelling and Macaw identity. |
| E-AUDIT-575 | hard_prompt | 575 -> 399 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Macaw repairs consume Macaw identity. |
| E-AUDIT-576 | hard_prompt | 576 -> 385;575 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Macaw dismantling consumes permissioned dismantling and repairs. |
| E-AUDIT-577 | hard_prompt | 577 -> 164;377;399 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Macaw cargo consumes permissions, transfer, and craft identity. |
| E-AUDIT-578 | hard_prompt | 578 -> 400 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Boa recycling consumes Boa identity. |
| E-AUDIT-579 | hard_prompt | 579 -> 578 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Boa reclamation consumes recycling state. |
| E-AUDIT-580 | hard_prompt | 580 -> 459;578 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Boa combat consumes range action and recycling craft state. |
| E-AUDIT-581 | hard_prompt | 581 -> 573;577 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Scrap pickups consume damage and cargo state. |
| E-AUDIT-582 | hard_prompt | 582 -> 569;006 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara objectives consume casting and private projection. |
| E-AUDIT-583 | hard_prompt | 583 -> 234a;569 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara balance consumes facilitator dial and Capybara casting. |
| E-AUDIT-584 | hard_prompt | 584 -> 567;571;577;580 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara proof composes mode, maintenance, cargo, and combat. |
| E-AUDIT-585 | hard_prompt | 585 -> 567;584 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Mode-isolation proof consumes mode and Capybara proof. |
| E-AUDIT-589 | hard_prompt | 589 -> 586 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Ground rules follow roster configuration. |
| E-AUDIT-590 | hard_prompt | 590 -> 589 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Core-loop help consumes ground rules. |
| E-AUDIT-591 | hard_prompt | 591 -> 161;162;114 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Vessel help consumes vessel definitions and maintenance order. |
| E-AUDIT-592 | hard_prompt | 592 -> 361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Craft help consumes the authoritative manifest. |
| E-AUDIT-593 | hard_prompt | 593 -> 541 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Candidate help consumes candidate state. |
| E-AUDIT-594 | hard_prompt | 594 -> 168 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Facilitator-decision labels consume the ambiguity ledger. |
| E-AUDIT-598 | hard_prompt | 598 -> 041;042 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Connectivity truth consumes local and queued disconnect contracts. |
| E-AUDIT-599 | hard_prompt | 599 -> 586;589 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Setup checklist consumes roster configuration and ground rules. |
| E-AUDIT-600 | hard_prompt | 600 -> 590;599 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Onboarding proof composes core-loop help and setup checklist. |
| E-AUDIT-603 | hard_prompt | 603 -> 361 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Narrow-console layout composes shared vessel/craft console data. |
| E-AUDIT-604 | hard_prompt | 604 -> 603 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Short-landscape maintenance extends narrow-console layout. |
| E-AUDIT-605 | hard_prompt | 605 -> 351 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Responsive DRADIS consumes the local-contact presentation contract; sampled transit remains a separate consumer. |
| E-AUDIT-606 | hard_prompt | 606 -> 361;365;367 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Touch shuttle travel consumes manifest, departure, and arrival. |
| E-AUDIT-607 | hard_prompt | 607 -> 289;303 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Keyboard jump controls consume readiness and truthful jump presentation. |
| E-AUDIT-610 | hard_prompt | 610 -> 589a | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Global motion behavior consumes the motion-safety gate. |
| E-AUDIT-611 | hard_prompt | 611 -> 601 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Non-color status extends universal status semantics. |
| E-AUDIT-612 | hard_prompt | 612 -> 088;089 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Persisted resume consumes snapshot ordering and event replay. |
| E-AUDIT-613 | hard_prompt | 613 -> 612 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Invalid persisted-session clearing consumes snapshot hydration. |
| E-AUDIT-615 | hard_prompt | 615 -> 034;612 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Seat reclaim consumes resume and persisted snapshot state. |
| E-AUDIT-616 | hard_prompt | 616 -> 041;042 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Disconnect replay consumes local and queued disconnect contracts. |
| E-AUDIT-617 | hard_prompt | 617 -> 012;089 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Command outbox reconciliation consumes idempotency and replay. |
| E-AUDIT-618 | hard_prompt | 618 -> 084;085;086;612 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Projection reconnect consumes existing audience projections and hydration. |
| E-AUDIT-619 | hard_prompt | 619 -> 542;612 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Candidate retry reconnect consumes candidate retry and hydration. |
| E-AUDIT-620 | hard_prompt | 620 -> 014;088 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Stale revisions consume stale-snapshot semantics and ordering. |
| E-AUDIT-621 | hard_prompt | 621 -> 433;434;612 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Attack recovery consumes attack projection, retry, and hydration. |
| E-AUDIT-622 | hard_prompt | 622 -> 401;402;612 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Away-mission recovery consumes mission eligibility/deck and hydration. |
| E-AUDIT-624 | hard_prompt | 624 -> 623 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Service-worker update safety consumes deep-link behavior. |
| E-AUDIT-630 | hard_prompt | 630 -> 007;019;428 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Randomness proof consumes event/audit envelopes and centralized combat randomness. |
| E-AUDIT-632 | hard_prompt | 632 -> 015 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Payload rejection consumes the command-error taxonomy. |
| E-AUDIT-633 | hard_prompt | 633 -> 012;015 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Retry guidance consumes idempotency and error taxonomy. |
| E-AUDIT-634 | hard_prompt | 634 -> 019;630 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Security denial records consume audit and randomness/security proof. |
| E-AUDIT-635 | hard_prompt | 635 -> 007;019;167 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Action audit records consume event, privacy, and action-envelope contracts. |
| E-AUDIT-636 | hard_prompt | 636 -> 167 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Health measurement consumes standardized action envelopes. |
| E-AUDIT-637 | hard_prompt | 637 -> 009 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Render baselines consume deterministic fixtures. |
| E-AUDIT-639 | hard_prompt | 639 -> 636;638 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | 60-browser exercise consumes health measurement and core capacity target. |
| E-AUDIT-640 | hard_prompt | 640 -> 638;639 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capacity conclusions consume both target exercises. |
| E-AUDIT-642 | hard_prompt | 642 -> 584 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Capybara playthrough consumes the Capybara vertical scenario. |
| E-AUDIT-643 | hard_prompt | 643 -> 424 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Split-fleet playthrough consumes the split exploration proof. |
| E-AUDIT-644 | hard_prompt | 644 -> 423 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Shuttle-airspace playthrough consumes the shuttle-airspace proof. |
| E-AUDIT-645 | hard_prompt | 645 -> 524;484 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Wolf playthrough consumes Wolf/deduction and combat aftermath proofs. |
| E-AUDIT-646 | hard_prompt | 646 -> 422 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Away-mission playthrough consumes the away-mission proof. |
| E-AUDIT-647 | hard_prompt | 647 -> 548;559 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Jump Ring proof consumes passage and Station power. |
| E-AUDIT-648 | hard_prompt | 648 -> 554 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Deep Nebula proof consumes repeat-prevention state. |
| E-AUDIT-649 | hard_prompt | 649 -> 559 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Station proof consumes Station power. |
| E-AUDIT-650 | hard_prompt | 650 -> 560;565;621;622;140c;136;514 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Terminal recovery proof consumes failure/closure, attack recovery, mission recovery, evacuation retry, mutiny, and arrest-deadline producers. |
| E-AUDIT-652 | hard_prompt | 652 -> 106c | src/components/FleetTicker.tsx; src/components/FleetTicker.test.tsx; src/components/FleetBroadcast.test.tsx; src/components/FleetAlert.test.tsx; Chrome CDP matrix /tmp/p652-geometry/geometry.json | Prompt 652 closes the client presentation contract on top of the server-authoritative ticker: queue-only updates reconcile once per message identity, each queued copy reserves its measured width, replacements retain visible tails without intersecting tracks, the status surface stays singular, and reduced-motion copy remains readable. |
| E-AUDIT-652A | hard_prompt | 652a -> 652 | src/components/FleetTicker.tsx; src/components/FleetTicker.test.tsx; src/components/fleetTicker.css; Chrome CDP matrix /tmp/p652a-geometry/geometry.json | Prompt 652a closes the painted-tail repair: moving groups wait for document fonts before measuring, observe frame and hidden copy probes through ResizeObserver, rebase changed painted widths with a delay that preserves the current linear position, extend repeating tails across widened frames, and prove the final painted bounds exit before cleanup. Focused tests cover resize tail extension and font-width rebasing; Chrome CDP evidence covers all four required viewports, reduced motion, narrow-to-wide resize, late font-width change without overlap, and the painted exit boundary. |
| E-AUDIT-652B | hard_prompt | 652b -> 106c;603a;652;652a | src/components/FleetBroadcast.tsx; src/components/FleetTicker.tsx; src/components/FleetBroadcastMobile.test.tsx; src/index.css; docs/AESTHETICS.md; Chrome CDP matrix /tmp/p652b-geometry/geometry.json | Prompt 652b closes the narrow Press ticker presentation: the real AppHeader route keeps the ticker pinned with reserved safe-area/header flow, provides keyboard-reachable hide/reveal, expands a hidden ticker for authoritative Admiral Red Alert and queued airspace restriction triggers, refolds only after the newest trigger display, resets hiding across wide viewports, preserves one readable reduced-motion status, and avoids content overlap or horizontal overflow at every required viewport. Focused unit coverage proves manual hide/reveal, overlapping-trigger sequencing, user reveal persistence, wide reset, and reduced-motion timing; Chrome CDP evidence proves scroll pinning, responsive geometry, keyboard interaction, accessible control removal on wide, and all four viewport sizes. |
| E-AUDIT-656 | hard_prompt | 656 -> 034;050 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Launcher routing consumes session resume and established return paths. |
| E-AUDIT-658 | hard_prompt | 658 -> 030;050 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Seat-change copy consumes authoritative seat claim and return-path context. |
| E-AUDIT-663 | hard_prompt | 663 -> 106c | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Fleetwide Red Alert presentation consumes server-authoritative ticker lifecycle. |
| E-AUDIT-672 | hard_prompt | 672 -> 361;367 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Docking history consumes manifest and authoritative arrival history. |
| E-AUDIT-100 | hard_prompt | 100 -> 113;321;212 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Coordination gating remains incomplete until concrete transfer (113), scouting (321), and research cadence (212, which consumes research tracks 211) are implemented; movement and jump gates already exist. |
| E-AUDIT-154 | hard_prompt | 154 -> 142;141;145;149;336;414 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Airspace transition proof also needs Team-start docking and the mission-overrun restriction producer. |
| E-AUDIT-641 | hard_prompt | 641 -> 159;320;422;524;540 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | The base-game proof requires the foundation, jump/system, away-mission, Wolf, and crisis scenario proofs before it can pass. |
| E-AUDIT-651 | hard_prompt | 651 -> 641-650 | IMPLEMENTATION_PLAN.md - dependency audit 2026-09-12 | Final release-readiness audit requires every preceding release-proof prompt in the 641-650 closure set. |
| E-123-VERIFIED | evidence | 123 -> 122;162 | functions/src/maintenance.ts; functions/src/maintenance.test.ts; functions/src/index.ts runMaintenance; functions/src/maintenanceCallable.test.ts; src/components/MaintenanceSystems.tsx; commit 2dbce28 | The existing production Reactor branch uses per-vessel damagedPenalty values; the client maintenance presentation agrees. Existing seven-vessel capacity tests cover damaged and upgraded boundaries, and the callable suite covers authoritative snapshot inputs, eligibility, replay and persistence. Rechecked on 2026-09-12: 7 focused capacity cases and 40 callable tests pass. No new gameplay implementation or deployment is claimed. |
| E-128-VERIFIED | evidence | 128 -> 103 | functions/src/turnTransition.ts; functions/src/index.ts advanceTurnInTransaction; functions/src/maintenanceCallable.test.ts | Server turn transitions expire the complete stored maintenance/fuel maps independently of resource-owner connection state. Existing callable tests verify charge/fuel expiry, preserve unrelated state, reject stale advancement, replay terminal receipts without writes, and serialize phase observers. The 40-test maintenance callable suite passed on 2026-09-12; this closes existing behavior evidence only. |
| E-130-VERIFIED | evidence | 130 | functions/src/shipDamage.ts; functions/src/shipDamage.test.ts; functions/src/index.ts addShipDamage; functions/src/shipDamageCallable.test.ts; firestore.rules; tests/rules/firestore.rules.test.ts | Existing server resolver and addShipDamage transaction select, apply and log a permitted result without publishing future card order. Tests cover damage effects, recycling, empty decks, invalid decks, authorization and retry-stable randomness/event identity. Verified 34 damage tests and 66 emulator-backed rules tests on 2026-09-12; rules explicitly deny strangers and all client writes to draw results. |
| E-131-VERIFIED | evidence | 131 | functions/src/shipDamage.ts; functions/src/shipDamage.test.ts; functions/src/index.ts addShipDamage/runMaintenance; functions/src/shipDamageCallable.test.ts; functions/src/maintenance.ts; functions/src/maintenance.test.ts; functions/src/maintenanceCallable.test.ts | Existing damage resolution treats an already-exhausted required deck as a terminal destroyed result without inventing a card. Both addShipDamage and runMaintenance use that resolver inside their authoritative transactions, persist the destroyed ship state, and write the durable ship-destroyed draw record. The focused resolver, callable, maintenance, and maintenance-callable suite passed 105 tests on 2026-09-12; this records existing behavior, not a new runtime release. |
| E-163-VERIFIED | evidence | 163 | functions/src/resources.ts; functions/src/resources.test.ts; functions/src/sessionComposition.ts; functions/src/sessionComposition.test.ts; functions/src/index.ts; src/data/resources.ts; src/data/resources.test.ts; src/lib/shipStateProjection.test.ts | Existing production composition and counter tests prove expansion inventory creation, removal on return to base mode, and denial of inactive Scrap mutations. Resource allowlists keep Scrap off other vessels, and join/resume inventories use active-vessel filtering. Verified 28 existing resource/composition/projection tests on 2026-09-12; no new runtime release. |
| E-VESSEL-REACTORS-VERIFIED | evidence | 174;186;196;206;218;226 -> 122;123;125 | functions/src/maintenance.ts; functions/src/maintenance.test.ts; functions/src/shipDamage.ts; functions/src/index.ts runMaintenance; functions/src/maintenanceCallable.test.ts; src/components/MaintenanceSystems.tsx; src/data/vessels/ | The existing shared Reactor implementation consumes per-vessel capacity/penalty rules, known system IDs and server-read upgrades. Registered Reactor damage-card identities agree with the damage resolver; client capacity presentation agrees with server values. Reused the unchanged 2026-09-12 seven-vessel capacity matrix and 40 maintenance callable tests, all passing; this records existing production paths without a new feature release. |
| E-VESSEL-STORAGE-VERIFIED | evidence | 173;185;195;205;217;225 -> 115;183 | functions/src/maintenance.ts; functions/src/maintenance.test.ts; functions/src/shipDamage.ts; functions/src/index.ts runMaintenance; functions/src/maintenanceCallable.test.ts; src/data/vessels/ | Registered vessel Storage identities route to the shared server branch, which rounds losses down and filters docked cargo by the acting ship. The callable transaction commits both stores and cargo. Existing unit evidence verifies rounding and unrelated cargo preservation; the 40-test callable suite verifies committed state, authority and replay/CAS. Rechecked on 2026-09-12; no new runtime behavior. |
| E-183-VERIFIED | evidence | 183 -> 161;162 | functions/src/gameSetup.ts; functions/src/gameSetup.test.ts; functions/src/sessionComposition.ts; functions/src/sessionComposition.test.ts; functions/src/resources.test.ts; src/routes/ShipConsole.test.tsx; src/routes/ShipRoleSelect.test.tsx | Existing setup and roster validation gate Dione at the supported player-count boundary. Active-vessel composition/projections restrict stores and population; disabled console and role routes return to the fleet roster. Verified 14 focused setup/roster cases and 2 disabled-route tests on 2026-09-12, reusing unchanged passing composition/resource evidence. |
| E-122A-VERIFIED | evidence | 122a -> 122;123;124;125;128;138 | src/components/MaintenanceSystems.tsx; src/components/MaintenanceSystems.test.tsx; src/lib/maintenanceService.ts; src/lib/maintenanceService.test.ts; src/index.css; review 39f9dcb | Same-control Reactor confirmation adds a selected-console/lost-charge summary, cancel/focus handling, tuple invalidation and pending suppression while preserving server maintenance authority. Independent Terra review cleared 39f9dcb; 24 component/service tests pass, including stable transient retry. Rendered 320x844, 390x844, 1440x900, and 844x390 show 44px controls, wrapped long labels, no horizontal overflow and reduced-motion static controls. Browser fixture blocks mutation; existing callable and rules checks prove server behavior separately. |
| E-292-VERIFIED | evidence | 292 | functions/src/requestGuards.ts (requireShipJumpRequest); functions/src/index.ts (jumpShip); functions/src/jumpCallable.test.ts; functions/src/requestGuards.test.ts; functions/src/jumpDrive.test.ts | Existing request shape guard runs before database transaction and transition ID creation. Focused callable assertion rejects malformed input with invalid-argument and no reads, writes, random roll or event ID. All 46 jump callable, request guard and jump resolver tests passed. Test and roadmap reconciliation only; no runtime or release change. |
| E-295-VERIFIED | evidence | 295 | functions/src/jumpDrive.ts (resolveJumpAttempt); functions/src/index.ts (jumpShip); functions/src/jumpCallable.test.ts; functions/src/jumpDrive.test.ts; src/components/JumpDriveConsole.test.tsx; src/changelog.ts | The published integrity-lock policy is preserved. Resolver validates destination through the canonical chart before fuel/movement. Callable test proves the unprinted four-digit branch updates only lock state and preserves fuel, charge and location; code inspection confirms active lockouts do not write. The existing 46 jump/request tests and 2 console tests passed. Documentation reconciliation only; no runtime change or new printed rule claim. |
| E-495-VERIFIED | evidence | 495 | functions/src/index.ts (startGame); functions/src/gameSetup.ts (composeDefaultLoyaltyAssignments, validateExplicitLoyaltySetup); functions/src/startCallable.test.ts; functions/src/gameSetup.test.ts; functions/src/wolfAssignment.test.ts; firestore.rules (secrets) | Existing start transaction validates locked holders, creates one recipient-only loyalty payload per player with a valid starting suspicion, preserves only complete valid explicit assignments, and rejects public or conflicting records. The 19-player and 20-plus-Press cases and suspicion distribution are covered. 105 focused start/setup/Wolf-assignment tests passed. Client secret writes remain denied by the existing rules. This evidence closes initial assignment only, not later exceptional Wolf-count override behavior in496. |
<!-- END GENERATED PROMPT CATALOG: dependency -->

## Shared integrity gate

Run `npm run validate:dependencies`. It validates the catalog and generated
dispatcher view, failing closed on malformed records, typed evidence, hard
dependency cycles, and readiness drift.

## Deterministic dispatcher

Run `npm run coordination:dependencies -- --prompt NNN` from the repository
root. The compact default contains the selected prompt context within the
80-line/12-KiB budget. `--full` emits the complete `NEXT`, `READY_QUEUE`,
`NEEDS_CONFIRMATION`, and `BLOCKED` view; `--json` emits the stable machine
schema. The command is read-only: a blocked or manually gated prompt is
reported with its reasons and is never silently treated as ready.

`NEXT` (the first `READY_QUEUE` item) remains advisory for concurrency, not a
serial lock. Later ready prompts still require satisfied hard prerequisites,
cleared or confirmed manual gates, and conflict-free coordination ownership.

## Generated packet, not copied context

Do not preserve a checked-in packet transcript: it becomes stale whenever the
catalog changes. The dispatcher generates the current packet directly from the
catalog. Use `--full` for the complete queue and `--json` when another machine
consumes the same semantic record.

## Maintenance rules

- Treat the generated packet as compact navigation and readiness context. Run it
  when selecting a prompt; ordinary tooling and fixes do not need a prompt
  registration trailer.
- Never mark a prompt complete or merge its slice while a hard prompt
  prerequisite is not `done`. The executable documentation gate checks this
  completion invariant; closure/evidence gates remain completion scope and do
  not become hidden start blockers.
- Refresh this index whenever the plan adds, retires, renames, or reclassifies a canonical prompt, and rerun the coverage, parity, integrity, and deterministic-dispatcher checks above.
- Preserve typed edges and their evidence. If the source is silent, write none; do not infer a previous-prompt edge, numeric adjacency, a whole domain range, or a milestone edge from ordering alone.
- Edit status, tag, class, and release mappings only in the catalog. The
  generator derives the progress checklist and dependency columns, so those
  views cannot drift independently.
- Keep hard readiness limited to hard prompt, milestone, contract, and owner fields. Closure/evidence gates are completion audits; sequence, release-boundary, and related/consumes rows are planning context and must never become hidden start blockers.
- Numeric ranges must fail closed when any member is unknown; keep the explicit retired set synchronized with the plan. Lettered IDs remain explicit and are never silently expanded.
- Keep source evidence directionally explicit (from prompt to prerequisite/closure target), with a source-of-truth path, anchor, and source language for every non-none typed field.
- This dependency view does not authorize implementation, change player-facing
  behavior, replace source-of-truth acceptance, or bypass repository test,
  security, accessibility, release, merge, or coordination gates.

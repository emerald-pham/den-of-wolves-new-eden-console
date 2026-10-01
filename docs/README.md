# Documentation map

Start from the authority for the question below. The catalog owns live roadmap
facts; canonical guides own current contracts; dated reports and archives keep
bounded evidence and decision history. Update the source rather than copying
live counts or requirements into another ledger.

## Start here

| Need | Document |
|---|---|
| Overview, stack, setup and source map | [Project README](../README.md) |
| Repository workflow, testing, authority and release policy | [CLAUDE.md](../CLAUDE.md) |
| Agent entry point and required reading | [AGENTS.md](../AGENTS.md) |
| Delegation, ownership transfer and batched checkpoint releases | [Agent execution policy](AGENT_EXECUTION_POLICY.md) |
| Coordinating several tasks and parent communication | [Campaign playbook](AGENT_CAMPAIGN_PLAYBOOK.md) |
| Ownership commands and emulator port matrix | [Coordination reference](WORKTREE_COORDINATION.md) |
| Storage inventory and deliberate cleanup | [Local storage](LOCAL_STORAGE.md) |
| Cowork invocation preferences | [Cowork instructions](../.cowork/instructions.md) |

## Checkpoints and roadmap

| Document | Owns |
|---|---|
| [implementation-prompts.json](implementation-prompts.json) | Canonical definitions, statuses, prerequisites and release evidence |
| [Product checkpoints](PRODUCT_MILESTONES.md) | Current preparation, authorization, UI review and cooldown workflow |
| [Alignment before the next checkpoint](PRODUCT_MILESTONES.md#owner-decisions-before-the-next-checkpoint) | Review owner conversations and update all affected future criteria before the next shape/build |
| [Completion plan](CHECKPOINT_COMPLETION_PLAN.md#complete-baseline-allocation) | Fixed PC05–PC10 IDs and cumulative targets; current PC06 scope is its 49-ID row |
| [PC07–PC10 alignment](PC07_PC10_ALIGNMENT.md) | Future operating/presentation criteria and solo UI checks; preserves in-progress PC06 scope |
| [Owner feedback](PRODUCT_MILESTONE_FEEDBACK.md) | Explicit decisions, review notes and their dispositions |
| [Assumptions](PRODUCT_MILESTONE_ASSUMPTIONS.md) | Cited rules interpretations and corrections |
| [Later candidates](PRODUCT_MILESTONE_CANDIDATES.md) | Work outside the active shaped scope |
| [Technical milestones](IMPLEMENTATION_MILESTONES.md) | Internal stories and exit fixtures |
| [After the prompt campaign](POST_PROMPT_COMPLETION_TASKS.md) | Explicitly deferred post-completion work |

The generated Markdown views are [objectives and acceptance](IMPLEMENTATION_PLAN.md),
[progress and release evidence](IMPLEMENTATION_PROGRESS.md), and
[dependencies/readiness](IMPLEMENTATION_PROMPT_DEPENDENCIES.md). Update the
catalog, then run `node scripts/generate-prompt-views.mjs`; `--check` verifies
the views. `coordination:dependencies` is read-only and creates no nonce or
receipt. `NEXT` is an advisory ready-work hint.

The [Gantt HTML](PC07_ROADMAP_GANTT.html), [JSON](PC07_ROADMAP_GANTT.json) and
[CSV](PC07_ROADMAP_GANTT.csv) project the same fixed 195 PC07–PC10 IDs. They
encode dependency waves, with PC06 as the entry prerequisite and PC10 as the
endpoint; they do not estimate dates or duration. Run
`node scripts/generate-checkpoint-gantt.mjs` after catalog/allocation edits;
`--check` verifies freshness. The [accounting audit](CHECKPOINT_ACCOUNTING_AUDIT.md)
records why the fixed recovery allocation was needed.

## Product contracts

| Document | Owns |
|---|---|
| [Aesthetics](AESTHETICS.md) | CIC visual language, fonts, responsive behavior and motion |
| [Copy lexicon](PLAYER_COPY_LEXICON.md) | Approved vocabulary and intentional exclusions |
| [Ticker behavior](TICKER_BEHAVIOR.md) | Source priority, visible-track handoff, ATC projection and Stand Down |
| [Console architecture](CONSOLE_ARCHITECTURE.md) | Shared vessel composition and authority seams |
| [Ship template](SHIP_TEMPLATE.md) | Capybara reference ship surface |
| [Shuttle template](SHUTTLE_TEMPLATE.md) | SNN reference shuttle surface |
| [Shuttlecraft](SHUTTLECRAFT.md) | Shared worldspace and travel model |
| [Intentional deviations](INTENTIONAL_DEVIATION_GUARDS.md) | Owner-approved product decisions and their guards |
| [Contract ledger](IMPLEMENTATION_CONTRACTS.md) | Maintained contract/audit record for selected prompts; current status remains in the catalog |

Ship, shuttle and worldspace specifications remain separate: common
presentation does not grant another vessel's gameplay authority.

## Operations and verification

| Document | Owns |
|---|---|
| [Abuse-protection handoff](ABUSE_PROTECTION_HANDOFF.md) | Capacity, App Check and production follow-up |
| [Capacity conclusions](CAPACITY_CONCLUSIONS.md) | Measured local envelope and unproven boundaries |
| [60-browser scenario](CAPACITY_60_BROWSER_PROOF.md) | Reproduction, thresholds and bounded closure result |
| [Runtime threat model](../security/threat-model.json) | Machine-readable hostile-client/resource control map |
| [Rollback anchor](PRESERVED_IN_AMBER.md) | Recovery ref and preservation policy |
| [CI/deploy setup](ci-deploy-setup.md) | Dated Workload Identity Federation setup and troubleshooting |
| [Release learnings](CHECKPOINT_RELEASE_LEARNINGS.md) | Observed checkpoint-release improvements and measurements |
| [Render baselines](RENDER_PERFORMANCE_BASELINES.md) / [DRADIS method](DRADIS_BENCHMARK.md) | Performance limits, evidence and deterministic benchmark workload |
| [Presence load](PRESENCE_LOAD_2026-09-19.md) / [callable health](CALLABLE_HEALTH_METRICS.md) | Bounded emulator measurements and their limits |

Verify current external configuration before acting on a dated handoff.

## Reports, evidence and history

- Checkpoint reports: [PC01](PC01_PLAYTEST_REPORT.md), [PC02](PC02_PLAYTEST_REPORT.md),
  [PC03](PC03_PLAYTEST_REPORT.md), [PC04](PC04_PLAYTEST_REPORT.md),
  [PC05](PC05_PLAYTEST_REPORT.md) and its [acceptance matrix](PC05_ACCEPTANCE_MATRIX.md).
- PC05 path evidence: [jump](PC05_JUMP_EVIDENCE.md) and
  [maintenance](PC05_MAINTENANCE_EVIDENCE.md).
- Audit snapshots: [foundation regressions](FOUNDATION_REGRESSION_MATRIX.md) and
  [button review](audits/P671_BUTTON_REVIEW.md).
- Historical planning: [original checkpoint shapes](archive/PRODUCT_CHECKPOINT_HISTORY.md),
  [2026-09-12 dependency audit](archive/DEPENDENCY_AUDIT_2026-09-12.md) and
  [ticker repair handoff](archive/TICKER_CONTRACT_REPAIR_HANDOFF.md).
- Local evidence instructions: [Prompt 190](../evidence/prompt-190/README.md),
  [GM-control presentation](../evidence/prompt-428-gm-control/README.md) and
  [Prompt 603a geometry](../evidence/prompt-603a/README.md).
- [Faction flags](../src/assets/flags/README.md) documents the local asset files.

Reports retain the evidence available at their named build. Archives retain
superseded plans and worktree handoffs; use the current catalog and guides for
new work.

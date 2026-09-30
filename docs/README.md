# Documentation map

Use this page to choose the right document without treating every Markdown file
as the same kind of authority. Live state belongs in live ledgers; dated audits
and handoffs explain their own bounded evidence and must not override current
code, tests, or canonical policy.

## Start here

| Need | Document | Authority |
| --- | --- | --- |
| Product overview, setup, and validation entry point | [Project README](../README.md) | Contributor introduction and quick start |
| Repository workflow, testing, security, release, and cleanup policy | [CLAUDE.md](../CLAUDE.md) | Canonical repository policy |
| Agent discovery and private-reference warning | [AGENTS.md](../AGENTS.md) | Thin routing and safety pointer |
| Multi-agent campaign execution, recovery, and stopping | [Agent campaign playbook](AGENT_CAMPAIGN_PLAYBOOK.md) | Optional multi-task coordination and stopping guidance |
| Coordination commands | [WORKTREE_COORDINATION.md](WORKTREE_COORDINATION.md) | Lightweight worktree, resource, and emulator command reference |
| Cowork-specific invocation preferences | [Cowork instructions](../.cowork/instructions.md) | Tool-specific preferences only |

## Implementation roadmap

Read these as separate, cooperating authorities rather than one interchangeable
roadmap. The catalog is the source of roadmap facts; generated Markdown views
are regenerated from it:

| Document | Owns |
| --- | --- |
| [implementation-prompts.json](implementation-prompts.json) | Canonical prompt definitions, statuses, dependencies, and release facts |
| [PRODUCT_MILESTONES.md](PRODUCT_MILESTONES.md) | Owner-facing UI playtest checkpoints, first shaped scope, and the trimmed Shape Up build, report, and cooldown loop |
| [PRODUCT_MILESTONE_FEEDBACK.md](PRODUCT_MILESTONE_FEEDBACK.md) | The owner's in-app review notes and how the next shape addresses each one |
| [PRODUCT_MILESTONE_ASSUMPTIONS.md](PRODUCT_MILESTONE_ASSUMPTIONS.md) | Source-cited rules readings made during builds and their later corrections |
| [PRODUCT_MILESTONE_CANDIDATES.md](PRODUCT_MILESTONE_CANDIDATES.md) | Work discovered outside the active shaped scope |
| [IMPLEMENTATION_PROMPT_DEPENDENCIES.md](IMPLEMENTATION_PROMPT_DEPENDENCIES.md) | Generated dependency/readiness view |
| [PC07–PC10 Gantt chart](PC07_ROADMAP_GANTT.html) | Portable browser view of the fixed allocation and dependency waves; derived snapshot, with no invented dates or durations |
| [Gantt JSON](PC07_ROADMAP_GANTT.json) and [CSV](PC07_ROADMAP_GANTT.csv) | Machine-readable projection of the same 195 prompt IDs, statuses, prerequisites and waves |
| [IMPLEMENTATION_MILESTONES.md](IMPLEMENTATION_MILESTONES.md) | Internal technical stories and exit fixtures |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Generated prompt objectives, acceptance, and source decisions |
| [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md) | Generated prompt status and release evidence |
| [IMPLEMENTATION_CONTRACTS.md](IMPLEMENTATION_CONTRACTS.md) | Generated bounded contract view for named prompts |
| [POST_PROMPT_COMPLETION_TASKS.md](POST_PROMPT_COMPLETION_TASKS.md) | Owner-deferred review and work after all 751 prompts |

Do not manually edit or copy live counts, dependencies, or active-prompt status
into generated guides. Update the catalog and regenerate its Markdown views;
the views remain useful for human review and links. The optional
`coordination:dependencies` check is read-only, creates no nonce or receipt,
and `NEXT` is an advisory ready-work hint rather than a serial lock. Shape the
next owner playtest from the current catalog and prior feedback; later product
checkpoint rows are provisional planning slices, not a second status ledger.

Open the Gantt HTML in a browser to view the checkpoint route, workstream lanes
and expandable prompt ledger. It works offline and includes JSON/CSV downloads.
Regenerate all three copies with the command
<code>node scripts/generate-checkpoint-gantt.mjs</code> after catalog or allocation
changes; <code>node scripts/generate-checkpoint-gantt.mjs --check</code> verifies
freshness without editing. Wave marks encode dependency order, not work duration.
The chart preserves PC06 as the entry prerequisite and the fixed PC10 endpoint.

## Product and presentation contracts

| Document | Owns |
| --- | --- |
| [AESTHETICS.md](AESTHETICS.md) | Shared CIC visual language, responsive behavior, accessibility, and motion profiles |
| [PLAYER_COPY_LEXICON.md](PLAYER_COPY_LEXICON.md) | Approved player-facing vocabulary, inventory boundary, forbidden jargon, and reviewed exclusions |
| [TICKER_BEHAVIOR.md](TICKER_BEHAVIOR.md) | Canonical source priority, visible-message handoff, and Stand Down playback contract |
| [CONSOLE_ARCHITECTURE.md](CONSOLE_ARCHITECTURE.md) | Shared vessel composition, ownership seams, and server-authority boundaries |
| [SHIP_TEMPLATE.md](SHIP_TEMPLATE.md) | Capybara reference ship-console specification |
| [SHUTTLE_TEMPLATE.md](SHUTTLE_TEMPLATE.md) | SNN reference shuttle-console specification |
| [SHUTTLECRAFT.md](SHUTTLECRAFT.md) | Shared shuttle worldspace and travel model |
| [INTENTIONAL_DEVIATION_GUARDS.md](INTENTIONAL_DEVIATION_GUARDS.md) | Owner-approved product decisions and their focused regression guards |

The ship template, shuttle template, and shuttle worldspace model remain
separate deliberately: presentation inheritance must not become gameplay
authority or cause one vessel's configuration to leak into another.

## Operations, recovery, and historical handoffs

| Document | Owns |
| --- | --- |
| [ABUSE_PROTECTION_HANDOFF.md](ABUSE_PROTECTION_HANDOFF.md) | Capacity, abuse protection, App Check, and operational follow-up |
| [CAPACITY_CONCLUSIONS.md](CAPACITY_CONCLUSIONS.md) | Current supported local envelope and the boundaries the evidence does not prove |
| [CAPACITY_60_BROWSER_PROOF.md](CAPACITY_60_BROWSER_PROOF.md) | The bounded 60-browser local proof scenario, thresholds, and closure result |
| [Runtime threat-model manifest](../security/threat-model.json) | Machine-readable hostile-client, session-code, and resource-exhaustion control map |
| [PRESERVED_IN_AMBER.md](PRESERVED_IN_AMBER.md) | Immutable rollback-anchor policy and recovery reference |
| [ci-deploy-setup.md](ci-deploy-setup.md) | Dated Workload Identity Federation setup and troubleshooting handoff |
| [CHECKPOINT_RELEASE_LEARNINGS.md](CHECKPOINT_RELEASE_LEARNINGS.md) | Reusable checkpoint-release findings, implemented velocity improvements, and follow-up measurements |

Historical handoffs describe the state observed when they were written. Verify
current external configuration before acting on their recorded values.

## Reproducible evidence and local assets

- [Prompt 603a rendered-evidence instructions](../evidence/prompt-603a/README.md)
  describe how to reproduce that bounded geometry artifact.
- [Callable and snapshot health evidence](CALLABLE_HEALTH_METRICS.md) records the
  local emulator metric taxonomy and its limits.
- [Faction flag asset notes](../src/assets/flags/README.md) document stable local
  filenames and their focused contract.

Evidence instructions and path-local asset notes stay beside the artifacts they
describe; they are not general contributor policy.

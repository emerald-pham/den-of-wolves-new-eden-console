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
| Coordination commands | [WORKTREE_COORDINATION.md](WORKTREE_COORDINATION.md) | Command reference; `CLAUDE.md` remains canonical |
| Cowork-specific invocation preferences | [Cowork instructions](../.cowork/instructions.md) | Tool-specific preferences only |

## Implementation roadmap

Read these as separate, cooperating authorities rather than one interchangeable
roadmap:

| Document | Owns |
| --- | --- |
| [IMPLEMENTATION_PROMPT_DEPENDENCIES.md](IMPLEMENTATION_PROMPT_DEPENDENCIES.md) | Mandatory prompt-readiness and dependency gate |
| [IMPLEMENTATION_MILESTONES.md](IMPLEMENTATION_MILESTONES.md) | Compact dependency-ordered player-story route |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Canonical prompt definitions, objectives, acceptance, and source decisions |
| [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md) | Current prompt status and release evidence |
| [IMPLEMENTATION_CONTRACTS.md](IMPLEMENTATION_CONTRACTS.md) | Bounded contract-audit ledger for its named prompts |

Do not copy live counts or active-prompt status into another guide. Link to the
progress ledger so one checked source remains current.

## Product and presentation contracts

| Document | Owns |
| --- | --- |
| [AESTHETICS.md](AESTHETICS.md) | Shared CIC visual language, responsive behavior, accessibility, and motion profiles |
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
| [PRESERVED_IN_AMBER.md](PRESERVED_IN_AMBER.md) | Immutable rollback-anchor policy and recovery reference |
| [ci-deploy-setup.md](ci-deploy-setup.md) | Dated Workload Identity Federation setup and troubleshooting handoff |

Historical handoffs describe the state observed when they were written. Verify
current external configuration before acting on their recorded values.

## Reproducible evidence and local assets

- [Prompt 603a rendered-evidence instructions](../evidence/prompt-603a/README.md)
  describe how to reproduce that bounded geometry artifact.
- [Faction flag asset notes](../src/assets/flags/README.md) document stable local
  filenames and their focused contract.

Evidence instructions and path-local asset notes stay beside the artifacts they
describe; they are not general contributor policy.

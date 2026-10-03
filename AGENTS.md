# AGENTS.md

Read [`CLAUDE.md`](./CLAUDE.md) before repository work. It is the canonical
workflow and product-safety guide: use its risk-based task path, focused tests,
server-authority rules, emulator isolation, responsive UI checks, version and
changelog policy, and truthful merge/deploy closeout.

Read [`docs/AGENT_EXECUTION_POLICY.md`](docs/AGENT_EXECUTION_POLICY.md) before
delegating work, shaping a product checkpoint, or preparing a release. It holds
the detailed delegation, batched-PC-release, wait, and worktree rules so this
entry file stays below instruction-size limits.

For the remaining numbered-prompt campaign, read
[`docs/PRODUCT_MILESTONES.md`](docs/PRODUCT_MILESTONES.md) before shaping or
building a playtest checkpoint. Its one-sitting product checks, fixed shape,
source-backed assumption log, test-first commits, owner authorization, optional
feedback, and cooldown process govern that campaign. Explicit owner
authorization accepts a checkpoint; a completed walkthrough or written UI
feedback is not required. Agents own gameplay and technical correctness. The
older M1–M13 fixtures remain internal gates.
Before moving into the next checkpoint, review the owner's decisions before
and between checkpoints and update every affected future prompt and checkpoint
plan. Follow that guide's decision-alignment procedure under standing
authorization; preserve an in-progress checkpoint's agreed scope.

Only `gpt-6-luna` and `gpt-6.1-sol` may be delegated as subagents. Existing
agents may finish current bounded assignments. Luna effort is discretionary;
`max` is almost always preferred. Sol may use all supported effort levels.
Use Sol for the independent risk reviews specified in `CLAUDE.md`; retain any
explicit task-specific security review floor.

Batch all scoped PC work into one reconciled candidate and run one final
appropriate validation after reconciliation. Prefer one exact-candidate CI and
deployment run; rerun only for a failed gate, production-only finding, or
material candidate change. The linked execution policy governs the details.
The top-level orchestrator thread receiving the user's request is the task and
checkpoint owner. It carries every acceptance, integration, required review,
final validation, merge, push, deployment verification and user handoff. Do not
delegate checkpoint ownership to a child or add a coordinator above a delegated
owner. Use separate Luna workers (Max almost always preferred) for bounded,
complete implementation groups and independent Sol review for shared-state and
authority changes. Group coupled prompts by behavior rather than assigning one
agent per prompt; record concrete groups and integration boundaries before building.

Workers own implementation, ordinary verification and repairs within their
briefs, then hand back commits, evidence and remaining gaps to the orchestrator.
The orchestrator performs useful owner work while independent groups run and
reconciles the single release. Avoid routine polling, small-update relays and
duplicate investigation. Preserve explicit parent collaboration messages and
do not create coordinator goals. The linked execution policy governs safe
handoffs, including an in-progress transition from a previously delegated owner.

For a parent-only dependency, send the canonical parent an actionable
collaboration message and obtain acknowledgement before dependency parking.
The parent must triage and own or explicitly return the action; a sent message
is not an acknowledged handoff. Use the linked policy's bounded follow-up and
dispatch contract, without routine polling.

The roadmap facts live in the JSON catalog at
[`docs/implementation-prompts.json`](./docs/implementation-prompts.json), with
generated Markdown views for convenient reading. Update the catalog and
regenerate its views when a prompt, dependency, or status fact changes. The
optional dependency check (`npm run coordination:dependencies -- --prompt NNN`)
reports readiness and hard prerequisites, is read-only, and must not create
local nonce or goal receipts. `NEXT` is a ready-work hint, not a serial lock.
Regenerate the Markdown views with `node scripts/generate-prompt-views.mjs` after
catalog facts change; `--check` verifies generated output without editing.

Coordination is optional and does not require universal prompt registration or
commit trailers. Use the linked execution policy for ownership, waits,
worktrees, and cleanup.

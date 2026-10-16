# AGENTS.md

Read [`CLAUDE.md`](./CLAUDE.md) before repository work. It is the canonical
workflow and product-safety guide: use its risk-based task path, focused tests,
server-authority rules, emulator isolation, responsive UI checks, version and
changelog policy, and truthful merge/deploy closeout.

Read [`docs/AGENT_EXECUTION_POLICY.md`](docs/AGENT_EXECUTION_POLICY.md) before
delegating work, shaping a product checkpoint, or preparing a release. It holds
the detailed delegation, checkpoint-ownership, worker-handback, parent-dependency,
batched-PC-release, wait, and worktree rules so this entry file stays below
instruction-size limits.

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

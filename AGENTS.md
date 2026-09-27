# AGENTS.md

Read [`CLAUDE.md`](./CLAUDE.md) before repository work. It is the canonical
workflow and product-safety guide: use its risk-based task path, focused tests,
server-authority rules, emulator isolation, responsive UI checks, version and
changelog policy, and truthful merge/deploy closeout.

For the remaining numbered-prompt campaign, read
[`docs/PRODUCT_MILESTONES.md`](docs/PRODUCT_MILESTONES.md) before shaping or
building a playtest checkpoint. Its one-sitting product checks, fixed shape,
source-backed assumption log, test-first commits, owner feedback, and cooldown
process govern that campaign. The owner reviews UI; agents own gameplay and
technical correctness. The older M1–M13 fixtures remain internal gates.

Only `gpt-6-luna` and `gpt-6-sol` may be delegated as subagents. Use
`gpt-6-sol` for the independent risk reviews specified in `CLAUDE.md`.
Use `max` for every `gpt-6-luna` subagent. `gpt-6-sol` may use only `medium`,
`high`, `xhigh`, or `max`, selected for the bounded task. Use `max` when the
task's complexity warrants it.

While an owner or CI run is active, wait for a meaningful completion, blocker,
or requested checkpoint. Use a long interruptible wait or yield with a clear
owner and resume path. Do not loop through short status polls or send updates
that only say the work is still running. Check status when a wait returns, an
expected bound is exceeded, or a concrete failure needs diagnosis; respond to
new user input when it interrupts the wait.

The roadmap facts live in the JSON catalog at
[`docs/implementation-prompts.json`](./docs/implementation-prompts.json), with
generated Markdown views for convenient reading. Update the catalog and
regenerate its views when a prompt, dependency, or status fact changes. The
optional dependency check (`npm run coordination:dependencies -- --prompt NNN`)
reports readiness and hard prerequisites, is read-only, and must not create
local nonce or goal receipts. `NEXT` is a ready-work hint, not a serial lock.
Regenerate the Markdown views with `node scripts/generate-prompt-views.mjs` after
catalog facts change; `--check` verifies generated output without editing.

Use a separate non-`main` branch/worktree, inspect `coordination:status` when
shared session/callable/rules, deploy/auth, release, or emulator resources may
overlap, and preserve other tasks' reservations. Coordination is optional and
does not require a universal implementation-prompt registration or commit
trailer. Keep a shaped milestone's scope frozen: repair defects in its accepted
checks, and route additional work to later candidates.

Worktree cleanup is part of task ownership. Run `npm run storage:status` before
adding checkouts or dependencies. At completion, follow
[`docs/LOCAL_STORAGE.md`](docs/LOCAL_STORAGE.md): remove eligible worktrees after
the task is terminal, or record the exact preservation reason and owner. Workers
must give their coordinator the absolute checkout path and cleanup disposition;
the coordinator performs cleanup at that completion boundary. Preserve active
or parked work, unique commits, local files, and dependencies shared by other
checkouts. Do not use force deletion or leave finished worktrees indefinitely.

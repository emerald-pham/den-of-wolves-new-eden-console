# AGENTS.md

Read [`CLAUDE.md`](./CLAUDE.md) before repository work. It is the canonical
workflow and product-safety guide: use its risk-based task path, focused tests,
server-authority rules, emulator isolation, responsive UI checks, version and
changelog policy, and truthful merge/deploy closeout.

For the remaining numbered-prompt campaign, read
[`docs/PRODUCT_MILESTONES.md`](docs/PRODUCT_MILESTONES.md) before shaping or
building a playtest checkpoint. Its one-sitting product checks, fixed shape,
source-backed assumption log, test-first commits, owner authorization, optional
feedback, and cooldown process govern that campaign. Explicit owner
authorization accepts a checkpoint; a completed walkthrough or written UI
feedback is not required. Agents own gameplay and technical correctness. The
older M1–M13 fixtures remain internal gates.

Only `gpt-6-luna` and `gpt-5.6-sol` may be delegated as subagents. Existing agents may finish their current assignments without interruption; apply this model policy to new agents and subsequent assignments. Use
`gpt-5.6-sol` for the independent risk reviews specified in `CLAUDE.md`.
Use `max` for every `gpt-6-luna` subagent. `gpt-5.6-sol` may use only `low`, `medium`, `high`, or `xhigh`, selected for the bounded task. Never use `max` or a higher effort for Sol.

If a Luna-owned implementation fails the same acceptance gate after two
distinct, substantive repair attempts on separate candidate commits, transfer
implementation ownership to Sol before another repair. Preserve failing
evidence, exact commits, checkout and coordination state in the handoff, and
park Luna's edit scope. Deliberate red tests during test-first work are not
failed attempts. This specific repeated-failure rule supersedes the general
escalation threshold in `CLAUDE.md` for Luna-owned work.

For a shaped checkpoint, assign independent critical-path work to available
subagents when parallel execution is likely to shorten the release. Give each
owner a bounded scope, separate checkout, shared-file boundary, and explicit
integration handoff. Keep one owner for the reconciled release.

For each PC release, finish and reconcile all scoped implementation, regression
repairs, release metadata, local risk gates, and required independent review
before starting CI. Prefer one exact-candidate CI and deployment run for the
whole checkpoint; rerun CI only when a failed gate, a production-only finding,
or a materially changed final candidate requires it. Do not open a separate
PR/CI cycle for each subchange. Evidence that can exist only after deployment
may use one final closeout documentation candidate.

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

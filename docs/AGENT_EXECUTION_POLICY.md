# Agent execution policy

This file extends [`AGENTS.md`](../AGENTS.md) and
[`CLAUDE.md`](../CLAUDE.md). Read it before delegating work, shaping a product
checkpoint, or preparing a release.

## Delegation

Only `gpt-6-luna` and `gpt-5.6-sol` may be delegated as subagents. Existing
agents may finish assignments that began before this policy changed. Use `max`
for every Luna subagent. Sol may use only `low`, `medium`, `high`, or `xhigh`;
select the least effort that fits the bounded task and never use `max`.

Use Sol for the independent risk reviews required by `CLAUDE.md`. If a
Luna-owned implementation fails the same acceptance gate after two distinct,
substantive repair attempts on separate candidate commits, transfer ownership
to Sol before another repair. Preserve the failed evidence, exact commits,
checkout and coordination state, then park Luna's edit scope. Deliberate red
tests written for test-first work do not count as failed attempts.

For a shaped checkpoint, delegate independent critical-path work only when it
is likely to shorten the release. Give each owner a bounded scope, separate
checkout, shared-file boundary, and explicit integration handoff. Keep one
owner for the reconciled release.

## Batched PC releases

Treat one product checkpoint as one release candidate. Finish and reconcile all
scoped implementation, regression repairs, release metadata, local risk gates,
and required independent review before starting CI. Do not open a separate PR
or CI cycle for each subchange.

Prefer one exact-candidate CI and deployment run for the whole checkpoint. Run
CI again only when a failed gate, a production-only finding, or a materially
changed final candidate requires it. Evidence that can exist only after
deployment may use one final closeout documentation candidate.

While an owner or CI run is active, wait for a meaningful completion, blocker,
or requested checkpoint. Use a long interruptible wait with a clear owner and
resume path. Do not loop through short status polls or send updates that only
say the work is still running.

## Worktrees and cleanup

Use a separate non-`main` branch or worktree. Inspect `coordination:status`
when shared session, callable, rules, deployment, authentication, release, or
emulator resources may overlap. Preserve other tasks' reservations and keep a
shaped milestone's scope frozen; route unrelated work to a later candidate.

Run `npm run storage:status` before adding checkouts or dependencies. At
completion follow [`LOCAL_STORAGE.md`](LOCAL_STORAGE.md): remove eligible
worktrees after the task is terminal, or record the exact preservation reason
and owner. Preserve active or parked work, unique commits, local files, and
dependencies shared by other checkouts. Never force-delete a worktree.

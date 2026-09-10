# Agent campaign playbook

Use this operational companion to [CLAUDE.md](../CLAUDE.md) when a coordinator
runs a multi-agent implementation campaign. `CLAUDE.md` remains the canonical
repository policy. Before selecting, assigning, starting, or editing any
numbered prompt, fully read the mandatory
[implementation prompt dependency authority](IMPLEMENTATION_PROMPT_DEPENDENCIES.md),
run its deterministic dispatcher, and reconcile the exact row, hard gates,
current `main`, and active coordination. This playbook does not replace that
authority.

## Why this exists

The previous campaign overran because coordination controls were applied late
and repeatedly rather than once at the boundary. A stopping request opened new
release slices; incomplete briefs caused correction cycles; an ambiguity about
whether `NEXT` was serial delayed work; expensive matrices repeated before the
candidate was independently reviewed; a Luna task was steered after it had
lost execution state; and shared documentation/release metadata were reconciled
after work had started. Those were orchestration failures, not proof that a
passing local test, rendered review, deployed behavior, or capacity result was
interchangeable with another kind of evidence.

## Required campaign controls

### Explicit ownership and a complete brief

The coordinator makes decisions, dispatches agents, resolves scope conflicts,
and tracks the campaign; it does not edit repository files. An implementation
agent owns edits, focused tests, and commit in its assigned worktree. An
independent reviewer reviews the exact `HEAD`. A separately assigned release
agent owns reconciliation, the one final full coordination validation, merge,
push, `coordination:finish`, and cleanup. Do not leave these handoffs implicit.
This campaign-specific allocation supersedes the routine primary-agent
integration default, but not any security, validation, or merge requirement.

Every initial brief must state the dispatcher result and exact dependency row;
hard prerequisites, milestone, contract, and decision-owner gates; exact
exclusive leaf-file scopes and claims; product versus proof boundary; live
version, changelog, and progress contract; focused red/green checks; review
and release owner; and stopping behavior. Resolve an ambiguity before
launching work that depends on it.

### Model selection and mandatory Luna failure failover

Use `gpt-5.6-luna` at `xhigh` for repository changes and reviews by default.
For numbered-plan code, configuration, scripts, or tests, retain the stricter
repository-required Luna `max` baseline until the failover condition below
occurs. Never dispatch a Sol child.

If a Luna attempt becomes idle or loses execution state with a dirty worktree,
no relevant running process, and no commit or result, do not keep steering it.
The same rule applies when one bounded recovery still repeats no-progress.
Immediately report the exact status, changed paths, commands and results, and
blocker; preserve or discard the attempt truthfully; then switch that task to
`gpt-5.6-terra` at `xhigh`. This is a mandatory failover for the observed
abandonment mode, not a suggestion to retry Luna.

Terra is also justified when it is reasonably cheaper than five Luna attempts
or repeated steering is predictably required. Record the reason for every
Terra exception. A quiet but still-running process is not a failure: inspect
the process and its output before classifying it.

### Dependency, ownership, and current-state gate

`NEXT` (the first `READY_QUEUE` item) is the primary resume/default lane, but
it is advisory for concurrency, not a serial execution lock. A worktree may
claim a later `READY_QUEUE` item concurrently only after hard prompt prerequisites
are done; every hard milestone, hard contract, and decision-owner gate is
satisfied or explicitly confirmed; and the coordination forecast shows
conflict-free ownership with no active claim overlap. Never bypass a
dependency, active claim, or unresolved decision-owner gate because a prompt
appears independent. A prompt with hard prerequisites that remain unmet cannot
be marked complete or merge.

Start by fetching `origin/main` and recording the observed base SHA, package
version, changelog/progress metadata, dispatcher packet, and coordination
state. Forecast exact exclusive leaf-file claims before editing; no broad
`docs/*` scope and no edit to another owner's document. Amend ownership before
scope expands.

After any rebase or material main movement, stop. Fetch, rebase or selectively
reapply only reviewed commits/files, fully re-read the dependency authority and
selected row, rerun the dispatcher, reforecast and reacquire ownership, and
inspect the resulting diff. Re-review if reconciliation changes semantics.
Never wholesale-merge a stale branch.

### Evidence, release, and stopping gates

Use focused red-before-green checks and risk review during implementation and
review. An independent exact-HEAD review must precede one final full
coordination validation on the exact reconciled approved candidate. Do not
repeat an unchanged full matrix; repeat it only if reconciliation changes the
committed inputs, semantics, or exact candidate SHA.

Before a product completion is recorded, preflight the live changelog, version,
progress, feature/non-feature classification, and release-fragment ownership.
The release agent uses the canonical per-task release fragment and shared-file
release lane. Documentation/tooling work records no player-facing change and
does not change a version, player changelog, or prompt count. Preserve server
authority, privacy, accessibility, reduced-motion behavior, and the boundary
between local checks, rendered review, deployment evidence, and capacity proof.

“Reach a stopping point” means open no new lanes. Finish, commit, land,
preserve, or explicitly discard only already-active bounded slices; release
this task's claims and resources; immediately report the exact state; and
stop. Do not leave an active entry for an idle or terminal agent. Never call a
campaign complete until every required implementation and proof boundary is
verified.

## Campaign goal template

Copy this goal for a new top-level coordinator. Replace every bracketed value
by observing the live repository; do not reuse a reported SHA, version, count,
or NEXT prompt without live verification.

```text
Campaign objective: Coordinate the Den of Wolves implementation campaign to
truthful, independently reviewed, validated, merged, pushed, and closed
completion. Use the player-facing changelog and implementation progress ledger
to assess live progress. Do not claim campaign completion until every required
implementation and proof boundary is verified.

Starting state: Read CLAUDE.md and docs/AGENT_CAMPAIGN_PLAYBOOK.md. Fetch
origin/main and record [observed base SHA], [observed package version],
[validator-derived prompt totals], [observed changelog metadata], and [active
coordination entries]. Use only these newly observed values. Do not reuse a
reported SHA, version, count, or NEXT prompt without live verification.

Dependency contract: Before selecting, assigning, starting, or editing a
numbered prompt, fully read docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md, run its
deterministic dispatcher, and reconcile the exact selected row, evidence, hard
prompt prerequisites, hard milestone, hard contract, decision-owner gate,
current main, and coordination. Treat NEXT as the advisory primary resume lane.
Claim later READY_QUEUE work only when all hard gates are satisfied or
confirmed and a coordination forecast is conflict-free.

Roles: The coordinator makes decisions and dispatches only. The implementation
agent owns edits, focused tests, and commit in its own worktree. An independent
reviewer reviews the exact HEAD. The separately assigned release agent owns
reconcile, one final full coordination validation, merge, push,
coordination:finish, and cleanup. Do not leave a handoff implicit.

Delegation: Use gpt-5.6-luna at xhigh by default, retaining any stricter
numbered-plan Luna max baseline until failover. Never dispatch a Sol child. If
a Luna attempt is idle or has lost execution state with a dirty worktree, no
relevant process, and no commit or result, or one bounded recovery repeats
no-progress, immediately report status, changed paths, commands/results, and
blocker; preserve or discard truthfully; then switch that task to
gpt-5.6-terra at xhigh and record the reason. Terra is also allowed when it is
cheaper than five Luna attempts or repeated steering is predictably required.

Execution: Send one complete initial brief with the dependency packet, exact
leaf-file scopes/claims, product/proof boundary, live release metadata,
focused tests, reviewer, release owner, and stopping behavior. Run focused
red-before-green checks and risk review. Require independent exact-HEAD review
before one final full coordination validation on the exact reconciled approved
candidate; do not repeat an unchanged full matrix.

Movement and ownership: Before edits, forecast and claim exact leaf files; do
not claim broad docs/* or another owner's files. After any rebase or material
main movement, stop, fetch/rebase or selectively reapply only reviewed
commits/files, fully re-read the dependency authority and row, rerun the dispatcher,
reforecast/reacquire ownership, inspect the diff, and re-review changed
semantics. Never wholesale-merge a stale branch.

Stopping: “Reach a stopping point” means open no new lanes. Finish, commit,
land, preserve, or explicitly discard only already-active slices; release
claims/resources; immediately report the exact status; then stop. Report
observed final SHA, package version, and validator-derived counts rather than
copied snapshots.
```

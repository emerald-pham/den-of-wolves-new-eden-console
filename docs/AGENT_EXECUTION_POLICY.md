# Agent execution policy

This file extends [`AGENTS.md`](../AGENTS.md) and
[`CLAUDE.md`](../CLAUDE.md). Read it before delegating work, shaping a product
checkpoint, or preparing a release.

## Delegation

Only `gpt-6-luna` and `gpt-6.1-sol` may be delegated as subagents. Existing
agents may finish current bounded assignments. Luna effort is discretionary;
`max` is almost always preferred. Sol may use all supported effort levels.
Select effort for the bounded task and keep explicit security-review floors.

Use Sol for the independent risk reviews required by `CLAUDE.md`. If a
Luna-owned implementation fails the same acceptance gate after two distinct,
substantive repair attempts on separate candidate commits, transfer ownership
to Sol before another repair. Preserve the failed evidence, exact commits,
checkout and coordination state, then park Luna's edit scope. Deliberate red
tests written for test-first work do not count as failed attempts.

### Checkpoint ownership and implementation groups

Owner instruction, 2026-09-30: use one checkpoint owner accountable for every
assigned prompt's acceptance, integration, and release; separate Luna workers (Max almost always preferred)
for independent implementation groups; and independent Sol review for
shared-state and authority changes. Accountability does not mean the checkpoint
owner implements the whole checkpoint serially.

Before implementation, record a concrete grouping of the assigned prompts by
shared behavior and dependencies, with bounded worker briefs, acceptance
criteria, separate checkouts, shared-file boundaries, and integration handoffs.
Dispatch the independent groups to separate Luna workers (Max almost always preferred) as capacity permits.
Do not default to one worker per prompt: catalog boundaries can divide one
transaction, lifecycle, or authorization contract. Keep tightly coupled work
together and explain dependencies that require sequential work. Workers carry
their groups through implementation, repairs, and focused validation; the
checkpoint owner reconciles shared seams, tracks every acceptance and proof
gap, and owns the single release. This does not add child coordinators.

Obtain independent Sol review of the reconciled shared-state and authority
changes under the risk rules in `CLAUDE.md`. Review findings return to the
responsible implementation owner. Preserve test-first commits, exact-candidate
validation, ordinary authorized gameplay proof, and the fixed completion target.
Use the currently authorized model versions and efforts; this structure does
not authorize a model excluded by higher-priority working agreements.

### Coordinator handoff and intervention

Once the checkpoint owner has the access, context, and authority to complete
the checkpoint, the coordinator hands back full execution and steps back. The
owner continues implementation, ordinary authorized gameplay verification,
repairs, appropriate review, integration, and release autonomously.

The coordinator intervenes only at meaningful boundaries requiring its
judgment, irreducible blockers or approval needs, and final completion. Avoid
routine polling, relaying every small update, duplicate investigation, or
taking over ordinary owner work. Temporary coordinator help with a uniquely
accessible authorized surface ends once that access boundary is resolved.
Keep the existing explicit collaboration messages to the canonical parent for
requested checkpoints, blockers, approval needs, and material changes; ordinary
commentary does not replace those messages. Do not create coordinator goals.

### Parent-only dependency handoff

When progress requires a parent-only action, send an explicit collaboration
message to the canonical parent path named in the dispatch. Include the
actionable blocker, preserved checkout/commit and evidence, exact intervention
requested, and useful work that can continue. Commentary or a final response
alone is not a parent handoff. A delivered message is not an acknowledged
handoff.

Before parking for that dependency, obtain the parent's acknowledgement. The
parent acknowledges receipt, triages the request, and either owns the action
with a concrete next step or explicitly returns it to the worker. It promptly
reports any required user action or unresolved decision instead of silently
leaving a received blocker unattended. The worker records who owns the next
action and the resume condition, then parks without heartbeat chatter.

If acknowledgement is missing, use one long interruptible wait and one bounded
follow-up that repeats the actionable request. Continue independent authorized
work where possible; otherwise record the state as awaiting acknowledgement,
not an accepted handoff. Do not busy-poll, repeatedly resend, or infer receipt
from silence. Include this communication contract, the canonical parent path,
and expected acknowledgement in future worker dispatches. Keep optional,
non-actionable progress quiet.

### Ownership lessons from the PC06 audit

Use Sol 6.1 for broad checkpoint ownership when shared integration, authority,
acceptance accounting, and release decisions dominate. Luna remains useful for
bounded coding groups, normally at Max. This is a task-fit decision based on
[the PC06 owner audit](PC06_OWNER_AUDIT.md), not a claim that every Luna worker
fails or that Sol automatically produces correct work. The implementation owner
cannot provide their own independent risk review.

Delegate complete behavior groups with agreed request/reply/projection contracts
and an integration acceptance check where feasible. Do not reserve every adapter,
UI, route, and shared seam to one owner while producing disconnected leaf work.
Keep conflicting shared-file edits with one owner, but finish and integrate a
coherent group before opening more dependent leaves. A worker's green focused
tests do not establish a green reconciled candidate or a shipped acceptance.

Close answered requests explicitly and do not keep revalidating them. Recheck
current ancestry before merging or cherry-picking a returned branch. Resolve
catalog rows by their explicit prompt ID, not their ordinal storage key. Keep
one current acceptance matrix with implemented, connected, tested, reviewed,
deployed, and live-proof gaps; reuse ordinary task documentation, not a new
measurement system or universal gate. Record ownership transfer, preserve all
work, and give the successor exact remaining seams and active worker boundaries.

## Batched PC releases

Treat one product checkpoint as one release candidate. Finish and reconcile all
scoped implementation, regression repairs, release metadata, local risk gates,
and required independent review before starting CI. Do not open a separate PR
or CI cycle for each subchange.

Prefer one exact-candidate CI and deployment run for the whole checkpoint. Run
CI again only when a failed gate, a production-only finding, or a materially
changed final candidate requires it. Evidence that can exist only after
deployment may use one final closeout documentation candidate.

Owner clarification, 2026-09-30: aim for one reconciled candidate CI run plus
required exact-main deployment checks, not one CI run per worker or prompt.
Workers hand back local commits and focused evidence without opening their own
CI/release cycles. Before a CI-triggering push, integrate the whole scoped
checkpoint, local repairs, release metadata, current main, and required review.
Batch related fixes before the next push and avoid duplicate manual runs when
the push already triggered CI. Record the concrete reason for each rerun,
including an upstream change that invalidates prior evidence. This is not a hard
run cap: do not skip gates, weaken performance budgets, reuse stale approval,
or suppress required exact-main deployment validation to reduce the count.
Schedule unrelated policy or documentation follow-ups after the active release
unless they directly unblock it or the user explicitly requests them now.

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

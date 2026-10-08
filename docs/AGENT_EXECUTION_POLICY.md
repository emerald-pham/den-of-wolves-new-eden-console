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

**Latest owner correction, 2026-10-03:** the top-level orchestrator thread
receiving the user's request is the task and checkpoint owner. This supersedes
the earlier coordinator-to-delegated-owner handoff. Do not delegate ownership
of the whole checkpoint or add a child coordinator. The orchestrator owns
priorities, architecture, all acceptances, integration, required independent
review, final validation, merge, push, deployment verification and the user
handoff. It may implement directly and delegate bounded, complete behavior
groups; a worker's implementation ownership does not transfer checkpoint
accountability or release ownership.

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
responsible implementation owner. Preserve existing test-first evidence and
apply the risk-based verification below, exact-candidate validation, authenticated
local/emulator gameplay proof, and the fixed completion target.
The October 2 owner correction makes this the future repository-wide standard;
production-GM gameplay is not a closure dependency. Retain functional checks,
independent review, CI and production deployment; prepared scenes alone do not
prove gameplay and historical evidence labels remain intact.
Use the currently authorized model versions and efforts; this structure does
not authorize a model excluded by higher-priority working agreements.

### Orchestrator ownership and worker handbacks

Workers carry their bounded groups through implementation, focused verification,
self-review and ordinary repairs. They return exact commits, evidence, unresolved
acceptances, resource state and a concrete integration handoff to the orchestrator.
The orchestrator reconciles shared seams, obtains required independent review,
repairs remaining integration gaps and completes the one release. It performs
useful owner work while independent workers run; it waits at a genuine dependency
boundary with a clear next action. Avoid routine polling, small-update relays
and duplicate investigation. Keep explicit collaboration messages to the
canonical parent for requested checkpoints, blockers, approval needs and material
changes; ordinary commentary does not replace those messages. Do not create
coordinator goals.

When an in-progress checkpoint has a delegated owner, preserve its active work
and obtain one concise handback at a safe boundary. Return checkpoint and release
ownership to the orchestrator; turn any continuing implementation into a bounded
worker assignment with exact remaining scope and shared-file boundaries. Do not
restart completed work or create a replacement coordinator. Existing workers may
finish their current bounded assignments; this transition is not a new default
delegation pattern.

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

The [PC06 owner audit](PC06_OWNER_AUDIT.md) informs complete behavior briefs,
integration boundaries, acceptance accounting and risk review. Its historical
recommendation to delegate broad ownership to Sol 6.1 is superseded by the
2026-10-03 orchestrator-ownership correction. Luna remains useful for bounded
coding groups, normally at Max; Sol 6.1 may handle a bounded complex implementation
or justified diagnosis. Neither is an extra checkpoint owner. The implementation
owner cannot provide their own independent risk review.

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

## Risk-based verification for remaining checkpoints

**Owner corrections, 2026-10-07 and 2026-10-08:** observe a meaningful RED before
every functional change, implement, then observe GREEN. Risk determines test
selection, execution breadth and regression depth, not permission to implement
first. The October 8 instruction supersedes the October 7 implementation-first
exception for low-risk functionality; its small claim-based actor cohorts and
evidence reuse remain. Blanket 19/21-account, full-census and
340-command/84-cell replay defaults remain superseded. Preserve prior evidence
and assertions; neither correction marks a failed run passed or waives actual behavior.
PC10's fixed 48 IDs, fresh two-browser solo game through an ending, every role
and game function, genuine GM authority, manual progression and privacy remain.
Trace shared role families and each unique mechanic without an endpoint-by-role
Cartesian product; rotate actors through legitimate assignments where allowed.

Choose verification from the changed behavior and credible failure risk:

- **Authority, privacy and durable state:** write the smallest meaningful
  failing regression before implementing or repairing authorization, transaction/replay,
  conflicting writes, persistence, recovery or data-loss behavior; retain
  separate test-first commits. Keep entitled, wrong/foreign/revoked actor,
  stale/conflicting authority and duplicate-effect negatives that apply.
- **Navigation and integration:** observe RED before implementation using a
  focused behavioral test or mounted-app probe for the changed route, control,
  authority binding or handoff, then observe GREEN. Interactive layout,
  visibility, defaults, parsers and provider features are functional changes.
  A proof-adapter repair needs its discriminating contract check and affected
  mounted slice, not a new whole-game replay for each guard.
- **Pure prose/docs:** use consistency review. Do not invent red tests or run
  Native/Functions/browser suites for a prose-only edit. A presentation change
  affecting interaction, layout, visibility or defaults is functionality and
  requires observed RED before implementation.

Audit the current candidate change by change and send a concise compliance
summary before final release. Identify genuine contemporaneous RED separately
from retrospective base-versus-fixed verification. Do not rewrite history or
claim a later failure was observed first. Report historical timing gaps honestly,
add meaningful regression validation, and hold release of unvalidated functionality.

Record the claim, actual cohort and why fewer actors cannot prove it, affected
regression scope, evidence reused and stop condition in the existing checkpoint
matrix or report. No new generic framework, per-guard ledger or universal gate.

| Claim | Default smallest sufficient cohort |
|---|---|
| Rendering, navigation or guidance | One actor per distinct configuration; a second only for an actual handoff. |
| Authorization or private audiences | Two or three relevant actors: entitled, peer and foreign/wrong role as required. |
| Contention, retries or reconnect | Two competitors; add a GM only when the mechanic needs one. |
| Progression and ending | Minimum legitimate playable setup for that mechanic; cover representative shared families and every unique function/role. |
| PC11 guidance | One actor per control family, plus a second for a real handoff; reuse unchanged PC10 gameplay evidence. |
| Conditional PC12 offline mode | One Mac host plus two clients; a third client only for a distinct private group. Separately verify identity, persistence/recovery, conflicts and WAN-disconnected operation. |

Twenty-one independent authenticated accounts are justified only for a specific
simultaneous capacity/concurrency/privacy claim impossible with fewer, or a
reproduced scale-dependent bug. State that reason before running it. Untested
21-account capacity stays unclaimed and does not block unrelated behavior.
Existing full-census and 340/84 drivers are opt-in scenarios for their specific
claims, not defaults for UI, lifecycle, setup or single-role repairs. Distinguish
configured roster size, actual admitted Auth actors, browser concurrency and
human-device play. Inspect product/server prerequisites separately from helper
limits; preserve legitimate casting, consent, seat, loyalty and privacy rules.
A full loyalty-census composition may remain one justified targeted case.

Reuse valid evidence when its behavior, dependencies and runtime contract are
unchanged; bind it to the reconciled candidate and explain the affected scope.
Qualify composed setup once, then exercise changed families without repeatedly
paying for the same admission/research prefix. A process-only commit does not
invalidate unchanged source/runtime evidence. Material changes or unresolved
failures require focused requalification; tests never backfill gameplay.

Finite-runner reuse lesson, 2026-10-07: copy the completed candidate runner's
original-deadline waits and primary-error-preserving teardown before adapting a
family. Carry its served GM controls and actual phase-publication wait together.
Validate the canonical casting station first and current operational berth after
normal start; use exact Source field/collection names. Reuse these accepted
patterns without adding a general framework, matrix or replay gate.

Stop the bounded slice at its first unexplained integration failure, retain its
original evidence and cleanup, and diagnose only that behavior before expanding.
Do not automatically replay the whole game or scale the cohort after one guard
repair. Keep the existing two-substantive-failed-repair escalation rule above.
Unresolved required behavior, authority/privacy/data-loss defects, failed required
gates or unverified deployment stop the affected acceptance/release. Independent
risk review, required CI/platform/rendered gates and exact-candidate/exact-main
deployment verification remain intact; this policy adds no approval pause.

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

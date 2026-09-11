# Agent campaign playbook

Use this operational companion to [CLAUDE.md](../CLAUDE.md) when a coordinator
runs a multi-agent implementation campaign. `CLAUDE.md` remains the canonical
repository policy. Before selecting, assigning, starting, or editing any
numbered prompt, run `npm run coordination:dependencies -- --prompt NNN` and
read its compact packet generated from the mandatory
[implementation prompt dependency authority](IMPLEMENTATION_PROMPT_DEPENDENCIES.md),
then reconcile the exact row, hard gates,
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

### Durable session-goal evidence

At `coordination:begin`, pass every session goal as a repeated
`--session-goal "- [ ] ..."` argument, including the exact immediate release
objective: As soon as required validation is green: commit, reconcile with
current main, merge to main, push to origin, and close coordination. The
registry creates a deterministic ignored working artifact with an immutable
original representation. At wrap-up, `coordination:goals` records
checked/unchecked outcomes and explanations; exact goal identity, order, and text are
validated against that original. `coordination:finish` fails when the artifact
is absent, malformed, or un-compared, and removes it only after other gates
succeed while verifying its absence. Cleanup verifies artifact absence. Status
exposes lifecycle state and path, not unrelated goal text. The explicit
`legacy-exempt` policy covers pre-feature P012/P014/P664 entries without an
artifact and records a durable comparison; new entries remain required.

Keep production-authority entries as `work-type product` and require an
immutable `change-class feature|non-feature` that matches the canonical
progress row. Only `non-feature` gets the no-version/no-fragment/no-player-
facing-changelog path; a free-text version plan cannot bypass feature gates.
Owners may amend an already-active P012/P014 entry once with
`npm run coordination:amend -- --id "<coordination id>" --change-class non-feature`
after verifying the canonical row. The amendment records old/new values and
fails closed on mismatch or repetition.

### Parking dormant work

If an owner is blocked and idle, the top-level coordinator must checkpoint its
clean branch and run `npm run coordination:park -- --id <id> --checkpoint-sha <exact SHA>` with blocker
entry/claim evidence, and a concrete next action. A parked entry retains its
scopes and claims fail-closed and requires no heartbeat; the parked entry status
says `parked` and `no heartbeat required`, while heartbeat, amend, claim,
validate, and finish reject. Interrupt the parked agent after the registry
write. Once the blocker and recorded overlap clear, owner-only
`npm run coordination:resume -- --id <id>` verifies worktree, branch, and checkpoint SHA continuity
and refuses while the recorded blocker or overlap remains; when clear it
refreshes the lease. Do not run a status/heartbeat polling loop. The registry
gate is machine-checked; the Codex process pause/wake boundary cannot be
machine-enforced by repository code.

### Model selection and role-scoped monotonic failure escalation

Use `gpt-5.6-luna` at `xhigh` for repository changes and reviews by default.
For numbered-plan code, configuration, scripts, or tests, retain the stricter
repository-required Luna `max` baseline until the failover condition below
occurs.

Durable phase floors are role-specific: the implementation phase uses
GPT-5.6 Luna (`gpt-5.6-luna`) at `max`, independent review uses GPT-5.6 Terra
(`gpt-5.6-terra`) at `xhigh`, and reconciliation/validation/merge/push/deployment
uses GPT-5.6 Luna at `max`.

The escalation tier belongs to the role and must never reset or downgrade when
an agent, task, or worktree is replaced. If a Luna attempt fails, reassign that
same agent role to `gpt-5.6-terra` at `xhigh`. If a Terra attempt then fails,
`gpt-5.6-sol` is authorized for that same agent role only. Detect and stop any
Luna/Terra loop: do not retry Luna after that role reaches Terra, alternate
between Luna and Terra, or treat a new child ID or worktree as a fresh tier.
Sol authorization for one role does not upgrade its reviewer, release owner,
sibling role, or the rest of the campaign.

Before dispatching Sol, explain in user-visible chat why that exact role needs
Sol, the observed Luna and Terra failures (or the recorded reason the role
began at Terra), why a cheaper tier is no longer viable, and that Sol is 10
times as expensive as Luna. This notice records the authorized escalation and
its cost; it is not a new permission request.

An attempt fails only after evidence: a terminal agent error; an abandoned or
lost execution state with no relevant running process and no usable result; or
a materially unusable result after one bounded recovery or correction repeats
no-progress. Immediately report the exact status, changed paths, commands and
results, and blocker, then preserve or discard the attempt truthfully before
reassigning the role. A quiet live process, wrapper timeout, external blocker,
or pending user input is not by itself a model failure; inspect the process,
output, and blocker before advancing the role's tier.

Terra is also justified when it is reasonably cheaper than five Luna attempts
or repeated steering is predictably required. Record the reason for every
Terra exception. A role that legitimately begins at Terra may advance to Sol
after its evidenced Terra failure without manufacturing a Luna attempt.

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
reapply only reviewed commits/files, refresh the compact dependency packet and
receipt, reforecast and reacquire ownership, and
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

A blocking agent is the identifiable Codex task that owns an active overlapping
coordination claim or required same-file work. CI visibility, an external
dependency, pending user input, and an ordinary test failure are not agent
blockers. When that blocking agent prevents merge, commit and push the exact
task branch before sending the handoff. Send a direct user-visible message to
the blocking agent with the destination task ID, remote branch, exact commit
SHA, blocker reason, and overlapping files or claims, plus any still-needed
same-file delta.

Keep the exact blocker entry active. Blocked-agent preservation must pass
`--preservation-kind blocked-agent`, `--blocked-by-entry`, `--handoff-to-task`,
`--handoff-reason`, `--handoff-overlap`, `--handoff-delta`, and
`--handoff-delivery` to `coordination:finish`. The registry first verifies the
exact pushed ref SHA, same-repository identity, and every named overlap, then
creates a structured pending handoff on that blocker entry. Keep the named
overlapping scopes and claims held by that entry through integration.

`coordination:status` exposes each pending record under `MERGE OTHER BRANCHES
hard gate`. Instruct the blocking agent: after its original blocker work is
finished, fetch the branch, reconcile it with current main, merge the exact
source commit into that same task branch, apply the named delta, rerun required
validation on the exact reconciled SHA, merge to main, push origin/main, and run
`coordination:finish` for that same blocker entry. `coordination:finish` refuses
`landed`, `preserved`, and `discarded` outcomes while the blocker entry has an
assigned pending branch. It clears the gate only when the validated task branch
contains every assigned source commit and pushed origin/main contains that
branch. `--result` prose and `--handoff-delivery` text cannot waive the `MERGE
OTHER BRANCHES hard gate`.

Verify direct-message delivery and request an acknowledgement when supported
before closing the source entry as preserved; a coordination note is not proof
of delivery. If direct delivery cannot be verified, keep the source entry active
and report the undelivered handoff.

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
numbered prompt, run `npm run coordination:dependencies -- --prompt NNN` and
read the compact deterministic dispatcher packet. Reconcile the exact selected row, evidence, hard
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
numbered-plan Luna max baseline until failover. The escalation tier belongs to
the role and must never reset or downgrade when an agent, task, or worktree is
replaced. If a Luna attempt fails, reassign that same agent role to
gpt-5.6-terra at xhigh. If a Terra attempt then fails, gpt-5.6-sol is authorized
for that same agent role only. Detect and stop any Luna/Terra loop; never return
an escalated role to Luna or spread one role's escalation to another role.
Before dispatching Sol, explain in user-visible chat why that role needs Sol,
the observed lower-tier failures or recorded Terra-start exception, why a
cheaper tier is no longer viable, and that Sol is 10 times as expensive as
Luna. This is an authorization notice, not a permission request. Immediately
report status, changed paths, commands/results, and blocker for each evidenced
failure; preserve or discard truthfully before reassignment. A terminal error,
lost execution state with no relevant process or usable result, or one bounded
recovery/correction that repeats no-progress is a failure. A quiet live process,
wrapper timeout, external blocker, or pending user input alone is not. Terra is
also allowed when it is cheaper than five Luna attempts or repeated steering is
predictably required; record that exception, and allow a role that begins at
Terra to advance to Sol after an evidenced Terra failure.

Execution: Send one complete initial brief with the dependency packet, exact
leaf-file scopes/claims, product/proof boundary, live release metadata,
focused tests, reviewer, release owner, and stopping behavior. Run focused
red-before-green checks and risk review. Require independent exact-HEAD review
before one final full coordination validation on the exact reconciled approved
candidate; do not repeat an unchanged full matrix.

Movement and ownership: Before edits, forecast and claim exact leaf files; do
not claim broad docs/* or another owner's files. After any rebase or material
main movement, stop, fetch/rebase or selectively reapply only reviewed
commits/files, refresh the compact dependency packet and receipt,
reforecast/reacquire ownership, inspect the diff, and re-review changed
semantics. Never wholesale-merge a stale branch.

Blocked merge handoff: A blocking agent is the identifiable Codex task that
owns an active overlapping coordination claim or required same-file work. CI
visibility, an external dependency, pending user input, and an ordinary test
failure are not agent blockers. When that blocking agent prevents merge, commit
and push the exact task branch before sending the handoff. Send a direct
user-visible message to the blocking agent with the destination task ID, remote
branch, exact commit SHA, blocker reason, and overlapping files or claims.
Keep the exact blocker entry active. Blocked-agent preservation must pass
--preservation-kind blocked-agent, --blocked-by-entry, --handoff-to-task,
--handoff-reason, --handoff-overlap, --handoff-delta, and --handoff-delivery to
coordination:finish. coordination:status exposes every pending assignment under
MERGE OTHER BRANCHES hard gate. Instruct the blocking agent: after its original
blocker work is finished, fetch the branch, reconcile it with current main,
merge the exact source commit into that same task branch, apply any named
same-file delta, rerun required validation on the exact reconciled SHA, merge to
main, push origin/main, and run coordination:finish for that same blocker entry.
coordination:finish refuses landed, preserved, and discarded outcomes while the
blocker entry has an assigned pending branch. It clears the gate only when the
validated task branch contains every assigned source commit and pushed
origin/main contains that branch. --result prose and --handoff-delivery text
cannot waive the MERGE OTHER BRANCHES hard gate. Verify direct-message delivery
and request an acknowledgement when supported before closing the source entry
as preserved; a coordination note is not proof of delivery. If direct delivery
cannot be verified, keep the source entry active and report the undelivered
handoff.

Stopping: “Reach a stopping point” means open no new lanes. Finish, commit,
land, preserve, or explicitly discard only already-active slices; release
claims/resources; immediately report the exact status; then stop. Report
observed final SHA, package version, and validator-derived counts rather than
copied snapshots.
```

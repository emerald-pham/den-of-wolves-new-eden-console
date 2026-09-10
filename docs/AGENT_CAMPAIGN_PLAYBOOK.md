# Agent campaign playbook

This is the short operational guide for a coordinator running a multi-agent
implementation campaign. [`CLAUDE.md`](../CLAUDE.md) remains the canonical
repository policy; this page records the campaign controls that keep that
policy executable when work is concurrent. The dependency authority is still
the required prompt gate:
[`IMPLEMENTATION_PROMPT_DEPENDENCIES.md`](IMPLEMENTATION_PROMPT_DEPENDENCIES.md).

## Why this guide exists

The previous campaign was technically productive but operationally expensive.
The failure was coordination drift, not one isolated code defect:

- A request to reach a stopping point expanded into additional release slices
  instead of closing or preserving the work already in flight.
- Initial briefs omitted canonical documents, dependency-policy details, or
  release metadata. That caused repeated corrections and reviews; one newly
  added validator also broke the TypeScript build.
- Dependency guidance contradicted itself about whether `NEXT` was an
  exclusive queue lock. Prompts 090 and 119 were started and later discarded
  while that policy was unresolved.
- The roughly 1,500-test/rules/build matrices were rerun across correction
  cycles instead of using focused checks during editing and one final gate on
  the approved candidate.
- A Luna process was repeatedly steered after it had stopped or lost the
  thread. Fresh, clarified dispatches—or one justified Terra pass—would have
  cost less time and attention.
- Changelog, version, and progress compatibility was discovered late, after
  technical work had already entered release review.
- Concurrent documentation ownership was negotiated reactively, and `main`
  moved while older branches remained around. Stale work then required
  rebase or selective reapplication rather than wholesale merging.

The controls below are deliberately enforceable and are checked by the
repository guidance validator. They are not a second implementation plan.

## Non-negotiable campaign controls

1. **Honor stopping semantics.** “Reach a stopping point” is an immediate
   boundary: open no new lanes; finish, commit, preserve, or explicitly
   discard only slices already active; release this task's claims and
   resources; report the exact state and stop. A clean branch waiting for
   another task is not permission to start another prompt.
2. **Send one complete initial brief.** Before dispatch, include the exact
   dependency row and dispatcher result, hard prerequisites and gates, exact
   file scopes and ownership, live version/changelog/progress metadata,
   focused tests and review expectations, release/merge requirements, and the
   stopping contract. Do not discover these one at a time through corrections.
3. **Use the economical model policy.** All repository changes and reviews in
   this campaign use `gpt-5.6-luna` at `xhigh` (or the repository's explicitly
   required higher Luna `max` effort for numbered-plan changes). Never
   dispatch a Sol child. Use `gpt-5.6-terra` at `xhigh` only when one Terra
   attempt is reasonably cheaper than about five Luna attempts, or repeated
   steering is predictable; record that reason and the cost tradeoff. After
   one significant miss or repeated steering, prefer a fresh clarified Luna
   brief.
4. **Resolve dependencies before parallelism.** Fully read the dependency
   authority before selecting, assigning, starting, or editing a numbered
   prompt; run its deterministic dispatcher and reconcile the exact row with
   current `main` and coordination. `NEXT` is the primary resume hint, not a
   serial lock. `NEXT` (the first `READY_QUEUE` item) is the primary
   resume/default lane, advisory for concurrency rather than a serial
   execution lock. Later `READY_QUEUE` work is allowed concurrently only after
   every hard prompt prerequisite, hard milestone, hard contract, and
   decision-owner gate is done or explicitly confirmed and the coordination
   forecast shows conflict-free ownership with no active claim overlap. Never
   bypass dependencies, active claims, or unresolved decision-owner gates
   merely because a prompt is independent. A prompt with hard prerequisites
   that remain unmet cannot be marked complete or merge.
5. **Layer validation.** Use focused red-before-green checks while editing and
   during review. Run one final full `coordination:validate` on the exact
   independently approved release candidate. Do not repeat the expensive full
   matrix unless reconciliation changes the committed inputs, semantics, or
   exact candidate SHA.
6. **Preflight release metadata.** Before completion metadata is written,
   verify the live package version, changelog convention, progress ledger,
   canonical prompt count, and feature/non-feature classification. A
   documentation/tooling slice records no player-facing change and does not
   bump the application version; it must not rewrite prompt counts.
7. **Coordinate shared files first.** Forecast exact exclusive leaf-file
   claims and ownership before editing shared documentation or tooling. Do not
   overlap another live claim, claim broad `docs/*`, or take another owner's
   docs; amend ownership explicitly before scope expands, and keep
   documentation consolidation in one coordinated slice.
8. **Reconcile every movement of `main`.** After a fetch/rebase or material
   main movement, stop and re-read the dependency authority, rerun its
   dispatcher, reforecast and reacquire ownership, and re-review if semantics
   changed. Selectively reapply reviewed commits when necessary; never
   wholesale-merge a stale branch.
9. **Report immediately and prove the boundary.** A child must immediately
   report its exact status, changed paths, commands run, and blocker when no
   process is running, a clean commit exists, a terminal state is reached, or
   progress is blocked. Keep the coordination entry active until the explicit
   landed, preserved, or discarded outcome. Keep local tests, rendered review,
   deployed behavior, and capacity proof as separate claims. Do not overclaim
   a campaign or prompt as complete from a green local suite, an unpushed
   branch, or an unverified attestation.

## One-way gate sequence

Use this sequence for each bounded slice:

1. Clean up only this coordinator's terminal children and stale task-owned
   process state, then inspect the shared coordination status.
2. Fetch current `origin/main`; verify the attached non-`main` worktree,
   branch, status, exact SHA, package metadata, changelog, and progress.
3. Fully read the dependency authority, run its dispatcher, inspect the exact
   prompt row and evidence, and confirm all hard gates before selection.
4. Forecast and acquire exact exclusive leaf-file claims. Send the complete
   initial brief, then the coordinator dispatches separate Luna work: an
   implementation agent edits/tests/commits, an independent Luna reviewer
   reviews the exact HEAD, and a Luna release agent reconciles, runs the final
   gate, merges, pushes, finishes, and cleans up. The coordinator makes
   decisions and dispatches; it does not edit repository files. Do not leave
   these handoffs implicit.
5. Run focused red-before-green checks and inspect the bounded diff. Stop and
   report immediately if the process exits, the worktree is clean, or a
   blocker needs an owner decision.
6. Obtain one independent exact-HEAD review before the final full reconciled
   gate. Resolve findings with a fresh
   clarified brief when possible; use Terra only under the cost exception.
7. The release agent commits the approved candidate, reconciles with current
   `main`, re-reads the
   dependency authority and rerun the dispatcher, reforecast ownership, and
   run the one final full coordination validation on that exact SHA.
8. If validation is green and the slice is complete, merge, push, finish the
   exact coordination entry, release resources, and verify local `main`,
   `origin/main`, the remote SHA, and cleanliness. Do not open unrelated work
   before this merge/push/finish/cleanup sequence.
9. If the user asked for a stopping point or the slice cannot land, make an
   explicit preserve-or-discard decision, record verifiable evidence, release
   resources and claims, report, and stop. Do not leave an idle green branch
   or silently claim completion.

## Campaign goal template

Copy and adapt this goal for a new top-level coordinator. It intentionally
requires live verification instead of embedding a stale SHA, count, or
version.

```text
Campaign objective: Coordinate the Den of Wolves implementation campaign
through truthful, reviewed, validated, merged, and pushed completion of every
implementation prompt, using the changelog to assess progress. Never claim
the campaign is complete until every required prompt and proof boundary is
actually verified.

Starting-state contract: Read CLAUDE.md and this playbook. Fetch and verify
the current origin/main, attached worktree/branch, package version, canonical
prompt count, progress totals, changelog metadata, and coordination status
live. Record the exact values observed; do not reuse a reported SHA, count, or
version without rechecking it.

Dependency contract: Before selecting, assigning, starting, or editing any
numbered prompt, fully read
docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md, run its deterministic dispatcher,
and reconcile the exact row, evidence, hard prerequisites, milestone,
contract, owner gates, and current coordination with current main. Re-read,
rerun, reforecast, and reacquire after any rebase or material main movement.
Use NEXT as the primary resume hint. Claim a later READY_QUEUE item
concurrently only when every hard gate is satisfied/confirmed and ownership is
conflict-free.

Delegation contract: The coordinator is read-only: it makes decisions and
dispatches but does not edit repository files. The implementation Luna edits,
tests, and commits in its own worktree; an independent Luna reviewer reviews
the exact HEAD; and a separately assigned Luna release agent reconciles,
runs the final full gate, merges, pushes, finishes, and cleans up. All
repository changes and reviews use gpt-5.6-luna at xhigh in separate assigned
worktrees, or the repository-required higher Luna max effort for numbered-plan
changes. Never dispatch a Sol child. Use gpt-5.6-terra at xhigh only when one
Terra attempt is reasonably cheaper than about five Luna attempts or repeated
steering is predictable; record the exception and its cost reason. After one
significant miss or repeated steering, issue a fresh clarified Luna brief.

Execution contract: Send one complete brief containing the dependency result,
exact exclusive leaf scopes/claims, live version/changelog/progress metadata,
focused tests, review, release, merge, and stopping requirements. Forecast
shared-file ownership before edits. Run focused red-before-green checks during
work and review, then one final full coordination:validate on the exact
independently reviewed release candidate. Repeat that full gate only if
reconciliation changes the committed inputs, semantics, or exact SHA. Each
child immediately reports exact status, changed paths, commands, and blockers
when its process stops or it reaches a clean commit; keep the entry active
until landed, preserved, or discarded is explicit.

Release contract: Preflight changelog/version/progress compatibility before
completion metadata. Keep local tests, rendered review, deployed behavior,
and capacity proof distinct. Commit, reconcile, re-read dependencies, rerun
the dispatcher, reforecast/reacquire, independently review the exact HEAD,
merge, push, run coordination:finish, release resources, and verify the
resulting local and remote SHAs plus clean worktrees.

Stopping contract: “Reach a stopping point” means open no new lanes. Finish,
commit, preserve, or explicitly discard only already-active slices; release
claims/resources; report exact status when no process is running, a clean
commit exists, or a blocker is reached; then stop. Never wholesale-merge a
stale branch, leave an idle green branch, or overclaim campaign completion.
```

The template is a coordination objective, not permission to bypass product
security, accessibility, source-reference, or release rules. The canonical
dependency authority and `CLAUDE.md` remain binding.

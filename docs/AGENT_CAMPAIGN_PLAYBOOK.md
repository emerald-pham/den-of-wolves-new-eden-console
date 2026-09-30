# Agent campaign playbook

Use this page when a coordinator is managing several independent tasks. It is
an economical coordination aid for a 20-player Firebase game, not a mandatory
multi-agent ceremony. [`CLAUDE.md`](../CLAUDE.md) remains canonical for product,
security, testing, emulator, release, and deployment rules.

For the remaining numbered-prompt campaign, the owner-facing
[playtest checkpoints](PRODUCT_MILESTONES.md) govern shaping, frozen scope,
source-backed assumptions, test-first commits, nontechnical reports, owner
feedback, and cooldown. Use this playbook to coordinate work inside a shape.

## Start with current facts

Read the current JSON prompt catalog at
[`implementation-prompts.json`](implementation-prompts.json) and its generated
Markdown views, then the active shaped checkpoint and prior feedback. Use the
catalog's readiness/dependency check for selected prompts;
`npm run coordination:dependencies -- --prompt NNN` is a read-only
report and creates no nonce or local receipt. `NEXT` is an advisory ready-work
hint. Do not copy old counts, SHAs, versions, or statuses into a new task.
When catalog facts change, run `node scripts/generate-prompt-views.mjs` and use
`--check` to verify the generated Markdown views.

Use one owner per task. Give the owner a complete brief with the accepted
scope, affected surfaces, relevant tests, and any shared session/callable/rules,
deploy/auth, release, or emulator hotspot. The owner implements, obtains any
risk review, repairs findings, reconciles, validates, merges, pushes, verifies
deployment, and closes the task. A separate sidecar or reviewer is optional;
there is no minimum-agent count.

For a shaped checkpoint, assign independent work on the release's critical
path to available subagents when parallel execution is likely to shorten the
release. Give each a bounded task, isolated checkout, shared-file boundary,
and integration handoff; one owner reconciles the release.

## Model and review choices

Only `gpt-6-luna` and `gpt-6.1-sol` may be delegated as subagents. Existing agents may finish their current assignments without interruption; apply this model policy to new agents and subsequent assignments. The default delegated worker model is
`gpt-6-luna`. Luna effort is discretionary; `max` is almost always preferred.
Sol may use all supported effort levels. Use `gpt-6.1-sol` for independent
review of risky changes
touching shared session state, callable authorization, Firestore rules,
deployment, or authentication infrastructure. An exact security review receipt
still requires `xhigh` when the validator says so.
Ask the reviewer for all findings in one pass. Escalate only after actual lack
of progress or a material failed attempt; a typo, copy change, or test-count
correction does not require a handoff. Do not force a Luna → Sol → Luna loop.
Use Sol 6.1 for justified blocker diagnosis or ownership transfer only after the
failed attempt and reason are recorded in the task discussion.

## Scope and concurrency

Freeze the accepted playtest-checkpoint scope. Repair defects that block its
checks. Queue unrelated additions in the
[later-candidate list](PRODUCT_MILESTONE_CANDIDATES.md) for a future shape.
Independent ready prompts may run concurrently when they do not overlap a
shared hotspot. Use `coordination:status` to inspect the current owner,
worktree, process, and emulator reservations. Coordination is optional and
should cover actual shared resources—not every file in a leaf directory.

During a shaped build, resolve routine choices from source evidence and record
assumptions. Continue independent work around an unavailable source or decision;
ask the product owner only when higher authority requires it or no useful work
remains.

Never stop or take over another task because its timestamp looks old, its
process is temporarily quiet, or its live reservation is empty. A parked task
keeps its reservation and records a clear next action; no heartbeat/status
polling loop is needed. Optional goals can remain in chat or the normal session
record. There is no immutable goal artifact, digest comparison, one-shot
completion chain, or ancestry-only merge requirement.

## Normal execution

1. Start with the shaped checkpoint, any due cooldown, and a ready prompt in
   its scope. Continue independent shaped work around blocked prompts.
2. For new behavior, commit its failing test before the implementation commit.
   Never weaken, skip, or delete an existing test to pass; leave a suspect
   existing test intact and flag it. Never change an existing test in the same
   commit as the code it covers. Use focused and rendered checks for UI work.
3. If the change is in the risk-review set, run one independent review and
   collect all findings. The owner performs a bounded repair and reviews the
   resulting diff.
4. Reconcile the owner branch with current `main` and commit the reviewed
   candidate. Run one appropriate final validation on that commit. Rerun only
   after a meaningful input changed, a check failed, or a concern remains.
5. Merge to `main`, push `origin/main`, and verify the actual deployment or
   workflow result after deployment. A pushed workflow, local green test, or rendered screenshot
   is not a substitute for the other kinds of evidence.
6. Hand over a one-sitting UI walkthrough and the nontechnical checkpoint
   report specified in the product plan. Explicit owner authorization accepts
   the checkpoint; walkthrough answers and written UI feedback are optional.
   Record any feedback the owner chooses to give and fix flagged issues in
   cooldown before starting a new checkpoint build.

For a UI change, the implementing agent checks narrow phone, wide desktop, and short
landscape rendering, fonts, contrast, overflow, reduced motion, and visible
return navigation. For server work, preserve client-write denials, callable
authorization and transactions, App Check as a complement to authorization, and
the private-source/secrets boundary.

Product releases increment metadata and add one player-facing changelog entry;
tooling and documentation do neither. Include the catalog snapshot's
completed/total prompt percentage in release notes. Only the product owner may
authorize `0.9.x` or `1.0.0`; `1.0.0` needs the full 20-player end-to-end game,
not a role-count or placeholder-screen claim.

## Communication and stopping

At a requested checkpoint, tell the parent task the current state, changed paths,
commands/results, and any blocker. Do not send repetitive heartbeat chatter.
The parent waits for a completion, blocker, or requested checkpoint with one
interruptible event wait, or yields with a clear resume path. Avoid short
polling loops, unchanged workflow snapshots, and elapsed-time updates during
long tests or deployments; inspect status only at a meaningful boundary or
when an expected bound or concrete failure calls for diagnosis. User input
interrupts the wait.
If another task owns a genuinely overlapping file or resource, message that
owner with the exact overlap and wait or choose a non-overlapping slice; do not
edit through it. A CI visibility gap, ordinary test failure, external
dependency, or pending user decision is not automatically an agent blocker.

When the coordinator reaches a stopping point, open no new lanes. Finish active
owners through their agreed commit/validation/merge path, or record a clear
preserve/discard outcome, release only this campaign's resources, and report
what remains. Do not claim campaign completion from a local branch or copied
roadmap status.

## Campaign checklist

```text
Campaign objective: deliver the accepted Den of Wolves tasks with focused
checks, appropriate risk review, truthful deployment evidence, and one owner
from implementation through merge.

Starting state: read CLAUDE.md, the shaped playtest checkpoint, prior feedback,
assumptions, this playbook, the JSON prompt catalog, current main, active
coordination, and the current package/changelog when product work is in scope.
Record only newly observed facts.

Execution: finish due cooldown, choose ready prompts within frozen checkpoint
scope, commit a failing test before new behavior, use one owner per task, and
coordinate only actual shared session/callable/rules, deploy/auth, release, and
emulator hotspots. Log source-backed assumptions and later candidates.

Review: collect all risk-review findings together, repair in a bounded follow-up,
commit the reconciled reviewed candidate, and run one appropriate final
validation. Rerun only for meaningful changes, failures, or unresolved concerns.

Closeout: merge and push every landed task, verify the real deployment, keep
version/changelog and security claims truthful, and preserve or discard
unfinished work explicitly. Never infer stale ownership from age alone.
```

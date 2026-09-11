# Agent campaign playbook

Use this page when a coordinator is managing several independent tasks. It is
an economical coordination aid for a 20-player Firebase game, not a mandatory
multi-agent ceremony. [`CLAUDE.md`](../CLAUDE.md) remains canonical for product,
security, testing, emulator, release, and deployment rules.

## Start with current facts

Read the current JSON prompt catalog at
[`implementation-prompts.json`](implementation-prompts.json) and its generated
Markdown views. Use the catalog's readiness/dependency check before selecting a
prompt; `npm run coordination:dependencies -- --prompt NNN` is a read-only
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

## Model and review choices

Luna at `max` or `xhigh` is the economical default. Terra is an independent
review option for risky changes touching shared session state, callable
authorization, Firestore rules, deployment, or authentication infrastructure.
Ask the reviewer for all findings in one pass. Escalate only after actual lack
of progress or a material failed attempt; a typo, copy change, or test-count
correction does not require a handoff. Do not force a Luna → Terra → Luna loop.
Sol is not a default child and may be used only after a permitted escalation is
actually reached, with the reason recorded in the task discussion.

## Scope and concurrency

Freeze the accepted prompt scope. Queue unrelated improvements for later; add
work only for a directly blocking defect and record that reason.
Independent ready prompts may run concurrently when they do not overlap a
shared hotspot. Use `coordination:status` to inspect the current owner,
worktree, process, and emulator reservations. Coordination is optional and
should cover actual shared resources—not every file in a leaf directory.

Never stop or take over another task because its timestamp looks old, its
process is temporarily quiet, or its live reservation is empty. A parked task
keeps its reservation and records a clear next action; no heartbeat/status
polling loop is needed. Optional goals can remain in chat or the normal session
record. There is no immutable goal artifact, digest comparison, one-shot
completion chain, or ancestry-only merge requirement.

## Normal execution

1. Select a ready prompt from the catalog and accept its bounded scope.
2. Implement the smallest useful change with focused, meaningful checks. Use
   red-before-green tests for new security, authority, callable, rules, and
   complex gameplay behavior; reversible copy/CSS work can use a focused or
   rendered check instead.
3. If the change is in the risk-review set, run one independent review and
   collect all findings. The owner performs a bounded repair and reviews the
   resulting diff.
4. Reconcile the owner branch with current `main` and commit the reviewed
   candidate. Run one appropriate final validation on that commit. Rerun only
   after a meaningful input changed, a check failed, or a concern remains.
5. Merge to `main`, push `origin/main`, and verify the actual deployment or
   workflow result after deployment. A pushed workflow, local green test, or rendered screenshot
   is not a substitute for the other kinds of evidence.

For a UI change, the owner checks narrow phone, wide desktop, and short
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

Starting state: read CLAUDE.md, this playbook, the JSON prompt catalog, current
main, active coordination, and the current package/changelog when product work
is in scope. Record only newly observed facts.

Execution: choose ready prompts, freeze each accepted scope, use one owner per
task, and coordinate only actual shared session/callable/rules, deploy/auth,
release, and emulator hotspots.

Review: collect all risk-review findings together, repair in a bounded follow-up,
commit the reconciled reviewed candidate, and run one appropriate final
validation. Rerun only for meaningful changes, failures, or unresolved concerns.

Closeout: merge and push every landed task, verify the real deployment, keep
version/changelog and security claims truthful, and preserve or discard
unfinished work explicitly. Never infer stale ownership from age alone.
```

# AGENTS.md

Read [`CLAUDE.md`](./CLAUDE.md) before doing repository work. It is the single
source of truth for agent and contributor workflow, including branch and
worktree setup, test-first requirements, delegation, security, versioning,
validation, merge, and cleanup rules. For numbered implementation-plan work,
fully read the mandatory
[`IMPLEMENTATION_PROMPT_DEPENDENCIES.md`](./docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md)
authority before selecting, assigning, starting, or editing a prompt; run its
deterministic dispatcher and reconcile the exact row and hard prerequisites
with current `main` and active coordination before work begins. Re-read this
authority after a rebase or material movement of current `main`. A prompt
cannot be marked complete or merged while a hard prerequisite remains unmet.
All repository changes except documentation-only commits must be bound to a
registered implementation prompt. Work not charted at its trusted `main`
branch baseline must add its plan, progress-ledger, and dependency-index records
with explicit dependency evidence in its first non-documentation commit, which
must carry the matching `Implementation-Prompt:` trailer. `CLAUDE.md` defines
the executable gates and the exact documentation-only boundary.

The dependency authority's `NEXT` (first `READY_QUEUE`) item is the primary
resume/default lane but is advisory for concurrency, not a serial execution
lock. A separate worktree may claim a later `READY_QUEUE` item concurrently
only when its hard prompt prerequisites are done, every hard milestone, hard
contract, and decision-owner gate is satisfied or explicitly confirmed, and the
coordination forecast shows conflict-free ownership with no active claim
overlap. A worktree must not bypass an unmet dependency, active claim, or
unresolved decision-owner gate merely because the prompt is independent.

This file is intentionally only a pointer. Do not duplicate those rules here:
when guidance appears to differ, `CLAUDE.md` wins. Its session checklist must
include the immediate green-validation merge objective: commit, reconcile with
`main`, merge, push, and close coordination before going idle.
The executable `coordination:validate` and `coordination:finish` commands are
the machine-checked release gate; do not mark an entry complete by editing the
ledger or supplying an unverified result.

## Durable agent phase floors

Phase floors are role-specific and durable: the implementation phase uses
GPT-5.6 Luna (`gpt-5.6-luna`) at `max`, independent review uses GPT-5.6 Terra
(`gpt-5.6-terra`) at `xhigh`, and reconciliation/validation/merge/push/deployment
uses GPT-5.6 Luna at `max`. If a Luna attempt fails, reassign that same agent
role to `gpt-5.6-terra` at `xhigh`; if a Terra attempt then fails,
`gpt-5.6-sol` is authorized for that same agent role only. The escalation tier belongs to the role and
must never reset or downgrade when a task or worktree is replaced. Detect and
stop any Luna/Terra loop: do not retry Luna after that role reaches Terra or
alternate between tiers. Before dispatching Sol, explain in user-visible chat
why that role needs Sol, the observed failures, and that Sol is 10 times as
expensive as Luna.

## Session-goal lifecycle

At `coordination:begin`, record every session goal as a repeated `--session-goal
"- [ ] ..."` argument, including the immediate release objective. The registry
creates a deterministic ignored working artifact with an immutable original
representation. At wrap-up, use `coordination:goals` to record checked/unchecked
outcomes and explanations; exact goal identity, order, and text are validated.
`coordination:finish` fails when the artifact is absent, malformed, or
un-compared, and it cleans up only after other gates succeed and verifies the
artifact's absence. Cleanup verifies artifact absence before completion. The
explicit `legacy-exempt` policy covers P012/P014/P664 entries without an
artifact and records that comparison in history; every new entry remains
required. Include this exact objective: As soon as required validation is
green: commit, reconcile with current main, merge to main, push to origin, and
close coordination.

## Private reference archive

The removed `docs/reference/` library is retained for authorized local
recovery in the owner-only archive at
`/Users/emeraldpham/.codex/private-reference/den-of-wolves-new-eden-console/docs/reference/`.
This archive is outside Git, has no `.git` metadata or GitHub remote, and must
not be copied, committed, linked, or quoted into this repository or GitHub.

## Start-of-run priority

Instructions read and followed at the start of an agent run are more likely to
stick than instructions added at the end. Read `CLAUDE.md` before substantive
work and follow its startup checklist—including the per-agent changelog
preflight—and read the prompt dependency authority before selecting or editing
any numbered prompt—before coding. Run its dispatcher and reconcile current
coordination before continuing, then re-read it after a rebase or material
movement of current `main`.

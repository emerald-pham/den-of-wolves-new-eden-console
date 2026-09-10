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

This file is intentionally only a pointer. Do not duplicate those rules here:
when guidance appears to differ, `CLAUDE.md` wins. Its session checklist must
include the immediate green-validation merge objective: commit, reconcile with
`main`, merge, push, and close coordination before going idle.
The executable `coordination:validate` and `coordination:finish` commands are
the machine-checked release gate; do not mark an entry complete by editing the
ledger or supplying an unverified result.

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

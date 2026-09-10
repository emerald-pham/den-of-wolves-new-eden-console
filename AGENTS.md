# AGENTS.md

Read [`CLAUDE.md`](./CLAUDE.md) before doing repository work. It is the single
source of truth for agent and contributor workflow, including branch and
worktree setup, test-first requirements, delegation, security, versioning,
validation, merge, and cleanup rules.

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
preflight—before coding.

# AGENTS.md

**Read [`CLAUDE.md`](./CLAUDE.md) first and follow it.** It is the single source
of truth for how work is done in this repository, and it applies to every agent
and every tool — Claude Code, Codex, Cursor, Copilot, anything else.

Key rules from it are repeated here so no agent can claim it
only read this file:

0. **Start in the checkout you will edit.** Read `CLAUDE.md`, then run
   `pwd`, `git branch --show-current`, `git status --short --branch`, and
   `git log -1 --oneline --decorate`. If the branch is empty, create a unique
   short-lived branch in this same worktree before changing anything. A branch
   that exists elsewhere does not fix a detached checkout. Run
   `coordination:begin` from this worktree, verify its recorded path with
   `coordination:status`, and keep its printed id for completion.

1. **Test first for code.** A failing test exists and has been *run* before any
   implementation code is written. No exceptions for "small" code changes.
   Documentation-only edits are exempt; see `CLAUDE.md` for the exact boundary.
2. **Merge once done.** Work happens on a branch and lands on `main` the moment
   it is green and complete. No long-lived branches, no stacked half-finished
   work, no "I'll merge it later."

3. **Version every completed product edit.** Keep the monotonic application
   version in sync and visible. Documentation-only edits do not change the
   application version. Patch numbers may exceed 9; reserve `0.9.x` for genuine
   release-candidate maturity, and never call a build `1.0.0` until the complete
   20-player set has full, complex gameplay across interacting systems and a
   clear game end. See `CLAUDE.md` for the full policy.

4. **Maximize suitable subagent use with Luna only.**
   Do not use GPT-5.3 Codex Spark (`gpt-5.3-codex-spark`) for this repository.
   Fan out independent, bounded reconnaissance, implementation, and verification
   tracks early so the parent stays focused on coordination and integration;
   prefer this to growing or compressing the parent context. Keep the split
   concrete and skip it when no safe sidecar exists.
   At startup, clean up terminal child agents first: retrieve any result still
   needed, then close every completed, errored, or interrupted child owned by
   this parent or surfaced from an inactive chat before substantive work or new
   delegation. Leave pending or running children from any chat alone.
   Delegated subagents have full read/write access to their assigned worktree:
   they may inspect, create, edit, rename, and delete files, run commands and
   tests, and perform well-scoped implementation work. No read-only restriction
   applies to delegated subagents. Use GPT-5.6 Luna (`gpt-5.6-luna`) at `high`
   reasoning when delegation saves total effort and tokens after setup, context
   transfer, and review. Every delegated agent that changes files must use its
   own worktree and short-lived branch. Full read/write access is scoped to that
   worktree and does not authorize merging or pushing. The primary agent retains
   high-risk security, authentication, authorization, architecture, and product
   decisions, plus all review, integration, versioning, merge, and push.
   Close each completed child with `close_agent`, because finished descendants
   remain open and consume concurrency capacity until closed.
   Follow [Routine task delegation](./CLAUDE.md#routine-task-delegation) for
   scope, model availability, review, and integration requirements.

Everything else — stack, layout, the security model, what may and may not be
written from a client, commit conventions — is in `CLAUDE.md`. Go read it.

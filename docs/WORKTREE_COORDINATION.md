# Local worktree coordination

Use this page as the command reference for the shared local coordination
ledger. [`CLAUDE.md`](../CLAUDE.md) remains the canonical source for branch,
version, validation, emulator, merge, and cleanup policy.

The ledger is a Git-ignored JSON file in the OS temporary directory, normally
named `den-of-wolves-new-eden-coordination.json`. It records worktree intent,
version/changelog agreements, configured emulator rows, and live process
reservations. Set `DOW_EMULATOR_COORDINATION_FILE` to use another shared path.

## Coordination hardening objectives

Coordination changes are evaluated against these objectives before tests or
implementation begin:

1. Preserve release truth without false positives. Historical changelog entries
   are identified by their resolved release version and entry body; changing a
   former top entry from `APP_VERSION` to that explicit version must not look
   like a release-note rewrite.
2. Keep the normal path short. A correctly attached, registered, clean task
   should not need new manual confirmations merely to begin, validate, land, or
   finish.
3. Fail at ownership boundaries. Setup and teardown gates should reject the
   wrong worktree, branch, coordination entry, version claim, or live resource
   before another task can be disturbed.
4. Recover only state the repository can prove is stale. Repository tooling may
   prune dead process leases and orphaned emulator rows; Codex child-agent
   cleanup remains a runtime responsibility because the repository cannot
   enumerate or close agents from other tasks.
5. Make the release sequence auditable. The final receipt must stay bound to the
   tested branch commit, merged local `main`, matching `origin/main`, and the
   task's own released resources.

The executable tests are the acceptance criteria for these objectives. This
section states the intended invariants; a newly described gate is not considered
implemented until its failing regression test and implementation land together.

The current hardening slice has four acceptance conditions:

- Changelog preservation canonicalizes the resolved `version:` declaration so
  an unchanged historical entry remains unchanged after `APP_VERSION` moves to
  the next release.
- Validation refuses to record a receipt until current local `main` is an
  ancestor of the task branch.
- Finish refuses to close an entry while that entry's worktree owns a live
  emulator reservation; it never stops or releases another worktree's process.
- Default status is active-first and compact. Full ledger history stays
  available on request, while status recovery may release a configured row for
  a worktree that no longer exists only when no live reservation still owns it.

## Before editing

After attaching a short-lived branch—and before changing any file—register the
work from the exact checkout you will edit:

```bash
npm run coordination:begin -- \
  --intent "Prevent rules tests from colliding with preview emulators." \
  --version-plan "No application version bump: development tooling only." \
  --preemptive-changelog "No player-facing change; rules validation remains reliable during preview." \
  --resources "emulator-slot-4,shared-coordination-file"
```

Save the printed id, then inspect the ledger:

```bash
npm run coordination:status
```

Confirm that the entry's absolute `worktree:` path matches `pwd`, the branch is
attached to that checkout, and no active entry claims overlapping work. A blank
branch, path mismatch, or unexpected commit is an unresolved handoff.
The default pane shows active work and a count of hidden completed entries so
startup review stays concise. Use `npm run coordination:status -- --history`
only when a historical validation or release receipt is needed.
The begin command records the attached branch, starting branch SHA, and starting
`main` SHA; it refuses detached checkouts, direct work on `main`, and duplicate
active entries for this worktree.

For player-facing work, the preemptive changelog is the first release step, not
a roll-up written at the end. Claim one unused release version for this task,
record that exact version in `--version-plan`, update `package.json` and the root
lockfile, and add one standalone top-level entry to `src/changelog.ts` before
writing implementation tests or code. Each versioned entry belongs to one task;
never append a second agent's note to the existing current-version object. If an
active entry already claims the version, or `main` advances before merge,
reconcile the version and preserve each task's separate entry.

## Emulator rows

Configure a worktree with the atomic selector:

```bash
npm run emulators:configure -- auto
```

It selects the first complete free row, checks all nine ports, and records the
durable configuration while holding the shared lock. An explicit slot remains
available for intentional pinning. Do not scan status and choose a row in a
separate step. Configured rows are unavailable to other worktrees while their
coordination entry is active or a live process lease exists, even when the
live-reservations section is empty. Startup/status cleanup releases rows tied
only to completed or missing worktrees.

The emulator commands also claim their configured slot in the same file. Rules
tests prefer the worktree's configured row, but automatically claim another
complete free row when that row is already running a preview or another
worktree. They release the temporary reservation when the command exits.

Start cleanup is authoritative because end cleanup may be skipped: inspect
terminal child tasks, coordination status, live process reservations, and
configured rows whose worktree is missing before starting new work. The status
command prunes dead process reservations. Reconcile a configured row whose
worktree still exists with the task/process state before releasing it; never
release a live worktree's row just because no process lease is visible. The
status command prunes dead process reservations and configured rows tied only
to completed or missing worktrees.

Each active worktree needs one complete Firebase/Vite slot. An explicit slot
remains available when a particular row is required. The command and test
runner verify the row and record ownership; long-running processes release
their reservations when they exit. Never mix ports from different rows or take
a listening port from another worktree.

The full slot matrix, port checks, and concurrent-test guidance are in
[`CLAUDE.md`](../CLAUDE.md#concurrent-worktrees-and-emulator-ports).

## Machine validation

After committing the task changes, reconcile the task branch with current
`main`, commit any conflict resolution, and then run the executable gate from
the same checkout before merging:

```bash
npm run coordination:validate -- \
  --id "<id printed by coordination:begin>" \
  --documentation-review "Rendered text, links, examples, and final diff reviewed." \
  --visual-review "Narrow, wide, and short-landscape states reviewed."
```

Only pass the review flags when their scopes apply. The gate derives the command
plan from committed files: documentation-only changes run the diff check and
`npm run coordination:docs`, while code changes run lint, all tests, and both
production builds. The documentation check verifies changed Markdown/README
links, fenced blocks, referenced npm scripts, and the canonical agent guidance.
It records a receipt tied to the exact branch SHA, rejects rewritten baselines, stale
versions, package/lock mismatches, changelog replacement, and validation before
the task branch contains current local `main`. Historical changelog comparison
resolves `APP_VERSION` before comparing entry bodies, so moving an unchanged
former top entry to its explicit version does not create a false replacement.
The review flags are explicit human attestations; the receipt cannot prove that
a person truly performed the review.

## Finish

From the same checkout that began the work, close only its own entry:

```bash
npm run coordination:finish -- \
  --id "<id printed by coordination:begin>" \
  --result "Merged after the local gate passed."
npm run coordination:status
```

Use the exact id printed by `coordination:begin`, then run
`npm run coordination:status` once to confirm it is no longer active. Do this
before deleting the branch or worktree; never finish an entry copied from
another worktree. The registry prunes dead process reservations, and
startup/status recovery releases configured rows tied only to completed or
missing worktrees. End cleanup is still required—stop processes started by the
task, release its live reservation, finish its entry, close completed children,
and perform the final status check—but startup cleanup is the recovery boundary
when any of those steps were skipped.
`coordination:finish` refuses completion until `main` contains the task commit,
local `main` equals `origin/main`, the worktree is clean, package metadata and
changelog state are safe, the validation receipt matches the final branch SHA,
and this worktree owns no live emulator reservation. It reports the owned lease
instead of killing or releasing it; stop this task's process and rerun finish.
The command records the final branch SHA, main SHA, remote SHA, and pushed state.
The final status should omit the entry from the active view and show no live
process reservation left behind; use `--history` when the historical receipt is
needed. Do not finish an id copied from another worktree.

Codex child agents are outside the repository process model. Inspect and close
terminal children with the collaboration runtime at startup and teardown; no
repository flag can enumerate them or replace that cleanup.

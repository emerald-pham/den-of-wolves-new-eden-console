# Local worktree coordination

All worktrees on the same machine share a small coordination file in the OS
temporary directory:

```text
den-of-wolves-new-eden-coordination.json
```

Set `DOW_EMULATOR_COORDINATION_FILE` when a different shared path is needed.
The file is outside the repository, ignored by Git, and contains a readable
version-agreement pane, preemptive changelog entries, configured emulator rows,
and live emulator reservations. It is local coordination data, not product
state.

## Before editing

After checking out a short-lived branch and before changing a file, register the
work in the shared ledger:

```bash
npm run coordination:begin -- \
  --intent "Prevent rules tests from colliding with preview emulators." \
  --version-plan "No application version bump: development tooling only." \
  --preemptive-changelog "No player-facing change; rules validation remains reliable during preview." \
  --resources "emulator-slot-4,shared-coordination-file"
```

When following or recovering another entry, match its absolute `worktree:` path
with its Git identity before editing:

```bash
git -C "<worktree-path>" branch --show-current
git -C "<worktree-path>" rev-parse --short HEAD
git worktree list --porcelain
```

A blank branch, a path mismatch, or an unexpected commit is an unresolved
handoff. Do not edit or finish that entry until it is reconciled.

The three required fields are deliberately explicit. Product work states the
planned application version and its player-facing release note before coding;
tooling, documentation, and test-only work state that no application version or
player-facing changelog entry is expected.

Inspect the shared status pane at any time:

```bash
npm run coordination:status
```

Only `[active]` entries represent current work claims. `[complete]` entries are
historical and do not reserve a worktree, branch, or emulator resource.

The emulator commands also claim their configured slot in the same file. Rules
tests prefer the worktree's configured row, but automatically claim another
complete free row when that row is already running a preview or another
worktree. They release the temporary reservation when the command exits.

When the task is complete, close its preemptive entry:

```bash
npm run coordination:finish -- \
  --id "<id printed by coordination:begin>" \
  --result "Merged after the local gate passed."
```

From the same checkout that began the task, close the entry using the exact id
printed by `coordination:begin`, then run `npm run coordination:status` once to
confirm it is no longer active. Do this before deleting the branch or worktree;
never finish an entry copied from another worktree. The registry prunes dead
process reservations. A configured row remains visible until that worktree
configures another row, so an abandoned worktree cannot be silently reused by a
different worktree.

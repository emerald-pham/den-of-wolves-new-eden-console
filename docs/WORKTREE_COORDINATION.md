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

The three required fields are deliberately explicit. Product work states the
planned application version and its player-facing release note before coding;
tooling, documentation, and test-only work state that no application version or
player-facing changelog entry is expected.

Inspect the shared status pane at any time:

```bash
npm run coordination:status
```

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

The registry prunes dead process reservations. A configured row remains visible
until that worktree configures another row, so an abandoned worktree cannot be
silently reused by a different worktree.

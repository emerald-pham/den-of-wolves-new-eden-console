# Local worktree coordination

Use this page as the command reference for the shared local coordination
ledger. [`CLAUDE.md`](../CLAUDE.md) remains the canonical source for branch,
version, validation, emulator, merge, and cleanup policy.

The ledger is a Git-ignored JSON file in the OS temporary directory, normally
named `den-of-wolves-new-eden-coordination.json`. It records worktree intent,
version/changelog agreements, configured emulator rows, and live process
reservations. Set `DOW_EMULATOR_COORDINATION_FILE` to use another shared path.

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

## Emulator rows

Each active worktree needs one complete Firebase/Vite slot. Configure a free
row with `npm run emulators:configure -- <slot>` before starting emulators or
rules tests. The command and test runner verify the row and record ownership;
long-running processes release their reservations when they exit. Never mix
ports from different rows or take a listening port from another worktree.

The full slot matrix, port checks, and concurrent-test guidance are in
[`CLAUDE.md`](../CLAUDE.md#concurrent-worktrees-and-emulator-ports).

## Finish

From the same checkout that began the work, close only its own entry:

```bash
npm run coordination:finish -- \
  --id "<id printed by coordination:begin>" \
  --result "Merged after the local gate passed."
npm run coordination:status
```

The final status should show the entry as historical rather than active, with
no live process reservation left behind. Do not finish an id copied from
another worktree.

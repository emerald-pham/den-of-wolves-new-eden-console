# Local storage and safe cleanup

Each checkout can have its own root and Functions `node_modules`, build output,
browser evidence, and emulator logs. Hundreds of finished checkouts can consume
substantial storage even when Git shares its object database.

## Prevent accumulation

Before creating additional worktrees or installing dependencies, run
`npm run storage:status` from an existing checkout. It is a fast, read-only
filesystem/headcount check with advisory warnings below 20 GiB available or
above 20 registered worktrees. It does not block CI, install hooks, remove files,
or certify cleanup safety. `npm run storage:status -- --sizes` measures registered
checkouts individually; it may take several minutes. APFS clones can make summed
directory sizes larger than the physical space deletion would reclaim.

Use the task's existing assigned checkout rather than creating redundant copies.
Install only dependencies needed for its checks. At task closeout, either remove
the eligible checkout using the procedure below or state why it is retained and
who owns the next action. Parked work is retained with its concrete resume path.
Do not leave a finished checkout indefinitely merely as a precaution, and do not
delete one merely because it is old. Review accumulation when the warning fires.

## Review before any deletion

1. Inspect `git worktree list --porcelain`, current task status, and
   `npm run coordination:status`. Protect the current and main checkouts,
   active or parked tasks, and any configured or reserved emulator worktrees.
   Missing ledger entries do not prove that a task is terminal.
2. Confirm the owner task is finished. Check for live processes using the target
   path (including terminals, servers, watchers, browsers, and emulators).
   A process may use files outside its working directory. If process inspection
   is unavailable or ambiguous, retain the checkout; never kill it to enable
   cleanup. Repeat these checks immediately before removal.
3. Inspect `git -C <absolute-checkout> status --short --untracked-files=all` and
   `git -C <absolute-checkout> ls-files --others --ignored --exclude-standard`.
   A clean status does not include ignored local configuration, reports, source
   references, or artifacts. Preserve valuable ignored files explicitly.
4. Fetch the current remote state and verify the checkout's HEAD is an ancestor
   of `origin/main` using `git -C <absolute-checkout> merge-base --is-ancestor
   HEAD origin/main`. Verify the command succeeds; a squash merge or unmerged
   branch needs a separate owner-reviewed preservation decision. Preserve all
   uncommitted/untracked work and unique commits. Never assume a pushed feature
   branch is merged, or that an archived task means its work was landed.
5. Remove only the exact reviewed checkout with `git worktree remove
   <absolute-checkout>`, from a different retained checkout. Do not use `--force`,
   broad `rm -rf`, wildcard deletion, `git clean -fdx`, or automatic age-based
   pruning. If Git refuses, investigate and preserve the reason. Keep branch refs
   unless separately reviewed; do not delete the shared Git directory.
6. Compare filesystem free space before and after. Report actual reclaimed
   space and retained work separately. Directory size is only an estimate.

## Smaller cleanup when a checkout must be retained

For a terminal, inactive checkout, its exact root `node_modules` and
`functions/node_modules` directories can be considered separately after checking
they contain no locally modified packages, linked development packages, or needed
artifacts. Inspect incoming dependency symlinks from other checkouts too; retain
shared targets even when their owning task is finished. Keep lockfiles and source. Restore with `npm ci` and
`npm ci --prefix functions` before resuming work. Do not remove dependencies
under active processes or another owner's active/parked task without coordination.

Build output, logs, and test evidence require an explicit review of whether they
are still needed for debugging or release proof. Preserve `.env*`, Firebase local
configuration, private references, Git state, task history, and user documents.
Do not treat every ignored file or everything under `.codex` as a cache.

macOS-wide cleanup (simulators, app caches, backups, containers, and snapshots)
is separate from repository cleanup. This repository does not delete those.

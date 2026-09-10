# Codex-wide coordination

Use this page as the command reference for the Codex-wide coordination ledger.
[`CLAUDE.md`](../CLAUDE.md) remains the canonical source for branch, version,
validation, emulator, merge, and cleanup policy.

The ledger is a Git-ignored JSON file in the OS temporary directory and is
shared by every local repository on this host. It records each participating
worktree's intent, version/changelog agreements, configured emulator rows, and
live process reservations. It is not scoped to the current repository or
directory. Set the canonical `CODEX_COORDINATION_FILE` to the same absolute
path when another project's coordination wrapper needs an explicit location.
`DOW_EMULATOR_COORDINATION_FILE` remains a compatibility alias. Use the path
printed by `coordination:status` to verify that all projects are on one ledger.

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
6. Make every closeout truthful and recoverable. Landed work must prove its
   merge and push; preserved work must prove an addressable commit or archive;
   discarded work must record an explicit review decision without implying a
   merge or push.
7. Keep test growth proportional to new behavior. Security, authority,
   retry, privacy, route, and accessibility coverage remains load-bearing;
   duplicate fixtures and process-only expansion require an explicit review
   when a task adds much more test code than new test cases.

The executable tests are the acceptance criteria for these objectives. This
section states the intended invariants; a newly described gate is not considered
implemented until its failing regression test and implementation land together.

The current hardening slice has the following acceptance conditions:

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
- Closeout records one explicit outcome (`landed`, `preserved`, or `discarded`)
  and leaves the entry active when its outcome or evidence is invalid.
- Wrapper-owned child processes have one recorded owner and receive signal
  teardown; a wrapper must not release another worktree's reservation.
- Structured work type, scope, and resource claims reject overlapping intent
  before setup, validation, or teardown can disturb another task.
- Test-growth validation measures committed test-file additions from the task
  baseline. A disproportionate addition pauses validation for a concise
  justification, while unchanged test files and ordinary focused additions
  continue without extra ceremony.

## Before editing

After attaching a short-lived branch—and before changing any file—register the
work from the exact checkout you will edit:

```bash
npm run coordination:begin -- \
  --intent "Prevent rules tests from colliding with preview emulators." \
  --work-type "tooling" \
  --scope "scripts,src/config,docs" \
  --claims "coordination-registry,emulator-slot" \
  --version-plan "No application version bump: development tooling only." \
  --preemptive-changelog "No player-facing change; rules validation remains reliable during preview." \
  --resources "emulator-slot-4,shared-coordination-file"
```

Save the printed id, then inspect the ledger:

```bash
npm run coordination:status
```

Confirm that the entry's absolute `worktree:` path matches `pwd`, the branch is
attached to that checkout, and no active entry—including one from another
repository—claims overlapping work. A blank branch, path mismatch, or
unexpected commit is an unresolved handoff.
For numbered implementation-plan work, read the mandatory
[`IMPLEMENTATION_PROMPT_DEPENDENCIES.md`](./IMPLEMENTATION_PROMPT_DEPENDENCIES.md)
before selecting, assigning, starting, or editing the prompt. Reconcile its
exact row, hard prerequisites, milestone/contract/owner gates, ordering
context, evidence, and live progress with current `main` and this coordination
registry; run its dispatcher before claiming the exact scope. Re-read it after
any rebase or material movement of current `main`.
`NEXT` (the first item in `READY_QUEUE`) is the primary resume/default lane, but
it is advisory for concurrency, not a serial execution lock. A separate
worktree may claim a later `READY_QUEUE` item concurrently only when its hard
prompt prerequisites are done, every hard milestone, hard contract, and
decision-owner gate is satisfied or explicitly confirmed, and the coordination
forecast shows conflict-free ownership with no active claim overlap. A worktree
must not bypass an unmet dependency, active claim, or unresolved decision-owner
gate merely because the prompt is independent.
The default pane shows active work and a count of hidden completed entries so
startup review stays concise. Use `npm run coordination:status -- --history`
only when a historical validation or release receipt is needed.
The begin command records the attached branch, starting branch SHA, and starting
`main` SHA; it refuses detached checkouts, direct work on `main`, and duplicate
active entries for this worktree.

`--work-type`, `--scope`, and `--claims` make the ownership boundary explicit.
Use a stable work type such as `product`, `tooling`, `documentation`, or
`investigation`. Register investigation without an exclusive path claim, then
forecast the intended edit before writing it:

```bash
node scripts/emulator-resource-registry.mjs forecast --scope "src/components/Example.tsx"
```

The forecast lists every matched scope or resource claim, its owner/worktree,
and its lease state, with a leaf-file alternative when a broad directory claim
causes unnecessary serialization. Claim exact files immediately before editing;
use a directory or `*` only for an intentional architecture-wide change.
Renew active ownership with `heartbeat` and release only an unneeded claim from
the same task/worktree. A lease that needs owner confirmation is still an
exclusive claim: it remains visible and blocking until that owner explicitly
releases or refreshes it. Neither status cleanup nor another worktree may
auto-take it. Read-only investigation may omit claims only when it declares
that no shared resource or file area is being reserved. The entry retains these
fields in history so later cleanup can identify what was owned without guessing
from free-form intent text. `--resources` remains the human-readable
emulator/service detail; it does not replace structured claims.

For player-facing work, a prepared release fragment is the first release step,
not a roll-up written at the end. Before implementation tests or code, prepare
one fragment containing the task identity, current-main base version, concrete
player-facing notes, implementation prompts, and progress snapshot. The release
lane finalizes exactly one fragment at a time: it checks the base version,
allocates only the next valid version, and atomically writes synchronized
`package.json`, root lockfile, and one standalone top-level `src/changelog.ts`
entry. A stale or out-of-order fragment is rejected rather than renumbered or
combined. This keeps each task's visible release separate without forcing every
feature agent to edit the same three files during implementation.
When the task comes from the implementation plan, also pass
`--implementation-prompt NNN` or `NNN<letter>`, set that row to `in-progress`
in `docs/IMPLEMENTATION_PROGRESS.md`, and declare `feature` or `non-feature`
in the ledger. The shared registry rejects duplicate active claims for one
normalized prompt ID while allowing distinct base and lettered IDs to proceed
concurrently. A feature row must name its release or releases, and each real
changelog entry must list the prompt in `implementationPrompts` with a concrete
player-facing change; the preemptive sentence alone does not pass the gate.
Only a tooling-only gate task may expand the current release's aggregate plan
summary into prompt-level notes; older release entries remain protected.

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

### Wrapper process ownership and signal teardown

`run-emulator-command.mjs` owns the reservation it creates and is the only
process allowed to release it. The reservation records the wrapper owner and
the spawned child PID; the child is not an independent worktree owner. On
normal exit, error, `SIGINT`, or `SIGTERM`, the wrapper forwards the signal to
that child process group, waits for the child exit path, and releases exactly
its own reservation. Repeated signals share one teardown path. A signal or
cleanup handler must never release a reservation by slot, PID, or worktree
unless the reservation ID belongs to that wrapper.

The wrapper preserves the child's exit code or terminating signal after cleanup.
If escalation is needed, it is limited to that child process group; it must not
target another task's PID. A status pass may prune a dead wrapper reservation,
but it must not infer that a still-live child is safe to stop. When diagnosing a
stuck process, use the reservation's owner PID, child PID, command, and worktree
together.

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
production builds plus `npm run validate:implementation-progress`. The documentation check verifies changed Markdown/README
links, fenced blocks, referenced npm scripts, and the canonical agent guidance.
It records a receipt tied to the exact branch SHA, rejects rewritten baselines, stale
versions, package/lock mismatches, changelog replacement, and validation before
the task branch contains current local `main`. Historical changelog comparison
resolves `APP_VERSION` before comparing entry bodies, so moving an unchanged
former top entry to its explicit version does not create a false replacement.
Implementation-plan product validation also requires the progress ledger to be
committed and reruns its changelog-coverage gate before recording the receipt.
The documentation gate also rejects a completed prompt whose dependency index
lists an unresolved hard prerequisite. A prompt cannot be marked complete or
merged while a hard prerequisite remains unmet; closure/evidence gates are
completion checks and are not silently converted into start blockers.
When the task changes test files, validation also runs the test-growth review
gate. It pauses when the committed diff adds at least 160 test lines and at
least 40 lines per newly declared test case, or adds test lines without a new
case. It also pauses when a changed test file newly reuses the same `it.each`
or `test.each` parameter matrix in more than one test declaration, because the
assertions can usually share one render or fixture pass. Existing duplicate
matrices are recorded as baseline debt and do not block unrelated changes. A
legitimate fixture, matrix, security, or composition expansion may continue
with `--test-growth-justification "..."`; the metrics and explanation are
stored in the receipt. Preview the same check with
`npm run test:growth -- --base main`.
The review flags are explicit human attestations; the receipt cannot prove that
a person truly performed the review.

## Finish

From the same checkout that began the work, close only its own entry:

```bash
npm run coordination:finish -- \
  --id "<id printed by coordination:begin>" \
  --outcome landed \
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

Every closeout has one explicit outcome. `landed` is the normal path (and may
remain the default when `--outcome` is omitted); it requires the existing
validation receipt, merge into current local `main`, equality between local and
remote `main`, a clean checkout, and no owned live reservation. It records
`outcome: landed`, the final branch/main/remote SHAs, and `pushed: true`.

Use `preserved` only when the work will not merge now but must remain usable:

```bash
npm run coordination:finish -- \
  --id "<id>" \
  --outcome preserved \
  --preserve-ref "origin/feature/coordination-follow-up" \
  --result "Preserved for the next coordination slice."
```

Exactly one remote preservation ref is required. It is verified with
`git ls-remote` and must point to the final branch SHA. Generic text such as a
commit hash or an unverified path is not preservation evidence.
The current executable gate does not verify a generic archive path; do not mark
an archive as preserved through this command unless a future gate adds an
explicit archive verifier.
Preserved work must have committed changes after the recorded start SHA and a
clean worktree. It does not require merge, a release validation receipt, or a
push to `main`; record `outcome: preserved`, the destination kind/value,
verified commit SHA, and verification time. `pushed` must be false (or absent)
for the `main` release, even when the preservation ref itself was pushed.

Use `discarded` only after reviewing the work and deciding it is unnecessary:

```bash
npm run coordination:finish -- \
  --id "<id>" \
  --outcome discarded \
  --reason "Superseded by the merged implementation."
```

The reason and a clean worktree are required. Discarding does not require a
task commit, validation, merge, or push, and never deletes files, branches, or
worktrees. Record `outcome: discarded`, the reason, the observed branch SHA,
the task's changed-file summary, and `pushed: false`; do not record merge or
remote-push success. Reject preservation flags with `discarded`, and reject a
missing destination or reason before changing the entry.

For every outcome, an invalid claim, dirty checkout, wrong worktree, live
reservation, missing preservation evidence, or changed entry leaves the entry
`active`. Typical failures are explicit: `--outcome` must be one of
`landed|preserved|discarded`; preserved work must specify exactly one verified
destination; discarded work requires `--reason`; and a live owned reservation
must be stopped by its wrapper before retrying finish. The command never kills
or releases another worktree's process. Terminal entries retain their work
type, scope, claims, outcome, evidence, and timestamps for history and cleanup.

Codex child agents are outside the repository process model. Inspect and close
terminal children with the collaboration runtime at startup and teardown; no
repository flag can enumerate them or replace that cleanup.

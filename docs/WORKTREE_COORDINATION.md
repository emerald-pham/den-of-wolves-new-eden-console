# Codex-wide coordination command reference

Use this page for commands. [`CLAUDE.md`](../CLAUDE.md) remains the canonical
source for branch, version, testing, security, emulator, merge, release, and
cleanup policy.

The coordination ledger is shared by every local repository on this host. Set
`CODEX_COORDINATION_FILE` to the same absolute path only when a project needs an
explicit location; `DOW_EMULATOR_COORDINATION_FILE` is a compatibility alias.
Confirm the path printed by `coordination:status` before acting on another
worktree's entry.

## Start and inspect

From the exact non-`main` checkout that will do the work:

```bash
pwd -P
git branch --show-current
git status --short --branch
git rev-parse HEAD main origin/main

npm run coordination:begin -- \
  --intent "Describe one bounded outcome." \
  --work-type "documentation" \
  --scope "README.md,docs/WORKTREE_COORDINATION.md" \
  --version-plan "No application version bump: documentation only." \
  --preemptive-changelog "No player-facing change: documentation only." \
  --resources "No emulator; documentation review only."

npm run coordination:status
```

Save the printed id. Confirm its absolute worktree path and attached branch,
then review every active entry for overlapping paths, prompts, claims, emulator
rows, or release resources. Use `npm run coordination:status -- --history` only
when a historical receipt is needed.

## Mandatory numbered-prompt preflight

Before selecting, assigning, starting, or editing a numbered prompt, fully read
[`IMPLEMENTATION_PROMPT_DEPENDENCIES.md`](./IMPLEMENTATION_PROMPT_DEPENDENCIES.md).
Run its deterministic dispatcher, then reconcile the exact row, live progress,
hard prompt prerequisites, hard milestone, hard contract, decision-owner gate,
closure scope, ordering context, and evidence with current `main` and active
coordination. Claim only dependency-ready, conflict-free ownership.

Re-read the dependency authority and selected row, refresh the dispatcher, and
reconcile current `main` with coordination after a rebase or material movement
of current `main`. A prompt cannot be marked complete or merged while a hard
prerequisite remains unmet.

`NEXT` (the first item in `READY_QUEUE`) is the primary resume/default lane, but
it is advisory for concurrency, not a serial execution lock. A separate
worktree may claim a later `READY_QUEUE` item as concurrent work only when its
hard prompt prerequisites are done, every hard milestone, hard contract, and
decision-owner gate is satisfied or explicitly confirmed, and the coordination
forecast shows conflict-free ownership with no active claim overlap. Never
bypass dependencies, active claims, or unresolved decision-owner gates merely
because a prompt is independent.

## Forecast, claim, and maintain ownership

Forecast the smallest intended edit before writing it:

```bash
node scripts/emulator-resource-registry.mjs forecast \
  --scope "src/components/Example.tsx"
```

If the entry began as investigation or its scope changed, acquire the exact
paths before editing. `claim` and `amend` are aliases for this ownership update;
use one, not both:

```bash
node scripts/emulator-resource-registry.mjs claim \
  --id "<coordination id>" \
  --scope "src/components/Example.tsx"
```

Prefer leaf files; use a directory or wildcard only for an intentional broad
change. A lease requiring owner confirmation remains exclusive. Do not take it
over. Keep long work healthy and release only this entry's unneeded ownership:

```bash
node scripts/emulator-resource-registry.mjs heartbeat --id "<coordination id>"
node scripts/emulator-resource-registry.mjs release-claim \
  --id "<coordination id>" \
  --scope "src/components/Example.tsx"
```

For player-facing releases and implementation-prompt state, follow the release
fragment, version, changelog, progress-ledger, and validation rules in
[`CLAUDE.md`](../CLAUDE.md#codex-wide-coordination-and-versioning-agreement).
This command page does not duplicate
that policy.

## Emulator rows

Configure a complete Firebase/Vite row atomically:

```bash
npm run emulators:configure -- auto
# In separate terminals:
npm run emulators
npm run dev:emulators
```

Use an explicit slot only when required. Never scan and select in separate
steps, share a configured row, mix ports between rows, or release another
worktree's reservation. Rules tests use the generated local configuration and
may claim another free row if the configured row is already serving a preview.
The full port matrix, process ownership, signal teardown, and concurrent-test
rules live in
[`CLAUDE.md`](../CLAUDE.md#concurrent-worktrees-and-emulator-ports).

## Validate

After committing, reconcile the branch with current `main` and run the gate
from the same checkout:

```bash
npm run coordination:validate -- \
  --id "<coordination id>" \
  --documentation-review "Rendered text, links, examples, and final diff reviewed." \
  --visual-review "Narrow, wide, and short-landscape states reviewed."
```

Pass only the review flags that apply. The gate derives its profile from the
committed diff: documentation-only changes run the Markdown/README diff and
documentation checks; code changes use the canonical code gates. A numbered
prompt cannot complete when the dependency index lists an unmet hard
prerequisite. Review flags are human attestations, not rendered-proof evidence.

## Merge, push, and finish

When the reconciled validation is green, merge into local `main`, push it, and
prove local `main`, `origin/main`, and the remote ref agree. Then close only the
entry created by this worktree:

```bash
npm run coordination:finish -- \
  --id "<coordination id>" \
  --outcome landed \
  --result "Merged and pushed after the reconciled gate passed."

npm run coordination:status
```

`landed` requires the matching validation receipt, a clean task checkout, the
task commit contained by pushed `main`, and no live reservation owned by the
entry. The command reports a live owned process instead of killing it.

A blocking agent is the identifiable Codex task that owns an active overlapping
coordination claim or required same-file work. CI visibility, an external
dependency, pending user input, and an ordinary test failure are not agent
blockers. When that blocking agent prevents merge, commit and push the exact
task branch before sending the handoff. Send a direct user-visible message to
the blocking agent with the destination task ID, remote branch, exact commit
SHA, blocker reason, and overlapping files or claims. Include any still-needed
same-file delta.

Keep the exact blocker entry active. Blocked-agent preservation must pass
`--preservation-kind blocked-agent`, `--blocked-by-entry`, `--handoff-to-task`,
`--handoff-reason`, `--handoff-overlap`, `--handoff-delta`, and
`--handoff-delivery` to `coordination:finish`. The registry first verifies the
exact pushed ref SHA, same-repository identity, and every named overlap, then
creates a structured pending handoff on that blocker entry.

`coordination:status` exposes each pending record under `MERGE OTHER BRANCHES
hard gate`. Instruct the blocking agent: after its original blocker work is
finished, fetch the branch, reconcile it with current main, merge the exact
source commit into that same task branch, apply the named delta, rerun required
validation on the exact reconciled SHA, merge to main, push origin/main, and run
`coordination:finish` for that same blocker entry. `coordination:finish` refuses
`landed`, `preserved`, and `discarded` outcomes while the blocker entry has an
assigned pending branch. It clears the gate only when the validated task branch
contains every assigned source commit and pushed origin/main contains that
branch. `--result` prose and `--handoff-delivery` text cannot waive the `MERGE
OTHER BRANCHES hard gate`.

Verify direct-message delivery and request an acknowledgement when supported
before closing the source entry as preserved; a coordination note is not proof
of delivery. If direct delivery cannot be verified, keep the source entry active
and report the undelivered handoff.

Use `preserved` only for clean committed work whose exact final SHA is verified
at one remote preservation ref:

```bash
npm run coordination:finish -- \
  --id "<coordination id>" \
  --outcome preserved \
  --preserve-ref "origin/feature/follow-up" \
  --result "Preserved for the next bounded slice."
```

Use `discarded` only after reviewing and explicitly deciding the unmerged work
is unnecessary:

```bash
npm run coordination:finish -- \
  --id "<coordination id>" \
  --outcome discarded \
  --reason "Superseded by the merged implementation."
```

Invalid evidence leaves the entry active. None of these outcomes deletes files,
branches, worktrees, or another task's processes. Stop this task's processes,
release its resources, close terminal child agents, and run the final status
check before cleanup.

# Codex-wide coordination command reference

Use this page for commands. [`CLAUDE.md`](../CLAUDE.md) remains the canonical
source for branch, version, testing, security, emulator, merge, release, and
cleanup policy.

The coordination ledger is shared by every local repository on this host. Set
`CODEX_COORDINATION_FILE` to the same absolute path only when a project needs an
explicit location; `DOW_EMULATOR_COORDINATION_FILE` is a compatibility alias.
Confirm the path printed by `coordination:status` before acting on another
worktree's entry.

Durable phase floors are role-specific: the implementation phase uses
GPT-5.6 Luna (`gpt-5.6-luna`) at `max`, independent review uses GPT-5.6 Terra
(`gpt-5.6-terra`) at `xhigh`, and reconciliation/validation/merge/push/deployment
uses GPT-5.6 Luna at `max`. A failed Luna role escalates to Terra and a failed
Terra role to Sol for that same role only; never reset or downgrade a role tier,
and detect and stop Luna/Terra loops. Explain the failures and Sol's 10-times
Luna cost in user-visible chat before any Sol dispatch.

## Parent-task message boundaries

Delegated agents must send an explicit collaboration message to the canonical
parent task path named by the dispatch for every requested checkpoint, blocker,
approval need, or material scope/status change. Ordinary task commentary is not
guaranteed coordination delivery to the parent. Boundary messages replace
periodic heartbeat or status chatter for parent communication; parked agents
remain silent until an owner-only resume. The existing coordination lease
heartbeat and parked-entry `no heartbeat required` rules still apply. Final
results still use the normal final response, in addition to any required
boundary message.

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
  --session-goal "- [ ] Describe one bounded outcome." \
  --session-goal "- [ ] As soon as required validation is green: commit, reconcile with current main, merge to main, push to origin, and close coordination." \
  --version-plan "No application version bump: documentation only." \
  --preemptive-changelog "No player-facing change: documentation only." \
  --resources "No emulator; documentation review only."

npm run coordination:status
```

Every session start writes the unchecked `--session-goal` values to a
deterministic ignored working artifact under `.codex/session-goals/`, bound to
the coordination entry. The artifact retains an immutable original goal
representation. At wrap-up, run the supported `coordination:goals` update path
with one `--goal-result "goal-001|checked|explanation"` per goal;
checked/unchecked outcomes and explanations are required, and exact goal identity,
order, and text are compared with the original. `coordination:finish` fails
closed when the artifact is absent, malformed, or un-compared. Cleanup happens
only after every other finish gate succeeds and verifies artifact absence.
Status exposes the path and lifecycle state without unrelated goal text.
The explicit `legacy-exempt` policy covers entries created before this gate
that lack an artifact—P012, P014, and P664—and records a durable comparison;
new entries remain required. The only self-bootstrap exception is exact entry
`1789089073940-29496-766886f1` while bound to Prompt 665 with its historical
explicit `sessionGoals: null`: its supported goals update writes a ledger-only
digest/count comparison that finish requires. It is single-write: exact replay
and every changed update fail without mutation, and finish validates the
recorded receipt. No other Prompt 665 entry is exempt, and required-artifact
metadata always preserves artifact validation, cleanup, and verified absence.

### Parking a blocked idle owner

The top-level coordinator must checkpoint the clean owner branch and run
`npm run coordination:park -- --id <id> --checkpoint-sha <exact SHA>` with blocker
entry/claim evidence and a concrete `--next-action`. The parked entry retains
the owner's scopes and claims fail-closed, marks the
entry `parked`, and reports `no heartbeat required`; heartbeat, amend, claim,
validate, and finish reject while parked. Interrupt the idle owner only after
the park is recorded. When the blocker and recorded overlap are clear,
owner-only `npm run coordination:resume -- --id <id>` verifies worktree, branch, and
checkpoint SHA continuity and refuses while the recorded blocker or overlap
remains; when clear it refreshes the lease. Do not run a status/heartbeat
polling loop. Repository code enforces registry state and checkpoint
continuity, but the Codex process pause/wake boundary cannot be
machine-enforced here.

Save the printed id. Confirm its absolute worktree path and attached branch,
then review every active entry for overlapping paths, prompts, claims, emulator
rows, or release resources. Use `npm run coordination:status -- --history` only
when a historical receipt is needed.

For any work type except `documentation`, include
`--implementation-prompt "NNN"` in `coordination:begin`. The ID must already
exist in all three implementation authorities, or the task's first
non-documentation commit must add its plan definition/checklist, progress row,
and dependency/evidence row together. Documentation-only means every changed
file is Markdown or a README; a mixed diff is not exempt.

Production-authority entries keep `--work-type product`, but the canonical
progress-row classification governs every entry bound to a canonical prompt
regardless of whether its work type is product, tooling, investigation, or
documentation. A canonical feature always requires the normal application version, release fragment,
player-facing changelog, and implementation-progress gates; free-text plans
and a non-product work type cannot grant the non-feature exemption.
Documentation-only entries without an implementation prompt remain exempt.
Only the exact active P012/P014 product entries may perform the one-time
audited reclassification after confirming their canonical rows say
`non-feature`:

```bash
npm run coordination:amend -- --id "<coordination id>" --change-class non-feature
```

The amendment is limited to P012 entry `1789087354152-96620-2cf1ba3e` or P014
entry `1789086651641-63909-707fa4ab`, fails closed against that row, records
the old and new class, and cannot be repeated or changed back. Free-text
version plans never grant the non-feature exemption.

## Mandatory numbered-prompt preflight

Before selecting, assigning, starting, or editing a numbered prompt, run
`npm run coordination:dependencies -- --prompt NNN` and read the compact packet
generated from [`IMPLEMENTATION_PROMPT_DEPENDENCIES.md`](./IMPLEMENTATION_PROMPT_DEPENDENCIES.md).
The deterministic dispatcher writes the worktree receipt and exposes the exact row, live progress,
hard prompt prerequisites, hard milestone, hard contract, decision-owner gate,
closure scope, ordering context, and evidence with current `main` and active
coordination. Claim only dependency-ready, conflict-free ownership.

Refresh the packet and receipt, and reconcile current `main` with coordination
after a rebase or material movement
of current `main`. A prompt cannot be marked complete or merged while a hard
prerequisite remains unmet.

Each strict receipt carries a random nonce that remains only in the ignored
worktree file. Begin and ownership amendment persist only its commitment and
the exact receipt digest in the coordination entry. After regenerating a packet
while its prompt is still ready, bind the new issuance atomically with `npm run
coordination:amend -- --id "<coordination id>"
--refresh-dependency-receipt true`. Preserve that file when the
prompt moves from partial to done: the final validation verifies the canonical
single-prompt completion delta and consumes the committed issuance once into a
nonce-free completion receipt. A done prompt cannot create or amend a new
strict receipt. Missing, recreated, replayed, mismatched, half-written, or
already-consumed issuance fails closed, and finish verifies the consumed
receipt without refreshing it. The exact P012/P014 migration issues the same
random commitment before either prompt can complete.

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

Before committing, stage the complete task and end every non-documentation
commit message with exactly one `Implementation-Prompt: NNN` trailer. The
installed `commit-msg` hook checks the staged sources, the `pre-push` hook
checks the pushed commit range, and CI repeats the range check independently.
Run `npm run validate:work-registration -- --commit HEAD` to inspect a committed
tip directly.

Documentation-only edits outside the canonical implementation plan, progress
ledger, and dependency index keep the fast exemption. Changes to any of those
three authority files still run the work-registration validator in the tracked
hooks and run both work-registration and `coordination:docs` in CI. They may
change prose or add one complete future-prompt registration, but cannot mutate
or remove an existing prompt's status, class, tag, dependency, or release
mappings without the owning non-documentation implementation commit.
For a mixed code-and-authority commit, ownership is the final
`Implementation-Prompt` trailer: the commit may update only that prompt's
canonical mappings, subject to the ordinary readiness and release gates.

A coordination release range binds every non-documentation commit to the
entry's prompt. The exact recorded Prompt 664 to Prompt 665 transition is the
sole local prompt-transition exception. A blocked-agent integration may also
contain a foreign prompt only when the registry ties it to the exact validated
commit of a completed preserved source entry. The binding covers only that SHA,
not its ancestors, and is limited to canonical non-feature work; feature work
keeps its own prompt-specific release entry. Arbitrary mixed-prompt commits
remain invalid for landed, preserved, and discarded closeout.

A promptless documentation entry validates its exact documentation-only range
without inventing a prompt binding. If a documentation entry names a canonical
prompt, it remains bound to that prompt and its canonical release class.

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
creates a structured pending handoff on that blocker entry. Keep the named
overlapping scopes and claims held by that entry through integration.

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

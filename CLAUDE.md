# CLAUDE.md

Working agreement for this repository. Applies to every agent and contributor.
`AGENTS.md` exists only to point here.

## Contents

- [Agent fast path](#agent-fast-path)
- [Implementation-plan reading route](#implementation-plan-reading-route)
- [Test first for code](#1-test-first-for-code)
- [Shared test-runner contention](#shared-test-runner-contention)
- [Worktree dependency bootstrap](#worktree-dependency-bootstrap)
- [Worktree branch bootstrap](#worktree-branch-bootstrap)
- [Codex-wide coordination and versioning agreement](#codex-wide-coordination-and-versioning-agreement)
- [Routine task delegation](#routine-task-delegation)
- [Concurrent worktrees and emulator ports](#concurrent-worktrees-and-emulator-ports)
- [Merge once done](#2-merge-once-done)
- [Worktree retention and cleanup](#worktree-retention-and-cleanup)
- [Version references](#version-references)
- [Player-facing changelog](#player-facing-changelog)
- [Game-rule references](#game-rule-references)
- [Stack](#stack-and-what-not-to-swap)
- [Security model](#security-model--the-load-bearing-rule)
- [State](#state)
- [Navigability](#navigability--no-dead-ends)
- [Session goal checklists](#session-goal-checklists)
- [Session lifecycle and audit guardrails](#session-lifecycle-and-audit-guardrails)
- [Layout](#layout)
- [Definition of done](#definition-of-done)
- [Aesthetic profiles and responsive UI](#aesthetic-profiles-and-responsive-ui)
- [Shared vessel and role console architecture](#shared-vessel-and-role-console-architecture)

## Agent fast path

Use this short sequence at the start and end of every task. It keeps the
checkout, branch, coordination entry, and final handoff tied to the same
worktree.

### Session goal checklists

Before substantive work, publish a concise `Session goals` checklist and keep
it visible while the scope is active. Every goal must start as an explicit
unchecked Markdown task checkbox (`- [ ]`); do not pre-check a goal or use a
plain bullet point. At wrap-up, publish the same checklist as `Session
wrap-up`, changing each verified completed goal to `- [x]`, leaving unfinished
goals as `- [ ]`, and explaining any unchecked item.

Every `Session goals` checklist must include this release objective:

- [ ] As soon as required validation is green: commit, reconcile with current
  main, merge to main, push to origin, and close coordination.

Keep this objective unchecked until the sequence has actually happened. If the
work is explicitly preserved or discarded instead of landed, replace it with
that documented outcome and explain why it could not merge.

### Implementation-plan reading route

For numbered implementation-plan work, do not read the 713-prompt
`docs/IMPLEMENTATION_PLAN.md` from top to bottom. Its fixed line numbers change
as prompt evidence is updated, so required reading is defined by stable
headings and targeted rows instead.

Read these items before implementation:

1. The selected milestone, dependencies, exit fixture, and review budget in
   `docs/IMPLEMENTATION_MILESTONES.md`.
2. `IMPLEMENTATION_PLAN.md` sections **Reading map and table of contents**,
   **Product objectives**, the affected **Source-of-truth and decision policy**
   row, **Prompt status legend**, **Contract carried by every numbered
   prompt**, and **Implementation-plan agent authorization**.
3. Only the exact selected prompt definition and its exact row in
   `docs/IMPLEMENTATION_PROGRESS.md`.
4. The exact printed references routed for that mechanic. Product behavior
   still requires the game-rule reading described later in this file.

Use targeted lookup rather than broad reads:

```bash
prompt_id=012
rg -n -A 2 "^- \*\*Prompt ${prompt_id} —" docs/IMPLEMENTATION_PLAN.md
rg -n "^\| ${prompt_id} \|" docs/IMPLEMENTATION_PROGRESS.md
rg -n '^## |^### |^#### ' docs/IMPLEMENTATION_PLAN.md docs/IMPLEMENTATION_MILESTONES.md
```

Read the full plan only when auditing or restructuring the roadmap, changing
prompt IDs/taxonomy, making a cross-cutting architecture decision, or executing
the final release-readiness audit. The progress ledger's lowest unresolved ID
is a default triage pointer, not a dependency lock; a worktree may claim any
dependency-ready unresolved prompt, while the coordination registry prevents a
duplicate active claim.

### Start

1. Read this file and `AGENTS.md`, then inspect the checkout you will actually
   edit:

   ```bash
   pwd
   git branch --show-current
   git status --short --branch
   git log -1 --oneline --decorate
   git worktree list --porcelain
   ```

   If the checkout already has changes, preserve them and establish whether
   they belong to this task before touching an overlapping file.
2. If `git branch --show-current` is empty, stop and create a unique,
   short-lived branch in this checkout with
   `git switch -c <type>/<short-slug>-<yyyymmdd>`. Verify the branch again
   afterward. A branch listed by Git or checked out in another worktree does
   not attach this checkout.
3. Before editing, run `npm run coordination:begin -- ...` from this same
   worktree, save the printed entry id, and immediately run
   `npm run coordination:status`. Confirm that the entry's `worktree` path
   equals the current `pwd` and that no active entry overlaps the intent,
   including entries from other repositories. If it points elsewhere, do not
   edit or finish that entry; reconcile the worktrees first. Treat this status
   pass as startup recovery: an earlier task may have skipped its end cleanup.
   Status shows active work by default; use
   `npm run coordination:status -- --history` only when historical receipts are
   needed. `coordination:begin` also normalizes a GitHub HTTPS `origin` to its
   equivalent SSH URL in the checkout's local Git config. Existing SSH origins
   and non-GitHub remotes are left unchanged; verify the result with
   `git remote -v` if transport was repaired.
4. For player-facing product work, complete the changelog preflight immediately:
   reserve one unused release version for this task, record that exact version
   in `--version-plan`, update `package.json` and the root lockfile to it, and
   add the planned note as a new, standalone top-level entry in
   `src/changelog.ts` before the test-first implementation sequence begins.
   Product work driven by the implementation plan must also pass
   `--implementation-prompt NNN` or `NNN<letter>`, set that prompt to
   `in-progress` in
   `docs/IMPLEMENTATION_PROGRESS.md`, and classify its ledger row as
   `feature` or `non-feature`. A feature cannot close until its row names the
   release version or versions and each matching changelog entry contains prompt coverage
   metadata plus a concrete player-facing change. The preemptive changelog
   field is only a draft and cannot satisfy this requirement.
   Never append the note to another task's current-version entry. Tooling,
   test, and documentation-only work records an explicit
   no-player-facing-change note and does not add an entry. The lighter
   documentation-only review path is described in [Test first for code](#1-test-first-for-code).
   Load dependencies only when the validation command needs them, then follow
   the test-first, emulator-slot, and product-reference rules below.

### Finish

1. Finish from the same worktree. At minimum, run `git diff --check`, inspect
   `git status --short --branch`, and report the verification evidence.
2. For documentation-only work, review rendered text, links, examples, and the
   final diff instead of running application tests.
3. Commit the final task changes, reconcile the task branch with current
   `main`, and commit any conflict resolution before running the executable
   coordination gate:
   `npm run coordination:validate -- --id <id>`, adding
   `--documentation-review "..."` for Markdown/README changes and
   `--visual-review "..."` for UI changes. The gate derives the required
   commands from the committed file set, records a receipt against the exact
   branch SHA, and rejects a stale or rewritten baseline or a branch that does
   not contain current local `main`. Documentation-only changes also run
   `npm run coordination:docs`, which checks Markdown/README links, fenced
   blocks, referenced npm scripts, and the canonical agent guidance. Code
   changes also run `npm run validate:implementation-progress`, so a
   plan-backed feature cannot pass on the coordination sentence alone.
4. Once the required validation is green, stop other work and immediately merge
   the task branch into `main`, push `main` to `origin`, and report the resulting
   main commit. Do not leave a green worktree dirty, idle, or waiting for another
   task.
5. Close the coordination entry with
   `npm run coordination:finish -- --id <id>` and confirm it is no longer active.
   Completion is machine-checked: `main` must contain the task commit, local
   `main` must equal `origin/main`, the worktree and package metadata must be
   clean, this worktree must own no live emulator reservation, newer versions
   and changelog entries must be preserved, and the final branch SHA, main SHA,
   remote SHA, and pushed state are recorded.

## 1. Test first for code

Order of operations for *any* code change — a new function, a component, a
callable function, a bug fix, a refactor, a one-line change:

1. Write the test.
2. **Run it and watch it fail.** A test that has never failed has proven
   nothing. If it passes before you write the code, the test is wrong.
3. Write the minimum implementation to make it pass.
4. Run the suite. Refactor with the suite green.

There is no size threshold below which this is skipped. "Too small to test" is
how the ~40 interlocking game tables acquire silent transcription errors.

Documentation-only changes are the exception. A change is documentation-only
when every changed tracked file is Markdown (`*.md`) or a README file
(`README` or `README.*`). For those changes:

- do not write or run application tests locally;
- do not run lint, builds, emulator checks, or dependency installation solely
  for validation;
- review the rendered text, links, examples, and diff instead;
- do not increment the application version; and
- GitHub Actions CI and deployment workflows must skip the push or pull request.

If any changed file falls outside that definition—including workflow YAML,
configuration, scripts, application code, rules, or lockfiles—the exemption
does not apply and the normal test-first and validation requirements remain.

Where tests go:

| Change | Test |
|---|---|
| Component or hook | `src/**/*.test.tsx`, React Testing Library, query by role/text — never by class name or test id unless there is no alternative |
| Store, helper, pure logic | `src/**/*.test.ts` |
| Anything touching `firestore.rules` | `tests/rules/firestore.rules.test.ts`, and it must assert the **denial** as well as the permission |
| Callable Cloud Function | Assert the rule that makes it necessary — the client-side denial — in the rules suite, plus the function's own guard clauses |

Commands:

```bash
npm test            # unit + component
npm run test:rules  # security rules, wrapped in the Firestore emulator
npm run test:all    # both — this is what CI runs
```

### Shared test-runner contention

All agents share one MacBook Pro M3. The coordination model supports up to 15
active worktrees, but plan for roughly seven concurrent Node test runs, with 10
being a realistic peak. Expect CPU, memory, disk, and emulator contention to
make a normally quick test run substantially slower and to reduce or delay the
output returned by the command wrapper.

- Set the **outer command or tool timeout**, not individual test assertion
  timeouts, to at least 15 minutes for `npm test` and `npm run test:rules`, and
  30 minutes for `npm run test:all`. Use a longer timeout when a prior run or
  current contention indicates it is needed; with 10 or more concurrent test
  runs, use 30 minutes for an individual suite and 60 minutes for
  `npm run test:all`.
- Keep long-running commands attached or poll their existing session instead
  of cancelling them just because output is quiet. A slow or quiet process is
  not evidence that the tests are hung.
- Treat a wrapper or tool timeout before the process exits as **inconclusive**,
  not as a test failure. Inspect the captured output and whether the process is
  still running; if it was stopped before reporting results, rerun with a
  larger outer timeout when resources allow.
- Only call the run passed or failed when the test runner reports its results
  or exits with a corresponding status. Report wrapper timeouts separately
  from assertion failures, crashes, and emulator errors.

## Worktree dependency bootstrap

Every worktree has its own ignored dependency directories. At the start of work
in a fresh worktree, before running tests, builds, or other repository scripts:

- Run `npm ci` when the root `node_modules` directory is missing.
- Run `npm ci --prefix functions` when `functions/node_modules` is missing.
- Run the corresponding command again whenever `package-lock.json` or
  `functions/package-lock.json` has changed since dependencies were installed.
- Use `npm ci`, not `npm install`, so installation follows the committed lockfiles
  without rewriting them. Do not commit `node_modules`.

## Worktree branch bootstrap

The [Agent fast path](#agent-fast-path) is mandatory. In particular, never edit
or commit while detached: if `git branch --show-current` is empty, create a
unique short-lived branch in this checkout and verify it before coordination.
The branch must be attached to this checkout, not merely listed elsewhere in
Git. Reconcile it with newer `main` work before merging rather than silently
shipping from an old base.

## Codex-wide coordination and versioning agreement

After branch bootstrap and **before editing any file**, register the task in the
shared local coordination pane:

```bash
npm run coordination:begin -- \
  --intent "What this work changes or investigates." \
  --work-type "tooling" \
  --scope "scripts,src/config,docs" \
  --claims "coordination-registry,emulator-slot" \
  --version-plan "The planned application version, or why this is tooling-only." \
  --preemptive-changelog "The player-facing note, or an explicit no-player-facing-change note." \
  --resources "The emulator slot, service, or other shared resource."
```

This writes a human-readable, Git-ignored coordination file shared by every
local repository on this host, not only this repository's worktrees. Status
shows active intent, version/changelog agreements, configured emulator rows,
and live process reservations from all participating projects. The entry
records its absolute worktree path: always compare it with `pwd`, keep the
printed id, and finish only your own entry.

The default file is in the OS temporary directory and is intentionally
independent of the current repository or directory. Projects that need an
explicit shared location must set the canonical `CODEX_COORDINATION_FILE` to
the same absolute path. The older `DOW_EMULATOR_COORDINATION_FILE` variable is
still accepted for compatibility, but do not create a different per-repository
file. The status pane's `Coordination file:` line is the source of truth for
the path in use.
`coordination:begin` also records the attached branch, its starting SHA, and the
starting `main` SHA; it refuses detached checkouts, direct work on `main`, and a
duplicate active entry for the same worktree.

`--work-type`, `--scope`, and `--claims` are structured ownership metadata.
Use a stable work type such as `product`, `tooling`, `documentation`, or
`investigation`; use comma-separated repository-relative files/directories (or
`*`) naming the repository area; and
list comma-separated exclusive claims for shared resources or overlapping areas.
Claims are normalized before comparison, and a new active entry is rejected if
it claims an already-active exclusive claim, naming the owning entry, worktree,
and claim. Read-only investigation may omit claims only when it declares that
it reserves no shared resource or file area. These fields remain in historical
entries so cleanup can identify ownership without guessing from free-form intent.
`--resources` remains the human-readable emulator/service detail and does not
replace structured claims.
Product work must also provide `--implementation-prompt NNN` or
`NNN<letter>`; this binds the coordination entry to the progress ledger and
prevents a feature task from closing without its prompt being marked. The
registry rejects duplicate active claims for the same normalized prompt ID but
allows separate agents to claim distinct base or lettered IDs concurrently. The
executable progress gate checks
that the ledger row, source-plan checkbox, release version, and real
`src/changelog.ts` coverage agree.

Run `npm run coordination:status` before overlapping work and after finishing
to confirm the entry and any resource reservations are clear.

The version agreement is: completed player-facing product work increments the
monotonic application version, keeps `package.json` and the root lockfile in
sync, and adds the newest user-facing `src/changelog.ts` entry. Development
tooling, tests, and documentation-only work explicitly record that no
application version or player-facing changelog entry is expected. The
preemptive changelog is the task's release-note draft and must be written at
startup. For product work, claim an unused release version in this coordination
pane, state that exact version in `--version-plan`, update the package metadata,
and copy the draft into one new top-level `src/changelog.ts` entry before
writing implementation tests or code. Each entry belongs to exactly one agent
task and one release version; if the version is already claimed or `main` has
advanced, reconcile the claim before editing.
The final release note may refine that same entry, but it must never append to
another task's entry or roll several tasks into a single version.
Every version increment must also record implementation-plan progress metadata
at that release boundary: completed prompts and canonical total, a two-decimal
percentage, and raw done, partial, active, missing counts. Partial and active
prompts never count as complete, and the canonical denominator may not change
silently. The executable progress validator checks this metadata against the
ledger and rejects a release entry that drifts from the checked-in counts.
The one controlled exception is a tooling-only implementation-plan gate task
that expands the current release's aggregate plan summary into prompt-level
coverage; it may not rewrite older release entries or claim new behavior.
For implementation-plan work, the final release note is not the one-sentence
coordination draft: every ledger row marked `feature` names its release or
releases, and each matching changelog entry lists the prompt in
`implementationPrompts` with at least one concrete player-facing change for
that prompt. The move-on gate
rejects an open `in-progress` row and the coordination gate reruns this
coverage check before validation is recorded.

The executable release gate covers the deterministic part of this agreement:
it compares branch and `main` package/lock versions, checks the newest changelog
entry, refuses a branch that would lower the application version or replace
newer notes, and verifies the final local/remote commit relationship. The
validation receipt also makes human-only evidence explicit: documentation
review is required for Markdown/README changes and visual review is required
for UI changes. The receipt records those attestations but cannot prove that a
human actually performed them; the final review remains a deliberate handoff.

## Routine task delegation

The product owner authorizes suitable delegation when it saves effort after
setup and review. Fan out independent, bounded reconnaissance, implementation,
or verification tracks to GPT-5.6 Luna at `high` reasoning; do not use GPT-5.3
Codex Spark. If no safe sidecar exists, continue locally rather than creating
one to satisfy a quota.

Start cleanup is authoritative because end cleanup may be skipped. Before
substantive work or new delegation, inspect the child IDs owned by the current
parent and any terminal children surfaced from inactive chats, retrieve any
result still needed, and close every completed, errored, or interrupted child.
Then inspect `npm run coordination:status` and the worktree/process state for
leftover reservations or configured rows from prior work. The status command
prunes dead process reservations; a configured row whose worktree is missing is
stale, while a row whose worktree still exists requires task/process
reconciliation before release. Never stop a live process, close a running child,
or release another active worktree's row based only on age or a missing live
reservation. Leave pending or running children from any chat alone; close them
only after they reach a terminal state unless they are still needed for the
current task.

Child-agent cleanup is enforced through the Codex collaboration runtime, not a
repository command: repository scripts cannot enumerate or close Codex tasks.
Do not substitute a coordination flag or text attestation for actually closing
terminal children with the runtime controls available to the parent task.

Keep delegation economical:

- Delegate only a bounded sidecar with a concrete output and acceptance
  criteria. If no independent sidecar exists, continue locally; do not create
  an agent merely to satisfy a quota.
- Start independent sidecars in parallel, do non-overlapping work while they
  run, and do not repeat their assigned investigation in the parent.
- Wait only when the result is needed for the next critical-path decision;
  otherwise collect it once it reaches a terminal state.
- Ask every child to return changed paths (if any), commands run, and observed
  results. Review that evidence before integration, then close the child
  immediately.

- Do not use GPT-5.3 Codex Spark (`gpt-5.3-codex-spark`) for this repository. It
  is not an approved delegation model for this codebase.
- Delegated subagents have full read/write access to their assigned worktree.
  They may inspect, create, edit, rename, and delete files as needed, run
  commands and tests, and perform well-scoped implementation work. No
  read-only restriction applies to delegated subagents.
- Use GPT-5.6 Luna (`gpt-5.6-luna`) at `high` reasoning for suitable delegated
  work when delegation saves total effort and tokens after setup, context
  transfer, and review. Luna may edit code, tests, Markdown docs, refactors,
  UI, and routine implementation with clear expected results.
- Keep assignments narrow, low risk, and easy to verify, with explicit file
  scope and acceptance criteria. Every delegated agent that changes files must
  use its own worktree and short-lived branch; never have a delegated agent
  edit the primary agent's checkout or another agent's files. Full read/write
  access is scoped to that assigned worktree and does not authorize merging or
  pushing.
- Treat child-agent lifecycle as part of delegation: after collecting a
  completed result, close the child with `close_agent`. Completed descendants
  remain open and count toward the concurrency limit until closed, so do not
  leave finished children occupying capacity.
- End cleanup remains required even though startup cleanup is the recovery
  boundary: stop processes this task started, release its emulator reservation,
  finish its coordination entry, close completed children, and run one final
  status check. End cleanup is scoped to this task's own children, processes,
  reservations, and entry; it must not sweep unrelated live work.
- Immediately after closing an agent, reassess whether the next step exposes
  another useful, independent, bounded sidecar. If it would materially advance
  the work, delegate it under the same Luna-only rules; otherwise continue
  locally without forcing an artificial split.
- No code change has zero risk. Keep security, authentication, authorization,
  authoritative state mutations, complex gameplay, architectural decisions, and
  other high-risk security or product decisions with the primary agent. The
  primary agent also owns all review, integration, versioning, merge, and push.
- Every delegated agent must read this file and follow the applicable test-first,
  dependency, emulator isolation, and version policies. Small task size does not
  exempt code changes from those requirements.
- The primary agent reviews the diff and verification evidence and coordinates
  integration, versioning, merge, and push. Delegated agents must return their
  work for that review before anything is merged or pushed to `main`.

## Concurrent worktrees and emulator ports

Assume several local worktrees and repositories are active at the same time.
Never start
`firebase emulators:start`, `firebase emulators:exec`, `npm run emulators`,
`npm run test:rules`, or `npm run test:all` in a worktree until that worktree has
its own complete emulator port set. This includes Firestore's separate WebSocket
listener. The defaults in `firebase.json` belong to only one worktree at a time;
do not let Firebase silently reuse or kill another agent's emulator processes.

There is no single shared emulator instance. The Codex-wide coordination
registry is the shared resource ledger; each Den of Wolves worktree gets an
isolated row of ports, and this repository provides 15 rows. One occupied or
configured row blocks only that row. A different repository's entry is visible
in the same pane, but only a declared or verified shared resource blocks this
repository's work. Never report that a “shared emulator remains reserved” or
skip emulator validation for that reason unless every row is occupied and the
status pane confirms that no free slot exists. If a task does not need an
emulator, say so because its validation scope is unit/component-only, not
because another task owns a different row.

When emulator-backed validation is needed, claim a row atomically with
`npm run emulators:configure -- auto` (or an explicitly selected free slot)
before starting the process, and announce the selected row in the task. Do not
scan status and choose a row in a separate step. Use one row as a unit—do not
mix ports from different rows. The logging range begins at 4600, rather than the historical
4500, so it cannot overlap Hub ports once all 15 slots are in use:

| Slot | Auth | Functions | Firestore | Firestore WS | Hosting | UI | Hub | Logging | Vite |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 9099 | 5001 | 8080 | 9300 | 5000 | 4000 | 4400 | 4600 | 5173 |
| 1 | 9109 | 5011 | 8090 | 9310 | 5010 | 4010 | 4410 | 4610 | 5174 |
| 2 | 9119 | 5021 | 8100 | 9320 | 5020 | 4020 | 4420 | 4620 | 5175 |
| 3 | 9129 | 5031 | 8110 | 9330 | 5030 | 4030 | 4430 | 4630 | 5176 |
| 4 | 9139 | 5041 | 8120 | 9340 | 5040 | 4040 | 4440 | 4640 | 5177 |
| 5 | 9149 | 5051 | 8130 | 9350 | 5050 | 4050 | 4450 | 4650 | 5178 |
| 6 | 9159 | 5061 | 8140 | 9360 | 5060 | 4060 | 4460 | 4660 | 5179 |
| 7 | 9169 | 5071 | 8150 | 9370 | 5070 | 4070 | 4470 | 4670 | 5180 |
| 8 | 9179 | 5081 | 8160 | 9380 | 5080 | 4080 | 4480 | 4680 | 5181 |
| 9 | 9189 | 5091 | 8170 | 9390 | 5090 | 4090 | 4490 | 4690 | 5182 |
| 10 | 9199 | 5101 | 8180 | 9400 | 5100 | 4100 | 4500 | 4700 | 5183 |
| 11 | 9209 | 5111 | 8190 | 9410 | 5110 | 4110 | 4510 | 4710 | 5184 |
| 12 | 9219 | 5121 | 8200 | 9420 | 5120 | 4120 | 4520 | 4720 | 5185 |
| 13 | 9229 | 5131 | 8210 | 9430 | 5130 | 4130 | 4530 | 4730 | 5186 |
| 14 | 9239 | 5141 | 8220 | 9440 | 5140 | 4140 | 4540 | 4740 | 5187 |

Before claiming a row, verify every port in it is free with
`lsof -nP -iTCP:<port> -sTCP:LISTEN`. Put the chosen values for auth,
Functions, Firestore, Firestore WebSocket, Hosting, Emulator UI, Hub, and Logging in a
worktree-local Firebase config, and pass it explicitly with `--config` to both
`firebase emulators:start` and `firebase emulators:exec`. Do not commit a
developer's port-only config.

Use `npm run emulators:configure -- auto` to atomically select and claim the
first complete free row. It checks all eight Firebase ports plus the matching
Vite port while holding the shared coordination lock, then writes ignored
`firebase.local.json` and `.env.emulators.local` files. An explicit
`npm run emulators:configure -- <slot 0-14>` remains available when a specific
row is required. Do not scan status and choose a row in a separate step: no
live reservation does not mean a configured row is free, and concurrent agents
must claim through the atomic command. Then use `npm run
emulators`, `npm run dev:emulators`, `npm run test:rules`, or `npm --prefix
functions run serve`;
these commands explicitly load the worktree-local config, and the Vite command
uses the matching client ports. CI has no local config and intentionally uses
the committed slot-0 defaults. The configure command records the row in the
shared coordination file; the long-running emulator commands claim and release
live process reservations there. `npm run test:rules` prefers the configured
row, but automatically claims another complete free row when a preview already
owns it, then removes its temporary config on exit. Configured worktree rows
are unavailable to other worktrees while their entry is active or a process
lease is live, even when the live-reservations section is empty. At startup,
inspect the status pane for terminal children, dead process reservations, and
configured rows whose worktree is missing; status cleanup releases rows tied
only to completed or missing worktrees when no live reservation still owns the
row. Reconcile only resources confirmed not to be used by a live task. If all
rows are occupied, wait for a free slot; never take a port that is already
listening.

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
but it must not infer that a still-live child is safe to stop. Diagnose a stuck
process with the reservation's owner PID, child PID, command, and worktree
together.

## 2. Merge once done

- Branch from `main`. Short-lived, one concern per branch.
- A branch lands on `main` **as soon as it is green and complete**. Not at the
  end of the week, not once three other things are also finished.
- A green validation receipt is the handoff trigger, not merely a progress
  update. The final objective is commit → reconcile with current `main` →
  validate the reconciled branch → merge to `main` → push to `origin` → close
  coordination. Do not start unrelated work, wait for another branch, or go
  idle while a green branch remains dirty or unmerged.
- The required local checks are machine-recorded by
  `npm run coordination:validate -- --id <id>`. It runs `git diff --check`,
  lint, the complete test suite, and both production builds for code changes;
  documentation-only changes use `git diff --check` plus
  `npm run coordination:docs`. A receipt is valid only for the exact final
  branch SHA, and validation refuses an unreconciled branch that does not yet
  contain current local `main`.
- For changes that are not documentation-only, local tests always run before
  deployment: `npm run lint`, `npm run test:all`,
  `npm run build`, and `npm run build --prefix functions`. Passing relevant
  local checks is the normal merge gate. A known failure does not automatically
  block deployment only when it is demonstrably unrelated or flaky and the
  deployment remains safe; changed-code, rules, authentication, authorization,
  data-integrity, or security failures always block.
- The agent token does not include GitHub Actions read access. Do not poll,
  wait for, or block a merge on CI visibility; local validation is the
  actionable merge gate.
- The main-branch deployment workflow does not repeat `npm test`; it relies on
  the required local pre-push gate and the branch or pull-request CI run. It
  continues to run lint, Firestore rule tests, and both production builds.
- Do not stack unfinished work. Do not leave a task open "for later." If a
  change is not going to land, make an explicit preserve-or-discard decision.
  Preserved work must have its commits or artifacts recorded and, if it must
  survive worktree cleanup, pushed or archived outside the worktree. Discarded
  work does not require a push.
- Never force-push `main`. Never commit directly to `main` for anything that
  changes behavior.
- Push to `main` deploys the affected Firebase surfaces. Every completed product
  edit increments the visible application version, so Hosting is deployed for
  product changes; Firestore rules and Cloud Functions deploy only when their
  own files or shared Firebase configuration changed. Treat every merge as a
  release without redeploying unrelated infrastructure.

Commit messages: imperative subject under 72 characters, and a body that says
*why* when the why is not obvious. Reference the behavior, not the file list.

Before merging concurrent product branches, inspect the changelog diff against
current `main`. It must add one new top-level entry for the task's reserved
version, with only that task's notes. If the diff instead adds bullets to an
existing version entry, stop, allocate a separate version, and preserve every
task as its own entry before merging.

### Truthful closeout outcomes

`coordination:finish` closes only the entry named by the exact `--id` from
`coordination:begin`. The normal outcome is `landed` (the existing command may
omit `--outcome` for this path): it requires a passing receipt for the final
branch SHA, current local `main` contained by the branch, local `main` equal to
`origin/main`, a clean checkout, and no live reservation owned by this
worktree. It records the final branch/main/remote SHAs and `pushed: true`.

If work cannot land but must remain usable, close it as preserved and provide
exactly one machine-verifiable destination:

```bash
npm run coordination:finish -- --id "<id>" \
  --outcome preserved \
  --preserve-ref "origin/feature/coordination-follow-up" \
  --result "Preserved for the next coordination slice."
```

The remote ref must resolve with `git ls-remote` to the final branch SHA.
Generic text such as a commit hash or an unverified path is not preservation
evidence. The current executable gate does not verify a generic archive path;
do not mark one as preserved through this command unless a future gate adds an
explicit archive verifier. Preserved work must have committed changes after its
start SHA and a clean worktree. It does not require merge, a release validation
receipt, or a push to `main`; record `outcome: preserved`, destination
kind/value, verified commit SHA, and verification time. `pushed` is false (or
absent) for the `main` release even if the preservation ref itself was pushed.

If work is reviewed and no longer needed, close it as discarded:

```bash
npm run coordination:finish -- --id "<id>" \
  --outcome discarded \
  --reason "Superseded by the merged implementation."
```

Discard requires a non-empty reason and a clean worktree, but not a task commit,
validation receipt, merge, or push. It never deletes files, branches, or
worktrees. Record `outcome: discarded`, the reason, observed branch SHA, and
task changed-file summary with `pushed: false`; never record merge or remote
push success. Reject a missing destination/reason or conflicting outcome flags
before changing the entry. Any invalid outcome or evidence leaves the entry
active. Terminal entries retain work type, scope, claims, outcome, evidence, and
timestamps for history and later cleanup.

## Worktree retention and cleanup

Keep a completed task's worktree and its attached short-lived branch for at
least 48 hours after the task's completion time. Completion means one of these
outcomes, plus coordination finish and resource release:

- Landed work is merged to `main` and pushed.
- Preserved unmerged work is committed and pushed or archived outside the
  worktree, with that destination recorded.
- Discarded work has been reviewed and explicitly confirmed unnecessary; it
  does not require a push.

This retention window must not delay merging or pushing a green, complete
branch.

During the retention window, do not reuse the checkout for unrelated work or
remove its branch. If work resumes, treat the task as active again and start a
new 48-hour window when it finishes.

After the window, remove the worktree only after confirming that the Codex task
is terminal, no child agent or process uses it, the coordination pane has no
active entry or emulator reservation for it, and the checkout is clean with no
untracked files. For landed work, its commits must be merged and pushed. For
preserved work, the recorded archive or destination must be usable without the
worktree. For discarded work, the discard decision must be explicit. Then
remove the checkout from another worktree:

```bash
git worktree remove /absolute/path/to/worktree
```

Delete the attached local branch only when its outcome permits deletion: use
`git branch -d <merged-branch>` for landed work, delete a discarded branch only
after its discard decision, and retain a preserved branch when it is the
recorded preservation destination.

Never use force removal merely to shorten the worktree list. A detached or clean
worktree is not automatically stale; reconcile Codex task state, coordination
state, and Git state first. `git worktree prune` only addresses missing
administrative records and does not replace this 48-hour review.

## Version references

- Increment the application version with every completed product edit so
  deployed progress has a stable reference. Documentation-only changes, as
  defined above, do not increment it.
- The application version must never decrease. A later build must always compare newer than every earlier build.
- Major system additions may increment the middle number, but only when they represent a meaningful milestone in overall release readiness. Do not mechanically advance toward release for every subsystem.
- Smaller additions, fixes, and refinements increment the final number (for example, `0.1.12` to `0.1.13`). The final number may exceed 9. If a version reaches `0.x.99`, the next version rolls over automatically to `0.(x+1).0`.
- Agents may advance through `0.8.x` only with extremely conservative judgment tied to genuine whole-game maturity.
- Only the product owner may authorize `0.9.x`; it is reserved for builds genuinely close to release readiness.
- Only the product owner may authorize `1.0.0`. It requires the complete 20-player set with full, complex gameplay: players must move through multiple interacting systems, the game works end to end, they complete a coherent gameplay loop, and reach a clear, implemented game end. Twenty selectable roles, placeholder screens, isolated mechanics, or shallow role stubs do not qualify.
- Keep `package.json` and the root entry in `package-lock.json` synchronized.
  `package.json` is the single source of truth for the application version;
  runtime code, including `src/version.ts`, must derive the build reference from
  that metadata. Never hardcode the current application version in source,
  tests, workflows, or documentation. Tests should compare derived values with
  package metadata, not pin a specific release number.
- Show the version in the in-app settings dialog.
- After every successful merge and every successful push, state the exact version in the user-facing chat.

## Player-facing changelog

Update `src/changelog.ts` with every completed product edit. Put the newest
version first and describe only changes a player or GM can see, use, or
understand. Write from the user perspective, not the developer perspective:
describe the improved experience or new capability, never internal components,
refactors, implementation details, test changes, or deployment machinery.

The changelog is release-scoped, not a running work log. Every product task
owns exactly one `ChangelogEntry` for its one release version. A `changes` array
may contain several notes only when they are inseparable parts of that same
task; never add another agent's note to the existing `version: APP_VERSION`
object, and never create a catch-all or megachangelog entry. When concurrent
work reaches `main`, keep every task's entry as its own versioned object and
preserve both notes during conflict resolution.

The newest changelog entry must use the version derived from `package.json` so
the visible build reference and release notes stay aligned. Preserve the
bounded, independently scrollable changelog region in Settings as the history
grows. Documentation-only edits do not add a changelog entry.

## Game-rule references

Before designing, testing, or implementing player-facing Den of Wolves: New
Eden content, read
[`docs/reference/den-of-wolves-new-eden/REFERENCE_ONLY_OVERVIEW.md`](docs/reference/den-of-wolves-new-eden/REFERENCE_ONLY_OVERVIEW.md)
and every source it routes to for the affected mechanic. This is required for
ships, shuttlecraft, fighter wings, roles, maintenance, combat, exploration,
resources, player counts, and facilitator-facing rules; do not rely on memory
or infer a missing rule from adjacent UI.

The printed component sheet is authoritative for a specific ship, shuttle,
fighter wing, console, card, value, or owner. When it conflicts with a generic
guide, implement the printed sheet and record a genuine ambiguity or erratum
instead of silently choosing a convenient interpretation. Do not expose a
control for a rule the reference does not define and the server cannot
authoritatively resolve.

## Stack, and what not to swap

Vite 6 · TypeScript strict · React 18 · Zustand · Firestore Web SDK v12 modular
· Cloud Functions 2nd gen (Node 22) · React Router `HashRouter` · Vitest + RTL +
`@firebase/rules-unit-testing` · GitHub Actions → Firebase.

`HashRouter` is deliberate — deep links must survive on a static host with no
rewrite rules. Do not "upgrade" it to `BrowserRouter`.

TypeScript runs with `strict`, `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. Do not relax a compiler option to make an error go
away, and do not reach for `any` or `@ts-expect-error` — fix the type.

## Security model — the load-bearing rule

**A client may read what it is entitled to see, and write only its own presence
document.** Every mutation a player could benefit from lying about — claiming a
seat, becoming GM, generating a secret, producing a random result — is:

- denied in `firestore.rules`,
- implemented as a callable Cloud Function in `functions/src/`, inside a
  transaction, running with admin privileges,
- and covered by a rules test asserting the client-side denial.

If you find yourself adding a client write path to `seats`, `secrets` or
`events`, or letting a client set `role`, stop — that belongs in a function.

The Firebase web config in `src/lib/firebaseConfig.ts` is a set of **public
identifiers**, not credentials. A service-account key must never be committed,
never appear under `src/`, and never be pasted into a config file. CI uses
short-lived Workload Identity Federation credentials; there is no JSON key.

## State

- **Zustand** holds local, per-browser view state only.
- **Firestore** holds authoritative shared state.
- A component should never have to work out which is which. Snapshots land in
  the store; mutations go out through callables.

## Navigability — no dead ends

Navigation is a feature, not cleanup. Every non-landing screen and device mode
must expose an obvious, visible route back to its logical parent (normally the
Roles screen). Never rely on the browser Back button, the settings dialog, a
route guard, or disconnecting as the only way out of a screen.

- Add the return path in the same change that introduces a screen or mode.
- Keep it keyboard-accessible, at least 44px on touch devices, and available at
  every supported viewport size and orientation.
- Preserve state when returning unless the user explicitly chose to release,
  disconnect, or reset it.
- Add a route-level test that activates the visible navigation control and
  verifies its destination. A render-only test is not enough.
- Before finishing UI work, traverse forward and back through every affected
  route and check for navigation traps.

## Session lifecycle and audit guardrails

- `useSessionStore` persists the last server snapshot (`session`, `me`), the
  local GM-instance identity, the short-lived command outbox, the local device
  mode, and the last allow-listed in-session route. Never persist connection
  status or treat the local snapshot as fresh authority. Outbox commands expire
  after 15 seconds and reconcile against server authority before being removed.
- On startup, render the persisted snapshot immediately, then call
  `resumeSession`. Transient network failures keep the snapshot and mark the
  connection offline; `not-found`, `permission-denied`, and
  `failed-precondition` mean the snapshot is stale and must be cleared.
- While connected, refresh the server presence lease every 10 seconds. The
  server expires a device after 45 seconds without a heartbeat and reconciles
  its membership lock, GM instances, and renewable session-retention deadline.
  Expiry ends only that device's authority: it releases a seat only when the
  seat still names the stale UID, while retaining the player record and its
  seat intent. resumeSession may atomically reclaim that seat if it remains
  open; if another player took it, clear only the returning player’s seat
  pointer and keep them in the session.
  Shared session, player, seat, and GM-instance views use live snapshots so a
  reconnect replaces cached state with server authority.
- GM and Console are **device modes**, not freely selectable Firestore roles.
  Only a player whose server record already has role `gm` may enter GM mode.
  Console is available to any session member. Every fleet ship also offers a
  GM-only Observer view. Observer starts read-only on each ship and may be put
  into write mode with its DRADIS-adjacent control; leaving that ship resets it
  to read-only.
- Disconnect is locally idempotent and server-aware: queue or send the presence
  update, clear the persisted session, player, seats, GM instance, mode, and
  route, then replace navigation with `/`. Preserve a queued disconnect long
  enough to replay it. An empty session gets a renewable seven-day retention
  deadline; reconnecting cancels it.
- The visible Settings disconnect action uses the documented danger-red
  two-step “ARE YOU SURE?” confirmation before this browser leaves a session.
- Session headers are readable only by members and may never be listed. Joining
  and resuming happen through callable functions. Preserve both denial tests.
- A player may hold at most one seat. Keep the claim and release pointer checks
  inside the transaction and keep their policy tests.
- Keep Firestore wiring in `src/lib/firestore.ts`; importing it from the landing
  path adds hundreds of kilobytes. `npm run test:bundle` enforces the per-chunk
  ceiling, and both production dependency trees must continue to audit clean.
- Never add a visible button without a verified action, or an in-session route
  that can render without `session` and `me` guards.

## Layout

```
src/lib/          Firebase singletons (lazy — nothing runs at import time)
src/store/        Zustand
src/routes/       route components, colocated tests
src/types/        game data shapes
functions/src/    callable Cloud Functions
firestore.rules   the read model and the denials
tests/rules/      assertions against the emulator
```

## Definition of done

- [ ] The current checkout is on the intended short-lived branch; the branch
  and coordination entry refer to the same worktree.
- [ ] Product work began with its own preemptive, standalone changelog entry;
  no unrelated task was appended to that release version.
- [ ] For code changes, a test was written first and observed failing.
- [ ] Every completed product edit updated the player-facing changelog in user terms.
- [ ] For changes that are not documentation-only, local lint and tests were
  run before deployment; any known failure was reviewed against the
  deployment-safety rule above.
- [ ] For changes that are not documentation-only, `npm run build` and
  `npm run build --prefix functions` succeed.
- [ ] For documentation-only changes, rendered text, links, examples, and the
  final diff were reviewed without running the application test suite.
- [ ] For UI changes, rendered aesthetics were reviewed at narrow, wide, and short
  landscape sizes, relevant states were checked, and new aesthetic decisions
  were recorded in `docs/AESTHETICS.md`.
- [ ] `coordination:validate` recorded a passing receipt for the final branch
  SHA, including required documentation or visual-review attestations.
- [ ] `coordination:finish` recorded the final branch SHA, `main` SHA,
  `origin/main` SHA, and pushed state after the merge.
- [ ] No new client write path to server-authoritative data.
- [ ] No secret, key or service-account JSON added to the repo.
- [ ] Every affected screen has a visible, tested route back to its logical parent.
- [ ] The task's coordination entry was closed with a concise result, and every
  completed delegated child was closed.
- [ ] Immediate post-test merge objective is checked off: after required
  validation became green, the branch was committed, reconciled with current
  `main`, merged to `main`, pushed to `origin`, and the coordination entry was
  closed; any preserved or discarded exception is explicitly documented.
- [ ] For landed work, the branch is merged to `main` and **pushed to origin**
  (pushing deploys the affected Firebase surfaces, including Hosting for
  visible product edits); for preserved or discarded work, the decision and
  preservation destination or discard evidence are recorded.
- [ ] Record completion time and retain the completed worktree and attached
  branch for 48 hours before cleanup; landed commits are pushed immediately,
  while discarded work does not require a push.

## Aesthetic profiles and responsive UI

Before changing UI, read [docs/AESTHETICS.md](docs/AESTHETICS.md). It stores the
reusable CIC and interrupted-transmission profiles. Use the shared tokens in
src/styles/cic.css and existing patterns to keep the entire website consistent.

For every UI change, inspect the rendered result—not just source code or passing
tests—at narrow phone, wide desktop, and short landscape sizes. Check text size
and contrast, semantic color consistency, spacing, wrapping, overflow, controls,
and forward/back navigation. Exercise relevant states such as operational and
damaged, and honor reduced motion. Fix findings before calling the work complete;
report any visual verification that could not be performed.

Write new or revised aesthetic decisions and reusable patterns into
`docs/AESTHETICS.md` in the same change. Reading it is only the starting point:
keep it current with the product. For a pure restoration of an existing documented
rule, reference that rule rather than duplicating it. Add regression coverage for
checkable visual failures, including computed styles when selector ordering or
specificity caused the bug; text-presence tests alone do not protect appearance.

Every screen must work across mobile, laptop, and desktop, in landscape and
portrait, including screen rotation while open. Use responsive layout, safe-area
padding, accessible controls, and scrolling on short screens. Verify narrow,
wide, and short landscape viewports. Honor reduced motion and preserve access
to underlying controls during decorative effects.

## Shared vessel and role console architecture

All future ship role consoles and shuttle consoles must extend the shared
architecture in [docs/CONSOLE_ARCHITECTURE.md](docs/CONSOLE_ARCHITECTURE.md).
The linked document is the canonical ownership map and extension guide; this
section preserves only its non-negotiable boundaries:

- Define each vessel once in `src/data/vessels/` with `defineShip` or
  `defineShuttle`, register it once, and derive consumer catalogs from it.
- Use the shared ship/shuttle shells and role templates. Put real exceptions in
  typed configuration or modules; never copy routes or scatter vessel-ID
  branches through shared components. Shuttle branding, docking, and equipment
  are opt-in configuration—never inherited from SNN by default.
- Test the shared base with the reference vessel and a materially different
  configuration. Preserve route guards, role ownership, return navigation, and
  server authority.
- Damage outcomes name the drawn card and affected system, or explicitly say
  when armour recycled it, a check caused no damage, or the deck was empty.
  Undrawn deck order remains server-only; clients may only read completed draw
  records.

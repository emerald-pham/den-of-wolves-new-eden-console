# CLAUDE.md

Working agreement for this repository. Applies to every agent and contributor.
`AGENTS.md` exists only to point here.

## Contents

- [Agent fast path](#agent-fast-path)
- [Test first for code](#1-test-first-for-code)
- [Shared test-runner contention](#shared-test-runner-contention)
- [Worktree dependency bootstrap](#worktree-dependency-bootstrap)
- [Worktree branch bootstrap](#worktree-branch-bootstrap)
- [Local worktree coordination and versioning agreement](#local-worktree-coordination-and-versioning-agreement)
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

## Agent fast path

Use this short sequence at the start and end of every task. It keeps the
checkout, branch, coordination entry, and final handoff tied to the same
worktree.

### Session goal checklists

At the top of every session, before substantive work, publish a concise
`Session goals` checklist containing the concrete outcomes you intend to
deliver. Keep it visible in the session updates and revise it if the agreed
scope changes. At wrap-up, publish the same checklist again as `Session
wrap-up`, marking each item `[x]` when complete or `[ ]` when incomplete. Add a
brief note for any unchecked item explaining the blocker or remaining work.

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
   equals the current `pwd` and that no active entry overlaps the intent. If it
   points elsewhere, do not edit or finish that entry; reconcile the worktrees
   first.
4. Load dependencies only when the validation command needs them. Follow the
   test-first, emulator-slot, and product-reference rules below; documentation-
   only work uses the lighter review path described in [Test first for code](#1-test-first-for-code).
5. Finish from the same worktree. At minimum, run `git diff --check`, inspect
   `git status --short --branch`, report the verification evidence, and close
   the coordination entry with
   `npm run coordination:finish -- --id <id>`. For documentation-only work,
   review rendered text, links, examples, and the final diff instead of
   running application tests.

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

Agents must run `git branch --show-current` before changing files. If it prints
nothing, the worktree has a detached `HEAD`; immediately create a uniquely
named, short-lived task branch at the current `HEAD` and do all work there.
Never make changes or commits while detached. Confirm the branch is based on
the intended starting point (normally current `origin/main`) before proceeding.
Treat this branch check as a hard gate for coordination: run it in the checkout
that will be edited, and do not run `coordination:begin` while it is detached.
The branch must be attached to that same checkout; a branch that exists in
`git branch -a` or is attached to another worktree is not sufficient. If the
branch is behind newer `main` work because another task landed first, reconcile
it before merging rather than silently shipping from an old base.

## Local worktree coordination and versioning agreement

After branch bootstrap and **before editing any file**, register the task in the
shared local coordination pane:

```bash
npm run coordination:begin -- \
  --intent "What this work changes or investigates." \
  --version-plan "The planned application version, or why this is tooling-only." \
  --preemptive-changelog "The player-facing note, or an explicit no-player-facing-change note." \
  --resources "The emulator slot, service, or other shared resource."
```

This writes a human-readable, Git-ignored coordination file shared by local
worktrees. `npm run coordination:status` displays the **Version agreement**,
the active **Preemptive changelog**, configured emulator rows, and live process
reservations so another agent can see intent before touching overlapping work.
The entry records the directory from which `coordination:begin` ran. Always run
it from the worktree you will edit, then compare the recorded `worktree` path
with `pwd`; do not assume that a similarly named branch or entry belongs to
this checkout. Keep the printed id, and finish only your own entry.
Close the entry with `npm run coordination:finish -- --id <id>` when the work is
complete. The default file is in the OS temporary directory; set
`DOW_EMULATOR_COORDINATION_FILE` to use another common local path.

The version agreement is: completed player-facing product work increments the
monotonic application version, keeps `package.json` and the root lockfile in
sync, and adds the newest user-facing `src/changelog.ts` entry. Development
tooling, tests, and documentation-only work explicitly record that no
application version or player-facing changelog entry is expected. The
preemptive changelog is a plan, not a substitute for the completed release
entry.

## Routine task delegation

The product owner gives standing authorization to delegate suitable, well-scoped
tasks when doing so is expected to save total effort and tokens after accounting
for setup, context transfer, and review. No separate confirmation is needed for
each suitable task.

Subagent-maxing is the default for suitable work. As soon as a task has
independent, bounded reconnaissance, implementation, or verification tracks,
fan them out to Luna and keep the parent focused on coordination and
integration. Prefer delegation when it keeps unrelated file output out of the
parent context and avoids growing or compressing that context. If no safe,
independent sidecar exists, continue locally and record why rather than forcing
an artificial split.

Delegation startup cleanup is required. Before substantive work or new
delegation, inspect the child IDs owned by the current parent and any terminal
children surfaced from inactive chats, retrieve any result still needed, and
close every completed, errored, or interrupted child. Leave pending or running
children from any chat alone; close them only after they reach a terminal state
unless they are still needed for the current task.

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

Assume several local worktrees are active at the same time. Never start
`firebase emulators:start`, `firebase emulators:exec`, `npm run emulators`,
`npm run test:rules`, or `npm run test:all` in a worktree until that worktree has
its own complete emulator port set. This includes Firestore's separate WebSocket
listener. The defaults in `firebase.json` belong to only one worktree at a time;
do not let Firebase silently reuse or kill another agent's emulator processes.

Coordinate a free slot with the other active agents and announce the slot in
the task before starting emulators. Use one row as a unit—do not mix ports from
different rows. The logging range begins at 4600, rather than the historical
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

Use `npm run emulators:configure -- <slot>` after claiming a row. It checks all
eight Firebase ports plus the matching Vite port before writing ignored
`firebase.local.json` and `.env.emulators.local` files. Then use `npm run
emulators`, `npm run dev:emulators`, `npm run test:rules`, or `npm --prefix
functions run serve`;
these commands explicitly load the worktree-local config, and the Vite command
uses the matching client ports. CI has no local config and intentionally uses
the committed slot-0 defaults. The configure command records the row in the
shared coordination file; the long-running emulator commands claim and release
live process reservations there. `npm run test:rules` prefers the configured
row, but automatically claims another complete free row when a preview already
owns it, then removes its temporary config on exit. When a task ends, stop its
emulators so the slot becomes available. If all rows are occupied, wait for a
free slot; never take a port that is already listening.

## 2. Merge once done

- Branch from `main`. Short-lived, one concern per branch.
- A branch lands on `main` **as soon as it is green and complete**. Not at the
  end of the week, not once three other things are also finished.
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
- [ ] No new client write path to server-authoritative data.
- [ ] No secret, key or service-account JSON added to the repo.
- [ ] Every affected screen has a visible, tested route back to its logical parent.
- [ ] The task's coordination entry was closed with a concise result, and every
  completed delegated child was closed.
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
This is a standing product requirement, including roles whose gameplay differs
from other stations.

- Store each ship or shuttle's identity and configuration in its own file in
  `src/data/vessels/`, using `defineShip` or `defineShuttle`. Register it once in
  the corresponding fleet catalog. Derive catalogs from those definitions;
  do not maintain duplicate per-vessel values in each consumer.
- Every ship role uses `ShipConsole` for the outer console and
  `RoleConsoleTemplate` for its workspace header, telemetry and real page
  controls. Add role-specific content as modules inside these shared surfaces.
  Do not clone a route, shared layout, navigation, census, stores or shuttlebay
  to implement a new role. Joint non-ship stations keep their station shell;
  future gameplay workspaces there also use `RoleConsoleTemplate`.
- Treat those shared components and the other single owners listed in
  `docs/CONSOLE_ARCHITECTURE.md` as the underlying base system, not merely as
  examples or starting templates. A fleet-wide ship-console change must be made
  once in that base and must reach every current and future ship console
  automatically through composition and configuration. Never satisfy a shared
  requirement with per-ship copies, patches or a checklist of console-specific
  edits.
- Every shuttle uses `ShuttleConsole` and `ShuttleConsoleTemplate`. Branding,
  initial location and equipment are configuration; capabilities are opt-in.
  Never inherit SNN's equipment, identity or docking by default.
- Put improvements that apply to all variants in the base. Add a narrowly
  typed configuration field or module slot for a real exception; do not add
  vessel-ID branches throughout shared components.
- Write and run a failing test before implementation. Exercise the shared base
  with the reference vessel and at least one materially different configuration
  to prove inheritance; do not require repeated manual inspection or bespoke
  assertions for every ship in the fleet. Preserve route guards, role ownership,
  return navigation and server authority.
- Whenever a gameplay step or control applies ship damage, name the drawn card
  and affected system in the crew-visible outcome at that same point of resolution.
  Also state when armour absorbed and recycled the card, when the triggering
  check failed and caused no damage, or when the deck was empty and no card
  remained. Undrawn deck order stays server-only; connected session members may
  read completed draw records, but clients may never choose or write a draw.

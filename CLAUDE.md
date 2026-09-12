# CLAUDE.md

Working agreement for Den of Wolves: New Eden Console. This is a small,
player-facing Firebase multiplayer game, not a high-assurance local audit
system. Keep the workflow proportionate to the risk of the change.

## Fast path

### Before editing

1. Work in the assigned checkout on a short-lived branch. Confirm the identity
   before setup or edits:

   ```bash
   pwd -P
   git rev-parse --show-toplevel
   git rev-parse --git-dir
   git rev-parse --git-common-dir
   git branch --show-current
   git status --short --branch
   ```

   The resolved top-level path must be the checkout you were assigned, the
   branch must be attached and not `main`, and any existing changes must be
   understood and preserved. Never edit a parent checkout or another task's
   worktree.
2. Install locked dependencies only when needed (`npm ci`, and
   `npm ci --prefix functions` when Functions checks are needed). Do not commit
   dependency directories or local Firebase configuration.
3. For prompt-driven work, read the matching record in the JSON catalog at
   `docs/implementation-prompts.json`. The generated implementation Markdown
   views are for browsing; update the catalog and regenerate views when a
   roadmap fact changes. `NEXT` is a useful ready-work hint, not a serial lock.
   A dependency check such as
   `npm run coordination:dependencies -- --prompt NNN` is read-only: it reports
   the catalog row and hard prerequisites and does not create a nonce, receipt,
   or other local proof artifact. An unfinished hard prerequisite or unresolved
   owner decision means the prompt is not yet ready to tackle in the plan;
   dependency readiness does not block commits, merges, pushes, or deployment.
   When catalog facts change, regenerate the human-readable views with
   `node scripts/generate-prompt-views.mjs`; use `--check` to verify that views
   are current.

   Include each newly queued item in the generated dependency chart and record
   useful related-work links and explicit hard prerequisites where one item
   genuinely needs another's functionality. These prerequisites describe
   implementation order and realistic readiness, not Git or CI enforcement.
   Do not add commit, merge, push, or deployment gates for them. Reuse existing
   cheap catalog checks without new enforcement machinery or release delays.
   If a queue update would disrupt an in-flight final release,
   prepare it separately and land it after that release settles.
4. Once a prompt or task is accepted, freeze its scope. Queue unrelated ideas
   for a later task; add work during implementation only when it directly fixes
   a blocking defect in the accepted change. Record the reason for any such
   amendment in the task discussion.

Keep unrelated agent-policy and workflow edits out of an in-flight feature
release. Queue them for the next safe checkpoint unless the user explicitly
requests them now or they directly unblock that release.

Coordination is lightweight and optional. Use `npm run coordination:begin` and
`npm run coordination:status` when a task needs an owner record, its branch and
worktree, a prompt reference, or a shared resource reservation. Coordinate the
actual hotspots (shared session state, callable/rules files, deploy/auth
infrastructure, release metadata, or an emulator row); do not claim every leaf
file or a whole directory by default. `coordination:status` is the current
source for ownership and reservations. Never infer that another task is stale
or safe to interrupt from age alone. Preserve other tasks' claims and port
reservations. A parked task needs only a clear parked status and next action;
there is no status/heartbeat polling loop. Optional goals may stay in the chat
or ordinary session record; there is no immutable goal file, digest comparison,
one-shot provenance or repair chain, or cleanup gate.

Process-gate changes are frozen through 2026-09-18. An exception needs two
observed production-impacting failures that the proposed gate would have
prevented; fixes to broken existing tools remain allowed. For the first five
prompts, use the existing task timestamps for a lightweight check; do not add a
new telemetry system.

The top-level coordinator defaults to `gpt-6-astra` with medium reasoning. It
owns priorities, complete bounded task briefs, architecture decisions, and difficult
blockers, and intervenes at meaningful boundaries rather than requesting
repeated status, duplicating investigation, or reviewing every tool result. Do
not create expensive child coordinators or a mandatory Sol stage; do not create
Sol children absent explicit user instruction. Sol is not a default child.

Workers own task-specific documentation reading and code investigation. Beyond
required agent instructions, the coordinator relies on concise worker findings,
decisions needed, and evidence pointers; it does not duplicate their document
reading. Inspect source material only to resolve a concrete decision or blocker.
Do not interrupt an active owner or request a rebase solely for routine guidance
updates; let the owner encounter them at its next normal update unless they
materially affect the current work.

One task owner carries a change through implementation, repairs, appropriate
self-review and validation, merge, push, and deployment verification when
applicable. A sidecar is optional and there is no minimum-agent count. Parallelize
independent deliverables only when the concrete benefit exceeds coordination,
context, and integration cost, and give every extra agent a bounded deliverable.
Delegated workers default to `gpt-5.6-luna` with `xhigh` reasoning. Luna with
`xhigh` is the economical default for delegated work. Select `max` only for
difficult bounded work with a brief reason; there is no automatic max
escalation.

Use `gpt-5.6-terra` with `xhigh` for an independent review when a behavior
change touches shared session state, callable behavior (including authorization
and rules), Firestore rules, or deployment/authentication infrastructure.
Editing comments or copy and routinely deploying an ordinary feature do not by
themselves trigger review.
Keep meaningful security and authority tests and final validation. Send all
actionable findings together; the owner repairs them, with follow-up limited to
unresolved findings or materially changed risk. Do not run a compulsory Luna →
Terra → Luna ownership cycle.

Escalate only after actual lack of progress or a material failure: substantive
diagnosis and an attempted repair must fail and the owner cannot identify a
credible next step. A failed test with an obvious fix is progress. Terra may
diagnose or take over a justified blocker when the reason and ownership
transfer are explicit; the existing Astra coordinator handles difficult
decisions without a mandatory Sol stage.

The normal path is:

1. Select a ready task or prompt and accept a bounded scope.
2. Implement the smallest useful change with focused, meaningful tests.
3. For a behavior change to shared session state, callable behavior (including
   authorization and rules), Firestore rules, or deployment/authentication
   infrastructure, obtain an independent Terra risk review and receive all
   actionable findings in one pass. The owner repairs findings in a bounded
   follow-up. Ordinary feature deployment and documentation or copy edits do
   not by themselves trigger this review.
4. Reconcile with current `main`, commit the reviewed candidate, run one
   appropriate final validation on that commit, then merge, push, and close the
   task. Rerun validation only when
   meaningful inputs changed, a check failed, or an unresolved concern remains.

When dependencies permit, tasks may implement and run focused tests in parallel
while an upstream release settles. Reconcile onto its settled result before
finalizing release metadata and running final validation. Do not repeatedly run
a full gate on a candidate already known to need another rebase.

### Stopping while a worker remains active

When delegated work remains unfinished, a coordinator may yield or end its
current reply while a concrete, bounded worker is actively running with
authority for its full implementation, validation, and release scope. Give it a
complete bounded brief, the canonical parent task destination, and expected
checkpoint. The worker must report completion, a blocker, review-ready status,
or a missing decision through
collaboration or `send_message_to_thread` to that exact parent task; ordinary
commentary is not a reliable handoff. The parent resumes on that boundary,
retrieves a terminal result with one bounded status lookup if delivery is
uncertain, and resolves/dispatches the next task while the goal remains
unfinished.

Do not end with no work running and imply progress, create a dummy worker or
sleep heartbeat, or repeat empty polls. Waiting/yielding avoids continuous
model generation, but worker execution, handoff, and resumed processing still
consume usage; never promise zero tokens or unlimited overnight completion.
If the goal remains unfinished and ready work is available, a completed worker
needs a next dispatch; when no independent work is available, park only at an
explicit boundary or genuine blocker and report it truthfully. Keep pending user
decisions pending while independent work proceeds. App resume may not survive a
sleeping host or closed app, so completion is never guaranteed across that
boundary.

## Testing and review

Use the smallest test that proves the behavior. Security and authority changes
need focused rules and callable tests: assert Firestore denies privileged
client writes, callable authorization rejects the wrong actor, and the server
transaction owns the mutation. New routes need a route-level test that activates
the visible return control. Components should use accessible roles and text;
pure logic belongs in focused unit tests. Low-impact, reversible copy or CSS
changes do not need a red-before-green TDD ritual, but they do need a useful
rendered or focused check. Preserve the distinction between local tests,
rendered review, deployed behavior, and capacity evidence.

Typical checks are:

```bash
npm test
npm run test:rules
npm run lint
npm run build
npm run build --prefix functions
git diff --check
```

Choose the relevant subset for the change. Documentation-only work reviews
rendered Markdown, links, examples, and `git diff --check`; it does not need
the application suite. `npm run coordination:docs` is the documentation
validator when it is available. There is one final appropriate validation after
review and reconciliation, not a ceremonial rerun of every matrix.

Use existing cheap checks for affected contracts before pushing. After the
planned web build, run `node scripts/check-bundle-size.mjs` when startup or lazy
imports, web dependencies, or bundle configuration changed; reuse that build's
output. When agent guidance changes, run
`npx vitest run --project unit src/repositoryGuidance.test.ts`. These are targeted
checks, not a reason to add another build, reviewer, enforcement mechanism, or
full application-suite run for an instructions-only change.

For every UI change, inspect the rendered result at narrow phone, wide desktop,
and short landscape sizes. Check contrast, readable font sizes, spacing,
wrapping, overflow, controls, reduced motion, and forward/back navigation.
Verify the actual font and navigation contract, not only a source-string test.
Every non-landing screen and device mode has a visible, keyboard-accessible
route back to its logical parent, normally Roles; do not rely on browser Back,
Settings, disconnecting, or a route guard as the only exit.

## Worktrees and emulator rows

Each task uses its own branch and checkout. For rules or emulator-backed checks,
claim a complete free row atomically:

```bash
npm run emulators:configure -- auto
npm run emulators
npm run dev:emulators
```

Use the generated worktree-local configuration consistently and never mix its ports with another row. The command owns the reservation it creates; do not
release another worktree's row. A configured row remains unavailable while its
owner is active even if no process is currently listening. Check current
coordination before acting, and do not stop a live process based on age or an
empty reservation. The complete port matrix and wrapper signal behavior live in
[`docs/WORKTREE_COORDINATION.md`](docs/WORKTREE_COORDINATION.md).

## Merge, deploy, and cleanup

Before landing, inspect the final diff and run the focused checks appropriate to
the changed files. Reconcile the owner branch with current `main`, commit the
reviewed candidate, and resolve conflicts before final validation. Git history
records provenance; no extra ancestry-only commits are required. The owner then
merges to `main`, pushes
`origin/main`, verifies the resulting deployment when the change is deployable,
and reports the exact result. A pushed workflow is not proof that production
finished; check the deployed behavior or workflow result separately. Do not
claim capacity, CI, or live Firebase health from a local green test.

Player-facing work increments the application version, keeps `package.json` and
the root lockfile synchronized, and adds a concise player-facing changelog entry
to `src/changelog.ts`. Tooling, tests, and documentation-only changes do not bump
the version or add a player note. Never append one task's note to another
version entry. Derive the visible build reference from package metadata rather
than hardcoding a version in source, tests, or docs. Deployment changes must
preserve the short-lived Workload Identity Federation path and must not add a
service-account key.

Only the product owner authorizes `0.9.x` and `1.0.0`. A `1.0.0` release
requires the complete 20-player set, an end-to-end gameplay loop, and a clear
implemented game end; role count or placeholder screens alone do not qualify.
Release notes should include the completed/total prompt percentage from the
catalog snapshot used for that release, without turning the percentage into a
second roadmap authority.

After a landed branch is pushed, its worktree is eligible for cleanup once the
task is terminal and you have confirmed no live process uses it, no uncommitted
or untracked files remain, and no unique unmerged work would be lost. A fixed
48-hour retention period is not required. Cleanup is a separate deliberate
action; this policy does not authorize removing another active task or its
branch. Preserved work needs a clear destination, and discarded work needs a
reason.

## Private source boundary

Before designing or changing player-facing game content, consult the authorized
private source library outside this repository and the source it routes to for
the affected mechanic. Start with the local-only source index at
`/Users/emeraldpham/.codex/private-reference/den-of-wolves-new-eden-console/docs/reference/README.md`;
its authorized Markdown summaries are under
`/Users/emeraldpham/.codex/private-reference/den-of-wolves-new-eden-console/docs/reference/den-of-wolves-new-eden/`.
These paths are recorded as locators for this single-machine workflow only. Do
not add repository links to private contents, or copy, quote, reproduce, or
commit private source files or content. Printed component sheets control their
named ship, shuttle, fighter wing, console, card, value, or owner when they
conflict with a generic guide. If the private library is unavailable, or a
routed source leaves a gap, stop and record the unresolved owner decision
rather than inventing a rule.
The owner-only archive is outside Git at
`/Users/emeraldpham/.codex/private-reference/den-of-wolves-new-eden-console/`;
do not touch it in routine repository work.

## Stack

Vite 6 · TypeScript strict · React 18 · Zustand · Firestore Web SDK v12
modular · Cloud Functions 2nd gen (Node 22) · React Router `HashRouter` ·
Vitest + React Testing Library + Firestore rules emulator · GitHub Actions →
Firebase. `HashRouter` is deliberate: deep links must work on a static host
without rewrite rules. Do not relax TypeScript strictness or hide errors with
`any` or `@ts-expect-error`.

## Security model

**A client may read what it is entitled to see and write only its own presence
document.** Every mutation a player could benefit from lying about—claiming a
seat, becoming GM, generating a secret, or producing a random result—is denied
in `firestore.rules` and implemented as an authorized callable Cloud Function
inside a transaction. The rules suite asserts the client-side denial as well as
the allowed path. Do not add client writes to `seats`, `secrets`, or `events`,
and never let a client set `role`.

The Firebase web config contains public identifiers, not credentials. Never
commit a service-account key, secret, or App Check debug token. App Check is
complementary to authorization; it never replaces callable authorization or
Firestore rules. CI uses short-lived Workload Identity Federation credentials.

## State and session lifecycle

- Zustand holds local, per-browser view state only; Firestore holds shared
  authority. Snapshots land in the store and mutations go through callables.
- Persisted session snapshots render immediately, then `resumeSession` refreshes
  them from the server. Transient network failures keep the snapshot offline;
  `not-found`, `permission-denied`, and `failed-precondition` clear stale data.
- Presence heartbeats refresh every 10 seconds; the server expires a device
  after 45 seconds and releases only a seat still owned by that stale UID.
  Reconnect may reclaim an open seat, but must not overwrite a seat another
  player took.
- GM and Console are device modes, not freely selectable Firestore roles. Only
  a server-authorized `gm` may enter GM mode; Console is available to session
  members; GM Observer is read-only until its explicit write control is used.
- Disconnect queues or sends the server-aware presence update, clears local
  session/mode/route state, and returns to `/`. The visible Settings action uses
  the documented danger-red two-step confirmation.
- Session headers are readable only by members and are never listable. Joining,
  resuming, seat claims, and releases remain callable and transactional.

Keep Firestore wiring in `src/lib/firestore.ts`; lazy imports protect the landing
bundle. Preserve the one-seat-per-player pointer checks, live shared snapshots,
outbox reconciliation, and bundle/dependency audits when changing this flow.

## Layout

```text
src/components/       shared controls and DRADIS instruments
src/data/              fleet, role, ship, and shuttle definitions
src/lib/               lazy Firebase and Firestore seams
src/routes/            route components and colocated tests
src/store/             local view state and server snapshots
src/types/             shared game and session shapes
functions/src/         callable functions and server policy helpers
firestore.rules        read model and client-write denials
tests/rules/           emulator-backed security assertions
```

## Aesthetic and responsive contract

Read [`docs/AESTHETICS.md`](docs/AESTHETICS.md) before changing UI. Reuse the
shared CIC tokens in `src/styles/cic.css`, keep the documented interrupted-
transmission and reduced-motion profiles, and record genuinely new reusable
patterns in that guide. Verify narrow, wide, portrait, landscape, and short
screens with accessible controls, safe-area padding, scrolling, and readable
fonts. Preserve the bounded independently scrollable Settings changelog.

## Shared vessel architecture

All ship and shuttle role consoles extend
[`docs/CONSOLE_ARCHITECTURE.md`](docs/CONSOLE_ARCHITECTURE.md). Define each
vessel once in `src/data/vessels/` with `defineShip` or `defineShuttle`, register
it once, and derive consumer catalogs. Use shared shells and role templates;
put real exceptions in typed configuration or modules instead of copying routes
or scattering vessel-ID branches. Shuttle branding, docking, and equipment are
opt-in configuration, never accidental SNN defaults. Test the reference vessel
and a materially different configuration while preserving route guards, role
ownership, return navigation, and server authority. Damage outcomes identify
the drawn card and affected system, or explicitly say when armour recycled it,
a check caused no damage, or the deck was empty; undrawn deck order stays
server-only.

## Definition of done

- [ ] The task branch and checkout are the intended ones, and existing work was
  preserved.
- [ ] Accepted scope stayed frozen except for directly blocking defects.
- [ ] Focused meaningful checks cover changed behavior; behavior changes to
  shared session state, callable behavior (including authorization and rules),
  Firestore rules, or deployment/authentication infrastructure received one
  independent Terra review.
- [ ] Rendered UI, fonts, responsive states, and visible navigation were
  inspected when applicable.
- [ ] The final appropriate validation ran after reconciliation; any rerun had
  a meaningful input, failure, or unresolved concern.
- [ ] Product version/changelog or the explicit no-player-facing-change status
  is correct, and deployment evidence is stated truthfully.
- [ ] The owner committed, merged, pushed, and verified deploy behavior when
  applicable, or recorded a clear preserve/discard outcome.
- [ ] No privileged client write, secret, key, or private-source material was
  introduced.

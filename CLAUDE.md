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
2. Run `npm run storage:status` before adding worktrees or dependencies; follow [local storage cleanup](docs/LOCAL_STORAGE.md). Install locked dependencies only when needed (`npm ci`, and
   `npm ci --prefix functions` when Functions checks are needed). Do not commit
   dependency directories or local Firebase configuration.
3. For prompt-driven work, read the matching record in the JSON catalog at
   `docs/implementation-prompts.json`. The generated implementation Markdown
   views are for browsing; update the catalog and regenerate views when a
   roadmap fact changes. `NEXT` is a useful ready-work hint, not a serial lock.
   A dependency check such as
   `npm run coordination:dependencies -- --prompt NNN` is read-only: it reports
   the catalog row and hard prerequisites and does not create a nonce, receipt,
   or other local proof artifact. Hard prerequisites and explicit product-only
   deferrals hold that prompt; source-backed rules ambiguity follows
   `docs/PRODUCT_MILESTONES.md`. Continue independent work. Readiness is not a
   commit, merge, push, or deployment gate.
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
4. Freeze accepted scope. Repair defects in its checks; route additional
   behavior to `docs/PRODUCT_MILESTONE_CANDIDATES.md` rather than enlarging it.

For numbered-prompt work, follow the one-sitting playtest checkpoints and
shaping, assumptions, test-first commits, feedback, and cooldown process in
[`docs/PRODUCT_MILESTONES.md`](docs/PRODUCT_MILESTONES.md). M1–M13 are internal
gates. Explicit owner authorization accepts a checkpoint; review-scene play
and written UI feedback are optional. Agents own gameplay proof. Build without
prebuild approval or routine owner questions: resolve choices from evidence,
log assumptions and report proof gaps. Do not pause for owner feedback or a rules ruling; ask only when higher authority requires it or no useful work remains.
Before each checkpoint transition, reconcile owner decisions into all affected future prompts and checkpoint plans under that guide.

Keep unrelated agent-policy and workflow edits out of an in-flight feature
release. Queue them for the next safe checkpoint unless the user explicitly
requests them now or they directly unblock that release.

Coordination is lightweight and optional. Use `npm run coordination:begin` and `npm run coordination:status` when a
task needs an owner record, its branch and worktree, a prompt reference, or a shared resource reservation. Coordinate
the actual hotspots (shared session state, callable/rules files, deploy/auth infrastructure, release metadata, or an
emulator row); do not claim every leaf file or a whole directory by default. `coordination:status` is the current
source for ownership and reservations. Never infer that another task is stale or safe to interrupt from age alone.
Preserve other tasks' claims and port reservations. A parked task needs only a clear parked status and next action;
there is no status/heartbeat polling loop. Optional goals may stay in the chat or ordinary session record; there is
no immutable goal file, digest comparison, one-shot provenance or repair chain, or cleanup gate.

Process-gate changes are frozen through 2026-09-18. An exception needs two
observed production-impacting failures that the proposed gate would have
prevented; fixes to broken existing tools remain allowed. For the first five
prompts, use the existing task timestamps for a lightweight check; do not add a
new telemetry system.

New top-level coordinators default to `gpt-6-astra` with medium reasoning.
The top-level orchestrator thread receiving the user's request is the task and
checkpoint owner. It owns priorities, architecture, complete bounded briefs,
every acceptance, integration, required review, final validation, merge, push,
deployment verification and the user handoff. Do not delegate checkpoint
ownership to a child or create an extra coordinator layer. Only `gpt-6-luna` and
`gpt-6.1-sol` may be delegated as subagents. Existing agents may finish current
bounded implementation assignments without interruption; apply this model policy
to new agents and subsequent assignments.

Workers own task-specific documentation reading and code investigation. Beyond required agent instructions, the
orchestrator relies on concise worker findings, decisions needed, and evidence pointers; it does not duplicate their
document reading. Inspect source material only to resolve a concrete decision or blocker. Do not interrupt an active
worker or request a rebase solely for routine guidance updates; let the worker encounter them at its next normal update
unless they materially affect the current work.

One task owner, the top-level orchestrator, carries a change through
implementation, repairs, appropriate self-review and validation, merge, push,
and deployment verification when applicable. For shaped checkpoints, one owner is accountable for every acceptance,
integration, and release; separate Luna workers (Max almost always preferred) implement independent groups, with independent Sol review for
shared-state and authority changes. Record groups, dependencies, isolated checkouts, and shared-file boundaries before
building; group coupled prompts together instead of assigning one agent per prompt. Follow the linked execution policy
and reconcile at one release boundary. Delegated workers default to `gpt-6-luna`. Luna effort is discretionary; `max` is almost always preferred.
Sol may use all supported effort levels. Keep explicit task-specific security review floors.

Delegate bounded, complete behavior groups while retaining checkpoint ownership
in the orchestrator thread. Workers implement, verify and repair their groups,
then return commits, evidence and remaining gaps; the orchestrator does useful
owner work in parallel and reconciles the single release. Keep conflicting
shared-file work with one writer. Avoid routine polling, relaying every small
update and duplicate investigation. Preserve explicit canonical-parent
collaboration messages and do not create coordinator goals. The linked
execution policy governs handbacks and safe transitions from an existing
delegated-owner assignment.

Use `gpt-6.1-sol` for independent review of shared session state, callable behavior
(including authorization and rules), Firestore rules, deployment/auth
infrastructure, or release and capacity evidence. Use `medium` or `high` for a
narrow, well-tested review and `xhigh` for complex authority or privacy risk. Exact threat-model receipts still require `xhigh`.
Editing comments or copy and routinely deploying an ordinary feature do not by
themselves trigger review. Keep meaningful security and authority tests and final validation.
Independent risk review returns all findings together; the owner repairs them
in a bounded follow-up limited to unresolved findings or materially changed risk.
Do not run a compulsory Luna → Sol → Luna ownership cycle.

Escalate only after actual lack of progress or a material failure: substantive
diagnosis and an attempted repair must fail and the owner cannot identify a
credible next step. A failed test with an obvious fix is progress. Sol may
diagnose or take over a justified blocker when the reason and ownership
transfer are explicit; the task coordinator handles difficult
decisions without a mandatory extra stage.

When dependencies permit, tasks may implement and run focused tests in parallel
while an upstream release settles. Reconcile onto its settled result before
finalizing release metadata and running final validation. Do not repeatedly run
a full gate on a candidate already known to need another rebase.

Delegated workers report requested checkpoints, blockers and material changes to
the canonical parent through collaboration. The [execution policy](docs/AGENT_EXECUTION_POLICY.md)
owns batched dispatch and waits; the [campaign playbook](docs/AGENT_CAMPAIGN_PLAYBOOK.md#communication-and-stopping)
owns parent communication and stopping. Keep a concrete owner and resume path.
For parent-only dependencies, use the execution policy's acknowledged handoff:
send an actionable canonical-parent message, obtain acknowledgement before
dependency parking, and record the parent's triage, action owner and resume
condition. A sent message is not an acknowledged handoff. Include that contract
in dispatches and use bounded follow-up without routine polling.

## Testing and review

Use focused, meaningful tests that prove the behavior. Security and authority changes
need focused rules and callable tests: assert Firestore denies privileged
client writes, callable authorization rejects the wrong actor, and the server
transaction owns the mutation. New routes need a route-level test that activates
the visible return control. Components should use accessible roles and text;
pure logic belongs in focused unit tests. For every functional change, including
repairs and interactive layout, visibility, defaults, parsers and provider behavior,
run and observe a meaningful failing test before implementation; commit the test
before code, in separate commits. Risk determines test selection, execution
breadth and regression depth, never permission to implement low-risk functionality
first. Later base-versus-fixed validation does not establish test-first chronology. Never weaken, skip, or delete an
existing test to pass; leave a suspect test intact and flag it. Never modify
an existing test in the code commit it covers. Record reasons for every test
added, changed, skipped, or deleted in the nontechnical checkpoint report.
Pure prose/documentation without functional changes needs consistency review.
Interactive presentation changes require a meaningful failing rendered/consumer
check first, then the smallest implementation and a passing check.
Use the smallest cohort per distinct claim; avoid blanket suites/account matrices.
Future gameplay proof uses normal authenticated local/emulator native, HTTP/UI and rules paths; prepared scenes alone do not establish behavior. Keep local tests, gameplay, rendered QA, CI, production deployment and actual production behavior distinct. Independent risk review, CI and deployment remain required; production-GM gameplay is not a closure prerequisite.

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

The shared FleetBroadcast ticker is release-critical because it is the only
common live-news surface. Run `npm run test:ticker:browser` when a change can
affect application chrome, joined routes, session projection, global styling,
runtime dependencies, or the ticker harness. The deployment range carries this
risk into exact-SHA CI, so unrelated Functions, rules, documentation, and
tooling releases do not pay for the browser lifecycle gate.
Any change to ticker selection, source priority, queue projection, animation, responsive geometry, or broadcast session state must prove the live Press-to-Red-Alert handoff: every painted Press copy remains on the physical track, unentered repetitions are removed, and Red Alert appends behind the retained tail without overlap or a blank reset. The smoke must prove an authoritative current message is painted with non-zero
viewport geometry and visible text in normal and reduced motion at phone and
desktop sizes, including a browser whose document font promise remains
pending, after navigation and reload, without horizontal overflow. Keep its
session projection fixture isolated to the smoke and save a viewport screenshot
when a case fails; do not replace the real ticker with a mock or an offscreen
DOM assertion.

Typography is a mandatory exact-SHA CI/deployment gate for every player-facing candidate. `npm run test:font-consistency` checks the stylesheet contract; `npm run test:typography:browser` verifies rendered computed styles and representative geometry. Both checks are required for a player-facing deployment.
Local green tests, changed-file selection, workflow choice, or urgency cannot bypass it; accepted fixtures change only with reviewed contract updates and fresh rendered evidence. PC01 is a comparison point, not authority over the documented tokens: repair any proven outlier, then ratchet the corrected result.

Automate every source-deterministic facilitator procedure so one facilitator makes only genuinely required choices, rulings, and interventions. Server-owned automation logs source, inputs, modifiers, outcome, state delta, revision/replay identity, and recovery; never ask a person to calculate, transcribe, relay, approve, or confirm a deterministic result the console can safely own.

Call the numbered game clock a **cycle** in all player-facing labels, help,
announcements, accessible names, errors, and release notes. Never label it a
turn. Existing wire fields, callable names, document IDs, and internal symbols
such as `currentTurn` remain compatible; this is a product-copy convention.

The canonical pool, priority, and physical handoff contract is
[Ticker Behavior](docs/TICKER_BEHAVIOR.md). Priority changes future entries,
never visible text; Stand Down plays twice before Press resumes.

Ticker source priority, ATC copy, visibility, initial projection and browser
coverage belong in [Ticker Behavior](docs/TICKER_BEHAVIOR.md#initial-projection-and-release-verification).
Use that contract for every broadcast change; keep the exact-SHA browser gate above.

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
Rerun validation only after a meaningful input changed, a check failed, or an
unresolved concern remains.

Player-facing work increments the application version, keeps `package.json` and
the root lockfile synchronized, and adds a concise player-facing changelog entry
to `src/changelog.ts`. Tooling, tests, and documentation-only changes do not bump
the version or add a player note. Never append one task's note to another
version entry. Derive the visible build reference from package metadata rather
than hardcoding a version in source, tests, or docs. Deployment changes must
preserve the short-lived Workload Identity Federation path and must not add a
service-account key.

Patch versions stop at `99`: after `0.x.99`, increment the minor version and
reset the patch to zero (`0.3.99` → `0.4.0`). Never issue `0.x.100` or higher.
If an existing release has already exceeded that limit, use the next minor
version with patch zero for the next release; preserve published release history.

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
reason. At closeout, remove eligible worktrees deliberately or record their retention owner and reason; follow [the storage procedure](docs/LOCAL_STORAGE.md), including ignored-file and live-process review.

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
conflict with a generic guide. For ambiguity, cite and paraphrase the precise
passage in `docs/PRODUCT_MILESTONE_ASSUMPTIONS.md`, choose the best reading,
and continue. If a routed source leaves a gap or is unavailable, report it and
work independently; stop only when no useful progress remains. Do not commit
private wording or files.
The owner-only archive is outside Git at
`/Users/emeraldpham/.codex/private-reference/den-of-wolves-new-eden-console/`;
do not touch it in routine repository work.

## Stack

The [project README](README.md#stack) owns the stack and setup reference.

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
- The authoritative session root is readable by current GMs and is never
  listable. Ordinary players and Press receive the actor-derived current-member
  callable projection; raw root reads cannot redact foreign group fields.
  Joining, resuming, seat claims, and releases remain callable and transactional.

Keep Firestore wiring in `src/lib/firestore.ts`; lazy imports protect the landing
bundle. Preserve the one-seat-per-player pointer checks, live shared snapshots,
outbox reconciliation, and bundle/dependency audits when changing this flow.

## Layout

Use the [project map](README.md#project-map) for source and test locations.

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
  independent Sol 6.1 review.
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

## Independent typography review for final releases

Owner instruction, 2026-10-08: every final product checkpoint release and
equivalent release requires a typography reviewer independent of the
implementer. Review the actual final built candidate, identify its commit and
build artifact, and compare it with the intended typography contract and
previous released build. Automated typography checks do not substitute for this
review. Recheck affected evidence if the reviewed candidate materially changes.

Inspect the actual resolved/rendered font (including platform fallback or font
load failure), computed family, size, weight and line height, readability,
wrapping and overflow. Use representative relevant viewports and states,
including changed controls, dialogs/portals and recovery screens when affected.
Choose the smallest useful configuration set; do not expand into a full actor
or account matrix. For a global font report, sample shared chrome plus distinct
font/inheritance paths across the app, and compare base/candidate CSS and assets.
Record the baseline, exact artifact, platform, states, viewport/window sizes,
findings, evidence and what was not checked. An inaccessible runtime is an
unresolved review gap, not a pass inferred from unit, inference or source tests.
Fix actionable typography findings and obtain the affected independent review
before publication.

Apply the [routine responsive UI acceptance checklist](docs/AGENT_EXECUTION_POLICY.md#routine-responsive-ui-acceptance) to every UI change, including enlarged text and relevant content/state risks.

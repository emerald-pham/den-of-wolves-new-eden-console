# CLAUDE.md

Working agreement for Den of Wolves: New Eden Console. This is a small,
player-facing Firebase multiplayer game, not a high-assurance local audit
system. Keep the workflow proportionate to the risk of the change.

## Fast path

### Before editing

Create or select an atomic GitHub ticket before starting the work it describes.
Use the smallest possible scope: one independently verifiable outcome with clear
acceptance criteria. Refine broad tickets into linked atomic subtickets and work
from those subtickets. Create missing tickets before proceeding with their work.
This is workflow guidance, not an approval, commit, merge, push, CI, or deployment
gate; it adds no enforcement machinery.

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
3. For prompt-driven work, start from the matching GitHub issue (found
   through `docs/tracker/github-crosswalk.json` or the refinement publication
   table). GitHub issues are the mutable authority for every open prompt, brief
   and refinement. The catalog snapshot at `docs/implementation-prompts.json`,
   the brief Markdown and the generated Markdown views are offline snapshots of
   those issues, so edit open definitions on GitHub, never in a snapshot file.
   `npm run coordination:dependencies -- --prompt NNN` is a read-only readiness
   check that creates no local receipt; `NEXT` is a ready-work hint, not a
   serial lock. [Tracker operations](docs/agents/issue-tracker.md) own refresh,
   update, `npm run prompt-tracker -- export`,
   `node scripts/generate-prompt-views.mjs`, queueing and recovery.
4. Freeze accepted scope. Repair defects in its checks; route additional
   behavior to a new GitHub issue as described in
   `docs/PRODUCT_MILESTONE_CANDIDATES.md` rather than enlarging it.

For numbered-prompt and checkpoint work, follow
[product checkpoints](docs/PRODUCT_MILESTONES.md): build without routine owner
questions, resolve choices from evidence, log assumptions and report proof
gaps; ask only when higher authority requires it or no useful work remains.

Coordination is lightweight and optional. Before touching a shared hotspot
(shared session state, callable/rules files, deploy/auth infrastructure,
release metadata, or an emulator row), check `npm run coordination:status` for
the current owner and reservations, and follow
[worktree coordination](docs/WORKTREE_COORDINATION.md#optional-coordination).
Never infer that another task is stale or safe to interrupt from age alone.
Optional goals may stay in the chat or ordinary session record; there is no
immutable goal file, digest comparison, one-shot provenance or repair chain,
or cleanup gate.

Before delegating, shaping a checkpoint or preparing a release, follow the
[Agent execution policy](docs/AGENT_EXECUTION_POLICY.md) for checkpoint
ownership, worker groups and handbacks, parent-only dependencies, waits and
batched CI.
Choose every agent's model and effort from [model and effort routing](docs/AGENT_EXECUTION_POLICY.md#model-and-effort-routing), in the subsection for your agent tool.

Behavior changes to shared session state, callable behavior (including
authorization and rules), Firestore rules, deployment/auth infrastructure, or
release and capacity evidence need one independent risk review by an agent
other than the implementer. Editing comments or copy and routinely deploying
an ordinary feature do not by themselves trigger review. Independent risk
review returns all findings together; the owner repairs them in a bounded
follow-up limited to unresolved findings or materially changed risk.

## Error recovery

For error handling, retries, reconnects or stale reads, follow
[Safe automatic recovery](docs/agents/error-recovery.md).

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
Evaluate testing improvements by time to a playable build, including execution
and maintenance. Every new test must protect a distinct failure; extend
existing coverage where practical. During ordinary self-review, consolidate or
retire checks that duplicate retained protection or unnecessarily pin internal
implementation, explaining the surviving coverage for actual requirements.
Preserve meaningful gameplay, privacy and authorization protection and the
mandatory rendered typography gate. Deliberate retirement is separate from
removing an existing test to make a failure pass.
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
Apply the [routine responsive UI acceptance checklist](docs/AGENT_EXECUTION_POLICY.md#routine-responsive-ui-acceptance) to every UI change, including enlarged text and relevant content/state risks.
For browser UI work, follow the
[browser tooling policy](docs/AGENT_EXECUTION_POLICY.md#browser-tooling-for-ui-proof).

Typography is a mandatory exact-SHA CI/deployment gate for every player-facing candidate. `npm run test:font-consistency` checks the stylesheet contract; `npm run test:typography:browser` verifies rendered computed styles and representative geometry. Both checks are required for a player-facing deployment.
Local green tests, changed-file selection, workflow choice, or urgency cannot bypass it; accepted fixtures change only with reviewed contract updates and fresh rendered evidence. PC01 is a comparison point, not authority over the documented tokens: repair any proven outlier, then ratchet the corrected result.
A final checkpoint release also needs an
[independent typography review](docs/AGENT_EXECUTION_POLICY.md#independent-typography-review-for-final-releases)
of the built candidate.

The shared FleetBroadcast ticker is release-critical. [Ticker Behavior](docs/TICKER_BEHAVIOR.md)
is the canonical pool, priority, ATC copy and physical handoff contract for
every broadcast change: priority changes future entries, never visible text,
and Stand Down plays twice before Press resumes. When a change can affect
application chrome, joined routes, session projection, global styling, runtime
dependencies or the ticker harness, run `npm run test:ticker:browser` and meet
its [browser smoke gate](docs/TICKER_BEHAVIOR.md#browser-smoke-gate).

Automate every source-deterministic facilitator procedure so one facilitator makes only genuinely required choices, rulings, and interventions. Server-owned automation logs source, inputs, modifiers, outcome, state delta, revision/replay identity, and recovery; never ask a person to calculate, transcribe, relay, approve, or confirm a deterministic result the console can safely own.

Call the numbered game clock a **cycle** in all player-facing labels, help,
announcements, accessible names, errors, and release notes. Never label it a
turn. Existing wire fields, callable names, document IDs, and internal symbols
such as `currentTurn` remain compatible; this is a product-copy convention.

## Worktrees and emulator rows

Each task uses its own branch and checkout. For rules or emulator-backed
checks, claim one complete free row with `npm run emulators:configure -- auto`,
use its generated worktree-local configuration and never mix its ports with
another row. [Emulator rows](docs/WORKTREE_COORDINATION.md#emulator-rows) owns
the port matrix, reservations and teardown.

## Landing and release

Before landing, inspect the final diff and run the focused checks appropriate to
the changed files. Reconcile the owner branch with current `main`, commit the
reviewed candidate, and resolve conflicts before final validation. Rerun
validation only after a meaningful input changed, a check failed, or an
unresolved concern remains. The owner then merges to `main`, pushes
`origin/main`, verifies the resulting deployment when the change is deployable,
and reports the exact result. A pushed workflow is not proof that production
finished; check the deployed behavior or workflow result separately. Do not
claim capacity, CI, or live Firebase health from a local green test. The
[README deployment section](README.md#deployment) and
[deployment setup](docs/ci-deploy-setup.md) own the deploy procedure.

Player-facing work increments the application version, keeps `package.json` and
the root lockfile synchronized, and adds a concise player-facing changelog entry
to `src/changelog.ts`. Tooling, tests, and documentation-only changes do not bump
the version or add a player note. Before preparing a release, read
[release versioning](docs/AGENT_EXECUTION_POLICY.md#release-versioning) for the
patch limit, restricted versions and release-note contents.

At verified closeout, clean up the finished branch without another owner
request through [automatic branch closeout](docs/LOCAL_STORAGE.md#automatic-branch-closeout),
and remove eligible worktrees or record their retention owner and reason under
[the storage procedure](docs/LOCAL_STORAGE.md). Report anything retained and why.

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

Vite 6, strict TypeScript, React 18 with Zustand, the Firestore Web SDK v12
modular API and 2nd-gen Cloud Functions on Node 22; the
[project README](README.md#stack) owns the full stack and setup reference.
Keep TypeScript strict and never hide errors with `any` or `@ts-expect-error`.
`HashRouter` is deliberate: deep links must work on a static host without
rewrite rules.

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
Firestore rules. CI uses short-lived Workload Identity Federation credentials;
deployment changes must preserve that path and must not add a service-account
key.

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
  independent risk review.
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

## Agent skills

### Issue tracker
Engineering skills use the existing prompt catalog. Read [tracker workflow](docs/agents/issue-tracker.md) before publishing or triaging work.

### Triage labels
Map skill roles to existing records without new completion states: [triage mappings](docs/agents/triage-labels.md).

### Domain docs
Single-context glossary and ADRs, created lazily: [domain documentation rules](docs/agents/domain.md).

### Test-first briefs
For a functional change, use the `tdd` skill at the brief's agreed seams and read its `tests.md` and `mocking.md` before the first test, even when the brief omits it: [subagent briefs](docs/AGENT_EXECUTION_POLICY.md#subagent-briefs-for-functional-changes).

### Retrospectives
When invoking a retrospective, include the target session ID or checkpoint.
Without one, inspect the current session. If it contains no coding work, state
that limitation and keep findings tied to the inspected environment; do not
substitute another session based only on recency.

# Den of Wolves: New Eden — Unofficial Companion Console

An in-person companion console for running *Den of Wolves: New Eden*. It
provides shared sessions, player stations, GM controls, ship and shuttle
consoles, and a live fleet display backed by server-authoritative Firebase state.

> Unofficial and unaffiliated. Fan project.

Live deployment: [dow-new-eden-console.web.app](https://dow-new-eden-console.web.app/)

## Status and documentation

The game is under staged development. The [JSON catalog](docs/implementation-prompts.json)
owns prompt definitions, completion, dependencies and release evidence. Its
generated Markdown views are convenient reading copies. Local green checks and
a deployed build do not establish that the entire game is complete.

Start with [CLAUDE.md](CLAUDE.md) for repository policy and the
[documentation map](docs/README.md) for the right contract, checkpoint or report.
The [product checkpoints](docs/PRODUCT_MILESTONES.md) own preparation and review;
the [completion plan](docs/CHECKPOINT_COMPLETION_PLAN.md) fixes their membership
and targets. The [implementation plan](docs/IMPLEMENTATION_PLAN.md) is generated
from the catalog's objectives and acceptance criteria.

For prompt readiness, `npm run coordination:dependencies -- --prompt NNN` is
read-only and creates no nonce or receipt. `NEXT` is a ready-work hint. After
catalog edits, run `node scripts/generate-prompt-views.mjs`; `--check` verifies
the generated views. Freeze accepted scope and queue unrelated additions.

The target is one 20-player game with up to 60 concurrent browser clients. The
normal core roster is 8–20; optional Press and GM holders do not count toward
it. [Approved deviations](docs/INTENTIONAL_DEVIATION_GUARDS.md) record the roster
policy; [capacity conclusions](docs/CAPACITY_CONCLUSIONS.md) state the measured
local envelope and remaining production limits. The
[abuse-protection handoff](docs/ABUSE_PROTECTION_HANDOFF.md) owns that workstream.

## Stack

| Layer | Choice |
|---|---|
| Build | Vite 6 |
| Language | TypeScript strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| UI | React 18, Zustand |
| Shared state | Firestore Web SDK v12 modular, with live snapshots |
| Server | Cloud Functions for Firebase, 2nd gen, Node 22 |
| Routing | React Router `HashRouter` |
| Tests | Vitest, React Testing Library, Firestore rules emulator |
| Hosting | GitHub Actions → Firebase Hosting |

`HashRouter` supports deep links on the static host.
Keep TypeScript strict; do not hide errors with `any` or `@ts-expect-error`.

## Project map

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

Shared vessel composition belongs in [Console Architecture](docs/CONSOLE_ARCHITECTURE.md).
The [ship](docs/SHIP_TEMPLATE.md) and [shuttle](docs/SHUTTLE_TEMPLATE.md) templates
specify their respective surfaces. Printed sources stay outside this public
repository; [CLAUDE.md](CLAUDE.md#private-source-boundary) records the private
locator and routing rules. Preserve the
[rollback anchor](docs/PRESERVED_IN_AMBER.md).

## Quick start

Use Node.js 22 and npm. The root package accepts Node.js 20 or newer; Functions
target Node.js 22. The committed Firebase web configuration contains public
identifiers and needs no service-account credential for browser development.

```bash
npm ci
npm ci --prefix functions
npm run dev
```

For emulator work, select one complete free worktree row first:

```bash
npm run emulators:configure -- auto
# In separate terminals:
npm run emulators
npm run dev:emulators
```

Use that row's generated local configuration consistently. The
[coordination reference](docs/WORKTREE_COORDINATION.md#emulator-rows) owns the
port matrix, reservations and teardown rules. Coordination is optional and
protects actual shared hotspots. Never infer stale ownership from age alone.
The rules emulator requires Java; CI uses Java 21.

## Validation and security

Use focused, meaningful checks appropriate to the change:

```bash
npm test
npm run test:rules
npm run lint
npm run build
npm run build --prefix functions
```

[CLAUDE.md](CLAUDE.md#testing-and-review) owns test-first, rendered QA and
independent-review requirements. Documentation uses `git diff --check` and
`npm run coordination:docs`; it does not change the product version or player
changelog. One owner carries implementation, review, repairs, validation,
merge, push and truthful deployment verification. Risk review collects all
findings; the owner repairs them in a bounded follow-up. Reconcile with current
`main` before one final appropriate validation. Rerun only after a meaningful
input changed, a failure or an unresolved concern.

Clients read entitled data and write only their own presence. Callable
Functions own claims, secrets, random results and other game mutations inside
transactions; Firestore rules deny privileged client writes. Never commit a
service-account key or App Check debug token. Production App Check, monitoring
and response guidance are in the [abuse-protection handoff](docs/ABUSE_PROTECTION_HANDOFF.md).

## Deployment

CI selects checks by changed paths; workflow guides and generated roadmap views
can trigger documentation verification. The main Deploy workflow selects
Firebase surfaces from the range since the last successful deployment and uses
a separate successful-verification baseline for risk checks. Documentation
alone does not require an application release; earlier undeployed changes can
still affect a later main workflow. Verify its actual result or deployed
behavior before reporting production success.

The [deployment setup handoff](docs/ci-deploy-setup.md) owns Workload Identity
Federation and repository variables. GitHub Actions uses short-lived
credentials. Manual deployment requires the Firebase CLI and an authenticated
session for the project in `.firebaserc`:

```bash
npm run deploy
npm run deploy:hosting
```

## License

This unofficial fan project is not currently offered under an open-source
license. See [LICENSE.md](LICENSE.md) for rights and third-party boundaries.

# Den of Wolves: New Eden — Unofficial Companion Console

An in-person companion console for running *Den of Wolves: New Eden* at the
table. It provides shared sessions, role and ship selection, GM controls, ship
and shuttle consoles, a live fleet display, and server-authoritative multiplayer
state backed by Firebase.

> Unofficial and unaffiliated. Fan project.

Live deployment: [dow-new-eden-console.web.app](https://dow-new-eden-console.web.app/)

## Operating envelope

The target is one 20-player game with up to **60 concurrent browser clients**.
Players may use several devices, and many clients may share one table network.
This is the design envelope, not a claim of completed load testing. The
[capacity and abuse-protection handoff](docs/ABUSE_PROTECTION_HANDOFF.md) is the
source for that workstream.

The core roster target is **8–20 players**. Press is an optional, non-counted
extension that may add one Press Officer as a twenty-first role holder when it
is enabled; GM instances are also non-counting. These roster rules are distinct
from the 60-client browser capacity target.

## Current status

This is an active, staged work in progress rather than a claim of a complete
game or release-ready implementation. The
[implementation progress ledger](docs/IMPLEMENTATION_PROGRESS.md) is the source
of truth for completed, partial, and missing work, with named evidence for each
prompt. A passing local check or deployed build does not by itself establish
that the full gameplay roadmap or capacity target is complete.

Numbered prompt work is dependency-gated. Before selecting, assigning,
starting, or editing a prompt, agents must fully read the mandatory
[prompt dependency index](docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md), first, then run its
dispatcher, and reconcile the prompt row, hard prerequisites, evidence, and
coordination ownership with current `main`. The implementation plan is not
standalone; a prompt cannot be marked complete or merged while a hard
prerequisite remains unmet. Re-read the index after a rebase or material
movement of current `main`.

`NEXT` (the first item in `READY_QUEUE`) is the primary resume/default lane, but
it is advisory for concurrency, not a serial execution lock. A separate
worktree may claim a later `READY_QUEUE` item concurrently only when its hard
prompt prerequisites are done, every hard milestone, hard contract, and
decision-owner gate is satisfied or explicitly confirmed, and the coordination
forecast shows conflict-free ownership with no active claim overlap. A worktree
must not bypass an unmet dependency, active claim, or unresolved decision-owner
gate merely because the prompt is independent.

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

`HashRouter` is deliberate: deep links must work on a static host without
rewrite rules.

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

Use the [implementation plan](docs/IMPLEMENTATION_PLAN.md) for staged gameplay
work. The [documentation map](docs/README.md) identifies each guide's audience
and authority so live status, workflow policy, product contracts, and historical
handoffs are not mistaken for interchangeable sources. Shared vessel composition
belongs to the
[console architecture](docs/CONSOLE_ARCHITECTURE.md); the
[Capybara ship template](docs/SHIP_TEMPLATE.md) and
[SNN shuttle template](docs/SHUTTLE_TEMPLATE.md) define their respective
surfaces. The authoritative printed/source library is maintained privately
outside this repository. Do not commit, link, or reproduce that source material
in the public project.

The [preserved-in-amber rollback anchor](docs/PRESERVED_IN_AMBER.md) is an
immutable recovery ref for automated changes to `main`. It must not be deleted
or moved.

## Quick start

Use Node.js 22 and npm. The root package accepts Node.js 20 or newer, while the
Cloud Functions package targets Node.js 22. A normal browser-only session uses
the committed Firebase web configuration, which contains public identifiers;
no service-account credential is needed for local development.

```bash
npm ci
npm ci --prefix functions
npm run dev
```

For emulator-backed work, configure an isolated worktree slot first. The
[coordination quick reference](docs/WORKTREE_COORDINATION.md) has the commands;
the full slot matrix and safety rules live in
[CLAUDE.md](CLAUDE.md#concurrent-worktrees-and-emulator-ports).

## Validation

```bash
npm test            # unit and component tests
npm run test:rules  # Firestore rules through the emulator
npm run test:all    # both suites
```

For code changes, also run the repository lint and production builds:

```bash
npm run lint
npm run build
npm run build --prefix functions
```

Code changes follow the test-first and local validation gates in
[CLAUDE.md](CLAUDE.md). Documentation-only changes—where every changed tracked
file is Markdown or a README—use the lighter rendered-text, link, example, and
diff review described there (the executable gate is `npm run coordination:docs`);
they do not change application versioning or the player-facing changelog.

## Security model

Clients may read only entitled data and may write only their own presence
document. Claims, roles, secrets, random results, and other lie-sensitive game
mutations are denied by Firestore rules and resolved by callable Cloud
Functions inside transactions. The rules suite tests those denials.

## Emulator-backed development

Attach the task branch and register it from the checkout that will run the
emulators. The [coordination command reference](docs/WORKTREE_COORDINATION.md)
contains the exact begin, forecast, claim, validation, and finish commands;
[CLAUDE.md](CLAUDE.md#concurrent-worktrees-and-emulator-ports) owns the complete
port-safety and concurrent-worktree policy.

```bash
npm run emulators:configure -- auto
# In separate terminals:
npm run emulators
npm run dev:emulators
```

The setup command atomically selects and records one complete free Firebase/Vite
row and writes ignored local configuration. Use the generated row consistently;
never mix its ports with another worktree. Rules tests use the same configuration
and can choose a separate free row when a preview is already running. The
emulator suite requires Java; CI uses Java 21.

The Firebase web configuration contains public identifiers, not credentials.
Never commit a service-account key or App Check debug token. Production App
Check, capacity evidence, monitoring, and rollback guidance belong in the
[abuse-protection handoff](docs/ABUSE_PROTECTION_HANDOFF.md).

## Deployment

Before merging, agents record the required local checks with
`coordination:validate`; the main-branch workflow then runs its deployment
checks and deploys only affected Firebase surfaces. Product edits also update
the visible application version and player-facing changelog. Documentation-only
pushes do not trigger CI or deployment. A manually dispatched deployment runs
against all three configured Firebase surfaces.

For Workload Identity Federation setup and repository variables, see the
[deployment setup handoff](docs/ci-deploy-setup.md). Manual deployment uses:

```bash
npm run deploy
npm run deploy:hosting  # build and deploy Hosting only
```

`npm run deploy` runs `firebase deploy` for the project selected in
`.firebaserc`; it requires a Firebase CLI available as the `firebase` command
and an authenticated session for the selected project. The GitHub Actions
workflow instead uses short-lived Workload Identity Federation credentials and
does not store a service-account JSON key.

## License

This unofficial fan project is not currently offered under an open-source
license. See the [copyright and licensing notice](LICENSE.md) for the current
rights status and third-party-material boundary.

# Den of Wolves: New Eden — Unofficial Companion Console

An in-person companion console for running *Den of Wolves: New Eden* at the
table. It provides shared sessions, role and ship selection, GM controls, ship
and shuttle consoles, a live fleet display, and server-authoritative multiplayer
state backed by Firebase.

> Unofficial and unaffiliated. Fan project.

## Operating envelope

The target is one 20-player game with up to **60 concurrent browser clients**.
Players may use several devices, and many clients may share one table network.
This is the design envelope, not a claim of completed load testing. The
[capacity and abuse-protection handoff](docs/ABUSE_PROTECTION_HANDOFF.md) is the
source for that workstream.

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
work. Shared vessel composition belongs to the
[console architecture](docs/CONSOLE_ARCHITECTURE.md); the
[Capybara ship template](docs/SHIP_TEMPLATE.md) and
[SNN shuttle template](docs/SHUTTLE_TEMPLATE.md) define their respective
surfaces. Do not treat the documents under `docs/reference/` as editable design
guidance: they are the source library for game rules.

## Quick start

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

Code changes follow the test-first and local validation gates in
[CLAUDE.md](CLAUDE.md). Documentation-only changes—where every changed tracked
file is Markdown or a README—use the lighter rendered-text, link, example, and
diff review described there; they do not change application versioning or the
player-facing changelog.

## Security model

Clients may read only entitled data and may write only their own presence
document. Claims, roles, secrets, random results, and other lie-sensitive game
mutations are denied by Firestore rules and resolved by callable Cloud
Functions inside transactions. The rules suite tests those denials.

The Firebase web configuration contains public identifiers, not credentials.
Never commit a service-account key or App Check debug token. Production App
Check, capacity evidence, monitoring, and rollback guidance belong in the
[abuse-protection handoff](docs/ABUSE_PROTECTION_HANDOFF.md).

## Deployment

Non-documentation pushes to `main` run the required local/CI gates and deploy
only affected Firebase surfaces. Product edits also update the visible
application version and player-facing changelog. Documentation-only pushes do
not deploy.

For Workload Identity Federation setup and repository variables, see the
[deployment setup handoff](docs/ci-deploy-setup.md). Manual deployment uses:

```bash
npm run deploy
```

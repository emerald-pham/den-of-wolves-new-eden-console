# Den of Wolves: New Eden — Unofficial Companion Console

A companion console for running *Den of Wolves: New Eden* at the table. It
provides shared sessions, role and ship selection, GM controls, ship and
shuttle consoles, a live fleet display, and server-authoritative multiplayer
state backed by Firebase.

> Unofficial and unaffiliated. Fan project.

## Contents

- [Stack](#stack)
- [Layout](#layout)
- [Security model](#security-model)
- [Local development](#local-development)
- [Tests](#tests)
- [Deploying](#deploying)

## Stack

| Layer | Choice |
|---|---|
| Build | Vite 6 |
| Language | TypeScript, `strict` (plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| UI | React 18 |
| Local state | Zustand |
| Shared state | Firestore Web SDK v12 modular, with live snapshots and persisted Zustand recovery |
| Server logic | Cloud Functions for Firebase, 2nd gen, Node 22 |
| Routing | React Router, `HashRouter` |
| Tests | Vitest + React Testing Library + `@firebase/rules-unit-testing` |
| Deploy | GitHub Actions → Firebase Hosting |

`HashRouter` is used so deep links survive on any static host with no rewrite
rules — that covers GitHub Pages as well as the Firebase Hosting setup here.

## Layout

```
src/
  components/             shared controls and DRADIS instruments
  data/                   fleet, role and shuttle definitions
  lib/firebase.ts         lazy Firebase app/auth/functions initialization
  lib/firestore.ts        lazy Firestore subscriptions
  lib/firebaseConfig.ts   public web config + emulator switch
  store/                  Zustand — local view state and server snapshots
  routes/                 route components and colocated tests
  types/game.ts           shared game and session data shapes
functions/src/            callable functions and server policy helpers
firestore.rules           read model + "clients cannot write what they'd lie about"
tests/rules/              security-rule assertions against the emulator
```

Design references live in [`docs/AESTHETICS.md`](docs/AESTHETICS.md), and
future gameplay interpretation is supported by the
[`reference library`](docs/reference/README.md). Use the
[`Capybara ship template`](docs/SHIP_TEMPLATE.md) for capital-ship consoles and
the [`SNN shuttle template`](docs/SHUTTLE_TEMPLATE.md) for shuttlecraft.

## Security model

Firestore rules let a client **read** what it is entitled to see and **write
only its own presence document** (and only its display name after that).
Everything a player could gain by lying about — claiming a seat, becoming GM,
generating a secret or a random result — is denied at the rules layer and
implemented as a callable Cloud Function running with admin privileges inside a
transaction. `tests/rules/firestore.rules.test.ts` asserts each of those denials.

The Firebase web config in `src/lib/firebaseConfig.ts` is a set of **public
identifiers**, not credentials; it ships in every client bundle by design. No
service-account key belongs anywhere in this repo — CI uses short-lived
Workload Identity Federation credentials.

## Local development

```bash
npm ci
npm ci --prefix functions

npm run dev            # Vite dev server on :5173
npm run emulators      # Auth, Firestore, Functions, Hosting emulators
```

Set `VITE_USE_EMULATORS=1` in `.env.local` to point the app at the emulators.

## Tests

```bash
npm test            # unit + component (jsdom)
npm run test:rules  # security rules, wrapped in the Firestore emulator
npm run test:all
```

`npm run test:rules` needs a JDK on PATH (the Firestore emulator is a Java
process).

Documentation-only changes—where every changed file is Markdown or a README—do
not require local tests, lint, builds, dependency installation, or an
application version bump. Review the rendered documentation, links, examples,
and diff instead. GitHub Actions also skips CI and deployment for such changes.
See [`CLAUDE.md`](CLAUDE.md) for the exact boundary and contributor rules.

## Deploying

Non-documentation pushes to `main` run lint, unit tests, rule tests and both
builds, then deploy only the affected Firebase surfaces. Completed product edits
change the visible application version and therefore deploy Hosting. Firestore
rules and Cloud Functions deploy only when their files or shared Firebase
configuration changed. A manually dispatched deployment deploys all surfaces.
Documentation-only pushes do not start the workflow.

Auth is **Workload Identity Federation** — GitHub mints a short-lived Google
credential per run, so no service-account key exists to leak, rotate or commit.

Repository **variables** (Settings → Secrets and variables → Actions → Variables).
None of these are secrets:

- `FIREBASE_PROJECT_ID` — `dow-new-eden-console`
- `GCP_WORKLOAD_IDENTITY_PROVIDER` —
  `projects/<project-number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`
- `GCP_SERVICE_ACCOUNT` — the deploy service account's email

The service account needs *Firebase Hosting Admin*, *Cloud Datastore Owner*
(for rules) and *Cloud Functions Admin*, plus *Service Account User* on itself,
and the pool's principal must be restricted to this repository.

Manual deploy:

```bash
npm run deploy
```

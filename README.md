# Den of Wolves: New Eden — Unofficial Companion Console

A companion console for running *Den of Wolves: New Eden* at the table. This
repository is the scaffold: the whole stack is wired, tested and deploying, and
the landing page deliberately shows nothing but the project name.

> Unofficial and unaffiliated. Fan project.

## Stack

| Layer | Choice |
|---|---|
| Build | Vite 5 |
| Language | TypeScript, `strict` (plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| UI | React 18 |
| Local state | Zustand |
| Shared state | Firestore, Web SDK v10 modular, offline persistence on |
| Server logic | Cloud Functions for Firebase, 2nd gen, Node 22 |
| Routing | React Router, `HashRouter` |
| Tests | Vitest + React Testing Library + `@firebase/rules-unit-testing` |
| Deploy | GitHub Actions → Firebase Hosting |

`HashRouter` is used so deep links survive on any static host with no rewrite
rules — that covers GitHub Pages as well as the Firebase Hosting setup here.

## Layout

```
src/
  lib/firebase.ts         lazy Firebase singletons (nothing runs at import time)
  lib/firebaseConfig.ts   public web config + emulator switch
  store/                  Zustand — local view state only
  routes/                 route components
  types/game.ts           session / seat / player / secret shapes
functions/src/index.ts    callable functions: seat claims, GM elevation, dice
firestore.rules           read model + "clients cannot write what they'd lie about"
tests/rules/              security-rule assertions against the emulator
```

## Security model

Firestore rules let a client **read** what it is entitled to see and **write
only its own presence document** (and only its display name after that).
Everything a player could gain by lying about — claiming a seat, becoming GM,
generating a secret or a random result — is denied at the rules layer and
implemented as a callable Cloud Function running with admin privileges inside a
transaction. `tests/rules/firestore.rules.test.ts` asserts each of those denials.

The Firebase web config in `src/lib/firebaseConfig.ts` is a set of **public
identifiers**, not credentials; it ships in every client bundle by design. No
service-account key belongs anywhere in this repo — CI reads one from the
`FIREBASE_SERVICE_ACCOUNT` GitHub secret at deploy time.

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

## Deploying

Pushes to `main` run lint, unit tests, rule tests and the build, then deploy
hosting, Firestore rules and functions.

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

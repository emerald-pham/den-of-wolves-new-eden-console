# CLAUDE.md

Working agreement for this repository. Applies to every agent and contributor.
`AGENTS.md` exists only to point here.

## The two rules

### 1. Test first, always

Order of operations for *any* code change — a new function, a component, a
callable function, a bug fix, a refactor, a one-line change:

1. Write the test.
2. **Run it and watch it fail.** A test that has never failed has proven
   nothing. If it passes before you write the code, the test is wrong.
3. Write the minimum implementation to make it pass.
4. Run the suite. Refactor with the suite green.

There is no size threshold below which this is skipped. "Too small to test" is
how the ~40 interlocking game tables acquire silent transcription errors.

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

### 2. Merge once done

- Branch from `main`. Short-lived, one concern per branch.
- A branch lands on `main` **as soon as it is green and complete**. Not at the
  end of the week, not once three other things are also finished.
- Green means: `npm run lint`, `npm run test:all`, `npm run build`, and
  `npm run build --prefix functions` all pass locally, and CI passes.
- Do not stack unfinished work. Do not leave a branch open "for later." If it is
  not going to land, delete it.
- Never force-push `main`. Never commit directly to `main` for anything that
  changes behavior.
- Push to `main` deploys. Treat every merge as a release.

Commit messages: imperative subject under 72 characters, and a body that says
*why* when the why is not obvious. Reference the behavior, not the file list.

## Stack, and what not to swap

Vite 5 · TypeScript strict · React 18 · Zustand · Firestore Web SDK v10 modular
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
never appear under `src/`, and never be pasted into a config file. CI reads one
from the `FIREBASE_SERVICE_ACCOUNT` secret at deploy time.

## State

- **Zustand** holds local, per-browser view state only.
- **Firestore** holds authoritative shared state.
- A component should never have to work out which is which. Snapshots land in
  the store; mutations go out through callables.

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

- [ ] A test was written first and observed failing.
- [ ] `npm run lint` clean.
- [ ] `npm run test:all` green.
- [ ] `npm run build` and `npm run build --prefix functions` succeed.
- [ ] No new client write path to server-authoritative data.
- [ ] No secret, key or service-account JSON added to the repo.
- [ ] Branch merged to `main`, deleted, and **pushed to origin** (pushing deploys).
- [ ] Pushed immediately; do not leave commits sitting locally waiting for a separate push.

## Aesthetic profiles and responsive UI

Before changing UI, read [docs/AESTHETICS.md](docs/AESTHETICS.md). It stores the
reusable CIC and interrupted-transmission profiles. Use the shared tokens in
src/styles/cic.css and existing patterns to keep the entire website consistent.

Every screen must work across mobile, laptop, and desktop, in landscape and
portrait, including screen rotation while open. Use responsive layout, safe-area
padding, accessible controls, and scrolling on short screens. Verify narrow,
wide, and short landscape viewports. Honor reduced motion and preserve access
to underlying controls during decorative effects.

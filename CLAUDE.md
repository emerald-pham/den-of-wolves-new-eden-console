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

## Concurrent worktrees and emulator ports

Assume several local worktrees are active at the same time. Never start
`firebase emulators:start`, `firebase emulators:exec`, `npm run emulators`,
`npm run test:rules`, or `npm run test:all` in a worktree until that worktree has
its own complete emulator port set. The defaults in `firebase.json` belong to
only one worktree at a time; do not let Firebase silently reuse or kill another
agent's emulator processes.

Coordinate a free slot with the other active agents and announce the slot in
the task before starting emulators. Use one row as a unit—do not mix ports from
different rows:

| Slot | Auth | Functions | Firestore | Hosting | UI | Hub | Logging |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 9099 | 5001 | 8080 | 5000 | 4000 | 4400 | 4500 |
| 1 | 9109 | 5011 | 8090 | 5010 | 4010 | 4410 | 4510 |
| 2 | 9119 | 5021 | 8100 | 5020 | 4020 | 4420 | 4520 |
| 3 | 9129 | 5031 | 8110 | 5030 | 4030 | 4430 | 4530 |
| 4 | 9139 | 5041 | 8120 | 5040 | 4040 | 4440 | 4540 |
| 5 | 9149 | 5051 | 8130 | 5050 | 4050 | 4450 | 4550 |

Before claiming a row, verify every port in it is free with
`lsof -nP -iTCP:<port> -sTCP:LISTEN`. Put the chosen values for auth,
Functions, Firestore, Hosting, Emulator UI, Hub, and Logging in a
worktree-local Firebase config, and pass it explicitly with `--config` to both
`firebase emulators:start` and `firebase emulators:exec`. Do not commit a
developer's port-only config. When a task ends, stop its emulators so the slot
becomes available. If all rows are occupied, add another row by continuing the
same +10 offset; never take a port that is already listening.

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

## Version references

- Increment the application version with every completed edit so deployed progress has a stable reference.
- The application version must never decrease. A later build must always compare newer than every earlier build.
- Major system additions may increment the middle number, but only when they represent a meaningful milestone in overall release readiness. Do not mechanically advance toward release for every subsystem.
- Smaller additions, fixes, and refinements increment the final number (for example, `0.1.12` to `0.1.13`). The final number may exceed 9.
- Agents may advance through `0.8.x` only with extremely conservative judgment tied to genuine whole-game maturity.
- Only the product owner may authorize `0.9.x`; it is reserved for builds genuinely close to release readiness.
- Only the product owner may authorize `1.0.0`. It requires the complete 20-player set with full, complex gameplay: players must move through multiple interacting systems, the game works end to end, they complete a coherent gameplay loop, and reach a clear, implemented game end. Twenty selectable roles, placeholder screens, isolated mechanics, or shallow role stubs do not qualify.
- Keep `package.json`, the root entry in `package-lock.json`, and `src/version.ts` synchronized.
- Show the version in the in-app settings dialog.
- After every successful merge and every successful push, state the exact version in the user-facing chat.

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
  Shared session, player, seat, and GM-instance views use live snapshots so a
  reconnect replaces cached state with server authority.
- GM and Console are **device modes**, not freely selectable Firestore roles.
  Only a player whose server record already has role `gm` may enter GM mode.
  Console is available to any session member. Do not re-add Observer until its
  server semantics and UI are implemented.
- Disconnect is locally idempotent and server-aware: queue or send the presence
  update, clear the persisted session, player, seats, GM instance, mode, and
  route, then replace navigation with `/`. Preserve a queued disconnect long
  enough to replay it. An empty session gets a renewable seven-day retention
  deadline; reconnecting cancels it.
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

- [ ] A test was written first and observed failing.
- [ ] `npm run lint` clean.
- [ ] `npm run test:all` green.
- [ ] `npm run build` and `npm run build --prefix functions` succeed.
- [ ] No new client write path to server-authoritative data.
- [ ] No secret, key or service-account JSON added to the repo.
- [ ] Every affected screen has a visible, tested route back to its logical parent.
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

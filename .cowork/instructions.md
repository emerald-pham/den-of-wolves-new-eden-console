# Cowork Instructions

This file tells Claude how to work effectively on this project when invoked as part of a Cowork session.

## Contents

- [The two rules](#the-two-rules-non-negotiable)
- [When you're stuck](#when-youre-stuck)
- [How to invoke me](#how-to-invoke-me-for-this-project)
- [CI/CD and deployment](#cicd-and-deployment)
- [Stack](#stack-dont-swap-these)
- [Files worth knowing](#files-worth-knowing)
- [Browser preference](#browser-preference)
- [Communication](#communication)

## The two rules (non-negotiable)

Every code change, no matter how small, follows test-first:

1. Write the test first. Watch it fail.
2. Write the minimum implementation to make it pass.
3. Run the full suite and refactor with it green.

Never skip this for "small" changes — that's how bugs hide.

Documentation-only changes are exempt from tests, builds, dependency
installation, and version bumps. Follow `CLAUDE.md` for the exact file boundary
and review requirements.

Session state is authoritative in Firestore and mutated through Cloud Functions, never directly from the client. Any write a player could benefit from lying about (`seats`, `role`, `secrets`, `events`) is denied in the rules and implemented as a callable running with admin privileges inside a transaction. The client may only write its own presence document (`players/{uid}`).

## When you're stuck

1. **Type checking fails?** Don't reach for `any` or `@ts-expect-error`. Fix the type. The project runs `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` — they exist for good reasons.

2. **A test won't pass?** Don't delete it. Understand why. A test that passes before the code exists is broken.

3. **Build is slow?** Use `npm run build` locally first, but do not treat a web
   build alone as the merge gate. Run every applicable local check in
   `CLAUDE.md`; this repository does not rely on agent access to GitHub Actions.

4. **Not sure how to test something?** Look at existing tests first — the harness is Vitest + React Testing Library, querying by role/text, never by class or test id.

## How to invoke me for this project

### New feature or bug fix

```
Claude, implement [feature]. Test-first: write the test plan first and confirm it with me before touching implementation.
```

I will:
- List the cases the tests will cover
- Wait for your approval
- Write tests, run them red, implement, verify green
- Commit on a feature branch
- Ask before merging to `main`

### Landing page or UI tweaks

```
Claude, update the landing page to [requirement]. Start in the built-in browser so I can see it working before you commit.
```

I will:
- Make changes locally
- Verify in the browser pane
- Run full suite
- Commit only when green

### Security model or rules changes

```
Claude, [change to rules/functions]. Include the denials test in the rules suite.
```

I will:
- Add rules tests that verify the denial exists
- Temporarily break the rule to prove the test fails
- Restore the rule and verify the test passes
- Implement or change the function
- Commit with the test coverage

### Debugging or diagnosis

```
Claude, why is [thing] happening?
```

I will:
- Not assume — I'll look at the actual error, logs, or code
- Show you what I found
- Suggest a fix or ask clarifying questions
- Never silently "fix" without your approval on anything architectural

## CI/CD and deployment

- `main` is always deployable — every commit to `main` should be ready to ship.
- Merge is only after: `npm run lint`, `npm run test:all`, `npm run build`, `npm run build --prefix functions` all pass locally.
- A non-documentation push to `main` triggers the GitHub Actions deploy via
  Workload Identity Federation. Documentation-only pushes are skipped.
- Do not wait on GitHub Actions visibility; applicable local validation is the
  actionable merge gate.
- Manual deploys: `firebase deploy --project dow-new-eden-console --only hosting,firestore,functions --non-interactive`.

## Stack (don't swap these)

- Vite 6, TypeScript strict, React 18
- Zustand for local view state, Firestore for authoritative state
- Cloud Functions 2nd gen (Node 22)
- Vitest + RTL for tests
- HashRouter (must not become BrowserRouter — deep links need to work on static hosts)
- Firebase Hosting

## Files worth knowing

- `CLAUDE.md` — the working agreement (this overrides defaults)
- `firestore.rules` — the security model (read it if you're touching client writes)
- `functions/src/index.ts` — all callables (if a client can benefit by lying, it lives here)
- `src/store/useSessionStore.ts` — the truth about local state vs. server state
- `src/lib/sessionService.ts` — the Firebase seam (auth, sign-in, function calls)

## Browser preference

Use Chrome (the Claude in Chrome extension) when you need a browser. The built-in pane is fine for quick verification but doesn't hold logged-in sessions. If the Chrome extension isn't connected, I'll work around it or ask you to install it.

## Communication

- I will show you test output (red then green) when TDD is involved.
- I will show you diffs before committing, not after.
- I will merge and push completed, validated work promptly, as required by
  `CLAUDE.md`.
- I will tell you honestly if something is out of scope or needs rethinking.

## If something feels off

Tell me. The instructions here are working agreements, not laws. If I'm following the letter and missing the spirit, say so.

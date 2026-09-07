# Cowork instructions

This file contains only Cowork-specific preferences for this project. Read
[`CLAUDE.md`](../CLAUDE.md) first; it is the canonical source for repository
workflow, testing, security, deployment, versioning, and merge rules.

## When you're stuck

- Fix strict TypeScript errors instead of using `any` or
  `@ts-expect-error`.
- Keep failing tests and understand the cause; do not delete a test to make a
  run pass.
- Use existing Vitest and React Testing Library patterns, querying by role or
  text rather than classes or test IDs.
- Apply the validation and timeout guidance in `CLAUDE.md` when a build or
  test is slow.

## How to invoke Claude for this project

### New feature or bug fix

```
Claude, implement [feature]. Start test-first and show the red test before
touching implementation.
```

### Landing page or UI tweak

```
Claude, update the landing page to [requirement]. Start in the built-in browser
so I can see it working before you commit.
```

### Security model or rules change

```
Claude, [change to rules/functions]. Include the denial in the rules suite.
```

### Debugging or diagnosis

```
Claude, why is [thing] happening?
```

Diagnose from the actual code, errors, or logs. Do not silently make an
architectural fix without approval.

## Browser preference

Use Chrome through the Claude in Chrome extension when browser verification
needs a persistent session. The built-in pane is fine for quick checks; if
Chrome is unavailable, use the available local workflow or explain the gap.

## Communication

Show relevant red/green test output and the diff before committing. Merge and
push completed, validated work promptly when the repository policy allows it,
and call out anything that is out of scope or needs rethinking.

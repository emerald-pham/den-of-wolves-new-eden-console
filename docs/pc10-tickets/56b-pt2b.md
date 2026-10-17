# PT2B: Resolve the Capybara population-alert binding

**Existing prompt scope:** P584; P642; P651.

**Playable release:** [PC10.2 — Wing, PDF and expansion actions](../PRODUCT_MILESTONES.md#pc10-smaller-playable-releases--2026-10-16).

**Status:** ready-for-agent for planning; execution follows the owning checkpoint and current authorization.

## What to build

The Capybara proof can match and acknowledge the population alert offered to its original GM before continuing the same game.

## Acceptance criteria

- [ ] Preserve failed attempt 7 at 75ff4b8b: a visible alert matched zero current source alerts for the original GM; its exact cause remains unproved.
- [ ] Inspect the actual alert, GM identity, vessel, cycle and revision binding; reproduce the discovered mismatch with a meaningful failing consumer test before changing code.
- [ ] Repair only the proved consumer defect, retaining exact actor/source/request checks and ordinary acknowledgement; delayed projection, foreign GM, wrong vessel/cycle and stale-alert cases cannot gain credit.
- [ ] Pass the affected Capybara and alert consumers and the current preflight before any fresh native allocation. Opening-combat prefixes remain accepted only within their original scope; no Nebula or ending is inferred.

## Blocked by

None (can start immediately). Preserve the existing Sol implementation ownership.

## Testing and handoff boundary

A source/mounted fixture isolates the actual failure first. The existing Sol owner retains the bounded diagnosis; this brief neither restarts a worker nor allocates a runtime.

One fresh implementation context owns this bounded behavior through repair, focused verification and handoff. Broader defects return as bounded findings. Preserve meaningful observed RED, separate test-first commits, original evidence and required review.

This is an execution subdivision of existing scope. Only the prompt catalog records completion; all owning-prompt acceptance still applies.

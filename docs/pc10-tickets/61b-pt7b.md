# PT7B: Import and verify the existing tracker records

**Existing prompt scope:** P651.

**Playable release:** [PC10.9 — Final game release and tracker handoff](../PRODUCT_MILESTONES.md#pc10-smaller-playable-releases--2026-10-16).

**Status:** ready-for-agent for planning; execution follows the owning checkpoint and current authorization.

## What to build

The agreed campaign records can be imported once, retried safely and reconciled completely before authority changes.

## Acceptance criteria

- [ ] Use the PT7A mapping to import approved records in dependency order with supported native parent/blocking relations or explicit equivalent edges.
- [ ] Prove idempotent retry, interruption and resume without duplicate issues or changes to unrelated issues.
- [ ] Verify every source ID, status, dependency, parent and evidence link against a settled source snapshot; preserve the mapping/export and report any mismatch.
- [ ] Return the verified import for PT7. A partial import leaves the existing tracker authoritative and grants no catalog closure.

## Blocked by

[PT7A: Prepare a reversible tracker inventory](61a-pt7a.md).

## Testing and handoff boundary

Exercise the real import/export seam with a bounded fixture first. Actual authorized tracker migration is future work; this planning update creates no GitHub issues.

One fresh implementation context owns this bounded behavior through repair, focused verification and handoff. Broader defects return as bounded findings. Preserve meaningful observed RED, separate test-first commits, original evidence and required review.

This is an execution subdivision of existing scope. Only the prompt catalog records completion; all owning-prompt acceptance still applies.

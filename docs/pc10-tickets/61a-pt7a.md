# PT7A: Prepare a reversible tracker inventory

**Existing prompt scope:** P651.

**Playable release:** [PC10.9 — Final game release and tracker handoff](../PRODUCT_MILESTONES.md#pc10-smaller-playable-releases--2026-10-16).

**Status:** ready-for-agent for planning; execution follows the owning checkpoint and current authorization.

## What to build

The owner can inspect a lossless mapping of the current campaign and execution briefs before any GitHub tracker writes.

## Acceptance criteria

- [ ] Inventory all 751 explicit prompt IDs and all current approved execution briefs, including retained completed work and the new subdivisions; preserve parent links, dependencies, evidence classes and release history.
- [ ] Define the domain-ID to issue-number mapping and missing/partial/done representation without confusing readiness with completion.
- [ ] Use a small representative round-trip fixture with completed, partial, blocked and split records; observe import/export RED then GREEN and retain a recoverable export.
- [ ] Publish the inventory and recovery plan for PT7B. The existing catalog remains the sole writable authority; no real issue is created by this preparation.

## Blocked by

None (can start immediately).

## Testing and handoff boundary

Use current tracker readers and a disposable fixture. Inventory preparation has no runtime, gameplay or completion credit.

One fresh implementation context owns this bounded behavior through repair, focused verification and handoff. Broader defects return as bounded findings. Preserve meaningful observed RED, separate test-first commits, original evidence and required review.

This is an execution subdivision of existing scope. Only the prompt catalog records completion; all owning-prompt acceptance still applies.

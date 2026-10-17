# OFF6: Resolve concurrent local actions once

**Existing future scope:** Conditional same-repository Mac offline LAN backup.

**Checkpoint:** [PC12.2](../PRODUCT_MILESTONES.md#future-work-uses-the-same-small-release-shape).

**Status:** conditional planning only; no implementation activation.

## What to build

Competing local requests produce one legal state transition and exact retries recover the original result.

## Acceptance criteria

- [ ] Use the actual local action/storage transaction boundary with two clients, changed revisions and original/foreign request identities. Prove no duplicate cost, random draw or private receipt leakage.
- [ ] Preserve accepted work, original scope and source-bound proof. A changed functional path has meaningful observed RED before implementation, then GREEN; use the smallest legitimate native/consumer cohort for the changed claim.
- [ ] Return the exact source, focused results, actual remaining gaps and owned-resource state; no fixture or planning record supplies native or deployment credit.

## Blocked by

- [OFF3](off3-commit-one-authoritative-local-action.md)

## Fresh-context and release boundary

One owner takes this complete bounded outcome through focused repair, checks and handoff in one fresh context. Start from current source and the exact predecessor handoff, not the entire historical campaign. A larger concrete discovery is split before implementation.

The owning product checkpoint has an independently playable release with the existing relevant risk review, built typography, CI and deployment/packaging verification. This brief creates no new campaign prompt or completion state, gameplay runtime allocation, restricted version approval or later-phase activation. Review-only work may retain the current behavior without inventing a release.

# PC06 execution record

This record tracks the concrete implementation groups, isolated checkout
ownership, shared integration boundary, and session-specific dispatch findings
for the fixed PC06 scope. It does not change the 49 assigned prompt IDs or
their acceptance criteria.

## Owner and implementation groups

The accountable checkpoint owner is `/root/pc06_release_owner` in
`/Users/emeraldpham/.codex/worktrees/0ce4/den-of-wolves-new-eden-console`,
branch `feat/pc06-execution`. The owner integrates every group, maintains the
49-prompt acceptance ledger, resolves shared contracts, obtains the required
independent review, and owns the single release.

The first two groups start from commit `1b33ab3c`; the third group and the
owner start from `8b7cd66c`, which adds this execution record's dispatch
fallback correction. Every group uses an attached, separate branch. Workers
keep the listed parked worktrees intact and may inspect them read-only. They
commit only in their assigned checkout and send exact interface needs to the
owner rather than editing shared release seams.

| Group | Assigned prompts | Checkout and branch | Owned files and integration boundary |
|---|---|---|---|
| Vessel operations, Luna Max task `/root/pc06_release_owner/pc06_vessel_ops` | 238, 244, 241c, 251, 250, 352, 371, 380, 385, 378 | `/Users/emeraldpham/.codex/worktrees/pc06-vessel-ops/den-of-wolves-new-eden-console`, `feat/pc06-vessel-ops`, start `1b33ab3c` | Vessel, repair, cargo, shuttle/transit, conflict, security-team, and dismantling leaf modules with their tests, services, components, and vessel data. The owner owns callable exports, shared session/schema/rules, and release metadata. |
| Away-mission lifecycle, Luna Max task `/root/pc06_release_owner/pc06_away_mission` | 241b, 392, 393, 404, 405, 407, 408, 409, 410, 411, 412, 413, 243, 414, 415, 622, 422, 646 | `/Users/emeraldpham/.codex/worktrees/pc06-away-missions/den-of-wolves-new-eden-console`, `feat/pc06-away-missions`, start `1b33ab3c` | Private card lifecycle, contribution-linked outcomes, custody, overrun, drop-off, recovery, and scenario leaf modules with focused tests and UI. The owner retains `functions/src/missionStart.ts` and `functions/src/explorationRewards.ts` while reconciling the parked P401 and P334 work. |
| Split-fleet messages, pursuit, and scout receipts, Luna Max task `/root/pc06_release_owner/pc06_split_scout` | 151, 307, 322, 323, 324 | `/Users/emeraldpham/.codex/worktrees/pc06-split-scout/den-of-wolves-new-eden-console`, `feat/pc06-split-scout`, start `8b7cd66c` | Group communication/pursuit and Starlight/Hummingbird scout leaf modules, focused tests, services, and controls. The owner owns callable exports, shared session/schema/rules, and release metadata. Preserve the parked P321 and P330 worktrees. |
| Jump, mission admission/rewards, P112 decision, checkpoint integration and release, checkpoint owner | 202, 210, 222, 232, 236, 241a, 259, 320, 607, 679, 020a, 112, 401, 237, 334, 335 | `/Users/emeraldpham/.codex/worktrees/0ce4/den-of-wolves-new-eden-console`, `feat/pc06-execution`, start `8b7cd66c` | Jump authority and UI, demo boundary, mission admission and special rewards, P112 inventory/consent decision, shared entrypoints/schema/rules, integration and release files. |

The owner reserves `functions/src/index.ts`, `src/types/game.ts`,
`src/lib/firestore.ts`, `src/store/useSessionStore.ts`,
`tests/rules/firestore.rules.test.ts`, `docs/implementation-prompts.json`,
`docs/IMPLEMENTATION_PROGRESS.md`, `package.json`, `package-lock.json`,
`src/changelog.ts`, and the final PC06 reports for integration. Workers may
propose contracts or export names for those files, but leave those edits to the
owner. Each group must keep test-first behavior commits separate from the
production change that turns its focused test green.

## Preserved work and open decisions

Related parked branches remain preserved, including P112 at `52cf751b`, P241c
at `c64741b8`, P371 at `a6ce01b3`, P380 at `2e413cfb`, P385 at `105f486e`, P401
at `6c8c4a91`, and P334 at `6643f7d4`. The owner and workers inspect those
checkouts before replacing any integration and do not reset, delete, or release
their coordination records.

The owner will resolve P112 only if the printed source, accepted catalog, and
standing authorization support a defensible digital inventory and bilateral
consent contract. No ship-resource ledger may be relabeled as player inventory.
P112 remains open if that contract cannot be supported. P401, P237, P334, and
P335 remain owner-owned while their mission-admission and reward boundaries
are reconciled.

## Session-specific dispatch and live-access findings

On 2026-09-30, nested `collaboration.spawn_agent` calls created the real Luna
Max tasks `/root/pc06_release_owner/pc06_vessel_ops`,
`/root/pc06_release_owner/pc06_away_mission`, and
`/root/pc06_release_owner/pc06_split_scout` in separate managed worktrees. The
first two dispatches filled the four active task slots; after the root task
completed, one freed slot allowed the third independent group to start. This
records observed capacity for this session and does not establish a permanent
host-wide concurrency limit.

If nested dispatch is unavailable while a slot is free, send these same bounded
prompt groups and exact checkout/branch identities to `/root` for direct
dispatch. If all session slots are occupied, queue the next group until a real
worker completes and frees a slot; a different dispatcher cannot remove that
capacity limit. Reserve or release a slot for independent Sol review at the
review boundary. The checkpoint owner remains accountable for integration and
release in either case.

The early live-access probe reached the production console at
`dow-new-eden-console.web.app/#/console`, then stopped at its first-use motion
choice. The page says the device choice is stored for 24 hours. The applicable
computer-use policy requires authorization immediately before changing an
application setting when the user has not selected it, so neither option was
chosen. Ordinary authorized gameplay proof remains open until that choice is
provided or a previously authorized production session is available.

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

The vessel and away-mission worker groups started from commit `1b33ab3c` on
attached, separate branches. The scout-request UI group starts from owner
candidate `6df5f4fe` on its own attached branch. The owner continues on
`feat/pc06-execution`. Workers keep the listed parked worktrees intact and may
inspect them read-only. They commit only in their assigned checkout and send
exact interface needs to the owner rather than editing shared release seams.

| Group | Assigned prompts | Checkout and branch | Owned files and integration boundary |
|---|---|---|---|
| Vessel operations, Luna Max task `/root/pc06_release_owner/pc06_vessel_ops` | 238, 244, 241c, 251, 250, 352, 371, 380, 385, 378 | `/Users/emeraldpham/.codex/worktrees/pc06-vessel-ops/den-of-wolves-new-eden-console`, `feat/pc06-vessel-ops`, start `1b33ab3c` | Vessel, repair, cargo, shuttle/transit, conflict, security-team, and dismantling leaf modules with their tests, services, components, and vessel data. The owner owns callable exports, shared session/schema/rules, and release metadata. |
| Away-mission lifecycle, Luna Max task `/root/pc06_release_owner/pc06_away_mission` | 241b, 392, 393, 404, 405, 407, 408, 409, 410, 411, 412, 413, 243, 414, 415, 622, 422, 646 | `/Users/emeraldpham/.codex/worktrees/pc06-away-missions/den-of-wolves-new-eden-console`, `feat/pc06-away-missions`, start `1b33ab3c` | Private card lifecycle, contribution-linked outcomes, custody, overrun, drop-off, recovery, and scenario leaf modules with focused tests and UI. The owner retains `functions/src/missionStart.ts` and `functions/src/explorationRewards.ts` while reconciling the parked P401 and P334 work. |
| Scout-request guidance UI, Luna Max task `/root/pc06_release_owner/pc06_scout_requests` | 322, 323, 324 (player-facing slice) | `/Users/emeraldpham/.codex/worktrees/pc06-split-scout/den-of-wolves-new-eden-console`, `feat/pc06-split-scout`, start `6df5f4fe` | `src/components/ScoutRequestControls.tsx`, `.css`, and `.test.tsx`. Explain printed-chart distance/cadence for Starlight and Hummingbird while preserving server-owned authorization, stable retry, and privacy. UI work alone does not close these prompts. |
| Demo boundary policy and notice leaf, Luna Max task `/root/pc06_release_owner/pc06_demo_boundary` | 020a (leaf slice) | `/Users/emeraldpham/.codex/worktrees/pc06-demo-boundary/den-of-wolves-new-eden-console`, `feat/pc06-demo-boundary`, start `b62ea1ec` | `functions/src/singlePlayerDemoPolicy.ts` and its tests, plus the isolated accessible demo notice component and tests. Leaf complete at `13bd51aa`; owner integrates the policy at shared server/jump entrypoints and owns end-to-end acceptance. Test-first commit: `8f6205fc`. |
| Keyboard-complete jump controls, Luna Max task `/root/pc06_release_owner/pc06_jump_keyboard` | 607 | `/Users/emeraldpham/.codex/worktrees/pc06-jump-keyboard/den-of-wolves-new-eden-console`, `feat/pc06-jump-keyboard`, start `bab721ff` | `src/components/JumpDriveConsole.tsx` and its focused tests. After `pc06_trade_ui` completed, this queued group was dispatched into the prepared checkout. Owner retains jump authority and final prompt acceptance. |
| Same-table trade UI leaf, Luna Max task `/root/pc06_release_owner/pc06_trade_ui` | 112 (player-facing leaf) | `/Users/emeraldpham/.codex/worktrees/pc06-trade-ui/den-of-wolves-new-eden-console`, `feat/pc06-trade-ui`, start `be6a6f59` | `src/components/SameTableTradePanel.tsx`, `.css`, and `.test.tsx`; present facilitator-attested holdings and exact offer/accept controls through props/callbacks only. Owner retains authenticated service/session integration and prompt acceptance. Test-first commit: `b4b68b55`. |
| Same-table trade domain-policy leaf, Luna Max task `/root/pc06_release_owner/pc06_trade_policy` | 112 (pure domain leaf) | `/Users/emeraldpham/.codex/worktrees/pc06-trade-policy/den-of-wolves-new-eden-console`, `feat/pc06-trade-policy`, start `be6a6f59` | `functions/src/sameTableTradePolicy.ts` and its focused tests. The owner retains callable exports, authenticated per-player state, shared schema/rules, and prompt acceptance. |
| Voyage 33-0 movement UI leaf, Luna Max task `/root/pc06_release_owner/pc06_voyage33_ui` | 251 (player-facing leaf) | `/Users/emeraldpham/.codex/worktrees/pc06-voyage-movement/den-of-wolves-new-eden-console`, `feat/pc06-voyage33-ui`, start `1f56d244` | `src/components/Voyage33MovementPanel.tsx` and its focused tests. Implement only the stateless GM-facing dock/jump controls through explicit props and callbacks; owner retains server transaction, session/rules wiring, and full Prompt 251 acceptance. |
| Voyage 33-0 movement transaction adapter, Luna Max task `/root/pc06_release_owner/pc06_voyage33_movement_callable` | 251 (isolated transaction adapter) | `/Users/emeraldpham/.codex/worktrees/pc06-voyage-movement-callable/den-of-wolves-new-eden-console`, `feat/pc06-voyage-movement-callable`, start `14f133e5` | `functions/src/voyage33MovementCallable.ts` and focused tests. Implement an injectable authoritative transaction adapter using the existing pure movement policy; the owner composes it with the common jump path, exports, session/rules, UI, and full Prompt 251 acceptance. |
| Permissioned-dismantling callable adapter, Luna Max task `/root/pc06_release_owner/pc06_dismantle_callable` | 385 (isolated transaction adapter) | `/Users/emeraldpham/.codex/worktrees/pc06-dismantle-callable/den-of-wolves-new-eden-console`, `feat/pc06-dismantle-callable`, start `1f56d244` | `functions/src/permissionedDismantlingCallable.ts` and its focused tests, using the existing exact-proposal policy. Owner retains callable exports, shared session/rules, client consent UI, and full Prompt 385 acceptance. |
| Common jump-cost behavior, Luna Max task `/root/pc06_release_owner/pc06_jump_costs` | 202, 210, 222, 232, 236, 259 | `/Users/emeraldpham/.codex/worktrees/pc06-jump-costs/den-of-wolves-new-eden-console`, `feat/pc06-jump-costs`, start `f8304e93` | Authoritative shared jump resolver/policy and focused tests for the source-backed ship-specific costs and Ram Scoop reward. The owner retains `functions/src/index.ts`, shared schema/rules, blind-jump P679, scenario proof P320, and full prompt acceptance. |
| Split-fleet messaging/pursuit/scouting, mission admission/rewards, P112 integration, checkpoint integration and release, checkpoint owner | 241a, 320, 607, 679, 112, 401, 237, 334, 335, 151, 307 | `/Users/emeraldpham/.codex/worktrees/0ce4/den-of-wolves-new-eden-console`, branch `feat/pc06-execution` | Blind-jump authority and UI, demo policy integration, group-local messaging/pursuit/scouting policy and production integration, mission admission and special rewards, P112 authenticated inventory/consent integration, shared entrypoints/schema/rules, integration and release files. The owner retains closure accountability for all 49 prompts, including delegated leaf work. |

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

P112 now follows the explicit digital product assumption in PC06-A9, grounded
in the Player's Guide v1.1 resource-token and table/shuttle rules. Individual
holdings, a facilitator-attested baseline, and bilateral exact consent are
clearly recorded as digital choices, not printed authority. The owner still
must implement and prove that path; ship-resource stores remain separate.
P401, P237, P334, and P335 remain owner-owned while their mission-admission
and reward boundaries are reconciled.

## Session-specific dispatch and live-access findings

On 2026-09-30, nested `collaboration.spawn_agent` successfully created the real
Luna Max tasks `/root/pc06_release_owner/pc06_vessel_ops` and
`/root/pc06_release_owner/pc06_away_mission` in separate managed worktrees. A
third dispatch for prompts 151, 307, 322, 323, and 324 first returned
`collab spawn failed: agent thread limit reached` while all four session slots
were occupied; seeing the tool alone was not treated as a successful dispatch.
After the vessel worker reached a terminal, parked state, the owner reused a
clean managed checkout and successfully dispatched
`/root/pc06_release_owner/pc06_scout_requests` as a real Luna Max worker in a
separate worktree. The worker owns only the Starlight/Hummingbird request UI
files listed above; server policy and final prompt acceptance remain with the
checkpoint owner. A later free slot allowed a fourth real Luna Max dispatch,
`/root/pc06_release_owner/pc06_demo_boundary`, in the separate managed checkout
listed above. The owner retains shared server/jump integration and final
acceptance. These are observed results for this session and do not establish a
permanent host-wide capacity or nested-dispatch limit.

During the continuation, a separate Prompt 607 keyboard-controls checkout was
prepared at `bab721ff`. Its nested dispatch attempt returned
`collab spawn failed: agent thread limit reached` while existing PC06 workers
were still running, so no Prompt 607 child was created; the bounded group stays
queued until a worker completes and frees capacity.
After `pc06_trade_ui` reached a terminal result and its child was closed, the
owner successfully dispatched `/root/pc06_release_owner/pc06_jump_keyboard`
into this prepared checkout as an isolated Luna Max UI/test group. This
confirms the queue resumed after real capacity became available; it does not
change the observed session limit.

If nested dispatch is unavailable while a slot is free, send the bounded group
brief and exact checkout/branch identity to `/root` for direct dispatch. If all
session slots are occupied, queue the next group until a real worker completes
and frees a slot; a different dispatcher cannot remove that capacity limit. In
this run the first attempt to dispatch the scout-request group returned
`collab spawn failed: agent thread limit reached`; it remained pending until a
worker completed, then was dispatched successfully. Reserve a slot for
independent Sol review at the review boundary. The checkpoint owner remains
accountable for integration and release in either case.

The continuation also prepared a fresh P334/P335 exploration-reward checkout
from `5157d417` after storage reported 63.9 GiB available. The existing parked
P334 branch was inspected read-only and preserved; it did not contain the
exploration-reward implementation. The nested dispatch attempt returned
`collab spawn failed: agent thread limit reached`, so no worker was created.
That bounded policy group remains queued until an actual worker reaches a
terminal state and frees shared agent capacity. The prepared checkout is
`/Users/emeraldpham/.codex/worktrees/pc06-exploration-rewards/den-of-wolves-new-eden-console`,
branch `feat/pc06-exploration-rewards`; its proposed files are
`functions/src/explorationRewards.ts` and `functions/src/explorationRewards.test.ts`.

After storage reported 63.7 GiB available, a separate managed checkout at
`/Users/emeraldpham/.codex/worktrees/pc06-jump-costs/den-of-wolves-new-eden-console`,
branch `feat/pc06-jump-costs`, was created from `f8304e93`. Nested
`collaboration.spawn_agent` successfully created the real Luna Max task
`/root/pc06_release_owner/pc06_jump_costs` for the six-prompt common
jump-cost/reward group. This worker owns only the authoritative jump
resolver/policy and focused tests; `functions/src/index.ts`, shared
schema/rules, P679, P320, and release acceptance remain with the checkpoint
owner. This is another observed successful dispatch and does not establish a
permanent capacity limit.

The live-access probe reached the production console at
`dow-new-eden-console.web.app/#/console`, running build `0.5.58`. Reduce Motion
was unchecked, so normal motion was already selected; no preference change was
made. The console reported local GM access authorized. With two devices
connected and the status strip still reporting authorization pending, the
checkpoint owner used the supported GM join flow with display name `PC06 Test
Facilitator`. The visible result showed `RANK: GM`, facilitator authority,
cycle 0, and Casting phase, while the status strip continued to report
authorization pending. No turn or gameplay action followed, so this confirms
the GM join path but not ordinary active-game authorization or gameplay. No
session code, email address, or credential was recorded.

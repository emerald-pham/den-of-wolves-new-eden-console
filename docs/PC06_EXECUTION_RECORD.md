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
| Jump, split-fleet messages/pursuit/scouts, mission admission/rewards, P112 integration, checkpoint integration and release, checkpoint owner | 202, 210, 222, 232, 236, 241a, 259, 320, 607, 679, 112, 401, 237, 334, 335, 151, 307 | `/Users/emeraldpham/.codex/worktrees/0ce4/den-of-wolves-new-eden-console`, branch `feat/pc06-execution` | Jump authority and UI, demo policy integration, group-local messaging/pursuit/scouting policy and production integration, mission admission and special rewards, P112 authenticated inventory/consent integration, shared entrypoints/schema/rules, integration and release files. The owner retains closure accountability for all 49 prompts, including delegated leaf work. |

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

The live-access probe reached the production console at
`dow-new-eden-console.web.app/#/console`, running build `0.5.58`. Its current
settings show Reduce Motion unchecked, so normal motion was already selected;
no preference change was made. The applicable Computer Use Confirmation Policy
requires confirmation before changing a non-sensitive application setting
unless the user explicitly requests that change. The console reports local GM
access authorized, but the current session remains authorization-pending with
two devices connected. No session code, email address, or credential was
recorded, and the session was not changed. Facilitator login availability is
therefore observed, while authorized active-session gameplay proof remains
open.

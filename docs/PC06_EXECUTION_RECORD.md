# PC06 execution record

This record tracks the concrete implementation groups, isolated checkout
ownership, shared integration boundary, and session-specific dispatch findings
for the fixed PC06 scope. It does not change the 49 assigned prompt IDs or
their acceptance criteria.

## Owner and implementation groups

The accountable checkpoint owner is `/root/pc06_sol_owner` in
`/Users/emeraldpham/Documents/PC06-active/den-of-wolves-new-eden-console`,
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
| Permissioned-dismantling callable adapter, Luna Max task `/root/pc06_release_owner/pc06_dismantle_callable` | 385 (isolated transaction adapter; retained as a comparison candidate) | `/Users/emeraldpham/.codex/worktrees/pc06-dismantle-callable/den-of-wolves-new-eden-console`, `feat/pc06-dismantle-callable`, start `1f56d244` | The alternate `functions/src/permissionedDismantlingCallable.ts` candidate is not integrated: the owner branch already contains a later, more complete adapter and test path. Preserve this worktree until the owner finishes exact candidate review; owner retains Prompt 385 acceptance. |
| Common jump-cost behavior, Luna Max task `/root/pc06_release_owner/pc06_jump_costs` | 202, 210, 222, 232, 236, 259 | `/Users/emeraldpham/.codex/worktrees/pc06-jump-costs/den-of-wolves-new-eden-console`, `feat/pc06-jump-costs`, start `f8304e93` | Authoritative shared jump resolver/policy and focused tests for the source-backed ship-specific costs and Ram Scoop reward. The owner retains `functions/src/index.ts`, shared schema/rules, blind-jump P679, scenario proof P320, and full prompt acceptance. |
| Away-mission lifecycle callable leaf, Luna Max task `/root/pc06_release_owner/pc06_mission_callable` | 392, 393, 404–415, 422, 622, 646 (authoritative callable slice) | `/Users/emeraldpham/.codex/worktrees/pc06-away-lifecycle-callable/den-of-wolves-new-eden-console`, `feat/pc06-away-lifecycle-callable`, start `bd50d141` | `functions/src/awayMissionLifecycleCallable.ts` and its focused tests, composed around the existing mission lifecycle adapter and policy. Preserve P401/P403 start/deal and private-hand contracts. The owner retains `functions/src/index.ts`, shared schema/session/rules, client service/UI, full mission acceptance, and release. |
| Gorgoneion mission-support policy leaf, Luna Max task `/root/pc06_release_owner/pc06_gorgoneion_support` | 237 (pure pre-deal support slice) | `/Users/emeraldpham/.codex/worktrees/pc06-gorgoneion-support/den-of-wolves-new-eden-console`, `feat/pc06-gorgoneion-support`, start `bd00b968` | New `functions/src/gorgoneionMissionSupport.ts` and focused tests only. Validate the source-backed top-five reorder policy as a pure leaf; do not edit the mission lifecycle adapter/callable, mission admission, client, shared state, rules, or release metadata. The owner retains P401 admission, the P237 authenticated Captain/pre-deal integration, privacy, and full prompt acceptance. |
| Gorgoneion mission-support UI leaf, Luna Max task `/root/pc06_release_owner/pc06_gorgoneion_ui` | 237 (player-facing support controls) | `/Users/emeraldpham/.codex/worktrees/pc06-gorgoneion-ui/den-of-wolves-new-eden-console`, `feat/pc06-gorgoneion-ui`, start `02cbf7ae` | `src/components/GorgoneionMissionSupportPanel.tsx`, `.css`, and `.test.tsx` only. Present controls for classifying the already-authorized top-five cards before deal; owner retains P401 admission, Captain/phase/revision authorization, private-hand projections, callable integration, and full prompt acceptance. |
| Gorgoneion pre-deal authority transaction, Luna Max task `/root/pc06_release_owner/pc06_gorg_mission_callable` | 237 (isolated callable factory) | `/Users/emeraldpham/.codex/worktrees/pc06-gorg-mission-callable/den-of-wolves-new-eden-console`, `feat/pc06-gorg-mission-callable`, start `0922e6a1` | Only `functions/src/gorgoneionMissionSupportCallable.ts` and its focused tests. Enforce connected current Gorgoneion Captain authority and existing server docking admission; return the inspected top five only to that Captain; commit the exact partition once before the first mission card, with common request receipts and transaction serialization on the shared `missionDeck` document. The owner retains exported callable composition, client service/role workspace, face labels, P403/deal reconciliation, schema/rules, and end-to-end acceptance. |
| PC06 solo review scene UI, Luna Max task `/root/pc06_release_owner/pc06_review_scene` | PC06 optional playtest scene (presentation only; no prompt closures) | `/Users/emeraldpham/.codex/worktrees/pc06-review-scene/den-of-wolves-new-eden-console`, `feat/pc06-review-scene`, start `d7c7e271` | Own only `src/PC06ReviewScene.tsx`, `src/PC06ReviewScene.css`, and `src/PC06ReviewScene.test.tsx`. Build one clearly labeled, interactive local scene from real app UI components and synthetic states; simulated actions must stay local and cannot write to live sessions. The owner wires the route in `src/App.tsx`, prepares numbered playtest checks/report, and retains every gameplay acceptance and release gate. |
| Gorgoneion Mission Support role-brief mount, Luna Max task `/root/pc06_release_owner/pc06_gorg_workspace` | 237 (player-facing workspace integration) | `/Users/emeraldpham/.codex/worktrees/pc06-gorg-workspace/den-of-wolves-new-eden-console`, `feat/pc06-gorg-workspace`, start `d7c7e271` | Own only `src/routes/RoleBrief.tsx` and `src/routes/RoleBrief.test.tsx`. Mount the existing `GorgoneionMissionSupportWorkspace` only for the current entitled Gorgoneion Captain and test that unrelated roles do not see or call it. Preserve the workspace's fresh server authority, one-use projection, and private-card clearing behavior. The owner retains the callable, client service, shared schema/rules, P403/deal composition, and full Prompt 237 acceptance. |
| Split-fleet messaging/pursuit/scouting, mission admission/rewards, P112 integration, checkpoint integration and release, checkpoint owner | 241a, 320, 607, 679, 112, 401, 237, 334, 335, 151, 307 | `/Users/emeraldpham/Documents/PC06-active/den-of-wolves-new-eden-console`, branch `feat/pc06-execution` | Blind-jump authority and UI, demo policy integration, group-local messaging/pursuit/scouting policy and production integration, mission admission and special rewards, P112 authenticated inventory/consent integration, shared entrypoints/schema/rules, integration and release files. For P237, the owner composes the pure reorder policy only for an already dock-admitted Gorgoneion with its current Captain, before the first mission card. The owner retains closure accountability for all 49 prompts, including delegated leaf work. |

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

The common jump-cost task completed in the managed checkout at exact HEAD
`e2ccef0fc4c8308fc5c59c2700bf924842dbdf0f`. Its test-first policy slice passed
110 focused tests, Functions build, targeted lint, and diff validation. The
owner retains production callable integration and is checking the source
phrase “When you FTL jump” against the separate emergency-jump transaction
before closing the Ram Scoop prompt.

With 63 GiB available, nested `collaboration.spawn_agent` then created the
real Luna Max task `/root/pc06_release_owner/pc06_mission_callable` in the
separate managed checkout listed above, starting at `bd50d141`. The bounded
leaf adds only the away-mission lifecycle transaction/callable adapter and
its tests; P401/P403 start/deal, shared entrypoint/schema/rules, and client
integration remain owner responsibilities. This records an observed
successful dispatch in this session, not a permanent capacity limit.

The checkpoint owner also created the real nested Luna Max task
`/root/pc06_release_owner/pc06_gorgoneion_ui` in its separate managed checkout
listed above, starting at `02cbf7ae`. That worker owns only the stateless
player-facing P237 card-support controls and focused tests. Admission, Captain
and phase authority, private projections, callable integration, and acceptance
remain with the checkpoint owner. This records a successful nested dispatch
without inferring a permanent concurrency limit.

After storage reported 61.9 GiB available and the current attached artifacts
were inspected, the owner created a separate checkout from `0922e6a1` for the
P237 transaction adapter. Nested `collaboration.spawn_agent` successfully
created the real Luna Max task `/root/pc06_release_owner/pc06_gorg_mission_callable`
for the callable leaf at
`/Users/emeraldpham/.codex/worktrees/pc06-gorg-mission-callable/den-of-wolves-new-eden-console`,
branch `feat/pc06-gorg-mission-callable`. The worker owns only the isolated
callable factory and focused tests; export, UI, rules, mission-deal composition,
and full acceptance remain with the checkpoint owner.

The away-mission lifecycle callable worker completed at
`accc7f4f1c649f676539753f809c94ea3dff2d4f`, changing only its callable adapter
and focused tests. Its test-first history was preserved during reconciliation;
owner integration is in the current branch commits. The broad worker Functions
run had one terminal-freeze classification failure, reproduced against its
exact assigned base files with the same seven names, so that failure predates
its leaf. The owner separately classified the P251 movement callables and
confirmed the current terminal-freeze suite passes.

During reconciliation, the owner integrated the source-backed exploration
reward leaf (`80ca2044`, test; `0b3b334b`, implementation), Voyage 33-0 movement
panel (`2b38a180`, `9e4a4880`, `e6b2f656`, `7ad70f6d`), and isolated movement
transaction adapter (`c53a1f4f`, test; `e1227c36`, implementation), preserving
their test-first histories. The isolated dismantling-callable branch collided
on `functions/src/permissionedDismantlingCallable.test.ts` with the owner
branch's existing implementation. Exact history inspection showed the owner
already carries the more complete inbox, decline, revocation, replacement-role,
and stale-state path (`5a7113ca` through `bd50d141`); the cherry-pick was
aborted before any conflict resolution, and the alternate worktree remains
preserved for comparison.

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

In this continuation, the nested dispatcher created two real Luna Max
implementation workers, verified by their running task states and separate
managed checkout identities. `/root/pc06_release_owner/pc06_away_client` owns
the client service/workspace slice in
`/Users/emeraldpham/.codex/worktrees/pc06-away-missions/den-of-wolves-new-eden-console`
(`feat/pc06-away-missions`); the owner retains callable exports, shared
session/rules, and acceptance. `/root/pc06_release_owner/pc06_bulk_haulage`
owns the bounded P241b contribution-binding investigation in
`/Users/emeraldpham/.codex/worktrees/pc06-exploration-rewards/den-of-wolves-new-eden-console`
(`feat/pc06-exploration-rewards`); the owner retains P403 snapshot capture and
production integration. These are observed child creations, not merely tool
availability, and do not imply capacity beyond the available slots in this
session.

## Owner transfer on 2026-09-30

Sol 6.1 takes accountable implementation, integration and release ownership at c4c6a3cb under the [owner audit](PC06_OWNER_AUDIT.md). The outgoing owner is parked. The [current acceptance matrix](PC06_ACCEPTANCE_MATRIX.md) records all49 assigned IDs without changing catalog credit. The old worker scopes and unique branches remain preserved. A coherent Voyage33 client integration group is queued in the existing clean checkout on `feat/pc06-voyage-connected`; dispatch returned the thread limit while the prior review-scene task remained active, so no new worker was created.

### Owner integration corrections after the audit

- `18a1b3f5` observed the required red when the last participant assignment left
  the mission active. The existing full lifecycle/recovery test now triggers the
  printed draw and outcome through that last assignment instead of asking the GM
  to perform deterministic work. It retains the atomic deck/projection,
  transaction retry, lost acknowledgement, private roll, wrong-leader and drop-off
  assertions; the pure lifecycle tests retain explicit transition coverage.
- `ae51bfa3` observed five source-contract failures for Warrior rewards and
  omitted printed craft bonuses. `10555097` changes the Warrior privacy fixture
  to a salvage opportunity, preserving the privacy assertions. The original
  search-and-rescue fixture was not a legal use of the printed ability.
  `d7df0ed7` repairs the production rules. Focused checks are local evidence;
  deployment and ordinary gameplay acceptance remain outstanding.

- `34fd206f`/`7625c1b3` introduced destination-delivery and exact recovery checks;
  the second commit corrects the fixture because Reclamator already commits that
  participant's whole-hand assignment. The observed intended red was missing
  destination mutation. `98cc90d6` connects strict reward arithmetic and a durable
  delivery receipt to the same transaction as custody, before projections publish.
- `4f9c68db` and `670b4b07` observed the rescue-count/capacity integration reds.
  Malformed-state fixtures use capacity overflow to preserve their purpose,
  including client maintenance and stale counter replies. `e59daaeb` observed the
  existing evacuation consumer rejecting exact mission counts. PC06-A13 records
  the bounded digital reading; 270 focused mission/population/counter/maintenance
  tests and 25 evacuation checks pass. Client typecheck and Functions build pass.
  The guidance-test tuple now preserves literal path types; its runtime assertions
  are unchanged after the whole-client typecheck exposed that earlier test error.

- `157b21f2` connects D/E exploration rewards to the locked private chart, immutable participant UID knowledge, and permitted projections in the same transaction. Separate test commits `0c476f47`, `534c99cf`, and `543fe8d7` establish pure, callable, and UI/client reds. No arrival or duplicate visit event is manufactured; 82 focused checks pass.
- `bc82b4b6` observes the absent mission craft commitment/movement guard red. `642a5b19` integrates a strict session commitment map, atomic admission/release, and fresh ordinary movement guards. The existing missing-receipt assertion counts the added ledger write in `96af6dc9`; 116 lifecycle/jump/small-craft callable checks pass afterward. Further endpoint and overrun display audits remain.
- The returned Voyage group has separate observed-red original commits `7bec2942`, `69021030`, and `1350f996`, then implementation `1aad8aec`. The owner verified base ancestry and the six-path diff before integrating as `e08ad99d` through `ac68587b`. All143 integrated service/workspace/GM-route tests pass with no filtering.
- `5e80bf67` reproduces a solo Warrior Reclamator mission stuck at assignment-ready. `a00aa110` finishes its already-satisfied assignment slot; 40 lifecycle/adapter/callable checks pass. The shared server legal-drop context audit remains before final acceptance.

## Connected fleet-group minimum and rendered controls

The owner found that fixed PC06 explicitly requires production group-isolated communication and pursuit despite broader consumers belonging to later prompts. The connected minimum is now an authenticated short group-note send/read pair and a live GM confirmation that derives physical partitions from private server coordinates. PC06-A14 records the digital timing decision; no outside catalog row is promoted. Established partitions survive ordinary join/resume and member removal. Group message storage remains server-only under the existing default-deny rule; each read rechecks current live membership.

Test-first receipts: `be07866a` (missing partition module), `28c2a0ed` (missing confirmation callable), `4807cdb2` (ordinary join incorrectly changed fleet-2 to fleet-1), `3bff2703` (missing note callables), `7883e581` (missing client/workspace), `2242532d` (kick collapsed remaining fleet-2 members), `6c966b12` (cross-group replay and attack-window denial), and `e566aa46` (review scene lacked actual group-note controls). The integrated backend group passes 216 checks; local client/App checks pass 98. The real panel is reused in the strictly synthetic review scene, whose controls fit320/390px phones,844px short landscape and1440px desktop in normal/reduced motion. No local render or mocked transaction is credited as ordinary authorized gameplay. The independently moving small-craft jump group is still active in its isolated checkout.

Candidate review/deployment status remains pending. Separate Sol risk-review dispatch still fails with the session agent-thread limit; owner work continues on useful integration and proof rather than treating the policy audit as code review. Catalog counts remain507/751.

## Active-checkout recovery and transaction integration

The active managed checkout disappeared externally twice while the owner was working. Cause is unproven; no owner or resumed worker native create/archive/cleanup call preceded the second incident. Committed work survived on `feat/pc06-execution`. After the second disappearance, the owner restored that branch into `/Users/emeraldpham/Documents/PC06-active/den-of-wolves-new-eden-console`, outside the repeatedly removed managed path. The owner's existing host-ledger entry was relocated under the existing ledger lock with exact incident/checkpoint history; all other tasks and claims were preserved. Only the owner's old configured slot2 was released and reconfigured at the recovered checkout. No sibling process was stopped. This is preservation/recovery, not a release or cleanup of another task.

`2421bf58` adds an actual Firestore production-transaction scenario and the initial private-hand regression. The first legal lifecycle continuation exposed the missing `discarded:false` seed; `6cf583ee` repairs it. Separate fixture-only commits `919ca6b8`/`52a817d9` retain outcome/delivery assertions while correcting face-card values, the complete destination inventory, and Aegis's legal population track. Fifty-one focused checks pass. The real scenario passes concurrent initial deal, current mission movement hold, public/private projection boundary, card distribution/discards/assignments, automatic outcome, participant-only exploration, unchanged ship coordinates, concurrent exploration replay, oversized reward delivery, one ledger delta, and craft hold release. The emulator stops normally. These are local transaction checks with fixture authentication, not ordinary deployed gameplay.

Small-craft movement group integration `e73caf16` preserves all returned test-first commits. Attached location derives from the current host; only an undocked stored coordinate is independent authority. New pure Captain panel/rendered review samples integrate through `614f6fb8`; returned focused tests, computed fonts, and eight viewport/motion combinations pass. The synthetic scene invokes no production action module. GM workspaces are lazy-loaded in `0b4f8494`, bringing the tested GM chunk within its cap. The deployment-consumer inventory is source-hash-bound and still needs reconciliation after the remaining P378 connected group, then separate risk review.

## Reconciled P378 and native keyboard recovery

The bounded P378 worker returned clean `2ef5ed61` from `6cf583ee`; the owner inspected ancestry and exact shared-file diff, then preserved all separate test-first commits in integration `58bb1191` through `32451b49`. The authenticated read uses existing strict security-team location authority, reads the manifest only after active/fresh GM checks, binds the response audience, and mounts a lazy current-context GM workspace. No rules/schema or later boarding roll was added. The owner's integrated runs pass31 server and140 client/route/workspace checks. The worker's actual panel passes eight viewport/motion cases,61 font checks and56 typography cases. These are local evidence only.

The fleet-drive review selector integrates in `e54eb754` after committed red `5ac160b8`. A separate real keyboard check exposed native disabled-button focus loss absent from JSDOM. Test-only `5503a96d` records the browser failure and native-blur regression; `4c33eb49` repairs focus without taking it from another chosen control. All23 console tests,11 scene tests and eight actual-browser local-mock keyboard flows pass. This adds no production gameplay proof.

Build0.5.59 metadata retains the current507/751 catalog snapshot and does not declare PC06 complete. Source-bound deployment inventory is reconciled to runtime candidate `32451b493c3db98870b3c6fd1a148da4099edc44`:122 shared-index consumers and27 changed runtime modules, including the new security-team read. Separate regression `857d119e` observed two expected failures for missing/stale consumer mappings before reconciliation; all100 deployment-selector checks pass afterward. Unknown source tuples still fail closed. The independent review and final validation/release boundary remain pending.

## Independent review findings and owner repair

The separate Sol 6.1 xhigh review became available and completed against `b20ae29b0b6de9d5d5d04d696b26f9a156a8edd1`; the earlier dispatch-capacity issue is closed. It reported six actionable authority/privacy findings together and issued no approval. The owner retained that failed candidate and added regression-only `137f4145` (23 intended failures, 110 passing checks) plus `af16e139` (missing detached position authority incorrectly accepted). Repair `033260de` rejects any pending reassignment before target consent and fresh application, authorizes the requesting trade actor before exact recovery, derives attached craft co-location from the actual live host, fails closed for missing established detached position, holds the PDF wing out of fresh launch during an active mission, and uses own-property/prototype-safe UID maps. All 134 focused checks, Functions build and touched-file lint pass. Valid exact recovery after the other trade participant moves and historical PDF launch replay remain covered.

Deployment selector test-only `27578045` binds the repaired runtime candidate and PDF launch mission-hold dependency, observes stale source tuple failures, then the inventory is reconciled to `033260dede184135406aba608a3f58093e94df0a`; all 101 selector checks pass. The independent follow-up and final release validation are still pending. No tests were skipped/deleted and no production browser restriction was bypassed.

## Full-suite reconciliation before release

The bounded independent follow-up approved clean `4c48ab7af949cafea880fcce9b38239395bd3610`, resolving all six findings and matching all 28 source tuples. Final `test:all` then stopped: 6,573 passed, 11 tests failed and the release-pipeline import suite failed before collection. No CI, push or deployment was started. Regression-only `07dcbd72` reconciles valid fixtures and accepted contracts: admission now supplies the authoritative host fix and still rejects its absence; population tests retain every printed marker while explicitly accepting exact rescue counts under PC06-A13 and rejecting fractional/out-of-range values; new factory/notes delegates retain their actual terminal guards; the DOM release-tool import records the inventory-loading failure. No assertion was skipped or deleted. `7afa061d` strengthens the replacement trade route assertion to the loaded heading and current region in one committed DOM check, after the unchanged route passed both isolated and full-file reproduction.

The deployment inventory loader now uses a static JSON module import instead of a DOM-transformed asset URL; exact source hashes, named consumers and unknown-source rejection are unchanged. The new progress note keeps the existing count sentence and the pending-credit explanation as separate notes. All 157 affected focused checks, client typecheck, touched-file lint and 101 selector checks pass. Authority runtime source remains `033260de`, so its deployment tuples are unchanged. The exact successor receives a bounded independent review update before renewed final validation; a green focused run is not release completion.

The independent reviewer approved successor `d00906f2`, confirming unchanged authority source and all 28 source tuples. Its full run passed 6,654 checks and failed only the first cold GM security-location mount: the default one-second query window elapsed during shared lazy-module loading. The unchanged route passed isolated reproduction; the test now awaits the real modules in the shared Suspense boundary inside React act before checking the current region and single service call. It retains the cached-session denial and uses no replacement mock, timeout increase, skipped test or product timing exemption. Both focused route cases pass. Full render/performance gates remain separate and required.

## Final local validation and upstream reconciliation

Independent Sol 6.1 xhigh review approved exact `a72f0ba20ff2b381c44cbcb4244f2cafc42f2941` after all six reported authority/privacy findings were repaired and bounded successors verified. All 18 final gates pass: 6,655 tests, 152 rules checks, lint/builds, fonts61, typography56, full ticker lifecycle, render performance, bundle cap, 101 selectors, all eight scene/keyboard/security-panel viewport/motion combinations and three real Firestore transaction scenarios. The previously reported first-suite failures remain preserved as repair evidence; no test is skipped or deleted.

Upstream `6c0d32ce` landed during final validation. Merge `0967b677` retains its future PC07–PC10 alignment documents and the PC06 shape, assumptions and feedback. Explicit-ID comparison confirms all 49 assigned PC06 catalog rows unchanged; runtime, tooling and deployment inventory are byte-identical to the approved/tested candidate. Affected documentation and generated catalog checks pass. Exact successor review binding, candidate CI, deployment/build verification and ordinary authenticated production gameplay remain distinct release stages. The administrator-policy browser denial still prevents ordinary production proof; no transport bypass or completion credit is used.

## Candidate CI findings and batched render-cost repair

PR #11 is the single checkpoint PR. Run `36802777942` failed the second replacement-role trade assertion after its initial loading element was replaced; test-only `68161143` checks the current loaded region and heading together, preserving the acceptance. Run `36803382473` passed unit/Functions/rules/build/font/typography/full ticker but failed the native mobile frame count at 78 above 70. Its checkout incorporated upstream deterministic benchmark PR #10; owner merge `cf664d8e` reconciles that source and the future-decision policy, with native samples and budgets unchanged. The new local benchmark and all 13 clock/benchmark regressions pass.

Run `36806065103` exposed the upstream guidance line-cap mismatch and a per-character facilitator-rule-call form test timeout. Test-only `2fd71bf3` enters the identical three field values through normal click/paste events, retaining audience, exact request and applied-status assertions. Documentation `164573f2` reflows the same policy within the original 451-line cap. All 142 affected checks and the complete 2,781-test unit gate pass. Independent review approved the exact successor. No test timeout, mock, skip, sample or budget was introduced or weakened.

Run `36806711574` again passed unit/Functions/rules/build/font/typography/full ticker, then measured 79 mobile long frames above the unchanged 70 cap. Both hosted failures performed 5,177 DRADIS label reads and 22,264 mobile reads; the measured workload matched, so no further unchanged CI retry is being used. A bounded worker resumes in the existing preserved small-craft checkout on `feat/pc06-render-cost`, based on `164573f2`, owning only ContactPlot production/tests and narrowly necessary CSS. The owner retains one integration/release candidate and its active shared-ledger claim; the worker's older parked entry is not falsified. The repair must reduce actual rendering/layout work while preserving placement, sweep, flares, collisions, fonts, all 120 native samples and every existing budget. Parent batching clarification `333de79d` remains local and joins the next already-needed candidate; it receives no standalone CI. PC06 deployment and ordinary proof remain pending.

The worker returned clean `a8bb83ce34765caee14cd721207bf7860b5398bc`; the owner verified its base ancestry and exact two-file diff before merge `26e92bcd`. Observed-red test-only commits are `bce5b06c` (120 owner lookups instead of 20), `51398c44` (six deferred-sweep mark reads instead of one), `3453f059` (unnecessary alternate-anchor measurement), and `e4bd6924` (alternate-anchor reads interleaved with writes). Implementation batches changed-anchor measurements and adds cache checks with collision/edge fallback. No benchmark, fixture, sample or budget changed. The worker passes all 63 ContactPlot checks, typecheck/build, touched lint, fonts, typography, clock/benchmark tests and rendered DRADIS viewport/motion cases.

Exact local before evidence is `/tmp/pc06-render-cost-before/results.json`; the owner preserved the worker's after evidence as `/tmp/pc06-render-cost-after-worker.json`. Across 120 mobile frames, label reads fall from 22,268 to 21,439 (829 fewer, 3.7%); native p95/max changes from 16.8/33.4 ms to 16.7/33.3 ms, with zero frames above 50 ms in both runs. DRADIS reads fall from 5,179 to 5,031, total p95 from 35.0 to 33.5 ms and work p95 from 13.2 to 12.2 ms. These local measurements do not establish hosted performance. Independent follow-up and affected final gates remain before the next batched candidate push; all prior gameplay authority and deployment-source tuples are unchanged.

Independent follow-up rejected `b07d626b` with two P2 geometry counterexamples, despite all 63 ContactPlot checks passing: an unscanned departing spoof could jitter into a cached label, and a safe-side shortcut stopped comparing the opposite anchor's greater clearance. Test-only `426410a3` reproduces both through the rendered component (two intended failures, 63 passing) before owner repair `4858859b`. Departing/moving contacts now invalidate deferred-sweep geometry. An alternate rectangle is reused only when its own mark, measured preferred rectangle and typography/style context match; both anchors still receive the original exact clearance comparison against current neighbors. The alternate-batch fixture now actually moves both rendered marks while preserving its four-read/batched-write assertions. All 65 focused checks, typecheck and touched lint pass. The independent reproduction confirms no departing overlap and the same selected anchor/clearance as approved `164573f2`. Renewed exact review and affected final gates remain; the earlier worker metrics describe `a8bb83ce`, not the repaired source.

The bounded follow-up rejected `f1391bf6` for one residual acquisition-flash animation: an unscanned stationary blip shrinks from 16×16 to 8×8 without changing its moving/departing flags. Test-only `fdc7f54a` reproduces the changed anchor (one intended failure, 65 passing). `03c245d5` then requires one fresh read per neighbor mark while retaining the existing two-label-read limit; the old one-mark assertion assumed immutable rendered blip geometry, which the actual transform animation disproves. Both tests fail before production `7d2e9c97` refreshes all blips in one read batch. No benchmark sample or official budget changes. All 66 focused checks, typecheck and touched lint pass; the independent reproduction now selects south-west with clearance² 49 in both cached and full paths.

The already-running local gate set for rejected `f1391bf6` completed with all 12 gates passing; its logs and performance JSON are preserved under `/tmp/pc06-rejected-f139-local-validation`. That outcome does not approve the missed animation behavior or validate `7d2e9c97`. The repaired candidate needs bounded independent approval, then renewed affected final validation before any CI push. Gameplay authority, source-bound deployment tuples and fixed49 allocation remain unchanged.

Independent Sol follow-up approved exact `7fd416fe`; all 12 renewed local gates then passed, including 2,789 unit tests and the complete ticker. Preserved evidence is `/tmp/pc06-approved-7fd-local-validation`. Its mobile label reads were 22,092 versus the original local 22,268 (only 0.8% fewer), and DRADIS reads were 5,177 versus 5,179. The owner held the CI push: the earlier worker's 3.7% improvement did not survive the correctness repairs, and a near-unchanged workload did not substantiate the hosted-cost remedy.

Temporary local diagnostic instrumentation recorded 13,416 layout passes and 20,047 style recalculations across the fixed render workload. A containment experiment left those counts unchanged and was not added to product code. Test-only `507891e1` then observed the crowded fallback writing/measuring one contact at a time (one intended failure, 66 passing). Production `a9bbd939` stages independent width caps and translation probes for contacts whose two natural anchors already fail against current marks/controls, before the original ordered scorer runs. Later label-induced crowding keeps its exact on-demand path; `206116b6` retains the original hidden-label path. The same anchor order, first-side reference, cap correction, lane score and final measured correction are preserved. All 67 focused checks pass, along with typecheck, touched lint and the three independent geometry reproductions.

The unchanged official local P637 run on `a9bbd939` passes with the same 22,092 mobile and 5,177 DRADIS label reads, zero of 120 mobile frames above 50 ms, and DRADIS work p95 11.3 ms. Diagnostic before/after evidence under `/tmp/pc06-fallback-read-diagnostic/{baseline-profile,batched-profile}/results.json` records layout passes falling from 13,416 to 7,419 and style recalculations from 20,047 to 11,329. The extra instrumentation is diagnostic, not a replacement for the native gate; its timing is not credited as hosted proof. Official evidence is `/tmp/pc06-fallback-batch-official/results.json`. No source harness, sample, budget or server authority changed. The reconciled successor still needs bounded independent review, affected final validation and the next single PR CI run.


Independent Sol 6.1 xhigh review approved exact `d412e1b8`, with 480 controlled old/current geometry comparisons and all 67 focused checks passing. All 12 renewed local gates then passed, including 2,790 unit tests and the complete normal/reduced ticker lifecycle. Evidence is preserved under `/tmp/pc06-approved-d412-local-validation`. The native workload measured zero of 120 mobile frames above 50 ms; diagnostic layout counters remain separate evidence. The one repaired candidate was pushed to PR #11; its duplicate feature-push CI was canceled, retaining PR run `36821522374`.

That run passed unit, Functions, rules, web build and font consistency, then stopped before ticker/performance: typography sampled the visible GM heading while `.gm-starmap__controls label` had not arrived from its lazy panel. The failed log and artifact are preserved at `/tmp/pc06-pr-ci-fifth-failure.log` and `/tmp/pc06-ci-fifth-typography`. Test-only `0a063a0a` establishes three readiness regressions before production `fb4b123b`: a heading does not release a delayed required target, a missing target still rejects, and the real harness must use complete target readiness. The heading-only path reproduces the exact hosted missing-control error when the real local GM module request is delayed by one second; evidence is `/tmp/pc06-typography-heading-only`. The harness now waits for all existing targets after any required DRADIS expansion, with concurrent visibility waits using the unchanged 15-second per-target bound. PC01 source, selectors, 56 cases, viewports, motion modes, style/geometry comparisons and failure assertions remain intact. This is a readiness repair, not a reduced gate; it needs bounded independent follow-up and fresh typography verification before another candidate push. Product runtime, deployment tuples and performance workload/budgets are unchanged.


The delayed complete-readiness reproduction exposed a second fixture race: the synthetic actor attempted production `resumeSession`, was denied and redirected to the station catalog before the lazy controls arrived. Independent approval was held while that actual failure was diagnosed. Test-only `f9ae3468` observes three additional network-boundary failures before `6edad9c9` permits only the local Vite origin and aborts external requests as disconnected. Nonlocal application origins are rejected; no successful authorization response is fabricated. All eight readiness/network/release contracts pass. The real local GM module delayed by one second now passes the complete 56-case, seven-surface, four-viewport normal/reduced PC01 comparison at `/tmp/pc06-typography-isolated-delayed/results.json`. This fixture isolation is local rendering evidence only. The reviewed product authorization, gameplay runtime, deployment tuples and native performance samples/budgets remain unchanged; narrow independent review and the official affected typography gate are pending before the justified CI successor.

## Exact-main failure and scorer cost repair

Independent review approved `3554a4a2`; its renewed official typography gate
passed all 56 cases. PR CI run `36823752884` passed all gates, including the
native mobile count at 69 against the unchanged 70 cap. PR #11 then merged by
normal fast-forward main push at that exact SHA. Required main deployment run
`36826210341` passed every other gate but measured 71 mobile long frames; the
deploy job never started. One isolated rerun of that failed job measured 72.
Both native artifacts are preserved at `/tmp/pc06-main-first-performance` and
`/tmp/pc06-main-second-performance`. No further unchanged retry is planned.
Production remains the previously verified build 0.5.58, and the catalog still
records 507/751; landing on main supplies no deployment or ordinary gameplay
credit.

Separate observed-red commits `d65459f1`, `a564b743` and `40364e60` cover exact
clearance arithmetic, redundant prepared-style assignments and distant obstacle
work after a collided lane cannot win. Production `682e94ce` keeps the original
score arithmetic, candidate order, nearest-clear-lane stopping and final native
geometry correction. Finite axis gaps skip only norms that cannot improve the
known minimum; nonfinite inputs retain the original path. Prepared rectangles
score without DOM writes, while an unmeasured side still installs its exact
anchor/style before native probes. A collided lane stops examining obstacles
only when its finite partial score cannot beat the finite current winner;
remaining collisions can only increase that score and minimum clearance can
only decrease. Original lane bookkeeping still runs.

All 72 focused checks, typecheck and touched lint pass. The actual old/current
function comparison records zero differences across 160 fixtures and 480
coordinate/font/container phases; the three previous geometry counterexamples
remain fixed. Temporary diagnostic instrumentation against exact `3554a4a2`
records norm calls falling from 1,888,032 to 226,932 and style assignments from
27,737 to 16,755 across the unchanged workload. Whole-work browser task duration
was 1.886 to 1.756 seconds and DRADIS work p95 11.8 to 11.1 ms in that local
diagnostic pair. These timings are noisy diagnostic evidence, not hosted proof;
native geometry-read counts remain identical. Evidence lives under
`/tmp/pc06-cost-{3554,pruned}`. No benchmark source, samples, budgets, authority,
deployment tuples or fixed PC06 allocation changed. Independent successor
review and affected final gates remain before the next justified candidate CI
push and required exact-main deployment checks.

## Verified deployment and live-proof resume boundary

Independent Sol 6.1 xhigh review approved exact clean
`33f9bc04490294e65ef0e052631668efac8c4686`. Its actual-source comparison found
zero differences across 480 geometry phases and 10,032 targeted scoring cases,
including 26,364 pruned lanes, 177 exact tied prunes and 1,758 pruned matching
clear-lane cases. All 12 affected final local gates pass, with 2,795 unit tests,
complete normal/reduced ticker lifecycles, fonts/typography, native performance,
bundle and eight scene viewport/motion cases. Evidence is preserved at
`/tmp/pc06-approved-33f-local-validation`.

The single repaired candidate CI run `36831996571` passed with 15 mobile long
frames against the unchanged cap of 70. Normal fast-forward main push then
started required Deploy run `36833975463`. All exact-main jobs passed on their
first attempt; its render artifact records 61 long frames and the same 22,088
mobile/5,175 DRADIS label reads. These are separate native measurements, not a
claim about broad hardware or model speed. Evidence is retained at
`/tmp/pc06-ci-scoring-performance/results.json` and
`/tmp/pc06-main-scoring-performance/results.json`.

Deployment completed successfully at 2026-10-01 08:23:44 UTC. The exact checked
artifact is build 0.5.59 from `33f9bc04`; current-tip guards passed. Hosting
version and all 134 selected new ready Function revisions passed verification.
Firebase compiled and released `firestore.rules`. The verifier's Firestore
check confirms the expected Native database exists, not a rules content hash.
Logs and machine-readable conclusions are preserved at
`/tmp/pc06-scoring-deploy.log`, `/tmp/pc06-main-scoring-success.log` and
`/tmp/pc06-main-scoring-result.json`. No retry or new PR was needed for this
successor. PR #11 remains the single merged checkpoint PR.

The deployed [solo scene](https://dow-new-eden-console.web.app/pc06-review.html)
is strictly local prepared state with no production actions. All 49 rows now
record source/build deployment separately in the acceptance matrix; every
ordinary-live cell remains pending. Catalog status/dependencies/views and build
version are unchanged, with 507/751 completed and no assigned closure credited.
The fixed target remains 556/751 and 98/293.

Supported production browser access is still denied because administrator
policy cannot be verified/security checking is unavailable. The deployment's
Firebase callable invoker restoration is unrelated to that tool denial and
does not justify a retry or bypass. Useful implementation, review, validation,
release and metadata work is now complete. Resume after that access is restored:
use the normal PC06 Test Facilitator session (Casting, chart/roster confirmed,
one unassigned player, no game started; motion already selected), verify the 49
ordinary acceptances plus Demo-to-Cycle-1 and actual P371 Cloud Tasks enqueue /
private worker execution, then reconcile catalog closures and generated views.
No credentials/session codes are recorded here. Preserve the stable owner
checkout and parked worker branches; no worktree cleanup is performed.

## Supported browser restored after app restart

On 2026-10-01, `/root/pc06_live_owner` resumed the existing owner ledger entry
`1790767039438-21142-5e61cbf6` from clean `1f4558b1` in the stable checkout.
The startup pass found no attached terminal or terminal-state test/emulator
child requiring closure; running app services were left alone. No worktree,
runtime build, deployment, or reviewed-source change was needed.

The parent restored the supported in-app browser and applied the user's explicit
Normal Motion choice. The hidden owner tab then opened the production console
successfully. Settings showed build 0.5.59; ordinary reload resumed session
presence and station viewing. The GM route returned to the station catalog,
which had no GM join control, and Settings requested the existing GM access
password. The parent asked the user to enter that credential directly in the
visible Settings panel and choose Authorize GM Access. No credential, session
code, UID, or private chart content is retained in this record. The old browser
administrator-policy denial is historical; the current prerequisite is normal
GM login. The authorization-pending status label is expected before the first
Cycle 1 snapshot and is not used alone as failure evidence.

The prepared live sequence preserves the fixed 49-row allocation:

- Core and small-craft jumps / demo: 202, 210, 222, 232, 236, 241a, 259, 320,
  607, 679, 020a. Use ordinary reactor charging, printed drive controls,
  keyboard coordinate lock/power/launch, current host fuel and private arrival.
  The base and expansion Capybara modes require separate valid configurations.
  The demo must use its own supported start and complete Cycle 1 boundary.
- Vessel operations: 112, 238, 244, 241c, 251, 250, 352, 371, 380, 385, 378.
  Use current entitled Captains and supported GM controls, ordinary docking and
  movement, exact recipient consent, and current security-team reads. Leave
  legal craft in transit at the ordinary airspace deadline and correlate the
  enqueue/private worker log with the observed parking result. Competing tabs
  must use their genuine actor authority, never privileged client writes.
- Away missions: 401, 237, 241b, 392, 393, 404, 405, 407, 408, 409, 410, 411,
  412, 413, 243, 414, 415, 622, 422, 646, 334, 335. Use genuine source
  opportunities, eligible participants and leader, own private hands, blind
  allocation, contribution-linked bonuses, automatic outcome, current legal
  drop-off and participant-only exploration. Preserve a real mission across
  reload and a cycle boundary; do not seed a chosen card or result.
- Fleet split and scouting: 151, 307, 322, 323, 324. Separate core ships through
  ordinary jumps, confirm their server-derived groups, compare entitled notes
  and pursuit, then use the assigned Starlight/Hummingbird controls with current
  range, cadence and refuelling. Resume an actor and verify the same audience.

After login, the supported path is Settings authorization → station-catalog
GM join → named GM instance claim in Role Select → GM Console. Inspect the
existing setup and casting roster before changing it. Ordinary production
start is `Start production // Advance to Cycle 1` followed by its visible
confirmation; unfilled stations do not block start. Additional participants
must join through ordinary app controls and receive normal casting assignments.
All live matrix cells remain Pending until their own acceptance is observed.

Core-ship maintenance and jump controls support the existing facilitator
observer path: `GM ship console read write access` and its per-ship confirmation
establish the scoped grant checked by the production callables. Leaving the
view or changing ships revokes it. This can reduce unnecessary player setup for
those ordinary facilitator actions; it does not replace genuine private mission,
trade, scout or replacement-Captain participants. Settings exposes
`Start single-player demo` only at Cycle 0 with exactly one connected participant.

## Ordinary Cycle 1 and native refuelling persistence failure — 2026-10-01

The user applied Normal Motion and authorized the existing GM access in the visible browser. The live owner uses a hidden supported IAB surface for the same GM and a normal Chrome participant surface. Ordinary resume receipts privately establish distinct GM/player actors. Explorer casting returned HTTP 200; a normal player reload recovered the private assignment. The player entered its assigned console and `claimSeat` returned HTTP 200. Ordinary start first rejected `seat-documents, seat-pointers`; after that genuine seat claim, `startGame` returned HTTP 200 and the session began Cycle 1. The original earlier casting rejection remains unexplained; the fresh controlled submission resolved the workflow and does not justify further repeats.

Quellon observer access gained the ordinary per-ship GM write grant. Eight maintenance actions returned HTTP 200, consuming short rations, rolling unrest and riot on the server, charging three consoles and producing water twice. Nonempty Hummingbird refuelling failed at 2026-10-01T11:13:00Z with HTTP 500 `INTERNAL`; timestamp-scoped Cloud Logging identified `3 INVALID_ARGUMENT: Nested arrays are not allowed`. The handler persisted its refuel fingerprint as an array of two-element arrays. The transaction double concealed the native writer restriction. No source-rule or actor-authority change is required.

Observed-red commit `36be68c41f48d99d914b7534faa58b2f67a31aa6` adds six receipt storage-shape assertions; `/tmp/pc06-live-refuel-red.log` records six failures and 101 passes. Repair `4c255fb0f974cf9505c956d547de67e4b647401b` stores sorted `{bayId, shuttleId}` objects and updates exact comparison. `/tmp/pc06-live-refuel-green.log` records 110 passing maintenance/rollback checks; Functions build and diff check pass. Independent `/root/pc06_live_owner/refuel_risk_review` (Sol 6.1 High) approved exact `4c255fb0` with no findings. Empty historical fingerprint arrays remain compatible; nonempty nested tuples could not have committed in production.

`scripts/test-pc06-maintenance-refuel.emulator.mjs` adds the missing native-writer boundary: compiled production `runMaintenance`, a nonempty Hummingbird selection, durable receipt readback, exact replay, one fuel decrement, one event, selected-only shuttle fuel and one maintenance revision. It passes in the owned isolated Firestore emulator slot; `/tmp/pc06-live-refuel-native.log` retains the result. Authentication and initial state are local fixtures, and no production privileged seed is used. The emulator exited successfully and released its reservation. Build 0.5.60 remains a candidate until its required release gates, deployment and ordinary retry.

All 49 ordinary-live cells still remain Pending; no progress count changed. The current live refuel transition remains un-retried while the repair is released.

The release-range selector initially could not identify a named deployment for the helper-only repair: two observed-red cases are retained in `/tmp/pc06-live-refuel-selector-red.log`. The additive exact source transition in the existing PC06 consumer inventory maps only `runMaintenance`; original PC06 mappings are preserved and an unaudited mixed change still fails closed. All 103 selector checks now pass. The production failure is the concrete reason for this additional batched candidate and exact-main deployment; the passed 0.5.59 release is not rebuilt as evidence for this repair.

The broader candidate validation exposed a changelog copy mismatch and test scheduling races in the unchanged GM workspace. The current progress sentence remains its own exact line. The Voyage route test now awaits the real lazy module inside React act; the baseline roster test awaits the actual player option rather than treating the newly mounted empty panel as loaded player data. Existing admission, active-player filtering and private-role assertions are retained; no timeout or product behavior changed. The original full-run result was 6,674 passing tests and two failures, retained in `/tmp/pc06-live-refuel-all.log`; a follow-up exposed the baseline option race before its targeted correction.

Final repaired local validation: all 6,676 tests in 494 files pass (`/tmp/pc06-live-refuel-final-all.log`), the 177 focused GM/header checks pass, Functions/web builds, lint (zero errors; inherited warnings retained), documentation validation and diff check pass. Exact runtime and deployment additions have independent Sol 6.1 High approval; final test-only scheduling and progress-copy corrections do not change that approved runtime source. The production-only persistence failure justifies the build 0.5.60 repair candidate.

An unaffected ordinary Quellon jump succeeded during Coordination on deployed 0.5.59: keyboard Enter edited every coordinate digit, locked the destination, native End set the power rail to 100%, and keyboard submission returned `jumpShip` HTTP 200. Its short jump spent two fuel (3 → 1), consumed the charge and displayed the completed arrival. A cropped instrument screenshot was captured without session or actor details; the capture tool returns image bytes rather than a local artifact path. This is partial ordinary evidence for 222/607/352; denial/recovery, other drive variants and transition presentation remain pending, so no fixed row is closed from this one outcome. The failed refuel state remains intact and the game naturally advanced to Coordination; its next attempt will use a legal maintenance window.

## Ordinary split-fleet and participant boundary

P151 has partial ordinary production isolation proof on 0.5.59. After the normal Quellon jump, `confirmFleetGroups` returned HTTP 200 with two partitions. Explorer Fleet 2 and GM Fleet 1 each sent one group note. Fresh `readFleetGroupMessages` HTTP 200 responses and each rendered group panel showed its own note and excluded the other group's note in both directions. Ordinary Explorer reload/resume preserved Fleet 2 and that isolation. The exact catalog acceptance also requires the scout-taxi exception leg; that remains unplayed. All 49 full cells therefore remain pending, and catalog/progress counts remain 507/751 until the final evidence batch.

Hummingbird's ordinary request for 5143, within two graph jumps of Quellon's 1413 fix, returned `requestScout` HTTP 200. Ordinary facilitator reveal returned `resolvePendingScoutRequest` HTTP 200 and removed it from the pending queue; the Explorer navigation map gained the 5143 fix while Quellon stayed at 1413. A fresh request for 6837 in the same cycle returned HTTP 400 `FAILED_PRECONDITION` and did not create a second queued scan. P324's fourth-jump boundary remains to be played before its cell closes.

The bounded Luna participant worker stopped when the supported browser API refused ownership of the owner's existing tab. Nested delegation worked; access to that tab was not transferable by assumption. No private data was read and no alternate binding was attempted. This is a delegation tool-scope finding, not a coding-quality finding. The owner then used its existing authorized native Chrome surface to open a normal private window, join through the public form and acknowledge the ordinary table rules. The GM roster showed one new non-GM record, privately confirmed distinct from both the Explorer and GM. No credentials or auth/storage values were copied or changed. This actor joined after the casting window closed; new named ordinary scenario sessions will cast both controlled actors and establish reciprocal seats before starting, while retaining the current session's evidence.

The single repair candidate `a43a7acd2037941a05108588515b8c7e12564551` is under [CI run 36856358245](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/36856358245). Deployment and ordinary refuel retry remain pending.

## Refuel repair deployed and ordinarily verified

CI 36856358245 passed the complete candidate gates on exact `a43a7acd2037941a05108588515b8c7e12564551`. Fresh `origin/main` was `1f4558b1` and an ancestor of that candidate; the owner fast-forwarded main without a new CI-triggering candidate. [Deploy 36858861977](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/36858861977) passed its required exact-main verification, deployed hosting plus only `runMaintenance`, and passed the deployed hosting/version and selected new ready Function-revision checks. Ordinary GM reload displayed build 0.5.60 with retained authorization.

Normal `advanceTurn` returned HTTP 200 and entered Cycle 2 Team Phase. The owner returned to the same Quellon console and applied its scoped ordinary GM read/write grant. The preserved step-6 refuel was retried with the nonempty Hummingbird choice: `runMaintenance` returned HTTP 200, status `committed`, action `bays`; the live result showed “refuelled hummingbird” and exactly one fuel spent (1 → 0). End maintenance returned HTTP 200. Ordinary Explorer reload showed Hummingbird “Fuelled this cycle.” The original production Firestore failure is resolved; native fixture replay remains separately identified as local evidence.

Gorgoneion admission at the current live Quellon host returned `setSmallShipDocking` HTTP 200. The genuinely late second actor received normal late eligibility and Gorgoneion Captain assignment through HTTP 200 `setReplacementEligibility` and `assignReplacementRole`; normal private-window resume and its assigned brief exposed the real Captain workspace. No core seat or casting identity was invented. Gorgoneion began ordinary host-funded Team maintenance and spent six host water in rations. Its later unrest request was rejected HTTP 400 `FAILED_PRECONDITION` after the five-minute Team window naturally ended, preserving the step. That is the expected phase guard, not a repair regression. The actual reactor-selector observation is still required before the source-confirmed missing Repair Drones choice is repaired.


## Ordinary scouting boundary and reactor selector repair

P324 is ordinarily verified on deployed 0.5.60. After Cycle 1 accepted the distance-two 5143 request and rejected a second fresh request, Cycle 2 rejected 2580 at exactly four graph jumps from Quellon’s 1413 fix with HTTP 400 `FAILED_PRECONDITION`. The next normal request for 6964, exactly three graph jumps away, returned HTTP 200 in the same cycle; ordinary facilitator reveal returned HTTP 200, emptied the queue, and the Explorer navigation map gained 6964 while Quellon stayed at 1413. The rejected range request consumed no scouting cadence. Graph distances were checked against the locked chart’s existing graph module. This closes only P324’s literal range/cadence acceptance; catalog closure remains reserved for the final reconciled batch.

A scout-queue read once returned HTTP 403 despite the same live GM instance serving other commands; a fresh ordinary read succeeded and showed the correct pending request. The cause of that transient read is unproven. The old unavailable message remained beside the successful queue, which is a concrete recovery-copy defect. A regression verifies error → normal refresh → successful queue removes that stale error.

Normal `advanceTurn` entered Cycle 3 Team; the ordinary five-minute Restricted extension succeeded. The preserved Gorgoneion unrest and population rolls returned HTTP 200 and reached Step 4. The deployed selector offered only Missile Array and Force Field Projector, with no Repair Drones choice, while the Captain repair requires that canonical charge. The source showed the same omission for Warrior. Test-first `5de07435` observes three failures with nine passes: both craft must expose the canonical repair charge and respect reactor capacity, and a recovered scout queue must clear stale feedback. The scoped selector repair retains registered future-system markings and existing server authority. No PC07 firing action is introduced.


The ordinary mission-start panel exposed a stranded arrival after normal partition confirmation: Quellon and its Explorer moved to Fleet 2, while the pending source-bound arrival remained Fleet 1. The strict roster and server audience guards correctly denied an unbound start. Test-first `a58149a4` observes two failing callable cases with 99 passing tests, including recovery of an already-stranded opportunity; the native Firestore scenario also fails because the old document remains. Repair `db16d3ee` atomically migrates only unstarted pending arrivals with their source ship at that recorded location, preserving source transition/cycle and canonical repeatable identity. Started missions retain their immutable identity. A repeated normal confirmation can repair the preserved already-stranded game even when the groups themselves do not change. Exact replay performs no further writes.

Focused callable, partition, mission and parser checks pass (188 checks), including malformed/cross-session/chart/site/future/identity denial, target collision protection and source-location preservation. The real Firestore production-handler scenario now performs partition → canonical arrival migration → successful mission start → private deal → automatic outcomes → participant-only exploration → oversized reward delivery, retaining concurrent replay assertions. It passes in the owned isolated emulator slot; fixture authentication remains distinct from ordinary production play. Logs are `/tmp/pc06-mission-partition-{red,green,focused,native-red,native-green}.log`. The emulator exited and released its reservation.

The selector initially rejected the newly changed mission eligibility helper because no audited consumer map existed. Test-first `be052c6d` records one selector failure with 104 passes; `8e09b43d` adds the exact source transition mapping only `confirmFleetPartition`. All 105 selector checks pass and an extra unaudited helper edit still fails closed. Build 0.5.61 batches the two observed UI repairs and the mission transition repair. Independent Sol 6.1 xhigh review and final candidate/release gates remain pending. No ordinary mission or Repair Drones credit is earned by local validation.

## Reconciled repair validation and bounded taxi prerequisite

Independent Sol 6.1 xhigh review approved exact `de80e029d242f750690fa0460a46dc9ef9c82b00` without actionable findings. The first full test run retained one unchanged GM crisis-input timeout (6,690 passes); the isolated unchanged case passed in 1,883 ms. The required reconciled coordination validation then passed the full profile at that exact candidate. An initial diff check included already-landed CSV changes because the unused local main ref was stale; after proving ancestry and that no checkout held main, the owner fast-forwarded that local ref to the already-verified `origin/main` `a43a7acd`. No existing test was weakened and no checkout was moved or deleted. `/tmp/pc06-partition-final-coordination-reconciled.log` records the successful validation; no candidate push occurred.

The user explicitly requested coordinator handoff guidance. Local documentation commit `1e92b3f8` updates the canonical execution policy and AGENTS/CLAUDE projections: once owner access, context and authority are resolved, the coordinator hands back full execution and steps back. Existing parent boundary messages and no coordinator goals remain explicit. Documentation validation, all 10 repository-guidance checks and diff whitespace validation passed; the update stays in this release batch.

The parent authorized the minimum separate scout-taxi exception required by the unchanged P151 acceptance, including necessary prerequisites, while retaining P343's PC07 credit. A bounded Luna Max read-only primary audit verified the full source pages and reported the unresolved physical passenger-landing model. PC06-A15 chooses the narrower communication courier round trip, leaving player reassignment, payload transfer and rejoin outside this increment. A new bounded Luna Max group owns only the pure taxi communication contract and its tests; the checkpoint owner retains transaction, client, review and release integration. The candidate changes materially after `de80e029`, so its approval/validation will be supplemented for this new authority path before the single batched push.

For current-scenario preparation only, ordinary GM resource controls raised Quellon's Materials from 0 to 9 through successful `applyShipCounterSteps` calls. That is a declared facilitator setup correction, not mission-earned reward evidence. A fresh normal GM resume and instance-list receipt confirmed matching actor/session and a valid claim timestamp. The scoped observer grant then succeeded through normal keyboard confirmation with `setGmShipConsoleWriteGrant` HTTP 200. Earlier pointer activations had produced no dialog or request; no application authority defect is inferred from those tool interactions.

The bounded contract group completed test-first `09a95483`, fixture hardening `eb9b0c88` and pure implementation `13ecd4ed` (39 focused checks, Functions build and scoped lint pass). Owner client tests `dbd2a456` initially failed for absent modules; `cdc4838d` aligns typed fixtures. `983818e1` connects visible separate controls and exact uncertain retry handling. Owner handler tests `ec264992` initially observe 18 failures for the missing callable; `137bd64b` adds the server transaction, private audit, target-group-only note delivery, shared cadence consumption and real Firestore scenario. The transaction revalidates current authority on replay, reconstructs only the cadence preceding that attempt, and checks the persisted audit/attempt before returning without writes. The native concurrent scenario passes, retaining `/tmp/pc06-taxi-native.log`; no production seed or auth/storage manipulation is used.

The 150 focused production-handler/scout/partition checks, 61 client/shuttle/header checks and 153 Firestore rules checks pass. New private courier audit and group-note paths are explicitly denied for raw player/GM reads, listing and writes. All 107 deployment selector checks pass after test-first `c7555c89` and its exact added module inventory; unaudited additions still fail closed. The standalone local-only layout harness passes all eight viewport/motion combinations and writes `/tmp/pc06-courier-{width}x{height}-{motion}.png`; narrow and desktop images were inspected. The fixture label and replaced transport are explicit, so these are rendered checks only. Lint passes with zero errors and nine inherited warnings. Logs use `/tmp/pc06-taxi-{callable-red,callable-green,client-final,rules,layout,selector-red,selector-green,lint}.log`. No taxi deployment or ordinary credit is claimed yet.

## Independent courier review repairs

Sol 6.1 xhigh requested two P2 repairs at exact `6ce2f9f24794ed95e6f134c3f444558bd523e29b`: uncertain client requests became permanently blocked after cycle/navigation/control changes, and the native handler accepted a destroyed destination. Test-first `5ee5deb4` preserves ten failing regressions and thirty passes (`/tmp/pc06-taxi-review-red.log`). Owner repair `3288dbd0` adds a narrowly read-only `reconcileOnly` form of the existing callable. It returns only the actor-bound bounded receipt, or confirms an absent receipt after the original monotonic authority is obsolete. It never delivers a note or consumes capacity. Session/navigation transaction reads prevent an old racing request from committing after an absent obsolete receipt is confirmed. A committed visit also requires its private audit, cadence entry and unchanged original actor audience; no foreign group, coordinates or cards are returned. The client retains the exact request and draft until reconciliation, performs no automatic fresh delivery, and only permits a new request after confirmed non-delivery. Known late success stays bound for reconciliation rather than silently clearing the pending attempt.

The handler now uses the existing navigable-ship guard for both courier endpoints, including destruction and mutiny. Focused courier/scout/jump checks pass (211 before the additional late-success regression, which also passes independently); Functions build and scoped lint pass. The real Firestore production-handler scenario additionally denies destroyed anchor/destination in a fresh unconsumed cycle, checks the specific destruction rejection and unchanged delivery records, reconciles a prior committed cycle without writes, and confirms a never-delivered obsolete request cannot later commit. `/tmp/pc06-taxi-review-native.log` passes in 7,693 ms and the emulator exited/released. The local fixture remains distinct from ordinary gameplay. Full final candidate validation and bounded reviewer follow-up remain required before release. No additional ordinary acceptance or catalog credit is recorded.

A read-only charging-path audit confirms that unfinished small-ship maintenance retains its original cycle until a new legal Team `begin`; Repair Drones deliberately require a completed charge in the current cycle. The preserved Cycle 2 Gorgoneion state must finish and begin current Team maintenance before a current Coordination repair can be credited. No charging contract or stale-cycle test is weakened on this evidence.

Owner and independent reviewer self-audits both identified the absent-receipt inequality edge: fabricated future authority must not count as obsolete. Test-first `66c785f9` records three red cases (24 passes) in `/tmp/pc06-taxi-reconcile-future-red.log`; `553fabb9` requires strictly advanced safe-integer cycle/navigation/control authority. All 215 focused courier/scout/jump/client checks and the Functions build pass (`/tmp/pc06-taxi-review-{focused,build}-final.log`). The native scenario also passes again on this guard (`/tmp/pc06-taxi-review-native-final.log`), exits and releases the reservation. This supplements the pending bounded review; no gate or test is weakened and no catalog credit changes.

## Live continuation during the courier release gates

The exact candidate a1fd66dc5014ff3c9ea8035edecd8ca394e3d76c received independent Sol6.1 xhigh approval at 2026-10-01T18:08:29Z with both P2 findings resolved and no remaining actionable findings. Required full coordination validation passed all nine planned commands at that exact clean SHA; log /tmp/pc06-taxi-final-coordination.log. Branch push triggered candidate CI36907233286; deployment and ordinary corrected-path credit remain pending.

Ordinary advanceTurn returned HTTP200 to Cycle4. Preserved old Gorgoneion maintenance charged zero consoles and ended (both runSmallShipMaintenance HTTP200); its old-cycle state was not credited for a current repair. Fresh Cycle4 Team begin then normal rations spent eight Quellon food and six water (host stores became food0/water14/materials9). Unrest roll6+1+18=25 added zero unrest, retaining one; riot roll6 caused no population loss. Reactor Step4 awaits the corrected selector. The ordinary timer extension interaction only armed confirmation; it was not submitted before Team ended. No emergency pause or timer workaround was used.

The genuine participant's separate ordinary Demo preparation used Disconnect, Create a session HTTP200, then Settings Start single-player demo HTTP200. The response recorded Cycle1 with singlePlayerDemo active/finalCycle1. The Jump button was disabled and no jump request was invoked. This unconfigured session had no assigned player seat, so console actions were read-only: these are partial start-boundary observations, not full P020a credit. A future fresh ordinary setup must cast the participant and claim its reciprocal seat before starting the sole-player Demo. Explicit Disconnect is a station departure by contract and released the actor's original Explorer assignment. Normal rejoin of the preserved proof session returned HTTP200 with the same privately-compared actor and Fleet2 membership, but no assigned role. Historical jump/scout/group/refuel/failure evidence remains; future Explorer/courier actions use a new properly cast scenario rather than a closed-window re-cast or privileged mutation. No catalog credit changes.

## Courier deployment and ordinary Demo snapshot repair

Candidate CI `36907233286` passed exact `a1fd66dc5014ff3c9ea8035edecd8ca394e3d76c`. After current ancestry and unoccupied-main checks, main was fast-forwarded and pushed. Required exact-main Deploy `36910869374` passed all selected verification jobs, hosting release, `confirmFleetPartition` update and new `sendScoutTaxiCourier` creation; deployed-surface verification passed at 2026-10-01T19:12:05Z. Build 0.5.61 is deployed, with catalog credit unchanged. The concrete rerun reason was the observed selector/partition repairs and newly reviewed P151 courier prerequisite.

A separate fresh ordinary Chart A/eight-role Casting setup was confirmed by the named GM. The controlled player joined normally, received Explorer through the Casting service, and entered the station (`claimSeat` HTTP 200). The GM disconnected before Settings started the sole-player Demo (`startSinglePlayerDemo` HTTP 200, Cycle 1 active/finalCycle 1). Eight ordinary `runMaintenance` transactions returned HTTP 200: begin, storage, rations, server unrest/damage rolls, Jump Drive reactor charging, no-refuel progression with a damaged Shuttle Bay, and completion. The facilitator then rejoined normally and requested the next-cycle transition; `advanceTurn` returned HTTP 200, currentTurn 1 and complete/finalCycle 1. No Cycle 2 or jump was performed.

This walkthrough exposed a snapshot projection defect: `sessionFrom` omitted the server Demo marker, so later live snapshots restored ordinary jump controls instead of the accessible Demo boundary. Server jump denial remained unchanged. Red `5488d11c` preserves two failing active/complete snapshot cases with six malformed-marker passes (`/tmp/pc06-demo-snapshot-red.log`). Repair `7bc88d3a` hydrates only the exact two-field active/complete, finalCycle-1 marker. All 445 focused Firestore/parser, session service, Jump Drive and header tests pass; scoped lint and whitespace checks pass. Independent bounded Sol review and repaired deployed ordinary UI verification remain pending. P020a remains Pending and no catalog credit is advanced.

## Ordinary courier and source-backed Voyage repair

Fresh normal Chart A/18-role setup cast and reciprocally seated the two controlled participants as Explorer and Wing Commander before start. Cycle 1 Quellon maintenance, nonempty Hummingbird refuel and completion returned HTTP 200. The first Team jump was denied with `invalid-phase`; its legal Coordination retry committed the locked 1413 short jump, spending two fuel once and consuming its current charge. Normal fleet partition confirmation committed. Hummingbird's separate courier then returned HTTP 200 `committed`, targeting AEGIS. The receiving participant refreshed its own group and saw the bounded courier note; the Explorer's own group excluded both that delivery and the receiving group's normal acknowledgement. Shuttle custody remained docked at Quellon. Receiving and sending group-local notes were submitted normally; final reload/privacy/cadence checks remain before full P151 closure. Native Starlight submitted its first 5143 scout normally, and the ordinary GM reveal returned HTTP 200 and emptied the queue.

A source audit confirmed P250's production handler had no ordinary UI caller and P251 inherited an unsupported Jump Drive charge prerequisite. The primary Voyage sheet also exposed an incorrect static ration table, raw-count riot loss and arbitrary reactor IDs. PC06-A16 records the bounded correction. Luna's UI red commit `c4613ed3` retains four intended failures; owner server red `a45c9ab3` retains 18 failures with 28 passes before `5747d1a4` repairs printed population-dependent rations, marker loss, two allowed reactor choices, retained production charge and legal movement without a phantom drive charge. All 53 focused server/callable checks, Functions build and scoped lint pass.

The native Firestore production-handler scenario runs begin → full rations → real server unrest/riot dice → nonempty Hydroponics selection → completion → legal short jump and exact replay. It proves host food30→17/water30→20, charge persistence, host fuel3→2 exactly once and physical detachment. It passes in 6,062 ms (`/tmp/pc06-voyage-native.log`) and releases its emulator reservation. Initial native attempts rejected an incomplete test fixture lacking cycle results; that fixture was corrected without changing the production parser. Native fixture evidence is not ordinary credit. UI integration and independent review remain pending in the next material repair candidate; catalog remains unchanged.


## Completed maintenance recovery and Starlight fuel repair

The native AEGIS Cycle 2 walkthrough refuelled Starlight through the normal Shuttle Bay selection, completed Omega and ended maintenance, each HTTP 200. Its first fresh 5143 scout was accepted and revealed normally. A distinct 9997 request then failed despite the retained current-cycle refuel receipt: the fuel policy accepted only the unfinished Step 7 and discarded authority after ordinary completion. Test-first `6fb2cce5` retains two observed failures with 54 passes; `f274dd44` accepts a canonical completed-cycle timestamp at Step 0 while preserving current cycle, real fuel, known refuelled shuttle, cadence, range and actor guards. All 96 focused checks pass. The real Firestore production-handler scenario committed at `7fedc3ba` runs actual refuel → Omega → end → first scout → distinct second → exact replay → denied third, preserving zero extra cadence/fuel writes. It passes in 5,491 ms, and the emulator exited and released its reservation. This native fixture is not ordinary deployed P323 credit.

The exact deployment inventory adds both transitive consumers, `requestScout` and `sendScoutTaxiCourier`. Red `b6093463` and repair `2ac50afb` retain the missing-map failure and 111 passing selector checks; an extra unaudited edit still fails closed. This material authority change joins the pending 0.5.62 batch and bounded independent review.

Independent Sol 6.1 xhigh review at `32fba9f2613a89844eb7b2715c1aacbd7531d78e`, 2026-10-01T20:19:18Z, requested two P2 Voyage UI repairs and the cycle-copy correction together. A committed response arriving only through a newer snapshot blocked its exact uncertain retry; transient connection/freshness/GM-context unmounts discarded that attempt. An unfinished earlier-cycle maintenance state was also stranded despite the server supporting continuation. Luna's test-only `ab4ff93f` retains all three intended failures with 14 passes and owns the bounded client repair. The printed policy and source deployment transition had no review finding. Local-only rendered checks cover eight viewport/motion combinations; those remain distinct from ordinary play.

For P371, the ordinary Cycle 2 Starlight departure and Begin Transit controls accepted the AEGIS → Dione route before the natural airspace deadline. Timestamp-scoped read-only Cloud Logging observed the private `parkShuttlesAtAirspaceClosure` service at 2026-10-01T20:27:45.124018Z, Google-Cloud-Tasks user agent, HTTP 204. The queue is running and the consumed task is absent. Its session payload was not captured before consumption, so this transport observation is partial and P371 stays Pending. The next ordinary cycle will capture the queued session-bound task before its deadline; no log configuration, IAM, deadline, or privileged production data was modified for this check.


Ordinary `advanceTurn` accepted Cycle 3 with its unmodified five-minute Team and fifteen-minute open-airspace windows. The owner prepared a clearly declared facilitated Approaching Vessel scenario through the normal crisis kind, private notes, draft and delivery controls; it is not recorded as a random card draw. Ordinary `admitVoyage33` and `dockVoyage33` each returned HTTP 200. Voyage is physically recorded at 0000 with AEGIS as its real host and no admission/docking resource debit. Its repaired maintenance and movement remain unverified until 0.5.62 is deployed. P249 receives no extra catalog credit outside the fixed scope.

Native continuation regression `e975d678` moves current authority to Cycle 2 immediately after Cycle 1 rations and then finishes the preserved Cycle 1 unrest, riot, reactor and end through compiled production handlers. It retains the single ration debit, production charge and legal host-funded jump/replay. This additional native boundary passes in 5,673 ms (`/tmp/pc06-voyage-continuation-native.log`); the emulator exits and releases its reservation.


Before Cycle 3's ordinary deadline, read-only Cloud Tasks returned the queued task `airspace-close_143e19d3276a3d11f9cd14e1f02a3949f07f0e65`, cycle 3, scheduled and payload deadline 2026-10-01T20:57:53.528Z. Its session token was compared privately with the ordinary accepted scenario receipt and matched. Neither raw session identity nor payload is retained in repository evidence. Starlight's normal departure request accepted Dione; ordinary resume exposed Begin Transit, which was then submitted before the deadline. Arrival and cycle advance remain untouched pending the scheduled worker result. This records real enqueue separately from the still-pending correlated worker/parking acceptance.


The isolated GM admission route assertion failed despite all 132 tests passing together: its shared Suspense boundary awaited Voyage but not the actual sibling lazy modules. Test-only `7b7c2077` awaits those real siblings inside `act` and retains the exact mounted-region assertion. The isolated result changes from one failure to one pass (400 ms), without timeout changes, mocks replacing the route, or assertion weakening. Native `9bbc79c1` also proves the actor-bound original reactor receipt remains recoverable after a later cycle and host detachment with zero session writes; this supports the additional monotonic-context client recovery regression.


## P371 correlated ordinary completion

The initial early Cycle 3 AEGIS → Dione leg arrived normally through the app's server arrival procedure. The owner prepared a real return departure and began it at 2026-10-01T20:57:32.199Z, with normal arrival due 20:58:32.199Z and the captured natural deadline 20:57:53.528Z. Pre-deadline read-only confirmation found the real in-transit departure, pending correlated task and absent closure event. The private worker request began 20:57:53.591738Z, Google-Cloud-Tasks user agent, HTTP 204. Its privacy-safe event `airspace-close-3-9e5c1c09f39282cf` was created 20:57:57.264735Z with parkedShuttleCount 1 and the exact deadline serverTime. Before any post-deadline resume, arrival, cycle advance or other gameplay command, read-only confirmation found the event, removed departure, consumed task, Dione docking and a single deadline docked visit. Thus normal arrival or resume fallback cannot account for this parking. Logs `/tmp/pc06-airspace-cycle3-{pending,preclosure,in-transit,postworker,complete}.log` retain only bounded safe evidence; private correlation data stays outside repository evidence. This closes P371's actual enqueue/private worker/ordinary parking acceptance, with five of 49 ordinary rows Verified and the catalog still 507/751.


A separate timestamp-scoped request-log attribution check (`/tmp/pc06-airspace-cycle3-attribution.log`) finds no post-deadline resume, arrival or advance invocation before the parking event. One unrelated/uncorrelated resume preflight and rejected HTTP 401 appear eight seconds before the deadline; they could not perform deadline parking, and no session identity or cause is inferred from those global service logs. The source deadline effect updates display state only; the ordinary automatic arrival was due after the already-created parking event.


## Reconciled Voyage client recovery handoff

Luna repaired the original review findings in `e7ae2f0b`, then retained the additional monotonic-context red `1013628d` before green `1e26731f`: the exact actor/GM/session-bound request survives transient gates, cycle/revision changes and host detachment; old unfinished steps remain available before fresh maintenance, and player copy uses cycle. Twenty focused cases, typecheck, lint, build and the full 132-case GM route suite pass. Local-only rendered transport covers 320×844, 390×844, 768×900, 1440×900 and short landscape 844×390 in both motion modes, with no horizontal overflow and controls at least 44 px. Evidence is `/tmp/pc06-voyage-detached-proof.json` and screenshots `/tmp/pc06-voyage-detached-*`; these are rendered checks, not live gameplay.

Owner integration red `72394874` found that advancing only the cycle while maintenance/docking counters stayed unchanged could send an uncertain old begin request into later-cycle mutation. The owner retains the returned leaf and owns the small guard repair `11ab6195`: a changed cycle requires a genuinely later maintenance or docking counter before exact receipt recovery. It keeps all backward/future actor/receipt tests and the real committed-response recovery path. All 21 focused client cases pass, along with scoped lint and whitespace validation. The Luna worker's edit scope is completed; the independent reviewer remains distinct from every implementer. The final bounded review includes these unresolved Voyage findings and the new completed-cycle Starlight fuel authority before one reconciled 0.5.62 push.

The supported hidden GM surface also resumed normally after the deadline check (`resumeSession` and `listGmInstances` HTTP 200, GM role, Cycle 3). No credential or access blocker is inferred from unrelated historical/uncorrelated denied calls.

## Captured-cycle maintenance and read-only uncertainty reconciliation

The resumed owner preserved clean `43409b4a` and retrieved the independent Sol 6.1 xhigh findings together (2026-10-01T21:17:59Z). The reviewer reproduced a Cycle 1 command committing after advancement to Cycle 2 between the preflight and final transaction. An absent uncertain request also remained permanently held when only the cycle advanced. These are product findings, not a reason to reopen already-passed releases or a broad model-quality conclusion.

Owner red `208ff23e` binds the intended wire contract and checks the transaction boundary, obsolete absence, exact historical receipt, wrong live instance and current-cycle continuation of an earlier maintenance lane. Fixture/native tests `772c44b3` carry captured cycles through the real handler and existing exact client assertions; `fdc5498e` retains ration choices and the original attempt when six reply bindings are malformed. Repair `ebd0e6fd` fingerprints the captured current cycle, checks it inside the final transaction before every fresh mutation, and adds a read-only form of the existing callable. The same active GM instance may retrieve its exact receipt, or certify an absent request only after the captured cycle is obsolete. The old command then cannot commit late. Reconciliation preserves drafts, actor/session/request binding and all new-action holds until the result is certain. This is separate from the maintenance lane's own cycle: current-cycle commands still finish preserved earlier steps without repeating rations.

All 153 focused policy, production-handler and client checks pass, as do typecheck, scoped ESLint and Functions compilation. The native Firestore production-handler scenario pauses at the two-transaction boundary, advances the fixture cycle, rejects the delayed mutation, confirms absence with no receipt/event/session write, rejects a late retry, and then retains real ration funding, older-lane continuation, nonempty charge, jump and historical replay. It passes in 8,458 ms; the emulator exits and releases its reservation. Logs are `/tmp/pc06-voyage-cycle-{reconcile-red,reconcile-green,focused,typecheck,functions-build,native}.log`. These tests and native fixtures do not earn ordinary acceptance credit. The 0.5.62 candidate remains local pending bounded independent follow-up and final release gates; the catalog remains 507/751 with five of 49 ordinary rows Verified.

Bounded follow-up at exact `a0cccd71` (Sol 6.1 xhigh, 2026-10-01T21:37:24Z) confirmed both original server/protocol reproductions repaired and requested one P2 client recovery hold: an exact retry denied by an expired instance could discard the original uncertain request without a receipt or certified absence. Red `cac6687c` preserves two failures with 28 passes; repair `72af3e69` distinguishes recovery from a fresh submission and retains the original request and ration drafts on every recovery error. Fresh initial definitive denials retain their ordinary correction behavior. All 46 focused client/wire/handler checks, scoped lint and whitespace checks pass (`/tmp/pc06-voyage-recovery-denial-{red,green}.log`). Native server code and its exact deployment inventory are unchanged; their passed evidence is retained. The existing local-only rendered harness also passes all ten viewport/motion combinations against the repaired component; the 320-pixel composed image was inspected. Its replaced transport remains explicitly separate from ordinary proof.

The ordinary initial deal in the preserved base scenario returned HTTP 200 and created an active mission with a real chosen participant. After a normal reload, the controlled Chrome surface required a normal join; its accepted unassigned actor did not match the recorded mission leader. The cause is not inferred. A subsequent normal reload/resume returned HTTP 200 with that same newly joined actor, proving its continuity. The old mission and its private cards remain preserved, and no private mission acceptance is credited to the new actor. Further participant scenarios will join and cast the now-controlled actors normally before start.

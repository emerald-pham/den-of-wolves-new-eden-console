# Den of Wolves: New Eden — Implementation Plan and Objectives

Status: living roadmap. This document is the planning gate for future gameplay
work and records which foundation is implemented versus still incomplete.

This plan describes how to take the Companion Console from its current
server-authoritative session and console foundation to a complete,
rules-faithful game loop. It does not authorize a broad rewrite or the
creation of speculative controls. Numbered gameplay prompts select a bounded
slice of this plan and implement the smallest rules-complete increment needed
for that slice. `CLAUDE.md` governs proportional tests and workflow; ordinary
tooling and maintenance work does not require prompt registration and follows
the proportional testing policy in `CLAUDE.md`.

The plan is projected from the single machine-readable
[prompt catalog](./implementation-prompts.json). Before selecting, assigning,
starting, or editing any numbered prompt, agents may run
`npm run coordination:dependencies -- --prompt NNN` for the compact read-only
packet and should reconcile its hard prerequisites, gates, and evidence with
current `main` and coordination. The shared dispatcher controls readiness and
ordering; this plan supplies the generated acceptance view and source-of-truth
context. Ordinary tooling and maintenance fixes do not require prompt
registration or a trailer.

No application code, tests, rules, configuration, version metadata, or
player-facing changelog entries are changed by this planning document.

## Reading map and table of contents

Do **not** read the prompt catalog from top to bottom for an ordinary
implementation slice. Fixed numeric line ranges are intentionally not
prescribed because checklist and evidence edits move them. Use the stable
headings and targeted searches below.

Default reading path for one prompt:

1. Read the compact, read-only dependency packet for the exact prompt when
   dependency context is needed. Use `--full` only when auditing the generated
   [`IMPLEMENTATION_PROMPT_DEPENDENCIES.md`](./IMPLEMENTATION_PROMPT_DEPENDENCIES.md).
   Do not select a prompt until hard prerequisites, milestone/contract/owner
   gates, and coordination ownership are reconciled with current `main`.
2. Read the selected row in the compact
   [`IMPLEMENTATION_MILESTONES.md`](./IMPLEMENTATION_MILESTONES.md) completion
   route, including its dependencies and exit fixture.
3. Read [Product objectives](#product-objectives), the relevant part of
   [Scope and baseline](#scope-and-baseline),
   [Existing behavior is the design baseline](#existing-behavior-is-the-design-baseline),
   and the affected row in
   [Source-of-truth and decision policy](#source-of-truth-and-decision-policy).
4. Read [Prompt status legend](#prompt-status-legend),
   [Contract carried by every numbered prompt](#contract-carried-by-every-numbered-prompt),
   and only the selected prompt definition.
5. Read the matching ledger row in
   [`IMPLEMENTATION_PROGRESS.md`](./IMPLEMENTATION_PROGRESS.md), then the exact
   printed references routed for the mechanic.
6. Use `CLAUDE.md` for workflow, validation, review, merge, and release rules;
   do not reread duplicated workflow prose here.

If the branch is rebased, current `main` materially moves, or a prerequisite's
status or ownership changes, stop and rerun the read-only packet, then
reconcile coordination before continuing. A
prompt cannot be marked complete or merged while a hard prerequisite remains
unmet; closure/evidence gates are completion checks, not inferred start locks.

`NEXT` (the first item in `READY_QUEUE`) is the primary resume/default lane, but
it is advisory for concurrency, not a serial execution lock. A separate
worktree may claim a later `READY_QUEUE` item concurrently only when its hard
prompt prerequisites are done, every hard milestone, hard contract, and
decision-owner gate is satisfied or explicitly confirmed, and the coordination
forecast shows conflict-free ownership with no active claim overlap. A worktree
must not bypass an unmet dependency, active claim, or unresolved decision-owner
gate merely because the prompt is independent.

Targeted lookup example:

```bash
prompt_id=012
rg -n -A 2 "^- \*\*Prompt ${prompt_id} —" docs/IMPLEMENTATION_PLAN.md
rg -n "^\| ${prompt_id} \|" docs/IMPLEMENTATION_PROGRESS.md
rg -n '^## |^### |^#### ' docs/IMPLEMENTATION_PLAN.md docs/IMPLEMENTATION_MILESTONES.md
```

Read the full plan only for roadmap restructuring, prompt-ID changes, a
cross-cutting architecture decision, or the final release-readiness audit.

Contents:

- [Product objectives](#product-objectives)
- [Scope and baseline](#scope-and-baseline)
- [Existing-behavior design baseline](#existing-behavior-is-the-design-baseline)
- [Detailed player stories and exit gates](#player-story-milestones-and-atdd-exit-gates)
- [Source and decision policy](#source-of-truth-and-decision-policy)
- [Coverage lanes](#staged-implementation-plan)
- [Review budget and evidence reuse](#review-budget-and-evidence-reuse)
- [Test-first plan delta](#test-first-execution-contract)
- [Roadmap definition of done](#definition-of-done-for-the-roadmap)
- [Prompt queue and tested-foundation snapshot](#prompt-by-prompt-atdd-build-sequence)
- [Prompt checklist](#prompt-checklist)
- [Prompt definitions by domain](#foundation-session-casting-and-start-prompts-001090)

## Product objectives

The implementation is complete only when all of these objectives are met:

1. **Let one facilitator run a complete game.** A single authorized
   facilitator can create and configure a session, cast the supported player
   count, run every turn through Team and Coordination phases, resolve the
   fleet's meaningful decisions, reach a defined New Eden outcome or failure
   state, and show a coherent debrief. Multiple simultaneous GMs remain
   supported as optional collaborators, never as a readiness or workload
   dependency.
2. **Match the printed game.** Ship sheets, shuttle sheets, role briefs,
   loyalty rules, star charts, Wolf attacks, away missions, resources,
   maintenance, population tracks, and endgame requirements use the printed
   component as the authority for specific values. Genuine ambiguities are
   recorded as facilitator/product decisions rather than silently guessed.
3. **Keep shared state authoritative.** Clients may read the state they are
   entitled to see and may write only their own permitted presence data. Every
   action that affects gameplay, randomness, secrets, roles, resources,
   movement, damage, or victory is validated and committed by a callable
   server transaction with Firestore-rule denial coverage.
4. **Make every role useful.** All supported player counts have a valid role
   configuration, every selected role has meaningful work during the game,
   replacement roles can be used before the game ends, and the Capybara
   expansion is distinct from the base-game small-ship Capybara. The supported
   Capybara-expanded core roster reaches 8–20 players under the source-derived
   expansion contract. The owner-set high-count rows are 19 = printed base-17
   plus the atomic Captain/Recycler pair and 20 = printed base-18 plus that
   pair; both use two Wolves. Exact lower-count 8–18 expansion substitutions
   remain an explicit facilitator/product decision until recorded. SNN Press is a deliberate New
   Eden Console extension outside the original reference documentation: an
   enabled Press Officer may be the twenty-first player without changing core
   roster, readiness, loyalty, Wolf, or facilitator math.
5. **Preserve the shared console system.** New ships, shuttles, roles, and
   instruments extend the existing typed definitions and shared templates.
   Per-vessel exceptions are explicit configuration or modules, never copied
   route trees or vessel-ID branches scattered through shared components.
6. **Remain usable at the table.** Players and facilitators can find the
   current authority, phase, location, resource, damage, alert, and next
   action at a glance on phones, laptops, shared displays, and short
   landscape screens. Every non-landing view has an obvious accessible return
   path and no control claims to do work it cannot perform.
7. **Survive the operating envelope.** One game supports the documented
   20-player target and up to 60 legitimate browser clients, including shared
   venue networks, reconnects, live snapshots, and presence renewals, without
   losing authoritative actions or making abuse controls unusable for a real
   table.
8. **Ship safely.** Every product increment has failing-first tests, relevant
   security and UI verification, rendered review where applicable, aligned
   version/changelog metadata, local release gates, and a concise handoff.
9. **Automate routine play and keep intervention rich.** Deterministic
   arithmetic, randomness, validation, phase progression, and resulting
   mutations run through server-authoritative game systems with a visible
   calculation receipt. The facilitator remains the RPG GM: they can pause,
   inspect, override, correct, and resolve genuine choices or ambiguities, but
   do not perform mental arithmetic, duplicate a calculation, or transcribe a
   result between screens.

### Active goal addendum — owner-set completion contract

Bind every roadmap slice and review to these explicit product goals:

1. Start with the existing-app evidence dossier, history, characterization
   tests, and narrowest compatible extension; repair stale green gates instead
   of allowing them to redefine known working behavior.
2. One facilitator can run the whole game through automation-first routine
   paths and intervention-rich controls; multiple GMs remain supported but
   optional.
3. Core casting is the Capybara-expanded 8–20 target. The 19/20 rows are the
   owner-set base-17/base-18 plus atomic Captain/Recycler pair; lower-count
   Capybara substitutions remain undecided. Optional Press is a distinct,
   non-counting twenty-first player station.
4. Press is a deliberate product extension outside the printed references,
   enabled by default but authoritatively toggleable. It remains isolated from
   core roster/readiness/Wolf-count math, preserves the one-player-role rule,
   and gives its distinct claimant a private loyalty and normal Wolf eligibility
   without adding a third Wolf.
5. Connection copy, Press controls, and complete DRADIS contact names satisfy
   the mapped CIC/aesthetic, viewport, keyboard/screen-reader, touch, privacy,
   and reduced-motion contracts.
6. Every feature carries the interaction-contract matrix across navigation,
   docking/transit/airspace, DRADIS, turns, canonical IDs, callables/audit,
   broadcasts, damage/resources, reconnect/replay, accessibility, and optional
   multiple GMs.
7. Wolf attacks become fully playable from the GM console through affected
   player consoles with authoritative automation, calculation receipts,
   interventions, and stable DRADIS-ready projections/events. Ultimate DRADIS
   attack visualization remains explicitly owner-deferred.
8. SNN initial host is derived from the locked roster: preserve AEGIS at 8–11,
   where Dione is absent, and use Dione at 12+ when present; legacy missing-
   docking hydration follows the same compatibility rule.
9. The Capybara printed v1.1 source and provenance are routed into every
   affected prompt. The Scrap Refinery visual authority is `7♠`; hidden `5♦`
   extraction text is provenance-only, not a gameplay ambiguity.
10. Roadmap work follows the current one-owner, proportional validation and
    release policy in `CLAUDE.md`. Evidence and status claims stay accurate to
    the declared slice; partial work is not described as complete.
11. This completion campaign adds no model sequence, delegation requirement,
    phase floor, or mandatory coordination closeout beyond `CLAUDE.md`.

Validation must prove this list is still represented in the applicable plan,
contract, progress, aesthetic, test, and acceptance records. A bounded release
may implement only its declared slice, but it must not contradict or falsely
claim completion of the remaining 734-prompt roadmap.

Agent roles, review, and escalation follow the current `CLAUDE.md` policy;
this plan sets no durable phase floors or workflow override.

## Scope and baseline

### Intended product scope

- Base game: the documented 8–18 player roster, six core fleet ships, Wolf
  agents, extra roles, and the reference game's six-to-eight turn structure.
  The printed facilitation source assumes two fixed facilitators; the New Eden
  Console deliberately extends that operating model so one facilitator can
  perform both responsibilities while any additional GMs collaborate
  optionally.
- Expansion path: the S.A.N.S. Capybara as a separately enabled two-player
  ship, with Scrap, Macaw, Boa, Captain, and Recycler. It replaces the base
  extra small-ship Capybara when enabled; the two versions must never be
  merged by name alone. The Capybara-expanded core casting target is 8–20
  players. The 19/20 rows are settled as printed base-17/base-18 plus the atomic
  Captain/Recycler pair; exact 8–18 replacement rows remain a source/facilitator
  decision rather than a reason to invent a matrix or count an optional Press
  station as core crew.
- Product extension: SNN Press is not defined by the original printed
  references. It is an independently configurable New Eden Console station,
  outside the core roster and facilitator population. When enabled, exactly one
  player may hold Press authority as an optional twenty-first role holder;
  multiple authorized GM instances remain separate and consume neither a core
  nor Press seat.
- Operating target: one table/game with up to 20 core players, an optional
  twenty-first Press player, multiple non-counting GM instances, and up to 60
  concurrent browser clients. The load target is a validation requirement,
  not permission to weaken per-session authority or rate limits.
- Product surfaces: player role consoles, shuttle consoles, shared fleet
  instruments, GM/facilitator controls, live alerts and broadcasts, and an
  explicit end-of-game debrief.

### Foundation to preserve

The current repository already contains substantial infrastructure that future
work should extend rather than replace:

- Session creation, joining, resume, presence leases, seat ownership, GM
  access, GM instances, observer mode, turn-zero gating, and debrief state in
  `functions/src/index.ts`, `functions/src/sessionLifecycle.ts`,
  `functions/src/gmAccess.ts`, `src/lib/sessionService.ts`, and
  `src/store/useSessionStore.ts`.
- Typed game/session shapes in `src/types/game.ts`, lazy Firebase wiring in
  `src/lib/firebase.ts` and `src/lib/firestore.ts`, and the callable/rules
  authority boundary in `functions/src/` and `firestore.rules`.
- Typed ship and shuttle definitions in `src/data/vessels/`, derived fleet
  catalogs in `src/data/ships.ts` and `src/data/shuttles.ts`, shared ship and
  shuttle shells, and role workspace templates documented in
  `docs/CONSOLE_ARCHITECTURE.md`.
- Server-side resource, unrest, population, maintenance, damage, counter
  batching, rollback, role configuration, shuttle docking, DRADIS, turn
  timing, and alert primitives. These are foundations to verify and complete,
  not proof that every printed mechanic is implemented.
- Existing player, GM, DRADIS/starmap, maintenance, population, fleet ticker,
  turn announcement, and debrief surfaces under `src/routes/` and
  `src/components/`.

### Existing behavior is the design baseline

Working functionality is the default design baseline for every roadmap slice.
Do not modify it unless the selected acceptance story makes that change
absolutely necessary. Before designing, inventory the current production path,
tests, release notes, and relevant Git history; reuse its identifiers, routes,
authority, state transitions, copy, accessibility, and visual language through
the narrowest compatible extension.

Apply these gates before implementation:

1. Write characterization or regression coverage for the known working
   behavior before adding the new acceptance. For an owner-reported regression,
   locate the last known working commit and the regression diff before choosing
   a repair.
2. Treat green tests as evidence, not infallible intent. When known or
   owner-reported behavior is missing while current gates remain green, classify
   it as contract drift: review provenance, revise the plan, contracts, and
   progress ledger first, correct or replace any test that blesses the
   regression, and add a composed regression test that would have caught the
   real user path. Do not preserve a passing fixture that enshrines the defect.
3. Any intentional departure from working behavior must record why it is
   necessary and list every affected player, authority, data, accessibility,
   security, and operations contract. Prefer a narrow compatible extension;
   preserve unrelated behavior.
4. When a departure changes durable state or compatibility, document migration
   and rollback before implementation. The final gate must exercise both the
   retained old acceptance and the new acceptance, including their composed
   user journey.

5. Before design or implementation, publish an existing-app evidence dossier
   and reuse map for the selected slice. Inventory the current UI flows,
   routes, components, styles, tokens, domain and schema, server callables,
   rules/auth/audit paths, tests/fixtures/emulator stories, printed and
   repository references, changelog and Git provenance, canonical names and
   IDs, responsive/accessibility/reduced-motion behavior, and every affected
   cross-system data/control flow. State assumptions and unknowns explicitly.
   Write characterization tests for the retained behavior and prove the
   composed interaction before introducing a new design. For the Press
   recovery, this dossier includes the independent-station history and the
   create-session-to-role-picker path; a passing isolated widget is not
   evidence that the recovered station is composed correctly.

6. Apply an aesthetic conformance gate to every new or changed surface before
   its tests are treated as complete. Map the slice to the applicable sections
   of [`AESTHETICS.md`](./AESTHETICS.md), preserve CIC visual language,
   hierarchy, state colors, exact copy semantics, viewport containment,
   keyboard and screen-reader behavior, 44px touch targets, motion behavior,
   and `prefers-reduced-motion`, then capture representative visual and
   accessibility evidence at 320x844, 390x844 where the ship gate uses it,
   1440x900, and 844x390 plus reduced motion. Review intact/damaged and
   pending/rejected states, keyboard/touch/screen-reader/non-color cues,
   reconnect and return paths. An intentional deviation requires a necessity
   rationale in the slice record. Prompt 275a therefore maps ConnectionIndicator
   copy and state treatment, the Independent Stations Press toggle/card/console,
   and DRADIS complete-name labels to those gates.

7. Use an interaction-contract matrix for every slice. A feature may not ship
   as an isolated widget: each affected existing system must be marked as
   participating or intentionally excluded, with a reason, authority,
   composed acceptance story, and regression test. Preserve existing behavior
   unless an explicit necessity is recorded. The minimum matrix for Press
   recovery and the Capybara plan is:

   | Existing system | Press state | Capybara state |
   |---|---|---|
   | Star maps, navigation, routes, and distance | Participates through the shared Press route and return path; no new movement or distance math | Participates in the full-ship/stations integration; printed v1.1 rules are source authority, with canonical route and distance authority |
   | Docking, transit, and airspace | Participates for the existing shared shuttle route; no invented transit authority in this slice | Participates in the full Capybara ship/stations slice, including its printed docking/transit contract; do not invent Macaw/Boa telemetry |
   | DRADIS, contact naming, projection, and privacy | Participates in complete Press/shuttle labels and audience-safe projection; no hidden-coordinate leak | Participates with the expansion ship/stations contacts and privacy rules; CIC presentation remains a product contract |
   | Turn 0/Turn 1, phases, and timing | Press roster selection remains outside core setup; the SNN Dispatch Desk is explicitly exempt from generic Turn Zero UI/action restrictions and must stay visible and actionable to its enabled claimed Press Officer. Other phase gates remain authoritative | Participates where Capybara actions require printed phase/timing rules |
   | Canonical role/session/ship/shuttle names and IDs | Participates; reuse `press-officer` and `snn-press-shuttle` IDs and shared templates | Participates; reuse canonical expansion role, vessel, and shuttle IDs |
   | Authoritative callables, rules, auth, and audit | Participates; toggle, claim, reconnect, presence, dispatch, dismiss, and confetti remain server-owned and auditable | Participates for every Capybara mutation; no client-only authority |
   | Broadcasts and transmissions | Participates only for existing guarded Press dispatch behavior | Participates in the full ship/stations event and broadcast composition |
   | Damage, resources, and capacity | Intentionally excluded from core math; Press is the optional 21st holder and does not alter readiness, loyalty, Wolf, or capacity | Participates in the full expansion resource/damage/capacity contract |
   | Reconnect and replay | Participates through stale Press authority, replay-safe claims, and preserved dispatch history | Participates through full ship/stations reconnect and replay behavior |
   | Accessibility and aesthetics | Participates in the conformance gate above, including reduced motion and all required viewports | Participates in the same gate for the full ship/stations surfaces |
   | Multiple GMs | Participates; authorized instances remain independent and consume neither roster nor Press occupancy | Participates without coupling GM count to Capybara roster seats |

   The matrix is a planning contract, not a claim that the listed future
   Capybara mechanics already exist. The selected slice must attach named
   characterization, composed, callable/rules, and visual/accessibility
   evidence to each participating row and preserve an explicit exclusion.

For the Press restoration, history is the required starting point. Commit
`71b5ad7` added the unconditional independent station, `9c48e5d` made it
toggleable through `activeRoleIds`, and `dced782` retained that behavior. The
release 0.3.4 at `1418146` is the last default-working release point and direct
parent of regression `9d68158`.
Commit `9d68158` regressed discovery when session creation switched to the
8–18 `recommendedRoleIds` presets, and `e5aca326` cemented the conflicting
readiness model. A narrow `SessionMode` fixture that expected Press to hide,
combined with no create-session-to-role-picker composition test, allowed the
regression to stay green. Recovery must preserve the proven station and action
paths while replacing the counted-role toggle with dedicated optional
`pressEnabled` authority outside `activeRoleIds` and readiness.

### Known planned or incomplete areas

The following are explicitly documented as future or partial work and must be
handled as real roadmap items rather than represented by disabled fiction:

- Authoritative shuttle movement, retargeting, in-transit state, airspace
  enforcement, sampled DRADIS positions, and travel ledgers described in
  `docs/SHUTTLECRAFT.md`.
- Full action-resolution loops for ship consoles, shuttle capabilities,
  jumps, scouting, away missions, Wolf attacks, loyalty actions, crises,
  research, upgrades, resource transfer, and the three New Eden candidates.
- A coherent server model for hidden loyalties, facilitator-only information,
  secret outcomes, and the minimum visible audit records needed by players and
  GMs.
- A clear game-end transition from active play to success/failure debrief,
  including the resolution requirements of the selected New Eden candidate.
- Evidence-based capacity/abuse hardening described in
  `docs/ABUSE_PROTECTION_HANDOFF.md`; this is an operational workstream, not
  an excuse to add an unmeasured proxy or raise limits blindly.

## Player story milestones and ATDD exit gates

For ordinary planning and prompt selection, use the compact dependency map in
[`IMPLEMENTATION_MILESTONES.md`](./IMPLEMENTATION_MILESTONES.md). The detailed
stories below remain the canonical acceptance narrative and are read only when
the selected slice touches that story or changes milestone scope.

The following milestones turn the product objectives and the roadmap phases
into player-facing acceptance stories. They are deliberately end-to-end
vertical slices rather than component or callable checklists. A milestone is
green only when its stated player/GM outcome works against authoritative state,
has a visible result and failure path, and satisfies the cross-cutting contract
below. Several of the original milestone ideas are intentionally split: a
DRADIS filter is not the same thing as a playable split fleet, a Wolf attack is
not the same thing as recovering from its aftermath, and a jump button is not
the jump authority.

### Release objective — SNN Press and operational readout regressions

This bounded release completes Prompt 275a while strengthening the connected
Prompt 598 and Prompt 605 contracts. It restores the previously working Press
station through the history/provenance gate above and repairs how a player
discovers the station and reads shared header/DRADIS instrumentation on the way
into it.

- **Given** a browser that has not joined a session, **when** the shared header
  renders its optimistic default connection state, **then** the player-facing
  label is exactly `CONNECTED` in the established uppercase CIC style. **Given**
  that browser has joined a session whose Turn 1 snapshot has not occurred,
  **when** the header reports the boot gate, **then** and only then it says
  exactly `NOT CONNECTED — AWAITING IRIS AUTHENTICATION`; the first Turn 1
  snapshot restores the ordinary in-session label without changing command
  authority.
- **Given** any named DRADIS contact at the edge of the plot, including a long
  fleet or shuttle name, **when** the contact is rendered, sampled, moved, or
  viewed at 320×844, 1440×900, or 844×390, **then** its complete visible name
  stays inside the DRADIS viewport. Reduced motion preserves the same name and
  containment while removing nonessential movement.
- **Given** an authorized GM has enabled the optional Press extension for a
  joined supported session, **when** a player opens `Independent stations`,
  **then** the SNN Press Shuttle and Press Officer are selectable as one added
  station, the shared shuttle route loads, and its visible return control
  reaches the roster. **Given** Press is disabled, **when** any client discovers,
  claims, resumes, publishes, dismisses, or reports presence for Press, **then**
  the UI hides the station and the server rejects new Press authority or action
  without changing shared state.
- **Given** one connected player has authoritatively claimed Press Officer,
  **when** that player publishes or dismisses an SNN dispatch, **then** the
  server still enforces membership, exclusive live console ownership, Turn 1,
  session, and revision checks; another player cannot impersonate Press and a
  rejected action makes no shared-state change. The dispatch, shuttle console,
  live status, focus, and reduced-motion presentation remain accessible.
- **Given** the locked core roster excludes Dione below 12 players, **when** a
  new 8- or 11-player session initializes SNN, **then** its product-extension
  initial host is AEGIS, preserving the working `9c48e5d`/`dced782` behavior.
  **Given** Dione is present at 12, 18, or 20, **then** SNN starts at Dione. The
  server derives the host from the locked core roster and the client hydrates
  that authority; neither side hard-codes blanket Dione. Legacy missing-docking
  sessions normalize by the same rule without rewriting valid visit history.
- **Given** a Capybara-expanded 20-player core roster, **when** Press is enabled
  and claimed, **then** the Press Officer is a valid optional twenty-first
  player-role holder while all core roster, start/readiness, loyalty, Wolf, and
  capacity calculations remain unchanged. The claimed Press holder has its own
  Press assignment/private loyalty and remains eligible for the preserved Wolf
  assignment rules, but Press never adds a third Wolf or changes core N. Press
  remains one distinct player console role and cannot be a second role for a
  core-role holder; the existing one-role assignment gate remains authoritative.
  GM facilitator instances do not consume a player seat, and an enabled but
  unclaimed Press never blocks start. Multiple
  simultaneous authorized GMs remain valid and consume neither core nor Press
  occupancy. Disabling Press invalidates new Press authority consistently
  without collapsing unrelated GM instances or mutating core assignments.

**Dependencies:** preserve the exact base-roster Prompt 004/051 casting and
setup-readiness contracts while keeping the planned 8–20 Capybara-expanded core
distinct from Press. Recover the existing typed
`press-officer`/`snn-press-shuttle` catalog, `/press` shared shuttle route,
server-owned presence claim, guarded Press dispatch callable, and shared
`ContactPlot`; add dedicated `pressEnabled` session authority instead of
encoding Press inside counted `activeRoleIds`. This objective does not add
general shuttle movement, define the remaining Capybara roster matrices, or
claim Prompt 605 complete beyond the viewport-safe contact-name regression.

**Compatibility and rollback:** this is an additive session field, not a
counted-roster migration. New sessions persist Press enabled by default, and a
legacy session with no `pressEnabled` field reads as enabled on both client and
server to preserve the last working default. The GM transaction materializes
the field and, when disabling Press, revokes any live Press claim without
deleting core assignments or dispatch history. Deploy authoritative function
denials before exposing the client toggle. Retain the additive field during a
rollback; do not roll server authority back to a version that would honor Press
actions while a session is explicitly disabled. SNN host migration is a narrow
compatibility repair: `9c48e5d`/`dced782` used AEGIS, `4703e43` introduced
blanket Dione even though printed authority removes Dione below 12. Preserve
stored valid docking/visit history; derive only creation and legacy missing-
docking defaults from the locked roster.

**Exit gate:** characterization and focused tests first fail on the recovered
Press/default-discovery, configuration, create-session-to-role-picker,
disabled-denial, reconnect/stale-claim, 20-core-plus-Press, multi-GM, header,
8/11/12/18/20 SNN-host compatibility, and DRADIS regressions, then pass.
Misleading fixtures that blessed counted
Press or hidden-by-default behavior are corrected rather than preserved. The
authoritative Press claim/dispatch denial cases remain green; responsive and
reduced-motion visual review finds no clipped contact name or trapped route;
both retained and new acceptance stories pass the complete reconciled product
release gate.

### Release objective — Prompt 004 exact 8–20 roster catalog

This bounded Milestone 1 prerequisite completes only Prompt 004. It extends the
canonical client/server roster catalogs through the settled 19-player row and
proves exact support for every integer from 8 through 20 without claiming that
creation, persisted configuration, casting, readiness, automatic private setup,
or Turn 1 composition is complete. Those production stories retain their own
Prompt 021/051/054/073/075/020/654 evidence gates below.

**Source and product decisions:** preserve every printed base roster from 8
through 18 under `AMB-13`. The two settled expansion rows are exactly 19 = the
printed base-17 roster plus the atomic `capybara-captain` and
`capybara-recycler` pair, and 20 = the printed base-18 roster plus that pair;
both derive two Wolves. The printed expansion permits lower-count substitution
but does not define its exact roster rows, so Capybara expansion requests from
8 through 18 remain unavailable until the owner records that decision. Base or
no-Capybara modes cannot claim the 19/20 expansion rows. `press-officer` is the
separate optional product-extension station and no GM instance is a core role;
neither can fill, replace, or increase a core row.

**Existing-app reuse dossier:** extend only the shared client/server
`recommendedRoleIds` catalogs and their common count derivations. Reuse the
current `GmConsole` Setup panel and local roster staging/one-confirmation
interaction as the observable consumer; creation/guards/hydration may inherit
the shared supported-count result but are not redesigned in this slice.
Characterize and otherwise preserve `sessionService`, immutable session
configuration, casting/start callables, readiness, turn transitions, event and
secret paths, Wolf selection, live session, broad direct-write denial, and all
canonical role/vessel/shuttle/route/event IDs. Preserve the `/roles`,
`/console`, `/gm`, and Press routes; the SNN AEGIS-at-8–11/Dione-at-12+ host
rule; current connection, DRADIS, ticker, return-navigation, reconnect, and
reduced-motion behavior; and the shared CIC controls in `cic.css`. Do not add a
parallel setup wizard, callable behavior, client-owned random choice, second
roster catalog, or start-path change under Prompt 004.

The chronological red-first proof was missed before implementation. A separate
retrospective baseline reconstruction applied only the nine intended test diffs
to the old runtime and produced 9 failed files, 13 failed tests, and 171 passed
tests; that establishes regression sensitivity but is not a chronological TDD
receipt. The reconciled 0.3.11 evidence now completes this catalog slice.
Client/server tests prove exact ordered and unique rows for all 8–20 counts,
invalid boundaries, Union/vessel and Dione derivation, two Wolves at 19/20,
Press/GM exclusion, Dione-derived SNN hosting at 19, and the GM's locally
staged 19-role Recommended player count. Creation guards and hydration prove
only inherent shared-count propagation; production configuration persistence,
casting, readiness, start, seat provisioning, and Turn 1 remain their
follow-on prompt evidence.

#### Prompt 004 acceptance stories

- **Given** the canonical client and server roster catalogs, **when** every
  integer count from 8 through 20 is requested, **then** each returns a unique,
  canonically ordered roster with exactly that many roles. Rows 8–18 remain the
  current printed/`AMB-13` base rows; row 19 is the ordered base-17 row followed
  by `capybara-captain` and `capybara-recycler`; row 20 remains the ordered
  base-18 row followed by the same atomic pair.
- **Given** 19 or 20 core players, **when** shared derivations inspect the
  roster, **then** Capybara is active once, Dione remains active, the SNN Press
  Shuttle's existing roster-derived host is Dione, and the Wolf threshold
  derives two. `press-officer` and GM instances never appear in or increase the
  core catalog and no third Wolf can be inferred from them.
- **Given** 7, 21, a fraction, malformed input, or any non-integer outside the
  supported matrix, **when** the roster/count boundary is queried, **then** it
  returns no roster or rejects through the existing typed validator without
  inventing a nearby row. The source-permitted but unresolved 8–18 Capybara
  substitution matrix remains unavailable and no catalog entry is fabricated
  for it.
- **Given** an authorized GM opens the existing Setup panel, **when** they select
  19 in Recommended player count, **then** the current local-staging interaction
  shows exactly 19 roles including both Capybara roles, makes no command before
  confirmation, and retains the existing accessible status, role grouping,
  return path, and CIC presentation. Production persistence and start remain
  Prompt 051 work; this catalog release must not mark them complete.

**Prompt 004 non-goals:** do not change callable persistence, assign players,
create loyalty secrets, choose Wolves, remodel facilitator responsibilities,
change readiness, start Turn 1, or add Capybara maintenance/craft/economy work.
Creation guards and session hydration may receive narrow parity coverage only
where the shared supported-count catalog propagates automatically; that evidence
does not complete Prompt 021 or Prompt 051. Lower-count Capybara substitution
remains unavailable pending an owner decision.

**Prompt 004 exit gate:** first observe the client/server row-19 catalog and GM
staging acceptance fail. Then prove exact ordered and unique rows for all 8–20,
invalid 7/21/fraction/malformed boundaries, two Wolves at 19/20, no Press/GM in
core math, Dione-derived SNN hosting at 19, client/server parity, and no command
during local staging. Preserve all existing base/Press behavior. Run the full
reconciled product release gate; because the GM Setup output changes, review
320×844, 390×844, 1440×900, and 844×390 plus reduced motion for containment,
focus, readable status, 44px operation, return navigation, and CIC consistency.

### Release objective — authoritative configuration, production seating, and one-GM staffing

Release 0.3.12 is the next dependency-ordered Milestone 1 slice. It completes
Prompt 021, repairs and completes Prompt 030, and completes Prompt 073. It adds
production configuration-and-seating evidence to Prompt 051, which remains
partial until casting, readiness, start, and Turn 1 are proven in their own
release. This slice must not assign Wolves, initialize private setup, evaluate
start readiness, start the game, or claim Prompt 020, 054, 075, or 654.

#### Session goals

- [ ] Persist one canonical setup tuple instead of independent controls that
  can drift: core player count, setup mode, chart, turn limit, Dione and
  Capybara decisions, ordered core role IDs, and the derived active-vessel set.
- [ ] Provision one stable, visible, authoritative seat for every core role in
  the confirmed 8–20 roster; connect player claim/release to the existing
  callable, projection, reconnect, and audit paths.
- [ ] Make every setup mutation compare `expectedSetupRevision`, use a durable
  `requestId`, commit atomically, and return an explicit committed/replayed/
  stale receipt without orphaning seats or configuration.
- [ ] Let one active GM instance carry both printed `main` and `assistant`
  responsibility labels while optional additional GMs may share or hand off
  either label. Responsibility labels describe facilitation work; they do not
  create authority and do not require a second person.
- [ ] Migrate legacy singular responsibility data deterministically without
  invalidating live GM authority or rewriting unrelated sessions.
- [ ] Preserve SNN Press as a default-enabled, separately toggleable
  Independent Station: a claimed Press Officer is an optional distinct 21st
  player, never a core seat, role, vessel, or count. GMs remain outside every
  player count.

#### Existing-app evidence and reuse boundary

The production audit on the 0.3.11 baseline found useful primitives but no
composed player path. `createSession` persists configuration and an owner
player but creates no seat documents. `setActiveRoleConfiguration` and
`applyRolePreset` update only role IDs, so player count, mode, Capybara/Dione,
vessels, seats, and setup revision can disagree. `claimSeat` and `releaseSeat`
update a seat and player pointer in isolation, but accept no request/revision,
advance no setup revision, and append no roster event. Client hydration already
subscribes to seats, but the service and route surfaces expose no claim/release
command. GM instances store one singular responsibility and reject a second
holder, so one GM cannot represent both duties. Existing green tests cover
these isolated primitives; they are regression guards, not production
composition evidence.

Extend those seams rather than building a second setup system. Reuse the
existing `/console`, `/roles`, and `GmConsole` setup surfaces, session store,
callable transport, request/error conventions, session/event collections,
presence/reconnect logic, canonical role/vessel IDs, star-map and navigation
routes, Turn 0 phase, DRADIS and FleetBroadcast projections, and square CIC
components. The server remains the authority for validation, roster/vessel
derivation, revision arithmetic, transactions, and migration. The client owns
only an accessible local draft and submits one complete command. Do not add a
detached wizard, a client-writable seat collection, a second roster catalog,
or UI-only responsibility authority.

The legacy Capybara and Dione mutators are a coherence hazard: no callable may
continue changing one member of the setup tuple outside the authoritative
compare-and-set transaction. They may delegate to the unified command or be
retired from the client surface, but their old wire names must not bypass the
tuple validator. Press enablement remains a separate independent-station
configuration because it is not part of the core tuple or seat catalog.

#### Authoritative state and command contract

- A confirmed setup has one nonnegative `setupRevision` and one canonical
  tuple. The server derives and validates the exact ordered role and vessel IDs
  from the count/mode; it rejects unsupported 7/21, fractions, malformed
  fields, duplicate IDs, partial Capybara pairs, base-mode 19/20, unresolved
  lower-count Capybara substitutions, and inconsistent chart/turn-limit
  options before any write.
- `createSession` writes revision zero, the canonical tuple, and deterministic
  core seats in the same atomic creation. A seat ID is derived from its stable
  canonical core role ID rather than list position, so reconnect and unchanged
  configuration preserve identity. Seat label and vessel/faction metadata are
  server-derived display data, never authority supplied by the client.
- Confirming a changed unlocked tuple uses `requestId` and
  `expectedSetupRevision`. One transaction validates live GM-instance
  authority, compares revision, rejects removal of any claimed seat, writes the
  whole tuple, creates/updates/removes only unclaimed derived seats, advances
  one revision, and appends one redacted setup event. The request receipt binds
  the actor, input fingerprint, prior/new revision, and result. An identical
  retry replays the original result; reusing the ID with a different payload
  rejects; two-GM races commit at most one revision.
- A player's claim and self-release use the same request/revision discipline.
  The transaction verifies active membership, Turn 0/unlocked state, stable
  seat membership in the confirmed roster, vacancy or ownership, and agreement
  between the player pointer and seat document. It updates the seat, player
  pointer, session revision, and one append-only member-safe event together.
  An authorized live GM may release a seat through an explicit intervention
  carrying a reason; ordinary players cannot release another player.
- Reconnect hydrates the server tuple, seats, player pointer, responsibilities,
  and latest setup revision before replaying an outbox command. A stale local
  draft may be shown as unsynchronized but cannot overwrite committed state.
  Downsize, claim/release, and responsibility conflicts expose nonsecret
  categories and recovery actions without leaking loyalty or future Wolf data.
- GM-instance projection gains a normalized responsibility collection while
  retaining read compatibility with legacy singular `responsibility`.
  Migration maps a valid legacy value to the equivalent one-item collection;
  if it is the sole active GM, the normalized effective assignment covers both
  printed labels so the one-person contract is not lost. Invalid legacy values
  become no assignment, not authority. The first active GM in a new session
  starts with both labels; later GMs start unassigned. A revisioned GM command
  may share, drop, or atomically hand off labels, and no label grants powers
  beyond existing live-instance authorization.

#### ATDD acceptance stories

- **Given** any supported core count 8–20, **when** a session is created,
  **then** one atomic revision-zero configuration contains the exact catalog
  row, consistent mode/Capybara/Dione/chart/turn limit and derived vessels, and
  exactly one open stable seat per core role. Base 8–18 rows stay unchanged;
  19/20 contain the atomic Capybara pair; Press and all GMs are absent.
- **Given** an unsupported or internally inconsistent setup payload, **when**
  the creator or GM submits it, **then** validation rejects before session,
  seat, event, or receipt writes. A base request for 19/20 and a lower-count
  Capybara substitution are rejected rather than silently normalized.
- **Given** two authorized GMs see the same setup revision, **when** both
  confirm different valid tuples, **then** one whole tuple and one event commit
  and the other receives a stable stale/conflict result. Retrying the winner
  with the same request returns the same receipt and does not advance again;
  changing a claimed seat out of the roster fails without partial mutation.
- **Given** a joined core player and a visible open seat, **when** that player
  claims it through the existing client route, **then** the seat holder,
  player `seatId`, session revision, and one member-safe event commit together.
  A second claimant, duplicate seat pointer, foreign session, nonmember,
  invalid seat, stale revision, or direct Firestore write cannot mutate state.
- **Given** a current holder, **when** they self-release or an authorized live
  GM performs a reasoned release, **then** seat and pointer clear atomically and
  reconnect reflects the result. A replay returns the original receipt; a
  non-holder player, observer, inactive/foreign GM, post-lock actor, or stale
  request is denied without an event or revision increment.
- **Given** one active GM and no second human, **when** staffing is projected,
  **then** that instance can visibly carry both main and assistant labels.
  **Given** optional additional GMs, **when** labels are shared, dropped, or
  handed off, **then** the transaction preserves live-instance authority,
  revision order, and audit while never counting a GM as a player or making
  either label a two-person dependency.
- **Given** old GM documents with singular responsibility fields, **when** the
  session hydrates or the first responsibility mutation occurs, **then** the
  normalized result is deterministic, one-GM coverage is preserved for a sole
  active instance, multiple legacy instances keep their recorded lanes, and no
  unrelated session is rewritten.
- **Given** Press is enabled but unclaimed, claimed by one authorized player,
  disabled, or reconnected, **when** core configuration and seats change,
  **then** the independent Press claim follows its existing unique authority
  and never creates/removes a core seat, changes core count, or blocks this
  release's configuration flow. This slice does not evaluate start readiness.

#### Test-first, security, visual, and release gates

Before production edits, focused tests must chronologically fail for: whole-
tuple validation and CAS/replay; 8, 19, and 20 creation seat catalogs; claimed-
seat downsize rejection; claim/release pointer+revision+event composition;
foreign/member/observer/inactive-GM/direct-write denial; one-instance dual
responsibilities; optional multi-GM share/handoff races; singular-field
migration; reconnect/outbox hydration; and Press/non-counting preservation.
Record the exact command, timestamp/order, failing assertions, and totals. Do
not bless the gap by weakening existing tests.

The client must never write session configuration, seats, GM instances, or
events directly. Callable transactions require authenticated active
membership, live GM-instance authority where applicable, Turn 0/unlocked
phase, `requestId`, and `expectedSetupRevision`. Rules/emulator tests prove
member/core/Press/observer/nonmember and cross-session denials. Events expose
only role/seat/status/revision metadata; no loyalty or future Wolf identities
are introduced or exposed.

Map every changed setup, seat, responsibility, receipt, pending, replayed,
stale, and error state to `docs/AESTHETICS.md`. Reuse amber structure, cyan
values, bone copy, square hairlines, visible focus, concise live regions, and
text/icon state—not color alone. Keep all interactive targets at least 44px,
all contact/seat names visible, and the automatic happy path primary; use
danger red only for a reasoned high-impact GM release. Provide real visual and
keyboard/screen-reader evidence at 320×844, 390×844, 1440×900, and 844×390,
including reduced motion, reconnect, long names, pending, stale, and multi-GM
conflict. Preserve existing star map, DRADIS, turn, navigation, broadcast,
Press, and shuttle behavior.

Exit only after focused green, unique emulator/rules green, independent
security and plan/diff review, `npm run lint`, `npm run test:all`, both client
and Functions builds, affected bundle tests, `npm run coordination:docs`,
implementation-progress validation, `git diff --check`, and exact-SHA
coordination validation. Then commit, reconcile current `main`, rerun the full
gate on the reconciled SHA, merge, push, prove local main = origin/main = SSH
remote, release emulator resources, and close coordination. Completion evidence
must leave Prompt 051 partial and make no live-deployment, 60-client, readiness,
Wolf, receipt, start, or Turn 1 claim.

#### Queued regression objective — Prompt 275b SNN Dispatch Desk

The owner reports that the SNN Dispatch Desk is currently nonfunctional.
Prompt 275b is therefore a dedicated `[REPAIR]` release after the current
dependency slice, not optional bridge polish and not part of 0.3.12. Begin by
using git history to identify and characterize the last working desk; preserve
that implementation as the design baseline and change it only where an exact
current authority, security, accessibility, or integration dependency makes
the old composition invalid.

Audit the complete path before selecting files: Press and SNN routes, models,
session/claim projection, author/dismiss callables, Firestore rules, broadcast
events and queue, history/replay/reconnect, audit records, shared shuttle and
console templates, styles, return navigation, live-region/focus behavior,
mobile/short-landscape containment, reduced motion, and CIC conventions. Add a
chronological failing production regression that first proves the desk's
current breakage, then restores discover → open → author → publish → intended
bridge audience → dismiss/history → reconnect without direct client authority.
Disabled Press, non-holder, ordinary/foreign player, observer, inactive GM,
stale revision, and duplicate request cases must remain denied and replay-safe.

The Dispatch Desk is explicitly exempt from generic Turn Zero restrictions.
When Press is enabled and uniquely claimed, the holder can see and operate the
desk during Turn Zero; route guards, disabled control logic, callable phase
checks, and global Turn Zero overlays must preserve that exception. This does
not unlock another station or action, weaken normal phase authority, change
core readiness, or count Press among the 8–20 core roster. The future repair
must reserve its own application version/changelog and pass the full security,
visual/accessibility, test/build, reconciliation, merge, and push gate.

#### Historical follow-on Milestone 1 release sequence

Prompt 004 was followed by four separately evidenced releases so stale green
fixtures could not conflate a catalog with a playable start. This sequence is
historical provenance, not a current readiness blocker; the live status and
evidence are maintained in [`IMPLEMENTATION_PROGRESS.md`](./IMPLEMENTATION_PROGRESS.md):

1. Release 0.3.12 completes Prompt 021, repairs Prompt 030, and completes Prompt
   073: atomically persist the full authoritative configuration, provision and
   expose production seats, and represent one-GM/optional-multi-GM staffing.
   Prompt 051 receives production configuration evidence but remains partial.
2. Release 0.3.13 completes Prompt 051/054/071 with the setup portion
   of Prompt 075: readiness
   consumes authoritative seats/casting and start derives the
   Wolf count and default private loyalty state server-side, writes an
   audience-correct calculation receipt, and is retry/race safe without
   claiming the remaining deck/craft/resource initializer breadth.
3. The historical release gate for Prompt 020 was satisfied after release
   0.3.13: one production-path create → join → seat → cast → private setup →
   single-GM start → Turn 1 fixture passes without direct client gameplay
   writes. The current Prompt 020 evidence remains in the progress ledger.
4. Continue Milestone 1 projection/reconnect gaps, then begin the Milestone 2
   turn and maintenance composition.

The following stories are the release 0.3.13 walking-skeleton contract. They are
not by themselves Prompt 020's later composed production-path acceptance.

- **Given** a new or unlocked session, **when** its creator or authorized GM
  selects a supported base count from 8 through 18, **then** the server persists
  that exact base count, mode, canonically ordered roster, active-vessel set,
  Dione/Union decisions, and revision without Capybara expansion roles, Press,
  or GM instances filling a row. Existing base sessions hydrate and reconnect
  without a roster rewrite.
- **Given** the Capybara expansion is selected, **when** the authorized GM
  selects 19 or 20 in the existing Recommended player count control and
  confirms once, **then** the client stages and the server atomically persists
  the exact owner-set roster, player count, expansion mode, enabled Capybara,
  active-vessel set, and setup revision. The Captain/Recycler pair is present
  exactly once and cannot be partially enabled or replaced by Press. A base,
  none, or unresolved low-count expansion request fails before any state
  changes, with a nonsecret corrective message.
- **Given** exactly the locked number of core members have unique active role
  assignments and eligible loyalty state, **when** one live authorized GM
  prepares the session, **then** that one GM can assume both printed main and
  assistant responsibilities and sees one complete readiness result. A legacy
  single-responsibility record remains readable and migrates only through an
  authorized setup mutation. Additional active GMs may share or hand off
  optional lanes, but absent, stale, duplicated, or disconnected collaborators
  never block start and cannot broaden another instance's authority.
- **Given** no complete explicit loyalty setup has been locked, **when** the
  authorized GM starts the ready session, **then** the server derives one Wolf
  for a locked core count of 8–13 and two for 14–20, selects from eligible core
  role holders plus a uniquely claimed enabled Press holder, and assigns private
  loyalty records in the same authoritative setup transaction. Claimed Press is
  eligible but does not change the count or create a third Wolf; unclaimed or
  disabled Press and GM-only participants are excluded. Non-Wolf holders receive
  the printed default Fleet Loyalist distribution, including both suspicion-5
  cards and one suspicion-10 card, without enabling optional Intelligence,
  Arbour, Cult, Android, or Friend policies that belong to later decisions.
- **Given** a complete valid explicit pre-start loyalty setup already exists,
  **when** start is requested, **then** the server validates and preserves it
  rather than silently rerolling or overwriting it. A partial, conflicting, or
  stale explicit setup produces a precise blocker and no write. The normal
  automatic path remains sufficient for one facilitator and never requires
  manual assignment or cross-screen transcription.
- **Given** the same start request is delivered twice or two authorized GM
  instances race from the same expected setup revision, **when** the
  transaction commits, **then** exactly one roster lock, Wolf/loyalty result,
  setup receipt, Turn 1 transition, pursuit initialization, and start event are
  created. The idempotent retry returns that original result and the losing
  stale command cannot reroll, duplicate secrets, reset a clock, or publish a
  second transmission.
- **Given** an entitled player, Press holder, or facilitator reconnects after
  start, **when** live authority replaces the cached snapshot, **then** each
  player regains only their own role/loyalty result, facilitators regain the
  authorized setup census/receipt, and no public, crew, DRADIS, event, or
  member snapshot leaks Wolf identity, another loyalty, random ordering, or
  facilitator-only notes.
- **Given** the GM uses the ordinary start action in the existing GM console,
  **when** readiness passes, **then** the UI calls the authoritative setup/start
  path and visibly reaches Turn 1 with the durable announcement and a readable
  committed setup summary. Missing/duplicate assignments, wrong modes, stale
  revision, unauthorized actor, rejected randomness, or unavailable service
  remain in Turn 0 with an accessible nonsecret failure result. Any retained
  single-player/debug skip remains explicitly separate and is not evidence for
  this production story.

#### Queued walking-skeleton authority, receipts, and interaction contract

The server owns the effective core count, mode compatibility, ordered roster,
eligible loyalty pool, Wolf count, random selection, suspicion distribution,
setup revision, and Turn 1 transition. The client supplies intent and expected
revision only. The setup calculation receipt records the authoritative source,
locked count and mode, canonical roster IDs, Press eligibility input, excluded
GM count, Wolf threshold/rule, ordered modifiers, result count, command ID,
expected/committed revision, actor, server time, and linked event. The
facilitator projection may include the selected private result; the member
projection exposes only the rule/count and that member's own loyalty. Public
or crew projections never serialize selected Wolf identities.

Those queued releases carry the interaction matrix as follows:

| Existing system | Required participation or explicit exclusion |
|---|---|
| Routes and GM setup | Reuse `/gm` Setup, local staging, one confirmation, visible back path, and the ordinary production start control. No new wizard. |
| Star map/navigation and DRADIS | Preserve existing coordinates, SNN roster-derived host, contact privacy, and full-name containment. No movement, group, or attack visualization is added. |
| Turn structure and broadcasts | The authoritative start enters Turn 1 once through the existing clock and announcement path; raw debug advancement cannot satisfy the story. |
| Roles, vessels, and shuttles | Persist canonical core role/vessel IDs; add the atomic Capybara pair only in 19/20 expansion rows. General Capybara craft ownership/actions remain deferred. |
| Callables, rules, audit, and randomness | Configuration and start remain transaction-owned, direct client gameplay writes remain denied, random results use the deterministic test seam, and retry/race outcomes are auditable. |
| Damage, resources, and economy | Preserve current initialized fields and do not claim complete Capybara maintenance, Scrap, Macaw, Boa, damage, or economy behavior from this casting/start release. |
| Press | Preserve default-enabled/toggleable independent authority, unique claim, private loyalty, normal Wolf eligibility, SNN hosting, dispatch history, and non-counting readiness. |
| Reconnect/replay | Live authority restores configuration, own private result, receipt projection, Turn 1 clock, and one announcement without duplicating setup. |
| Accessibility and aesthetics | Reuse CIC hierarchy/tokens; keep controls keyboard/touch operable with 44px targets, live pending/rejected/committed text, no color-only meaning, no clipping at required viewports, and equivalent reduced-motion access. |
| Multiple GMs | One instance suffices; additional instances use expected revisions and optional lane sharing without adding players, rerolling setup, or becoming required acknowledgers. |

**Release 0.3.13 dependency and delivery order:** (1) retain the base roster,
Press, configuration, seat, and responsibility characterization floor; (2) make
seat-backed 8/19/20 readiness and one-live-GM effective responsibility coverage
fail; (3) make automatic Wolf/loyalty setup, audience-correct receipt,
payload-bound retry, and the two-GM race fail; (4) make the ordinary GM start
route, private reconnect projection, and rules-denial boundary fail; (5)
implement the narrowest shared server/client changes; and (6) complete focused,
emulator/security, visual/accessibility, full, reconciled release gates. The
separate Prompt 020 composed production fixture follows only after the release
lands. Do not mark Prompt 054 done from a count helper, Prompt 654 done from a
boolean-only unit test, or Prompt 020 done from direct fixture writes around the
callables.

The current false-green fixtures are requirements to repair: start tests that
supply role IDs and two responsibility booleans without seat documents do not
prove readiness; helper-only Wolf tests do not prove locked production
derivation; debug `advanceTurn` controls do not prove the ordinary start route;
and generic event readability does not prove private receipt redaction. Replace
those assumptions with composed callable, client service/route, projection,
and Firestore-rules assertions while preserving unrelated passing behavior.

**Queued compatibility and rollback:** missing legacy mode fields continue through
the existing documented normalization until an authorized configuration
change materializes the settled shape. Stored valid base rosters, explicit
loyalties, Press claims/history, and singular GM responsibility records are
readable; migration is additive and revision-guarded. Do not reinterpret a
stored low-count session as a Capybara expansion or silently discard a manual
loyalty. Deploy server validation/projection support before a client can submit
the new high-count or dual-responsibility shape. A rollback may leave additive
receipt and responsibility fields in place, but must not restore a client that
can bypass start authority or a server that rerolls an already committed setup.

**Release 0.3.13 non-goals:** do not invent lower-count Capybara substitutions;
enable optional special loyalties; complete Capybara maintenance, Scrap,
Macaw/Boa, damage, targeting, specialist work, or balance dials; implement a
later turn or whole-game loop; implement a Wolf attack; or add the deferred
DRADIS attack visualization. Prompts 055–058, 063–070, the remaining Prompt 075
initializer breadth, Milestone 2+, Prompt 638 capacity, and Prompt 605a remain
open unless independently proven by their own acceptance. Prompt 275b Dispatch
Desk restoration, Prompt 602a ordinary shuttle return, Prompt 603a mobile ticket
occupancy, and Prompt 122a Reactor confirmation remain separately scheduled
regressions and must not be silently folded into setup/start evidence.

**Queued Prompt 020 exit gate:** a production-path ATDD fixture creates a session, joins the
configured members, claims one GM instance, commits the supported configuration,
casts unique roles, runs automatic private setup, starts, and reaches Turn 1
without a direct client gameplay write. It covers a retained base row, row 19,
row 20 with enabled/claimed Press, optional extra GM instances, one- and
two-Wolf thresholds, valid explicit-loyalty preservation, unauthorized/stale/
duplicate/racing requests, reconnect/redaction, and unsupported mode/count
denials. Focused tests, Firestore denial evidence, and the complete local release
suite pass on the reconciled branch. If the GM Setup/start UI changes, rendered
review at 320×844, 390×844, 1440×900, and 844×390 plus reduced motion confirms
the existing CIC hierarchy, reachable controls, visible status, focus order,
touch targets, return route, and no overflow before merge and push.

### Future roadmap addendum — unified entry, authoritative alerts, and CIC repairs

This addendum records future work only. It creates Prompts 031a, 106c, 485a,
611a, 652a, and 652b; reopens Prompt 589b as a copy repair; and makes Prompt
611's existing non-color requirement explicit for compact DRADIS. It does not
change the implementation boundary, status, acceptance, or evidence for
Prompts 020, 051, 054, 075, 275b, 602a, or 603a, and no item below is
complete merely because its contract is documented.

#### Provenance and preservation baseline

- Prompt 031a composes the current `/console`, `/roles`, and ship-role routes
  after the landed P030/P031 seat transaction. Preserve the fleet/ship
  selection lineage at `637aaa4`, `e773b8f`, and `34fd0f2`. Preserve the
  selected faction flag's bespoke shared-element choreography from `5ea9b74`
  and its refinements `4a46186`, `e42c09a`, `b4f47d0`, `3f59bf7`, `c1a8936`,
  `2fec365`, `9fade2e`, and `4dc39da`: 100 ms screen halves around a 200 ms
  geometry move; source-to-destination aspect ratio and object-position
  continuity; the recorded background/foreground layer changes; roster-to-role
  crossfade only where history intentionally suppresses a flash; reverse
  navigation symmetry; and an intentional reduced-motion equivalent. The
  preserved flag treatment is one part of the new unified entry flow.
- Prompt 485a restores the normal ship/faction pursuit presentation introduced
  at `0215488`; `0d64e25` is the audited point where the instrument became
  always danger red. Preserve current pursuit values, countdown placement,
  split-fleet scope, terminal wording, and server-authority dependencies.
- Prompt 652a restores the continuous-tail behavior specified and implemented
  at `a91a020`: a visible group keeps its position and linear rate until its
  trailing glyph is outside the viewport. Audit the later measured-copy and
  window geometry changes, including `080457e`, to identify the exact cause;
  those commits are candidates, not permission to revert unrelated header
  work.
- Prompt 589b owns the exact conduct sentence on the authenticated-session
  waiver. `8b27674` establishes that gate and `92a0d1d` establishes the
  human-first regulation. Debrief and changelog history are evidence, not
  duplicate owners of the live sentence.

#### Dependency and delivery order

1. Preserve the existing P051/P054 readiness/start evidence while Prompt 654
   remains queued for its successor repair. Prompt 031a then consumes the stable P030/P031/P032/P034 claim, release,
   race, and resume authority. It does not complete P020 or recast Press as a
   core seat.
2. Implement Prompt 106c before P652a or P652b. The server-owned message
   identity, revision, ordering, replay, dismissal, and tail-drain state must
   exist before presentation repairs or experiments infer lifecycle locally.
3. Run P652a after P106c and alongside the still-open P652 serialization
   contract. Only after both are green may P652b run as an explicitly
   reversible experiment. P603a's measured session-ticket reflow and shared
   safe-area/header contract remain prerequisites for P652b.
4. P485a and the compact-DRADIS portion of P611 consume the existing
   authoritative `fleetRedAlert` projection independently of P485's broader
   pursuit-authority repair and P605a's owner-deferred attack visualization.
5. P611a and P589b are narrow presentation/copy repairs. They may ship
   independently once their characterization tests and shared accessibility
   gates are green; neither authorizes a typography redesign or waiver rewrite.

#### Prompt 031a ATDD — one cohesive fleet and console entry flow

- **Given** an authenticated entitled player opens the unified entry route,
  **when** live session state loads, **then** the full enabled console catalog,
  faction flags, and nonsecret `OPEN`, `HELD BY YOU`, or claimed/read-only
  status are visible in canonical order. Viewing, searching, grouping,
  focusing, scrolling, or navigating back never claims anything.
- **Given** an open core console, **when** the first authenticated player enters
  or logs into that console, **then** the server atomically claims the stable
  seat and player pointer before granting write authority. Two simultaneous
  first entries yield exactly one winner; the other receives a truthful
  read-only/conflict result, and every subscribed client updates in real time.
  No client may dual-claim, infer authority from route state, or write the seat
  directly.
- **Given** reconnect, replay, a direct deep link, browser Back/Forward, release,
  handoff, or a reasoned GM intervention, **when** live authority replaces cache,
  **then** the same seat/route outcome converges without a second claim, lost
  ownership, loop, or cross-console privilege. Requests use stable IDs,
  idempotency keys, expected revisions and transactional compare-and-set; audit
  identifies actor, console, prior/new holder, reason, outcome, and server time
  without exposing private role or loyalty data.
- **Given** enabled Press, **when** the unified catalog is viewed or a core
  configuration is counted, **then** Press remains a visibly distinct
  independent, optional, non-counted station with its existing exclusive
  authority. It never fills a core console, changes readiness/Wolf math, or
  receives an implicit claim merely because its card is visible.
- **Given** normal motion, **when** the player advances or reverses between the
  unified catalog and a ship console, **then** the exact audited flag
  choreography, timing, transition states, aspect ratio, layer placement, and
  polish remain regression-tested against the historical implementation.
  Interruption, rapid navigation, reconnect, live resize, and rotation settle
  on one flag and route without flash, orphaned clone, jank, or authority drift.
  Reduced motion preserves identity and spatial continuity without animated
  travel.
- **Given** 320×844, 390×844, 1440×900, or 844×390 with safe areas, long names,
  and either motion preference, **when** the catalog and console-entry states
  are operated by keyboard, screen reader, or touch, **then** logical focus,
  exact accessible names/status, visible focus, 44 px targets, and all content
  remain reachable with no overlap with session ticket, Role Select, controls,
  flags, or safe-area edges.

#### Prompt 106c/652/652a ATDD — authoritative ticker lifecycle and complete glyphs

- **Given** concurrent authorized automatic, Admiral, or Press transmissions,
  replacements, and dismissals, **when** the server resolves them, **then** one
  revisioned transaction assigns deterministic session-scoped message and
  sequence identities, applies urgent Red Alert precedence, records the
  audience-safe audit, and publishes the same ordered current/queued/draining
  state to every client. Unauthorized, nonmember, non-holder, foreign-session,
  stale, malformed, oversized, direct-write, and conflicting request attempts
  are denied without leaking copy or advancing the stream; identical retries
  replay one result.
- **Given** reconnect, replay, late join, navigation, Red Alert activation or
  stand-down, **when** a client hydrates the authoritative cursor, **then** it
  renders the same active identity, completed-pass count, replacements, and
  deterministic outgoing tail as every other client. Cached/session-storage
  completion may accelerate presentation but never overrule server state.
  Unentered obsolete repeats may be discarded; visible tails continue once,
  and no client resurrects, duplicates, reorders, or locally invents a notice.
- **Given** a Red Alert message is moving and a replacement or stand-down
  arrives, **when** its leading text has entered the viewport, **then** every
  glyph—including the last glyph and its painted bounds—remains fully visible
  until that glyph is actually outside the viewport. No nested clipping,
  text-overflow, fade, truncation, early unmount, geometry remeasurement, or
  replacement removes any visible lettering. The outgoing group keeps its
  exact linear speed and position while the queued group enters only behind its
  tail under P652, with no overlap.
- **Given** assistive technology or reduced motion, **when** the authoritative
  identity changes, **then** the meaningful message/source/status is announced
  once, dismissed content is not retained as current, and a stationary wrapped
  equivalent preserves ordering and reading time without using animation as
  state. Normal-motion regression evidence includes exact boundary geometry at
  320×844, 390×844, 1440×900, and 844×390, resize/rotation, font load, long copy,
  and Red Alert activation/stand-down.

#### Prompt 652b ATDD — reversible mobile sticky-ticker experiment

- **Given** the experiment is disabled, unsupported, or cannot measure its
  anchor/threshold safely, **when** the route scrolls, **then** FleetTicker uses
  the established non-sticky header layout. That fallback is the permanent
  baseline; the experiment must be explicitly enabled and may not silently
  redefine it.
- **Given** the experiment is enabled on mobile, **when** the ticker's measured
  lower edge crosses the named threshold `safe-area-inset-top`, **then** it
  becomes a top sticky/frozen-row instrument. Before that crossing it remains
  in normal flow. A same-size placeholder or equivalent grid track reserves its
  exact occupied block so content reflows without jump or overlap; scrolling
  back across the threshold restores normal flow deterministically.
- **Given** the session ticket, Role Select, routed controls, focus outlines,
  software keyboard, safe areas, wrapped ticker, live resize, or rotation,
  **when** sticky mode recomputes, **then** one measured layout places the
  ticker below required safe/header chrome and reserves all of its height. It
  never overlays, clips, hides, or z-index-covers content, controls, or the
  session ticket at 320×844, 390×844, or 844×390; 1440×900 remains the
  non-sticky reference.
- **Given** reduced motion or a short landscape viewport, **when** the threshold
  is crossed, **then** the state change has no animated slide and the wrapped
  message remains keyboard/screen-reader/touch readable with at least 44 px
  interactive targets around it. Performance evidence records scroll frame
  behavior, layout-shift count, resize-observer stability, and interruption.
  **Rollback criterion `TICKER-STICKY-OCCLUSION`** fires if any supported
  viewport shows content/focus/session-ticket occlusion, a repeated threshold
  oscillation, more than one unexpected layout shift per crossing, material
  scroll jank against the recorded baseline, or loss/duplication of accessible
  announcements; disable the experiment and retain the non-sticky layout.

#### Prompt 485a/611/611a/589b ATDD — alert semantics, type, and conduct copy

- **Given** the authoritative fleet Red Alert is active, **when** Pursuit Track
  and compact or expanded DRADIS render, **then** Pursuit Track uses hostile
  danger red and DRADIS visibly says `RED ALERT` with a stable non-color text or
  icon cue. **Given** stand-down or a non-alert session, **then** Pursuit Track
  immediately returns to the established ship/faction colors and DRADIS clears
  that cue. Cache, reconnect, late join, revision ordering, and reduced motion
  cannot leave a local false alert; terminal pursuit still uses its exact
  textual state without making non-alert color claim authority.
- **Given** the rendered status `CONSOLE ACCESS // WRITE // CREW INCOMPLETE`,
  **when** it appears in the ship-console identity/status hierarchy, **then** it
  uses the same CIC mono label/readout token, tracking, casing, contrast, and
  responsive wrapping as equivalent console-access states. Audit other direct
  label/readout outliers against named CIC type tokens and casing conventions,
  characterize each before repair, and change only proven inconsistencies—no
  global type scale, visual redesign, or copy normalization by convenience.
- **Given** the authenticated-session waiver's human-first regulation, **when**
  it is presented, read aloud, tested, or resumed, **then** the regulation body
  is exactly `Be bold. Remember the human on the other side.` with that casing
  and punctuation. The waiver remains the sole live owner; its existing title,
  checkbox semantics, focus trap/restore, acknowledgement lifetime, privacy
  boundary, audit, and distinction from GM access expiry remain intact. No
  debrief, history, or changelog surface receives a duplicate live sentence.
- **Given** any of those repaired surfaces at 320×844, 390×844, 1440×900, or
  844×390, **when** operated with keyboard, screen reader, touch, safe-area
  insets, rotation, or reduced motion, **then** status is announced once,
  complete text stays visible, focus and 44 px controls remain unobscured, and
  the established square ruled CIC hierarchy remains recognizable.

#### Shared regression and release gate

Each implementation begins with the narrowest chronological failing
characterization of the cited current/history boundary. Authority work adds
callable transaction, CAS/race, idempotency/replay, reconnect/late-join,
projection/privacy, audit, and Firestore-denial evidence; presentation work adds
normal/reduced-motion, keyboard/screen-reader/touch, live resize/rotation, safe
area, and real-browser geometry evidence at 320×844, 390×844, 1440×900, and
844×390. Preserve current working behavior outside the selected prompt. A
future product slice reserves its own version and changelog, passes focused and
full client/Functions/rules/build gates in proportion to changed scope, receives
security and visual/accessibility review, reconciles current `main`, merges,
pushes, and closes coordination. Documentation alone satisfies none of these
product gates.

### Milestone 1 — Cast and start a real game

**Given** a supported player count and a base-game, Dione, Capybara, or other
enabled configuration, **when** the facilitator commits the printed roster and
starts play, **then** the active roles, ships, player seats, Wolf count and
private loyalties match that configuration, Dione is absent below the printed
threshold, the Capybara expansion remains distinct from the base small ship,
and every player sees only the role and loyalty information they are entitled
to see. Turn 0 can advance into a real Turn 1 without an orphaned or invalid
seat.

**Dependencies:** session lifecycle, role presets, hidden-information policy,
and facilitator setup.

### Milestone 2 — Complete one authoritative turn and maintenance loop

**Given** a healthy and a materially different damaged reference ship, **when**
the GM starts a numbered turn and each crew resolves Team and Coordination
Phase, **then** the server applies the printed maintenance order, ration table,
unrest and riot result, population loss, damage draw, reactor charges, shuttle
refuelling, phase timing and airspace transition. Advancing the turn expires
unused charges and shuttle fuel, preserves any overrun mission, and rejects
stale or duplicate commands without applying a second result.

**Dependencies:** Milestone 1, ship catalogs, damage decks, random-result
authority, and turn/airspace state.

### Milestone 3 — Make the fleet economy and specialist capabilities playable

**Given** a legal phase, the required resources and an entitled role or
shuttle, **when** Miner, Engineer, Scientist, Captain, or other specialist
performs a printed operation, **then** mining, refining, production, cargo
transfer, repair, recharge, research, upgrade and evacuation apply their exact
costs, limits, ownership and target rules. The authorized players see the
result, the facilitator can audit it, and invalid cargo, phase, role, resource
or target requests fail without partial state.

**Dependencies:** Milestones 1–2 and the registered vessel capability catalog.
This is the acceptance story that proves every enabled role has meaningful
work, not merely a rendered procedure card.

### Milestone 4 — Scout and learn a system without leaking the organiser chart

**Given** a selected organiser chart and an available Starlight, Hummingbird,
Endeavour, or replacement scout, **when** an entitled player scouts a target,
**then** the server enforces the printed range and per-turn limit and reveals
only the permitted system code, mission information and candidate/hazard
information to the permitted readers. The player chart gains the allowed
discovery, while the complete organiser chart and unrelated system secrets
remain hidden.

**Dependencies:** Milestone 1, chart selection, navigation topology and
hidden-information policy.

### Milestone 5 — Jump independently to a legal destination and recover from failure

**Given** a ship with a charged Jump Drive and sufficient fuel, **when** its
crew submits a destination during the Coordination Phase, **then** the server
validates the printed chart route, ship-specific fuel cost, once-per-turn rule,
drive condition and upgrade, consumes the authoritative fuel, updates that
ship's location and pursuit state, and writes the appropriate navigation log.
Wrong coordinates, an invalid or failed jump, damage, a facilitator
adjudication, and the ship's one emergency jump each produce their prescribed
recoverable outcome and cannot be selected by the client as a fake result.

The **jump button** is the player-facing control for this story, not a separate
milestone. “Wild destination” means a player-selected/scouted destination on
the selected printed 22-system network; arbitrary four-digit coordinates are an
input-error or facilitator-adjudication path, not valid navigation authority.

**Dependencies:** Milestones 1–4, per-ship navigation authority, pursuit, and
damage resolution.

### Milestone 6 — Fly a shuttle and make it useful after arrival

**Given** a shuttle, a legal destination ship and an open movement window,
**when** its owner departs, retargets, arrives and docks, **then** the server
resolves its position from timestamps, records the visit, updates the local
DRADIS sample and permits only its printed cargo and capability actions. A
shuttle can transfer, repair, recharge, mine, scout, contribute to an away
mission, or support boarding only when its sheet and phase allow it.

During restricted airspace, movement is rejected except for the documented
AEGIS-authorized SNN exception; during a Wolf Attack, all shuttles park at the
nearest ship and only battle-capable craft join the battle table. Mid-flight
retargeting starts from the server-resolved current position rather than
snapping to the old origin or animation frame.

**Dependencies:** Milestones 1–3 and the authoritative shuttle travel,
docking, airspace and DRADIS contracts.

### Milestone 7 — Complete an away mission at an arrived system

**Given** a newly reached system and eligible away-mission shuttles, **when** a
Mission Leader starts and completes the mission, **then** participants receive
private initial cards, the leader distributes opportunity cards without seeing
them, players secretly discard and assign cards, facilitator cards and shuttle
bonuses are applied simultaneously, and each opportunity produces its exact
success, critical-success or failure result. Rewards reach the Mission Leader
or their chosen drop-off ship, overruns preserve the mission and dockings, and
hostile systems trigger the required Wolf consequences.

**Dependencies:** Milestones 3–6, system discovery, mission-card authority,
private card visibility and resource/reward persistence.

### Milestone 8 — Operate and reunite a split fleet safely

**Given** one or more ships jump away while others remain behind, **when** the
split state is created, **then** each group has its own location and pursuit
state, local DRADIS shows only the contacts that have arrived in that group,
cross-group communication is blocked,
and no view silently exposes the other group's position. A legal scout taxi can
carry at most two players or two strytium fuel for a round trip, and a later
rejoin is authoritative, logged and visible to the reunited group.

This extends the original “split the fleet and filter DRADIS contacts” story:
the filter is the first acceptance case, while communication, pursuit, taxi and
rejoin are the exit gate for a playable split fleet.

**Dependencies:** Milestones 5–6, fleet-group state, local information policy
and rejoin rules.

### Milestone 9 — Resolve a full Wolf attack and its aftermath

**Given** a prepared Wolf composition and the current fleet state, **when** a
Wolf Attack is declared from the GM console, **then** all shuttles park,
targeting resolves with the permitted modifiers, Long, Medium and Short Range
actions resolve simultaneously, Short Range damage targets fighter wings
first, Boarding Action resolves security dice and shuttle support, and
surviving Wolf ships apply their step-specific damage and retreat/return
behavior. Each affected player console exposes every currently eligible
choice, consequence, pending state, and audience-safe result needed to play the
attack without facilitator transcription. The authoritative server owns target
selection, dice, modifier order, phases, timeouts, damage, casualties,
idempotency, revision, audit, and privacy; the client cannot choose a hidden
result.

The automatic happy path advances routine phases and publishes a calculation
receipt. One GM can declare, pause, inspect, advance, reasonedly override, or
recover the attack; concurrent GMs race through expected revisions and commit
only one mutation. The attack model and events expose a stable DRADIS-ready
projection with canonical attack, source, target/contact, phase, timestamp,
range, bearing, effect/outcome, visibility, and redaction fields. That endpoint
contract is part of the playable attack. The ultimate DRADIS attack
visualization is explicitly deferred to the owner under Prompt 605a and is not
an exit dependency for this milestone.

The post-attack story continues through repair, resource loss, survivor
changes, salvage and any newly triggered alert or mission consequence. Combat
resolution and recovery must each have a failing-first acceptance fixture so a
passing battle animation cannot be mistaken for a playable aftermath.

**Dependencies:** Milestones 2–3 and 6, authoritative group pursuit, server
randomness, damage authority, boarding state and the Wolf ship-card catalog.
Delivery order is attack state/catalog → server resolver → GM trigger/control →
audience projections/player choices → retry/intervention → phase lifecycle →
aftermath → complete playthrough. DRADIS contact behavior remains unchanged
until the owner separately approves Prompt 605a.

### Milestone 10 — Make hidden loyalties and social deduction playable

**Given** an assigned hidden Wolf, Intelligence Agent, or other configured
loyalty, **when** a player performs one permitted action in a turn, **then**
console sabotage, supply sabotage, homing beacon, intel, suspicion changes,
clues, investigations, arrests and prisoner deadlines resolve through the
server with the correct private/public visibility. An arrest reaches release,
execution or replacement by the next Team Phase, and a replacement role can
use its new ability before the game ends.

**Dependencies:** Milestones 1–2, secret records, role ownership, facilitator
visibility and the replacement-role contract. This is separate from the Wolf
combat story: the social-deduction loop must work even when no attack is in
progress.

### Milestone 11 — Recover from catastrophe without orphaning the game

**Given** a failed jump, damage-deck exhaustion, population loss, unrest 8,
or a destroyed ship, **when** the facilitator and affected players resolve the
consequence, **then** the session records mutiny, destruction, escape pods,
survivor evacuation, resource salvage, repairs, a new captain or an extra/
replacement role as appropriate. The affected ship cannot perform actions it
no longer has, while the remaining fleet can continue and the replacement gets
meaningful authorized work before debrief.

**Dependencies:** Milestones 2, 5, 7 and 9, population/damage state,
evacuation rules and role reassignment.

### Milestone 12 — Resolve crises and political decisions

**Given** a configured President and a facilitator-issued crisis, **when** the
President and affected teams resolve or allow it to escalate, **then** the
political-capital, unrest, quarantine, election, approaching-vessel or other
printed consequence is recorded and announced at the correct phase. A
facilitator call is explicit, attributable and auditable rather than an
unexplained client-side state change.

**Dependencies:** Milestones 1–3, facilitator controls, broadcasts and
role-specific authority.

### Milestone 13 — Reach an explicit New Eden ending

**Given** a discovered New Eden candidate, **when** the fleet attempts its
candidate-specific path, **then** the server resolves the distinct Ancient
Jump Ring, Deep Nebula or Ancient Space Station preparation and attempt,
including research/material/fuel, scouting and long-jump, or Wolf/combat/
reactor requirements as applicable. Pursuit reaching 10, total fleet loss,
lost ships, a candidate success, and any unresolved facilitator call produce a
clear outcome, survivor summary and debrief; active play freezes and the
session transitions to `closed` without losing the readable audit history.

**Dependencies:** Milestones 1–12. The exit fixture must include at least one
candidate success path and one failure path; the existing `debriefMode` visual
toggle alone does not satisfy this milestone.

### Cross-cutting acceptance contract

Every milestone above carries the following acceptance cases:

- Gameplay, randomness, secrets, resources, movement, damage and victory are
  committed by an authoritative callable transaction; the corresponding
  client write is denied in Firestore rules.
- An unauthenticated, unauthorized, out-of-phase, out-of-range, stale or
  malformed request is rejected without partial state. An authorized retry is
  idempotent and returns or exposes the single authoritative result.
- A reconnecting browser replaces its cached snapshot with live authority and
  does not duplicate an irreversible action. Hidden results are readable only
  by the entitled player, GM instance or facilitator.
- The state change has a member-visible result, a failure/denial readout, and a
  stable audit record naming the actor, source, random result or facilitator
  call when applicable. Presentation effects never become gameplay authority.
- Every affected route has a visible, keyboard-accessible return path, and
  every supported viewport can reach the result without clipped, overlapping
  or unverified controls.
- The automatic happy path owns every deterministic handoff that would
  otherwise ask a player to give the facilitator a value, roll, count,
  distance, damage, resource, time, or modifier. The server validates the
  inputs, applies the printed or recorded product rule in the correct order,
  commits the result, and advances the state machine without mental arithmetic,
  duplicate calculation, or cross-screen transcription by the facilitator.
- Each automatic result exposes an audience-correct calculation receipt:
  entered inputs, cited source/rule and version, applicable modifiers in order,
  computed result, resulting before/after deltas, actor, command/request ID,
  expected and committed revision, turn/phase, server time, and linked audit
  event. Secrets are redacted by audience rather than omitted from authority.
- One GM can pause and inspect an automatic flow, then issue a scoped manual
  override or correction only through an authoritative intervention record
  containing a required reason, exact before/after delta, expected revision,
  idempotency key, actor, and recovery or rollback path where the rule permits
  one. High-impact changes reuse the danger-red second-click `ARE YOU SURE?`
  confirmation; presentation alone never authorizes the intervention.
- Two simultaneous GM instances racing the same command produce one committed
  mutation and one safe stale/idempotent outcome. A single GM can complete the
  same story without another GM acknowledging alerts, staffing a responsibility,
  copying a result, or operating a second screen.
- Genuine hidden choices and printed ambiguities remain deliberate player or
  facilitator decisions until explicitly configured. Automation may present
  the eligible choices and consequences, but must not invent a ruling or expose
  private inputs.
- Calculation receipts and intervention controls satisfy the same CIC,
  keyboard, screen-reader, 44px touch-target, narrow/short viewport, live
  status, and reduced-motion requirements as the gameplay surface.

### Recommended story order

The dependency-ordered path to a meaningful, single-facilitator playable loop
is:

1. Repair documentation/status contracts and stale-green evidence.
2. Build the one-GM walking skeleton: start, automatic Wolf/loyalty casting,
   alert ownership, Turn 1, and a complete setup receipt.
3. Complete the authoritative turn, maintenance, and typed economy loop.
4. Make chart, jump, split-group pursuit, and failure transitions one
   server-owned composition.
5. Make shuttle travel, docking, cargo, and capability actions playable.
6. Complete scouting and away missions without hidden-data leakage.
7. Resolve a full Wolf attack through GM and affected player consoles, and
   publish its DRADIS-ready endpoint/event projection without yet adding the
   owner-deferred DRADIS attack visualization.
8. Complete hidden loyalties, deduction, crises, and authoritative endgame.
9. Prove Capybara breadth, Press isolation, one-GM full runs, and multi-GM
   races.
10. Close accessibility, responsive/aesthetic, 20-core/optional-21st, and
    measured 60-browser release-readiness gates.

The 20-player roster and 60-browser-client scenario remain release-readiness
evidence, not substitutes for these stories. They should be exercised after
the relevant loop is functionally complete, with measured latency, errors,
contention, reconnect and retry results rather than an unverified capacity
claim.

## Source-of-truth and decision policy

Before designing a mechanic, read the authorized private source library outside
this repository and every source it routes to for that mechanic. Do not copy,
link, quote, or commit that material here. The source map is:

| Mechanic | Required source area |
|---|---|
| Turn order, resources, maintenance, FTL, pursuit, suspicion, sabotage, away-mission procedure | Authorized core-rules source |
| Ship consoles, damage cards, ration tables, population tracks, jump costs, small ships, Voyage 33-0 | Authorized ship source |
| Printed maintenance layout and sequencing | Authorized maintenance-layout source |
| Shuttle and fighter-wing capabilities | Authorized shuttle source |
| Wolf sequence, Wolf ship cards, AEGIS weapons, boarding, Fighter Ace | Authorized Wolf-attack source |
| Role responsibilities, player-count casting, loyalties, replacement roles, President | Authorized role-and-loyalty source |
| Star chart, chart variants, system codes, mission cards/rewards, New Eden candidates | Authorized exploration source |
| Facilitator setup, difficulty dials, crises, jump failures, evacuations, mutinies, endgame | Authorized facilitation source |
| Capybara expansion, Scrap, Macaw, Boa, two-player role path | Authorized Capybara-expansion source |

Apply these rules to every slice:

- Printed ship, shuttle, fighter, console, or card sheets win over a generic
  guide for specific numbers and effects.
- A facilitator adjudication must be represented as a deliberate facilitator
  action or documented product decision, never an unexplained client guess.
- Server catalogs must remain independent from UI definitions. React and
  client-only data cannot become Cloud Function authority by import.
- Do not expose a control until its action has a defined authority, input
  validation, persistence, visible result, audit behavior, and failure path.
- Preserve the known errata and conflicts below in the rule matrix so a future
  implementation cannot accidentally regress to a generic value.
- Label a deliberate product extension explicitly when no printed rule defines
  it. SNN Press is one such New Eden Console extension: history and product
  contracts govern its optional station behavior, while printed roster,
  loyalty, Wolf, Capybara, and facilitator math remain unchanged.

### Decisions required before affected implementation

These are not reasons to stop planning, but they are explicit gates for the
first code slice that depends on them:

- **Game scope:** whether a session may switch between base-only, Capybara
  expansion, and other extra-ship configurations after creation. The count
  policy is settled: core casting supports 8–20 players with Capybara roles in
  the source-authoritative expansion path; optional Press may add a twenty-first
  role holder, and multiple GM instances remain outside both counts.
- **Randomness:** the server-side random source, audit shape, replay policy,
  and facilitator visibility for dice, damage draws, Wolf composition,
  suspicion clues, mission cards, and uncertain outcomes.
- **Hidden information:** which loyalty, investigation, Wolf, chart, mission,
  and candidate facts are visible to which role, GM instance, observer, or
  facilitator; whether completed outcomes remain readable after debrief.
- **Fleet split:** how separate pursuit tracks, communication restrictions,
  rescue taxis, and rejoining are represented when a jump splits the fleet.
- **Facilitator calls:** how the UI labels and records a human adjudication
  without pretending it was a deterministic rules result.
- **Endgame:** exact success/failure states for candidates N, O, and P, the
  treatment of lost ships and survivors, and when the session becomes `closed`.
- **Operational policy:** measured quotas, retry behavior, cost guardrails,
  dashboards, and incident ownership for the 60-client target.

### Known reference ambiguities to preserve and resolve deliberately

- Refinery 124 Water Reclamation remains the elimination-based 5♦ decision.
  The Capybara Scrap Refinery is unambiguously 7♠ in the rendered visual
  authority. The extracted 5♦ is a hidden OCR/text-layer overlap with the
  Damage label, not printed gameplay text; retain it only as a provenance
  warning, not as a rules ambiguity.
- Several shuttle sheets contain copied names (Wobbly/Condor,
  Ally/Philia/Chacau); the ability belongs to the sheet's actual shuttle.
- The Wolf Commander's Boarding Action text is incomplete and requires a
  facilitator call.
- The AEGIS sheet's Omega badge/maintenance ordering conflicts with a body
  label; numbered order and the 1–7 flow win.
- Capybara base small ship and Capybara expansion have different population,
  damage, jump, resource, targeting, maintenance, role, and shuttle rules.
- The Capybara expansion does not fully specify an empty damage deck, Boa
  targeting after destruction, or Macaw dismantling its own ship console.

## Staged implementation plan

These numbered phases are coverage lanes retained for stable navigation, not a
chronological queue. Their old numbering puts away missions before shuttle
travel and role breadth after mechanics that depend on those roles. Execute by
the dependency order in
[`IMPLEMENTATION_MILESTONES.md`](./IMPLEMENTATION_MILESTONES.md): role and
shuttle prerequisites land before missions, candidate discovery is separate
from candidate resolution, and cross-cutting security/accessibility work lands
with the first affected surface. Break each lane into vertical slices with one
authoritative state change and one user-visible outcome.

### Phase 0 — Scope, rule matrix, and delivery contract

**Objective:** establish an unambiguous contract before adding gameplay code.

**Work:**

- Build a rule matrix for every planned action with columns for printed source,
  inputs, calculation owner, authoritative state, automatic mutation,
  callable/function, Firestore path, permitted readers, denial behavior,
  calculation receipt, intervention surface, genuine ambiguity, eliminated
  facilitator handoff, client surface, audit record, and test location.
- Mark each row as implemented, partial, planned, facilitator-only, or
  explicitly out of scope. Link the relevant source and record any erratum or
  product decision.
- Confirm the supported player-count matrix, enabled ship set, active roles,
  Wolf-agent count, Dione availability, Joint Engineering Union assignments,
  extra/replacement roles, and the Capybara toggle.
- Define the complete session state machine: lobby, briefing, active turns,
  debrief, success/failure, and closed retention behavior.
- Inventory every current facilitator-math handoff in setup/Wolf assignment,
  maintenance/damage/resources, transit/airspace/navigation/pursuit, shuttles,
  missions, Wolf attacks, and Capybara actions. Map each deterministic handoff
  to an automatic server owner and each genuine choice to an intervention or
  decision surface before adding controls.
- Define the first two or three vertical slices and their smallest observable
  outcomes. Do not begin with a broad “implement the rules” branch.

**Exit gate:** another contributor can select a row and identify the source,
authority, visible result, denial test, and definition of done without making a
new rule decision.

### Phase 1 — Authoritative session and information model

**Objective:** make every later mechanic safe to store, read, retry, resume,
and audit.

**Work:**

- Complete the typed model for session configuration, turn/phase clocks,
  per-fleet or per-ship location, resources, population, unrest, damage,
  upgrades, shuttle state, role ownership, secrets, events, mission state,
  Wolf attack state, pursuit, and endgame outcome.
- Keep mutations in callable Functions and transactions. Validate session
  membership, active presence lease, GM instance, role/ship ownership,
  configured feature set, current phase, action revision, and idempotency key
  before changing state.
- Extend Firestore rules with explicit reads and denials. A denial must cover
  the forged client write, not only the happy-path callable.
- Define a stable audit shape for random results, damage draws, secrets
  revealed, movement, resource transfers, role/loyalty assignment, alerts,
  and facilitator calls. Store only information each reader is entitled to
  see.
- Standardize action, result, calculation-receipt, and intervention records so
  every server-owned operation carries rule/source, ordered inputs/modifiers,
  before/after deltas, actor, command/idempotency key, expected/committed
  revision, turn/phase, time, audience projection, and recovery status without
  duplicating domain state.
- Preserve reconnect behavior: stale snapshots are not authority, queued
  disconnects replay safely, presence expiry affects only that device, and a
  retry cannot duplicate an irreversible action.

**Exit gate:** a stale, duplicated, forged, unauthorized, or out-of-phase
request is rejected without partial shared state; an authorized retry is
idempotent or returns the already-authorized result; reconnect replaces stale
state with live authority.

### Phase 2 — Turn engine and maintenance loop

**Objective:** run the printed Team/Coordination timing and every current
ship's maintenance sequence as server-resolved state.

**Work:**

- Implement Turn 0 setup and the Turn 1/subsequent timing contract, phase
  transitions, GM advancement, automatic clock readouts, airspace state, and
  the final-turn transition.
- Encode each ship's discrete population track, ration table and starred
  threshold; include the Dione and Capybara expansion eligibility rules.
- Select the active population-specific ration table authoritatively and show
  its source, inputs, modifiers, and delta; never ask the facilitator to choose
  or transcribe deterministic table arithmetic.
- Resolve storage loss, ration selection, unrest roll, riot/alternative small
  ship population loss, reactor charges, shuttle fuelling, AEGIS's second bay,
  console upgrades, and end-of-turn expiration in printed order.
- Route every damage-causing step through the server damage deck. Record the
  card, system, casualty effect, armour recycling, failed check, empty-deck
  destruction, and linked audit ID in the crew-visible result where required.
- Let one active facilitator own and clear every blocking threshold/maintenance
  item. Additional GM instances receive collaborative information without
  becoming required acknowledgers; stale or disconnected optional GMs cannot
  deadlock maintenance or movement. Expose a one-GM outstanding-work queue and
  safe multi-GM claim/handoff semantics.
- Preserve maintenance undo as a bounded current-turn recovery action with
  revision checks; never erase damage or audit history.

**Tests and evidence:** start with failing pure-function tests for tables and
ordering; add callable transaction tests for stale revisions, random-result
authority, alert acknowledgement, and rollback; add Firestore denial tests for
client counter writes; add route/control tests for every visible GM action.

**Exit gate:** a reference ship and a materially different ship complete a
full maintenance cycle with exact printed steps, a threshold and a damage
outcome are visible to the correct users, and repeated/reconnected clients
cannot double-charge, double-refuel, skip a step, or invent a card.

### Phase 3 — Navigation, star chart, pursuit, and away missions

**Objective:** make movement and exploration a complete, auditable decision
loop rather than a display-only starmap.

**Work:**

- Store the selected organiser chart and authoritative adjacency, coordinates,
  current location, route length, pursuit reduction, Ion Nebula behavior, and
  Level 5 planet exception. Keep the player chart intentionally incomplete
  where the tabletop rules require discovery.
- Implement per-ship FTL validation: charged drive, printed short/medium/long
  fuel cost, coordinates, once-per-turn limit, upgraded/damaged failure rules,
  emergency jump, wrong destination, damage, and facilitator adjudication.
- Define split-fleet state: independent pursuit and location, communication
  restriction, scout-taxi/fuel transfer rules, and safe rejoining.
- Implement scouting capabilities and range checks for Starlight,
  Hummingbird, Endeavour, the Comms Officer, and any expansion role. Record
  what was disclosed without exposing the organiser chart wholesale.
- Implement away missions with secret initial cards, leader distribution,
  private discards, opportunity assignment, facilitator card, simultaneous
  totals, shuttle bonuses, critical thresholds, rewards, failure effects, and
  mission overruns. Keep card identities and hidden choices private until
  their rules-defined reveal.
- Implement the candidate paths for Ancient Jump Ring, Deep Nebula, and
  Ancient Space Station, including their different preparation currencies and
  repeated Wolf attacks where specified.

**Exit gate:** a fleet can scout, select a legal destination, jump, update
  pursuit, run a mission, receive the correct reward, and prepare one candidate
  without a client choosing a coordinate, card, random result, or hidden fact.

### Phase 4 — Shuttles, docking, travel, and capability modules

**Objective:** turn the typed shuttle catalog into truthful, authoritative
movement and action surfaces for every supported craft.

**Work:**

- Complete per-vessel shuttle definitions: stable ID, owner role, initial
  dock, ports, cargo types, fuel requirement, phase, combat capability,
  away-mission bonus, and optional module. Do not inherit SNN identity,
  equipment, or Dione docking by default.
- Implement authoritative docked/transit state with current world position,
  velocity, destination, departure/arrival timestamps, course changes from the
  resolved current position, arrival/departure events, and host-local docking
  history. Client animation remains a projection only.
- Enforce restricted airspace, the AEGIS authorization for the unaffiliated
  Press shuttle, docking rules during Team Phase and Wolf Attacks, and the
  one-shuttle-per-bay fuelling rules.
- Implement capability-specific resource transfer, repairs, dismantling,
  recharge, mining, scouting, research, fighter operations, rescue, and
  shuttle-to-ship ownership checks from the reference sheets.
- Make undocked shuttles sampled DRADIS contacts and docked shuttles host
  contacts. Do not expose continuous hidden tracking or invented speed/range/
  ETA values.

**Tests and evidence:** exercise the shared shuttle template with SNN and a
  materially different craft; assert that clients cannot forge destination,
  docking, arrival, or visit-log records; test retargeting mid-flight, airspace,
  fuel expiry, cargo boundaries, and role release; review narrow, wide, and short
  landscape layouts.

**Exit gate:** a shuttle can leave, be sampled in transit, retarget, arrive,
  dock, transfer only its allowed cargo, perform its allowed phase action, and
  return to its parent route without a fake or unverified control appearing.

### Phase 5 — Wolf attacks, combat, loyalties, and hidden information

**Objective:** provide the social-deduction and combat loop that makes the
fleet's choices consequential, with a fully playable GM-to-player attack path
and server-owned routine resolution.

**Work:**

- Implement player-count casting, loyalty assignment, starting suspicion,
  hidden Wolf roles, Intelligence Agent accuracy, Universal Arbour/Wolf Cult,
  Android and Friend relationships, and facilitator-only role data.
- Implement Wolf actions: console sabotage, supply sabotage, homing beacon,
  intel, suspicion clue thresholds, investigations, arrests, prisoner
  deadlines, and replacement roles, with private result delivery.
- Wolf hacking presentation must reuse the dormant launcher capability in
  `src/components/HackingMessageOverlay.tsx` and the shared `HACKING_MESSAGES`
  copy in `src/lib/hackingMessages.ts`; enable it only from authoritative Wolf
  state and preserve its reduced-motion, `aria-hidden`, and no-focus-trap
  accessibility behavior.
- Implement the five-step Wolf attack order: targeting and wraparound,
  Wolf Commander rerolls/adjustments, long/medium/short simultaneous actions,
  fighter-wing-first damage, boarding parties, security dice, Pallas/Chepu and
  engineering-shuttle support, and post-boarding damage/retreat.
- Initiate and control attacks from the GM console and resolve every eligible
  decision through the affected player consoles. The server owns the attack
  state machine, targets, dice, modifier order, deadlines/timeouts, damage,
  casualties, retries, revisions, audit, and audience projections. One GM can
  run the happy path end to end; pause/inspect/override/correction remains
  available through the cross-cutting reasoned intervention envelope.
- Publish stable attack projections/events for later DRADIS consumption:
  canonical attack and contact IDs, source and targets, phase, server
  timestamps/deadlines, range, bearing/contact references, effects/outcomes,
  audience visibility, and redacted/private fields. Contract-test the endpoint
  shape and privacy while preserving current DRADIS contact behavior. Do not
  implement the owner-deferred ultimate DRADIS attack visualization in this
  phase.
- Encode every Wolf ship card's capacity, step-specific destruction effect,
  return behavior, Strikecarrier bonus, Battlestation restriction, and
  attack-composition rules. Keep facilitator composition and pre-roll details
  private as required.
- Implement AEGIS weapons, fighter wings, Maliades, Highwall, Boa, Fighter
  Ace, and other combat modules through authoritative action records. Resolve
  damage via the same server damage-draw path used by maintenance.

**Exit gate:** one GM can prepare and trigger a complete attack, affected
players can submit every rules-defined choice from their existing consoles,
and the server advances and resolves it in order with visible receipts,
timeouts, recovery, audit, and correct private/public visibility. Killing or
leaving a Wolf ship at a different range produces the reference result; no
client can choose the target, roll, hidden role, or damage card. A concurrent-
GM fixture commits one result, and a DRADIS-ready projection/privacy contract
passes without requiring a new visualization.

### Phase 6 — Fleet roles, ship consoles, and roster completeness

**Objective:** make every supported role and vessel a usable, differentiated
part of the game without duplicating the console architecture.

**Work:**

- Finish the six core fleet ships and their role workspaces from their own
  vessel definitions, including resource production, research, upgrades,
  fighter bays, maintenance timing, and printed population/capacity details.
- Encode the player-count matrix from the reference: Dione disabled under 12,
  Joint Engineering Union substitutions, optional role rows, Wolf count,
  and the configured role preset selected by the facilitator.
- Implement replacement roles and extra small ships with their distinct
  rules, including Voyage 33-0 and the distinction between ship/shuttle
  hybrids and damageable full ships.
- Implement the Capybara expansion as a separate feature path: sixth resource,
  Scrap Refinery, Macaw, Boa, targeting on 7/d8, two roles, one shuttle bay,
  expansion population/ration track, and the documented +6 attack-balance
  consideration.
- Keep `ShipConsole`, `RoleConsoleTemplate`, `FleetRoleConsoleTemplate`,
  `ShuttleConsole`, and `ShuttleConsoleTemplate` as the single shared shells.
  Add configuration or typed modules for real exceptions only.

**Tests and evidence:** write shared-base tests against the reference vessel
and at least one materially different vessel; test role ownership, observer
read/write transitions, missing-role relief access, Dione/Capybara toggles,
catalog-derived values, and visible return navigation. Confirm no duplicate
per-ship route or layout has been introduced.

**Exit gate:** every enabled role has a real action or responsibility, every
action has a server path and visible result, role casting is valid for every
supported player count, and all enabled ships render from registered typed
definitions.

### Phase 7 — Facilitator controls, crises, and explicit game end

**Objective:** let one facilitator run the entire table through automatic
routine paths and intervention-rich controls without bypassing authority or
leaving the session in an ambiguous state; preserve multiple GMs as optional
collaborators.

**Work:**

- Model one authorized facilitator as able to assume both printed
  responsibilities. Preserve facilitator-only notes, chart selection, loyalty
  assignment, crisis delivery, jump adjudication, mission resolution, Wolf
  composition, and rules-call annotations; allow additional GMs to claim or
  hand off optional lanes without making those lanes readiness requirements.
- Replace routine facilitator arithmetic and transcription with automatic
  server-owned actions and visible calculation receipts. Provide a consolidated
  next-action/outstanding-exception queue so one GM never needs a second screen
  or a second operator to identify the next required action.
- Provide pause, inspect, reasoned override, correction, and rule-call controls
  with revision/idempotency guards, exact deltas, audit/replay, and bounded
  recovery. High-impact interventions use the danger-red second-click
  `ARE YOU SURE?` pattern, and concurrent GMs receive a safe stale result.
- Implement the five documented crisis types, political capital, presidential
  address/visit, mutiny, arrests, evacuations, destroyed ships, and difficulty
  dials as deliberate GM/facilitator actions with phase and role checks.
- Add explicit success/failure outcomes for candidates N/O/P, pursuit reaching
  10, total fleet loss, player/ship survival summaries, and any unresolved
  facilitator call. Transition through a server-authorized debrief and then
  closed retention state.
- Preserve live broadcasts, alerts, turn-start transmissions, final debrief
  presentation, and audit history without turning presentation-only effects
  into gameplay authority.

**Exit gate:** one facilitator can complete a full end-to-end playthrough in a
deterministic fixture without mental arithmetic, cross-screen transcription,
or another GM acknowledgement, including at least one failure and one candidate
success path. A second fixture proves optional multi-GM claim/handoff and one-
winner concurrency. Every active session can reach `closed` with a readable
outcome instead of an orphaned active state.

### Phase 8 — UI, accessibility, responsive behavior, and performance

**Objective:** make the completed rules legible and fast at a real table.

**Work:**

- Before UI changes, read and apply `docs/AESTHETICS.md`; record new reusable
  patterns or exceptions there in the same change.
- Keep each screen's primary status, next action, authority, and failure state
  visible. Use truthful labels for loading, offline, stale, pending, denied,
  facilitator decision, and completed outcomes.
- Render calculation receipts as CIC instruments: amber structure, cyan
  measured results, bone explanatory copy, explicit source/modifier/delta
  rows, square shared controls, and non-color pending/rejected/committed state.
  Intervention controls remain visually distinct from the automatic happy path;
  no receipt requires hover, motion, or another screen to understand.
- Preserve a visible keyboard-accessible return route from every ship, shuttle,
  observer, GM, role, mission, attack, and debrief view. Preserve state when
  returning unless the user explicitly releases or resets it.
- Verify narrow phone, wide desktop, short landscape, portrait/landscape
  rotation, focus order, 44px touch targets, text wrapping, contrast, reduced
  motion, live-region behavior, dialog ownership, and overflow.
- Keep Firestore lazy on the landing path and maintain bundle-size and clean
  dependency-audit gates. Avoid rendering decorative gauges, disabled future
  tabs, or duplicate telemetry.

**Exit gate:** visual review finds no clipped or overlapping critical content;
keyboard and touch users can complete the same action; calculation receipts and
reasoned interventions remain readable at 320x844, 390x844 where applicable,
1440x900, and 844x390; reduced motion removes nonessential motion; route-level
tests prove forward and return navigation; bundle and render performance remain
within the repository's measured limits.

### Phase 9 — Capacity, abuse protection, and release readiness

**Objective:** prove the service can host the intended table and release each
slice without weakening security.

**Work:**

- Follow `docs/ABUSE_PROTECTION_HANDOFF.md`: validate App Check behavior,
  classify callable costs, preserve identity/session-aware throttles, and
  make overload/retry behavior recoverable and idempotent.
- Build one reproducible capacity command before claiming load evidence. It
  must exercise production-shaped gameplay, accept explicit client/duration
  parameters, fail on declared thresholds, and write a reviewable artifact
  tied to the tested commit and deployment/environment identity.
- Run an isolated, repeatable 60-client scenario covering startup/reconnect,
  15 minutes of heartbeats and live listeners, concurrent GM/player actions,
  contention on shared documents, and recovery from temporary 429/unavailable
  responses. Capture latency, errors, saturation, Firestore usage, and cost.
- Establish budget alerts, callable/Firestore dashboards, alert thresholds,
  and an incident runbook. Treat any WAF/proxy addition as a separate
  architecture decision with product-owner approval and bypass analysis.
- For each product increment, synchronize package metadata, runtime-derived
  version display, newest player-facing changelog entry, tests/builds, and
  deployment scope. Documentation-only edits remain exempt from version and
  changelog changes.
- Finish the same-worktree coordination entry, review the final diff, merge
  promptly to `main`, and push only after the local gates are green.

**Exit gate:** the measured operating envelope is usable for legitimate
clients, malformed/unauthorized traffic is rejected before meaningful game
work, retries do not duplicate mutations, operational owners know how to
respond, and the release evidence is recorded with the change.

## Review budget and evidence reuse

The compact milestone route owns the current
[review budget and evidence-reuse policy](./IMPLEMENTATION_MILESTONES.md#review-budget-and-evidence-reuse).
This catalog retains prompt acceptance and classification tags; it does not
duplicate mutable tag counts or a second review workflow. Apply the milestone
policy to each bounded slice and keep the prompt-specific acceptance below.

## Test-first execution contract

`CLAUDE.md` is the workflow source of truth. The plan adds only these
gameplay-specific requirements:

1. Name the exact printed source and the Given/When/Then player or facilitator
   result before writing code.
2. For `[PRESERVE]`, close from current evidence when it already satisfies the
   acceptance. For `[REPAIR]`, `[EXTEND]`, or `[NEW]`, observe the smallest
   missing production-path acceptance fail before implementation. A
   `[DEFERRED-OWNER]` prompt cannot begin until the recorded owner gate opens.
3. Exercise server authority, direct-write denial, audience projection,
   idempotent retry/reconnect, visible success/failure, and stable audit output
   wherever the selected mechanic uses those boundaries.
4. Exercise the shared console with a reference vessel and a materially
   different vessel where configuration varies.
5. Apply route, viewport, keyboard/touch, and reduced-motion checks only when
   the slice changes or newly exposes UI.

## Definition of done for the roadmap

A roadmap slice is complete only when its selected prompt acceptance and
milestone contribution have current named evidence, no exposed control depends
on unfinished later work to become truthful, and the `CLAUDE.md` definition of
done is satisfied. Prompt completion is not milestone completion: the milestone
exit fixture must also pass before claiming the player story. The full product
is complete only at the
[`1.0` completion gate](./IMPLEMENTATION_MILESTONES.md#10-completion-gate).

The dependency index is part of this gate. Before marking a prompt complete or
merging its slice, re-read its current row after final reconciliation and prove
that every hard prompt prerequisite is `done` and every named milestone,
contract, owner decision, and closure/evidence gate is satisfied in its proper
scope. An unresolved prerequisite blocks completion; numeric adjacency,
sequence context, or an unverified prose claim cannot override the index.

## Prompt-by-prompt ATDD build sequence

This is an incremental queue from the tested application that exists now to a
complete game. It is not a greenfield specification. The inventory below was
checked while the plan was prepared at commit `1418146`. At that historical
snapshot, the ordinary Vitest run reported **127 test files and 1,126 tests
passing**, and the separate Firestore suite reported **52 passing rules tests**.
Those counts are context, not current proof; `main` has advanced and every
selected slice must use its current focused evidence plus the live progress
ledger. Do not infer gameplay-completion percentage from test-file count.

### Current tested foundation

| Existing capability | Representative test anchors | Roadmap treatment |
|---|---|---|
| Session creation UI, join-code security, joining, resume, reconnect, presence expiry, seven-day empty-session retention, outbox replay, and disconnect | `src/routes/Landing.test.tsx`, `src/lib/sessionService.test.ts`, `functions/src/joinSessionCallable.test.ts`, `functions/src/sessionResumeCallable.test.ts`, `functions/src/sessionLifecycleCallable.test.ts` | Preserve. Add direct callable or emulator composition tests only where the current suite has a named gap. |
| Seat claim/release, command-role ownership, crew relief, GM access, named GM instances, lock/recovery, kicking, observer mode, and return navigation | `functions/src/seatCallable.test.ts`, `functions/src/consoleRolePolicy.test.ts`, `functions/src/crewAccess.test.ts`, `functions/src/gmSessionCallable.test.ts`, `functions/src/gmControlsLock.test.ts`, `src/routes/RoleSelect.test.tsx` | Preserve. Extend into casting and the one-facilitator/optional-multi-GM stories without replacing current authority or routes. |
| Turn 0, Team/Coordination clocks, turn advancement, airspace windows, extension, emergency pause/resume, announcements, replay, alerts, ticker precedence, and debrief-mode presentation | `functions/src/turnZero.test.ts`, `functions/src/maintenanceCallable.test.ts`, `functions/src/turnStartReplayCallable.test.ts`, `src/components/TurnStartAnnouncement.test.tsx`, `functions/src/fleetAlertCallable.test.ts`, `functions/src/debriefModeCallable.test.ts` | Preserve. Compose into multi-turn and endgame scenarios; do not rebuild the existing clock or finale control. |
| Common maintenance sequencing, rations, unrest/riot, reactor charges, shuttle refuelling, turn expiry, resource counters, alert locks, and bounded rollback | `functions/src/maintenance.test.ts`, `functions/src/maintenanceCallable.test.ts`, `functions/src/maintenanceRollback.test.ts`, `functions/src/resources.test.ts`, `functions/src/shipCounterBatchCallables.test.ts` | Preserve the engine. Extend it with the still-descriptive per-ship production and specialist actions. |
| Printed populations, thresholds, all current damage decks, authoritative draws, AEGIS armour recycling, empty-deck destruction, repair, and retry-stable damage identity | `src/data/printedPopulation.test.ts`, `functions/src/shipPopulationCallables.test.ts`, `functions/src/shipDamage.test.ts`, `functions/src/shipDamageCallable.test.ts` | Preserve. Extend into evacuation, destroyed-ship aftermath, combat, and every card-to-console effect. |
| Typed vessel, role, shuttle, fighter, Union, resource, Capybara, initial-docking, and console-workspace catalogs | `src/data/vesselTemplates.test.ts`, `src/data/roles.test.ts`, `src/data/rolePresets.test.ts`, `src/data/shuttles.test.ts`, `functions/src/shuttlecraft.test.ts`, `src/data/shipConsoleWorkspaces.test.ts` | Preserve the IDs and shared templates. Treat printed operation cards as scaffold until an authoritative action test proves them executable. |
| Jump button, coordinate lock/power interaction, printed fuel bands, fuel/charge consumption, one-ship movement, one-hour integrity lockout, navigation events, and jump transition presentation | `src/components/JumpDriveConsole.test.tsx`, `functions/src/jumpDrive.test.ts`, `functions/src/jumpCallable.test.ts`, `functions/src/navigation.test.ts` | Preserve. Add valid end-to-end, all-vessel, damaged/upgraded, concurrent, group, arrival-hook, and reconnect coverage. |
| Printed 22-system/40-link chart, candidate overlays, GM starmap/relocation, pursuit calculation, fixed fleet formation, coordinate-based contact filtering, DRADIS sweep/sampling, blackout, range, and reduced motion | `src/data/starChart.test.ts`, `src/data/pursuit.test.ts`, `src/data/fleetFormation.test.ts`, `src/components/GmStarmapModule.test.tsx`, `src/components/ContactPlot.test.tsx`, `src/components/ShipPlot.test.tsx` | Preserve presentation and data. Add authoritative chart choice, fleet groups, group-local projections, pursuit state, arrival effects, and shuttle contacts. |
| Shared shuttle console, initial dock/visit history, role routing, SNN Press dispatch, confetti/evidence shredder, motion-safety gate, settings, PWA shell, responsive CIC styling, and accessible failure/read-only states | `src/components/ShuttleConsoleTemplate.test.tsx`, `src/routes/ShuttleConsole.test.tsx`, `functions/src/pressDispatchCallable.test.ts`, `functions/src/shipConfetti.test.ts`, `src/components/MotionSafetyGate.test.tsx`, `src/pwa.test.ts`, `src/styles/aesthetic.test.ts` | Preserve. Add movement and capability modules to the existing shell; never create parallel shuttle routes or duplicate Press controls. |
| Wolf role-ID assignment and finale/debrief visual mode | `functions/src/wolfAssignment.test.ts`, `src/routes/GmConsole.test.tsx`, `functions/src/debriefModeCallable.test.ts`, `src/components/DebriefMode.test.tsx` | Preserve these setup/presentation primitives. Wolf actions, attacks, loyalties, outcomes, and durable debrief records are new work. |
| Current Firestore authority and App Check boundaries | `tests/rules/firestore.rules.test.ts`, `functions/src/runtimeOptions.test.ts`, `src/lib/firebase.test.ts` | Preserve every current allow/deny contract. Extend the matrix for each new collection or projection. |

The important boundary is between **tested primitives** and a **playable story**.
For example, current coordinate filtering already hides ships in other systems,
but fleet-group identity, private communication, independent pursuit and rejoin
do not exist. The current shuttle catalog and initial dockings are real, but no
general shuttle movement callable exists. Wolf assignment is real, but Wolf
actions and the attack engine are not. Candidate coordinates and the finale
visual are real, but candidate resolution and a durable outcome are not.

### Prompt status legend

- **`[PRESERVE]`** — the current suite already exercises the behavior. Do not
  rewrite it. Reuse the named current evidence, add only a genuinely missing
  regression or composition case, and batch adjacent evidence-only closures
  when no product behavior changes.
- **`[EXTEND]`** — production scaffolding or part of the behavior exists. Add
  the smallest missing authoritative edge while retaining every passing test,
  ID, route, template, and player-facing contract.
- **`[REPAIR]`** — current production behavior or green evidence conflicts with
  known working behavior or an owner-set contract. Complete the provenance and
  contract-drift gate, replace the misleading test, and preserve unrelated
  behavior through the narrowest compatible correction.
- **`[NEW]`** — no complete production behavior or dedicated acceptance test
  was found. Add it as one failing-first vertical slice on top of the existing
  architecture.
- **`[PROVE]`** — compose existing and newly landed parts into an emulator,
  browser, security, capacity, or full-story acceptance scenario. A proof
  prompt does not authorize a rewrite to make the fixture easier.
- **`[DECISION]`** — resolve a genuine printed-rule or product ambiguity before
  exposing the affected action. Record the source and chosen policy.
- **`[DEFERRED-OWNER]`** — the owner has explicitly postponed the surface. Keep
  it missing and out of dependent exit gates until the prerequisite contract
  is proven and the owner authorizes activation; do not implement it as an
  unsolicited enhancement.

At selection time, reconcile the chosen prompt with current `main`, active
coordination claims, its progress row, and the relevant rule-matrix row. Do
this once per slice; do not re-audit the whole catalog. The status tag overrides
any broad verb retained in the title: `[PRESERVE] Implement ...` means preserve
the proven contract, not replace it. If later work has landed, reclassify the
prompt to `[PRESERVE]`, link its proof, and make no duplicate implementation.
Split only when the first failing test exposes independent state changes;
retain the original ID with a lettered child rather than renumbering completed
work.

### Contract carried by every numbered prompt

Treat each entry below as if it ended with this instruction:

> Follow `CLAUDE.md`, the selected milestone row, the exact printed source, and
> the review budget. State the Given/When/Then outcome. Preserve current proof
> or observe the smallest missing acceptance fail, then deliver one bounded,
> authoritative, retry-safe, audience-correct result with truthful success and
> failure UI where applicable. Do not expose a control whose action, denial,
> result, and recovery path are not real. Record focused evidence and complete
> the single reconciled release gate required by `CLAUDE.md`.

Planning, decision, fixture, and operations prompts use the same discipline:
their first red check is an executable schema, traceability, security, replay,
or evidence assertion rather than a fictional product control. Each product
prompt should leave `main` releasable on its own; later prompts must not be
required to make an earlier exposed control truthful. Existing tests are the
regression floor throughout this queue, not disposable scaffolding.

That floor does not make stale intent canonical. If history or an owner report
shows that a green fixture blesses a regression, follow
[Existing behavior is the design baseline](#existing-behavior-is-the-design-baseline):
correct the contract and misleading test, add the missing composed regression,
then preserve the repaired old and new acceptances together.

### Build order

#### Execution state

The complete 734-ID queue (Prompts 001–667 plus the lettered prompts, with the
retired Prompt 071 removed) is in scope for the active completion campaign. All
734 canonical prompt IDs (001–667 plus the lettered prompts, with the retired
Prompt 071 removed) are tracked in the checklist below and in
[`docs/IMPLEMENTATION_PROGRESS.md`](./IMPLEMENTATION_PROGRESS.md) before their
implementation begins. A completed prompt is marked with a checked task box
and recorded with current evidence. Unchecked, `partial`, and `missing`
prompts remain open; none of those states may be treated as completion.
The lowest unresolved ID is the default triage resume pointer, not a dependency
lock. A worktree may select any dependency-ready unresolved prompt in the
current milestone, and distinct coordination claims may proceed concurrently.
`NEXT` (the first item in `READY_QUEUE`) is the primary resume/default lane, but
it is advisory for concurrency, not a serial execution lock. A later queue item
may be claimed in a separate worktree only after its hard prerequisites and any
hard milestone, contract, and decision-owner gates are satisfied/confirmed and
the coordination forecast shows conflict-free ownership. No worktree may
bypass dependencies, active claims, or unresolved decision-owner gates merely
because the prompt is independent.

#### Implementation-plan agent policy

For numbered prompts, [`CLAUDE.md`](../CLAUDE.md) is the sole authority for
one-owner execution, proportional testing, risk-based independent review,
model selection, reconciliation, and release. This plan adds no campaign-wide
agent sequence, model floor, delegation count, or coordination-closeout rule.
The JSON prompt catalog remains the current prompt authority; the optional
read-only dependency query may inform a numbered task but creates no receipt.

<!-- BEGIN GENERATED PROMPT CATALOG: plan -->
<!-- Generated from docs/implementation-prompts.json; edit the catalog and run the view generator. -->
#### Prompt checklist
#### Execution checklist — all 746 prompts (catalog view)
- [x] Prompt 001
- [x] Prompt 002
- [x] Prompt 003
- [x] Prompt 004
- [x] Prompt 005
- [x] Prompt 006
- [x] Prompt 007
- [x] Prompt 008
- [x] Prompt 009
- [x] Prompt 010
- [x] Prompt 011
- [x] Prompt 012
- [x] Prompt 013
- [x] Prompt 014
- [x] Prompt 015
- [x] Prompt 016
- [x] Prompt 017
- [x] Prompt 018
- [x] Prompt 019
- [x] Prompt 020
- [ ] Prompt 020a
- [x] Prompt 021
- [x] Prompt 022
- [x] Prompt 023
- [x] Prompt 024
- [x] Prompt 025
- [x] Prompt 026
- [x] Prompt 027
- [x] Prompt 028
- [x] Prompt 029
- [x] Prompt 030
- [x] Prompt 031
- [ ] Prompt 031a
- [x] Prompt 032
- [x] Prompt 033
- [x] Prompt 034
- [x] Prompt 035
- [x] Prompt 036
- [x] Prompt 037
- [x] Prompt 038
- [x] Prompt 039
- [x] Prompt 040
- [x] Prompt 041
- [x] Prompt 042
- [x] Prompt 043
- [x] Prompt 044
- [x] Prompt 045
- [x] Prompt 046
- [x] Prompt 047
- [x] Prompt 048
- [x] Prompt 049
- [x] Prompt 050
- [x] Prompt 051
- [x] Prompt 052
- [x] Prompt 053
- [x] Prompt 054
- [x] Prompt 055
- [x] Prompt 056
- [x] Prompt 057
- [x] Prompt 058
- [x] Prompt 059
- [x] Prompt 060
- [x] Prompt 061
- [x] Prompt 062
- [x] Prompt 063
- [x] Prompt 064
- [x] Prompt 065
- [x] Prompt 066
- [x] Prompt 067
- [x] Prompt 068
- [ ] Prompt 069
- [ ] Prompt 070
- [x] Prompt 072
- [x] Prompt 073
- [x] Prompt 074
- [ ] Prompt 075
- [x] Prompt 076
- [ ] Prompt 077
- [x] Prompt 078
- [x] Prompt 079
- [ ] Prompt 080
- [x] Prompt 081
- [ ] Prompt 082
- [x] Prompt 083
- [ ] Prompt 084
- [ ] Prompt 085
- [ ] Prompt 086
- [x] Prompt 087
- [ ] Prompt 088
- [ ] Prompt 089
- [ ] Prompt 090
- [ ] Prompt 091
- [x] Prompt 092
- [x] Prompt 093
- [x] Prompt 094
- [x] Prompt 095
- [x] Prompt 096
- [x] Prompt 097
- [x] Prompt 098
- [x] Prompt 099
- [ ] Prompt 100
- [x] Prompt 101
- [ ] Prompt 102
- [x] Prompt 103
- [ ] Prompt 103a
- [ ] Prompt 104
- [ ] Prompt 105
- [ ] Prompt 106
- [ ] Prompt 106a
- [x] Prompt 106b
- [ ] Prompt 106c
- [ ] Prompt 107
- [x] Prompt 108
- [x] Prompt 109
- [ ] Prompt 110
- [ ] Prompt 111
- [ ] Prompt 112
- [ ] Prompt 113
- [ ] Prompt 114
- [x] Prompt 115
- [ ] Prompt 116
- [ ] Prompt 117
- [ ] Prompt 118
- [ ] Prompt 119
- [ ] Prompt 120
- [ ] Prompt 121
- [x] Prompt 122
- [ ] Prompt 122a
- [ ] Prompt 123
- [ ] Prompt 124
- [ ] Prompt 125
- [ ] Prompt 126
- [ ] Prompt 127
- [ ] Prompt 128
- [ ] Prompt 129
- [ ] Prompt 130
- [ ] Prompt 131
- [x] Prompt 132
- [x] Prompt 133
- [ ] Prompt 134
- [ ] Prompt 135
- [ ] Prompt 136
- [ ] Prompt 137
- [x] Prompt 138
- [x] Prompt 138a
- [x] Prompt 139
- [ ] Prompt 140
- [ ] Prompt 140a
- [ ] Prompt 140b
- [ ] Prompt 140c
- [ ] Prompt 140d
- [ ] Prompt 140e
- [ ] Prompt 140f
- [ ] Prompt 140g
- [x] Prompt 141
- [ ] Prompt 142
- [ ] Prompt 143
- [ ] Prompt 144
- [ ] Prompt 145
- [ ] Prompt 146
- [ ] Prompt 147
- [ ] Prompt 148
- [ ] Prompt 149
- [ ] Prompt 150
- [ ] Prompt 151
- [ ] Prompt 152
- [ ] Prompt 153
- [ ] Prompt 154
- [ ] Prompt 155
- [ ] Prompt 156
- [ ] Prompt 157
- [ ] Prompt 158
- [ ] Prompt 159
- [ ] Prompt 160
- [ ] Prompt 161
- [ ] Prompt 162
- [ ] Prompt 163
- [ ] Prompt 164
- [ ] Prompt 165
- [ ] Prompt 166
- [ ] Prompt 167
- [ ] Prompt 168
- [ ] Prompt 169
- [ ] Prompt 170
- [ ] Prompt 171
- [ ] Prompt 172
- [ ] Prompt 173
- [ ] Prompt 174
- [ ] Prompt 175
- [ ] Prompt 176
- [x] Prompt 177
- [ ] Prompt 178
- [ ] Prompt 179
- [ ] Prompt 180
- [ ] Prompt 181
- [ ] Prompt 182
- [ ] Prompt 183
- [ ] Prompt 184
- [ ] Prompt 185
- [ ] Prompt 186
- [ ] Prompt 187
- [ ] Prompt 188
- [ ] Prompt 189
- [ ] Prompt 190
- [ ] Prompt 191
- [ ] Prompt 192
- [ ] Prompt 193
- [ ] Prompt 193a
- [ ] Prompt 193b
- [ ] Prompt 194
- [ ] Prompt 195
- [ ] Prompt 196
- [ ] Prompt 197
- [ ] Prompt 198
- [ ] Prompt 199
- [ ] Prompt 200
- [ ] Prompt 201
- [ ] Prompt 202
- [ ] Prompt 203
- [ ] Prompt 203a
- [ ] Prompt 203b
- [ ] Prompt 204
- [ ] Prompt 205
- [ ] Prompt 206
- [ ] Prompt 207
- [ ] Prompt 208
- [ ] Prompt 209
- [ ] Prompt 210
- [ ] Prompt 211
- [ ] Prompt 212
- [ ] Prompt 213
- [ ] Prompt 214
- [ ] Prompt 215
- [ ] Prompt 215a
- [ ] Prompt 215b
- [ ] Prompt 216
- [ ] Prompt 217
- [ ] Prompt 218
- [ ] Prompt 219
- [ ] Prompt 220
- [ ] Prompt 221
- [ ] Prompt 222
- [ ] Prompt 223
- [ ] Prompt 223a
- [ ] Prompt 223b
- [ ] Prompt 224
- [ ] Prompt 225
- [ ] Prompt 226
- [ ] Prompt 227
- [ ] Prompt 228
- [ ] Prompt 229
- [ ] Prompt 230
- [ ] Prompt 231
- [ ] Prompt 232
- [ ] Prompt 233
- [ ] Prompt 233a
- [ ] Prompt 233b
- [ ] Prompt 234
- [ ] Prompt 234a
- [ ] Prompt 235
- [ ] Prompt 236
- [ ] Prompt 237
- [ ] Prompt 238
- [ ] Prompt 239
- [ ] Prompt 240
- [ ] Prompt 241
- [ ] Prompt 241a
- [ ] Prompt 241b
- [ ] Prompt 241c
- [ ] Prompt 241d
- [ ] Prompt 241e
- [ ] Prompt 242
- [ ] Prompt 243
- [ ] Prompt 244
- [ ] Prompt 245
- [ ] Prompt 246
- [ ] Prompt 247
- [ ] Prompt 248
- [ ] Prompt 249
- [ ] Prompt 250
- [ ] Prompt 251
- [ ] Prompt 252
- [ ] Prompt 253
- [ ] Prompt 254
- [ ] Prompt 255
- [ ] Prompt 256
- [ ] Prompt 257
- [ ] Prompt 258
- [ ] Prompt 259
- [ ] Prompt 260
- [ ] Prompt 261
- [ ] Prompt 262
- [ ] Prompt 263
- [ ] Prompt 264
- [ ] Prompt 265
- [ ] Prompt 266
- [ ] Prompt 267
- [ ] Prompt 268
- [ ] Prompt 269
- [ ] Prompt 270
- [ ] Prompt 271
- [ ] Prompt 272
- [ ] Prompt 273
- [ ] Prompt 274
- [ ] Prompt 275
- [x] Prompt 275a
- [ ] Prompt 275b
- [ ] Prompt 276
- [ ] Prompt 277
- [ ] Prompt 278
- [ ] Prompt 279
- [ ] Prompt 280
- [ ] Prompt 281
- [ ] Prompt 282
- [ ] Prompt 283
- [ ] Prompt 284
- [ ] Prompt 285
- [ ] Prompt 286
- [ ] Prompt 287
- [ ] Prompt 288
- [ ] Prompt 289
- [ ] Prompt 290
- [ ] Prompt 291
- [ ] Prompt 292
- [ ] Prompt 293
- [ ] Prompt 294
- [ ] Prompt 295
- [ ] Prompt 296
- [ ] Prompt 297
- [ ] Prompt 298
- [ ] Prompt 299
- [ ] Prompt 300
- [ ] Prompt 301
- [ ] Prompt 302
- [ ] Prompt 303
- [ ] Prompt 304
- [ ] Prompt 305
- [ ] Prompt 306
- [ ] Prompt 307
- [ ] Prompt 308
- [ ] Prompt 309
- [ ] Prompt 310
- [ ] Prompt 311
- [ ] Prompt 312
- [ ] Prompt 313
- [ ] Prompt 314
- [ ] Prompt 315
- [ ] Prompt 316
- [ ] Prompt 317
- [ ] Prompt 318
- [ ] Prompt 319
- [ ] Prompt 320
- [ ] Prompt 321
- [ ] Prompt 322
- [ ] Prompt 323
- [ ] Prompt 324
- [ ] Prompt 325
- [ ] Prompt 326
- [ ] Prompt 327
- [ ] Prompt 328
- [ ] Prompt 329
- [ ] Prompt 330
- [ ] Prompt 331
- [ ] Prompt 332
- [ ] Prompt 333
- [ ] Prompt 334
- [ ] Prompt 335
- [ ] Prompt 336
- [ ] Prompt 337
- [ ] Prompt 338
- [ ] Prompt 339
- [ ] Prompt 340
- [ ] Prompt 341
- [ ] Prompt 342
- [ ] Prompt 343
- [ ] Prompt 344
- [ ] Prompt 345
- [ ] Prompt 346
- [ ] Prompt 347
- [ ] Prompt 348
- [ ] Prompt 349
- [ ] Prompt 350
- [ ] Prompt 351
- [ ] Prompt 352
- [ ] Prompt 353
- [ ] Prompt 354
- [ ] Prompt 355
- [ ] Prompt 356
- [ ] Prompt 357
- [ ] Prompt 358
- [ ] Prompt 359
- [ ] Prompt 360
- [ ] Prompt 361
- [ ] Prompt 362
- [ ] Prompt 363
- [ ] Prompt 364
- [ ] Prompt 365
- [ ] Prompt 366
- [ ] Prompt 367
- [ ] Prompt 368
- [ ] Prompt 369
- [ ] Prompt 370
- [ ] Prompt 371
- [ ] Prompt 372
- [ ] Prompt 373
- [ ] Prompt 374
- [ ] Prompt 375
- [ ] Prompt 376
- [ ] Prompt 377
- [ ] Prompt 378
- [ ] Prompt 379
- [ ] Prompt 380
- [ ] Prompt 381
- [ ] Prompt 382
- [ ] Prompt 383
- [ ] Prompt 384
- [ ] Prompt 385
- [ ] Prompt 386
- [ ] Prompt 387
- [ ] Prompt 388
- [ ] Prompt 389
- [ ] Prompt 390
- [ ] Prompt 391
- [ ] Prompt 392
- [ ] Prompt 393
- [ ] Prompt 394
- [ ] Prompt 395
- [ ] Prompt 396
- [ ] Prompt 397
- [ ] Prompt 398
- [ ] Prompt 399
- [ ] Prompt 400
- [ ] Prompt 401
- [ ] Prompt 402
- [ ] Prompt 403
- [ ] Prompt 404
- [ ] Prompt 405
- [ ] Prompt 406
- [ ] Prompt 407
- [ ] Prompt 408
- [ ] Prompt 409
- [ ] Prompt 410
- [ ] Prompt 411
- [ ] Prompt 412
- [ ] Prompt 413
- [ ] Prompt 414
- [ ] Prompt 415
- [ ] Prompt 416
- [ ] Prompt 416a
- [ ] Prompt 416b
- [ ] Prompt 417
- [ ] Prompt 417a
- [ ] Prompt 417b
- [ ] Prompt 418
- [ ] Prompt 418a
- [ ] Prompt 418b
- [ ] Prompt 419
- [ ] Prompt 420
- [ ] Prompt 421
- [ ] Prompt 421a
- [ ] Prompt 422
- [ ] Prompt 423
- [ ] Prompt 424
- [ ] Prompt 425
- [ ] Prompt 426
- [ ] Prompt 427
- [ ] Prompt 428
- [ ] Prompt 429
- [ ] Prompt 430
- [ ] Prompt 431
- [ ] Prompt 432
- [ ] Prompt 432a
- [ ] Prompt 433
- [ ] Prompt 433a
- [ ] Prompt 433b
- [ ] Prompt 434
- [ ] Prompt 434a
- [ ] Prompt 435
- [ ] Prompt 436
- [ ] Prompt 437
- [ ] Prompt 438
- [ ] Prompt 439
- [ ] Prompt 440
- [ ] Prompt 441
- [ ] Prompt 442
- [ ] Prompt 443
- [ ] Prompt 444
- [ ] Prompt 445
- [ ] Prompt 446
- [ ] Prompt 447
- [ ] Prompt 448
- [ ] Prompt 449
- [ ] Prompt 450
- [ ] Prompt 451
- [ ] Prompt 452
- [ ] Prompt 453
- [ ] Prompt 454
- [ ] Prompt 455
- [ ] Prompt 456
- [ ] Prompt 457
- [ ] Prompt 458
- [ ] Prompt 459
- [ ] Prompt 460
- [ ] Prompt 461
- [ ] Prompt 462
- [ ] Prompt 463
- [ ] Prompt 464
- [ ] Prompt 465
- [ ] Prompt 466
- [ ] Prompt 467
- [ ] Prompt 468
- [ ] Prompt 469
- [ ] Prompt 469a
- [ ] Prompt 469b
- [ ] Prompt 469c
- [ ] Prompt 469d
- [ ] Prompt 469e
- [ ] Prompt 470
- [ ] Prompt 471
- [ ] Prompt 472
- [ ] Prompt 473
- [ ] Prompt 474
- [ ] Prompt 475
- [ ] Prompt 476
- [ ] Prompt 477
- [ ] Prompt 478
- [ ] Prompt 479
- [ ] Prompt 480
- [ ] Prompt 481
- [ ] Prompt 482
- [ ] Prompt 483
- [ ] Prompt 484
- [ ] Prompt 485
- [ ] Prompt 485a
- [ ] Prompt 486
- [ ] Prompt 487
- [ ] Prompt 488
- [ ] Prompt 489
- [ ] Prompt 490
- [ ] Prompt 491
- [ ] Prompt 492
- [ ] Prompt 493
- [ ] Prompt 494
- [ ] Prompt 495
- [ ] Prompt 496
- [ ] Prompt 497
- [ ] Prompt 498
- [ ] Prompt 499
- [ ] Prompt 500
- [ ] Prompt 501
- [ ] Prompt 502
- [ ] Prompt 503
- [ ] Prompt 503a
- [ ] Prompt 504
- [ ] Prompt 505
- [ ] Prompt 506
- [ ] Prompt 507
- [ ] Prompt 508
- [ ] Prompt 509
- [ ] Prompt 510
- [ ] Prompt 511
- [ ] Prompt 512
- [ ] Prompt 513
- [ ] Prompt 514
- [ ] Prompt 515
- [ ] Prompt 516
- [ ] Prompt 517
- [ ] Prompt 518
- [ ] Prompt 519
- [ ] Prompt 520
- [ ] Prompt 521
- [ ] Prompt 521a
- [ ] Prompt 521b
- [ ] Prompt 522
- [ ] Prompt 523
- [ ] Prompt 523a
- [ ] Prompt 523b
- [ ] Prompt 523c
- [ ] Prompt 524
- [ ] Prompt 524a
- [ ] Prompt 524b
- [ ] Prompt 524c
- [ ] Prompt 524d
- [ ] Prompt 525
- [ ] Prompt 526
- [ ] Prompt 527
- [ ] Prompt 528
- [ ] Prompt 529
- [ ] Prompt 530
- [ ] Prompt 531
- [ ] Prompt 532
- [ ] Prompt 533
- [ ] Prompt 534
- [ ] Prompt 535
- [ ] Prompt 536
- [ ] Prompt 537
- [ ] Prompt 538
- [ ] Prompt 539
- [ ] Prompt 540
- [ ] Prompt 541
- [ ] Prompt 542
- [ ] Prompt 543
- [ ] Prompt 544
- [ ] Prompt 545
- [ ] Prompt 546
- [ ] Prompt 547
- [ ] Prompt 548
- [ ] Prompt 549
- [ ] Prompt 550
- [ ] Prompt 551
- [ ] Prompt 552
- [ ] Prompt 553
- [ ] Prompt 554
- [ ] Prompt 555
- [ ] Prompt 556
- [ ] Prompt 557
- [ ] Prompt 558
- [ ] Prompt 559
- [ ] Prompt 560
- [ ] Prompt 561
- [ ] Prompt 562
- [ ] Prompt 563
- [ ] Prompt 564
- [ ] Prompt 565
- [ ] Prompt 566
- [ ] Prompt 567
- [ ] Prompt 568
- [ ] Prompt 569
- [ ] Prompt 570
- [ ] Prompt 571
- [ ] Prompt 572
- [ ] Prompt 573
- [ ] Prompt 574
- [ ] Prompt 575
- [ ] Prompt 576
- [ ] Prompt 577
- [ ] Prompt 578
- [ ] Prompt 579
- [ ] Prompt 580
- [ ] Prompt 581
- [ ] Prompt 582
- [ ] Prompt 583
- [ ] Prompt 584
- [ ] Prompt 585
- [ ] Prompt 586
- [ ] Prompt 587
- [ ] Prompt 588
- [ ] Prompt 589
- [ ] Prompt 589a
- [ ] Prompt 589b
- [ ] Prompt 590
- [ ] Prompt 591
- [ ] Prompt 592
- [ ] Prompt 593
- [ ] Prompt 594
- [ ] Prompt 595
- [ ] Prompt 596
- [ ] Prompt 597
- [ ] Prompt 598
- [ ] Prompt 599
- [ ] Prompt 600
- [ ] Prompt 601
- [ ] Prompt 602
- [ ] Prompt 602a
- [ ] Prompt 603
- [x] Prompt 603a
- [ ] Prompt 604
- [ ] Prompt 605
- [ ] Prompt 605a
- [ ] Prompt 606
- [ ] Prompt 607
- [ ] Prompt 608
- [ ] Prompt 609
- [ ] Prompt 610
- [ ] Prompt 611
- [ ] Prompt 611a
- [ ] Prompt 612
- [ ] Prompt 613
- [ ] Prompt 614
- [ ] Prompt 615
- [ ] Prompt 616
- [ ] Prompt 617
- [ ] Prompt 618
- [ ] Prompt 619
- [ ] Prompt 620
- [ ] Prompt 621
- [ ] Prompt 622
- [ ] Prompt 623
- [ ] Prompt 624
- [ ] Prompt 625
- [ ] Prompt 626
- [ ] Prompt 627
- [ ] Prompt 628
- [ ] Prompt 629
- [ ] Prompt 630
- [ ] Prompt 631
- [ ] Prompt 632
- [ ] Prompt 633
- [ ] Prompt 634
- [ ] Prompt 635
- [ ] Prompt 636
- [ ] Prompt 637
- [ ] Prompt 638
- [ ] Prompt 639
- [ ] Prompt 640
- [ ] Prompt 641
- [ ] Prompt 642
- [ ] Prompt 643
- [ ] Prompt 644
- [ ] Prompt 645
- [ ] Prompt 646
- [ ] Prompt 647
- [ ] Prompt 648
- [ ] Prompt 649
- [ ] Prompt 650
- [ ] Prompt 651
- [ ] Prompt 652
- [ ] Prompt 652a
- [ ] Prompt 652b
- [ ] Prompt 653
- [ ] Prompt 654
- [ ] Prompt 655
- [ ] Prompt 656
- [ ] Prompt 657
- [ ] Prompt 658
- [ ] Prompt 659
- [x] Prompt 660
- [x] Prompt 661
- [ ] Prompt 662
- [ ] Prompt 663
- [x] Prompt 664
- [x] Prompt 665
- [x] Prompt 666
- [ ] Prompt 667
- [ ] Prompt 668
- [ ] Prompt 669
- [ ] Prompt 670
- [ ] Prompt 671
- [ ] Prompt 672
- [ ] Prompt 673
- [ ] Prompt 674
- [ ] Prompt 675
- [ ] Prompt 676
- [ ] Prompt 677
- [ ] Prompt 678
- [ ] Prompt 679

#### Foundation, session, casting, and start (Prompts 001–090)
- **Prompt 001 — [PRESERVE] Build the canonical rule-source index.** Acceptance: every planned mechanic resolves to a routed reference, with printed component sheets taking precedence over generic guides.
- **Prompt 002 — [PRESERVE] Encode source precedence.** Acceptance: conflicting generic and ship-specific values resolve to the printed component value and the conflict remains traceable.
- **Prompt 003 — [DECISION] Create the ambiguity ledger.** Acceptance: every known discrepancy is an explicit facilitator decision, product decision, or blocked action rather than a speculative control.
- **Prompt 004 — [EXTEND] Encode the supported player-count matrix.** Acceptance: each printed base-game count from 8 through 18 produces only its printed roles, ships, Union assignments, and Wolf count; the owner-set expansion rows are exactly 19 = printed base-17 plus atomic Capybara Captain/Recycler and 20 = printed base-18 plus the pair, both with two Wolves. Lower-count 8–18 Capybara substitutions remain undecided and must not be invented; Press and GM instances never fill a core row.
- **Prompt 005 — [PROVE] Define the session capability matrix.** Acceptance: every action names its actor, role, phase, vessel, inputs, authority, visible result, denial, audit, and test surface.
- **Prompt 006 — [PROVE] Define information projections.** Acceptance: public, member, crew, role-private, loyalty-private, GM, and facilitator snapshots contain only permitted fields.
- **Prompt 007 — [PROVE] Define the authoritative event envelope.** Acceptance: each shared mutation records session, actor, role, turn, phase, type, request ID, revision, and server time.
- **Prompt 008 — [PROVE] Define the complete lifecycle state machine.** Acceptance: lobby, casting, briefing, active turns, success, failure, debrief, closed, and retained-empty transitions reject illegal edges.
- **Prompt 009 — [PROVE] Create deterministic ATDD fixtures.** Acceptance: tests can construct minimal members, roles, ships, shuttles, clocks, random sources, snapshots, and private readers without bypassing production authority.
- **Prompt 010 — [PROVE] Audit current `main` against the rule matrix.** Acceptance: every existing behavior is marked verified, partial, missing, ambiguous, or superseded with a named test target.
- **Prompt 011 — [PRESERVE] Decide the session-code contract.** Acceptance: valid codes work, malformed codes fail without enumeration, and format, alphabet, lifetime, and collision policy are recorded as product decisions.
- **Prompt 012 — [PRESERVE] Define command idempotency.** Acceptance: retrying a command returns its original result without duplicating state, cost, randomness, or audit events.
- **Prompt 013 — [PRESERVE] Define authoritative server time.** Acceptance: leases, phase windows, deadlines, cooldowns, and retention use server time while clients remain display-only clocks.
- **Prompt 014 — [PRESERVE] Define stale-snapshot semantics.** Acceptance: cached state is visibly stale, may aid rendering, and cannot authorize a mutation or overwrite newer authority.
- **Prompt 015 — [EXTEND] Define the command error taxonomy.** Acceptance: clients distinguish unauthenticated, unauthorized, invalid phase, stale revision, conflict, malformed input, unavailable service, and terminal session without secret leakage.
- **Prompt 016 — [PRESERVE] Define member and device identity.** Acceptance: reconnect associates the correct authenticated player and device while client-written identity fields cannot confer membership.
- **Prompt 017 — [EXTEND] Stabilize entity identifiers.** Acceptance: sessions, players, seats, roles, vessels, consoles, shuttles, groups, missions, attacks, and events retain one typed ID across snapshots.
- **Prompt 018 — [EXTEND] Define phase-eligible action metadata.** Acceptance: server guards reject otherwise valid actions in the wrong phase even when a stale UI still shows the control.
- **Prompt 019 — [EXTEND] Define privacy-safe audit records.** Acceptance: facilitators can inspect decisions while players receive only the public or private facts their roles permit.
- **Prompt 020 — [PROVE] Build the lobby-to-Team-Phase contract fixture.** Acceptance: one production-path scenario creates, joins, casts, starts, and enters Turn 1 without direct Firestore gameplay writes.
- **Prompt 020a — [NEW] Bound the single-player demo to Turn 1 without jump authority.** Acceptance: Given an authorized single-player demo using Prompt 020's production create→join→cast→start composition and the existing `startSinglePlayerDemo` app baseline, when it performs every supported setup/action through the end of Turn 1, then it stops at that boundary with an explicit Demo-mode result and never enters a later turn. Demo never exposes an executable jump control; any jump request, including stale, replayed, or unauthorized requests, is denied by the server-authoritative jump path before mutation, with zero mutation to fuel, location, pursuit, events, or turn/phase state. The client shows an on-screen accessible toast explicitly stating that jumps are unavailable in Demo mode. Keyboard order/focus, screen-reader status/live semantics, touch targets, reduced-motion behavior, reconnect/replay, stale retries, and multi-client projections remain truthful and cannot bypass the boundary. Dependencies: Prompt 020 plus the setup/start/Turn 1 contracts in Prompts 074–081 and the jump authority/readiness, route, mutation, and retry contracts in Prompts 177 and 287–304. Apply the authorized core-rules, facilitation, and ship source areas; this prompt extends the existing demo baseline and does not imply full-game or post-Turn-1 demo support.
- **Prompt 021 — [EXTEND] Validate session creation input.** Acceptance: unsupported player count, chart, expansion, turn limit, duplicate option, and malformed fields fail before writes. Existing evidence covers the printed/base 8–18 matrix only; owner-revised 8–20 source-derived Capybara core inputs and separate optional Press/multiple-GM state require composed migration coverage.
- **Prompt 022 — [EXTEND] Implement authoritative session creation.** Acceptance: one valid callable creates one lobby, owner/facilitator metadata, configuration, and event atomically.
- **Prompt 023 — [EXTEND] Make session creation retry-safe.** Acceptance: repeating the same creation request returns one session and one join code.
- **Prompt 024 — [PRESERVE] Authenticate join requests.** Acceptance: unauthenticated, revoked, or malformed identities cannot join or learn session state.
- **Prompt 025 — [PRESERVE] Resolve a requested join code without listing sessions.** Acceptance: a valid code finds only its session and an invalid code reveals no neighboring code or metadata.
- **Prompt 026 — [PRESERVE] Enforce membership uniqueness.** Acceptance: concurrent joins from one player/device produce one membership record and one stable result.
- **Prompt 027 — [PRESERVE] Throttle invalid joins safely.** Acceptance: repeated attempts receive non-enumerating limits while legitimate table retries remain recoverable.
- **Prompt 028 — [PRESERVE] Authorize minimal session-header reads.** Acceptance: members read the lobby header; unauthenticated and nonmember reads and collection listing are denied.
- **Prompt 029 — [PRESERVE] Enforce one seat per player.** Acceptance: concurrent claims cannot leave one player in two seats or one seat pointing to two players.
- **Prompt 030 — [REPAIR] Implement authoritative seat claiming.** Acceptance: a valid open-seat claim updates the seat, player pointer, roster, and event in one transaction. Session creation must provision the stable core-seat catalog and the existing client routes must expose callable-backed claim/release; request replay, setup revision, reconnect, audit, and direct-write denial are part of the production contract.
- **Prompt 031 — [PRESERVE] Resolve seat-claim races.** Acceptance: simultaneous claims yield one winner and one truthful conflict without orphaning either member.
- **Prompt 031a — [EXTEND] Unify fleet and console entry without weakening first-entry claims.** Acceptance: after the current setup/readiness slice, compose the separate fleet/flag and console/seat selection pages into one cohesive catalog in which every entitled authenticated player can inspect all enabled consoles and nonsecret status without claiming; first entry into an open core console atomically claims it server-side, simultaneous entry has one winner, and all clients converge in real time. Preserve stable IDs, authoritative CAS/idempotency/audit, reconnect, release/handoff/GM intervention, deep-link/Back behavior, Press's distinct non-counted station, claimed read-only state, and the exact audited shared-flag choreography from `5ea9b74` plus its named refinements. Prove no dual claim or direct write; keyboard, screen-reader, visible-focus, 44px touch, safe-area/rotation/reduced-motion, interruption/performance, and nonoverlap at 320×844, 390×844, 1440×900, and 844×390. This is one new unified flow whose existing flag presentation remains intact.
- **Prompt 032 — [PRESERVE] Implement authoritative seat release.** Acceptance: a player can release only a seat that still points to that player, with retry-safe cleanup.
- **Prompt 033 — [PRESERVE] Deny forged or stale seat release.** Acceptance: another player's seat and a newly reclaimed seat survive hostile or delayed release requests.
- **Prompt 034 — [PRESERVE] Implement session resume.** Acceptance: a returning device receives current session, player, seat, mode, and route authority rather than trusting cache.
- **Prompt 035 — [PRESERVE] Reconcile intended-seat reclaim.** Acceptance: an open intended seat is reclaimed atomically; if occupied, only the returner's stale pointer is cleared.
- **Prompt 036 — [PRESERVE] Restrict client presence writes.** Acceptance: a member writes only its own allowed presence fields and cannot change membership, seat, role, or game state.
- **Prompt 037 — [PRESERVE] Renew presence leases.** Acceptance: connected devices heartbeat at the documented cadence using server timestamps.
- **Prompt 038 — [PRESERVE] Expire stale devices.** Acceptance: a lease older than the documented threshold removes that device's authority without deleting the player or intent.
- **Prompt 039 — [PRESERVE] Reconcile seat ownership on expiry.** Acceptance: cleanup releases only a seat still owned by the expired UID and never displaces a newer occupant.
- **Prompt 040 — [PRESERVE] Retain empty sessions safely.** Acceptance: an empty session gains the renewable retention deadline and a returning member cancels pending deletion.
- **Prompt 041 — [PRESERVE] Make local disconnect idempotent.** Acceptance: repeated disconnect attempts clear local session state and reach landing once without pretending local cleanup changed server state.
- **Prompt 042 — [PRESERVE] Replay queued disconnect safely.** Acceptance: a transiently offline disconnect reconciles once, expires from the outbox on policy, and cannot release another device's seat.
- **Prompt 043 — [PRESERVE] Guard routes during resume and disconnect.** Acceptance: invalid membership returns to landing; valid cached sessions render as stale until authority arrives.
- **Prompt 044 — [PRESERVE] Separate facilitator eligibility from device mode.** Acceptance: Console, GM, and Observer modes never create privilege merely by local selection.
- **Prompt 045 — [PRESERVE] Claim a GM instance authoritatively.** Acceptance: an eligible GM obtains one active instance and concurrent claims resolve without duplicate privilege.
- **Prompt 046 — [PRESERVE] Deny invalid GM elevation.** Acceptance: ordinary members, stale grants, revoked roles, foreign instances, and client-supplied GM flags fail.
- **Prompt 047 — [PRESERVE] Enter member Console mode.** Acceptance: any valid member can use the console shell without acquiring GM permissions.
- **Prompt 048 — [PRESERVE] Enter GM Observer mode read-only.** Acceptance: an eligible GM can inspect a selected fleet ship while mutation remains disabled until separately authorized.
- **Prompt 049 — [PRESERVE] Reset Observer elevation on ship change.** Acceptance: leaving the observed ship removes any scoped write grant before another ship loads.
- **Prompt 050 — [PRESERVE] Add return paths to session modes.** Acceptance: lobby, roster, Console, GM, and Observer routes expose a visible keyboard-operable return to their logical parent.
- **Prompt 051 — [REPAIR] Prove the roster through creation and start.** Acceptance: session creation, roster application, persisted configuration, and start readiness use the exact printed Prompt 004 base row across client and server and reject a mismatched or convenience role. This remains partial until the owner-revised 8–20 Capybara core acceptance is composed without counting Press; earlier green counted-Press 19/21 fixtures are contract drift, not preservation evidence.
- **Prompt 052 — [PRESERVE] Exclude Dione below 12 players.** Acceptance: Dione, its roles, resources, shuttles, and population are absent and cannot be re-enabled by payload edits.
- **Prompt 053 — [PRESERVE] Configure Joint Engineering Union substitutions.** Acceptance: each count assigns the correct paired ships, roles, and Union shuttle set.
- **Prompt 054 — [REPAIR] Derive Wolf-agent count authoritatively.** Acceptance: the server derives one hidden Wolf at 8–13 core players and two at 14–20 from the locked effective core roster, records the rule/input/result in the setup receipt, and never asks the facilitator to select a routine count. Optional Press never adds a third Wolf or changes core count; any genuine product-policy override is explicit, reasoned, revision-guarded, and audited.
- **Prompt 055 — [EXTEND] Gate Intelligence Agent setup.** Acceptance: the optional Intelligence Agent appears only with at least one Wolf and remains private.
- **Prompt 056 — [EXTEND] Gate Universal Arbour and Wolf Cult setup.** Acceptance: each optional configuration is explicit, preserves the intended Wolf count, and exposes no hidden assignment.
- **Prompt 057 — [EXTEND] Select base or expansion vessel mode.** Acceptance: base Capybara, expansion Capybara, or neither is locked before casting and the two definitions never mix.
- **Prompt 058 — [EXTEND] Load expansion roster data.** Acceptance: expansion mode adds Capybara Captain, Recycler, Scrap, Macaw, Boa, and full-ship rules only once.
- **Prompt 059 — [NEW] Capture nonbinding ship preferences.** Acceptance: players can express a team preference while oversubscription and tie-breaking remain facilitator decisions.
- **Prompt 060 — [NEW] Assign casting authoritatively.** Acceptance: a facilitator assigns an eligible player to one open ship role while casting is unlocked.
- **Prompt 061 — [NEW] Enforce role exclusivity.** Acceptance: no duplicate role holder or multi-role player exists except the exact configured Union pairing.
- **Prompt 062 — [NEW] Release and reassign before start.** Acceptance: facilitator changes do not orphan seat, role, shuttle, or private-record pointers.
- **Prompt 063 — [NEW] Deliver private role briefs.** Acceptance: a player can read only their assigned brief and common rules; another member's brief is denied at the data boundary.
- **Prompt 064 — [NEW] Deliver private loyalty cards.** Acceptance: each player sees only their loyalty and suspicion while facilitators see the authorized census view.
- **Prompt 065 — [NEW] Initialize loyalty suspicion.** Acceptance: Loyalist variants, Wolf, Intelligence Agent, Arbour, Cult, Android, and Friend values match the printed cards.
- **Prompt 066 — [NEW] Pair Friend loyalties.** Acceptance: valid partners identify each other privately and unrelated players cannot query the link.
- **Prompt 067 — [NEW] Reveal Android proof deliberately.** Acceptance: only the Android player can disclose their own proof and the disclosure does not open other loyalty reads.
- **Prompt 068 — [PRESERVE] Assign role-owned craft.** Acceptance: every shuttle and fighter wing starts under its printed role without client-claimable ownership.
- **Prompt 069 — [PRESERVE] Initialize vessel populations and stores.** Acceptance: active vessels receive exact printed survivors, ore, fuel, food, water, materials, and expansion Scrap.
- **Prompt 070 — [PRESERVE] Initialize security teams.** Acceptance: each active ship begins with its printed authoritative team count.
- **Prompt 072 — [NEW] Lock casting at start.** Acceptance: lobby commands cannot alter roles, loyalties, or starting state after the start transaction; later replacement uses its own path.
- **Prompt 073 — [REPAIR] Represent facilitator responsibilities without a staffing dependency.** Acceptance: one authorized GM can assume both printed main/assistant responsibilities, while multiple GMs may claim, share, or hand off optional lanes without conflating local device mode with authority or making either lane a second-person readiness requirement.
- **Prompt 074 — [NEW] Authorize game start.** Acceptance: only an active eligible facilitator/GM instance can start a ready roster.
- **Prompt 075 — [EXTEND] Start the game atomically.** Acceptance: one transaction initializes lifecycle, turn, phase, timers, ships, roles, resources, decks, pursuit, automatic Wolf/loyalty composition, the setup calculation receipt, and the first event; existing partial start behavior remains a primitive until this full one-GM composition passes.
- **Prompt 076 — [NEW] Make start retry-safe.** Acceptance: repeated start requests return the existing active game without resetting any state or clock.
- **Prompt 077 — [NEW] Initialize pursuit at 2.** Acceptance: Turn 1 begins with one server-owned pursuit value per initial fleet group.
- **Prompt 078 — [NEW] Configure the six-to-eight-turn limit.** Acceptance: the chosen printed range is locked and unsupported durations are rejected.
- **Prompt 079 — [PRESERVE] Apply Turn 1 time extensions.** Acceptance: only Turn 1 receives the extra Team and Coordination time, even after reconnect or retry.
- **Prompt 080 — [NEW] Represent the first Wolf-attack timing window.** Acceptance: facilitators can mark and resolve the approximate Turn 1 timing without turning “about ten minutes” into client automation.
- **Prompt 081 — [PRESERVE] Publish the start announcement.** Acceptance: every entitled live or reconnecting member receives one durable Turn 1 start transmission.
- **Prompt 082 — [PRESERVE] Publish the initial public snapshot.** Acceptance: players see turn, phase, active vessels, and permitted fleet status but no private briefs, loyalties, decks, or notes.
- **Prompt 083 — [PRESERVE] Authorize member live snapshots.** Acceptance: members receive updates and nonmembers receive none, independently of route visibility.
- **Prompt 084 — [EXTEND] Project per-ship shared state.** Acceptance: crew receive their permitted vessel state without another crew's private role or loyalty facts.
- **Prompt 085 — [EXTEND] Refresh role-private state.** Acceptance: a player regains their own role and loyalty projection after reconnect without broadening readers.
- **Prompt 086 — [EXTEND] Refresh facilitator-private state.** Acceptance: authorized facilitators regain census, suspicion, notes, and hidden resolution state while members remain denied.
- **Prompt 087 — [EXTEND] Deny direct gameplay collection writes.** Acceptance: clients cannot write sessions, seats, roles, loyalties, events, decks, ships, shuttles, clocks, or outcomes.
- **Prompt 088 — [PRESERVE] Order snapshots by revision.** Acceptance: delayed snapshots never overwrite a newer authoritative client projection.
- **Prompt 089 — [PRESERVE] Replay events without duplicate effects.** Acceptance: reconnect reconstructs the same visible state once using server event IDs.
- **Prompt 090 — [PROVE] Prove hidden-state redaction.** Acceptance: serialized public and crew projections contain no unrevealed loyalty, deck order, private card, candidate bonus, or facilitator note.

#### Turn, maintenance, and airspace foundations (Prompts 091–160)
- **Prompt 091 — [PRESERVE] Implement the turn entity.** Acceptance: active state records current/max turn, phase, phase revision, and server start/end timestamps.
- **Prompt 092 — [PRESERVE] Enter Team Phase authoritatively.** Acceptance: the server opens the correct action window and rejects a duplicate or illegal transition.
- **Prompt 093 — [PRESERVE] Enter Coordination Phase authoritatively.** Acceptance: Team Phase closes once, Coordination opens with correct timestamps, and late Team actions fail.
- **Prompt 094 — [PRESERVE] Drive the Team timer from server time.** Acceptance: all clients agree on the printed five-minute window despite local clock changes.
- **Prompt 095 — [PRESERVE] Drive the Coordination timer from server time.** Acceptance: all clients agree on the printed fifteen-minute window without client extension.
- **Prompt 096 — [PRESERVE] Apply Turn 1 timer overrides once.** Acceptance: reconnects and retries cannot reapply the extended opening windows.
- **Prompt 097 — [PRESERVE] Audit the emergency timer pause slice.** Acceptance: the existing three-step GM interlock freezes and resumes exact server time, records events, and denies unauthorized or stale requests.
- **Prompt 098 — [PRESERVE] Make phase expiry idempotent.** Acceptance: simultaneous expiry observers produce one closing transition and one event.
- **Prompt 099 — [PRESERVE] Gate Team actions.** Acceptance: maintenance, rations, charging, fuelling, and required docking fail outside Team Phase.
- **Prompt 100 — [PRESERVE] Gate Coordination actions.** Acceptance: movement, transfer, scouting, research, and jumps fail outside Coordination except printed exceptions.
- **Prompt 101 — [PRESERVE] Announce Team completion.** Acceptance: one durable transition message follows the committed phase change and replays correctly after reconnect.
- **Prompt 102 — [PRESERVE] Announce Coordination completion.** Acceptance: one durable message precedes the committed next-turn state and cannot be forged by clients.
- **Prompt 103 — [PRESERVE] Initialize the next turn.** Acceptance: turn increments once, Team opens, and only defined per-turn counters reset or expire.
- **Prompt 103a — [NEW] Hold the airspace deadline behind turn-advance interstitials.** Acceptance: Given a committed turn advance with an uncleared turn-advance interstitial, the turn-advance screen hides the `AIRSPACE CLOSED` timer while the authoritative airspace timer/deadline remains frozen at its captured remaining time; only one explicit clear/dismiss action after the committed transition reveals/resumes it from that preserved remaining time, never resetting, extending, or advancing it early. Stale, replayed, retried, reconnecting, and multi-client clear/advance attempts cannot decrement, resume, duplicate, or overwrite a newer deadline or transition event. The preserved/resumed status is accessible, has truthful keyboard order/focus and touch targets, and remains readable under reduced motion. Dependencies: Prompts 091–096, 098, 101–103, 106b, 108–109, and 154–158. Apply the authorized core-rules and facilitation source areas and consume existing server-owned timing and broadcast precedence; do not invent a client timer or a new airspace rule.
- **Prompt 104 — [NEW] Complete the configured final turn.** Acceptance: normal actions freeze and the game enters explicit endgame evaluation rather than an orphaned active phase.
- **Prompt 105 — [NEW] Trigger pursuit-10 failure.** Acceptance: authoritative pursuit reaching 10 creates one failure outcome and blocks further normal actions.
- **Prompt 106 — [PRESERVE] Replay lifecycle announcements.** Acceptance: reconnecting members see the latest relevant turn/phase state without duplicate visual effects.
- **Prompt 106a — [PRESERVE] Enforce FleetBroadcast precedence.** Acceptance: urgent authoritative transmissions preempt lower-priority ticker content, queue safely, and drain once without losing a higher-priority state.
- **Prompt 106b — [PRESERVE] Verify exact turn-transmission timing.** Acceptance: Turn 0, Turn 1, ordinary turn, lockout, and finale copy appears, fades, and replays at its specified lifecycle moment.
- **Prompt 106c — [EXTEND] Make fleet-ticker lifecycle server-authoritative.** Acceptance: one transaction-owned stream gives automatic, Admiral, and Press transmissions deterministic session-scoped identities, revisions, precedence, current/queued/draining state, dismissals, pass counts, and replay cursors. Concurrent send/replace/dismiss and Red Alert activation/stand-down serialize once; idempotent retry, reconnect, replay, late join, and every live client converge without local resurrection, duplication, reorder, or early tail disposal. Enforce authenticated role/holder/GM authority, schemas, CAS, privacy-safe projections/audit, direct-write denial, and screen-reader announcement identity before P652a/P652b presentation work.
- **Prompt 107 — [DECISION] Decide split-fleet clock semantics.** Acceptance: one recorded policy governs whether groups share phase windows; no group learns forbidden location state.
- **Prompt 108 — [PRESERVE] Reconnect during a live timer.** Acceptance: the device receives current server-derived remaining time and permitted actions, discarding local timer authority.
- **Prompt 109 — [PRESERVE] Reconcile delayed lifecycle updates.** Acceptance: clients converge on the newest phase and never expose an action from an older window.
- **Prompt 110 — [PROVE] Run the lobby-to-two-turn scenario.** Acceptance: a production-path fixture creates, joins, casts, starts, completes both phases, and enters Turn 2 exactly once.
- **Prompt 111 — [PRESERVE] Define authoritative resource ledgers.** Acceptance: ore, fuel, food, water, materials, optional Scrap, security teams, and card inventories remain nonnegative typed server state.
- **Prompt 112 — [NEW] Resolve same-table trades.** Acceptance: a legal local exchange commits atomically and an overdraw, wrong location, or stale trade leaves both sides unchanged.
- **Prompt 113 — [NEW] Resolve shuttle-mediated transfers.** Acceptance: only a docked craft moves its printed cargo types between permitted inventories.
- **Prompt 114 — [PRESERVE] Register vessel-specific maintenance order.** Acceptance: each vessel executes its printed step count and sequence rather than a generic inferred flow.
- **Prompt 115 — [PRESERVE] Resolve damaged Storage.** Acceptance: the server discards the printed half of ship and docked-shuttle resources with correct rounding and audit detail.
- **Prompt 116 — [PRESERVE] Select food and water rations independently.** Acceptance: only levels and spends on the vessel's current printed table are accepted.
- **Prompt 117 — [DECISION] Resolve the ration-table wording conflict.** Acceptance: the chosen interpretation distinguishes spend from bonus, is source-linked, and is fixed before product controls ship.
- **Prompt 118 — [PRESERVE] Swap population-dependent ration tables.** Acceptance: crossing a starred vessel threshold changes only that vessel's allowed table.
- **Prompt 119 — [PRESERVE] Resolve the two-dice unrest check.** Acceptance: server dice and both ration bonuses produce the printed below-12, below-20, and 20-plus result.
- **Prompt 120 — [PRESERVE] Resolve a riot.** Acceptance: rolling below current unrest applies the correct unrest/population consequence and authoritative damage path once.
- **Prompt 121 — [EXTEND] Resolve small-ship maintenance loss.** Acceptance: base small ships and Voyage 33-0 use their printed population-loss/skip-charge exception, not full-ship riot behavior.
- **Prompt 122 — [PRESERVE] Enforce Reactor capacity.** Acceptance: a vessel charges no more than its printed capacity after damage and upgrade modifiers.
- **Prompt 122a — [REPAIR] Confirm Reactor power-up before authoritative mutation.** Acceptance: preserve the existing authoritative `runMaintenance` Reactor transaction and the repository's danger-red second-press convention, but require a confirmation before replacing unused charges or committing the selected consoles. The first activation changes the same control to the exact `ARE YOU SURE?` treatment with an accessible summary of the selected consoles and lost prior charge; only the confirmed activation may call the server. Cancel, blur, Escape, navigation, and any backdrop used by the chosen shared pattern restore focus and leave local/server state unchanged. Pending and rapid double-submit are disabled, retry is request-idempotent, stale/wrong-phase/over-capacity/damaged/ineligible/unauthorized inputs fail without mutation or audit, and only an accepted transaction creates one replayable event/receipt. Reuse the existing maintenance route, `MaintenanceSystems`, maintenance service/callable, revision arithmetic, event path, CIC styling, and established Begin-maintenance confirmation rather than a parallel dialog; prove keyboard, screen-reader, 44px touch, long selected labels, reduced motion, and unobscured mobile/short-landscape layout. This repair depends on the capacity, damage/upgrade, eligibility, expiry, and atomicity contracts in Prompts 122–125, 128, and 138 without claiming their broader vessel matrix complete.
- **Prompt 123 — [EXTEND] Apply vessel-specific damaged-Reactor penalties.** Acceptance: Shepherd and Quellon use their own reductions and no generic value overwrites a ship sheet.
- **Prompt 124 — [EXTEND] Apply Reactor upgrades.** Acceptance: only an authoritative completed upgrade adds the printed charge capacity.
- **Prompt 125 — [PRESERVE] Enforce console charge eligibility.** Acceptance: nonexistent, damaged, already charged, wrong-phase, or otherwise unavailable consoles cannot be charged.
- **Prompt 126 — [PRESERVE] Resolve both AEGIS shuttle bays.** Acceptance: Zeta and Omega each fuel at most one craft in their printed order, with the Omega text conflict preserved as errata.
- **Prompt 127 — [PRESERVE] Resolve ordinary single-bay fuelling.** Acceptance: one eligible docked shuttle costs one host fuel and a damaged bay cannot fuel it.
- **Prompt 128 — [PRESERVE] Expire unused charges and shuttle fuel.** Acceptance: turn rollover clears them once even when their owner disconnects.
- **Prompt 129 — [PRESERVE] Surface damaged-bay denial.** Acceptance: the affected crew sees why fuelling is unavailable while unrelated maintenance remains usable.
- **Prompt 130 — [PRESERVE] Draw damage cards authoritatively.** Acceptance: the server chooses the next card, applies its console effect, exposes the permitted result, and hides remaining order.
- **Prompt 131 — [PRESERVE] Destroy a ship on empty-deck draw.** Acceptance: a required draw with no cards enters one authoritative destruction flow.
- **Prompt 132 — [PRESERVE] Recycle AEGIS Armoured Hull.** Acceptance: the hull absorbs survivor loss and returns to the deck only under the printed condition.
- **Prompt 133 — [PRESERVE] Step discrete population tracks.** Acceptance: damage advances to the next printed value rather than subtracting an invented amount.
- **Prompt 134 — [REPAIR] Alert starred population thresholds without a multi-GM deadlock.** Acceptance: the smaller ration table becomes authoritative and one active facilitator can acknowledge/own the blocking consequence; additional or stale GM instances may retain informational alerts but cannot prevent maintenance or movement. Competing acknowledgements commit once and return a safe stale/idempotent result.
- **Prompt 135 — [PRESERVE] Add two unrest at population zero.** Acceptance: the transition applies once and replayed snapshots cannot add it again.
- **Prompt 136 — [NEW] Enter mutiny at unrest 8.** Acceptance: the ship becomes unusable, its actions deny, and facilitators receive a named recovery requirement.
- **Prompt 137 — [NEW] Resolve replacement-captain mutiny recovery.** Acceptance: an authorized facilitator records the permitted unrest reduction rather than an invented automatic value.
- **Prompt 138 — [PRESERVE] Make maintenance atomic and retry-safe.** Acceptance: a failure or duplicate request cannot partially spend rations, produce resources, charge consoles, or draw twice.
- **Prompt 138a — [PRESERVE] Bound maintenance rollback.** Acceptance: only the current-turn reversible maintenance state rolls back under the matching revision after the active GM-instance, ship authority, and Team-phase gates; a stable request ID binds the actor and canonical payload so an exact retry replays the same result and deterministic event without writes, changed actor/payload reuse is rejected, and a distinct stale contender records only a private replayable receipt without partial mutation while damage and audit history remain immutable.
- **Prompt 139 — [EXTEND] Publish maintenance results by audience.** Acceptance: crews see costs and outcomes while hidden deck order and private facilitator notes remain protected.
- **Prompt 140 — [PROVE] Run the all-vessel maintenance matrix.** Acceptance: six core ships, four small ships, Voyage 33-0, and expansion Capybara each execute their own printed path.
- **Prompt 140a — [NEW] Evacuate survivors by cargo shuttle.** Acceptance: each eligible craft moves no more than 5,000 survivors per turn from its authoritative host.
- **Prompt 140b — [NEW] Enforce destination population capacity.** Acceptance: no ship receives survivors beyond its printed starting population and a rejected overflow moves nobody.
- **Prompt 140c — [NEW] Make evacuation retry-safe.** Acceptance: concurrent or repeated transfers never duplicate survivors, capacity, craft use, or events.
- **Prompt 140d — [NEW] Create escape pods on ship destruction.** Acceptance: the destroyed ship exposes only its printed crew-plus-passenger pod capacity and one durable catastrophe event.
- **Prompt 140e — [NEW] Move players into escape state.** Acceptance: affected players lose destroyed-ship actions, retain identity, and receive an authorized flee/reassignment path.
- **Prompt 140f — [NEW] Preserve retained shuttles.** Acceptance: craft survive their parent ship's destruction, receive a legal holder/host state, and cannot remain docked to the destroyed vessel.
- **Prompt 140g — [NEW] Scavenge destroyed-ship stores.** Acceptance: permitted resources transfer once to legal recipients while destroyed-ship balances and audit history reconcile atomically.
- **Prompt 141 — [NEW] Define normal airspace.** Acceptance: eligible craft can depart, travel, and dock during the allowed window from authoritative state.
- **Prompt 142 — [NEW] Enforce Team Phase docking.** Acceptance: every shuttle has a valid host at Team start or appears as an explicit facilitator exception.
- **Prompt 143 — [NEW] Bind shuttle holder and dock.** Acceptance: ownership, current holder, and host ship agree and cannot be rewritten by the client.
- **Prompt 144 — [NEW] Resolve a legal shuttle move.** Acceptance: only the holder can request one eligible Coordination move to a valid ship.
- **Prompt 145 — [EXTEND] Lock airspace for a Wolf attack.** Acceptance: extend the existing authoritative airspace/turn primitives so declaring an attack blocks ordinary movement and begins server-owned parking for every shuttle without weakening current restrictions.
- **Prompt 146 — [DECISION] Decide nearest-ship parking ties.** Acceptance: one deterministic, recorded facilitator/product policy resolves equal-distance hosts.
- **Prompt 147 — [EXTEND] Restrict battle-table craft.** Acceptance: extend current typed craft/docking catalogs so only printed combat-capable shuttles and fighter wings appear in attack actions; all others remain parked.
- **Prompt 148 — [NEW] Preserve post-attack parking.** Acceptance: surviving craft stay at their authoritative hosts until normal movement reopens and never teleport home.
- **Prompt 149 — [NEW] Restrict quarantined docking.** Acceptance: an affected ship accepts at most one shuttle dock per turn while retaining its allowed communication.
- **Prompt 150 — [NEW] Prevent quarantine reset exploits.** Acceptance: reassignment, depart-return loops, reconnect, and stale retries cannot bypass the per-turn limit.
- **Prompt 151 — [NEW] Block split-fleet communications.** Acceptance: ordinary messages cannot cross fleet groups and scout-taxi exceptions use a separate authorized path.
- **Prompt 152 — [NEW] Redact split-fleet shuttle state.** Acceptance: each group sees only its permitted local craft and cannot infer another group's position from counts or events.
- **Prompt 153 — [NEW] Constrain cross-group docking.** Acceptance: only a legal ferry capability can move people or fuel between separated groups.
- **Prompt 154 — [NEW] Model airspace transitions.** Acceptance: normal, Team-docked, Wolf-locked, quarantined, split, and mission-committed states have explicit legal edges and audit events.
- **Prompt 155 — [NEW] Announce airspace status truthfully.** Acceptance: affected players receive one accessible locked, restricted, parked, or reopened status after authority commits.
- **Prompt 156 — [NEW] Reopen movement authoritatively.** Acceptance: normal controls return only after the restriction's server-owned end condition.
- **Prompt 157 — [NEW] Preserve an overrun attack into Team Phase.** Acceptance: shuttles remain where left and prohibited movement stays blocked until facilitator resolution.
- **Prompt 158 — [NEW] Reconnect during restricted airspace.** Acceptance: cached routes cannot restore prohibited controls and the current server restriction replaces local state.
- **Prompt 159 — [PROVE] Run the start-to-airspace scenario.** Acceptance: one fixture starts a roster, resolves maintenance, changes phase, declares an attack, parks craft, and reopens movement.
- **Prompt 160 — [PROVE] Publish the foundation regression matrix.** Acceptance: Prompts 001–159 each have a current status, red-test target, decision dependency, and proof link; rendered UI alone never means complete.

#### Core ships, economies, and role workspaces (Prompts 161–233)
- **Prompt 161 — [PRESERVE] Register every vessel variant.** Acceptance: six core ships, four base small ships, Voyage 33-0, and expansion Capybara have distinct stable definitions.
- **Prompt 162 — [PRESERVE] Encode printed vessel statistics.** Acceptance: nation, class, capacity, population, jump costs, Reactor capacity, and maintenance steps match each sheet.
- **Prompt 163 — [PRESERVE] Register the optional sixth resource.** Acceptance: Scrap exists only in enabled Capybara-expansion inventories and cannot leak into base sessions.
- **Prompt 164 — [PRESERVE] Encode cargo permissions.** Acceptance: each transfer accepts only the resource and security-team types printed for the acting craft.
- **Prompt 165 — [EXTEND] Complete console metadata.** Acceptance: every console names card, phase, step, charge, damage, upgrade, effect, and authoritative resolver.
- **Prompt 166 — [EXTEND] Bind roles to vessel actions.** Acceptance: enabled roles see only their vessel and fleet capabilities; a route or payload cannot impersonate another role.
- **Prompt 167 — [EXTEND] Standardize vessel action envelopes.** Acceptance: each console result carries actor, vessel, turn, phase, revision, idempotency key, and audit ID.
- **Prompt 168 — [DECISION] Record vessel rule calls.** Acceptance: an ambiguity produces a labeled facilitator decision, never an unexplained deterministic result.
- **Prompt 169 — [EXTEND] Build shared vessel fixtures.** Acceptance: one reference ship, one materially different full ship, and one small ship exercise the same server/client contracts.
- **Prompt 170 — [EXTEND] Project observer-safe vessel data.** Acceptance: crew, read-only observer, elevated GM, and facilitator views differ without leaking deck or loyalty secrets.
- **Prompt 171 — [PRESERVE] Complete AEGIS identity and maintenance lane.** Acceptance: 2,500 survivors, printed rations, starting stores, and steps 1–7 render and resolve from its definition.
- **Prompt 172 — [PRESERVE] Resolve AEGIS Armoured Hull I and II.** Acceptance: 6♥ and 7♥ prevent survivor loss and recycle only when permitted.
- **Prompt 173 — [PRESERVE] Resolve AEGIS Storage.** Acceptance: damaged 8♥ discards half of ship and docked-craft resources with correct rounding.
- **Prompt 174 — [PRESERVE] Resolve the AEGIS Reactor.** Acceptance: 10♥ charges five eligible consoles with exact upgrade and damage modifiers.
- **Prompt 175 — [PRESERVE] Resolve Shuttle Bay Zeta.** Acceptance: the bay spends one fuel for one eligible docked craft during its step.
- **Prompt 176 — [PRESERVE] Resolve Shuttle Bay Omega.** Acceptance: the second bay operates independently at step 7 and preserves the conflicting body label as errata.
- **Prompt 177 — [PRESERVE] Audit the AEGIS Jump Drive.** Acceptance: the landed jump console enforces 2/3/6 cost, charge, damage, upgrade, route, lockout, and once-per-turn state.
- **Prompt 178 — [NEW] Resolve the Construction Bay.** Acceptance: one material builds one fighter up to four per wing, or six after the authoritative upgrade.
- **Prompt 179 — [NEW] Create the Admiral policy workspace.** Acceptance: the Admiral can publish permitted fleet policy and defence coordination without acquiring arbitrary GM authority.
- **Prompt 180 — [NEW] Create the Executive Officer workspace.** Acceptance: maintenance, AEGIS weapons, Pallas, enriched warheads, and Command and Control route to real actions.
- **Prompt 181 — [NEW] Create the Wing Commander workspace.** Acceptance: Starlight, both Fighter Bays, wings, scouting, missions, and fighter rebuilding show current authority and results.
- **Prompt 182 — [EXTEND] Complete AEGIS combat-console registration.** Acceptance: extend the existing console shell/data so Command and Control, both Fighter Bays, Missile Launchers, and Point Defence expose no action before their attack resolvers exist.
- **Prompt 183 — [PRESERVE] Gate Dione by roster.** Acceptance: at 12+ players Dione starts with its exact population and stores; below 12 it is absent everywhere.
- **Prompt 184 — [PRESERVE] Resolve Dione rations and thresholds.** Acceptance: its discrete population track selects the correct progressively smaller table.
- **Prompt 185 — [PRESERVE] Resolve Dione Storage.** Acceptance: damaged 8♣ discards the authoritative half of Dione and docked-craft stores.
- **Prompt 186 — [PRESERVE] Resolve the Dione Reactor.** Acceptance: 9♣ charges four eligible consoles with its printed modifiers.
- **Prompt 187 — [PRESERVE] Resolve the Dione Shuttle Bay.** Acceptance: one eligible docked craft receives fuel for one host fuel and the action expires correctly.
- **Prompt 188 — [NEW] Resolve Dione Hydroponics.** Acceptance: charged J♣ converts one water into three food, or five upgraded.
- **Prompt 189 — [NEW] Resolve Dione Water Reclamation.** Acceptance: charged Q♣ produces two water, or four upgraded.
- **Prompt 190 — [NEW] Draw and own Dione VIP cards.** Acceptance: the VIP Lounge produces one of nine named cards with private, transferable, single-use ownership.
- **Prompt 191 — [NEW] Spend a VIP unrest reroll.** Acceptance: one owned card rerolls one maintenance die, consumes once, and cannot be replayed.
- **Prompt 192 — [NEW] Gate Dione's Fighter Bay and Maliades.** Acceptance: the craft launches only from charged, undamaged 10♦ under the Engineer's role.
- **Prompt 193 — [NEW] Complete the Dione Captain workspace.** Acceptance: ship policy, diplomacy, survivor protection, and fleet liaison remain playable without console or GM impersonation.
- **Prompt 193a — [NEW] Complete the Dione Engineer workspace.** Acceptance: maintenance, stores, Philia, Maliades, production, and bay choices route to current authoritative actions.
- **Prompt 193b — [NEW] Complete the President workspace.** Acceptance: fleet policy, crises, political capital, address, visits, and election actions are role-bound and auditable.
- **Prompt 194 — [PRESERVE] Complete Icebreaker identity and maintenance lane.** Acceptance: 40,000 survivors, exact thresholds, rations, stores, and steps derive from its sheet.
- **Prompt 195 — [PRESERVE] Resolve Icebreaker Storage.** Acceptance: damaged 8♠ discards half of the in-scope authoritative stores.
- **Prompt 196 — [PRESERVE] Resolve the Icebreaker Reactor.** Acceptance: 9♠ charges four eligible consoles with exact modifiers.
- **Prompt 197 — [PRESERVE] Resolve the Icebreaker Shuttle Bay.** Acceptance: one valid craft is fuelled once and stale/retry requests cannot spend twice.
- **Prompt 198 — [NEW] Resolve Icebreaker Hydroponics.** Acceptance: charged J♠ converts one water to three food, or five upgraded.
- **Prompt 199 — [NEW] Resolve Icebreaker Water Reclamation.** Acceptance: charged Q♠ produces two water, or four upgraded, without borrowing another ship's data.
- **Prompt 200 — [NEW] Resolve Mining Drone Control.** Acceptance: charged K♠ produces three materials, or five upgraded, through one auditable transaction.
- **Prompt 201 — [PRESERVE] Audit the Icebreaker Jump Drive.** Acceptance: successful jumps use 3/6/12 fuel and preserve all landed jump authority/denial behavior.
- **Prompt 202 — [NEW] Resolve the Ram Scoop.** Acceptance: a charged successful short/medium/long jump yields 10/15/20 ore plus five when upgraded.
- **Prompt 203 — [NEW] Complete the Icebreaker Captain workspace.** Acceptance: ship policy, resource bargaining, survivor protection, and fleet liaison remain playable without console impersonation.
- **Prompt 203a — [NEW] Complete the Icebreaker Engineer workspace.** Acceptance: maintenance, stores, Blacksmith, charging, repair, and resource distribution route to real actions.
- **Prompt 203b — [NEW] Complete the Miner workspace.** Acceptance: Mining Drone Control, Highwall mining/combat, ore/material results, and mission participation are authoritative.
- **Prompt 204 — [PRESERVE] Complete Shepherd identity and maintenance lane.** Acceptance: 30,000 survivors, exact 24,000/15,000/5,000 thresholds, rations, stores, and steps are authoritative.
- **Prompt 205 — [PRESERVE] Resolve Shepherd Storage.** Acceptance: damaged A♠ halves Shepherd and docked-craft stores atomically.
- **Prompt 206 — [PRESERVE] Resolve the Shepherd Reactor.** Acceptance: 2♠ charges three, four upgraded, and loses two when damaged.
- **Prompt 207 — [PRESERVE] Resolve the Shepherd Shuttle Bay.** Acceptance: one eligible docked craft is fuelled once during the printed step.
- **Prompt 208 — [NEW] Resolve Shepherd Water Reclamation.** Acceptance: charged 4♠ produces two water, or four upgraded.
- **Prompt 209 — [NEW] Resolve both Shepherd Advanced Hydroponics consoles.** Acceptance: each independently spends two water for 12 food, or 16 upgraded.
- **Prompt 210 — [PRESERVE] Audit the Shepherd Jump Drive.** Acceptance: successful jumps cost 3/6/12 and respect charge, damage, upgrade, and retry contracts.
- **Prompt 211 — [NEW] Encode Endeavour console-upgrade research tracks.** Acceptance: each track advances the left-most box and exposes the correct current material cost.
- **Prompt 212 — [NEW] Enforce Endeavour research cadence.** Acceptance: up to three distinct choices plus no more than two five-ore extras resolve per Team Phase.
- **Prompt 213 — [NEW] Build and use the ECM Device.** Acceptance: the completed device reduces the owning group’s pursuit by three exactly once per allowed use.
- **Prompt 214 — [NEW] Build and use the Wolf Agent Detector.** Acceptance: the completed device permits up to three private server-randomized tests per turn.
- **Prompt 215 — [NEW] Complete the Shepherd Captain workspace.** Acceptance: ship policy, food diplomacy, survivor protection, and fleet liaison remain playable without console impersonation.
- **Prompt 215a — [NEW] Complete the Shepherd Engineer workspace.** Acceptance: maintenance, stores, Black Sheep, charging, and food/water distribution route to real actions.
- **Prompt 215b — [NEW] Complete the Scientist workspace.** Acceptance: research tracks/devices, Endeavour, scouting, upgrades, and mission participation remain private and authoritative.
- **Prompt 216 — [PRESERVE] Complete Quellon identity and maintenance lane.** Acceptance: 30,000 survivors, exact thresholds, rations, stores, and steps derive from Quellon data.
- **Prompt 217 — [PRESERVE] Resolve Quellon Storage.** Acceptance: damaged A♣ halves Quellon and docked-craft stores atomically.
- **Prompt 218 — [PRESERVE] Resolve the Quellon Reactor.** Acceptance: 2♣ charges three, four upgraded, and loses two when damaged.
- **Prompt 219 — [PRESERVE] Resolve the Quellon Shuttle Bay.** Acceptance: one eligible docked craft is fuelled once with correct expiry.
- **Prompt 220 — [NEW] Resolve Quellon Hydroponics.** Acceptance: charged 4♣ converts one water into three food, or five upgraded.
- **Prompt 221 — [NEW] Resolve both Water Production consoles.** Acceptance: each independently creates 12 water, or 16 upgraded.
- **Prompt 222 — [PRESERVE] Audit the Quellon Jump Drive.** Acceptance: successful jumps cost 2/4/8 and preserve authoritative failure and retry behavior.
- **Prompt 223 — [NEW] Complete the Quellon Captain workspace.** Acceptance: ship policy, water diplomacy, survivor protection, and fleet liaison remain playable without console impersonation.
- **Prompt 223a — [NEW] Complete the Quellon Engineer workspace.** Acceptance: maintenance, stores, Condor, charging, repair support, and water distribution route to real actions.
- **Prompt 223b — [NEW] Complete the Explorer workspace.** Acceptance: Hummingbird scouting, harvesting allocation, route planning, and mission participation are authoritative.
- **Prompt 224 — [PRESERVE] Complete Refinery 124 identity and maintenance lane.** Acceptance: 20,000 survivors, exact 15,000/5,000 thresholds, rations, stores, and steps are authoritative.
- **Prompt 225 — [PRESERVE] Resolve Refinery 124 Storage.** Acceptance: damaged A♦ halves in-scope ship and docked-craft stores.
- **Prompt 226 — [PRESERVE] Resolve the Refinery 124 Reactor.** Acceptance: 2♦ charges four eligible consoles with its printed modifiers.
- **Prompt 227 — [PRESERVE] Resolve the Refinery 124 Shuttle Bay.** Acceptance: one valid docked craft receives one fuel once.
- **Prompt 228 — [NEW] Resolve Refinery 124 Hydroponics.** Acceptance: charged 4♦ converts one water into three food, or five upgraded.
- **Prompt 229 — [NEW] Resolve Refinery 124 Water Reclamation.** Acceptance: charged 5♦ produces two water, or four upgraded, with the elimination-based card decision documented.
- **Prompt 230 — [NEW] Resolve both Fuel Refinery consoles.** Acceptance: each converts up to ten ore one-for-one, including the exact upgraded allowance, without overspend.
- **Prompt 231 — [NEW] Gate the Refinery Fighter Bay.** Acceptance: charged 8♦ authorizes only the PDF Colonel's wing during an attack.
- **Prompt 232 — [PRESERVE] Audit the Refinery 124 Jump Drive.** Acceptance: successful jumps cost 2/4/8 and use the common authoritative jump contract.
- **Prompt 233 — [NEW] Complete the Refinery 124 Captain workspace.** Acceptance: ship policy, fuel diplomacy, survivor protection, and fleet liaison remain playable without console impersonation.
- **Prompt 233a — [NEW] Complete the Refinery Engineer workspace.** Acceptance: maintenance, ore/fuel stores, Chacau, refining, repair, and distribution route to real actions.
- **Prompt 233b — [NEW] Complete the PDF Colonel workspace.** Acceptance: Fighter Bay, Escort Wing, Chepu, boarding, news relay, and mission participation remain role-bound.

#### Extra vessels, craft registration, and replacement roles (Prompts 234–280)
- **Prompt 234 — [EXTEND] Implement shared small-ship rules.** Acceptance: Gorgoneion, base Capybara, Warrior, and Vulcan dock for Team/attack, use host stores, run steps 1–4, and never take ship damage.
- **Prompt 234a — [DECISION] Apply the extra-role balance dial.** Acceptance: facilitators see the printed roughly-three Wolf-capacity-per-extra-role guidance without automatic or player-controlled attack mutation.
- **Prompt 235 — [EXTEND] Complete Gorgoneion identity and maintenance.** Acceptance: the frigate tracks 1,000 survivors and no more than two charged consoles.
- **Prompt 236 — [NEW] Resolve the Gorgoneion Jump Drive.** Acceptance: short/medium/long travel costs 1/1/2 from its current host.
- **Prompt 237 — [NEW] Resolve Gorgoneion Mission Support.** Acceptance: its Captain privately moves each of the top five mission cards to top or bottom before dealing.
- **Prompt 238 — [NEW] Resolve Gorgoneion Repair Drones.** Acceptance: once in Coordination, three host materials repair one eligible console.
- **Prompt 239 — [NEW] Register the Gorgoneion Missile Array.** Acceptance: the workspace remains truthful and defers action until the range-phase resolver exists.
- **Prompt 240 — [NEW] Register the Gorgoneion Force Field Projector.** Acceptance: the workspace exposes the before-targeting timing and no retroactive selection.
- **Prompt 241 — [NEW] Complete base Capybara identity and maintenance.** Acceptance: the hybrid tracks 2,000 survivors, two charges, host stores, docking, and steps 1–4.
- **Prompt 241a — [NEW] Resolve the base Capybara Jump Drive.** Acceptance: short/medium/long jumps spend 1/1/2 from the current host and retain hybrid immunity.
- **Prompt 241b — [NEW] Resolve base Capybara Bulk Haulage.** Acceptance: a contributed mission card grants exactly one extra of each resource type won from that opportunity.
- **Prompt 241c — [NEW] Resolve base Capybara Cargo Transfer.** Acceptance: security teams, ore, fuel, food, water, and materials move only between legal docked inventories.
- **Prompt 241d — [NEW] Resolve base Capybara food and water production.** Acceptance: Water Reclimator creates four water and Hydroponics converts one water into four food only when charged.
- **Prompt 241e — [NEW] Resolve the base Capybara Fuel Processor.** Acceptance: the charged console converts no more than five ore one-for-one into fuel atomically.
- **Prompt 242 — [NEW] Complete Warrior identity and maintenance.** Acceptance: the salvage vessel tracks 2,000 survivors, one charge, host stores, and small-ship timing.
- **Prompt 243 — [NEW] Resolve Warrior Reclamator.** Acceptance: discarding the participant's entire hand salvages one opportunity for the exact per-card food/water/material choice.
- **Prompt 244 — [NEW] Resolve Warrior Repair Drones.** Acceptance: six materials repair up to two eligible consoles once in Coordination.
- **Prompt 245 — [NEW] Register Warrior Salvage Drones.** Acceptance: the workspace states its after-attack trigger and awaits authoritative damage-ledger rolls.
- **Prompt 246 — [NEW] Complete Vulcan identity and maintenance.** Acceptance: 15,000 survivors, two charges, host stores, docking, and 1/1/2 jump obey small-ship rules.
- **Prompt 247 — [NEW] Register the Vulcan Laser Cannon.** Acceptance: the role sees its medium/short two-die 4+ contract only when combat authority is available.
- **Prompt 248 — [NEW] Resolve both Vulcan Additional Labour consoles.** Acceptance: each independently charges one permitted external console once, triggering immediate effects exactly once.
- **Prompt 249 — [NEW] Admit Voyage 33-0 through the crisis path.** Acceptance: facilitator acceptance creates the damaged cruiser with 40,000 survivors and its required fleet commitments.
- **Prompt 250 — [NEW] Resolve Voyage 33-0 maintenance.** Acceptance: host stores fund steps 1–4, one console charges, and its failed unrest roll loses population and skips charging.
- **Prompt 251 — [NEW] Resolve Voyage 33-0 movement.** Acceptance: it docks during Team and jumps for 1/1/2 host fuel without being treated as a base small ship in population logic.
- **Prompt 252 — [REPAIR] Gate the expansion Capybara.** Acceptance: repair stale base/Capybara mode and counted-Press preset behavior so immutable configuration replaces, never combines with, the base Capybara across the owner-revised 8–20 core roster, catalogs, targeting, resources, and damage; exact 8–18 substitution matrices remain source/facilitator-defined until recorded. Optional Press and multiple GM instances remain orthogonal to that configuration.
- **Prompt 253 — [EXTEND] Complete expansion Capybara identity.** Acceptance: 20,000 survivors, three charges, steps 1–6, 3/6/12 jump, and its own ration/population tracks render from one full-ship definition.
- **Prompt 254 — [EXTEND] Resolve expansion Capybara Storage and Reactor.** Acceptance: Storage halves correct stores and the Reactor applies exact charge, damage, and upgrade behavior.
- **Prompt 255 — [NEW] Resolve Capybara Advanced Hydroponics.** Acceptance: two water makes six food, optional one Scrap adds six, and upgrade/damage states apply once.
- **Prompt 256 — [NEW] Resolve Capybara Water Production.** Acceptance: six water plus an optional six for one Scrap is transactional and unavailable when uncharged or damaged.
- **Prompt 257 — [NEW] Resolve the Scrap Refinery.** Acceptance: charged rendered-authority 7♠ either creates one Scrap or converts one Scrap to three materials; the hidden extracted 5♦ is provenance-only and creates no gameplay ambiguity.
- **Prompt 258 — [NEW] Resolve Capybara Shuttle Bay choice.** Acceptance: the single bay fuels exactly one of Macaw or Boa per turn and unused fuel expires.
- **Prompt 259 — [PROVE] Audit the expansion Capybara Jump Drive.** Acceptance: successful jumps cost 3/6/12 and all common charge, damage, route, failure, and retry cases hold.
- **Prompt 260 — [PRESERVE] Register Starlight completely.** Acceptance: its owner, initial dock, scout ranges, fuel exception, cargo, mission bonuses, and UI route match the sheet.
- **Prompt 261 — [PRESERVE] Register Pallas completely.** Acceptance: security cargo, boarding support, rerolls, fuelled relocation, owner, dock, and route are distinct.
- **Prompt 262 — [PRESERVE] Register Fighter Wings Alpha and Bravo.** Acceptance: each wing retains its own fighters, bay, cap, range actions, loss rules, and Wing Commander ownership.
- **Prompt 263 — [PRESERVE] Register Philia completely.** Acceptance: its cargo, repair, dismantle, permission, second-ship fuel rule, owner, dock, and route match the actual craft.
- **Prompt 264 — [PRESERVE] Register Maliades completely.** Acceptance: its launch, three-damage durability, fuel repair, target shifts, attacks, owner, dock, and route are typed.
- **Prompt 265 — [PRESERVE] Register Highwall completely.** Acceptance: mining cadence, fuelled third operation, combat, mission bonuses, cargo, owner, and route are typed.
- **Prompt 266 — [PRESERVE] Register Blacksmith completely.** Acceptance: cargo, repair, dismantle, permission, second-ship fuel rule, owner, dock, and route are correct.
- **Prompt 267 — [PRESERVE] Register Endeavour completely.** Acceptance: unlimited scouting, upgrade cadence, fuel exception, mission bonuses, owner, dock, and route are distinct.
- **Prompt 268 — [PRESERVE] Register Black Sheep completely.** Acceptance: cargo and fuelled recharge belong to Black Sheep despite copied Condor wording.
- **Prompt 269 — [PRESERVE] Register Hummingbird completely.** Acceptance: three-jump scout range, harvesting, mission bonuses, owner, dock, cargo, and route match its sheet.
- **Prompt 270 — [PRESERVE] Register Condor completely.** Acceptance: full printed cargo and fuelled recharge remain Condor behavior, not a Black Sheep alias.
- **Prompt 271 — [PRESERVE] Register Chacau completely.** Acceptance: actual cargo, repair, dismantle, permission, second-ship fuel rule, owner, dock, and route survive copied Philia text.
- **Prompt 272 — [PRESERVE] Register Chepu completely.** Acceptance: security cargo, boarding support, fuelled relocation, owner, dock, mission bonuses, and route are typed.
- **Prompt 273 — [PRESERVE] Register the PDF Escort Fighter Wing.** Acceptance: four-fighter cap, independent mission participation, combat launch, bonuses, and Colonel ownership are distinct.
- **Prompt 274 — [PRESERVE] Register J.E.U. Wobbly completely.** Acceptance: its cargo and fuelled recharge belong to Wobbly despite copied Condor text and follow the active Union assignment.
- **Prompt 275 — [PRESERVE] Register J.E.U. Ally completely.** Acceptance: cargo, repair, dismantle, permission, and fuel rule belong to Ally despite copied Chacau/Philia text.
- **Prompt 275a — [EXTEND] Restore the optional SNN Independent Press Shuttle.** Acceptance: recover the proven independent station from commits `71b5ad7`, `9c48e5d`, and `dced782` without retaining the `9d68158`/`e5aca326` counted-roster regression; an authorized GM controls dedicated `pressEnabled` state, enabled Press exposes one exclusive server-owned Press Officer/shuttle console and may be the twenty-first player beside a 20-player Capybara core, disabled Press is hidden and denied across claim/reconnect/presence/actions, multiple GM instances remain independent, and core readiness, loyalty, Wolf, roster, host, movement exception, dispatch authority, equipment, and return behavior stay truthful.
- **Prompt 275b — [REPAIR] Recover and restore the SNN Dispatch Desk regression.** Acceptance: audit git history and restore the last working end-to-end Dispatch Desk implementation as the design baseline unless a documented necessity requires change. The enabled, uniquely claimed Press Officer can discover, open, author, publish, dismiss, reconnect to, and audit the desk through the existing route, models, callables, rules, tests, styles, broadcast queue, and SNN shuttle/Press authority; ordinary, foreign, disabled, stale, and duplicate actors remain denied. The Dispatch Desk is explicitly excluded from generic Turn Zero UI and action restrictions: it remains visible and fully actionable during Turn Zero without weakening unrelated phase gates. Add chronological failing regression coverage proving the current breakage and composed restoration, including audience-correct bridge presentation, history/replay, accessibility, keyboard/screen-reader operation, mobile/short-landscape/reduced-motion containment, and established CIC aesthetics. Preserve SNN Press as a separate optional non-counted twenty-first station; do not invent printed behavior or silently fold this repair into an unrelated release.
- **Prompt 276 — [PRESERVE] Assign the Quellon/Refinery Union pair.** Acceptance: the engineer runs only those two maintenance lanes and their configured craft during allowed movement.
- **Prompt 277 — [PRESERVE] Assign the Shepherd/Icebreaker Union pair.** Acceptance: the alternate engineer receives only those two lanes and corresponding craft.
- **Prompt 278 — [EXTEND] Build extra-ship Captain workspaces.** Acceptance: Gorgoneion, base Capybara, Warrior, and Vulcan Captains receive only their selected vessel's policy and actions.
- **Prompt 279 — [EXTEND] Build expansion Capybara role workspaces.** Acceptance: Captain owns Macaw and supply/repair work; Recycler owns Boa and recycling/reclamation work without cross-role impersonation.
- **Prompt 280 — [EXTEND] Build replacement-role workspace shells.** Acceptance: Comms Officer, VIP Host, Commissar, Doctor, Militia Leader, Fighter Ace, and Wolf Commander each load only after valid reassignment and expose no fictional action.

#### Navigation, jumps, systems, scouting, and split fleets (Prompts 281–350)
- **Prompt 281 — [PRESERVE] Encode the canonical star-chart graph.** Acceptance: every printed system returns its exact adjacency list from server-safe immutable data.
- **Prompt 282 — [NEW] Select and lock chart A, B, or C.** Acceptance: only a facilitator chooses once before start and every later code lookup uses that chart.
- **Prompt 283 — [NEW] Resolve system codes by chart.** Acceptance: a coordinate returns the selected chart's title/code, including L/M threats and N/O/P candidates.
- **Prompt 284 — [NEW] Redact unknown systems.** Acceptance: players receive only discoveries entitled to their fleet group while facilitators retain the organiser view.
- **Prompt 285 — [NEW] Model per-ship position.** Acceptance: every active ship has one authoritative arrived coordinate or explicit transition state.
- **Prompt 286 — [NEW] Model fleet-group identity.** Acceptance: every active ship and player belongs to exactly one group and no transaction creates duplicate membership.
- **Prompt 287 — [PRESERVE] Calculate jump distance.** Acceptance: the server classifies legal routes as short, medium, or long using the selected printed topology.
- **Prompt 288 — [PRESERVE] Resolve per-ship jump costs.** Acceptance: each core/full ship and small-ship variant receives its exact S/M/L cost from server catalogs.
- **Prompt 289 — [PRESERVE] Validate Jump Drive readiness.** Acceptance: uncharged, damaged beyond use, destroyed, wrong-role, or wrong-phase requests fail without spending fuel.
- **Prompt 290 — [PRESERVE] Enforce one jump per ship per turn.** Acceptance: refresh, reconnect, concurrency, and retry cannot produce a second completed jump.
- **Prompt 291 — [PRESERVE] Reserve jump fuel atomically.** Acceptance: concurrent requests cannot overdraw a ship or host and a failed transaction spends nothing.
- **Prompt 292 — [PRESERVE] Validate coordinate shape.** Acceptance: malformed input fails before fuel, charge, location, pursuit, or lockout changes.
- **Prompt 293 — [PRESERVE] Validate printed reachability.** Acceptance: a well-formed but unreachable destination fails from the current authoritative origin.
- **Prompt 294 — [PRESERVE] Complete an independent ship jump.** Acceptance: one ship reaches its legal destination while all other ships retain their own states.
- **Prompt 295 — [PRESERVE] Resolve unprinted coordinates.** Acceptance: the current integrity-lock behavior is verified against the chosen facilitator policy and never pretends an arbitrary coordinate is a legal system.
- **Prompt 296 — [PRESERVE] Resolve uncharged and fuel-starved attempts.** Acceptance: the ship stays put, reports the exact denial, and preserves all resources.
- **Prompt 297 — [EXTEND] Resolve damaged-drive randomness.** Acceptance: the server owns the printed 1–3 failure roll and its auditable outcome.
- **Prompt 298 — [EXTEND] Apply upgraded-drive behavior.** Acceptance: cost drops by one and the damaged failure threshold changes exactly as printed.
- **Prompt 299 — [DECISION] Apply failed-jump damage.** Acceptance: the chosen facilitator policy routes damage through the common draw path and labels the adjudication.
- **Prompt 300 — [EXTEND] Execute one emergency jump per ship.** Acceptance: all fuel is consumed, the drive and half remaining consoles are damaged as specified, and repeats fail.
- **Prompt 301 — [EXTEND] Resolve concurrent fleet jumps.** Acceptance: simultaneous legal jumps update independent fuel, position, event, and group state without lost writes.
- **Prompt 302 — [EXTEND] Record every jump transition.** Acceptance: completed, failed, integrity, wrong-destination, and emergency results each create one audience-safe event.
- **Prompt 303 — [PRESERVE] Audit jump-button truthfulness.** Acceptance: digits, lock, power rail, pending, success, failure, and cooldown reflect server authority and remain keyboard/touch usable.
- **Prompt 304 — [EXTEND] Reconcile jump retries.** Acceptance: a timeout retry returns the committed result or fresh denial without spending or moving twice.
- **Prompt 305 — [NEW] Advance pursuit each turn.** Acceptance: each applicable group adds two exactly once at the defined turn transition.
- **Prompt 306 — [NEW] Reduce pursuit by chart depth.** Acceptance: each group uses the printed shortest-path distance from 0000 after movement.
- **Prompt 307 — [NEW] Isolate pursuit by fleet group.** Acceptance: a split creates independent values and one group's action cannot mutate another's.
- **Prompt 308 — [NEW] Apply Ion Nebula pursuit behavior.** Acceptance: the system I group suppresses the applicable rise while other groups remain unaffected.
- **Prompt 309 — [NEW] Apply the Level 5 Planet exception.** Acceptance: system G does not reduce pursuit despite its chart depth.
- **Prompt 310 — [NEW] Make Unstable Star missions repeatable.** Acceptance: system J can create its printed mission once per eligible turn without duplicate rewards.
- **Prompt 311 — [NEW] Make Abandoned Wolf Supply Outpost missions repeatable.** Acceptance: system K can create its hidden-difficulty mission once per eligible turn.
- **Prompt 312 — [NEW] Trigger L/M arrival pressure.** Acceptance: entering an operational Outpost or Fortress schedules the required attack and blocks missions.
- **Prompt 313 — [NEW] Persist system history.** Acceptance: discovery, attempts, hazards, rewards, cleared threats, and candidate progress survive reconnect without revealing other systems.
- **Prompt 314 — [NEW] Remove destroyed ships from navigation.** Acceptance: destroyed vessels leave active movement and DRADIS while escape pods, survivors, and retained shuttles remain addressable.
- **Prompt 315 — [NEW] Create first-arrival mission eligibility.** Acceptance: a newly reached mission system produces one opportunity for the arriving group.
- **Prompt 316 — [NEW] Make arrival effects idempotent.** Acceptance: retries and duplicate snapshots cannot create a second mission, hazard, attack, discovery, or reward.
- **Prompt 317 — [NEW] Resolve environmental maintenance hazards.** Acceptance: ships in I or J receive their printed check from authoritative location, not client coordinates.
- **Prompt 318 — [NEW] Track candidate discovery.** Acceptance: N/O/P become found only through a legal scout or arrival and only entitled readers see the reveal.
- **Prompt 319 — [NEW] Surface the Turn 6 planning checkpoint.** Acceptance: facilitators can track whether a candidate plan exists without exposing hidden guidance.
- **Prompt 320 — [PROVE] Run the jump-and-system scenario.** Acceptance: one fixture selects a chart, jumps ships independently, updates pursuit, triggers an arrival effect, and reconnects safely.
- **Prompt 321 — [NEW] Define scout entitlements.** Acceptance: only Starlight, Hummingbird, Endeavour, or the assigned Comms Officer can create their printed request.
- **Prompt 322 — [NEW] Resolve Starlight's first scan.** Acceptance: the Wing Commander scouts one system within two jumps of current AEGIS position.
- **Prompt 323 — [NEW] Resolve Starlight's fuelled second scan.** Acceptance: only authoritative current-turn fuel permits one additional distinct eligible system.
- **Prompt 324 — [NEW] Resolve Hummingbird scouting.** Acceptance: the Explorer scouts one system within three jumps of current Quellon position and no farther.
- **Prompt 325 — [NEW] Resolve Endeavour scouting.** Acceptance: the Scientist scouts one system at any range once per allowed turn.
- **Prompt 326 — [NEW] Resolve Comms Officer scouting.** Acceptance: the valid replacement scouts one system within one jump of current AEGIS position.
- **Prompt 327 — [PROVE] Measure scout range from current authority.** Acceptance: a stale owner or client origin cannot expand range after a ship jumps.
- **Prompt 328 — [NEW] Deliver scout results privately.** Acceptance: only the requester and permitted facilitator readers receive the requested system fact.
- **Prompt 329 — [NEW] Reveal a chart result as facilitator.** Acceptance: the facilitator resolves the selected booklet entry without publishing the organiser chart.
- **Prompt 330 — [NEW] Persist player discovery notes safely.** Acceptance: entitled facts survive while no endpoint becomes a full-chart export.
- **Prompt 331 — [PROVE] Audit scouting events.** Acceptance: requester, origin, target, turn, and permitted result are recorded with no unrelated chart data.
- **Prompt 332 — [NEW] Accumulate Deep Nebula scans privately.** Acceptance: each qualifying system O scout adds one hidden bonus entry exactly once.
- **Prompt 333 — [NEW] Hide the Deep Nebula total.** Acceptance: players know scouting occurred but cannot read the accumulated roll modifier before resolution.
- **Prompt 334 — [NEW] Apply two-system exploration rewards.** Acceptance: D/E rewards reveal two legal targets without creating arrival-only effects or duplicate discoveries.
- **Prompt 335 — [NEW] Constrain Athena's Wolf-system reveal.** Acceptance: the reward can expose only a valid L/M target on the selected chart.
- **Prompt 336 — [NEW] Create a split after partial arrival.** Acceptance: ships that completed a destination form a group and ships left behind retain their original group and location.
- **Prompt 337 — [NEW] Project a group-local roster.** Acceptance: members receive only their current group's operational roster except for explicit facilitator access.
- **Prompt 338 — [NEW] Deny cross-group position reads.** Acceptance: another group's coordinates, pursuit, craft, missions, and hidden events cannot be queried or inferred.
- **Prompt 339 — [NEW] Deny cross-group communications.** Acceptance: ordinary messages fail across groups at the server boundary.
- **Prompt 340 — [NEW] Permit local Coordination communication.** Acceptance: eligible players in one group can exchange the intended message/status during the allowed phase.
- **Prompt 341 — [NEW] Keep Team actions group-local.** Acceptance: maintenance continues within each group while prohibited movement and cross-group state remain unavailable.
- **Prompt 342 — [NEW] Scope jump announcements by audience.** Acceptance: relevant groups and facilitators see the proper departure/arrival without learning a forbidden destination.
- **Prompt 343 — [NEW] Ferry up to two players by scout taxi.** Acceptance: an eligible scout consumes one round-trip attempt and moves no more than two authorized players.
- **Prompt 344 — [NEW] Ferry up to two fuel by scout taxi.** Acceptance: the same capacity carries fuel instead of players and inventory commits atomically.
- **Prompt 345 — [NEW] Deny out-of-range taxi trips.** Acceptance: no player, fuel, shuttle, attempt, or event changes on an illegal route.
- **Prompt 346 — [NEW] Validate group rejoin eligibility.** Acceptance: groups can merge only at the same authoritative system through the recorded facilitator policy.
- **Prompt 347 — [NEW] Merge rejoined membership.** Acceptance: ships, players, shuttles, discoveries, and events appear once in the surviving group.
- **Prompt 348 — [DECISION] Resolve rejoined pursuit.** Acceptance: the selected product/facilitator policy combines independent scores explicitly and audibly.
- **Prompt 349 — [NEW] Restore communication after commit.** Acceptance: messages cross the former boundary only after the group merge is authoritative.
- **Prompt 350 — [NEW] Make split/rejoin retries safe.** Acceptance: duplicate requests cannot strand an entity, duplicate membership, expose early communication, or merge twice.

#### DRADIS, shuttle travel, capabilities, and away missions (Prompts 351–424)
- **Prompt 351 — [EXTEND] Show only arrived local ships on DRADIS.** Acceptance: extend the current ship-local presentation primitive so a viewer sees ships whose authoritative coordinate and fleet group match their own; current catalog/filter rendering alone is not composed split-fleet proof.
- **Prompt 352 — [EXTEND] Represent jumping ships in transition.** Acceptance: extend the current presentation-only transition primitive so an authoritative departure removes the old arrived contact and destination does not appear before commit.
- **Prompt 353 — [EXTEND] Publish sampled transit contacts.** Acceptance: DRADIS consumes server-owned samples and never derives hidden destination or movement authority from animation; later Wolf-attack contacts consume only Prompt 433a's audience-safe endpoint.
- **Prompt 354 — [EXTEND] Remove stale contacts.** Acceptance: the newest server snapshot removes or changes a departed/destroyed contact despite cached local data.
- **Prompt 355 — [EXTEND] Fold docked shuttles into host contacts.** Acceptance: a docked craft appears at its host rather than as an independent in-flight object.
- **Prompt 356 — [EXTEND] Show undocked shuttle samples.** Acceptance: an eligible travelling craft appears only from authoritative sampled transit state.
- **Prompt 357 — [EXTEND] Redact split-fleet contact metadata.** Acceptance: labels, counts, events, and empty space cannot reveal another group's location.
- **Prompt 358 — [EXTEND] Reflect attack parking on DRADIS.** Acceptance: all craft resolve to parked hosts while only combat-capable craft enter the battle projection; consume Prompt 433a state without adding the owner-deferred attack visualization.
- **Prompt 359 — [EXTEND] Merge contacts after rejoin.** Acceptance: valid ships and craft from both groups appear once only after the group transaction commits.
- **Prompt 360 — [EXTEND] Deny direct DRADIS writes.** Acceptance: clients cannot forge contact, coordinate, transit, arrival, range, or visit-log state.
- **Prompt 361 — [PRESERVE] Build the authoritative shuttle manifest.** Acceptance: every craft starts once at its printed host with exact owner, type, and enabled-mode rules.
- **Prompt 362 — [NEW] Transfer shuttle control.** Acceptance: only the printed owner or authorized facilitator hands off/reclaims a craft and ownership is audited.
- **Prompt 363 — [NEW] Resolve holder-based docking.** Acceptance: a completed movement docks where the authoritative holder is located, subject to craft rules.
- **Prompt 364 — [NEW] Validate Team-start docking.** Acceptance: every required craft has one legal host or produces a facilitator-visible exception.
- **Prompt 365 — [NEW] Request shuttle departure.** Acceptance: an entitled holder can depart to a legal local ship only in an open movement window.
- **Prompt 366 — [NEW] Enter authoritative shuttle transit.** Acceptance: the craft is neither at origin nor destination until its server travel state completes.
- **Prompt 367 — [NEW] Complete shuttle arrival.** Acceptance: host, holder, visit log, event, and DRADIS update exactly once.
- **Prompt 368 — [NEW] Retarget in flight.** Acceptance: an allowed course change starts at the server-resolved current position, preserving cargo and prior host state.
- **Prompt 369 — [NEW] Fuel only eligible docked craft.** Acceptance: Team Phase, host bay, dock, owner, fuel balance, and per-bay use are validated together.
- **Prompt 370 — [NEW] Expire unused shuttle fuel.** Acceptance: turn rollover clears fuel once and reconnect cannot preserve it.
- **Prompt 371 — [NEW] Park craft when airspace closes.** Acceptance: a travelling shuttle resolves to its authoritative nearest legal host and cannot remain in motion.
- **Prompt 372 — [NEW] Apply the SNN/AEGIS movement exception.** Acceptance: only the documented Press-shuttle authorization bypasses its exact restriction; no generic craft inherits it.
- **Prompt 373 — [NEW] Park every craft for a Wolf attack.** Acceptance: declaration moves all craft to nearest hosts and battle participation follows capabilities.
- **Prompt 374 — [NEW] Preserve shuttle damage immunity.** Acceptance: environmental or Wolf ship-damage calls cannot draw a ship card for a shuttle.
- **Prompt 375 — [NEW] Enforce ordinary bay capacity.** Acceptance: each non-AEGIS bay fuels no more craft than its printed capacity per turn.
- **Prompt 376 — [NEW] Enforce AEGIS dual-bay capacity.** Acceptance: Zeta and Omega retain independent use, damage, and event records.
- **Prompt 377 — [NEW] Transfer permitted shuttle cargo.** Acceptance: only current docked inventories and each craft's allowlist can move resources or teams.
- **Prompt 378 — [NEW] Preserve security-team semantics.** Acceptance: transferred teams remain countable, located, and eligible for boarding only at their host.
- **Prompt 379 — [NEW] Deny invalid cargo moves.** Acceptance: unsupported type, negative amount, overdraw, wrong dock, wrong role, wrong phase, and stale revision leave all inventories unchanged.
- **Prompt 380 — [NEW] Reconcile movement conflicts.** Acceptance: a lost race returns the authoritative host/transit state without duplicating cargo, fuel, or visits.
- **Prompt 381 — [NEW] Resolve Philia repairs.** Acceptance: four materials repair each of up to two consoles on one ship; fuel permits a second eligible ship.
- **Prompt 382 — [NEW] Resolve Blacksmith repairs.** Acceptance: the same printed repair contract runs under Icebreaker ownership and its actual dock.
- **Prompt 383 — [NEW] Resolve Chacau repairs.** Acceptance: its actual sheet, not copied Philia wording, controls cargo, repair, fuel, and ownership.
- **Prompt 384 — [NEW] Resolve Ally repairs.** Acceptance: its actual Union craft ID, not copied Chacau/Philia names, controls all authority.
- **Prompt 385 — [NEW] Resolve permissioned dismantling.** Acceptance: an engineering craft damages an eligible console for three materials only after a target-ship player consents.
- **Prompt 386 — [NEW] Resolve service-shuttle recharge.** Acceptance: fuelled Black Sheep, Condor, or Wobbly charges one eligible host console once in Coordination.
- **Prompt 387 — [NEW] Trigger immediate effects from recharge.** Acceptance: a newly charged immediate console resolves once and cannot be retriggered by retry.
- **Prompt 388 — [NEW] Resolve Highwall mining.** Acceptance: two server-random operations, plus one only when fuelled, create the exact ore/material results.
- **Prompt 389 — [NEW] Resolve Highwall combat.** Acceptance: fuelled Medium and Short attacks deal three damage on a server roll of 5+.
- **Prompt 390 — [NEW] Resolve Hummingbird harvesting.** Acceptance: two server dice are allocated by the player between food and water within the printed rule.
- **Prompt 391 — [NEW] Resolve Endeavour field upgrades.** Acceptance: two target consoles, or four when fuelled, use each target ship's current material cost.
- **Prompt 392 — [NEW] Apply Starlight mission bonuses.** Acceptance: +3 exploration and +1 salvage apply only where its participant contributed a card.
- **Prompt 393 — [NEW] Apply Hummingbird mission bonuses.** Acceptance: +3 exploration and +1 mining apply only to its participant's contributed opportunities.
- **Prompt 394 — [NEW] Resolve Pallas boarding support.** Acceptance: its host contributes security teams and rerolls, with fuelled relocation only at the correct boundary.
- **Prompt 395 — [NEW] Resolve Chepu boarding support.** Acceptance: the equivalent support runs from Chepu's own owner, host, fuel, and mission state.
- **Prompt 396 — [NEW] Resolve Alpha and Bravo fighter state.** Acceptance: launch, target shift, Medium attack, Short attack, losses, and per-wing limits remain independent.
- **Prompt 397 — [NEW] Resolve Maliades state.** Acceptance: launch, three-damage destruction, fuel repair, Medium choice, and Short risk persist authoritatively.
- **Prompt 398 — [NEW] Resolve the PDF Escort Wing state.** Acceptance: four-fighter cap, combat actions, launch requirement, and fuel-free mission participation remain distinct.
- **Prompt 399 — [NEW] Resolve Macaw movement and cargo.** Acceptance: the Captain moves its full printed cargo including Scrap without borrowing Boa actions.
- **Prompt 400 — [NEW] Resolve Boa movement and cargo.** Acceptance: the Recycler moves only printed Scrap cargo and retains separate reclamation/combat actions.
- **Prompt 401 — [NEW] Validate mission eligibility and leader.** Acceptance: one newly reached system starts one mission with eligible craft and exactly one entitled Mission Leader.
- **Prompt 402 — [NEW] Build the mission deck.** Acceptance: three suits omit 2s/3s and use A=10, number face value, and face cards −5 from a server-only shuffled deck.
- **Prompt 403 — [NEW] Deal private initial cards.** Acceptance: each participant receives one card readable only by that participant and facilitators.
- **Prompt 404 — [NEW] Let the leader distribute extra cards blindly.** Acceptance: at most one per player per opportunity is assigned without revealing contents to the leader.
- **Prompt 405 — [NEW] Accept private card requests.** Acceptance: a participant may request a count without recording or disclosing the reason.
- **Prompt 406 — [NEW] Resolve each private discard.** Acceptance: exactly one owned card is discarded secretly before assignment and cannot be reused.
- **Prompt 407 — [NEW] Assign cards to opportunities.** Acceptance: each participant places at most one face-down card per opportunity from their remaining hand.
- **Prompt 408 — [NEW] Add facilitator cards.** Acceptance: each nonempty opportunity gets one server top-deck card and an authorized shuffle action.
- **Prompt 409 — [NEW] Calculate opportunity totals.** Acceptance: the server combines values and exact difficulty/critical thresholds without client-supplied arithmetic.
- **Prompt 410 — [NEW] Apply only contribution-linked bonuses.** Acceptance: craft, role, or device bonuses affect only the opportunities whose ledger qualifies.
- **Prompt 411 — [NEW] Fail empty opportunities.** Acceptance: no player card means no facilitator card and an automatic failure result.
- **Prompt 412 — [NEW] Resolve critical success separately.** Acceptance: ordinary success and critical success produce only their exact reward branches.
- **Prompt 413 — [NEW] Place rewards in Mission Leader custody.** Acceptance: the server mints rewards once and the client cannot create or redirect them outside policy.
- **Prompt 414 — [NEW] Preserve mission overruns.** Acceptance: a mission crossing into Team Phase keeps participants/craft committed and blocks illegal movement until completion.
- **Prompt 415 — [NEW] Drop off oversized rewards.** Acceptance: the leader designates one legal ship when their craft cannot carry the result.
- **Prompt 416 — [NEW] Encode Lichen-Covered Asteroids A.** Acceptance: every opportunity, difficulty, critical threshold, trait bonus, failure, and reward matches the mission card.
- **Prompt 416a — [NEW] Encode Ice Asteroids B.** Acceptance: every opportunity, difficulty, critical threshold, trait bonus, failure, and reward matches the mission card.
- **Prompt 416b — [NEW] Encode Rare Element Moon C.** Acceptance: every opportunity, difficulty, critical threshold, trait bonus, failure, and reward matches the mission card.
- **Prompt 417 — [NEW] Encode Abandoned Explorer Outpost D.** Acceptance: exact opportunities, discoveries, upgrades, failures, and rewards resolve from the catalog.
- **Prompt 417a — [NEW] Encode Athena Survivors E.** Acceptance: exact rescue opportunities, Wolf-system discovery, survivors, failures, and rewards resolve without chart leakage.
- **Prompt 417b — [NEW] Encode Abandoned Refuelling Station F.** Acceptance: exact opportunities, fuel/material rewards, repairs, failures, and critical results resolve once.
- **Prompt 418 — [NEW] Encode Level 5 Survivable Planet G.** Acceptance: exact mission, population/reward effects, and no-pursuit-reduction exception resolve together.
- **Prompt 418a — [NEW] Encode Derelict Research Vessel H.** Acceptance: exact science opportunities, upgrades/devices, hazards, failures, and rewards resolve once.
- **Prompt 418b — [NEW] Encode Ion Nebula I.** Acceptance: exact mission, environmental damage, pursuit suppression, and penalty-removal rewards stay group-local.
- **Prompt 419 — [NEW] Encode Unstable Star J.** Acceptance: its three-card, one-opportunity mission, repeatability, hazard, and reward are exact.
- **Prompt 420 — [NEW] Encode Wolf Supply Outpost K.** Acceptance: facilitator-only X defines 5X/5X+10 and 2X/2X/2X/X rewards without leaking difficulty early.
- **Prompt 421 — [NEW] Encode Active Wolf Outpost L.** Acceptance: entry pressure, operational mission lock, clearing state, mission, and recurring attack behavior are exact.
- **Prompt 421a — [NEW] Encode Active Wolf Fortress M.** Acceptance: minimum Battlestation/composition, repeated pressure, mission lock, clearing state, and mission behavior are exact.
- **Prompt 422 — [PROVE] Run the complete away-mission scenario.** Acceptance: private deal, blind distribution, discard, assignment, bonuses, facilitator cards, success/failure, reward, overrun, and reconnect all work without leaks.
- **Prompt 423 — [PROVE] Run the shuttle-airspace scenario.** Acceptance: departure, current DRADIS transit/contact presentation, retarget, arrival, transfer, restriction parking, attack parking, reopen, and retry all remain authoritative; this proof does not introduce or imply the owner-deferred Wolf-attack visualization.
- **Prompt 424 — [PROVE] Run the split-fleet exploration scenario.** Acceptance: two groups scout, jump independently, hide contacts/comms, ferry a legal payload, complete a mission, rejoin, and retain correct pursuit.

#### Wolf attack engine, fleet combat, and boarding (Prompts 425–484)
- **Prompt 425 — [NEW] Define the Wolf ship catalog.** Acceptance: Fighter Wing, Assault Transport, Destroyer, Cruiser, Strikecarrier, and Battlestation capacities/effects match every range and return rule.
- **Prompt 426 — [NEW] Define attack-composition rules.** Acceptance: Turn 1 and later attacks meet their exact composition/capacity constraints without player-selected hidden cards.
- **Prompt 427 — [NEW] Prepare an attack privately from the GM console.** Acceptance: one GM can stage eligible cards, targets, modifiers, and notes before declaration while players receive nothing early; a second GM sees the same revision without becoming required.
- **Prompt 428 — [NEW] Centralize combat math and randomness.** Acceptance: target selection, dice, modifier order, phase deadlines, damage, and casualties are server-generated/validated, recorded in a calculation receipt, and impossible to submit as outcomes.
- **Prompt 429 — [NEW] Encode base targeting.** Acceptance: d6 maps exactly to the six core ships from authoritative active configuration.
- **Prompt 430 — [NEW] Encode expansion targeting.** Acceptance: enabled Capybara uses d8 result 7 while 8 rerolls; base small Capybara is never a full-ship target.
- **Prompt 431 — [NEW] Resolve target-number wraparound.** Acceptance: every permitted ±1 shift uses the correct configured target ring and clients cannot select the final ship directly.
- **Prompt 432 — [NEW] Declare the attack atomically.** Acceptance: a GM-console declaration commits attack state, airspace lock, parked craft, current step/deadline, calculation receipt, and one announcement together.
- **Prompt 432a — [EXTEND] Operate the attack from the GM console.** Acceptance: one GM can declare, advance, pause, inspect, and resume the automatic lifecycle from the established GM surface; additional GMs observe the same authority and never become required operators.
- **Prompt 433 — [NEW] Project attack state by audience.** Acceptance: affected players see phase, deadlines, status, permitted actions, and audience-safe results; facilitators retain hidden composition, unresolved dice, notes, and intervention state.
- **Prompt 433a — [NEW] Publish a stable DRADIS-ready attack contract.** Acceptance: audience-safe endpoints/events expose canonical attack, source, target/contact, phase, server timestamp/deadline, range, bearing/contact reference, effect/outcome, visibility, and redaction fields with schema/privacy/reconnect tests; no new DRADIS attack visualization is implied.
- **Prompt 433b — [EXTEND] Resolve choices in affected player consoles.** Acceptance: each existing entitled console shows all and only the eligible attack information, choices, pending/timeout state, denial, and committed result without facilitator transcription or hidden-state leakage.
- **Prompt 434 — [NEW] Make attack commands retry-safe.** Acceptance: duplicate declaration, roll, player action, timeout, or advancement returns one result and never resolves a step twice.
- **Prompt 434a — [EXTEND] Intervene and recover safely during an attack.** Acceptance: a GM pause, override, correction, or recovery requires a reason, danger confirmation when high impact, expected revision, idempotency key, scoped before/after delta, audit/replay, and bounded rollback where allowed; a concurrent stale GM cannot overwrite the winner.
- **Prompt 435 — [NEW] Resolve Wolf Commander target rerolls.** Acceptance: the assigned Commander rerolls each eligible die no more than once before Command and Control.
- **Prompt 436 — [NEW] Resolve AEGIS Command and Control.** Acceptance: charged, undamaged authority may redirect one Wolf ship to AEGIS only after Commander rerolls.
- **Prompt 437 — [NEW] Lock Gorgoneion Force Field timing.** Acceptance: one ship is selected before targeting and receives exactly two less final damage.
- **Prompt 438 — [NEW] Resolve Long Range simultaneously.** Acceptance: all eligible actions lock, roll, and resolve as one range result before Medium begins.
- **Prompt 439 — [NEW] Resolve Medium Range simultaneously.** Acceptance: target shifts and attacks lock and resolve together without client-controlled ordering.
- **Prompt 440 — [NEW] Resolve Short Range simultaneously.** Acceptance: attacks resolve together and mandatory Wolf Fighter Wing priority is preserved.
- **Prompt 441 — [NEW] Enforce the five-step attack order.** Acceptance: Targeting, Long, Medium, Short, and Boarding commands fail outside their authoritative step.
- **Prompt 442 — [NEW] Apply range-specific destruction effects.** Acceptance: a Wolf card destroyed at each range produces only its printed effect for that step.
- **Prompt 443 — [NEW] Enforce Short Range fighter priority.** Acceptance: available Wolf Fighter Wings receive mandatory fleet damage before other Wolf ships.
- **Prompt 444 — [NEW] Close each range with an audit result.** Acceptance: rolls, actors, targets, shifts, damage, destruction, and unresolved capacity are recorded with audience redaction.
- **Prompt 445 — [NEW] Resolve AEGIS Missile Launchers at Long Range.** Acceptance: a charged, undamaged action deals two damage to one valid Wolf target.
- **Prompt 446 — [NEW] Spend ore on enriched warheads.** Acceptance: five AEGIS ore grants the printed one-attack missile bonuses and cannot be spent twice.
- **Prompt 447 — [NEW] Resolve AEGIS Missile Launchers at Medium Range.** Acceptance: four server dice use 5+ and exact upgrade/warhead/target constraints.
- **Prompt 448 — [NEW] Resolve AEGIS Point Defence.** Acceptance: the printed Medium and Short dice, thresholds, upgrade, and target limits resolve once.
- **Prompt 449 — [NEW] Authorize Fighter Bay launches.** Acceptance: Alpha and Bravo launch only from their own charged, undamaged bay under Wing Commander authority.
- **Prompt 450 — [NEW] Shift targets with fleet fighters.** Acceptance: each eligible fighter performs no more than one permitted target-number adjustment with correct wraparound.
- **Prompt 451 — [NEW] Attack at Medium Range with fleet fighters.** Acceptance: each committed fighter rolls once and deals the printed damage on 5+.
- **Prompt 452 — [NEW] Attack at Short Range with fleet fighters.** Acceptance: each committed fighter hits on 3+ and is destroyed on 1–2 before any later use.
- **Prompt 453 — [NEW] Resolve Maliades at range.** Acceptance: its Medium target/damage choice, Short attack, self-risk, durability, and fuel repair remain authoritative.
- **Prompt 454 — [NEW] Resolve Highwall at range.** Acceptance: only a fuelled Highwall rolls each eligible Medium/Short attack and deals three on 5+.
- **Prompt 455 — [NEW] Resolve the Gorgoneion Missile Array.** Acceptance: three dice use 6+/5+/4+ by range with at most one hit per target from the array each phase.
- **Prompt 456 — [NEW] Launch the PDF Fighter Wing.** Acceptance: only charged, undamaged Refinery bay and Colonel authority make its fighters combat-eligible.
- **Prompt 457 — [NEW] Resolve PDF fighters at Medium Range.** Acceptance: each fighter chooses one target shift or one 5+ attack and cannot do both.
- **Prompt 458 — [NEW] Resolve PDF fighters at Short Range.** Acceptance: each fighter attacks on 3+ and is destroyed on 1–2.
- **Prompt 459 — [NEW] Resolve Boa's range actions.** Acceptance: once at each range, Boa may spend one Scrap for one valid Wolf damage under the recorded ambiguity policy.
- **Prompt 460 — [NEW] Apply Macaw boarding support.** Acceptance: its authoritative host can contribute eligible security teams only while Macaw is correctly docked.
- **Prompt 461 — [NEW] Relocate Pallas or Chepu before boarding.** Acceptance: a fuelled craft moves to one legal ship only at the start of Boarding.
- **Prompt 462 — [NEW] Apply engineering/service shuttle support.** Acceptance: Philia, Blacksmith, Black Sheep, Condor, Chacau, Wobbly, and Ally enable host security teams from their actual craft definitions.
- **Prompt 463 — [NEW] Apply AEGIS and Pallas boarding rerolls.** Acceptance: independent reroll allowances cannot be reused or double-counted.
- **Prompt 464 — [DECISION] Apply Wolf Commander boarding leadership.** Acceptance: two parties are added at the printed point and incomplete consequence text routes to an explicit facilitator call.
- **Prompt 465 — [NEW] Drop Assault Transport parties.** Acceptance: each surviving transport contributes exactly four parties to its resolved target.
- **Prompt 466 — [NEW] Roll security-team defence.** Acceptance: each available team uses the printed 1 death, 2–3 no effect, 4+ kill result from server dice.
- **Prompt 467 — [NEW] Apply surviving-boarder damage.** Acceptance: each remaining assault team deals one authoritative ship damage after defence.
- **Prompt 468 — [NEW] Resolve Militia Leader defence.** Acceptance: outnumbered teams gain the printed dice and optional front-line risk can kill the role holder.
- **Prompt 469 — [NEW] Resolve Wolf Fighter Wing destruction.** Acceptance: each range applies its exact effect and surviving wings alone enter next-attack return state.
- **Prompt 469a — [NEW] Resolve Assault Transport destruction.** Acceptance: each range applies its exact effect and only surviving transports drop parties.
- **Prompt 469b — [NEW] Resolve Wolf Destroyer destruction.** Acceptance: each range applies the printed damage/return consequence from immutable card data.
- **Prompt 469c — [NEW] Resolve Wolf Cruiser destruction.** Acceptance: each range applies the printed damage/return consequence from immutable card data.
- **Prompt 469d — [NEW] Resolve Strikecarrier destruction.** Acceptance: each range effect and surviving-wing bonus timing use authoritative post-range state.
- **Prompt 469e — [NEW] Resolve Battlestation destruction.** Acceptance: each range effect, Short immunity, and station-specific consequence match the printed card.
- **Prompt 470 — [NEW] Carry surviving Wolf Fighter Wings forward.** Acceptance: surviving wings return in the next attack and destroyed wings do not.
- **Prompt 471 — [NEW] Enforce Battlestation Short Range immunity.** Acceptance: Short damage is denied while Long/Medium vulnerability remains.
- **Prompt 472 — [NEW] Apply Strikecarrier wing bonus.** Acceptance: the final bonus uses authoritative surviving-wing state at the correct step.
- **Prompt 473 — [NEW] Apply surviving Wolf ship damage.** Acceptance: after Boarding, every surviving card damages its resolved target by its printed value.
- **Prompt 474 — [EXTEND] Publish the immediate attack result.** Acceptance: extend current crew/broadcast projection surfaces so affected crews see damage, casualties, boarding, and remaining threats while hidden prep stays private.
- **Prompt 475 — [EXTEND] Reuse the common damage draw path.** Acceptance: extend the existing authoritative damage primitive so combat damage covers the drawn console, applies armour, records the card, and never exposes remaining deck order.
- **Prompt 476 — [EXTEND] Destroy a ship on combat deck exhaustion.** Acceptance: extend the existing damage-deck exhaustion primitive so an empty required combat draw enters the same authoritative catastrophe flow used elsewhere.
- **Prompt 477 — [EXTEND] Apply combat casualties.** Acceptance: extend the existing population/threshold primitive so each applicable hit steps the target's exact population track and triggers thresholds once.
- **Prompt 478 — [NEW] Apply Doctor casualty mitigation.** Acceptance: one ship is halved, and each additional ship costs exactly three food and three water from valid stores.
- **Prompt 479 — [NEW] Resolve Warrior post-attack salvage.** Acceptance: one server die per authoritative damage dealt by either side yields one material on each 5+.
- **Prompt 480 — [NEW] Resolve Capybara post-attack Scrap.** Acceptance: each ship taking at least three damage creates exactly one Scrap opportunity per attack.
- **Prompt 481 — [NEW] Collect Scrap with Macaw or Boa.** Acceptance: each craft moves only its printed salvage/cargo after the threshold event.
- **Prompt 482 — [EXTEND] Resolve post-attack repairs.** Acceptance: extend the existing damage/correction and typed craft primitives into ordinary eligible repair or permission-dismantle using correct costs, hosts, fuel, and audit events.
- **Prompt 483 — [NEW] Rebuild fighters after combat.** Acceptance: the AEGIS Construction Bay spends one material per fighter up to the current wing cap.
- **Prompt 484 — [EXTEND] Publish the complete aftermath.** Acceptance: extend current crew/GM/broadcast surfaces so each crew sees damage, casualties, stores, salvage, repairs, surviving/returning Wolves, and outstanding recovery work with one-GM next-action visibility.

#### Threat pressure, Wolf loyalties, deduction, and facilitator actions (Prompts 485–524)
- **Prompt 485 — [REPAIR] Make pursuit authoritative from Turn 1.** Acceptance: repair the current client-only calculation/presentation so attack scheduling, navigation, failure transitions, and threat views consume the same server-owned group value initialized at 2; stale presentation cannot declare game over or drive attack pressure.
- **Prompt 485a — [REPAIR] Restore alert-scoped Pursuit Track color.** Acceptance: restore the normal ship/faction presentation from `0215488` whenever authoritative Red Alert is inactive, and use hostile danger red only while that shared alert is active; `0d64e25` documents the always-danger departure to repair. Stand-down, reconnect, late join, stale revision, split-fleet scope, reduced motion, and terminal text converge on authority without changing countdown placement, pursuit math, or claiming P485's broader server-value repair complete. Prove non-color alert/terminal meaning, CIC contrast, and 320×844, 390×844, 1440×900, and 844×390 containment.
- **Prompt 486 — [PROVE] Verify the per-turn pursuit rise.** Acceptance: every active group adds two once and attack calculations use the committed score.
- **Prompt 487 — [PROVE] Verify jump-based pursuit reduction.** Acceptance: attack pressure uses each group's selected-chart depth and never client-reported distance.
- **Prompt 488 — [PROVE] Verify Ion Nebula threat suppression.** Acceptance: system I prevents the specified rise for that group while preserving environmental damage.
- **Prompt 489 — [PROVE] Verify the Level 5 Planet exception.** Acceptance: entering G does not grant the normal pursuit reduction.
- **Prompt 490 — [NEW] Preserve independent split-group threat.** Acceptance: attacks and Commander capacity use the targeted group's pursuit only.
- **Prompt 491 — [NEW] Trigger Active Wolf Outpost attacks.** Acceptance: L schedules the required continuing pressure and missions remain blocked while operational.
- **Prompt 492 — [NEW] Trigger Active Wolf Fortress attacks.** Acceptance: M includes at least one Battlestation and 20 other damage capacity under the authoritative composition.
- **Prompt 493 — [NEW] Trigger Ancient Space Station attacks.** Acceptance: P creates and repeats the required attacks while any Wolf force survives.
- **Prompt 494 — [NEW] Resolve the Wolf Commander attack dial.** Acceptance: only the assigned Commander can marshal ten capacity plus current pursuit once per turn.
- **Prompt 495 — [NEW] Assign hidden loyalties authoritatively.** Acceptance: every configured player receives one valid private card and starting suspicion.
- **Prompt 496 — [REPAIR] Enforce the server-derived Wolf count.** Acceptance: the locked core roster deterministically produces one or two agents, including two for the owner-set 19/20 Capybara rows; optional Press remains eligible for random assignment when claimed but cannot change that count or create a third Wolf. Any exceptional override is reasoned, revision-guarded, audited, and visible in the setup receipt.
- **Prompt 497 — [NEW] Authorize one Wolf action per turn.** Acceptance: only a living active Wolf with the correct cover role can submit one eligible action.
- **Prompt 498 — [NEW] Resolve console sabotage.** Acceptance: recent-visit rules, random or chosen target mode, damage, and +2/+4 suspicion remain server-owned.
- **Prompt 499 — [NEW] Resolve supply sabotage.** Acceptance: half of one valid resource on the Wolf-controlled shuttle is destroyed with correct rounding and +2 suspicion.
- **Prompt 500 — [NEW] Resolve a homing beacon.** Acceptance: the current system schedules next-turn pressure, never an immediate turn-start attack, and adds the printed suspicion.
- **Prompt 501 — [NEW] Send Wolf intelligence privately.** Acceptance: the short handler message and +3 suspicion reach only the permitted Wolf/facilitator readers.
- **Prompt 502 — [NEW] Resolve suspicion and clue rolls.** Acceptance: the exact action increment applies before one authoritative threshold roll and facilitator disclosure.
- **Prompt 503 — [NEW] Deliver Wolf action receipts by audience.** Acceptance: the Wolf sees their result, affected crews see only consequences, and facilitators see the full record.
- **Prompt 503a — [NEW] Trigger the hacking overlay from authority.** Acceptance: only a committed Wolf hacking state launches shared approved copy, remains aria-hidden/nonblocking, and suppresses nonessential motion.
- **Prompt 504 — [PROVE] Audit suspicion history privately.** Acceptance: old/new value, source, roll, clue, disclosure, actor, and turn are durable but not broadly readable.
- **Prompt 505 — [NEW] Investigate as the Intelligence Agent.** Acceptance: one target per turn returns an approximately 80%-accurate private server result.
- **Prompt 506 — [PROVE] Prove investigation randomness ownership.** Acceptance: hidden truth and reported result are separately recorded and no client can submit “Wolf” or “loyal.”
- **Prompt 507 — [NEW] Apply Intelligence Agent suspicion.** Acceptance: each investigation adds two and only a Wolf-aligned investigator triggers Wolf clue behavior.
- **Prompt 508 — [NEW] Test with the Wolf Agent Detector.** Acceptance: a built device performs up to three private approximately 80%-accurate tests per turn.
- **Prompt 509 — [NEW] Publish Android proof.** Acceptance: the Android can prove their own non-Wolf card and nobody can forge or compel the event.
- **Prompt 510 — [NEW] Reveal Friend trust privately.** Acceptance: valid partners identify each other while unrelated players remain denied.
- **Prompt 511 — [NEW] Deliver Universal Arbour visions.** Acceptance: facilitator-authored location, danger, or suspicion content is private and labeled as a call.
- **Prompt 512 — [NEW] Deliver Wolf Cult intelligence.** Acceptance: fortress, supplies, agent, and code-word intel reaches only the Cult leader and facilitator.
- **Prompt 513 — [NEW] Calculate arrest posse size privately.** Acceptance: the facilitator receives six minus suspicion bands plus defenders and optional ±1 adjustment without revealing suspicion.
- **Prompt 514 — [NEW] Resolve arrest and its deadline.** Acceptance: the prisoner reaches release, execution, or explicit facilitator resolution by the end of the next Team Phase.
- **Prompt 515 — [NEW] Assign a replacement role.** Acceptance: a dead, arrested, removed, or late player receives one valid role/extra ship without duplicate seats or loyalty leakage.
- **Prompt 516 — [NEW] Activate the Comms Officer.** Acceptance: the replacement can perform their one-jump AEGIS scouting action before the game ends.
- **Prompt 517 — [NEW] Activate the VIP Host.** Acceptance: a verified visit grants one hosted ship its printed maintenance reroll once.
- **Prompt 518 — [NEW] Activate the Commissar.** Acceptance: captain consent permits the exact survivor purge and once-per-ship unrest reduction.
- **Prompt 519 — [NEW] Activate the Militia Leader.** Acceptance: boarding defence and front-line death risk resolve from current location and authoritative dice.
- **Prompt 520 — [NEW] Activate the PDF Fighter Ace.** Acceptance: the replacement's personal-combat loop, damage, target, and result are server-resolved and usable in an attack.
- **Prompt 521 — [NEW] Complete Wolf Commander powers.** Acceptance: address, composition, target manipulation, amnesty, attack dial, and boarding each have separate phase/authority/audit contracts.
- **Prompt 521a — [NEW] Resolve the Wolf Commander address.** Acceptance: the assigned Commander can deliver the permitted fleet message with one attributable event and no hidden composition leak.
- **Prompt 521b — [DECISION] Resolve Wolf Commander amnesty.** Acceptance: the offer, responses, deadline, and facilitator consequence are explicit private/public records rather than an invented automatic bargain.
- **Prompt 522 — [REPAIR] Model one-facilitator ownership with optional GM lanes.** Acceptance: one authorized GM can own both printed responsibilities and the complete next-action queue; additional GMs may claim/share/handoff optional lanes, private views, and calls without over-broad reads, readiness coupling, or stale-instance deadlock.
- **Prompt 523 — [DECISION] Record facilitator rule calls.** Acceptance: ambiguity, source, decision, actor, timestamp, audience, and supersession are durable and distinguishable from random rules results.
- **Prompt 523a — [DECISION] Configure Wolf Attack difficulty.** Acceptance: facilitators adjust frequency/size through bounded pre-attack choices and the player UI cannot mutate the dial.
- **Prompt 523b — [DECISION] Configure Crisis difficulty.** Acceptance: facilitators increase or decrease crisis pressure through explicit delivery decisions with no hidden client rule change.
- **Prompt 523c — [DECISION] Configure emergency-jump severity.** Acceptance: the facilitator selects among documented consequences before resolution and the result is labeled as adjudication.
- **Prompt 524 — [PROVE] Run the complete Wolf-and-deduction scenario.** Acceptance: sabotage, clues, investigation, arrest, replacement, attack prep, all five steps, boarding, damage, salvage, repair, and aftermath complete without leaks.
- **Prompt 524a — [NEW] Track political capital.** Acceptance: President-authorized gains/spends produce a nonnegative server ledger linked to crisis outcomes and no client can edit the balance.
- **Prompt 524b — [NEW] Resolve the President's address.** Acceptance: the configured address occurs at its printed timing, reaches the fleet once, and records any political-capital effect.
- **Prompt 524c — [NEW] Resolve a presidential visit.** Acceptance: verified Team Time presence at one ship creates only the printed benefit and cannot be forged from a route selection.
- **Prompt 524d — [NEW] Enforce presidential authority boundaries.** Acceptance: fleet leadership and crisis powers never grant arbitrary ship resources, hidden information, or GM mutations.

#### Crises, catastrophe, candidates, and Capybara integration (Prompts 525–585)
- **Prompt 525 — [NEW] Create the crisis state machine.** Acceptance: draft, delivered, debated, resolved, escalated, announced, and closed states have facilitator authority and audience-safe events.
- **Prompt 526 — [NEW] Gate crises by configuration.** Acceptance: President-dependent and loyalty-dependent crises cannot appear in an incompatible roster without an explicit facilitator override.
- **Prompt 527 — [NEW] Deliver Approaching Vessel.** Acceptance: players receive the scouting-vessel report while trap/reality state and difficulty reasoning remain facilitator-private.
- **Prompt 528 — [DECISION] Resolve Approaching Vessel choices.** Acceptance: leave, wait, prepare, aid, or other facilitator-recorded response updates timing and pressure without a client-invented consequence.
- **Prompt 529 — [NEW] Integrate Voyage 33-0 arrival.** Acceptance: accepting the vessel activates its people, needs, maintenance, docking, and motivated-role hooks exactly once.
- **Prompt 530 — [NEW] Deliver Disease Outbreak.** Acceptance: affected ships, work restrictions, escalation risk, and facilitator notes reach only permitted readers.
- **Prompt 531 — [NEW] Resolve quarantine policy.** Acceptance: binding choices preserve communication, restrict docking to one shuttle per turn, and remain reversible only by authority.
- **Prompt 532 — [NEW] Deliver Religious Zealotry.** Acceptance: the crisis appears only with a compatible Universal Arbour/Cult configuration and preserves secret alignment.
- **Prompt 533 — [DECISION] Resolve zealotry responses.** Acceptance: leave, pressure, investigate, or arrest is recorded as an explicit facilitator outcome linked to the social-deduction loop.
- **Prompt 534 — [NEW] Deliver Civil Unrest.** Acceptance: named affected teams can submit their own grievances privately or publicly without the app inventing sentiment.
- **Prompt 535 — [DECISION] Resolve Civil Unrest.** Acceptance: the President/facilitator response and consequence are attributable, audience-safe, and do not impersonate deterministic rules.
- **Prompt 536 — [NEW] Deliver Presidential Election.** Acceptance: the crisis is available only with the President and declares that voting method, timing, and campaign rules need decisions.
- **Prompt 537 — [DECISION] Configure election procedure.** Acceptance: facilitator records eligible voters, voting system, population weighting, timing, campaigning, and supply-use rules before ballots open.
- **Prompt 538 — [NEW] Resolve the election privately.** Acceptance: authorized ballots are counted once, secret votes remain private, and the chosen President/Vice President transition is auditable.
- **Prompt 539 — [NEW] Announce binding resolutions at Team start.** Acceptance: new laws and formal crisis outcomes publish exactly at the next Team Phase while informal decisions remain unforced.
- **Prompt 540 — [PROVE] Run the full crisis scenario.** Acceptance: all five crises reach a legal outcome/escalation, role and phase gates hold, and reconnect preserves every unresolved decision.
- **Prompt 541 — [NEW] Reveal a New Eden candidate.** Acceptance: an entitled discovery exposes N, O, or P to the correct group without leaking organiser-chart facts.
- **Prompt 542 — [NEW] Make candidate discovery retry-safe.** Acceptance: repeated submissions return one record without duplicate pursuit, mission, or event effects.
- **Prompt 543 — [NEW] Track candidate plans by Turn 6.** Acceptance: facilitators see plan status and players receive only the agreed summary or encouragement.
- **Prompt 544 — [NEW] Validate Ancient Jump Ring prerequisites.** Acceptance: N reports missing ten materials, one Engineering Shuttle, and five distinct four-cross upgrades/devices accurately.
- **Prompt 545 — [NEW] Repair the Ancient Jump Ring.** Acceptance: valid materials, research contributions, shuttle, actor, and state commit once.
- **Prompt 546 — [NEW] Prevent duplicate Ring contributions.** Acceptance: no upgrade, device, material, shuttle, or request can satisfy the checklist twice.
- **Prompt 547 — [NEW] Fuel each Ring passage.** Acceptance: every attempting ship spends five of its authoritative fuel independently; unfuelled ships remain with a reason.
- **Prompt 548 — [NEW] Resolve Ring passage.** Acceptance: each eligible ship crosses once and the opposite-side sabotage remains a labeled facilitator action.
- **Prompt 549 — [NEW] Record blocked Wolf pursuit through the Ring.** Acceptance: authorized sabotage creates the candidate-specific outcome and no ordinary client can claim it.
- **Prompt 550 — [NEW] Accumulate Deep Nebula scouting.** Acceptance: every qualifying scout increments a hidden modifier once and players cannot read the total.
- **Prompt 551 — [NEW] Attempt a Deep Nebula jump.** Acceptance: one ship makes a long jump using server dice, hidden scout modifier, and prior-loss bonus.
- **Prompt 552 — [NEW] Lose a ship in the Deep Nebula.** Acceptance: failure marks it lost, removes active actions, preserves consequences, and adds one later-ship bonus.
- **Prompt 553 — [DECISION] Reach the Deep Nebula threshold.** Acceptance: a total of 9+ creates the chosen durable success state under the recorded fleet-success policy.
- **Prompt 554 — [NEW] Prevent repeat Nebula attempts.** Acceptance: a successful, lost, or same-turn ship receives its original result without another roll or fuel spend.
- **Prompt 555 — [NEW] Trigger Ancient Space Station arrival combat.** Acceptance: P starts at least one Battlestation plus 20 other damage capacity from private authority.
- **Prompt 556 — [NEW] Repeat Station combat while Wolves survive.** Acceptance: the candidate cannot advance and required attacks continue until authoritative threat state is empty.
- **Prompt 557 — [NEW] Liberate the Ancient Space Station.** Acceptance: all required Wolves destroyed changes P to liberated exactly once.
- **Prompt 558 — [NEW] Validate Station Reactor contributions.** Acceptance: at least 18 available charge capacity is counted and no Reactor, lost ship, or contribution is used twice.
- **Prompt 559 — [NEW] Power New Eden Station.** Acceptance: valid contributions rename/activate the station and publish its candidate-specific defence result.
- **Prompt 560 — [NEW] Freeze play at pursuit failure.** Acceptance: pursuit 10 creates one terminal result and every normal gameplay callable rejects afterward.
- **Prompt 561 — [NEW] Distinguish total fleet loss.** Acceptance: all usable ships lost/destroyed creates its own outcome while remaining players, pods, and shuttles stay readable.
- **Prompt 562 — [NEW] Aggregate real survivor outcomes.** Acceptance: the server totals ship populations, evacuations, pods, lost/destroyed ships, and final survivors from authoritative ledgers and excludes any theatrical announcement-only population adjustment.
- **Prompt 563 — [NEW] Explain candidate results.** Acceptance: debrief shows path, met/unmet prerequisites, rolls, losses, and facilitator calls without private-loyalty leakage.
- **Prompt 564 — [NEW] Enter debrief once.** Acceptance: success/failure freezes actions and creates one immutable outcome despite concurrent close requests.
- **Prompt 565 — [NEW] Close the session authoritatively.** Acceptance: the server transitions from readable debrief to closed retention without losing permitted history.
- **Prompt 566 — [NEW] Read debrief after closure.** Acceptance: members regain the outcome and allowed audit while loyalties, hidden chart, cards, and notes keep their privacy policy.
- **Prompt 567 — [PROVE] Reverify Capybara mode selection.** Acceptance: base-only, base extras, or crewed expansion remains immutable and no route/catalog conflates the two Capybaras.
- **Prompt 568 — [NEW] Isolate Scrap reads and writes.** Acceptance: only enabled Capybara, Macaw, and Boa ledgers can create, carry, or spend Scrap.
- **Prompt 569 — [NEW] Cast Capybara Captain and Recycler.** Acceptance: both roles appear atomically and exactly once in the source-authoritative 8–20 expansion roster with private briefs and distinct authority; neither optional Press nor any GM instance consumes or substitutes for them.
- **Prompt 570 — [NEW] Apply d8 Capybara targeting.** Acceptance: 7 selects the full ship, 8 rerolls, and base d6 sessions never target the hybrid.
- **Prompt 571 — [PROVE] Run full Capybara maintenance.** Acceptance: steps 1–6, rations, population, three charges, storage, production, bay, and jump all resolve in order.
- **Prompt 572 — [NEW] Resolve Capybara population thresholds.** Acceptance: exact discrete values swap ration tables and population zero adds two unrest once.
- **Prompt 573 — [DECISION] Resolve Capybara damage cards.** Acceptance: its own deck and rendered-authority 7♠ Scrap Refinery decision remain authoritative; only the empty-deck behavior remains a recorded ambiguity, with the hidden extracted 5♦ excluded from gameplay.
- **Prompt 574 — [NEW] Resolve Macaw refuelling.** Acceptance: only Team-docked Macaw can consume the single bay choice and unused fuel expires.
- **Prompt 575 — [NEW] Resolve Macaw repairs.** Acceptance: one Scrap repairs each of up to two consoles, with fuel permitting a second eligible ship.
- **Prompt 576 — [DECISION] Resolve Macaw salvage dismantling.** Acceptance: target permission and the recorded self-dismantling policy govern deliberate damage and Scrap gain.
- **Prompt 577 — [NEW] Resolve Macaw cargo.** Acceptance: ore, fuel, food, water, material, Scrap, and security teams transfer only between legal docked inventories.
- **Prompt 578 — [NEW] Resolve Boa recycling.** Acceptance: each of the five printed exchange recipes yields one Scrap, no more than twice per turn, atomically.
- **Prompt 579 — [NEW] Resolve Boa reclamation.** Acceptance: one pre-deal opportunity halves difficulty, replaces reward with one Scrap, and grants no critical bonus.
- **Prompt 580 — [DECISION] Resolve Boa combat ambiguity.** Acceptance: each range Scrap attack follows the recorded policy for destroyed/invalid targets and never spends on denial.
- **Prompt 581 — [NEW] Create post-damage Scrap pickups.** Acceptance: each ship taking at least three attack damage yields exactly one collectible Scrap per attack.
- **Prompt 582 — [NEW] Expose Capybara objectives privately.** Acceptance: Captain and Recycler see their distinct duties and shared S.A.N. goal without broad brief access.
- **Prompt 583 — [DECISION] Apply the Capybara balance dial.** Acceptance: facilitators see the documented +6 attack-capacity consideration as guidance, never an automatic hidden mutation; Press occupancy and the number of GM instances do not alter it.
- **Prompt 584 — [PROVE] Run the Capybara vertical scenario.** Acceptance: a 20-player core cast, maintenance, production, one bay, Macaw, Boa, Scrap, d8 targeting, combat, mission, jump, and reconnect work end to end, with an enabled optional twenty-first Press role remaining independent.
- **Prompt 585 — [PROVE] Run the base/expansion isolation scenario.** Acceptance: identical display names cannot cross-load roles, stores, damage, jump, targeting, or craft behavior; toggling Press and connecting multiple GM instances cannot change either roster or its readiness, loyalty, and Wolf math.

#### Onboarding, help, settings, and operational truth (Prompts 586–600)
- **Prompt 586 — [EXTEND] Build the roster configuration flow.** Acceptance: setup presents only supported counts/options and explains Dione, Union, Wolf, and expansion effects before lock.
- **Prompt 587 — [EXTEND] Present private casting assignments.** Acceptance: players see only their ship, role, device mode, and allowed route; facilitators see the complete roster.
- **Prompt 588 — [EXTEND] Present private loyalty assignment.** Acceptance: the entitled player sees exact card/suspicion and unrelated clients receive no serialized secret.
- **Prompt 589 — [EXTEND] Teach the table ground rules.** Acceptance: onboarding covers private briefs, no out-of-game communication/photos, Wolf humanity, and resource components with exact approved copy.
- **Prompt 589a — [PRESERVE] Audit the motion-safety gate.** Acceptance: every browser is blocked until normal or reduced motion is chosen, the choice applies globally, and a fresh acknowledgement is required after 24 hours.
- **Prompt 589b — [REPAIR] Simplify the authenticated-session waiver's human-first copy.** Acceptance: the human-first regulation body is owned only by the authenticated-session waiver and is exactly `Be bold. Remember the human on the other side.` with that casing and punctuation. Preserve the gate's title/eyebrow, acknowledgement lifetime, checkbox and focus semantics, reconnect/resume behavior, audit/privacy boundary, and distinction from GM access expiry; do not duplicate the live sentence into debrief or rewrite historical changelog evidence. Prove exact accessible copy and complete responsive text at 320×844, 390×844, 1440×900, and 844×390.
- **Prompt 590 — [EXTEND] Teach the core game loop.** Acceptance: help explains Team, Coordination, pursuit failure, jump announcements, attack docking, and away missions without unsupported mechanics.
- **Prompt 591 — [EXTEND] Show vessel-specific maintenance help.** Acceptance: the active ship sees its exact numbered steps, rations, unrest, damage, charging, and fuel expiry.
- **Prompt 592 — [EXTEND] Show craft-specific help.** Acceptance: each shuttle/fighter shows only its printed owner, fuel, cargo, phase, combat, mission, and action rules.
- **Prompt 593 — [EXTEND] Show candidate preparation help.** Acceptance: N, O, and P requirements remain distinct and no hidden location, bonus, or Wolf state leaks.
- **Prompt 594 — [EXTEND] Label facilitator decisions.** Acceptance: every adjudicated result visibly names the decision source, actor, and time rather than posing as rules automation.
- **Prompt 595 — [PRESERVE] Display the derived application version.** Acceptance: Settings reads runtime package metadata and never carries a handwritten version.
- **Prompt 596 — [PRESERVE] Display bounded changelog history.** Acceptance: newest player-facing entry appears first in an independently scrollable accessible region.
- **Prompt 597 — [PRESERVE] Complete exact disconnect confirmation.** Acceptance: danger styling and the required two-step `ARE YOU SURE?` flow queue presence cleanup, clear local state, and reach landing.
- **Prompt 598 — [REPAIR] Explain connectivity truthfully.** Acceptance: repair the stale default/Turn-0 copy contract so connected, offline, stale, pending, denied, retrying, and closed states derive from real signals; the no-session default remains exactly `CONNECTED`, while a live joined Turn 0 session says exactly `CONNECTED — AWAITING IRIS AUTHENTICATION` in its visible copy and accessible name/title. `NOT CONNECTED` never describes live transport or session state. Preserve the blue boot-gate if desired and the 30-second sustained-pre-outage grace.
- **Prompt 599 — [EXTEND] Build the single-facilitator setup checklist.** Acceptance: one complete checklist tracks both printed responsibilities, room/components, chart, casting, loyalties, automatic setup math, and readiness without mutating gameplay; optional additional-GM lane assignments remain collaborative and nonblocking.
- **Prompt 600 — [PROVE] Run the onboarding-to-first-action scenario.** Acceptance: a new player acknowledges safety, joins, receives private assignments, learns the loop, enters the right route, completes one real action, and returns.

#### Accessibility, resilience, security, capacity, and release proof (Prompts 601–651)
- **Prompt 601 — [EXTEND] Make primary status universal.** Acceptance: every player, role, ship, shuttle, observer, GM, mission, attack, and debrief route names turn, phase, location, authority, next action, and failure state.
- **Prompt 602 — [PROVE] Prove return navigation everywhere.** Acceptance: every nonlanding route has a visible keyboard-accessible logical return that preserves state unless explicitly released.
- **Prompt 602a — [REPAIR] Restore shuttle-to-associated-ship return navigation.** Acceptance: audit current `ShuttleConsole`, `ShuttleConsoleTemplate`, shuttle/role/docking catalogs, route policy, tests, responsive styles, and the history around `d259cb0`, `9009807`, `dced782`, and `3299767`; if a prior generic return exists, preserve it as the design baseline. Every entitled ordinary shuttle console exposes one explicit visible return to its deterministic associated ship console, resolved from authoritative docking/association state and canonical route helpers rather than a client guess. If no entitled target exists, return safely to the established role-selection parent instead of inventing a ship. Navigation preserves session, seat, active console, shuttle state, and pending authoritative work; it does not release authority or mutate gameplay. Direct deep links, reconnect hydration, browser Back/Forward, and route replacement converge on the same permitted target without loops or cross-ship access. Preserve Press's `Back to Independent Stations`, Joint Engineering's Union return, and GM leave behavior as distinct cases. The control has an exact accessible name, visible focus, at least 44px target, screen-reader semantics, and nonoverlapping placement on mobile and short landscape; reduced motion removes decorative transition only. Add chronological route/entitlement/state/reconnect/history regression tests and real viewport proof before marking the universal Prompt 602 complete.
- **Prompt 603 — [EXTEND] Make ship consoles work on narrow phones.** Acceptance: maintenance order, stores, damage, status, and primary action remain readable without clipped critical content.
- **Prompt 603a — [REPAIR] Keep the mobile session ticket out of routed content.** Acceptance: audit the shared `SessionReadouts` session-code badge (the session ticket), `AppHeader`, `RoleSelect`, safe-area offsets, measured `--app-header-height`, responsive breakpoints, and the history beginning at `54f4409` and `b668e2a` before changing layout. At 320×844, 390×844, and 844×390, the ticket's occupied rectangle never intersects the Role Select intro, cards, labels, controls, focus outlines, or any other viewport element; surrounding content must move or reflow around the ticket instead of hiding beneath it, clipping, being covered by z-index, or depending on transparent overlap. The same spatial contract survives connected-player/rank/connection/settings variants, safe-area insets, long localized labels, keyboard focus, 44px touch targets, rotation, and reduced motion. Add a failing geometry regression that proves the current overlap and a real-browser composed route review; preserve shared session chrome and Role Select navigation rather than creating a route-specific duplicate ticket.
- **Prompt 604 — [EXTEND] Make maintenance work in short landscape.** Acceptance: every step and result is reachable with intentional scrolling and no obscured control.
- **Prompt 605 — [EXTEND] Make DRADIS responsive.** Acceptance: group-local ships, transit samples, parked craft, and hidden contacts remain truthful across supported orientations and sizes; every complete visible contact name stays inside the DRADIS viewport at every supported edge, orientation, and motion preference.
- **Prompt 605a — [DEFERRED-OWNER] Visualize Wolf attacks on DRADIS.** Acceptance: only after Prompt 433a endpoint/schema/privacy proofs and explicit owner approval, render attack source, targets, phases, ranges, bearings, effects, and outcomes from the authoritative projection without changing current contact privacy or inventing telemetry. This visualization is intentionally excluded from, and cannot block, the playable Wolf-attack exit gate.
- **Prompt 606 — [EXTEND] Make shuttle travel touch-operable.** Acceptance: departure, destination, retarget, dock, park, and denial use 44px targets without hover or precision drag.
- **Prompt 607 — [EXTEND] Make jump controls keyboard-complete.** Acceptance: digit editing, lock, power rail alternative, submission, pending, denial, success, and recovery work without a pointer.
- **Prompt 608 — [EXTEND] Own dialog focus correctly.** Acceptance: settings, danger confirmations, private results, facilitator calls, and endgame dialogs trap/restore focus and announce purpose.
- **Prompt 609 — [EXTEND] Announce live changes once.** Acceptance: phase, attack, parking, denial, threshold, and ending updates use appropriate live regions without listener-repeat noise.
- **Prompt 610 — [EXTEND] Honor reduced motion globally.** Acceptance: all authoritative information remains while flashes, sweeps, transitions, and continuous effects are removed or reduced.
- **Prompt 611 — [EXTEND] Distinguish status without color alone.** Acceptance: danger, damage, privacy, offline, pending, and success use text/icon semantics and verified CIC contrast. In particular, minimized/compact and expanded DRADIS both expose a stable non-color `RED ALERT` text/icon cue derived from authoritative `fleetRedAlert`; activation, stand-down, reconnect, replay, late join, stale cache, rotation, and reduced motion cannot leave a false or color-only alert. Prove keyboard/screen-reader semantics and unobscured placement at 320×844, 390×844, 1440×900, and 844×390 without expanding P605a's deferred attack visualization.
- **Prompt 611a — [REPAIR] Repair CIC status typography without redesign.** Acceptance: characterize the exact rendered `CONSOLE ACCESS // WRITE // CREW INCOMPLETE` surface and other directly comparable label/readout outliers, then make only proven inconsistencies use the named CIC mono type, tracking, casing, contrast, and wrapping tokens. Preserve copy ownership, semantic heading order, long-label accessibility, normal/reduced motion, safe-area/rotation behavior, and 320×844, 390×844, 1440×900, and 844×390 containment; do not introduce a global type scale, broad recasing, or visual redesign.
- **Prompt 612 — [PRESERVE] Render a persisted snapshot before resume.** Acceptance: the last permitted view appears promptly with a stale marker and cannot authorize actions.
- **Prompt 613 — [PRESERVE] Clear invalid persisted sessions.** Acceptance: not-found, permission-denied, and failed-precondition clear stale identity/route state while transient failures preserve recoverability.
- **Prompt 614 — [PRESERVE] Reconcile presence leases under load.** Acceptance: cadence and expiry retain current ownership and never release another device's seat.
- **Prompt 615 — [PRESERVE] Reclaim returning seats safely.** Acceptance: a valid open intent is restored, while a seat taken by someone else remains untouched.
- **Prompt 616 — [PRESERVE] Make disconnect replay-safe.** Acceptance: queued cleanup acknowledges once, expires correctly, and clears local data only under the documented policy.
- **Prompt 617 — [PRESERVE] Reconcile the command outbox.** Acceptance: pending commands expire/reconcile against authority and irreversible actions never duplicate after reconnect.
- **Prompt 618 — [EXTEND] Reconnect every live projection.** Acceptance: session, player, seat, role, ship, shuttle, group, mission, attack, candidate, and debrief listeners replace cache correctly.
- **Prompt 619 — [EXTEND] Make candidate retries survive reconnect.** Acceptance: N/O/P actions return original fuel, roll, loss, contribution, and outcome results without duplicates.
- **Prompt 620 — [EXTEND] Recover from stale revisions.** Acceptance: conflict responses carry enough fresh nonsecret state to retry safely while preserving local input where appropriate.
- **Prompt 621 — [EXTEND] Recover during a Wolf attack.** Acceptance: a participant resumes at the current step with resolved actions locked and permitted pending actions intact.
- **Prompt 622 — [EXTEND] Recover during an away mission.** Acceptance: each participant regains only their private hand/choices and the current public mission state.
- **Prompt 623 — [EXTEND] Preserve PWA deep links.** Acceptance: static-host reload restores an allowed authenticated hash route or returns safely to landing.
- **Prompt 624 — [EXTEND] Update the service worker safely.** Acceptance: a new shell cannot evict authoritative state or strand an active session, and update messaging is nonblocking.
- **Prompt 625 — [EXTEND] Enforce App Check on mutations.** Acceptance: production callables reject missing/invalid tokens while emulator behavior remains explicit and does not weaken deployment.
- **Prompt 626 — [EXTEND] Deny unauthenticated and nonmember reads.** Acceptance: session/game/private collections remain unreadable and unlistable outside membership.
- **Prompt 627 — [EXTEND] Deny all direct gameplay writes.** Acceptance: clients cannot mutate seats, roles, secrets, events, stores, movement, damage, missions, attacks, candidates, or outcomes.
- **Prompt 628 — [EXTEND] Enforce GM-instance authority everywhere.** Acceptance: every privileged command checks active eligibility, role, instance, expiry, and scope; Observer remains read-only by default.
- **Prompt 629 — [EXTEND] Protect private projections comprehensively.** Acceptance: loyalty, Wolf identity, organiser chart, mission hands, hidden rolls/bonuses, and notes reach only entitled readers.
- **Prompt 630 — [PROVE] Prove server-owned randomness.** Acceptance: dice, cards, decks, compositions, clues, accuracy, and uncertain outcomes ignore any client-supplied result.
- **Prompt 631 — [EXTEND] Rate-limit expensive callables.** Acceptance: identity/session-aware limits contain abuse without breaking legitimate same-table retries or shared-network users.
- **Prompt 632 — [EXTEND] Reject malformed and oversized payloads.** Acceptance: coordinates, IDs, quantities, arrays, messages, notes, and idempotency keys fail schema bounds before transactions.
- **Prompt 633 — [EXTEND] Return safe retry guidance.** Acceptance: throttled, unavailable, and contended commands expose actionable timing/status without secrets or duplicate-action risk.
- **Prompt 634 — [EXTEND] Record security denials privately.** Acceptance: auth, App Check, schema, and rate-limit failures produce useful telemetry without credentials, hands, loyalties, or note bodies.
- **Prompt 635 — [EXTEND] Standardize action audit records.** Acceptance: actor, session, action, phase, request, revision, outcome, random/facilitator source, and redaction policy are queryable.
- **Prompt 636 — [PROVE] Measure callable and snapshot health.** Acceptance: latency, listener delay, retries, denials, 429/unavailable responses, and contention have privacy-safe metrics.
- **Prompt 637 — [PROVE] Establish render-performance baselines.** Acceptance: landing bundle, route startup, DRADIS, attack updates, mission hands, and mobile frame behavior have measured thresholds.
- **Prompt 638 — [EXTEND] Support and exercise the 20-player core target.** Acceptance: align authoritative session validation, the source-authoritative 8–20 Capybara roster, Wolf/vessel setup, client configuration, and start transactions, then record one deterministic 20-player expansion run covering join, cast, heartbeat, listeners, a real action, and reconnect with one facilitator. Repeat with enabled and claimed Press as a twenty-first player-role holder plus multiple simultaneous authorized GMs; Press and GM occupancy must not change core readiness, loyalty, Wolf, or capacity math, and the evidence must not claim support before the measured run passes.
- **Prompt 639 — [PROVE] Exercise the 60-browser target.** Acceptance: a committed repeatable capacity command runs an isolated 15-minute production-shaped scenario and records the tested commit/environment, heartbeats, listeners, concurrent real actions, contention, reconnect, 429/unavailable recovery, latency/error thresholds, usage, and cost in a reviewable artifact.
- **Prompt 640 — [PROVE] Publish capacity conclusions.** Acceptance: supported envelope, failed thresholds, retry guidance, cost, and follow-up work reflect measurements rather than the nominal target.
- **Prompt 641 — [PROVE] Run a complete base-game playthrough.** Acceptance: six core ships and one facilitator progress from lobby through maintenance, jump, scout, mission, combat, deduction, crisis, and debrief without manual arithmetic or transcription; repeat the mutation races with optional additional GMs.
- **Prompt 642 — [PROVE] Run a complete Capybara playthrough.** Acceptance: one facilitator runs both roles, Scrap, Macaw, Boa, d8 targeting, mission, combat, jump, and one candidate path; optional Press remains independent and an additional-GM race cannot double-mutate.
- **Prompt 643 — [PROVE] Run a complete split-fleet playthrough.** Acceptance: independent jumps, contacts, communications, pursuit, taxi, local actions, rejoin, and failure recovery remain correct.
- **Prompt 644 — [PROVE] Run a complete shuttle-airspace playthrough.** Acceptance: every craft type travels, docks, transfers/acts, appears through the current DRADIS contact contract, parks under each restriction, and recovers after reconnect; the proof consumes attack state but does not add the owner-deferred Wolf-attack visualization.
- **Prompt 645 — [PROVE] Run a complete Wolf attack playthrough.** Acceptance: private prep, targeting, all ranges, fighters, boarding, damage, casualties, salvage, repair, returning threats, and aftermath resolve.
- **Prompt 646 — [PROVE] Run a complete away-mission playthrough.** Acceptance: eligibility, private cards, distribution, discards, placement, bonuses, totals, rewards, failure, overrun, drop-off, and reconnect resolve.
- **Prompt 647 — [PROVE] Prove Ancient Jump Ring success.** Acceptance: discovery, research, repair, contribution uniqueness, per-ship fuel, passage, sabotage call, and debrief complete.
- **Prompt 648 — [PROVE] Prove Deep Nebula success and loss.** Acceptance: hidden scout bonus, one lost ship, later bonus, one successful ship, fleet-success policy, and debrief complete.
- **Prompt 649 — [PROVE] Prove Ancient Space Station success.** Acceptance: arrival pressure, repeated attacks, liberation, 18 Reactor power, activation, and debrief complete.
- **Prompt 650 — [PROVE] Prove authoritative terminal failure and recovery paths.** Acceptance: server-owned pursuit 10, total loss, destroyed ship, escape pods, evacuation, mutiny, arrest deadline, abandoned candidate, and unresolved call cannot orphan play; a client-only `GAME OVER` label or presentation state is not terminal authority.
- **Prompt 651 — [PROVE] Run the final release-readiness audit.** Acceptance: aggregate current prompt and milestone evidence; all roles, vessels, craft, candidate paths, privacy, accessibility, resilience, security, capacity, version, changelog, and docs gates are green; the final executable gates pass and no placeholder control remains, without manually repeating every earlier review.
- **Prompt 652 — [EXTEND] Prevent FleetTicker messages from overlapping.** Acceptance: when standing/broadcast copy changes, outgoing text drains and queued replacement enters without two strings covering each other; urgent FleetBroadcast precedence and replacement ordering remain intact; rapid updates serialize without duplicate tracks; screen-reader announcements are not duplicated; reduced-motion mode remains readable; and narrow phone, wide desktop, and short landscape layouts show one legible lane with no overlap/clipping.
- **Prompt 652a — [REPAIR] Keep every moving ticker glyph visible through its real exit.** Acceptance: restore `a91a020`'s continuous visible-tail baseline so a Red Alert group keeps every glyph, including its final painted bounds, fully visible until actually outside the viewport; audit `080457e` and later measured-copy/window geometry before changing code. Replacement, dismissal, stand-down, font load, resize/rotation, and authoritative P106c updates cannot cause nested clipping, fade, truncation, early unmount, remeasurement jump, or overlap. Preserve one constant linear speed, discard only unentered repetitions, announce each identity once, provide a readable reduced-motion equivalent, and prove exact boundary geometry at 320×844, 390×844, 1440×900, and 844×390.
- **Prompt 652b — [NEW] Keep the mobile Press ticker pinned with reversible hiding and alert expansion.** Acceptance: On narrow-width viewports, keep the Press ticker pinned to the top from initial render and throughout scrolling, using the established responsive breakpoint and safe-area layout. Provide an accessible narrow-only hide/reveal button that collapses the ticker while leaving a reachable reveal control. A new authoritative Red Alert broadcast or airspace-restriction change temporarily expands a hidden ticker with an expansion animation; after that notification finishes its complete display, animate it back to the hidden state only if the user has not chosen to reveal it. Repeated or overlapping notifications must not refold early, replay duplicate expansion, lose announcements, or clip the moving tail. Crossing into a wide viewport forces the ticker visible, resets hidden state, and removes the hide/reveal option from visual and keyboard/accessibility navigation; wide viewports cannot hide it. Reserve and update layout space during expansion, folding, resize, rotation, keyboard and safe-area changes so the ticker and reveal control never overlap content, focus, session ticket, or Role Select. Preserve authoritative message lifecycle, non-GM DRADIS behavior, and the existing wide-screen presentation; reduced motion uses equivalent immediate state changes and readable announcements. Prove scroll-top and scrolled states, manual hide/reveal, each automatic trigger, overlapping broadcasts, refolding, narrow-wide-narrow resize, live updates/reconnect, keyboard/screen-reader operation, and nonoverlap at 320×844, 390×844, 844×390, and 1440×900.
- **Prompt 653 — [EXTEND] Remove the ICN/Iris fleet-wide console lock.** Acceptance: for an authenticated entitled session member, the ICN/Iris authentication flag no longer imposes a global lock on any fleet ship/role console; controls are available whenever their existing specific role, phase, session, damage, resource, cooldown, GM-instance, and safety-confirmation rules permit. Remove the obsolete fleet-wide lockout UI state and `AEGIS // CONSOLES LOCKED OUT UNTIL IRIS AUTHENTICATION IS COMPLETE` standing/ticker/broadcast copy in that future slice, including reconnect/cache behavior, without weakening callable/server authority or enabling pre-session/unauthorized actions. Require failing-first server/client/route/ticker tests, accessible truthful status, supported viewport/reduced-motion review if UI changes, version/changelog, and full release gates.
- **Prompt 654 — [REPAIR] Start production after a confirmed roster without treating unfilled roles as a blocker.** Acceptance: an authenticated active facilitator with a valid confirmed canonical setup can authoritatively start exactly once with zero, partial, or full role occupancy; unfilled roles are never blockers. Reject only genuine missing or invalid tuple, lifecycle/revision/closed/authority/malformed/unavailable server-result blockers with a stable nonsecret reason; never fabricate a role, player, or loyalty and never accept client randomness. Define an owner-approved server outcome for zero eligible Wolf/private-loyalty holders. After confirmation the existing start control is enabled and accessible, and role status names the actual blocker rather than stale `Start blocked // confirm...` copy. Preserve focus, 44px targets, reduced motion, and mobile CIC behavior. This repair supersedes the retired Prompt 071 acceptance and depends on Milestone 1; later server, client, UI, and security tests must replace the old missing-role blockers.
- **Prompt 655 — [REPAIR] Restore the Press evidence-shredder docked-cockpit warning.** Acceptance: exact visible and accessible copy states firing sends `SHREDDED EVIDENCE INTO COCKPITS OF DOCKED SHIPS AS WELL`. Preserve server targeting of docked SNN to SNN plus the authoritative host only, undocked SNN to SNN only, no client-selected or unrelated target, no ordinary GM event, and no duplicate on replay or reconnect. Focus, live-region, reduced-motion, and responsive CIC semantics remain covered.
- **Prompt 656 — [REPAIR] Route an already-connected launcher to its current session.** Acceptance: cached, current, or resume-in-flight state at `/` never calls create or join; accessible reconnecting/stale state then resolves to the authoritative last route or `/roles`. Back, refresh, and reconnect converge; terminal denial clears only an established path while transient failure preserves recovery; an unexpected create race gives a truthful alert/link; and the launcher never auto-disconnects, releases, or mutates a session.
- **Prompt 657 — [REPAIR] Remove roadmap jargon from player-facing changelog history and future entries.** Acceptance: all rendered `CHANGELOG` changes have no case-insensitive standalone `prompt` or `prompts`; existing meaning and every numeric done/total percentage marker remain unchanged; internal `implementationPrompts` and other provenance terminology stays intact. Add a deterministic player-field-only guard plus focused copy/accessibility/layout regression coverage.
- **Prompt 658 — [POLISH] Use CIC language for seat-change confirmation when the page remains.** Acceptance: the retained `/roles` route shows the exact visible and accessible status text `SEAT CHANGES COMMIT THROUGH THE CIC.` while preserving authoritative seat ownership, retry/idempotency, stale/reconnect behavior, privacy, and existing layout/accessibility. If a future flow removes the page, remove this status with it rather than duplicating it elsewhere.
- **Prompt 659 — [PRESERVE] Enforce in-universe player-facing copy app-wide.** Acceptance: inventory reachable visible and accessible copy across screens, errors, toasts, onboarding, install/update surfaces, and changelog; distinguish internal/developer text; check in an approved CIC lexicon, known-forbidden jargon, and reviewed exceptions; and enforce it with a deterministic guard rather than prose judgment. Preserve meaning, security, localization, and accessibility. This prompt explicitly includes removing the rendered sentence `System reduced motion is off.` while preserving system-versus-effective reduced-motion behavior and meaningful remaining accessibility text.
- **Prompt 660 — [REPAIR] Make exact validation self-prepare a collision-safe emulator slot.** Acceptance: non-documentation exact validation with a missing local emulator config uses the existing atomic `auto` allocator, preserves an existing config, releases only configuration/reservation state it created on success or failure, and provides the exact actionable `emulators:configure -- auto` fallback. Add focused lifecycle/concurrency coverage without cross-worktree collisions.
- **Prompt 661 — [POLISH] Add a safe copy-only validation fast path.** Acceptance: an explicit, mechanically verified classification permits only static player-copy changes to run focused copy/accessibility checks plus lightweight lint/build/progress/diff gates without `test:all`; mixed or uncertain changes, including behavior/state/routing/ARIA structure/security/authority/localization/CSS/server/rules/config/version/release-infrastructure changes, force the full gate. The path cannot rely on self-attestation or bypass protection; document exact usage and add focused gate coverage.
- **Prompt 662 — [DECISION] Resolve ordinary-start Wolf designation policy.** Acceptance: current ordinary Setup intentionally has no manual designation under Prompts 054/075, but residual exported caller-controlled `assignWolves`, `assignWolfRoles`, `resetWolves`, and manual-assignment guards require an explicit owner-approved policy. Audit printed references, current UI, callables, guards, secrets, tests, and history. If automatic server assignment is retained, retire or strictly constrain residual manual/random endpoints and stale guards, clarify in-universe copy explaining when the server assigns Wolves, and prove locked-roster-derived count, private audience, replay/CAS, and unauthorized denial. If manual designation is chosen, require a separate bounded GM-only pre-start flow with roster-derived count/candidates, authoritative validation, audit/replay/CAS, secrecy, a11y, and rules denial. Do not silently choose between policies. Note overlaps/dependencies 054, 071, 075, 496, and 586–588. This is low priority/deferred and remains missing until the owner-approved policy and bounded acceptance are recorded.
- **Prompt 663 — [REPAIR] Make the AEGIS Fleetwide Red Alert button visible across layouts.** Acceptance: The Fleetwide Red Alert button in the AEGIS console is currently missing on most layouts. Audit its route, entitlement and responsive rendering, then make the authorized AEGIS Admiral trigger visible, discoverable, keyboard-accessible, and usable across supported layouts without hiding it behind clipping, overflow, overlays, or layout-dependent omission. Retain truthful disabled/pending states when existing action rules do not permit activation. Prove the actual composed AEGIS console at 320×844, 390×844, 844×390, and 1440×900, including viewport resizing, reduced motion, keyboard focus, minimum touch target, and unobscured placement. Preserve server-authoritative role, session, phase, callable and confirmation checks, direct client-write denial, private/audience boundaries, alert/stand-down behavior, and the accepted non-GM DRADIS rendering. Also retain the earlier requirement that the resulting Fleetwide Red Alert appears and remains usable in a normal browser. Existing text-only or isolated component assertions do not substitute for rendered route proof; leave this item missing until separately implemented.
- **Prompt 664 — [REPAIR] Enforce universal roadmap registration before non-documentation commits.** Acceptance: every commit that changes anything beyond the repository-defined Markdown/README documentation boundary ends with exactly one canonical `Implementation-Prompt:` trailer and is rejected unless that item exists with matching tag, status, checklist state, prerequisite readiness, and source-backed dependency evidence in the implementation plan, progress ledger, and dependency index. Work uncharted at its trusted `main` branch baseline must atomically add all three authority records with its first non-documentation commit; a complete documentation-only planning registration already landed on `main` may be consumed by branches started afterward. The same fail-closed validator runs in the tracked commit and push hooks, CI, coordination validation, and preserved/discarded closeout; it covers merge conflict resolutions, rejects untrusted range baselines, and leaves product release/version rules intact. Dependencies: Prompts 660 and 661 provide exact validation execution and the canonical documentation-only classification.
- **Prompt 665 — [EXTEND] Make session goals durable and machine-checked across coordination lifecycle.** Acceptance: `coordination:begin` requires explicit unchecked Markdown goals, including the exact immediate release objective, creates a deterministic ignored worktree-local artifact bound to the coordination entry, and preserves an immutable original goal identity/order/text representation. A supported `coordination:goals` wrap-up path records checked/unchecked outcomes and explanations; it must validate every outcome against the original and retain durable start/final comparison evidence in the coordination receipt without exposing unrelated goal text in status. `coordination:finish` fails closed when the working artifact is absent, malformed, un-compared, or identity/order/text-divergent; it cleans only the entry-owned artifact after every other finish gate succeeds and verifies absence before recording completion. Existing pre-feature P012/P014/P664 entries have an explicit `legacy-exempt` migration policy and durable comparison record; new entries always require the artifact. Add owner-only `coordination:park` and `coordination:resume`: parking requires an exact clean checkpoint SHA, blocker entry/claim evidence, and a concrete next action, retains fail-closed scopes/claims while suspending heartbeat requirements, and rejects other owner operations while parked; resume verifies worktree/branch/checkpoint continuity and refuses until the recorded active blocker/overlap clears. The top-level coordinator checkpoints and parks before interrupting idle agents, then resumes only after clearance; process pause/wake is not machine-enforceable by repository code, so the registry state remains the hard gate and no status/heartbeat polling loop is allowed. Add phase-specific durable model floors: Luna `max` for implementation and reconciliation/validation/merge/push/deployment, Terra `xhigh` for independent review, with same-role Luna→Terra→Sol escalation, monotonic tiers, loop detection, and a user-visible Sol explanation including the 10× Luna cost. Keep this slice non-feature: no application version, release fragment, or player-facing changelog change. Dependencies: Prompt 664 provides the universal registration gate and typed source-backed authority; Prompt 665 extends its coordination begin/finish lifecycle.
- **Prompt 666 — [EXTEND] Generate a compact deterministic dependency packet and worktree receipt.** Acceptance: provide one executable shared `coordination:dependencies` dispatcher whose parser is shared with the full integrity/readiness gate. Its default prompt packet is at most 80 lines and 12 KiB, with explicit `--full` and machine-readable `--json` modes, while preserving exact plan/progress/dependency parity, cycle detection, typed evidence provenance, and readiness enforcement. Fingerprint the exact current `main`, all three authority inputs, applicable milestone/contract/evidence inputs, and only relevant active coordination ownership. Write an atomic ignored worktree-local receipt bound to owner, worktree, branch, and prompt; reject missing, stale, malformed, symlinked, or mismatched receipts. Relevant scope/claim overlap invalidates the receipt, while unrelated ledger noise does not. Require the receipt at coordination begin, ownership amendment, and validation, with only the exact legacy P012/P014 migrations needed for already-active work. Replace mandatory giant-context dependency reading with a small stable policy plus the generated packet, keep guidance and CI drift checks aligned, and record old/new line count, byte count, and execution time. This is non-feature tooling only: no application version, release fragment, or player-facing changelog item. Dependencies: Prompt 665 supplies the durable coordination lifecycle that owns and validates the receipt.
- **Prompt 667 — [PROVE] Runtime threat-model rebaseline: session-code compromise and DDoS.** Acceptance: check in one canonical machine-readable threat-model manifest and a CI drift/mapping gate. Contributors and the build pipeline are trusted, but every contributor or agent output remains untrusted until the mandatory independent review receipt and release gate accept it; machine gates protect against mistakes, stale work, missing review, and regressions, not deliberate contributor, commit, or history forgery. Explicitly place malicious-contributor/history attacks out of scope and audit away repository-governance complexity whose sole purpose is that discarded threat, without weakening independent review or ordinary correctness gates. Treat an external attacker who obtains or guesses a session code as a hostile client and keep DDoS/resource exhaustion in scope. Inventory and prove the existing authoritative platform baseline first: Firebase Hosting's global CDN, reCAPTCHA Enterprise-backed Firebase App Check initialized before Firebase services in `src/lib/firebase.ts`, production `enforceAppCheck: true` and `maxInstances: 10` in the shared `functions/src/runtimeOptions.ts` callable options, Cloud Firestore App Check enforcement, and the `functions/src/joinCodeSecurity.ts` six-digit/non-enumerating/transactional-collision policy plus six-attempt-per-authenticated-identity ten-minute limiter. Map every in-scope session-code/resource-exhaustion vector to existing control IDs, configuration, and tests; fail on an unmapped gap or drift, and preserve server authority, authorization, replay resistance, privacy, and input validation. Do not duplicate, replace, or redesign an equivalent platform control without a demonstrated gap and explicit owner decision, and do not add speculative security scope. Prompt 667 changes no runtime/player-facing behavior or platform limits: any demonstrated entropy, throttling, cost/concurrency, observability, overload, or other runtime gap must become a separately registered feature prompt with owner-visible thresholds and the normal version, release-fragment, and player-facing changelog gates. Keep docs/code from silently reintroducing the out-of-scope malicious-contributor assumption; minimize new governance code and return promptly to product work. Dependencies: Prompt 665 supplies the durable reviewed coordination lifecycle; Prompt 667 does not block P012 or P014 and has no dependency on Prompt 666.
- **Prompt 668 — [POLISH] Render Write Mode Off as a shared button.** Acceptance: when Write Mode is off, its control is rendered as a shared button whose visual treatment and interaction match the rest of the UI, while preserving the existing write-mode permission and toggle guards, truthful off/on state, accessible name and pressed semantics, visible keyboard focus, minimum touch target, responsive layout, and reduced-motion behavior where applicable. Do not change authorization or write-mode policy.
- **Prompt 669 — [POLISH] Align the GM DRADIS console with ship-console DRADIS.** Acceptance: within the GM console only, make the DRADIS console visually and interactively match the current non-GM ship-console DRADIS accepted reference, reusing shared components or configuration where practical. Preserve every non-GM ship-console DRADIS appearance, behavior, accessibility, responsive layout, reduced-motion behavior, and server authority contract with regression proof; do not change non-GM DRADIS, authorization, or unrelated GM-console surfaces, and do not perform a broad DRADIS refactor.
- **Prompt 670 — [REPAIR] Allow authorized additional GMs to register from both surfaces.** Acceptance: after auditing the actual registration blocker, remove the unwanted lockout that prevents an authorized additional GM instance from being added through both the Role Select screen and the GM console. Existing authorized GM/session state, server-owned GM grant and instance identity, existing write/observer authority, stale and unauthorized claim denial, and safe idempotent replay handling remain intact; focused regressions cover both surfaces and prove that the repair does not grant arbitrary privilege or broadly relax authorization.
- **Prompt 671 — [POLISH] Align buttons across the fleet and application.** Acceptance: Audit button controls across the application and fleet consoles against the existing shared button design conventions, explicitly including Ship View Privacy controls `Hide Resource Stores` and `Hide Unrest and Population`. Repair inconsistent button styling, state presentation, keyboard focus, accessible names and toggle semantics, disabled/pending treatment, and touch targets using shared variants rather than a new visual system. Preserve each control's behavior, privacy settings, permissions, and server authority; preserve the accepted non-GM DRADIS appearance and behavior. Prove representative phone, desktop, short-landscape, and reduced-motion states. Coordinate with Prompt 668 so its Write Mode Off case is not implemented twice.
- **Prompt 672 — [POLISH] Show shuttle docking history in main ship consoles.** Acceptance: Make the shuttle docking history currently shown in the right sidebar available within the main ship consoles, reusing the existing authoritative history and shared presentation where practical. Preserve chronological ordering, live/reconnect updates, ship/session scoping, privacy and read permissions, and existing docking behavior without introducing client-owned history or duplicate events. Keep the existing sidebar usable unless a separately accepted design changes it. Verify populated, empty, and updated history with accessible readable layout at phone, desktop, and short-landscape sizes, reduced motion, and unchanged non-GM DRADIS behavior.
- **Prompt 673 — [POLISH] Mirror the galactic orientation compass on the ship navigation jump map.** Acceptance: Show the existing galactic orientation compass on the ship navigation jump map, matching its established labels, orientation, visual conventions, and map-coordinate meaning. Reuse the existing shared compass component or configuration where practical instead of maintaining divergent copies. Preserve jump-map coordinates, targets, zoom/pan and selection interactions, route access, and server-authoritative jump behavior. Do not change the reference compass or accepted non-GM DRADIS appearance and behavior. Verify compass alignment, readable nonoverlapping placement, and existing map controls at phone, desktop, and short-landscape sizes, with accessible semantics and reduced-motion behavior.
- **Prompt 674 — [REPAIR] Replace ship Observer roles with unobtrusive GM viewing and confirmed write access.** Acceptance: Remove the selectable ship Observer role while allowing an authorized GM to inspect ship consoles without claiming a player seat, altering player console ownership, or exposing the act of observation through player-visible console presence or notifications. Keep observation read-only by default. Provide a shared-style button labelled `GM ship console read write access`, with truthful read-only/read-write state; the first activation opens the standard red `Are you sure?` confirmation and a second explicit confirmation enables scoped GM intervention through existing server-authorized commands. Cancellation must not grant write access. Preserve GM eligibility, instance identity, expiry, scoped grant checks, server-only audit, and player privacy; revoke elevation on ship change or leaving the console, and do not enable player controls by local UI state alone. The owner requires no special behavior for an empty server; do not add an empty-server exception. Prove quiet read-only observation, confirmation/cancel, authorized intervention, unauthorized and stale-grant denial, multiple GM instances, role/route transitions, and accessible shared-button behavior across supported viewports. Coordinate with existing GM read-only and scoped-grant contracts rather than adding another parallel authority system.
- **Prompt 675 — [POLISH] Pause an empty session timer and resume when someone rejoins.** Acceptance: When authoritative session presence determines that everyone has disconnected, automatically pause a running session timer and persist its exact remaining time. As soon as the first authenticated participant rejoins, resume that automatically paused timer from the preserved remaining time, never restart its full duration. Use existing authoritative disconnect/expiry and reconnect paths rather than a browser-local clock or arbitrary new grace period. Track the automatic empty-session pause separately from a manual or emergency GM pause; rejoining must not undo a deliberate pause or resume a completed or closed phase/session. Serialize concurrent disconnects, rejoins, timer expiry, and manual pause changes so there is one transition and no duplicate time, skipped expiry, stale overwrite, or unauthorized mutation. All clients converge on the resumed server clock. Prove last-person disconnect, abrupt loss detection, first-person rejoin, multiple simultaneous rejoins, offline hydration, manual-pause preservation, and exact remaining-time continuity with focused presence/timer tests.
- **Prompt 676 — [POLISH] Render the jump-map scanline beneath map content.** Acceptance: Place the decorative scanline in the ship navigation jump map beneath the other map elements, including markers, paths, labels, compass, overlays, and interactive controls, so it never paints over or obscures them. Preserve the scanline's existing motion, reduced-motion handling, and clipping boundaries; it must not intercept pointer or keyboard interaction. Keep the change confined to jump-map layering and preserve coordinates, zoom/pan, selection, jump authorization, and all other console and non-GM DRADIS rendering. Prove the layer order in a real rendered map and verify legibility and interaction at phone, desktop, and short-landscape sizes.
- **Prompt 677 — [NEW] Gate jump-map coordinates by ship knowledge and hide location details.** Acceptance: A player jump map reveals a system's jump coordinates only when that particular ship has previously visited the location or has authoritatively discovered those coordinates; another ship's knowledge alone must not reveal them. Enforce the entitled projection at the data boundary, including labels, tooltips, accessibility text, search, cached/reconnect state, and serialized map data, rather than merely concealing coordinates with CSS. Add a Ship View Privacy option to hide information about what is present at a location, independently of whether its coordinates are known, using the existing privacy-control scope and permissions without deleting the ship's recorded knowledge. Preserve authorized facilitator views, valid visited/discovered history, jump targeting and server legality, and accepted non-GM DRADIS behavior. Reconcile the older fleet-group discovery projection with this owner-requested per-ship distinction. Prove different knowledge on two ships, visited and scanned reveals, unknown-coordinate denial, privacy hide/reveal, stale cache/reconnect, and accessible responsive player maps.
- **Prompt 678 — [NEW] Transmit scanned system details to all fleet ships or selected ships.** Acceptance: From a ship console, an entitled player can select a system their ship has scanned, inspect the details actually known to that ship, and transmit those details to all ships in the fleet or an explicit selected subset. The server resolves the sending ship, known system facts, current fleet/group recipient eligibility, and recipients' knowledge updates; a client cannot invent scan results, expose unknown or facilitator-only chart data, or add unauthorized recipients. Reuse the per-ship knowledge model so accepted transmitted coordinates and location facts become available to the chosen ships through their entitled projections while unselected ships receive no private data or revealing event payload. Preserve applicable communication rules, Ship View Privacy presentation choices, and existing jump/scout authority; make unavailable recipients and failed sends truthful in the UI. Record accepted sharing idempotently, survive retries/reconnect and concurrent discoveries without duplicate effects or lost knowledge, and test all/subset delivery, recipient exclusion, stale or unauthorized sends, known-fact-only payloads, and accessible responsive selection/confirmation controls.
- **Prompt 679 — [NEW] Allow blind jumps to a random adjacent system.** Acceptance: An entitled ship can choose a blind jump without supplying known destination coordinates. The server reads that ship's authoritative current node and the locked chart graph, randomly selects one directly connected node, and applies the normal jump workflow to that destination. A blind jump may select an undiscovered connected node; do not require the ship to know its coordinates or reveal the candidate neighbor set, hidden coordinates, or organiser chart to the client. Preserve existing role, phase, drive, fuel, group, damage, and jump-consequence rules; the client cannot choose the result, graph, random seed, or origin. Bind the selected destination to the authoritative request/receipt so retries, concurrent commands, and reconnect never redraw or duplicate movement or resource costs. A successful arrival records only the appropriate newly visited/discovered knowledge for that ship. Handle a missing or invalid graph/current node or no eligible connected destination truthfully without mutation. Prove adjacency, unknown-destination eligibility, server randomness, authorization, existing jump requirements, idempotent retry, and arrival knowledge without chart leakage. While the authoritative blind-jump operation is active, the jump-drive coordinate digits visually cycle through random numerals 0–9 twice per second with randomized staggered timing between digits. This is cosmetic scrambling, not a destination preview or source of gameplay randomness; it must not expose the hidden destination, seed the server draw, change costs, or trigger another jump. Stop and reconcile the display when the operation resolves, fails, or is cancelled, and avoid duplicate timers after reconnect or navigation. Provide a readable non-flickering reduced-motion equivalent and avoid announcing each random digit to assistive technology. Verify the digit range, twice-per-second cadence, stagger, cleanup, and separation from the committed destination.
<!-- END GENERATED PROMPT CATALOG: plan -->

# Den of Wolves: New Eden — Implementation Plan and Objectives

Status: planning baseline. This document is the pre-implementation gate for
future gameplay work.

This plan describes how to take the Companion Console from its current
server-authoritative session and console foundation to a complete,
rules-faithful game loop. It does not authorize a broad rewrite or the
creation of speculative controls. Each future change must select a bounded
slice of this plan, write its failing test first, and implement only the
smallest rules-complete increment needed for that slice.

No application code, tests, rules, configuration, version metadata, or
player-facing changelog entries are changed by this planning document.

## Product objectives

The implementation is complete only when all of these objectives are met:

1. **Run a complete game.** A facilitator can create and configure a session,
   cast the supported player count, run every turn through Team and
   Coordination phases, resolve the fleet's meaningful decisions, reach a
   defined New Eden outcome or failure state, and show a coherent debrief.
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
   expansion is distinct from the base-game small-ship Capybara.
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

## Scope and baseline

### Intended product scope

- Base game: the documented 8–18 player roster, two facilitators, six core
  fleet ships, Wolf agents, extra roles, and the reference game's six-to-eight
  turn structure.
- Expansion path: the S.A.N.S. Capybara as a separately enabled two-player
  ship, with Scrap, Macaw, Boa, Captain, and Recycler. It replaces the base
  extra small-ship Capybara when enabled; the two versions must never be
  merged by name alone.
- Operating target: one table/game with up to 20 players and up to 60
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

## Source-of-truth and decision policy

Before designing a mechanic, read
`docs/reference/den-of-wolves-new-eden/REFERENCE_ONLY_OVERVIEW.md` and every
source it routes to for that mechanic. The source map is:

| Mechanic | Required reference |
|---|---|
| Turn order, resources, maintenance, FTL, pursuit, suspicion, sabotage, away-mission procedure | `REFERENCE_ONLY_CORE_RULES.md` |
| Ship consoles, damage cards, ration tables, population tracks, jump costs, small ships, Voyage 33-0 | `REFERENCE_ONLY_SHIPS.md` |
| Printed maintenance layout and sequencing | `REFERENCE_ONLY_SHIP_LAYOUTS.md` |
| Shuttle and fighter-wing capabilities | `REFERENCE_ONLY_SHUTTLES.md` |
| Wolf sequence, Wolf ship cards, AEGIS weapons, boarding, Fighter Ace | `REFERENCE_ONLY_WOLF_ATTACKS.md` |
| Role responsibilities, player-count casting, loyalties, replacement roles, President | `REFERENCE_ONLY_ROLES_AND_LOYALTIES.md` |
| Star chart, chart variants, system codes, mission cards/rewards, New Eden candidates | `REFERENCE_ONLY_EXPLORATION_AND_AWAY_MISSIONS.md` |
| Facilitator setup, difficulty dials, crises, jump failures, evacuations, mutinies, endgame | `REFERENCE_ONLY_FACILITATION.md` |
| Capybara expansion, Scrap, Macaw, Boa, two-player role path | `REFERENCE_ONLY_CAPYBARA_EXPANSION.md` |

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

### Decisions required before affected implementation

These are not reasons to stop planning, but they are explicit gates for the
first code slice that depends on them:

- **Game scope:** whether a session may switch between base-only, Capybara
  expansion, and other extra-ship configurations after creation; how the
  product presents 8–18 base players versus the 20-player expansion target.
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

- Refinery 124 Water Reclamation is treated as 5♦ by elimination; the
  Capybara Scrap Refinery is treated as 7♠, with the stray 5♦ recorded.
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

Each phase below is a product objective, not a license to implement the whole
phase in one branch. Break a phase into vertical slices that have one
authoritative state change and one user-visible outcome.

### Phase 0 — Scope, rule matrix, and delivery contract

**Objective:** establish an unambiguous contract before adding gameplay code.

**Work:**

- Build a rule matrix for every planned action with columns for printed source,
  inputs, authoritative state, callable/function, Firestore path, permitted
  readers, denial behavior, client surface, audit record, and test location.
- Mark each row as implemented, partial, planned, facilitator-only, or
  explicitly out of scope. Link the relevant source and record any erratum or
  product decision.
- Confirm the supported player-count matrix, enabled ship set, active roles,
  Wolf-agent count, Dione availability, Joint Engineering Union assignments,
  extra/replacement roles, and the Capybara toggle.
- Define the complete session state machine: lobby, briefing, active turns,
  debrief, success/failure, and closed retention behavior.
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
- Resolve storage loss, ration selection, unrest roll, riot/alternative small
  ship population loss, reactor charges, shuttle fuelling, AEGIS's second bay,
  console upgrades, and end-of-turn expiration in printed order.
- Route every damage-causing step through the server damage deck. Record the
  card, system, casualty effect, armour recycling, failed check, empty-deck
  destruction, and linked audit ID in the crew-visible result where required.
- Keep GM threshold alerts independently acknowledged per GM instance and
  pause or gate later movement when the documented alert policy requires it.
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
  fleet's choices consequential.

**Work:**

- Implement player-count casting, loyalty assignment, starting suspicion,
  hidden Wolf roles, Intelligence Agent accuracy, Universal Arbour/Wolf Cult,
  Android and Friend relationships, and facilitator-only role data.
- Implement Wolf actions: console sabotage, supply sabotage, homing beacon,
  intel, suspicion clue thresholds, investigations, arrests, prisoner
  deadlines, and replacement roles, with private result delivery.
- Implement the five-step Wolf attack order: targeting and wraparound,
  Wolf Commander rerolls/adjustments, long/medium/short simultaneous actions,
  fighter-wing-first damage, boarding parties, security dice, Pallas/Chepu and
  engineering-shuttle support, and post-boarding damage/retreat.
- Encode every Wolf ship card's capacity, step-specific destruction effect,
  return behavior, Strikecarrier bonus, Battlestation restriction, and
  attack-composition rules. Keep facilitator composition and pre-roll details
  private as required.
- Implement AEGIS weapons, fighter wings, Maliades, Highwall, Boa, Fighter
  Ace, and other combat modules through authoritative action records. Resolve
  damage via the same server damage-draw path used by maintenance.

**Exit gate:** a complete attack can be prepared, resolved in order, audited,
and shown with correct private/public visibility; killing or leaving a Wolf
ship at a different range produces the reference result; no player can choose
the target, roll, hidden role, or damage card from the client.

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

**Objective:** give two facilitators enough truthful control to run the table
without bypassing authority or leaving the session in an ambiguous state.

**Work:**

- Model the two-facilitator operating split, facilitator-only notes, chart
  selection, loyalty assignment, crisis delivery, jump adjudication, mission
  resolution, Wolf composition, and rules-call annotations.
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

**Exit gate:** a facilitator can complete a full end-to-end playthrough in a
deterministic fixture, including at least one failure and one candidate
success path, and every active session can reach `closed` with a readable
outcome instead of an orphaned active state.

### Phase 8 — UI, accessibility, responsive behavior, and performance

**Objective:** make the completed rules legible and fast at a real table.

**Work:**

- Before UI changes, read and apply `docs/AESTHETICS.md`; record new reusable
  patterns or exceptions there in the same change.
- Keep each screen's primary status, next action, authority, and failure state
  visible. Use truthful labels for loading, offline, stale, pending, denied,
  facilitator decision, and completed outcomes.
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
keyboard and touch users can complete the same action; reduced motion removes
nonessential motion; route-level tests prove forward and return navigation;
bundle and render performance remain within the repository's measured limits.

### Phase 9 — Capacity, abuse protection, and release readiness

**Objective:** prove the service can host the intended table and release each
slice without weakening security.

**Work:**

- Follow `docs/ABUSE_PROTECTION_HANDOFF.md`: validate App Check behavior,
  classify callable costs, preserve identity/session-aware throttles, and
  make overload/retry behavior recoverable and idempotent.
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

## Test-first execution contract

The plan is intentionally test-first. For every future code slice:

1. Read the affected reference sources and identify the exact rule or contract.
2. Write the smallest failing test before implementation code. Run it and
   record the observed failure.
3. Implement the minimum server/client change that makes the test pass.
4. Add adjacent denial, stale-state, retry, and navigation cases before
   broadening the implementation.
5. Run the relevant unit/function suite, then the rules suite when Firestore
   authority is involved. Keep emulator ports isolated per `CLAUDE.md`.
6. For UI work, render and inspect narrow, wide, and short landscape states;
   passing text-presence tests alone is not visual verification.
7. Run the repository release gates in proportion to the change: lint,
   application and function builds, all tests, bundle checks, and capacity
   evidence when those surfaces are affected.

Required coverage patterns:

- Pure rule tables and state transitions: `src/**/*.test.ts` or
  `functions/src/*.test.ts`.
- Components and routes: React Testing Library tests that query by role or
  accessible text, including activation of the visible return route.
- Firestore-authoritative behavior: `tests/rules/firestore.rules.test.ts`
  must assert both permitted reads/actions and the client-side denial.
- Callable Functions: assert authentication, membership, role/GM instance,
  phase, revision, feature toggle, input bounds, transaction atomicity,
  idempotency, and private/public result visibility.
- Shared console architecture: exercise a reference vessel plus a materially
  different configuration rather than copying assertions per ship.
- Random or hidden mechanics: test that the client cannot supply the result,
  that the server records it, and that only entitled readers receive it.
- Responsive/aesthetic regressions: assert layout-relevant semantics or
  computed styles where appropriate, then perform the required rendered review.

## Definition of done for the roadmap

A roadmap slice is complete only when:

- its objective, source references, scope, and unresolved decisions are
  recorded in the implementation issue/branch;
- the failing test was observed before implementation;
- the server transaction, Firestore denial, client surface, audit record, and
  retry behavior agree;
- affected routes have visible tested return navigation and no unverified
  buttons;
- affected visuals work at supported viewport sizes and respect reduced motion;
- documentation, architecture, errata, and aesthetics are updated when the
  new behavior changes them;
- version and player-facing changelog are updated for product changes, while
  documentation-only changes keep them untouched;
- local validation and capacity evidence appropriate to the risk are recorded;
- the coordination entry is closed from the same worktree and the finished
  branch is merged and pushed according to `CLAUDE.md`.

## Recommended first implementation slices after plan approval

The safest order is to select one narrow slice from each foundation before
opening broader gameplay work:

1. Complete the Phase 0 rule matrix for one end-to-end action, such as a
   server-authorized shuttle movement or one mission/scouting result.
2. Finish its Phase 1 state, visibility, transaction, and Firestore denial
   contract.
3. Add the Phase 2/3 UI surface and a visible result with a route back.
4. Exercise the shared template with one reference vessel and one variant.
5. Only after that vertical slice is green, repeat the pattern for the next
   mechanic and close the branch.

This order keeps every new mechanic anchored to source truth, server
authority, a user-visible outcome, and a regression test before the next
mechanic is introduced.

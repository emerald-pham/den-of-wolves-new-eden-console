# Den of Wolves: New Eden — Implementation Plan and Objectives

Status: living roadmap. This document is the planning gate for future gameplay
work and records which foundation is implemented versus still incomplete.

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

## Player story milestones and ATDD exit gates

The following milestones turn the product objectives and the roadmap phases
into player-facing acceptance stories. They are deliberately end-to-end
vertical slices rather than component or callable checklists. A milestone is
green only when its stated player/GM outcome works against authoritative state,
has a visible result and failure path, and satisfies the cross-cutting contract
below. Several of the original milestone ideas are intentionally split: a
DRADIS filter is not the same thing as a playable split fleet, a Wolf attack is
not the same thing as recovering from its aftermath, and a jump button is not
the jump authority.

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
Wolf Attack is declared, **then** all shuttles park, targeting resolves with
the permitted modifiers, Long, Medium and Short Range actions resolve
simultaneously, Short Range damage targets fighter wings first, Boarding
Action resolves security dice and shuttle support, and surviving Wolf ships
apply their step-specific damage and retreat/return behavior. The attack,
damage cards, casualties, boarding results and public/private readouts are
auditable and cannot be chosen by the client.

The post-attack story continues through repair, resource loss, survivor
changes, salvage and any newly triggered alert or mission consequence. Combat
resolution and recovery must each have a failing-first acceptance fixture so a
passing battle animation cannot be mistaken for a playable aftermath.

**Dependencies:** Milestones 2–3 and 6, server randomness, damage authority,
boarding state and the Wolf ship-card catalog.

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

### Recommended story order

The shortest path to a meaningful playable loop is:

1. Cast and start a real game.
2. Complete one authoritative turn and maintenance loop.
3. Make the fleet economy and specialist capabilities playable.
4. Scout and learn a system.
5. Jump independently to a legal destination and recover from failure.
6. Fly a shuttle and make it useful; then complete an away mission.
7. Operate and reunite a split fleet safely.
8. Resolve a full Wolf attack and its aftermath.
9. Make hidden loyalties and social deduction playable.
10. Recover from catastrophe and resolve crises.
11. Reach an explicit New Eden ending and closed debrief.

The 20-player roster and 60-browser-client scenario remain release-readiness
evidence, not substitutes for these stories. They should be exercised after
the relevant loop is functionally complete, with measured latency, errors,
contention, reconnect and retry results rather than an unverified capacity
claim.

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

### Active vertical slice — ship jump console

**Objective:** turn the existing display-only Jump Drive entry into one
authoritative, touch-friendly ship action with a readable start, transit, and
recovery state.

**Contract:**

- The player edits four numeric coordinate digits with increment/decrement
  controls, explicitly locks the destination, and drags a full-width power
  rail before the server receives a jump request. Coordinate editing remains
  local until the locked jump is submitted.
- The callable validates the active ship role, current turn, maintenance
  charge, fuel, damage/upgrades, chart reachability, and one-jump-per-turn
  rule. A four-digit value that is not a printed, reachable system is an
  integrity failure: the ship does not move and the server records a one-hour
  `integrityLockedUntil` state. The client displays that lockout from server
  state, not from a local timer alone.
- Successful jumps update the ship's galactic coordinate, consume the
  authoritative fuel/charge, append a navigation event, and publish one
  transition record. DRADIS contacts are derived from the new coordinate, so
  only ships that completed the same destination reappear and their fixed
  ship-relative formation is unchanged.
- The transition record drives a two-second 3 Hz system flash across the ship
  console. Reduced motion removes the nonessential flash while preserving the
  authoritative coordinate/contact transition and accessible status copy.

**Definition of done:** the failing-first unit, callable, component, DRADIS,
and Firestore-denial tests cover the contract above; the module is mounted in
the shared fleet system workspace for every enabled ship; and narrow, wide,
short-landscape, and reduced-motion visual review finds no clipped controls or
misleading contact data.

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
- Wolf hacking presentation must reuse the dormant launcher capability in
  `src/components/HackingMessageOverlay.tsx` and the shared `HACKING_MESSAGES`
  copy in `src/lib/hackingMessages.ts`; enable it only from authoritative Wolf
  state and preserve its reduced-motion, `aria-hidden`, and no-focus-trap
  accessibility behavior.
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

## Prompt-by-prompt ATDD build sequence

This is an incremental queue from the tested application that exists now to a
complete game. It is not a greenfield specification. The inventory below was
checked against the current production modules and all 128 test files. The
ordinary Vitest run was also executed while preparing this plan: **127 test
files and 1,126 tests passed**. Its separate Firestore emulator suite also
passed **52 rules tests in one file**, for a current evidence snapshot of
**1,178 passing tests across 128 files**.

### Current tested foundation

| Existing capability | Representative test anchors | Roadmap treatment |
|---|---|---|
| Session creation UI, join-code security, joining, resume, reconnect, presence expiry, seven-day empty-session retention, outbox replay, and disconnect | `src/routes/Landing.test.tsx`, `src/lib/sessionService.test.ts`, `functions/src/joinSessionCallable.test.ts`, `functions/src/sessionResumeCallable.test.ts`, `functions/src/sessionLifecycleCallable.test.ts` | Preserve. Add direct callable or emulator composition tests only where the current suite has a named gap. |
| Seat claim/release, command-role ownership, crew relief, GM access, named GM instances, lock/recovery, kicking, observer mode, and return navigation | `functions/src/seatCallable.test.ts`, `functions/src/consoleRolePolicy.test.ts`, `functions/src/crewAccess.test.ts`, `functions/src/gmSessionCallable.test.ts`, `functions/src/gmControlsLock.test.ts`, `src/routes/RoleSelect.test.tsx` | Preserve. Extend into casting and two-facilitator stories without replacing current authority or routes. |
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
  rewrite it. Confirm the named tests, add only a missing regression or
  composition case, and close the prompt with no product change when the
  acceptance is already proven.
- **`[EXTEND]`** — production scaffolding or part of the behavior exists. Add
  the smallest missing authoritative edge while retaining every passing test,
  ID, route, template, and player-facing contract.
- **`[NEW]`** — no complete production behavior or dedicated acceptance test
  was found. Add it as one failing-first vertical slice on top of the existing
  architecture.
- **`[PROVE]`** — compose existing and newly landed parts into an emulator,
  browser, security, capacity, or full-story acceptance scenario. A proof
  prompt does not authorize a rewrite to make the fixture easier.
- **`[DECISION]`** — resolve a genuine printed-rule or product ambiguity before
  exposing the affected action. Record the source and chosen policy.

Before starting any numbered prompt, reconcile it with current `main`, the
coordination ledger, this evidence table, and the rule matrix. The status tag
overrides any broad verb retained in the prompt title: for example,
`[PRESERVE] Implement ...` means audit the already-implemented contract, not
replace it. If later work has landed, reclassify the prompt from `[NEW]` or
`[EXTEND]` to `[PRESERVE]`, link its proof, and make no duplicate
implementation. Split a prompt only when its first failing test exposes two
independent state changes; retain the original ID with a lettered child rather
than renumbering completed work.

### Contract carried by every numbered prompt

Treat each entry below as if it ended with this instruction:

> Read `CLAUDE.md`, the implementation-plan source map, and the exact printed
> references for this slice. Start with session goals and coordination,
> version, changelog, and resource preflight. State the Given/When/Then player
> or facilitator outcome. First run the named existing tests for the affected
> contract and keep them green. For `[PRESERVE]`, stop when current behavior and
> evidence satisfy the acceptance; never refactor or reimplement it merely to
> complete the prompt. For `[EXTEND]` or `[NEW]`, write the smallest missing
> failing acceptance test and run it to observe the intended failure before
> changing product code. Implement one bounded vertical slice through server
> authority, typed shared state, Firestore denial, the entitled client surface,
> a truthful failure
> state, idempotent retry/reconnect behavior, and a stable audit result where
> those layers apply. Add adjacent unauthenticated, unauthorized, wrong-role,
> wrong-phase, stale-revision, malformed-input, secret-visibility, and direct-
> write cases in proportion to risk. Exercise the shared console with a
> reference vessel and a materially different vessel when applicable. Verify
> visible return navigation, supported viewports, keyboard/touch operation,
> and reduced motion for affected UI. Update rule, architecture, errata,
> aesthetics, version, and player-facing changelog records only when the slice
> requires them. Run the repository gates appropriate to the changed surfaces,
> reconcile current `main`, merge, push, close coordination, and record both
> the red and green evidence. Do not expose a control whose authoritative
> action, result, denial, and recovery path are not all real.

Planning, decision, fixture, and operations prompts use the same discipline:
their first red check is an executable schema, traceability, security, replay,
or evidence assertion rather than a fictional product control. Each product
prompt should leave `main` releasable on its own; later prompts must not be
required to make an earlier exposed control truthful. Existing tests are the
regression floor throughout this queue, not disposable scaffolding.

### Build order

#### Execution state

The complete 703-ID queue (Prompts 001–651 plus the lettered prompts) is in
scope for the active completion campaign. The first 100 prompts are tracked in
the checklist below; later batches must receive equivalent execution tracking
in [`docs/IMPLEMENTATION_PROGRESS.md`](./IMPLEMENTATION_PROGRESS.md) before
their implementation begins. A completed prompt is marked with a checked task
box and recorded with current evidence. Unchecked, `partial`, and `missing`
prompts remain open; none of those states may be treated as completion.

#### Implementation-plan agent authorization

When working on numbered prompts from this implementation plan, the product
owner specifically authorizes the coordinator to assign implementation, tests,
verification, integration, release, merge, push, and coordination closeout to
GPT-5.6 Luna (`gpt-5.6-luna`) agents. Non-coding work,
including reconnaissance, planning, documentation review, evidence collation,
and read-only verification, may use Luna at any supported reasoning level. Any
agent that writes or changes application code, Cloud Functions, Firestore
rules, configuration, scripts, or tests must use Luna at `xhigh` or `max`
reasoning. A merge or conflict-resolution task that edits any of those files
also counts as coding and has the same `xhigh`/`max` requirement.

This is an implementation-plan-scoped override of the routine `high`-reasoning
default and primary-agent implementation/integration ownership in `CLAUDE.md`;
it does not change the repository-wide default for unrelated work. GPT-5.3
Codex Spark remains prohibited.

Each modifying delegate must receive one bounded prompt or an inseparable,
dependency-safe prompt slice with explicit Given/When/Then acceptance criteria,
use its own worktree and short-lived branch, and follow the test-first contract
above, including observing the failing test before implementation. Each slice
must satisfy the applicable reference, authority, denial, retry, audit,
accessibility, responsive-review, version, and standalone changelog contracts.
An independent Luna `xhigh` or `max` agent may perform final review and gate
verification. A prompt may move to `done` only after its proof is current on the
reconciled branch, every applicable executable gate passes, the slice is merged
to `main`, `origin/main` is verified at that merge, and the slice's coordination
entry is closed. No partial implementation, local-only result, unmerged green
branch, or unchecked release obligation counts toward the campaign finish.

#### Execution checklist — prompts 001–100

Unchecked entries are partial or missing, never silently complete; the evidence
and resume point live in `docs/IMPLEMENTATION_PROGRESS.md`.

- [x] Prompt 001
- [x] Prompt 002
- [x] Prompt 003
- [ ] Prompt 004
- [x] Prompt 005
- [x] Prompt 006
- [x] Prompt 007
- [x] Prompt 008
- [x] Prompt 009
- [x] Prompt 010
- [x] Prompt 011
- [ ] Prompt 012
- [x] Prompt 013
- [ ] Prompt 014
- [ ] Prompt 015
- [x] Prompt 016
- [ ] Prompt 017
- [x] Prompt 018
- [ ] Prompt 019
- [ ] Prompt 020
- [x] Prompt 021
- [ ] Prompt 022
- [x] Prompt 023
- [x] Prompt 024
- [x] Prompt 025
- [x] Prompt 026
- [x] Prompt 027
- [x] Prompt 028
- [x] Prompt 029
- [x] Prompt 030
- [x] Prompt 031
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
- [ ] Prompt 051
- [x] Prompt 052
- [x] Prompt 053
- [x] Prompt 054
- [ ] Prompt 055
- [ ] Prompt 056
- [ ] Prompt 057
- [ ] Prompt 058
- [x] Prompt 059
- [x] Prompt 060
- [x] Prompt 061
- [ ] Prompt 062
- [ ] Prompt 063
- [ ] Prompt 064
- [x] Prompt 065
- [x] Prompt 066
- [x] Prompt 067
- [ ] Prompt 068
- [ ] Prompt 069
- [ ] Prompt 070
- [x] Prompt 071
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
- [ ] Prompt 092
- [ ] Prompt 093
- [x] Prompt 094
- [x] Prompt 095
- [x] Prompt 096
- [x] Prompt 097
- [ ] Prompt 098
- [ ] Prompt 099
- [ ] Prompt 100

#### Foundation, session, casting, and start (Prompts 001–090)

- **Prompt 001 — [PRESERVE] Build the canonical rule-source index.** Acceptance: every planned mechanic resolves to a routed reference, with printed component sheets taking precedence over generic guides.
- **Prompt 002 — [PRESERVE] Encode source precedence.** Acceptance: conflicting generic and ship-specific values resolve to the printed component value and the conflict remains traceable.
- **Prompt 003 — [DECISION] Create the ambiguity ledger.** Acceptance: every known discrepancy is an explicit facilitator decision, product decision, or blocked action rather than a speculative control.
- **Prompt 004 — [PRESERVE] Encode the supported player-count matrix.** Acceptance: each count from 8 through 18 produces only its printed roles, ships, Union assignments, and Wolf count.
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
- **Prompt 021 — [EXTEND] Validate session creation input.** Acceptance: unsupported player count, chart, expansion, turn limit, duplicate option, and malformed fields fail before writes.
- **Prompt 022 — [EXTEND] Implement authoritative session creation.** Acceptance: one valid callable creates one lobby, owner/facilitator metadata, configuration, and event atomically.
- **Prompt 023 — [EXTEND] Make session creation retry-safe.** Acceptance: repeating the same creation request returns one session and one join code.
- **Prompt 024 — [PRESERVE] Authenticate join requests.** Acceptance: unauthenticated, revoked, or malformed identities cannot join or learn session state.
- **Prompt 025 — [PRESERVE] Resolve a requested join code without listing sessions.** Acceptance: a valid code finds only its session and an invalid code reveals no neighboring code or metadata.
- **Prompt 026 — [PRESERVE] Enforce membership uniqueness.** Acceptance: concurrent joins from one player/device produce one membership record and one stable result.
- **Prompt 027 — [PRESERVE] Throttle invalid joins safely.** Acceptance: repeated attempts receive non-enumerating limits while legitimate table retries remain recoverable.
- **Prompt 028 — [PRESERVE] Authorize minimal session-header reads.** Acceptance: members read the lobby header; unauthenticated and nonmember reads and collection listing are denied.
- **Prompt 029 — [PRESERVE] Enforce one seat per player.** Acceptance: concurrent claims cannot leave one player in two seats or one seat pointing to two players.
- **Prompt 030 — [PRESERVE] Implement authoritative seat claiming.** Acceptance: a valid open-seat claim updates the seat, player pointer, roster, and event in one transaction.
- **Prompt 031 — [PRESERVE] Resolve seat-claim races.** Acceptance: simultaneous claims yield one winner and one truthful conflict without orphaning either member.
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
- **Prompt 051 — [PRESERVE] Load a roster by player count.** Acceptance: every supported count selects exactly the printed casting row and no convenience role.
- **Prompt 052 — [PRESERVE] Exclude Dione below 12 players.** Acceptance: Dione, its roles, resources, shuttles, and population are absent and cannot be re-enabled by payload edits.
- **Prompt 053 — [PRESERVE] Configure Joint Engineering Union substitutions.** Acceptance: each count assigns the correct paired ships, roles, and Union shuttle set.
- **Prompt 054 — [PRESERVE] Configure Wolf-agent count.** Acceptance: 8–13 players receive one hidden Wolf and 14–18 receive two, unless a recorded optional loyalty rule replaces one.
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
- **Prompt 071 — [NEW] Validate start readiness.** Acceptance: missing facilitators, seats, roles, loyalties, vessel ownership, or configuration blocks start with a precise nonsecret reason.
- **Prompt 072 — [NEW] Lock casting at start.** Acceptance: lobby commands cannot alter roles, loyalties, or starting state after the start transaction; later replacement uses its own path.
- **Prompt 073 — [NEW] Represent two-facilitator readiness.** Acceptance: setup reports whether both physical responsibilities are staffed without conflating them with arbitrary local GM modes.
- **Prompt 074 — [NEW] Authorize game start.** Acceptance: only an active eligible facilitator/GM instance can start a ready roster.
- **Prompt 075 — [NEW] Start the game atomically.** Acceptance: one transaction initializes lifecycle, turn, phase, timers, ships, roles, resources, decks, pursuit, and the first event.
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
- **Prompt 104 — [NEW] Complete the configured final turn.** Acceptance: normal actions freeze and the game enters explicit endgame evaluation rather than an orphaned active phase.
- **Prompt 105 — [NEW] Trigger pursuit-10 failure.** Acceptance: authoritative pursuit reaching 10 creates one failure outcome and blocks further normal actions.
- **Prompt 106 — [PRESERVE] Replay lifecycle announcements.** Acceptance: reconnecting members see the latest relevant turn/phase state without duplicate visual effects.
- **Prompt 106a — [PRESERVE] Enforce FleetBroadcast precedence.** Acceptance: urgent authoritative transmissions preempt lower-priority ticker content, queue safely, and drain once without losing a higher-priority state.
- **Prompt 106b — [PRESERVE] Verify exact turn-transmission timing.** Acceptance: Turn 0, Turn 1, ordinary turn, lockout, and finale copy appears, fades, and replays at its specified lifecycle moment.
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
- **Prompt 134 — [PRESERVE] Alert starred population thresholds.** Acceptance: each active GM instance receives its own acknowledgement and the smaller ration table becomes authoritative.
- **Prompt 135 — [PRESERVE] Add two unrest at population zero.** Acceptance: the transition applies once and replayed snapshots cannot add it again.
- **Prompt 136 — [NEW] Enter mutiny at unrest 8.** Acceptance: the ship becomes unusable, its actions deny, and facilitators receive a named recovery requirement.
- **Prompt 137 — [NEW] Resolve replacement-captain mutiny recovery.** Acceptance: an authorized facilitator records the permitted unrest reduction rather than an invented automatic value.
- **Prompt 138 — [PRESERVE] Make maintenance atomic and retry-safe.** Acceptance: a failure or duplicate request cannot partially spend rations, produce resources, charge consoles, or draw twice.
- **Prompt 138a — [PRESERVE] Bound maintenance rollback.** Acceptance: only the current-turn reversible maintenance state rolls back under the matching revision while damage and audit history remain immutable.
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
- **Prompt 145 — [NEW] Lock airspace for a Wolf attack.** Acceptance: declaring an attack blocks ordinary movement and begins server-owned parking for every shuttle.
- **Prompt 146 — [DECISION] Decide nearest-ship parking ties.** Acceptance: one deterministic, recorded facilitator/product policy resolves equal-distance hosts.
- **Prompt 147 — [NEW] Restrict battle-table craft.** Acceptance: only printed combat-capable shuttles and fighter wings appear in attack actions; all others remain parked.
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
- **Prompt 182 — [NEW] Complete AEGIS combat-console registration.** Acceptance: Command and Control, both Fighter Bays, Missile Launchers, and Point Defence expose no action before their attack resolvers exist.
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
- **Prompt 252 — [PRESERVE] Gate the expansion Capybara.** Acceptance: immutable configuration replaces, never combines with, the base Capybara across roster, catalogs, targeting, resources, and damage.
- **Prompt 253 — [EXTEND] Complete expansion Capybara identity.** Acceptance: 20,000 survivors, three charges, steps 1–6, 3/6/12 jump, and its own ration/population tracks render from one full-ship definition.
- **Prompt 254 — [EXTEND] Resolve expansion Capybara Storage and Reactor.** Acceptance: Storage halves correct stores and the Reactor applies exact charge, damage, and upgrade behavior.
- **Prompt 255 — [NEW] Resolve Capybara Advanced Hydroponics.** Acceptance: two water makes six food, optional one Scrap adds six, and upgrade/damage states apply once.
- **Prompt 256 — [NEW] Resolve Capybara Water Production.** Acceptance: six water plus an optional six for one Scrap is transactional and unavailable when uncharged or damaged.
- **Prompt 257 — [NEW] Resolve the Scrap Refinery.** Acceptance: charged 7♠ either creates one Scrap or converts one Scrap to three materials; the stray 5♦ remains documented errata.
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
- **Prompt 275a — [NEW] Register the SNN Independent Press Shuttle.** Acceptance: unaffiliated ownership, current host, Press Officer route, movement exception, equipment, and enabled-session behavior remain distinct from printed fleet craft.
- **Prompt 275b — [PROVE] Verify Press dispatch and bridge presentation.** Acceptance: an authorized dispatch reaches the intended audience and newspaper/confetti presentation follows current dock, accessibility, and reduced-motion rules without becoming authority.
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

- **Prompt 351 — [EXTEND] Show only arrived local ships on DRADIS.** Acceptance: a viewer sees ships whose authoritative coordinate and fleet group match their own.
- **Prompt 352 — [PRESERVE] Represent jumping ships in transition.** Acceptance: departure removes the old arrived contact and destination does not appear before commit.
- **Prompt 353 — [EXTEND] Publish sampled transit contacts.** Acceptance: DRADIS consumes server-owned samples and never derives hidden destination or movement authority from animation.
- **Prompt 354 — [EXTEND] Remove stale contacts.** Acceptance: the newest server snapshot removes or changes a departed/destroyed contact despite cached local data.
- **Prompt 355 — [EXTEND] Fold docked shuttles into host contacts.** Acceptance: a docked craft appears at its host rather than as an independent in-flight object.
- **Prompt 356 — [EXTEND] Show undocked shuttle samples.** Acceptance: an eligible travelling craft appears only from authoritative sampled transit state.
- **Prompt 357 — [EXTEND] Redact split-fleet contact metadata.** Acceptance: labels, counts, events, and empty space cannot reveal another group's location.
- **Prompt 358 — [EXTEND] Reflect attack parking on DRADIS.** Acceptance: all craft resolve to parked hosts while only combat-capable craft enter the battle projection.
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
- **Prompt 423 — [PROVE] Run the shuttle-airspace scenario.** Acceptance: departure, DRADIS transit, retarget, arrival, transfer, restriction parking, attack parking, reopen, and retry all remain authoritative.
- **Prompt 424 — [PROVE] Run the split-fleet exploration scenario.** Acceptance: two groups scout, jump independently, hide contacts/comms, ferry a legal payload, complete a mission, rejoin, and retain correct pursuit.

#### Wolf attack engine, fleet combat, and boarding (Prompts 425–484)

- **Prompt 425 — [NEW] Define the Wolf ship catalog.** Acceptance: Fighter Wing, Assault Transport, Destroyer, Cruiser, Strikecarrier, and Battlestation capacities/effects match every range and return rule.
- **Prompt 426 — [NEW] Define attack-composition rules.** Acceptance: Turn 1 and later attacks meet their exact composition/capacity constraints without player-selected hidden cards.
- **Prompt 427 — [NEW] Prepare an attack privately.** Acceptance: facilitators can stage cards, targets, modifiers, and notes before declaration while players receive nothing early.
- **Prompt 428 — [NEW] Centralize combat randomness.** Acceptance: targeting, attack, defence, and damage rolls are server-generated, recorded, and impossible to submit as outcomes.
- **Prompt 429 — [NEW] Encode base targeting.** Acceptance: d6 maps exactly to the six core ships from authoritative active configuration.
- **Prompt 430 — [NEW] Encode expansion targeting.** Acceptance: enabled Capybara uses d8 result 7 while 8 rerolls; base small Capybara is never a full-ship target.
- **Prompt 431 — [NEW] Resolve target-number wraparound.** Acceptance: every permitted ±1 shift uses the correct configured target ring and clients cannot select the final ship directly.
- **Prompt 432 — [NEW] Declare the attack atomically.** Acceptance: attack state, airspace lock, parked craft, current step, and one announcement commit together.
- **Prompt 433 — [NEW] Project attack state by audience.** Acceptance: players see phase and permitted actions; facilitators retain hidden composition, unresolved dice, and notes.
- **Prompt 434 — [NEW] Make attack commands retry-safe.** Acceptance: duplicate declaration, roll, action, or advancement returns one result and never resolves a step twice.
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
- **Prompt 474 — [NEW] Publish the immediate attack result.** Acceptance: affected crews see damage, casualties, boarding, and remaining threats while hidden prep stays private.
- **Prompt 475 — [NEW] Reuse the common damage draw path.** Acceptance: combat damage covers the drawn console, applies armour, records the card, and never exposes remaining deck order.
- **Prompt 476 — [NEW] Destroy a ship on combat deck exhaustion.** Acceptance: an empty required draw enters the same authoritative catastrophe flow used elsewhere.
- **Prompt 477 — [NEW] Apply combat casualties.** Acceptance: each applicable hit steps the target's exact population track and triggers thresholds once.
- **Prompt 478 — [NEW] Apply Doctor casualty mitigation.** Acceptance: one ship is halved, and each additional ship costs exactly three food and three water from valid stores.
- **Prompt 479 — [NEW] Resolve Warrior post-attack salvage.** Acceptance: one server die per authoritative damage dealt by either side yields one material on each 5+.
- **Prompt 480 — [NEW] Resolve Capybara post-attack Scrap.** Acceptance: each ship taking at least three damage creates exactly one Scrap opportunity per attack.
- **Prompt 481 — [NEW] Collect Scrap with Macaw or Boa.** Acceptance: each craft moves only its printed salvage/cargo after the threshold event.
- **Prompt 482 — [NEW] Resolve post-attack repairs.** Acceptance: eligible craft repair or permission-dismantle using correct costs, hosts, fuel, and audit events.
- **Prompt 483 — [NEW] Rebuild fighters after combat.** Acceptance: the AEGIS Construction Bay spends one material per fighter up to the current wing cap.
- **Prompt 484 — [NEW] Publish the complete aftermath.** Acceptance: each crew sees damage, casualties, stores, salvage, repairs, surviving/returning Wolves, and outstanding recovery work.

#### Threat pressure, Wolf loyalties, deduction, and facilitator actions (Prompts 485–524)

- **Prompt 485 — [PROVE] Verify pursuit initializes at Turn 1.** Acceptance: attack scheduling and threat views consume the same server-owned value of 2 as navigation.
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
- **Prompt 496 — [NEW] Enforce Wolf count by roster.** Acceptance: one or two agents exist exactly as configured and invalid overrides require a recorded facilitator decision.
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
- **Prompt 522 — [NEW] Model two facilitator operating lanes.** Acceptance: main and assistant responsibilities, private views, shared calls, and handoff are explicit without over-broad reads.
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
- **Prompt 562 — [NEW] Aggregate survivor outcomes.** Acceptance: the server totals ship populations, evacuations, pods, lost/destroyed ships, and final survivors from authoritative ledgers.
- **Prompt 563 — [NEW] Explain candidate results.** Acceptance: debrief shows path, met/unmet prerequisites, rolls, losses, and facilitator calls without private-loyalty leakage.
- **Prompt 564 — [NEW] Enter debrief once.** Acceptance: success/failure freezes actions and creates one immutable outcome despite concurrent close requests.
- **Prompt 565 — [NEW] Close the session authoritatively.** Acceptance: the server transitions from readable debrief to closed retention without losing permitted history.
- **Prompt 566 — [NEW] Read debrief after closure.** Acceptance: members regain the outcome and allowed audit while loyalties, hidden chart, cards, and notes keep their privacy policy.
- **Prompt 567 — [PROVE] Reverify Capybara mode selection.** Acceptance: base-only, base extras, or crewed expansion remains immutable and no route/catalog conflates the two Capybaras.
- **Prompt 568 — [NEW] Isolate Scrap reads and writes.** Acceptance: only enabled Capybara, Macaw, and Boa ledgers can create, carry, or spend Scrap.
- **Prompt 569 — [NEW] Cast Capybara Captain and Recycler.** Acceptance: both roles appear exactly once in expansion mode with private briefs and distinct authority.
- **Prompt 570 — [NEW] Apply d8 Capybara targeting.** Acceptance: 7 selects the full ship, 8 rerolls, and base d6 sessions never target the hybrid.
- **Prompt 571 — [PROVE] Run full Capybara maintenance.** Acceptance: steps 1–6, rations, population, three charges, storage, production, bay, and jump all resolve in order.
- **Prompt 572 — [NEW] Resolve Capybara population thresholds.** Acceptance: exact discrete values swap ration tables and population zero adds two unrest once.
- **Prompt 573 — [DECISION] Resolve Capybara damage cards.** Acceptance: its own deck, 7♠ Scrap Refinery decision, and documented empty-deck ambiguity remain authoritative.
- **Prompt 574 — [NEW] Resolve Macaw refuelling.** Acceptance: only Team-docked Macaw can consume the single bay choice and unused fuel expires.
- **Prompt 575 — [NEW] Resolve Macaw repairs.** Acceptance: one Scrap repairs each of up to two consoles, with fuel permitting a second eligible ship.
- **Prompt 576 — [DECISION] Resolve Macaw salvage dismantling.** Acceptance: target permission and the recorded self-dismantling policy govern deliberate damage and Scrap gain.
- **Prompt 577 — [NEW] Resolve Macaw cargo.** Acceptance: ore, fuel, food, water, material, Scrap, and security teams transfer only between legal docked inventories.
- **Prompt 578 — [NEW] Resolve Boa recycling.** Acceptance: each of the five printed exchange recipes yields one Scrap, no more than twice per turn, atomically.
- **Prompt 579 — [NEW] Resolve Boa reclamation.** Acceptance: one pre-deal opportunity halves difficulty, replaces reward with one Scrap, and grants no critical bonus.
- **Prompt 580 — [DECISION] Resolve Boa combat ambiguity.** Acceptance: each range Scrap attack follows the recorded policy for destroyed/invalid targets and never spends on denial.
- **Prompt 581 — [NEW] Create post-damage Scrap pickups.** Acceptance: each ship taking at least three attack damage yields exactly one collectible Scrap per attack.
- **Prompt 582 — [NEW] Expose Capybara objectives privately.** Acceptance: Captain and Recycler see their distinct duties and shared S.A.N. goal without broad brief access.
- **Prompt 583 — [DECISION] Apply the Capybara balance dial.** Acceptance: facilitators see the documented +6 attack-capacity consideration as guidance, never an automatic hidden mutation.
- **Prompt 584 — [PROVE] Run the Capybara vertical scenario.** Acceptance: casting, maintenance, production, one bay, Macaw, Boa, Scrap, d8 targeting, combat, mission, and jump work end to end.
- **Prompt 585 — [PROVE] Run the base/expansion isolation scenario.** Acceptance: identical display names cannot cross-load roles, stores, damage, jump, targeting, or craft behavior.

#### Onboarding, help, settings, and operational truth (Prompts 586–600)

- **Prompt 586 — [EXTEND] Build the roster configuration flow.** Acceptance: setup presents only supported counts/options and explains Dione, Union, Wolf, and expansion effects before lock.
- **Prompt 587 — [EXTEND] Present private casting assignments.** Acceptance: players see only their ship, role, device mode, and allowed route; facilitators see the complete roster.
- **Prompt 588 — [EXTEND] Present private loyalty assignment.** Acceptance: the entitled player sees exact card/suspicion and unrelated clients receive no serialized secret.
- **Prompt 589 — [EXTEND] Teach the table ground rules.** Acceptance: onboarding covers private briefs, no out-of-game communication/photos, Wolf humanity, and resource components with exact approved copy.
- **Prompt 589a — [PRESERVE] Audit the motion-safety gate.** Acceptance: every browser is blocked until normal or reduced motion is chosen, the choice applies globally, and a fresh acknowledgement is required after 24 hours.
- **Prompt 589b — [PRESERVE] Audit the authenticated-session waiver.** Acceptance: exact safety/privacy/game expectations gate entry for the documented lifetime and remain distinct from GM access expiry.
- **Prompt 590 — [EXTEND] Teach the core game loop.** Acceptance: help explains Team, Coordination, pursuit failure, jump announcements, attack docking, and away missions without unsupported mechanics.
- **Prompt 591 — [EXTEND] Show vessel-specific maintenance help.** Acceptance: the active ship sees its exact numbered steps, rations, unrest, damage, charging, and fuel expiry.
- **Prompt 592 — [EXTEND] Show craft-specific help.** Acceptance: each shuttle/fighter shows only its printed owner, fuel, cargo, phase, combat, mission, and action rules.
- **Prompt 593 — [EXTEND] Show candidate preparation help.** Acceptance: N, O, and P requirements remain distinct and no hidden location, bonus, or Wolf state leaks.
- **Prompt 594 — [EXTEND] Label facilitator decisions.** Acceptance: every adjudicated result visibly names the decision source, actor, and time rather than posing as rules automation.
- **Prompt 595 — [PRESERVE] Display the derived application version.** Acceptance: Settings reads runtime package metadata and never carries a handwritten version.
- **Prompt 596 — [PRESERVE] Display bounded changelog history.** Acceptance: newest player-facing entry appears first in an independently scrollable accessible region.
- **Prompt 597 — [PRESERVE] Complete exact disconnect confirmation.** Acceptance: danger styling and the required two-step `ARE YOU SURE?` flow queue presence cleanup, clear local state, and reach landing.
- **Prompt 598 — [PRESERVE] Explain connectivity truthfully.** Acceptance: connected, offline, stale, pending, denied, retrying, and closed states derive from real signals.
- **Prompt 599 — [EXTEND] Build the facilitator setup checklist.** Acceptance: two-facilitator duties, room/components, chart, casting, loyalties, and readiness are tracked without mutating gameplay.
- **Prompt 600 — [PROVE] Run the onboarding-to-first-action scenario.** Acceptance: a new player acknowledges safety, joins, receives private assignments, learns the loop, enters the right route, completes one real action, and returns.

#### Accessibility, resilience, security, capacity, and release proof (Prompts 601–651)

- **Prompt 601 — [EXTEND] Make primary status universal.** Acceptance: every player, role, ship, shuttle, observer, GM, mission, attack, and debrief route names turn, phase, location, authority, next action, and failure state.
- **Prompt 602 — [PROVE] Prove return navigation everywhere.** Acceptance: every nonlanding route has a visible keyboard-accessible logical return that preserves state unless explicitly released.
- **Prompt 603 — [EXTEND] Make ship consoles work on narrow phones.** Acceptance: maintenance order, stores, damage, status, and primary action remain readable without clipped critical content.
- **Prompt 604 — [EXTEND] Make maintenance work in short landscape.** Acceptance: every step and result is reachable with intentional scrolling and no obscured control.
- **Prompt 605 — [EXTEND] Make DRADIS responsive.** Acceptance: group-local ships, transit samples, parked craft, and hidden contacts remain truthful across supported orientations and sizes.
- **Prompt 606 — [EXTEND] Make shuttle travel touch-operable.** Acceptance: departure, destination, retarget, dock, park, and denial use 44px targets without hover or precision drag.
- **Prompt 607 — [EXTEND] Make jump controls keyboard-complete.** Acceptance: digit editing, lock, power rail alternative, submission, pending, denial, success, and recovery work without a pointer.
- **Prompt 608 — [EXTEND] Own dialog focus correctly.** Acceptance: settings, danger confirmations, private results, facilitator calls, and endgame dialogs trap/restore focus and announce purpose.
- **Prompt 609 — [EXTEND] Announce live changes once.** Acceptance: phase, attack, parking, denial, threshold, and ending updates use appropriate live regions without listener-repeat noise.
- **Prompt 610 — [EXTEND] Honor reduced motion globally.** Acceptance: all authoritative information remains while flashes, sweeps, transitions, and continuous effects are removed or reduced.
- **Prompt 611 — [EXTEND] Distinguish status without color alone.** Acceptance: danger, damage, privacy, offline, pending, and success use text/icon semantics and verified CIC contrast.
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
- **Prompt 638 — [PROVE] Exercise the 20-player target.** Acceptance: one deterministic expansion roster records join, cast, heartbeat, listener, action, and reconnect evidence without claiming support beforehand.
- **Prompt 639 — [PROVE] Exercise the 60-browser target.** Acceptance: an isolated 15-minute run records heartbeats, listeners, concurrent actions, contention, reconnect, 429/unavailable recovery, usage, and cost.
- **Prompt 640 — [PROVE] Publish capacity conclusions.** Acceptance: supported envelope, failed thresholds, retry guidance, cost, and follow-up work reflect measurements rather than the nominal target.
- **Prompt 641 — [PROVE] Run a complete base-game playthrough.** Acceptance: six core ships and two facilitators progress from lobby through maintenance, jump, scout, mission, combat, deduction, crisis, and debrief.
- **Prompt 642 — [PROVE] Run a complete Capybara playthrough.** Acceptance: both roles, Scrap, Macaw, Boa, d8 targeting, mission, combat, jump, and one candidate path complete.
- **Prompt 643 — [PROVE] Run a complete split-fleet playthrough.** Acceptance: independent jumps, contacts, communications, pursuit, taxi, local actions, rejoin, and failure recovery remain correct.
- **Prompt 644 — [PROVE] Run a complete shuttle-airspace playthrough.** Acceptance: every craft type travels, docks, transfers/acts, appears on DRADIS, parks under each restriction, and recovers after reconnect.
- **Prompt 645 — [PROVE] Run a complete Wolf attack playthrough.** Acceptance: private prep, targeting, all ranges, fighters, boarding, damage, casualties, salvage, repair, returning threats, and aftermath resolve.
- **Prompt 646 — [PROVE] Run a complete away-mission playthrough.** Acceptance: eligibility, private cards, distribution, discards, placement, bonuses, totals, rewards, failure, overrun, drop-off, and reconnect resolve.
- **Prompt 647 — [PROVE] Prove Ancient Jump Ring success.** Acceptance: discovery, research, repair, contribution uniqueness, per-ship fuel, passage, sabotage call, and debrief complete.
- **Prompt 648 — [PROVE] Prove Deep Nebula success and loss.** Acceptance: hidden scout bonus, one lost ship, later bonus, one successful ship, fleet-success policy, and debrief complete.
- **Prompt 649 — [PROVE] Prove Ancient Space Station success.** Acceptance: arrival pressure, repeated attacks, liberation, 18 Reactor power, activation, and debrief complete.
- **Prompt 650 — [PROVE] Prove terminal failure and recovery paths.** Acceptance: pursuit 10, total loss, destroyed ship, escape pods, evacuation, mutiny, arrest deadline, abandoned candidate, and unresolved call cannot orphan play.
- **Prompt 651 — [PROVE] Run the final release-readiness audit.** Acceptance: every prompt has evidence/status; all roles, vessels, craft, candidate paths, privacy, accessibility, resilience, security, capacity, version, changelog, and docs gates are green; no placeholder control remains.

The backlog contains **703 independently executable prompts** in this
snapshot: 651 base IDs plus 52 lettered child IDs placed beside their closest
dependency. The current evidence classification is **168 `[PRESERVE]`, 83
`[EXTEND]`, 377 `[NEW]`, 52 `[PROVE]`, and 23 `[DECISION]`**. That distribution
is the practical consequence of starting from the existing application rather
than pretending it is empty. It is a reviewable snapshot, not a scope promise:
reclassify prompts as `main` advances, retain completed IDs, add a suffix when a
red test proves two independent outcomes, and never renumber completed prompts
to make the total look tidy.

## Current vertical slice — emergency timer pause

**Objective:** give an authenticated GM a deliberately difficult, auditable
way to hold the live turn clock during a genuine emergency, then resume it
without losing elapsed time.

**Source and product decision:** the printed rules define timed Team and
Coordination phases and facilitator-announced transitions, but do not define a
pause action. This slice is therefore an explicit facilitator-only product
decision layered on the server-owned phase clock; it does not add a new player
movement exception or alter the printed phase lengths during ordinary play.

**Contract:** the session stores an optional paused phase readout with the
active window, frozen remaining milliseconds, and pause instant. A callable
accepts only an active GM instance, current turn, and boolean desired state;
the transaction rejects stale, expired, Turn 0, closed, non-GM, and foreign
instance requests, writes one member-visible timer event for each actual state
change, and treats a repeated desired state as idempotent. Every connected
console shows the emergency hold in its timer instrument and fleet broadcast.

**Acceptance:** the GM console exposes one square emergency interlock whose
first and second clicks only advance an explicit three-click sequence; the
third click pauses or resumes the server clock. The button is unavailable
without a live timer or GM connectivity, and all three clicks are reset when
the authoritative turn or pause state changes. The phase display remains
frozen while paused, resumes with the exact hold duration, and never creates a
second client-owned clock.

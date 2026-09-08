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

**Given** one or more ships jump away while others remain behind, **then** each
group has its own location and pursuit state, local DRADIS shows only the
contacts that have arrived in that group, cross-group communication is blocked,
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

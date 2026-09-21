# Shared console architecture

Every fleet role uses the same ship console base. Every shuttle uses the same
shuttle console base. A vessel configuration modifies its base; it does not
copy it. This applies to future consoles as well as the current fleet.

## Where changes belong

| Concern | Single shared owner |
| --- | --- |
| Ship identity and colors, roles, initial resources, damage deck, approved census track and specifications | One definition per ship in `src/data/vessels/<ship-id>.ts` |
| Shuttle identity, branding, initial docking and optional equipment | `src/data/vessels/<shuttle-id>.ts` |
| Definition types and common defaults | `src/data/vessels/templates.ts` |
| Fleet registration and lookups | `src/data/ships.ts` and `src/data/shuttles.ts` |
| Ship guards, identity layout, stores, census, shuttlebay and observer behavior | `src/routes/ShipConsole.tsx` |
| Role workspace selection | `src/components/FleetConsoleWorkspace.tsx` |
| Base role header, telemetry layout and page controls | `src/components/RoleConsoleTemplate.tsx` |
| Fleet command wording, core telemetry and status strip | `src/components/FleetRoleConsoleTemplate.tsx` |
| Shuttle guards and role selection | `src/routes/ShuttleConsole.tsx` |
| Shuttle layout, position display and capability slots | `src/components/ShuttleConsoleTemplate.tsx` |

The existing resources, population and role catalogs are derived views of the
vessel definitions. Consumers keep importing those public catalogs; editing a
ship's values no longer requires updating each catalog separately.

Damage decks use the same shared ship definition. Each card identifies its
matching system, and may declare the printed recycle-after-resolution rule.
The Cloud Functions catalog remains an independent authority boundary: a
server-side draw records the damaged system in shared session state and writes
an audit event. Clients may display that state but never choose a card, mark a
system damaged, clear damage, or declare a ship destroyed directly. GM repairs restore all systems and the full deck without restoring casualties.
The maintenance panel exposes GM-only random damage and repair controls.

## Adding a ship or role

Create a vessel file using `defineShip` and register it in `SHIPS`. Declare its
roles in that file; their ship IDs are assigned by the factory. Supply only
approved resources, specifications and population tracks. Missing
specifications and tracks remain absent. Add a new ship ID to the typed role
catalog when introducing a new ship.

Fleet role content plugs into `FleetConsoleWorkspace` and uses
`FleetRoleConsoleTemplate` for the Admiral-derived command header, core
telemetry and console-status wording; that component extends
`RoleConsoleTemplate` for the base chrome. AEGIS retains its Admiral and Wing
Commander modules, but their fleet-wide presentation stays in the shared
template; the Executive Officer has a battle-sheet reference. Other roles use
`FleetSystemsWorkspace`, with ship systems and initial maintenance schedules
in each vessel definition and role procedures in `roleProcedures.ts`. Joint
Engineering switches between its two assigned ships using the same workspace.
Ship systems are embedded in the numbered maintenance path through the shared
`MaintenanceSystems` component: Storage at 1, rations at 2, unrest at 3,
rioting at 4, Reactor and production at 5, both shuttle bays at 6. Vessel definitions declare each system's timing. FTL, Wolf Attack and
passive systems retain their own sections outside the numbered path. Preserve
this order when stacking the layout on smaller screens. Role procedures retain
their own page. Verify layout details against the authorized private source
library; do not commit or link that source material here.

All seven fleet ships have approved census tracks from the original A3 ship
sheets (including the Capybara expansion). Each ship definition owns its client
track; the independent server catalog enforces the same printed values and
starred thresholds. GM movement uses the existing authoritative step controls
and per-GM acknowledgement flow. Do not interpolate missing population values.

Maintenance and damage are server-authoritative across all seven fleet ships.
`runMaintenance` advances a per-ship revision inside a transaction: storage,
rations, unrest, riot damage and casualties, charge replacement, refuelling,
and explicit completion. AEGIS resolves Shuttle Bay Zeta at numbered step 6,
then Shuttle Bay Omega at numbered step 7. Each bay can refuel at most one
eligible docked craft for one host fuel, and maintenance cannot end until Omega
has resolved or been explicitly skipped. The numbered sequence is authoritative;
the conflicting Omega body label remains recorded as erratum `AMB-04` in
`IMPLEMENTATION_CONTRACTS.md`.
Whenever a gameplay step or control applies ship damage, its crew-visible outcome
must name the damage card that was drawn and the affected system at that point
of resolution. It must also state when armour absorbed and recycled the card,
when a triggering check failed and caused no damage, or when destruction meant
that no card remained instead of inventing a draw. Preserve the server-written
damage-draw audit record and link gameplay results to it by ID. Connected session
members may read completed draws; undrawn deck order remains server-only.
Shared snapshots retain progress, results and charges across roles and reloads.
Research and charged-console production/combat outcomes remain table-resolved.
The current ration choices use the initial printed schedules; replacement
schedules at population thresholds still require facilitator adjudication.

Ordinary fleet ships have one maintenance shuttle bay. During the final
refuelling step, that bay can refuel at most one eligible shuttle currently
docked at the acting ship, spending exactly one unit of that host ship's fuel.
A damaged bay cannot refuel a shuttle. The server validates the complete
authoritative docking row, active ship roster, active craft ownership, current
maintenance revision, host stores, and prior fuel state in the same transaction;
unknown, duplicate, malformed, in-transit, wrong-host, already-fuelled, or stale
choices fail before any state changes. AEGIS and Capybara keep their separately
encoded bay contracts. The active crew sees a damaged-bay explanation beside
the disabled refuelling choice, while the maintenance continuation remains
available so the ship can resolve the step without fuelling.

Each ship has one shared docking manifest: an immutable history whose rows name
the shuttlecraft and the shuttleport where it docked. Current occupancy,
maintenance rules and departure events stay out of this panel. The Press
shuttle declares the civilian access hatch as its port and remains excluded
from mechanical dock occupancy. Maintenance refuelling uses the authoritative
docking list. No new shuttle craft or travel controls are added by the
maintenance workflow.

A new workspace kind belongs in the template's typed workspace selection and
the central renderer. Keep workspace availability checks in sync. Never copy
`ShipConsole` or make a separate route component for each ship role.
Cross-ship Joint Engineering stations are not individual ships; their existing
station shell remains, and future role gameplay uses the shared role workspace.

## Adding a shuttle

Create a vessel file using `defineShuttle` and register it in `SHUTTLECRAFT`.
Provide its actual captain role and route through `ShuttleConsole`. A shuttle
starts with no optional capabilities and no assumed dock. Declare equipment
explicitly and register any new capability implementation in the typed
capability map in `ShuttleConsoleTemplate`. Each capability declares workspace
or instrument placement there. Role actions use `RoleConsoleTemplate` beneath
the captain assignment in the shared ship gameplay pane; status and auxiliary
instruments remain in the DRADIS rail.

The initial manifest and visits are derived from the vessel definition. A
missing server docking field uses that initial manifest for legacy sessions;
an explicitly empty server list means no craft is docked. The server remains
authoritative for docking and every future travel action.

Before an active cycle advances into its next Team Phase, the server requires
every enabled shuttle to have exactly one complete parked docking row at a
legal active host. Missing, duplicate, unknown, in-transit, inactive-host, and
role-incompatible rows stop the transition before any state changes. There is
no inferred facilitator exception: a future exception must be explicit server
state with its own validation and audit contract.

Shuttle custody keeps the printed owner separate from the current holder. An
owner or live facilitator may hand a shuttle to a connected player in the
owner's current fleet group, and the server resolves that holder's active ship.
The holder revision and matching dock move in one transaction, while direct
client writes to either field remain denied. Reclaim uses the same path and
returns the shuttle to the printed owner's authoritative ship location.

Airspace Control and shuttle travel are server-authoritative shared systems.
Restricted airspace prevents ordinary between-ship departure until airspace
opens; accepted departure, transit, and arrival commands bind the current
holder, fleet group, cycle, route, custody revision, and live phase. Do not add
a client-only travel or docking mutation.

A departure request authorizes one move without removing the shuttle from its
current dock. Only the current holder can request it during the open-airspace
Coordination window, and the origin and destination must be distinct active
ships in that holder's server-owned fleet group and legal for that craft. A
second request remains blocked until the accepted request enters transit or is
otherwise cleared by server authority.

## Validation and authority

Follow the test-first policy in `CLAUDE.md`. Template tests exercise a second
shuttle with distinct identity, transit state and opt-in equipment; route tests
cover the real fleet roles, role ownership and navigation. Keep those checks
when extending either base, including narrow, wide and short viewport checks
for layout changes.

These definitions describe the client presentation and initial read fallbacks.
They do not grant authority: server catalogs, callable validation and Firestore
denials remain independent security boundaries. A new gameplay capability or
ship requires the corresponding server policy and denial tests before players
can mutate it. Do not import UI definitions or React into Cloud Functions.

### Emergency bridge confetti authority

The non-AEGIS fleet ships share one server-authoritative Emergency Bridge
Confetti Dispenser contract. The SNN newspaper shredder, the AEGIS fleet-red-
alert instrument, and the GM finale are separate effects; they do not inherit
the dispenser's once-per-ship state, approvals, or audit behavior.

A dispenser activation requires a currently configured, live console role on
the target ship, including the established short-crew relief rule. When the
two-officer override applies, every stored approval must still name the same
currently live officer and role at activation time. Stale approvals are
discarded before deciding whether the dispenser may fire.

Turn 0 remains locked. A successful transaction marks that ship's dispenser
spent, writes the signal and GM event with the current actors, and prevents
competing or retried requests from creating a second firing. Clients may
display the result but may not write, reset, or forge the signal, approval,
spent state, or event. The finite burst, command cover, and reduced-motion
behavior remain presentation requirements in
[AESTHETICS.md](AESTHETICS.md#contact-plot--threat-board).

See [SHIP_TEMPLATE.md](SHIP_TEMPLATE.md),
[SHUTTLE_TEMPLATE.md](SHUTTLE_TEMPLATE.md) and [AESTHETICS.md](AESTHETICS.md) for
visual and gameplay requirements.

## Brief command coalescing

The GM fleet-store, census, and unrest controls may collect a rapid run of
clicks for a **250 ms** quiet window. This is a narrowly scoped transport
optimization, not a general client-side write policy: show the local, reversible
counter preview immediately, then submit one ordered callable command in a
transaction. The server remains the only shared-state authority; its response
and live snapshot replace the preview.

Only coalesce repeated input for the same counter. Keep every `-1` / `+1` step
in order, bound the batch, and never replace it with a net total: unrest and
population thresholds are game events that can make later clicks illegal. Stop
the local preview at a threshold and wait for the authoritative GM alert.

Do not defer a command merely to make the UI feel faster when it chooses
randomness, consumes a one-shot action, advances a phase, relies on a revision,
or has an irreversible gameplay consequence. Those controls should give
immediate local feedback about their pending state, while their result remains
server-confirmed.


Fleet damage decks live exclusively in `functions/src/shipDamage.ts` so clients
never receive unrevealed cards. AEGIS armour retains its recycling and casualty
exception. Ordinary damage advances the printed survivor track, with GM alerts
at starred thresholds. An empty deck destroys the ship on the next draw.
The reference errata are applied: Refinery 124 Water Reclamation is 5♦ by
elimination; expansion Capybara Scrap Refinery uses 7♠, disregarding the stray 5♦.


Ship role browsing retains the player's assigned role. A connected ship officer
may operate another console on that ship only while any role in the ship's full
configured complement is missing from the connected crew. Disabled/unfilled roles
remain viewable for relief aboard the assigned ship. Live roster updates change
the view's access; callables independently recheck authority inside transactions.
GM observers use the same role workspace with a local role selector and Read /
Write toggle; they never claim the viewed role, and begin each visit read-only.

A role route is a viewing request, never an authority claim. The server binds a
player's core console activation to the single matching `assignedRoleId` or
claimed `seatId`, and fails closed when both pointers exist but disagree. A
deep link to another enabled role therefore remains read only and cannot change
`activeConsoleRoleId`. Press keeps its separate unassigned-player contract, and
GM intervention keeps its live-instance and ship-scoped write-grant contract.
Action payload role and vessel IDs are always checked against the resulting
server-owned active console; same-ship short-crew relief is the only ordinary
player exception and is recalculated from the live configured crew.

### Replacement-role workspace boundary

The seven replacement roles use one shared console shell at
`/replacement/:roleId`. The fleet roster offers that route only for the live
player's exact `replacementRoleId`. The route independently requires a player
projection in console mode, the same canonical replacement role, and a cleared
`activeConsoleRoleId`; a mismatched deep link or stale core-console pointer
returns to the fleet roster.

The shell may display the reassigned role, its printed station or vessel, the
operator, and whether the console is ready. It must not invent a gameplay
action, target, resource, cost, roll, or outcome. Later prompt owners add real
controls only after their corresponding server authority exists. Extra-ship
captain assignments remain outside this shell and keep their vessel-specific
routes.

### Private Intelligence Agent workspace

The Intelligence Agent procedure lives inside the existing holder-only loyalty
panel. Its target roster uses the ordinary member projection, so it contains
only connected players in the holder's current server-owned fleet group. The
client sends a target identity and cycle checkpoint; it never sends an answer,
accuracy choice, loyalty kind, or suspicion change.

The callable owns the one-per-cycle limit and random result. Its player-facing
projection is keyed to the current holder and contains only the reported
alignment. Hidden truth and the accuracy draw remain in a server-only audit
collection. Any future investigation effect must extend that transaction and
private boundary rather than deriving hidden truth in the browser.

Maintenance records private per-step undo snapshots, denied to all client SDKs.
GM rollback restores the previous step's effects only if later changes would not
be overwritten, and always advances the revision. Undo is limited to recorded
steps in the current turn; cycles started before undo recording was deployed
have no earlier snapshots. Damage and maintenance audit history remains intact.

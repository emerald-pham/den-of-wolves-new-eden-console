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
their own page. See the [original ship-sheet layouts](reference/den-of-wolves-new-eden/references/REFERENCE_ONLY_SHIP_LAYOUTS.md).

All seven fleet ships have approved census tracks from the original A3 ship
sheets (including the Capybara expansion). Each ship definition owns its client
track; the independent server catalog enforces the same printed values and
starred thresholds. GM movement uses the existing authoritative step controls
and per-GM acknowledgement flow. Do not interpolate missing population values.

Maintenance and damage are server-authoritative across all seven fleet ships.
`runMaintenance` advances a per-ship revision inside a transaction: storage,
rations, unrest, riot damage and casualties, charge replacement, refuelling,
and explicit completion. Both AEGIS bays resolve in the final refuelling step.
Shared snapshots retain progress, results and charges across roles and reloads.
Research and charged-console production/combat outcomes remain table-resolved.
The current ration choices use the initial printed schedules; replacement
schedules at population thresholds still require facilitator adjudication.

Each ship has one shared docking manifest: an immutable history whose rows name
the shuttlecraft and the shuttleport where it docked. Current occupancy,
maintenance rules and departure events stay out of this panel. The Press
shuttle declares the civilian access hatch as its port and remains excluded
from mechanical dock occupancy. Maintenance refuelling uses the authoritative docking list. No new shuttle
craft or travel controls are added by the maintenance workflow.

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

See [SHIP_TEMPLATE.md](SHIP_TEMPLATE.md),
[SHUTTLE_TEMPLATE.md](SHUTTLE_TEMPLATE.md) and [AESTHETICS.md](AESTHETICS.md) for
visual and gameplay requirements.


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

Maintenance records private per-step undo snapshots, denied to all client SDKs.
GM rollback restores the previous step's effects only if later changes would not
be overwritten, and always advances the revision. Undo is limited to recorded
steps in the current turn; cycles started before undo recording was deployed
have no earlier snapshots. Damage and maintenance audit history remains intact.

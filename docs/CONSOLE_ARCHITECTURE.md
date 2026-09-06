# Shared console architecture

Every fleet role uses the same ship console base. Every shuttle uses the same
shuttle console base. A vessel configuration modifies its base; it does not
copy it. This applies to future consoles as well as the current fleet.

## Where changes belong

| Concern | Single shared owner |
| --- | --- |
| Ship identity and colors, roles, initial resources, approved census track and specifications | One definition per ship in `src/data/vessels/<ship-id>.ts` |
| Shuttle identity, branding, initial docking and optional equipment | `src/data/vessels/<shuttle-id>.ts` |
| Definition types and common defaults | `src/data/vessels/templates.ts` |
| Fleet registration and lookups | `src/data/ships.ts` and `src/data/shuttles.ts` |
| Ship guards, identity layout, stores, census, shuttlebay and observer behavior | `src/routes/ShipConsole.tsx` |
| Role workspace selection | `src/components/FleetConsoleWorkspace.tsx` |
| Role header, telemetry layout and page controls | `src/components/RoleConsoleTemplate.tsx` |
| Shuttle guards and role selection | `src/routes/ShuttleConsole.tsx` |
| Shuttle layout, position display and capability slots | `src/components/ShuttleConsoleTemplate.tsx` |

The existing resources, population and role catalogs are derived views of the
vessel definitions. Consumers keep importing those public catalogs; editing a
ship's values no longer requires updating each catalog separately.

## Adding a ship or role

Create a vessel file using `defineShip` and register it in `SHIPS`. Declare its
roles in that file; their ship IDs are assigned by the factory. Supply only
approved resources, specifications and population tracks. Missing
specifications and tracks remain absent. Add a new ship ID to the typed role
catalog when introducing a new ship.

Fleet role content plugs into `FleetConsoleWorkspace` and uses
`RoleConsoleTemplate` for chrome. AEGIS retains its Admiral and Wing Commander
modules; the Executive Officer has a battle-sheet reference. Other roles use
`FleetSystemsWorkspace`, with ship systems and initial maintenance schedules
in each vessel definition and role procedures in `roleProcedures.ts`. Joint
Engineering switches between its two assigned ships using the same workspace.
Charges, damage, research and procedure outcomes remain table-resolved until
their individual gameplay implementation passes.

Each ship has one shared docking manifest. Its mechanical bay entries derive
from the vessel systems, retaining each bay’s refuelling allowance. A shuttle
with `dockingEntrance: 'press'` remains in the visible manifest and visit log
but is excluded from mechanical dock occupancy. This adds no shuttle craft or
travel/refuelling mutations.

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
capability map in `ShuttleConsoleTemplate`.

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

# SNN shuttle console template

Implementation and future extensions must use the [shared console architecture](CONSOLE_ARCHITECTURE.md).

Status: design specification for implementation. The SNN Independent Press
Shuttle is the reference for later shuttlecraft. This template extends the
shared console language in
[AESTHETICS.md](AESTHETICS.md#shuttlecraft-console-parameters) and the
authoritative travel model in [SHUTTLECRAFT.md](SHUTTLECRAFT.md).

Its presence documents the required shape of future shuttle consoles; it does
not mean that shuttle travel, retargeting or every module described here is
implemented.

## Reference identity

Keep the visible return control and present shuttle identity in this order:

```text
UNAFFILIATED INDEPENDENT PRESS // SNN
SNN — SYSTEM NEWS NETWORK
UNAFFILIATED INDEPENDENT PRESS SHUTTLECRAFT
Carries the System News Network press officer between ships of the survivor fleet.

Your Title: Press Officer // Captain
```

The title line reflects the actual viewing role. `Press Officer // Captain` is
the SNN example, not fixed copy for every shuttle. A later craft supplies its
own operator, short code, console name, vessel type, factual description and
captain role.

Use the existing mono typography, amber labels, cyan live values, hairline
rules and square geometry. Decorative craft identity may appear as low-contrast
typographic line-work behind instruments, but it is non-interactive, hidden
from assistive technology and never substitutes for a status value.

## Console media reference

The wide layout uses the same issued-console composition as a capital ship.
This diagram defines regions and reading order, not exact pixel dimensions:

```text
┌─ LEAVE SHUTTLE ───────────────────────┬─ COMPACT DRADIS ─┐
│ OPERATOR // CODE                 │                  │
│ CONSOLE NAME                    │ host-centred     │
│ VESSEL TYPE                     │ when docked      │
│ Factual description             ├─ NAVIGATION ──────┤
│                                 │ live location or │
│ Your Title: Role // Captain     │ transit state     │
│ ROLE CONSOLE WORKSPACE          ├─ INSTRUMENT ──────┤
│ Dispatch desk / role actions    │ optional, craft- │
│                                 │ specific module  │
└─────────────────────────────────┴──────────────────┘
```

At phone widths, leave absolute positioning and stack the same regions in DOM
order: compact DRADIS, identity and role workspace, then navigation and optional
instrument modules. Role capabilities sit below the captain assignment in the wide ship
gameplay pane, using RoleConsoleTemplate. Instrument capabilities stay in the
side rail. The whole workspace may scroll. Every status and control must remain
reachable at 320px width, in short landscape viewports and after rotation.

## Required modules

Every shuttle console has these modules:

1. **Identity.** Operator, craft identity, description and the current
   captain's title follow the order above.
2. **Compact DRADIS.** When docked, the host ship occupies the origin and the
   shuttle is not a separate contact. In flight, the shuttle is an ordinary
   sampled contact under the shared detection and ping rules.
3. **Navigation and status.** Show the authoritative docked host or transit
   state. The current SNN baseline reads `Shuttle location // Docked // Dione`.
   Do not invent speed, fuel, heading, range or ETA values.
4. **Return navigation.** GM Observer views expose a visible `Leave shuttle`
   route to console selection. A player holding the shuttle captain role stays
   aboard until they explicitly release the role through the established
   settings flow.

Keep a shuttle console on one page. Real modules share one scrolling workspace;
do not add secondary pages or placeholder tabs for systems that do not exist.

## Optional capability slots

Capabilities are opt-in equipment, never defaults inherited by every shuttle.
Each must describe a real game action and its authority, persistence and audit
behavior before implementation.

The SNN reference supplies a server-authoritative fleet dispatch desk and one
reusable newspaper-confetti evidence shredder. Only the active Press Officer can
publish or dismiss dispatches. Each dispatch carries the fixed `SNN //` prefix,
joins the ordered set of active press copy across the fleet ticker, and remains
active until the Press Officer dismisses it individually. The dispatch desk
shows that complete active set even while it reports a publish or dismissal
result. The evidence shredder may fire repeatedly, honors reduced motion and does not create GM activity
log entries. It is deliberately different from the fleet ships' shared,
server-authoritative, once-per-ship Emergency Bridge Confetti Dispenser.
Ordinary shuttlecraft receive neither device unless their specification says
so.

Avoid decorative gauges or inactive controls. If a future capability is not
implemented, omit its module instead of displaying a disabled fiction.

## Travel state and authority

Use [SHUTTLECRAFT.md](SHUTTLECRAFT.md) as the canonical worldspace and travel
contract. The template only defines its presentation boundary: navigation
reports authoritative docked/transit state, does not invent telemetry, and does
not expose a travel ledger unless the craft specification grants one. Clients
may project motion, but the server decides movement, retargeting, docking,
arrival, timestamps, and visit-log entries.

## New shuttle specification checklist

Before implementing another shuttle, document:

| Field | Requirement |
|---|---|
| Stable ID | Lowercase identifier used by routing and session state |
| Name and short name | Full manifest label and compact label |
| Console name | Primary player-facing heading |
| Operator | Full name and short code |
| Vessel type | Factual craft classification |
| Description | One concise operational sentence |
| Captain role | Existing or separately specified role ID and displayed title |
| Initial location | Authoritative host ship or defined transit state |
| Capabilities | Explicit modules, including authority and audit behavior |
| Travel ledger | Whether one exists, who may view or lock it, and retention rules |

Do not copy SNN identity, captain role, equipment or initial Dione docking into
another shuttle without a supplied design decision.

## Implementation acceptance checks

Implementation must demonstrate:

- Identity content follows the defined order and displays the actual role.
- Docked and in-transit states use server authority and truthful DRADIS origin.
- Clients cannot forge movement, docking, arrival or travel-log records.
- The visible return path behaves correctly for GM and role-holding players.
- Only explicitly assigned capability modules render for a craft.
- No invented telemetry or unimplemented controls appear.
- Content and controls remain accessible on narrow, wide and short screens.
- Reduced-motion preferences apply to optional animated capabilities.

Use the repository's [test-first policy](../CLAUDE.md#1-test-first-for-code) when
implementing these behaviors.

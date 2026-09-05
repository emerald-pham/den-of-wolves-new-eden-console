# New Eden aesthetic profiles

Read this before creating or changing UI. Reuse the tokens in
src/styles/cic.css and the existing components before inventing a new pattern.
The reference implementations are src/components/ContactPlot.tsx,
src/components/Intrusion.tsx and src/routes/ArrivalDisplay.tsx.

## CIC / default interface

A worn military information terminal, seen in a dark room: black ground, amber
frame chrome, cyan instrumentation, bone-white type. Dense information,
deliberate empty space, thin ruled divisions, hard square corners. Avoid glossy
cards, neon gradients, rounded pills, drop shadows used as depth, decorative
charts that imply real data, and flashing.

**Colour carries meaning. Do not mix the roles.**

| Role | Tokens | Used for |
|---|---|---|
| Ground | `--cic-void`, `--cic-panel` | canvas and surfaces |
| Structure | `--cic-amber`, `--cic-amber-glow`, `--cic-amber-dim`, `--cic-rule` | frames, rules, captions, labels, the edges of things |
| Instrumentation | `--cic-cyan`, `--cic-cyan-hot`, `--cic-cyan-dim` | anything reading a measurement back to you |
| Type | `--cic-ink`, `--cic-muted` | primary and secondary text |
| Threat | `--cic-hostile`, `--cic-ember`, `--cic-blood`, `--cic-scream`, `--cic-danger` | only when something hostile is happening |

Amber is never a highlight for its own sake and cyan is never structure. If a
value changes, it is cyan; if it frames or labels, it is amber.

Type: `--cic-mono` for every label, control and readout caption, always
uppercase with wide tracking; `--cic-display` for manifest numbers and
cinematic headlines. System fonts only, no external font dependency.
`--cic-radius` is `0` — nothing in this interface is rounded.
`--cic-space` for fluid spacing.

Shared utilities, all in src/styles/cic.css:

- `.cic-frame` — the one container. A hairline `--cic-rule` border over
  `--cic-panel`, with corner brackets drawn as eight positioned
  `linear-gradient` background layers on `::before`. Brackets are painted, not
  marked up, so a frame adds no DOM, joins no accessibility tree, and cannot
  leak into a control's accessible name. Bracket length is `--cic-bracket`.
- `.cic-ticks` — the segmented divider strip, and the interface's only
  ornament: `repeating-linear-gradient(90deg, amber 0 3px, transparent 3px 8px)`.
  Also available inline as an `::after` on `.arrival-topline` and `.eyebrow`.
- `.cic-overline` — small amber uppercase mono caption.
- `.cic-text-button` — borderless cyan control, 44px minimum.

Arrival readouts show a changing value with its descriptive label underneath:
SHIPS IN CONVOY, CREW, and WOLF AMONG US, in that order. Keep these labels
visible at every viewport size. Hide the sequences of possible numbers; do not
confuse those sequences with the descriptive labels. Do not show a SCENARIO
SIGNAL footer. Avoid franchise-specific terminology such as DRADIS and
COLONIAL anywhere a player can read it — including decorative text inside the
contact plot; CIC is permitted. Use a three-column display on wide screens and
compact stacked readouts on phones. Preserve native buttons, labels, visible
keyboard focus, error announcements, and at least 44px touch targets.

## Contact plot / threat board

`<ContactPlot hostile={boolean} />` — src/components/ContactPlot.tsx with
src/styles/plot.css. Currently behind the launcher and the not-found screen.
Reusable on any route: it is a fixed, `pointer-events: none`, `aria-hidden`
background layer at `z-index: 0` and nothing else on the page needs to know
about it.

**It is a sphere, not a floor.** A spherical scan is a two-dimensional circle
turning through a three-dimensional volume. Contacts hang anywhere inside that
volume. Do not rebuild this as a tilted ground plane with a rotating wedge —
that is a different, flatter instrument.

### How to recreate it

1. **Layer.** `position: fixed; inset: 0; z-index: 0; overflow: hidden;
   pointer-events: none`, centred with grid. Put `perspective` (≈130vmin) and
   `perspective-origin: 50% 44%` *here*, not on the rig — opacity or a mask on
   the same element that carries `transform-style: preserve-3d` silently
   collapses the whole sphere back to flat.
2. **Rig.** A square `var(--plot-size)` box with `transform-style: preserve-3d`
   and `transform: rotateX(14deg)`. The small tilt is load-bearing: seen dead
   on, a wireframe globe reads as flat concentric circles.
3. **Size it to the short edge.** `--plot-size: min(94vmin, 128vw)`. Larger and
   the silhouette never closes on screen, so it reads as loose arcs.
   `--plot-radius: calc(var(--plot-size) / 2)` is what every length multiplies.
4. **Cage.** Bordered circles, `border-radius: 50%`, `inset: 0`.
   - Meridians: `rotateY(turn)` at 0/30/60/90/120/150°. They all meet at the poles.
   - Parallels: `rotateX(90deg) translateZ(lift × radius) scale(girth)` where a
     ring at latitude *p* has `girth = cos(p)` and `lift = sin(p)`; use ±60, ±30, 0.
   - Limb: one untransformed circle at higher contrast — the silhouette.
5. **Sweep.** A disc — `border-radius: 50%`, faint radial fill, bright rim —
   animated `rotateY(0 → 360deg)` over `--plot-turn`. A second disc animates
   `rotateX` at 1.7× the period so the scan is spherical rather than a spinning
   floor. Edge-on it compresses to a bright line, which is correct.
6. **Contacts.** The component converts spherical coordinates to unitless
   custom properties, and the stylesheet only ever multiplies by the radius:

   ```
   x = range · cos(elevation) · sin(bearing)
   y = −range · sin(elevation)      (screen Y is down)
   z = range · cos(elevation) · cos(bearing)
   ```

   Each contact is a zero-size anchor at the centre, `translate3d(x·r, y·r, z·r)`.
   Perspective then does the depth work for free — a track on the far side is
   genuinely further from the camera and paints smaller. No billboarding is
   needed because nothing rotates the contact itself.
   Also passed: `--depth` = `(z + 1) / 2` for opacity falloff, `--drop` =
   `|y|` and `--flip` = ±1 for the altitude line down to the equatorial plane,
   and `--phase` = `(bearing mod 180) / 180`.
7. **Paint flare.** The sweep is a plane, so it crosses a bearing twice per
   turn: blips animate over `calc(var(--plot-turn) / 2)` with
   `animation-delay: calc(var(--phase) * var(--plot-turn) / -2)`, so each one
   flares as the disc reaches it.
8. **Contacts are hand-placed, never random.** A randomised board rearranges
   itself on re-render.

### Threat state

`data-hostile="true"` swaps `--plot-ink`/`--plot-hot` to the threat tokens,
drops `--plot-turn` from 14s to 3.4s, raises `--plot-glow` to 1, and adds the
INBOUND tracks, which close from the skin of the sphere to its centre over 5s —
matching the intrusion. The centre of the sphere is where we are.

### Motion

All movement is CSS: no render loop, no canvas, no timers. `data-still="true"`
(set from `prefers-reduced-motion`, and it only ever escalates to still) stops
the board dead rather than slowing it; the still selectors are written to
outrank the threat-state rules. Tuning knobs are `--plot-size`, `--plot-turn`,
`--plot-glow`, `--plot-ink` and `--plot-hot`.

## Intrusion / hostile takeover

`<Intrusion message="…" />` — src/components/Intrusion.tsx with
src/styles/intrusion.css. Reusable on any route; render it when something
hostile has the screen and unmount it when that ends.

Fullscreen and fixed at `z-index: 5`, but it is decoration: `pointer-events:
none`, `aria-hidden`, no dialog role, no focus trap, no sound. Whatever the
player was doing underneath keeps working, and the app header and the action
panel stay above it. Decorative overlines are amber-ember; the message is
`--cic-scream` so it stays legible, and all the red comes from its glow.

### How to recreate it

- **Keep the field black and the red concentrated.** A near-black radial base
  (`#080203f2` centre to `#030001bf` edge), thinner at the rim so the threat
  board keeps burning through around the message. Red spread evenly over the
  whole screen reads as pink fog, not as danger.
- **Blood vignette** on `::after`, transparent to 52% and `--cic-blood` beyond,
  breathing 0.42 → 0.78 over 2.6s `alternate`. Slow and narrow-band: a breath,
  not a flash.
- **Interference** on `::before` at 0.09: stationary red scanlines plus a
  diagonal streak pattern. Never randomised per frame, never strobed.
- **Colour split** on the message via `::before`/`::after` with
  `content: attr(data-text)` and `mix-blend-mode: screen` — hostile red at 0.8,
  cyan at 0.28, drifting one slow pass over 4.2s. Drawing the ghosts from a data
  attribute keeps the message in the DOM exactly once; make them real elements
  and every `getByText` against the message breaks.
- **Five seconds total**, including a 0.9-second entry and exit
  (`cic-transmission`, 18%/82% hold).

The launcher's schedule: first intrusion at 20 seconds, subsequent starts 60
seconds apart, chosen randomly without an immediate repeat. Text:
EARTH IS NOT FOR YOU / BE AFRAID / A COLD GRAVE AWAITS YOU. `ArrivalDisplay`
reports the intrusion up through an optional `onTransmission` callback, held in
a ref so a parent handing over a fresh closure cannot restart the timers.

Manifest values cycle in listed order every 10 seconds, with first changes at
10/13/16 seconds: 6,7,5,0,1,3,4; 20,18,8,6,0,21; and 1,?,2.
Resolve digits once over 1.1 seconds; never rapidly flicker.
Reduced motion starts paused and a new reduced-motion preference pauses ongoing
effects. Do not add a manual motion control. Clean up timers on exit.
These are conservative motion choices, not a medical guarantee.

## Every viewport

All screens must work on mobile, laptop, and desktop, in portrait and landscape,
including rotation while open. Use fluid sizing, safe-area padding, wrapping,
and document scrolling. Never lock orientation or clip controls to fit a fixed
height. Verify 320px phones, wide desktops, and short landscape viewports;
check controls during an intrusion and with reduced motion. The contact plot is
sized in `vmin`/`vw` so it reflows with the viewport and needs no breakpoint of
its own.

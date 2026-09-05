# New Eden aesthetic profiles

Read this before creating or changing UI. Reuse the tokens in
src/styles/cic.css and the existing components before inventing a new pattern.
The reference implementations are src/components/ContactPlot.tsx,
src/components/Intrusion.tsx and src/routes/ArrivalDisplay.tsx.

## The philosophy, and what it rules out

The reference is the Colonial fleet's displays in *Battlestar Galactica* (2003):
the CIC wall panels and station readouts — amber line art on black, hairline
rules, wireframe schematics, dense blocks of small monospaced type, an
occasional cold cyan trace where a value is live. Everything below is downstream
of that one image, and every rule in the profiles that follow is this philosophy
made specific. When a new screen has no precedent in this document, decide it
from these seven.

**1. It is BSG, not LCARS.** This is the trap, because the two look adjacent in
a thumbnail and are opposites in practice. LCARS is rounded elbows, pill blocks,
flat colour-coded slabs and a frame that swoops. Ours is drafting: every corner
is 90°, every division is a hairline rule or a tick strip, nothing is a
container with a personality. `--cic-radius` is `0` and it is never overridden.
If a new pattern would look at home in a Star Trek okudagram, it is wrong here.

**2. Borrow the grammar, and name the instrument honestly.** The look is a
reference; the words are ours, with two deliberate exceptions: CIC is an
actual naval term, and the fleet's spherical detection instrument is called
DRADIS because that is the clearest and most enjoyable name for it. Other
franchise proper nouns remain out of player-facing headings, status lines and
decorative readouts.

**3. The screen is an instrument, not a page.** Everything on it is a
measurement, the label of a measurement, or the frame around one. There are no
cards, no hero sections, no marketing rhythm. A player is reading a panel that
belongs to a ship, and the panel's job is to report.

**4. Drawn, not rendered.** Line art at hairline weight. Schematics rather than
illustrations, outlines rather than fills, type rather than iconography. No
gloss, no gradient used as material, no photographic texture.

**5. The room is dark and the panel is the only light.** Depth is glow and
contrast — a bright rim, a hot value, a dim rule — never a shadow cast under a
floating surface. A box-shadow with an offset says "this card hovers above the
page," which is a web idea; a box-shadow with no offset says "this is emitting
light," which is the whole premise.

**6. It was already running before the player arrived.** The interface is
built, issued and worn. It does not greet, onboard, congratulate or animate
itself into existence. Motion is a scan sweeping, a digit resolving, a lamp
changing state — the machine doing its job, not the interface performing.

**7. Density is earned, never faked.** BSG panels are dense because a warship
genuinely has that many readouts. Ours may be dense only where we have real
values to show. A chart, gauge or scrolling column that implies a measurement
the app does not actually hold is the one unforgivable move: it turns an
instrument into a screensaver, and once a player catches it, nothing else on
the screen is trusted either.

### Colour has one more role than the table says

The table below assigns amber to structure and cyan to instrumentation. Controls
are the gap it leaves, and the established answer is cyan: a control is the
place a value is read and changed, so it belongs with the instruments, which is
why `.cic-text-button` is cyan. Amber stays on the control's edges — border,
focus ring, label — because those are structure. So a button reads as a cyan
word inside an amber frame, and that pairing is deliberate rather than
decorative.

### How this is enforced

`src/styles/aesthetic.test.ts` checks the three rules a stylesheet can be
checked against without rendering it: colours are palette tokens or the
near-black of the ground, `border-radius` is only ever `0` or a full circle,
and box-shadows have no offset. It is a ratchet — it holds the line where it
is rather than passing judgement on what exists, and it carries a short,
annotated list of deviations that predate it:

- the connection lamp's green, which has no role in the palette;
- the settings dialog's depth shadow.

Both are findings, not precedents. Fix one and delete its line; do not add a
line without saying here which role the new value carries and why no token
could carry it.

The rest is prose because the rest needs eyes: whether a screen is dense with
real values or busy with fake ones, whether motion is a machine working or an
interface performing, is not something a regular expression can tell you.

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

Faction identity is a narrow exception on fleet-selection and joined-ship
screens. The `--cic-faction-*` tokens are sampled from the supplied flag PNGs
and may color a ship's nameplate, national rule and friendly DRADIS return.
They do not replace amber structure, cyan instrumentation or red threat state
elsewhere. This makes faction color informational rather than ornamental.
Shepherd is the deliberate contact-color exception: its DRADIS return is white
while its joined-ship identity remains Rosal red.

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
SHIPS IN CONVOY, PERSONNEL GRANTED CIC DATA ACCESS, and WOLVES AMONG US, in
that order. PERSONNEL GRANTED CIC DATA ACCESS is the 8–21 player-held posts—not
the roughly 200,000 souls in the fleet. Keep these labels
visible at every viewport size. Hide the sequences of possible numbers; do not
confuse those sequences with the descriptive labels. Do not show a SCENARIO
SIGNAL footer. Avoid other franchise-specific terminology anywhere a player
can read it, including decorative text inside the contact plot. CIC and DRADIS
are the deliberate exceptions. Use a three-column display on wide screens and
compact stacked readouts on phones. Preserve native buttons, labels, visible
keyboard focus, error announcements, and at least 44px touch targets.

## Contact plot / threat board

`<ContactPlot hostile={boolean} placement="field | inset | widget" size="<css length>" />`
— src/components/ContactPlot.tsx with src/styles/plot.css. `pointer-events:
none`, `aria-hidden`, and nothing else on the page needs to know about it.

**Assume the board is on screen at all times.** A screen decides how prominent
it is, never whether it is there. `placement="field"` (the default) is the
full-bleed fixed layer at `z-index: 0`; `placement="inset"` fills a positioned
parent instead, for a board sitting inside a panel, and `size` overrides the
diameter with any CSS length. Both keep identical geometry — only the diameter
and the framing change. Do not add a route that switches it off.

The compact shipboard plot sizes itself in container-query units, never
percentages. Its parent morphs between a full-viewport size container and the
corner instrument over one second, so entering or leaving a console changes the
scale continuously instead of crossfading the DRADIS. Keep this duration
isolated in `SHIP_PLOT_RESIZE_MS` so the experiment is easy to tune or revert.
During that second, the destination ship translates from its actual fleet
position into the origin and every other visible return shifts by the same
offset. The sweeps and acquisition observer stay paused until arrival.
The expanded shipboard plot is orientation-locked. Its dormant rotation path
transforms the complete rig—including returns, names and altitude lines—so the
whole instrument will move coherently if rotation is enabled in the future.
Keep the galactic orientation compass non-interactive and render it as a
three-dimensional wireframe instrument rather than a flat reset control.
Percentage translations on its zero-size contact anchors
resolve to zero and collapse every return onto the origin. Contact labels use
four stable corner anchors around their returns; bias them away from the plot
origin and alternate them near a centreline so neighboring names remain
readable without moving between sweeps. Group the returns in an isolated
foreground layer: their signed Z values still drive perspective, but far-side
ships must not sort underneath the rotating scan planes and disappear.

Apparent contact drift is a slow display estimate, not ship movement. Each
sweep advances a contact through a fixed bearing walk spanning no more than
two degrees; the contact is stationary between sweeps. Never modify the
canonical XYZ formation to produce this effect.

The GM console contains an inset fleet DRADIS and a visible button for every
available ship. Selecting a ship rebases only that GM device's view. Capybara
availability is shared session state, defaults on (including legacy sessions
with no stored setting), and can only be changed by an active GM instance.
Turning it off removes Capybara from the join roster and all DRADIS views.
Every perspective begins empty. Changing the reference ship restarts contact
acquisition, and returns appear only as that new view's sweep reaches them;
resizing the same view does not restart its scan.

GM registration and Setup share one server-authoritative lock. Show its open
or closed padlock icon and text state on the role-selection screen; non-GMs see
the control greyed out. Existing GM instances retain console access so they can
unlock it. If every GM instance has gone away, the registration lock yields to
the recovery failsafe and permits a new GM claim.

Every joined ship carries one Emergency Bridge Confetti Dispenser. It is a
digital, square red touchscreen control within the ship console, not a physical
mechanism. Firing is a server-authoritative, once-per-ship action shared by every
client currently viewing that ship. A successful firing permanently marks that ship's dispenser
DISCHARGED for the session and adds the ship, activating person and time to the
GM event log. Clients may read the ship signal and event log but may never
write, reset or forge either one.

The burst is intentionally finite: 48 fixed CSS pieces, one animation, and no
canvas, particle loop or retained history. Remove the burst layer after 3.5
seconds, unsubscribe when leaving the ship, and honor reduced motion. The GM
log keeps only its 30 newest visible entries. These bounds are part of the
feature, not tunable spectacle.

### Shuttlecraft console parameters

`ShuttleConsole` is the required visual and structural template for SNN and
all later shuttlecraft. It shares the full-viewport `ship-console` shell so a
player crossing from a capital ship to a shuttle remains inside the same
issued console system, not a centered web page. Shuttle-specific classes may
specialize the accent and modules but must not replace the shell.

- The identity block uses the same order as a ship: visible exit control,
  operator and short code, craft or service name, vessel type, current role,
  and a factual description. The role line identifies the shuttle captain.
- The compact DRADIS remains in the shared upper-right instrument position.
  When docked, its origin is the host ship; the shuttle is not rendered as a
  separate contact. In flight, the shuttle becomes a sampled DRADIS contact
  under the detection rules in `docs/SHUTTLECRAFT.md`.
- Every shuttle console has one real navigation/status module. It reports the
  authoritative docked host or transit state without exposing a travel log.
  Do not add fake speed, fuel, heading or ETA readouts before those values exist.
- Craft capabilities are opt-in slots, not assumed equipment. SNN supplies the
  reusable newspaper-confetti evidence shredder; it is not subject to the
  fleet ships' one-shot rule and does not create GM activity-log entries.
  Ordinary shuttlecraft do not receive confetti.
- Wide screens place identity low-left, navigation high-right, optional craft
  modules low-right, and DRADIS above them. At phone widths these panels leave
  absolute positioning and stack in DOM order beneath the compact DRADIS so
  every control remains reachable in portrait, landscape and after rotation.
- Decorative craft identity is typographic line-work behind the instruments.
  It remains low contrast, non-interactive and absent from the accessibility
  tree. It never substitutes for a real status value.
- Shuttlecraft remain one-page consoles. Their real modules share one scrolling
  workspace and must not introduce secondary console pages.

### Ship console layout and growth

Capital-ship consoles are built for multiple internal mechanics pages. The
current identity view is the first page, not a mandate to place every later
system on the same canvas. New mechanics belong in a pageable main workspace;
do not add placeholder tabs until their destination mechanics exist.

The right status rail is persistent across those pages. Compact DRADIS owns the
top-right square. Directly beneath it, the rail uses the remaining viewport for
the shuttlebay manifest and compact command controls. The manifest is the only
flexible-height item and scrolls internally, so an unbounded number of docked
shuttlecraft or historical visits can never grow underneath or overlap DRADIS.
On narrow screens the identity/workspace and rail enter document flow and the
whole console scrolls; controls must never be compressed out of reach.

The launcher and role picker run `field`: full-bleed behind the interface. The
GM console uses `inset`, where the board is one instrument among several. Every
connected role console, including independent roles, uses the compact shipboard
DRADIS widget and must be registered with the console-route DRADIS policy when
its route is introduced.

**It is rendered once in `App`, above the router.** One continuous scan runs
from the launcher through the role picker to a connected console, rather than a
fresh board that restarts its sweep on every navigation. `Landing` no longer
owns it; it only reports intrusions upward through `onTransmission`, and `App`
holds that flag.

Because the board sits above the canvas and below the routes, **the ground
lives on `body` and no route container may be opaque.** A route with its own
background paints straight over the board. `.landing`, `.role-select` and
`.session-mode` are transparent, `position: relative; z-index: 1`.

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
5. **Sweep.** Two discs — `border-radius: 50%`, faint radial fill, bright rim.
   One animates `rotateY` over `--plot-turn` (14s), the other `rotateX` over
   `1.7 × --plot-turn` at 0.45 opacity, so the scan is spherical rather than a
   spinning floor and the two never line up the same way twice. Both are
   children of the rig. Edge-on a disc compresses to a bright line,
   which is correct. These rates were chosen by eye and they work; a single
   precessing ring was tried and looked worse.
6. **Colour.** `--plot-ink` and `--plot-hot` are registered with `@property` as
   `<color>`, which is the only reason the board can change colour smoothly.
   Almost nothing on it is a transitionable property in its own right — the
   sweep fill and the drop lines are gradients, the glows are box-shadows, the
   cage is a `color-mix()` — but all of it derives from those two, so animating
   the properties re-derives the whole board frame by frame. `initial-value`
   has to be a literal, so it duplicates `--cic-cyan`/`--cic-cyan-hot`; keep
   them in step.
7. **Contacts.** The component converts spherical coordinates to unitless
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
8. **Paint flare.** A frame observer reads each disc's rendered CSS transform.
   A contact acquires and refreshes when any part of either bright circumference
   crosses its rendered screen position. The observer casts a viewing ray
   through the actual contact anchor, accounting for CSS perspective and rig tilt. Acquisition, a one-shot blip/altitude-line fade, and the display bearing
   step share that event; there are no independent repeating contact timers.
   The bearing walk spans -1 to +1 degrees around the vertical axis, retaining
   canonical formation coordinates. Names remain solid after acquisition.
   New contacts wait for a crossing of the existing scan; resizing preserves it.
   After a suspended frame interval, resume sampling without replaying missed
   contacts. Reduced motion reveals all contacts and stops the observer.
9. **Contacts are hand-placed, never random.** A randomised board rearranges
   itself on re-render.

### Threat state

`data-hostile="true"` swaps `--plot-ink`/`--plot-hot` to the threat tokens,
raises `--plot-glow` to 1, and puts the spoofed returns on the board.

**The hack plants fake contacts.** They are not inbound and they close on
nothing: while the intrusion runs, the board has no way to tell them from real
returns, so they hold station and carry ordinary track tags. It is only when the
intrusion ends that the system works out they were never there — they are
relabelled `FALSE`, break up, and drop off the board. That departure is why
`ContactPlot` owns a timer at all: the spoofed tracks outlive the threat state
by `SPASM_MS`, because unmounting them the instant the hack clears would cut the
reveal off at its first frame.

The break-up is a `steps(1, end)` animation on `.contact-plot__jitter`, a layer
that exists purely so the fault never has to restate where the contact actually
is — the station transform lives on the contact, the jitter on its child.
`--phase` desynchronises the five so they never go at once.

Both discs keep their normal speed during intrusions. Threat state changes
colour and introduces spoofed returns; it does not accelerate the sweep.

### Motion

CSS owns the disc rotations and spoofed-return breakup. A requestAnimationFrame
observer reads both rendered disc matrices and detects crossings of the full projected circumference, accounting for the rig tilt and CSS perspective;
it does not advance an independent scan clock or cause React renders per frame.
Each hit updates the apparent fix and starts a one-shot Web Animation for the
blip decay. Cleanup cancels the observer and its blip animations.
`data-still="true"` (set from `prefers-reduced-motion`, and it only ever escalates
to still) stops the board and displays all contacts. Tuning knobs are
`--plot-size`, `--plot-turn`, `--plot-glow`, `--plot-ink` and `--plot-hot`.

## Screen crossings

`<ScreenFade>{(screen) => <Routes location={screen}>…</Routes>}</ScreenFade>` —
src/components/ScreenFade.tsx, styled in src/index.css. Every change of screen
fades out and back in: `SCREEN_FADE_MS` each way, two tenths of a second in
total. The constant and the CSS duration are the same figure in two places; move
both. This crossing applies to routed foreground content only. Persistent
background instrumentation does not fade; when DRADIS changes between field and
corner modes, its own one-second ease-in-out geometry transition communicates that
change. Activating a compact ship or shuttle DRADIS uses that same transition to
zoom in and out.

It takes a function rather than plain children because `Routes` reads the
location from context — an already-rendered element is no help, since it would
re-render against the new location the instant navigation happened. The delayed
location has to be handed back and passed to `Routes` explicitly.

**What does not cross:** the app header, the settings menu inside it, and the
contact plot. Header chrome persists between screens, and the board is the room
the interface sits in rather than part of any one screen. All three are
siblings of the fade wrapper, not children.

`.screen-fade` is `position: relative; z-index: 1` deliberately. An opacity
below 1 makes it a stacking context, and an unpositioned stacking context paints
in the in-flow layer — underneath the contact plot at `z-index: 0` — so the
board would jump in front of the interface for the length of every crossing.
The moving shared-flag clone stays inside that stacking context. The ship
console must not create a nested stacking context: its identity panel and the
clone need to share `.screen-fade` so the panel's higher layer remains effective
throughout the crossing.

Navigation that lands on the screen already showing is not a crossing: a
`replace`, or a route guard redirecting back to where we already are, compares
equal by pathname and is ignored. Under reduced motion the outgoing screen is
held at full opacity instead of being faded, because without the transition a
fade to zero is a flash rather than a fade.

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
- **Status-copy corruption** affects the two overlines, not the hostile message.
  On mount, guarantee at least one distorted letter in each status line. While
  the intrusion remains active, redraw both lines once per second from their
  canonical copy, giving each letter an independent 10% chance of replacement.
  Preserve spaces and punctuation so the words flicker without shifting layout.

The launcher's schedule: first intrusion at 20 seconds, subsequent starts 60
seconds apart, chosen randomly without an immediate repeat. Text, always in
caps: EARTH IS NOT FOR YOU / BE AFRAID / A COLD GRAVE AWAITS YOU / YOU WILL DIE
A HORRIBLE DEATH / EVERYONE YOU KNOW IS A SPY / WE CANNOT BE STOPPED.
`ArrivalDisplay`
reports the intrusion up through an optional `onTransmission` callback, held in
a ref so a parent handing over a fresh closure cannot restart the timers.

Readouts turn over every 5 seconds (`CYCLE_MS`), staggered by 0.3 and 0.6 of a
cycle so the three never move together — first changes at 5/6.5/8 seconds.
SHIPS IN CONVOY alternates between 6 and 7, while PERSONNEL GRANTED CIC DATA
ACCESS draws from 8–21;
WOLVES AMONG US walks its listed order, 1, ?, 2. Every readout refuses to land on the value it
is already showing: a readout that "changes" to what it already reads looks like
a panel that has stopped working.
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

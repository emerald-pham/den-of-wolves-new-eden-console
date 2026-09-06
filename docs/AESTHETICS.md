# New Eden aesthetic profiles

Read this before creating or changing UI. Reuse the tokens in
src/styles/cic.css and the existing components before inventing a new pattern.
The reference implementations are src/components/ContactPlot.tsx,
src/components/Intrusion.tsx and src/routes/ArrivalDisplay.tsx.

## Contents

- [Philosophy](#the-philosophy-and-what-it-rules-out)
- [CIC / default interface](#cic--default-interface)
- [Contact plot / threat board](#contact-plot--threat-board)
- [SNN shuttle template](SHUTTLE_TEMPLATE.md)
- [Capybara ship template](SHIP_TEMPLATE.md)
- [Screen crossings](#screen-crossings)
- [Intrusion / hostile takeover](#intrusion--hostile-takeover)
- [Every viewport](#every-viewport)

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

On every joined ship console, keep the fleet origin, nation and abbreviation on
one identity line: `OLD NATIONS OF EARTH // [nation] // [abbreviation]` or
`NEW NATIONS OF THE COLONIES // [nation] // [abbreviation]`. The shared ship
origin labels also title the corresponding fleet-selection groups.

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
- `.cic-action-button` — the square, ruled command control for actions inside
  an instrument. It uses an amber edge around cyan text, a transparent ground,
  and a 44px minimum target; use `.cic-text-button` for link-like navigation
  and low-emphasis controls instead.

Arrival readouts show a value with its descriptive label underneath: SHIPS IN
CONVOY, PERSONNEL GRANTED CIC DATA ACCESS, WOLVES AMONG US, and POPULATION
ESTIMATE AFTER INITIAL STARVATION, in that order. PERSONNEL GRANTED CIC DATA
ACCESS is the 8–21 player-held posts—not the roughly 200,000 souls in the fleet.
Keep these labels visible at every viewport size. Hide the sequences of possible
numbers; do not confuse those sequences with the descriptive labels. Do not
show a SCENARIO SIGNAL footer. Avoid other franchise-specific terminology
anywhere a player can read it, including decorative text inside the contact
plot. CIC and DRADIS are the deliberate exceptions. Use a compact grid on wide
screens and stacked readouts on phones. Preserve native buttons, labels,
visible keyboard focus, error announcements, and at least 44px touch targets.

### System reference readability

System rules are operational reading material: use at least 0.875rem bone-white
body text and 0.75rem amber labels. Present “If Upgraded (By Shepherd)” and
“If Damaged” in separate definition-list rows, never buried in a muted paragraph.
For Jump Drives, place the unlabeled normal failure sentence immediately after
the charged-use baseline and before the condition rows.
The “Condition” label is always amber; its value is cyan when operational and
red when damaged. Hypothetical damage-rule labels stay amber. Never infer meaning
from a row's position (`:last-child`), and keep status
value selectors specific enough to override the ordinary definition text.

Regression coverage lives in `FleetSystemsWorkspace.test.tsx`, the ship route
tests, and `src/styles/aesthetic.test.ts`. Extend those shared checks when
changing system presentation; retain distinct vessel configurations, row orders,
and actual versus hypothetical damage states.

### Control rows and everyday layout

Treat related controls as one composition. Boxed buttons and inputs in the same
action row should share a height and align their top and bottom edges. Use a
shared sizing rule so a later edit cannot quietly resize just one control.
Maintenance-cycle commands use `.cic-action-button` at every step so disabled
future actions retain the same control silhouette as the active command.
The GM turn control uses a regular ruled instrument module: show the current
turn as a real status value and use `.cic-action-button` for the advance action.
The launcher uses a 48px minimum for Create, Session code, Join, and the motion
button. The motion button follows Join in both visual and keyboard order;
both Reduce motion and Restore motion use the same height. Secondary emphasis
can come from the existing type and border treatment without shrinking the
touch target. This does not require unrelated instruments, icon controls, or
multiline panels elsewhere to have identical dimensions.

Keep spacing consistent within a group and labels close to their inputs. When
space runs out, wrap in reading order with clear gaps; allow controls to grow
for wrapped text rather than clipping it or shrinking text to force a row.
Status and error messages should remain readable without covering controls.
Check both states of toggles, disabled controls, and longer labels on narrow,
wide, and short landscape screens. Inspect the rendered boxes: correct DOM
order alone does not establish equal heights or visual alignment.

Fleet broadcasts share the measured top chrome row with the session-code
instrument. They use the same ruled border, near-black ground, compact height,
and monospaced readout scale; they never attach to the viewport bottom or cover
the console. On constrained widths the broadcast occupies its own full-width
row inside that same measured header, so the console offset still accounts for
it. The SNN ticker remains absent until the Press Officer publishes the first
dispatch, then returns between finite broadcasts. Press dispatches leave a
deliberately long field of empty track between repetitions,
so each item reads as a discrete wire-service bulletin rather than a dense alert.
Stable moving broadcasts keep two identical groups, with enough copies in each
group to span the available readout. Every ticker uses the continuous-track
transition defined under Fleet broadcast scroller; do not unmount or replace a
visible group when its source message changes. Reduced motion shows one
stationary, wrapping message in the same instrument.

The AEGIS fleet-alert command occupies the guarded bridge-control housing that
other ships use for the emergency confetti dispenser. Its closed command cover,
threat-coloured trigger, status line, and authority caption are one instrument;
the trigger reads STAND UP or STAND DOWN according to fleet state. AEGIS does
not also show a confetti launcher in that rail.

### Settings changelog

Keep release history collapsed behind a clear text control until requested.
When expanded, changelog entries use amber build labels and bone-white body
copy inside a ruled instrument panel. The history has its own viewport-bounded
vertical scroll region, so a growing log never pushes session, motion, release,
or disconnect controls beyond practical reach. The scroll region is keyboard
focusable and remains bounded on short landscape displays.

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
corner instrument over 200ms, so entering or leaving a console changes the
scale continuously instead of crossfading the DRADIS. Keep this duration
isolated in `SHIP_PLOT_RESIZE_MS` so the experiment is easy to tune or revert.
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

### DRADIS contact rules

DRADIS has one authoritative spatial truth and a deliberately imperfect visual
report of that truth. Game state owns each contact's canonical coordinate or
trajectory. The display may sample it, but must never rewrite it.

A contact does not exist on the instrument until a rendered sweep circumference
crosses the contact's actual current position in space. Before that crossing,
both the return and its name are invisible. The crossing seen on screen is the
same event that acquires the return, paints its flare and altitude line, and
permits any scan-gated identification; do not use a parallel timer that can
reveal or rename a contact before or after the visible sweep reaches it.

Stationary spaceship returns retain the established display uncertainty. Each
eligible sweep samples a new apparent bearing from the fixed walk spanning no
more than two degrees. The displayed fix holds absolutely still between sweeps.
A second rim crossing within 1.12 seconds refreshes the paint without changing
the fix; only a later crossing may sample another fix. The freshness timer
fading out never moves or jitters a return by itself, and the canonical XYZ
coordinate is never modified.

Genuinely moving contacts are **not an exception to sample-and-hold**. Their
authoritative fleetwide vector advances continuously and exactly, but that true
position is not a continuously rendered return. An invisible actual-position
marker follows the trajectory so sweep intersection remains spatially correct.
When an eligible sweep crosses that marker, the display copies its current XYZ
coordinate into a separate visible fix. The return, name and altitude line then
hold absolutely still at that sampled coordinate until another sweep crosses
the moving marker and supplies a newer fix. Never animate a visible DRADIS
return continuously between sweeps, whether the underlying contact is moving
or stationary. Moving returns receive no bearing walk or jitter; their stepped
fixes are exact samples of the authoritative vector.

The spatial trajectory and eventual classification are fleetwide facts. Each
DRADIS view still acquires them locally when its own rendered sweep reaches the
contact, so a console cannot learn either the object or its name merely because
another console has already swept it. Stopped sweeps must not auto-acquire a
moving encounter contact.

Ambient DRADIS traffic follows those rules and is sparse and measurable. Each
automatic contact follows the previous one after a fleetwide deterministic
random interval from twenty to thirty minutes: twenty-five minutes plus or
minus five. It appears near the outer shell, crosses it on a sampled random
vector for exactly two minutes, and then disappears. It reads
UNKNOWN CONTACT until a sweep crosses it at least ninety seconds into that
transit; that scan selects the fleetwide classification Asteroid, Rock, Your
Mom's Big Butt, Emerald Nebula Interference, or Metallic Asteroid without
extending or restarting its lifetime.
Reduced motion leaves the return at its sampled starting coordinate while
preserving the same arrival, classification, and disappearance clocks.
DRADIS acquisition overrides every presentation mode: neither the moving
object nor its label is visible before a real sweep crossing. Because reduced
motion stops those sweeps, it does not reveal an otherwise unacquired contact.

### Reusing DRADIS transits for wolf attacks

The ambient contact is the reference path for future moving threats. Keep the
generic pieces generic: `ambientDradisContact.ts` derives stable endpoints and a
classification from a session id plus authoritative occurrence time;
`ContactPlot` resumes the precise CSS transit of the invisible actual-position
marker with a negative delay when a view mounts mid-flight; the visible return
remains sample-and-hold, and `CONTACT_SCAN_EVENT` reports a real rendered sweep
crossing.
This makes the vector, schedule, and reveal result agree fleetwide without
streaming frame-by-frame coordinates through Firestore.

Wolf attacks should reuse that deterministic transit and scan pipeline rather
than add another animation clock or per-console randomizer. Their occurrence,
targeting, damage, and player-visible outcome remain separate server-authoritative
gameplay state and callables. Add a typed encounter definition or renderer slot
for those differences; do not fold wolf-specific rules into the ambient label
pool. Preserve the fixed disappearance deadline when a contact is scanned or
renamed, and keep reduced-motion behavior on the same shared clock.

The GM console contains an inset fleet DRADIS and a visible button for every
available ship. Selecting a ship rebases only that GM device's view. Dione and
Capybara availability are shared session state, default on (including legacy
sessions with no stored setting), and can only be changed by an active GM
instance. Turning either ship off removes it from the join roster and all
DRADIS views. Every perspective begins empty. Changing the reference ship
restarts contact acquisition, and returns appear only as that new view's sweep
reaches them; resizing the same view does not restart its scan.

Every expanded DRADIS surface uses the same active-GM effect registry. This
includes the GM fleet display and the persistent shipboard display used by ship,
observer, press, and joint-engineering routes. Keep effect triggers in
`DradisEffectControls.tsx` so a new DRADIS effect appears everywhere instead of
being coupled to one route. The controls remain absent while DRADIS is compact
and for browsers without an active GM instance. Manual effects do not reset or
otherwise perturb the automatic ambient-contact schedule.

GM registration uses one server-authoritative lock. Show its open
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

Use the [SNN shuttle template](SHUTTLE_TEMPLATE.md) for later shuttlecraft. It
specifies the reference identity, responsive console media, required modules,
optional capability slots, authority boundaries and acceptance checks. This is
the requested implementation specification; its presence does not mean every
travel behavior in it is implemented.

`ShuttleConsole` is the required visual and structural template for SNN and
all later shuttlecraft. It shares the full-viewport `ship-console` shell so a
player crossing from a capital ship to a shuttle remains inside the same
issued console system, not a centered web page. Shuttle-specific classes may
specialize the accent and modules but must not replace the shell.

- The identity block uses the same order as a ship: visible exit control,
  operator and short code, craft or service name, vessel type, a factual
  description, and a "Your Title" line. The title line identifies the shuttle captain.
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
- The SNN dispatch desk keeps active reports visible as a compact ruled ledger.
  Each row pairs the report copy with its own square dismissal action, stacks
  the control beneath the copy on phones, and leaves server-confirmed reports
  in place while a command is pending.
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

Use the [Capybara ship template](SHIP_TEMPLATE.md) for the remaining fleet
ships. It specifies identity statistics, census survivor steps, capacity
warnings and GM threshold alerts, implemented for Capybara and reusable as
other ships receive their own specifications.

Capacity-warning triangles are compact visual marks with 44px interaction
targets. Hover, keyboard focus and tap reveal the same bordered CIC tooltip;
crew-side copy opens inward from the left and passenger-side copy opens inward
from the right so the message remains readable at narrow widths.

Capital-ship consoles are built for multiple internal mechanics pages. The
current identity view is the first page, not a mandate to place every later
system on the same canvas. New mechanics belong in a pageable main workspace;
do not add placeholder tabs until their destination mechanics exist.

The right status rail is persistent across those pages. Compact DRADIS owns the
top-right square. Directly beneath it, the rail uses the remaining viewport for
the shuttlebay manifest and compact command controls. The manifest is the only
flexible-height item and scrolls internally, so an unbounded docking history
can never grow underneath or overlap DRADIS. It is a plain ledger: each row
names the shuttlecraft and the shuttleport where it docked. Do not mix current
occupancy, maintenance rules, or departure events into this panel. The Press
shuttle's port is the civilian access hatch.
On narrow screens the identity/workspace and rail enter document flow and the
whole console scrolls; controls must never be compressed out of reach.

On phones and short landscape screens, session controls, compact DRADIS, vessel
identity and instruments all remain in document flow and scroll fully out of
view. Nothing sticks over the active console workspace. DRADIS begins below the
measured session-header height, including wrapped rows and rotation; never put
it behind those controls. The console begins below the resulting DRADIS outline
using that same measured top and the compact plot size; phone breakpoints must
not substitute a hard-coded header height that lets the two overlap.

Every in-session page uses the shared `SessionReadouts` composition for session
code and “X connected to CIC”. The global header and Settings render that same
component, so their type, spacing, borders and wording stay identical. Future
pages must keep `AppHeader` as shared app chrome and reuse `SessionReadouts`
where session identity is repeated rather than creating route-specific badges.
The complete header is absolute app-wide: session code, connected count,
connection state and Settings scroll out with the page and are never fixed or
sticky. Session readouts inside the scrollable Settings dialog move with its
content as well.

The launcher and role picker run `field`: full-bleed behind the interface. The
GM console uses `inset`, where the board is one instrument among several. Every
connected role console, including independent roles, uses the compact shipboard
DRADIS widget and must be registered with the console-route DRADIS policy when
its route is introduced.

**It is rendered once in `App`, above the router.** One continuous scan runs
from the launcher through the role picker to a connected console, rather than a
fresh board that restarts its sweep on every navigation. `Landing` does not own
the board or activate its hostile state.

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
   Stationary returns use a bearing walk spanning -1 to +1 degrees around the
   vertical axis while retaining canonical formation coordinates. Moving
   contacts advance an invisible actual-position marker continuously, but copy
   its exact XYZ into a stationary visible fix only when crossed by a sweep;
   they do not receive the artificial bearing walk.
   Names remain solid after acquisition.
   New contacts wait for a crossing of the existing scan; resizing preserves it.
   After a suspended frame interval, resume sampling without replaying missed
   contacts. Reduced motion reveals static scenery and stops the observer;
   unacquired moving encounter contacts remain hidden.
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
A freshly scanned return holds that station until its 7-second paint flare
reaches the first dimmed keyframe at 1.12 seconds. A scan during break-up resets
that hold, so a bright return never jumps before it has partially faded.

Both discs keep their normal speed during intrusions. Threat state changes
colour and introduces spoofed returns; it does not accelerate the sweep.

### Motion

CSS owns the disc rotations, invisible actual-position transits and
spoofed-return breakup. A requestAnimationFrame observer reads both rendered
disc matrices and detects crossings of the full projected circumference,
accounting for the rig tilt and CSS perspective; it does not advance an
independent scan clock or cause React renders per frame. Each hit samples the
actual position into a held apparent fix and starts a one-shot Web Animation
for the blip decay. Cleanup cancels the observer and its blip animations.
`data-still="true"` (set from the effective motion preference) stops the board
and displays static contacts. Moving encounter contacts still require a real
sweep and therefore remain hidden if they were not already acquired. The effective preference follows
`prefers-reduced-motion` unless the player chooses Reduce motion or Full motion
in Settings; that local override persists on the device. Tuning knobs are
`--plot-size`, `--plot-turn`, `--plot-glow`, `--plot-ink` and `--plot-hot`.

## Screen crossings

`<ScreenFade>{(screen) => <Routes location={screen}>…</Routes>}</ScreenFade>` —
src/components/ScreenFade.tsx, styled in src/index.css. Every change of screen
fades out and back in: `SCREEN_FADE_MS` each way, two tenths of a second in
total. The constant and the CSS duration are the same figure in two places; move
both. This crossing applies to routed foreground content only. Persistent
background instrumentation does not fade; when DRADIS changes between field and
corner modes, its own 200ms ease-in-out geometry transition communicates that
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

`.screen-fade` is `position: relative; z-index: 1` deliberately. During a
crossing it rises to `z-index: 5`, one explicit layer above the compact contact
plot and below the persistent header, so the resizing plot cannot abruptly
cover the outgoing screen. Opacity belongs to the nested
`.screen-fade__content`, leaving the moving shared-flag clone continuously
visible as its surrounding screens fade. The clone stays in `.screen-fade`.
Role-picker flags move at layer 20, above the routed-content layer at 19, so the
picker panel cannot cover its flag. Console flags declare
`data-shared-flag-layer="background"` and move at layer 18, beneath the entire
routed foreground, so they cannot cover the ship identity or instruments.
The clone takes the outgoing flag's layer immediately, then the destination's
layer when the screen swaps, before the destination starts fading in. Raising
the identity pane alone cannot fix this: its z-index is trapped inside the
routed-content stacking context. When the move finishes, the clone is removed
and the real destination flag returns to its normal place.
The floating clone is limited to crossings between two routes for the same
ship. Fleet-card and command-role-picker flags crossfade with their screens;
floating a card flag over the opaque role-picker panel creates a visible flash.
The clone also interpolates `object-position` to the destination image's
alignment. Role-picker flags are left-aligned while console flags are centred;
holding the source alignment until the clone disappears causes a visible snap.
Its fixed box interpolates `left`, `top`, `width` and `height` directly. Do not
scale the box with a transform: the source and destination boxes have different
aspect ratios, so non-uniform transform scaling visibly distorts the flag.

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

The launcher does not run intrusion takeovers or display hostile messages.
Threat presentation remains available for later gameplay where it has clear
context, but it is deliberately absent from the opening experience.

Readouts turn over every 5 seconds (`CYCLE_MS`), staggered by 0.3 and 0.6 of a
cycle so the three never move together — first changes at 5/6.5/8 seconds.
SHIPS IN CONVOY alternates between 6 and 7, while PERSONNEL GRANTED CIC DATA
ACCESS draws from 8–21;
WOLVES AMONG US walks its listed order, 1, ?, 2. Every readout refuses to land on the value it
is already showing: a readout that "changes" to what it already reads looks like
a panel that has stopped working.
Resolve digits once over 1.1 seconds; never rapidly flicker.
Reduced motion starts paused and a new reduced-motion preference pauses ongoing
effects. The Settings control may override the system preference in either
direction; all motion-bearing components must consume the shared effective
preference from `src/lib/motionPreference.ts`. Clean up timers on exit.
These are conservative motion choices, not a medical guarantee.

## Every viewport

All screens must work on mobile, laptop, and desktop, in portrait and landscape,
including rotation while open. Use fluid sizing, safe-area padding, wrapping,
and document scrolling. Never lock orientation or clip controls to fit a fixed
height. Verify 320px phones, wide desktops, and short landscape viewports;
check controls during an intrusion and with reduced motion. The contact plot is
sized in `vmin`/`vw` so it reflows with the viewport and needs no breakpoint of
its own.

### Interactive maintenance

The shared maintenance path keeps Begin immediately beneath the amber heading.
Its first click changes the same button to “ARE YOU SURE?” with danger-red type
and border, a deliberate caution-colour exception for starting maintenance.
A second click starts the cycle; blur or Escape cancels confirmation. Later
steps remain single-click commands.
All step controls remain present, with inactive buttons and choices in muted grey.
The current step uses a cyan rail; server-confirmed outcomes use cyan readouts.
Ration and refuelling selects and checkbox labels have 44px minimum touch targets,
wrap within the path, and use native fieldsets to disable future steps together.
Both AEGIS bays share step 6; End follows the path and unlocks after refuelling.
Reviewed at 1440×900, 390×844, and 844×390 with intact and damaged configurations.

The GM event log treats maintenance start and completion as ordinary operational
readouts. An active cycle that reaches five minutes becomes a hostile-red alert
within that same instrument; each overdue ship gets one compact line with its
elapsed whole minutes. Multiple overdue ships stack without introducing a modal
or covering the GM's controls.

### GM command workspace

The GM console reuses the ship console shell and identity surface, with
`RoleConsoleTemplate` owning the fleet oversight header and live telemetry.
GM modules occupy the scrollable left workspace; the event log leads it so
urgent events remain near the top. Fleet DRADIS occupies the upper-right
instrument rail, with perspective controls below its square viewport. The rail
scrolls independently on tall desktop screens. On phones and short landscape
screens it enters document flow before the workspace; both scroll with the page.
Expanded DRADIS retains its full-screen view and existing perspective controls.
Resource rows stack their label above the counter when the ship panel is narrow,
so nested workspace frames never reduce a resource name to an ellipsis.

### Fleet broadcast scroller

Fleet broadcasts use one persistent instrument in the measured top header,
outside route transitions. Active AEGIS red alerts use hostile red type;
stand-down and idle copy use normal bone-white type because no threat is active.
A ruled black ground keeps messages legible over every vessel's console. The
Admiral command uses the shared framed action button, with a live status
alongside it and inline errors. Every label, control state, status and error in
this alert instrument is authored in uppercase.

All moving ticker copy enters from the right and travels left at one constant,
linear rate. This is the fleetwide press/alert transition convention: when a
message is replaced or dismissed, every group already visible keeps its exact
position and normal speed until its trailing edge leaves the window. Discard
only repetitions that have not entered the window. Queue replacement copy just
beyond the outgoing tail—or at the right edge when the remaining tail is already
inside the window—so it enters at that same rate. Never add a separate entrance,
exit, fade, easing curve or message-specific speed.

Alert copy repeats until replaced; stand-down copy makes two complete passes.
Playback identity includes the session and alert revision, and completed passes
survive navigation and tab reloads. A new alert follows any cancellation copy
already visible while unentered cancellation repetitions are dropped. The
shared FleetTicker accepts message copy, tone, spacing and optional pass count.
Press dispatches use its long-gap mode on the same instrument. Reduced motion
shows the current stationary wrapped copy immediately and does not retain a
dismissed visual message.

The SNN shuttle's dispatch desk is a real instrument available to the active
Press Officer. It presents a fixed `SNN //` prefix, accepts a concise dispatch,
and publishes through server authority with revision checks. The current copy
remains visible on the desk; other shuttle viewers may see the instrument but
cannot transmit from it.

Press and stand-down copy remain uppercase; the Admiral’s active warning is
normalized to lowercase and displayed without the usual uppercase treatment.
The Admiral can edit up to 500 characters, restore the provided default, and
transmit an update through the guarded command while red alert remains active.
Press dispatches follow the warning within each repeating sequence in normal
bone-white type, even while the alert remains active.
DRADIS shows a stationary hostile-red `RED ALERT` readout at its bottom left,
in both compact and expanded views. It clears on authoritative stand-down,
does not intercept pointer input, and leaves the zoom control unobstructed.
The expanded compass moves above the warning while an alert is active.
There is no pause control. The
shared reduced-motion preference replaces motion
with wrapped, scrollable text and two 30-second reading periods for cancellation.
The measured header height reserves the required page-top space as the ticker
wraps. Review at 320px phone, wide 1440px desktop and short 844×390 landscape
dimensions, including return navigation.

Shuttle role capabilities use the same wide gameplay identity pane and
RoleConsoleTemplate as ship role consoles. The dispatch desk sits directly
below the captain role assignment; status and the evidence shredder stay in
the DRADIS instrument rail. Capability placement is owned by the shared shuttle
template, including future craft.

### Console access and GM maintenance corrections

The shared maintenance column ends with a ruled GM-only command group beneath
End maintenance cycle: Assign damage, Repair all damage, and Roll back maintenance
step. Use the existing cyan `.cic-action-button` treatment and wrapping
`.maintenance-controls` layout, with muted disabled states and inline errors.
An applied damage command reports its drawn card and affected system to the GM
as a cyan status line inside this group; maintenance steps that apply damage
include the same details at that numbered step for every connected crew member.
The line must distinguish a damaged system, an armour card that absorbed damage
and was recycled, and destruction when no card remained. A failed damage trigger,
such as a riot roll that does not beat unrest, states that no damage occurred.
Drawn cards in the ship-systems summary remain immediately legible without a
hover, focus, or reveal gesture, and each row names whether the system was
damaged, armour absorbed and recycled the card, or no card remained before
destruction.
The group is absent for players. Read-only observers retain visible disabled
commands until they select Write.

GM observers choose the viewed role using a labelled native ship-console select.
The instrument-rail Read / Write button toggles access and shows its current state;
leaving the ship resets it to Read. Crew viewing another console see an explicit
read-only or incomplete-crew write status and keep View ship consoles navigation.
Page navigation remains usable in read-only mode. Reviewed at 320×844, 1440×900,
and 844×390 with operational and damaged systems, the shared command group,
observer access toggling, and return navigation.

Alert editor, continuous ticker transition, lowercase warning and DRADIS warning reviewed at
1440×900, 320×844 and 844×390, including reduced motion and return navigation.

Damage-card outcomes at the maintenance riot step and the shared GM damage
controls were reviewed at 1440×900, 390×844 and 844×390; the cyan status copy
wraps without clipping or obscuring controls.

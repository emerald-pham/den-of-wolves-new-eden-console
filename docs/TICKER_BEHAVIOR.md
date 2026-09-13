# Ticker Behavior

The fleet ticker is a continuous news crawl: one line of text moving from
right to left, like a television news ticker. It remains visible on every joined
screen, including Cycle 0. Messages share one physical track and never overlap.

This is the required product behavior, clarified by the owner on 2026-09-13.
It supersedes conflicting ticker priority, handoff, and Stand Down timing
descriptions elsewhere. Documentation of this contract is not a claim that
every case below has already been implemented or verified in production.

## Three sources

| Source | What it contributes | When it supplies the next message |
| --- | --- | --- |
| ATC | The current authoritative airspace status | The default, while no eligible Press dispatch or Aegis sequence takes precedence |
| Press | The current pool of published, eligible news dispatches | Normal news playback once Press has eligible dispatches |
| Aegis | Red Alert and Stand Down | Highest priority; temporarily replaces the eligible playback pool |

Cycle 0 always has **Airspace Closed**. ATC uses **Airspace Closed** or
**Airspace Open** as appropriate, optionally followed by **Cycle X**. It never
replays an outdated airspace state. Existing source prefixes identify ATC,
Press, and Aegis; an Admiral warning and Aegis Stand Down are the same source
for priority purposes.

## The pool and the visible track are separate

The **eligible pool** contains the messages that may enter next. The **visible
track** contains message instances that have already entered the screen.
Changing the pool does not remove, replace, reposition, or accelerate text on
the visible track.

1. ATC repeats indefinitely until Press has an eligible dispatch.
2. Press then controls the normal pool. Select the next eligible dispatch in
   the authoritative Press order and continue that rotation. A new ATC phase
   notice updates the fallback status; it does not take the pool away from
   eligible Press news.
3. Red Alert replaces the eligible pool with Aegis alert copy. That copy
   repeats until the authoritative alert changes or Stand Down arrives.
   Press may continue managing its pool while suspended.
4. Stand Down replaces the alert pool and plays **exactly twice**. Then the
   next eligible Press dispatch follows the second copy. Resume from the
   current Press pool; never resurrect a withdrawn or dismissed dispatch.
5. If no eligible Press dispatch remains, resume the current ATC status.
   An empty news pool never removes the ticker.

A new Red Alert takes priority over a pending Stand Down continuation, using
the same visible-text protection. Remove only copies that have not entered;
any visible Stand Down text still finishes its traversal.

## Continuous movement and message handoff

All messages move left at the same constant linear speed. No fade, wipe,
teleport, sudden push, restart, speed change, or early clipping may replace a
visible message. A message instance is removed only after its **last painted
glyph has exited the left edge** of the ticker window.

The next eligible message enters from just outside the **right edge** as soon
as the preceding message's **trailing edge** leaves enough room for the normal
separator gap. Its leading edge must remain behind that trailing edge.

This does **not** mean waiting for the whole outgoing message to disappear.
The old message may still be travelling across the left side while the new
one enters on the right. They can coexist without touching or overlapping.

If a new source becomes eligible after that space is already available, begin
its entrance immediately from offscreen right. If the preceding tail is still
outside the right edge, wait only for the space it occupies. Do not insert an
extra blank-screen interval or allow the new message to catch up with the old
one.

Select from the latest eligible pool at the next entry opportunity. Copies
prepared offscreen are replaceable until they begin entering; visible copies
are committed to finishing. An alert therefore wins the next available place
without erasing a Press or ATC message already in motion.

A compact geometry rule for implementation is:

- The incoming leading edge starts at or beyond the window's right edge.
- It also stays at or beyond the preceding trailing edge plus the separator gap.
- Once visible, every instance advances at the same pixels-per-second rate.

Use the existing deliberate spacing between dispatches. Do not add a new
handoff delay on top of it.

## Stand Down means two complete passes

A pass begins when a copy enters from the right and completes when its last
glyph exits left. The Stand Down sequence schedules two copies, then releases
the next entry opportunity to Press (or ATC if the Press pool is empty).
The second copy retains its full exit even if the resumed Press message has
already entered behind it.

Two passes are a presentation requirement, not an assumed number of seconds.
A fixed 60-second expiry is not a substitute: text length, viewport width, and
scroll speed affect traversal time. The previous timer-based description must
not be used to cut off a pass or start an extra repetition.

The server remains authoritative for source state, message identity, eligibility,
and ordering. Each viewport owns its physical scrolling; it must not write
animation-frame or completed-pass acknowledgements into shared game state.
Reconnect must use the current authoritative stream rather than replaying
retired alerts from saved browser data.

## Accessibility and verification

Reduced motion keeps a stationary, wrapped, readable presentation with the
same source priorities and pool transitions. It must remain visible and must
not require scrolling animation or a client animation acknowledgement to
progress. The two-copy Stand Down sequence needs an accessible presentation
equivalent; this contract does not invent a new fixed dwell duration.

Verify the physical behavior with rendered geometry, not just message text:

- ATC loops from joining Cycle 0; Press takes the next entry opportunity.
- Red Alert suppresses future Press entries while visible Press finishes.
- Stand Down appears twice, followed by the next currently eligible Press item.
- Replacing or dismissing an item never erases any visible part of its text.
- Incoming and outgoing glyph bounds never overlap, including long messages,
  late source changes, resize, and rotation.
- An available next message enters as soon as the right-edge spacing permits.
- Empty pools, navigation, pending fonts, and reduced motion never hide the
  instrument.

## Terminology

**News crawl**, **text crawler**, and **scrolling ticker** are established
broadcast terms. Vimeo's [Studio crawler documentation](https://help.vimeo.com/hc/en-us/articles/31111826242449-Create-a-text-crawler-or-ticker-in-Studio)
uses that terminology, and the [Viz Ticker guide](https://documentation.vizrt.com/viz-ticker-guide-4.1.pdf)
describes a scroller entering from the right and exiting on the left.

For this project's handoff rule, **finish the visible message before removing
it** is the plain-language description. **Non-preemptive playback with
priority-based next-message selection** is useful engineering shorthand, not
a claim that the entire behavior has one standardized broadcast name.

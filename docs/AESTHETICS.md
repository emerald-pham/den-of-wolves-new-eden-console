# New Eden aesthetic profiles

Read this before creating or changing UI. Reuse the tokens in
src/styles/cic.css and the existing components before inventing a new pattern.
The reference implementation is src/routes/ArrivalDisplay.tsx and arrival.css.

## CIC / default interface

A worn military information terminal: blue-black metal, restrained ice-blue
instrumentation, bone-white type, amber caution. Dense information, deliberate
empty space, thin ruled divisions. Avoid glossy cards, neon gradients, rounded
pills for primary controls, decorative charts that imply real data, and flashing.

Use --cic-void for the canvas, --cic-panel for surfaces, --cic-rule for borders,
--cic-ink for primary text, --cic-muted for secondary text, --cic-cyan for
instrumentation, --cic-amber for emphasis, and --cic-danger for errors.
Legacy --bg/--fg/--muted/--accent aliases connect existing routes to the profile.
Use --cic-mono for labels and controls, --cic-display for large manifest numbers
and cinematic headlines. Use system fonts; no external font dependency.
Use --cic-radius for squared controls and --cic-space for fluid spacing.
.cic-overline and .cic-text-button are shared utilities.

Arrival readouts show only their changing value; do not add labels, sequence
traces, counters, or franchise-specific terminology. Keep CIC as the one
permitted reference. Use a three-column display on wide screens and compact
stacked values on phones. Clearly distinguish atmospheric numbers from live
session state. Preserve native buttons, labels, visible keyboard focus, error
announcements, and at least 44px touch targets.

## Interrupted transmission / atmospheric overlay

Reuse ArrivalDisplay's transmission pattern: fullscreen, pointer-events: none,
no focus capture or modal semantics. Keep the action panel and app header above
the overlay. Decorative messages are aria-hidden so they do not interrupt screen
reader navigation. No sound. Static is a stationary low-opacity texture that
slowly fades in and out, never randomized per frame or strobed.
Five seconds total includes 0.9-second entry and exit. First transmission at
20 seconds; subsequent starts 60 seconds apart; choose randomly without an
immediate repeat. Text: EARTH IS NOT FOR YOU / BE AFRAID /
A COLD GRAVE AWAITS YOU.

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
check controls during transmissions and with reduced motion.

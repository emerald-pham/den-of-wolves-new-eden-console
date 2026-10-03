# PC07 split fleets and automatic Wolf Attack

**New assumptions come first.** [PC07-A1–A4](PRODUCT_MILESTONE_ASSUMPTIONS.md#pc07-a1--preserve-the-server-clock-behind-a-cycle-briefing)
record the shared briefing clearance, supported five-vessel attack ring,
highest-pursuit rejoin result and taxi pilot remaining at the launch ship.
These are explicit digital choices where the printed procedure leaves a gap.
Printed ship costs, console charges, attack effects, taxi capacity and range
remain controlling. The split-fleet note records the route audience and
known-system sharing boundaries. Final attack assumptions and their source
references will be reconciled with the attack handback before release.

This is the in-progress PC07 report. Its fixed target is **49/49 assigned
acceptances**, moving **556/751 to 605/751 overall** and **98/293 to 147/293
campaign closures**. The catalog still records the opening baseline. Independent
review, final validation, CI and deployment remain open; this report does not
claim a released checkpoint. [The current acceptance matrix](PC07_ACCEPTANCE_MATRIX.md)
records each implementation, test, review, deployment and gameplay gap.

## What is connected

Split fleets share one cycle and phase clock. Their rosters, positions, notes,
scanned systems and shuttle routes follow current group authority. The GM
confirms server-derived partitions and rejoins; scout taxis carry the printed
passenger or fuel payload. Players receive a bounded current-member session
read because a raw Firestore document cannot redact another group's fields.
The ordinary player and Press root read is denied; entitled private projections
and the GM root read remain available. Group changes immediately withdraw old
operations while the new authorized read arrives.

The attack foundation declares and parks craft atomically, exposes separate
crew and facilitator views, and preserves genuine player choices. Full boarding,
final damage and automatic airspace recovery are still being reconciled with
the attack worker. P605a's future DRADIS attack visualization stays excluded.

Cycle briefings hold the actual shared server clock. A current connected
participant clears the exact hold once, preserving its captured remaining time.
Cached or offline controls wait for current authority. Actual DRADIS consumes
one server-sampled local-group position stream and never derives another
group's destination or a shuttle's private route in the browser.

## Gameplay and presentation evidence

The October 2 owner correction makes authenticated local/emulator gameplay the
future repository-wide verification standard. Native handler tests, normal
Auth/HTTP commands, ordinary browser interaction, Firestore Rules, prepared
scene rendering, CI and production deployment are recorded separately.
Prepared scenes earn no behavior closure. Production gameplay and physical
device behavior are not claimed.

The owner evidence root is outside Git at
`/Users/emeraldpham/Documents/PC07-evidence/`. Current evidence includes:

- Twelve printed maintenance paths through compiled production transactions
  and real emulator Firestore, with rations, server dice, charge retention,
  exact replay and one maintenance cycle per game cycle.
- Normal authenticated eight-player setup, casting, seats, start, briefing
  hold, competing clearance, airspace denial/opening and reconnect. Disposable
  deadline acceleration and restriction contexts are explicitly labeled.
- Normal twelve-player maintenance/refuel, actual shuttle transit and current
  member/GM navigation reads, including advanced server samples, stale and
  forged-viewer denial and protected direct reads.
- Ordinary phone browser join and conduct acknowledgement, actual offline
  clearance disabling, reconnect, clear, reload, named GM join and current
  server DRADIS. The reload harness waits for the ordinary current-member read;
  it does not inject identity or session state.
- All 156 Rules checks and focused composed client authority checks. Full
  split-fleet and full attack gameplay remain with their implementation owners
  until their complete scenario evidence is reconciled.

## Finished solo review preparation

The candidate includes `pc07-review.html`, an isolated scene using the actual
fleet-group, local DRADIS, attack-status, briefing and airspace presentations.
Its five numbered checks are groups and DRADIS; known systems; taxi and rejoin;
attack; and recovery. Every state and callback is labeled prepared. It sends
no gameplay command and does not change a shared session. Final deployed
access and final responsive checks will be recorded after release.

## Why tests changed

Discriminating red commits cover the observed privacy bridge in the raw root,
current-member allowlists, local hosted craft and Voyage admission, retained
Philia usage limits, late actor/group replies, partition and GM navigation
cursors, cached shuttle/airspace controls, exact briefing holds and reconnect,
and the GM join button while reload authority is still cached. Existing success
fixtures now supply their actual current authority rather than assuming it.

Rules positive controls were migrated to the GM root read while preserving
ordinary member reads of entitled child documents and explicit player root
denial. Rejoin route fixtures supply current server endpoint audiences. The
historical PC06 selector checks use their actual published source revision;
new PC07 checks require an exact source/hash consumer inventory and reject
unaudited changes. No existing privacy, authority, arithmetic, motion or
performance budget is weakened, skipped or deleted. Worker-specific reasons
and final gate evidence will be added at reconciliation.

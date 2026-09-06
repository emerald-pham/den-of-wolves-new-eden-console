# Shuttlecraft worldspace model

For console composition, identity fields, capability slots and responsive
media, use the [SNN shuttle console template](SHUTTLE_TEMPLATE.md). This page
defines the shared worldspace and travel behavior behind that interface.

## Current baseline

- The SNN Independent Press Shuttle starts docked to AEGIS.
- Every fleet ship has a shuttlebay manifest and its own immutable visit log.
- The Press console remains relative to the shuttle, while its DRADIS center is
  the host ship whenever it is docked. A docked shuttle is not a separate
  DRADIS contact.
- The SNN shuttle alone has a reusable newspaper-confetti evidence shredder.
  It may fire repeatedly without generating GM activity-log entries; ordinary
  shuttlecraft do not inherit a dispenser by default.

## Movement contract

Shuttle movement is an authoritative server operation. A transit stores its
current world position, current velocity vector, final destination ship,
`departedAt`, and `arrivesAt`. A normal leg lasts 60 seconds. The server derives
and persists the current position before every course change, so a new order
can safely retarget a shuttle that is already in flight. Its new vector begins
at that exact resolved position and points toward the newest final destination;
the shuttle never snaps back to the prior origin or jumps ahead to its old
animation.

The client may animate between authoritative samples, but animation is only a
projection. Arrival, retargeting, docking, and visit-log entries are determined
from server timestamps and transactions.

## DRADIS sampling

An undocked shuttle is a normal DRADIS contact and obeys the same detection,
invisibility, and ping rules as any other contact. A receiving ship calculates
the shuttle's continuous world position at the instant that ship's sweep
acquires it, displays that sampled point, and does not slide the return between
sweeps. The next successful acquisition replaces the sample. This lets each
ship see a truthful instantaneous fix without exposing continuous tracking.

## Travel ledgers

Each host ship retains its local shuttle arrival/departure log. The SNN shuttle
also carries a complete ledger of its own travel. That carried ledger may be
locked or unlocked only by the Press Officer acting as shuttle captain. The
lock and movement controls must be server-authoritative and validate the
claimed Press seat; they must not ship as client-only controls before role-seat
claiming exists.

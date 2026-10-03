# PC07 split-fleet and sharing assumptions

This note records the digital rules used where the PC07 print material leaves
server behavior or privacy boundaries open. Printed movement and taxi limits
remain authoritative. The checkpoint source map is in
[`docs/PC07_PC10_ALIGNMENT.md`](./PC07_PC10_ALIGNMENT.md); the taxi procedure
used here is Facilitator p. 17 / PDF p. 19 from the checksummed private-source
bundle.

## Group rejoin and pursuit

The GM confirms the server-derived ship positions after movement. Distinct
groups at the same authoritative four-digit system rejoin in that transaction.
The group with the lowest numeric `fleet-N` identifier survives; the operation
unions its vessel and member rosters and rewrites each member's current group
pointer once. The existing per-ship discovery facts are preserved. Historical
group messages and server events are read once by stable event/request ID.

PC07's print sources do not choose the pursuit value when groups rejoin. The
implementation keeps the highest pre-rejoin pursuit score. This conservative
policy avoids granting a pursuit reduction through regrouping. The server
records every input score, the resulting score, coordinate, surviving group,
and absorbed groups in a GM-readable rejoin audit.

## In-flight shuttle audience

An active or pending shuttle route is visible to a player only when both its
server-validated origin and destination belong to that player's current fleet
group. A GM partition confirmation reassigns the route's audience group from
those server-owned endpoints. If the ships are in separate groups, the route
uses a reserved no-player-audience value until a later confirmation places both
endpoints together. This keeps a former group pointer from exposing a foreign
ship or transit position. The private route chain remains server-only, and
facilitator access remains available.

## Taxi passenger

The Facilitator taxi procedure allows one round-trip attempt and permits up to
two players or one or two fuel units when the printed range and shuttle
authority allow it (printed Facilitator p. 17 / PDF p. 19). It does not define a
replacement-pilot handoff. The current shuttle owner must therefore remain at
the launch ship; the owner cannot be selected as a passenger. Other connected
members physically at the authorized launch ship may be selected, up to the
printed two-player limit. The shuttle, payload, authority, and resulting
membership change are committed and audited by the server.

## Known-system sharing

Sharing copies only a coordinate already present in the sending ship's
server-owned scanned-system projection. The sender can choose all or a subset
of ships in the current group. The server computes the recipient set and updates
their individual knowledge together; no browser-supplied chart facts,
coordinates outside that ship's known projection, or recipients in another
group are accepted.

# Source-backed rules assumptions

When a printed rule is ambiguous during an approved milestone build, use the
best reading supported by the rulebook and keep building. Record the decision
here **before the dependent behavior is claimed complete**. This is not a
request to wait for the product owner. Do not invent a source passage: if the
relevant source is unavailable, report the limitation and continue independent
work.

For each assumption, record:

| Field | Required record |
|---|---|
| ID and milestone | Stable assumption ID and affected playtest milestone. |
| Source passage | Exact rulebook/component title, edition, page/card/section, and a concise paraphrase of the relied-on passage. Do not copy private source wording into Git. |
| Ambiguity and alternatives | What the passage leaves open and the plausible readings. |
| Chosen reading | The best source-backed interpretation and why. |
| Product effect | Which player action, result, prompt IDs, and tests rely on it. |
| Review state | New, accepted, corrected, or superseded, with the linked product-owner feedback note and cooldown evidence when resolved. |

List each checkpoint's **new** assumptions at the very top of its nontechnical
end report, including ID, short reading, and rulebook citation. A correction
from the owner enters [feedback](PRODUCT_MILESTONE_FEEDBACK.md) and is fixed in
the cooldown pass before a new milestone build. Do not retroactively rewrite
the original assumption; append the resolution so the decision is traceable.

## Entries

### PC04-A1 — Mission Leader selection is recorded, not decided, by the GM

| Field | Record |
|---|---|
| ID and milestone | PC04-A1; exploration and split-fleet map. |
| Source passage | Player's Guide v1.1, printed pp. 10 and 14–15, Away Missions: the players decide who joins each mission and select one participant as Mission Leader before the facilitator deals the mission cards and resolves the procedure. Facilitator's Guide v1.1, printed pp. 13–14, Away Missions: the facilitator runs the mission procedure, records its result, and handles any reward. A4 card pack v1.1, printed shuttle and ship sheets: ordinary away-mission carriage comes from active printed craft. The inspected away-mission procedure recommends at least three shuttles but does not print a numeric passenger capacity for those craft. |
| Ambiguity and alternatives | The printed rules require the team to select the Mission Leader but do not name the digital actor who enters that already-made choice. Plausible digital readings are participant self-service, a leader claim, or a facilitator record. The source also does not create a default participant, a mission without eligible transport, a numeric passenger cap, or general permission for optional vessels whose separate admission rules are unfinished. |
| Chosen reading | The participating team still makes the choice; the active GM only records one connected participant roster and its single selected leader. The server rejects an empty roster, a leader outside that roster, a participant outside the bound fleet group, or a start without currently eligible, usable, colocated active craft. A connected same-group participant does not need to own that craft personally, and no passenger number is invented from the source's shuttle recommendation. Optional Gorgoneion, Capybara, Warrior, Union, and other separately governed craft are excluded until their own canonical admission rules are complete. |
| Product effect | Prompt 401 binds mission start to the exact opportunity, fleet group, coordinate, cycle, roster, and selected leader. The authoritative transaction may then automate the source-deterministic initial deal from Prompt 403 and append the GM-log receipt required by PC03-F05. Focused domain, callable, privacy, replay, stale-revision, rules, and projection tests rely on this reading. |
| Review state | Accepted with the owner's explicit PC04 authorization on 2026-09-28. A later correction still enters cooldown. |

### PC01-A1 — Receiving ship for a shuttle's scanned coordinate

| Field | Record |
|---|---|
| ID and milestone | PC01-A1; Shepherd science station. |
| Source passage | A4 card pack v1.1, general shuttle rules and R.S.S. Endeavour sheet: shuttle docking follows its holder's current ship, and Endeavour scouts a system during Coordination. Player's Guide v1.1, Scouting section: the requesting scout receives the facilitator's system lookup and may take notes. |
| Ambiguity and alternatives | The printed rules do not define which digital ship map gains a coordinate when the shuttle is docked away from its owning role's ship. Plausible recipients are the role's home ship, the docked ship when the request is made, or the ship where the shuttle happens to be when the facilitator reveals the result. |
| Chosen reading | Record the shuttle's valid parked host at request time as the receiving ship for map-coordinate knowledge. Keep the private result and note with the requesting player and role's current valid group, including after a legitimate same-ship fleet split. Later docking movement cannot redirect a pending scan. |
| Product effect | Scout receipts and resolved coordinate knowledge bind to the request-time host; a different ship cannot read that coordinate merely because the craft later moves. This affects Prompts 321, 328–330, and 677, with request, replay, result, and two-ship projection tests. |
| Review state | New; pending explicit PC01 checkpoint authorization or a later owner correction. A UI walkthrough is optional. |

### PC01-A2 — Hidden Deep Nebula scouting progress

| Field | Record |
|---|---|
| ID and milestone | PC01-A2; Shepherd science station. |
| Source passage | Away Mission booklet v1.1, O — Deep Nebula, with Facilitator's Guide pp. 13–15, 19 context: each scouting mission there affects eventual ship jump rolls, while the accumulated bonus is withheld from players in advance. |
| Ambiguity and alternatives | The printed instruction does not specify what a digital scout receipt should say about accumulating progress. Showing the count, showing no feedback, and giving a nonnumeric hint are plausible UI readings. |
| Chosen reading | Persist one server-only marker per committed Deep Nebula scout result and show the requester a qualitative progress hint. Do not include a numeric total in the result, note, map, or hint. The later jump resolver may count the markers when its separate checkpoint implements that action. |
| Product effect | Prompt 332 records exact-once hidden scans; Prompt 333 gives the Scientist useful feedback without exposing the accrued modifier. Replay, wrong-recipient, and no-total checks cover the boundary. |
| Review state | New; pending explicit PC01 checkpoint authorization or a later owner correction. A UI walkthrough is optional. |

### PC02-A1 — Departed core stations remain vacant without facilitator rerole

| Field | Record |
|---|---|
| ID and milestone | PC02-A1; setup, fleet board, and session continuity. |
| Source passage | Facilitator's Guide v1.1, printed p. 12, and routed role reference: a facilitator may give a player who dies or needs a new role another role, with extra ships available for removed or late players. The source does not define automatic takeover of a departed player's core station. |
| Ambiguity and alternatives | After a deliberate midgame departure, the vacated seat could remain open for facilitator action, automatically pass to another player, or be reclaimed by the departing identity. The printed rerole instruction does not authorize an automatic transfer. |
| Chosen reading | Deliberate Leave Session ends that member's role and seat authority and clears their private projection. The active game continues for everyone else. A temporary connection loss keeps the same member's assignment for resume; a deliberate leave does not. Do not add a generic midgame core-seat claim without a separate source-backed casting rule. |
| Product effect | PC01-F05 and PC01-F10 use separate leave and resume paths across every supported non-GM role. Callable and composition tests cover the continuing session, released authority, exact-seat vacancy, private-state removal, and same-member transient recovery. |
| Review state | Accepted with the owner's explicit PC02 checkpoint authorization on 2026-09-28. A later correction still enters cooldown. |

### PC05-A1 — Facilitator-selected failed-jump damage

| Field | Record |
|---|---|
| ID and milestone | PC05-A1; gameplay completion, Prompt 299. |
| Source passage | Facilitator Guide v1.1, printed p. 16, Jump Failures (physical PDF p. 18), visually checked 2026-09-28: fuel shortage, damaged-drive failure, or incorrect entered coordinates may be adjudicated as a completed jump with damage determined by a six-sided die. The facilitator may alternatively leave the ship in place. |
| Ambiguity and alternatives | This is a facilitator choice rather than an automatic penalty. The source also offers half-die damage and wrong-location outcomes, but does not define half-point rounding or a digital selection procedure. |
| Chosen reading | Keep the ordinary failed attempt stationary and resource-preserving. An authenticated active facilitator may deliberately select the full-die damage option against that exact unresolved failed attempt; the server rolls once, uses the common damage-draw path, records the adjudication and completes the chosen legal movement atomically. Do not silently apply damage, allow the client to choose randomness, or invent half-die rounding. |
| Product effect | The P299 implementation must bind authority, failure receipt, destination, revision and request replay, prevent duplicate movement/damage, and provide an audience-safe result. This is a source-backed implementation decision under the owner's standing autonomous PC05 authorization; implementation and live proof remain required. |
| Review state | New; owner may correct during optional feedback/cooldown. No completion or deployment credit claimed. |

### PC05-A2 — Fuel spent on an adjudicated fuel-starved jump

| Field | Record |
|---|---|
| ID and milestone | PC05-A2; gameplay completion, Prompt 299. |
| Source passage | Facilitator Guide v1.1, printed p. 16, Jump Failures: a facilitator may let a fuel-starved ship reach its destination with die-determined damage. The paragraph does not state the fuel debit for this exception. |
| Ambiguity and alternatives | Charging the normal amount would make inventory negative; waiving all spending would make the exceptional jump free; spending the available balance uses the resources the ship actually possesses. |
| Chosen reading | An explicitly selected full-die adjudication consumes all available fuel when the failed attempt was fuel-starved. This is a conservative product inference, not an asserted printed fuel formula. It grants no fuel, permits no negative balance and does not reset the once-per-cycle limit. A changed revision or intervening fuel transfer requires a fresh decision. |
| Product effect | The GM exception completes the movement, spends fuel and any charge, applies common-path damage and records the outcome atomically against the exact failure. Replay cannot repeat spending, damage or movement. Ordinary denied attempts remain resource-preserving. |
| Review state | New under standing autonomous PC05 authorization; subject to optional owner correction/cooldown. |

### PC05-A3 — Mutiny recovery in a roster without a Captain seat

| Field | Record |
|---|---|
| ID and milestone | PC05-A3; gameplay completion, Prompts 136–137. |
| Source passage | Facilitator Guide v1.1, printed p. 17: a ship at mutiny is unusable until a new captain is appointed; the facilitator reduces unrest by one to three, normally two. The printed procedure allows replacing or swapping the former captain. |
| Ambiguity and alternatives | A sparse digital roster may contain real officers but no canonical Captain seat. The source does not define how such a roster records command. Adding a seat would alter the confirmed roster and its station and craft entitlements. |
| Chosen reading | Where an occupied canonical Captain seat exists, retain the actual authorized role swap. Otherwise the facilitator may appoint a real active same-ship officer as acting captain, with a durable server-private command identity exposed only in the authorized GM projection. Keep the locked roster, seat ownership, craft manifest and console entitlements unchanged. A subsequent replacement must choose someone other than the recorded acting captain; with no eligible replacement, recovery remains unavailable. This sparse-roster representation is a product inference, not an asserted printed digital rule. |
| Product effect | Recovery applies the source-range unrest reduction atomically with the appointment and releases the mutiny lock. Public projections must not disclose the private command identity. Authority, candidate eligibility, stale requests, replay and canonical-seat consistency require focused tests. |
| Review state | New under standing autonomous PC05 authorization; subject to optional owner correction/cooldown. Implementation and ordinary gameplay evidence remain required. |

### PC05-A4 — Command replacement on optional small craft and Voyage 33-0

| Field | Record |
|---|---|
| ID and milestone | PC05-A4; gameplay completion, Prompts 136–137. |
| Source passage | Facilitator Guide v1.1, printed p. 17 (physical p. 19), applies the unrest-eight mutiny lock until a new captain is installed and permits a facilitator-selected one-to-three unrest reduction, normally two. The optional vessel sheets give the four base small craft and Voyage 33-0 their own unrest and maintenance. |
| Ambiguity and alternatives | Base small craft have printed Captain replacement roles in the digital catalog; Voyage 33-0 has no player Captain role. The source does not prescribe digital command transfer or an account for its crew captain. Host-operated maintenance cannot by itself stand in for command replacement. |
| Chosen reading | For a player-commanded base craft, transfer its actual Captain replacement role from its current holder to a different real, active player with valid replacement eligibility, using the established re-role and core-seat release boundary. The former holder awaits re-role without regaining historical core authority. For Voyage 33-0, require explicit authenticated facilitator attestation of an in-world crew captain replacement; create no player, seat or role and grant no user authority. These are documented digital product inferences. |
| Product effect | Each craft has a durable mutiny lock that guards fresh operations before spending or randomness. Recovery binds the exact craft, revision and request, installs the replacement or records the Voyage attestation atomically with the source-range reduction, and preserves private identities, canonical seats and host ledgers. Authorized exact receipt replay cannot repeat the transfer or reduction. |
| Review state | New under standing autonomous PC05 authorization; subject to optional owner correction/cooldown. Implementation, independent review and ordinary gameplay proof remain required. |


### PC05-A5 — Preserve the existing jump-distance bands

| Field | Record |
|---|---|
| ID and milestone | PC05-A5; gameplay completion, Prompt 287. |
| Source passage | The routed guide and component material describe short, medium and long jumps. The PC05 source pass did not locate a primary numeric legend defining their graph-distance boundaries. |
| Ambiguity and alternatives | Changing an unverified boundary would change fuel and legality without stronger source evidence. The existing console uses one graph edge for short, two for medium and three or more for long. |
| Chosen reading | Preserve those existing one/two/three-plus distance bands as a bounded compatibility assumption. This is not a claim that the printed rules specify those numbers. Keep the server and displayed cost on the same policy; correct both together if primary evidence or owner feedback establishes another boundary. |
| Product effect | Prompt 287 uses one authoritative classification for ordinary jumps and their fuel readout. Tests cover each boundary and the actual route; source uncertainty remains visible in the checkpoint report. This does not alter the separate Deep Nebula procedure in P551. |
| Review state | New under standing autonomous PC05 authorization; subject to optional owner correction/cooldown. Implementation and ordinary gameplay proof remain required. |

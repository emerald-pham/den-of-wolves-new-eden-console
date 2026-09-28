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

### PC01-A1 — Receiving ship for a shuttle's scanned coordinate

| Field | Record |
|---|---|
| ID and milestone | PC01-A1; Shepherd science station. |
| Source passage | A4 card pack v1.1, general shuttle rules and R.S.S. Endeavour sheet: shuttle docking follows its holder's current ship, and Endeavour scouts a system during Coordination. Player's Guide v1.1, Scouting section: the requesting scout receives the facilitator's system lookup and may take notes. |
| Ambiguity and alternatives | The printed rules do not define which digital ship map gains a coordinate when the shuttle is docked away from its owning role's ship. Plausible recipients are the role's home ship, the docked ship when the request is made, or the ship where the shuttle happens to be when the facilitator reveals the result. |
| Chosen reading | Record the shuttle's valid parked host at request time as the receiving ship for map-coordinate knowledge. Keep the private result and note with the requesting player and role's current valid group, including after a legitimate same-ship fleet split. Later docking movement cannot redirect a pending scan. |
| Product effect | Scout receipts and resolved coordinate knowledge bind to the request-time host; a different ship cannot read that coordinate merely because the craft later moves. This affects Prompts 321, 328–330, and 677, with request, replay, result, and two-ship projection tests. |
| Review state | New; awaiting owner PC01 UI review. |

### PC01-A2 — Hidden Deep Nebula scouting progress

| Field | Record |
|---|---|
| ID and milestone | PC01-A2; Shepherd science station. |
| Source passage | Away Mission booklet v1.1, O — Deep Nebula, with Facilitator's Guide pp. 13–15, 19 context: each scouting mission there affects eventual ship jump rolls, while the accumulated bonus is withheld from players in advance. |
| Ambiguity and alternatives | The printed instruction does not specify what a digital scout receipt should say about accumulating progress. Showing the count, showing no feedback, and giving a nonnumeric hint are plausible UI readings. |
| Chosen reading | Persist one server-only marker per committed Deep Nebula scout result and show the requester a qualitative progress hint. Do not include a numeric total in the result, note, map, or hint. The later jump resolver may count the markers when its separate checkpoint implements that action. |
| Product effect | Prompt 332 records exact-once hidden scans; Prompt 333 gives the Scientist useful feedback without exposing the accrued modifier. Replay, wrong-recipient, and no-total checks cover the boundary. |
| Review state | New; awaiting owner PC01 UI review. |

### PC02-A1 — Departed core stations remain vacant without facilitator rerole

| Field | Record |
|---|---|
| ID and milestone | PC02-A1; setup, fleet board, and session continuity. |
| Source passage | Facilitator's Guide v1.1, printed p. 12, and routed role reference: a facilitator may give a player who dies or needs a new role another role, with extra ships available for removed or late players. The source does not define automatic takeover of a departed player's core station. |
| Ambiguity and alternatives | After a deliberate midgame departure, the vacated seat could remain open for facilitator action, automatically pass to another player, or be reclaimed by the departing identity. The printed rerole instruction does not authorize an automatic transfer. |
| Chosen reading | Deliberate Leave Session ends that member's role and seat authority and clears their private projection. The active game continues for everyone else. A temporary connection loss keeps the same member's assignment for resume; a deliberate leave does not. Do not add a generic midgame core-seat claim without a separate source-backed casting rule. |
| Product effect | PC01-F05 and PC01-F10 use separate leave and resume paths across every supported non-GM role. Callable and composition tests cover the continuing session, released authority, exact-seat vacancy, private-state removal, and same-member transient recovery. |
| Review state | New; awaiting the PC02 owner walkthrough. |

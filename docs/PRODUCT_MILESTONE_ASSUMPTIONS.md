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

### PC06-A1 — Keep vessel rules bound to the printed craft

| Field | Record |
|---|---|
| ID and milestone | PC06-A1; vessel movement and away missions, Prompts 202, 210, 222, 232, 236, 241a, 251, and 259. |
| Source passage | Player's Guide v1.1, printed pp. 9–10; base A3 ship sheets v1.1, printed pp. 3–6; base A4 duplex card pack v1.1, PDF pp. 23 and 25; base A4 single-sided pack v1.1, PDF p. 38 (Voyage 33-0); Capybara expansion v1.1, complementary A3 ship sheet and A4 rules. The sheets give each craft's own jump cost, charge/damage behavior, and fuel source. The base small-ship Capybara draws fuel from its current host; Voyage 33-0 uses fuel from its docked host at 1/1/2; the separate expansion ship has its own drive and 3/6/12 costs. The Icebreaker's charged Ram Scoop yields 10/15/20 ore by jump length and the upgrade adds five. |
| Ambiguity and alternatives | The same Capybara name refers to two different craft. A generic jump-cost fallback or merging the two states would contradict the printed sheets. A transit animation must also not imply arrival before the server commits it. |
| Chosen reading | Dispatch by the server-validated craft and explicit mode. Apply the exact sheet cost and source of fuel; preserve the existing common charge, damage, authorization, and retry contract. A committed jump alone changes arrival state. The base small craft and full expansion ship never share one behavior or inventory. |
| Product effect | Vessel jump audits, host-fuel movement, Ram Scoop yield, and transition UI use one authoritative result; invalid mode or malformed host state fails closed. Tests distinguish every assigned craft and both Capybara modes. |
| Review state | New under explicit PC06 authorization; source pages and derivatives were visually checked while shaping. |

### PC06-A2 — Keep blind-jump selection private and server-owned

| Field | Record |
|---|---|
| ID and milestone | PC06-A2; blind jump, Prompt 679. |
| Source passage | No blind-jump procedure is printed in the v1.1 rulebooks. The deliberate product extension is explicitly required by the assigned Prompt 679 acceptance and evidence `E-679`. |
| Ambiguity and alternatives | A client-selected neighbor, leaked candidate list, or UI scramble coupled to gameplay randomness could reveal or influence hidden chart state. Omitting the feature would fail the assigned prompt. |
| Chosen reading | The authenticated server reads the current node and locked chart, selects one directly adjacent destination, and passes that destination through ordinary jump authority once. Bind it to the request receipt so retries cannot redraw. The animated digits are cosmetic, never announce a preview, and stop on commit, denial, or cancellation; reduced motion displays a stable, readable pending state. |
| Product effect | Prompt 679 tests prove adjacency, no neighbor/chart leak, normal fuel and consequence handling, exact replay, arrival knowledge, timer cleanup, cadence, and separation between cosmetic digits and the server's draw. |
| Review state | New product extension under explicit PC06 authorization; never represented as printed source authority. |

### PC06-A3 — Preserve the printed away-mission card sequence and privacy

| Field | Record |
|---|---|
| ID and milestone | PC06-A3; Prompts 237, 401, 404, 405, and 407–408. |
| Source passage | Player's Guide v1.1, printed pp. 14–15, Away Missions; Facilitator's Guide v1.1, printed p. 13; base A4 card pack v1.1, Gorgoneion Captain sheet on printed p. 23. The participant team chooses one leader; each player receives a secret initial card; the leader assigns extra cards face down without learning their values; players may request a count without revealing why; each secretly discards one card and places every remaining card face down at no more than one per opportunity. The Gorgoneion Captain's support rearranges the top five deck cards before the deal. |
| Ambiguity and alternatives | The printed procedure does not authorize a facilitator or leader to view participant hands or card values before reveal. It does not state a numeric passenger capacity from the recommendation to send several shuttles. A pre-deal support action cannot be replayed after the deal. |
| Chosen reading | Reuse the source-bound participant and leader selection already recorded by PC04-A1; bind all hands and choices to that immutable mission, participant, and revision. Only the entitled participant reads their hand; the leader can see request counts, not reasons or values. Apply Gorgoneion support only for an already admitted craft with its current entitled Captain, before the first card is dealt. Do not turn the source's shuttle recommendation into a capacity rule. |
| Product effect | Private deal, blind distribution, request, discard, placement, support, and retry tests keep cards and request reasons private and reject stale or duplicate actions. |
| Review state | New under explicit PC06 authorization; earlier PC04-A1 remains the authority for recording the team's roster and leader choice. |

### PC06-A4 — Use each opportunity's printed outcome threshold

| Field | Record |
|---|---|
| ID and milestone | PC06-A4; Prompts 409–413, 243, 334, and 335. |
| Source passage | Player's Guide v1.1, printed p. 14; Facilitator's Guide v1.1, printed p. 14, Away Mission Rewards; selected chart's printed mission card. Card values are rank-based, shuttle/role bonuses apply only after a participant contributes, and mission cards may give distinct success and critical-success numbers and rewards. The Facilitator's Guide says an empty opportunity receives no extra card and automatically fails. |
| Ambiguity and alternatives | Treating every critical success as an invented fixed margin, adding a facilitator card to an empty pile, or applying a shuttle bonus without its participant's contribution can create an outcome the source does not permit. |
| Chosen reading | The server calculates from the committed assignments and the selected chart's exact success and critical thresholds, applies only a qualifying contribution bonus, and resolves success and critical reward branches separately. It deals/shuffles an extra card only for nonempty opportunities; an empty opportunity fails without a draw. Exact source outcomes update authoritative state once and are logged with inputs, modifiers, outcome, delta, revision, replay identity, and recovery. |
| Product effect | Prompts 409–413 and 243 cover deterministic totals, special Warrior salvage, empty failure, critical reward, and Mission Leader custody; 334 records only the D reward's two valid chart targets, while 335 restricts the Athena Wolf reveal to valid L/M systems. Reward knowledge does not create a ship arrival or duplicate visit event. |
| Review state | New under explicit PC06 authorization; source outcome branches and printed reward page were visually checked while shaping. |

### PC06-A5 — Keep mission play active through an overrun

| Field | Record |
|---|---|
| ID and milestone | PC06-A5; Prompts 414, 415, and 622. |
| Source passage | Facilitator's Guide v1.1, printed pp. 13–14, Away Missions: if a mission crosses into Team Phase, the mission continues with its shuttles and players until complete; rewards are given to the Mission Leader, who may drop them at one ship when their shuttle cannot carry them. |
| Ambiguity and alternatives | A digital phase change must not silently release mission participants or their craft for incompatible movement, duplicate the reward, or let a retry redirect its recipient. |
| Chosen reading | Keep the same mission, participants, and committed craft in the overrun state until its source-deterministic resolution completes. The Mission Leader retains the reward; if a source-limited drop is needed, bind the chosen legal ship and exact reward to a single revision-checked action. |
| Product effect | Prompt 414 blocks conflicting movement during the overrun; Prompt 415 verifies one legal drop-off and no duplication; Prompt 622 hydrates only each participant's private hand/choices plus the current public mission state. |
| Review state | New under explicit PC06 authorization; exact overrun and custody procedure is printed, with the receipt as its digital product representation. |

### PC06-A6 — Preserve independent split-fleet state

| Field | Record |
|---|---|
| ID and milestone | PC06-A6; Prompts 151 and 307. |
| Source passage | Facilitator's Guide v1.1, printed p. 16, Split Fleet: each separated part maintains its own pursuit score and players are restricted from communicating between fleets. |
| Ambiguity and alternatives | A shared fleet-level pursuit value or general cross-group messaging would erase the printed split boundary. The scout-taxi exception is separate and is not part of these two assigned prompts. |
| Chosen reading | Key pursuit changes and ordinary message authorization by the current server-owned group identity. A group's action cannot update another group's pursuit or audience. Keep taxi transport on its distinct authorization path and leave taxi/rejoin implementation to its assigned later tranche. |
| Product effect | Prompts 151 and 307 test group-local messages and pursuit, malformed or stale group denial, and the separate taxi-path discriminator without claiming PC07 work complete. |
| Review state | New under explicit PC06 authorization; the source page was rendered and visually checked. |

### PC06-A7 — Limit dismantling permission to the printed target-ship consent

| Field | Record |
|---|---|
| ID and milestone | PC06-A7; permissioned dismantling, Prompt 385. |
| Source passage | Base A4 card pack v1.1, printed engineering-shuttle sheets, including the Gorgoneion/Warrior and other engineering-craft rules: an engineering craft may damage a target console for its printed materials/scrap benefit only with permission from at least one player on that target ship. |
| Ambiguity and alternatives | The paper rule says whose permission is needed but does not define a digital consent lifetime or replay binding. A self-approved dismantle or general ship-wide standing permission would be broader than the printed action. |
| Chosen reading | Require one active player currently assigned to the target ship to affirm the exact proposed craft, target ship, console, and source cost. The server consumes that actor-bound, one-use consent against the current target revision in the same transaction as damage and resource changes; stale, reused, or changed proposals do nothing. |
| Product effect | Prompt 385's accepted action is source-limited to an eligible console and exact printed cost; tests cover wrong ship, missing/revoked or stale consent, duplicate/replay, insufficient resources, and atomic no-change failures. |
| Review state | New under explicit PC06 authorization. The exact transaction lifetime is a conservative product extension recorded here, not a printed timing rule. |

### PC06-A8 — Limit two-system mission rewards to knowledge, not travel

| Field | Record |
|---|---|
| ID and milestone | PC06-A8; mission map rewards, Prompts 334–335. |
| Source passage | Facilitator's Guide v1.1, printed p. 14: the D mission can reward exploring two star systems, and the Athena mission's Wolf-system reward names systems L or M. Prompt 334/335 acceptance further requires chart-valid reveals without arrival-only effects or duplicate discoveries. |
| Ambiguity and alternatives | “Explore” does not identify a digital viewer, disclose private map state, or say that the ship physically arrives. Recording an arrival would silently trigger unrelated travel and new mission eligibility. |
| Chosen reading | Record only chart-valid knowledge in the mission's entitled audience, never a ship position, jump receipt, arrival event, or a second discovery of a known coordinate. Athena's list is restricted to systems labeled L/M by the selected chart. |
| Product effect | Prompt 334 tests two distinct eligible reveals without travel or duplicate discoveries; Prompt 335 rejects non-L/M and chart-mismatched targets. |
| Review state | New under explicit PC06 authorization; the catalog acceptance supplies the digital limit beyond the printed reward. |

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

### PC05-A6 — Resolve the optional pursuit-ten emergency before final failure

| Field | Record |
|---|---|
| ID and milestone | PC05-A6; gameplay completion, Prompt 300 and pursuit lifecycle. |
| Source passage | Facilitator Guide v1.1, printed p. 16, Emergency Jump: reaching pursuit ten permits an optional facilitator offer of an emergency jump, once per game per ship, regardless of fuel or drive charge. |
| Ambiguity and alternatives | The paper procedure leaves the timing of the optional offer to the facilitator. Immediate irreversible digital failure prevents that choice; letting a ship move after final failure without resolving the outcome does not provide a useful escape. |
| Chosen reading | At the pursuit-ten transition, persist a server-owned decision window before final failure. Suspend unrelated fresh gameplay. An active facilitator explicitly offers the emergency opportunity or declines it; decline commits the existing pursuit-limit outcome. Offered emergency moves retain all printed costs and once-per-game limits. Existing navigation and pursuit rules determine whether any groups remain at the limit and whether play can resume; add no special pursuit reduction. Provide a deterministic terminal path when no eligible vessel remains. This decision-window representation is a digital product inference. |
| Product effect | The GM decision and each ship operation need exact authority, revision and replay binding, visible waiting/decision controls, and no stranded window. Successful escape must be evaluated before a permanent outcome, rather than preserving failure regardless of movement. |
| Review state | New under standing autonomous PC05 authorization; implementation, independent review and ordinary gameplay proof remain required. Subject to optional owner correction/cooldown. |

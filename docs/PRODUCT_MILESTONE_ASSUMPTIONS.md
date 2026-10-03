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
| Ambiguity and alternatives | The same Capybara name refers to two different craft. A generic jump-cost fallback or merging the two states would contradict the printed sheets. A transit animation must also not imply arrival before the server commits it. The Icebreaker sheet says “When you FTL jump” without a separate emergency-jump exception, while the emergency callable follows a distinct transaction path. |
| Chosen reading | Dispatch by the server-validated craft and explicit mode. Apply the exact sheet cost and source of fuel; preserve the existing common charge, damage, authorization, and retry contract. A committed jump alone changes arrival state. The base small craft and full expansion ship never share one behavior or inventory. Treat a successful emergency FTL as an FTL jump for Ram Scoop: evaluate charge and damage against the Icebreaker's pre-movement state, then apply its printed gain atomically with the jump. This resolves digital timing; the source supplies no emergency exception. |
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
| Chosen reading | Reuse the source-bound participant and leader selection already recorded by PC04-A1; bind all hands and choices to that immutable mission, participant, and revision. Only the entitled participant reads their hand; the leader can see request counts, not reasons or values. Apply Gorgoneion support only for an already admitted craft with its current entitled Captain, before the first card is dealt. Where the source does not order cards assigned to the same end, preserve their relative order from the inspected top five; this digital tie-breaker adds no extra card-order choice. Do not turn the source's shuttle recommendation into a capacity rule. |
| Product effect | Private deal, blind distribution, request, discard, placement, support, and retry tests keep cards and request reasons private and reject stale or duplicate actions. |
| Review state | New under explicit PC06 authorization; earlier PC04-A1 remains the authority for recording the team's roster and leader choice. |

### PC06-A10 — Use existing Gorgoneion admission for one private pre-deal support action

| Field | Record |
|---|---|
| ID and milestone | PC06-A10; Gorgoneion mission support, Prompt 237. |
| Source passage | Player's Guide v1.1, printed pp. 14–15, Away Missions; base A4 card pack v1.1, Gorgoneion Captain sheet on printed p. 23. The inspected rule lets the Gorgoneion Captain rearrange the top five mission cards before the deal. |
| Ambiguity and alternatives | The rule does not define a digital admission record, who may submit the action, how the Captain inspects a shuffled deck, how retries work, or whether the command mutates only the top five or can reorder the whole deck. Treating Gorgoneion as a normal active core vessel would broaden its printed status. |
| Chosen reading | Use the existing server-owned small-craft docking state as admission: Gorgoneion must be docked to a current active core host, and the connected actor must hold the current `gorgoneion-captain` replacement role with no pending replacement. Do not add Gorgoneion to `activeVesselIds` or make it an away-mission carrier. Before the first mission card in a session is dealt, the entitled Captain may submit one exact partition of the inspected top five into top and bottom groups. Preserve relative order inside each group and leave the deck tail between them. Return the rank/suit faces only to that Captain; other members and the GM receive no projection. The support transaction and first-deal transaction serialize on the same private mission-deck document. A stable command receipt replays only the exact accepted action; a second action, post-deal action, stale projection, or lost admission fails without changing the deck. |
| Product effect | Prompt 237 exercises the already-existing optional-craft docking and replacement-role authority without silently enabling a vessel. Tests cover private projection, actor/admission changes, exact partition, one-use/dealt-state guards, stable replay/collision, and concurrency with the initial deal. The UI may display the five authorized card faces to the entitled Captain; deck order, other hands, and card faces remain private from other readers. |
| Review state | Owner interpretation under the standing PC06 authorization and the user's direction to use judgment for unresolved digital mechanics. Source provenance was already verified in the PC06 audit; this record does not copy private source material. |

### PC06-A11 — Bind Bulk Haulage to the admitted base Capybara at mission start

| Field | Record |
|---|---|
| ID and milestone | PC06-A11; base Capybara Bulk Haulage, Prompt 241b. |
| Source passage | Base A4 small-craft sheet v1.1, printed p. 25, Capybara Captain; Player's Guide v1.1, printed pp. 14–15, Away Missions. The Capybara Captain has a Bulk Haulage benefit, and away-mission cards are assigned to specific participants and opportunities. |
| Ambiguity and alternatives | The rules do not specify how a digital mission proves the Capybara's presence, whether an expansion Capybara shares this base-craft benefit, or how the benefit follows a contributed card across multiple opportunities. A role label alone could grant the benefit after the small craft has moved or lost admission. |
| Chosen reading | Bind participant role and craft eligibility in the immutable P403 start receipt. A selected `capybara-small-captain` participant receives the base-craft binding only when strict base Capybara admission succeeds and its docked host belongs to the opportunity group at that opportunity's coordinate at start time. When that participant assigns a card to an opportunity, add one unit of each resource type whose successful reward amount is positive for that opportunity. An empty or failed opportunity grants none. Carrier availability remains a separate list, and the full expansion ship never qualifies as the base small craft. These are digital product rules, not additional printed text. |
| Product effect | Prompt 241b rewards only the eligible participant's committed contribution to the matching opportunity; the immutable binding survives later role, docking, and movement changes. Tests cover malformed admission, wrong group/coordinate, expansion mode, contribution, failed/empty outcomes, and exact per-resource reward changes. |
| Review state | New under the standing PC06 authorization and the user's direction to use judgment for unresolved digital mechanics; optional owner feedback may correct it during the checkpoint cooldown. |

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
| Ambiguity and alternatives | The paper rule says whose permission is needed but does not define a digital consent lifetime, pending-request queue, refusal flow, revocation window, or replay binding. A self-approved dismantle or general ship-wide standing permission would be broader than the printed action. |
| Chosen reading | Require a different active player currently assigned to the target ship to approve the exact proposed craft, target ship, console, and source cost. The server binds one-use consent to the current target revision and craft-control revision, then consumes it atomically with damage and resource changes. While pending, the target player may decline; after approval, that player may revoke until the craft holder applies it. Declined or revoked requests are terminal and require a new proposal. Keep at most one pending or consented request in each target ship's inbox; a new target revision makes the old request stale and prevents its consent from applying. |
| Product effect | Prompt 385's accepted action is source-limited to an eligible console and exact printed cost. The allowlisted inbox is readable only by the current target-ship player and original proposer, cannot be listed or client-written, and exposes only the decision status and consent ID needed by those players—not the private consent record or raw damage/resource state. Tests cover wrong ship, inactive or self authority, missing/revoked/declined or stale consent, duplicate/replay, insufficient resources, and atomic no-change failures. |
| Review state | New under explicit PC06 authorization. The consent lifetime, decline/revoke choices, single-open-request rule, and inbox audience are digital product decisions recorded here, not printed timing or authority rules. |

### PC06-A8 — Limit two-system mission rewards to knowledge, not travel

| Field | Record |
|---|---|
| ID and milestone | PC06-A8; mission map rewards, Prompts 334–335. |
| Source passage | Facilitator's Guide v1.1, printed p. 14: the D mission can reward exploring two star systems, and the Athena mission's Wolf-system reward names systems L or M. Prompt 334/335 acceptance further requires chart-valid reveals without arrival-only effects or duplicate discoveries. |
| Ambiguity and alternatives | “Explore” does not identify a digital viewer, disclose private map state, or say that the ship physically arrives. Recording an arrival would silently trigger unrelated travel and new mission eligibility. |
| Chosen reading | Record only chart-valid knowledge in the mission's entitled audience, never a ship position, jump receipt, arrival event, or a second discovery of a known coordinate. Athena's list is restricted to systems labeled L/M by the selected chart. |
| Product effect | Prompt 334 tests two distinct eligible reveals without travel or duplicate discoveries; Prompt 335 rejects non-L/M and chart-mismatched targets. |
| Review state | New under explicit PC06 authorization; the catalog acceptance supplies the digital limit beyond the printed reward. |

### PC06-A9 — Represent same-table trades as bilateral transfers of held tokens

| Field | Record |
|---|---|
| ID and milestone | PC06-A9; same-table trades, Prompt 112. |
| Source passage | Player's Guide v1.1, printed p. 5, Resources: five resource types are represented by tokens or resource sheets; they may be exchanged at a ship's table, while moving them between tables requires a capable shuttle. Security Teams move between ships and shuttles as resources. |
| Ambiguity and alternatives | The printed rule does not define digital inventory owners, starting inventory values, consent, exact exchange amounts, or retry behavior. A shared ship-store transfer would not represent one participant handing held tokens to another and could bypass the separate shuttle requirement for cross-table movement. |
| Chosen reading | Keep a distinct personal inventory for the physical tokens each active player holds. Before enabling trade, the active facilitator records the existing tabletop counts for each participant; this attests current tokens rather than granting stock from a ship. One participant proposes exact typed quantities to another; only that recipient may accept that exact proposal, and the server commits both sides atomically only while both remain active aboard the same ship/table. An assigned replacement role with no pending replacement status determines the current table and supersedes the historical printed seat; a player awaiting reassignment or holding a role with no mapped vessel has no current trade table. Reject overdraw, stale or changed proposals, wrong-table participants, and exact-replay duplication without changing either inventory. Only ore, fuel, food, water, materials, and Security Teams are tradeable. This feature cannot move tokens between tables; require the printed shuttle path. Inventory, identity, consent, and receipt details are digital product choices, not printed rules. |
| Product effect | Prompt 112 uses server-owned per-player balances, facilitator-attested baseline counts, exact bilateral consent, current table membership, atomic balance checks, and stable receipts. Ship stores remain separate. Tests prove overdraw, stale, replay, and wrong-location failures are no-ops. |
| Review state | New under the standing PC06 authorization and the user's instruction to use judgment on unresolved digital contracts. Source checked directly; the chosen digital representation remains subject to ordinary review and later owner feedback cooldown. |

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

### PC06-A12 — Preserve Warrior's material reward and salvage restriction

| Field | Record |
|---|---|
| ID and milestone | PC06-A12; Prompt 243, Warrior Reclamator. |
| Source passage | Base A4 duplex card pack v1.1, Warrior card, physical PDF page 27; SHA-256 checked against the private provenance index and the rendered page read on 2026-09-30. The ability replaces the whole hand's assignment to one salvage opportunity and grants material plus food or water for each discarded card. |
| Ambiguity and alternatives | The printed wording does not specify a digital choice control or whether one food/water choice must cover the whole hand. The previous implementation incorrectly offered material as an alternative and permitted other opportunity types. |
| Chosen reading | Require the admitted Warrior participant and a salvage opportunity. Discard every remaining owned card, granting one material for each plus that card's food or water selection. Per-card choices are the digital representation; a material-only choice is invalid. Preserve the hidden card-to-choice association on the server and participant's private projection. |
| Product effect | The player sees the material component explicitly; server validation and authoritative reward custody retain both components. The same source pass binds Endeavour, Highwall and PDF printed contribution bonuses alongside Starlight and Hummingbird. No source card or extracted private text is stored in Git. |
| Review state | Implementation correction under standing PC06 authorization; local tests pass. Independent review, deployment and ordinary gameplay proof remain required. |

### PC06-A13 — Keep rescued survivor counts exact within printed capacity

| Field | Record |
|---|---|
| ID and milestone | PC06-A13; Prompts 412–413 reward delivery and its existing population/evacuation consumers. |
| Source passage | Athena mission reward specifies numeric survivor amounts. Facilitator Guide v1.1, printed p. 17 (physical PDF p. 19), visually checked against its private indexed SHA-256 on 2026-09-30, caps a ship at its starting survivor population and replaces ration tables by population bands. |
| Ambiguity and alternatives | An exact rescue amount can land between physical population markers. Rounding on delivery loses or invents survivors; rejecting the resulting ledger strands rations, counters and evacuation. The printed procedure does not specify that digital edge. |
| Chosen reading | Preserve the exact integer amount and reject a delivery exceeding the destination's starting capacity without changing custody or balances. Select the existing printed ration band containing the exact count. A subsequent explicit population step moves to the adjacent marker in the requested direction; no rounding occurs at delivery. When evacuation starts between markers, preserve exact arithmetic and offer bounded transfers to adjacent source/destination markers or the remaining allowance. Ordinary transfers starting on both markers retain the existing evacuation marker intersection. |
| Product effect | Reward delivery, destination balance, mineral cargo and its durable receipt share the mission transaction. Minerals remain separately named cargo, never silently converted to ore. Changed malformed-state fixtures now exceed printed capacity instead of using a newly legal exact rescue count; malformed, negative, fractional and overflow rejection remain tested. |
| Review state | Source-backed digital integration choice under standing PC06 authorization. Local recovery, capacity, ration, counter and evacuation checks pass; independent risk review and production proof remain required. |

### PC06-A14 — Confirm physical fleet partitions from current server coordinates

| Field | Record |
|---|---|
| ID and milestone | PC06-A14; the connected minimum for Prompts 151 and 307, extending PC06-A6. |
| Source passage | Facilitator's Guide v1.1, printed p. 16, Split Fleet; the same visually checked primary source as PC06-A6 requires separate pursuit and communication after a split. |
| Ambiguity and alternatives | The printed procedure does not define when a digital app commits a partition while ships resolve individual departures. Automatic partitioning after every first ship jump could split a fleet still performing its agreed common jump. |
| Chosen reading | A live facilitator explicitly confirms separated groups after ordinary movement. The server partitions each existing group by authoritative current core-vessel coordinates, clones its current pursuit score into the resulting parts, and preserves unrelated groups. Players follow their current authoritative vessel or docked host; members without a core host retain the original group. No browser chooses a partition, recipient group, or pursuit score. |
| Product effect | Ordinary short group notes use authenticated send/read calls with server-owned group membership. Joining, reconnecting, and kicking a member preserve the existing partition. The client hides notes after authority or audience changes. Existing independently moving small craft retain their communication group until a governed partition/rejoin; they are not added to the core-vessel navigation map. Taxi transport, scheduling partial fleet arrivals, pursuit merge/rejoin clocks, and broader message workflows remain in their assigned later tranches. |
| Review state | New digital timing assumption under explicit PC06 authorization. Connected local candidate and rendered review evidence exist; independent risk review, deployment, and ordinary gameplay proof remain pending. No outside prompt receives completion credit. |

### PC06-A15 — A separate scout-taxi courier visit for P151

| Field | Record |
|---|---|
| ID and milestone | PC06-A15; the minimum separate communication exception required by P151. Parent scope decision on 2026-10-01 retains the fixed 49 IDs and authorizes necessary taxi prerequisites; broader P343 remains PC07. This narrowly supersedes the taxi deferral in PC06-A6/A14. |
| Source passage | Facilitator Guide v1.1, printed pp. 16–17, Split Fleet and Scout Taxis (physical PDF pp. 18–19); full pages rendered from the privately indexed primary archive on 2026-10-01. A scout shuttle may spend a scouting attempt on a round trip carrying up to two players or instead up to two fuel tokens. Starlight's primary single-sided sheet, physical PDF p. 35, supplies its two-jump range; Hummingbird's primary duplex sheet, physical PDF p. 79, supplies its three-jump range. |
| Ambiguity and alternatives | The physical rule supplies a communication exception but no digital trip timing or rider landing/assignment model. Endeavour's unlimited sensors do not establish an unlimited physical taxi radius. A general cross-group channel or permanent reassignment would broaden this acceptance. |
| Chosen reading | Provide one explicit courier visit by the current Starlight or Hummingbird owner, represented as a completed round trip with one bounded note delivered to the selected core host's current group. The operator returns to the origin; no player, role, seat or group is reassigned and no fuel/cargo is transported. Consume one existing current-cycle scouting attempt without creating a chart-reveal request. Require the craft at its printed anchor, current holder/role/seat authority, legal Coordination airspace, server-derived separate groups and positions, printed range, and fresh cycle/control/navigation revisions. This bounded note representation and immediate round-trip completion are digital product inferences under autonomous PC06 authorization. |
| Product effect | The separate authenticated taxi action atomically delivers only the submitted note and records its attempt/receipt. Ordinary note reads remain restricted to the reader's current group; the courier receives no destination notes or hidden chart facts. Pursuit, ship locations, knowledge and the shared clock remain unchanged. Broader passenger transport/landing, fuel payloads, Endeavour physical range, rejoin/merge consequences and P343's remaining acceptance stay in PC07, with no additional catalog closure credit. |
| Review state | Minimum scope authorized by the parent; implementation, independent authority/privacy review, release gates and ordinary taxi proof remain required. Subject to optional owner correction. |

### PC06-A17 — Docked Voyage accompanies a moving host

| Field | Decision |
|---|---|
| ID and milestone | PC06-A17; bounded repair within unchanged P250/P251, recorded 2026-10-02. |
| Source passage | Voyage 33-0 primary A4 single-sided v1.1 sheet, PDF p. 38; private archive checksum `4e3ce6b500716fe139440d669aeae2e7fb4ab85071c98801f28144305f60f8d3` verified with the routed page and ship summary. The sheet specifies docking for Team maintenance and docked-host fuel for Voyage's own jumps, but does not state what happens when the host departs. |
| Chosen reading | A physically docked Voyage accompanies its host's committed movement until Voyage makes its own independent jump and clears docking. This departure behavior is a digital inference, not a claimed printed sentence. |
| Implementation boundary | Ordinary, emergency, adjudicated and manual authoritative host movement synchronize Voyage's recorded coordinate atomically and advance its movement revision. Preserve maintenance, population, production charge, docking and own-jump cycle state; stale commands and replay cannot move a later detached or re-docked Voyage. |
| Audience boundary | Existing A6/A14 and the implementation contract still prohibit disclosure of another fleet group's location. Canonical Voyage coordinates must remain server-only, with the existing GM workspace receiving a private GM projection. Migration must preserve legitimate movement and replay history while removing legacy public coordinates; this is required for the bounded host repair, not additional PC07 scope or catalog credit. |
| Evidence and limits | A real AEGIS arrival left docked Voyage at the old coordinate after normal reload and blocked its movement UI. Repair requires test-first, native transaction, independent authority/privacy review and ordinary deployed proof. No broader vessel mechanic or extra catalog credit is authorized. |

### PC06-A16 — Voyage population markers, rations and reactor choices

| Field | Record |
|---|---|
| ID and milestone | PC06-A16; source-backed repair within unchanged P250/P251, recorded 2026-10-01. |
| Source passage | Voyage 33-0 primary single-sided v1.1 sheet, PDF p. 38; Facilitator Guide printed p. 17/PDF p. 19; existing PC05 P118/P121 and PC06-A13. Full primary page inspected privately. |
| Chosen reading | Voyage uses its printed 40,000-survivor track and the corresponding population-dependent ration bands. A failed riot result moves that many adjacent downward markers, capped at zero; this die-to-marker conversion is a digital inference consistent with PC06-A13, not literal survivor subtraction. The zero transition adds the existing two unrest and skips charging. Exact reward counts between markers remain protected by A13. |
| Product effect | Fund rations from the current docked host using the vessel's current band. Its one reactor charge selects only Water Reclimator or Hydroponics and remains available after maintenance completion. Its printed Jump Drive has no charge prerequisite: legal Coordination movement retains server host, route, fuel, audience, mutiny, cycle and replay checks. Core vessel/craft charging contracts remain distinct. |
| Review state | Focused red/green and native Firestore production-handler evidence retained; independent review, release and ordinary corrected-path verification required. No additional prompt or catalog credit. |

### PC09-A1 — One minimal VIP Host visit attestation

| Field | Record |
|---|---|
| ID and milestone | PC09-A1; future PC09 only; recorded 2026-09-30. |
| Source passage | Home-printing A4 single-sided pack v1.1, PDF p. 21, VIP Host replacement role, Hosting. The inspected full-page card permits a ship other than Dione to reroll one die in its maintenance cycle when the Host spends Team Time there. |
| Ambiguity and alternatives | The physical card does not specify who enters that visit in a digital console. Alternatives are Host self-declaration, destination captain confirmation, or a minimal GM attestation. Console browsing and shuttle docking do not prove that the player spent Team Time there. |
| Chosen reading | The one active GM records the factual Team Time visit once, bound to Host, destination, cycle and current authority. This is a digital confirmation assumption, not a printed GM requirement. It needs no second GM, destination captain acknowledgement or manual calculation. |
| Product effect | P517 provides this explicit attestation and automatically grants the eligible ship its one-die reroll for the corresponding maintenance cycle; granting and consuming it use durable once-only receipts. Reject Dione, wrong timing/role, stale or duplicate claims and reuse of the benefit. Keep ordinary navigation read-only. This replaces the historical unresolved digital-actor question under standing execution authorization; no implementation or closure is claimed. |
| Review state | New source-backed digital assumption under FUTURE-F01/FUTURE-F03 authorization, subject to optional owner correction at PC09. State it first in the PC09 report. PC06 is unaffected. |

### PC09-A2 — Presidential Visit uses Coordination and its printed cost

| Field | Record |
|---|---|
| ID and milestone | PC09-A2; future PC09 only; recorded 2026-09-30. |
| Source passage | Home-printing A4 single-sided pack v1.1, PDF p. 37, Office of the President, Presidential Visit. The inspected full-page card allows one political capital to reduce one ship's unrest by one during Coordination. The separate address on that card occurs at Team start. |
| Ambiguity and alternatives | P524c's old Team Time wording conflated the visit with the VIP Host ability. Digital implementations might require a route/docking visit, a separate GM confirmation, or the President's authoritative action. The card gives phase, cost and effect without printing a shuttle or docking requirement. |
| Chosen reading | Correct the visit to Coordination. The current President selects an eligible ship and commits the printed action; the server validates authority, phase, political capital and destination, then applies cost and unrest together. Do not invent a docking, console-browsing or second-GM prerequisite. A genuine physical ruling or intervention can use the existing GM path if needed. |
| Product effect | P524c uses one replay-safe transaction and private GM receipt for the cost/effect, with entitled outcome/news projections. It does not borrow P517's Team Time confirmation or P524b's address timing and does not grant arbitrary resource or GM authority. No runtime behavior or completion is claimed. |
| Review state | New source correction and digital action assumption under FUTURE-F01/FUTURE-F03 authorization; subject to optional owner correction at PC09 and reported first. PC06 is unaffected. |

### PC07-A1 — Preserve the server clock behind a cycle briefing

| Field | Decision |
|---|---|
| ID and checkpoint | PC07-A1, P103a and airspace recovery. |
| Source | Player Guide printed p. 5/PDF p. 7 supplies Team/Coordination timing; the complete primary page was visually inspected. P103a explicitly supplies the interstitial hold and one clear action. |
| Chosen reading | Every newly committed, non-skipped cycle briefing captures its current Team window with a server-owned interstitial pause. One currently connected participant may clear the exact cycle/pause identity for every console. An explicit skipped briefing keeps the existing schedule. A replay of an already cleared transmission is presentation and never refreezes the clock. |
| Alternatives and limits | Requiring only a GM to clear would add an unnecessary operator step; per-browser clock holds would violate the shared session clock. These clear authority and identity choices are digital product assumptions, not printed rules. Emergency and empty-session holds keep their distinct end conditions. |
| Effect | Current member authority, exact transition, receipt/replay and atomic session/event ownership prevent a stale clear, retry, reconnect or competing device from resuming twice or changing a newer deadline. Every timing field remains server-owned. |

### PC07-A2 — Targeting when the printed small roster removes Dione

| Field | Decision |
|---|---|
| ID and checkpoint | PC07-A2, P428/P431/P432; owner integration decision, 2026-10-02. |
| Source | Facilitator Guide v1.1 printed p. 5/PDF p. 7 removes Dione below twelve players; the full primary page was visually inspected. The base targeting table gives six vessels without a reduced-roster adaptation. |
| Ambiguity and alternatives | The recovered preflight rejected every otherwise valid eight-to-eleven-player attack. Leaving that denial blocks supported gameplay; rerolling an unavailable printed result or compressing the active ordered ring both need a digital rule. |
| Chosen reading | For a valid reduced roster only, filter Dione from the canonical ordered ring and draw uniformly from those five active targets. Target shifts wrap within that configured ring. This is a deliberate digital assumption, not a printed five-sided die instruction. |
| Limits and proof | Six-target base and seven-target expansion behavior remains unchanged. Other missing required core vessels or malformed configurations remain denied. Red tests, actual native handler proof and independent authority review must cover the reduced roster; no foreign or inactive target may leak into member projections. |

### PC07-A3 — Preserve pursuit conservatively when groups rejoin

| Field | Decision |
|---|---|
| ID and checkpoint | PC07-A3, P346–350; recorded 2026-10-03 under PC07 authorization. |
| Source | Facilitator Guide v1.1 printed p. 16, Split Fleet, requires group-local pursuit and communication but does not specify the pursuit score after groups rejoin. |
| Chosen reading | When current server positions permit rejoining, retain the highest input pursuit score. The lowest numeric fleet identifier survives, with membership merged atomically and input/result scores recorded in the private GM audit. |
| Alternatives and limits | Averaging, choosing the lowest score, or asking the GM each time would add a rule or operator step. This conservative digital tie-breaker cannot grant a pursuit reduction just by regrouping. Existing individual chart knowledge and historical identities remain intact. |
| Effect | Exact retries produce no second membership rewrite, message or pursuit result. [The split-fleet note](PC07_SPLIT_SHARING_ASSUMPTIONS.md) explains the connected route audience and knowledge boundaries. |

### PC07-A4 — A taxi pilot remains at its launch ship

| Field | Decision |
|---|---|
| ID and checkpoint | PC07-A4, P343–345; recorded 2026-10-03 under PC07 authorization. |
| Source | Facilitator Guide v1.1 printed p. 17/PDF p. 19 permits the scout-taxi round trip carrying up to two players or one or two fuel, within the craft's printed range and scouting allowance. It supplies no replacement-pilot procedure. |
| Chosen reading | The current shuttle owner remains at the launch ship and cannot select themself as a passenger. Other currently connected players physically at that launch ship may travel within the printed limit. The server commits payload, destination and group membership together. |
| Alternatives and limits | Moving the pilot would invent a control handoff and could strand the round trip. The taxi carries passengers or fuel, never both, and does not expose destination-group chart facts or notes to the pilot. |

### PC07-A5 — Use current charged readiness for the Gorgoneion projector

| Field | Decision |
|---|---|
| ID and checkpoint | PC07-A5, P437; owner integration decision, recorded 2026-10-03 under PC07 authorization. |
| Source | Base A4 duplex v1.1 pack, PDF p. 23, Gorgoneion Captain sheet. The complete primary page was visually inspected privately. The Captain chooses one ship before targeting; its Force Field reduces that ship's final damage by two. |
| Chosen reading | The current admitted Captain makes the genuine use/pass and eligible local ship choice before targeting begins. The recovered server-owned current-cycle projector charge supplies readiness; current physical host/group, positive population and mutiny gates still apply, and any recognized explicit damage/destruction denial wins. |
| Ambiguity and limits | The recovered small-ship state has no separate damage deck or projector-damage model. Adding one would expand PC07. This readiness foundation is an explicit digital assumption, not a claim that the printed projector ignores damage. No later damage mechanic receives closure credit. |
| Effect and proof | A GM draft checkbox cannot fabricate this Captain choice. A configured disconnected Captain remains pending; an unavailable source action is recorded as unavailable. Current host/group privacy, stale offers, genuine choices, exact retries and the final two-point reduction require native composed proof and independent review. |

### PC07-A6 — Retain successful hits beyond legal target capacity

| Field | Decision |
|---|---|
| ID and checkpoint | PC07-A6, P438–440/P444; recorded 2026-10-03 under PC07 authorization. Future P447/P448/P455 consume this bounded engine rule within their own printed target limits. |
| Source | Player's Guide v1.1 printed pp. 12–13 and the source-specific attack sheets govern range ordering and each action's legal target limits; the attack worker visually checked the primary pages. [The attack-engine source note](PC07_ATTACK_ENGINE_ASSUMPTIONS.md) records the routed mechanics. |
| Ambiguity and alternatives | The printed distinct-target constraint does not define a digital assignment when successful hits exceed the remaining distinct live legal contacts. Reusing a target, inventing a contact or rerolling would alter the committed source result. |
| Chosen reading | For each action whose printed rules limit hits to distinct targets, retain every committed die and success, accept no more assignments than its printed limit and current live legal contacts permit, and record every remainder as unused. With no legal contacts, retain the result without fabricating assignment or damage. |
| Limits and proof | This is a digital excess-hit policy, not a new printed rule. It does not impose a shared limit across independent actions or change another action's printed target semantics. Private audit retains full generated and unused counts; entitled player controls explain unused hits. Exact retry samples no new dice and repeats no damage. Native proof, the current controls and independent review remain required. |

### PC08-A1 — Explicit Union craft starting hosts

| Field | Decision |
|---|---|
| ID and checkpoint | PC08-A1, P423/P644; root integration decision, October 3, 2026. |
| Source | Base A4 double-sided v1.1 pack, physical PDF pp. 68 and 70, Union Engineer briefings, and p. 83, Wobbly/Ally sheets. The full craft sheet was visually inspected privately. The sheets name Union ownership and abilities but supply no initial host. The existing role roster pairs Quellon/Refinery and Shepherd/Icebreaker and the existing craft policy requires facilitator-controlled initialization. |
| Chosen reading | After confirming an enabled Union replacement station, a current authenticated facilitator explicitly chooses one active host from its existing pair. No arbitrary default is inferred. Ordinary game start derives the printed Union role holder as owner and current controller. |
| Alternatives and limits | Picking a host automatically would invent an initial placement; admin seeding would fail the normal gameplay proof. The paired-host restriction is the existing digital roster contract, not a printed host list on the craft card. This setup path does not add unrestricted travel, a new crew operator or a post-start GM override. |
| Effect and proof | One transaction binds the live GM instance, setup revision and exact request, validates the private manifest, and commits only initial docking/history and manifest. Exact replay cannot duplicate visits or control. Malformed, disabled, stale, foreign-host and locked-setup requests fail closed. Native tests and the complete authenticated eight-player scenario must establish the ordinary start and recovery path. |

### PC08-A2 — Current-range target shifts and immutable earlier damage

| Field | Decision |
|---|---|
| ID and checkpoint | PC08-A2, range actions and P469–470; root seam decision, October 3, 2026. |
| Source | Player Guide v1.1 printed pp. 12–13 describes simultaneous damage rolls followed by target assignment and current-range destroyed-ship effects. Alpha/Bravo and PDF component sheets give the target-number choice at Medium Range (A4 single-sided p. 36 and double-sided p. 81). The precise digital ordering against the combined damage batch is not spelled out. |
| Chosen reading | Collect genuine source choices, preserve the ordered pre-range target snapshot, and replay that range's committed shifts before attributing its destruction effects. A Medium shift therefore changes Medium and later target consequences, while the Long receipt retains its own damage target. |
| Alternatives and limits | Applying shifts after all current damage would defer a Medium choice to Short; using the final target map for all ranges would rewrite Long. Neither preserves this immediate-effect reading. Snapshot validation, ordered shift receipts and next-range/final-roster comparison must reject fabricated or inconsistent carry-forward. |

### PC08-A3 — Launch decisions before automatic range progression

| Field | Decision |
|---|---|
| ID and checkpoint | PC08-A3, independent fleet fighter launch and connected range actions; root integration decision, October 3, 2026. |
| Source | The AEGIS Alpha/Bravo and PDF component sheets define independent launch and combat abilities (A4 single-sided p. 36 and double-sided p. 81). They do not prescribe an asynchronous digital choice window. The connected attack already makes targeting the launch boundary. |
| Chosen reading | Hold targeting for every eligible source with an entitled assigned holder until its durable launch-or-pass choice is committed. A genuinely unassigned, removed, replaced, dead or invalid holder, or an ineligible source, receives a server-recorded unavailable outcome. Independent wings do not consume each other's choice. |
| Alternatives and limits | Advancing immediately would make a launch depend on racing the server trigger. An arbitrary delay would be unreliable. An entitled assigned holder who disconnects or navigates elsewhere remains pending; heartbeat expiry is not a pass. Fresh connected console authority is still required to commit. This digital timing policy does not add a printed range action, consume a bay charge on pass, or give clients control over dice or advancement. Authenticated proof must exercise pending/reconnect choice and exact retry. |

### PC08-A4 — Short Range priority within a simultaneous batch

| Field | Decision |
|---|---|
| ID and checkpoint | PC08-A4, P443 and connected Short Range actions; root source reconciliation, October 3, 2026. |
| Source | Player Guide v1.1 printed pp. 12–13 (physical PDF pp. 14–15) rolls damage simultaneously, then assigns targets; its Wolf Fighter Wing card requires Short Range damage to reach Wings first. |
| Chosen reading | Validate the combined committed assignments: every live Wolf Fighter Wing must receive lethal assigned damage before any non-Wing receives a hit. If that coverage is unavailable, all assigned hits stay on Wings. Other live Short-legal contacts remain selectable once coverage is satisfied; Battlestations remain immune. |
| Alternatives and limits | The earlier Wings-only contact filter discarded a second distinct hit even when the sole remaining Wing was already covered. This correction preserves the printed priority without that extra restriction. Fixed one-target damage is not split, and each action retains its distinct-target limit, committed rolls and unused-hit policy. The whole-batch check is the digital expression of simultaneous resolution, not a new printed action. |

### PC08-A5 — Boa targets a currently eligible live Wolf ship

| Field | Decision |
|---|---|
| ID and checkpoint | PC08-A5, P459; bounded target-validity reading recorded in the range worker's source notes. |
| Source | Capybara A4 duplex v1.1 expansion, printed p. 4, Boa Wolf Attack ability; the routed Capybara reference flags already-destroyed target validity as ambiguity AMB-06. Exact private provenance and routing remain in the source library. |
| Chosen reading | At each range, the Recycler may choose one currently alive, range-legal Wolf contact and spend one Scrap for one damage. If there is no legal contact, record a pass and retain Scrap. |
| Alternatives and limits | Selecting a previously destroyed ship would spend a resource without a defined new effect. This bounded reading does not settle other AMB-06 cases, waive Short Range Wing priority or Battlestation immunity, add a second use, or draw damage again on retry. The connected transaction and normal authenticated proof remain required. |


### PC08-A6 — Consume surviving Wings in a later facilitator-selected attack

| Field | Decision |
|---|---|
| ID and checkpoint | PC08-A6, P469–P470; acknowledged by the owner during connected implementation. |
| Source | Facilitator Guide v1.1 printed p. 10 (physical PDF p. 12) makes the frequency and size of one or two additional attacks a facilitator difficulty choice; the Wolf Fighter Wing card returns an undestroyed Wing in the next attack. Private source provenance remains in the routed library. |
| Chosen reading | After complete prior resolution, the current live facilitator may select a new due window through an authenticated audited command. Surviving Wings occupy mandatory Fighter Wing slots within the selected composition's printed capacity, with a durable prior-instance-to-new-slot mapping. An undersized preparation fails. The next declaration consumes that exact carryover once and excludes destroyed Wings. |
| Alternatives and limits | A saved return list without a declaration consumer cannot satisfy P470. There is no automatic frequency schedule, extra capacity above the printed composition, mutation of a prior final receipt, or reopening of an unresolved attack. The Battlestation's separate immediate-repeat consequence remains outside this minimal return consumer. |

### PC08-A7 — Explicit Medium Range wing pass

| Field | Decision |
|---|---|
| ID and checkpoint | PC08-A7, P396/P398/P450–P451/P457; a bounded digital extension selected by the owner. |
| Source | Alpha/Bravo A4 single-sided v1.1 printed p. 36 says fighters can act at both ranges, with an either/or Medium attack or target shift. Its explicit up-to wording appears at Short Range. The PDF Escort Wing sheet supplies its corresponding independent choice. |
| Chosen reading | Give the entitled wing holder an explicit whole-wing Medium pass when declining its available actions. Preserve one attack-or-shift per committed fighter. Record the pass against the current attack and revision before advancing. |
| Alternatives and limits | The Medium whole-wing pass is a recorded digital choice where the sequence is silent; it is not attributed to explicit printed pass wording. It draws no dice, causes no losses, and cannot bypass another source's pending action. Source-owned validation and authenticated proof remain required. |

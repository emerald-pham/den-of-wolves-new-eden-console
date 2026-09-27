# Product playtest checkpoints

This is the owner-facing route through the unfinished Den of Wolves prompts.
The word for an owner-facing milestone is **playtest checkpoint**. Each one is
defined by **yes/no questions that the product owner can
answer by playing the app in one sitting**. Agents supply a prepared, ordinary
game session and step-by-step instructions; the owner does not need to inspect
code, tests, or raw logs. The M1–M13 stories and exit fixtures in
[Implementation Milestones](IMPLEMENTATION_MILESTONES.md) remain internal
engineering gates. They do not define an owner playtest checkpoint.

The initial prompt allocation below covers the **293 partial or missing
prompts in the 751-prompt catalog on 2026-09-27**. It is a routing snapshot,
not a second status ledger or a promise that every row is ready to build.
[`implementation-prompts.json`](implementation-prompts.json) remains the
authority for current prompt definitions, dependencies, decisions, and status.
Every prompt appears in one initial playtest slice; a later shape may move an
unstarted prompt after feedback or a changed dependency. Update this route and
the catalog when that happens. Completed prompts and existing evidence remain
available as prerequisites without being assigned again.

## How the campaign runs

This is a trimmed Shape Up loop. **Scope is the limit, not a six-week clock.**
There is no betting table or fixed time box. Group a meaningful cluster of
changed screens and controls before asking for owner review. The owner's
preferred cadence is roughly **12–20 hours of autonomous agent work between
checkpoints** when the shape warrants it; this is a sizing guide, not a minimum
wait, deadline, or reason to expand scope. Agents execute the underlying
gameplay and technical proof without asking the owner to review code. Treat
suggested product changes as feedback, even when the shaped behavior passed.

1. **Shape one playtest checkpoint before building it.** Read the latest
   [feedback](PRODUCT_MILESTONE_FEEDBACK.md),
   [assumptions](PRODUCT_MILESTONE_ASSUMPTIONS.md), and
   [later-milestone candidates](PRODUCT_MILESTONE_CANDIDATES.md). Check the
   current catalog, source passages, dependencies, live product, and active
   ownership. Write the problem, what is in and out, known rabbit holes,
   source-backed assumptions, and the exact owner-playable yes/no checks.
   Provide a one-sitting walkthrough with prepared starting states. Split the
   shape if that walkthrough needs more than one sitting. State how each
   available prior feedback item is addressed. Only the next checkpoint is
   fully shaped; the later rows below are candidates, not fixed scope.
2. **Build the shaped scope.** Once approved, its scope is fixed. A defect that
   prevents a shaped acceptance check from passing is part of that check;
   unrelated discoveries and extra features go to the candidate list. Keep
   technical exit fixtures, authority/privacy/reconnect coverage, rendered QA,
   and release evidence as internal gates. For new behavior, commit a failing
   test on the task branch **before** the implementation commit. Never weaken,
   skip, or delete an existing test to make the build pass. If an existing test
   appears wrong, leave it intact and flag it. Never modify an existing test
   in the same commit as the code it covers. If a later shape or cooldown
   establishes a correction, make it a separate test-only commit and record
   the reason.
3. **Decide, log, keep going.** Do not wait for the owner during an approved
   build. If the rulebook is ambiguous, take the best reading supported by a
   specific passage, record its precise citation and concise paraphrase,
   interpretation, alternatives, and
   affected behavior in the [assumptions log](PRODUCT_MILESTONE_ASSUMPTIONS.md),
   and build on that reading. Put new assumptions **first** in the milestone
   report so the owner can correct them. If a passage is unavailable, state
   that limit truthfully, work on independent scope, and report the gap. If
   work grows beyond the shape, finish the shaped work, put the overflow in the
   candidate list, and continue to the next checkpoint. Stop only when there
   is no useful independent progress possible. Velocity never justifies
   weakening, skipping, or deleting a test.
4. **Hand over a playable product.** Verify the released build and its
   ordinary authorized path separately from local tests and rendered checks.
   Give the owner a nontechnical report: new assumptions first; what can now
   be done; a numbered in-app walkthrough for **every** yes/no check; every
   test added, changed, skipped, or deleted and why (say "none" where true);
   known issues, open rules questions, and deferred candidates. Include the
   exact build and review access. Do not call a technical fixture alone a
   playable checkpoint.
5. **Record feedback and cool down.** Put each received review note in the
   [feedback file](PRODUCT_MILESTONE_FEEDBACK.md). Fix what the owner flags in
   a bounded cooldown pass before starting a **new** checkpoint build; include
   the fix and its verification there. If feedback arrives while a previously
   shaped build is underway, finish that scope and do the cooldown at its next
   safe boundary. The next shape must list every prior note and say whether it
   was fixed, adopted into that shape, or routed to a named later candidate.
   If no review has arrived, record that fact and keep going; never pause
   merely to wait for feedback. A later correction to a rulebook assumption
   is cooldown work.

The initial approval requested for the **first** shaped checkpoint below is a
specific handoff for this planning task. No first-checkpoint building starts
before that approval. After approval, the campaign uses the nonblocking
decision and feedback loop above. This process changes no existing task's
accepted scope and creates no Git, CI, or deployment approval gate.

## Provisional UI-cluster playtest route

Each row is a **candidate** cluster of visible app work, with yes/no questions
that the owner can answer in a prepared session. The exact shape for PC02
onward waits for feedback from earlier checkpoints. IDs are the initial
allocation of unfinished prompts, including underlying gameplay, safety, and
proof that agents complete without asking the owner to inspect code. Use
prepared states so the owner can try the changed screens and controls in one
sitting. If a candidate needs more than one sitting, split it when shaping.
A held or owner-deferred prompt is reported and may move to a later candidate;
a playable preview cannot make it done.

| Playtest checkpoint | Owner-playable yes/no questions | Initial unfinished prompt IDs |
|---|---|---|
| PC01 — Shepherd science station | Can I research and buy a ship upgrade from the Scientist's screens? Can I use ECM and scout privately without seeing the hidden chart? | 211–213, 391, 321, 325, 327–333, 677 |
| PC02 — Setup and daily fleet board | Can I understand setup and start a confirmed table? Can I choose rations and see unrest or a riot resolved on the turn board? | 654, 662, 589, 590, 599, 600, 100, 116–121, 134–137, 184, 191 |
| PC03 — Jump map and drive controls | Can I choose a legal destination and see fuel and location change? Can I understand a failed, emergency, or blind jump on the same navigation screens? | 201, 202, 210, 222, 232, 236, 241a, 259, 287–304, 320, 607, 679, 020a |
| PC04 — Shuttle and service consoles | Can I move and dock a shuttle, move permitted cargo or stores, and repair or dismantle a console with the right permission? | 112, 238, 244, 241c, 250, 251, 352, 371, 380, 385 |
| PC05 — Away-mission workspace | Can I begin a mission with private cards, resolve success or failure, and see the reward and recovery on the affected screens? | 237, 241b, 243, 378, 392, 393, 401–415, 422, 622, 646, 334, 335 |
| PC06 — Fleet map and split-group views | Can two groups travel and act separately without leaking positions or messages? Can I share known information, ferry people or fuel, and reunite? | 151–153, 307, 322–324, 326, 336–350, 424, 678, 643 |
| PC07 — Turn and airspace controls | Can I play a full turn and see the right airspace state, deadline, and shuttle restrictions without a duplicated transition? | 103a, 140, 154–156, 158, 159 |
| PC08 — Attack command and local DRADIS | Can the GM start an attack once while players see their choices? Can I see truthful local ships, shuttles, and attack status without another group's secrets? | 428, 431–442, 444, 523a, 351, 353–360, 423, 644, 605 |
| PC09 — Range and fighter controls | Can I use missiles, fighters, and ship-specific weapons at the correct range and see the result on my console? | 231, 389, 396–398, 443, 445–459 |
| PC10 — Boarding and Wolf losses | Can I defend against boarding and see what happens when the different Wolf craft are destroyed? | 394, 395, 460–473, 580, 605a |
| PC11 — Attack aftermath | Can I handle casualties, salvage, repairs, and renewed pressure, then continue playing? | 474–484, 490–494, 621 |
| PC12 — Deduction and arrest screens | Can I use a finished Wolf Agent Detector, investigate and arrest a suspect, resolve the deadline, and let a replacement act without exposing hidden truth? | 214, 503a, 506, 508, 513, 514, 516, 517, 519, 520, 521, 521a, 521b, 524, 645 |
| PC13 — President and crisis desk | Can the President address or visit the fleet, decide an approaching-vessel issue, and see an election or crisis result survive reconnecting? | 523b, 523c, 524b–524d, 528, 529, 537–540 |
| PC14 — Specialist role workspaces | Can the Executive Officer, Wing Commander, Scientist, Explorer, and PDF Colonel find and use their actual available work? | 180, 181, 215b, 223b, 233b |
| PC15 — Capybara expansion screens | Can I use Capybara's roles, Scrap, Macaw, and Boa while the base craft with the same name remains separate? | 576, 579, 581, 584, 585 |
| PC16 — Candidate and Ring panels | Can I discover a candidate, understand the Ring's needs, contribute once, and prepare passage? | 541–549, 593, 619 |
| PC17 — Nebula and Station panels | Can I attempt the Nebula route and see ship loss or progress? Can I fight and power the Station in a prepared scene? | 550–559 |
| PC18 — Ring and Nebula debrief | Can I finish prepared Ring and Nebula attempts and read a durable ending after reconnecting? | 563–566, 647, 648 |
| PC19 — Station and failure debrief | Can I finish a prepared Station attempt or fleet failure and read the lasting result? | 649, 650 |
| PC20 — Release-candidate walkthrough | Can I follow a prepared full-game route from setup to a real ending with a full table, and recover from a failure? | 618, 620, 629–631, 634, 635, 641, 642, 651 |

Ranges refer to unfinished IDs in the dated catalog snapshot; they do not
reclassify completed IDs between them. Every one of the 293 unfinished IDs is
allocated once, and no row depends on an unfinished prompt allocated to a
later row. PC10 includes owner-deferred Prompt 605a as a **conditional
candidate**. Its visualization neither holds up playable combat nor becomes
active without its separate product decision. Full-game, privacy, security,
accessibility, and capacity proofs can take longer than the owner's one-sitting
PC20 walkthrough; they are agent gates, not extra owner playtest steps.

## PC01 shape — Shepherd science station

**State:** shaped for product-owner approval. Building has not started under
this shape; PC02–PC20 remain provisional candidates.

**Problem.** The Scientist's Endeavour station has research, field-upgrade,
scouting, and science-device pieces, but the catalog still records their
player paths as partial or missing. The owner needs to experience one coherent
science station: choose research, use what it unlocks, scout privately, and
see what another ship is not entitled to learn. Source tests and deployed
buttons alone do not prove this works during ordinary play.

**In scope.** This checkpoint covers Prompts **211–213, 391, 321, 325, 327–333,
and 677**. In an authorized Shepherd Scientist session, connect
Team-phase research progress and limits to current prices and a
Coordination-phase Endeavour field purchase; use the completed ECM Device under
its printed quota; request an Endeavour scout, let the GM resolve the selected
chart entry, read its private result and discovery notes, and show only ship-entitled
coordinates or details on the map. A Deep Nebula scan may show permitted
private progress without revealing the hidden total. Repair defects that stop
these accepted paths, with authority, privacy, replay, and reconnect proof.
Existing partial code and tests are starting evidence, not completion proof.

**Out of scope.** Wolf Agent Detector testing and its private result (PC12);
Starlight, Hummingbird, and Comms Officer scout controls;
selective sharing to other ships; away-mission participation; split-fleet
communication; unrelated role workspaces; a general navigation or turn-system
rewrite; and speculative map or device visuals. These have later candidates.

**Rule sources and known rabbit holes.** Start from the printed v1.1 Endeavour
shuttle sheet and Shepherd Scientist role guide, plus the routed chart and
Deep Nebula references. Printed cards control costs and limits. A local
callable can pass while the ordinary Scientist cannot reach the station.
Research prices may become stale before purchase. Scout results need private
audiences; a map can leak coordinates even if the scout panel
hides its text. Previous P321 and P330 work is parked in separate checkouts:
inspect its current owner and preserve or reconcile it before editing shared
paths. Prepare resource-rich and pre-scanned states so all UI checks fit one
sitting. If a rule passage remains ambiguous, cite and paraphrase it in the
assumptions log, choose the best reading, and keep going. No new assumption is
recorded at shaping time.

**Owner-playable yes/no checks.** Provide one guided sitting with prepared
Scientist, GM, and second-ship accounts and saved starting states. The
end-of-checkpoint report gives the actual access route and numbered actions:

1. **Yes/no:** Can I open the Scientist's Endeavour station, see a research
   track's next price, make a choice, and see exactly the next box and price
   change? Can I tell when the three ordinary and two five-ore extra choices
   are used up without an extra spend?
2. **Yes/no:** In Coordination, can I buy the eligible ship-console upgrade at
   the displayed research price and see the target ship and its resources
   change once, including after refresh?
3. **Yes/no:** Can I use a finished ECM Device from the science controls, see
   my group's pursuit fall by the correct amount, and get a clear response
   when I try to repeat its spent use?
4. **Yes/no:** Can I scout with Endeavour, let the GM reveal that request's
   selected chart entry, and read the permitted system result and discovery
   note on my ship's map, while a second ship cannot see those
   coordinates or private details? Can I see a permitted Deep Nebula progress
   hint without the hidden total?

**Internal exit gates.** Recheck the live catalog, source passages,
dependencies, current deployment, and parked ownership before building. For
new behavior, commit its smallest failing focused test first on the task
branch, then commit implementation separately. Keep suspect existing tests
intact and flag them. Close P321's four-source entitlement contract with
internal proof even though the owner walkthrough uses only Endeavour. Preserve
server authorization, wrong role/phase/range,
resource and quota, direct-write denial, private projection, replay, stale
reply, and reconnect tests. Run relevant route/component and phone, desktop,
short-landscape, and reduced-motion checks. Obtain the repository's independent
Sol review for callable/shared-state and privacy changes. Verify the released
ordinary authorized path; report local tests, rendered review, deployment,
and live play as distinct evidence. No prompt closes from an isolated widget
or unverified release.

**Feedback and handoff.** Record PC01 owner notes in the feedback file. Fix
flagged issues in cooldown before a new checkpoint build. PC02 is only a
candidate: its shape reads every available PC01 note and states its
resolution. If no review has arrived, record that fact and continue without
waiting. The nontechnical PC01 report lists new source-backed assumptions
first, then the four in-app checks, the complete test-change inventory,
known issues, and later candidates.

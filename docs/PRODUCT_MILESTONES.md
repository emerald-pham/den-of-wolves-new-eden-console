# Product playtest checkpoints

This is the owner-facing route through the unfinished Den of Wolves prompts.
The word for an owner-facing milestone is **playtest checkpoint**. Each one is
defined by **yes/no questions about the UI that the product owner can answer
by playing the app in one sitting**. The owner reviews screen layout, labels,
navigation, controls, and visible feedback, and may suggest any change. Agents
own gameplay rules, calculations, permissions, privacy, persistence, and tests.
They supply prepared app states and step-by-step UI instructions; the owner
does not need to inspect code, tests, raw logs, or rule math. The M1–M13 stories
and exit fixtures in
[Implementation Milestones](IMPLEMENTATION_MILESTONES.md) remain internal
engineering gates. They do not define an owner playtest checkpoint.

**Solo review access is part of every checkpoint.** Give the owner a browser
link to a clearly labeled, interactive review scene using the real app UI and
representative prepared states. It must not require twenty players, account
switching, GM privileges, or a long setup. Reuse a genuine solo path where it
covers the screens; otherwise supply an isolated review scene with synthetic
data and no live-session writes. Label simulated actions and state changes so
they cannot be mistaken for a live game. The scene is for judging presentation,
not evidence that multiplayer gameplay works. Agents prove the real authorized
paths and relevant multi-client behavior separately before claiming completion.
The final game-completion gate includes the full-table twenty-player proof;
the owner is never responsible for recruiting or operating that table.

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
There is no betting table or fixed time box. Group a substantial cluster of
changed screens and controls before asking for owner review. The owner's
preferred cadence is roughly **12–20 hours of autonomous agent work or more
when a coherent UI cluster needs it**; this is a sizing guide, not a minimum
wait, deadline, or reason to expand scope. Agents execute and verify the
underlying gameplay without asking the owner to check it. Treat every owner
suggestion as feedback, including gameplay suggestions the owner happens to
make, even when the shaped UI passed.

1. **Shape one playtest checkpoint before building it.** Read the latest
   [feedback](PRODUCT_MILESTONE_FEEDBACK.md),
   [assumptions](PRODUCT_MILESTONE_ASSUMPTIONS.md), and
   [later-milestone candidates](PRODUCT_MILESTONE_CANDIDATES.md). Check the
   current catalog, source passages, dependencies, live product, and active
   ownership. Write the problem, what is in and out, known rabbit holes,
   source-backed assumptions, and the exact owner-playable **UI** yes/no checks.
   Provide a one-sitting walkthrough with prepared starting states. Split the
   shape if that walkthrough needs more than one sitting. State how each
   available prior feedback item is addressed. Only the next checkpoint is
   fully shaped; the later rows below are candidates, not fixed scope.
2. **Build the shaped scope.** Once shaped, its scope is fixed. A defect that
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
3. **Decide, log, keep going.** Do not wait for the owner during a shaped
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
   Give the owner a nontechnical report: new assumptions first; what screens
   and controls changed; a numbered in-app **UI** walkthrough for **every**
   yes/no check; a brief agent-owned gameplay verification summary; every
   test added, changed, skipped, or deleted and why (say "none" where true);
   known issues, open rules questions, and deferred candidates. Include the
   exact build and review access. Keep the direct handoff short; the full
   report and test inventory live in the repository. Do not call a technical
   fixture or synthetic review scene alone a playable checkpoint.
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

No checkpoint needs prebuild owner approval. Shape it internally, build and
verify the complete result, then give the owner a playable UI review link and
short report. The owner provides feedback on a finished product. This process
changes no existing task's accepted scope and creates no Git, CI, or
deployment approval gate.

## Provisional UI-cluster playtest route

These **ten candidate UI clusters** group screens from the same player
workflow; PC02–PC10 remain provisional and are shaped after prior feedback.
The owner reviews presentation and usability in a solo review scene. Agents
complete the gameplay and technical proof, including multi-client tests. The
tour must fit one sitting; if it does not, split the shape before building it.

| Playtest checkpoint | Owner's UI yes/no question |
|---|---|
| PC01 — Shepherd science station | Can I find research, upgrades, ECM, and scouting, and understand each control's state and result? |
| PC02 — Setup, fleet board, and continuity | Can I move from setup into the fleet board, read the current cycle, rations, alerts, and actions, follow Press and DRADIS updates, and recover from a player exit or reconnect? |
| PC03 — Navigation and shuttle controls | Can I find the map, drive, shuttle, stores, and service controls and understand their visible status and feedback? |
| PC04 — Exploration and split-fleet map | Can I follow an away mission and tell which group, location, and information each map or message belongs to? |
| PC05 — Turn and attack dashboard | Can I follow the turn and attack stages, deadlines, local DRADIS display, and available controls without losing my place? |
| PC06 — Weapons and boarding stations | Can I find range, fighter, weapon, and boarding controls and read their available, pending, and resolved states? |
| PC07 — Aftermath and investigation desks | Can I find casualty, repair, salvage, detector, investigation, and arrest screens and understand what needs attention? |
| PC08 — Command and specialist workspaces | Can I find President, crisis, specialist, and Capybara workspaces, distinguish the craft, and navigate back? |
| PC09 — Candidate and endgame panels | Can I understand the Ring, Nebula, and Station panels and see the next available action in each prepared scene? |
| PC10 — Endings and final UI pass | Can I read the distinct ending screens and move through the finished app without confusing or broken UI? |

### Internal prompt allocation for agents

The IDs below allocate the 293 partial or missing prompts from the dated
catalog snapshot. They are **agent work, not owner acceptance checks**. The
catalog controls current status and prerequisites. A held prompt may move to a
later candidate during shaping; a pleasant screen cannot make it complete.

| Checkpoint | Initial unfinished prompt IDs |
|---|---|
| PC01 | 211–213, 391, 321, 325, 327–333, 677 |
| PC02 | 654, 662, 589, 590, 599, 600, 100, 116–121, 134–137, 184, 191 |
| PC03 | 201, 202, 210, 222, 232, 236, 241a, 259, 287–304, 320, 607, 679, 020a; 112, 238, 244, 241c, 250, 251, 352, 371, 380, 385 |
| PC04 | 237, 241b, 243, 378, 392, 393, 401–415, 422, 622, 646, 334, 335; 151–153, 307, 322–324, 326, 336–350, 424, 678, 643 |
| PC05 | 103a, 140, 154–156, 158, 159; 428, 431–442, 444, 523a, 351, 353–360, 423, 644, 605 |
| PC06 | 231, 389, 396–398, 443, 445–459; 394, 395, 460–473, 580, 605a |
| PC07 | 474–484, 490–494, 621; 214, 503a, 506, 508, 513, 514, 516, 517, 519, 520, 521, 521a, 521b, 524, 645 |
| PC08 | 523b, 523c, 524b–524d, 528, 529, 537–540; 180, 181, 215b, 223b, 233b; 576, 579, 581, 584, 585 |
| PC09 | 541–549, 593, 619; 550–559 |
| PC10 | 563–566, 647, 648; 649, 650; 618, 620, 629–631, 634, 635, 641, 642, 651 |

Ranges refer only to unfinished IDs in the dated snapshot; they do not
reclassify completed IDs between them. A numeric range includes unfinished
lettered IDs with a stem inside it: `431–442` includes `432a`, `433a`, `433b`,
and `434a`. The 2026-09-27 allocation audit found 293 unfinished IDs assigned
once each, with no gaps or duplicates; none of 547 unfinished hard-prompt
prerequisite edges points to a later checkpoint. PC06 includes owner-deferred
Prompt 605a as a **conditional candidate**. Full-game, rules,
privacy, security, accessibility, and capacity proofs are agent gates, not
extra owner playtest steps.

## PC01 shape — Shepherd science station

**State:** build 0.5.51 released; solo owner UI review and ordinary authorized
facilitator/Scientist gameplay proof remain. PC02–PC10 remain provisional
candidates. The deployed synthetic review scene supports the owner's UI tour;
it does not establish the live gameplay proof.

**Execution note (2026-09-27).** The earlier optional-sidecar wording left
independent PC01 work easy to run serially. Assign bounded, separate owners
for science research and the Scientist UI, ECM behavior, and scouting/map
privacy where file ownership permits parallel work. Record each checkout,
shared-file boundary, and integration handoff; one owner reconciles the
checkpoint release. Resolve routine choices through sources and the assumptions
log while independent lanes continue, without asking the owner to manage them.

**Problem.** The Scientist's Endeavour station has research, field-upgrade,
scouting, and science-device pieces, but their player paths remain partial or
missing. The owner needs one understandable science workspace: find each
control, see when it is available, follow its visible result, and return to
the rest of the app. Agents must make the gameplay underneath it correct.

**In scope.** This checkpoint covers Prompts **211–213, 391, 321, 325, 327–333,
and 677**. Provide a solo, browser-accessible UI review scene using the real
Scientist, GM, and map components with synthetic prepared states and no
live-session writes. Present research tracks, current prices, choice status,
an Endeavour field purchase, ECM Device status, an Endeavour scout request,
the GM's selected chart reveal, private result and discovery notes,
ship-specific map knowledge, and a Deep Nebula progress hint in the relevant
workspaces. Agents implement
and prove the exact research limits, purchase and device effects, scouting
rules, authority, privacy, replay, and reconnect behavior. Existing partial
code and tests are starting evidence, not completion proof.

**Out of scope.** A twenty-player owner test; Wolf Agent Detector testing and
its private result (PC07); Starlight, Hummingbird, and Comms Officer scout
controls; selective sharing to other ships; away-mission participation; split-fleet
communication; unrelated role workspaces; a general navigation or turn-system
rewrite; and decorative changes beyond this workspace. These have later
candidates.

**Rule sources and known rabbit holes.** Agents start from the printed v1.1
Endeavour shuttle sheet and Shepherd Scientist role guide, plus routed chart
and Deep Nebula references. Printed cards control costs and limits. A local
callable can pass while the ordinary Scientist cannot reach its UI. Prices may
go stale before purchase; loading, spent, unavailable, and refreshed states
can mislead the player. Scout results need private audiences, and a map can
leak coordinates even when its scout panel hides the text. Previous P321 and
P330 work is parked in separate checkouts: inspect ownership and reconcile it
before editing shared paths. Prepare saved states so the UI tour fits one
sitting. The existing single-player demo covers only the opening cycle, so it
cannot be assumed to show every required state. Keep the review scene visibly
labeled and isolated from real sessions; reuse the production UI components so
it does not become a separate mockup. If a rule passage is ambiguous, cite it
in the assumptions log, choose the best reading, and keep going. No new
assumption is recorded at shaping time.

**Owner-playable UI yes/no checks.** Provide one solo guided sitting with
prepared Team, Coordination, device-ready, device-spent, and
scout-pending/resolved states. A labeled view selector shows Scientist, GM,
and second-ship presentation without requiring separate accounts. The report
gives the review link and numbered actions. The owner judges the UI, not
costs, quotas, pursuit math, or access-control correctness:

1. **Yes/no:** On my device, can I reach the Scientist's Endeavour
   station, find the research tracks and next-price labels, tell which choices
   are available or used, and find my way back without clipped controls?
2. **Yes/no:** From prepared Team and Coordination views, can I click through
   a labeled sample research choice and upgrade purchase, then understand the
   visible success, unavailable, and refreshed states without the rulebook?
3. **Yes/no:** Can I find the ECM control and understand its ready, working,
   successful, and spent states from the words and feedback on screen?
4. **Yes/no:** Can I switch through prepared scout request, GM reveal,
   Scientist result, discovery note, and map scenes alone? Do the ship labels,
   known and unknown locations, and Deep Nebula hint make sense?

**Internal exit gates.** Recheck the live catalog, source passages,
dependencies, current deployment, and parked ownership before building. For
new behavior, commit its smallest failing focused test first on the task
branch, then commit implementation separately. Keep suspect existing tests
intact and flag them. Close P321's four-source entitlement contract with
internal proof even though the owner walkthrough uses only Endeavour. Preserve
exact printed costs, choice and device quotas, pursuit effects, server
authorization, wrong role/phase/range, resource limits, direct-write denial,
private projection, replay, stale
reply, and reconnect tests. Run relevant route/component and phone, desktop,
short-landscape, and reduced-motion checks. Obtain the repository's independent
Sol review for callable/shared-state and privacy changes. Verify the released
ordinary authorized path; report local tests, rendered review, deployment,
and live play as distinct evidence. Agents verify the map's private data
boundary and the second ship's limited view; the owner is not asked to audit
security. The synthetic review scene cannot count as production-path gameplay
proof. No prompt closes from an isolated widget or unverified release.

**Feedback and handoff.** Record PC01 owner notes in the feedback file. Fix
flagged issues in cooldown before a new checkpoint build. PC02 is only a
candidate: its shape reads every available PC01 note and states its
resolution. If no review has arrived, record that fact and continue without
waiting. The nontechnical PC01 report lists new source-backed assumptions
first, then the four UI checks, the complete test-change inventory,
known issues, and later candidates.

## PC02 shape — Setup, fleet board, and session continuity

**Release update (2026-09-27).** Build 0.5.52 is deployed from
`f0e4eb73c753915567412899efd4dd4d78faa9dc`. Its six-step
[solo review scene](https://dow-new-eden-console.web.app/pc02-review) is live;
the [PC02 report](PC02_PLAYTEST_REPORT.md) separates the green release gates
from the still-open ordinary authorized gameplay proof. The owner authorized
starting PC03 without waiting for a PC02 UI verdict. Keep later PC02 feedback
in its own cooldown record rather than treating silence as approval.

**State.** Shaped 2026-09-27. PC01's owner walkthrough has not happened, so
there is no PC01 playtest verdict. The owner did provide separate
cross-checkpoint guidance, PC01-F01 through PC01-F10, expressly to inform
PC02–PC10. This shape plans all ten for PC02 because they can be reviewed as
one opening-to-active-play flow. Every item remains **planned** until the
released behavior and its applicable proof gates pass; a plan or review-scene
mock state is not completion evidence.

**Problem.** The path from session entry to the first active cycles needs to
feel coherent and recoverable. Players should understand the in-universe
status, receive the information intended for Press, and keep playing when a
non-GM member intentionally leaves or briefly loses connection. The supplied
Cycle 0 screenshot shows the Primary Status instrument on the player role
selection screen; that instrument is now requested for authenticated GM use
only.

**In scope.** Walk from the existing Code of Conduct gate and confirmed setup
through Cycle 0 into an active fleet-board state. Address the ten owner notes
below. The setup/onboarding support is the current PC02 cluster P589 (ground
rules), P590 (core-loop help), P599 (single-facilitator setup checklist), and
P600 (onboarding-to-first-action scenario), executed only after their hard
prerequisites are satisfied. Keep Press as an editorial handoff: committed
event records enter the Press-facing log, while only an authorized Press
Officer's existing publish action places copy in the public fleet ticker. Use only current authoritative
population/purge outcomes and existing President records. Do not invent
population math, new President effects, or unpublished ticker copy. Deliberate
Leave Session and a temporary connection loss are separate states: voluntary
leave releases the departing non-GM member's role/seat without ending the
session; reconnect restores the same member's latest authorized non-GM role
and private projection without making the disconnect a voluntary leave.

| Note | PC02 disposition | State |
|---|---|---|
| PC01-F01 — Survivor population changes and purges go to the Press log. | Add one Press-facing intake record for each committed, source-authorized population change or purge; deduplicate retries and keep private records out of Press/public projections. | Planned |
| PC01-F02 — Presidential events are handed to Press. | Send eligible records from the existing President workspace to the Press-facing log. This is a handoff for Press review, not automatic public publication or a new President action. | Planned |
| PC01-F03 — Replace “Awaiting server telemetry” with in-universe language. | Use the exact player-facing pending copy “Awaiting CIC handshake.” Preserve the truthful pending state while authoritative pursuit data is unavailable. | Planned |
| PC01-F04 — Do not cut off the initial enlarged DRADIS contact. | Keep its large-contact size effect for its full original lifetime. Repeat sweeps continue to produce ordinary pings without shortening or restarting that lifetime; normal size resumes when that original lifetime expires. | Planned |
| PC01-F05 — A player may drop out midgame in every non-GM role. | Prove deliberate departure for each non-GM role/seat class, including Press, while the session and remaining players continue. Do not transfer the departing member's private state or authority. | Planned |
| PC01-F06 — Keep the three Code of Conduct checks for 72 hours. | Keep the completed three-check acknowledgement valid for 72 hours on the same device, then require all three again. | Planned |
| PC01-F07 — The screenshot's Primary Status panel is GM-only. | Show the Cycle/Phase/Location/Authority/Next action/Failure state instrument only to an authenticated GM; non-GM rendered and accessible UI must not expose that panel. | Planned |
| PC01-F08 — Keep Leave Session out of the top of the screen. | Put the Leave Session control in Settings. Preserve a visible, keyboard-accessible route back to each screen's logical parent. | Planned |
| PC01-F09 — DRADIS contact names must not overlap plot content. | Keep every expanded contact name readable beside its own return, on the left or right side with more room from other labels and marks. The minimized plot is a lower-priority preview and may be less readable. | Planned |
| PC01-F10 — Reconnects should be graceful. | A transient reconnect restores the same member's non-GM role and latest authorized private state. It must remain distinct from PC01-F05 voluntary leave, which vacates the role/seat. | Planned |

**Out of scope.** Do not resolve the owner decisions for ordinary Wolf
designation or the zero-eligible-Wolf start outcome; do not broaden existing
President action families or implement the later President mechanics; do not
invent new ration, maintenance, riot, mutiny, population, or role-substitution
rules. A Press intake entry does not bypass Press Officer authority or the
existing ticker source and playback contract. The twenty-player full-table
completion proof remains an agent gate for final game completion, not an owner
playtest step.

**Source-backed assumptions and gaps.**

- The owner's wording “sent to Press” means an editorial intake that the Press
  Officer may review and publish using existing authority. The current Press
  desk owns publish/dismiss controls, and the ticker contract says Press
  contributes published eligible news; this shape does not auto-publish an
  event. Sources: [PressDispatch.tsx](../src/components/PressDispatch.tsx),
  [Ticker Behavior](TICKER_BEHAVIOR.md).
- The President handoff uses existing President workspace records only. That
  workspace records decisions without applying the later prompts' political,
  visit, election, crisis, resource, or facilitator effects. Source:
  implementation prompt 193b in
  [the prompt catalog](implementation-prompts.json). Prompts 524b–524d remain
  missing and are not closed by a Press handoff.
- Two current catalog descriptions conflict with this direct owner guidance:
  Prompt 589b records a 24-hour same-device waiver lifetime, while the owner
  requests 72 hours; Prompt 601 records universal Primary Status visibility,
  while the owner requests GM-only visibility. PC02 follows the newer owner
  instructions for these two visible behaviors. Sources: prompts 589b and 601
  in [the prompt catalog](implementation-prompts.json),
  [sessionWaiver.ts](../src/lib/sessionWaiver.ts), and
  [PrimaryStatus.tsx](../src/components/PrimaryStatus.tsx).
- No role replacement or transfer policy is inferred from a departing member.
  The session remains live, but role claiming/recovery must continue through
  the existing authorized flow. A transient reconnect uses the same member
  identity and current server projection. Confirm the applicable role/seat
  rules during implementation; if a printed rule prevents the requested
  continuation, document the exact source gap instead of inventing a rule.
- The DRADIS duration and contact-label requirements are direct owner
  presentation requirements. The owner clarified that expanded names should
  stay anchored beside their own marks on the clearer left or right side, and
  that the minimized plot is lower priority. These requirements do not alter
  contact identity, detection, position, scan cadence, or gameplay authority.

**Known rabbit holes.** Press intake and public ticker publication are
different stages. President event records may be copy-free; only safe,
source-backed fields should be included in a Press item. Reconnect recovery
must not restore a role after an explicit leave, revive stale authority, or
leak another role's private projection. The three waiver checks remain a
single completed acknowledgement with the existing review/focus behavior; the
72-hour window changes retention, not the checkboxes' meaning. The large
contact's original expiry must be measured from its first acquisition, even
while repeat pings continue. Label placement must be judged with real rendered
contact names and plot geometry, not only DOM text. Moving Leave Session into
Settings does not remove route-level return navigation.

**Owner-playable UI yes/no checks.** Deliver one solo guided sitting using
production components and clearly labeled synthetic states. A view selector
can show GM, President, Press, and representative non-GM player views without
account switching. The review scene must not write to a live session. The
owner judges the presentation and workflow; agents prove authority and
multi-client behavior separately:

1. **Yes/no — Setup checklist and ground rules.** In the prepared GM view, can
   one facilitator follow a single checklist that identifies both printed
   duties and the room, components, chart, casting, loyalty, and setup-math
   steps, then tell when setup is ready? Are the ground rules and core-loop
   help clear without the handbook?
2. **Yes/no — Waiver and first action.** Can I complete the three Code of Conduct
   checks and continue, understand that the completed acknowledgement lasts
   72 hours on this device, see the same accepted state in a prepared
   pre-expiry view, and see the checks required again at the 72-hour boundary?
   In the labeled solo scene, can a new player follow the help into the right
   route, understand a sample first action, and find the return path?
3. **Yes/no — Fleet board and status.** Can I read the current cycle, ration
   state, alerts, and available actions on the fleet board? In a prepared
   active-cycle view with pursuit data still pending, does the readout say
   “Awaiting CIC handshake”? In the prepared Cycle 0 lobby, is the Primary
   Status panel absent for a player or Press Officer and readable with all six
   fields in the authenticated GM view?
4. **Yes/no — Press handoff.** In the Press view, can I distinguish prepared
   survivor-change, purge, and President-event records and understand which
   items are available for Press review? Does publication remain a separate,
   understandable Press action?
5. **Yes/no — DRADIS.** Can I follow the first enlarged contact through its
   full prepared lifetime while ordinary repeat pings continue, see it return
   to normal size only after that original lifetime, and read every expanded
   contact name beside its own mark without overlap at the crowded and
   narrow-screen examples?
6. **Yes/no — Leave and reconnect.** Can I find Leave Session in Settings
   rather than the top of the screen? From each prepared non-GM role/seat
   class, can I understand the difference between a temporary reconnect that
   restores my role/private state and an explicit leave that vacates my role
   while the rest of the game continues?

**Prepared scene requirements.** Use a hosted, browser-accessible solo scene
with the actual lobby, settings, status, Press, and DRADIS components. Include
the GM setup checklist, ground-rules/core-loop help, and a clearly labeled
sample first-action-and-return path; waiver states at “just acknowledged,”
“before 72 hours,” and “expired at 72 hours”; a GM/Press/President/player
view selector; synthetic committed population, purge, and President event
records; a Press item before and after
authorized publication; an initial DRADIS acquisition with repeat pings before
its original expiry and a normal-size state after expiry; crowded contact
names; and separate temporary-disconnect/reconnect and voluntary-leave
states. The time and event controls are review-scene fixtures, not live
gameplay. Provide a numbered in-app path and the review link in the report.

**Internal exit gates.** Re-read the live prompt catalog, dependencies,
source passages, current deployment, and active ownership before building.
P589 is currently ready after P586; P590 and P599 depend on P589, and P600
depends on P590 and P599. P654 and P662 are still missing and require distinct
owner decisions (zero eligible Wolves and ordinary Wolf designation), so do
not claim either complete or choose those policies. P100 is partial and blocked
on P113/P321/P212. The allocated ration/population chain P116–P121,
P134–P137, P184, and P191 is blocked transitively by P117's explicit owner
decision; leave those mechanics unresolved and do not treat Press intake as
their completion proof. These current states came from the 2026-09-27 catalog
and read-only dependency checks; recheck before implementation.

Close P589–P600 only after the exact approved ground-rule copy, complete
facilitator checklist, core-loop help, and composed production
join/assignment/first-action/return path are in place. The solo review scene
proves only how those screens read.

For PC02 behavior, use test-first commits and preserve current authority,
privacy, replay, stale-request, and reconnect boundaries. Prove each existing
eligible population change and purge reaches the Press intake exactly once;
unauthorized actors and private data cannot enter it; President records are
handed off once without creating new gameplay effects; only the Press role can
publish or dismiss; and current published Press messages still obey
[Ticker Behavior](TICKER_BEHAVIOR.md). Prove the pursuit pending state stays
truthful, the DRADIS large-contact lifetime survives repeat pings, and contact
labels do not overlap at phone, desktop, short-landscape, and reduced-motion
sizes. Test the 72-hour acknowledgement at its exact boundary. Exercise
temporary reconnect and explicit leave independently for every supported
non-GM role/seat class; remaining authorized players must keep the same live
session and continue, while the departed member cannot use stale authority.
Prove Primary Status is role-gated in the rendered and accessible UI, and
Settings-only Leave Session retains a usable logical return path. Obtain the
repository's independent Sol review if implementation changes shared session
state or role/privacy boundaries. Verify local gameplay proof, rendered solo
review, release deployment, and ordinary authorized play as separate
evidence. The solo scene alone proves only presentation.

**Feedback and handoff.** PC01-F01–PC01-F10 are guidance received outside a
PC01 walkthrough, so do not describe them as PC01 review findings or infer
approval of PC01. They are all planned for this PC02 shape and remain open
until the released behavior and applicable internal gates are verified. The
PC02 report must list any assumption correction first, then these six UI
checks with the review link and numbered actions, a complete test-change
inventory, remaining proof gaps, and any overflow routed to a named later
candidate. If an item cannot fit the frozen shape, complete the independent
PC02 work and route the unfinished item to the next appropriate candidate
without marking the note resolved.

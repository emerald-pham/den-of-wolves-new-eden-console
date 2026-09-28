# Product playtest checkpoints

**Latest owner correction, 2026-09-28:** distribute the **293 remaining prompts
evenly across PC05–PC10**: **49 each for PC05–PC09, then 48 for PC10**.
The overall targets are **507, 556, 605, 654, 703, and 751 of 751 done**.
This supersedes both the PC05-half catch-up proposal and the PC15 extension.
Follow the literal targets and complete replacement allocation in
[Checkpoint Completion Recovery Plan](CHECKPOINT_COMPLETION_PLAN.md).
UI review and owner authorization do not waive these completion targets.
The old cluster route and PC01–PC04 shapes below are historical context, not
permission to advance the campaign on presentation-only releases.

This is the owner-facing route through the unfinished Den of Wolves prompts.
The word for an owner-facing milestone is **playtest checkpoint**. Each one is
defined by **yes/no questions about the UI that the product owner may answer
by playing the app in one sitting**. These questions are an optional review
aid, not a required approval form. Explicit owner authorization accepts the
checkpoint without a completed walkthrough or written feedback. The owner may
review screen layout, labels, navigation, controls, and visible feedback and
suggest any change. Agents own gameplay rules, calculations, permissions,
privacy, persistence, and tests. They supply prepared app states and
step-by-step UI instructions; the owner does not need to inspect code, tests,
raw logs, or rule math. The M1–M13 stories and exit fixtures in
[Implementation Milestones](IMPLEMENTATION_MILESTONES.md) remain internal
engineering gates. They do not define an owner playtest checkpoint.

**Solo review access is part of every checkpoint.** Give the owner a browser
link to a clearly labeled, interactive review scene using the real app UI and
representative prepared states. It must not require twenty players, account
switching, GM privileges, or a long setup. Reuse a genuine solo path where it
covers the screens; otherwise supply an isolated review scene with synthetic
data and no live-session writes. Label simulated actions and state changes so
they cannot be mistaken for a live game. Opening the scene or returning answers
is optional once the owner explicitly authorizes the checkpoint. The scene is
for judging presentation, not evidence that multiplayer gameplay works. Agents
prove the real authorized paths and relevant multi-client behavior separately
before claiming the affected gameplay prompts complete.
The final game-completion gate includes the full-table twenty-player proof;
the owner is never responsible for recruiting or operating that table.

The historical initial prompt allocation below covered the **293 partial or missing
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
   Provide a one-sitting walkthrough of representative finished workflows.
   Split internal work or interim releases if needed; never shrink or split
   the fixed checkpoint completion target to fit the walkthrough. State how each
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
   unrelated work grows beyond the shape, put it in the candidate list. Work
   needed for the fixed completion target stays in the checkpoint; advance
   only after that target is met. Stop only when there
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
5. **Record authorization, feedback, and cooldown.** Explicit owner
   authorization accepts the checkpoint even when the owner does not play the
   review scene or send written UI feedback. Record that authorization in the
   [feedback file](PRODUCT_MILESTONE_FEEDBACK.md). Put each received review note
   there too. Fix what the owner flags in
   a bounded cooldown pass before starting a **new** checkpoint build; include
   the fix and its verification there. If feedback arrives while a previously
   shaped build is underway, finish that scope and do the cooldown at its next
   safe boundary. The next shape must list every prior note and say whether it
   was fixed, adopted into that shape, or routed to a named later candidate.
   If no feedback has arrived, record that fact and keep going; never pause
   merely to wait for feedback. Silence alone is not authorization, but an
   explicit authorization needs no accompanying walkthrough answers. A later
   correction to a rulebook assumption is cooldown work.

No checkpoint needs prebuild owner approval. Shape it internally, build and
verify the complete result, then give the owner a playable UI review link and
short report. The owner may provide feedback on the finished product or simply
authorize the checkpoint. This process
changes no existing task's accepted scope and creates no Git, CI, or
deployment approval gate.

## Historical UI-cluster playtest route — superseded allocation

These **ten original candidate UI clusters** grouped screens from the same player
workflow. The recovery plan now controls scope and completion targets; retain
these themes only as presentation references.
The owner may review presentation and usability in a solo review scene or
explicitly authorize the checkpoint without completing that review. Agents
complete the gameplay and technical proof, including multi-client tests. The
tour must fit one sitting; trim the representative tour or split internal
work without reducing the fixed completion target.

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

### Historical initial prompt allocation for agents

The IDs below record the original allocation of 293 partial or missing prompts from the dated
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

**State:** build 0.5.51 released; explicit PC01 checkpoint authorization has
not been recorded, while its solo UI walkthrough remains optional. Ordinary
authorized facilitator/Scientist gameplay proof remains a separate agent-owned
gap. PC02–PC10 remain provisional candidates. The deployed synthetic review
scene supports an optional owner UI tour; it does not establish live gameplay
proof.

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

**Authorization, feedback, and handoff.** Record PC01 authorization and any
optional owner notes in the feedback file. Fix flagged issues in cooldown
before a new checkpoint build. PC02 is only a candidate: its shape reads every
available PC01 note and states its resolution. If no feedback has arrived,
record that fact and continue without waiting. The nontechnical PC01 report
lists new source-backed assumptions first, then the four optional UI checks,
the complete test-change inventory, known issues, and later candidates.

## PC02 shape — Setup, fleet board, and session continuity

**Release and acceptance update (2026-09-28).** Build 0.5.52 is deployed from
`f0e4eb73c753915567412899efd4dd4d78faa9dc`. Its six-step
[solo review scene](https://dow-new-eden-console.web.app/pc02-review) is live;
the [PC02 report](PC02_PLAYTEST_REPORT.md) separates the green release gates
from the still-open ordinary authorized gameplay proof. The owner explicitly
authorized PC02 and confirmed that authorization is sufficient checkpoint
acceptance. PC02 is accepted without required walkthrough answers. Record any
later optional PC02 feedback in its own cooldown record.

**State.** Shaped 2026-09-27. Explicit PC01 authorization has not been
recorded; its optional walkthrough has not happened. The owner did provide separate
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

## PC03 shape — Navigation and shuttle controls

**State (2026-09-28).** PC02 build 0.5.52 and PC03 build 0.5.53 are released.
The owner explicitly authorized both checkpoints and confirmed that explicit
authorization is sufficient checkpoint acceptance; no walkthrough answers or
written UI feedback are required. The PC02 and PC03 reports keep ordinary
authorized gameplay proof separate and open where listed. No new PC02 review
note or later-milestone overflow was available at shaping time. Record any
later optional feedback at the next safe cooldown boundary.

**Prior guidance disposition.** PC01-F01–PC01-F10 were direct owner guidance,
not a PC01 review verdict. They shipped in PC02 build 0.5.52; ordinary
authorized gameplay proof remains separate. None is silently adopted as a
new PC03 requirement:

| Owner note | PC03 disposition |
|---|---|
| PC01-F01 — Population changes and purges to Press | Released in PC02; live Press intake proof open in the PC02 report. |
| PC01-F02 — President events to Press | Released in PC02; live President writer proof open in the PC02 report. |
| PC01-F03 — Awaiting CIC handshake | Released in PC02; retain that in-universe wording. |
| PC01-F04 — Preserve the first large DRADIS beat | Released in PC02; retain the full first-beat lifetime. |
| PC01-F05 — Midgame non-GM departure | Released in PC02; ordinary all-role proof open in the PC02 report. |
| PC01-F06 — 72-hour three-check acknowledgement | Released in PC02; no PC03 change planned. |
| PC01-F07 — GM-only Primary Status panel | Released in PC02; no PC03 exposure planned. |
| PC01-F08 — Leave Session in Settings | Released in PC02; preserve logical return navigation. |
| PC01-F09 — Readable anchored DRADIS names | Released in PC02; no PC03 change planned. |
| PC01-F10 — Graceful reconnect | Released in PC02; live continuity proof open and PC03 checks current-state recovery in its own controls. |

**Problem.** A player must move among the ship's chart, Jump Drive, shuttle
station, stores, and service controls without mistaking a reference for an
available action or a pending request for a committed result. These controls
span ship, role, and shuttle workspaces. The same visible status must stay
truthful when airspace closes, a craft moves, a drive cannot jump, a request
races another client, or a session resumes.

**In scope.** Make one coherent navigation-and-shuttle path through existing
production components: ship chart and navigation log; the coordinate, lock,
charge, fuel, damage, and result states of the Jump Drive; shuttle docking,
departure, transit, arrival, cargo, and service surfaces; and the ship stores
that those actions consume. Show available, unavailable, pending, committed,
and stale/recovered states in place, with a logical return to the player's
assigned station. Audit and repair source-supported behavior in the allocated
PC03 prompt set where its prerequisites are satisfied. Keep server authority,
privacy, revision and request identity, exact replay, and current seat/role
checks underneath every enabled action. The solo scene uses production UI with
clearly labeled synthetic states; it performs no live writes.

**Held parts of the initial allocation.** The source-backed shortest-route
graph exists, but Prompt 287's Short/Medium/Long edge cutoffs are an explicit
owner decision. Prompt 299's failed-jump damage trigger and draw count are
also an owner decision. Preserve the existing compatibility behavior without
claiming either prompt complete or deriving a new policy; dependent prompt
closure waits for the ruling. Prompt 112's same-table inventory/consent
contract and Prompt 385's dismantling-consent identity/lifetime remain owner
decisions. Prompt 371's real deadline enqueue/private worker proof, Prompt
380's ordinary lost-race conflict, and the live repair/cargo checks for
Prompts 238, 244, and 241c require authorized production play. They stay open
until that evidence exists. Prompt 250 depends on movement Prompt 251, which
depends on the jump chain. The supplemental small-ship vessel records are
currently printed-statistics references without an independent resource ledger
or player seat; do not present their Jump Drives as launch-ready on those
records alone. The blind-jump Prompt 679 and bounded-demo Prompt 020a depend
on the still-open authoritative jump chain; neither closes from a cosmetic
preview or a client-only denial. Expose truthful current states but do not claim
these prompts complete from the review scene, local tests, or deployment.

**Out of scope.** A new rule for jump distance bands, failed-jump damage,
same-table trades, or permissioned dismantling; automatic facilitator
adjudication of an undefined printed outcome; split-fleet exploration and
away-mission result screens (PC04); attack and turn-stage dashboards (PC05);
weapons or boarding (PC06); and the twenty-player owner walkthrough. The
full-table proof remains an agent-owned final-game gate.

**Sources, assumptions, and rabbit holes.** The authorized routed CORE_RULES
derivative cited by catalog evidence E-287-JUMP-DISTANCE-OWNER defines distance
along shortest printed chart edges but supplies no numeric band boundary.
Evidence E-299-FAILED-JUMP-DAMAGE-OWNER records that facilitator error
adjudication has no fixed damage trigger or common-draw count. The current
`starChartGraph`, `jumpDrive`, and `jumpShip` paths are implementation evidence,
not substitutes for those absent policies. Printed vessel statistics in
`src/data/vessels` and the existing server cost catalog must be checked
against the authorized v1.1 component source before changing a cost. The
worldspace and movement contract in [Shuttlecraft](SHUTTLECRAFT.md) requires
server-owned docking/transit timestamps and current position on retarget;
animation is only a projection. The source-backed shuttle and maintenance
paths can pass isolated tests yet remain unreachable or stale from an actual
Captain or service station. Distinguish ship fuel from shuttle cargo, and
distinguish a current docked host from a former host. Never reveal the GM's
site overlay in a player map. No new gameplay assumption is chosen at shaping
time; record any later source-backed interpretation in the assumptions log
before depending on it.

**Owner-playable UI yes/no checks.** The owner can do these in one solo sitting
through a hosted, clearly labeled review scene. A view selector presents
prepared ship and shuttle states without requiring multiple accounts, GM
access, or live session writes. The owner judges labels, layout, navigation,
and visible feedback; agents own rule math, authority, privacy, and replay:

1. **Yes/no — Find the route.** From a ship's assigned station, can I find
   Navigation, read my ship's current coordinate and known map, inspect its
   log, then return to systems and the fleet board without losing my place?
2. **Yes/no — Read the drive.** Can I find the Jump Drive, set and lock four
   coordinate digits with touch or keyboard, and tell whether charge, fuel,
   damage, integrity lock, or a busy request prevents departure? Can I tell a
   prepared successful jump from a rejected or stale one without treating
   the sample control as a real launch?
3. **Yes/no — Follow a shuttle.** From its owning role or host ship, can I
   find the assigned shuttle, tell its current dock, airspace permission,
   destination, in-transit state, and arrival feedback, then return to the
   correct station? Can I see when a retarget or competing request changes
   that state?
4. **Yes/no — Find stores and service.** Can I find ship fuel and materials,
   shuttle cargo, and the relevant repair/recharge controls; distinguish
   enough stock and a ready host from insufficient, undocked, already-used,
   or wrong-phase states; and read an action's pending/result feedback?
5. **Yes/no — Recover.** In prepared refresh/reconnect and stale-reply views,
   do the map, drive, shuttle, stores, and service controls show the latest
   authorized state and a useful next action without offering a duplicate
   charge, jump, cargo move, or repair?

**Prepared scene and walkthrough.** Start at a real ship console with a
Navigation/Systems switch and ship-specific known map. Offer labeled views
for drive ready, uncharged, fuel-starved, damaged, integrity-locked, pending,
committed, and stale; a docked, departing, in-transit, retargeted, arrived,
and airspace-closed shuttle; and stocked, depleted, eligible, ineligible,
pending, and committed cargo/service states. Use representative owner/Captain
and host-ship surfaces rather than twenty simultaneous players. The scene
controls must say they simulate states and must not call production mutations.
Give the owner a numbered click path and phone/desktop review link.

**Internal exit gates and handoff.** Implement new behavior test-first, with
the failing test committed before its code. Check the printed cost and
operation passages available to each owner, current prompt dependencies,
parked worktree ownership, and current production before editing a shared
path. Exercise allowed/denied role and phase, stale revision, retry, concurrent
fuel or stock spend, independent ship position, private map projection,
airspace and docking transitions, and reconnect for the source-supported
paths that this shape changes. Render the full walkthrough at phone, desktop,
short landscape, and reduced motion. Obtain independent Sol review for
changed shared state, callable, rules, or deployment authority. Reconcile one
exact final commit, run its appropriate validation, push, verify deployment,
and separately attempt ordinary authorized play. Report every unproven live
path and held decision without treating the solo scene as gameplay proof.
The direct handoff lists new assumptions first, the five UI checks, exact
build/review access, a complete test-change inventory, and open questions.

## PC04 shape — Exploration and split-fleet map

**State (2026-09-28).** PC04 build 0.5.54 is released from exact main commit
`0ba386f50689b375153ceee3b2eb11a9ecd19435` and accepted by the owner's explicit
PC04 authorization. The optional five-view [solo review scene](https://dow-new-eden-console.web.app/pc04-review)
is live. The release includes the early unified station/console entry flow with
GM-only Role Select, current player-facing “table” copy changed to “console”,
the exact new default Red Alert message, restored CIC typography across DRADIS
and the app, and a mandatory exact-SHA rendered typography deployment gate.
PC01 remains the strongest known-good comparison, while the documented CIC
contract controls any outlier. Automation-first, one-facilitator operation is
now an app-wide design rule. Ordinary authorized gameplay proof remains
distinct from owner acceptance, local tests, the synthetic scene, and the
successful deployment; affected gameplay prompts stay partial or held until
that evidence exists. See the [PC04 report](PC04_PLAYTEST_REPORT.md) for the
complete release and evidence boundary.

**Prior guidance disposition.** The ten PC01 guidance items shipped in PC02
and retain the open production-play gaps reported there. No later PC02 note is
available. The five new PC03 notes are all adopted into PC04 rather than
routed to later candidates:

| Owner note | PC04 disposition |
|---|---|
| PC03-F01 — one early station/console entry screen; Role Select only for GM join | Cooldown requirement and first owner check. Preserve first-entry server claim, occupancy, read-only viewing, Press's distinct station, deep links, and Back behavior. |
| PC03-F02 — “console”, not “table”, in current app-wide copy | Cooldown requirement. Audit visible current UI and accessibility copy; preserve internal protocol names, historical changelog text, source citations, actual HTML/data tables, and printed proper names whose mechanics still require separate product treatment. |
| PC03-F03 — exact default Red Alert message | Cooldown requirement. Use the supplied sentence verbatim in the authoritative default and restore path, without an appended paragraph. |
| PC03-F04 — end-of-PC01 typography reference and mandatory gate | PC04 release gate. Compare the exact PC01 release with the candidate in rendered browsers, resolve any PC01 outlier against the documented CIC contract, and make the corrected rendered/computed-style gate mandatory in every player-facing exact-SHA deploy path. |
| PC03-F05 — automate deterministic facilitation for one-facilitator operation | App-wide product rule and PC04 internal gate. Automatic mission and split-fleet procedures own deterministic calculations/state changes and append complete server-owned GM-log receipts; only genuine choices, rulings, and interventions wait for a GM. |

**Problem.** An away mission crosses scouting, a group-local map, eligible
craft, secret hands, one Mission Leader, facilitator resolution, and reward
custody. A split fleet makes location, pursuit, roster, messages, and shuttle
movement group-specific. The player must be able to tell which group and
location every map, mission, and message belongs to without learning another
group's private state. Before that flow can be understood, session entry must
stop asking ordinary players to select a role and then select a station on a
second screen, and the typography and terminology must return to the accepted
console presentation.

**In scope.** First complete PC03-F01 through PC03-F05 as a bounded cooldown.
Compose the existing enabled fleet/console catalog, live station status, core
claim/release, private assignment, Press station, and authenticated GM join
into one early entry surface. Ordinary players enter or view stations; only
the authenticated GM path is described as Role Select. Keep the first open
core-console entry server-authoritative and atomic. Replace current visible
generic “table” wording with “console” across the app where it names this
digital interface, install the owner's exact default Red Alert sentence, and
restore the end-of-PC01 mono/display treatment using rendered comparison rather
than a source-string-only pass. Treat PC01 as a comparison, resolve any proven
outlier against the documented CIC contract, and make the corrected rendered
typography gate mandatory in the exact-SHA deploy path.

For the exploration cluster, provide one coherent path through the current
ship map, group/location identity, source-supported away-mission lifecycle,
private participant hands, Mission Leader allocation, facilitator resolution,
result/custody presentation, and group-local split state. The digital
facilitator records the participants and the one Mission Leader selected by
the mission team; a mission cannot start without a newly reached eligible
location and at least one source-authorized capable craft. Only entitled
participants see their own cards. The group label, coordinate, mission state,
and message audience remain visible at every handoff. A split creates separate
group membership, positions, pursuit values, ordinary roster visibility, and
communication boundaries. The printed scout-taxi exception is a separately
authorized, range-checked path. Automate every deterministic facilitator step,
calculation, state transition, and notification in this flow; append its source,
inputs, modifiers, outcome, delta, revision/replay, and recovery state to the
GM log, and request GM input only for a genuine printed choice, source gap, or
intervention. Audit and repair the initially allocated PC04
prompts where their current prerequisites and source contracts are ready; a
review scene or attractive panel does not close held gameplay.

**Held parts of the initial allocation.** Prompt 237 stays held until the
optional Gorgoneion admission, Captain entitlement, and pre-deal support
lifecycle are defined. Prompts 241b and 243 cannot wire their special outcomes
until the mission instance, contribution, result, and custody paths they
consume exist. Prompts 334 and 335 remain held where “explore two systems” or
“two Wolf systems” lacks a production recipient/history transaction; do not
turn a review-scene choice into authoritative map knowledge. Prompt 348's
single pursuit value after independently tracked groups rejoin is not stated
by the printed split-fleet rule; preserve the separate values and do not merge
them or claim Prompts 347, 349, 350, 424, or 643 complete until a source-backed
resolution is recorded. Prompts 422 and 646 require an ordinary complete
away-mission playthrough. Prompt 424 and 643 require an ordinary complete
split/rejoin playthrough. Prompt 678 needs authoritative recipient selection
and known-fact projection, not a client-only share button. Existing pure
resolvers and parked candidates are evidence to reconcile, not permission to
overwrite their preserved work or claim a production path.

**Out of scope.** Inventing the pursuit value of rejoined groups; silently
admitting optional Gorgoneion, Capybara, Warrior, Union, or other craft that
canonical setup has not activated; exposing another participant's hand or
another group's private map/roster/message state; closing a prompt from a
synthetic review scene; attack-stage dashboards (PC05); weapon and boarding
controls (PC06); unrelated President, crisis, investigation, candidate, or
endgame workspaces; and the final twenty-player proof.

**Sources, assumptions, and rabbit holes.** The Player's Guide v1.1 printed
pp. 10, 14–15, Facilitator's Guide v1.1 printed pp. 13–17, and the routed
v1.1 shuttle/component pages establish a new-location mission, one team-chosen
Mission Leader, secret per-player hands, blind extra-card allocation, one
secret discard, at most one contributed card per opportunity, facilitator
addition only to nonempty opportunities, contribution-linked shuttle bonuses,
leader reward custody, overrun persistence, and one-ship oversized-reward
drop-off. Facilitator's Guide printed pp. 16–17 establishes independent split
pursuit, blocked ordinary communication, and a range-bound scout taxi carrying
up to two players or two fuel. The primary artifact inventory and checksums
match the private provenance record, and the relevant pages were rendered and
visually checked while shaping. The provenance row does not yet route the
base A4 artifact to the maintained exploration derivative; record that as a
documentation review gap and do not overstate source closure. No gameplay
assumption is accepted merely by this shape; record any chosen reading in the
assumptions log before dependent behavior is claimed.

**Owner-playable UI yes/no checks.** A hosted, clearly labeled solo scene uses
real production components with prepared synthetic states and no live writes.
The owner can complete the checks in one sitting; agents own authority,
privacy, calculations, multi-client behavior, and production proof:

1. **Yes/no — Enter once.** After joining, can I use one early catalog to find
   my assigned/open station, see live occupancy, enter or view its console,
   return without losing place, and distinguish the separate authenticated
   GM join path without a second role-then-station choice?
2. **Yes/no — Read the console.** Across the entry surface, DRADIS, shared
   header, representative ship/shuttle stations, and the mission view, does
   the typography match the accepted end-of-PC01 console treatment? Is current
   generic wording consistently “console,” and does the default warning read
   exactly `RED ALERT // WOLF ATTACK IMMINENT ALL HANDS TO BATTLE STATIONS. NON-CREW MUST SHELTER IN PLACE UNTIL ALERT LIFTED`?
3. **Yes/no — Follow a mission.** From a prepared newly reached system, can I
   tell which group and coordinate owns the mission, who the Mission Leader
   is, which craft/players are participating, what private action is mine,
   which opportunity each visible result belongs to, and where rewards are
   held or must be dropped off? Are deterministic facilitator steps completed
   automatically and reported in the GM log rather than presented as manual
   transcription or approval work?
4. **Yes/no — Follow a split.** In prepared whole-fleet, split, taxi, and
   pending-rejoin views, can I tell each group's ships, current location,
   pursuit, map knowledge, communication state, and next permitted action
   without mistaking another group's information for mine?
5. **Yes/no — Recover.** In prepared refresh, reconnect, simultaneous entry,
   stale mission action, and group-change views, does the latest authorized
   station, hand, mission, map, and group state remain understandable without
   offering a duplicate claim, card action, reward, taxi, or message?

**Prepared scene and walkthrough.** Start at the unified entry catalog with
open, occupied, assigned, Press, and GM examples. Offer labeled comparisons
for the exact PC01 typography baseline and repaired candidate at phone,
desktop, and short landscape sizes. Continue through a current group map and a
prepared mission in eligible, participant/leader, request, discard, assignment,
resolved, custody, overrun, and drop-off states. Finish with whole-fleet,
two-group, blocked-message, scout-taxi, and unresolved-rejoin states. Every
simulated action says it is a sample and cannot call production mutations.

**Internal exit gates and handoff.** Implement every new behavior test-first,
committing the smallest failing focused test before the code. Compare PC01 exact
release `4e8e3876108709f2a620c4f71ea874183d3db4ee` with the candidate using
computed font families, sizes, weights, line heights, tracking, bounding boxes,
and screenshots at 320×844, 390×844, 844×390, and 1440×900; cover DRADIS plus
representative shared and route surfaces. The documented CIC contract decides
any PC01 outlier. Make `npm run test:font-consistency` a mandatory exact-SHA
CI/deployment gate and run the ticker browser gate because global chrome, fonts,
Role Select, and Red Alert copy are release-critical. Exercise first-entry claim races, GM-only join,
Press separation, deep links/Back, private mission hands, wrong participant,
leader/facilitator authority, replay/stale requests, empty opportunity,
contribution-linked bonuses, overrun/reconnect, group-local roster/map/message
projection, split isolation, taxi range/capacity, automatic GM-log receipts,
and denied direct writes for
every changed source-supported production path. Obtain one independent Sol
review of the exact candidate for shared session state, callable behavior,
rules, privacy, and release evidence. Reconcile one final commit, run its
appropriate validation, push, verify deployment, and separately attempt
ordinary authorized play. The report lists new assumptions first, all five UI
checks, every test change and reason, held prompts, exact build/review access,
and truthful distinctions among local tests, rendered QA, deployment, and live
gameplay.

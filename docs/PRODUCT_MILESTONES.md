# Product playtest checkpoints

**Latest owner correction, 2026-09-28:** distribute the **293 remaining prompts
evenly across PC05–PC10**: **49 each for PC05–PC09, then 48 for PC10**.
The overall targets are **507, 556, 605, 654, 703, and 751 of 751 done**.
This supersedes both the PC05-half catch-up proposal and the PC15 extension.
Follow the literal targets and complete replacement allocation in
[Checkpoint Completion Recovery Plan](CHECKPOINT_COMPLETION_PLAN.md).
UI review and owner authorization do not waive these completion targets.
The [original route and PC01–PC04 shapes](archive/PRODUCT_CHECKPOINT_HISTORY.md)
are historical context. A presentation-only release does not complete a checkpoint.

## Current PC05–PC10 allocation summaries

The fixed allocation completes **all 751 prompts by PC10**: PC05–PC09 each
close 49 assigned IDs, and PC10 closes the final 48. These scope summaries
follow the current ID allocation in the [recovery plan](CHECKPOINT_COMPLETION_PLAN.md)
and the prompt definitions in the catalog; they do not add acceptance criteria
or change prompt status. The original UI-tour titles and dated allocations
below are historical only. In particular, the old “PC06 — Weapons and boarding
stations” title is superseded: **PC08** contains the weapons, fighter, and
opening boarding work; **PC09** completes the downstream battle results and
aftermath. PC10 carries the campaign to **751/751**.

| Checkpoint | Current assigned prompt scope | Assigned IDs | Overall done target |
|---|---|---:|---:|
| PC05 | Station readiness and onboarding; rations, maintenance, and mutiny; core jump/scouting paths; research and ECM. | 49 | 507/751 |
| PC06 | Supplemental vessel movement, repair, and cargo; jump and split-fleet mechanics; scouting, away-mission resolution, rewards, and recovery. | 49 | 556/751 |
| PC07 | Airspace and shuttle boundaries; split-fleet privacy, taxi, and rejoin; local DRADIS; Wolf-attack engine, targeting, and range foundations. | 49 | 605/751 |
| PC08 | DRADIS and shuttle presentation; weapon, missile, and fighter actions; the opening boarding path through support, deployment, defense, and damage. | 49 | 654/751 |
| PC09 | Remaining battle results and boarding aftermath, including casualties, salvage, repairs, and fighter rebuild; Wolf threats, investigation and arrest, specialist and President actions, and crisis flows. | 49 | 703/751 |
| PC10 | Specialist workspaces; Ring, Nebula, and Station outcomes; endings and debrief; Capybara integration; cross-path recovery and full-game proof. | 48 | 751/751 |

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
The final game-completion gate covers the complete game's role/function
behavior. The October 7 risk-based execution policy supersedes a blanket
simultaneous twenty-player proof: use legitimate configurations and only the
actors needed for each claim. The owner is never responsible for recruiting
or operating a test cohort. Historical checkpoint test-first plans below remain
historical; the current policy governs remaining work.

The [catalog](implementation-prompts.json) owns current prompt definitions,
dependencies, decisions and status. The [completion plan](CHECKPOINT_COMPLETION_PLAN.md)
owns the fixed PC05–PC10 membership and targets; its documented substitution
rule governs a change to an unstarted assignment. Completed prompts remain
available as prerequisites. Historical allocations are kept in the archive.

## Autonomous execution for PC05–PC10

**Owner instruction, 2026-09-28:** the owner will be away; complete this work
without requiring their presence. This is standing authorization to shape,
implement, validate, repair, merge, push, deploy, and verify each remaining
checkpoint within its assigned scope. Do not insert another routine approval,
walkthrough, feedback, rules-ruling, or checkpoint-transition pause. Provide
solo review access and concise evidence for optional later review.

Resolve routine product and rules ambiguity from the current owner decisions
and precise authorized sources, record the chosen interpretation and its
limits, and continue. Re-evaluate historical owner-decision holds against this
standing instruction; do not perpetuate an obsolete question. Never invent
source authority or claim an unavailable gameplay path was verified. Use
normal authenticated local/emulator gameplay for future proof; do not bypass security or
copy credentials into repository files, reports, fixtures, or logs.

If a genuine access, missing-source, or higher-priority permission requirement
blocks one path, keep working on independent assigned scope. Escalate only
after useful independent work is exhausted, with the exact missing capability
and preserved resume path. An unavailable owner does not waive completion
counts, tests, independent risk review, privacy, ordinary gameplay proof,
explicit feature exclusions, or the separate 0.9.x/1.0.0 version restriction.
A blocked or interim release is never a completed checkpoint.

At a completed checkpoint boundary, record its evidence and continue to the
next assigned checkpoint under this authorization; do not wait for UI review.
Later owner feedback enters the normal bounded cooldown process.

### PC05 released — 2026-09-29

PC05 is complete in build **0.5.57** at exact main commit
`4f2cd9a8c03e8970eae5dd9ad284c855cdb2d2b7`. Its 49 assigned prompts move the
catalog to **507/751 done and 49/293 baseline closures**. The single reconciled
candidate CI run `36636882417`, exact-main deployment `36639176688`, independent
exact-candidate review, responsive release gates and ordinary authorized
production play passed. Standing authorization accepts the checkpoint; the
[PC05 report](PC05_PLAYTEST_REPORT.md) and [acceptance
matrix](PC05_ACCEPTANCE_MATRIX.md) preserve the technical and gameplay proof.
Optional later feedback follows the cooldown process while PC06 proceeds under
the same autonomous execution policy.

### PC06 shape — Vessel movement and away missions

**Authorization and target.** On 2026-09-30 the owner explicitly instructed
execution of PC06 to completion under the standing PC05–PC10 authorization.
PC05 starts this tranche at **507/751 done and 49/293 baseline closures**;
PC06 must close its fixed 49 IDs to reach **556/751 and 98/293**. Its exact
membership is the PC06 row in the [recovery plan](CHECKPOINT_COMPLETION_PLAN.md),
not the historical weapons-and-boarding title. No new PC06-specific UI
feedback or walkthrough answers were available at shaping; the allocation and
title correction in the current owner request are recorded in the docs
clarification commit.

**Problem.** The app needs one understandable route from vessel-specific
movement and resource use into group-local exploration and a complete away
mission. A successful or failed action must keep fuel, cargo, craft, chart
knowledge, private cards, mission results, and recovery tied to current server
authority. Presenting a screen or reusing an existing resolver does not prove
that the ordinary production path performs the whole operation.

**Frozen scope.** Work exactly the 49 assigned IDs, grouped here for review:

The current implementation groups, worker checkouts, shared-file boundaries,
and observed dispatch/live-access findings are recorded in the
[PC06 execution record](PC06_EXECUTION_RECORD.md).

| Product path | Fixed prompt IDs |
|---|---|
| Jump costs, transitions, blind-jump privacy, demo boundary, keyboard control, and composed scenario | 202, 210, 222, 232, 236, 241a, 259, 320, 607, 679, 020a |
| Same-table trades; optional craft repair, cargo, movement, maintenance, transit, closure, conflict, dismantling, and security-team location | 112, 238, 244, 241c, 251, 250, 352, 371, 380, 385, 378 |
| Mission eligibility, private distribution and choices, card placement, automated resolution, bonuses, results, custody, recovery, special rewards, and full playthroughs | 401, 237, 241b, 392, 393, 404, 405, 407, 408, 409, 410, 411, 412, 413, 243, 414, 415, 622, 422, 646, 334, 335 |
| Group-isolated messages/pursuit and the existing Starlight/Hummingbird scan receipts | 151, 307, 322, 323, 324 |

The printed same-table rule supports exchanging held resource tokens at one
ship's table and requires a capable shuttle to move them between tables. It
does not define digital personal inventories, baseline capture, participant
identity, consent, or retries. PC06-A9 records the chosen digital extension:
the facilitator attests the existing per-player token counts, and an exact
offer requires its recipient's consent while both active participants remain
at the same table. This does not touch shared ship stores or bypass shuttle
movement. Prompt 112 remains open until this server-owned contract is
implemented and evidenced; a UI, receipt alone, or unrelated cargo transfer
does not close it.

The other optional-vessel actions operate only through the existing explicit
server-owned admission, docking, mode, and replacement-role authority. Preserve
the distinction between the base Capybara small craft and the full-ship
Capybara expansion. A permissioned dismantle needs one explicit target-ship
player consent bound to the exact current target/action; it never becomes a
client-authored resource or damage write. Away missions keep participant hands
private, accept only server-recorded choices, use each printed opportunity's
own success/critical threshold, fail empty opportunities without adding a
facilitator card, and automatically log deterministic calculation and state
changes. Prompt 334's D reward records chart-valid knowledge without creating
an arrival; Prompt 335 restricts the Athena reveal to valid L/M systems on the
selected chart. Read the full chosen limits in the new
[PC06 assumptions](PRODUCT_MILESTONE_ASSUMPTIONS.md#pc06-a1--keep-vessel-rules-bound-to-the-printed-craft).

**Sources checked.** The seven-file v1.1 source inventory matches the
private provenance checksums. The relevant primary pages were rendered and
visually reviewed: Player's Guide pp. 5, 9–10, and 14–15; Facilitator's Guide
pp. 13–17; base A3 ship sheets pp. 3–6; base A4 small-craft sheets pp. 23,
25, and 27; base A4 engineering-shuttle sheets pp. 73, 75, 79, and 83; base
A4 single-sided ship sheet PDF p. 38 (Voyage 33-0); and both complementary
Capybara expansion files. The routed
derivatives are `REFERENCE_ONLY_CORE_RULES.md`,
`REFERENCE_ONLY_SHIPS.md`, `REFERENCE_ONLY_SHUTTLES.md`,
`REFERENCE_ONLY_FACILITATION.md`,
`REFERENCE_ONLY_EXPLORATION_AND_AWAY_MISSIONS.md`, and
`REFERENCE_ONLY_CAPYBARA_EXPANSION.md`. PC06's blind-jump behavior and digital
mission receipts are product extensions specified by their assigned prompt
acceptance, not printed rules. The source material stays in the private
reference archive and is not copied into the repository.

**Owner-playable checks.** A labeled PC06 solo review scene will use the real
components with synthetic state and no production mutations. The owner can
answer these five yes/no questions in one sitting; all rules, authority,
privacy, replay, and ordinary multiplayer proof remains agent-owned:

1. Can I choose a legal destination or blind jump, understand each vessel's
   fuel cost and result, and see the keyboard path through ready, pending,
   denied, and recovered states?
2. Can I tell which admitted craft is moving, docked, repaired, or using cargo,
   and what changed after a refresh or a competing action?
3. Can I follow one away mission from its group and location through my own
   private cards, the leader's choices, resolved opportunities, and rewards
   without exposing another participant's hand?
4. Can I understand failures, critical results, overrun continuation,
   reward custody/drop-off, and reconnect recovery from the visible mission
   state?
5. When the fleet is split, can I identify my group's location, pursuit,
   messages, and scout results without seeing another group's private state?

**Internal exit and release gates.** Implement changed behavior test-first in
small focused commits. Reconcile existing parked code before replacing any
integration. Exercise callable authority, transaction atomicity, replay,
stale revisions, hidden-data projections, direct-write denial, group isolation,
and all assigned production consumers. Review changed UI at 320×844,
390×844, 844×390, and 1440×900, including keyboard, focus, navigation,
reduced motion, and actual typography. The candidate must pass the focused
server/client/rules checks, `npm run test:font-consistency`, and
`npm run test:ticker:browser` because it changes joined routes and session
projection. Obtain one independent exact-candidate Sol authority/privacy
review, repair every finding, then run one reconciled CI/release candidate and
deployment. Verify normal authorized gameplay separately from tests, the
synthetic PC06 scene, and deployment; report any unavailable production path
without crediting its prompt. Do not start PC07 during this checkpoint.
**PC06 verification authorization, October 2:** the user requested an emulator-only GM development path and explicitly accepted representative local/emulator gameplay to finish this checkpoint. The 49 criteria and target remain fixed. Preserve seven actual production proofs, label local/native/UI/rules evidence separately for the remaining rows, and retain mandatory review, CI and deployment. This PC06 authorization supersedes the unavailable production-GM hold above; prepared scenes alone do not prove behavior and later repo-wide evidence policy below supersedes only the future proof limitation.

## Future acceptance alignment — PC07–PC10 only

**Owner instruction, 2026-09-30:** execute the philosophical alignment from
PC07 onward because PC06 is already in progress. The
[PC07–PC10 alignment guide](PC07_PC10_ALIGNMENT.md) records the earlier explicit
decisions, scoped operating/presentation contract, targeted prompt amendments
and representative solo UI checks. The canonical catalog references that guide
for each of these 195 assigned IDs. Use it when shaping these future tranches;
PC06's current shape and acceptance are not retroactively amended. Fixed
membership, 49/49/49/48 closures, standing authorization and actual gameplay
proof remain intact. P605a retains its separate owner activation boundary.

## Owner decisions before the next checkpoint

**Standing owner instruction, 2026-09-30:** repeat the PC07–PC10 alignment work
before moving into each next checkpoint. The checkpoint owner must complete
this review and the affected planning updates before shaping or starting that
build, under existing standing authorization. Do not wait for the owner to
request another alignment.

1. Read the recorded decisions, feedback and assumptions, then the relevant
   owner conversations before and between checkpoints, including new messages
   since the last alignment. Check earlier decisions that still constrain the
   future work. Distinguish explicit owner decisions from agent suggestions and
   source-backed assumptions; record a later owner correction as superseding
   the earlier decision or interpretation rather than silently discarding it.
2. Apply each decision to **every affected unstarted prompt and checkpoint**,
   including later checkpoints beyond the immediate next one. Amend the
   canonical catalog's acceptance criteria and this plan's affected behavior,
   presentation and owner-playable UI checks. Update linked alignment guidance
   and completion-plan wording where affected; only the next checkpoint needs
   a full shape. Recording feedback alone does not complete the alignment.
3. Record the decision's source and date, affected prompt IDs and checkpoints,
   changed criteria, and disposition in the
   [feedback record](PRODUCT_MILESTONE_FEEDBACK.md). Link any corrected
   [assumption](PRODUCT_MILESTONE_ASSUMPTIONS.md). Note the latest owner message
   reviewed so the next owner can continue from that point. If no new applicable
   decisions exist, record that result and proceed.
4. Regenerate the prompt views after catalog edits and the checkpoint Gantt
   after its catalog or allocation inputs change. Run the relevant existing
   documentation, catalog and projection checks and inspect the final diff.
   Report unresolved interpretations and proof gaps truthfully.

Preserve fixed prompt membership and completion targets unless the owner
explicitly changes them. Alignment grants no implementation or closure credit
and does not waive evidence, privacy, source authority or separately reserved
feature activation. Keep an already shaped or in-progress checkpoint's agreed
scope intact unless the owner explicitly changes that scope; handle its
feedback through the existing cooldown process. For this 2026-09-30 update,
PC06 is in progress and alignment begins with PC07. This is part of checkpoint
preparation, with no new owner-approval pause, reviewer stage or Git/CI gate.

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
   [later-milestone candidates](PRODUCT_MILESTONE_CANDIDATES.md). Complete the
   [owner-decision alignment](#owner-decisions-before-the-next-checkpoint)
   across affected future prompts and checkpoints before beginning this shape.
   Check the current catalog, source passages, dependencies, live product, and active
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
   and release evidence as internal gates. Apply the October 8 mandatory
   functional test-first correction and October 7
   [risk-based execution policy](AGENT_EXECUTION_POLICY.md#risk-based-verification-for-remaining-checkpoints):
   every functional change needs a meaningful observed RED before implementation
   in a separate test-first commit, then GREEN. Risk governs test selection,
   breadth and depth, not an implementation-first exception. Interactive layout,
   visibility, defaults, parsers and provider features count as functionality;
   pure prose/docs use consistency review. Report historical timing gaps
   honestly and distinguish later base-versus-fixed verification. Hold release
   of unvalidated functionality. Choose actual actor count by the claim and reuse valid
   unaffected evidence. Never weaken, skip, or delete an existing test to make
   the build pass. If an existing test
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
   Carry any decision that affects future work into all affected prompt and
   checkpoint criteria using the alignment procedure above before advancing.
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

## Superseded original UI-cluster route (historical titles only)

The [original route and PC01–PC04 shapes](archive/PRODUCT_CHECKPOINT_HISTORY.md)
are archived for decision and evidence history. Use the
[fixed completion allocation](CHECKPOINT_COMPLETION_PLAN.md#complete-baseline-allocation)
for current membership and targets.

### Historical initial prompt allocation for agents

[Original 2026-09-27 allocation](archive/PRODUCT_CHECKPOINT_HISTORY.md#historical-initial-prompt-allocation-for-agents).

## PC01 shape — Shepherd science station

[Historical shape](archive/PRODUCT_CHECKPOINT_HISTORY.md#pc01-shape--shepherd-science-station) · [Playtest report](PC01_PLAYTEST_REPORT.md).

## PC02 shape — Setup, fleet board, and session continuity

[Historical shape](archive/PRODUCT_CHECKPOINT_HISTORY.md#pc02-shape--setup-fleet-board-and-session-continuity) · [Playtest report](PC02_PLAYTEST_REPORT.md).

## PC03 shape — Navigation and shuttle controls

[Historical shape](archive/PRODUCT_CHECKPOINT_HISTORY.md#pc03-shape--navigation-and-shuttle-controls) · [Playtest report](PC03_PLAYTEST_REPORT.md).

## PC04 shape — Exploration and split-fleet map

[Historical shape](archive/PRODUCT_CHECKPOINT_HISTORY.md#pc04-shape--exploration-and-split-fleet-map) · [Playtest report](PC04_PLAYTEST_REPORT.md).

## PC07 shape — Airspace, split fleets and attack foundations

**Authorized October 2, 2026.** The owner requested “execute pc07 please.”
The transition review read the latest PC06 owner messages through “what broke?
diagnose,” the explicit PC06 closure, the future acknowledged-handoff correction,
and the earlier PC07–PC10 alignment. No new applicable game or presentation
decision changes a game criterion. The subsequent October 2 owner decision below
makes authenticated local/emulator proof the repository-wide standard. PC06
remains closed at 556/751; this checkpoint must
close exactly its fixed 49 IDs to reach 605/751 and 147/293 campaign closures.

**Released October 3:** the orchestrator completed all 49 fixed acceptances,
605/751 overall (80.56%) and 147/293 campaign (50.17%). Core 0.5.65
passed independent review, local/emulator gameplay, final validation and CI.
Deployment verified Hosting, Firestore rules and all 105 named Functions. The bounded 0.5.66
review-page layout repair passed renewed review, final local and rendered gates,
[CI](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/37138307265), [exact-main Hosting deployment](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/37139681603) and
deployed phone/desktop solo access. The [report](PC07_PLAYTEST_REPORT.md) and
[matrix](PC07_ACCEPTANCE_MATRIX.md) preserve each evidence class. The delegated
owner and workers remain stopped; root retains checkpoint/release ownership.
No later checkpoint ID or P605a activation is credited.

**Problem and frozen scope.** Players must act, move and learn within their
current fleet group while sharing one session cycle clock. A facilitator must
be able to declare an attack, observe automatically committed range results,
and intervene only for genuine choices or rulings. Recovery must preserve
committed results, deadlines and audience boundaries. The execution record
contains all assigned IDs, coherent behavior groups and integration contracts.
This shape excludes dedicated PC08 weapon/boarding additions, PC09 aftermath and
P605a activation. P428 explicitly includes boarding defence and P441 includes
Boarding: their required foundation includes the minimal entitled crew choice
of zero through available Security Teams and its automatic source-defined
consequences. P438–440 also resolve currently enabled base AEGIS weapon choices
from actual charge/damage/upgrade state. Later weapon, support, modifier and
aftermath prompts retain their own acceptance and receive no PC07 closure credit.

**Sources.** The seven private v1.1 artifacts match the source provenance
inventory checksums; both Capybara files are complementary. Source-specific
sheets outrank generic guides. Workers read and visually check their routed
source pages before changing game content. Source material and renderings stay
outside Git. Existing printed taxi/maintenance/combat policies are recovered
before adding behavior. Rejoin's pursuit policy is a deliberate digital
assumption recorded separately, never attributed to print.

**Feedback disposition.** Adopt all prior station chooser, cycle/console copy,
exact Red Alert, live GM-only detail, truthful DRADIS names/Zoom, disconnect
recovery, optional Press/extra-GM and rendered typography corrections. Preserve
the existing safe ticker handoff and Wolf-humanity sentence. No new PC06 UI
feedback requires cooldown. Owner feedback remains optional.

**Solo UI checks.** A labeled scene using actual components with synthetic
state and no live writes must let the owner review these five yes/no checks:

1. Can I distinguish my group's ships, local notes and contacts from another
   group's unavailable information under the shared cycle clock?
2. Can I send one known scanned system to selected legal ships and see why an
   unavailable recipient or unknown fact cannot be sent?
3. Can I follow an eligible taxi or rejoin and understand the committed fuel,
   membership and pursuit result without entering arithmetic?
4. Can I follow declaration, targeting and automatic range progress, make an
   entitled choice, and see the next genuine decision in my existing console?
5. Can I recover after a restriction or interstitial, see preserved time and
   resolved results, and return through the correct chooser?

**Internal gates.** Separate failing test commits precede new behavior. Cover
current callable/rules authority, hidden data, atomicity, replay, stale revision,
wrong actor, reconnect, membership, deadline, range ordering and real consumers.
Inspect 320/390 phone, 844×390 landscape, 1440×900 desktop, reduced motion,
keyboard, navigation, actual fonts and geometry. Obtain independent Sol 6.1
review of the reconciled authority/privacy candidate. Run the appropriate final
validation, font/typography, ticker, bundle and existing release gates, then
one reconciled CI candidate and exact-main deployment checks. Normal authenticated
local/emulator gameplay supplies representative behavior proof under the owner
decision below. Production behavior and deployment remain separately labeled;
prepared scenes and unavailable proof receive no behavior closure credit.

**PC07 verification authorization, October 2:** the owner explicitly selected
“Use the same local/emulator approach” when asked whether PC07 should use the
representative approach approved for PC06, with independent review, CI and
production deployment still required. All 49 criteria and the 605/751 target
remain fixed. Native handler, ordinary local HTTP/UI and rules evidence can
prove these behaviors; scene presentation remains separate and never sufficient
alone. Label local results separately from production behavior and deployment.
The production-GM access dependency is closed. The later owner correction below
supersedes the PC07-only limit.

## Repository-wide gameplay verification — owner correction, October 2

The owner corrected the PC07-only interpretation: **“that’s a new repo thing,
all future will use local emulator.”** This supersedes the earlier limitation.
All future work and unstarted PC08–PC10 use normal authenticated local/emulator
gameplay as the completion standard; production-GM or live-production gameplay
is not a closure prerequisite. The canonical acceptance of all 195 PC07–PC10
IDs carries this decision. All functional criteria, fixed membership/targets,
source rules, audience privacy, server authority, replay/recovery, independent
risk review, CI and production deployment remain required.

Use meaningful native handlers, normal HTTP/UI and Firestore rules evidence as
appropriate, with separate current identities for distinct actors. Prepared
synthetic tours are presentation evidence and cannot establish behavior alone.
Distinguish local unit/native/HTTP/UI/rules, rendered QA, CI, deployment and any
actual production behavior; never retroactively relabel historical evidence.
PC10's full 20-player set, end-to-end loop and implemented game end remain
functional obligations and may be demonstrated with local/emulator clients.
This decision grants no 0.9.x/1.0.0 authorization or P605a activation.

## PC08 shape — Weapons, fighters, boarding and truthful DRADIS

**Released October 4, 2026 as 0.5.67.** The fixed 49 acceptances are complete:
654/751 overall (87.08%) and 196/293 campaign closures (66.89%). Exact source
`2fae212a9b86d0daa5aef3797f4609abd02a618f` passed independent review, complete local validation,
candidate CI and exact-main production verification. See the
[playtest report](PC08_PLAYTEST_REPORT.md) and the
[five-step tour](https://dow-new-eden-console.web.app/pc08-review.html).
Authenticated gameplay proof is local/emulator; the deployed tour proves
prepared presentation and public parent navigation. PC09 was unstarted at that
historical closeout; its separate candidate is recorded below.

**Authorized October 3, 2026.** The owner requested PC08 with full execution
authority. PC07 opens this tranche at 605/751 done and 147/293 campaign
closures. Finish exactly the 49 assigned IDs to reach 654/751 and 196/293.
The [execution record](PC08_EXECUTION_RECORD.md) fixes three complete behavior
groups and their isolated implementation checkouts. Root owns every acceptance,
integration, independent review and the single release.

**Problem and frozen scope.** Fleet crews must make their entitled weapon,
fighter and defence choices in their existing consoles. The server must apply
the printed rolls, costs, modifiers, damage and loss consequences once, then
advance automatically when genuine choices are settled. DRADIS must reflect
current group-local ships, sampled transit, parked craft and committed rejoin
without stale contacts, leaked metadata or clipped names. Complete shuttle
scenarios must prove movement, actions, restriction/attack parking and recovery.
This delivery excludes PC09 aftermath, specialist/crisis additions, PC10
endings and the separately deferred P605a attack visualization.

**Sources, assumptions and rabbit holes.** The seven primary v1.1 artifact
checksums match the private provenance inventory; named component sheets
outrank generic guides and both Capybara files apply. Each group reads its
precise routed mechanics and inspects extraction-sensitive primary pages.
Record source gaps, Boa ambiguity and the Wolf Commander incomplete consequence
explicitly; keep an audited facilitator ruling where print requires one.
Do not replace genuine choices with defaults, confuse correction controls
with normal automation, merge independent wings, reuse charges/costs on retry,
leak private enemy rosters into DRADIS, or broaden this checkpoint into later
aftermath. New interpretations go first in the report.

**Feedback disposition.** The latest transition review found no new UI note
awaiting cooldown. Adopt all prior CIC typography, cycle/console wording,
single station chooser, truthful contacts and minimized Zoom, full first-sweep
duration, exact Red Alert/ticker, graceful restore, optional Press/extra-GM,
private GM detail and automated deterministic procedure decisions. Apply the
repository-wide emulator proof and root ownership corrections.

**Owner-playable checks.** Provide a labeled synthetic scene using actual
presenters, local simulated actions and no live writes. The owner may review
these five yes/no checks in one sitting; gameplay proof remains agent-owned:

1. Can I follow docked, travelling, parked and rejoined contacts, distinguish
   current local information, use Zoom and read complete names at each size?
2. Can I select an available weapon and target, understand its automatic
   result and resource cost, and see a damaged/unavailable action clearly?
3. Can I distinguish Alpha, Bravo, Maliades and the PDF Escort Wing, choose
   their legal actions, and understand persisted fighter losses and recovery?
4. Can I follow support relocation, security-team defence, rerolls and any
   Militia Leader risk, with visible resolved damage and explicit genuine ruling?
5. Can I see committed battle consequences and surviving-wing carryover,
   recover after a disconnect, and return through the visible parent control?

**Internal exit gates.** Commit meaningful failing tests before new code;
exercise current callable/rules authority, costs/charges, per-wing limits,
range priority, automatic advance, private audiences, stale revisions, retries,
reconnect and direct-write denial. Prove assigned paths with normal authenticated
local/emulator native, HTTP/UI and rules checks, separately from prepared scenes.
Inspect narrow phone, wide desktop, short landscape, actual fonts, complete
contact geometry, keyboard, return controls and reduced motion. Integrate all
groups before independent Sol 6.1 authority/privacy review and appropriate
final validation. Pass font, rendered typography, ticker, bundle and existing
release gates, then candidate CI and exact-main deployment. Preserve exact
evidence and fixed counts; no partial feature or presentation release completes
PC08. Do not begin PC09 in this delivery.

## Post-PC08 audit and next checkpoint sequence — October 4

The owner requested a separate, finite audit only after PC08 became terminal.
See [PC08 Bug Audit](PC08_BUG_AUDIT.md) for baseline verification, reproducible
findings, independent review and follow-on ordering. This preserves the 0.5.67
release evidence and does not start another checkpoint.

The October 4 baseline audit recorded ten open runtime findings: one P1
progression blocker, seven P2 defects and two P3 stale acknowledgements.
All ten are repaired in the verified PC09 release recorded below. The catalog's
existing PC09 criteria and dependency links place the shared progression/carryover repairs first, durable
losses before P483 rebuild, result/projection fixes before P474/P484, and recovery/
receipt disposition in P621 before P645. Affected PC08 rows explicitly qualify
their historical `done` status; the audit is not new passing gameplay evidence.

After the audit, a separate orchestrator shapes and executes PC09. Preserve
P605a's explicit activation boundary and its assigned 49-ID closure target;
continue independent ready work while that decision remains deferred. After
PC09, revise PC10 before its separate orchestrator starts it. That revision must
provide a complete solo walkthrough of every role using two browsers, unlimited
timers and a real authenticated GM cycle 0 → 1. Reuse current functionality and
test missing paths end-to-end; a prepared-state tour alone is not that proof.
Full-table twenty-player, complete game-loop and implemented ending acceptance
remain required. Then follow the existing post-completion work; do not create
PC11. [The feedback record](PRODUCT_MILESTONE_FEEDBACK.md#pc08-audit-and-checkpoint-sequence--2026-10-04)
preserves this instruction and its disposition. This section records sequence
and the later revision requirement; it supplies no implementation or closure
credit and no P605a or 0.9.x/1.0.0 authorization.

## PC09 shape — Battle aftermath, deduction and crises

Authorized October 4 by the separate PC09 execution dispatch. Its opening main
snapshot was 654/751 and 196/293 campaign closures; the fixed 49-ID target is
703/751 and 245/293. The [execution record](PC09_EXECUTION_RECORD.md) fixes
six complete implementation groups, isolated checkouts, shared-file boundaries,
integration ownership and five optional owner-playable UI checks. Root retains
all acceptance, integration, review and single-release accountability.

The scope includes all ten PC08 audit repair/proof requirements, with the three
progression blockers first. Battle consequences, salvage, ordinary repairs and
fighter construction must compose with current authority and durable inventory.
Investigation, arrest, specialist benefits, Commander powers, President and
crisis flows retain genuine choices, private calculation receipts, entitled
results and optional Press publication. Follow PC09-A1/A2 for the distinct
VIP Host and presidential visit policies. Source-backed ambiguity is recorded
before closure; private source material stays outside Git.

The latest transition review found no new UI feedback awaiting cooldown.
Adopt existing CIC/typography, truthful contacts, clock recovery, one-facilitator
automation, private audiences and normal authenticated emulator proof decisions.
The owner explicitly activated P605a on October 4 and instructed completion
of PC09 including visualization. A later October 4 instruction authorizes
continuation through PC10 and post work via subsequent separate tasks. The
parent owns the PC10 revision and dispatch after PC09 completion. The existing P433a projection and
privacy contract remains; the visualization extends the established DRADIS
design. The narrow Astra implementation exception and launch/change audit are
recorded in the current feedback and model manifest; all tests, documentation,
review and other work stay on Sol 6.1 or Luna 6. Prepared solo review access is
presentation only. Required independent Sol review, final focused/responsive/release checks,
exact-candidate CI and production deployment remain separate from gameplay proof.
PC10 revision and later work remain outside this delivery.

The verified October 5 PC09 release is **0.5.68**, closing exactly 49 IDs at
**703/751 (93.61%)** overall and **245/293 (83.62%)** campaign. All ten PC08
audit defects are fixed, all qualified local/emulator acceptances and independent
reviews pass, and [exact-main release 37261134992](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/37261134992) succeeds from
`feec9189` with production surface and public artifact verification. See
[the checkpoint report](PC09_PLAYTEST_REPORT.md) for exact gates and evidence
limits. This release grants no PC10 or later completion credit.

## Campaign resumption specification — 2026-10-15

**Updated October 16 from [PC10 completion wayfinding](PC10_EXECUTION_RECORD.md#completion-wayfinding--october-16-2026).**
This specification refines the existing 48-ID checkpoint; it adds no prompts or
completion credit. Under the [existing triage mapping](agents/triage-labels.md),
`ready-for-agent` applies to preparatory candidate and evidence reconciliation.
Final audit and release remain dependent on the full assigned acceptances and
canonical prerequisites. The October 15 `implement-spec` invocation superseded
the earlier execution pause; this specification update performs no implementation
or runtime work and does not change that authorization.

### Problem Statement

The owner wants the agreed game completed without managing agents, repeating
settled decisions or operating the test table. PC10 already has substantial
implementation and accepted evidence, but its older plans do not fully reflect
recent repairs, unintegrated handbacks and remaining gameplay gaps. A failed
proof selector can stop a rehearsal before the intended behavior is reached;
neither that stop nor a passing source test establishes the gameplay outcome.
The next task needs a precise route from preserved work to a verified release.

### Solution

Finish the existing checkpoint in four stages: reconcile the exact candidate
and outstanding handbacks, map every assigned criterion to accepted evidence
or a precise gap, qualify the remaining ordinary gameplay paths, then validate
and verify one release. Keep accepted work and source-bound evidence where
applicable. Agents own implementation, repairs and gameplay correctness; the
owner receives concise evidence and an optional playable tour.

### User Stories

1. As the product owner, I want the existing campaign completed before new features or redesigns, so that the agreed game reaches its endpoint.
2. As the product owner, I want the fixed PC10 scope preserved, so that the target does not grow whenever a proof gap is found.
3. As the product owner, I want settled decisions retained, so that I do not have to repeat requirements.
4. As the product owner, I want agents to own verification and release, so that progress does not depend on my availability.
5. As the product owner, I want an optional numbered playable tour, so that I can inspect the finished experience when convenient.
6. As the product owner, I want only concrete owner-only blockers escalated, so that routine choices do not interrupt me.
7. As the product owner, I want truthful completion counts, so that planning and source preparation cannot be mistaken for delivery.
8. As a returning task owner, I want the exact candidate and current main reconciled, so that recent fixes are included before qualification.
9. As a returning task owner, I want outstanding handbacks and their original test chronology preserved, so that useful work is integrated without inventing earlier evidence.
10. As a returning task owner, I want temporary handback conclusions retained in existing durable acceptance records, so that a fresh session can continue reliably.
11. As a checkpoint owner, I want every assigned criterion mapped to evidence or an exact gap, so that older pending summaries do not cause unnecessary rebuilding.
12. As a checkpoint owner, I want setup and proof-consumer failures distinguished from product failures, so that the repair addresses the behavior actually reached.
13. As a checkpoint owner, I want cheap consumer preflight before a long rehearsal, so that an avoidable selector failure does not consume another full prefix.
14. As a facilitator, I want genuine authenticated setup and Cycle 0 to 1, so that acceptance exercises the actual start path.
15. As a facilitator, I want unlimited manual full-game progression, so that the existing complete-game demonstration can be followed at a human pace.
16. As an entitled player, I want every role and unique mechanic to work through ordinary controls, so that a complete game can be played rather than merely displayed.
17. As a specialist, I want the existing Wing Commander, Scientist, Explorer and PDF Colonel workflows to compose with the game, so that their distinct actions have usable outcomes.
18. As a Base-game player, I want the remaining Wing, combat, politics and debrief path qualified, so that an early successful setup does not conceal a later blocker.
19. As a Capybara player, I want Macaw, Boa and Scrap workflows to compose with production, combat and jumps, so that the expansion works as a game.
20. As a Base-game player, I want expansion-only state to stay outside my game, so that variant choices preserve their existing rules.
21. As a player approaching the Nebula, I want loss, success and recovery qualified in their continuing session where required, so that the claimed journey is supported by actual play.
22. As a player approaching the Ancient Space Station, I want contributions, repeated combat, Reactor use and activation to compose, so that Station-specific behavior is proved through its ending.
23. As a player approaching the Ancient Ring, I want its remaining repair, contribution, passage and retry criteria resolved, so that narrow later evidence does not conceal earlier failed attempts.
24. As a player reaching an ending, I want a clear authoritative result and debrief, so that the outcome completes the gameplay path.
25. As an entitled returning player or GM, I want later debrief reads to work under their proper audience rules, so that reload does not lose the result or restore live authority.
26. As a player whose ship is destroyed, I want the existing pods, evacuation, Flee and replacement paths to remain recoverable, so that nonterminal loss does not strand me.
27. As a player encountering terminal pursuit or total fleet loss, I want the server to own the ending, so that a terminal label cannot leave the session active and orphaned.
28. As a returning player, I want my session, seat, vessel and workflow restored under current authority, so that reconnect does not revive stale permissions.
29. As a player retrying an interrupted action, I want an exact committed request to recover its original result, so that costs, rewards and randomness are not repeated.
30. As a player whose role or vessel has settled, I want fresh unavailable actions refused, so that settlement cannot create new cargo, mission choices or allocations.
31. As a player acting alongside another actor, I want stale or conflicting actions reconciled, so that one action cannot overwrite a newer authoritative outcome.
32. As an entitled player, I want loyalty, Wolf, navigation, mission and private-note information restricted to its intended audience, so that secrets remain private.
33. As a player, I want dice, cards, decks and hidden clues owned by the server, so that forged outcomes cannot influence play.
34. As a player, I want existing expensive-action limits applied fairly, so that one actor cannot monopolize shared resources.
35. As an operator, I want denial telemetry and action receipts to retain their existing private, sanitized boundaries, so that diagnosis does not expose secrets.
36. As a player, I want costs, blockers and the next actor made clear, so that I can understand how to continue.
37. As a mobile or keyboard player, I want critical controls, readable results and a visible return route, so that the full game remains reachable on supported layouts.
38. As a player, I want typography and responsive behavior checked on the emitted candidate, so that source-level style checks do not miss a rendered failure.
39. As a checkpoint owner, I want compatible claims combined and unchanged evidence reused, so that testing remains proportionate while preserving every acceptance.
40. As a checkpoint owner, I want actor cohorts justified by the claim, so that a narrow repair does not automatically trigger a capacity rehearsal.
41. As the product owner, I want local gameplay, rendered QA, independent review, CI and deployment reported separately, so that one kind of success does not imply another.
42. As the product owner, I want one reconciled release verified against exact main, so that the shipped game matches the accepted candidate.

### Implementation Decisions

- Keep the canonical prompt catalog, fixed 48-ID membership, full existing acceptances and 751-prompt endpoint. Resolve rows by explicit prompt ID. No new gameplay mechanic, schema or API contract is specified.
- Update the existing campaign specification and bounded reconciliation/release briefs. The existing tracker remains authoritative; readiness, execution authorization and completion remain distinct.
- Keep one top-level checkpoint owner accountable for integration, every acceptance, required independent review and the single release. Preserve other tasks' work, resource reservations and recovery data.
- Begin with preparatory candidate reconciliation. Check current ancestry and scope before integrating the Red Alert proof-consumer repair, candidate-settlement authority repair, App Check telemetry evidence and current main's proof-tool preflight. Retain original test-only and source commits. These are inspection inputs, not accepted candidate evidence.
- Require the outstanding independent authority follow-up on fresh Highwall, Boa and Hummingbird actions after settlement. Preserve exact committed retries and reject new effects for unavailable actors, home vessels or current hosts under the established contract. This spec does not resolve the review by assertion.
- Use the existing acceptance matrix and role/action records to map all 48 IDs criterion by criterion. Record source binding, accepted evidence class and the precise remaining gap. An old pending row is not proof that implementation is absent; source-tested work is not native gameplay acceptance.
- Retain necessary conclusions from temporary handbacks in durable existing records before relying on them in a future context. Preserve failed attempts and their original claims; later narrow success cannot retroactively pass an earlier run.
- After reconciliation, qualify Base continuation through Wing/combat, politics and debrief; Capybara composition with same-session Nebula loss/success/recovery; Station contribution/reconnect through activation and ending; then evacuation, destruction and Flee/reload/replacement. Fill only the remaining specialist, Ring, privacy, stale/reconnect and security gaps exposed by the criterion audit. This order is provisional where evidence or legitimate dependencies require adjustment.
- Preflight the actual rendered control and navigation contracts before replaying a long prefix. A proof-adapter change needs its discriminating consumer check and affected mounted slice; introduce no generic test framework.
- Combine compatible criteria in a legitimate continuing session. Retain the original actor, session, source/runtime and ordered actions where continuity is required. A fresh session remains a fresh session and cannot supply missing continuous-game proof.
- Preserve authentic GM start, every-role/function coverage, the existing two-browser fresh-game ending, unlimited manual progression and explicit full twenty-player obligations. Use minimum legitimate cohorts for other claims. A twenty-one-account run requires a specific scale claim or reproduced scale-dependent defect; untested capacity stays unclaimed.
- Preserve source-defined movement, resource, mission and audience prerequisites. GM scenario budget adjustments do not establish ordinary resource acquisition. Server-owned receipts, mutations, uncertainty and private projections retain their existing authority boundaries.
- Repair a reproduced defect within its existing brief or return a bounded repair with the failing evidence and resume condition. Observe meaningful behavioral RED before functional implementation, then GREEN; preserve historical timing gaps honestly.
- Close each prompt only after its whole acceptance passes across every subdivision. Preparatory reconciliation can start now; final audit sign-off retains canonical prerequisites and all assigned evidence obligations.
- Reconcile current main, version/changelog metadata and required reviews before the batched candidate CI push. Follow the existing exact-main deployment and health/public-artifact workflow. Historical version suggestions and source-test counts are not release authority or a reliable ETA.
- Keep the owner's walkthrough optional and carry post-PC10, PC11 and conditional PC12 forward in their existing sequence. This update launches no runtime and grants no later-phase or restricted-version authorization.

### Testing Decisions

- Use the existing authenticated member/GM gameplay boundary as the highest integration seam for composed gameplay, actor handoffs, navigation, recovery and ending claims. Use two browsers for the existing full-game obligation or a claim that needs that handoff; an isolated one-actor repair does not inherit that cohort. Exercise ordinary controls, native handlers and HTTP/UI reads; prepared scenes and internal store assertions do not replace this boundary.
- Add focused supporting checks only where they discriminate the actual failure more cheaply: mounted consumers for navigation/selectors, existing callable/lifecycle tests for transactions and replay, and audience-specific Firestore rules tests for reads and denied privileged writes. Prefer these existing seams to new interfaces.
- Test observable results, committed costs, denied effects and reachable next actions. Exercise the real consumer or handler from its previous state; a fixture already at the expected outcome or a source-string match does not prove the transition.
- For the Red Alert and Flee/navigation stops, reproduce the reached consumer failure before changing it. Verify the accessible role/name and return control against the actual mounted UI. The target gameplay remains unproved until the rehearsal reaches it.
- For settlement repairs, cover legitimate fresh-action positives, settled actor/home/current-host denials, the transaction race where applicable and unchanged exact committed replay. Assert no new resource, randomness, selection, receipt or audit effect on denied fresh requests. Review the fixes independently before accepting them.
- For Station and Nebula recovery, retain same-actor and current-generation checks, the original request identity, a real prior committed result, unchanged costs/revisions on replay and bounded waiting. A source-tested continuation is preparation for native qualification.
- Distinguish App Check evidence by the transport and token condition actually exercised. Missing-token local SDK/HTTP denial and sanitized logger capture do not establish invalid-token handling or production telemetry.
- Use the smallest cohort that proves the claim and state why it is sufficient. Preserve explicit full-table, every-role, two-browser and continuing-game obligations at their acceptance boundary; a configured roster is not a count of admitted Auth actors or simultaneous browsers.
- Apply the owner's October 16 clarification: “Let’s make sure they’re sensible. use common sense.” Choose the cheapest existing check that can expose the actual failure, then qualify the affected product claim. These boundaries guide judgment; they do not require every repair to traverse every layer.
- Rebind unchanged evidence only after checking relevant behavior, dependencies and runtime identity. Run focused checks during repair, then the required reconciled gameplay, responsive/accessibility, emitted-build typography, review, CI and deployment gates. Broaden or repeat for failed gates, material candidate/upstream changes or unresolved concerns.
- Prior art includes the existing member-navigation and two-browser helpers, mounted role/candidate/ending consumers, Station contribution recovery and Capybara-to-Nebula continuation checks, native candidate/debrief callable suites, audience rules suites, denial/audit tests and rendered typography gate.
- Stop the bounded slice at its first unexplained integration failure, retain original evidence and teardown, and diagnose that behavior before expanding. A setup failure does not establish that the target product action failed.
- For this prose-only update, review Markdown, links, fixed membership, unchanged acceptance/status facts and generated-view consistency using existing documentation/dependency checks. It earns no functional RED/GREEN, native, CI or deployment claim.

### Out of Scope

New features or redesigns, changed checkpoint allocation, a second issue tracker,
new completion states, replacement acceptance criteria, blanket replay of settled
checks, a new harness or enforcement system, mandatory owner playtesting,
deletion of old recovery data, implementation/runtime in this update, later-phase
execution and ungranted 0.9.x/1.0.0 releases. Discovered defects remain bounded
repairs within existing acceptance rather than automatic new scope.

### Further Notes

The October 16 local catalog snapshot is **703/751 done (93.61%), 27 partial and
21 missing**; the fixed PC10 target remains 48 closures to **751/751**. The earlier
October 15 specification snapshot of six partial and 42 missing is historical.
This update changes no completion state. The next useful work is exact-candidate
and criterion-level reconciliation, not another broad runtime attempt. Refresh
current ancestry, live resource ownership and the predecessor handoff before
execution; retain unresolved review, gameplay and release gaps explicitly.

## Approved bounded execution tickets — 2026-10-15

The owner approved revising and publishing the context-bounded decomposition.
These briefs subdivide the existing 48 PC10 IDs; they add no prompts, change no
acceptance or completion status, and introduce no separate ticket-status ledger.
Each catalog row links its own briefs through planning evidence.

Triage is `ready-for-agent` for the approved specification. Dependency readiness
and runtime authorization remain separate: the original October 15 pause was
superseded by the later implementation resumption recorded below. Existing hard
prerequisites are inherited exactly; additional composition edges apply only
to these briefs and do not create new Git, CI or release gates. The existing
dependency chart continues to display all 48 canonical IDs and their unchanged
prompt graph; this table describes the finer execution handoffs.

Each brief is restricted to one role subflow, coupled transaction, audience
family, recovery scenario or evidence/release phase. This is a bounded planning
assessment, not a measured token guarantee: preserve room for reading, repair,
verification and handoff. Existing suites/presenters and normal-gameplay helpers
are reused. Missing implementation or a materially broader defect becomes a
focused repair, rather than silently expanding a proof brief. No prefactor is
justified solely by this planning change.

| Brief | Existing prompts | Outcome | Blocked by briefs |
|---|---|---|---|
| [W1](pc10-tickets/01-w1.md) | 181 | Wing Commander air operations | None |
| [W2](pc10-tickets/02-w2.md) | 181 | Wing Commander mission and rebuild results | None |
| [S1](pc10-tickets/03-s1.md) | 215b | Scientist research and devices | None |
| [S2](pc10-tickets/04-s2.md) | 215b | Scientist scouting and mission participation | None |
| [X1](pc10-tickets/05-x1.md) | 223b | Explorer scouting and harvesting | None |
| [X2](pc10-tickets/06-x2.md) | 223b | Explorer route and mission workflow | None |
| [P1](pc10-tickets/07-p1.md) | 233b | PDF Colonel wing and craft workflow | None |
| [P2](pc10-tickets/08-p2.md) | 233b | PDF Colonel boarding and mission workflow | None |
| [C1](pc10-tickets/09-c1.md) | 576 | Macaw deliberate dismantling | None |
| [C2](pc10-tickets/10-c2.md) | 579 | Boa reclamation choice and result | None |
| [C3](pc10-tickets/11-c3.md) | 581 | Attack Scrap pickup lifecycle | None |
| [C4A](pc10-tickets/12a-c4a.md) | 584 | Capybara full-table setup and production | None |
| [C4B](pc10-tickets/12b-c4b.md) | 584 | Capybara Macaw, Boa and Scrap mission composition | C4A, C1, C2, C3 |
| [C4](pc10-tickets/12-c4.md) | 584 | Capybara combat, jump and reconnect proof | C4B |
| [C5](pc10-tickets/13-c5.md) | 585 | Base and expansion isolation | C4 |
| [D1](pc10-tickets/14-d1.md) | 541, 542 | Private retry-safe candidate discovery | None |
| [D2](pc10-tickets/15-d2.md) | 543, 593 | Candidate plans and preparation help | D1 |
| [R1](pc10-tickets/16-r1.md) | 544, 545, 546 | Repair and contribute to the Ancient Ring | D1 |
| [R2](pc10-tickets/17-r2.md) | 547, 548, 549 | Fuel and resolve Ring passage | R1 |
| [N1](pc10-tickets/18-n1.md) | 550, 551, 552 | Nebula scouting, attempt and loss | None |
| [N2](pc10-tickets/19-n2.md) | 553, 554 | Nebula threshold and repeat lock | N1 |
| [A1](pc10-tickets/20-a1.md) | 555, 556 | Station arrival and repeated combat | None |
| [A2](pc10-tickets/21-a2.md) | 557, 558, 559 | Station liberation, Reactor and activation | A1 |
| [E1](pc10-tickets/22-e1.md) | 563, 564 | Explain results and enter debrief | D1 |
| [E2](pc10-tickets/23-e2.md) | 565, 566 | Authoritative closure and later debrief read | E1 |
| [L1](pc10-tickets/24-l1.md) | 618 | Session, seat and vessel reconnect | None |
| [L2](pc10-tickets/25-l2.md) | 618 | Workflow projection reconnect | None |
| [L3](pc10-tickets/26-l3.md) | 618 | Sparse roster and all-player clock recovery | L1, L2 |
| [T1](pc10-tickets/27-t1.md) | 620 | Stale action reconciliation | None |
| [T2](pc10-tickets/28-t2.md) | 620 | Stale recovery after station or roster change | T1 |
| [Y1](pc10-tickets/29-y1.md) | 619 | Ring retry after reconnect | D1, R2 |
| [Y2](pc10-tickets/30-y2.md) | 619 | Nebula retry after reconnect | D1, N2 |
| [Y3](pc10-tickets/31-y3.md) | 619 | Station retry after reconnect | A2, D1 |
| [Q1](pc10-tickets/32-q1.md) | 629 | Loyalty, Wolf and private-note audiences | None |
| [Q2](pc10-tickets/33-q2.md) | 629 | Organiser chart and navigation audiences | None |
| [Q3](pc10-tickets/34-q3.md) | 629 | Mission hands and hidden-outcome audiences | None |
| [U1](pc10-tickets/35-u1.md) | 630 | Server-owned dice and combat uncertainty | None |
| [U2](pc10-tickets/36-u2.md) | 630 | Server-owned cards, decks and clues | None |
| [B1](pc10-tickets/37-b1.md) | 631 | Fair limits for expensive actions | None |
| [B2](pc10-tickets/38-b2.md) | 634 | Private security-denial telemetry | U1, U2 |
| [J1](pc10-tickets/39-j1.md) | 635 | Queryable action receipt metadata | None |
| [J2](pc10-tickets/40-j2.md) | 635 | Private automatic-procedure receipts | J1 |
| [V1](pc10-tickets/41-v1.md) | 647 | Ring end-to-debrief proof | A2, E2, R2, Y1 |
| [V2](pc10-tickets/42-v2.md) | 648 | Nebula loss and success proof | E2, N2, Y2 |
| [V3](pc10-tickets/43-v3.md) | 649 | Station arrival-to-debrief proof | A2, E2, Y3 |
| [F1](pc10-tickets/44-f1.md) | 650 | Terminal pursuit and total-loss authority | E2 |
| [F2](pc10-tickets/45-f2.md) | 650 | Destroyed ship, pods and evacuation recovery | E2 |
| [F3](pc10-tickets/46-f3.md) | 650 | Interrupted control and candidate recovery | E2 |
| [G1](pc10-tickets/47-g1.md) | 641 | Base-game authentic setup and early loop | P1, P2, S1, S2, W1, W2, X1, X2 |
| [G2](pc10-tickets/48-g2.md) | 641 | Base-game combat through debrief | E2, G1 |
| [G3](pc10-tickets/49-g3.md) | 641 | Base-game sparse roster and GM concurrency | G2, L3, T2 |
| [H1](pc10-tickets/50-h1.md) | 642 | Expansion full-table setup and Scrap loop | C4, C5 |
| [H2](pc10-tickets/51-h2.md) | 642 | Expansion combat, jump and candidate path | C4, H1, V2 |
| [H3](pc10-tickets/52-h3.md) | 642 | Expansion recovery and GM concurrency | C4, H2, L3, T2 |
| [Z1](pc10-tickets/53-z1.md) | 651 | Reconcile candidate handbacks and criterion-level acceptance; preparation can start now | Final sign-off: A1, A2, B1, B2, C1, C2, C3, C4, C5, D1, D2, E1, E2, F1, F2, F3, G1, G2, G3, H1, H2, H3, J1, J2, L1, L2, L3, N1, N2, P1, P2, Q1, Q2, Q3, R1, R2, S1, S2, T1, T2, U1, U2, V1, V2, V3, W1, W2, X1, X2, Y1, Y2, Y3 |
| [Z2](pc10-tickets/54-z2.md) | 651 | Final candidate validation and verified release | F1, F2, F3, G1, G2, G3, H1, H2, H3, V1, V2, V3, Z1 |

The context sizing used the existing workspace consumer contracts, candidate
discovery and plan projection suites, native callable and debrief suites,
audience-specific rules tests, action-audit and rate-limit tests, and the
authenticated two-browser/member-GM proof helpers. Preparation does not establish
that any gameplay gate passed. The final audit aggregates the original 48 full
acceptances rather than treating these brief checklists as replacement criteria.

**Owner resumption, October 15:** The latest owner invocation of `implement-spec`
explicitly resumes the prior runtime pause under the existing fixed 48-ID PC10
scope. It adds no feature or redesign and grants no prompt-status or completion
credit. The root remains responsible for native allocations and release; human
playtesting remains optional. Earlier pause statements are preserved as historical
context.

## PC10 owner revision — October 5

The separate PC10 dispatch authorizes the revised shape and execution in
[PC10 execution record](PC10_EXECUTION_RECORD.md). Keep its fixed 48 assigned
closures and 751/751 endpoint, with real authenticated GM cycle 0→1, an
unlimited manually advanced full-game demo beside the existing single-cycle
demo, fresh-game every-role/function acceptance across two browsers,
claim-based overlapping/reconnect/retry/privacy checks, and explicit
action/cost/blocker/next-actor usability evidence. The October 7 owner correction
in [the execution policy](AGENT_EXECUTION_POLICY.md#risk-based-verification-for-remaining-checkpoints)
supersedes about-21-session defaults: use the smallest legitimate cohort for
the specific claim and reuse unaffected evidence. The October 8 correction
requires meaningful observed RED before every functional change, implementation
then GREEN. Risk governs test selection, breadth and depth, not permission to
implement first. Pure prose/docs use consistency review; report historical
timing gaps honestly and hold release of unvalidated functionality.
A 21-account run needs an explicit scale claim impossible with fewer or a
reproduced scale-dependent bug; untested capacity remains unclaimed.
Prepared scenes alone are insufficient. The primary Firebase Settings join QR
and full-game demo are explicit additions with zero fixed-catalog credit.
Preserve Cycle 0 AWAITING CIC AUTHENTICATION and its Settings GM-start explanation.

Record automated actors/browser concurrency separately from human device
playtesting. PC10 completion returns to the parent before existing post-PC10
work, then PC11 in-app cross-game rules guidance, then PC12 same-repository
Mac authoritative offline LAN backup. This supersedes earlier future-PC11
prohibitions; no later phase is executed by PC10. Firebase remains primary,
cloud data/deployment stay intact, and no cloud/offline synchronization is
implied. PC12 uses local identity/privacy/persistence/recovery, no runtime
internet dependencies, WAN-disconnected multi-client proof, and local QR for
user-entered Wi-Fi details and server URL. No credentials enter Git/reports,
and no unauthorized network-security setting change is allowed. The subsequent
owner authorization applies CC0 only to her own rights and contributions;
third-party/game material, dependencies, other contributors and assets with
unconfirmed provenance are excluded. Existing asset bytes and third-party
notices remain unchanged.

The October 13 [post-release colorblindness backlog](CHECKPOINT_COMPLETION_PLAN.md#post-release-colorblindness-backlog--october-13)
records an app-wide audit and optional Settings **“Don’t rely on color”** mode
with non-color cues and patterns after verified PC10 and the full app release.
Current release scope, PC10 acceptance, PC11 and the version 0.9 schedule remain unchanged.

## October 10 deadline and sequential PC11 handoff

The owner's October 5 steering sets **October 10** as the available work
window. Complete PC10 first, return it to the parent, then follow the existing
post-PC10 work and PC11 sequentially. The owner said “execute” for the
[PC10 to PC11 implementation lessons](PC10_PC11_HANDOFF.md): audit mounted
actions, explain actual current states and adjacent costs/blockers/next actors,
qualify small live slices, reuse scoped PC10 evidence, use exact accessible
controls and retain finite appropriate-role families. Apply these now to the
plan and at PC11's turn; do not start PC11 concurrently.

PC12 is unstarted and conditional; it has not been cancelled. The owner decides
on deferral or cancellation after a concrete reuse and service-boundary
assessment. Earlier coarse estimates are not a reliable schedule. Deadline
pressure does not weaken functionality, privacy, acceptance or release gates.
The linked handoff records the current evidence limits, critical path and
bounded offline architecture assessment.

## October 8 PC10 owner house-rule alignment

The owner's separate approval adopts five labeled gap-fillers in both app
and local canonical paper: reroll nonparticipating targets; recycle resolved
mission discards only when needed and leave undealable extras undrawn; track
split-group pursuit independently and adjudicate exceptional merges before
play; round unspecified half-losses down while retaining explicit exceptions;
and keep the unfinished optional Wolf Commander action unavailable until the
GM records its consequence. Preserve Capybara override. These are owner house
rules, not original-author intent; no default Commander consequence is added.
The [PC10 acceptance impact](PC10_PARITY_ACCEPTANCE_IMPACT.md#october-8-owner-approved-house-rules)
records boundaries and existing app/paper ownership. Meaningful functional
RED/GREEN, exact independent review and relevant final renders remain gates.
This aligns affected catalog acceptances without changing statuses or adding
closures. Existing post-PC10, PC11 and conditional PC12 stay sequential future
work.

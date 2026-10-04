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
The final game-completion gate includes the full-table twenty-player proof;
the owner is never responsible for recruiting or operating that table.

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
prepared presentation and public parent navigation. PC09 remains unstarted.

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

Ten runtime findings remain open: one P1 progression blocker, seven P2 defects
and two P3 stale acknowledgements. The catalog's existing PC09 criteria and
dependency links place the shared progression/carryover repairs first, durable
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

Authorized October 4 by the separate PC09 execution dispatch. Current main
opens at 654/751 and 196/293 campaign closures; the fixed 49-ID target is
703/751 and 245/293. The [execution record](PC09_EXECUTION_RECORD.md) fixes
five complete implementation groups, isolated checkouts, shared-file boundaries,
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
P605a remains separately owner-deferred pending explicit activation; the parent
owns that decision while independent work continues. Its deferral cannot lower
the fixed target or earn completion. Prepared solo review access is presentation
only. Required independent Sol review, final focused/responsive/release checks,
exact-candidate CI and production deployment remain separate from gameplay proof.
PC10 revision and later work remain outside this delivery.

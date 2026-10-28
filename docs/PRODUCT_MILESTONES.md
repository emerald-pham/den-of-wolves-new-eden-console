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

Triage: `ready-for-agent` for specification and handoff reconciliation under the
[existing tracker mapping](agents/triage-labels.md). Gameplay execution retains
the separate PC10 pause until explicit resumption; this specification does not
mark all remaining prompts runnable. The [owner decision record](PRODUCT_MILESTONE_FEEDBACK.md#campaign-resumption-preferences-and-tracker-routing--2026-10-15)
captures the conversation. This is a cross-cutting specification for existing
work, not a new prompt or an additional checkpoint.

### Problem Statement

The owner wants progress toward the completed game without managing agents,
repeating settled decisions, operating gameplay tests, or reviewing intermediate
work. Work has existing prompt definitions, unfinished proof and a paused PC10
handoff; starting another backlog or rebuilding accepted work would lose context
and increase owner involvement.

### Solution

Reconcile the existing campaign and paused handoff, then execute authorized
remaining scope with agents accountable for implementation, repair, proportionate
testing, integration and verified release. Preserve agreed gameplay and
presentation. Supply an optional playable review result and concise evidence;
owner participation in a walkthrough is not a completion prerequisite.

### User Stories

1. As the product owner, I want the existing campaign finished before new features or redesigns, so that the agreed game reaches completion.
2. As the product owner, I want previous decisions preserved, so that I do not have to repeat settled requirements.
3. As the product owner, I want execution to be hands-off, so that progress does not depend on my availability.
4. As the product owner, I want agents to verify gameplay correctness, so that I do not have to operate the test table.
5. As the product owner, I want optional playable review access, so that I can inspect the finished experience when available.
6. As the product owner, I want only concrete owner-only blockers escalated, so that routine choices do not interrupt me.
7. As the product owner, I want truthful completion counts, so that preparation and partial implementation cannot be mistaken for delivery.
8. As the product owner, I want current prompts used as the tracker, so that planning remains in one place.
9. As the product owner, I want sensible test boundaries, so that verification catches meaningful failures without unnecessary repeated work.
10. As a returning player, I want interrupted actions to recover correctly, so that retries or disconnects do not lose progress or repeat costs.
11. As an entitled player, I want the existing role and vessel workflows to compose, so that the full game can be played through ordinary controls.
12. As an entitled player, I want private information to remain audience-restricted, so that gameplay does not expose another role's secrets.
13. As a facilitator, I want a real authenticated setup and Cycle 0 to 1 transition, so that the walkthrough proves the actual start path.
14. As a facilitator, I want automated calculations and committed results preserved, so that I only supply genuine choices and rulings.
15. As a player, I want the assigned Ring, Nebula and Station outcomes to work through debrief, so that an ending is a complete gameplay path.
16. As a player, I want terminal failure and recovery paths to remain authoritative, so that play cannot become orphaned behind a label.
17. As a mobile or keyboard player, I want critical controls and results reachable, so that the complete game remains usable on supported layouts.
18. As a future task owner, I want the exact candidate, failures and resume conditions preserved, so that accepted work can be continued safely.
19. As the product owner, I want release and gameplay evidence distinguished, so that deployment success is not mistaken for functional proof.
20. As the product owner, I want a pause respected until execution is resumed, so that planning cannot unexpectedly restart a controlled runtime.

### Implementation Decisions

- Retain the canonical prompt catalog, fixed checkpoint membership and existing acceptance definitions. No new prompt, schema, API or gameplay mechanic is introduced by this specification.
- Reconcile current branch ancestry, active work, owner decisions and the paused task's exact handoff before implementation. Preserve accepted slices and outstanding proof gaps; age alone does not invalidate another task's ownership.
- Keep one top-level checkpoint owner accountable for every acceptance and the final release. Use bounded implementation groups and required independent risk review under current repository policy.
- Finish existing campaign scope before considering new features or redesigns. PC10 retains its fixed 48-ID target and the existing 751-prompt endpoint; historical snapshots remain historical.
- Preserve specialist, Capybara, candidate-ending, debrief and cross-path recovery obligations already assigned to PC10. No added user story expands those prompts beyond their existing criteria.
- Use ordinary authenticated local/emulator gameplay for functional acceptance. Preserve the existing every-role, two-browser, unlimited-timer, authentic GM start and full twenty-player obligations.
- Owner walkthroughs and written feedback remain optional. Source-backed routine decisions belong to agents; a concrete owner-only decision retains its explicit escalation path.
- Reconcile post-campaign sequence from current explicit owner decisions before scheduling it. This specification does not resolve conflicting historical sequence records by inventing a new checkpoint.
- Preserve the separate PC10 pause. Specification readiness is distinct from runtime authorization, dependency readiness and completion.

### Testing Decisions

- Test observable behavior at the highest boundary that can meaningfully distinguish correct behavior from the relevant failure. Prefer existing seams; introduce no test framework or mandatory all-purpose harness.
- For an isolated calculation or state transition, use focused existing domain tests with meaningful inputs and outcomes. Do not require two browsers to prove a pure calculation.
- For a transaction, resource cost, replay or lifecycle repair, use existing native callable/lifecycle tests to prove committed outcomes, denied actors, retries and recovery. Use Firestore rules tests where read audiences or direct-write restrictions are involved.
- For a route, multi-actor interaction or authenticated recovery contract, use the existing member/GM lifecycle and two-browser gameplay helpers through ordinary UI paths. A synthetic presenter state cannot prove these contracts.
- Use responsive browser checks for affected layout, keyboard, motion, geometry and navigation behavior. Retain required typography and other release checks without repeating unrelated rendered matrices for an isolated nonvisual repair.
- Run focused checks while repairing each behavior. Run the required reconciled checkpoint validation, full-table/game-loop/ending proof and release checks at the appropriate acceptance boundary. Repeat a broader gate only for a failure, material candidate/upstream change or unresolved concern.
- Existing prior art includes session lifecycle and debrief callable suites, audience-specific Firestore rules suites, member/GM lifecycle proof helpers, the two-browser gameplay harness and the typography browser gate.
- Preserve discriminating failure evidence and required test-first commits for new behavior. Validate the actual result, authorization, resource persistence and recovery rather than merely mirroring internal implementation calls.
- Report local unit/native/HTTP/UI/rules evidence, rendered QA, independent review, CI, deployment and any actual production gameplay separately. Checkpoint closure still requires every assigned criterion and its evidence.
- The owner's test-boundary feedback was “we need sensible test boundaries.” Apply the proportionate boundaries above rather than one expensive end-to-end check for every change.

### Out of Scope

New features, redesigns, a second issue tracker, changed checkpoint allocation,
a new triage status in the catalog, weakened acceptance or security checks,
mandatory owner playtesting, automatic PC10 runtime restart, and ungranted
0.9.x/1.0.0 version authorization. Post-campaign sequence conflicts remain for
source-backed reconciliation rather than new scope in this specification.

### Further Notes

The checked-in catalog at specification time records 703/751 done, six partial
and 42 missing. This is a local planning snapshot, not a fresh production or
remote-main verification. This document earns no closure credit. Refresh the
current catalog and exact task handoff when execution is resumed; prepared or
unrun slices retain their original proof limits.

## Approved bounded execution tickets — 2026-10-15

The owner approved revising and publishing the context-bounded decomposition.
These briefs subdivide the existing 48 PC10 IDs; they add no prompts, change no
acceptance or completion status, and introduce no separate ticket-status ledger.
The October 16 smaller-release plan below supersedes the original single
PC10 release packaging and updates only the unfinished execution briefs.
Each catalog row links its own briefs through planning evidence.

Triage is `ready-for-agent` for the approved specification. Dependency readiness
and runtime authorization remain separate: PC10 remains paused. Existing hard
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
| [V2](pc10-tickets/42-v2.md) | 648 | Nebula loss and success proof | E2, N2, Y2, H2 |
| [V3](pc10-tickets/43-v3.md) | 649 | Station arrival-to-debrief proof | A2, E2, Y3 |
| [F1](pc10-tickets/44-f1.md) | 650 | Terminal pursuit and total-loss authority | E2 |
| [F2](pc10-tickets/45-f2.md) | 650 | Destroyed ship, pods and evacuation recovery | E2 |
| [F3](pc10-tickets/46-f3.md) | 650 | Interrupted control and candidate recovery | E2; F3A for aggregate P650 accounting |
| [G1](pc10-tickets/47-g1.md) | 641 | Base-game authentic setup and early loop | PT2A before affected long run; inherited prerequisites |
| [G2](pc10-tickets/48-g2.md) | 641 | Base-game combat through debrief | E2, G1 |
| [G3](pc10-tickets/49-g3.md) | 641 | Base-game sparse roster and GM concurrency | G2, L3, T2 |
| [H1](pc10-tickets/50-h1.md) | 642 | Expansion full-table setup and Scrap loop | C4, C5 |
| [H2](pc10-tickets/51-h2.md) | 642 | Expansion combat, jump and candidate path | C4, H1, N2, Y2 (same-session V2 handoff) |
| [H3](pc10-tickets/52-h3.md) | 642 | Expansion recovery and GM concurrency | C4, H2, L3, T2 |
| [Z1](pc10-tickets/53-z1.md) | 651 | Reconcile campaign acceptance and review evidence | A1, A2, B1, B2, C1, C2, C3, C4, C5, D1, D2, E1, E2, F1, F2, F3, G1, G2, G3, H1, H2, H3, J1, J2, L1, L2, L3, N1, N2, P1, P2, Q1, Q2, Q3, R1, R2, S1, S2, T1, T2, U1, U2, V1, V2, V3, W1, W2, X1, X2, Y1, Y2, Y3 |
| [Z2](pc10-tickets/54-z2.md) | 651 | Final candidate validation and verified release | F1, F2, F3, G1, G2, G3, H1, H2, H3, V1, V2, V3, Z1 |

The context sizing used the existing workspace consumer contracts, candidate
discovery and plan projection suites, native callable and debrief suites,
audience-specific rules tests, action-audit and rate-limit tests, and the
authenticated two-browser/member-GM proof helpers. Preparation does not establish
that any gameplay gate passed. The final audit aggregates the original 48 full
acceptances rather than treating these brief checklists as replacement criteria.

## Approved proof-tooling repair tickets — 2026-10-16

The owner approved five independent repairs following the retrospective of
session `01a1446d-0b24-7521-b204-dd366b37ee3b` (Implement PC10 Spec).
The owner subsequently requested the CI classification repair as the sixth
item and a move to GitHub Issues as the seventh. The tracker migration is
planned work: the current catalog remains authoritative until PT7 verifies
the import and completes its cutover.
Each brief is one verifiable tooling behavior within existing prompt support;
publication preserves the 751-prompt endpoint, fixed checkpoint membership,
parent acceptance, completion states and canonical prerequisite graph.

| Brief | Existing prompt scope | Outcome | Blocked by briefs |
|---|---|---|---|
| [PT1](pc10-tickets/55-pt1.md) | 651 | Test failures retain their exit status after diagnostics | None |
| [PT2](pc10-tickets/56-pt2.md) | 641, 642, 649, 651 | Focused PC10 consumer regressions run locally and in CI before long rehearsals | PT2A, PT2B, PT2C for combined check set |
| [PT3](pc10-tickets/57-pt3.md) | 641, 642, 649, 651 | Shared role-entry results and affected consumers receive automatic type checks | None |
| [PT4](pc10-tickets/58-pt4.md) | 660, 651 | Emulator allocation survives interleaved startup and returns only owned resources | None |
| [PT5](pc10-tickets/59-pt5.md) | 651, 660 | Scoped runtime summaries retain detailed diagnostics on disk | None |
| [PT6](pc10-tickets/60-pt6.md) | 651 | Generated roadmap artifacts receive the appropriate CI classification; implemented in PR 25 and retained | Completed carry-forward |
| [PT7](pc10-tickets/61-pt7.md) | 651 | Work tracking moves to GitHub Issues with verified history and dependency preservation | PT7B; inventory/import split below |

PT1, PT3, PT4 and PT5 can start independently; PT6 is implemented upstream. PT2 now consumes the bounded
PT2A/PT2B/PT2C family results; PT7 follows inventory PT7A and verified import
PT7B. Shared invocation, registry or CI files require edit coordination rather
than additional blocking edges. PT5
can use existing ownership records without waiting for PT4. No separate
prefactor is required; each owner keeps any necessary preparation within its
complete behavior and fresh-context boundary.

PT7's cutover consumes a verified source snapshot and settled tracker writes.
Existing reader interfaces can consume a generated catalog snapshot after
cutover; GitHub Issues becomes the writable tracking authority. Preparation
can proceed independently, while incomplete migration keeps the existing
tracker intact.

The briefs are ready for approved tooling preparation. Parent gameplay and
release closure prerequisites remain intact, and PC10's separate runtime
stopping point remains in force. Reconcile retained PC10 consumers with the
candidate without importing unrelated in-progress gameplay work. P660's
historical done status is preserved while its bounded allocator repair is
tracked through planning and subsequent implementation evidence.

Use the existing validation paths and required risk review for actual changes.
Publication records approval and earns no test, gameplay or release credit.


## PC10 smaller playable releases — 2026-10-16

The owner asked to update the existing unfinished tickets from the implemented
retro and current handoff, split PC10 into small PC10.x checkpoints, and make
each checkpoint a **playable release**. The owner also requested equally small
future work, paused this planning until the retro merged, then explicitly said
“continue”. This authorizes this backlog update. It does not launch a gameplay
runtime, resume parked workers or publish the unfinished product branch.

PC10 remains the umbrella for its **same 48 IDs and 751/751 endpoint**. The
subcheckpoints change delivery size, not acceptance, status or scope. Each
release completes its bounded ticket criteria with appropriate native proof;
a shared prompt remains partial until every one of its criteria is met.
Completed evidence is carried forward after relevant source comparison.

Most releases have 6–10 tickets. PC10.7 has three deliberately substantial
continuous-game tickets; splitting their runtime between checkpoints would lose
the required same-game proof. Ticket count is a sizing aid: one ticket owns one
bounded end-to-end behavior through repair, focused checks and handoff in one
fresh context. Split a newly discovered oversized repair before implementation.

### Sources and retained evidence

Published main was inspected at `3d2aa541` after merged retro PRs 19, 20 and 23.
Its proof preflight, real Red Alert selector smoke, bounded browser teardown,
consolidated guidance and guarded branch closeout already exist. Reuse them.
PRs 21/22 originally published PT1–PT7 as planned repairs. While this planning
candidate was in CI, main advanced to `a7895711` (PR 25), implementing PT6 and
preserving its completed checklist and evidence. PT6 is now carry-forward
work, not an unfinished ticket. Other queued follow-ups stay open. The same
upstream decision requires each new test to protect a distinct failure, allows
evidence-backed consolidation of redundant/internal-only checks, and preserves
meaningful gameplay/privacy/authority coverage and mandatory rendered typography.

The product handoff is preserved at local Git commit
`aa9dca780bcc6a4482347143ca855181749c36c4` on
`integration/pc10-implementation-20261015`, specifically its existing
`docs/PC10_PC11_HANDOFF.md` October 16 stopping point, execution record and
acceptance reports. These product-only records are not all published on main;
read them from that exact commit rather than treating an absent main file as
lost work. No product source or private reference is copied by this update.

| Retained result | Exact limit and next work |
|---|---|
| Candidate discovery/preparation at `84dc3c4e` | Keep original Endeavour discovery/reload/retry and Cycle 6 plan/help. Other producers and foreign audiences remain explicit. |
| Ring at `1cccdb6c`, passage recovery `522447d4`, negatives `39b5a43d` | Keep actual paid Ring success and displayed ending. The outer private/public observer timeout remains failed; source/fake-transaction negatives are not emulator contention. Preserve P647’s explicit P559 prerequisite. |
| F2 at `2c2acd10` | Accepted bounded evacuation/destruction/replacement and sparse mutiny through Pursuit close/history. F2 is retained, excluded from the unfinished queue. P650 is still partial. |
| Natural lease at `040e8ac2` / `b59cd84f` | Keep real elapsed lease/clock pause/resume with eight active SDK players plus GM, zero browsers. Remaining browser/role recovery is separate. |
| Unfinished candidate `b000cbe3` / root `42910152` | Keep one paid contribution, original reload/exact replay and enabled next-cycle action. No refund/abandon endpoint, ending or all-F3 claim. |
| Base `aa1ff968` plus ordering repair `c86f9f5b` | Keep research, six paid maintenance sequences and opening combat. Whole run failed at the source population alert; repair is focused-green, not a fresh full-game pass. |
| Capybara prefixes, latest failed `75ff4b8b` | Keep seven-ship maintenance/production, real role entry and opening combat within their actual sessions. PT2B must diagnose the visible-alert/original-GM source mismatch before a new affected run. No Nebula/ending credit. |
| Station `0fd09f51` / root `c8591ac7` | Preserve implemented, test-first authenticated-read repair and paid-arrival/declaration prefixes. Attempt 7 was cancelled before launch; liberation, Reactor recovery and ending remain native gaps. |

The published catalog remains 703 done / 6 partial / 42 missing; the preserved
product candidate records 703 done / 27 partial / 21 missing. These are distinct
source snapshots. Planning neither resets the candidate nor promotes unmerged
candidate evidence into new published completions. Z1A reconciles them at each
actual integration boundary. All 48 PC10 closures remain unfinished here.

### Release grouping

Release numbers describe owner-facing playable increments, not extra campaign
prompts or an independent completion ledger. Code-only preparation can proceed
at a genuinely ready frontier; the plan does not impose a serial lock on every
ticket. Reconcile each product release with its settled predecessor and the
current main. Do not import unproved later functionality just to publish a
smaller checkpoint.

| Checkpoint | Playable outcome | Tickets | Count | Genuine dependency boundary |
|---|---|---|---:|---|
| **PC10.1 — Scientist and Explorer fieldwork** | Research, scout, harvest and use private candidate preparation through ordinary controls. | [S1](pc10-tickets/03-s1.md), [S2](pc10-tickets/04-s2.md), [X1](pc10-tickets/05-x1.md), [X2](pc10-tickets/06-x2.md), [D1](pc10-tickets/14-d1.md), [D2](pc10-tickets/15-d2.md), [PT1](pc10-tickets/55-pt1.md), [PT2A](pc10-tickets/56a-pt2a.md), [PT3](pc10-tickets/57-pt3.md) | 9 | Existing catalog prerequisites; PT2A before the affected Base rehearsal. |
| **PC10.2 — Wing, PDF and expansion actions** | Operate wings, boarding and missions, then use Macaw/Boa/Scrap with truthful outcomes. | [W1](pc10-tickets/01-w1.md), [W2](pc10-tickets/02-w2.md), [P1](pc10-tickets/07-p1.md), [P2](pc10-tickets/08-p2.md), [C1](pc10-tickets/09-c1.md), [C2](pc10-tickets/10-c2.md), [C3](pc10-tickets/11-c3.md), [PT2B](pc10-tickets/56b-pt2b.md) | 8 | Existing mechanic prerequisites; PT2B preserves the current Sol diagnosis owner. |
| **PC10.3 — Resilient private sessions** | Recover current seats, drafts, projections and clocks while keeping private audiences separate. | [L1](pc10-tickets/24-l1.md), [L2](pc10-tickets/25-l2.md), [L3](pc10-tickets/26-l3.md), [T1](pc10-tickets/27-t1.md), [T2](pc10-tickets/28-t2.md), [Q1](pc10-tickets/32-q1.md), [Q2](pc10-tickets/33-q2.md), [Q3](pc10-tickets/34-q3.md), [PT4](pc10-tickets/58-pt4.md) | 9 | Each recovery follows its own current source contract; L3 consumes L1/L2 and T2 consumes T1. |
| **PC10.4 — Fair automatic actions and receipts** | Use server-owned randomness and automatic procedures with private attributable results and fair limits. | [U1](pc10-tickets/35-u1.md), [U2](pc10-tickets/36-u2.md), [B1](pc10-tickets/37-b1.md), [B2](pc10-tickets/38-b2.md), [J1](pc10-tickets/39-j1.md), [J2](pc10-tickets/40-j2.md), [PT5](pc10-tickets/59-pt5.md) | 7 | B2 retains U1/U2 and canonical P630; J2 consumes J1. PT5 does not wait for PT4. |
| **PC10.5 — Station liberation and closed history** | Arrive at the Station, resolve repeat attacks, contribute Reactor power, activate and recover debrief/history. | [A1](pc10-tickets/20-a1.md), [A2](pc10-tickets/21-a2.md), [Y3](pc10-tickets/31-y3.md), [V3](pc10-tickets/43-v3.md), [E1](pc10-tickets/22-e1.md), [E2](pc10-tickets/23-e2.md), [PT2C](pc10-tickets/56c-pt2c.md), [PT2](pc10-tickets/56-pt2.md) | 8 | D1 for candidate recovery, A1→A2→Y3/V3, E1→E2. PT2 composes its independent A/B/C consumers. |
| **PC10.6 — Ring, Nebula and terminal recovery** | Use Ring passage and Nebula mechanics and recover terminal/arrest/ruling branches. | [R1](pc10-tickets/16-r1.md), [R2](pc10-tickets/17-r2.md), [Y1](pc10-tickets/29-y1.md), [V1](pc10-tickets/41-v1.md), [N1](pc10-tickets/18-n1.md), [N2](pc10-tickets/19-n2.md), [Y2](pc10-tickets/30-y2.md), [F1](pc10-tickets/44-f1.md), [F3](pc10-tickets/46-f3.md), [F3A](pc10-tickets/46a-f3a.md) | 10 | D1, Station P559/A2 and E2 remain required where recorded; R1→R2→Y1/V1 and N1→N2→Y2. |
| **PC10.7 — Complete Base game** | Play one authentic full Base game through debrief, with required sparse-roster recovery and optional GM races. | [G1](pc10-tickets/47-g1.md), [G2](pc10-tickets/48-g2.md), [G3](pc10-tickets/49-g3.md) | 3 | Affected role mechanics, E2, L3/T2 and focused PT2A/PT2 checks must be ready for the corresponding claims. |
| **PC10.8 — Complete Capybara game and Nebula ending** | Play the full expansion composition and the same-session Nebula loss/recovery/success/debrief. | [C4A](pc10-tickets/12a-c4a.md), [C4B](pc10-tickets/12b-c4b.md), [C4](pc10-tickets/12-c4.md), [C5](pc10-tickets/13-c5.md), [H1](pc10-tickets/50-h1.md), [H2](pc10-tickets/51-h2.md), [H3](pc10-tickets/52-h3.md), [V2](pc10-tickets/42-v2.md) | 8 | C1/C2/C3, N2/Y2, E2, L3/T2 and repaired PT2B/PT2 consumers; keep the internal full-game sequence together. |
| **PC10.9 — Final game release and tracker handoff** | Release the reconciled complete game and verified evidence; prepare/import/cut over the requested tracker safely. | [Z1A](pc10-tickets/53a-z1a.md), [Z1](pc10-tickets/53-z1.md), [Z2](pc10-tickets/54-z2.md), [PT7A](pc10-tickets/61a-pt7a.md), [PT7B](pc10-tickets/61b-pt7b.md), [PT7](pc10-tickets/61-pt7.md) | 6 | Z1A and PT7A can prepare early. Final Z1/Z2 require all original acceptances; tracker cutover requires PT7B verification and settled writes. |

F2 and implemented PT6 remain carry-forward work outside these 68 unfinished briefs.
PT2A/B/C, F3A, Z1A and PT7A/B refine existing tickets; they are not new prompts.
PT7 inventory can proceed early, and cutover waits for a settled verified import.
Tracker migration does not gate a player action or authorize an extra game run.
The currently configured catalog remains authoritative until cutover succeeds.

### Playable release and proof contract

Each added check must protect a distinct failure; extend existing coverage where
practical. Consolidate or retire redundant/internal-only checks only with
evidence of the surviving required protection; never delete a failing check
merely to make the candidate pass. Apply this to every prepared future brief.

Each PC10.x release has one reconciled candidate, appropriate focused checks,
required independent authority/privacy review, independent actual-build
typography review, supported responsive/keyboard/navigation checks, version and
concise changelog, exact-candidate CI and verified exact-main deployment. Reuse
accepted unaffected evidence and existing gates. The one-candidate batching rule
now applies to **each PC10.x release**, rather than holding every increment for
one large PC10 release; it still forbids a CI/release cycle per worker or ticket.
Published releases are independently playable, with a numbered optional solo
tour and honestly labeled prepared states. Prepared tours do not prove gameplay.
0.9.x and 1.0.0 keep their separate owner-authorization boundaries.

The owner’s one-sitting checks for each release are:

- **PC10.1:** Can I perform research/scouting/harvesting, see the real cost and private result, return to my chooser and recover the same result after reload?
- **PC10.2:** Can I follow a wing or boarding action and a legal salvage/reclamation action from available control to paid result, with a clear denied/retry state?
- **PC10.3:** Can I return after dropout, recover my legal station/draft/result, understand a stale-action retry and keep other roles’ private information hidden?
- **PC10.4:** Can I make a supported automatic action, see the result/cost/retry or limit, and have an entitled GM recover its original private procedure receipt?
- **PC10.5:** Can I follow Station attack, liberation and contribution to activation, recover an interrupted payment once, then close and read the entitled debrief?
- **PC10.6:** Can I understand passage fuel and a committed candidate outcome, recover a loss or interrupted ruling/arrest, and see the legal next action or real ending?
- **PC10.7:** Can one facilitator run the normal Base setup, maintenance, movement, scout, mission, combat, deduction and crisis through a genuine ending without manual calculation?
- **PC10.8:** Can the real expansion roster use both roles, Scrap, d8 targeting, mission, combat and jump, then recover the same Nebula game through success and debrief?
- **PC10.9:** Does the released complete game match the optional numbered solo tour and true catalog totals, with usable guidance, no placeholder control and verified deployment?

Full Base G1→G2 and the C4A→C4B→C4/H1→H2 Capybara composition stay within
their respective same fresh authenticated sessions and releases. If stopped,
retain the exact failure and strict owned-resource return; a later allocation
must recreate a fresh valid sequence or resume an actually retained session.
Do not stitch unrelated successful prefixes into continuous-game evidence.
Sparse/recovery and optional-GM claims use the smallest cohort that proves them;
full-table obligations remain where explicitly required. Report Auth accounts,
active players, browsers, humans and physical devices separately.

### Focused checks before another long gameplay run

Use the merged `npm run test:proof-preflight` first. For actual Red Alert
controls/selectors, also use `npm run test:proof-redalert-browser` with the locked
Playwright Chromium already installed, or install it through the existing
managed-browser step. Neither command allocates emulators; the browser smoke
is an inert consumer check, not gameplay or complete rendered acceptance.

The next affected run also requires its bounded **actual consumer** checks:

| Run family | Checks required before allocating its long runtime | Stop condition |
|---|---|---|
| Base / PT2A / G1–G2 | Existing election GM return/ballot-delayed-mount checks; actual role-entry actor-versus-live-snapshot contract; maintenance/research readiness; source interruption before governance. | Any relevant navigation/readiness/order check fails, or the original-source next action is not explained. |
| Capybara / PT2B / C4–H2 | Meaningful RED then repair for attempt-7 alert/GM matching; existing Capybara consumer, actor/cache isolation, current combat choice and same-session Nebula original-actor loss/reload/retry checks. | The visible source alert still has no exact original-GM match; no new long setup for diagnosis. |
| Station / PT2C / A1–V3 | Retained current-cycle Station attack sequence; single authenticated choice read and closed-boarding preservation; contribution lost-ack/reload/exact replay; entitled private ending and actual dialog Continue. | Any identity/App/Auth/App Check/document/deadline or contribution-result check fails. Cancelled old plan remains unusable. |
| Changed specialist callable | Existing actual-handler fresh-action denial after applicable actor/home/current-host settlement, transaction-race denial and exact committed replay after settlement, plus foreign/payload/receipt negatives. | Failed authority/replay check; do not substitute a final-state fixture for its real consumer transition. |

At preserved candidate `aa9dca78`, the relevant retained files include
`pc10-election-gm-navigation.browser.test.mjs`,
`pc10-base-maintenance-readiness.browser.test.mjs`,
`pc10-base-research-readiness.browser.test.mjs`,
`pc10-political-crisis-arrest-proof.test.mjs`,
`pc10-capybara-full-gameplay.test.mjs`,
`pc10-capybara-nebula-continuation.test.mjs`,
`pc10-candidate-station-ui-proof.recovery.test.mjs` and
`test-pc10-combat-single-server-reinspection.mjs`, all under `scripts/`.
Reconcile only the selected family into the intended candidate; run its Node
checks with `node --experimental-vm-modules --test` and the selected real files.
Some are still candidate-only. A missing module or fixture/setup import is a
preflight failure, not meaningful gameplay RED. PT2 keeps the selected commands
maintained in existing local/CI entry points; PT3 supplies its real compiler
negative control rather than a new imaginary typecheck command.

After those pass, qualify a changed role/action in a small legitimate native
setup where necessary before the full sequence. New functional repairs retain
observed meaningful RED in a separate test-only commit, then GREEN. Green tests
and builds are not native acceptance. Before an authorized allocation, use the
[existing proof-tooling guide](agents/proof-tooling.md) to bind checkout/commit, complete compiled import
tree, helpers, served environment, original actors, project/ports, processes and
original work/return deadlines. Freeze inputs until strict return; keep the
primary failure, inspect owned descendants/listeners, and release only owned
resources. No stale plan or deadline is reused.

### Future work uses the same small-release shape

The following briefs prepare existing scope only. They add no campaign prompt,
mechanic or deadline, start no implementation and do not expand authorization.
At activation, reconcile the final PC10 handoff, affected source and current
owner decisions. Every ticket maps a mounted control through authoritative
request/result/recovery; split any overlarge concrete gap before building.
Independent preparation is not permission to run later checkpoints concurrently.

PC11’s earlier eleven-component live-base guidance extraction and accepted
normal-flow/rendered evidence already shipped in 0.5.71 (PR 16). Preserve that
work and its historical limitations. PC11.x below covers **remaining** cross-game
guidance against the completed PC10 behavior, not a rebuild of that extraction.
PC12 remains unstarted and conditional on the owner’s concrete architecture
assessment/activation decision; its plan is not an emulator-as-product security
claim. Firebase stays primary, cloud data/deployment intact, no cloud/LAN sync
is implied, and no Wi-Fi credential is committed or network security changed.

| Prepared checkpoint | Playable/review outcome | Tickets | Count | Original dependency or trigger |
|---|---|---|---:|---|
| **PC11.1** | Remaining movement, resources and scouting guidance | [GUI1](future-tickets/gui1-understand-ordinary-movement-and-jump-choices.md), [GUI2](future-tickets/gui2-understand-resource-and-trade-handoffs.md), [GUI3](future-tickets/gui3-understand-scouting-and-discovery-results.md) | 3 | After PC10 and the existing eligible post-PC10 handoff; preserve released 0.5.71 extraction. |
| **PC11.2** | Remaining specialist, mission and combat guidance | [GUI4](future-tickets/gui4-understand-research-and-specialist-choices.md), [GUI5](future-tickets/gui5-understand-maintenance-and-mission-steps.md), [GUI6](future-tickets/gui6-understand-combat-wings-and-boarding.md) | 3 | At PC11’s sequential turn; reconcile actual mounted action/source availability before copy. |
| **PC11.3** | Private-action and candidate guidance | [GUI7](future-tickets/gui7-understand-private-political-and-wolf-actions.md), [GUI8](future-tickets/gui8-understand-ring-nebula-and-station-preparation.md), [GUI9](future-tickets/gui9-understand-endings-and-entitled-debrief-history.md) | 3 | Uses the completed PC10 mechanics and private result boundaries, not new mechanics. |
| **PC11.4** | Recovery guidance and complete cross-game tour | [GUI10](future-tickets/gui10-understand-waiting-stale-and-recovery-states.md), [GUI11](future-tickets/gui11-read-and-navigate-the-complete-guidance.md), [GUI12](future-tickets/gui12-complete-the-remaining-cross-game-guidance-tour.md) | 3 | GUI12 consumes the earlier remaining guidance; preserve current source-bound accepted work. |
| **PC12.1** | Conditional local playable slice | [OFF1](future-tickets/off1-start-the-local-game-host-without-wan.md), [OFF2](future-tickets/off2-join-locally-with-private-player-and-gm-authority.md), [OFF3](future-tickets/off3-commit-one-authoritative-local-action.md) | 3 | Unstarted; owner architecture/activation decision after the earlier sequence. |
| **PC12.2** | Conditional durable local recovery | [OFF4](future-tickets/off4-recover-durable-local-play-after-host-restart.md), [OFF5](future-tickets/off5-reconnect-the-original-local-player.md), [OFF6](future-tickets/off6-resolve-concurrent-local-actions-once.md) | 3 | OFF3 authoritative local slice; use its actual store/identity/transport. |
| **PC12.3** | Conditional remaining local game parity | [OFF7](future-tickets/off7-play-local-movement-and-mission-workflows.md), [OFF8](future-tickets/off8-play-local-combat-and-private-role-workflows.md), [OFF9](future-tickets/off9-finish-local-candidate-and-terminal-paths.md) | 3 | Local durability, reconnect and concurrent mutation contracts are ready. |
| **PC12.4** | Conditional LAN join and offline complete game | [OFF10](future-tickets/off10-join-the-local-host-from-its-qr.md), [OFF11](future-tickets/off11-complete-a-wan-disconnected-multi-client-game.md), [OFF12](future-tickets/off12-release-the-qualified-local-backup.md) | 3 | Full source parity, local QR and disconnected multi-client proof before backup release. |
| **ACCESS.1** | Optional non-color shared states | [ACCESS1](future-tickets/access1-audit-color-only-information.md), [ACCESS2](future-tickets/access2-choose-don-t-rely-on-color-in-settings.md), [ACCESS3](future-tickets/access3-read-shared-states-without-color.md) | 3 | Deferred until verified PC10 and full-app release; no 0.9 delay or PC11 reopening. |
| **ACCESS.2** | Optional non-color game displays | [ACCESS4](future-tickets/access4-read-map-and-dradis-meaning-without-color.md), [ACCESS5](future-tickets/access5-read-remaining-game-outcomes-without-color.md), [ACCESS6](future-tickets/access6-verify-and-release-complete-non-color-coverage.md) | 3 | ACCESS audit and optional mode; finish the existing app-wide coverage. |
| **POST-ALERT.1** | Real-play Wolf-alert review | [ALERT1](future-tickets/alert1-review-the-wolf-alert-after-real-play.md), [ALERT2](future-tickets/alert2-apply-or-record-the-bounded-alert-decision.md) | 2 | After 1.0 AND actual real play. This review is not moved ahead of its trigger. |


Each PC11.x and activated PC12.x increment is a playable release, with the same
bounded implementation and release contract as PC10.x. Smaller future ticket
counts reflect their still-unvalidated service/guidance boundaries; they are
not permission to hide a broad implementation inside a short title. At shaping,
resolve concrete architecture and split oversized work before committing code.

Preserve the existing order: finish PC10, reconcile existing eligible post-PC10
work, then the remaining PC11 scope, then conditional PC12. Triggered deferred
items are not unconditional blockers: the Wolf-alert review still waits for
both 1.0 and real play; the color work follows verified PC10/full-app release
without delaying 0.9 or reopening PC11. The earlier October 10 date is historical,
not a new delivery promise. Retain the limited CC0 rights/provenance exclusions,
unchanged third-party assets/notices and the separate local-paper owner; this
planning does not publish source material or broaden a license.

## Approved smallest execution refinements on October 28

The owner requested the smallest independently verifiable units and explicitly approved hands-off publication. [The complete numbered refinement](EXECUTION_REFINEMENTS.md) and [its generated dependency chart](EXECUTION_REFINEMENT_DEPENDENCIES.md) subdivide the existing open PC10 and held-future briefs. They preserve the fixed 48-ID PC10 scope, 751-prompt endpoint, accepted source-bound evidence, existing release sequence, gameplay pause and every future hold. The children do not activate future mechanics or grant a restricted version.

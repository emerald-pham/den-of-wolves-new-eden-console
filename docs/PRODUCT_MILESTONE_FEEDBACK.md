# Playtest checkpoint feedback

This is the record of the product owner's UI review by playing the app, not a
gameplay-rules, test, or source-code review. Record notes on layout, wording,
navigation, visible states, and any suggested change the owner raises. The
next checkpoint shape must read every received note and state
its disposition in [Product Milestones](PRODUCT_MILESTONES.md). Written UI
feedback and walkthrough answers are optional. Explicit owner authorization is
sufficient checkpoint acceptance and must be recorded here; silence alone is
not authorization. If no feedback has arrived, record that fact in the next
shape and continue; do not wait.

Before each next checkpoint, complete the
[owner-decision alignment](PRODUCT_MILESTONES.md#owner-decisions-before-the-next-checkpoint).
Record the decision source/date, affected prompt IDs and checkpoints, actual
planning changes, and latest owner message reviewed. Update every affected
future criterion; a feedback entry or next-shape mention alone is insufficient.

For each authorization or review, append an entry with:

- milestone ID, build/version, date, authorization state, and any owner notes;
- one row per note with a short ID and exact requested behavior;
- disposition: fixed in cooldown, included in the next shape, or added to a
  named [later candidate](PRODUCT_MILESTONE_CANDIDATES.md);
- cooldown change and in-app verification, or the reason it remains open;
- the later shape that read and addressed the note.

If the owner corrects an assumption from the
[assumptions log](PRODUCT_MILESTONE_ASSUMPTIONS.md), link that assumption and
resolve it in the cooldown pass before starting a new milestone build. Feedback
that arrives during an already shaped build is handled at its next safe
boundary. Never silently enlarge that accepted build.

## PC01 — Shepherd science station

**Review state:** the owner supplied cross-checkpoint guidance on 2026-09-27,
including a role-selection screenshot. This was not a PC01 walkthrough or
verdict. These notes inform PC02–PC10; the owner prefers resolution by the
PC02 handoff where the work can be completed safely. PC01 build 0.5.51 has
since been released. PC01 checkpoint acceptance awaits explicit authorization;
a completed UI walkthrough is not required. Ordinary authorized live-play
proof remains a separate agent-owned evidence gap.

| Note ID | Owner's observation or request | Disposition | Cooldown evidence or later candidate | Next shape that addressed it |
|---|---|---|---|---|
| PC01-F01 | Survivor population changes and purges are sent to the Press log. | Included in PC02 cooldown target. | Authoritative Press handoff, recipient privacy, and replay proof pending. | PC02 planned. |
| PC01-F02 | Presidential events are handed to Press. | Included in PC02 cooldown target. | President event to Press handoff and audience proof pending. | PC02 planned. |
| PC01-F03 | Replace “Awaiting server telemetry” with “Awaiting CIC handshake”; use in-universe language where possible. | Included in PC02 cooldown target. | Local candidate `4c0e7e80` changes the pursuit pending labels; focused UI tests pass. Release and in-app verification pending. | PC02 planned. |
| PC01-F04 | Repeat DRADIS sweeps must keep the first contact enlargement for its full first-sweep duration, then resume normal-sized repeat behavior. | Included in PC02 cooldown target. | Local candidate `ff7baa15` separates the first size beat from repeat brightness pings; focused timing tests pass. Released gameplay review pending. | PC02 planned. |
| PC01-F05 | Players can drop out midgame and play continues in every non-GM role. | Included in PC02 cooldown target. | Server-authoritative role, seat, and continuation proof pending. | PC02 planned. |
| PC01-F06 | The three Code of Conduct checkboxes last for 72 hours. | Included in PC02 cooldown target. | Local candidates `4c0e7e80` and `6ad74397` set a 72-hour browser acknowledgement, update its label, and reopen the gate at expiry in active or resumed tabs. Focused boundary tests pass; release and in-app verification pending. | PC02 planned. |
| PC01-F07 | The screenshot-style cycle, phase, location, authority, next-action, and failure-state panel is visible only to people logged in as GM. | Included in PC02 cooldown target. | Local candidate `4c0e7e80` gates the panel on active authenticated GM access; player and unauthorized-GM tests pass. Release and in-app verification pending. | PC02 planned. |
| PC01-F08 | Leave session must not sit at the top of the screen; Settings is an acceptable location. | Included in PC02 cooldown target. | Local candidate `4c0e7e80` removes the two top-screen controls; shared Settings retains the confirmed disconnect action. Release and in-app verification pending. | PC02 planned. |
| PC01-F09 | DRADIS contact names overlap other plot content. The expanded plot should keep each name readable and anchored on the left or right of its contact, choosing the side with more room from other labels and marks. The minimized plot is lower priority and may be less readable. | Included in PC02 cooldown target. | Local candidates `4525a4db`, `60eef106`, and `60d2ca71` wrap oversized names, choose the clearer anchored side after scans, and provide a “Read names” expansion control on narrow screens. Focused tests and rendered 320/390/844/1440 px checks pass for expanded labels without overlaps or detached names; released gameplay review pending. | PC02 planned. |
| PC01-F10 | Reconnect does not restore the correct game state. | Included in PC02 cooldown target. | Local candidate `096aaf88` rebinds private state listeners after a same-player resume; focused route/private-projection test passes. Server continuity and released gameplay proof pending. | PC02 planned. |

**PC02 authorization update (2026-09-28).** All ten requested presentation and continuity changes above are included in released build 0.5.52 from `f0e4eb73c753915567412899efd4dd4d78faa9dc`. [The release workflow](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/36374346054) passed, the public build marker advanced through 0.5.52, and the six-step [solo review scene](https://dow-new-eden-console.web.app/pc02-review) loads. The owner explicitly authorized PC02 and confirmed that checkpoint authorization is sufficient without walkthrough answers or written UI feedback. PC02 owner acceptance is complete. The table preserves the earlier candidate and proof state as received; see [the PC02 report](PC02_PLAYTEST_REPORT.md) for the final test inventory and remaining agent-owned production evidence.

## PC03 — Navigation and shuttle controls

**Authorization state (2026-09-28): accepted.** The owner explicitly authorized PC03 and confirmed that checkpoint authorization is sufficient without walkthrough answers or written UI feedback. Build 0.5.53 and the five-step [solo review scene](https://dow-new-eden-console.web.app/pc03-review) are released. Optional later feedback remains welcome and follows the ordinary cooldown process. See [the PC03 report](PC03_PLAYTEST_REPORT.md) for release evidence, unresolved rule decisions, and remaining agent-owned production evidence.

**Post-acceptance guidance received for PC04 (2026-09-28).** The owner gave
the following app-wide corrections while authorizing work to begin on PC04.
They are cooldown requirements for the PC04 release, not a revocation of PC03
acceptance. The end of released PC01 build 0.5.51 is the strongest known-good
typography reference, but the owner notes it may contain outliers; the
documented CIC typography contract controls. A passing source-only font guard
is not sufficient proof, and the corrected rendered contract must become a
mandatory CI/deployment gate.

| Note ID | Owner's observation or request | Disposition | Cooldown evidence or later candidate | Next shape that addressed it |
|---|---|---|---|---|
| PC03-F01 | Consolidate Role Select and station selection into one early screen. Ordinary players choose a station/console, not a role; Role Select remains only for authenticated GMs joining the game. | Included in PC04 cooldown target. | Test-first route and first-entry authority repair, responsive rendered checks, and released in-app verification pending. | PC04 planned. |
| PC03-F02 | Change current player-facing “table” copy to “console” app-wide, including “UPGRADES AND PROCEDURE OUTCOMES ARE TRACKED AT THE TABLE.” | Included in PC04 cooldown target. | Current visible UI copy inventory, focused assertions, and released in-app verification pending. Internal wire names, historical release notes, source citations, and genuine HTML/data tables remain unchanged. | PC04 planned. |
| PC03-F03 | The default Red Alert copy must be exactly “RED ALERT // WOLF ATTACK IMMINENT ALL HANDS TO BATTLE STATIONS. NON-CREW MUST SHELTER IN PLACE UNTIL ALERT LIFTED”. | Included in PC04 cooldown target. | Authoritative default/restore path, ticker/alert tests, and released in-app verification pending. | PC04 planned. |
| PC03-F04 | The app-wide and DRADIS font regression since the end of PC01 is unacceptable and must be repaired by the end of PC04. PC01 looked correct but may contain outliers; the intended CIC typography controls. Typography must be a mandatory CI/deployment gate that cannot be bypassed again. | Included in PC04 cooldown target and release gate. | Compare PC01 exact release `4e8e3876108709f2a620c4f71ea874183d3db4ee` with the PC04 candidate, resolve any outlier against the documented CIC tokens, and gate representative rendered/computed styles at required viewports on every player-facing deployment. | PC04 planned. |
| PC03-F05 | Automate every facilitator procedure that can be automated. The ultimate design target is one facilitator making only required choices, with automated facilitator actions and outcomes sent to the GM log. | Encoded as an app-wide product requirement and applied to PC04 mission/split work. | Automatic paths must own deterministic calculation and state changes, emit a complete server-owned GM-log receipt, and pause only for genuine choices, rulings, or interventions. Focused behavior, authority, replay, and log tests plus released in-app verification pending. | PC04 planned. |

## PC04 — Exploration and split-fleet map

**Authorization state (2026-09-28): accepted.** The owner explicitly authorized
PC04 and confirmed through the standing checkpoint policy that authorization is
sufficient without walkthrough answers or written UI feedback. Build 0.5.54
from `0ba386f50689b375153ceee3b2eb11a9ecd19435` is released, [deploy workflow
36466514603](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/36466514603)
passed, the public build marker reports 0.5.54, and the five-step [solo review
scene](https://dow-new-eden-console.web.app/pc04-review) is live. PC03-F01
through PC03-F05 shipped in this checkpoint. Their earlier table remains as the
received pre-release record; the [PC04 report](PC04_PLAYTEST_REPORT.md) contains
the final evidence and the still-open ordinary-gameplay boundaries. Optional
later UI feedback remains welcome and follows the ordinary cooldown process.

| Note ID | PC04 release disposition | Released evidence |
|---|---|---|
| PC03-F01 | Fixed in PC04 cooldown. | Ordinary players use the early station/console catalog; Role Select is reserved for authenticated GM joining. Route, claim/race, occupancy, Back/deep-link, responsive review, and hosted review checks passed. |
| PC03-F02 | Fixed in PC04 cooldown. | Current generic interface copy uses “console”; the visible-copy audit preserves genuine data tables, physical-table language, historical notes, and the printed Battle Table proper name. |
| PC03-F03 | Fixed in PC04 cooldown. | Client, callable, restore, alert, and ticker coverage asserts the exact owner-supplied default, and the exact-SHA ticker browser gates passed. |
| PC03-F04 | Fixed in PC04 cooldown and retained as a mandatory release gate. | 61 font-contract checks and a 56-case rendered comparison against exact PC01 release `4e8e3876108709f2a620c4f71ea874183d3db4ee` passed; workflow 36466514603 ran the non-bypassable computed-style gate before deployment. |
| PC03-F05 | Encoded app-wide and applied to the released mission-start slice. | The server owns the deterministic mission snapshot, initial deal, replay/recovery, and complete GM-log receipt; the GM records only the team-selected roster and leader. Ordinary authorized gameplay remains an agent-owned evidence gap. |


## Campaign completion correction — latest instruction, 2026-09-28

The owner first clarified the original half-by-PC05/all-by-PC10 intention,
then considered PC15, and finally explicitly replaced both with: **distribute
remaining prompts evenly across PC05 through PC10**. Only that latest
instruction controls future targets. This is a completion plan, not permission
to count partial work as done.

| Note ID | Owner request | Disposition | Evidence / next action |
|---|---|---|---|
| CAMPAIGN-F01 | Distribute the 293 remaining prompts evenly across PC05–PC10. | Applied: 49 closures each for PC05–PC09 and 48 for PC10; literal total-done targets 507, 556, 605, 654, 703, 751. Earlier PC05-half and PC15 proposals superseded. | [Recovery plan](CHECKPOINT_COMPLETION_PLAN.md); task owner carries each assigned tranche through implementation and gameplay proof. |
| CAMPAIGN-F02 | Check whether earlier checkpoints completed prompts without recording them. | Audited historical catalog snapshots and current descriptions; five stale implementation descriptions corrected, no unsupported done promotions. | [Accounting audit](CHECKPOINT_ACCOUNTING_AUDIT.md); recover completion credit only against full acceptance evidence. |

## PC05 required pre-release repairs — 2026-09-28

The owner requested completion of PC05 and explicitly required these fixes
before its full release. They are additional regression obligations, not
credits toward the fixed 49 assigned closures.

| Note | Intended behavior | Disposition |
|---|---|---|
| PC05-F01 | A reconnect rejected because the station is no longer authorized returns to station selection and tells the player to reselect their role. | Released in 0.5.57. Exact-candidate route/authority tests cover ship and Union stations, listener ordering, rebinds, read-only visitors and fail-closed freshness. Ordinary production play returned a reloaded Scientist to station selection with session membership preserved and the exact persistent instruction to reselect a role. |
| PC05-F02 | A DRADIS name appears on its visible contact, never before the contact appears. | Released in the PC05 train and retained in 0.5.57. Test-first timing coverage and the desktop/phone/short-landscape normal/reduced-motion render matrix bind every name to the visible contact through reveal, acquisition, rename and fade. Production DRADIS showed contact-anchored names and no orphan name for an unknown contact. |
| PC05-F03 | Minimized DRADIS says Zoom or uses a magnifying-glass-plus icon, never Read names. | Released in the PC05 train and retained in 0.5.57. The rendered and production compact control says **Zoom**, with accessible text “Zoom into DRADIS panel”; it never reads names. |

PC05 is accepted under the explicit completion request and standing autonomous
authorization. Build 0.5.57 at exact main
`4f2cd9a8c03e8970eae5dd9ad284c855cdb2d2b7` closes its fixed 49-prompt target,
for **507/751 done and 49/293 baseline closures**. PR CI `36636882417`, exact-main
deploy `36639176688`, and the ordinary production observations above passed.
Optional later UI feedback remains welcome through the bounded cooldown path.

## Standing authorization for remaining checkpoints — 2026-09-28

The owner stated they will be away and instructed agents to finish without
them, then explicitly requested that future checkpoints reflect this policy.
PC05–PC10 therefore use the autonomous execution section in the milestone
guide. Optional UI review and later feedback remain available; routine owner
approval and checkpoint-transition waits are removed. Fixed closure targets
and ordinary authorized gameplay proof remain required.

The owner also explicitly approved automatic server Wolf assignment and
confirmed-roster start with only available real players, including zero Wolves
when nobody is eligible; the configured roster's normal Wolf count remains the
target. They approved the exact onboarding sentence: “Wolf agents are humans,
just like the other survivors.” These decisions resolve the P654/P662 policy
choice and P589 copy question; implementation and gameplay proof still apply.

## PC06 authorization — 2026-09-30

The owner explicitly instructed: “execute PC06 please to completion.” This
continues the standing PC05–PC10 authorization through the fixed PC06 scope.
No PC06 walkthrough answers or new UI observations accompanied the
authorization; the one-sitting review scene remains optional. Product scope and
the chosen PC06-A9 Prompt 112 inventory contract are recorded in the
[PC06 shape](PRODUCT_MILESTONES.md#pc06-shape--vessel-movement-and-away-missions).

## PC07–PC10 philosophical alignment — 2026-09-30

The owner requested a review of explicit decisions across prior conversations,
then authorized execution with the boundary: **changes are PC07 onward because
PC06 is in progress**. This is authorization of future prompt amendments, not
new gameplay evidence or acceptance of an unfinished checkpoint.

| Note ID | Owner decision | Disposition / next action |
|---|---|---|
| FUTURE-F01 | Align PC07–PC10 prompts with the decisions introduced before and between checkpoints. | Applied to the same 195 future catalog rows; [alignment guide](PC07_PC10_ALIGNMENT.md) records one-GM automation, entitled choices, private receipts, Press publication control, CIC presentation, recovery and solo review. Generated prompt and Gantt views consume the amended catalog. |
| FUTURE-F02 | PC06 is already in progress; revisions begin at PC07. | PC06's catalog rows, baseline allocation, statuses and release files are unchanged by this amendment; future numeric membership and targets are retained. |
| FUTURE-F03 | Decide, log, keep going within authorized future scope. | PC09-A1 records the minimal VIP Host visit attestation; PC09-A2 corrects presidential-visit timing from the inspected v1.1 card. Future implementation and proof remain required; neither is claimed here. |

The P503a acknowledgement/clue sequence and its after-1.0 experience review
remain intentional. P605a still needs separate explicit activation plus P433a
proof; planning authorization is not activation or closure credit.

## Standing alignment before checkpoint transitions — 2026-09-30

**Decision source:** after resuming the PC07–PC10 amendment work, the owner
requested this instruction in the repository, then clarified: “ensure work
like the above happens before we move into the next checkpoint.” This is the
latest owner message reviewed for this alignment.

| Note ID | Owner decision | Disposition / next action |
|---|---|---|
| FUTURE-F04 | Carry later owner changes into future prompts and checkpoint plans before entering the next checkpoint. | Adopted in `AGENTS.md`, `CLAUDE.md` and the [checkpoint preparation procedure](PRODUCT_MILESTONES.md#owner-decisions-before-the-next-checkpoint). Applies to all affected unstarted IDs and checkpoints; currently PC07–PC10. Review relevant prior/new owner conversations, amend actual criteria, log the decision and affected IDs, and refresh derived views when their inputs change. Every later checkpoint owner repeats this before beginning the next shape/build. |

This instruction changes preparation policy, so it requires no further catalog
criteria amendment today. The existing 195 PC07–PC10 amendments remain in
place. PC06 scope, all prompt definitions/statuses/evidence, fixed allocation
and release facts are unchanged by this follow-up.

## PC07 transition and authorization — 2026-10-02

The owner requested “execute pc07 please.” Reviewed the latest PC06 thread
through the “what broke? diagnose” message and the explicit “it’s done btw”
closure, plus the earlier PC07–PC10 alignment. The future handoff correction is
already in current repository guidance. No new applicable mechanic or
presentation decision changes the 195 future acceptance criteria or the fixed
allocation. The PC06 local verification exception remains PC06-only. Existing
FUTURE-F01–F04 and PC03/PC05 corrections are adopted into the PC07 shape. No
new owner UI feedback is pending cooldown.

### PC07 verification decision — 2026-10-02

The parent asked: “For PC07, should I use the same representative local/emulator
gameplay verification you approved for PC06, with independent review, CI, and
production deployment still required?” The owner explicitly selected **Use the
same local/emulator approach**. This applies to PC07 only. It resolves the
production-GM access dependency while preserving all 49 behavior criteria,
605/751 target, review, CI and deployment. Native handler, normal HTTP/UI and
rules proof remain distinct from prepared scenes, ordinary production behavior
and deployment. Prepared scenes alone earn no closure. Future checkpoints
retain their existing requirements. Latest owner message reviewed: this decision.

### Repository-wide correction — 2026-10-02

Latest owner message reviewed: **“that’s a new repo thing, all future will use
local emulator.”** This corrects and supersedes the earlier PC07-only limit.
Affected IDs: all 195 fixed PC07–PC10 catalog rows; future work repo-wide.
Applied to the actual canonical acceptances, future operating/shape/completion
guidance and workflow guide. Authenticated local/emulator native, HTTP/UI and
rules evidence is now the gameplay completion standard. Counts, functional
acceptance, independent review, CI, production deployment, full-table PC10
and version/P605a boundaries are unchanged. Scene-only proof remains invalid;
historical local and production evidence stays accurately labeled.

### Orchestrator ownership and direct takeover — 2026-10-03

The owner requested repository guidance making the orchestrator thread the
checkpoint owner, then explicitly ordered: “force the other owner to stop.
pick up where they left off.” The root interrupted the delegated owner and both
workers, preserved their work and failing evidence, and completed the remaining
implementation and normal gameplay proof directly. No implementation agent is
resumed. `AGENTS.md`, `CLAUDE.md` and the execution policy carry orchestrator
ownership for future checkpoints. Required independent Sol review remains a
separate risk check before CI; it does not transfer implementation or release
ownership. No new gameplay UI feedback or rules correction is pending cooldown.

## PC07 completed under execution authorization — 2026-10-03

The existing “execute pc07 please” authorization accepts the finished checkpoint.
Root completed the fixed 49 behavior acceptances and release, reaching 605/751
overall (80.56%) and 147/293 campaign closures (50.17%). The [report](PC07_PLAYTEST_REPORT.md)
records normal authenticated local/emulator proof, independent review, final
validation, CI, verified core Functions/Rules deployment and the completed 0.5.66
Hosting layout follow-up. The [five-step review](https://dow-new-eden-console.web.app/pc07-review.html) is optional prepared
UI feedback; no owner walkthrough or new written feedback was required.
No new gameplay decision or UI feedback is pending cooldown. Root remains
checkpoint owner, all future gameplay proof uses local/emulator paths, and
PC08–PC10 membership, targets, P605a activation and full 20-player PC10 boundaries
remain unchanged.

## PC08 transition and authorization — 2026-10-03

Latest owner message reviewed: “Execute pc08 please, full authority granted to
do whatever is needed to get it done.” This explicitly authorizes PC08 under
the standing execution policy. The transition review read the preceding PC07
conversation through the local/emulator correction, orchestrator ownership,
takeover and completed release, plus the prior philosophical alignment.
No new applicable gameplay or presentation decision changes an unstarted
criterion; no UI feedback awaits cooldown. The existing 98 PC08–PC09 and 48
PC10 criteria retain their local/emulator proof standard, fixed targets and
source/authority/privacy requirements. P605a and release-version boundaries
remain unchanged. The [PC08 execution record](PC08_EXECUTION_RECORD.md) and
next checkpoint shape adopt every still-applicable prior feedback item.

## PC08 audit and checkpoint sequence — 2026-10-04

**Latest owner instruction reviewed:** audit completed PC08 first in a separate
Sol 6.1 orchestrator; then run a separate PC09 orchestrator; after PC09, revise
PC10 before its separate orchestrator; then continue the existing
[post-completion work](POST_PROMPT_COMPLETION_TASKS.md). One checkpoint at a
time. The audit may commit, push and merge its verified audit/roadmap changes.
It must not start future checkpoint implementation, create PC11 or activate
P605a by implication. The old PC08 thread remains untouched.

| Item | Decision and disposition |
|---|---|
| PC08-AUDIT-F01 | Preserve the terminal 0.5.67 release and its exact evidence classes; investigate completed behavior and record finite, reproducible findings in [PC08 Bug Audit](PC08_BUG_AUDIT.md). Open findings require a named repair/proof path and are not marked fixed by this planning update. |
| PC08-AUDIT-F03 | Ten reproduced runtime findings remain open (one P1, seven P2, two P3). Existing PC09 work orders progression/carryover repairs first, loss persistence before P483 rebuild, accurate projections before P474/P484, and receipt/recovery seams within P621 before composed P645 proof. The catalog annotates affected released rows without rewriting the historical release totals or claiming repair credit. |
| PC08-AUDIT-F02 | Correct the recovery plan's stale PC08-unstarted text and its misleading PC10-only P605a wording. PC09 owns the unchanged P605a assignment; explicit activation remains separate, with no closure credit while deferred. |
| PC10-F01 | In the revision after PC09, require a complete solo walkthrough of every role using two browsers, unlimited timers and a real authenticated GM cycle 0 → 1. Reuse existing functionality and exercise gaps end-to-end. Prepared-state tours alone cannot establish this acceptance. Retain the full twenty-player, complete game-loop and ending obligations. This audit records the requirement without shaping or implementing PC10. |

Affected future checkpoints: PC09 repair/dependency ordering and the later PC10
revision. Fixed membership, closure targets, P605a activation and release-version
authority remain intact. The audit report supplies findings, proof limitations
and the next owner's readiness/blockers.

## PC09 transition and authorization — 2026-10-04

Latest owner message reviewed: the separate PC09 dispatch authorizes end-to-end
implementation, regression proof, independent review, commit, push, merge and
release verification. It explicitly accepts all ten audit repairs into the
existing PC09 prompt scope and prioritizes the three progression blockers.
No new gameplay/UI decision changes the current criteria. The
[execution record](PC09_EXECUTION_RECORD.md) and PC09 shape adopt all existing
audience, CIC, automation, visit and emulator-proof requirements.

The parent acknowledged continuing the other 48 assigned IDs and audit repairs,
and requested a concrete P605a activation brief before asking the owner. The
brief identifies the deferred Wolf-attack DRADIS visualization, its current
P433a projection/privacy prerequisite and exact functional scope. P605a remains
deferred until an explicit owner decision returns; no activation is inferred.
Fixed IDs and 703/751 target remain intact. The later PC10 revision and dispatch
belong to the parent after PC09; no future checkpoint is started here.

## PC09 visualization activation and hold — 2026-10-04

The owner explicitly instructed “do visualization, hold after doing checkpoint
with viz.” The parent conveyed this to the MacBook PC09 orchestrator. P605a is
activated only within its existing P433a authoritative projection, contact
privacy and source/target/phase/range/bearing/effect/outcome boundaries. Unknown
bearings remain unknown; no hidden preparation, telemetry or rule change is
authorized. The owner additionally said “match existing design pls”: extend the
current DRADIS colors, typography, symbols, density, layouts and motion.

The owner clarified GPT-6 Astra as an exception for the isolated P605a product
implementation worker only. Coordination remains Sol 6.1 Max; tests, review,
documentation and all other prompts remain Sol 6.1 or Luna 6. The
[launch/change manifest](PC09_MODEL_ASSIGNMENTS.json) records explicit creation
settings and the runtime-tool visibility limitation. Do not change a session
default or inherit the exception in other work.

Complete all 49 PC09 IDs and ten audit repairs, verify the single release, then
hold for a new instruction. Do not revise or start PC10 or later tasks. Execution
remains on the MacBook; a brief disconnect does not authorize migration. The
parent owns any backup decision after 25 continuous hours of MacBook failure.
This record grants activation and scope only, not implementation or closure
credit.

## PC09 completion followed by separate PC10 and post work — 2026-10-04

The owner's later instruction “actually just proceed thru pc10 and post, ty”
supersedes the earlier hold after visualization. Complete and verify PC09 first.
The parent then revises PC10 and launches its separate Sol 6.1 Max orchestrator,
followed by existing post-PC10 work. The PC09 task implements no future phase.
The narrow Astra P605a implementation-only exception, existing DRADIS design,
MacBook execution and 25-continuous-hour backup boundary remain unchanged.
This decision changes sequence authorization only and grants no closure credit.

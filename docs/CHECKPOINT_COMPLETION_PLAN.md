# Checkpoint completion recovery plan

## Fixed owner intent — latest instruction, 2026-09-28

**Distribute the 293 remaining prompts evenly across PC05 through PC10.**
**PC05–PC09 each close 49 prompts; PC10 closes the final 48.** This latest
owner instruction supersedes the earlier PC05-half-complete catch-up proposal,
the briefly proposed PC15 ending, and the original UI-cluster-only allocation.
The endpoint is **PC10**, not PC15. Do not restore either superseded target.

The audited starting state is **751 total, 458 done, 293 unfinished**
(57 partial and 236 missing). These are the same 293 IDs unfinished before
PC01 at release **0.5.50**, commit
`f8703935bf201d8021b8ac0a2749e845ae8d0eb4`; PC01–PC04 changed implementation
and partial statuses but closed none of that set. Their historical releases
and owner authorizations remain recorded. The owner has now explicitly
redistributed the entire remaining set across six future checkpoints.

The exact 293 IDs are allocated below. The catalog remains the sole current
status authority; this document fixes campaign membership and delivery targets.
A closure counts only when the assigned ID meets its full acceptance, required
prerequisites and evidence, and is recorded `done` in the catalog. Partial
implementation, synthetic scenes, deployment alone, repeated work on an
already-done ID, and new prompts outside this fixed baseline add zero closures.
Reopened IDs reduce the achieved count. Correct genuinely unrecorded completion
when evidence supports it and label it recovered credit; do not claim it was
newly built. Such recovered credit counts once in its assigned tranche.
Historical changelog snapshots remain unchanged.

The old PC05–PC10 UI-tour titles are historical and superseded by these fixed
ID tranches. The old PC06 “Weapons and boarding stations” theme does not define
the current PC06 work: PC08 contains weapons, fighters, and the opening boarding
path; PC09 carries the downstream battle results and aftermath. **All 751
prompts are assigned by PC10.** These short scope descriptions summarize the
catalog IDs below; the catalog remains authoritative for each prompt's
definition and current status.

| Checkpoint | Current assigned prompt scope | Assigned newly closed IDs | Cumulative closures from the fixed 293 | Remaining from that set | Overall done target* |
|---|---|---:|---:|---:|---:|
| PC05 | Station readiness and onboarding; rations, maintenance, and mutiny; core jump/scouting paths; research and ECM. | 49 | 49 | 244 | 507/751 |
| PC06 | Supplemental vessel movement, repair, and cargo; jump and split-fleet mechanics; scouting, away-mission resolution, rewards, and recovery. | 49 | 98 | 195 | 556/751 |
| PC07 | Airspace and shuttle boundaries; split-fleet privacy, taxi, and rejoin; local DRADIS; Wolf-attack engine, targeting, and range foundations. | 49 | 147 | 146 | 605/751 |
| PC08 | DRADIS and shuttle presentation; weapon, missile, and fighter actions; the opening boarding path through support, deployment, defense, and damage. | 49 | 196 | 97 | 654/751 |
| PC09 | Remaining battle results and boarding aftermath, including casualties, salvage, repairs, and fighter rebuild; Wolf threats, investigation and arrest, specialist and President actions, and crisis flows. | 49 | 245 | 48 | 703/751 |
| PC10 | Specialist workspaces; Ring, Nebula, and Station outcomes; endings and debrief; Capybara integration; cross-path recovery and full-game proof. | 48 | 293 | 0 | 751/751 |

*Overall targets assume the original 458 stay done. Regressions must be repaired
and reported separately, never hidden by newly completed work. The fixed ID
set and literal targets must not be reset after a missed checkpoint, inflated
by splitting prompts, or reduced by silently dropping, retiring, or deferring
IDs. Added scope is reported separately. Changing these targets requires a new
explicit owner instruction.

A checkpoint is numerically complete only after it reaches its cumulative
closure target with the assigned scope reconciled. A smaller feature release
may ship safely during that work, but it is an interim release, not completion
of the checkpoint. Owner authorization and numerical completion are separately
reported; authorizing a review scene never silently waives these targets.
Any shortfall carries forward rather than restarting the next 49 from a lower
base. No further catch-up to the superseded PC05-half target is required.

## Standing execution authorization

The owner's 2026-09-28 instruction is to complete PC05–PC10 autonomously while
they are away. Apply [Autonomous execution](PRODUCT_MILESTONES.md#autonomous-execution-for-pc05pc10)
to every tranche below: source-backed decisions, implementation, review,
release, and ordinary gameplay proof belong to the agents. Do not wait for
routine owner approval, a walkthrough, feedback, or permission to continue to
the next completed tranche. Genuine blockers preserve the incomplete target
and do not stop independent useful work.

For PC06 only, the owner's October 2 instruction accepts representative local/emulator gameplay for remaining behavior checks after requesting a strictly local GM access path. The fixed 49 IDs and 556/751 target remain unchanged. Evidence must distinguish the seven production results from local native/HTTP/UI/Rules verification; prepared scenes alone grant no credit. Required authority review and release/deployment gates still apply.

## Execution and proof

1. Reconcile existing work first using the [accounting audit](CHECKPOINT_ACCOUNTING_AUDIT.md).
   Check the full acceptance against implementation, integration, release,
   ordinary gameplay, and dependencies. Repair stale records immediately;
   promote to done only with evidence. Do not rebuild completed integration.
2. The task owner shapes PC05 around the 49-ID allocation below,
   rather than just the former attack dashboard. Resolve dependencies and
   source-backed assumptions first. Use the existing source/assumption policy;
   old parked requests for owner decisions must be re-evaluated against current
   authority, not treated as automatically current blockers. Preserve parked
   owners and unique work; coordinate before resuming or integrating it.
3. Organize independent implementation and proof work into bounded lanes with
   separate checkout/shared-file ownership and one release owner. Prioritize
   already-implemented science/scouting, repair, cargo and mission-start paths
   for ordinary authorized proof while dependency chains are implemented.
   Verify supported facilitator/session access early. If access is unavailable,
   record the exact missing capability and continue independent work; do not
   bypass authorization or substitute a synthetic scene for gameplay.
4. Finish required gameplay proof in the same delivery as implementation.
   Bundle compatible acceptance checks into ordinary game scenarios, with
   distinct evidence for each prompt. Include wrong-actor denial, replay,
   reconnect and private audiences where acceptance requires them. Do not
   repeatedly release UI slices while leaving their proof indefinitely queued.
5. In each release report, state the opening and closing baseline counts,
   newly closed IDs, recovered earlier credit, regressions/reopened IDs,
   target, shortfall, exact evidence links, and remaining owner/action.
   The catalog and generated views must agree. Future player release notes
   retain overall completed/total and additionally report baseline campaign
   progress, for example “49/293 remaining prompts complete (16.72%);
   507/751 overall.” Historical release notes remain unchanged.
6. Keep the owner's review a one-sitting presentation tour of representative
   finished workflows; it need not expose every agent-owned acceptance test.
   Split internal work and interim releases as necessary without splitting or
   weakening the numerical checkpoint target. Full-table gameplay, operational
   proof, accessibility, privacy, and actual endings are part of finishing
   PC10, not a new PC11 cleanup backlog. Existing restrictions on 0.9.x and
   1.0.0 version authorization still apply.

These are product scope and reporting requirements, not a new Git/CI approval
system. No implementation work or production session is claimed by this
planning change. A blocker makes the checkpoint incomplete; it does not make
its target smaller. Escalate real access or source blockers with concrete
choices only after exhausting useful independent work.

## PC07–PC10 acceptance alignment — 2026-09-30

The owner authorized prompt revisions for **PC07 onward only**, while PC06
continues in progress. Apply the [PC07–PC10 alignment guide](PC07_PC10_ALIGNMENT.md)
to the 195 future IDs below: one-facilitator automation, entitled player choices,
private GM receipts, audience-safe Press handoffs, CIC presentation, graceful
recovery and finished solo tours. This updates future acceptance criteria, not
PC06 scope, runtime behavior, release evidence or completion status. Preserve
all ID assignments and cumulative targets. P605a still requires separate
explicit activation before closure; this amendment does not supply it.

## Complete baseline allocation

This recovery allocation replaces the old per-checkpoint scope assignment.
It retains the old workflow ordering where possible and orders unfinished
hard prerequisites before dependents. A numeric dependency range expands its
numeric IDs; explicitly named lettered IDs retain their own dependency edges.
It allocates **all 293 baseline IDs exactly once**, with no hard-prompt edge
pointing to a later tranche at this snapshot. It is an execution route, not a
claim that source decisions, runtime access, or all non-prompt contracts are
already ready. Read every catalog row when shaping its work.

The backlog is distributed evenly by prompt count, not estimated effort.
Prompt complexity varies; implementation and proof remain part of each ID.
Later UI themes can span multiple owner tours. PC05–PC08 are released, reaching
654/751 overall and 196/293 campaign closures at the PC08 release snapshot.
PC08 shipped as 0.5.67; the [PC08 report](PC08_PLAYTEST_REPORT.md) records its
verified release and the [post-completion audit](PC08_BUG_AUDIT.md) records
subsequent findings. PC09 is now released and verified at its fixed 49 closures
and 703/751; PC10 retains its 48 IDs and 751/751 target for a separate dispatch.
A documented same-count substitution may move an unstarted ID only
with its dependencies satisfied and another baseline ID replacing it; it
cannot change any cumulative target or lose any baseline ID. The owner explicitly
activated P605a on October 4 for PC09, preserving its existing P433a contract and
privacy requirements. It remains in the 49-ID closure obligation and 703/751
target. The later October 4 owner instruction “actually just proceed thru pc10
and post, ty” supersedes the hold. Complete PC09 including visualization,
then the parent revises PC10 and dispatches its separate orchestrator before
existing post-PC10 work. One checkpoint at a time; no future execution here.

The historical post-release audit recorded ten open runtime findings (one P1,
seven P2, two P3). The verified PC09 **0.5.68 release** repairs all ten,
including the shared progression/carryover blockers, durable losses before
P483 rebuilding, result/projection seams before P474/P484, and P621's
mixed-source, holder-removal and attack-bound recovery. All 49 acceptances are
complete at **703/751** and **245/293 campaign closures**; [exact-main CI and
production surface verification](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/37261134992) pass at `feec9189`. P645
follows the accepted aftermath and recovery dependencies.
P492/P493 retain their separate trigger acceptances and are related proof,
not hard prerequisites of the ordinary P645 playthrough. See
[the finite findings and order](PC08_BUG_AUDIT.md#follow-on-order-and-pc09-readiness)
and the catalog's existing PC09 acceptances. Historical PC08 `done` counts remain
the 0.5.67 released snapshot; affected rows now link the separate PC09 repair
evidence without receiving duplicate completion credit. The original audit
reproductions and their evidence limits remain intact. The dependency CLI reads
statuses, not production deployment health. No future checkpoint is started by
this verified PC09 record.

### PC05 — 49 assigned closures; 49/293 cumulative

211, 212, 213, 391, 321, 325, 327, 328, 329, 330, 331, 332, 333, 677, 654, 662, 589, 590, 599, 600, 100, 117, 116, 118, 119, 120, 121, 134, 135, 136, 137, 184, 191, 287, 288, 289, 290, 291, 294, 296, 297, 298, 299, 300, 301, 302, 303, 304, 201.

### PC06 — 49 assigned closures; 98/293 cumulative

202, 210, 222, 232, 236, 241a, 259, 320, 607, 679, 020a, 112, 238, 244, 241c, 251, 250, 352, 371, 380, 385, 378, 401, 237, 241b, 392, 393, 404, 405, 407, 408, 409, 410, 411, 412, 413, 243, 414, 415, 622, 422, 646, 334, 335, 151, 307, 322, 323, 324.

### PC07 — 49 assigned closures; 147/293 cumulative

326, 336, 153, 337, 338, 152, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 424, 678, 643, 140, 154, 155, 156, 158, 103a, 159, 428, 431, 432, 432a, 433, 433a, 433b, 434, 434a, 435, 436, 437, 438, 439, 440, 441, 442, 444, 523a, 351, 353.

### PC08 — 49 assigned closures; 196/293 cumulative

354, 355, 356, 357, 358, 359, 360, 423, 644, 605, 231, 389, 396, 397, 398, 443, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 455, 456, 457, 458, 459, 461, 462, 465, 466, 394, 395, 460, 463, 464, 467, 468, 469, 469a, 469b, 469c, 469d, 469e, 470.

### PC09 — 49 assigned closures; 245/293 cumulative

471, 472, 473, 580, 605a, 474, 475, 476, 477, 478, 479, 480, 481, 482, 483, 484, 490, 491, 492, 493, 494, 621, 214, 503a, 506, 508, 513, 514, 516, 517, 519, 520, 521, 521a, 521b, 524, 645, 523b, 523c, 524b, 524c, 524d, 528, 529, 537, 538, 539, 540, 180.

### PC10 — 48 assigned closures; 293/293 cumulative

181, 215b, 223b, 233b, 576, 579, 581, 584, 585, 541, 542, 543, 544, 545, 546, 547, 548, 549, 593, 619, 550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 563, 564, 565, 566, 647, 648, 649, 650, 618, 620, 629, 630, 631, 634, 635, 641, 642, 651.

## Current future gameplay evidence standard — October 2

The owner instructed that all future repository work use local/emulator
gameplay. This applies to all fixed PC07–PC10 IDs; their canonical criteria
carry the correction. Meaningful authenticated native/HTTP/UI/rules proof
replaces a production-GM-only closure dependency, preserving every functional
criterion and count, independent review, CI and production deployment.
Prepared scenes remain presentation alone. Full-table PC10 and ending
obligations remain and may use emulator clients; P605a and version
authorization boundaries are unchanged. Historical evidence labels remain.

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

## Post-release colorblindness backlog — October 13

After verified PC10 and the full app release, audit color-dependent states
across Den of Wolves and add an optional Settings **“Don’t rely on color”**
mode with non-color cues and patterns. This deferred item preserves the current
release scope: it adds no PC10 acceptance requirement, does not reopen PC11,
and does not delay version 0.9. Existing later-work sequencing remains in place.

## October 8 owner N/O edition choice

Emerald approved **Home as the default** for the app and canonical paper kit,
with clearly labeled, coherent Deluxe alternatives. This owner choice is not
author-confirmed precedence. Home N requires 10 Materials, an Engineering
Shuttle, five research tracks with four crosses and 5 Fuel per attempting ship.
Home O is d6 plus scouting plus prior lost ships, threshold 9. Deluxe N uses
15 Materials and five completed technologies, preserving its other exact
source-face requirements; Deluxe O uses threshold 8 without loss bonuses.
Verify the exact source faces before implementation and do not mix clauses.

The existing SUCCESS/P app and canonical paper owners retain implementation,
coordinated by the checkpoint parent. Separately proposed facilitator policies
remain unselected. The [acceptance impact](PC10_PARITY_ACCEPTANCE_IMPACT.md#owner-selected-home-no-default)
requires edition-bound consumer RED, independent review and relevant rendered
and gameplay evidence. Older N/O observations retain their original bindings;
this planning/catalog amendment grants no closure or new Home outcome credit.

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

The subsequent canonical paper handoff is delivered locally with paper-only
independent content/layout acceptance. Its exact original-clause alignment
is recorded in [the PC10 acceptance impact](PC10_PARITY_ACCEPTANCE_IMPACT.md#owner-selected-home-no-default):
Home's four displayed crosses include any original mark once; both N variants
use Engineering Shuttle and 5 Fuel per attempting ship; Home O's loss bonus
counts ships lost earlier in the same attempt sequence, for subsequent rolls
only. Paper acceptance is not app acceptance. At the paper-only handoff the five conditional
house-rule gap-fillers were pending; the subsequent separate approval below governs.

## October 8 owner-approved house rules

Emerald's direct “go for it” response (`Sentinel_cdb7e2735ee4819188a584d06e6b3756`)
to proposal `Sentinel_a0dcb330864c8191bbd5b06981f753b7` approves these five
clearly labeled house rules for app and local canonical paper. They fill
unspecified cases; they do not claim original-author intent.

| Rule | Approved behavior and boundary |
| --- | --- |
| Nonparticipating targets | Reroll targets that are not participating. Preserve exact source targeting exceptions and the Capybara override. |
| Finite mission deck | Recycle resolved mission discards only when needed; leave undealable extras undrawn. Do not recycle unresolved/in-hand cards or invent extra cards. This is not a Wolf or damage-deck carryover ruling. |
| Split pursuit | Track separated groups' pursuit individually; adjudicate exceptional merges before they affect play. Preserve normal documented merge policy and source exceptions. This does not select net-depth versus cumulative outward-jump arithmetic. |
| Unspecified half-losses | Round unspecified half-losses down, preserving explicit exceptions, including printed emergency-jump rounding. Do not apply this rule to fractional Boa opportunity difficulty or invent range/tie conventions. |
| Unfinished Wolf Commander action | Keep the optional unfinished action unavailable until the GM records its consequence. Preserve the printed effects and actual phase/role authority. No automatic default death, capture, escape or other consequence is approved. |

The canonical main PC10 parent owns app changes and coordinating existing
helpers; the canonical-kit task owns local-only documents. Avoid overlapping
writers. Each functional correction requires meaningful consumer/backend RED
in a separate test-only commit, GREEN, independent exact source review and
final relevant rendered review. Current authority/privacy, cost accounting,
replay/recovery and explicit source exceptions remain gates. The GM records a
real adjudication where required; ordinary calculation remains server-owned.
Request a bounded parent runtime allocation only when source-ready.

Prior observations retain their exact source binding; these planning updates
alone add no implementation, native evidence, fixed catalog closure or release
acceptance. The fixed 48 PC10 rows and all 751 statuses remain unchanged. Other
source disputes outside the five approved scopes remain unresolved.

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

| Checkpoint | Assigned newly closed IDs | Cumulative closures from the fixed 293 | Remaining from that set | Overall done target* |
|---|---:|---:|---:|---:|
| PC05 | 49 | 49 | 244 | 507/751 |
| PC06 | 49 | 98 | 195 | 556/751 |
| PC07 | 49 | 147 | 146 | 605/751 |
| PC08 | 49 | 196 | 97 | 654/751 |
| PC09 | 49 | 245 | 48 | 703/751 |
| PC10 | 48 | 293 | 0 | 751/751 |

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
Later UI themes can span multiple owner tours;
the former PC06–PC10 titles are no longer numerical scope limits. The PC05
allocation is the next scope; later tranches are candidates until
shaped. A documented same-count substitution may move an unstarted ID only
with its dependencies satisfied and another baseline ID replacing it; it
cannot change any cumulative target or lose any baseline ID. P605a's existing
owner deferral must be resolved explicitly before closure; it remains in the
baseline and cannot silently disappear from PC10's obligation.

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

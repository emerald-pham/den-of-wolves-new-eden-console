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
supported authenticated access for live proof; do not bypass security or
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

## Historical UI-cluster playtest route — superseded allocation

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

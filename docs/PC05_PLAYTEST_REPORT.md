# PC05 — Gameplay completion and station recovery

## State and fixed scope

Work authorized on 2026-09-28; implementation and proof in progress. Opening
count: **458/751 done; 0/293 baseline closures**. PC05 requires its 49 assigned
IDs in the [recovery plan](CHECKPOINT_COMPLETION_PLAN.md), for **507/751 done**
and **49/293 baseline closures**. No completion credit is claimed by this shape.
The three owner regressions PC05-F01–F03 are required before full release.

## Problem and boundaries

Prior checkpoints exposed useful interfaces while leaving their complete
gameplay acceptance unproven. PC05 finishes the assigned science/scouting,
setup/onboarding, maintenance, and jump tranche, reconciles existing integrated
work before building missing behavior, and fixes station recovery and DRADIS
contact timing. The original attack-dashboard-only allocation is superseded.
Other checkpoint IDs remain outside scope except genuine blocking defects;
no fixed assigned ID may be silently deferred or replaced.

## Source and proof decisions

The current private source index and provenance inventory are available.
Specific rules decisions require their routed component/guide evidence before
implementation. Existing decision holds for rations, jump distance, failed-jump
damage, Wolf assignment and onboarding copy are being re-evaluated under the
standing source-backed assumption policy. No new gameplay assumption is yet
claimed. Ordinary authenticated facilitator access is being checked early.
Cached screens, emulator tests, and synthetic review scenes do not establish
ordinary production gameplay.

## One-sitting owner presentation

1. **Recover a station:** after a rejected stale-station reconnect, am I back
   at station selection with a clear request to reselect my role? Can I enter
   an available authorized station and return?
2. **Read DRADIS:** do names first appear on the corresponding visible
   contacts? Does minimized DRADIS offer Zoom, with clear expand and return
   controls at phone, desktop, and short landscape sizes?
3. **Start and learn:** can the facilitator see genuine setup blockers and
   start a valid confirmed roster without requiring every seat to be filled;
   can a new player read their private brief and complete a real first action?
4. **Research and scout:** can the Scientist follow current research prices,
   available choices, field upgrades, device use, and private scouting results
   without learning another ship's undiscovered coordinates?
5. **Maintain and jump:** can players follow independent rations, maintenance
   outcomes and recovery, authoritative jump costs and results, and a retry
   without duplicate spending or movement?

Agents own source correctness, exact-once/replay, wrong-actor denial, privacy,
concurrency, resource math and ordinary authorized gameplay. Owner UI review
is optional and cannot waive those checks or the numeric target.

## Internal delivery and known risks

Reconnect and DRADIS repairs have separate owners/checkouts; one parent owns
integration and release. Behavior tests are committed failing before code.
Shared-state/callable/rules changes receive independent Sol review. Rendered
phone, desktop, short-landscape and reduced-motion checks cover changed UI;
font and ticker release gates remain required where applicable. Reconcile the
49 acceptance records against exact source/test/live evidence, complete missing
implementation, then update catalog facts and regenerate views. Full PC05
release requires all three repairs plus all 49 assigned closures. Interim
releases, if necessary, must be labeled interim.

## Evidence and test inventory

Pending. No new done statuses, deployment, or ordinary gameplay proof claimed.
Every changed test and its reason, exact release commit/build, new versus
recovered closures, remaining shortfall, and cleanup disposition will be
recorded here as work reaches those boundaries.

### Setup and onboarding candidate evidence

The owner explicitly approved automatic Wolf designation with fewer real
holders than the configured target (including zero), and approved the exact
Wolf-humanity sentence. Test-first commits `97cc361f`/`3bbb0c56` cover the
sentence, `f2cf2a90`/`86d274a2` cover zero/partial/full start occupancy, and
`ef846f92`/`26fbcf57` constrain ordinary manual Wolf designation. The current
combined setup, Wolf and loyalty suites pass 180 focused tests; the Functions
build passes. Existing optional-loyalty configurations retain their separately
validated explicit setup, and existing exact authenticated receipt replay is
preserved. The receipt now distinguishes configured Wolf target from actual
assigned holders. Its existing UI assertion was updated separately to reflect
that approved distinction; no test was removed or disabled.

GM access was successfully authorized through the released app's normal
Settings flow. Credentials are not repository artifacts. Live proof is still
pending; authorization alone does not close any prompt.

### Owner-requested campaign policy updates

Future PC05–PC10 execution now has standing autonomous authorization, optional
UI review, source-backed decisions, and no routine approval/transition wait.
A separate owner instruction restricts newly assigned agents to GPT-5.6 Sol
at low/medium/high/xhigh or GPT-6 Luna at max, while allowing existing agents
to finish. Test-only commit `16ca678d` updated model/effort and exact review
receipt expectations; `8091373a` updates guidance and matching validators.
All 29 guidance/coordination tests and documentation validation pass. These
policy changes contribute no prompt completion credit.

### Start observer and composition follow-up

Test-first `8c7ee64b` reproduced an unassigned connected observer blocking an
otherwise valid empty roster (`roles, seat-pointers`); `08d4fa80` permits null
observer pointers and derives private-loyalty coverage only from real holders.
Stale claimed seats remain blockers. The corresponding old rejection assertion
now names the actual seat-document inconsistency. The broad suite found 13
composition failures because its eight-player fixture manually designated a
Wolf in ordinary setup. That explicit-loyalty/Intelligence-Agent race fixture
now selects the supported optional Arbour configuration and supplies its
required card; all existing race, privacy and replay assertions remain. The
focused combined start/setup/composition run passes 143 tests. The earlier
broad run passed 5,887 tests with only those 13 policy-fixture failures; it is
not recorded as a passing final suite.

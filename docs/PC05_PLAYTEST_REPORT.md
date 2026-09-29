# PC05 — Gameplay completion and station recovery

New source-backed decisions: **PC05-A1** uses the printed full-die option for an
explicit GM failed-jump adjudication; **PC05-A2** spends the available fuel on
that exception when fuel is insufficient. The latter is a documented product
inference. Both cite Facilitator Guide v1.1, printed p. 16. **PC05-A3** records
a private acting-captain appointment when the confirmed roster has no Captain
seat, preserving its existing station and craft entitlements (printed p. 17).
**PC05-A4** uses actual replacement-role transfer for base small-craft captains
and explicit facilitator crew-replacement attestation for Voyage 33-0, without
fabricating a player (same printed p. 17). **PC05-A5** preserves the existing
one/two/three-plus jump-distance bands as an explicitly unverified compatibility
assumption because no primary numeric legend was found. See the
[assumption log](PRODUCT_MILESTONE_ASSUMPTIONS.md).

## State and fixed scope

Work authorized on 2026-09-28; implementation and proof in progress. Opening
count: **458/751 done; 0/293 baseline closures**. PC05 requires its 49 assigned
IDs in the [recovery plan](CHECKPOINT_COMPLETION_PLAN.md), for **507/751 done**
and **49/293 baseline closures**. No completion credit is claimed by this shape.
The three owner regressions PC05-F01–F03 are required before full release.
The active release goal batches every remaining locally verifiable PC05 change,
repair, release note, gate and exact review into one candidate before the next
CI/deployment run. A later run is allowed only for a failed gate, a
production-only finding, or the final evidence/catalog closeout that cannot be
truthfully written before deployment.

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
standing source-backed assumption policy. Failed-jump decisions are recorded
as PC05-A1/A2. The replacement ration tables have been located in the original
A4 Paper Duplex component PDF and are being implemented from its printed rows.
Ordinary authenticated facilitator access has been verified.
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

### Ordinary empty-session start repair

A fresh authorized production session exposed a gap hidden by prefilled test
fixtures: confirming a roster left an empty session in Lobby, and the start UI
required Casting. Test-first `dd5466a2` reproduced the complete empty-session
path. `29e37be5` refines the contract to explicit server confirmation rather
than forcing Casting early, which would lock otherwise supported vessel-mode
editing. The server now persists and projects `setupConfirmed`; a confirmed
Lobby session may reach the same strict authoritative readiness checks as
Casting. The existing UI becomes enabled on that receipt. No role selection
or fabricated holder is required. The combined create/confirm/start/composition
and full GM UI suites pass 263 tests; app typecheck passes.

### DRADIS integration

Parent commits `ebacf1d7` through `fd3ee866` integrate the separate DRADIS
owner's test-first repairs. Compact DRADIS says Zoom. Renamed contacts acquire
again, and labels share blip/drop fade timing. The real-render regression
measures effective visibility on production ContactPlot/ShipPlot across
normal/reduced motion, initial reveal, acquisition, repeat sweeps, rename and
post-fade. It passed 1440×900, 390×844 and 844×390; the worker's full unit suite
passed 2,499 tests with typecheck, targeted lint and build. Reconciled release
verification remains pending. The worker checkout is reused for the independent
jump tranche and remains active, so it must not be removed.

### Coordination gate reconciliation

At `933e6dbe`, the six focused metadata, scout-request, research cadence/writer,
shuttle cargo and jump-callable suites pass **151 tests**. Inspection confirms
fresh movement/jump, cargo and scout mutations deny Team or missing server
phase; Endeavour research is the printed Team exception and denies fresh
Coordination choices. Research and cargo exact receipt replay preserve prior
results without new spending after a phase change. Scout requests deliberately
revalidate their current authority before returning a result. This is scoped
server-test evidence for P100 and its dependencies, not ordinary live gameplay
or a claim that the entire PC05 tranche is complete.

The confirmation marker is server-owned (direct session writes are denied by
Firestore rules). Receipt and live snapshot projection coverage passes **345
tests**, including rejection of truthy non-boolean confirmation values. The
Functions build also passes for the empty-session repair.


### Maintenance integration in progress

Parent `dcc86114` integrates the completed one-GM alert acknowledgement,
one-time zero-population bonus, private VIP maintenance reroll and full-ship
mutiny recovery candidates through worker `afa4f77b`. The integration passes
355 focused server/start/composition/projection/panel tests and all 36
MaintenanceSystems UI tests; app typecheck passes. Captain replacement keeps
loyalties bound to player identity and uses a private, authenticated GM action.
The maintenance owner is completing the remaining denial inventory and exact
population-dependent ration cards. No maintenance prompt closure, rendered
acceptance, or release is claimed by this intermediate integration.

### Integrated ration tables and broader regression run

Parent `550339ab`/`d4f74ea5` integrates test-first population-dependent ration
tables from A4 Paper Duplex v1.1, physical pp. 41–44. The maintenance owner
verified the printed overlapping 50,000 boundary against Dione's component;
focused boundary coverage is recorded in the maintenance evidence. The worker
reported 165 focused tests and both app and Functions typechecks passing.
After integration, the parent ran the client/server population, maintenance
domain/callable and MaintenanceSystems UI suites together: **272 tests pass**.

The preceding integrated broad run passed 5,926 tests and failed one GM-console
assertion because the new mutiny panel adds a second status region. Test-only
`38e6ad65` selects the intended retry message and retains its status-role
assertion; that focused test now passes. This is not a final passing broad run.
No prompt closure or deployed gameplay credit follows from these local checks.

### Integrated Firestore access checks

At parent `405f94e4`, the isolated slot-2 rules run passes **141 tests across
four files**, including private scout requests/results, projection bootstrap,
Wolf audiences and stale GM access. The emulator exited successfully and shut
down. This establishes the tested direct-access boundary for this candidate;
callable changes arriving from the active owners still need their own focused
validation and independent authority review.

### Full-ship mutiny handoff and deployment preflight

Parent `f03f00c8` integrates the maintenance owner's sparse acting-captain
appointment and direct-action denial inventory. The combined mutiny, panel,
scout, mining, command, harvest, launch, President and Maliades suites pass
**198 tests across ten files**. Worker synthetic rendered checks at 320×844,
390×844, 844×390 reduced motion and 1440×900 found no clipping or horizontal
overflow. They do not substitute for ordinary gameplay.

P136/P137 remain open: the four base small craft and Voyage 33-0 use separate
unrest and host-operated maintenance. A new GPT-5.6 Sol owner is completing
their actual command replacement, lock and recovery in the reused maintenance
checkout. No existing agent was interrupted and no new checkout was created.

Deployment preflight originally failed on unmapped shared backend helpers.
Test-first `75fd5182`/`51aa1b44` and implementation `263edc64` add audited named
consumers; all 70 selector tests pass and the integrated candidate now selects
hosting and backend targets. The consumer list must be reconciled once the
remaining callable implementations land, before exact-candidate review.

### Deep Nebula boundary

The jump source audit distinguishes the later P551 special Deep Nebula attempt
from an ordinary damaged-drive roll. P332/P333 in this checkpoint require
exact-once private scouting markers and concealed totals; they do not pull
P551's separate loss/success procedure into the fixed 49 closures. Preserve
those server-only markers for P551 and never add their modifier to a generic
damaged-drive roll. The original Away Missions v1.1, physical p. 12, must be
reconciled with P551's catalog prior-loss-bonus wording at that later boundary.

### Reconnect integration and repaired acceptance

Parent `cf64a11c` integrates the structured invalid-station recovery, canonical
seat-document ownership checks, private projection clearing, stale-response
suppression and persistent station-selection notice. Initial combined testing
found 12 failures: shared module-scoped lifecycle cursors leaked across newly
added fixtures, and loading the stations chunk earlier changed the Press
first-load test ordering. Test-only `90c86af0` isolates scenario session IDs,
seeds the stale-reply cursor and preserves the loading assertion. `dd09f90b`
also prevents awaiting-re-role players from reclaiming historical seats.

The repaired integration passes **550 tests across seven files**: full client
session service, App, command errors, lifecycle, start, composition and resume.
The worker's four-size Chromium recovery checks and typecheck passed. An
independent GPT-5.6 Sol xhigh review is active against exact `dd09f90b` for setup,
reconnect authority and deployment mapping; this is not yet release approval.

### Broad integrated suite after reconnect

At parent `c3bbd386` (runtime code identical to the `dd09f90b` review target),
`npm test` passes **5,978 tests across 439 files**. This is the first passing
broad combined run after the reconnect and full-ship maintenance integration.
It excludes the still-active jump and small-craft follow-up candidates and
therefore is not the final PC05 release gate. No tests were disabled.

### Ordinary walkthrough preparation

Using the released 0.5.54 app's normal browser UI, a separate real player joined
the prepared verification session, and the authenticated facilitator assigned
that player to Scientist. The casting board returned `CASTING ASSIGNMENT
APPLIED` and `Assigned // Scientist`. This prepares the ordinary partial-roster
science walkthrough; it does not prove the unreleased start, onboarding or
reconnect changes. No direct database writes, synthetic account insertion or
attestation bypass was used. Both browser contexts are retained for the
post-deployment continuation.

### Independent review findings and repair candidate

The bounded Sol xhigh review of `dd09f90b` found four issues: returning join did
not apply stale-console clearing/reselection, incoherent open seats could
replace a foreign holder, command-error taxonomy changes stopped deployment
selection, and shared-helper maps omitted factory-created and mutiny consumers.
Test-first `a1d28bed`/`321d76c1` repair both returning-seat boundaries; **58
join/resume tests pass**. Test-first `50695451`/`728664a2` check the current exact
candidate rather than an earlier intermediate commit, cover isolated helper
consumers, and handle only the audited additive reconnect error taxonomy delta;
**73 selector tests pass** and exact-candidate target preflight succeeds.
The Functions build passes. Independent follow-up on `728664a2` is active;
release approval is not yet claimed.


The follow-up at `728664a2` confirmed the four repairs and found one additional
Press-specific notice omission. Red `a1e377f3` demonstrates both disabled Press
access and a foreign Press holder (two failures); `72034d75` propagates the
existing Press release decision into the returning-join reselection flag.
**203 join, resume and lifecycle tests pass**, and the Functions build passes.
Independent Sol 5.6 xhigh follow-up at exact `72034d75` confirms the remaining
finding is resolved, with no new finding in that bounded repair. The later
integrated jump and small-craft candidate still needs its risk review.


### Supplemental craft integration and deployment coverage

Parent `eff0ed30` integrates the PC05-A4 candidate `0a201dea`, following ten
separate worker test commits. The replacement-assignment fixture adjustment
was split into parent test-only `9704ddf0`: three observed failures require
normal assignment to clear `replacementStatus`, then the production change
passes. No assertion was removed. The integrated focused mutiny, small-craft,
Voyage, replacement, navigation and GM recovery suites pass **81 tests**.
The worker reports **5,993 unit/Functions tests**, **142 rules tests**, builds
and responsive rendering; its exact-candidate authority/privacy review remains
in progress. Those checks do not establish production gameplay.

Test-first `81c9148a`/`3bfb9f1a` add isolated deployment coverage for the shared
replacement, craft state, docking, Wolf authority and navigation guards.
Nine deployment tests initially failed; **78 now pass**. The navigation change
is accepted only as the exact pending-re-role exclusion, and the older P238
consumer set remains restricted to its exact historical module digest.
Other projection changes and unknown helper paths still fail closed.

An additional real player joined the prepared production verification session
through a separate Safari private window and completed the ordinary motion and
conduct acknowledgements. The app showed three connected participants and the
existing Scientist station as claimed/read-only. This is setup for post-deploy
multiplayer checks, not acceptance of unreleased behavior. The unrelated Safari
session was left intact.


At parent `f4df6ba4`, the combined `npm test` run passes **5,995 tests across
439 files** after supplemental craft integration. This includes the newer
reconnect/Press cases and confirms no broad integration failure before the
remaining jump candidate lands. No test was disabled or removed. Final release
validation and ordinary changed-behavior proof remain open.


### Supplemental review hold

Independent exact-candidate review of worker `0a201dea` is **not clear**.
It found that awaiting former captains can retain active loyalty actions and
private projections; some malformed pending-plus-replacement-role states still
pass action gates; malformed replacement eligibility revisions normalize to
zero; and the GM candidate list does not use authoritative eligibility. The
implementation owner is repairing all four with focused regressions. Historical
identity is retained, but must remain inert until a legitimate re-role.
The review's deployment-selector gaps were already addressed separately in the
parent's `728664a2`/`3bfb9f1a`; those parent changes were outside its worker SHA.
The passing local suites above do not waive these findings. Candidate 0.5.55
metadata is prepared at `b3edfd2b`, but no push, deployment or full PC05 release
is authorized by this evidence; implementation, exact review and live proof
remain required.


The released 0.5.54 facilitator casting service subsequently assigned the
second real player to Admiral and returned `CASTING ASSIGNMENT APPLIED`.
The prepared session now has real Scientist and Admiral holders plus its GM,
which supports post-deployment cross-ship privacy and normal action checks.
The accompanying screenshot still shows the old Read names control; it is
preparation evidence, not evidence that the required DRADIS release fix is live.


### Jump integration and deployment audit

Parent `a6885240` integrates the jump implementation after its four red-test
commits and separate test-only `da4f53c6`. That final test split verifies private
member event fields, denial of a second jump without writes/randomness,
emergency retry identity, and the corrected conditional damaged-drive readout;
the two placed-workspace assertions now follow the same readout. The observed
parent red run had **13 failures and 65 passes**. After integration, **458
focused tests across nine files pass**, with app typecheck and Functions build.
The normalized default `emergency:false` guard fixture is separately integrated
as `ee6e07e3`. The worker reports **5,932 tests across 437 files** and its full
responsive normal/reduced-motion matrix; independent integrated jump review is
active against `a6885240`.

Deployment tests `fa16f9ac`/`8b52b719` and implementation `7cf9ba57` cover the
exact jump guard transition, private member-event allowlist, damage helper and
new adjudication consumers. The historical PC04 test now reads its actual
historical source, using a sufficiently large buffer; it does not pretend that
today's expanded guard module is the old transition. A further transitive audit
found seven unchanged callable bodies consuming changed index-local authority
helpers. Test-first `d49402be`/`3ed5dc02` adds an exact source receipt for those
shared-helper consumers and rejects an unreviewed candidate delta. **84
selector tests pass**. The receipt must be re-audited after the outstanding
captain-authority repairs; local selector success is not deployment evidence.
All 49 assigned IDs now have partial implementation records. None is marked
done; the global catalog remains **458/751 done**, with 84 partial and 209 missing.

The last successful deployment job is GitHub Actions run `36466514603`,
at `0ba386f50689b375153ceee3b2eb11a9ecd19435`. Later successful workflow runs
through `7782840d` skipped their deployment jobs, so they are not deployment
baselines. The named-target preflight from that actual deployed revision to
`bb1f524c` passes and selects Hosting, Firestore and the audited Functions.
The baseline's index and request guards match the current-main versions used
by the transition audit. This is release preparation only; the candidate has
not been deployed, and the receipt must be refreshed after authority repairs.

Integrated candidate `2d3a65de` also passes the real-browser DRADIS regression
matrix: desktop 1440×900, phone 390×844 and short landscape 844×390, each with
normal and reduced motion for both ContactPlot and ShipPlot. The checks verify
hidden initial names, acquisition at the sweep, refresh and changed tracks,
and paired name/contact opacity through and after fading. These are local
production-component checks, not ordinary deployed gameplay evidence.

### Jump review repair boundary

Independent review of `a6885240` is **not clear**. Ten uncovered cases require
repair: pursuit-10 emergency access before terminalization; malformed stored
jump authority; exact failure identity; full available-fuel consumption under
A2; emergency projection and uncertain-result retry; atomic mutiny and receipt
replay; duplicate already-damaged drive consequences; shared navigation revision
monotonicity; stale callable replies; and preservation of an adjudicable failure
after an uncharged denial. The original jump owner is implementing focused
regressions and repairs in its preserved checkout. No release claim follows
from the earlier passing tests. The independent reviewer found no additional
private jump-record leak and confirmed retry-stable random draws by source
inspection; actual concurrent emulator evidence remains to be gathered.

### Captain-authority repair integration

Test-only `b3f8ec55` reproduces **15 failures / 431 passes** across 14 files
before implementation. Production `dfc8ca78` integrates the four repairs;
the same parent suite then passes **446/446**. The worker also reports
**143/143** rules checks and **6,007/6,007** unit/Functions tests, both builds,
typecheck, lint with no errors, and rendered phone/landscape/desktop recovery.
Independent follow-up remains pending. The parent deployment audit now traces
28 changed index-local helpers to 68 callable consumers, with none omitted.
Test-first `f1fad4b8` and mapping `4427ee13` include the three otherwise unchanged
Wolf Commander callables; **84/84** selector tests pass. No deployment or
production gameplay completion is claimed by these results.

The real two-vessel emulator test has additionally reproduced a same-origin
jump failure: after one ship commits, the other retries against its observer
log and reads the wrong arrival entry. The jump owner is repairing this with
the ten review findings. Concurrent gameplay remains unproven until the
actual transaction test succeeds on the repaired candidate.

Test-only `bd988886` adds the actual Firestore concurrency harness
`scripts/test-pc05-jump-concurrency.emulator.mjs`. Its worker run produced two
intentional failures: same-origin arrival selection after a real transaction
retry, and different-origin shared navigation revision **1 instead of 42**.
The latter first passed independent position, fuel, charge, vessel revision,
event, receipt, group, discovery and exact-replay assertions. The harness
overlaps real transaction callbacks and invokes the compiled jump callable;
it does not replace Firestore transactions with mocks. Run it again after
jump repair using the configured isolated emulator slot. Its original slot 3
reservation and configuration have been released. A4 independent follow-up
is now checking `dfc8ca78` while the jump owner repairs the failing cases.

Independent read-only deployment review of exact `523b1fcf`, from actual
deployed `0ba386f5`, is **clear** for named targets, fail-closed transitions and
transitive consumers. It originally reported 136 unique Functions; that
intermediate count is superseded by the actual-baseline receipt below, which
includes the later Ally and Maliades repair consumers. The review covered all
68 consumers of the 28 then-changed index-local helpers, matching source
receipts and no omitted live external-module consumer. Its independent selector
run passed **84/84**. The fetched main remains `7782840d` and is an ancestor of
this branch. This review does not approve future jump changes; their source
receipts and changed consumers require reconciliation.

### Pending-role follow-up and emergency-window regressions

A4 follow-up found three remaining cases: private Scout result/index access
while awaiting a role, malformed pending records retaining client authority
and accepting late replies, and expired-presence GM recovery candidates.
Tests `16cccd68` reproduce **11 failures / 429 passes**; separate `0fc7aa62`
makes new candidate fixtures explicitly connected so the test measures lease
expiry. Production `9ea5dfd5` repairs these cases. The integrated parent passes
**285 tests across nine files**, plus the targeted contradictory-pointer parser
case. The worker reports **6,017/6,017** full tests, typecheck, both builds and
lint with no errors. No rules changed, so the earlier 143 rules checks still
cover the unchanged rules. Existing named mapping already includes the changed
Scout module; actual-baseline deployment classification passes. Independent
follow-up of these three findings remains pending.

Jump test-only `bd055676` reproduces **18 server failures / 48 passes** and
**four client/projection failures / 213 passes** before repair. Separate
`ca663d12` adds pursuit-window transaction, projection, waiting and facilitator
decision tests. The owner's expanded red run has **22 server failures / 49
passes**, three client assertion failures, and the expected missing-component
failure before implementation. PC05-A6 records the source-backed optional
emergency decision before permanent pursuit failure. Both test tranches remain
separate from the pending implementation; no failing assertion was waived.

Server repair `9ffa5f41` now passes **74/74** integrated jump callable tests.
The real Firestore harness at `bd988886` also passes both cases against that
combined candidate: concurrent same-origin transactions retry against each
vessel's exact self-arrival, while different-origin transactions preserve
independent movement/resources/events and advance the shared navigation
revision monotonically with side-effect-free exact replay. The isolated
emulator reservation was released after the run. The exact deployment selector
currently rejects this changed index source as unaudited, which is the intended
fail-closed state until the final client/server candidate and transitive
consumer receipt are reconciled. Client, rendered and independent review gates
remain open.

Independent `9ea5dfd5` follow-up clears Scout and pending-role privacy but
identified one remaining GM presence type mismatch. Test-only `bb4a98c9`
reproduces **five failures / 281 passes** for malformed values versus truly
absent legacy data. Production `23e9ca17` preserves that distinction using a
GM-only validation marker and actual Firestore Timestamp validation. The
worker's **286 focused tests** and typecheck pass; the parent passes all **six
targeted projection/candidate checks**. Independent exact `23e9ca17` follow-up
is **clear**, confirming matching server type/45-second lease semantics and
no heartbeat or validity-marker exposure to non-GM members. This closes the
A4 review findings; deployment and ordinary gameplay proof remain separate.

### Pursuit-window authority and privacy repair

Independent exact-candidate review of `5a03cf8d` found three remaining release
issues. Fresh Endeavour ECM/research and Maliades repair writes could bypass a
pending pursuit emergency decision; the member-readable session exposed the
private split-group identifiers; and the deployment receipt undercounted the
actual named Functions. Test-first `428ce7b5` reproduces valid and malformed
pause bypasses, preserves exact committed replay, and requires a safe public
marker. Production `4e7d49ad` centralizes the pause guard across index-owned and
external writers, moves full authority to server-only and GM-only documents,
and joins the public marker to GM authority only when their type, status, cycle
and opening time match. The client tests cover either listener order and prompt
authority removal when the marker clears.

The repaired focused run passes **496/496 across seven files** and typecheck.
Deployment-audit repair `6d3f7466` accounts for the shared guard in the
Maliades prefix without weakening its fail-closed comparison; all **85/85**
selector tests pass. From actual deployed `0ba386f5` with verification baseline
`7782840d`, the exact selector chooses Hosting, Firestore and **138 unique named
Functions**, reports no unknown files, and confirms both baselines are
ancestors. These are candidate checks. Exact final review, the full release
gates, deployment and ordinary gameplay proof remain pending.

Follow-up review of `13888388` found that a GM-private deletion arriving before
the public marker deletion could retain the cached authority until the second
listener fired. It also reproduced 139 selected Functions and required the
receipt to distinguish the ECM activation change from the unaffected workspace
reader. Test-first `62764dee` reproduces the protected-first clearing race,
both attach and clear orders, the exact ECM writer mapping, and the release
count. Production `824b04a3` removes omitted private authority before matching,
invalidates a previously joined buffered authority when its public marker
clears, and narrows the exact pending-rerole navigation transition to its real
projection consumers. The ECM workspace reader does not import or call the
changed `playerShipId` projection path, so it is correctly excluded; activation
remains selected through its own pause-guard change.

The focused App run now passes **77/77**, the selector passes **87/87**, and
typecheck passes. The exact actual-baseline selector again reports Hosting,
Firestore, **138 unique named Functions**, no unknown files, current tip and
both ancestry checks true. This repaired commit still needs the reviewer's
exact follow-up and refreshed full release gates before release.

### Release-candidate validation

Independent GPT-5.6 Sol xhigh follow-up is **clear** on exact `5d1117a1` for
the pursuit listener race, public/private authority matching, the 138-Function
receipt, and the previously cleared server jump/authority findings. No
actionable findings remain.

The exact candidate passes **6,095/6,095 tests across 442 files**, **143/143**
Firestore rules checks, typecheck, production build and bundle budget, and
**87/87** deployment-selector tests. Lint has zero errors and seven recorded
warnings: three test-only dynamic type imports and four pre-existing hook
dependency warnings. The 751-prompt generated views, 915 dependency-evidence
records across 11 sequences, repository guidance, **61/61** font checks and
the two typography release-policy tests all pass.

Rendered proof passes 56 typography cases across seven surfaces and four
viewports in normal and reduced motion; the full ticker matrix passes every
responsive pending/ready state plus normal and reduced lifecycle captures.
DRADIS label/contact timing passes desktop, phone and short landscape in both
motion modes. Jump emergency/failure controls fit 320x844, 390x844, 844x390 and
1440x900 in both motion modes, and mutiny recovery fits phone, short landscape
and desktop. The real Firestore emulator passes both overlapping two-vessel
jump races with transaction retries, exact self-arrival selection, monotonic
shared revision and side-effect-free receipt replay. Emulator reservations are
released. These establish a reviewed local release candidate; deployment and
ordinary production gameplay remain separate gates.

PR CI on exact `7a513258` passed the full ticker browser matrix but then caught
a deterministic landing-graph regression: **1,874,127 raw bytes** exceeded the
unchanged **1,850,458-byte** budget. The same runner sample also exceeded the
DRADIS and mobile-frame timing caps, while the exact local reproduction measured
37.7 ms DRADIS p95 and zero long frames but confirmed the byte failure. The
repair lazy-loads the shuttle-only route and its template instead of including
them in the landing module graph. The unchanged P637 gate now passes locally at
**1,655,179 raw / 444,667 gzip bytes**, 40 ms DRADIS p95 and zero long frames;
the largest chunk remains **497,246 bytes** under its 512,000-byte cap. The App,
shuttle-route and shuttle-template suites pass **166/166**, with typecheck, lint
and the separate production bundle gate also passing. Refreshed exact review,
PR CI, deployment and ordinary production gameplay remain separate gates.

PR CI `36557497311` subsequently passed the exact `639217d1` candidate, including
the full unit, Functions, rules, typography, ticker, P637 and bundle gates. The
first main exact-SHA render runner for merge `8d836602` reproduced a narrower
runner-sensitive DRADIS breach at **158.8 ms p95** against 150 ms, with **7,838**
counted label geometry reads and 91 mobile long frames. A new deterministic
20-contact test recorded **68** label reads before the repair and now enforces
two exact reads per label. The follow-up batches those natural-fit anchor
measurements across the plot
and reserves the existing exact measured fallback for crowded or width-capped
labels, keeping names in the same synchronous render as their contacts. The
test now passes within **40** reads. Refreshed local P637 and render evidence is
green at **1,656,541 raw / 445,037 gzip bytes**, **33.7 ms** DRADIS p95,
**4,785** label reads and zero mobile long frames. The full ContactPlot suite
passes **57/57**, App/ShipPlot passes **92/92**, and deployed-shape DRADIS
rendering still passes every initial, sweep, refresh, renamed-track, fade and
reduced-motion check on desktop, phone and short landscape. Refreshed exact
review and main deployment remain open.

The follow-up candidate's duplicate CI runs exposed an ambiguous typography
sample: the `gm-section-title` probe matched either the global lazy-loaded away
mission panel or the GM route, depending on which subtree settled first. The
probe is now scoped to the GM console route. This preserves the PC01 comparison
and production styles while making the gate measure the named surface
deterministically; the exact browser gate must pass before the repair advances.

Main exact-SHA run `36568303547` passed every verification job for merge
`b88090cb`, including the repaired DRADIS performance boundary. Firebase then
updated Firestore and the selected Function revisions, but stopped before
Hosting release while setting IAM for the private Cloud Tasks worker
`parkShuttlesAtAirspaceClosure`; production therefore correctly remains on
`0.5.54`. The task provider already keeps an omitted invoker private, so
test-first `e29b5c3c` requires that default and requires release verification to
reject public invoker access on the selected worker. Production repair
`a78819cb` removes the redundant IAM rewrite while preserving unlimited deadline
retry, and extends the verifier to reject either `allUsers` or
`allAuthenticatedUsers` on that worker. Focused task and release-pipeline tests
pass **72/72**. The refreshed candidate passes **6,097/6,097 tests across 442
files**, **143/143** Firestore rules checks, both TypeScript builds, production
bundle limits, lint with zero errors and the same seven recorded warnings,
repository guidance, roadmap/dependency validation, **61/61** font checks and
the two typography release-policy tests. No PC05 deployment or gameplay
completion is claimed until a fresh reviewed commit passes deployment and
ordinary production checks.

Independent GPT-5.6 Sol xhigh review held exact `fbeb7267` before CI because
the changed task-handler module lacked an audited named-Function selector and
the private-IAM regression covered `allUsers` but not
`allAuthenticatedUsers`. Test-first `6bb4c66f` adds both boundaries; the
selector test reproduced the fail-closed unmapped-module error. Production
`2467700e` maps that module only to `parkShuttlesAtAirspaceClosure`. The focused
release suite now passes **61/61**, including both public-principal cases. The
real last-successful-deploy/last-verified baseline selector chooses Hosting,
Firestore and **139 named Functions**, includes the repaired private worker,
reports no unknown files, and confirms both ancestry guards. Refreshed exact
review remains required before the single batched CI/deployment run.

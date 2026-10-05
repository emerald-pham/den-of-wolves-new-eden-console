# PC08 post-completion bug audit — October 4, 2026

**Current disposition:** all ten historical findings below were repaired in
verified PC09 0.5.68. Their original OPEN labels, definitions and reproductions
are preserved as the PC08 audit baseline; current closure evidence is in the
[subsequent repair record](#subsequent-pc09-branch-repair-record).

This finite audit of released PC08 originally delivered audit/roadmap
documentation only. Gameplay fixes and future checkpoint implementation were
outside that audit delivery. The findings below had no fix or closure credit
at audit completion; the subsequent PC09 record supplies their current closure.

## Verified baseline

- Remote `origin/main` was `c2a527592354bae79414315970f86a2bd3c0ee90` before
  edits. Its runtime files match shipped source
  `2fae212a9b86d0daa5aef3797f4609abd02a618f` exactly; version is **0.5.67**.
- All 49 fixed PC08 catalog IDs were `done`; the release snapshot is
  **654/751 overall** and **196/293 campaign closures**. The catalog remains
  authoritative. Historical release evidence is not relabeled as fresh proof.
- [Candidate CI](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/37194562206),
  [deployment](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/37195666391)
  and the [closeout workflow](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/37199945190)
  were independently checked and succeeded at their reported SHAs. The first
  two bind the shipped source; the closeout binds `c2a52759`.
- The assigned older checkout's staged changes were preserved. Audit checkout:
  `/private/tmp/dow-pc08-bug-audit-20261004`, branch
  `audit/pc08-bugs-20261004`. The old PC08 thread was neither messaged nor resumed.

The owner read current `AGENTS.md`, `CLAUDE.md`, execution policy, canonical
catalog, checkpoint plan/milestones and PC08 execution, acceptance, playtest,
test-inventory, risk and assumption records. The installed `.agents/skills`
inventory contained only the unrelated HEY skill; no relevant audit skill was
available there. Local memories and the private source library were not modified.

## Bounded coverage and evidence

The owner examined DRADIS projection/parser/sampling, current identity and
snapshot authority, Union setup and recovery. Independent **Sol 6.1 Max**
reviewers separately examined range weapons/fighters and boarding/finalization/
carryover, with current source inspection and targeted discriminating probes.
They own neither future checkpoints nor implementation in this task.

Sanitized local evidence is retained under
`/tmp/dow-pc08-bug-audit-evidence/`; the audit report is the durable repository
summary. Existing checks and temporary probes remain distinct.

| Evidence | Result and limit |
|---|---|
| `owner/completion-baseline.json` | Exact runtime continuity, 49 assigned PC08 closures and 654/751 release catalog verified before changes. |
| `owner/dradis-client-controls-runner.log` | 281/281 checks across six client suites: ContactPlot, local contacts, current navigation hook/service, Firestore hydration and Union presenter. |
| `owner/dradis-native-controls.log` | 49/49 existing native navigation/Union callable checks. |
| `owner/rules-controls.log` and `owner/remaining-rules-controls.log` | All 157 existing Rules checks pass on the audit's isolated row: 139 main checks plus 18 privacy/nonmember checks. |
| `owner/authenticated-dradis-smoke.json` | Seven normal authenticated demo-emulator HTTP checks pass: setup, allowlisted current navigation/Union hosts, foreign group denial, revision denial, no player GM perspective, current-generation disconnect denial and same-identity reconnect. |
| `range/focused-functions-runner.log` and `range/focused-client.log` | Independent range controls: 219/219 native and 245/245 client/panel checks pass. |
| `range/probe-functions-final.log` and `range/probe-client.log` | Fourteen native probes: two producer/positive controls pass, twelve assertions for required behavior fail. Two client receipt assertions fail. These reproduce the open range findings below; they are not failures of the unchanged release suite. |
| `boarding/focused-functions.log` and `boarding/focused-client.log` | Independent boarding controls: 341/341 native and 226/226 client checks pass. These overlap some range controls; totals are not represented as unique tests. |
| `boarding/lifecycle-probes.log`, JSON receipts and `REPORT.md` | Four expected failing assertions and six passing controls establish the two boarding findings. The reproduction helper repeated that result and removed its temporary test. |

The HTTP driver first guessed `resumeSession.me` instead of its actual `player`
field, then omitted the required disconnect generation. These are preserved
driver failures, not product findings; the corrected normal requests pass.
Default Vite config bundling was sandbox-blocked through shared dependencies;
`--configLoader runner --no-cache` completed the client/native tests without
altering those dependencies. The native Functions build also passes.

This audit does not repeat the full release matrix, rerun the entire composed
twenty-player campaign or claim new production-GM, physical-device, performance
or rendered-browser proof. The release's authenticated gameplay remains local/
emulator; its deployed tour remains prepared presentation. Native probes test
the real handlers with in-memory transaction fixtures, not production traffic.

## Findings

P1 blocks ordinary attack progression in a supported state; P2 causes incorrect
persistence, results or recovery; P3 is a stale acknowledgement with no observed
extra mutation. A passed existing suite does not dispose of a discriminating
reproduction. All runtime findings remain **open**. No privilege escalation,
raw-session disclosure or duplicate cost/dice exploit was demonstrated.

### RANGE-01 — P1: a previously destroyed AEGIS freezes a later attack

**Area:** `functions/src/index.ts:24926–24929`, `requireWolfRangeState`;
automatic lifecycle catches its failure at `22661–22662`. A same-cycle AEGIS
maintenance record is required before checking that AEGIS is destroyed.
Consequently, other surviving ships cannot progress through the shared ranges.

**Evidence:** at cycle 2, a valid Long Range attack with destroyed AEGIS remains
at Long with either no maintenance or valid retained cycle-1 maintenance. The
identical native fixture with cycle-2 maintenance advances to Medium. See
`AUDIT_RANGE_DESTROYED_AEGIS` in the final native log, probe line 2489. The full
earlier destruction/declaration chain was not driven through HTTP.

**Repair/proof:** make the common reader accept the source-defined destroyed
state without demanding live-carrier maintenance; exercise a subsequent attack
with surviving sources. Affects P396/P449 carrier continuity and P445/P447/P448
shared authority. Repair before PC09 P492/P493 repeated-attack proof and P645.

### RANGE-02 — P2: Alpha/Bravo casualties return without rebuilding

**Area:** `functions/src/index.ts:25526`, with the same omission at `22741` and
`25312`. Combat persists only the attack's AEGIS fighter state. New attacks read
unchanged `session.fighterWingCounts` at `24597–24607`; declaration replaces the
attack at `20833`, and finalization does not decrement the durable counts.

**Evidence:** native Alpha Short combat starts with four fighters and rolls
1 and 6 for two committed fighters. Attack state reports three fighters and
one loss; durable Alpha remains four, revision zero. A fresh declaration-shaped
attack then offers four fighters in the real launch reader. See `AUDIT_RANGE_LOSS`,
probe line 2354. The intervening declaration is modeled; Alpha is exercised and
Bravo shares the inspected implementation. P452 explicitly forbids later use
of destroyed fighters, so this is not an inferred new rule.

**Repair/proof:** atomically persist losses once and prove ordinary later launch,
retry and authorized replacement construction. Affects P396/P452/P449 and
inventory consumers. Repair before PC09 P483 fighter rebuild and P645 proof.

### RANGE-03 — P2: the EO client rejects a successfully committed pass

**Area:** `src/lib/sessionService.ts:6662–6667`; native producer
`functions/src/index.ts:25242–25248` and `25302–25304`. The client infers a pass
only when both requested actions and returned hits are empty. A valid weapon
pass can resolve already targeted fighter hits and advance the range.

**Evidence:** an unchanged passing native control returns `choiceStatus:passed`,
a Medium fighter hit and the advanced Short phase. The connected
`commitWolfRangeActionChoice(1,12,'medium-range',[])` wrapper rejects that shape
as an invalid receipt. See client probe line 5064. Transport is mocked; no fresh
browser click is claimed. The demonstrated harm is a false error after commit.

**Repair/proof:** validate the explicit server choice and mixed-source result,
then cover the mounted EO action/reconnect path without rerolling or charging
again. Affects P451/P453/P457; include in existing PC09 P621 recovery acceptance.

### RANGE-04 — P2: the EO client rejects valid combined assignment totals

**Area:** `src/lib/sessionService.ts:6700–6703`; native total at
`functions/src/index.ts:25517`, fixed-target construction at `25438–25452`.
The server counts all committed contacts; the client compares that total with
only EO-requested contacts, excluding sources that already chose their targets.

**Evidence:** a native PDF Medium hit plus five EO missile contacts returns
`committedContacts:6` and advances to Short. The client wrapper expects five
and throws. See `AUDIT_RANGE_NATIVE_COUNT`, native probe line 2453, and client
probe line 5076. Native producer and mocked-transport consumer are separate
checks; the server transaction succeeds.

**Repair/proof:** reconcile the receipt contract for mixed precommitted/EO hits
and prove success and retry through the consumer. Affects P447/P451/P453/P457,
and the shared Boa fixed-target path P459. Include in P621 and P645.

### RANGE-05 — P2: removing a committed support holder strands the range

**Area:** `functions/src/index.ts:21347–21351`; automatic progression stops at
`22674`. Highwall/Gorgoneion/Boa saved commitments are compared with the current
holder. Removing or replacing that holder turns historical committed state
into an unsupported bundle, so EO cannot read/lock it and the range cannot end.

**Evidence:** commit Highwall use and Gorgoneion/Boa passes at Short, confirm EO
read, then set the Miner's normal kicked/disconnected representation. The native
lifecycle remains Short; EO lock fails without a mutation and read reports
malformed fighter choices. See `AUDIT_RANGE_SUPPORT_REMOVAL`, probe line 2422.
The GM kick endpoint itself was not exercised. A holder absent before commitment
already uses automatic-unavailable behavior; failure occurs after commitment.

**Repair/proof:** preserve deterministic treatment of historical choices while
enforcing current authority for new writes; prove removal/replacement through
normal endpoints. Affects P389/P454/P455/P459 and contradicts the removed-holder
handling documented at `PC08_RANGE_ASSUMPTIONS.md:41`. Repair before P621/P645.

### RANGE-06 — P2: member weapon results name the target before a shift

**Area:** `functions/src/index.ts:25490–25495`. Range math applies the Medium
target shift before damage, but the EO result publisher uses `inputs.roster`
from before that shift. The member projection forwards the inaccurate row.

**Evidence:** Alpha shifts contact 1 from AEGIS to Dione; EO assigns a missile
hit to that contact. Authoritative state says Dione, damage one, destroyed;
the missile result row says `targetId:aegis`. See `AUDIT_RANGE_TARGET`, probe
line 2380. No damage arithmetic error or privacy leak was demonstrated.

**Repair/proof:** publish the target from the authoritative resolved receipt and
verify the entitled member result. Affects P450/P457/P447. Repair before PC09
P474 immediate results and the composed P645 proof.

### RANGE-07 — P2: the Colonel's PDF reference retains launch-time losses

**Area:** `functions/src/index.ts:21442`, `persistWolfEscortState`; consumers
`src/lib/firestore.ts:3204`, `src/components/PdfEscortWingReference.tsx:66,145–153`
and `src/components/FleetSystemsWorkspace.tsx:158–160`. Combat updates private
PDF state but does not update its allowlisted `session.pdfEscortWing` projection.

**Evidence:** after native Medium pass and a Short roll of one, private state
is revision three, three fighters, one loss and both ranges resolved. The public
projection remains revision one, four fighters, zero losses and both unresolved,
even after member refresh. See `AUDIT_RANGE_PDF_PROJECTION`, probe line 2466.
Consumer binding is inspected; there is no fresh rendered-browser claim. Private
PDF durability is correct, unlike RANGE-02.

**Repair/proof:** republish only entitled PDF state atomically and prove refresh/
reconnect consistency. Affects P398/P457/P458. Include in P621, P484 aftermath
projection and P645.

### RANGE-08 — P3: old EO requests acknowledge a different current attack

**Area:** `functions/src/index.ts:25199–25200` and `25378–25379`. Role/berth checks
run, then saved results return before current cycle/attack validation. Unlike
source receipts checked at `23183–23192`, these saved replies lack attack identity.

**Evidence:** retry committed Long choices and assignments after changing only
the session cycle, attack cycle or same-cycle attack identity. All six native
variants return the old committed result; each verifies zero new writes and
entropy calls. See `AUDIT_RANGE_EO_REPLAY` / `AUDIT_RANGE_EO_ASSIGNMENT_REPLAY`,
probe lines 2400/2503. This violates the current-range-before-replay contract
at `PC08_RISK_REVIEW_BRIEF.md:186`, without an observed duplicate mutation.

**Repair/proof:** reject a request bound to another current attack/cycle, retaining
authorized historical retry within the same attack. Affects P445/P447/P448.
Include in P621 recovery acceptance, below the progression/persistence defects.

### BOARDING-01 — P2: a legal surviving Station blocks a later attack

**Area:** `functions/src/wolfAttackCarryover.ts:115–128`, especially line 116;
window consumer `functions/src/index.ts:19919–19925` and declaration consumer
`20408–20428`. The reader accepts only Wing IDs in `returningInstanceIds`, while
the current catalog at `wolfShipCatalog.ts:129` and producer at
`wolfCombatMath.ts:1047–1051` include surviving Stations under the existing
`next-attack` catalog rule. Their schemas disagree.

**Evidence:** native constructors create a legal cycle-2 composition of three
Stations, capacity 18. Production targeting/range math and native finalization
write a valid immutable `wolf-finalized-2` receipt containing all three Station
IDs. An active connected GM's fresh authorized cycle-3 window request then fails
with a malformed return manifest and no mutation. A three-Strikecarrier control
(capacity 15, no returning cards) uses the same path and opens cycle 3. See
`boarding/audit-boarding-station-producer.json` and `...-consumer.json`. Later
cycle transitions are seeded in the native harness, not a full HTTP GM run.

**Repair/proof:** reconcile the existing producer/consumer schema and prove a
legal later attack with mixed/surviving cards and once-only Wing return. This
does not choose or implement a new Station repetition rule. Affects the released
P469e/P470 seam; P471/P472 remain separate future acceptances. Repair before
PC09 P492/P493 repeated-attack proof and P645.

### BOARDING-02 — P3: crew defence replays an old attack's success

**Area:** `functions/src/index.ts:27263–27265`. Current player/berth authority
is checked, but a saved crew-defence result returns before the current boarding
snapshot/cycle/revision checks at `27266–27279`. Special boarding choices already
check active attack applicability before historical replay at `27567–27583`.

**Evidence:** an authorized XO commits two teams in cycle 1. In a valid seeded
cycle-2 boarding attack, native support/Commander passes and defence read show
two available teams and pending defence. Retrying the old command returns cycle-1
committed success while the current choice stays pending. No writes or dice
occur. Same-attack retry passes, and disconnect/replacement/berth-change controls
deny replay. See `boarding/audit-boarding-defence-replay-later-cycle.json`.

**Repair/proof:** resolve the attack-bound replay contract, rejecting stale
commands or explicitly distinguishing historical receipt lookup; preserve
legitimate same-attack retries. Affects P466/P467, with existing P477 aftermath
consuming their commitment; include applicability in P621. No stale mounted-UI
success, duplicate teams or unauthorized access was demonstrated.

### Reproducing the range findings

The preserved `range/probe-functions.test.ts` and `range/probe-client.test.ts`
copy existing fixtures and append uniquely named `audit-range` cases. Copy them
into temporary `functions/src/audit-range-authority.test.ts` and
`src/lib/audit-range-client.test.ts` at the reviewed baseline, then run:

```sh
node node_modules/vitest/vitest.mjs run --configLoader runner --no-cache --project functions functions/src/audit-range-authority.test.ts -t audit-range
node node_modules/vitest/vitest.mjs run --configLoader runner --no-cache --project unit src/lib/audit-range-client.test.ts -t audit-range
```

Failures assert the required behavior and distinguish the observed bug; the two
positive native controls bind the receipt producer and valid-maintenance case.
Remove the temporary copies afterward. The failing probes are retained as audit
evidence outside the ordinary passing suites, ready for test-first repair work.

Boarding evidence includes `boarding/audit-boarding-lifecycle.test.ts` and
`boarding/run-audit-boarding.sh`. Run that script with the audit checkout path
to create/remove a unique temporary Functions test. Expected result is four
red assertions and six passing controls, exit 1. The independent report explains
the legal producer chain and discarded Commander/RNG hypotheses; those exploratory
failures are not additional bugs.

## Planning contradiction corrected in this delivery

**PC08-PLAN-1 — P2, corrected:** `CHECKPOINT_COMPLETION_PLAN.md` still called
PC08 the next unstarted tranche at 605/751 and described the deferred P605a
obligation only as PC10's. That contradicted the release catalog, PC08 closeout
and literal PC09 allocation. The plan now identifies the 654/751 PC08 release
snapshot, PC09 as next, and P605a as an unchanged PC09 assignment whose explicit
activation remains required. Fixed IDs, targets and the P605a catalog row are
preserved.

## Follow-on order and PC09 readiness

PC09 is the next checkpoint; this audit does not start it. Its full fixed target
is still 49 assigned closures and 703/751. P605a remains `missing` /
`DEFERRED-OWNER` with `OWNER-APPROVAL-DEFERRED-VISUALIZATION`; its P433a prerequisite
is done, but that does not supply activation. Ready independent PC09 work may
proceed. Full numerical closure cannot be claimed while P605a is deferred.

| Order | Existing work and required repair/proof |
|---|---|
| 1 | Reconcile current range/carryover authority: RANGE-01, RANGE-05 and BOARDING-01. These can strand ordinary play. Repair the existing source seams before composing later-attack P492/P493 or recovery P621. New writes still need current actor authority; historical choices need deterministic treatment. |
| 2 | Persist Alpha/Bravo losses before P483 rebuilding (RANGE-02). Republish entitled PDF state (RANGE-07) before crediting recovery/aftermath projections. Ordinary GM correction is not replacement for normal combat accounting. |
| 3 | Reconcile mixed-source EO receipts (RANGE-03/04) and post-shift target rows (RANGE-06), then prove P474 results and P621 recovery through their connected consumers. |
| 4 | Address or explicitly resolve the attack-bound retry contracts in RANGE-08/BOARDING-02 within P621. Retain legitimate same-attack replay and prove no duplicated mutation. |
| 5 | Complete downstream P484 aftermath and P645 composed attack after their actual prerequisite behaviors, repairs and accepted proof are in place. Preserve all other PC09 source requirements and its fixed 49 IDs. |

P492/P493 are separate PC09 trigger obligations and supplementary scenarios;
ordinary scheduled attacks can prove the lifecycle repairs and P645 without
those two features as hard prerequisites.

The catalog annotates affected released rows with **open** finding IDs and adds
bounded acceptance/real dependency links to existing PC09 rows. Its `done` rows
and 654/751 total retain the historical terminal release accounting; they are
not a claim that these newly exposed paths pass. No prompt is marked newly done,
no finding receives fix credit, and the shipped version/changelog snapshot is
not rewritten. The dependency CLI reports catalog status/prerequisites, not
closure of this audit's bugs. The next PC09 owner must explicitly take the three
progression blockers and remaining repairs into its frozen scope before claiming
dependent acceptances. Independent ready work can proceed meanwhile.

After PC09, revise PC10 before its separate orchestrator begins. That revision
must include every-role solo play using two browsers, unlimited timers and a
real authenticated GM cycle 0 → 1, reusing existing functionality and proving
gaps end-to-end. A prepared-state tour alone is insufficient. Retain full-table,
game-loop and actual ending acceptance. Then continue the existing post-PC10
work; no PC11 is created. This task records that instruction without shaping
or implementing PC10.

## Delivery and resource state

The final independent Sol 6.1 Max documentation review confirmed finding
accuracy/limits, P483 mapping, fixed counts/membership and unchanged P605a. It
identified unnecessary P492/P493 hard dependencies on P645; the owner removed
those two edges and retained them as related scenarios. The existing aftermath
and actual recovery dependencies remain. This bounded correction adds no
gameplay or workflow gate.

This delivery changes audit/planning documentation and generated projections
only. No player-facing version/changelog change or runtime deployment is needed.
The owned demo runtime was cleanly stopped, and only its row-1 reservation and
configuration were released. Other checkouts, reservations and dependencies
were preserved. Exact final commits, validation and remote landing are supplied
in the task handoff; open runtime findings must not be described as fixed by
those documentation commits.

## Subsequent PC09 branch repair record

The historical audit above remains the record of the released 0.5.67 baseline.
The separate authorized PC09 task has now integrated test-first repairs for all
ten findings through its isolated owner branch. All exact permanent regressions
and qualified fresh ordinary acceptances are reconciled; the independent review
and bounded loading/deployment follow-ups pass. The fixed checkpoint allocation
remains 49 IDs, closing the verified 703/751 snapshot. **All ten original findings
are fixed; none remains open.** PC09 0.5.68 is published from `feec9189` with
[exact-main CI and production surface verification](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/37261134992). This is
publication evidence; exact native-only and authenticated/physical evidence
limits in the table below remain unchanged.

| Original finding | PC09 repair and permanent regression | Current ordinary evidence and limits |
|---|---|---|
| RANGE-01 | The common range reader handles destroyed AEGIS before requiring live-carrier maintenance; later-cycle/no-maintenance controls pass. | Destroyed-carrier progression is native handler evidence. The ordinary complete battle proof uses live AEGIS and does not masquerade as this exact destroyed-carrier reproduction. |
| RANGE-02 | Combat commits Alpha/Bravo losses once to durable inventory, and later launch reads that inventory. | Fresh strict ordinary gameplay retains Alpha 4→3→2 through two real Short losses, launches the second attack at three, then pays for an API build/exact retry and a separate Wing UI build to restore four. Eight earlier failed attempts remain preserved. |
| RANGE-03 | The EO consumer validates the explicit authoritative pass and mixed-source result. | Native producer/consumer regression covers pass-with-hits. Fresh complete composed gameplay uses actual EO choices and both same-identity browser recoveries; no exact pass-with-hits browser counterexample is inferred. |
| RANGE-04 | Combined assignment validation accounts for already committed source contacts. | Native exact combined-total regression and fresh composed authenticated mixed-source assignments are recorded separately. |
| RANGE-05 | Previously committed support is replayed deterministically after holder removal, while new writes still require the current holder. | Native exact removed-holder coverage passes. The connected proof retains committed support in the one lock; a new GM-kick-after-commit browser reproduction is not claimed. |
| RANGE-06 | Entitled result targets come from the immutable resolved range roster after shifts. | Exact old/new target comparison passes natively. Genuine authenticated Medium shifts are recorded without claiming a new exact browser comparison. |
| RANGE-07 | Every PDF combat transition republishes only its allowlisted member state atomically. | Exact private/member PDF-state comparisons have permanent native regressions. The earlier authenticated one-of-four survivor artifact was lost in the Mac reset. Fresh composed evidence proves current member projection/private Rules boundaries, without claiming that exact PDF comparison or rendered survivor counterexample. |
| RANGE-08 | EO receipt replay validates current cycle and active attack identity before returning success. | Native cycle/attack drift and write/entropy-zero denials pass; ordinary exact same-attack retries remain successful. No extra charges or rolls are observed. |
| BOARDING-01 | Carryover accepts the catalog's legal Wing and Battlestation survivors and binds the immutable audit/sequence. | Two actual attacks consume the earlier return manifest and return a surviving Battlestation. Real source-generated P finalization and same-cycle next declaration also pass. |
| BOARDING-02 | Crew-defence replay validates applicability to the active attack before returning historical success. | Native old-attack denial and zero-write/dice controls pass; genuine same-attack boarding retries remain successful. No stale mounted-UI success is inferred. |

The detailed commit and original connected-proof inventory is
[`PC09_AUDIT_REPAIR_HANDOFF.md`](PC09_AUDIT_REPAIR_HANDOFF.md). The subsequent
two-attack proof and genuine construction blocker are recorded separately in
[`PC09_AUDIT_REBUILD_HANDOFF.md`](PC09_AUDIT_REBUILD_HANDOFF.md). Current complete
workflow acceptance belongs in [`PC09_ACCEPTANCE_MATRIX.md`](PC09_ACCEPTANCE_MATRIX.md).
The PC09 independent review found nine additional bounded defects; those
dispositions and later acceptance repairs belong in
[`PC09_RISK_REVIEW.md`](PC09_RISK_REVIEW.md), preserving this audit's definitions.

The owner has since explicitly activated P605a and later superseded the
intermediate post-PC09 hold. The parent also owns a separately authorized future
PC11 for diegetic in-game rules, superseding the earlier no-PC11 planning
instruction. None of those later owner decisions rewrites the historical audit
or authorizes this PC09 task to implement a future checkpoint.

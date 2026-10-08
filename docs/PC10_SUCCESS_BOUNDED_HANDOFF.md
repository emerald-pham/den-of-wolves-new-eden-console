# PC10 SUCCESS source-ready handoff — October 8

## Revised sparse cohort and adapter — parent correction

The previous 13-identity unchanged-driver count below is historical helper
analysis, **not the revised allocation request or a product minimum**. Parent
requested adaptation around genuine actor entitlements. Source review establishes:

| Family | Admitted identities | Why each is required |
|---|---:|---|
| N | 3 | Real GM owns manual progression and scoped official ship control; ordinary Scientist owns Endeavour research; ordinary printed Engineering Shuttle owner creates the initial custody record. Use Shepherd Engineer/Black Sheep or Dione Engineer/Philia. An open unowned craft cannot be fabricated or transferred by GM to avoid that identity. |
| O | 3 for loss revocation; 2 for outcomes only | GM owns progression/scoped official ship work; Scientist creates real scans. An additional ordinary Admiral/EO on Aegis is needed only to prove the lost ordinary player's fresh actions are revoked. The new callback qualifies this stronger three-actor slice. |
| P | 2, conditionally sufficient | Real GM owns source threat declaration, scoped ship preparation and eventual Reactor choices; ordinary Wing Commander owns charged fighter/range choices. Empty EO/other seats use server-owned unavailable/pass/zero-team branches, not GM impersonation. Actual combat must leave at least 18 usable capacity; success is not guaranteed. |

Configured role count and actual admitted Auth count are separate. For N,
choose a legal configured roster actually including the selected Engineering
owner (the default 14-role joint-engineering preset does not include Shepherd
Engineer). A 13-role preset is one ordinary compatible choice with three Auth
actors; use normal setup/consent/casting, keep unused seats open. O/P can keep
the established legal 14-role configuration with their two/three actual actors.
Never create controller/persona accounts solely to satisfy the old helper.

Relevant source guards: `requireMaintenanceAuthority` and
`requireShipCounterAuthority` at index.ts 42068/37423 permit official owned-GM
work with actual per-ship write grants; jumpShip 20314 uses that authority.
Candidate writer 128–136 validates active joined actors and owned live GM;
candidate ship commands check the GM-capable ship authority. Research writer
240 requires actual Scientist/custody. Start 7059 and shuttleControl.ts 31
derive craft custody only from real printed role holders; GM transfer 7728
still needs a current owner. Combat 27681–27700 requires actual Wing/EO
players; it grants no GM role impersonation. Empty-owner branches 25315/27107
and zero-team defence 26320 support sparse P. **No active core-role rotation**:
assignment/release require unlocked lobby/casting under index.ts 5829.

`scripts/pc10-minimum-candidate-success.mjs` now provides a bounded callable
outcome slice using the sparse actors and official GM controls. It consumes
genuine source-produced Ring repair or Station liberation, uses current
actor/group/cycle/revision-bound workspace and requests, and stops at actual
activation/terminal publication. It supplies no die or outcome fields. It does
not instantiate browsers, accounts, emulators, role census or prepared state.
Compose its `readRoot` with the accepted authenticated GM SDK/root observer,
`selectGmShip` with the existing real scoped-grant control, and each surface's
`observe` with current normal member/GM authority (including canonical seat).
The callback passes `{deadlineAt, timeoutMs}` to those adapters; propagate it
into actual page/SDK calls and retain `pendingOperations` / exact
`pendingCandidateRequest` in the accepted primary-error-preserving cleanup.

Test-first sparse census RED is commit `921dad16`: after correcting the initial
fixture-shape error, the existing admission guard rejects missing full-roster
accounts with its exact census assertion. Initial sparse Station contracts
RED are `c059332f`, followed by adapter GREEN at `4e575067`. Independent review
identified original-deadline, workspace/authority binding, delayed terminal
publication and false old-Nebula reach credit gaps; all four observed RED at
`49ce1dc0` before repair, then all nine focused adapter contracts passed.
Final review found uncertain-request clearing before exact response validation;
its malformed-request/revision regression observed RED at `924e5379`, then
clearing moved after all receipt assertions/recording and all ten passed.
These are synthetic adapter/source checks. The N/O action routing was initially
included in the shared adapter draft without a distinct N/O transition RED;
do not claim a separate test-first N/O gameplay repair or acceptance from it.
Add focused N/O transition regressions before any further functional adaptation.
No product functionality changed and no historical product TDD is fabricated.

**Composition still open before fresh-family allocation:** the callback is an
actual source action slice, not a complete source-producing fresh runner. Wire
normal sparse setup/start and GM maintenance/charged paid arrivals; N real
Scientist research/materials/craft contribution; O zero-scout loss, subsequent
real scans and ordinary lost-player denial; P actual Wing combat with empty-seat
source transitions. The old full-roster combat resolver cannot supply that
sparse prefix. No simulated liberation/repair or old fulfilled disposition can
substitute. Interrupted original UI action retry/reload/replay, immutable
freeze/close and entitled closed history remain additional runtime checks.

Current parent next action is to acknowledge this revised 3/3/2 cohort and
explicitly allocate a bounded **composition/qualification** window only after
the missing prefix adapter contracts/review are ready. No fresh N/O/P proof,
P619 closure or runtime launch is claimed by this handoff.
The parent's subsequent canonical delegation message explicitly acknowledged
the first source handoff (`Source handoff received`) and required this revision.
That acknowledges receipt of the earlier handoff; it does not allocate runtime
or acknowledge the new 3/3/2 allocation request. App-tool lookup failure below
remains a route limitation, not evidence that the parent is unaware.

Worker scope: Ancient Jump Ring N (544–549, 647), Deep Nebula O (550–554,
648), Ancient Space Station P (555–559, 649), candidate explanation 563 and
candidate action/outcome recovery 619 only. The acceptance matrix remains
authoritative. No prompt status, fixed 48 closure, checkpoint or release changes.

Verified base: `519ef23006e3012f57d3bc9142bbb3bbf0b62052`.
Isolated branch: `pc10-success-20261008`.
Checkout: `/tmp/dow-pc10-success-20261008`. Supplied active checkout was read-only.
Only this report and `scripts/pc10-candidate-success-cohort.test.mjs` change;
there are no product, shared callable, UI, version or changelog overlaps.

## Existing proof and source readiness

Reuse the [qualified discovery/preparation and active Cycle 6 family](PC10_ACCEPTANCE_MATRIX.md#qualified-candidate-discoverypreparation-and-active-cycle-6--bounded-family)
at `84dc3c4e`: original scout recovery and 20 overlapping assertions remain
valid within their scope. The earlier Scientist research evidence is research
evidence only. No earlier discovery, preparation, relocation or checkpoint
claim proves paid N/O/P outcomes. A new fresh ending needs real prerequisite
state; creating that state is not a reason to replay its historical proof matrix.

Existing `runFreshCandidateManualProof` / `candidateEndingFor` provide finite
normal manual setup and three source-connected ending callbacks. Importing is
side-effect free. Keep their original-deadline readiness and real GM phase
controls; use the completed discovery runner's primary-error-preserving cleanup
pattern if composing a smaller ordinary-account slice. The older
`test-pc10-candidates-authenticated.mjs` accelerates clock state and is unsuitable
for manual full-game acceptance as written.

Focused Functions checks passed **42 tests** in four files: candidatePaths,
candidatePathsCallable, candidateAvailability and candidateStationLiberation.
These use synthetic/in-memory authority: they establish source contracts,
including private arithmetic, immutable terminal helper integration and exact
replay; they do not backfill authenticated gameplay.
Existing helper/readiness contracts passed **61 tests**. Source-fidelity and
mounted-reception contracts passed **21 tests** with
`node --experimental-vm-modules --test`. The initial unflagged invocation failed
module loading for those two files; no product failure or TDD RED is claimed.
The added three cohort tests verify printed presets and unchanged helper behavior;
they earn no Auth or gameplay credit. No functionality changed, so no RED/repair
chronology is invented.

## Smallest unchanged-driver cohort

Explicit options for each N/O/P run: `playerCount: 11`, `includePress: false`,
`capybaraEnabled: false`; Chart A for N/O, Chart B for P. The printed 11-role
preset supplies every current driver-required role and ordinary supported crew
for five active vessels (Dione disabled). Their undamaged Reactor capacity totals
19 (5+4+3+3+4), sufficient for P's 18 threshold. Presets 8–10 omit the required
Executive Officer. If a distinct Dione/six-vessel claim is requested, 13 is the
smallest compatible printed preset; 12 omits Executive Officer and 14/15 use
joint engineers unsupported by this helper's per-vessel lookup. These are
**driver constraints**, not server gameplay minima or scale justifications.

The unchanged minimal driver admits 11 named crew plus controller plus real GM:
**13 actual Auth identities**, two browser processes/contexts, zero humans.
Press, Dione, Capybara and full-table capacity are unnecessary to these ending
claims. The added three cohort contracts distinguish the five-vessel minimum
from the optional six-vessel configuration.
A smaller ordinary-account composition should reuse the reviewed two-actor
admission/phase runner, normal casting/berths and GM grants, then rotate actual
crew through legitimate assignments where permitted; its exact count must follow
required simultaneous entitlements, not fixture convenience. That adaptation
and its independent review remain unexecuted here.

## Exact runtime assertions still required

| Path | Legitimate prerequisites and remaining claim |
|---|---|
| N | Four real research cycles produce five distinct four-cross tracks (including paid advanced tracks); ten actual materials; available holder-owned Engineering Shuttle consumed once; charged ordinary arrival and five fuel per crossing. Reject incomplete/duplicate contribution and insufficient fuel without mutation. Explicit GM far-side sabotage after paid passage records left-behind ships and blocked pursuit; global ending waits for remaining groups. |
| O | Ordinary charged arrival followed by a later-cycle long jump. Zero scout credit gives a genuine loss because a server die alone cannot reach nine; loss spends fuel, zeroes survivors and revokes fresh vessel actions while another group stays active. Eight real entitled scans plus the real prior loss guarantee later reaches without supplying a die. Check actual private calculation audit, no repeat die/cost, final settled fleet and explanation. |
| P | Actual paid Station arrival produces source combat. Real GM composition and server combat finalization repeat while Wolves survive, and only the authoritative zero-survivor marker liberates it. Unique surviving available Reactors contribute current capacity; at 18 activate automatically, consume contributed vessels and preserve unconsumed choices. If no repeat wave actually occurs, 556 stays unproved; a capped random run cannot manufacture it. |
| 563/619 | Read actual immutable debrief path through normal entitled member views and reload. Retain an original candidate mutation whose reply is deliberately interrupted after durable receipt, retry the original UI intent and exact SDK request, verify unchanged receipt/revision/audit/cost/die/disposition/terminal timestamps. Wrong actor, foreign group, revoked actor/seat and payload collisions retain applicable denials. Existing ending callbacks only reload the debrief; they do **not** prove interrupted-action recovery. |

The existing N callback uses a real GM craft contribution; holder-origin
contribution requires the ordinary Engineering holder as a distinct check.
N's all-vessel crossing does not prove insufficient fuel/left-behind cutoff.
O's split group is physically partitioned before loss; a second peer/foreign
actor may be mounted for audience denials without adding a full census.
P's actual randomized waves must be reported as observed, never forced.
Any driver failure stops that slice before expansion; retain original diagnostics
and clean only fresh owned resources. No arbitrary chart relocation substitutes
for paid arrival, no gameplay state injection or clock writes qualify outcomes.

Independent Sol 6.1 medium review of the exact base found no concrete product
defect and confirmed the 11-role minimum. It classified the existing driver as
ready for a bounded ending probe, **not** full SUCCESS/619 closure. In addition
to the table, inspect durable Ring material/craft consumption and per-ship fuel
deltas, Nebula protected scan source identities/arithmetic and loss revocation,
Station authoritative combat/audit and consumed Reactor capacities, exact member
path/redaction, immutable snapshot under replay, GM close and entitled closed
history. A successful UI response or empty `details` count cannot substitute
for these witnesses. Retain the source-contract labels on all synthetic checks.

## Runtime allocation and preservation blocker

The parent subsequently supplied
`/tmp/dow-pc10-evidence/OWNER_PC10_SUCCESS_NOP_HELPER_SCOPE_HANDOFF_20261008.json`:
it confirms this scope/base, recharge's clean runtime handback, and no runtime
publication authorization. Recharge actual3 failed at Captain entry on navigation
epoch/resume receipt matching. Do not copy that failed observer contract into
this proof or invalidate discovery evidence. Freeze/debrief/close and entitled
reload plus applicable negatives are the requested ending handoff. Current
index/requestGuards release annotations need parent reconciliation if source changes.

No browser, emulator, Auth account, session or runtime reservation was created.
The canonical parent supplied in dispatch is
`01a113c4-8fd0-7734-8cab-3e39b01220f9`. Explicit initial request and one bounded
follow-up through the app messaging tool failed: durable/default route returned
`thread not found`; local returned `no rollout found for thread id`. Thus this
is **awaiting acknowledgement**, not an acknowledged dependency handoff.

Parent intervention: provide an accessible canonical messaging route, acknowledge
allocation ownership, and allocate exact source/runtime SHA, project, complete
emulator row, UI origin and finite sequential N/O/P window. Do not use helper
default ports or assume a free coordination slot is permission. Once allocated,
bind the compiled runtime hash and exact source SHA, freeze one fresh evidence
directory per run, then run only the agreed finite slice and its missing recovery
checks. Independent source review and final integrated review remain separate.

Retain this isolated checkout for parent integration of the report/test and
runtime continuation. Dependency symlinks point to the supplied active checkout;
do not delete their targets. No private evidence or credentials are committed.
Parent owns integration and eventual eligible worktree removal; no PR, push,
merge, CI, production deployment or checkpoint closure was attempted.

### First executable minimum cohort: fresh Ring (source only)

`scripts/pc10-fresh-minimum-ring-proof.mjs` now composes normal admission,
13-role manual setup with ten unused seats open, fresh ordinary Scientist
research across four cycles, official scoped GM maintenance/counters/jumps,
Engineering Shuttle commitment, six paid Ring passages, explicit far-side
sabotage, immutable debrief/close and same-UID member history reload.
The fresh research creates required state; it does not requalify the prior
20-choice discovery/preparation evidence. No product code or visual source changes.

The runner uses three distinct normally admitted Auth identities (GM,
Shepherd Scientist, Shepherd Engineer), two Chrome processes and three isolated
normal contexts. Its original total cap is 1,200,000ms, including a final
60,000ms cleanup reserve. Original paid-crossing interruption/recovery has one
60,000ms deadline. Admin is used for read witnesses and deletion of precisely
owned fresh session/account/pointer data, never gameplay state creation.
The setup deliberately uses authorized normal demo GM counter/repair handlers;
that preparation is recorded and does not establish ordinary-player resource
acquisition or balance claims.

Parent allocation is required before invoking:

```sh
node /tmp/dow-pc10-success-20261008/scripts/pc10-fresh-minimum-ring-proof.mjs --allocation /tmp/dow-pc10-evidence/RING_PARENT_ALLOCATION.json --evidence /tmp/dow-pc10-evidence/minimum-ring-1
```

The allocation JSON must contain `status: EXPLICIT_PARENT_ALLOCATION_GRANTED`,
absolute `sourceRoot`, a fresh `demo-...` project ID, loopback HTTP `baseUrl`,
three distinct `ports` (`auth`, `firestore`, `functions`) distinct from the UI
port, exact 40-hex `sourceCommit`, and exact 64-hex `runnerSha256`,
`compiledIndexSha256`, and `compiledTreeSha256`. Use the reconciled clean
source checkout and rebuilt server tree; obtain the complete tree hash through
existing `capturePc10Gate2SourceBinding(sourceRoot, absoluteRunnerPath)`.
The runner creates no server processes. Parent owns verified runtime startup
and allocation. Evidence directory must be new and outside the source tree.

Focused synthetic procedure/guard contracts are labeled synthetic and are
not runtime acceptance. Initial fresh-workflow RED was committed in `cc8b600c`,
implementation in `047e7318`; cleanup/full-tree binding RED `5ee644eb`, GREEN
`00f5e0d2`; concrete HTTP replay-shape RED `c951e82b`, GREEN `679b5214`.

Until a real allocated run passes, N/647 and the narrow 619 paid-passage recovery
remain unqualified. Low-fuel left-behind variants, new-request duplicate
contribution/passages, wider 619 mechanics, O/648 and P/649 are outside this
first executable run. Full ending presentation/typography acceptance remains
unclaimed; screenshots are diagnostic evidence only. No checkpoint closure,
release, PR, push or deployment is authorized for this helper.

Independent Sol review of the executable found maintenance rate-limit bursts,
second-precision Auth cleanup, unchecked browser failures and an unmeasured
noninterference assertion. RED commits `98e024f0`/`6c0fd0f3` record focused
regressions. Repairs pace ordinary maintenance calls 2,100ms apart within the
same cap (no bypass/retry), bind owned Auth cleanup against prelaunch census
and precision-aware creation time, require no collected page/remote errors,
and explicitly label wider noninterference `not-measured`. The final focused
suite has nine synthetic contracts; native execution remains untested.

### Allocated attempt stopped at CLI entrypoint (October 8)

Parent explicitly started the reviewed f9e0bcbd run. Slot5 was verified free,
exact Functions source built, and isolated Auth/Firestore/Functions plus Vite
started after the sandbox loopback EPERM was resolved through approval.
The documented `/tmp` CLI then exited0 with no output or evidence directory:
Node resolved import.meta.url to `/private/tmp`, so the original lexical path
comparison skipped execution. This is a harness failure, not gameplay evidence.
No browser, Auth actor, session or gameplay action launched; no N/619 claim earned.
Stopped at that first material failure and released only owned slot5 wrappers
and configured reservation; retained slot1/slot2 services stayed untouched.

A subprocess regression observed alias exit0 as RED (`d815defd`). The narrow
entrypoint repair canonicalizes argv and import paths with filesystem realpath,
then applies the same CLI argument validation. Both canonical and alias commands
now validate arguments, with all ten runner contracts GREEN. Native acceptance
requires a new exact-source allocation after this source change; the original
f9e0bcbd grant/hashes must not be reused for the repaired runner.

# PC08 execution record

Checkpoint, integration and release owner: orchestrator `/root`.

This is a chronological record. Later reconciled results supersede the earlier
pending boundaries while retaining failures, exact provenance and proof classes.

Authorized October 3, 2026: “Execute pc08 please, full authority granted to do
whatever is needed to get it done.” The opening catalog is 605/751 done and
147/293 campaign closures; exactly the 49 assigned PC08 IDs must close to
reach 654/751 and 196/293. No later checkpoint starts in this delivery.

Owner checkout: `/Users/emeraldpham/.codex/worktrees/0ce4/den-of-wolves-new-eden-console`,
branch `feat/pc08-execution`, baseline `ebbad230b815e6962e35f303cb529b5612e1d046`.
Coordination entry: `1791049923515-58261-8f794a72`, using the existing host-wide
ledger. Startup cleanup found only the root agent, no terminal child needing
results or closure, and no exposed close-agent primitive. The preceding PC07
thread is terminal; its command records are completed. Other chats and processes
are preserved. Storage inspection found 62.0 GiB available. Workers use dependency
symlinks to this retained owner checkout and claim their own isolated emulator
rows when needed.

## Frozen groups and integration boundaries

| Complete behavior | Fixed prompt IDs | Implementation owner and checkout |
|---|---|---|
| Range weapons and independently owned fleet fighters | 231, 389, 396, 397, 398, 443, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 455, 456, 457, 458, 459 | `/root/range_actions`, Luna Max; `/Users/emeraldpham/.codex/worktrees/pc08-range-actions/den-of-wolves-new-eden-console` |
| Boarding support, defence, destruction and surviving Wolf wings | 394, 395, 460, 461, 462, 463, 464, 465, 466, 467, 468, 469, 469a, 469b, 469c, 469d, 469e, 470 | `/root/boarding`, Luna Max; `/Users/emeraldpham/.codex/worktrees/pc08-boarding/den-of-wolves-new-eden-console` |
| Truthful DRADIS and complete shuttle/airspace recovery proof | 354, 355, 356, 357, 358, 359, 360, 423, 605, 644 | `/root/dradis`, Luna Max; `/Users/emeraldpham/.codex/worktrees/pc08-dradis/den-of-wolves-new-eden-console` |

Workers own complete implementation, source reading, red test commits, ordinary
repairs, focused verification and meaningful authenticated local/native/HTTP/UI
proof for their groups. They return commits, source assumptions, evidence and
remaining gaps. They do not push, open separate PRs, change release metadata,
close catalog rows, run candidate CI or deploy. `/root` performs useful owner
work in parallel, reconciles all three groups, obtains independent Sol review,
runs final validation, merges, pushes, verifies deployment and hands off.

Range work owns new weapon/fighter modules and the existing range choice
callables/UI. Boarding work owns new support/defence modules, boarding callables
and finalization. DRADIS work owns contact projection and plot/shuttle consumers
plus shuttle scenarios. Each worker may make narrow necessary adapters in its
isolated copy of `functions/src/index.ts`, `src/lib/sessionService.ts`, game
types and route workspaces; root reconciles these shared files. Range and
boarding workers agree interfaces before changing shared combat math: range
action/roll/assignment logic belongs to range work, boarding/finalization and
catalog destruction effects to boarding work. Do not replace the other group's
mechanics. Prefer new cohesive modules to broad shared-file rewrites.

All new requests bind current actor, role/vessel, session, cycle, expected
revision and stable request identity. Current server state owns resources,
charges, dice, targets, damage, losses, docking and group membership. Exact
retries preserve committed randomness, costs and receipts; stale/wrong-actor
requests fail closed. Entitled players make actual choices; deterministic
calculations advance automatically. GM details remain private, crew results
are audience safe, and Press publication remains explicit.

Parent-only dependencies require an actionable message to `/root` and an
acknowledged handoff before parking. Root triages and owns or returns the
action. Workers continue independent work; one long interruptible wait and one
bounded follow-up replace polling if acknowledgement is missing. Material
scope changes, blockers and requested handbacks use explicit collaboration
messages. No child coordinator or coordinator goal is created.

## Preparation and evidence boundaries

The transition review read the PC07 owner messages through the orchestrator
takeover, local-emulator correction and completed release, all recorded
PC07–PC10 philosophical decisions, feedback and existing assumptions. No new
mechanic or presentation correction requires future criteria changes or a
cooldown. The current PC08 authorization is the latest reviewed message.
PC08–PC10 retain fixed membership/targets; P605a remains separately deferred.

The seven archived v1.1 PDF artifacts were inventoried and their checksums
match SOURCE_PROVENANCE. Both Capybara files are complementary. Workers inspect
their routed derivatives and visually check the relevant primary sheets; all
private source files/renderings stay outside Git. Printed component sheets
control their named craft/mechanic. Source gaps and deliberate extensions are
recorded in PRODUCT_MILESTONE_ASSUMPTIONS, never attributed to print.

Authenticated local/emulator native, HTTP/UI and rules proof establishes
gameplay under the October 2 owner correction. Prepared review scenes establish
presentation only. Independent review, final validation, CI, production
deployment, actual deployed access and physical-device claims stay separately
labeled. A synthetic scene or pure unused helper cannot close a behavior ID.

The combined owner checkout has configured emulator row 3; workers retain their
own rows and all other reservations remain untouched. The range/boarding seam
preserves exactly three ordered immutable range receipts, one per range. Each
range decision aggregates the entitled sources' genuine choices before one
server-locked roll/assignment batch; finalization consumes that post-range roster.
Alpha and Bravo launch choices are independent and recorded during targeting.

An attack can cross the deployment boundary after a legacy range has committed.
A contiguous old receipt prefix with no target shifts preserves the initial
targeting/C&C map; subsequent new snapshots must validate its carried targets.
Legacy receipts after a new-format receipt and snapshot-less nonempty shifts
fail closed. This preserves genuine in-progress attacks without permitting
invented target history. Both range progression and finalization test the seam.

A full-page check of original A4 single-sided page 36 and double-sided page 81 reconciled an
extraction interpretation: both AEGIS Alpha/Bravo and the PDF Escort Wing use
at most one Short Range die per fighter, hit on 3+, and lose a fighter on 1–2.
The existing P452 catalog rule is retained. Private renderings remain external.

Root owns the existing Maliades member-session privacy repair identified by the
range worker. Members receive validated damage, revision, attack identity and
range-completion markers; target IDs, rolls and detailed consequences stay in
private receipts and GM state. Hydration filters the operational DTO again
without dropping its repair revision. Test-only commits b80bc6d7/f39e5680 precede
implementation 10e1c5f2; focused privacy, repair, parser and hydration checks pass.

The owner supplies the five-step real-component review scene and final report.
The every-craft playthrough exposed the eight-player Union setup gap: existing
policy required an explicit facilitator starting-host choice, but no normal
authenticated path established it. Root adds the bounded setup choice for
Wobbly and Ally, preserving printed paired-host restrictions and role ownership.
The transaction changes only initial docking/history, the private starting
manifest and setup revision; ordinary start derives owner control. Test-first
commits 4b051fb5/47046997 precede b4c17fa8/9b591e62. Dradis owns the normal
eight-player setup/travel/recovery proof; no admin seed substitutes for it.
Final catalog closure, version/changelog, deployment consumers and release
records are reconciled once after worker integration. The acceptance matrix
tracks every ID and current gap; completion remains pending until all gates
and exact-main deployment pass.

## Connected integration ownership

The orchestrator took the complete Enriched Warheads and PDF Escort/Maliades
range API, live console and client-authority groups after the range worker
identified their missing connected consumers. Range retains the combined range
collectors, three EO handlers, automatic range progression and the complete
Highwall/Gorgoneion/Boa source group. Boarding retains its actual multi-target
reroll/finalization repair and normal authenticated survivor consumer proof;
DRADIS retains the standard and Union craft playthroughs. These are acknowledged
bounded handoffs; checkpoint/release ownership remains with root.

The actual live flight and enriched panels also needed stable subscription
callbacks. A new mounted asynchronous-read test reproduced the disappearing
controls in AEGIS wings and enriched warheads, and the new escort panels. The
repair changes their callback lifetime without changing shared authority rules.
Twenty-seven focused client checks and TypeScript pass after this integration.

The remaining boarding-finalization repair transferred from `/root/boarding`
to `/root/boarding_repair`, Sol 6.1 at xhigh, after acknowledgement and parking.
The fresh authenticated max-team reproduction at `e5799bac` reached four
committed defence targets and all required special choices but did not
finalize. Its failure evidence and original branch are preserved outside Git.
Sol continues in the existing boarding checkout from the reconciled owner
source, retaining isolated row 4, and owns the bounded lifecycle repair and
normal next-attack survivor consumer. It is not the final independent reviewer.
The DRADIS worker completed its standard and Union proof handoff and released
only its owned row 5 processes and reservation. Range continues its remaining
supporting-source APIs and safe Short Range coverage guide on a continuation
branch from the reconciled owner source.

The normal next-attack consumer exposed a shared Team-boundary defect after
Quellon's destruction: legitimate retained Hummingbird/Condor custody was absent
from the docking-only manifest check, permanently blocking advance. Root owns
the narrow boundary repair. It validates retained craft against the printed
manifest, actual destroyed host and exact current custody without redocking
or restoring their movement. Test-only `2ab9ff0b` records two discriminating
failures before the source change; 280 focused lifecycle checks pass. This
repairs the already implemented retention contract and the PC08 next-attack
consumer, with no later-checkpoint feature or additional catalog credit.

The freshly restarted normal boarding consumer also exposed a launch-parser
seam: completed Refinery maintenance stores legitimate unrest metadata which
the older strict Fighter Bay allowlist rejected. Root owns the narrow parser
repair and unavailable-cycle classification. Test-only `8ae4ef90` records six
discriminating failures; 163 Bay, Declaration and Range checks pass afterwards.
Unknown fields and malformed paired metadata still fail closed. The consumer
will resume on a freshly compiled and restarted emulator; earlier runs that
loaded an older module remain historical evidence, not current-source proof.

The complete fresh root DRADIS run at `b49d3434` now passes all nineteen checks:
normal twenty-player setup, fifteen standard craft, normal eight-player Union
setup and both Union craft, current private transit/contact projections,
restrictions, attack parking, exact retries, reconnect and eight viewport/motion
cases. The same first-acquisition objects complete their full 1.12-second sweep;
there are no browser or presence failures. Its current result and runtime
attestation are in `owner/authenticated-dradis-complete/` and
`owner/authenticated-dradis-runtime-attestation.json`. The earlier terminal
Union-label failure remains preserved.

Sol's bounded boarding work completes at `243a0678`. The current authenticated
eighteen-player consumer destroys Shepherd, retains Endeavour and Black Sheep
without redocking or new battle registration, advances through the next Team
boundary and declares a legal later attack. Nine surviving Wings enter that
attack once; destroyed Wings are excluded, the retained control revisions stay
unchanged and every earlier range/calculation/finalization receipt stays
immutable. The declaration repair accepts exactly one valid docking, transit
or retained-custody source from the actual printed manifest and excludes wrecked
hosts. Four discriminating failures precede the repair; the root's 223 focused
Parking, Maintenance and Declaration checks pass. Sol's row 4 processes stopped,
its terminal result was retrieved and only its own reservation was released.
Both original and repair branches, external evidence and dependency symlinks
remain preserved under root ownership until release.

The Range continuation completes at `170aef7e`; root integrates its seventeen
test-first/source commits through `ec95ecbd`. Highwall, Gorgoneion and Boa now
have current-holder read/commit callables, mounted player controls and the same
single range lock as all other sources. Boa spends one current cargo Scrap only
on use; retries bind the current actor, console, source host/control revision
and attack cycle. The EO's safe Short guide exposes each hit's damage and only
the remaining mandatory Wing coverage. It does not reveal the private roster.
The worker reports 329 focused checks and builds/typecheck; root's reconciled
156 native range/declaration checks and 277 client/presenter checks also pass.
Thirty-two metadata/ship-template checks and focused lint pass. Row 2 is
released; both Range branches, its checkout/configurations and shared dependency
links remain preserved under root ownership.

Root's last destroyed-AEGIS check exposed a new-cycle launch classification
error: a wrecked carrier could wait for a charge from its prior maintenance
cycle. Test-only `fab9d4ea` produces two failures with 63 existing cases green;
`debe5c4b` classifies actual destruction before the healthy-carrier charge check.
All 65 focused cases pass. Fresh launch stays denied, malformed damage remains
an error and no choice, cost, entropy or shared write is fabricated.

The complete support tour uses the actual presenters, two source-defined
one-damage Wolf Wings and per-hit damage. Test-only `d67d8701` produces two
failures with 17 existing scene cases green before `5c7643ec`; all 19 scene
cases now pass. The final eight-case browser matrix is extended to exercise
Highwall/Gorgoneion/Boa, once-only Scrap and mandatory Short coverage, including
the actual pending controls' touch geometry before they are consumed.

The first fully integrated twenty-player run at `5c7643ec` proves four-source
launch, paid warheads, actual transit parking and normal Boa cargo/retry, then
fails at the Gorgoneion range gate. That gate incorrectly required a replacement
Captain to appear in the core setup role roster. Test-only `10ff7fcc` reproduces
the native denial and missing mounted panel with 85 existing cases green;
`fb084331` uses actual optional-ship admission and current unique Captain/host
authority instead. All 87 cases pass, including denial after role removal.
Attempt 9 and its runtime attestation remain preserved. The resumed traversal
uses newly compiled Functions and a complete emulator restart.

Attempt 10 then rejects an ordinary EO assignment containing Boa's already
fixed target. Test-only `a8cfe766` extends the source DTO check through the actual
assignment handler; `2a3e568e` offers only editable locked hits while preserving
every fixed strike in the private receipt. `6c18038e` compares the established
canonical final dice fields, which intentionally omit lock-only damagePerHit;
the first overly strict serialization assertion remains a preserved failure.
All 157 focused checks pass. Attempt 11 now completes all three ordinary ranges,
paid source choices, disconnect/reconnect and same-dice assignments, then reaches
all genuine boarding choices. Its finalization fails with a malformed committed
audience result; no complete-attack or release claim is made from that attempt.

After these two substantive combined-source repairs, the remaining composed
acceptance transfers to bounded Sol 6.1 xhigh `/root/composed_repair`. Root parks
the server/client-transport seam and retains checkpoint/release ownership.
Sol reuses the closed Range checkout on `feat/pc08-composed-audience-repair`
from exact `2a3e568e`, preserving the original branches and unique files. Its
new entry `1791080189632-43337-74f65b8e` owns free row 2; root's row 3 is untouched.
The diagnosis identifies legitimate missed/unused support summaries with no
target, which the strict audience parser rejects. The agreed repair permits a
null target only for the three named range sources with their public labels,
null bearing and exactly zero damage, including the actual client parser.
Hits, boarding results, privacy and malformed-input denials remain strict.
This repairer cannot provide the independent final review.

The finished tour separately passes the complete eight viewport/motion cases,
actual pending support-control touch geometry, printed one-damage Wing coverage,
Zoom, keyboard and phone/desktop parent navigation, with no errors or live writes.
`owner/final-scene-render/` retains all five steps and special interactions.
Root visually inspects the composed phone support and Short assignment captures;
these are prepared presentation evidence, not the missing finalization proof.

## Reconciled final candidate

Sol completes the bounded composed repair at `98f08cf7`, after test-only
`28955aff` and `d00c258d`, source `c719c232`, then harmless test/harness lint.
Six discriminating audience failures precede the exact null-target repair;
138 focused checks, typecheck and Functions build pass. The fresh authenticated
twenty-player run passes all ten checks, all ranges and genuine boarding,
atomic finalization/reopening, final replay, actual Starlight departure and
private Rules denials. The actual browser member subscription receives revision
41 with 41 safe results, including three genuine targetless misses. Browser and
heartbeat failures are zero. Root acknowledges the completed proof and takes
integration/release ownership; row 2 stops and releases only its own resources,
preserving its branch, configuration copies, evidence and dependency links.
Root integrates the four ordered commits as `a37a828d`, `35d4fad7`, `de4d1c5e`
and `b00a6f72`. The final lint-only commit leaves the attested production bytes
unchanged. `owner/authenticated-composed-complete/` holds a copy of the verified
result, runtime attestation and cleanup; original evidence remains intact.

Root adds a rendered heading-font regression before replacing Maliades' serif
fallback with the existing CIC display typeface. Red reproduces the defect;
the full eight-case matrix and actual parent navigation pass after repair.
Phone results and short-landscape fighter captures are visually inspected.
Root also commits progress tests before closing the exact fixed49 catalog rows
and preparing 0.5.67. Three initial failures and the intermediate changelog
wording mismatch are preserved; all 53 progress/header checks pass. Historical
PC06/PC07/0.5.66 snapshots remain intact and P605a receives no closure credit.
The candidate totals are 654/751 (87.08%) and 196/293 campaign closures (66.89%).

The final owner consumer audit includes seventeen runtime modules, 32 changed
index consumers and 107 unique Functions. The newly changed pure audience
module includes its twelve actual consumers. AST reachability and manual
factory/side-effect review preserve exact source digests; all seven current
PC07/PC08 selector tests pass with drift, duplicate and broad-fallback denials.
The generated roadmap and dependency views agree with the canonical catalog.
A Gantt check correctly rejects provenance generated before the catalog commit;
regeneration against that committed catalog passes. The final test-first
history reconciliation also requires regenerating its commit-based provenance.

The final normal eighteen-player tour-return scenario at `1dd40471` passes
phone and desktop on 0.5.67: actual UI join and role assignment, same identity,
session and role, cache-to-fresh-server restoration and no prepared writes or
browser errors. Owner Functions were freshly built and fully restarted before
this run. Final independent review, full validation, CI, exact-main deployment
and actual deployed presentation remain separate pending release steps.

The final test-first history pass splits the three remaining mixed worker
commits into `2f1c0283` → `808683de`, `4f8640d5` → `cd2b5c04` and
`78724896` → `4594f079`. Its receipt verifies the final tree is identical,
preserves `refs/pc08-preserved/pre-test-first-split` at `3069e888`, and maps all
rewritten descendants. Historical proof SHAs and worker branches remain intact.
The Gantt is regenerated against the rewritten catalog commit and its check
passes. These provenance-only changes do not replace or reinterpret gameplay
results. The reconciled candidate is then frozen for fresh independent review.

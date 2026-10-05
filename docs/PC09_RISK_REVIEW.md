# PC09 independent risk review

The single fresh independent Sol 6.1 Max review examined reconciled candidate
`c123368c77f0f5a072785263d94c67fdeb4af9ca` against
`b36119e9cdcf43e65bdfc00538b67115b0214ee2`. The reviewer is
`/root/pc09_risk_review`; the isolated review checkout is
`/private/tmp/dow-pc09-risk-review-20261004`. Explicit launch settings are
recorded in the model ledger; effective runtime model fields are unavailable.
The same reviewer completed one bounded final verification at
`ef0cb942a20d065b358aa306ddec5599bd87f598` on October 5, 2026. All nine
returned findings and eight directly blocking acceptance repairs are closed
within this review; no remaining material product defect was identified in
that follow-up. This report records the original batch, repairs, fresh checks
and evidence limits. Catalog credits, final candidate gates, CI and release
remain the owner's responsibility.

The Mac reconnection removed the earlier temporary checkouts and external
proof files. Paths from the original review and pre-reset runs below are
historical reported evidence, currently unavailable for inspection. Their
source commits and permanent regressions survived. Fresh resumed evidence is
identified separately; see the execution record's reconnection section.

## Returned findings and dispositions

| Finding | Reproduction and consequence | Owner disposition |
|---|---|---|
| 1, P2: Detector odds | The implementation sampled six faces with four accurate results, despite the frozen 4/5 rule. | Red `f4a61b4c`; product `d164af64` now samples five uniform outcomes, four accurate and one inverted. Truth, accuracy and entropy remain private. Closed in the final bounded verification below. |
| 2, P2: aftermath map ordering | Reordered stored nested fingerprint map keys made an otherwise identical exact retry fail in the native fixture. | Red `4e79e4cb`; product `8271a6c1` compares exact maps semantically. Extra fields remain rejected and ordered arrays remain bound. Focused checks pass. |
| 3, P2: Doctor off-marker population | A legal 1100-to-1000 casualty step was reverse-stepped to 1250 and rejected during mitigation. | Red `3a333e0e`; product `54f7e647` validates and calculates forward from the exact pre-damage population. The 1100 result and the existing 500-floor control pass. |
| 4, P2: early election tally | A live close-cycle Team deadline still allowed immediate resolution after only one ballot. | Red `2fe2e5cb`; product `acb42c1e` denies the live deadline and permits legitimate post-deadline/Coordination resolution. `3d581eca` makes the existing post-close fixture deterministic. |
| 5, P2: one holder elected to both offices | Individually legal separate President and VP ballots could produce the same unique plurality winner for both offices. | Initial `acb42c1e` fails closed. Owner-approved policy is implemented by `32e82bd8`: preserve the unique President winner, take the next eligible VP-ballot candidate, retain configured tie handling, and require an explicit current-GM in-game decision if none exists. Separate red `79031c00` / product `a45a9d85` keeps a tied President choice outside that unique-both fallback. Closed in the final bounded verification below, with the fresh Auth proof's source-binding limit retained. |
| 6, P2: terminal election mutation | An already configured election accepted a fresh ballot or tally after failure/debrief. | Red `f616919c`; product `00fb7103` requires active gameplay before fresh mutation. All four terminal-phase regressions pass. |
| 7, P3: historical replay applicability | VIP reroll acknowledged a revoked actor; ballot acknowledged a removed actor; Detector and aftermath acknowledged a different current cycle/attack. No extra spending, writes or entropy were demonstrated. | Ballot `acb42c1e`, aftermath red `98679b99` / product `f8bc87bd`, and specialist red `f4a61b4c` plus `c0ae8e2e` / product `d164af64` validate current actor and applicable cycle/attack before receipts. Valid same-operation retries after revision advances remain write-free and cost-free. |
| 8, P2: queued discovery epoch | While the actor snapshot was pending, a group 1→2→1 change released an old queued discovery event without a new callback. | Red `1178873b`; product `f9191929` clears pending discovery whenever an established actor fingerprint changes, while preserving first-snapshot hydration. Nine discovery tests pass. |
| 9, P1: aftermath strands the next attack | A committed Doctor choice advanced live resolved revision 8→9 while the immutable finalization audit remained 8; the later-attack reader rejected that valid battle. The same reader also blocked P continuation. | Red `5e055977`; product `7a536084` records an immutable finalization revision and a separate post-finalization counter, validates their binding, and leaves the audit/archive unchanged. Actual Doctor→ordinary declaration and Doctor→P continuation handler compositions and tamper rejects pass. Closed in the final bounded verification below. |

Original discriminating probes were reported outside Git under
`/tmp/dow-pc09-risk-review-probes/`. The returned logs are
`/tmp/dow-pc09-risk-review-product-probes-final.log` and
`/tmp/dow-pc09-risk-review-discovery-probes.log`. They contain twelve failing
Functions assertions, one failing discovery assertion and a passing canonical
population control on the reviewed candidate. They are independent native
handler/subscription fixtures, not production or authenticated emulator runs.

The reviewer identified finding 9 during the same final evidence reconciliation.
Its corrected discriminating probe was reported as
`/tmp/dow-pc09-risk-review-probes/functions/src/pc09Independent_aftermathCarryover.review.test.ts`
and `/tmp/dow-pc09-risk-review-aftermath-carryover-probe-corrected.log`.
The earlier malformed fixture is not used as evidence. This is one consolidated
nine-finding review with bounded follow-up, not an additional reviewer or run.

The reviewer also ran 371 existing Functions checks, two mixed-source client
receipt checks, a strict Functions build and deployment-inventory checks. The
reviewed runtime graph contained 232 actual endpoints and 212 named affected
consumers, with no missing consumer. These checks bind the reviewed candidate;
new runtime source hashes must be reconciled before release.

## Additional bounded acceptance repair

The normal authenticated P attack proof completed a source-generated first
attack, automatic finalization, exact survivor preparation and the next window.
The second same-cycle declaration then reached an unconditional PDF escort
cycle-monotonicity guard. The owner authorized a test-first repair bound to the
exact authoritative P-repeat context, preserving ordinary cycle monotonicity
and durable fighter losses. Red `6105b131`/`807ea5cc` and product `a44a6385`
implement that repair. The normal authenticated first producer/finalizer,
automatic exact restaging and second same-cycle declaration pass in
`/tmp/pc09-p-producer-a44a6385-v3.json`, against immutable source
`a44a63857f76b77bb376c3a17fcbf76f2ef91123`, with the sorted 207-file JavaScript
tree hash `405c2cb4f0dee841d7174e03e511c970397ee4b3ab767b7a992b69d96fceeb01`.
No attack, survivor, preparation, window or dice state was seeded. Disclosed
normal setup/damage-baseline choices remain fixture inputs. The reviewer found
no additional defect in the bounded PDF-reset delta; final reconciliation still
needs the later aftermath-binding change. This remains assigned P493 work.

The bounded connected combat diagnostic then reproduced two further acceptance
defects, distinct from the reviewer's original nine findings. Successful member
and resume replies still left the client showing open airspace after the server
declared an attack in the same cycle. Red `85d2ff2f` and product `708407f5`
honor only a validated advancing current-cycle phase revision; stale, malformed,
nonadvancing and cross-cycle/phase markers retain denial. The actual Ace UI then
sent its Medium command and received a 400 because a different, already-destroyed
Wing retained three points of Long-range damage against capacity one. Ordinary
range math permits that cumulative overkill. Red `074c57f6` and product
`1ee0d936` preserve canonical destroyed contacts while retaining exact capped
Ace damage and live-target requirements. The safe diagnostic is
`/tmp/pc09-combat-recovery-evidence/diagnostic-row7/result.json.failure.json`;
it remains a failed complete workflow. The client repairs pass 433 focused
checks; mechanics/math and actual callable/surface checks pass 53 and 127.

Owner product `1ee0d9360bc8df47e4bfda0995011e30e03c68b8` compiles and its
207-file JavaScript tree matches the specialist's immutable source
`01fd022076efb75db871f74473ffc470cd6d0e84` at
`13f42faae99142705d72c8ec0bc3e5fd1df341e1693c70774228db4273ae27d6`.
A fresh ordinary connected proof and this same reviewer's bounded verification
remain required; neither fix grants checkpoint credit by itself.

The next ordinary run on that immutable runtime completed all three ranges,
both genuine EO offline/online recoveries, the permission-bound Ace UI action
and exact retry, boarding, the atomic finalizer, member hydration, movement
reopening and private Rules denials. Its later Doctor assignment incorrectly
reused the already assigned Gorgoneion Captain, so the run remains partial in
`/tmp/pc09-combat-recovery-evidence/composed-01fd0220/result.json.failure.json`.
Driver-only `b69e12ee` allocates a separate ordinary Quellon Engineer as Doctor
without changing any aftermath, arrest or two-slot HTTP/UI build assertions.

Separate Commander trace evidence records actual address and offer commands
returning 200, followed by a 30-millisecond private-brief rehydration gap that
redirected the route to the chooser and lost its confirmation. The exact
route/store lifecycle is retained in
`/tmp/pc09-combat-recovery-evidence/commander-route-trace-reload/result.json.failure.json`.
Red `f14c1036` and product `81635fdf` now keep the route in an explicit
fail-closed waiting state during the current actor's private-brief hydration.
Absent, failed and foreign-actor results retain denial. A subsequent real
Commander action exposed an invalid odd-length Firestore audit-document path;
red `9dd732f8` / product `a8279c20` fixes its collection/document structure.
The earlier speculative read-only transaction cause is not treated as
reproduced in this scenario. Both deltas belong in the same bounded final
review, rather than a second broad review.

The resumed browser preflight reproduced an emulator client making remote App
Check token exchanges. Red `f588bd47` / product `6589746b` skips client
attestation only under the existing explicit emulator flag. Production provider
and key requirements, server App Check enforcement, actor authorization and
Rules remain unchanged. Five focused isolation/production controls pass.
The fresh three-browser preflight captures 363 local Firebase events, zero
remote origins or HTTP failures, and exactly one successful recovery for each
original actor. Its 54 deliberately induced offline resource failures remain
labelled in the raw trace; unexpected errors are zero.

The fresh composed proof on client/driver
`909b4f6d524103c348882d349e488f424f621a76` and immutable Functions source
`7026d56f7f8506b76edd80cfc882afeae9be9c10` completed all three ranges,
both EO recoveries, the permission-bound Ace UI action/replay, boarding,
atomic finalization, entitled projections, private Rules denials, aftermath,
arrest/deadline/next-Team disposition, and both required paid fighter builds.
The first HTTP build's exact receipt replay leaves count, material and revision
unchanged; the second genuine Wing UI build spends its own material.
Current raw proof is
`/tmp/pc09-combat-recovery-restored-20261004/composed-909b4f6d/result.json`.
This proves that runtime and client combination, not the later election
runtime, production gameplay or a physical device.
The bounded session trace retains one EO `resumeSession` HTTP 500 from an
emulator lock timeout, followed 126 milliseconds later by a successful 200.
The same-identity recovery and all gameplay assertions pass; this run is not
claimed to have zero HTTP failures. Its identity-free handoff is the sibling
`safe-result.json`, and the same final reviewer must inspect this limitation.

The resumed owner rebuilt the before/after TypeScript runtime dependency graph
at `0e72fd95` and verified the compiled SDK metadata: 232 actual endpoints,
24 changed runtime files, 117 changed index definitions and 216 named affected
endpoints. The added PDF escort transition and current request-guard consumers
are included. All three existing exact-transition inventory checks pass;
there is no broad Functions fallback or pure-helper deployment target.

The fresh ordinary two-attack proof reached real Short-range permission, then
stopped because its reconstructed source assertion used `sourceId`; the exact
server view and parser expose that identity as `id`. Test-only `4e85a6bc`
keeps the Alpha/index identity checks and corrects the field, without removing
an assertion. The failed trace additionally records 32 normal-clock promotion
HTTP 400s while a declared attack holds airspace. Its complete failure remains
under `/tmp/dow-pc09-resumed-evidence/positive-rebuild/`.

Separate meaningful clock regressions fail twice with five passing controls
before `c432a012`. That client-only repair follows the existing member-safe
attack audience and cancels normal Team promotion for a current declared
attack; old-cycle, foreign-session and resolved views retain ordinary behavior.
It changes no server guard, endpoint or movement authority. Seven focused
checks passed, but the second ordinary attempt still recorded 29 clock HTTP
400s and one launch-reader HTTP 400. That failed attempt completed twenty
branch checks, including both attacks and the first paid HTTP build/retry,
before an ambiguous Alpha locator. It remains a failure under
`/tmp/dow-pc09-resumed-evidence/positive-rebuild-c432a012/`.

The public attack listener initially read an absent document. Rules denied
that read and ended the listener before the first server declaration. Separate
red `698f191a` reproduces one failure with the outsider/write/list control
passing. Product `514568b9` permits only current members to observe absence;
present-document field, private-field and survivor-count validation remains.
The first edited expression had a parentheses compilation error, retained in
`attack-audience-startup-green.log`; its corrected three startup/privacy tests
pass in `attack-audience-privacy-green.log`. Server clock denial remains intact.

An eighth bounded repair addresses the launch panel's unconditional read after
combat, when the ordinary next-cycle construction console has no current attack.
Red `e031a3fa` has six failing lifecycle cases and three existing passing
controls. `c68af790` awaits the committed async view while preserving the
launch-enabled assertion. Product `d4b386fd` reuses the existing attack-choice
controller, binds both wing views to the current member attack/revision and
actor, and drops resolved, old-cycle and foreign-session audiences. Launched
wings retain their Fighter Ace permission controls through active ranges.
Twenty-nine panel/shared-authority/clock checks and strict typecheck pass.
Neither late repair changes Functions or weakens their read/mutation guards.

The next attempt on `d4b386fd` stopped before gameplay because the Press conduct
acknowledgement remained disabled; its launch and log remain under
`/tmp/dow-pc09-resumed-evidence/positive-rebuild-d4b386fd/`. It earns no gameplay
credit. The driver now waits for actual waiver checkboxes, requires all three,
checks their checked state, and captures admission diagnostics before cleanup.
A finite admission-only check precedes the next strict positive attempt.
All failed attempts remain separate. Full browser HTTP/request/page/console,
receipt, cost and two-vacancy assertions remain required. Repairs seven and
eight belong in the same existing reviewer's bounded follow-up.

## Evidence and completion boundary

At owner `30651411035e55392f5ff97021b389c6620f0042`, the five focused Detector,
VIP, aftermath and election suites pass 36 checks; Functions compilation and
app type checking pass. Separate aftermath coverage passes 90 checks. The VIP
composition fixture invokes the actual visit and reroll handlers, persists both
receipts and grant projections, rejects a second benefit and a revoked GM, and
permits an exact valid replay. Its visit is explicitly simulated; no physical
attendance is claimed.

The reconciled combat-repair product preflight passed all 7,917 native/unit
checks across 595 files, with no skips, in
`/tmp/dow-pc09-evidence/reconciled-product-native-14e2459d.log`. Product source
was unchanged while strict test-only fixture corrections were committed at
`93603186`; the affected 13 assertions were also rerun separately and passed.
Corrected typecheck and lint pass (zero errors, 16 existing warnings). These
preflight results precede the approved election and private-brief waiting
deltas; final candidate checks and exact-SHA CI remain required.

The later owner snapshot
`fd34534c1ceb50a2bd640da8dca56920a6b1dcb3` compiles successfully and includes
finding 9. Its immutable runtime has 207 JavaScript files and tree hash
`a559448c3b0fae8f8f39b205148bb3e3cf8b019c6cb12ad5143171aa66096540`.
The root's composed run on the prior `a44a6385` runtime reached genuine paid
warheads and Medium-range choices, then failed during EO automatic network
recovery. That failure earns no complete workflow credit. The isolated audit
run completed two attacks, durable Alpha loss and the surviving Battlestation
return path, but a genuine cycle-4 riot damaged Construction/Alpha bays before
any build; it earns no positive construction credit. A finite build fixture
with disclosed supplies and ordinary repair contingencies and a bounded Sol
client-recovery assignment own those remaining proofs.

The original ten PC08 audit defects retain their exact definitions in
`PC08_BUG_AUDIT.md`. Their PC09 regression/evidence dispositions belong in that
report and the acceptance matrix, separately from these nine review findings.
Prepared five-step presentation passes eight viewport/motion cases; it does not
replace ordinary authenticated combat, election, source-repeat or construction
acceptance. Final ordinary evidence, the approved election repair, targeted
verification by this same independent reviewer, final checks and actual release
verification remain required before closure credit.

## Positive-proof locator follow-up

The finite admission preflight passed for both real browser actors. The next
strict run (`5263cf49` client/driver, frozen `296dd59b` Functions) completed both
attacks, Alpha 4→3→2, the immutable Station return, the paid API build and exact
receipt retry, with zero captured console/page, HTTP or failed-request errors.
It then failed before the UI build because the driver asked for a named article,
while the actual construction article has no accessible name. This is a proof
locator error, not a waived UI result. Its full failure remains in
`positive-rebuild-final-admission/` under the resumed evidence directory.
The corrected locator uses `article.aegis-craft` containing the exact visible
Alpha/Bravo heading, retains the one-article and enabled/disabled assertions,
and changes no product code. A subsequent complete pass is still required.

The next `d2870c41` attempt stopped on a genuine first-attack Refinery Storage
hit: its cycle-3 stores were 6 food/4 water after halving, below the full printed
ration. Twelve earlier branches passed with zero browser errors. The failure
and predicate inputs remain in `positive-rebuild-heading/`. The initial budget
now includes one extra full ration for each of the two launch hosts, before
combat, retaining actual storage loss, maintenance cost and all acceptance
assertions. This is a disclosed finite fixture correction, not a gameplay rule
or additional post-combat authority.

The next `45a75dca` attempt completed twelve branches with zero captured
console/page, HTTP or failed-request errors, then stopped when actual AEGIS
Storage damage halved its remaining 24 food/18 water to 12/9. Carrier rations
left 4/3, below Gorgoneion's required full 8/6. Its failure and predicate inputs
remain in `positive-rebuild-storage-reserve/`. The disclosed pregame carrier
budget now works backwards from the printed costs across both possible
cycle-3 and cycle-4 storage losses: 88 food, 66 water and 17 materials, including
two possible paid drone repairs and both paid builds. All actual losses,
full-ration, complete-receipt, browser-error and two-vacancy assertions remain.
This is a finite source-backed fixture repair; no battle outcome is selected
and no post-combat resource write is added. A complete strict pass is pending.

The `f2d18578` attempt passed the corrected ration plan and sixteen branches
with zero captured browser errors, then retained the launch-console assertion
and stopped on genuine first-attack Command and Control damage. Construction
had already been repaired through the paid drone path; its once-per-cycle limit
correctly prevented treating that repair as a second free console repair.
The failed trace remains in `positive-rebuild-carrier-budget/`.
The next finite fixture reuses the existing Blacksmith rules: the current
Icebreaker Engineer fuels and flies the craft to AEGIS through ordinary
maintenance, departure, transit and arrival, waiting its real arrival time.
Before later carrier maintenance, Blacksmith repairs at most two required
damaged consoles for four host materials each, with a complete exact-retry
check. Gorgoneion can repair a third required console or Construction for
three materials under its unchanged once-per-cycle limit. The conservative
pregame material target becomes 25 to cover those paid costs and both storage
losses; food/water remain 88/66. No assertion, damage, charge, dice result or
post-battle inventory is patched. This adds an ordinary repair contingency,
not product behavior or future-checkpoint scope.

The `cbb5d4a8` attempt completed normal funding, Icebreaker maintenance and the
real Blacksmith transit time, then stopped before combat because the added
arrival request included an unsupported `requestId`. The existing arrival API
derives its receipt ID from `transitRequestId`; its exact-key parser correctly
rejected the extra field. The corrected driver uses that existing wire contract
and preserves the exact replay/docking assertions. The early failure remains in
`positive-rebuild-paid-readiness/`; it earns no battle or repair acceptance.

The complete strict proof on driver/client `cba5d520439162c804cbc0e42ed6abf1638c0841`
and frozen `296dd59b` Functions passed 24 checks/505 ordinary actions at
2026-10-05 00:19:00 UTC. It retains both genuine Short losses (Alpha 4→3→2),
the later ordinary launch at three, exact immutable Station carryover, the
second surviving Station return, paid API build/full receipt replay, separate
Wing UI build and seven current-local-contact DRADIS result rows. The two builds
spend materials 21→20→19 and restore Alpha 2→3→4. All captured console/page,
HTTP, failed-request and synthetic heartbeat errors are zero. Its normal
Blacksmith flight takes the real 60 seconds; one genuine damaged Alpha Bay repair
spends four materials and replays without changes. Construction is intact in
this passing run, so no drone-repair execution is inferred from its contingent
branch. The earlier actual paid drone repair remains separately labelled.

Current raw, launch and screenshots are in
`/tmp/dow-pc09-resumed-evidence/positive-rebuild-arrival-contract/`. Raw result
SHA-256 is `75b5381b4c629aaa58d82f6d4424acf30328236d0e04d3dca64d7a0f6d255a94`.
Its original `identitiesRetained:false` label is inaccurate: ephemeral emulator
UID/session identifiers occur in receipt and browser checks, but no Auth token
is retained. The raw result is unchanged; `safe-result.json` is an explicitly
allowlisted identity-free summary. A metadata-only driver correction labels
future output truthfully without rerunning or self-stamping the captured pass.
Root inspected all three Wing layouts and the cropped committed DRADIS readout.

## Completed bounded verification — October 5, 2026

Reviewed product: `ef0cb942a20d065b358aa306ddec5599bd87f598`.
Baseline: `b36119e9cdcf43e65bdfc00538b67115b0214ee2`, still the current
`origin/main`. This is the original reviewer verifying the integrated repairs
once, including materially changed privacy and deployment risk. The original
49-row scope, explicit P605a activation and private-source boundary remain.
No further actionable product finding was identified. No additional broad
review or future-checkpoint work was performed.

The existing review branch/worktree was restored after successful owner
`storage:status` and `coordination:status` reads. Other trees and reservations
were preserved. Checks used symlinks to the owner's locked dependencies;
no service, browser scenario or coordinator was started.

The locations below refer to the original `c123368c` candidate. Reproductions,
consequences and priorities remain in the returned-finding table above. The
permanent regressions now pass at the final reviewed product.

| Original finding | Original file/line | Final verification |
|---|---|---|
| 1, P2 | `functions/src/pc09SpecialistMechanics.ts:269`; `functions/src/wolfAgentDetectorWriter.ts:161` | Five uniform outcomes implement the frozen 4/5 rule. Exact mechanics and actual callable privacy/authority controls pass. |
| 2, P2 | `functions/src/wolfAttackAftermathCallable.ts:109` | Reordered nested maps replay; added keys, changed values and reordered arrays reject. The reproduction is a native stored-map fixture, not a newly observed Firestore ordering event. |
| 3, P2 | `functions/src/wolfAttackAftermath.ts:101` | Doctor mitigation calculates forward from the exact before-population. Off-marker 1100 and the 500-floor controls pass. |
| 4, P2 | `functions/src/index.ts:42699` | Live close-cycle Team deadline denies early tally; legitimate post-deadline and Coordination cases pass. |
| 5, P2 | `functions/src/index.ts:42724`; `functions/src/index.ts:42754` | Separate weighted office ballots, unique-both handling, configured ties and explicit vacancy controls pass. |
| 6, P2 | `functions/src/index.ts:42623`; `functions/src/index.ts:42688` | Both election mutators require active gameplay before receipt replay or fresh writes; four terminal-phase controls pass. |
| 7, P3 | `functions/src/index.ts:13212`; `functions/src/index.ts:42620`; `functions/src/wolfAgentDetectorWriter.ts:122`; `functions/src/wolfAttackAftermathCallable.ts:195` | Current actor/role and applicable cycle/attack precede replay. Revoked/removed/stale cases reject; legitimate revision-advanced retries retain zero extra cost, writes or entropy. |
| 8, P2 | `src/lib/firestore.ts:4097`; pending release at `src/lib/firestore.ts:3941` | Established actor-fingerprint changes fence queued discovery, including group 1→2→1, while first-snapshot hydration remains valid. |
| 9, P1 | `functions/src/wolfAttackAftermathCallable.ts:394`; `functions/src/wolfAttackCarryover.ts:287` | Immutable finalization revision plus separately versioned aftermath updates preserve audit/archive binding. Actual Doctor→ordinary and Doctor→P handler compositions pass; tampering rejects. |

PC09-A6's approved election rule applies only when the same candidate is the
unique raw-vote winner on both independent ballots. That candidate becomes
President; the next positive-vote eligible distinct candidate comes from the
VP ballot, with its configured tie procedure intact. A President chosen from a
tie does not activate this exception; the conflicting selection rejects before
writes. The explicit current-GM no-candidate branch has defensive native
coverage, not a claimed ordinary authenticated execution. The reviewer used
the committed approved assumption rather than inventing a ballot policy.

| Directly blocking acceptance delta | Final verification |
|---|---|
| Same-cycle P PDF reset | Only an exact validated P parent, sequence and next-attack context permit the reset. Ordinary monotonicity, durable losses and replay guards pass. |
| Current-cycle client airspace cursor | Only a validated advancing phase revision accepts the open→attack-closed transition. Stale, malformed, nonadvancing and foreign contexts reject. |
| Ace roster after Long range | Canonical already-destroyed overkill remains readable. New Ace damage stays capped and requires a live eligible target. |
| Current private-brief hydration | The current actor waits with a visible Back path. Missing, failed and foreign-actor briefs retain denial. |
| Commander dial audit path | The actual callable writes a valid collection/document path; authority, replay and once-per-cycle controls pass. |
| Explicit emulator App Check | Only the explicit local-emulator flag skips remote attestation. Production initialization and server enforcement remain intact. |
| Current-attack clock | The client suppresses ordinary Team promotion only for the current declared attack and cancels pending retries. Resolved, old-cycle and foreign-session controls pass. |
| Wing controller lifecycle | Reads and replies bind to current actor, session, attack, cycle and revision. Absent/resolved/stale views suppress reads; active-range Ace permissions remain available. |

The associated Rules bootstrap change permits current members to GET an absent
public attack audience so their listener survives until the first declaration.
Outsiders, disconnected actors, listing and client writes remain denied. Present
documents retain their exact safe-field and private-field checks. This changes
no server clock or gameplay mutation authority.

### Checks independently completed

| Check | Result and evidence |
|---|---|
| Focused Functions regressions | 16 files, 418 passing tests covering all nine findings, range/pre-range/boarding controls, P reset, Commander and terminal policy. `/tmp/pc09-risk-final-functions.log` and `/tmp/pc09-risk-final-audit-controls.log`. |
| Focused client regressions | 10 files, 75 passing tests covering discovery, snapshot authority, clock, Wing lifecycle, route hydration, emulator isolation, election, Commander and EO receipt contracts. `/tmp/pc09-risk-final-client.log` and `/tmp/pc09-risk-final-receipt-controls.log`. Two EO receipt cases were selected by CLI test-name filter; the other 227 cases in that file were outside this focused run, not disabled in source. |
| Deployment inventory regressions | All three `scripts/deployment-targets.pc09.test.mjs` cases pass. |
| Strict builds | Functions compilation to `/tmp/pc09-risk-final-compiled` and app/test typecheck pass. Logs: `/tmp/pc09-risk-final-functions-build.log` and `/tmp/pc09-risk-final-app-typecheck.log`. |
| Current Rules result inspected | Owner's `/tmp/dow-pc09-resumed-evidence/current-all-rules.log` passes all 164 tests across four files, without skips. This was inspected, not rerun by the reviewer. |

The reviewer independently rebuilt the before/after TypeScript symbol graph,
including runtime re-exports and transitive references, and compared it with
the independently compiled SDK's actual `__endpoint` metadata. It contains
232 actual endpoints, 24 changed runtime modules and exactly 216 affected named
endpoint consumers. All recorded source hashes match; no consumer is omitted
or added without reachability. Nine new pure helpers and the existing
`setLoyaltyCensusEntries` helper are excluded from deployment selectors.
The actual selector contains Hosting, Firestore Rules and those 216 named
Functions, with no broad Functions fallback. Evidence:
`/tmp/pc09-risk-final-audit.cjs`, `/tmp/pc09-risk-final-runtime-audit.json`
and `/tmp/pc09-risk-final-deployment-selector.json` (CLI key/value output).
WIF, exact-SHA typography and affected ticker workflow paths retain their
previously reviewed implementation; they are unchanged since the initial
candidate. No CI or deployment execution is inferred from this local check.

### Fresh evidence reconciliation and limits

The strict ordinary two-attack proof is source-bound by its pre-run launch
record. Its unchanged raw SHA-256 matches the recorded
`75b5381b4c629aaa58d82f6d4424acf30328236d0e04d3dca64d7a0f6d255a94`.
The pre-run driver and Rules hashes match their committed sources. The full
207-file frozen Functions tree independently hashes to
`54d4c79e639a4ddd59e4882b7be6d3f4735f38ec97717cbf2b68f9cd4db7a260`.
There is no Functions-source difference from `296dd59b` to the reviewed
product, and no client/Rules/Functions product-source difference from
`cba5d520` to the reviewed product. Later commits change documentation or
driver metadata, not the captured gameplay implementation.

The 24-check/505-action strict pass completes two attacks, actual Alpha
4→3→2 losses, later launch at three, immutable Station carryover, API build and
exact receipt retry, a separate genuine Wing UI build 2→3→4, and seven entitled
committed DRADIS rows. Materials change 21→20→19 for the two builds. Captured
page/console, HTTP, failed-request and heartbeat error arrays are empty.
The disclosed pregame supplies cover possible printed storage losses; actual
losses and outcomes remain unmodified. Normal Blacksmith transit and paid
repair are observed. Construction is intact in this pass, so its contingent
drone branch is not counted as executed.

| Additional fresh artifact | Accepted evidence and qualification |
|---|---|
| `/tmp/pc09-combat-recovery-restored-20261004/composed-909b4f6d/safe-result.json` | Complete ordinary ranges, actual EO/Wing/Ace/Press browser actors, both same-identity EO recoveries, boarding/finalizer, aftermath, arrest and both paid builds. GM attendance is explicitly simulated. One captured EO resume 500 recovers to 200 after 126 ms; the run is not zero-HTTP-failure proof. Its selected session trace retains the last 160 records rather than a complete browser HTTP capture. |
| `/tmp/dow-pc09-resumed-evidence/commander/result.json` | Current selected-group dial, actual address/amnesty, explicit GM consequence choice and four viewport cases pass. |
| `/tmp/dow-pc09-resumed-evidence/dradis/result.json` | Nine recovery/privacy/navigation checks and eight viewport/motion cases pass. The strict battle supplies actual committed contact rows separately. |
| `/tmp/dow-pc09-resumed-evidence/detector/pc09-wolf-agent-detector.json` | Ordinary research and three tests, fourth-test denial, truth-free reports and separate private audits pass. Exact 4/5 reliability is native mechanics evidence, not an inference from three trials. |
| `/tmp/dow-pc09-resumed-evidence/p-station/result.json` | Seven checks/32 actions produce P pressure by ordinary movement, complete the first attack/finalizer, automatically restage exact survivors and declare the next same-cycle attack. Chart/deadline acceleration and GM precombat maintenance choices are disclosed; attack state, dice, results and survivor manifests are not seeded. |
| `/tmp/dow-pc09-resumed-evidence/voyage-hooks/result.json` | Six normal-Auth admission/docking/ration/retry checks pass without gameplay fixture writes; no rendered-UI claim is added. |
| `/tmp/dow-pc09-crises-auth-proof-final/result.json` | 23 checks/91 actions include weighted secret ballots and the distinct VP-ballot runner-up, crisis visits, privacy and reconnect. Raw `sourceCommit` remains `not-specified`; `runtime-binding.json` is explicitly post-run binding, not a pre-run receipt. Its raw hash matches, and inspected election code is unchanged between recorded `f2f5d49a` and the reviewed product. No exact full-runtime pre-run attestation is inferred. |
| `/tmp/dow-pc09-resumed-evidence/prepared-tour/result.json` | Eight viewport/motion cases pass with zero Firebase calls/writes. This is prepared presentation. Existing strict phone/landscape and prepared screenshots were also inspected; no further material presentation defect was found. |

The strict raw `identitiesRetained:false` field is inaccurate because ephemeral
UID/session identifiers remain in receipts and browser checks. The raw file is
unchanged. Its allowlisted `safe-result.json` omits those identities and records
the limitation; the future driver metadata is corrected. No token or private
source text belongs in this report.

The ten original PC08 findings retain their exact definitions and separate
dispositions in `PC08_BUG_AUDIT.md`. All have permanent native regressions.
Fresh strict gameplay additionally proves RANGE-02's durable losses, later
launch and two paid builds, and BOARDING-01's immutable Station return. Fresh
composed gameplay supplies actual mixed-source assignments and EO recovery
adjacent to RANGE-03/04. Destroyed-carrier progression (RANGE-01), removed-holder
progression (RANGE-05), exact shifted-target rows (RANGE-06), and stale-attack
replay counterexamples (RANGE-08/BOARDING-02) retain their exact native boundary;
their browser counterexamples are not invented.

RANGE-07's exact private/member PDF-state equality is now supported by its
permanent native regression. The earlier authenticated one-of-four-survivor
artifact was lost in the reset. Fresh generic member projections/private Rules
denials do not establish that exact comparison or a newly rendered PDF survivor
counterexample. The owner is reconciling this qualification in the audit and
playtest reports. Lost and failed-run artifacts grant no fresh acceptance.

This completes the bounded independent product verification. Physical
attendance, physical-device play, production gameplay and actual release are
outside the captured evidence. The owner's final whole-suite/release gates,
0.5.68/703 catalog metadata, exact-candidate CI and deployment remain next steps.

## Startup-loading delta — October 5, 2026

The same reviewer examined only the release-blocking startup changes
`5ae27714`, `caa739d5` and `9f2afeb3`, then their bounded rejection repair at
`779c30813f758509f83cad55cc5fbcb864abc226`. The existing review and its evidence
limits remain preserved. No remaining material loading-delta defect was found.

**P2, closed — rejected deferred modules removed the application.** At
`9f2afeb3`, `src/App.tsx:76`, `:1119`, `:1179` and `:1193` used Suspense without
error containment for the newly deferred Ship, Crisis, President and Election
modules. Rejecting the actual lazy import after its pending Back control
appeared let the error escape App, removing the routed UI and return control.
The independent native failure is preserved in
`/tmp/pc09-risk-loading-rejection.log` and its external probe. Permanent red
`6348e8e4` reproduces all four cases; test-only `d15f21f8` adds the required
typed join code without changing assertions. Product `779c3081` contains these
four failures, retains route Back/reload notices and isolates crisis failure
with a session/UID key. The single CSS rule positions that notice below the
header; existing action-button tokens supply its touch target and typography.

The initial focused checks passed 240 tests in nine App/ship-navigation/crisis/
governance files. On the repaired source, only the four changed rejection
regressions were rerun; all pass, as does strict app typecheck. Logs:
`/tmp/pc09-risk-loading-repair-native.log` and
`/tmp/pc09-risk-loading-repair-typecheck.log`. Local review source
`e5bf14eb9b78c764dd660858137d450363265466` has matching App, CSS and regression
hashes to root `779c3081`. No earlier server suite or SDK inventory was repeated.

Prepared browser script `40b5fe9d` and
`/tmp/dow-pc09-resumed-evidence/deferred-route-recovery-controls/result.json`
were inspected without starting services or browsers. Three pending-load and
twelve actual rejected-download cases pass across phone, desktop and landscape:
keyboard Back, retained fixture identity, 44-pixel Back/reload controls,
monospace/loaded fonts, no horizontal overflow and readable header clearance.
Representative screenshots were inspected. Page exceptions are zero; the
twelve deliberate module failures and blocked remote requests remain labelled.
This is prepared local presentation, with no Auth or gameplay claim. Earlier
fixture/locator and undersized-reload failures remain failed evidence.

Independent read-only measurement of the final static graph yields 1,705,355
raw bytes, 453,409 gzip bytes and a 497,246-byte largest chunk, below unchanged
budgets 1,850,458 / 491,219 / 512,000. Ship and governance entries remain outside
the landing graph. Evidence: `/tmp/pc09-risk-loading-repair-static-graph.json`.
Server authority, Rules and deployment consumers are unchanged. Root retains
the final typography, ticker, performance, metadata, CI and release gates.

## Deployment-quota recovery delta — October 5, 2026

The same reviewer inspected only the directly blocking release failure and its
bounded helper/workflow repair, based on exact main
`feb71f2d168f7301fc457a0dfdb06d46f6e02371`, at recovery candidate
`be3097789552fc69efd7b510f0d62ab1eee187e5`. No remaining material defect was found
in the reviewed delta. Earlier product findings and evidence limits remain
preserved; actual recovered deployment is still pending.

Run `37257836445` contains 200 unique successful Function operations and 16
failed Functions, with mutation-rate 429 and regional CPU startup failures.
Rules released; Hosting uploaded without publication, and subsequent IAM repair
and final verification did not run. The original complete failure remains in
`/tmp/dow-pc09-resumed-evidence/main-release-37257836445-failed.log`; the independent
200/16 disposition is `/tmp/pc09-risk-partial-deploy-summary.json`. These results
do not establish a completed release.

The helper preserves all 216 audited names exactly once in 22 sequential
Function batches (21 groups of ten and one of six), then Hosting/Firestore once.
Malformed, duplicate and broad Function selectors fail before invocation; a
failed batch prevents all later batches and surface publication. Pinned CLI
15.29.0, verified artifacts, current-main protection and strict ready-revision,
ACTIVE and existing IAM checks remain unchanged. The original explicit manual
`workflow_dispatch` path is preserved separately; automatic releases have no
broad fallback. No runtime CPU, quota, permission, source selector or version
change is part of this repair. Batching follows
[Firebase's deployment guidance](https://firebase.google.com/docs/functions/manage-functions?gen=2nd#deploy_functions).

WIF lifetime was checked against the
[auth v3 credential writer](https://github.com/google-github-actions/auth/blob/v3/src/client/workload_identity_federation.ts)
and [pinned CLI authentication](https://github.com/firebase/firebase-tools/blob/v15.29.0/src/requireAuth.ts).
The inherited ADC file obtains GitHub subject tokens through its URL and uses
service-account impersonation; each CLI process requests credentials through
GoogleAuth. This source-supported refresh path needs no token lifetime or IAM
extension for the 90-minute job. Actual long-running provider success remains
an execution result, not a claim from local tests. Explicitly named deployments
also bypass unchanged-hash skipping in the
[pinned planner](https://github.com/firebase/firebase-tools/blob/v15.29.0/src/deploy/functions/release/planner.ts),
so recapturing all 216 revisions before the retry retains the existing strict
requirement for every selected ready revision to advance.

Independent checks pass all eight new contract tests, actual 216-name coverage,
and five executions of the workflow shell using stub commands, including
failure-stop and the manual-only boundary. No provider calls or services were
started. Evidence is `/tmp/pc09-risk-deployment-batching-native-final.log`,
`/tmp/pc09-risk-deployment-batching-coverage.json` and
`/tmp/pc09-risk-deployment-manual-boundary.json`. Committed helper, test, both
workflows and verifier content at `be3097789` independently match the recorded
source hashes. Root owns exact-candidate CI, the bounded deployment and final
Hosting/Rules/all-216 readiness and IAM verification before release closeout.

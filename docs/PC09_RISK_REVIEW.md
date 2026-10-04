# PC09 independent risk review

The single fresh independent Sol 6.1 Max review examined reconciled candidate
`c123368c77f0f5a072785263d94c67fdeb4af9ca` against
`b36119e9cdcf43e65bdfc00538b67115b0214ee2`. The reviewer is
`/root/pc09_risk_review`; the isolated review checkout is
`/private/tmp/dow-pc09-risk-review-20261004`. Explicit launch settings are
recorded in the model ledger; effective runtime model fields are unavailable.
This report records the returned batch and the owner's bounded repairs. It
does not yet grant checkpoint, review, CI or release completion.

The Mac reconnection removed the earlier temporary checkouts and external
proof files. Paths from the original review and pre-reset runs below are
historical reported evidence, currently unavailable for inspection. Their
source commits and permanent regressions survived. Fresh resumed evidence is
identified separately; see the execution record's reconnection section.

## Returned findings and dispositions

| Finding | Reproduction and consequence | Owner disposition |
|---|---|---|
| 1, P2: Detector odds | The implementation sampled six faces with four accurate results, despite the frozen 4/5 rule. | Red `f4a61b4c`; product `d164af64` now samples five uniform outcomes, four accurate and one inverted. Truth, accuracy and entropy remain private. Focused checks pass; final reviewer verification remains. |
| 2, P2: aftermath map ordering | Firestore reordered nested fingerprint map keys, making an otherwise identical exact retry fail. | Red `4e79e4cb`; product `8271a6c1` compares exact maps semantically. Extra fields remain rejected and ordered arrays remain bound. Focused checks pass. |
| 3, P2: Doctor off-marker population | A legal 1100-to-1000 casualty step was reverse-stepped to 1250 and rejected during mitigation. | Red `3a333e0e`; product `54f7e647` validates and calculates forward from the exact pre-damage population. The 1100 result and the existing 500-floor control pass. |
| 4, P2: early election tally | A live close-cycle Team deadline still allowed immediate resolution after only one ballot. | Red `2fe2e5cb`; product `acb42c1e` denies the live deadline and permits legitimate post-deadline/Coordination resolution. `3d581eca` makes the existing post-close fixture deterministic. |
| 5, P2: one holder elected to both offices | Individually legal separate President and VP ballots could produce the same unique plurality winner for both offices. | Initial `acb42c1e` fails closed. Owner-approved policy is implemented by `32e82bd8`: preserve the unique President winner, take the next eligible VP-ballot candidate, retain configured tie handling, and require an explicit current-GM in-game decision if none exists. Separate red `79031c00` / product `a45a9d85` keeps a tied President choice outside that unique-both fallback. Current Auth proof and this reviewer's targeted verification remain. |
| 6, P2: terminal election mutation | An already configured election accepted a fresh ballot or tally after failure/debrief. | Red `f616919c`; product `00fb7103` requires active gameplay before fresh mutation. All four terminal-phase regressions pass. |
| 7, P3: historical replay applicability | VIP reroll acknowledged a revoked actor; ballot acknowledged a removed actor; Detector and aftermath acknowledged a different current cycle/attack. No extra spending, writes or entropy were demonstrated. | Ballot `acb42c1e`, aftermath red `98679b99` / product `f8bc87bd`, and specialist red `f4a61b4c` plus `c0ae8e2e` / product `d164af64` validate current actor and applicable cycle/attack before receipts. Valid same-operation retries after revision advances remain write-free and cost-free. |
| 8, P2: queued discovery epoch | While the actor snapshot was pending, a group 1→2→1 change released an old queued discovery event without a new callback. | Red `1178873b`; product `f9191929` clears pending discovery whenever an established actor fingerprint changes, while preserving first-snapshot hydration. Nine discovery tests pass. |
| 9, P1: aftermath strands the next attack | A committed Doctor choice advanced live resolved revision 8→9 while the immutable finalization audit remained 8; the later-attack reader rejected that valid battle. The same reader also blocked P continuation. | Red `5e055977`; product `7a536084` records an immutable finalization revision and a separate post-finalization counter, validates their binding, and leaves the audit/archive unchanged. Actual Doctor→ordinary declaration and Doctor→P continuation handler compositions and tamper rejects pass within 242 focused checks. Final reviewer verification remains. |

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
It changes no server guard, endpoint, Rules or movement authority. Seven
focused checks, lint and typecheck pass. The corrected ordinary run has a new
directory and retains all browser HTTP, request, page/console, receipt, cost
and two-vacancy assertions. This seventh additional acceptance repair belongs
in the same existing reviewer's bounded follow-up.

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

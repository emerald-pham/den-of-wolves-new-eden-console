# PC09 independent risk review

The single fresh independent Sol 6.1 Max review examined reconciled candidate
`c123368c77f0f5a072785263d94c67fdeb4af9ca` against
`b36119e9cdcf43e65bdfc00538b67115b0214ee2`. The reviewer is
`/root/pc09_risk_review`; the isolated review checkout is
`/private/tmp/dow-pc09-risk-review-20261004`. Explicit launch settings are
recorded in the model ledger; effective runtime model fields are unavailable.
This report records the returned batch and the owner's bounded repairs. It
does not yet grant checkpoint, review, CI or release completion.

## Returned findings and dispositions

| Finding | Reproduction and consequence | Owner disposition |
|---|---|---|
| 1, P2: Detector odds | The implementation sampled six faces with four accurate results, despite the frozen 4/5 rule. | Red `f4a61b4c`; product `d164af64` now samples five uniform outcomes, four accurate and one inverted. Truth, accuracy and entropy remain private. Focused checks pass; final reviewer verification remains. |
| 2, P2: aftermath map ordering | Firestore reordered nested fingerprint map keys, making an otherwise identical exact retry fail. | Red `4e79e4cb`; product `8271a6c1` compares exact maps semantically. Extra fields remain rejected and ordered arrays remain bound. Focused checks pass. |
| 3, P2: Doctor off-marker population | A legal 1100-to-1000 casualty step was reverse-stepped to 1250 and rejected during mitigation. | Red `3a333e0e`; product `54f7e647` validates and calculates forward from the exact pre-damage population. The 1100 result and the existing 500-floor control pass. |
| 4, P2: early election tally | A live close-cycle Team deadline still allowed immediate resolution after only one ballot. | Red `2fe2e5cb`; product `acb42c1e` denies the live deadline and permits legitimate post-deadline/Coordination resolution. `3d581eca` makes the existing post-close fixture deterministic. |
| 5, P2: one holder elected to both offices | Individually legal separate President and VP ballots could produce the same unique plurality winner for both offices. | `acb42c1e` rejects that outcome before any write. The owner requested a runner-up VP, with an explicit no-second-candidate case; which ballot supplies that runner-up is pending parent clarification. No GM-choice extension or guessed runner-up is activated. |
| 6, P2: terminal election mutation | An already configured election accepted a fresh ballot or tally after failure/debrief. | Red `f616919c`; product `00fb7103` requires active gameplay before fresh mutation. All four terminal-phase regressions pass. |
| 7, P3: historical replay applicability | VIP reroll acknowledged a revoked actor; ballot acknowledged a removed actor; Detector and aftermath acknowledged a different current cycle/attack. No extra spending, writes or entropy were demonstrated. | Ballot `acb42c1e`, aftermath red `98679b99` / product `f8bc87bd`, and specialist red `f4a61b4c` plus `c0ae8e2e` / product `d164af64` validate current actor and applicable cycle/attack before receipts. Valid same-operation retries after revision advances remain write-free and cost-free. |
| 8, P2: queued discovery epoch | While the actor snapshot was pending, a group 1→2→1 change released an old queued discovery event without a new callback. | Red `1178873b`; product `f9191929` clears pending discovery whenever an established actor fingerprint changes, while preserving first-snapshot hydration. Nine discovery tests pass. |

Original discriminating probes are retained outside Git under
`/tmp/dow-pc09-risk-review-probes/`. The returned logs are
`/tmp/dow-pc09-risk-review-product-probes-final.log` and
`/tmp/dow-pc09-risk-review-discovery-probes.log`. They contain twelve failing
Functions assertions, one failing discovery assertion and a passing canonical
population control on the reviewed candidate. They are independent native
handler/subscription fixtures, not production or authenticated emulator runs.

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
and durable fighter losses. This is an assigned P493 dependency, not a new
checkpoint. Its final commit, normal proof and reviewer disposition remain
pending.

## Evidence and completion boundary

At owner `30651411035e55392f5ff97021b389c6620f0042`, the five focused Detector,
VIP, aftermath and election suites pass 36 checks; Functions compilation and
app type checking pass. Separate aftermath coverage passes 90 checks. The VIP
composition fixture invokes the actual visit and reroll handlers, persists both
receipts and grant projections, rejects a second benefit and a revoked GM, and
permits an exact valid replay. Its visit is explicitly simulated; no physical
attendance is claimed.

The original ten PC08 audit defects retain their exact definitions in
`PC08_BUG_AUDIT.md`. Their PC09 regression/evidence dispositions belong in that
report and the acceptance matrix, separately from these eight review findings.
Prepared five-step presentation passes eight viewport/motion cases; it does not
replace ordinary authenticated combat, election, source-repeat or construction
acceptance. Final ordinary evidence, the clarified election policy, targeted
verification by this same independent reviewer, final checks and actual release
verification remain required before closure credit.

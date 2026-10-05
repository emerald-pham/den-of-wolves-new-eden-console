# PC09 playtest and release report

PC09 implements the fixed 49 assigned items, including all ten repairs from
the PC08 audit, in one isolated owner branch. Completion credit, final review,
candidate CI and production deployment are still pending. The opening catalog
is 654/751 overall and 196/293 campaign items; the required closing snapshot is
703/751 (93.61%) and 245/293 (83.62%). No PC10 or later implementation is part
of this release.

## Assigned items

471, 472, 473, 580, 605a, 474, 475, 476, 477, 478, 479, 480, 481, 482, 483,
484, 490, 491, 492, 493, 494, 621, 214, 503a, 506, 508, 513, 514, 516, 517,
519, 520, 521, 521a, 521b, 524, 645, 523b, 523c, 524b, 524c, 524d, 528, 529,
537, 538, 539, 540, 180.

The [acceptance matrix](PC09_ACCEPTANCE_MATRIX.md) maps every item to its
implementation and proof. The [execution record](PC09_EXECUTION_RECORD.md)
preserves accepted scope, source decisions and ownership. P605a was explicitly
activated by the owner; its existing P433a audience and contact privacy contract
remains in force. The [model ledger](PC09_MODEL_ASSIGNMENTS.json) records the
narrow P605a product-only Astra exception and the Sol 6.1/Luna assignments;
effective runtime models are unavailable from the local tools.

## Ordinary authenticated local gameplay

The following fresh artifacts use disposable demo projects, ordinary Firebase
Auth actors and real game callables. Browser actors join through the real app;
their identities and tokens are not injected into app storage. Setup decisions
and deadline/resource fixtures are disclosed in the individual reports.

| Proof | Fresh result and source binding | Result and limits |
|---|---|---|
| Complete Wolf, deduction and aftermath scenario | `/tmp/pc09-combat-recovery-restored-20261004/composed-909b4f6d/safe-result.json`; client `909b4f6d`, Functions `7026d56f`, 207-file tree hash `5cf366d9c079de5599020666cb99b85d8eb93ec9a473cf1974cb130f1ca5cbe3` | All three ranges, both same-identity EO recoveries, permission-bound Ace UI/retry, boarding, finalization, entitled projections, private Rules denials, paid repair/salvage/Doctor actions, arrest and both paid fighter builds pass. Explicit loyalty setup, supplies, accelerated disposable deadlines and simulated GM attendance remain disclosed. One EO resume HTTP 500 from an emulator lock timeout is followed by a successful 200 after 126 ms; this proof does not claim zero HTTP failures. |
| Commander powers | `/tmp/dow-pc09-resumed-evidence/commander/result.json` | Five checks and four viewport cases pass: selected-group dial, address, offer, acceptance, expiry and explicit current-GM consequence ruling. Zero page exceptions and synthetic heartbeat failures. |
| Crisis and election scenario | `/tmp/dow-pc09-crises-auth-proof-final/result.json` and `runtime-binding.json` | 23 checks/91 ordinary actions pass with 18 actors and five real population-weighted secret ballots. The unique President is retained and the distinct VP-ballot runner-up elected. All five crisis kinds, four custom closures, actual Coordination visit, next-Team announcements, reconnect and six keyboard Back cases pass. The raw source field remains `not-specified`; the separately labelled post-run sidecar binds client `f2f5d49a` and its 207-file runtime. Config bytes and pre-run source hashes were not captured. The deadline/unrest inputs and simulated digital visit are disclosed. |
| DRADIS recovery, privacy and navigation | `/tmp/dow-pc09-resumed-evidence/dradis/result.json` and `launch.json` | Nine checks/eight viewport-motion cases pass at client/driver `2ccd9762`: ordinary declaration, offline withdrawal, online reacquisition, reload/reselection, private reads denied, projection writes denied, keyboard exit, parent/browser navigation and GM revocation. Zero page exceptions. This standalone proof shows targeting rather than committed battle rows; the strict battle proof owns committed rows. |
| Detector research and private tests | `/tmp/dow-pc09-resumed-evidence/detector/pc09-wolf-agent-detector.json` and `launch.json` | Ordinary research in cycles 1–4 builds the Detector; three private tests commit and a fourth denies. Investigator reports contain no loyalty truth; Rules isolate reports and separate private audits. Exact four-out-of-five reliability is covered natively, not inferred statistically from three trials. No rendered UI claim. |
| Ancient Space Station producer and repeat | `/tmp/dow-pc09-resumed-evidence/p-station/result.json` and `launch.json` | Seven checks/32 actions pass: ordinary movement produces P pressure, the selected window/composition declares, both wing choices and EO range passes resolve, finalization returns exact survivors, and the next same-cycle declaration succeeds. Chart/deadline fixtures and an authorized precombat GM maintenance repair are disclosed. No hidden battle/result/dice seed. |
| Voyage arrival, docking and needs | `/tmp/dow-pc09-resumed-evidence/voyage-hooks/result.json` and `launch.json` | Six fresh HTTP checks pass: actual crisis admission, once-only people/motivation hooks, ordinary P251 docking to Dione and P250 full rations costing four host food/four water. Exact docking and ration retries do not repeat changes or spending. Eighteen ordinary Auth actors, no gameplay fixture writes and no rendered UI claim. |
| Two attacks, durable losses, paid rebuild and committed DRADIS rows | `/tmp/dow-pc09-resumed-evidence/positive-rebuild-arrival-contract/safe-result.json`, original `result.json` and pre-run `launch.json` | 24 checks/505 ordinary actions pass at driver/client `cba5d520`. Alpha stays 4→3→2 through two real Short Ace losses, then paid API build/exact retry leaves 3 and the separate Wing UI build restores 4. Materials fall 21→20→19 for the two builds. The prior exact Station return is consumed once; the second attack returns a Station. Seven actual entitled DRADIS rows equal the current local-contact filter. Three Wing viewports use system monospace with no horizontal overflow. All captured browser console/page, HTTP, failed-request and synthetic heartbeat errors are zero. |

The root Commander, DRADIS, Detector, P Station, Voyage and strict battle proofs use frozen Functions
source `296dd59b55998ac6c039a5f3774803257685329d`, all 207 compiled JavaScript
files verified with tree SHA-256
`54d4c79e639a4ddd59e4882b7be6d3f4735f38ec97717cbf2b68f9cd4db7a260`.
The hash encoding is sorted relative path, NUL, file bytes, NUL. The crisis
runtime is separately bound and is not claimed to equal the final root runtime.

Eight distinct failed strict-proof attempts remain preserved under
`/tmp/dow-pc09-resumed-evidence/positive-rebuild*`; the complete pass uses a new
directory. Corrections preserve every full-ration, loss, receipt, cost, retry and
browser-error assertion. The disclosed pregame carrier budget covers possible
ordinary Storage losses. The passing run fuels and flies Blacksmith for its real
60-second trip, then pays four AEGIS materials to repair the damaged Alpha Bay,
replaying that repair without further changes. Construction was intact in this
pass; the genuine paid drone repair and exact retry remain in the earlier
`f2d18578` failure trace and the composed proof. No outcome or post-battle
inventory fixture write is selected. The raw passing result's original
`identitiesRetained:false` label is inaccurate: receipts/browser checks contain
ephemeral emulator UIDs/session IDs, with no Auth tokens. The raw file is unchanged;
the allowlisted `safe-result.json` omits those identities and records the raw
SHA-256. Future driver output now labels their retention correctly. See the
[risk report](PC09_RISK_REVIEW.md).

## Audit and independent review

All ten original findings have permanent product regressions. The exact prior
destroyed-carrier, removed-support-holder and stale-attack retry counterexamples
are native handler evidence; a live-carrier browser game is not presented as
those exact reproductions. Mixed-source receipts, durable losses, PDF member
projection and surviving Station return also have ordinary authenticated
workflow coverage. The original definitions and historical 0.5.67 audit remain
in [PC08 Bug Audit](PC08_BUG_AUDIT.md).

The single independent Sol 6.1 review returned nine findings, repaired in
bounded test-first commits. Eight further directly blocking acceptance defects
were repaired, including the current public-attack listener, normal-clock
promotion and fighter-launch lifecycle. Their red controls and fixes are listed
in [PC09 Risk Review](PC09_RISK_REVIEW.md). The same reviewer's one bounded final
verification remains pending. The [test-change report](PC09_TEST_CHANGE_REPORT.md)
records every changed test/driver against `b36119e9`; assertions are retained,
with no deleted test files or deliberately skipped tests.

## Presentation and release boundaries

The isolated five-step scene passes eight viewport/motion cases at
`/tmp/dow-pc09-resumed-evidence/prepared-tour/`: real presenters, keyboard/focus,
visible Back, 44-pixel controls, fonts and no overflow. It makes zero Firebase
calls/writes. This is prepared presentation evidence only.

Pre-reconnect external artifacts are unavailable after the Mac reset. Their
committed code, permanent regressions and historical written reports survive;
missing artifacts do not earn fresh inspectable proof. Fresh results above are
separately identified. Emulator/browser passes do not establish physical
attendance, physical-device testing or actual production gameplay.

Final native/Rules/build/responsive/release gates, independent follow-up,
0.5.68 metadata, candidate CI, exact-main deployment and verified closeout are
pending. The actual runtime inventory contains 232 endpoints and 216 named
affected consumers; Hosting, Firestore Rules and those named Functions are the
prepared deployment surfaces. The WIF path remains unchanged.

PC10 remains a separate parent-owned task. Its later every-role solo/two-browser,
unlimited-timer and real authenticated GM cycle 0→1 acceptance must be revised
and verified there. This checkpoint reuses existing functionality and reports
its proof boundaries without implementing that future phase.

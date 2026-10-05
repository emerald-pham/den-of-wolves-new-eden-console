# PC09 playtest and release report

The reviewed PC09 0.5.68 candidate closes the fixed 49 assigned items, including
all ten repairs from the PC08 audit, in one isolated owner branch. Candidate CI
and production deployment verification are still pending. The opening catalog
was 654/751 overall and 196/293 campaign items; the closing candidate snapshot is
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
workflow coverage. The exact PDF private/member-state comparison is native
regression evidence; the earlier authenticated one-of-four survivor artifact
was lost. Fresh composed member reads and private Rules denials do not establish
that exact comparison or a fresh rendered PDF survivor count. The original
definitions and historical 0.5.67 audit remain
in [PC08 Bug Audit](PC08_BUG_AUDIT.md).

The single independent Sol 6.1 review returned nine findings, repaired in
bounded test-first commits. Eight further directly blocking acceptance defects
were repaired, including the current public-attack listener, normal-clock
promotion and fighter-launch lifecycle. Their red controls and fixes are listed
in [PC09 Risk Review](PC09_RISK_REVIEW.md). The same reviewer's one bounded final
verification at `ef0cb942` found no remaining material product defect. Independent
checks pass 418 Functions tests in 16 files, 75 client tests in 10 files, three
deployment tests, strict Functions build and app typecheck. The
[test-change report](PC09_TEST_CHANGE_REPORT.md)
records every changed test/driver against `b36119e9`; assertions are retained,
with no deleted test files or deliberately skipped tests.

## Presentation and release boundaries


The unchanged render budget initially failed at 1,865,401 landing bytes and
497,948 gzip bytes; the first partial import repair still failed the gzip
budget. Both failed runs remain preserved. Ship and governance routes now load
when opened, and the crisis report loads for a joined identity. Final local
landing bytes are 1,705,355 raw and 453,409 gzip, under the unchanged
1,850,458/491,219 budgets; the largest chunk is 497,246 under 512,000.
The full final render benchmark passes at
`/tmp/dow-pc09-resumed-evidence/render-performance-contained-final/results.json`.

The same reviewer identified the newly introduced rejected-download failure
path. Four permanent native regressions fail before repair and pass afterward;
App plus those checks pass 103 tests. The bounded repair contains only the four
new deferred modules, retaining route Back/reload controls and isolating crisis
failure from routed UI. The same reviewer approved `779c3081` in report-only
commit `088fdd56`, independently passing all four rejection regressions, strict
typecheck and documentation validation, and inspecting all 15 prepared cases. The prepared browser check at
`/tmp/dow-pc09-resumed-evidence/deferred-route-recovery-controls/result.json`
passes three pending-load and twelve rejected-download cases at three sizes.
All Back/reload targets meet 44 pixels, notices stay below the header, fonts are
loaded/system monospace, navigation retains the prepared identity, there is no
horizontal overflow and page exceptions are zero. All remote requests are
blocked. This is prepared loading/recovery evidence, not ordinary Auth gameplay.
The previously recorded native, ordinary gameplay and Rules evidence remains
unchanged; this loading delta does not change server authority or Functions.


The isolated five-step scene passes eight viewport/motion cases at
`/tmp/dow-pc09-resumed-evidence/prepared-tour/`: real presenters, keyboard/focus,
visible Back, 44-pixel controls, fonts and no overflow. It makes zero Firebase
calls/writes. This is prepared presentation evidence only.

Pre-reconnect external artifacts are unavailable after the Mac reset. Their
committed code, permanent regressions and historical written reports survive;
missing artifacts do not earn fresh inspectable proof. Fresh results above are
separately identified. Emulator/browser passes do not establish physical
attendance, physical-device testing or actual production gameplay.

Fresh current Rules pass 164 tests in four files; lint passes with zero errors
and 16 warnings, and both Functions/web builds pass. The complete stable-source
native suite passes **7,947 tests in 598 files**. After 0.5.68 metadata, all
44 version/catalog/history checks in six files pass, including the separately
committed historical-snapshot correction. Font consistency passes 62 checks,
copy and bundle checks pass, and threat-model validation passes nine checks.
The rebuilt 207-file Functions tree exactly matches the fresh ordinary-runtime
hash above. The final render benchmark and 66 loading/font checks pass. Final rendered typography also passes 56 PC01 cases, seven surfaces, eight
Voyage metadata renders and four viewport sizes in normal/reduced motion.
The complete ticker gate passes 24 Press/Cycle 0 viewport/font/motion cases and
both normal/reduced lifecycle captures, including the live Press→Red Alert
handoff. Artifacts remain in `/tmp/dow-pc09-resumed-evidence/ticker-contained-final/`.
Candidate CI, exact-main deployment and verified closeout are pending. The actual runtime inventory
contains 232 endpoints and 216 named
affected consumers; Hosting, Firestore Rules and those named Functions are the
prepared deployment surfaces. The WIF path remains unchanged.

The metadata check's two stale PC07/PC08 live-catalog assertions remain in the
failure log; the correction preserves historical release boundaries and adds
exact PC09 allocation/activation coverage. See the test-change report.

## Multiplayer and future full-game acceptance boundary

The strict and composed proofs each start one shared emulator game with 20
ordinary core-player actors, an independently joined Press player and a GM.
The Capybara expansion is enabled; it is not an additional 20-player roster.
The strict proof holds two actual browser contexts (Wing/Press), and the composed
proof holds four (EO/Wing/Ace/Press). Other actors act through authenticated HTTP,
with synthetic presence refreshes; setup and main actions are serialized.
505 strict-proof actions across two battles and the separate 18-actor governance
scenario establish those shared-session workflows. They do not establish 21
concurrent browser clients, sustained overlapping whole-game actions, 21 humans,
physical devices or a complete game played entirely without consulting rules.

PC10 remains a separate parent-owned revision and dispatch. The owner-requested
entry is GM mode, then a full-game single-player demo beside the existing
single-turn demo. It must allow unlimited time with manual advancement and a
fresh-session walkthrough of every role and function across two browsers,
including the real authenticated GM cycle 0→1 transition. The owner also explicitly authorizes the future complete fresh-game dress
rehearsal, approximately 21 independent authenticated client sessions with
overlapping actions, reconnect/retry/privacy checks, and a manual-free usability
pass across PC10/PC11. These are future acceptance requirements, not PC09 proof
or newly implemented behavior. PC11's in-game explanations remain future work. This handoff identifies the gaps without expanding PC09 or
changing future roadmap definitions or statuses.

The owner authorizes a subsequent **PC12**, after PC11: an authoritative server
on her Mac serving players over a Wi-Fi/LAN router without internet. This must
locally provide cloud-dependent runtime services, joining/identity, private
roles, GM controls, persistence/recovery and the applicable game mechanics;
static hosting alone is insufficient. It requires WAN-disconnected multi-client
proof while preserving cloud mode and existing data. Credential copying and
security/network permission changes retain their required approval boundaries.
The parent owns the later canonical roadmap revision and separate Sol 6.1 Max
dispatch, one checkpoint at a time. No PC12 implementation, launch or new prompt
credit is part of this frozen 49-item PC09 release.

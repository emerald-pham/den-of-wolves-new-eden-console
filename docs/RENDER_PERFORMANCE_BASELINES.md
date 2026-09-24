# Render performance baselines

Prompt 637 is enforced by `npm run test:performance:p637`. The command builds
the production application, launches local production and component-harness
servers, and measures the real React surfaces in headless Chromium. It never
contacts production Firebase.

The versioned budgets live in
[`config/render-performance-baseline.json`](../config/render-performance-baseline.json):

| Surface | Budget |
| --- | ---: |
| Complete application JavaScript, raw | 1,850,458 bytes |
| Complete application JavaScript, gzip | 491,219 bytes |
| Largest JavaScript chunk | 512,000 bytes |
| Landing startup, p95 of five cold contexts | 2,500 ms |
| Role Select startup from a cached session, p95 of five cold contexts | 2,500 ms |
| DRADIS update, p95 of 30 renders | 150 ms |
| Hostile attack update, p95 of 30 renders | 120 ms |
| Eight simultaneous private mission hands, p95 of 30 updates | 100 ms |
| Mobile frame interval at 390×844, p95 of 120 update frames | 120 ms |
| Mobile update frames over 50 ms | at most 70 |

The route probe deliberately presents the real application with an offline
cached session. This keeps the measurement local and deterministic while still
exercising production routing, store hydration, the persistent header and
DRADIS shell, and Role Select. The component harness is compiled separately
with Vite's production JSX transform and serves the production `ContactPlot`,
`ShipPlot`, and `AwayMissionDiscardPanel` implementations with bounded
worst-case fixtures. It never enters the deployable application output. Two
animation frames are included in each discrete update sample so layout and
paint scheduling contribute to the threshold. The mobile-sized probe is a
390×844 Chromium viewport on the CI host, not physical-device telemetry; every
one of its 120 retained frames includes a 20-contact DRADIS update.

CI runs the gate after the production build and Playwright installation. Its
machine-readable evidence is uploaded as the `render-performance-p637`
artifact. A failure identifies the breached surface and measured value; budget
failures write and upload those measurements before the check fails. Budget
increases therefore require an explicit edit to the versioned baseline rather
than silently accepting drift.

Baseline version 2 is calibrated from GitHub Actions run `35460826760`: its
shared Linux runner measured a 108.5 ms DRADIS p95 and an 83.3 ms mobile-update
p95 with 49 frames over 50 ms. The enforced limits leave bounded runner
headroom while still rejecting roughly doubled render cost or a sustained drop
below about eight update frames per second. Local results are expected to be
faster and do not replace the CI-host baseline.

Baseline version 4 raises only the complete raw-JavaScript ceiling from
1,660,000 to 1,700,000 bytes after GitHub Actions run `35749928263` measured
1,676,531 bytes for the reviewed universal status and playable Philia repair
releases. The gzip ceiling remains 460,000 bytes, the largest-chunk ceiling
remains 512,000 bytes, and every startup, render-update, and mobile-frame
budget is unchanged. This keeps the intentional feature growth explicit while
retaining the network-size and runtime-performance regression limits.

Baseline version 5 raises only the complete raw-JavaScript ceiling from
1,700,000 to 1,702,000 bytes for the reviewed Macaw repair console. GitHub
Actions run `35793837388` measured 1,701,408 bytes before release. The final
candidate first removed duplicate repair-ledger parsing and redundant ship-data
imports, reducing the measured application to 1,700,842 bytes. Gzip remains
below its existing 460,000-byte ceiling, and the largest-chunk, startup,
render-update, and mobile-frame budgets are unchanged.

Baseline version 6 raises only the complete raw-JavaScript ceiling from
1,702,000 to 1,711,000 bytes for the reviewed Chacau repair console. The exact
P383 candidate measured 1,709,250 raw bytes and 456,914 gzip bytes locally after
adding its production panel, typed ledger hydration, and callable client. The
gzip, largest-chunk, startup, render-update, and mobile-frame budgets remain
unchanged; the raw ceiling retains 1,750 bytes of headroom over that measured
candidate.

Baseline version 7 raises only the complete raw-JavaScript ceiling from
1,711,000 to 1,720,000 bytes for the reviewed Ally repair console. The exact
P384 candidate measured 1,718,751 raw bytes and 457,459 gzip bytes locally after
adding its production panel, typed ledger hydration, and callable client. Its
landing startup p95 was 116.83 ms, cached Role Select startup p95 was 94.5 ms,
DRADIS, hostile-attack, and mission-hand update p95 values were 33.5 ms, 33.5
ms, and 33.5 ms, and the 390x844 mobile probe measured a 16.7 ms p95 with zero
long frames. The gzip, largest-chunk, startup, render-update, and mobile-frame
budgets remain unchanged; the raw ceiling retains 1,249 bytes of headroom over
that measured candidate.

Baseline version 8 raises only the complete raw-JavaScript ceiling from
1,720,000 to 1,728,000 bytes for Prompt 608's focus-managed private-result,
facilitator-call, and endgame dialogs. The exact 0.5.8 candidate at
`825737ed14a6df282c75abff2d3284b0262fcfd6` measured 1,725,076 raw bytes and
459,146 gzip bytes. Its largest chunk was 496,263 bytes; landing and cached
Role Select startup p95 were 97.35 ms and 92.28 ms; DRADIS, attack, and
mission-hand update p95 values were 33.4 ms, 33.5 ms, and 33.4 ms; and the
390x844 mobile probe measured a 16.7 ms p95 with zero long frames. The gzip,
largest-chunk, startup, render-update, and mobile-frame budgets remain
unchanged; the raw ceiling retains 2,924 bytes of headroom over this measured
candidate.

Baseline version 9 raises only the complete raw-JavaScript ceiling from
1,728,000 to 1,736,000 bytes and gzip ceiling from 460,000 to 463,000 bytes
for Prompt 578's Boa recycling panel and callable client. The exact 0.5.9
candidate at `a59c175b08d1c42cbf003dac3c626bf9bec3231b` measured 1,732,938 raw
bytes and 460,873 gzip bytes. Its largest chunk was 496,263 bytes; landing and
cached Role Select startup p95 were 99.44 ms and 95.35 ms; DRADIS, attack, and
mission-hand update p95 values were 33.4 ms, 33.4 ms, and 34.6 ms; and the
390x844 mobile probe measured a 16.8 ms p95 with zero long frames. The largest
chunk, startup, render-update, and mobile-frame budgets remain unchanged; the
new ceilings retain 3,062 raw bytes and 2,127 gzip bytes of headroom over this
measured candidate.

Baseline version 10 raises the complete application JavaScript ceilings to
1,754,000 raw and 469,000 gzip bytes after several production features landed
since version 9. GitHub Actions run `35901421680` measured 1,751,133 raw and
466,468 gzip bytes for the 0.5.18 candidate, including its existing release
history. The unchanged largest chunk measured 496,263 bytes. On that CI host,
landing and cached Role Select startup p95 were 269.6 ms and 215.45 ms;
DRADIS, attack, and mission-hand update p95 values were 134.2 ms, 33.4 ms, and
33.5 ms; the 390x844 mobile probe measured a 66.7 ms p95 with 43 long frames.
All remain within their unchanged runtime budgets. The new size ceilings leave
2,867 raw bytes and 2,532 gzip bytes of headroom over this measured candidate.
The exact version 10 release at `da1077551ddb7c0d818adb63d77be537d4e7c902`
passed the hosted ticker and render gates in Deploy run `35903792629`. Its
uploaded render artifact measured the same raw and gzip sizes, a 77.3 ms
DRADIS update p95, and seven long mobile frames; Hosting reports 0.5.18.

Baseline version 11 raises the complete application JavaScript ceilings to
1,768,000 raw and 473,000 gzip bytes for Prompt 436's private targeting reroll
completion and AEGIS Command and Control redirect. The production bundle for
source candidate `2c5c1d1624d9ce92d4ae974559ae1da0431e7501` measured 1,764,544
raw bytes, 468,652 gzip bytes, and a 496,263-byte largest chunk across nine
JavaScript chunks. Its local P637 run at `2026-09-23T22:04:05.164Z` measured
landing and cached Role Select startup p95 at 121.83 ms and 86.35 ms; DRADIS,
attack, and mission-hand update p95 at 34.4 ms, 34.5 ms, and 35 ms; and the
390x844 mobile probe at 16.7 ms p95 with zero long frames. The unchanged
largest-chunk, startup, render-update, and mobile-frame budgets remain in
force; the new size ceilings retain 3,456 raw bytes and 4,348 gzip bytes of
headroom over the measured candidate.

Baseline version 12 raises only the complete application JavaScript raw ceiling
from 1,768,000 to 1,778,000 bytes for Prompt 212's private Endeavour research
writer and reachable Scientist controls. The exact 0.5.22 candidate at
`9b44b32adb6ef90c521d9836fc3674a849072c7d` measured 1,774,570 raw bytes,
471,583 gzip bytes, and a 496,263-byte largest chunk across nine JavaScript
chunks. Its local P637 run measured landing and cached Role Select startup p95
at 84.18 ms and 80.28 ms; DRADIS, attack, and mission-hand update p95 at 35 ms,
35 ms, and 34.9 ms; and the 390x844 mobile probe at 16.8 ms p95 with zero long
frames. The existing 473,000-byte gzip ceiling, largest-chunk, startup,
render-update, and mobile-frame budgets remain unchanged; the raw ceiling
retains 3,430 bytes of headroom over this measured candidate.

Baseline version 13 raises the complete application JavaScript raw ceiling
from 1,778,000 to 1,781,000 bytes and the gzip ceiling from 473,000 to 474,000
bytes for Prompt 541's arrival-derived, current-group candidate reveal. The
exact candidate at `39abc8b6c4c563382af4ed0f59e8eef6ba186c1b` measured
1,779,168 raw bytes, 473,522 gzip bytes, and a 496,263-byte largest chunk
across nine JavaScript chunks in GitHub Actions run `35948547382`. That run
failed only the former gzip ceiling. Its uploaded render artifact measured
landing and cached Role Select startup p95 at 264.44 ms and 222.55 ms; DRADIS,
attack, and mission-hand update p95 at 100 ms, 33.6 ms, and 33.8 ms; and the
390x844 mobile probe at 66.7 ms p95 with 30 long frames. These measurements
remain within their unchanged limits. The local P637 run at
`2026-09-24T02:11:54.013Z` at `b45b0763007b5ebefb6aed684a3b7dc62be15ced`
measured the same 1,779,168 raw bytes and 472,795 gzip bytes before the
CSS-only candidate-panel padding change. The unchanged largest-chunk, startup,
render-update, and mobile-frame budgets remain in force; the new size ceilings
retain 1,832 raw bytes and 478 gzip bytes of headroom over the CI candidate.
P541 remains partial pending ordinary authorized production-path evidence; no
scout-triggered reveal is claimed.

Baseline version 14 raises the complete application JavaScript ceilings to
1,790,000 raw and 477,000 gzip bytes for Prompt 238's reachable Gorgoneion
Repair Drones control and callable client. The P238 source candidate at
`a7a1e9dc2a0bddb1b6a46d9183f76f826ad01d40` measured 1,787,246 raw bytes,
474,963 gzip bytes, and the unchanged 496,263-byte largest chunk across nine
JavaScript chunks. Its local P637 run at `2026-09-24T04:36:49.036Z` measured
landing and cached Role Select startup p95 at 85.18 ms and 80.3 ms; DRADIS,
attack, and mission-hand update p95 at 34.4 ms, 34.5 ms, and 34 ms; and the
390x844 mobile probe at 16.8 ms p95 with zero long frames. Against version 13,
only the raw and gzip ceilings were exceeded. The new size ceilings retain
2,754 raw bytes and 2,037 gzip bytes of headroom; the largest-chunk, startup,
render-update, and mobile-frame budgets remain unchanged. P238 remains partial
until an ordinary authorized repair succeeds end to end against the deployed
exact SHA; no live repair proof is recorded yet.

Baseline version 15 adds 512 bytes to the raw JavaScript ceiling for the
optional-ship admission and Gorgoneion integration. The exact pre-calibration
source SHA `9b24b2ea7643b655b319b4322e2268b1a71dbf25` measured 1,789,974 raw
bytes, 475,779 gzip bytes, a 496,263-byte largest chunk across nine chunks,
landing and cached Role Select startup p95 at 82.71 ms and 79.62 ms, DRADIS,
attack, and mission-hand update p95 at 34.6 ms, 34.6 ms, and 34.4 ms, and a
390x844 mobile frame p95 of 16.7 ms with zero long frames. The revised raw
ceiling is 1,790,512 bytes, leaving 538 bytes over that exact measurement; the
gzip ceiling retains 1,221 bytes of headroom. Version 15 changes only the raw
bundle ceiling. Gzip, largest-chunk, startup, render-update, and mobile-frame
ceilings remain unchanged, and the admission parser remains full-map and
fail-closed.

Baseline version 16 raises the complete application JavaScript ceilings to
1,801,000 raw and 478,500 gzip bytes for Prompt 244's Warrior Repair Drones
panel and client. The exact deployed 0.5.25 source at
`92931e92cdd0f6aafaca1f806e340b6adb9ad902` measured 1,789,974 raw bytes,
475,779 gzip bytes, and a 496,263-byte largest chunk across nine chunks in a
local P637 run on 2026-09-24. The pre-calibration P244 candidate at
`388e090ce4fce1f74ece9d2cce25f6de8481f7c3` measured 1,798,767 raw bytes,
477,200 gzip bytes, and the same 496,263-byte largest chunk. P244 therefore
added 8,793 raw bytes and 1,421 gzip bytes over the deployed source. Its
landing and cached Role Select startup p95 were 119.19 ms and 113 ms; DRADIS,
attack, and mission-hand update p95 were 34.5 ms, 33.5 ms, and 33.5 ms; and the
390x844 mobile frame measured 16.8 ms p95 with zero long frames. The new
ceilings retain 2,233 raw bytes and 1,300 gzip bytes of headroom over that
measured candidate. Only the raw and gzip size limits change; largest-chunk,
startup, render-update, and mobile-frame limits remain unchanged. These are
local Chromium measurements, not CI-host or production telemetry. P244 remains
partial until an ordinary authorized production repair succeeds end to end.

After the Warrior Captain authority correction, exact candidate
`e25ca0122fe9e03b46f55f93fca2aa84e08a83a8` was measured with baseline v16 on
2026-09-24. It measured 1,798,767 raw bytes, 477,200 gzip bytes, and a
496,263-byte largest chunk across nine chunks. Landing and cached Role Select
startup p95 were 119.58 ms and 115.95 ms; DRADIS, attack, and mission-hand
update p95 were 35.2 ms, 34.7 ms, and 34.8 ms; the 390x844 mobile frame was
16.7 ms p95 with zero long frames. This confirms the corrected authority path
did not increase the measured bundle or runtime costs, leaving 2,233 raw and
1,300 gzip bytes below the approved ceilings.

Baseline version 17 raises only the complete application JavaScript ceilings
for Prompt 241c's base Capybara Cargo Transfer panel and client. The exact live
pre-calibration source at `01060c498b3be210585d736c5e08b4308de915cb` measured
1,798,767 raw bytes and 477,200 gzip bytes. Exact pre-calibration candidate
`b67383efbaae405e14378122447b297975075d7d` measured 1,807,262 raw bytes,
479,031 gzip bytes, and a 496,263-byte
largest chunk across nine chunks. The feature added 8,495 raw and 1,831 gzip
bytes against the live source; the new ceilings retain 2,238 raw and 1,469
gzip bytes above the candidate. Landing and cached Role Select startup p95
were 149.01 ms and 114.60 ms; DRADIS, attack, and mission-hand update p95 were
33.7 ms, 33.5 ms, and 33.5 ms; the 390x844 mobile frame measured 16.8 ms p95
with zero long frames. The largest-chunk, startup, render-update, and
mobile-frame limits remain unchanged. These are local Chromium measurements,
not CI-host or production telemetry. Prompt 241c remains partial until an
ordinary authorized production cargo transfer is observed with before/after
inventory evidence.

Exact calibrated candidate
`9f6781db0a4a3a93816e3953e985ff2ee612a840` passed baseline v17 on
2026-09-24. It measured 1,807,262 raw bytes, 479,031 gzip bytes, and a
496,263-byte largest chunk across nine chunks. Landing and cached Role Select
startup p95 were 115.92 ms and 111.68 ms; DRADIS, attack, and mission-hand
update p95 were 34.7 ms, 33.4 ms, and 33.5 ms; the 390x844 mobile frame was
16.8 ms p95 with zero long frames. The measured bundle retains 2,238 raw and
1,469 gzip bytes below the version 17 ceilings.

After the independent authority review repairs, exact code candidate
`6217e80bac945d92ccddd02ce19183583d6d790b` passed baseline v17 at
`2026-09-24T09:59:28.268Z`. It measured the same 1,807,262 raw bytes,
479,031 gzip bytes, and 496,263-byte largest chunk across nine chunks. Landing
and cached Role Select startup p95 were 155.54 ms and 103.32 ms; DRADIS,
attack, and mission-hand update p95 were 34.7 ms, 34.9 ms, and 34.5 ms; the
390x844 mobile frame measured 16.8 ms p95 with zero long frames. The exact
candidate retains 2,238 raw and 1,469 gzip bytes below the version 17 ceilings;
all largest-chunk, startup, render-update, and mobile-frame limits are
unchanged.

Before the client authority follow-up, Prompt 241c's rendered panel matrix
passed all eight combinations: 320x844 and 390x844 phones, 844x390 short
landscape, and 1440x900 desktop, each under normal and reduced motion. Every
case had no horizontal overflow, a reachable 44px transfer button, visible keyboard focus
(2px solid orange outline), and the expected monospace font stack. The narrow
phone panel requires vertical scrolling, and keyboard navigation scrolled the
focused transfer control into view. Screenshots and detailed measurements were
captured in the local `/tmp/p241c-rendered-20260924` run; those temporary
artifacts are not part of the repository.

After the client-side host and stale-reply checks were added, exact code
candidate `163d7d6cf967a9a71377b68d973ed397295115c1` passed baseline v17 at
`2026-09-24T10:13:25.226Z`. It measured 1,807,815 raw bytes, 479,105 gzip
bytes, and a 496,263-byte largest chunk across nine chunks. Landing and cached
Role Select startup p95 were 100.27 ms and 100.72 ms; DRADIS, attack, and
mission-hand update p95 were 34.3 ms, 35.4 ms, and 34.9 ms; the 390x844 mobile
frame measured 16.7 ms p95 with zero long frames. This leaves 1,685 raw and
1,395 gzip bytes below the v17 ceilings; all other P637 limits remain
unchanged.

The responsive panel matrix was rerun against that client candidate and passed
the same eight phone, short-landscape, desktop, normal-motion, and
reduced-motion combinations. The dock host had an explicit undestroyed damage
projection, so fresh transfer was enabled. All cases still had no horizontal
overflow, a visible focused 44px transfer control, a 2px solid orange focus
outline, and the monospace font stack. New screenshots and measurements are in
the local `/tmp/p241c-rendered-20260924-v2` run; those temporary artifacts are
not part of the repository.

Baseline version 18 calibrates only the complete-application JavaScript byte
ceilings for Prompt 503a's global facilitator alert and player notice runtime.
Verified live source `c64741b8fdddb14eb3847dc789838d70cd8db2d7` measured
1,807,815 raw bytes and 479,105 gzip bytes in the archived origin/main build.
The P503a candidate with the durable sequence feed measured 1,821,830 raw
bytes, 482,957 gzip bytes, and a 500,784-byte largest chunk across nine chunks:
+14,015 raw and +3,852 gzip bytes over that source. The version 18 raw and gzip
ceilings are 1,822,830 and 483,957 bytes, each 1,000 bytes above the measured
candidate; the largest chunk ceiling and every timing/frame limit remain
unchanged. Its landing and cached Role Select startup p95 were 103.46 ms and
106.05 ms; DRADIS, attack, and mission-hand update p95 were 35.3 ms, 33.5 ms,
and 35.4 ms; the 390x844 mobile frame p95 was 16.7 ms with zero long frames.
These are local Node 23.10 Chromium measurements, not CI-host or production
telemetry. The exact candidate and calibrated v18 rerun are recorded in
`/tmp/p503a-p637-feed-20260924/results.json`; remeasure if reviewed application
code changes.

Baseline version 19 calibrates only the complete-application JavaScript byte
ceilings for Prompt 513's private arrest-posse calculator. The implementation
candidate at `27563a7b73b70ea80acb1c53cf8e3c93923068ec` measured 1,829,603 raw
bytes and 484,147 gzip bytes across eight chunks, adding 7,773 raw bytes and
1,190 gzip bytes over the version 18 P503a candidate. The v19 raw and gzip
ceilings are 1,830,603 and 485,147 bytes, each 1,000 bytes above that measured
candidate. The largest chunk measured 501,157 bytes and remains below its
unchanged 512,000-byte ceiling. Landing and cached Role Select startup p95 were
104.94 ms and 102.53 ms; DRADIS, attack, and mission-hand update p95 were
34.6 ms, 35.0 ms, and 34.6 ms; the 390x844 mobile frame p95 was 16.8 ms with
zero long frames. These measurements are local Node 23.10 Chromium results,
not CI-host or production telemetry. Exact source measurements are recorded in
`/tmp/p637-render-performance/results.json`; remeasure if reviewed application
code changes.

Baseline version 20 calibrates only the complete-application JavaScript byte
ceilings for the reviewed Maliades state integration. The exact clean main
source at `3bf93ced10aed8240214077240df087ee0cd8584` measured 1,842,219 raw
bytes and 488,383 gzip bytes across nine chunks, already 11,616 raw and 3,236
gzip bytes above v19. Candidate `d0e2c3dff750b79091627ac39f4bb2520fe0a918`
measured 1,849,458 raw bytes, 490,219 gzip bytes, and a 506,760-byte largest
chunk across nine chunks: +7,239 raw and +1,836 gzip bytes over clean main.
The v20 raw and gzip ceilings are 1,850,458 and 491,219 bytes, each exactly
1,000 bytes above the measured candidate. Largest chunk remains below the
unchanged 512,000-byte ceiling by 5,240 bytes.

Candidate landing and cached Role Select startup p95 were 103.8 ms and
95.52 ms; DRADIS, attack, and mission-hand update p95 were 33.4 ms, 33.5 ms,
and 35.1 ms; the 390x844 mobile frame p95 was 16.8 ms with zero long frames.
The corresponding clean-main values were 102.13 ms, 99.22 ms, 34.8 ms,
34.4 ms, 34.9 ms, and 16.8 ms with zero long frames. The largest-chunk,
startup, render-update, and mobile-frame budgets remain unchanged. These are
same-toolchain local Node 23.10 Chromium measurements, not CI-host or
production telemetry. The clean-main and candidate results are recorded in
`/tmp/p397-main-p637/results.json` and
`/tmp/p397-candidate-no-lazy-p637/results.json`; the candidate is 0.5.31 with
P397/P453 still partial pending source-supported production paths. Remeasure
if reviewed application code changes.

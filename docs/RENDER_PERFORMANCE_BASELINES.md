# Render performance baselines

Prompt 637 is enforced by `npm run test:performance:p637`. The command builds
the production application, launches local production and component-harness
servers, and measures the real React surfaces in headless Chromium. It never
contacts production Firebase.

The versioned budgets live in
[`config/render-performance-baseline.json`](../config/render-performance-baseline.json):

| Surface | Budget |
| --- | ---: |
| Complete application JavaScript, raw | 1,728,000 bytes |
| Complete landing JavaScript, gzip | 460,000 bytes |
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

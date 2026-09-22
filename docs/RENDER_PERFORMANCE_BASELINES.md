# Render performance baselines

Prompt 637 is enforced by `npm run test:performance:p637`. The command builds
the production application, launches local production and component-harness
servers, and measures the real React surfaces in headless Chromium. It never
contacts production Firebase.

The versioned budgets live in
[`config/render-performance-baseline.json`](../config/render-performance-baseline.json):

| Surface | Budget |
| --- | ---: |
| Complete application JavaScript, raw | 1,700,000 bytes |
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

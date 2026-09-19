# Render performance baselines

Prompt 637 is enforced by `npm run test:performance:p637`. The command builds
the production application, launches local production and component-harness
servers, and measures the real React surfaces in headless Chromium. It never
contacts production Firebase.

The versioned budgets live in
[`config/render-performance-baseline.json`](../config/render-performance-baseline.json):

| Surface | Budget |
| --- | ---: |
| Complete landing JavaScript, raw | 1,600,000 bytes |
| Complete landing JavaScript, gzip | 460,000 bytes |
| Largest JavaScript chunk | 512,000 bytes |
| Landing startup, p95 of five cold contexts | 2,500 ms |
| Role Select startup from a cached session, p95 of five cold contexts | 2,500 ms |
| DRADIS update, p95 of 30 renders | 100 ms |
| Hostile attack update, p95 of 30 renders | 120 ms |
| Eight simultaneous private mission hands, p95 of 30 updates | 100 ms |
| Mobile frame interval at 390×844, p95 of 120 frames | 35 ms |
| Mobile frames over 50 ms | at most 2 |

The route probe deliberately presents the real application with an offline
cached session. This keeps the measurement local and deterministic while still
exercising production routing, store hydration, the persistent header and
DRADIS shell, and Role Select. The component harness exercises the production
`ContactPlot`, `ShipPlot`, and `AwayMissionDiscardPanel` implementations with
bounded worst-case fixtures. Two animation frames are included in each update
sample so layout and paint scheduling contribute to the threshold.

CI runs the gate after the production build and Playwright installation. Its
machine-readable evidence is uploaded as the `render-performance-p637`
artifact. A failure identifies the breached surface and measured value; budget
increases therefore require an explicit edit to the versioned baseline rather
than silently accepting drift.

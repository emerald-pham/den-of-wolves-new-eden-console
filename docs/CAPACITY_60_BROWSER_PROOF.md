# 60-browser capacity proof

Prompt 639 is exercised by `npm run test:capacity:p639`. The command requires a
clean tracked tree and a freshly started emulator reserved to the same worktree.
It verifies the Firebase hub, clears Auth and Firestore, confirms the session
collection is empty, launches real headless Chromium pages, runs for 15 minutes,
writes `/tmp/p639-browser-capacity.json`, and validates the artifact against the
measured source commit. A later commit may change only the named audit, catalog,
and generated documentation files; any runtime, harness, threshold, dependency,
or configuration change invalidates the measurement. The committed closure artifact is
[`docs/audits/p639-60-browser-capacity.json`](audits/p639-60-browser-capacity.json).

## Scenario

- 20 independently authenticated player identities, each open in three browser
  tabs, produce 60 concurrent Chromium pages.
- Every page holds a session listener and its own private player listener and
  sends production-cadence presence heartbeats every ten seconds. Starts are
  staggered across the cadence.
- Two separately authenticated GM controllers keep their real server leases
  current and race the production `adjustShipResource` callable once per minute.
  Every race must yield one commit and one stale contention receipt.
- One three-tab identity disconnects and reopens after the midpoint. The complete
  disconnect and resume path must finish within five seconds.
- Browser transport injection produces one 503/unavailable response and one
  429/resource-exhausted response. Each is followed by a measured real-emulator
  call. This proves that the next fresh call succeeds; it does not claim that the
  client automatically retried the injected failure.
- Heartbeats count only when they start at or after the declared load-window
  start and complete at or before its end. Setup, teardown, and boundary-crossing
  calls remain visible in the artifact but do not inflate measured coverage.

The harness records no session, request, join-code, or user identifiers. Local
Firebase Emulator and local Chromium produced no billable service use, so the
recorded actual cost is `$0`. This is a local capacity proof; it does not claim
production Firebase latency, production cost, or internet-path capacity.

## Versioned thresholds

The machine-readable budgets live in
[`config/capacity-60-browser-thresholds.json`](../config/capacity-60-browser-thresholds.json).

| Measurement | Required result |
| --- | ---: |
| Browser pages | 60 |
| Sustained duration | 900,000 ms |
| Browser heartbeat coverage | at least 95% |
| Browser heartbeat error rate | at most 1% |
| Browser heartbeat p95 | at most 8,000 ms |
| Action-to-listener p95 | at most 5,000 ms |
| Three-tab reconnect | at most 5,000 ms |
| Next real call after injected 429/unavailable | at most 5,000 ms |
| Concurrent action races | at least 14 |
| Listener errors | 0 |

The five-second action-listener ceiling was calibrated before closure from a
60-page, two-minute representative run. Its two contention races produced a
4,091 ms p95 while every heartbeat, lease, reconnect, and listener-error check
passed. This budget includes the deliberate Firestore emulator transaction
conflict and retry, plus delivery to every page.

## Closure result

Source commit `ac3e71066326c40ce23dc89570cb9ed7eb0b4efb` passed on local
Chromium 153 with 20 contexts and 60 pages:

| Measurement | Result |
| --- | ---: |
| Browser heartbeats | 5,401 / 5,401 in-window attempts successful; 1 boundary call excluded |
| Heartbeat p95 / maximum | 29.0 ms / 83.8 ms |
| GM lease renewals | 92 / 92 successful |
| Listener subscriptions | 120 steady; 126 across reconnect lifecycle |
| Listener document deliveries | 20,063 |
| Listener errors | 0 |
| Action races | 14; all one commit and one stale receipt |
| Action-to-listener p95 / maximum | 3,195 ms / 3,203 ms |
| Three-page reconnect | 1,654.6 ms; one attempt per page |
| Next real call after unavailable | 715.8 ms |
| Next real call after 429 | 24.4 ms |
| Browser / controller callable attempts | 5,489 / 151 |
| Maximum heartbeat calls in flight per page | 1 |
| Actual billable cost | $0 |

Start `npm run emulators` in one terminal, wait for the ready banner, then run
`npm run test:capacity:p639` in another. The capacity command rejects a missing,
stale, mismatched, or dead reservation and resets the reserved emulator before
measurement. Restart the emulator before another closure run so its in-memory
lock state begins from the same baseline.

# Ticker contract repair handoff

This worktree carries the parked FleetTicker repair on top of the status-only
ATC release. It preserves visible message instances while the authoritative
pool changes, keeps ATC out of future entries while Press is eligible, and
uses measured `(message width + viewport width) / 48px/s` traversal time for
each reduced-motion Stand Down copy. Local completion is presentation state;
the server does not receive animation-frame or pass acknowledgements.

Focused checks:

```bash
npx vitest run --project unit src/components/FleetTicker.test.tsx
npm run typecheck
npx eslint src/components/FleetTicker.tsx
node --check scripts/test-fleet-ticker-browser.mjs
```

Lifecycle evidence uses the same page and real CSS track. It records stable
`data-instance-id` physical groups, full right-edge entry and left-edge exit,
elapsed-time-normalized velocity samples, non-overlap, and Press entry behind
the second Stand Down tail before that tail exits:

```bash
TICKER_SMOKE_ONLY_LIFECYCLE=1 TICKER_SMOKE_ARTIFACT_DIR=/tmp/ticker-contract-repair-normal \
  npm run test:ticker:browser
TICKER_SMOKE_ONLY_REDUCED_LIFECYCLE=1 TICKER_SMOKE_ARTIFACT_DIR=/tmp/ticker-contract-repair-reduced \
  npm run test:ticker:browser
```

The normal artifact records Press → Aegis → two-copy Stand Down → Press and
the reduced artifact records both accessible Stand Down copies and Press
rotation. Run the full responsive ticker smoke before release; do not treat a
local green test as deployment or live proof. This repair intentionally does
not change the implementation-prompt catalog or release metadata.

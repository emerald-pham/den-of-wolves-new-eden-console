# Successful browser capability and remaining Hosting engine check

## Exact browser route used

The capture used **Playwright's independently spawned headless Chromium**, not
WebKit, not an installed Chrome-channel attachment, and not an enabled desktop
browser/IAB provider. Import:
`/private/tmp/dow-pc09-execution-20261004/node_modules/playwright/index.mjs`;
call `chromium.launch({headless:true,timeout:10000})`, then an owned context/page.
The bundled executable was
`/Users/emeraldpham/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`.

Capability check opened only `about:blank` and closed in `finally`. Initial
sandbox launch failed at macOS MachPort bootstrap permission; the explicit
escalated exec check passed. Actual harness:
`/tmp/dow-casting-narrow-browser.mjs`, supported by the repo geometry probe.
It visited only owned Vite loopback ports5178/5179. It owned no persistent user
profile and never called CUA/getTab/getBrowser/IAB APIs. Context/browser closed
in `finally`, including a hard stop-check timer. Therefore this confirms this
independent browser path worked at that time; it makes no diagnosis of gait's
stale IAB binding or the desktop provider's overall availability. No new browser
resource was opened for this note.

## Minimal Hosting emulator allocation

Request a **four-minute HTTP-only window**, one owned Hosting port plus Firebase
emulator hub/logging ports if the CLI opens them. Parent assigns exact ports and
reservation; no browser, Auth, Firestore, Functions or emulator UI is needed.
Reserve all actual CLI listeners, bind each to127.0.0.1, and disable UI.

Before launch hash frozen source `firebase.json`, built `dist/casting/index.html`
and `dist/index.html` plus referenced casting assets. Create only a temporary
local configuration retaining the exact `hosting` object (public path resolved
to this isolated `dist`), with allocated hosting/hub/logging loopback ports.
Use a unique `demo-dow-casting-hosting-<sha>` project and
`firebase emulators:start --only hosting --project <demo> --config <temporary>`.
No deploy command, credential creation, DNS or live project operation.

When ready, run `scripts/casting-hosting-engine-probe.mjs` with explicit
`CASTING_HOSTING_ORIGIN=http://127.0.0.1:<allocated-port>`,
`CASTING_HOSTING_CHECK_DEADLINE=<stop-check UTC ISO>` (within five minutes),
and `CASTING_HOSTING_EVIDENCE=<local JSON path>`.
The prepared probe starts no server/browser and was syntax-checked only.

It verifies actual Firebase Hosting processing of clean/trailing/query/deep and
explicit-index requests under cleanUrls, including bounded same-origin redirects:
GET/HEAD final200, casting HTML rather than main fallback, no-store/no-referrer/
noindex headers, HEAD empty body, repeated clean requests, and main/nearby path
controls. Preserve redirect-chain headers in evidence; query strings must survive
canonical redirects when present. Existing browser evidence covers hash/history;
HTTP cannot transmit fragments. This is an engine routing/header check, not a
new authorization test or production origin qualification.

Use first minute for config/hash/reservation/start, next minute for HTTP probe,
then stop owned process groups and verify ports/PIDs/reservation absent during
the final two minutes. If any engine behavior differs, retain failure and stop;
source repair requires a new observed RED/review cycle before retesting. Keep
shared512000-byte bundle gate, production hosting/security/retention and main
integration holds unchanged. No runtime started while preparing this plan.

# Prompt 603a rendered evidence

From the repository root, use Node.js 20 or newer with the root npm
dependencies installed (`npm ci`). The command expects Google Chrome at
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; set
`CHROME_BIN` to another Chrome executable when that path is unavailable.

Run `npm run test:geometry:603a` from the repository root to launch the local
Vite app and an isolated headless Chrome profile. The script uses the Chrome
DevTools Protocol to capture real `getBoundingClientRect()` values and writes
the reproducible result to `evidence/prompt-603a/geometry.json` and its
volatile-field-free comparison form to `geometry.normalized.json`. It also
writes inspected PNG captures for Role Select and Ship Role Select at
320×844, 390×844, 844×390, and 1440×900, plus settings, role-control keyboard
focus, ship-role keyboard focus, and reduced-motion variants at 390×844. The
44px target assertion applies to touch-sized viewports; the desktop
pointer-sized settings icon is listed explicitly in the JSON.

Each baseline viewport uses a distinct connected-player count (1, 2, 8, or
20), and the browser measures the rendered personnel readout. In development,
the shared `AppHeader` consumes the explicit session-storage seed solely for
this deterministic visual fixture; production builds retain the Firestore
subscription. The CDP run applies Chrome's safe-area override, records every
Role Select/Ship Role Select region, derives all header/ticket/plot intersections,
checks role-control Tab order and focus rectangles, and verifies an absolute
header leaves the viewport after document scrolling. Reduced motion records
the wrapped stationary FleetBroadcast line box. `src/styles/consoleScroll.test.ts`
remains a static cascade contract; it is not presented as DOM geometry evidence.

To prove repeatability, run the command twice with separate output directories
and compare the normalized files, for example:

```sh
PROMPT_603A_EVIDENCE_DIR=/tmp/prompt-603a-a npm run test:geometry:603a
PROMPT_603A_EVIDENCE_DIR=/tmp/prompt-603a-b npm run test:geometry:603a
diff -u /tmp/prompt-603a-a/geometry.normalized.json /tmp/prompt-603a-b/geometry.normalized.json
```

When `PROMPT_603A_EVIDENCE_DIR` is not set, the command writes to this
directory. It overwrites existing files there; use a separate directory for a
repeatability check. The command exits non-zero when an assertion fails, so
the JSON and PNG files should be treated as evidence from the run that
generated them rather than as a substitute for rerunning it. `geometry.json`
records screenshot paths as absolute, run-specific paths; use the PNG files
in the selected output directory and compare `geometry.normalized.json`,
which removes those paths and the generation timestamp.

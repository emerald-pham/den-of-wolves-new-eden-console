# Qualification matrix and bounded runtime request

Source candidate: provider `eb982b6a`; UI functional `d6131d5c`, intro copy
`b75de627`; standalone synthetic build source `46f63dde`. The build is in
`companion-dist/`, with exact hashes in `evidence/standalone-build-manifest.json`.
Vite 6.4.3 completed the isolated build; all seven bundled flags are byte-identical
to approved source assets. Parent must freeze the reconciled exact candidate before running.
No browser/emulator was launched. Allocation is requested, not assumed.

## Browser window: at most 12 minutes, one browser, zero emulators

Serve only the isolated synthetic standalone build on an allocated loopback
port. One browser/context at a time; no production origin, real sign-in,
participant data, invitations, analytics or private paper assets. Use the
existing locked runtime. Stop after the bounded cases or first material blocker;
save evidence and close only owned processes/context. Parent schedules around
other host reservations; do not borrow PC10 or Chain ports/runtimes.

| Configuration | States and concrete checks |
| --- | --- |
| Phone 390×844 | Builder/edit/dropdown/multiple-choice, preview/return, required submission and failure retry; visible labels, 44px controls, safe-area, wrapping and no horizontal overflow. |
| Desktop 1440×900 | Owner responses/CSV, template and instance naming, assignment exact preview, snapshot update and revoke confirmation, recipient-only dossier. |
| Short landscape 844×390 | Long names/details, builder/assignment/revoke/Settings and intro skip; reachable actions and vertical scrolling without viewport traps. |
| Phone with enlarged text | 200% text scale, long Unicode question/choice/name fixtures; labels/controls, return paths and errors remain usable. |
| Reduced motion phone | Static seven-flag gallery, no animation, skip/Settings replay, focus containment/restoration. |
| Normal motion desktop | Full seven-flag intro once; capture paced cuts/movement, complete/skip/Escape/replay, no rapid full-screen high-contrast alternation. |

Keyboard checks: enter/space/select controls, dialog tab containment, visible
focus after skip/replay/close/return and no keyboard-only dead end. Inspect the
accessibility tree for labels, required states, error/status announcements and
owner/recipient screen separation. Invalid account/denied refresh and pending
export invalidation must clear private content; use synthetic coded failures.

Independent typography reviewer reuses this exact artifact and captured computed
styles/screenshots: resolved font and fallback, family/size/weight/line-height,
changed controls/errors/confirmation, wrapping/overflow at representative
phone/desktop/short states. Compare CIC contract and baseline tokens. Platform
fallback must be observed, not inferred from CSS. No second concurrent browser
is needed. Record what was not inspected.

Independent motion reviewer reuses the normal-motion recording/timeline and
reduced-motion evidence. Confirm all seven approved assets are readable, images
keep aspect ratio, dark background is stable, animation has no hazardous rapid
high-contrast flashing, and skip/replay/completion preserve focus. Source timing
or DOM presence alone is not a motion approval.

Evidence: exact candidate/build manifest, platform/browser, viewport/text/motion
settings, screenshots, computed fonts/geometry, keyboard and accessibility
observations, short intro recording/frame timeline, reviewer findings and any
unchecked state. All fixtures and artifacts remain synthetic/local.

## Rules window: separate, at most 4 minutes, one Firestore emulator

Request one complete free coordinated row, using its loopback port and an
isolated `demo-dow-casting-<short-sha>` project. No Auth/Functions emulator or
browser during this window. Do not use another task's row or database. Stop and
release only owned reservation/processes after proof or timeout.

Prepared command after dependency restoration and allocated emulator startup:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:<allocated-port> \
CASTING_RULES_PROJECT_ID=demo-dow-casting-<short-sha> \
node --test companion/firestore-boundary.emulator.mjs
```

The harness rejects missing/nonloopback host or a non-demo project. It seeds
only synthetic documents using the test environment, never production Admin
credentials. Existing root rules already end in deny-by-default for unmatched
namespaces; no rules edit or new client allow is proposed. Engine tests prove
owner/recipient/foreign-owner/genuine-game-GM/unauthenticated get/list denial,
owner/anonymous create/update/delete denial across private companion paths and
published handle documents. A genuine game-GM read positive control distinguishes
denied casting access from a broken fixture/server.

The engine suite is prepared and syntax-checked only; no RED/GREEN rules-engine
result is claimed. If a future rule change is needed, observe its meaningful
engine RED before editing, then GREEN. Handler/store/provider native tests do
not substitute for this rules engine proof or normal real transaction proof.

## Not in these allocations

Live hosting, DNS, Auth/bootstrap, invitations, production rules/data, real
collection/sharing, full-app CI/release, new credentials and private-paper
publication stay blocked. CSV parser round-trip is native evidence; actual
spreadsheet formula interpretation is a separate consumer qualification before
real export use. No data deletion is implemented until tombstone/cascade proof.

# Unconnected provider and CSV qualification milestone


> Latest source milestone: [SESSION_MILESTONE.md](SESSION_MILESTONE.md). Session GM and bearer contracts now have synthetic source/tests; production integration and fresh renders remain pending.

> Current decisions and qualification supersede older proposals below: [DECISIONS_20261008.md](DECISIONS_20261008.md). GM/session authority and bearer links are approved directions, not implemented production contracts.
All fixtures remain synthetic/local. No production connection, rules edit,
identity bootstrap, invitations, real responses/dossiers, credentials or paper
material publication. Parent address/hosting decisions remain pending.

## Provider contract

`provider-contract.mjs` accepts an operation-specific allowlist of payload fields.
Verified identity and App Check status come from trusted, unconnected verifier
dependencies, never actor fields in client payload. Current owner membership
precedes private directory resolution; the final store transaction rechecks it
after async resolution. Recipient lookup uses a verified directory entry rather
than a client-supplied UID. Dossiers use current grants and published snapshots.

Public submission requires a verified attempt scope and nonce, with the receipt
key derived from both, preventing equal nonces in different respondent scopes
from colliding. The actual attempt issuer/verifier, durable identity provider and
database adapter are not implemented or provisioned. Browser demo remains a
separate insecure-by-design synthetic fixture and is not connected to this gateway.

Known revoked/expired/disabled/invalid identity errors become `unauthenticated`
so private UI clears. Only canonical outward codes are permitted; unknown
dependency codes become `internal` without copying private messages/codes.
Transport must enforce ingress limits before parsing; current gateway checks
the parsed 256 KiB envelope and store/model bounds.

Observed RED `63bf1151` preceded gateway implementation `c1c66567`. Error-code
reflection RED `c1950faa` and revoked-identity RED `d9a788a6` preceded `eb982b6a`.
Additional current-behavior composition tests at `46f63dde` retain the independent
owner-removal-during-directory probe and queued unpublish/submission regression;
they are GREEN-only regression coverage, not retrospective RED evidence.

Independent Sol xhigh affected recheck of `eb982b6a` passed provider/CSV 8/8,
confirmed normalization repaired and prior verified-identity/ordering/retry/
projection boundaries unchanged. No remaining finding in that bounded scope;
no real backend approval.

## CSV evidence

Independent Python standard-library `csv.reader` round trips Unicode/emoji,
commas, quotes, LF/CRLF multiline content and JSON multiple-choice values.
Non-dangerous data round trips unchanged. Formula-like values, including
headers/IDs and leading invisible controls, receive an intentional apostrophe
text prefix while preserving the original value afterward. Literal original
formula-like text consequently differs by that defensive prefix.

Hidden-prefix RED `fe341f00` (NUL before `=`) preceded fix `a3a4ed2e`. All tested
formula families `=`, `+`, `-`, `@`, whitespace, tabs/newlines, NUL, zero-width and
BOM are neutralized under the independent parser/normalization checks. No actual
spreadsheet-app formula evaluation was launched; that separate consumer gate
remains before real-data use. No XLSX or private material was generated/uploaded.

## Built UI and pending rules engine

The isolated standalone synthetic Vite build passed using the existing read-only
PC09 Vite 6.4.3 dependency runtime. The primary dependency cache lacked Rollup's
native module; it was not repaired or mutated. No dependencies were installed.
Build source is `46f63dde`; exact ten-file hashes and seven approved-flag byte
checks are in `evidence/standalone-build-manifest.json`. Local output is
`companion-dist/`, with root-based asset URLs for loopback qualification only;
future hosting/base changes require rebuilt/reviewed artifacts. No server/browser
was started. Temporary native-test dependency links were removed at handoff.

Existing root Firestore rules deny unmatched companion namespaces. The prepared
`firestore-boundary.emulator.mjs` checks genuine game-GM separation and direct
client get/list/create/update/delete denial for synthetic owner/recipient/
foreign-owner/anonymous actors. It rejects nonloopback or non-demo project
configuration. Syntax was checked; engine suite is unrun, with no rules-engine
RED/GREEN or database security result claimed. No production rule permissions
are expanded by this milestone.

Final native run after source review: **37/37**, zero failures/skips; logs in
`evidence/provider-final-native-green.log`. `git diff --check` passes. These
tests establish source/DOM/synthetic contract behavior only.

Requested runtime: [qualification matrix](QUALIFICATION_REQUEST.md), one browser
at most 12 minutes with zero emulators, then a separate Firestore-only row at
most four minutes. Independent actual-render typography and flag-motion reviews
remain pending; source/build/DOM checks cannot substitute for them.

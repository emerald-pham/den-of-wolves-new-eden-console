# PC09 P605a member discovery recovery handoff

Evidence availability after the Mac reconnect: earlier external `/tmp` files
referenced here were lost. These paths identify historical reported runs;
committed sources and regressions survived. Fresh resumed artifacts and limits
are recorded in [the execution record](PC09_EXECUTION_RECORD.md#reconnection-and-evidence-availability)
and [the risk review](PC09_RISK_REVIEW.md). No missing file grants new proof.

The bounded recovery defect is repaired and the local authenticated gate
passes. PC09 checkpoint completion remains with Root: this is not an
integrated review, CI, release, deployment or production-gameplay claim.

## Diagnosis and repair

On base `db0daeb8d74ae95db8cdcd49efecf08cf01cfbbb`, an ordinary EO could return
with the same identity, session, assigned role, active console and fresh member
session while the local navigation revision was absent. The P433a attack
subscription still returned the current declared attack. `ShipPlot` correctly
withheld its instrument because `readFleetGroupNavigation` rejected missing
fresh discovery authority. The sanitized trace located the loss at identity
rehydration after offline recovery.

The member discovery listener could publish before the independent player and
member-session authorities confirmed. App withdrew that unconfirmed discovery;
an unchanged Firestore document did not necessarily produce another event.
The product repair holds only the active subscription's fresh server discovery
and publishes it after player and member-session confirmation, in the order
App requires. Revocation, session/listener errors and cached or absent discovery
clear the pending projection. Its group must match the confirmed member.

Only `src/lib/firestore.ts` changes product behavior (29 added lines). There are
no Functions, Rules, schema, attack mechanics, presenter, layout or palette
changes. The original Astra P605a implementation remains the original
`52d0ee9c` product integrated as `3c80d9fd`; all recovery changes are Sol work.

## Ordered commits

| Commit | Purpose |
| --- | --- |
| `dc16646c862148c148bfe393c031cc68c45bb796` | Six member/discovery ordering and privacy regressions; suite red before repair, plus the initial ordinary-auth diagnostic driver. |
| `46aa86440611fcf74e1e1ce1a5c755a49a03be43` | Two additional red regressions for listener failure and a late callback while revoked. |
| `b124229a48afa6b93f7c6273194ef1ab72c6be57` | Product-only feed ordering repair. |
| `5a61fee597f38c0b95c221895611dc8b75bd75ba` | Test-only Rules, focus, motion, viewport, parent navigation and revocation proof. |
| `aaea0bc9da17606abd055aafd37da8fab81e835c` | Test-only ordinary Close DRADIS → Settings → reopen sequence. |
| `0ef9e999620f36d5363704fe78d9e82e0590dd44` | Test-only visible ship-parent route. |
| `d839679a024d6cfe537c6d1f734a5eed0ec71b76` | Test-only decorated accessible link selectors and safe parent metadata. |
| `a52c61105b4d346659cebbc68379f0234a7bb85c` | Test-only settled geometry capture and contained-readings assertion. |

The ordering suite failed before the fix and all eight regressions pass after
the repair.
Existing tests were not changed, skipped or deleted. Product source is
unchanged from `b124229a` through the final browser candidate `a52c6110`.

## Current local evidence

Evidence directory: `/tmp/pc09-dradis-recovery-evidence-20261004/`.
The final actual-auth record is `settled-recovered-instrument-auth.json` and
embeds exact source SHA `a52c61105b4d346659cebbc68379f0234a7bb85c`.
It retains only safe route/authority/currentness metadata and identity equality
booleans; it retains no tokens, player/session identifiers or private panels.

The driver uses real browser Auth, session join, regulation acknowledgement
and assigned EO station selection, plus ordinary authenticated HTTP and
Firestore Rules. The session has 20 ordinary players and the Capybara expansion
so the printed EO station exists. Normal GM actions stage and declare a first
attack. The sole fixture mutation accelerates two disposable turn-clock
deadlines. There is no auth-storage injection, admin-seeded membership or
attack projection, GM repair-all, outcome forcing or hidden-state rendering.
Cleanup deletes the disposable session.

All nine checks pass:

- Initial current declared P433a projection, offline withdrawal, online return,
  and same-identity HTTP resume/presence refresh, browser reload and ordinary
  EO chooser reselection.
- After both recovery points: same actor/session, live connection, server
  freshness, navigation revision 1, accepted current group navigation and
  current member attack projection, with the local instrument visible.
- Private session/attack/preparation/server reads and player writes to the
  authoritative attack projection are denied by Rules.
- Keyboard focus enters the readings region and Tab continues. Ordinary
  Settings select both motion preferences. Reduced-motion sweep duration is
  zero; normal motion remains active.
- Four actual-console viewports (320×740, 390×844, 844×390, 1440×900) in both
  motion modes have no horizontal document overflow, contained scrollable
  readings, 14px monospace type and a 44px-high Close DRADIS control. Finite
  transitions settle before measurement; eight instrument-only crops were
  visually inspected and exclude private role/loyalty content.
- The visible ship overview remains aboard; its Back to fleet control
  withdraws the instrument. Ordinary reselection and browser Back/Forward
  withdraw and return it as expected.
- A normal authorized GM kick withdraws the same player's session/instrument;
  the revoked identity cannot read the audience projection or resume.

There are zero browser errors. The attack is declared/targeting with no committed
result rows; this bounded case proves recovery, not the full later combat or
result-row workflow. Earlier P605a result-row proof remains historical evidence
in the original handoff and Root owns integrated gameplay proof.

## Focused and rendered gates

| Gate | Result |
| --- | --- |
| Member recovery, Firestore, App, audience adapter, local navigation and P605a | 309/309 unit tests, including 8 new recovery tests and 5 audience-adapter tests. |
| ContactPlot/local contacts/ShipPlot/local authority/review safety | 103/103 unit tests. |
| Current P433a native audience contract | 18/18 Functions tests. |
| Console-font/aesthetic unit gate | 61/62; adjacent aftermath palette failure remains Root-owned. |
| Rendered typography | 56 cases, 7 surfaces, 8 Voyage metadata renders, four viewports and both motion modes passed. |
| Ticker geometry/render/lifecycle | 33 geometry fixtures, 24 visual cases and normal/reduced lifecycle passed. |

Typography/ticker use prepared presentation fixtures and are separate from the
actual-auth P605a case. Their source/provenance records are in `typography/`
and `ticker/`; product source for those runs was `b124229a`. The overall local
record is `local-validation-provenance.json`.

## Preserved failures and remaining owner work

The base failure is `discovery-order.json.failure.json.sanitized.json`. It
records accepted P433a subscription but missing discovery/navigation authority.
The earlier `diagnosis.json.failure.json.sanitized.json` has an unreliable
member diagnostic caused by unsubscribe cleanup; use the corrected file for
that field. The first passing basic record, `candidate-recovery.json.sanitized.json`,
sampled transient pre-wait states; use the final settled record for final
currentness and geometry claims. Historical row-5 failures remain unchanged.

The enhanced driver's failed Settings and parent-link steps are retained in
`recovery-privacy-rendered.json.failure.json`,
`verified-recovery-privacy-rendered.json.failure.json` and
`recovered-instrument-auth.json.failure.json`. They led to test-only ordinary
control corrections; they are not rewritten as passing runs. The intermediate
`final-recovered-instrument-auth.json` passed all behavior checks but one normal
geometry sample caught an opening transition, superseded by the settled record.

TypeScript remains blocked by missing specialist/crisis review imports and
review-scene prop reconciliation in this partial integration tree (`typecheck.log`).
The aesthetic failure names two existing hardcoded colors in
`WolfAttackGmAftermathView.css`; Root owns the token correction. Root also owns
the single PC09 version/changelog, catalog facts, complete-group integration,
fresh independent review, exact integrated validation, CI and release boundary.
No catalog, version, push or deployment changes were made by this worker.

## Fresh resumed root verification

Root reran the unchanged normal Auth driver on `2ccd9762` client/driver against
frozen Functions `296dd59b` (207 JS/hash `54d4c79e…7a260`). The inspectable
`/tmp/dow-pc09-resumed-evidence/dradis/result.json` passes all nine checks and
eight rendered cases, completed at 23:39:17 UTC. Its pre-run sidecar records
source, runtime and Rules hash. Phone, desktop and short-landscape instrument
screenshots were visually inspected. This declares a real targeting attack and
proves recovery, private reads/write denial, revocation, keyboard and motion;
it does not claim finalized combat rows. Those rows use the separate actual
two-attack proof. Zero page exceptions are recorded; no production or physical
device claim is made.

The fresh strict battle proof at `cba5d520` also completes the actual finalized
result-row acceptance on frozen `296dd59b` Functions. Its seven visible committed
rows exactly equal the current Wing member's local-contact filter, with nonempty
Source/Outcome, truthful unknown bearings and no opaque target ID or invented
coordinate attributes. The actual projection GET succeeds under Rules; private
root reads deny. Raw, identity-free summary, pre-run binding and cropped reading
are in `/tmp/dow-pc09-resumed-evidence/positive-rebuild-arrival-contract/`.
All captured browser errors are zero in that separate 24-check battle/build
proof. The standalone eight motion/viewport cases remain targeting evidence;
the two proofs' boundaries are preserved.

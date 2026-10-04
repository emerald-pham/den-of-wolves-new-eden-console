# PC09 P605a DRADIS visualization handoff

## Disposition

**Pending root recovery follow-up.** The owner activated the bounded P605a visualization, and the
candidate implementation is present, but this handoff does not claim P605a
closure or a PC09 release. The normal authenticated recovery proof repeatedly
fails to reacquire the panel after offline recovery, same-identity reload and
ordinary console reselection. The checkpoint owner retains the repair,
catalog, integrated review, final validation and release decisions. Prepared
review scenes are presentation evidence only.

P605a consumes P433a's audience-safe member view. Its explicit activation makes
its acceptance required for the full PC09 exit gate. Its assigned ID and PC09 target stay
with the checkpoint; the catalog and generated views were not changed here.

## Scope and implementation

The code-only candidate is `4280ffae6233a1bda651b59921a72a3ec6c3b65e`
(`feat(dradis): show entitled committed Wolf attack readings`), based on
`b36119e9cdcf43e65bdfc00538b67115b0214ee2`. Root integrated that product
commit as `3c80d9fd`. The separate test-first commits are
`9348741cf8160672fe7f998e4257029443dcfbfc` and fixture-only
`4fbd229543fba63728da13eb7fd05cec8b5c8a88`.

`WolfAttackDradisView({ view, visibleTargetIds })` renders only the committed
P433a `WolfAttackMemberView`. `WolfAttackDradisPanel` obtains that member view
through the current session's `subscribeWolfAttackMemberView` subscription
when the actual `ShipPlot` has current local authority. Current local plotted
fleet ship IDs gate fleet-target rows. An already-published opaque Wolf
contact reference remains a text label with unknown bearing; it never creates
a plot contact or geometry. Null bearings are displayed as **Unknown**. The
view presents source, phase, range, target/contact, bearing, effect, result and
server time/deadline from the allowlisted projection. It does not read or
render preparation, hidden roster, roll/die, UID, or opaque contact ID values.

The implementation adds the presenter and its CIC stylesheet and integrates
it at the existing ShipPlot/ContactPlot boundary. It follows current DRADIS
tokens, type, colors, symbols, density, and interaction patterns. It does not
edit the review-scene entry point or change Functions, Firestore Rules, the
P433a schema, or attack lifecycle.

Source alignment was checked against the Player's Guide's DRADIS guidance
(pp. 12–13), the Wolf ship cards and AEGIS Battle Sheet, and the Facilitator
Guide's attack procedure (p. 10). Those sources were used as visual and
terminology references; no source text is reproduced here. The implementation
continues the truthful existing local contact projection described in
[`PC07_PC10_ALIGNMENT.md`](PC07_PC10_ALIGNMENT.md).

## Validation evidence

The candidate source SHA captured by the local authenticated harness was
`4280ffae6233a1bda651b59921a72a3ec6c3b65e`. Existing focused checks pass:

- ContactPlot, local contacts, ShipPlot, review safety and the new presenter:
  109/109 unit tests.
- P433a native audience contract: 17/17 Functions tests.
- P433a Firestore client adapter: 5/5 unit tests.
- Console-font consistency: 62/62 tests.

Normal authenticated local/emulator browser runs used disposable sessions and
current P433a attack projection, with no admin-seeded member or projection.
They passed these P605 checks before recovery:

- The player's current P433a audience projection matched rendered source,
  target, range, bearing and effect rows after filtering known fleet targets
  through the current local ShipPlot contacts. Opaque Wolf IDs were absent;
  published contact references remained textual; no attack target geometry
  was introduced.
- Ordinary player direct Firestore reads of private Wolf attack state,
  preparation and server state were denied. The projection's top-level
  fields matched its fixed safe allowlist.
- The readings region accepts keyboard focus and Tab continues navigation.
  The browser selected reduced motion through the normal landing control and
  the DRADIS sweep computed to zero duration.
- Responsive checks passed at 320×740, 390×844, 844×390 and 1440×900:
  no horizontal document overflow, the panel/readings remained measurable and
  scrollable, and the rendered font was monospaced. Full-page screenshots are
  in `/tmp/pc09-dradis-auth-evidence-20261004/` with one PNG per size. The
  screenshots show the actual joined console and live attack result rows; they
  are not prepared-scene evidence.
- Browser Back removed the panel; Forward restored it. Going offline removed
  the subscribed projection.

Recovery did **not** pass. Across two earlier complete authenticated runs and
the latest bounded run, the same-identity server refresh and same session/role
were confirmed, and the driver used the ordinary `/console` chooser to reselect
the EO station. It then timed out waiting for `.wolf-attack-dradis` to become
visible at `scripts/test-pc08-composed-attack-http.mjs:613`. The latest failure
occurred after the regulation acknowledgement was stabilized and after the
offline withdrawal assertion. The harness did not capture a sanitized DOM or
local-navigation snapshot at failure, so the precise cause is not established.
This is an open P605a gate; no reconnect or full acceptance claim is made.

The live-browser assertions are an extension of
[`test-pc08-composed-attack-http.mjs`](../scripts/test-pc08-composed-attack-http.mjs)
and remain test-only. Its existing failure path may write a temporary private
state diagnostic; the row-5 run wrapper removed that file after failure. No
private state, failure screenshot or disposable session identity is included
in this repository handoff.

## Source notes and next action

The canonical P605a catalog acceptance calls for source/target/phase/range/
bearing/effect/outcome from the authoritative projection without changing
contact privacy or inventing telemetry. P433a is the existing endpoint/privacy
contract. The PC07–PC10 alignment keeps contact names bound to visible local
contacts and preserves existing DRADIS behavior; the PC08 audit separately
records open attack-result projection findings, so those are not implicitly
resolved by this visualization.

Root owns inspection and the post-reload repair. Resume by checking why the
ordinary chooser returns to an EO role with live/fresh session state while the
current `ShipPlot` attack panel does not return; preserve the current row-5
evidence and do not seed a projection or widen endpoint visibility. Then rerun
only the discriminating recovery case on the reconciled candidate and update
this handoff. Root owns independent review, exact-candidate validation, CI,
catalog status and the PC09 release boundary. This handoff records an unresolved
acceptance gate, not an owner instruction to stop the task. Root transferred
the bounded recovery work to a separate Sol 6.1 Max worker after the repeated
Luna gate failures. The original Astra implementation worker remains finished
and receives no new assignment.

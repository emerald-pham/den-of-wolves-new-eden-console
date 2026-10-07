# Mobile GM hotfix

Owner-directed urgent repair, isolated from unfinished PC10 on the live
`0.5.68` base `248ba5fe7460dd2708baf4dc152190001ffbdb20`.
The original dirty checkout, PC09 evidence, and PC10 candidate remain preserved.
This hotfix earns no numbered-prompt closures.

## Scope and acceptance

- Expanded GM DRADIS must occupy a usable modal surface above the header and
  Primary Status. A normal phone tap closes it. Escape, keyboard containment,
  restored focus, narrow phone, desktop, and short landscape must work with
  normal and reduced motion, using existing design tokens and fonts.
- An authenticated GM must recover from ordinary mobile link interruption and
  natural presence expiry through the original owned claim. Live authority
  still expires after 45 seconds. Recovery must never reverse an explicit
  kick, release, signout/revocation, changed claim, foreign identity, terminal
  session, or conflicting core station. Inactive claims cannot expose private
  data, retain a ship write grant, or reclaim another GM's occupied lanes.
- Server GM authorization and its device timestamp last seven days. Persist no
  password. Initial Code of Conduct acknowledgement also lasts seven days,
  with all three checkboxes and the existing ten-second review preserved.
  Changed or unversioned terms require real acknowledgement again. The
  separate motion-safety choice retains its existing duration.
- Awaiting CIC authentication/handshake uses the red warning token. Preserve
  the PC09 Cycle 0 wording and Settings explanation that the GM starts the game.

## Baseline evidence and limits

Authenticated actual layout run 5 reproduced the failure on 390×844:
all three sampled close-button points were intercepted by header/ticker/rank
content, and a normal tap timed out. The expanded panel's z-index is trapped
inside the routed ScreenFade stacking context. Screenshot and full geometry:
`/tmp/dow-pc10-evidence/mobile-gm-base-layout-5/`.

Earlier runner attempts 1–4 stopped before this interaction; they provide no
DRADIS bug credit. Run 2 crashed in the observer; its exact session/identity
cleanup is separately retained. All other completed attempts recorded cleanup.

The first presence run retained GM for 70 seconds in the foreground. Chromium's
requested freeze did not suspend its heartbeat, so it provides no suspension
proof. This is not evidence of the cause on the owner's physical iPhone. The
source separately shows that live-list absence or listener failure discards the
remembered claim, while natural lease cleanup deletes the claim altogether.
A real 55-second browser network interruption then reproduced loss of the same
GM instance after reconnect in `/tmp/dow-pc10-evidence/mobile-gm-base-presence-6/`.
Its normal foreground heartbeat remained valid first; the outage aged the lease
beyond 45 seconds. All owned browser/session/identity resources were removed.
This proves a local recovery defect, not the exclusive cause of the reported
iPhone event. The runner-only aborted network launch is retained separately.

## Test changes

New regressions cover exact seven-day server/client boundaries, invalid/future
stamps, version-bound real consent, original actor/lease recovery, missing and
foreign claims, changed leases, explicit disconnection/revocation, expiry,
kicked members, closed sessions, conflicting stations, fresh lease rotation,
private-grant removal, occupied lanes, late and malformed replies, modal escape
and focus return. Existing acknowledgement fixtures use the public acknowledgement
helper for the new record format; these remain prepared unit/render fixtures,
not normal-auth gameplay proof.

Existing modal tests inspect the current portalled node instead of the removed
compact node, preserving expansion/collapse motion assertions. The geometry fixture counts
only DRADIS source/destination measurements, so ContactPlot reads cannot consume
its four expected bounds. The missing-manifest assertion waits for the actual
asynchronous listener event rather than assuming it has already occurred. Existing GM
manifest-error/missing-instance tests now require immediate removal of live
freshness and private crisis data while retaining the remembered descriptor for
server reconciliation. Late private callbacks remain rejected. Existing explicit
role-demotion, no-claim, private rules, and server revocation expectations remain.
The waiting-state test now expects the owner's red token with the same accessible
copy. An additional ephemeral recovery-state test ensures it is never persisted and
resets on identity reset. A mounted recovery hold keeps private controls absent
while the original claim is checked. An explicit server role-demotion negative
prevents automatic promotion of a fresh demoted claim. No tests are skipped or
deleted; test-name selection is reported separately from full-file validation.

## Release plan

One reconciled standalone hotfix candidate, risk review, focused local gates,
authenticated local interruption/recovery cohort and responsive visual checks,
then exact-candidate CI, authorized push/merge, exact-main CI and production
revision/health verification. No production gameplay mutations. No PC10, PC11,
PC12, licensing, or unrelated service changes are included.

Implementation, final evidence, independent findings and exact release receipts
are pending. Do not describe this candidate as released.

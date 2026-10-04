# PC09 threat-group handoff

Evidence availability after the Mac reconnect: earlier external `/tmp` files
referenced here were lost. These paths identify historical reported runs;
committed sources and regressions survived. Fresh resumed artifacts and limits
are recorded in [the execution record](PC09_EXECUTION_RECORD.md#reconnection-and-evidence-availability)
and [the risk review](PC09_RISK_REVIEW.md). No missing file grants new proof.

This is the bounded threat/Commander group handoff for branch
`feat/pc09-threats-20261004` in `/private/tmp/dow-pc09-threats-20261004`.
The parent remains checkpoint and release owner.

## Current handoff

The additional P Station blocker is fixed test-first in these commits, in
order:

1. `f48c82d5` — red regression for same-cycle PDF Escort Wing reset, loss
  retention, and rejection without the exact P context.
2. `5838a3e0` — test-only refinement tying the accepted repeat to the exact
  next attack number.
3. `a2442b62` — permit the PDF reset only when the caller supplies the
  validated P Station repeat context, matching parent attack ID, same source
  cycle and turn, exact next attack number, and a distinct attack ID. The wing
  retains its current fighter count and cumulative losses while per-attack
  actions reset. Ordinary same-cycle resets remain rejected.

The declaration validator returns that context only after it has validated
the live P window and exact private repeat plan against the prior resolved
state, immutable finalization audit, survivor record, group, source and
preparation. The transaction compares the preflight and transactional
contexts before passing the value to the PDF state transition. The exception
does not apply to ordinary attacks or change the ordinary three-attack cap.

Focused local evidence: `npm run build --prefix functions` exited 0;
`npm test -- --run functions/src/pdfEscortWingState.test.ts
functions/src/wolfAttackDeclaration.test.ts
functions/src/wolfAttackDeclarationCallable.test.ts
functions/src/wolfAttackLifecycle.test.ts` passed 135/135.
`git diff --check` passed.

## Gameplay evidence and gaps

The L/M Auth proof at `/tmp/pc09-threat-entry-auth-74ab.json` passed through
normal authenticated source selection, window, staging and declaration. The
pressure accepted for L is one Battlestation plus 20 other capacity; M is two
Battlestations plus 25 other capacity. The M value follows the printed
Facilitator Guide pressure schedule (PDF page 17, printed page 15) and the
released pressure schedule; the catalog's “at least one plus 20” wording is a
minimum. P uses one Battlestation plus 20 other capacity.

The amnesty Auth proof at `/tmp/pc09-amnesty-auth-74ab.json` passed: the
address event stores its canonical top-level `message`; only the target
captain receives the private offer, direct client Firestore access is denied,
and accept, decline/expiry and facilitator consequence remain explicit. The
offer never applies an automatic bargain. The connected browser run
`/tmp/pc09-threats-evidence-owner-74ab-ui-final.json.failure.json` reached the
current Commander brief at 390px and submitted the address and offer through
the visible UI; its four Auth/Firestore amnesty checks passed and the saved
address event has canonical top-level `message` and member visibility. That
run is not a whole-suite pass: a later Commander dial request returned
`INTERNAL [500]`, so its UI status wait failed. This endpoint diagnosis is
separate from the P PDF reset repair and remains for owner triage.

A later browser attempt against the `a44a6385` runtime stopped before its
actions: after replacement the page returned to the station catalog without
the “Open private brief” control (`hasRoleBrief: false`). It did not invalidate
the prior address/amnesty actions, but it is not another UI pass.

The pre-fix authenticated P producer run
`/tmp/pc09-p-producer-final-accepted.json.failure.json` used the normal
movement, P pressure, window, staging, declaration, source-choice, range and
finalization handlers. It confirmed that the first attack's immutable
finalizer wrote the identical `pStationRepeat` object to resolved state and
audit, with live survivors and automatically restaged next preparation and
due window. Before this fix, the second declaration failed at the PDF
same-cycle cycle-advance guard. That run used immutable Functions source
`74ab27b194a3a72629d2a4d2a7c3b28b45790b25` (compiled JS SHA256
`6d5526483cf6b3e0c4a240aec686699b18fcd0d5d42f847ed224d9e5080bb956`).
It is reproduction evidence only.

The repaired authenticated run `/tmp/pc09-p-producer-a44a6385-v3.json` passed
against immutable runtime source
`a44a63857f76b77bb376c3a17fcbf76f2ef91123` (sorted compiled JS tree SHA256
`405c2cb4f0dee841d7174e03e511c970397ee4b3ab767b7a992b69d96fceeb01`). It
used the printed 11-player role preset, with only Admin chart selection and
Team/Open Airspace clock fixture updates. Authenticated movement produced the
live P arrival source; the GM selected the P source, opened the window,
staged and declared the first attack; EO and Wing Commander made normal source
choices; and the EO explicitly passed each enabled range. The normal finalizer
then wrote the same repeat plan into resolved state and immutable audit,
atomically opened the next window and staged the exact surviving force. The
same GM declared attack 2 in cycle 1 from that automatic preparation. The
runner checked sequence/source privacy, retained no actor tokens and
recursively deleted its disposable session. No attack, result, survivor,
sequence, finalization audit, next window/preparation or dice result was
seeded.

The older reconstructed P attack-4 probe remains handler-only evidence. It
does not establish producer-authored finalization, automatic restaging or a
normal same-cycle declaration.

## Scope and assumptions

The group owns independent per-group pursuit, L/M/P source pressure and
selected-group windows, the Commander once-per-cycle `10 + selected-group
pursuit` dial, and address/amnesty records and audience-safe presentation.
The P Station source permits immediate same-cycle repetition of exactly the
surviving force while any Wolf survives; its server-created repeat plan opens
the next window and preparation atomically. Empty survivor force stops the
sequence. Ordinary cycle progression, the ordinary attack cap, and separate
Commander once-per-cycle reuse stay in force.

Amnesty is an offer with a stated condition, response deadline and explicit
captain response. Expiry or acceptance does not invent an automatic bargain;
the facilitator records any consequence. Address events are member-visible,
contain no target UID or offer ID, and are backed by an attributed private
record.

The test-only additions are necessary because the existing PDF state guard
covered only monotonically increasing cycles, while the P rule needs one
narrow same-cycle reset. Tests verify the allowed exact context and rejection
without it or with mismatched parent, sequence or next attack number. No
existing tests were weakened or skipped.

## Resources and next action

The slot-9 emulator and Vite processes were stopped after the authenticated
proof, releasing both live reservations; slot 9 remains configured for this
worktree. No other slot was changed. The temporary `node_modules` links and
local emulator configuration are working files. The authenticated P proof
runner is retained in source for reproducibility. Preserve this worktree until
the parent has integrated the remaining commits.

The parent has integrated the P repair as `6105b131`, `807ea5cc`, and
`a44a6385` in test-before-code order, and owns independent review and single
checkpoint integration. The parent’s Functions runtime at
`/tmp/pc09-owner-functions-a44a6385` was loaded and exercised for the P proof.

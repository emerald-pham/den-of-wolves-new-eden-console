# Emergency Bridge Confetti Dispenser Audit

## Scope

This audit covers only the non-AEGIS fleet ships' server-authoritative,
once-per-ship Emergency Bridge Confetti Dispensers. The reusable SNN newspaper
shredder, the AEGIS fleet-red-alert instrument, and the GM Finale are separate
controls and are intentionally out of scope.

## Objectives

1. Keep firing authoritative: a player must hold a currently configured,
   live console role aboard the target ship, including the existing short-crew
   relief rule.
2. Keep two-officer override approvals authoritative: a stored approval may be
   used only while its uid still holds the same active officer role and is
   currently live for that session.
3. Preserve the existing transaction guarantees: Turn 0 remains locked, each
   fleet ship can fire once, signals and GM events are server-written, and
   competing requests cannot create a second firing.
4. Preserve the existing presentation contract: the client cover/trigger and
   reduced-motion burst remain unchanged.

## Acceptance stories

**Given** a player whose stored active console role was removed from the live
roster, **when** that player submits a bridge-dispenser activation, **then** the
callable denies it without writing an approval, signal, session state, or event.

**Given** an officer approval recorded before that officer changes role or
leaves the live session, **when** another officer submits the same dispenser
activation, **then** the stale approval is discarded and the dispenser remains
armed until a currently live, same-role officer approval is supplied.

**Given** two currently live officers on a configured ordinary ship, **when**
the first submits an activation and the second submits it, **then** the
dispenser fires once, records the current actors, and cannot fire again.

## Exit gates

- Focused policy and callable regression tests are green.
- `git diff --check`, lint, full unit/functions tests, both production builds,
  and the Firestore rules suite are green.
- The reconciled branch is committed, merged into current `main`, pushed, and
  the coordination receipt is closed with the resulting SHA.

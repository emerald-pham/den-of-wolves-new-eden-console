# PC05 jump tranche evidence

This is a local implementation candidate for the PC05 jump prompts assigned to
the jump owner. The parent owns integration, release metadata, independent
callable review, deployment, and production gameplay evidence. No deployment or
ordinary production jump was performed by this worker.

## Source audit and bounded readings

- The *Facilitator Guide v1.1*, printed page 16 (physical PDF page 18),
  “Jump Failures” and “Emergency Jump,” was visually checked against the
  original Deluxe Components PDF on 2026-09-28. It offers the facilitator a
  stationary failure or an optional completed jump whose damage count comes
  from one d6 roll. It also says an emergency jump may be offered at pursuit 10
  or after a failure, once per ship per game, consumes all fuel, damages the
  drive, and damages half the remaining consoles rounded up. PC05-A1 records
  the authorized full-d6 adjudication reading. PC05-A2 records the conservative
  under-fueled inference: spend the available fuel up to the normal cost, never
  make fuel negative or replenish it, and bind adjudication to the exact
  failure and current fuel.
- Full-ship fuel costs and damaged-drive thresholds were checked on the
  original *DoWNE - A3 Encapsulated v1.1* sheets, PDF pages 1–6: AEGIS 2/3/6;
  Dione 2/4/8; Icebreaker 3/6/12; Shepherd 3/6/12; Quellon 2/4/8; Refinery
  124 2/4/8. The full Capybara expansion sheet, *Capybara [Deluxe] - A3
  Encapsulated 300gsm v1.1*, page 1, specifies 3/6/12. Their printed upgrade
  reduces each jump cost by one, and the upgraded damaged-drive failure
  threshold is a 1; otherwise it is 1–3.
- The small-ship Jump Drive cards were checked in the original *DoWNE - A4
  Card Duplex v1.1*, PDF pages 23 (Gorgoneion), 25 (base-small Capybara), 27
  (Warrior), 29 (Vulcan), and 31 (Voyage 33-0). Each card specifies 1 fuel for
  Short or Medium and 2 for Long, drawn from its docked host. These values are
  represented in the pure cost helper only. The small-ship records have no
  independent resource ledger or player launch seat, so this tranche does not
  expose a small-ship jump action.
- No primary printed source was found that assigns numeric Short/Medium/Long
  cutoffs to shortest-path edge counts. The current 1-edge / 2-edge / 3+-edge
  mapping remains the existing compatibility behavior under PC05-A5; it is an
  unverified assumption, not a printed rule.
- The PC01-A2 server-only Deep Nebula scan markers remain unchanged and are not
  returned to the client or consumed here. P551 owns any special Deep Nebula
  jump modifier or resolver. The current ordinary `jumpShip` path treats a
  printed reachable destination as an ordinary jump; its request has no
  special-attempt discriminator, so it does not claim to resolve a P551 attempt.

The original source PDFs remain in the owner's private reference folders; no
source pages or extracted source text were copied into this repository.

## Implemented behavior

- `jumpShip` validates the active vessel, current role/session authority,
  Coordination phase, printed route, charge, fuel, current turn, revision, and
  exact command receipt inside the authoritative Firestore transaction.
  Damaged-drive randomness and emergency/adjudication draw entropy remain
  stable if Firestore retries the transaction. Independent vessel actions write
  through the session transaction and vessel-specific state/revision.
- A normal failure leaves navigation and fuel unchanged. The server records a
  private failure receipt, and the member-safe event exposes only allowlisted
  outcome fields. The GM read returns only each active vessel's exact current
  unresolved failure after matching its revision, turn, origin, and fuel; old
  unresolved history cannot crowd a current result out of a query limit.
- An active facilitator can deliberately complete a listed failure to a
  reachable printed destination. The server rolls one d6, applies that many
  common damage draws, spends available fuel up to the route cost, consumes a
  current jump charge when present, moves the vessel, writes damage and
  destruction consequences, and resolves the exact failure atomically. A stale
  failure or changed fuel requires a fresh facilitator decision. A captured
  request id preserves the exact adjudication across an uncertain response.
- The emergency action is once per ship per game, available at pursuit 10 or
  against the exact current adjudicable failure, even with no fuel or charged
  drive. It consumes current fuel, records drive damage and the rounded-up
  half of remaining undamaged non-hull consoles, uses a stable request receipt,
  and shares the ordinary population/destruction consequences.
- The facilitator panel is active-session and GM-instance scoped, loads its
  private failure list only on request, limits destinations to printed chart
  coordinates, and retains the exact request after an uncertain reply. A list
  response that arrives after facilitator authority changes is discarded.
  The Jump Drive readout explains the damaged-drive condition and roll threshold.

## Verification and remaining evidence

Test-first commits on this branch are `631fcc3b`, `dea45193`, and
`e824aea7`. The rendered regression commit `b5fd29a6` was also observed red at
320 px before the coordinate-control sizing fix. The edge-regression test
commit `e824aea7` was observed red before its fixes:
the old list read a collection query instead of the current failure document,
the multi-draw case reported the final population rather than the crossed
threshold value, and a delayed private list response survived a facilitator
authority change. The latest focused results are:

- `npx vitest run --project functions functions/src/jumpCallable.test.ts functions/src/jumpDrive.test.ts functions/src/eventRedaction.test.ts --reporter=dot`: 95 tests passed, including the emergency one-jump-per-cycle guard.
- `npx vitest run --project unit src/lib/sessionService.test.ts src/components/JumpDriveConsole.test.tsx src/components/JumpFailureAdjudicationPanel.test.tsx src/components/JumpFailureReadout.test.tsx src/components/FleetSystemsWorkspace.test.tsx src/routes/ShipConsole.test.tsx --reporter=dot`: 357 tests passed.
- `npm run typecheck`, `npm run build`, and `npm run build --prefix functions` completed successfully. `npm run lint` reported no errors and eight warnings. `npm run test:copy-consistency` passed.
- `node scripts/test-pc05-jump-layout.mjs` rendered the production Jump Drive console and facilitator failed-jump panel at 320x844, 390x844, 844x390, and 1440x900 in normal and reduced-motion modes. The pursuit-10 emergency control enabled after the destination lock, all three failure types appeared, buttons/selects stayed within the viewport and at least 36 px high, and the short-landscape spacing assertion passed.
- After updating the request-guard fixture to expect the normalized `emergency: false` field (`4f2b2cbc`), `npm test -- --reporter=dot` passed all 5,932 tests across 437 files.

The callable uses Firestore transactions over shared session/navigation state
and writes vessel-specific fuel, charge, jump state, transition, and revision
fields in one transaction; document conflicts cause Firestore to retry against
the latest state. The callable mock suite covers transaction callback retry
for a damaged-drive roll, but does not simulate two different ships jumping
concurrently against a Firestore emulator. Treat concurrent-vessel atomicity
as code-path-reviewed here and include it in the parent's independent callable
review.

Local tests, the synthetic rendered harness, and server callable tests do not
prove ordinary production gameplay or a deployed release. The parent must
complete the independent exact-candidate authority review and release gates.

# PC05 jump tranche evidence

This lane covers the assigned jump prompts. The parent owns integration,
release metadata, exact-candidate independent review, deployment, and live
gameplay evidence. This worker did not deploy or perform an ordinary
production jump.

## Source and bounded assumptions

- The *Facilitator Guide v1.1*, printed page 16 (physical PDF page 18), was
  visually checked in the original Deluxe Components PDF. It authorizes a
  facilitator to keep a failed jump stationary or complete it with the full
  common damage draw, and permits an optional emergency jump at pursuit 10 or
  after a jump failure. The emergency is once per ship per game, consumes all
  fuel, damages the drive, and damages half the remaining consoles rounded up.
  PC05-A1 records the full-d6 adjudication. PC05-A2 records the conservative
  under-fueled reading: consume all fuel currently available to that ship,
  even if a facilitator selects a cheaper reachable route; never make fuel
  negative or create fuel.
- PC05-A6 implements the pursuit-10 option as a server-owned facilitator
  offer/decline window bound to the current cycle and shared navigation
  revision. A pending decision blocks unrelated fresh gameplay. Declining
  records the existing pursuit-limit failure; a successful emergency uses the
  normal navigation and pursuit-arrival rules. No pursuit reduction is
  invented. If no eligible group remains, the window resolves deterministically
  to the existing terminal failure.
- Full-ship fuel bands and damaged-drive thresholds were checked against the
  original *DoWNE - A3 Encapsulated v1.1* sheets, PDF pages 1–6: AEGIS 2/3/6;
  Dione 2/4/8; Icebreaker 3/6/12; Shepherd 3/6/12; Quellon 2/4/8; Refinery
  124 2/4/8. The original Capybara expansion sheet specifies 3/6/12. Its
  printed upgrade reduces each jump cost by one, and the upgraded damaged-drive
  failure threshold is 1; otherwise it is 1–3.
- The small-ship Jump Drive cards were checked in the original *DoWNE - A4
  Card Duplex v1.1*, PDF pages 23 (Gorgoneion), 25 (base-small Capybara), 27
  (Warrior), 29 (Vulcan), and 31 (Voyage 33-0). Each uses one host fuel for a
  Short or Medium jump and two for Long. This tranche does not expose small-ship
  jumping because those records have no independent fuel ledger or player
  launch seat.
- No primary printed component verified numeric Short/Medium/Long cutoffs by
  route edges. The existing 1-edge / 2-edge / 3+-edge mapping remains the
  explicitly unverified compatibility assumption in PC05-A5, not printed-rule
  proof.
- PC01-A2's server-private exact-once Deep Nebula scan markers remain intact
  and are not projected to clients or consumed here. P551 owns any special
  Nebula jump modifier/resolver; this tranche does not claim to resolve a P551
  attempt.

The original source PDFs remain in private reference folders. No source pages
or extracted source text were copied into the repository.

## Implemented behavior

- Ordinary jumps validate the active vessel, session and role authority, phase,
  printed route, charge, fuel, cycle, revision, mutiny lock, and exact command
  receipt inside the authoritative transaction. A normal failed jump leaves
  navigation and fuel unchanged. Private failure records and member-safe
  events keep facilitator-only details private.
- Facilitator adjudication is tied to the exact unresolved failure, its
  canonical record identity, current revision, cycle, origin, and fuel. One
  stable d6 draw determines common damage. A fuel-short adjudication consumes
  all currently available fuel per PC05-A2, consumes a charge if present, and
  resolves movement, damage, destruction consequences, and failure atomically.
- Emergency jumps require the exact current failure or an active pursuit-10
  offer. They consume all current fuel, apply the drive and rounded-up
  half-console damage, preserve stable retries, and update navigation,
  casualties, damage, and once-per-game state atomically. Previously damaged
  systems do not cause duplicate damage records or casualties.
- Pursuit-10 offers and declines are authenticated facilitator decisions bound
  to a cycle/navigation revision and exact retry receipt. Stale client calls
  are blocked while the window is pending. Receipt replay still works after a
  new mutiny lock, after live identity and role checks. Emergency-window state
  is validated on read and projected to the GM/player UI; pursuit-10 controls
  appear only after the facilitator offers the jump.
- Shared navigation revision advances from the stored navigation revision,
  independently of per-vessel revisions. A retried arrival is located by its
  exact request event, so another vessel's concurrent observer log cannot make
  the retry appear missing. Delayed local jump replies cannot overwrite a
  newer vessel revision.

## Verification

- The authority regression test commit `2b97c92b` was observed red with three
  failures before repair: malformed present jump state was accepted, and a
  pursuit-10 emergency could commit without the facilitator's offer. The UI
  gating test commit `3177c0fb` was observed red when it exposed the pursuit-10
  button without an offer. Render commit `04a6171a` first failed because the
  new facilitator offer button rendered at 21 px; the component was styled to
  provide the required 44 px touch target.
- After the UI changes, the focused unit run passed **225 tests across four
  files**: `JumpDriveConsole`, `PursuitEmergencyWindowPanel`, `sessionService`,
  and `shipStateProjection`. The focused callable run passed **121 tests across
  three files**: `jumpCallable`, `jumpDrive`, and `eventRedaction`.
  `npm run typecheck`, `npm run build`, and `git diff --check` passed. Targeted
  ESLint reported no errors and two pre-existing `GmConsole.tsx` hook warnings.
- `node scripts/test-pc05-jump-layout.mjs` rendered the production Jump Drive,
  pursuit decision panel, and failure panel at 320×844, 390×844, 844×390, and
  1440×900 in both normal and reduced-motion modes. All eight configurations
  passed; panel bounds and button targets fit the viewport, all failure types
  rendered, and short-landscape spacing remained correct.
- The parent reports **74/74** focused jump callable tests and **2/2** real
  Firestore emulator concurrency checks green on integrated server candidate
  `9ffa5f41`. The emulator covered same-origin retry selecting the exact
  self-arrival and two-vessel concurrent moves preserving state, serialized
  navigation revisions, and exact replay without duplicate side effects.

These checks establish local implementation and rendered behavior, not a
deployed release or ordinary production gameplay. The parent owns those gates.

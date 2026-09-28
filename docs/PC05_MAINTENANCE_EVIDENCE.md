# PC05 maintenance lane: source and acceptance evidence

This lane covers prompts 116–121, 134–137, 184, and 191. The prompt catalog and
release owner retain closure authority. A passing local test is not ordinary
authorized gameplay evidence.

## Source routing and decisions

- The private reference index at `docs/reference/den-of-wolves-new-eden/references/`
  routes the Player's Guide, Facilitator Guide, vessel sheets, and VIP card
  components. Source text is not copied into this repository.
- P117: the Player's Guide physical PDF page 9 (printed page 7) worked example
  separately identifies food and water spent, and then the combined bonus
  added to the unrest roll. The rule summary in `REFERENCE_ONLY_CORE_RULES.md`,
  maintenance worked example and step 3, agrees. Therefore the existing
  interpretation in `functions/src/maintenance.ts` is retained: each selected
  ration level spends its vessel-table amount, while each level contributes
  0/3/6/9 to the 2d6 unrest total. This resolves the stale owner hold by
  primary printed evidence under the owner's decide/log/continue instruction.
- P118/P184: the owner-supplied `Deluxe Components/DoWNE - A4 Paper Duplex
  v1.1.pdf` (SHA-256
  `b1a5cd99516acb2d8784fdc0669937cfe4abb1f63a71750cc71abe6433561359`)
  supplies the replacement ration cards on physical PDF pages 41–44. Fronts
  are pages 41 and 43; their duplex backs, pages 42 and 44, reverse left/right
  card positions. The cards yield the exact food/water schedules now encoded
  in `functions/src/shipPopulation.ts` and mirrored in
  `src/data/shipPopulation.ts`. The original Dione table above 90,000 comes
  from its vessel sheet. The same printed bands match the starting tables and
  starred steps for Icebreaker, Shepherd, Quellon, and Refinery 124; AEGIS
  starts in the final band. Capybara uses its own expansion cards. At zero,
  the final 1–5,000 table remains in force while the separate zero-population
  unrest consequence applies. One printed back reads `50,000–70,000`, which
  overlaps the adjacent `35,001–50,000` card at exactly 50,000. Because
  50,000 is a starred change step and the latter card has lower costs, the
  selection treats the upper band as 50,001–70,000. This is a bounded source
  interpretation, not a fabricated value. The private source index should
  add this original component and checksum at reconciliation.
- P136/P137: `REFERENCE_ONLY_CORE_RULES.md`, Unrest and mutiny, says unrest 8+
  makes the ship unusable until a new captain is installed. The facilitator
  chooses a 1–3 reduction based on confidence (2 is the printed default); the
  prior captain may exchange roles or receive another role. The reduction
  must therefore be an explicit authorized resolution coupled to captain
  replacement, never an automatic threshold side effect.
- PC05-A3, source-backed digital casting inference: the confirmed eight-player
  roster can have a staffed ship and no configured captain station. The guide
  requires a new captain, but does not prescribe how a digital sparse roster
  represents that command. The GM may appoint a different active, canonical
  same-ship officer as acting captain. `shipCommandCaptains` holds that UID in
  server-private session state and `mutinyRecoveries` audits the appointment;
  the player keeps their role, claimed seat, loyalty audience, and console
  entitlements. The locked role count, configuration, and craft manifests do
  not change. A later mutiny requires a different appointed UID. When an
  occupied configured captain station exists, the actual two-seat swap is
  still required. If no eligible same-ship officer exists, recovery remains
  unavailable until the facilitator has a real authorized candidate; no
  player or captain role is fabricated.
- P136 small-craft gap: base Gorgoneion, Capybara-small, Warrior, and Vulcan
  keep unrest in `smallShipStates.*.unrest`; Voyage 33-0 keeps it in
  `voyage33Maintenance.unrest`. `requireSmallShipHostAuthority` and
  `requireVoyage33MaintenanceAuthority` authorize a current player/GM through
  the docked full-ship `hostShipId` and its `requireShipCounterAuthority`, not
  through a small-craft captain UID; their maintenance and docking callables
  do not enter or deny mutiny at 8. The guide's general mutiny sentence
  includes ships, but the four base small-craft captain roles are optional
  `replacementRoleId` assignments, never core seats or new loyalty holders;
  Voyage 33-0 has no configured player captain role. The Captain replacement
  catalog is in `functions/src/replacementRoles.ts` and eligibility is
  facilitator-controlled via `setReplacementEligibility`/
  `assignReplacementRole` in `functions/src/index.ts`.
  A follow-up must source-route the actual command appointment for each craft,
  add authoritative lock and GM 1–3 recovery against its state, and verify
  host resource exceptions without inventing a player. These paths remain
  unclosed under P136/P137, even though full-ship recovery is implemented.
- P191: the Dione VIP card component grants one die reroll during maintenance
  unrest step 3. Existing private hand/deck ownership is authoritative;
  consumption belongs in the same transaction as the new result and cannot
  reveal a hand to the fleet.

## Acceptance map and release proof gaps

| Prompt | Existing implementation / remaining lane work |
| --- | --- |
| 116, 117 | Independent food/water selection, exact starting-table debit, additive level bonuses, and server dice exist in `maintenance.ts`; P117 source decision above replaces old hold. Need ordinary UI proof. |
| 118, 184 | Original deluxe duplex component supplies every numeric band; server debit and current player table now follow those cards. Ordinary rendered and authorized live proof remain. |
| 119, 120 | Server 2d6 unrest and 1d6 riot/damage are in `advanceMaintenance`; focused rule, callable replay, and live UI proof remain acceptance gates. |
| 121 | Base small ships and Voyage 33-0 use population loss and skip charge; Voyage runtime admission/docking still depends on its own unfinished production path. |
| 134 | One authenticated live GM now clears a blocking alert; stale/duplicate acknowledgements are idempotent. Verify concurrent GM replay and ordinary live path. |
| 135 | Full ships already only add +2 on crossing to zero; small ship and Voyage engines now do likewise. Verify no second increment on replay or later riot. |
| 136, 137 | Full ships: mutiny lock, direct-action denial, occupied-captain swap, sparse acting-captain appointment, and GM 1–3 recovery are implemented with focused tests. Small-craft/Voyage33 mutiny gap above and ordinary live proof remain; do not close all-ship acceptance yet. |
| 191 | VIP reroll now consumes a private card in the same transaction as the dice result; focused replay/privacy tests and player control exist. Ordinary live proof remains. |

Maintenance lane commits are candidates only. Final prompt closure requires
integration, independent authority review, deployment, and ordinary authorized
play through the complete PC05 path.

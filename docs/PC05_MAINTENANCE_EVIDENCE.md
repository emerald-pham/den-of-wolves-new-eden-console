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
- P118/P184: the printed starred population thresholds require a replacement
  food/water table for the individual ship. `REFERENCE_ONLY_SHIPS.md` identifies
  the thresholds and starting tables. No numeric replacement rows were found
  in the six routed archive PDFs, the owner-supplied A4 Single Sided v1.1 PDF
  (SHA-256 `4e3ce6b500716fe139440d669aeae2e7fb4ab85071c98801f28144305f60f8d3`),
  or the Deluxe A4 Encapsulated v1.1 PDF
  (SHA-256 `c06a4b11e8936c526ffd865c8ef6135189cdb2cd30b3d049f0305582652ed09e`).
  The A4 Single Sided source has 43 pages; all five Deluxe A4 pages were
  visually checked. The known Capybara replacement rows are already explicit
  in `functions/src/shipPopulation.ts`. Other ships' numerical replacement
  costs must come from an authorized missing component or be recorded by a
  facilitator against an identified table; they must not be inferred by
  scaling the starting values. Resume by routing the original replacement
  cards into the private source index, transcribing costs into a tested server
  table, then proving both the server charge and player-facing current table.
- P136/P137: `REFERENCE_ONLY_CORE_RULES.md`, Unrest and mutiny, says unrest 8+
  makes the ship unusable until a new captain is installed. The facilitator
  chooses a 1–3 reduction based on confidence (2 is the printed default); the
  prior captain may exchange roles or receive another role. The reduction
  must therefore be an explicit authorized resolution coupled to captain
  replacement, never an automatic threshold side effect.
- P191: the Dione VIP card component grants one die reroll during maintenance
  unrest step 3. Existing private hand/deck ownership is authoritative;
  consumption belongs in the same transaction as the new result and cannot
  reveal a hand to the fleet.

## Acceptance map and release proof gaps

| Prompt | Existing implementation / remaining lane work |
| --- | --- |
| 116, 117 | Independent food/water selection, exact starting-table debit, additive level bonuses, and server dice exist in `maintenance.ts`; P117 source decision above replaces old hold. Need ordinary UI proof. |
| 118, 184 | Capybara population bands exist; numeric replacement rows for other full ships remain missing from supplied artifacts. Do not close either prompt on starting-table behavior. |
| 119, 120 | Server 2d6 unrest and 1d6 riot/damage are in `advanceMaintenance`; focused rule, callable replay, and live UI proof remain acceptance gates. |
| 121 | Base small ships and Voyage 33-0 use population loss and skip charge; Voyage runtime admission/docking still depends on its own unfinished production path. |
| 134 | One authenticated live GM now clears a blocking alert; stale/duplicate acknowledgements are idempotent. Verify concurrent GM replay and ordinary live path. |
| 135 | Full ships already only add +2 on crossing to zero; small ship and Voyage engines now do likewise. Verify no second increment on replay or later riot. |
| 136, 137 | Mutiny lock and explicit new-captain recovery require implementation and authoritative role/ship action integration. |
| 191 | VIP deck draw/transfer and pure consume transition exist; reroll gameplay action and UI remain to implement. |

Maintenance lane commits are candidates only. Final prompt closure requires
integration, independent authority review, deployment, and ordinary authorized
play through the complete PC05 path.

# PC10.4 execution record — Fair automatic actions and receipts

Release candidate 0.5.78, integration branch `integration/pc10-4-20261114`.
Activation: [PRODUCT_MILESTONES.md](PRODUCT_MILESTONES.md#pc104-execution-activated--2026-11-14).
GitHub issues remain the authority for each brief's definition and state; this
record holds the evidence that does not fit an issue comment. Evidence below is
local (native callable tests with mocked Firestore, rules emulator, unit/UI
tests, one rendered Chrome check) unless stated otherwise. CI, deployment and
live-site gameplay are reported separately in the release record.

## Acceptance matrix

| Brief / child | Prompt | Status | Evidence class and pointer |
|---|---|---|---|
| U1.1 #272 dice | P630 | met | Defect fixed: `rollDice` rerolled on exact retry; now receipt-bound (RED f8c73d703 → GREEN e216f8622). Forged-dice table `functions/src/serverOwnedRandomness.test.ts`; UI consumer `HummingbirdHarvest` retry check. |
| U1.2 #273 accuracy | P630 | met (proof) | `serverOwnedRandomness.test.ts` accuracy rows; existing exact-replay suites. |
| U1.3 #274 combat | P630 | met (proof) | `serverOwnedRandomness.test.ts` combat rows; server-only boarding/fleet-damage paths covered by rules denial of `wolfAttackState`/`events` writes. |
| U2.1 #275 cards | P630 | met (proof) | `vipCardsCallable.test.ts`; UI consumer `ShipConsole` Dione draw control. |
| U2.2 #276 deck order | P630 | met (proof) | `awayMissionCallable.test.ts` deal-from-server-order test. |
| U2.3 #277 composition | P630 | met (proof) | `startCallable.test.ts` forged Wolf/loyalty composition test. |
| U2.4 #278 clues | P630 | met (proof) | `wolfActionCallable.test.ts`, `wolfConsoleSabotageCallable.test.ts`; inventory below. |
| U2 second acceptance | P630 | met | Reconciled inventory below (25 rows, every row cites a test). |
| B1.1 #279 uncovered limits | P631 | partly met | `readFleetGroupNavigation` per-member 180/min budget; client spaces update-triggered refreshes ≥3 s and keeps the last plot when limited. About 90 deliberate session-sized read views and `getCurrentMemberSession` have no budget: per-action policy is excluded from the brief and needs an owner decision. |
| B1.2 #280 replay under limits | P631 | met (proof) | Exhausted setup budget still replays the completed request with no charge or write. |
| B1.3 #281 shared-table fairness | P631 | met | Limiter keys are (callable, session, UID); no IP keying; same-IP neighbour unaffected. |
| B1.4 #282 platform saturation | P631 | blocked | Needs an isolated non-production Firebase project; load-testing production is forbidden and local runs earn no capacity credit. |
| B2.1 #283 auth denials | P634 | met (local) | `securityDenialTelemetry.ts` records hashed actor, no secrets; `sessionLifecycleCallable.test.ts` canary tests. |
| B2.2 #284 App Check boundary | P634 | qualified locally | Real SDK HTTP transport and logger: invalid App Check rejected by the SDK and logged once, no canaries. Production log sink, retention and Logs Viewer audience not yet verified. Earlier evidence retained at 2d68e616. |
| B2.3 #285 schema denials | P634 | met (local) | Field names only (first 256 keys), no values. |
| B2.4 #286 rate-limit denials | P634 | met (local) | Expensive-callable limiter, join-code limiter and casting budgets. |
| J1.1 #287 fighter construction | P635 | met | `fighterBuildCallable.test.ts`. |
| J1.2 #288 shuttle cargo | P635 | met | `shuttleCargoTransferCallable.test.ts`. |
| J1.3 #289 shuttle service | P635 | provisional | Implemented as the service-shuttle recharge (same callable as J1.4). P635's own note lists "cargo, service, recharge, and repair" separately, so "service" may mean another action (possibly P462's host security-team support). Needs an owner ruling. |
| J1.4 #290 shuttle recharge | P635 | met | `serviceShuttleRechargeCallable.test.ts`. |
| J1.5 #291 shuttle repair | P635 | met | Blacksmith, Philia, Macaw, Chacau, Ally repair suites. Drone repairs, Boa recycling and base Capybara cargo excluded. |
| J2.1 #292 permitted receipts | P635 | met for automatic families | `actionAuditDetails` (GM-only rules, emulator read pair 178/178), GM panel, rendered check at four sizes in installed Chrome (two CSS defects fixed). Eight facilitator-ruling families write no detail record yet; legacy receipts get no backfilled detail. |
| J2.2 #293 GM contention | P635 | met | Two-GM contention tests (ship damage, fighter construction); `addShipDamage` now requires `expectedRevision` for a new command. Thirteen other vessel actions still accept an omitted revision (follow-up). |
| PT5 #138 runtime diagnostics | P651/P660 support | met (macOS) | `scripts/proof-test-invocation.mjs` owned-runtime inspection; 17 fixtures. Linux confirmed only by CI. |

## P630 server-owned randomness coverage

U1 owns dice, accuracy and combat uncertainty; U2 owns cards, decks,
compositions and clues. Damage-card draws and the console-sabotage card are
recorded under U2 (they are deck draws); the dice or combat step that triggers
each draw stays under U1. Tests added as proof of existing behaviour passed on
first run; each was shown to discriminate by a temporary, uncommitted mutation
that honoured the forged field.

### Reconciled inventory (every row cites a test)

All server outcome sites draw from `node:crypto` `randomInt` inside callables or transactions.
Client-side `Math.random` is used only for cosmetic effects and request IDs (per U2's sweep).

"Strict" means unknown request keys are refused with `invalid-argument` before any state read or
RNG call. "Known-field" means the parser copies only known fields, so a forged key is ignored. In
both cases the evidence is the committed server result plus a replay.

| # | Outcome family | Server site | Lane | Forged-result evidence | Replay/retry evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Dione VIP card draw | `drawVipCard` | U2.1 | `vipCardsCallable.test.ts` :: rejects a client-selected card and keeps the committed server card through a forged retry (U2, 695f55576) | same, plus "draws privately after the charge and authority checks, and replays without rerolling" |
| 2 | VIP card spend/transfer (explicit owner choice, not random) | `rerollVipUnrest`, `transferVipCard` | U2 (choice) | `vipCardsCallable.test.ts` :: "denies a foreign card…" | "spends the owner card and changes only one die, with exact replay and a private hand" |
| 3 | VIP unrest reroll die | `rerollVipUnrest` | U1 (dice) | `serverOwnedRandomness.test.ts` :: dice: rerollVipUnrest, refuses each forged dice key before reads or RNG (U1, 7a061af54) | `vipCardsCallable.test.ts` :: "spends the owner card and changes only one die, with exact replay and a private hand" |
| 4 | Mission deck shuffle at start | `startGame` -> `shuffledMissionDeck` | U2.2 | known-field start parser; `startCallable.test.ts` :: "fails closed on malformed server mission-deck state" | `startCallable.test.ts` :: "retains one mission-deck order across a transaction callback retry", "reuses a valid persisted mission deck…" |
| 5 | Mission initial deal (deck order, remaining-deck privacy) | `dealPrivateInitialCards` | U2.2 | `awayMissionCallable.test.ts` :: deals from the server-owned deck order, ignoring a forged order, and replays without leaking the remaining deck (U2, c816046a6) | same, plus "replays the same request without writing a second hand" |
| 6 | Mission extra cards / facilitator top-deck + pile shuffle | `awayMissionLifecycleCallable` | U2.2 | strict `COMMAND_FIELDS`; `awayMissionLifecycleCallable.test.ts` :: "…rejects forged authority or malformed commands" | `missionLifecycle.test.ts` :: "replays facilitator top-deck addition without drawing or shuffling again", "allocates an extra card blindly…" |
| 7 | Gorgoneion top-five deck manipulation | `applyGorgoneionMissionSupport` | U2.2 | `gorgoneionMissionSupportCallable.test.ts` :: "rejects an inspected top five that changed after projection" | the same suite's replay and collision tests |
| 8 | Mission resolution d6 | `awayMissionLifecycleCallable` `rollD6` | U1 (dice) | `awayMissionLifecycleCallable.test.ts` :: "derives overrun from the current server phase and rejects forged authority or malformed commands" (forged `secretD6Rolls`, cited by U1) | `awayMissionLifecycleCallable.test.ts` :: "binds exact replays to both authenticated actor and unchanged command…" |
| 9 | Automatic Wolf role + loyalty/suspicion composition | `startGame` | U2.3 | `startCallable.test.ts` :: ignores a client-selected Wolf/loyalty composition and replays the server-drawn composition (U2, 71952ea9d) | same, plus "returns the original result as replayed without repeating start writes" |
| 10 | Wolf attack composition (Turn 1 fixed; later GM-prepared within capacity; no draw) | `declareWolfAttack`, `wolfAttackCompositionForRule` | U2.3 (deterministic) | `wolfAttackDeclarationCallable.test.ts` :: "rejects client outcomes, a stale GM instance, and a stale targeting revision without writes"; `wolfAttackPreparationCallable.test.ts` :: "rejects stale CAS, inactive targets, and invalid composition" | `wolfAttackDeclarationCallable.test.ts` :: "requires reasoned revision-bound replay for emergency pause and resume during an attack" |
| 11a | Ship damage card draw (GM draw) | `addShipDamage` | **U2** | NEW `shipDamageCallable.test.ts` :: ignores a forged damage card and replays the server-drawn card through a forged retry (a11693458) | same, plus "does not reroll the card or event identity when Firestore retries the transaction", "replays an exact committed audit and original damage reply after a phase change" |
| 11b | Emergency jump damage cards (drive + half the remaining consoles) | `jumpShip` emergency | **U2** (card); emergency trigger is U1 jump | NEW `jumpCallable.test.ts` :: ignores forged emergency-jump damage cards and replays the server-drawn cards (b24939bde) | same, plus "records jump-damage mutiny atomically and still replays the exact receipt after the ship becomes unusable" |
| 11c | Failed-jump adjudication damage cards | `adjudicateFailedJump` | **U2** (card); damage-count d6 is U1 | `jumpCallable.test.ts` :: "ignores a client-supplied failed-jump damage roll and replays the server roll" (U1, 7a061af54). Forged `damageRoll`/`damageCount` are ignored, so the card count is the server's, and the cards come from server entropy. | same test: a forged replay returns `toEqual` with no RNG and no writes |
| 11d | Maintenance damage card (`begin`/`unrest`/`riot` entropy) | `runMaintenance` | **U2** (card); maintenance dice are U1 (row 19) | strict allowlist: `maintenanceCallable.test.ts` :: "rejects invalid steps and client-supplied dice"; `serverOwnedRandomness.test.ts` :: dice: runMaintenance. Any unknown key, card-shaped ones included, is refused before RNG. | `maintenanceCallable.test.ts` :: "commits one environmental draw across transaction retry, duplicate request, and replay" |
| 12 | Console sabotage damage card (random mode) + clue | `resolveWolfConsoleSabotage` | **U2** | NEW `wolfConsoleSabotageCallable.test.ts` :: refuses a forged damage card or clue outcome and replays the server-drawn sabotage result (88b3b97d3); domain `wolfConsoleSabotage.test.ts` rejects a chosen id in random mode | same, plus "replays an exact resolution without a second draw or suspicion change" |
| 13 | Wolf suspicion clue — supply sabotage | `submitWolfSupplySabotage` | U2.4 | `wolfActionCallable.test.ts` :: ignores a forged clue outcome and replays the server-rolled clue result (U2, 9d66331ea) | same, plus "reuses one clue roll across Firestore transaction retries", "replays the exact request without applying cargo or suspicion twice" |
| 14 | Wolf suspicion clue — homing beacon | `submitWolfHomingBeacon` | U2.4 | NEW `wolfActionCallable.test.ts` :: refuses a forged homing-beacon clue outcome and replays the server-rolled clue result (d3528aa9b); existing "rejects client-selected beacon targets before any transaction" | same, plus "replays a committed homing beacon without a second pressure record, roll, or suspicion change" |
| 15 | Wolf suspicion clue — intelligence | `submitWolfIntelligence` | U2.4 | NEW `wolfActionCallable.test.ts` :: ignores a forged Wolf intelligence clue outcome and replays the server-rolled clue result (fe963dfea) | same, plus "reuses one intelligence clue roll across Firestore transaction retries", "replays the exact Wolf intelligence request without another message, suspicion change, or roll" |
| 16 | Intelligence-agent investigation accuracy | `investigateAsIntelligenceAgent` | U1 (accuracy) | `serverOwnedRandomness.test.ts` :: accuracy: investigateAsIntelligenceAgent (U1); `intelligenceInvestigationCallable.test.ts` :: "rejects a client-supplied answer or loyalty claim before reading state" | `intelligenceInvestigationCallable.test.ts` :: "replays the exact request without another roll or write", "reuses one accuracy roll across transaction retries" |
| 17 | Wolf Agent Detector accuracy | `runWolfAgentDetectorTest` | U1 (accuracy) | `serverOwnedRandomness.test.ts` :: accuracy: runWolfAgentDetectorTest (U1); `wolfAgentDetectorCallable.test.ts` :: "rejects client-supplied truth" | `wolfAgentDetectorCallable.test.ts` :: "returns an exact replay without consuming another die" |
| 18 | Generic dice roller | `rollDice` | U1 (dice) | `sessionLifecycleCallable.test.ts` :: "commits one server-selected dice result, ignores forged results and replays it exactly" (U1 RED f8c73d703 -> GREEN e216f8622) | same test (exact replay, collision, foreign actor, missing id) |
| 19 | Maintenance unrest/riot dice (full, small-ship, Voyage 33-0, hosted reroll) | `runMaintenance`, `runSmallShipMaintenance`, `runVoyage33Maintenance`, `rerollHostedShipMaintenance` | U1 (dice); damage card is row 11d | `serverOwnedRandomness.test.ts` :: dice rows for all four (U1); `maintenanceCallable.test.ts` :: "rejects invalid steps and client-supplied dice" | `maintenanceCallable.test.ts` :: "commits one environmental draw across transaction retry, duplicate request, and replay"; `smallShipCallable.test.ts` :: "runs maintenance against only the docked host ledger and persists a replay receipt"; `voyage33MaintenanceCallable.test.ts` :: "replays an exact request without spending the host a second time"; `pc09VipHostHandlersCallable.test.ts` :: "composes both VIP Host handlers…" (`rerollHostedShipMaintenance` replays with no RNG) |
| 20 | Jump integrity roll / failed-jump adjudication d6 | `jumpShip`, `adjudicateFailedJump` | U1 (dice) | `jumpCallable.test.ts` :: "ignores a client-supplied Jump Drive integrity result and replays the server failure"; "ignores a client-supplied failed-jump damage roll and replays the server roll" (U1, 7a061af54) | same two tests (forged replay `toEqual`, no RNG) |
| 21 | Highwall mining, Hummingbird harvest dice | `runHighwallMining`, `rollHummingbirdHarvest` | U1 (dice) | `serverOwnedRandomness.test.ts` :: dice: runHighwallMining, rollHummingbirdHarvest (U1; mutation-checked by U1) | `highwallMiningCallable.test.ts` :: "commits one material roll and exact retry without another random draw or write"; `hummingbirdHarvestCallable.test.ts` :: "rolls private server dice once and replays the exact roll without new randomness"; UI `HummingbirdHarvest.test.tsx` retry check (U1, a849dfd7d) |
| 22 | Wolf combat: targeting, range dice, commander rerolls, boarding special choice | `declareWolfAttack`, `commitWolfRangeActionChoice`, `commitWolfEscortRangeActionChoice`, `applyWolfCommanderTargetRerolls`, `commitWolfBoardingSpecialChoice` | U1 (combat/accuracy) | `serverOwnedRandomness.test.ts` :: combat/accuracy rows for each (U1); `wolfAttackRangeCallable.test.ts` :: "commits fixed escort actions once, resolves no early dice, and rejects stale, forged and changed-authority requests" | `wolfCommanderTargetingCallable.test.ts` :: "replays exactly without another random sample and rejects stale or consumed selections"; `wolfBoardingCallable.test.ts` :: "R1 preserves authorized %s exact replay after its stage closes"; `wolfAttackRangeCallable.test.ts` :: "replays a committed Captain choice after automatic %s progression without new writes or dice" |
| 23 | PDF Fighter Ace combat dice | `commitPdfFighterAceCombat` | U1 (combat) | `serverOwnedRandomness.test.ts` :: combat: commitPdfFighterAceCombat (U1) | `wolfAttackRangeCallable.test.ts` :: "acknowledges the same committed fatal Ace action without rolling or applying death and losses again" |
| 24 | Attack aftermath (Warrior Salvage Drones sample) | `resolveWolfAttackAftermath` | U1 (combat) | `serverOwnedRandomness.test.ts` :: combat: resolveWolfAttackAftermath (U1) | `wolfAttackAftermathCallable.test.ts` :: "rechecks current role and attack before replaying a resolved-action receipt", "replays semantic Doctor fingerprints…" |
| 25 | Join code, event/request UUIDs | `makeJoinCode`, `randomUUID` | out of scope (identifiers, not game outcomes) | n/a | n/a |

Server-only paths with no client input (per U1): `syncWolfAttackAudienceProjection` reconciles
boarding defence rolls, range locks and fleet-damage finalization. Clients cannot write
`wolfAttackState` or `events`. The rules test in `tests/rules/firestore.rules.test.ts` asserts that
forged `wolfAttackState` writes fail, and `events` has `allow write: if false`. Rules were not re-run
in this lane.

### Residual notes (not gaps)

- Row 11c (adjudication damage cards) has no test that adds a card-shaped forged key. The existing
  U1 test proves the forged count fields are ignored and that a forged replay makes no RNG call. The
  card draws use the same `drawShipDamage` seam and server-entropy array that 11a and 11b pin. I
  judged one more test there to be duplication.
- Row 11d relies on the strict maintenance allowlist. The forged keys exercised there are
  dice-shaped, but the allowlist refuses any unknown key.

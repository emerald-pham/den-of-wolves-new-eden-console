# PC09 aftermath handoff

Evidence availability after the Mac reconnect: earlier external `/tmp` files
referenced here were lost. These paths identify historical reported runs;
committed sources and regressions survived. Fresh resumed artifacts and limits
are recorded in [the execution record](PC09_EXECUTION_RECORD.md#reconnection-and-evidence-availability)
and [the risk review](PC09_RISK_REVIEW.md). No missing file grants new proof.

Parent owns checkpoint/release and reconciles this branch with audit, threats, specialists, and client plotting. This branch does not change release metadata or deploy.

## Source interpretation

**PC09-A4 — P476 combat-only damage-deck exhaustion.** Player's Guide v1.1, printed p. 6 (PDF p. 8), Ships / Damage, says a ship is destroyed when a required draw has no remaining card. Capybara v1.1, A4 duplex card pack, printed page 1, grants one Scrap when a single ship takes at least three damage in a Wolf attack and lets either shuttle pick it up; that expansion page gives no exhausted-deck exception. The private routed reference derivative explicitly marks the Capybara exhaustion rule as unspecified.

The plausible readings were to preserve the old facilitator-ruling blocker for Capybara combat damage, invent a Capybara-specific exception, or apply the base required-draw rule. This work applies the printed catastrophe to every required fleet damage draw in a committed combat calculation, including Capybara. It preserves the previous facilitator-ruling default for noncombat callers. This is a bounded product interpretation for assigned P476, not additional Capybara source text. The final calculation receipt carries destruction, draws, survivors, and audience consequences from one transaction. PC09-A4 was recorded before claiming the dependent behavior in `docs/PRODUCT_MILESTONE_ASSUMPTIONS.md`.

## Implemented behavior

- Reuses the shared damage deck, armour recycling, population-track casualties, and server randomness for battle damage. Combat deck exhaustion applies the printed destruction outcome. Native math tests cover Short Battlestation immunity, Strikecarrier's surviving-Wing bonus, boarding survivor damage, exhaustion, and exact casualties.
- Finalization stores the complete private calculation receipt and surviving Wolf ship roster in the immutable `wolf-finalized-{turn}` audit. It also validates and retains the P Station sequence marker when provided.
- The member view publishes committed, allowlisted effects and aggregate remaining/returning Wolf counts only. Concrete Wolf identities, targets, card draws, rolls, and actor UIDs remain private.
- The authenticated aftermath callable supports Doctor selection (first ship free; each additional selected ship pays 3 food and 3 water from that ship), charged Warrior server-die salvage, and one-time Macaw/Boa Scrap collection from qualifying attack damage. Calls bind to current role, attack, and revisions and have stable exact retries.
- The GM aftermath view is a pure, prop-driven presenter with historical damage separated from current `shipDamage` when projecting outstanding repairs. It is mounted in the normal GM route. Member aftermath controls are mounted into the normal replacement, shuttle, and extra-ship workspaces.
- The connected HTTP proof utility is `scripts/pc09-aftermath-proof.mjs`, exporting `runPc09AftermathProof(f, { directory, finalState, actorAllocations, advanceNextTeam })`. Its default mandatory branches are Doctor, Warrior salvage, Macaw Scrap, Boa Scrap, ordinary Macaw repair, authenticated Press facts, immediate member audience, and next-Team fighter construction. Missing random outcomes produce an explicit `PC09_ORDINARY_BRANCH_MISSING` error and a blocker artifact before the helper mutates state. A bounded ordinary scenario can pass a narrower `actorAllocations.requiredBranches` set. The build branch requires the root-provided top-level `advanceNextTeam({ f, attackTurn })` callback, then verifies the ordinary authenticated build/replay path and reserves a second legal capacity slot for the real UI check. It preflights capacity before advancing the Team, so a missing vacancy does not trigger a partial transition. Authenticated receipt comparison normalizes only serializer-equivalent omitted/empty optional result lists; it preserves empty survivor arrays and every populated value.
- `scripts/test-pc09-aftermath-branches-http.mjs` runs a separate normal-auth 20-player proof fixture. `PC09_AFTER_BRANCHES` selects bounded branches and `PC09_AFTER_BRANCH_EVIDENCE_PATH` selects the redacted output path; the default requires every branch. It provisions actors through normal joins/replacement roles and uses ordinary target assignments, shuttle routes, costs, server damage, and maintenance. It never seeds combat damage, dice, or a finalized receipt and never uses GM repair-all.

## Commits

The main test-before-code sequence is already on `feat/pc09-aftermath-20261004`:

- `8b4c2373` / `372a352c` — combat exhaustion failing regression, then printed catastrophe implementation; `5974dc15` records PC09-A4.
- `dcaae2c5` / `3e83413d` — attack damage-source regression, then core aftermath calculation.
- `f2cc77e8` / `788cb853` / `769442fc` / `3c33c95a` — Doctor, Warrior, Scrap, authenticated callable regression commits.
- `4929d29d` / `fbb1d6e2` / `36afb71b` / `a30dbfbe` / `378309e8` / `b6b1d484` / `42d30a07` — GM receipt, authenticated service, normal workspace mounts, Boa route, and current-repair projection tests.
- `9f840916` / `26951fb0` / `c7b2b375` / `c712dcfd` / `bd0e7ffd` — final survivor audit, safe aggregate threats, privacy assertion correction, and valid receipt/role test fixtures.
- `cc1c6b25` — aftermath callable, service, role controls, private GM presenter, finalization audit fields, and audience aggregate implementation.
- `8ac874c5` — authenticated aftermath proof helper.
- `26cf1ec9` — ordinary next-Team callback contract.
- `ade0e5db` / `5c313723` — receipt serialization-equivalence regression and implementation.
- `25d22dfd` / `03e315bb` / `fb33a0d3` — resolved member survivor-count Rules regressions, malformed-count coverage, and the narrow Rules fix.
- `906e1f29` / `6b9ad332` — regression and fix for treating an omitted optional returning-instance list as zero while retaining the required survivor roster.
- `14c6eadf` / `7dd7c4bb` — regression and implementation for preflighting the ordinary two-slot build requirement before advancing the Team.
- The bounded branch driver and this handoff are committed separately after the latest evidence update; see the commit reported with this handoff.

## Validation and current evidence

Passed after the feature implementation:

- `npm test -- --configLoader runner --no-cache functions/src/wolfAttackAudience.test.ts functions/src/wolfAttackAftermath.test.ts functions/src/wolfAttackAftermathCallable.test.ts functions/src/wolfAttackDeclarationCallable.test.ts functions/src/wolfAttackRangeCallable.test.ts src/components/WolfAttackStatusPanel.test.tsx src/components/WolfAttackAftermathActionPanel.test.tsx src/components/WolfAttackGmAftermathView.test.tsx src/lib/wolfAttackAftermathService.test.ts src/components/ExtraShipCaptainWorkspace.test.tsx src/components/ShuttleConsoleTemplate.test.tsx src/routes/ReplacementRoleWorkspace.test.tsx` — 12 files, 253 tests.
- `npm test -- --configLoader runner --no-cache functions/src/wolfCombatMath.test.ts functions/src/shipDamage.test.ts functions/src/shipPopulation.test.ts functions/src/wolfAttackAftermath.test.ts` — 4 files, 88 tests.
- `npm run typecheck`.
- `npm --prefix functions run build`.
- `node --check scripts/pc09-aftermath-proof.mjs`.
- `node --check scripts/test-pc09-aftermath-branches-http.mjs`.
- `node --test scripts/pc09-aftermath-proof.test.mjs` — 4 tests for receipt normalization, empty survivor authority, omitted return-list counts, and legal fighter-capacity slots.
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8120 ./node_modules/.bin/vitest run --project rules tests/rules/firestore.rules.test.ts` — 140 Rules tests pass against the reserved slot-4 emulator, including paired resolved count validation, stranger denial, and private-extra denial.
- The initial Rules regression was red against the original allowlist (139/140 passed; the new member projection was denied). After the fix, the full Rules suite passes. `npm run test:rules` could not fetch the pinned Firebase CLI in this offline environment, so the already-reserved emulator was used directly.

The default end-to-end helper has **not completed as a single run**. Distinct ordinary-auth row-4 runs establish the branch results below; neither report represents the full default set as one complete artifact.

- **`row4-aftermath-combat`** resolved a normal 20-player battle through all three ranges and boarding. It passed the authenticated GM receipt comparison, Doctor two-ship mitigation (first target free; the additional target spent 3 food + 3 water), Warrior one server die per actual positive damage, Macaw and Boa Scrap claims from two distinct live ≥3-damage hosts, and an ordinary Macaw console repair that cleared current damage while retaining the historical damage draw. The run then failed at the member audience HTTP read (403) under the original Rules allowlist. The narrow projection Rules fix is now integrated and has 140/140 Rules test passes; this historical failed run is not being relabeled as a full pass.
- **`row4-aftermath-press-audience-build`** used `PC09_AFTER_BRANCHES=press-publication,member-audience,fighter-build`. It passed authenticated Press casualty-fact reads, safe member audience HTTP read with no Wolf identities or hidden dice, authenticated GM private receipt read, member denial on the private Wolf root, and the ordinary Team advance plus charged Construction Bay maintenance. It then stopped at the required capacity check: the fixture did not have the two legal free fighter slots required for the helper build plus the separate real Wing Commander UI build. The helper does not waive that second-slot requirement or claim a build. Root will satisfy the actual build/browser checkpoint in its ordinary combat-loss scenario.

The output files `/tmp/pc09-aftermath-row4.json` and `/tmp/pc09-aftermath-row4-followup.json` are redacted **failed-run diagnostics**, not completed acceptance artifacts. The first records the pre-fix member Rules denial; the second records the unmet capacity assertion. Runtime assertions described above passed before each respective stop, but the driver does not persist partial pass rows on a later assertion failure.

## Exact caller contract

Call after one complete ordinary attack and the driver's existing audience/replay/privacy checks:

```js
const proof = await runPc09AftermathProof(f, {
  directory: evidenceDirectory,
  finalState,
  actorAllocations: { doctor, warrior, macaw, boa, wingCommander, press, repairHostShipId },
  advanceNextTeam: async ({ f, attackTurn }) => { /* root's normal Team advance and AEGIS maintenance */ },
});
```

Actors are the real fixture actor objects with `localId` and `idToken`. Doctor proof needs two distinct live targets with actual printed damage casualties; the second needs 3 food and 3 water. Warrior proof needs a current docked and charged Warrior. Macaw and Boa proof needs distinct, live targets that each took at least 3 attack damage and are uniquely docked to the respective shuttle. Repair needs one current damaged host system, Macaw docked there, one Capybara Scrap, and a live Coordination window. The build callback must complete the ordinary next Team transition and charge an intact AEGIS Construction Bay with materials available. Parent separately proves the real FighterWingCard UI action on the remaining capacity slot.

The helper uses the GM's authenticated Firestore REST token to read the private result, confirms a normal member receives 403 on that root and reads only the safe audience document, and queries PressLog using the Press actor token. It also verifies Doctor/Warrior/Macaw/Boa/build command retries do not duplicate costs or results. Evidence omits tokens and hidden Wolf identifiers.

## Integration messages and remaining work

- Audit-owned range, replay, carryover, loss-persistence, and old-PDF retry repairs are integrated by the parent. This branch consumes the resolved member target IDs and writes the P Station marker plus surviving ships in the immutable finalization audit.
- The specialist-owned P.D.F. Fighter Ace path uses an attack-bound private action and applies target results to the combat roster; the parent integrates its strict replay into the finalization/range authority. Warrior salvage counts only safe positive Fighter Ace `memberResults[*].outcome.damage`.
- `/root` owns integrated attack/aftermath proof composition, real GM result-scene/rendered review, Press UI acceptance, actual Wing Commander build UI acceptance, final independent review, release, and checkpoint closeout. Root must supply the ordinary combat loss and capacity for its UI build gate; this row-4 helper preserves its two-slot assertion.
- Current Scrap collection callable requires a nondestroyed host, and the proof helper reports/blocks rather than pretending a destroyed-host Scrap pickup happened. The printed Capybara page makes the damage threshold clear but is silent on destroyed-host pickup timing; keep this scoped and source reviewable.

## Resource and cleanup state

`npm run coordination:status -- --json` confirmed the row-4 reservation while the isolated local emulator was running. The proof driver cleaned up its disposable session. The emulator process was later stopped; a forced-exit warning named child PID 76916, and a follow-up process check found no such process. I then released this worktree's configured slot and its `emulator-slot-4` resource claim; slot 4 is now available, while the task entry remains active with no resource claim pending parent integration/acknowledgement. Do not mark the entry finished while this handoff is being integrated. The Rules wrapper could not fetch pinned `firebase-tools@15.29.0` because registry access was unavailable; the full Rules test file ran directly against slot 4 with approved loopback access. Other PC09 slots belong to their respective worktrees; do not use or clean them. This branch's `node_modules` and `functions/node_modules` are workspace symlinks; preserve them and never stage/remove them.

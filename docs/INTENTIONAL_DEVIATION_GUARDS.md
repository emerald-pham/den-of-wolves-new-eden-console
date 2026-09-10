# Intentional Deviation Guards

This page records owner-approved behavior that extends or corrects an older
plan or printed baseline. The behavior is intentional product policy, not an
accidental mismatch to be “cleaned up.” The focused tests named below are
regression guards: do not remove or weaken them merely to make the current
implementation resemble an older baseline.

If a future owner decision changes one of these contracts, record that decision
in a public decision document and update both the focused test and this page in
the same change. A failing guard is evidence of a behavior change that needs
that decision; it is not permission to delete the test.

## Roster correction and the Capybara expansion boundary

Why this gate exists: the owner-set roster resolves the AMB-13 role conflict at
the low end (Wing Commander remains present at 8–10 players and Executive
Officer appears at 11), while the high-count rows use the atomic Capybara
Captain/Recycler pair. Rows 19 and 20 are expansion-only; they must not be
silently converted to base mode, split into a one-person Capybara role, or
filled with Press or GM stations. Keeping the client catalog and authoritative
server setup on one ordered matrix prevents casting, seats, vessel derivation,
and hidden-role math from drifting independently.

Public decision sources: [`IMPLEMENTATION_CONTRACTS.md`](IMPLEMENTATION_CONTRACTS.md)
§ Prompt 004 and [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) §§ 4 and
the owner-set completion addendum.

Guard coverage:

- `src/data/rolePresets.test.ts` and `functions/src/roleConfiguration.test.ts`
  assert the exact ordered 8–20 matrices and the replacement-role boundaries.
- `functions/src/gameSetup.test.ts` compares the client catalog with the
  canonical server setup for every supported count, asserts Press/GM exclusion
  and the two-role Capybara suffix, and rejects explicit base mode at both 19
  and 20 players.

## Press is optional and non-counting

Why this gate exists: Press is a deliberate Console extension: an enabled
Press Officer may occupy a separate twenty-first station, but Press is not a
core seat. An unclaimed or stale Press station must not block core readiness,
change the Wolf threshold, add a third Wolf, add a vessel to core math, or let
one person hold both Press and a core role. Press loyalty remains private and
separate from the core roster.

Public decision source: [`IMPLEMENTATION_CONTRACTS.md`](IMPLEMENTATION_CONTRACTS.md)
§ Press readiness, with the corresponding owner-set rules in
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

Guard coverage already exists in `src/data/rolePresets.test.ts` (Press and GM
are absent from every core preset), `functions/src/gameSetup.test.ts` (a
claimed Press remains outside core readiness and vessel math, Press loyalty is
separate, and a Press holder cannot carry an extra core assignment), and the
production composition tests in `functions/src/sessionComposition.test.ts`.
Do not replace these focused assertions with a green aggregate count.

## One live GM covers both facilitator lanes

Why this gate exists: the Console deliberately extends the two printed
facilitator responsibilities so one authorized live GM can run the table.
Additional GMs are optional collaborators. A stale or disconnected extra
instance must neither create a second-GM requirement nor falsely satisfy the
readiness gate.

Public decision source: [`IMPLEMENTATION_CONTRACTS.md`](IMPLEMENTATION_CONTRACTS.md)
§ Automation-first, intervention-rich facilitator contract.

Guard coverage:

- `functions/src/gmSessionCallable.test.ts` proves one active instance can
  carry both responsibility labels.
- `functions/src/gameSetup.test.ts` proves a live dual-lane instance keeps
  readiness true in the presence of a stale extra, while stale-only instances
  leave readiness false.

## Roster-derived SNN host with additive history hydration

Why this gate exists: SNN host selection follows the active roster, not a
possibly stale legacy player-count field. The fallback keeps AEGIS for rows
without Dione and uses Dione once that ship is in the roster. Hydrating a
missing SNN record is additive: stored docking and visit history are immutable
compatibility data and must never be replaced by the newly derived default.

Public decision sources: [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)
§§ 8 and the SNN/Press rules, plus [`SHUTTLECRAFT.md`](SHUTTLECRAFT.md).

Guard coverage in `src/data/shuttles.test.ts` covers host selection, preservation
of stored SNN docking and visits, legacy additive hydration, and the active
roster taking precedence over a stale count. The route-level assertions in
`src/App.test.tsx` additionally preserve the Press console’s SNN identity and
host-centered DRADIS projection.

## Capybara Scrap Refinery damage authority

Why this gate exists: damage resolution is authoritative and card-specific.
The Capybara’s Scrap Refinery is the `7♠` outcome; a different card, system ID,
or display name would make the server and player-facing damage receipt disagree.
The guard protects the exact mapping without exposing or inventing any other
unimplemented Capybara mechanics.

Public decision sources: [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)
§ Capybara source/provenance routing and
[`CONSOLE_ARCHITECTURE.md`](CONSOLE_ARCHITECTURE.md) § damage outcomes.

Guard coverage in `functions/src/shipDamage.test.ts` checks both the registered
deck entry and the authoritative draw result for `7♠` → `Scrap Refinery`.

## Boundaries and exclusions

These guards protect only the contracts above. They do not claim that deferred
features are implemented: full Capybara maintenance and specialist mechanics,
later-turn or whole-game flow, Wolf attack resolution, shuttle travel, or the
owner-deferred DRADIS attack visualization remain outside this page. The known
incorrect Iris copy is intentionally not protected.

The current DRADIS component tests exercise rendered sweep acquisition and rim
crossings in `src/components/ContactPlot.test.tsx`. A separate event-count
integration guard for `CONTACT_SCAN_EVENT` is not claimed by this page yet; it
must be added at the component seam before event-count behavior is treated as a
completed deviation guard.

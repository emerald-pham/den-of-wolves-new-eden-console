# PC10 action and role source map

The generated [action/role matrix](./PC10_ACTION_ROLE_MATRIX.json) inventories the current Functions exports and records a source trace for every callable. It is a code-navigation aid; it does not grant gameplay, availability, UI usability, or acceptance credit.

## Coverage

- 241 built SDK exports: 232 callables, 6 background triggers, and 3 scheduled triggers.
- 42 role identities. The seven private loyalty identities are derived from the canonical `LoyaltyKind` union.
- 9,744 callable/role eligibility cells. Every cell is explicitly unresolved until the server entitlement check is traced for that action.
- Every callable row has fields for its user-facing action, served-UI trace, eligible actor, source locations, requirements, costs, consequences, blockers, next actor, and in-console guidance. Unverified mechanics are `status: unresolved` with a null value; guidance coverage is marked for PC11.

## Source-trace limits

The current source has exact quoted client references and a static import chain to `App.tsx` for 226 callables. This identifies a candidate client path; it does not prove a control is mounted, visible, enabled, entitled, or usable. The six callables with no exact quoted client reference are:

`resolveMaliadesMedium`, `resolveMaliadesShort`, `setShipPreference`, `submitWolfSupplySabotage`, `elevateToGm`, and `rollDice`.

Those rows are candidates for owner review, not proof of product unavailability. Native-only classification was not performed for this source revision. Background triggers and schedules are listed separately from player-invoked callables. No human-device or physical-play evidence is claimed.

Each matrix source binding records the generated commit, Functions and client source tree hashes, compiled Functions tree hash, and entrypoint hashes. The build was run in this isolated action-matrix worktree; the parent root checkout's build status is not asserted. No emulator, browser, native callable, or gameplay request was run for this snapshot.

## Acceptance accounting

The artifact preserves the fixed 48 prompt closures, A01 QR credit at zero, A02 demo credit at zero, and PC11/PC12 as not executed. The generated whole-role/fresh-game proof fields remain pending. The authoritative PC10 acceptance matrix separately records the 22 accepted lifecycle/setup/privacy claims and scoped valid historical evidence; those partial claims do not complete a role or endpoint. PC11 is the authorized follow-up for concise action-adjacent hints and longer contextual guidance. PC12 remains unexecuted as recorded. See the [PC10 acceptance matrix](./PC10_ACCEPTANCE_MATRIX.md) for the authoritative release gate.

The subsequent three-actor manual-training actual at `278347c6` completed its
scoped admission/preparation/start/Coordination prefix, then stopped before
Request on null Press document/group authority. It is sealed failed with exact
cleanup and earns no flight, ending, whole-role or fixed prompt closure. Its
reader/presentation diagnosis and current recovery gaps live in the same
acceptance matrix; the generated complete-proof fields are unchanged.

Regenerate after building Functions:

```sh
npm run build --prefix functions
node scripts/pc10-function-inventory.mjs docs/PC10_FUNCTION_ROLE_MATRIX.json
node scripts/pc10-action-role-matrix.mjs docs/PC10_ACTION_ROLE_MATRIX.json
```

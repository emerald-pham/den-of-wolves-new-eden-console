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
acceptance matrix. The subsequent targeted normal-admission reader/Rules
correction at `a06c5856` passes focused Native checks and independent Source
review; missing discovery still grants no group authority. The matrix records
the separate current UI/SDK receipt/server ownership contract and minimal
flight-only proposal. No new game ran within that closed targeted correction.

The separate parent-authorized actual 2 at `25ee6b15` completed actual current
Cycle 1 Press transmission and the ordinary manual Coordination/exact SDK
retry prefix, then stopped before Request on restricted Press phase versus
lifted GM phase. Its 13 prefix claims overlap prior setup; no flight, actual
private-negative check, ending, whole-role/function or rendered acceptance is
credited. Three Auth actors used two automated browsers and zero humans.
Diagnostic-only reads skipped the existing production projection confirmation;
the concrete wrapper gap and smallest Source proposal are recorded in the
[acceptance matrix](PC10_ACCEPTANCE_MATRIX.md#bounded-three-actor-actual-2--phase-projection-failure-closed-cleanup).
Exact-owned cleanup, 0/0/0 postflight and complete preservation passed. The
failed actual is sealed; at that handback no new launch or external release
was authorized.
Generated complete-proof fields, function eligibility cells and all48 fixed
closure statuses are unchanged.

The subsequent parent-authorized bounded family iteration passed at actual
Source `3c279eee`: actual 4 qualified Press Request/Begin/Retarget/natural
arrival, exact retries, scoped privacy/wrong-holder denials, same-original-UID
reload and GM manual Pursuit ending/debrief/closure/entitled history. Three
ordinary Auth actors used two automated browsers and zero humans; 27 scoped
claims took 142,577 ms including exact cleanup. Source-only external observer
repairs and actual 3's failed reload remain separately recorded in the
[qualified family](PC10_ACCEPTANCE_MATRIX.md#qualified-press-flight-and-pursuit-ending--bounded-family).
Generated complete-proof/eligibility fields and all48 fixed closure statuses
remain unchanged; no rendered, every-role/function or release credit is earned.

The subsequent bounded ending-concurrency family passed at actual Source
`d9664a41` (0.5.72): 19 overlapping scoped claims, three ordinary Auth identities,
two automated browsers/contexts and zero humans, 99,436 ms including cleanup.
Two live owned GMs raced actual UI freeze/close, retained one immutable effect
and four actor-bound receipts, and recovered exact retries. The original
Captain's normal closed return/reload installed only narrow permitted history;
populated private deck/organiser/debrief receipts and borrowed GM authority
were denied. Own loyalty retained its actual policy; absent peer loyalty is not
populated-target proof. Seven test-first closed-resume cases, 501 affected tests
and bounded review qualify the focused repair. Actual 1 remains failed and its
unretained keys are not inferred. Source/runtime/cleanup preservation passed.
See the [qualified family](PC10_ACCEPTANCE_MATRIX.md#qualified-competing-endingdebriefclose--bounded-family).
Generated complete-proof and eligibility fields, fixed closure totals and final
review/render/CI/deployment gates stay open; no whole-role acceptance is earned.

Regenerate after building Functions:

```sh
npm run build --prefix functions
node scripts/pc10-function-inventory.mjs docs/PC10_FUNCTION_ROLE_MATRIX.json
node scripts/pc10-action-role-matrix.mjs docs/PC10_ACTION_ROLE_MATRIX.json
```


The bounded candidate discovery/preparation family passed at `84dc3c4e`: real
normal GM plus ordinary Shepherd Scientist, two Auth/two automated browsers and
zero humans. Its 20 overlapping assertions qualify N/O/P scout discovery and
own report recovery, distinct preparation guidance, active Cycle 6 private GM
checkpoint/outbox recovery and populated server-private denials. P541–543 and P593
remain partial; full 619 outcomes and requester-peer/foreign-group/private bonus
audiences stay open. Exact cleanup returned0/0/0. See the
[qualified family](PC10_ACCEPTANCE_MATRIX.md#qualified-candidate-discoverypreparation-and-active-cycle-6--bounded-family).
The unchanged generated inventory's complete-proof/eligibility fields are not
promoted; this bounded family does not prove every function/role or usability.


### Core custody/cargo family closed locally

Actual4 at `5da0593c` (0.5.72) passed17 overlapping scoped assertions in84,983ms:
normal GM plus original Shepherd Engineer and ordinary Shepherd Captain,
three Auth/automated browsers/contexts and zero humans. Real manual0→1 and
Coordination, Black Sheep handoff/reclaim, food1 host10→9/shuttle0→1, original
lost-ack UI retry/cold reload/SDK replay and fresh nonowner/revoked-holder denials
qualified. Two dedicated control request/audit pairs and one standardized cargo
audit retain original identities/costs on replay. Strict operational berth/SDK
authority remains required after normal start. See the [qualified family](PC10_ACCEPTANCE_MATRIX.md#qualified-black-sheep-custody-and-cargo--bounded-family) for exact source,
Native/hash binding, failed-prefix evidence and scope limits.

55Functions/111client tests reused unchanged,28finite contracts and bounded
Sol6.1 review pass. Three prior actuals remain failed; their individual setup,
start/Coordination receipts and exact cleanup are retained without backfill or
summed counts. Only temporary runner corrections were needed; product/version
unchanged. Exact cleanup0/0/0 and source/runtime/original/PC09/registry preservation
pass,12slots free. The immediate cargo capture retains prior displayed10/0;
durable9/1 is proved and settled balance rendering/final usability unverified.
Generated whole-function/role proof fields remain pending; the authoritative
matrix records this scoped acceptance. Shared618/620/629/635 staypartial,
13partial/35missing/all48open,703/751overall245/293campaign/NEXT181 unchanged.
No next family, release/push/merge/deploy, post-PC10, PC11/PC12 or license/assets
change was executed. Return the local closed-family handoff to the parent.


### P631 narrow rate/replay/privacy criteria

Parent-accepted native source `18aabd20` qualifies normal live GM and ordinary
member admission, `prepareFullGameDemo`'s 6/min budget/exact original replay
and `getCurrentMemberSession`'s 120/min budget with same-network UID isolation.
Both normal SDK actors are denied populated private-marker docs/query; two
rate-denial logs contain allowlisted metadata only. Actual cohort is two Auth
identities, two Chrome processes/contexts and zero humans. Six narrow criteria
pass; the formal handback timing gate failed. See the
[exact native report](PC10_P631_NARROW_NATIVE_REPORT.md). Generated whole-function
and whole-role proof fields stay pending; no taxonomy or fixed catalog closure
is promoted. P181 source preparation and original-paper parity reconciliation
remain separate, with no new runtime grant or complete-game acceptance.

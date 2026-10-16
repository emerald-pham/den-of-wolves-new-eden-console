# PC10 action and role source map

The generated [action/role matrix](./PC10_ACTION_ROLE_MATRIX.json) inventories
current Functions exports and records a static source trace for each callable.
It is a code-navigation aid; it does not grant gameplay, availability, UI
usability, or acceptance credit.

## Coverage

- 248 compiled SDK exports: 239 callables, 6 background triggers, and 3 scheduled triggers.
- 42 role descriptors; the seven private loyalty descriptors derive from the canonical `LoyaltyKind` union. Descriptors are not authenticated actors.
- 10,038 callable/role eligibility cells. Each remains unresolved until the authoritative server entitlement check is mapped.
- All callable rows include action, served-UI trace, actor, source, requirements, costs, consequences, blockers, next actor and guidance fields. Static references do not establish runtime reachability or eligibility.

The current Functions source binding is `243f67105437695b1a43f57e6de7e6040f64e659` (550 files; tree SHA-256 `1edae453e457850854199594d1100173bb666fc4fd4adf5e46a72a4c21d2eee6`; `index.ts` SHA-256 `84a878f4b48112a8c351f885dc6f59c195392fd1ff97d9754faffe59041c1ae2`). The client source binding is 877 files, SHA-256 `95d4ac4cdcb6f8e7010a4a00218bf32838daf2c1e9a8bfb7e8a8dd66136b30c2`. Export metadata was read from the existing compiled tree; compiled `index.js` SHA-256 is `e46ad04fcd43ecb5e2c29beb861bb8d128ef2a278f542ac63bdbc08333c05c94`. This refresh did not build or execute an emulator, browser, callable, or gameplay request.

The prior function inventory was 247 exports/238 callables. Only one export was newly present there: `castingCompanionCommand`, existing published-main casting transport outside new PC10 gameplay. The prior action/role JSON was older and omitted seven callable rows now included: six already present in the function inventory plus that casting transport. These static rows earn zero gameplay/native credit. The Cappy-a3 opening-combat/boarding prefix did not call `castingCompanionCommand`; no claim is made here about calls to the other six rows.

## Source-trace limits

The current source has exact quoted client references for 235 callables and a static import chain to `App.tsx` for 234. Four have no exact quoted client reference: `resolveMaliadesMedium`, `resolveMaliadesShort`, `elevateToGm`, and `rollDice`. These are candidates for owner review, not proof of unavailability. Static imports do not establish that a control is mounted, visible, enabled, entitled, or usable. Native-only classification was not performed. Background triggers and schedules are separate from player-invoked callables. No human-device or physical-play evidence is claimed.

`PC10_ACTION_REVIEW_ANNOTATIONS.json` is preserved unchanged. Its curated 20-row review remains explicitly bound to its recorded source `08b21c99702c2532221b8072b48f29dd22e820c1` and prior canonical snapshot SHA-256 `bdd64af30a867de22a2c0abb3513bea94fc5ef618ac909188d7072baee53f224` (232-callable baseline). This refresh does not rebind or revalidate its source anchors; review annotations apply only within their recorded binding. The previous 241/232 and 247/238 inventory snapshots remain historical records.

## Acceptance accounting

The artifact preserves the fixed 48 prompt closures, A01 QR credit at zero, A02 demo credit at zero, and PC11/PC12 as not executed. Whole-role/fresh-game proof fields and per-callable role eligibility remain pending. The authoritative PC10 acceptance matrix separately records scoped historical claims; they do not complete a role or endpoint. Static import inventories and role descriptors do not grant acceptance credit. See the [PC10 acceptance matrix](./PC10_ACCEPTANCE_MATRIX.md) for the release gate.

Regenerate inventory after the final Functions integration:

```sh
npm run build --prefix functions
node scripts/pc10-function-inventory.mjs docs/PC10_FUNCTION_ROLE_MATRIX.json
node scripts/pc10-action-role-matrix.mjs docs/PC10_ACTION_ROLE_MATRIX.json
```

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

## October 8 N/O edition alignment

Home is the owner-selected default for app and canonical paper N/O behavior;
coherent Deluxe alternatives must remain clearly labeled. The [acceptance
impact](PC10_PARITY_ACCEPTANCE_IMPACT.md#owner-selected-home-no-default)
records exact owner-selected costs, research requirements and arithmetic,
required source-face verification, assigned app/paper ownership and unselected
facilitator policies. The generated source matrix remains a historical
inventory pending final Functions reconciliation. No existing source trace,
role proof or N/O result is relabeled as current Home-default acceptance.

## October 8 owner-approved house rules

Emerald's direct “go for it” response (`Sentinel_cdb7e2735ee4819188a584d06e6b3756`)
to proposal `Sentinel_a0dcb330864c8191bbd5b06981f753b7` approves these five
clearly labeled house rules for app and local canonical paper. They fill
unspecified cases; they do not claim original-author intent.

| Rule | Approved behavior and boundary |
| --- | --- |
| Nonparticipating targets | Reroll targets that are not participating. Preserve exact source targeting exceptions and the Capybara override. |
| Finite mission deck | Recycle resolved mission discards only when needed; leave undealable extras undrawn. Do not recycle unresolved/in-hand cards or invent extra cards. This is not a Wolf or damage-deck carryover ruling. |
| Split pursuit | Track separated groups' pursuit individually; adjudicate exceptional merges before they affect play. Preserve normal documented merge policy and source exceptions. This does not select net-depth versus cumulative outward-jump arithmetic. |
| Unspecified half-losses | Round unspecified half-losses down, preserving explicit exceptions, including printed emergency-jump rounding. Do not apply this rule to fractional Boa opportunity difficulty or invent range/tie conventions. |
| Unfinished Wolf Commander action | Keep the optional unfinished action unavailable until the GM records its consequence. Preserve the printed effects and actual phase/role authority. No automatic default death, capture, escape or other consequence is approved. |

The canonical main PC10 parent owns app changes and coordinating existing
helpers; the canonical-kit task owns local-only documents. Avoid overlapping
writers. Each functional correction requires meaningful consumer/backend RED
in a separate test-only commit, GREEN, independent exact source review and
final relevant rendered review. Current authority/privacy, cost accounting,
replay/recovery and explicit source exceptions remain gates. The GM records a
real adjudication where required; ordinary calculation remains server-owned.
Request a bounded parent runtime allocation only when source-ready.

Prior observations retain their exact source binding; these planning updates
alone add no implementation, native evidence, fixed catalog closure or release
acceptance. The fixed 48 PC10 rows and all 751 statuses remain unchanged. Other
source disputes outside the five approved scopes remain unresolved.

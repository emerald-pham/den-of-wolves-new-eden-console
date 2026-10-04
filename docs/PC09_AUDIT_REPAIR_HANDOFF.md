# PC09 audit and recovery handoff — October 4, 2026

Evidence availability after the Mac reconnect: earlier external `/tmp` files
referenced here were lost. These paths identify historical reported runs;
committed sources and regressions survived. Fresh resumed artifacts and limits
are recorded in [the execution record](PC09_EXECUTION_RECORD.md#reconnection-and-evidence-availability)
and [the risk review](PC09_RISK_REVIEW.md). No missing file grants new proof.

This record covers the audit-owned PC09 repair group in worktree
`/private/tmp/dow-pc09-audit-20261004`, branch `feat/pc09-audit-20261004`.
The root task owner retains integration, independent risk review and release.
This document does not update prompt status or award P621 closure.

## Artifact availability update — October 4, 2026

The later cleanup of `/private/tmp` deleted this assigned worktree, the
uncommitted run6 harness edits, and the external gameplay evidence directories.
The JSON evidence, browser traces, screenshots, and service logs named in the
historical sections below are no longer present and cannot be re-opened from
this checkout. Their recorded summaries and hashes remain historical notes,
not currently inspectable proof artifacts. The tracked recovery driver source
is still available.

The retained task context reports that the latest positive ordinary attempt
used normal authenticated GM +1 resource adjustments, two attack-bound Short
Ace losses, and an immutable later return manifest; it completed a real HTTP
build and exact retry but stopped before independently completing the actual
Wing Commander UI build. The latest browser attempt also recorded App Check
exchange errors; it is not a green gameplay or UI result. Its raw trace was
deleted, so the exact request evidence cannot be reconstructed from the
workspace. Root owns a fresh run on its own isolated row. Do not infer proof
completion from this historical summary.

## Repairs and regressions

| Finding or boundary | Test-first repair commits |
|---|---|
| RANGE-01 / RANGE-05 / BOARDING-01 | `f2bf8d62`, `68a13dc8`, `8db07552`: destroyed-AEGIS progression, committed support treatment after its holder is removed, and catalog-backed Wing/Battlestation carryover. |
| RANGE-02 | `cc275c56`, `871ba437`: persist AEGIS Short-range fighter losses into durable inventory. |
| P Station repeat reader | `bd1b5c3c`, `254fb7b3`, `6c88b7cf`, `aeb38112`, `688ac370`: same-cycle repeat requires the exact station/sequence context and audited survivors. |
| RANGE-03 / RANGE-04 | `c2739530`, `7adbe917`: accept authoritative mixed-source pass and assignment receipts. |
| RANGE-06 | `017d9773`, `dbc499fa`: publish shifted targets from the immutable resolved range receipt. |
| RANGE-07 | `da3d39bb`, `49e22a64`, `8afa23f2`: republish only the entitled PDF member projection after combat. |
| RANGE-08 / BOARDING-02 | `a4f8e486`, `a3255e6f`, `75cb7b80`, `96045273`: bind EO and crew-defence replay to the active attack; retain exact same-attack retries and real dice assertions. |
| Connected support selection | `25ff68a6` test-only, `ad4a72d8` client fix: committed support remains in the server's combined lock, while EO checkboxes show only selectable `aegis-*` actions. The regression preserves valid support projection and one-lock assertions. |
| P494 Commander-cycle reader | `2137b48f` test-only, `fb0681a4` reader fix: attack numbers above three require the exact prior marker, attack ID, finalization audit, +1 linkage and later cycle. Ordinary cap and the separate P Station context remain intact. |
| Combat exhausted-draw finalization contract used for the proof run | `981a35c4`, `9a12fe53`, `8a52a57b` test-only; `158da7fc` implementation: combat required-draw exhaustion follows catastrophe and finalization retains a private surviving-ship list. This was aftermath-owned work cherry-picked onto the isolated audit branch for composed proof; root has its integrated copy. |

The Commander-cycle reader overload is
`resolvedWolfAttackForCarryover(state, audit, currentTurn, context)` with
`context = { type: 'commander-cycle', expectedMarker, parentAttackId,
nextAttackNumber }`. Its caller must re-read and validate the current-cycle
Commander ledger, group, pursuit and navigation first. The finalizer preserves
the exact private `commanderCycleAttack` marker in its immutable audit.

## Native verification

On audit source HEAD, canonical focused checks passed:

- Functions: `wolfAttackDeclarationCallable.test.ts` (100),
  `wolfAttackRangeCallable.test.ts` (110), `wolfCombatMath.test.ts` (34), and
  `sessionLifecycleCallable.test.ts` (143): 387/387.
- Unit: `sessionService.test.ts` (219) and
  `WolfRangeActionPanel.test.tsx` (8): 227/227.
- `npm run build --prefix functions`, `node --check
  scripts/test-pc09-authenticated-recovery.emulator.mjs`, and
  `git diff --check` passed.

All ten original audit reproductions have focused native regression coverage.
Authenticated evidence is deliberately narrower than native evidence:

| Finding | Authenticated exact reproduction? | Connected/composed evidence |
|---|---|---|
| RANGE-01 destroyed AEGIS blocks later range | No. | The run completed all ranges with live AEGIS; destroyed-AEGIS progression is native-only. |
| RANGE-02 AEGIS fighter loss returns on later launch | No. | The run produced PDF Wing losses, but did not lose and relaunch an AEGIS fighter; exact inventory regression is native-only. |
| RANGE-03 committed hit plus EO pass | No. | Mixed-source range actions ran, but the exact pass-with-hits shape is native-only. |
| RANGE-04 combined committed-contact total | No. | Authenticated assignment endpoints handled combined sources; the client-total mismatch itself is covered natively. |
| RANGE-05 remove holder after support commitment | No. | EO support rows were hidden at phone, desktop and landscape sizes; no holder was removed after commitment in this run. |
| RANGE-06 post-shift target in result | No. | Medium shifts and entitled results were present; an explicit old-target/new-target comparison remains native-only. |
| RANGE-07 current PDF projection omits casualties | **Yes.** | Four PDF Short rolls caused three losses; private projection equaled the authenticated member read, and the connected reference rendered 1/4 fighters, 2 Medium actions, 4 Short rolls and 3 losses. |
| RANGE-08 old EO retry crosses attack identity | No. | Legitimate exact same-attack retries ran; attack/cycle drift rejection is native-only. |
| BOARDING-01 Station return manifest blocks later attack | No. | The authenticated composition did not return a Station into a later attack; the schema/repeat case is native-only. |
| BOARDING-02 old crew-defence retry crosses attack | No. | Genuine boarding and same-attack retries ran; stale replay rejection is native-only. |

The successful local-emulator session used an ordinary 20-player roster,
ordinary Auth join, connected role-owned callables, normal range/boarding
resolution, a resolved audience, actual movement reopening and a live member
projection. Only disposable phase deadlines were accelerated. The run also
proved same-attack retries, source choices and committed combined locks, and
completed actual browser network recovery. It did not use a prepared scene,
CI, production deployment or live production gameplay.

## Recovery distinctions and evidence

A generation-less `disconnectFromSession` request is a legacy no-op and is not
network-recovery evidence. The native lifecycle contract requires a captured
`connectionGeneration`: a valid current-generation explicit departure releases
the core seat/role and private assignment, while a delayed old generation or
legacy request without a captured generation does not mutate membership. The
authenticated recovery driver separately toggles the browser offline and online,
observes `navigator.onLine === false`, calls `resumeSession`, and reloads. The
same UID, member, session and assigned role return with a live connection and
server-fresh snapshot; that path does not issue a voluntary departure.

Command-result validation requires a nonempty `attackId`. Same-command,
same-attack retries return the exact saved result without new writes or dice.
Session-cycle, attack-cycle, or same-cycle attack-ID drift fails with
`failed-precondition` before mutation or entropy. Legacy event-only/unbound
receipts fail closed; a receipt missing the attack-bound result identity is not
accepted as a current retry. There is no implicit migration that guesses which
attack owns an old receipt.

The reusable connected driver is
[`scripts/test-pc09-authenticated-recovery.emulator.mjs`](../scripts/test-pc09-authenticated-recovery.emulator.mjs).
With the isolated emulator row and UI running, provide
`PC09_AUDIT_EVIDENCE_PATH` and `PC09_AUDIT_UI_URL`. The successful evidence is
outside Git:

- `/tmp/dow-pc08-bug-audit-evidence/range/pc09-authenticated-composed.json`
- `/tmp/dow-pc08-bug-audit-evidence/range/pc09-authenticated-composed.json.pdf-projection.json`
- `support-selectability-phone.png`, `support-selectability-desktop.png`, and
  `support-selectability-short-landscape.png` in that range evidence directory.

The successful run records source SHA
`158da7fcb6b013f39c5acad60b51f58033ae9671`, an ordinary roster of 20, no
prepared scene, empty browser-error and heartbeat-failure lists, 4 PDF Short
rolls, 3 losses, and equality between private PDF state and the authenticated
member projection. The audited PC08 baseline is
`b36119e9cdcf43e65bdfc00538b67115b0214ee2`; the group-start commit is
`ffa3ccbe3e874e7502615d70f8a9259635433f8b`. Runtime implementation SHAs are
`8db075523ae82ebf880a7bd689be571b84a2e87b`,
`871ba437657e51b2504a17d32dff24cff376c8e3`,
`688ac3705beb1bb593357f4974a59214a01adc01`,
`7adbe9179c37d4c3330e33abfc4dfd509b9c20af`,
`dbc499faa8ae77a5c057a34b67be22e5766450fc`,
`8afa23f2291391f655503042b3b56603d484a10b`,
`75cb7b802019e1a712487969a3123dc9932e2fee`,
`ad4a72d8234cb26f656d5a6d3a98efd8a9cb4aca`,
`fb0681a4656cbfef7d6eaee238ae3126a01117f8`, and
`158da7fcb6b013f39c5acad60b51f58033ae9671`. Root reverified all seven
private-source checksums; private source material was not copied into Git.

P621 remains open for the root owner's integrated candidate and risk review.
No CI, merge, release, production deployment, or checkpoint-closure credit is
claimed here.

## Reconstructed ordinary loss/return/build driver

[`scripts/pc09-ordinary-return-rebuild-positive-proof.mjs`](../scripts/pc09-ordinary-return-rebuild-positive-proof.mjs)
is a reconstructed test-only driver for the bounded P483/P645 ordinary
scenario. It has **not** been run. It requires explicit
`PC09_OWNER_RUNTIME_DIR`, `PC09_OWNER_SOURCE_SHA`, `PC09_OWNER_LIB_SHA256`, and
`PC09_OWNER_RUNTIME_MANIFEST` inputs, and checks the complete sorted compiled
Functions JavaScript tree before it creates a session. It records every
ordinary authenticated current-GM +1 resource adjustment and selects full
printed rations for the chosen AEGIS, Dione, Refinery-124 and Gorgoneion
maintenance cycles. Two attack-bound Short Ace actions must create two actual
durable Alpha vacancies; the next ordinary declaration must consume every
immutable parent return including a surviving Battlestation. A damaged
Construction Bay may be repaired only by the live, paid Gorgoneion Repair
Drones path with its exact receipt/retry proof.

The driver proves one normal HTTP fighter build and exact response/receipt
retry, then a separate actual Wing Commander browser build scoped from the
visible Alpha heading. It keeps the two-slot requirement, checks both material
spends and member counts, and captures browser HTTP status/method/resource type
with query values and session IDs redacted. Any browser HTTP error, request
failure, page error, or console error fails the proof; nothing filters App
Check or other errors. The PC07 helper's optional `serializeFixtureCalls`
serializes synthetic fixture actors and keep-alive calls while leaving actual
browser SDK calls independent.

This source reconstruction is not evidence that the rebuilt path passed. Root
owns its fresh isolated gameplay run and final acceptance. The deleted run6
JSON, traces, screenshots, and logs were not recovered or recreated here.

## Handoff and resources

The audit-owned fixes, native regressions, connected-driver source, and
handoff summary are tracked; the external connected-run artifacts were lost in
the cleanup described above. Root owns the single-candidate integration and
acceptance. This worktree used emulator slot 3: Auth 9129, Functions 5031,
Firestore 8110, Hosting 5030, emulator UI 4030, and Vite 5176. Both
reservation-owning wrappers were stopped and their process reservations and
configured-slot reservation released. `coordination:status` now reports slot 3
available; the other worktrees' slots and reservations remain intact. Generated
ignored config and shared `node_modules` links are not deliverables.

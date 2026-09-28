# PC01–PC04 prompt accounting audit

**Audit date:** 2026-09-28. **Inspected main:**
`206ab29a` (application version 0.5.54). This is a historical catalog and
source reconciliation, not a fresh production gameplay certification.

## What the flat number means

Every release snapshot below contains the same 458 done IDs. There were no
new done IDs offset by reopened IDs: the done set itself is unchanged.

| Boundary | Exact release/catalog commit | Done | Partial | Missing |
|---|---|---:|---:|---:|
| Before PC01, 0.5.50 | `f8703935bf201d8021b8ac0a2749e845ae8d0eb4` | 458 | 44 | 249 |
| PC01, 0.5.51 | `4e8e3876108709f2a620c4f71ea874183d3db4ee` | 458 | 49 | 244 |
| PC02, 0.5.52 | `f0e4eb73c753915567412899efd4dd4d78faa9dc` | 458 | 53 | 240 |
| PC03, 0.5.53 | `9bd94e3611d7bbab654107b964e69fae318bad10` | 458 | 56 | 237 |
| PC04, 0.5.54 | `0ba386f50689b375153ceee3b2eb11a9ecd19435` | 458 | 57 | 236 |

The only status changes are missing → partial for **303, 304, 330, 331, 332,
333, 371, 401, 589, 590, 599, 600, 677**. This is 13 newly partial IDs, not
13 newly complete ones. Changelog arithmetic matches these snapshots.

PC02 also modified already-done P589b and P601, and PC03 modified already-done
P377. Those can be useful shipped improvements without increasing the number
of unique completed prompts. Release association is not evidence of a new
completion; never count an ID a second time.

## Confirmed stale implementation records

**Yes, some existing implementation was under-recorded.** The following five
catalog descriptions contradicted current source. They are corrected in this
change and linked to evidence `E-CHECKPOINT-RECORDING-AUDIT-20260928`.

| IDs | Stale statement | Verified current implementation | What is not established by this audit |
|---|---|---|---|
| 322, 323, 324, 326 | No production scan transaction consumes the resolver. | `requestScout` in `functions/src/index.ts` calls `authorizeCurrentScoutScan` in `functions/src/scoutRequestCadence.ts`; that adapter selects the Starlight first/second, Hummingbird or Comms resolver using current authority, private coordinates, fuel and persisted cadence. The transaction writes pending request, cadence and receipt. `scoutRequestCallable.test.ts` contains all-four-entitlement and fuelled-second-scan coverage. | Ordinary released-session proof for each entitlement and completion of required prerequisites. The generic integration exists; this does not establish every downstream result/UI acceptance. |
| 629 | Discovery notes have no production producer. | `functions/src/scoutResultCallable.ts` creates the requester discovery note in the reveal transaction and provides requester-bound reads; focused result/map/rules coverage exists. PC01's report and P330 already document this integration. | Comprehensive hidden-roll/bonus privacy coverage and ordinary live entitlement proof across the full P629 acceptance. |

These corrections recover accurate implementation descriptions, **not five
verified completions**. No status or historical release count is changed.
The current done count remains 458. A remaining stale record elsewhere is
possible: this audit inspected all status transitions, partial descriptions,
checkpoint reports and these concrete source contradictions; it did not replay
every one of the 293 full gameplay acceptances or inspect all missing-prompt
implementations exhaustively. Zero additional fully evidenced closures were
established here, which is narrower than claiming none could be recovered.

## Distinguish the remaining work before rebuilding it

| Evidence category | Examples from the current catalog | Next action |
|---|---|---|
| Implementation reported as integrated; ordinary gameplay proof outstanding | P211–213, P321, P325, P327–333, P391, P677; P238, P244, P241c, P371, P380; P401 mission start | Inspect the exact acceptance and supported session access, then exercise compatible checks together through ordinary authorized roles. Fix defects and attach distinct evidence before promoting each ID. A code/deploy receipt alone is insufficient. |
| Both implementation/dependency gaps and proof outstanding | P151 ordinary messaging consumer; P250 depends on P251; P307 split producer; P397/P398 combat progression; P635 incomplete audit consumers | Complete the missing integration/behavior first, using preserved work where applicable. Do not classify these as bookkeeping-only closures. |
| Rules/source or stale decision records | P287 jump distance policy; P589 wording; parked P112/P385 authority questions | Recheck current private source authority and the standing decide/log/continue policy. Resolve what the sources support; state remaining genuine gaps and continue independent work. Do not reuse obsolete parked blockers unquestioningly. |
| Broad acceptance exceeds the shipped checkpoint slice | P618 reconnect, P620 recovery, P629 privacy | Map every named path to evidence, then implement/prove the residual; one working screen cannot close the whole prompt. |

## Recovery disposition

The [replacement plan](CHECKPOINT_COMPLETION_PLAN.md) fixes the same 293 IDs
across PC05–PC10, with 49 closures each in PC05–PC09 and 48 in PC10. Recover
existing evidence first, perform missing verification next, and build genuinely
missing behavior after that. Record recovered credit separately from new
implementation. Keep all incomplete IDs visible until full acceptance holds.
No new runtime behavior, gameplay exercise, or production deployment is part
of this documentation correction.

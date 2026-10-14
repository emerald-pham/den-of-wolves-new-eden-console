# PC10 Wing bay and first-scout acceptance reconciliation

The parent accepted N9's completed native slice at functional source
`1dd1d590e4fbcd59faee8d212494b5c3bafb6284`. It proves fresh admission,
GM start, current Wing authority, natural Coordination entry and one ordinary
scout with its delivered private report, saved note, map discovery and automatic
GM log. Reuse N4's accepted maintenance/bay observations for unchanged consumers.
P181 and P629 remain partial. Counts remain **703/751 overall, 245/293 campaign,
48 unfinished PC10 IDs: 14 partial and 34 missing**, with zero new closures.

## Accepted behavior and its limits

| Existing requirement | Accepted evidence | Remaining limit |
|---|---|---|
| Current ordinary Wing station and Starlight authority | N9: normal Auth/admission/consent, actual GM start 0→1, cleared Cycle 1 briefing, original Wing and Admiral identities and current live/server role, seat and berth. | Three admitted Auth actors, three Chrome processes/contexts, eight configured roles and zero human devices. No all-role or capacity claim. |
| Both initial Fighter Bay cards | N4 and N9: full 4/4 wings, capacity 4, undamaged/uncharged readiness and disabled build controls. | Uncharged readiness takes precedence. N9's initial cards do not prove the charged full-capacity blocker text. |
| Six ordinary maintenance steps and bay charge delivery | N4 at `ffd63649`: begin, storage, rations, unrest, riot and reactor each committed normally; maintenance step/revision 6 delivered Alpha, Bravo and Construction charges to Wing. | This is the maintenance prefix through reactor; `maintenanceLaneCompleted=false`. |
| Both charged Fighter Bay eligibility and full-capacity blockers | N4: both cards show `charged-operational`, correct strength/capacity, disabled build and matching capacity blocker text. The affected maintenance/bay consumers are unchanged at N9. | No positive fighter build, exchange, launch, attack, loss or rebuild. |
| Natural Team→Coordination publication | N9: one phase POST per actor, all three HTTP 200; three server executions overlap. Actual GM call observed from 19:11:23.661 to 19:11:27.606 UTC. | Two internal Firestore lock-warning blocks recur. Their transaction/document identity and SDK retry attempts were not retained. No failed-call backoff occurred. |
| First ordinary Starlight scout and current result | N9: exactly one original `requestScout` at distance 2 in Cycle 1; same actor/request, one delivered private fact/report, saved note, current map discovery and automatic GM log. | Reinforces the previously accepted first-scout rule on current source. It is not another catalog closure, a second scout or a new movement/mission result. |
| Entitled private readers | N9: positive own Wing report/note and authenticated GM automatic-log read. | No new denied-peer, foreign-group, full-chart-export, hidden-loyalty or complete private-audience claim. Private contents were not persisted in this report. |
| Physical return | N9: owned browsers, Auth identities and session data cleaned; original services exited; all captured processes/groups absent, 22 IPv4/IPv6 binds free, own reservations/configuration/claims gone. | First strict port check failed with address-in-use; no claim was released on failure. The same unchanged check later passed. No gameplay retry or guard relaxation. |

N4 ended with physical return at **13:14:18.435 UTC**. N9 acquired at
**19:00:11.835 UTC**, became ready in **21,974 ms**, completed proof by
**19:11:36.976 UTC** and physically returned at **19:13:22.317 UTC**, before
its original **19:26:11.835 UTC** hard deadline. N9's 1,381 passive HTTP replies
all succeeded; these are not 1,381 game actions. The 28 named startup/receipt
operations include prerequisites and captures.

## Contention and release assessment

The Firestore log contains two transaction-lock warning/stack blocks near the
phase boundary, while all three phase callables and all observed browser HTTP
replies ultimately succeeded. SDK retry recovery is a plausible inference;
there is no retained attempt-to-warning mapping. The initial incorrect
no-recurrence metric stays preserved and is superseded by the corrected receipt.
N8's earlier 13 phase HTTP 500 replies also remain preserved. Comparing separate
fresh N8/N9 samples does not establish an exclusive backend cause.

The meaningful test-first client repair, 23 affected mounted/actual-service
checks, bounded independent source review and exact frontend build remain
source evidence. N9 exercised one settled phase call per actor; it did not
exercise the five-second failed-call retry or a recovery/reload path.

Under the current execution policy, an internal warning with a correct delivered
result is not a separate invented release gate. The backend cause remains
unresolved and merits a small phase-only, then phase/presence diagnostic using
the unchanged SDK and handler. An unrecovered callable failure, wrong phase,
authority/privacy error or data loss would hold its affected acceptance.
Whole PC10 release remains open for distinct unproved gameplay, recovery,
privacy, full fresh-game/every-role/function ending, final UI/typography and
exact candidate/main CI/deployment gates.

The next Wing delta is one ordinary paid Zeta refuel and a distinct second
scout in the same cycle using the existing authenticated manual full-game
demo. A first scout is only its fresh-session cadence prerequisite. The
source-only operator preparation earns no new native credit; it needs its
own fresh bounded runtime allocation. No new ten-minute natural-timer replay,
third scout, movement, fighter action or ending is included.

## Retained exact evidence

Local evidence root is
`pc10-reboot-recovery/native-runs` under the assigned Mac task workspace.
These receipts retain source/build bindings, original requests and cleanup;
this documentation commit changes no functional source or emitted build.

| Receipt | SHA-256 |
|---|---|
| `phase-retry-fixed-first-scout-20261014/N9_PHASE_COORDINATION_FIRST_SCOUT_COMPLETED_CLEAN_PARENT_HANDOFF_20261014.json` | `850a85313bd847f389a3d21c8b67ece48441e8f32992c70e7c3024c539a60737` |
| `phase-retry-fixed-first-scout-20261014/N9_PHASE_CALL_OVERLAP_AND_RETRY_EVIDENCE_CORRECTED_INTERNAL_LOCKS_20261014.json` | `be0819b2e00ac2f67efd0b6afcc3dc540d0ff08e6f17bb83137c7dc163d4df4d` |
| `phase-retry-fixed-first-scout-20261014/ordinary-admiral-ui-outcome.json` | `11b6cf822d3a0866af3d27a71d3db0112be285f82b0cd945200ed91de4299cc3` |
| `phase-retry-fixed-first-scout-20261014/ordinary-starlight-private-report-saved-note.json` | `4cc9138b97d465e2b655f96aa99c17bc3ece618760432d4228c2381e6a1ddf38` |
| `phase-retry-fixed-first-scout-20261014/STARLIGHT_FIRST_SCOUT_NATIVE_PHYSICAL_HANDBACK_20261014.json` | `f6bc6e927ed632c7c46513c25dd3e6bb7d8fd4bafdcdc92a98f90c6eda69bea6` |
| `ordinary-admiral-maintenance-through-reactor-20261014/ordinary-admiral-ui-outcome.json` | `dd945ec4546a6f098d225878b10952d662178b36456fc5dd584b01175ec6c2e7` |
| `ordinary-admiral-maintenance-through-reactor-20261014/ordinary-wing-bays-charged.json` | `ea145ba57476576aea09015519bc2584461018b64e0f9d53dc5b51fa8d2dccac` |
| `ordinary-admiral-maintenance-through-reactor-20261014/MAINTENANCE_THROUGH_REACTOR_NATIVE_PHYSICAL_HANDBACK_20261014.json` | `adea1ba7e6ed4e74d165463b97da21f12aa7758815fde023045a6c84418f23ae` |

The [current acceptance matrix](PC10_ACCEPTANCE_MATRIX.md) owns the remaining
criteria. Seven existing endpoint rows and the GM, Admiral and Wing role rows
in the [function/role matrix](PC10_FUNCTION_ROLE_MATRIX.json) now carry this
partial evidence, while its declaration inventory binding remains unchanged.
P618/P620 receive no new recovery/retry credit from N9. P321/P322 and
the already-done first-scout mechanics are not reopened or counted again.
P641/P642/P651 remain uncompleted aggregate gates. Future post-PC10 work,
PC11 guidance, conditional PC12 offline mode and licensing are untouched.

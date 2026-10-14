# PC10 Wing bay, scout and manual-flow acceptance reconciliation

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

At N9 handback, the next Wing delta was one ordinary paid Zeta refuel and a
distinct second scout in the same cycle using the existing authenticated manual full-game
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

## October 14 N11 accepted manual flow and paid Zeta prefix

The canonical parent accepted N11's scoped manual flow and paid Zeta debit at
source `c55d33c6`, using unchanged functional source `1dd1d590`. The overall
child remains **failed** at `wing-starlight-second-private-report-saved-note`;
its false completion flags and original first-failure evidence are preserved.
The separately retained first-scout receipt supports the completed prefix.
N11 is a native attempt label, unrelated to the future PC11 checkpoint.

| Accepted scoped observation | Evidence and limit |
|---|---|
| Genuine authenticated manual preparation and start | Owned current GM prepared full-game training before normal joins, cast the ordinary Admiral/Wing roles and made actual manual Cycle 0→1. No briefing hold or clear RPC was used. This repeats setup prerequisites, not another milestone. |
| Ordinary maintenance prerequisites | Six original begin/storage/rations/unrest/riot/reactor actions committed revision 0→6 in Cycle 1 and delivered the original publication. These are prerequisites, not six new closures. |
| Paid Zeta refuel | Original Admiral `runMaintenance` action `bays-zeta` committed step/revision 6→7 and Fuel 4→3. Original Admiral and Wing received the debit, with counts, Materials, cargo, damage, docking and custody preserved. The maintenance lane remains incomplete. |
| Genuine manual Coordination | Owned current GM used `advanceFullGameDemoPhase`; the current manual publication and compatibility timestamps were verified. N9's natural timer evidence is reused rather than requalified. |
| First Scout prefix | One ordinary Cycle 1 distance-1 Scout delivered its correlated private report, saved note, map discovery and automatic GM log. The retained receipt has all eleven proof fields true; private contents were not persisted. |
| Distinct second request acknowledgement | Same Wing/cycle, different request and target returned HTTP 200. Both Scout acknowledgements explicitly mark `resolutionPendingOnly:true`; their distinct hashes do not prove two resolved private results. |

The second private report/note/map/log proof did not complete. Four private-result
reads and four note reads have only the first report/note fingerprints. Full
native index bodies were not persisted, so second backend-result existence,
overwrite or stale delivery cannot be established from those replies. The
source-only diagnosis reproduced an operator selector defect: the installed
Playwright exact label includes option text from the wrapping label. The
three-line correction scopes the ordinary combobox to **Private scouting
reports** and retains the exact second opaque request ID and all current
identity/authority/result-correlation/privacy checks. Candidate `0c9c09ae`
followed two meaningful selector REDs and passed five targeted inert tests plus
bounded independent changed-code review. It earns no native second-delivery,
rendered typography, recovery or broader privacy acceptance.

N11 used three Auth actors, three Chrome processes/contexts, eight configured
roles and zero human players. Acquisition was **20:58:32.572 UTC**, readiness
**19,414 ms** later and physical return **21:02:58.720 UTC**, a debit of
**266,148 ms (4m 26.148s)**. The first strict physical check passed: all owned
browsers/Auth/session data and original services were closed, captured processes
and groups absent, 22 IPv4/IPv6 binds free and own reservations/configuration/
claims zero. Foreign ownership and source/build bytes were preserved. The 376
transport rows are not 376 game actions. No gameplay retry occurred.

| Retained N11 receipt under `manual-resume-fixed-second-scout-20261014/` | SHA-256 |
|---|---|
| `N11_MANUAL_ZETA_SCOUT_PREFIX_SECOND_DELIVERY_FIRST_FAILURE_CLEAN_PARENT_HANDOFF_20261014.json` | `6a2a2db6c1acaa14b636b55d3c974b8688f18f544ab4c23cfd3c3bd43ed4f316` |
| `ordinary-admiral-ui-first-failure.json` | `f9e36f3c88a4ee44f1d39c9b7afedcdfbbe3697cd584d6e81aa665b3c9573232` |
| `manual-zeta-paid-original-delivery.json` | `b5693da6d9703d2f7a6bffecdabdc3074f48fba0b2043901747f832dbb70bb7e` |
| `ordinary-starlight-private-report-saved-note.json` | `91a22df3ae2704c3dc9bee7bbaf95c4ec957062497ad4101184657397bedbebd` |
| `MANUAL_ZETA_SECOND_SCOUT_NATIVE_PHYSICAL_HANDBACK_20261014.json` | `94fa44b1ccb39cbf67652244f6e344e0cc4aade08f9ec475c022b55b2bd40945` |

At N11 handback, the next fresh bounded route needed to preserve this ordinary
prefix, select the second request and prove its own result, canonical saved
note, target, actor, cycle, current index, map and automatic log while
preserving first-report history under a fresh parent runtime grant. Third Scout, movement,
fighters, missions, endings, all-role/function, human-device, comprehensive
privacy/recovery/usability and release gates remain open. P181/P629 stay partial;
P641/P642/P651 remain open. Counts stay 703/751, 245/293 and 14 partial/34 missing,
with zero new fixed closures and no release.

## October 14 accepted distinct second Scout and retained history

The canonical parent accepted the exact selector-fixed native handoff
`2e25aded8b77f95b2751f7ba22c181470b5fc4078b1a0943e9c41ccee42a6552`.
Product source was `019e5bf2`, unchanged functional source `1dd1d590`, with the
reviewed operator `0c9c09ae`. Genuine authenticated manual preparation before
ordinary joins, casting/start 0→1, six maintenance prerequisites, paid Zeta and
manual Coordination repeated as fresh-session prerequisites; they earn no
duplicate milestones. No launcher/build replacement or backend diagnostic ran.

The ordinary **Private scouting reports** combobox selected the distinct second
original Scout request. The Cycle 1 Wing received its own second report, saved
note, map discovery and automatic GM log. All eleven second proof fields passed,
including original request/actor, two distinct current report indices, private
result and canonical saved-note matching. The final current-state step checked
both original pairs and compared the retained first report/note fingerprints to
the original first proof. First history remained in the current two-report
index. This does not claim a native first-report reselection after the second,
cold reload, interrupted/repeated recovery or new denied-peer privacy evidence.

| Correlated private reader | Actual replies | Distinct request/result pairs |
|---|---:|---:|
| `readPrivateScoutResult` | 3 HTTP 200 | 2 |
| `readMyScoutDiscoveryNote` | 3 HTTP 200 | 2 |

The distinct rendered second report/note fingerprints are
`72748104cf04a8ef8f6150b9d613ccabde598d54436232b9f5befa053dede528` and
`58b0be4ccb50c1aa7ab7be651385f1775f3b660682a1fc85a61d3fdc9367b5f4`.
The original first pair fingerprints remained
`85249b8c9520a29fd2cd4ec0b3c0282ca39bca3eaf737472a3057853933d6fdf` and
`c8030315fde231eb1c90293ada8d8f4ad246a53f4cae7709c75149685f044cf1`.
Full request/result/note/target/session/actor/cycle correlation was checked in
memory; private contents and raw opaque IDs were not persisted. Both ordinary
Scout acknowledgements retain pending-only semantics. Credit comes from the
correlated private readers and actual UI proof, rather than the acknowledgements.
N11's failed child, completion flags and historical evidence stay unchanged.

Acquisition was **21:36:08.586 UTC**, readiness **11,395 ms** later and physical
return **21:39:17.547 UTC**, a debit of **188,961 ms (3m 08.961s)** within the
original **22:02:08.586 UTC** hard deadline. Three independent authenticated
Chrome processes/contexts represented GM, Admiral and Wing; eight roles were
configured, two players admitted and zero human players involved. The 260
transport rows are not 260 game actions. No gameplay retry or new recovery ran.

The first strict physical binding check reported address-in-use after owned
service exits; its receipt is preserved and no claim was released then. The
unchanged second check passed: all captured owned processes/groups absent,
22 IPv4/IPv6 bindings free, browsers/Auth/session data cleaned, own
reservations/configuration/claims zero and foreign ownership/source/build
preserved. This cleanup boundary observation is separate from product gameplay;
its exclusive socket-lifetime cause is unestablished. The final strict check and
foreign-ownership requirements remain mandatory.

| Receipt under `second-report-selector-fixed-20261014/` | SHA-256 |
|---|---|
| `SECOND_REPORT_SELECTOR_FIXED_COMPLETED_CLEAN_PARENT_HANDOFF_20261014.json` | `2e25aded8b77f95b2751f7ba22c181470b5fc4078b1a0943e9c41ccee42a6552` |
| `MANUAL_ZETA_SECOND_SCOUT_NATIVE_PHYSICAL_HANDBACK_20261014.json` | `f7732e0b81b1cf20bbd66a538ea99c1fde22ecf48a852765293fd2dddc4d12ac` |

This earns only distinct second-Scout delivery and preserved first index/
fingerprint scope. Positive fighter mechanics, missions/rebuilds, complete
fresh-game/every-role/function ending, broader privacy/recovery/manual-free
usability, final rendered visuals/typography and exact candidate/main CI/
deployment remain open. P181/P629 remain partial; P641/P642/P651 remain open.
Counts stay 703/751 overall, 245/293 campaign, 14 partial/34 missing and zero new
fixed closures/releases. The next Wing objective is selected from those distinct
remaining mechanics using the qualified manual route; runtime is returned and a
new allocation is required. The separately reviewed backend diagnostic remains
off the gameplay critical path.

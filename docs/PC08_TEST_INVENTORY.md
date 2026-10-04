# PC08 test inventory

Root records reasons for every added or changed test before closeout. No test
is skipped or deleted to pass. Separate test-only commits precede behavior.
Rows retain chronological boundaries; later completed evidence supersedes earlier
pending results without deleting failure provenance.

| Commit / suite | Reason | Evidence |
|---|---|---|
| 37f059e8: PC08ReviewScene, five new cases | Accessible five-step return navigation, actual local weapon and boarding interactions, retained reconnect result, and isolation from signed-in store identity. | owner/review-scene-red.log: scene module absent before implementation; owner/review-scene-first-green.log: 5/5 pass after scene implementation. |
| 63e007eb: new scene test accessible names | Correct the new test's guessed boarding labels to the established presenter labels, without changing an existing product control. | Test-only correction before scene code; same five assertions retained. |
| f86c8660: deployment-targets.pc08, one new case | Standalone PC08 HTML must select Hosting rather than remain an unknown deployment path. | owner/review-hosting-selector-red.log then owner/review-hosting-selector-green.log. |
| a1cc631e: exact PC08 runtime consumer audit | Every changed runtime source must match its before/after digest, deploy all connected consumers exactly once, and reject source drift without a broad Functions fallback. | owner/deployment-consumer-red.log: the PC08 audit is absent; implementation waits for the reconciled runtime source. |
| 62fa0ccd: PC08 rendered scene interaction and geometry | Exercise all five real-component steps at 320×844, 390×844, 844×390 and 1440×900 in normal and reduced motion, including touch targets, computed fonts, Zoom, keyboard return, retained results and no live writes. | owner/initial-scene-render.log and initial-scene-render/summary.json: eight cases pass; final full-choice scene inspection remains pending worker presenters. |
| 7882cc38: published PC07 deployment fixtures | Retain the historical PC07 transition against its verified published core source, rather than accidentally making its assertions test later checkpoint sources. All exact consumers, source-drift denials and no-broad-fallback assertions remain. | All 21 source digests verified against d8f56eee; owner/pc07-historical-consumer-fixture.log: 5/5 pass. |
| b80bc6d7: member Maliades privacy, parser and repair | Prove the existing target/dice leak, fail closed on malformed member DTOs, retain GM details and foreign-group exclusion, and preserve the entitled repair action from operational state. | owner/maliades-privacy-red.log: six discriminating failures; owner/maliades-privacy-green.log: 48/48 focused tests pass. |
| f39e5680: real member-session hydration | Preserve the operational revision/damage/use markers through the actual session parser and repeated audience filter; reject extra private fields. | owner/maliades-member-hydration.log: focused new case passes; final validation runs the complete suite. |
| 4b051fb5: Union starting-host handler | Close the eight-player normal setup gap without seeding admin state: genuine paired host choice, current GM authority, exact replay, setup CAS, legal roster/manifest and no unrelated state repair. | owner/union-setup-red.log: absent handler; owner/union-setup-green.log: 5/5 pass; Functions build passes. |
| 47046997 / 833d495c: Union setup client and presenter | Require explicit legal choices and current server-backed GM setup, bind request identity, reject foreign/delayed receipts, and never patch live docking optimistically. Fixture correction uses the existing GM instance schema. | owner/union-setup-ui-red.log: absent modules; owner/union-setup-ui-green.log: 5/5 pass; owner/union-setup-typecheck.log passes. |
| c99de5c1 / bd995ae9: full prepared boarding choices | Exercise all five actual choice presenters, and discriminate actual pass/stay/ruling retention from a fabricated preset outcome. | owner/boarding-full-scene-red.log and boarding-scene-retained-choice-red.log precede e72c8469; seven scene cases pass. |
| edc71d1c: responsive full boarding interaction | Preserve the original geometry assertions and add Commander, support, Militia, independent reroll and exact ruling interactions in all eight viewport/motion cases. | owner/boarding-scene-render.log: eight cases pass; this is prepared presentation evidence. |
| 9ce31e18: native selector and printed Union preset | Retain exact consumer/drift/duplicate denials, include the existing required Hosting artifact in expected output, exercise the actual Git source reader for new files, and use the legal eight-player Union roster. | owner/consumer-audit/native-new-module-red.log exposes missing-baseline handling before 6e52135d; owner-stage-consumers-green.log: all seven PC07/PC08 selector cases pass. The map still requires final group reconciliation. |
| eaa3f125: real fighter presenters in the tour | Require independent Alpha/Bravo launches and at most one Medium action for each committed fighter. | owner/fighter-full-scene-red.log precedes c9dc5cee; owner/fighter-full-scene-green.log: 11/11 presenter/scene tests pass. |
| bdfcb7c4: prepared Short loss readiness | Prevent the prepared loss button from illustrating a loss for an unlaunched wing or the wrong range. | owner/fighter-loss-readiness-red.log precedes ae3f2ca3; fighter-loss-readiness-green.log: all eight scene cases pass. |
| cf339f7d / f8e7434e: actual fighter render interactions | Add four Medium actions and independent launches to the preserved eight-case render matrix, retaining the Short launch prerequisite. | owner/fighter-scene-render.log passes before the further readiness assertion; final all-choice render remains pending the optional Short selection and contact DTO. |
| 9bbb5d98: prepared Short subset and pass | Retain the actual selected fighter indexes rather than imply that every surviving fighter rolls, and preserve a separate zero-fighter pass. | owner/fighter-short-subset-red.log: one discriminating failure at the missing checkbox; eight existing cases pass. The selected-subset presenter and owner adapter now pass with the further launch checks. |
| 9fc213b7: independent prepared Chepu support | A Chepu stay must retain its own committed outcome without disabling Pallas or offering the same Chepu choice again. | owner/boarding-chepu-retention-red.log proves missing retention; boarding-chepu-retention-green.log passes the focused case after the adapter repair. The complete scene suite now includes the selected Short subset. |

External evidence root: `/Users/emeraldpham/Documents/PC08-evidence/`.
Worker reasons and focused results are incorporated below. Final rendered and
full native/Rules release results remain pending until performed.

## Reconciled test-first history

The owner separated three worker fixture corrections from their implementation
commits before any push. Original worker commits and logs remain preserved;
the accepted owner history places each correction first. Both history receipts
verify an identical final source tree, so this correction changes provenance,
not behavior or evidence outcomes. Full final validation remains required.

| Owner test commit → implementation | Reason for the existing test change |
|---|---|
| 521ea519 → 09a80765, original boarding presenter 4a8792b6 | Select the exact accessible ruling textbox instead of an ambiguous label query; retain the same required-text and exact callback assertions. |
| e208ea9e → f3ed9bfe, original range primitive d8f8242e | Supply explicit empty target-shift receipts in existing fixtures and match the duplicate-fighter error wording; retain the once-only rejection and existing consequence assertions. |
| e94bf6dd → 4b9a6532, original snapshot resolver f4dca5ed | Supply the new immutable pre-range target snapshot in range fixtures and assertions, before the resolver implementation. |

External mappings: `owner/receipt-fixture-history.json` and
`owner/presenter-range-fixture-history.json`. Later test/source commits remain
separate; no case is skipped, deleted or weakened to satisfy this history check.


## Later owner integration checks

| Commit / suite | Reason | Evidence |
|---|---|---|
| 7be66601 / a956152b: visible parent return | Activate the real return control on phone and desktop. The first attempt reached the expected URL but its guessed landing assertion missed the normal motion-safety gate; the test now makes that visible choice before checking the parent. | parent-navigation-diagnostics and parent-navigation-green; no navigation defect was hidden. |
| b91d4db6 / 08556b66: independent launch samples | Retain each actual Alpha/Bravo/PDF/Maliades launch or pass, require launch before a loss sample, preserve selected Short indexes and zero-fighter pass, and show Maliades destruction only at three damage. | fighter-launch-choice-red: two failures with nine existing cases green; fighter-launch-choice-green: 23/23 focused checks. |
| bcbccbad / e4c8fac3 / 54ccb017 / a93a3e43: worker DRADIS contracts | Require current host-folded shuttles and nonzero fighter wings, sampled transit, stale reconnect rejection and safe audiences before projection changes. | Worker red logs; owner/dradis-integration-green: 133/133 focused checks. |
| 9d4e137c → 9a7fe8d9: DRADIS fixture split | The no-craft host keeps the established absent optional tag field, and the navigation action fixture supplies its required current partition revision. Original worker source 1156157b is preserved; the owner separated its two fixture edits before the identical source patch. | Explicit original-to-owner provenance; no case skipped or deleted. |
| 2266fa40 / 97d3905f / b2671d2e: composed contact samples | Feed actual dock, transit and Wing DTOs into the plot adapter; move a parked sample to its real host and include rejoined Maliades. Correct the new test's guessed accent to the existing craft name and assert an empty origin craft list on cache rather than assuming the known viewer marker disappears. | dradis-scene-red before 2d50e577; dradis-scene-final-green. |
| bbf401b0 → 2d685723: complete painted dock tags | The old matrix missed clipped phone glyphs. The new browser assertion measures actual docked-text bounds in compact and expanded plots. Origin rows wrap, and host rows inherit the existing label engine's width constraint. | docked-glyph-red reproduces clipped Alpha/Bravo; first repair exposed PDF child nowrap; docked-glyph-second-green passes all eight cases. |
| fe355cfb → 54e22fa3: actual Maliades range samples | Retain the chosen Medium shift and separate attack, distinct Short choices or explicit pass, and the committed range boundary through the real presenter. | maliades-choice-scene-red precedes source; maliades-choice-scene-green: 16/16 scene/presenter checks. |
| 437c46eb / 7cfae1fe / 8e525105: normal player return | Join an ordinary authenticated player through UI, make isolated prepared choices, and verify unchanged identity, session and assigned role after return at phone and desktop. Correct the fixture to the actual assignedRoleId field and the app's automatic connected-session restoration; preserve the failed assumed intermediate-link attempt. | authenticated-tour-recovery-first-attempt; final authenticated result remains pending. |
| 7cfae1fe: keyboard and composed browser interaction | Activate Skip with Enter, activate the parent link by keyboard on phone, and render real PDF/Maliades range choices while preserving existing geometry, fonts, touch and no-write assertions. | full-choice-current-render passes parent return and all eight viewport/motion cases; final reconciled render remains required. |
| Normal authenticated return polling correction | The installed Playwright async wait predicate resolves its Promise before testing the awaited value. A minimal `async () => false` reproduction resolves false in 21 ms. Poll awaited browser snapshots instead and require the same UID, member, session and role plus live server freshness. | async-wait-predicate-diagnostic.json and all three prior failed attempts are retained. authenticated-tour-recovery/result.json now passes phone and desktop, showing cache-to-server recovery without Auth storage injection or prepared-choice writes. |
| 38f70ff4 → 0544e8b0, Enriched Warheads native | Require five-ore cost once, exact retry, current role/berth, stale/insufficient denial, attack-start phase, offline pending and strict marker identity. | warhead native red and focused green logs; root also retains the first recovery repair failure. |
| 1acf0d65 / 1df00355 → d646766e, enriched client | Require exact safe view/receipt, fresh EO authority and late-reply rejection; adapt the new callable mock to the repository's required streaming interface. | warhead client red then six focused green cases. |
| 111595c0 → 04894a0f, targeting recovery | A current entitled EO's pending purchase/pass survives reasoned GM targeting recovery, including an owner away from the console. | Recovery red, first-helper failure and second-green 92/92 are retained. |
| a5facc62 → 0475d22c / 42058921, GM enriched summary | Expose bounded pending/paid/pass actor status privately while preserving strict Firestore audience parsing. | GM-status red, first implementation ReferenceError and repaired 236/236 focused checks. |
| fa9a7d7b / 338e0ade → 6db57ffe, ruling route and prepared risk | Mount the genuine current-GM ruling control and make Militia team commitment distinct from optional front-line or outnumbered risk. | GM mount and tour reds; tour/authority 38/38 green. |
| 866843c6 / fd141b61, boarding and Short integration | Keep every selected locked slot, including zero-hit slots, in canonical receipts; supply fresh GM fixture authority and cap later-window UI at three total attacks. | boarding-short-integration initial failures and second-green 189/189. |
| 715194e1 → 0eaa172e, escort passes | Require a durable zero-dice PDF Medium pass and Maliades Medium/Short passes with no losses/self-damage or repeat resolution. | escort-explicit-pass-red, first parser regression and second-green; all 21 pure state cases pass. |
| d3ed77f0 → 488fe727 / 4f25484c, escort range batch | Combine per-source choices, shifts and fixed targets without early entropy; apply the same locked rolls to PDF losses and Maliades durability; preserve unavailable versus disconnected owners. | escort-range-bundle red then 26/26 pure checks with state suites. |
| 5805dcd1 / 49cd8a57 → 1876653f, escort native authority | Scope the new API to current role/berth/custody, opaque contacts and exact attack replay; bind the assertion to the canonical combat roster instead of a nonexistent targeting field. | escort-actor-callable red, fixture failure and second-green 57/57 with bundle checks. |
| 8c9c7b46 → 8ac0f531, escort client | Reject extra private fields, invalid contacts, foreign attack receipts and delayed identity changes; send an explicit zero-action pass. | escort-service red, first wording mismatch and second-green. |
| 9cf58c8a / 350a87e8 → 228263bd, mounted flight choices | Discriminate actual connected render/subscription from pure presenters. Fresh inline callbacks previously reset the subscription on every render; stable callbacks keep the server response mounted and withdraw it on disconnect/custody change. | escort-connected-panel and connected-flight-warhead-subscription reds; 27/27 client checks and TypeScript pass. |
| f8a89309 / 73a56989 → 858f4606, multi-target boarding | A source reroll against one attacked ship must not be treated as malformed while iterating another target. Preserve the real alert-audience query before atomic finalization. | Worker native red and focused 65/65 green; original ordinary-auth stalled run preserved before successful finalization traversal. |
| 2ef86b67, current composed tour | Retain all prior geometry, fonts, touch, return and no-write checks; exercise once-only enriched balance, PDF Medium/Short passes, mutually valid Militia contexts and consumed surviving-Wing sample. | all-current-choice-render passes eight cases before the added carryover browser assertion; final all-current-choice-return-render records the complete current matrix. |
| eb07ddcb → b5bcddaf, fixed Short source priority | Prevent an immutable pre-roll Transport choice from making the aggregate Wing-priority batch impossible to finish; retain optional post-lock contacts. | short-fixed-source-priority-red precedes the shared selector; green: 59/59 range/bundle checks. |
| ebc2026e → 30757361, complete private source receipts | Reject otherwise attack-bound enriched markers with wrong actor role, empty UID or extra fields; reject fingerprint-matching escort result corruption without new entropy/writes. | attack-source-receipt-red: eight discriminating failures with 53 existing cases green; attack-source-receipt-green: 61/61. |
| 7ff2d8d9 → 42d08a7e, connected one-lock source resolution | Fixed Medium source targets resolve in the same pass receipt, and combined PDF/Maliades actions consume exactly one locked source batch. Original worker cab24b34/90cfa695 remain preserved. | all-flight-range-bridge-green: 121/121 Range, Escort bundle and Declaration checks; reconciled Functions build passes. |
| 6df01477, full authenticated shuttle scripts | Preserve all 15 standard routes and separately test normal eight-player Union setup/travel/transfer/parking/retry/reconnect. The twenty-player run's terminal obsolete Union status assertion remains a failure; the independent Union run succeeds. | dradis/emulator-proof-2026-10-03.json.failure.log and eight rendered screenshots; dradis/union-emulator-proof-2026-10-03.json. |
| 841f8f2c, composed ordinary source traversal | Use a normal twenty-player roster and actual phone Enriched Warheads panel, then independent launches, all source choices, same-lock assignment, genuine boarding and movement/Press/clock reopening. | Runtime traversal remains pending the final support-source API; only syntax is verified at this boundary. |
| 7ba4b5ca, escort stored target-number consistency | Reject PDF and Maliades shift markers whose stored target number contradicts the current roster target, while preserving a valid same-target marker. | escort-target-number-red: two discriminating failures with six existing checks green; escort-target-number-green: 123/123 Escort, Range and Declaration checks. |
| 2ab9ff0b, retained craft at the next Team boundary | Reproduce ordinary post-combat destruction blocking the next cycle, preserve retained custody without redocking, and reject missing, duplicated, stale, foreign-owner/holder, live/unknown-host or malformed retention. | retained-team-boundary-red: two discriminating failures with 114 checks green; retained-team-boundary-green: 280/280 Maintenance, Composition, Jump and Craft Ownership checks. |
| 8ae4ef90, normal Refinery launch maintenance | Accept the legitimate paired unrest metadata, reject malformed or unknown metadata, and treat absent, empty, stale or unfinished valid cycles as an unavailable uncharged launch rather than a targeting error. Fresh launch remains denied in every unavailable case. | refinery-maintenance-metadata-red: six discriminating failures with 94 checks green; refinery-maintenance-metadata-green: 163/163 Bay, Declaration and Range checks. |
| 05d88ca1, Refinery environmental begin result | A completed cycle at an environmental hazard may retain canonical result step 0. Use the shared maintenance-result allowlist without accepting unknown result keys. | refinery-environment-result-red: one discriminating failure with 38 checks green; refinery-environment-result-green: 297/297 Bay, Maintenance and Declaration checks. |
| cbc3779e, original four-target boarding pattern | Replay the original nine/two/two/six defence commitments, relocation and independent rerolls through finalization, without inventing a missing Commander ruling or drawing new dice on retry. | boarding-exact-pattern-range-integration: 63/63 Range checks. Earlier Declaration/Boarding output is separate and does not contain this regression. |
| 3662d689 / 29f9a63b, actual live UI module identity | Read the module URL loaded by the browser, including Vite's current query revision, so verification observes the same store as the real app. Keep ordinary Auth unchanged and require healthy presence. | authenticated-tour-recovery-current-module/result.json passes phone and desktop with the same signed-in player, role and session. The complete freshly restarted b49d3434 DRADIS run passes all nineteen checks, fifteen standard and both Union craft, eight viewport/motion cases and the full same-object 1.12-second sweep with zero presence/browser failures; owner/authenticated-dradis-complete/result.json and runtime attestation. |
| 814934b5 / 1ee89e77 → b07ff6db, retained-craft declaration | Accept the authentic post-combat retained source without redocking or registering combat; reject duplicate/missing parking sources, stale custody and destroyed hosts. Preserve unavailable launch behavior for actually destroyed AEGIS and Refinery. | Sol's four discriminating failures with 101 existing checks green are preserved; owner/retained-declaration-integration-green: 223/223 Parking, Maintenance and Declaration checks. |
| 9bc52d3b, normal destroyed-host survivor consumer | Require the ordinary next cycle and declaration after Shepherd destruction, unchanged retained Endeavour/Black Sheep custody, nine surviving Wings consumed once, dead Wings excluded and earlier immutable receipts preserved. | boarding/sol-repro-243a0678.json, current-runtime attestation, predicate inputs and cleanup result; this run uses the complete current repair rather than the earlier stale emulator module. |
| d67d8701 / 4d2e2add / 2b50dddb / 23b09691 → 5c7643ec, actual support and Short coverage tour | Retain independent Highwall/Gorgoneion/Boa choices, show a once-only prepared Scrap cost and use safe per-hit damage to enforce Short Wing coverage before another ship. Extend the same eight-case geometry/font/touch/no-write browser matrix. Measure pending controls before consumption and use the actual one-damage Wing capacity. | owner/support-scene-red: two discriminating failures with 17 existing scene cases green; owner/support-scene-integration-green: all 19 scene cases pass within 277 focused client/presenter checks. Final eight-case rendering remains separate. |
| 627c2921 / 1641e833 / 0d165a20 / 9cc208c3 / 97afaaee / d4ab56a0 / 452f69b8, connected support and safe Short fixtures | Add meaningful native current-role/charge/cost/target/replay checks, exact client DTO and stale-response rejection, mounted source controls and residual Wing coverage. Supply real Captain docking, complete Capybara/expanded targeting fixtures and source-defined per-hit labels before implementation. | Range continuation's focused suite passes 329 checks at 170aef7e; root's support-native-integration-green passes 156 native cases and support-scene-integration-green passes 277 client/presenter cases. |
| 47261fc4 / d618f08b / 970bcd35 / 67f40056 / a059def7 / 5e2ea2a5 / 1e7986cb / 03ddccc6 / d01f4f6e → ec95ecbd, complete support authority | Bind replay to current console, host/control revision and attack cycle; reject malformed saved receipts. Retain exact per-hit damage and public labels, and mark the existing connected Gorgoneion Missile Array and Force Field controls live. Existing fixture/assertion changes precede the source commit; no authority denial is weakened. | Source handback and retained worker red/green logs; root focused native/client green logs, support-copy-integration-green: 32 ship-template/metadata cases, and support-integration-lint passes. |
| fab9d4ea → debe5c4b, destroyed AEGIS after a cycle change | Reproduce a wrecked AEGIS with absent or prior-cycle maintenance. Both wings must read unavailable, deny a fresh launch and draw/write nothing. Healthy current-charge and malformed-damage checks remain. | destroyed-aegis-prior-cycle-red: two failures with 63 old cases green; destroyed-aegis-prior-cycle-green: 65/65. |
| 10ff7fcc → fb084331, ordinary Gorgoneion admission | Reproduce a normally admitted replacement Captain without fabricating a core setup role or optional-vessel ID. Require current charged actor read/commit/replay and denial after role removal; mount the actual client panel under the same ordinary core roster and withdraw it on role change. | ordinary-gorgoneion-admission-red: two failures with 85 cases green; ordinary-gorgoneion-admission-green: 87/87. The first complete composed run is retained as authenticated-composed-attempt9, including its four successful checks and admission failure. |
| a8cfe766 / 6c18038e → 2a3e568e, fixed-source EO assignment | Complete the current support DTO through the actual assignment handler. Boa's precommitted target must not become an editable EO slot; its locked die, automatic assignment and paid cost remain present in the private final receipt. All editable zero-hit slots remain. Compare canonical receipt fields because the final receipt intentionally omits the lock-only damagePerHit field. | ordinary-fixed-support-assignment-red: one failure with 73 existing cases green; the first repair's serialization assertion failure is preserved, then ordinary-fixed-support-assignment-second-green passes 157/157. Authenticated attempt10 retains its failed ordinary Long assignment. |

## Changed-suite coverage

| Review repair test commit → source | Reason and evidence |
|---|---|
| `0889ef1f` / `0bfdb9bf` / `15edf16e` → `70db7e59` | Reproduce duplicated support rows, reject current-session/current-attack cycle and attack-identity drift in four receipt paths, bind fighter replay to its committed actor/request/range/revision, and reject fresh or saved PDF/Maliades launch passes after current group/member/berth removal. Retain valid after-resolution exact retries and no-write/no-new-dice assertions. Thirty failures with 160 controls, then five binding failures are preserved in `owner/range-review-red.log` and `range-review-binding-red.log`; all 195 cases pass in `range-review-green.log`. The separately corrected new Highwall assertion uses its printed three damage, with the first repair failure retained. |
| `4b96ba1b`, composed support outcome assertion | Observe the actual member subscription after an ordinary attack and require one result per source/contact/range and printed support labels. Native duplicate-row red evidence already precedes the product repair. The fresh reconciled run remains required. |
| Worker `ca4eeb09` → `950aee0c`, integrated as `e4f1e7ac` → `35059cba` | Reproduce all R1–R4: current boarding authority before receipt replay; entitled off-console EO remaining pending; Commander-adjusted 20/21/22-party Militia boundaries; and authoritative printed character death. Preserve legitimate finalized replay, revoked role/berth/custody/GM-lease denials, unavailable versus disconnected holders, Pallas committed choices and no repeat death/dice/writes. The discriminating red has 39 failures and 15 controls; all 317 checks across ten final worker suites pass. Build, scoped lint, typecheck and existing death-state hydration pass. `boarding/review-r1-r4-950aee0c-handback.md` retains exact logs and rationale. |
| `4db5a2a1` / `9eeca2c5` / `258af5df` / `2943ee4d` → `f6cafa44` / `b8e84fd9`, Militia character changes | A committed risk must survive removal or replacement of its character both before and after dice lock, without revoking another character or changing its eligibility. Two initial failures and then four timing failures precede repairs. Wrong attack/cycle/role/request metadata still blocks finalization without new dice or mechanical/character writes. The first repair is incomplete and its two failures remain; the added negative tests' overbroad whole-document comparison is corrected separately to permit legitimate audience withdrawal while preserving all mechanical denials. Final reconciled three-suite result: 257/257 in `owner/reconciled-review-native-257-final-green.log`; build and scoped lint pass. |
| `c234e214` → `552017d0`, PDF Short member rows | The independent follow-up catches the same generic-publisher duplication for editable PDF Short hits. Require one printed stored/projected result for the actual single locked die/assignment, retain fixed Medium and Alpha/Bravo controls, and preserve no-write/no-new-dice exact retry. `owner/pdf-short-public-result-red.log` has one discriminating failure and 257 controls; `pdf-short-public-result-green.log` passes all 258 reconciled tests. Build and scoped lint also pass. The composed proof additionally matches published PDF Short hit counts to actual committed assignment counts and rejects escort AEGIS labels. |

The harmless `ef0421c9` const/interface/draft-copy lint cleanup has no new
behavior or weakened assertion; all eight affected presenter checks and lint
pass in `owner/range-review-ui-green.log` and `range-review-lint-green.log`.

The first fresh repaired-source composed run at `3ab3a6cb` completes setup,
all three ranges and five actual boarding decisions, then its random twelve
parties on Capybara hit the existing undefined damage-deck exhaustion blocker.
The failed result, private state and logs remain preserved; no authority failure
or browser error is reported. The subsequent proof proposes full damage capacity
20 with fourteen Wings and three Transports and draft GM target annotations,
recording every input. The later failed attempt disproves the assumption that
those annotations control live targeting. It adds actual Commander/relocation/defence
traversal assertions. No dice, damage, printed limit or production behavior is
changed; no failed assertion is removed. Its final result remains pending.
The added canonical-roster assertion initially runs too early at declaration,
before targeting materializes that roster. Its `1630c411` failure and exact
private preparation remain preserved; the same assertion moves to the existing
Long Range boundary after all genuine targeting/launch decisions.
The `a9a2658b` attempt proves that assumption is still wrong: the canonical
range roster is derived from the actual server targeting receipt, and the live
calculation does not consume the preparation's draft target annotations. Both
failed attempts and their private preparations/targeting receipts remain saved.
The corrected proof submits an empty annotation list and compares the first
committed Long Range target snapshot to the actual immutable server targeting
receipt. Full capacity 20 and genuine boarding assertions remain; target and
combat dice are never seeded or overridden. The earlier proposed annotation
control is not claimed as tested or implemented behavior.

The `51f0629c` fresh attempt retains an ordinary warhead read rejected while
console hydration changes the snapshot cursor, before any purchase. Driver-only
`6c708aff` waits for current EO console authority and uses the existing visible
refresh if that read is rejected. It preserves all purchase/cost/retry and
gameplay assertions. The final normal twenty-player result now passes thirteen
checks, with genuine boarding, safe live member revision 41, unique support
rows and one PDF Short hit for one canonical assignment, exact final retry and
actual movement reopening. Browser and heartbeat errors are zero. Result,
fresh 39-artifact runtime attestation and owned-process cleanup are in
`owner/authenticated-composed-reconciled-final/`; the failed attempt remains in
the separate `-authority-hydration/` directory. This supersedes the earlier
pending repaired-source boundary without deleting its failures or weakening tests.

| Final reconciled checks | Reason and retained evidence |
|---|---|
| `c2568b55` → `a995eb37`, actual Maliades heading | The eight-case browser matrix now checks the nested real presenter's computed CIC font. Red fails on the prior Georgia fallback; green passes both browser checks and all eight cases. `owner/maliades-font-red.log` and `owner/maliades-font-green.log`; actual phone results and landscape fighter images were inspected. |
| `7ac0938f` → `1dd40471`, fixed catalog/display closure | Preserve PC06/PC07 historical counts while requiring all exact 49 PC08 IDs, no P605a credit, current 654/751 totals, the 0.5.67 allocation and the visible current/historical changelog. Three discriminating failures precede metadata. The initial metadata wording mismatch is preserved, then all 53 checks pass in `owner/pc08-progress-second-green.log`. |
| `28955aff` / `d00c258d` → `c719c232`, final audience repair | Actual range miss producer → atomic boarding finalization must admit only the exact three named zero-damage null-target variants. Native/client negatives reject private, foreign, malformed and boarding variants. Six red failures with 92 prior cases green; 138 focused cases pass. The normal harness observes real browser member subscription hydration, rather than only an HTTP document. `composed-repair/audience-red.log`, `focused-green.log` and `attempt1/result.json`. Root integrates these as `a37a828d`, `35d4fad7` and `de4d1c5e`. |
| `98f08cf7`, test/harness lint | Remove unused destructuring/helper/status bindings and make two existing await/cast lines unambiguous without changing assertions or runtime semantics. Preserve the first lint failure. Focused 98/98 and scoped lint pass; root integrates as `b00a6f72`. The authenticated proof remains bound to the unchanged `c719c232` runtime bytes. |

The earlier normal composed twenty-player proof passes ten checks, including
atomic finalization, member hydration, exact retry and actual movement after
reopening. Documentation, release counts, computed-font styling and harmless
harness lint preserve that proof. The later R1–R7 behavior repairs require a
fresh compiled/restarted composed run before follow-up independent review and
final validation; the old result does not stand in for those new source bytes.

The first complete validation at independently approved `c9cdba6e` passes diff
and lint, then stops at `test:all`. The existing validator omits captured child
output on a nonzero exit, so the failed gate alone is repeated with visible
output: 54 failures, 7,552 controls and six unhandled missing-mock errors across
nine files. Both attempts are preserved in `owner/final-validation-first-*`
and `owner/final-tests-diagnostic.log`; nothing has been pushed.
Root test-only `eed91a32` retains exact GM projection equality while including
the actual attack number and parking release condition; asserts the last
Maliades launch's automatic Long Range advance and immutable prior C&C redirect;
and follows the existing warhead/range/boarding/casting transaction guards in
the terminal classifier. No new broad terminal exemption or product guard is
introduced. The five-suite diagnostic retains three metadata/style failures
and 285 controls. `1c6a4ce6` corrects the stale printed Gorgoneion description
and resolver registration plus two panels' palette/corners to existing CIC
tokens. All seven owner suites pass 293/293; six conservative metadata-consumer
suites pass 134/134. Build and scoped lint pass. Tests are unchanged for these
three existing red assertions; their failures precede the product repair.
The renewed scene passes both parent controls and all eight viewport/motion
cases in `owner/final-cic-token-render/`, with phone and landscape captures
inspected. The final map has eighteen modules, 32 index consumers and 109
Functions. Missing metadata audit is preserved red before `09d05709`; seven
selectors then pass. All 39 attested gameplay artifacts and the previous
seventeen consumer rows remain byte-identical. The test-only UI handback `f818cd21`, integrated as `444db5d3`, preserves the
four-file baseline red and passes 226/226 focused tests plus scoped lint/diff.
It supplies the mounted panels' actual read/commit API payloads and a null
attack subscription when the fixture owns no attack; the prepared range query
uses its actual accessible region. The stale pre-resolver expectation is
replaced by a real Executive Officer range-panel integration that verifies the
exact authoritative choice arguments. Wing-card lookup is scoped to its actual
workspace. No production panel is mocked away, test skipped or behavior source
changed. Evidence is in `ui-final-fixtures/`; Root acknowledges and owns the
full reconciled validation, CI and release.

The rows below cover every changed native or component suite, including worker
fixtures. Detailed commit/red/green entries above retain the specific repairs;
the final validator supplies one complete reconciled result.

| Changed suites | Reason |
|---|---|
| fighterWingCombat, maliadesState, pdfEscortWingState, refineryFighterBay, wolfCombatMath | Printed independent capacities, damage, charges, costs, range actions, selected losses and shared locked outcomes; valid normal maintenance and rollout receipts. |
| wolfBoardingSupport, wolfBoardingProtocol, wolfBoardingCallable | Actual craft owner/host/fuel support, relocation, source rerolls, genuine player risk and conditional private ruling, printed automatic defence and damage. |
| wolfAttackDeclarationCallable, wolfAttackParking, wolfAttackLifecycle, wolfAttackWindowCallable, maintenanceCallable, craftOwnership | Three-window bounds, immutable source registration, destroyed-host retained custody, current-role manifests and once-only later-attack surviving-Wing consumption. Printed support metadata replaces guessed fixture capabilities; no redocking is introduced. |
| wolfAttackRangeCallable, wolfEscortRange, consoleMetadata | Connected source authority and shared lock/assignment, exact retries, explicit passes and safe current DTOs; live Missile Array/Force Field metadata. |
| memberMaliadesPrivacy, scoutTaxiCommunicationCallable, tests/rules/firestore.rules.test.ts | Remove member target/dice leaks, retain current repair revision and real membership/berth fixtures, and deny privileged direct attack/support/dice/ruling/carryover writes. |
| AegisEnrichedWarheadPanel, AegisFighterWingLaunchPanel, DioneMaliadesLaunch, DioneMaliadesRangeActions, PdfEscortWingReference, MaliadesPanel | Mounted independent launch/use/pass/subset choices, durable committed state and stable asynchronous subscriptions. |
| WolfAttackChoiceAuthority, WolfRangeActionPanel, WolfRangeSupportActionPanel, WolfFighterRangeActionPanel, WolfEscortRangeActionPanel | Current role/berth/cache/disconnect withdrawal, exact source actions, safe Short coverage and current actor controls; ordinary optional-ship admission. |
| WolfBoardingChoicePanels, WolfBoardingDefencePanel, GmWolfDecisionSummary, routes/GmConsole | Mount every real choice, preserve unavailable-stage distinctions, bounded private facilitator state and the genuine ruling route. |
| ContactPlot, FleetGroupWorkspace, localDradisContacts, lib/firestore, fleetGroupService, useFleetGroupNavigation | Current sampled group-local craft, docked/parked host folding, transit/retarget/rejoin, stale projection withdrawal and truthful paint/sweep boundaries. |
| shuttles, vesselTemplates, extraShipCaptainWorkspaces | Source-defined support/range capabilities and accurate connected player-facing craft controls. |
| UnionCraftStartingHostPanel, unionCraftSetupService, unionCraftSetupCallable | Normal eight-player explicit setup, legal paired hosts, current GM/CAS and retry, without optimistic docking fabrication. |
| lib/sessionService, aegisEnrichedWarheadsService, maliadesOperationalView, wolfEscortRangeService, wolfAttackAudience and firestore.wolfAttackAudience | Exact safe transport schemas, canonical receipt identity, malformed/private-field denials and late-response rejection; preserve permitted hydration/repair fields and truthful zero-damage support misses. |
| config/implementationProgress and AppHeader | Exact fixed PC08 closure, current 654/751 projection, historical release totals and readable player-facing changelog. |
| PC08ReviewScene, deployment-targets.pc07.test.mjs, deployment-targets.pc08.test.mjs | Five-step isolated real-presenter review, actual parent navigation, historical PC07 fixtures and exact current runtime consumers, source drift/duplicate/broad-fallback denials. |

The final history audit also finds original mixed commits `7d06a1d0` (printed
craft fixture capabilities), `aba97e13` (legacy range fixture snapshots) and
`93c5adbe` (unopened boarding fixture and DTO types). Before final review, the
owner separates their tests ahead of source while preserving the exact final
tree and original refs. This is complete: `2f1c0283` → `808683de`,
`4f8640d5` → `cd2b5c04` and `78724896` → `4594f079` are the respective
test/source pairs. `owner/test-first-history-reconciliation.json` records
every old-to-new SHA; original evidence SHAs above remain provenance, not a
claim that the tree-changing work was repeated.

The reconciled gate at independently approved `07ac3637` passes all 7,606
unit/Functions tests and 157 security Rules tests, then stops at a TypeScript
error in the new Ship Console fixture. The unchanged web build requires a
`WolfRangeActionChoiceResult`, rather than undefined. Test-only `4f56ea87`
returns that receipt using the requested turn/range and incremented revision,
with explicit use/pass status. It preserves the real mounted panel and exact
command argument assertion, introduces no type suppression and changes no
production source. All 115 Ship Console tests and scoped lint pass; the actual
complete web build also passes. See `owner/final-ui-typed-fixture-green.log`,
`final-ui-typed-fixture-lint.log` and `final-ui-typed-build-green.log`.
The failed full attempt remains `owner/final-validation-second-failure*`;
renew exact approval and the full gate for this test-only candidate.

The third full run at independently approved `e080a6cb` passes all 7,606
unit/Functions and 157 Rules checks, web/Functions builds, roadmap, font,
typography and the complete ticker matrix/native lifecycle gate. Its existing
P637 budget provides a discriminating red: landing 1,905,884 bytes exceeds
1,850,458. `owner/final-validation-third-failure*` and
`owner/final-performance-budget-red-e080a6cb/` preserve the failed result.
No budget, benchmark, gate or assertion is weakened.

Source `361c4a51` defers GM loading and removes its forced manual chunk;
the intermediate lazy-only over-budget measurement is separately retained.
Existing 241 App/GM tests and six graph controls pass. The final build is
1,746,935 raw / 467,798 gzip landing bytes, largest chunk 497,246 bytes.
Complete P637 passes at 33.4 ms DRADIS p95 and zero long mobile frames.
See `owner/lazy-gm-route-controls.log`, `lazy-gm-graph-controls.log`,
`lazy-gm-automatic-chunk-build.log`, `lazy-gm-performance-green.log` and
the preserved complete `lazy-gm-render-performance-green/` output.

New bounded runtime checks use ordinary local UI authentication and actual
navigation. GM entry/reload preserves UID/session/instance, requests the GM
module only after explicit navigation and has no page errors; its lobby
cache state is not evidence of live GM server gameplay. The normal
eighteen-player tour-return driver preserves EO identity/session/assignment
and recovers fresh server state on phone/desktop with no prepared writes.
Both have the actual live-runtime 44-artifact attestation; all 39 older
composed artifacts remain hash-identical. Three driver mismatch failures
remain separate from the passing GM result. The failed performance gate and
material App/Vite repair justify renewed exact approval and full validation.

Actual approved `d84c950c` passes all eleven local gates and candidate CI
`37183793104`; the full results and artifacts retain that source SHA. The
first exact-main path then provides a separate discriminating red: standalone
render build cannot resolve firebase-admin/functions type declarations because
its job omits the locked Functions install used by normal verification.
`owner/main-deploy-first-failure.json/.log` preserve this failure; the obsolete
run is canceled after its failed job, before deployment. Workflow-only
`c190cd29` adds that install before build and both cache lockfiles. Existing
release-gate controls pass 8/8 and YAML parsing passes. No new implementation
mirror test, assertion weakening, type suppression or benchmark change is
introduced. All 44 loading and 39 composed artifacts remain unchanged.
The current risk profile selects diff, lint, all tests and both builds for the
CI-only repair, with independent exact approval; prior browser evidence stays
at `d84c950c`, and the mandatory exact-main browser gates will run again.

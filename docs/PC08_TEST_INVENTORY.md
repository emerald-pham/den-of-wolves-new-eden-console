# PC08 test inventory

Root records reasons for every added or changed test before closeout. No test
is skipped or deleted to pass. Separate test-only commits precede behavior.

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
Worker test inventories and final rendered/native/rules results remain pending.

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

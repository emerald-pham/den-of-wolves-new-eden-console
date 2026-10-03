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

External evidence root: `/Users/emeraldpham/Documents/PC08-evidence/`.
Worker test inventories and final rendered/native/rules results remain pending.

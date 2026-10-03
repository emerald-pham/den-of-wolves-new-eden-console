# PC08 test inventory

Root records reasons for every added or changed test before closeout. No test
is skipped or deleted to pass. Separate test-only commits precede behavior.

| Commit / suite | Reason | Evidence |
|---|---|---|
| 37f059e8: PC08ReviewScene, five new cases | Accessible five-step return navigation, actual local weapon and boarding interactions, retained reconnect result, and isolation from signed-in store identity. | owner/review-scene-red.log: scene module absent before implementation; owner/review-scene-first-green.log: 5/5 pass after scene implementation. |
| 63e007eb: new scene test accessible names | Correct the new test's guessed boarding labels to the established presenter labels, without changing an existing product control. | Test-only correction before scene code; same five assertions retained. |
| f86c8660: deployment-targets.pc08, one new case | Standalone PC08 HTML must select Hosting rather than remain an unknown deployment path. | owner/review-hosting-selector-red.log then owner/review-hosting-selector-green.log. |

External evidence root: `/Users/emeraldpham/Documents/PC08-evidence/`.
Worker test inventories and final rendered/native/rules results remain pending.

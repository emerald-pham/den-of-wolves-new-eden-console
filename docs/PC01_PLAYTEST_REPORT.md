# PC01 — Shepherd science station

## New source-backed assumptions

1. **PC01-A1 — receiving ship.** The scanned coordinate belongs to the ship
   where Endeavour was validly parked when its request was made. The requester
   keeps the private result and note in their current valid group, including
   after a same-ship fleet split; moving the shuttle before reveal does not
   redirect map knowledge. Source: A4 card pack v1.1, general shuttle rules and
   R.S.S. Endeavour sheet; Player's Guide v1.1, Scouting section. Full decision:
   [assumptions log](PRODUCT_MILESTONE_ASSUMPTIONS.md#pc01-a1--receiving-ship-for-a-shuttles-scanned-coordinate).
2. **PC01-A2 — Deep Nebula progress.** Each committed Deep Nebula result adds one
   hidden server marker. The Scientist sees a qualitative hint, never the
   accumulated numeric modifier. Source: Away Mission booklet v1.1, O — Deep
   Nebula; Facilitator's Guide v1.1, pp. 13–15 and 19. Full decision:
   [assumptions log](PRODUCT_MILESTONE_ASSUMPTIONS.md#pc01-a2--hidden-deep-nebula-scouting-progress).

## Owner's one-sitting UI review

**Build:** 0.5.51. **Review scene:** [PC01 science review](https://dow-new-eden-console.web.app/pc01-review.html).
The scene uses the real presentation components with labeled prepared states.
Its clicks change only local synthetic state; they do not enter a live game or
write to Firebase. The owner checks presentation and usability, while agents
verify gameplay, permissions, and privacy separately.

1. **Research and navigation — yes/no.** Open the review link on your device.
   The default selector is `Scientist // Endeavour`. In `Team research`, find
   the track progress and next-price labels. Choose `Jump Drive` in `Research
   track` and click `Advance standard research`: one box fills and the next
   upgrade price changes from 14 to 13 materials. `Return to console landing`
   is in the footer.
2. **Team choice and Coordination purchase — yes/no.** Open `Coordination
   upgrades`. The refreshed target is `DIONE // Jump Drive // 13 materials`.
   Select it and click `Purchase sample upgrades`. In `Field-upgrade sample
   state`, choose `Unavailable // research price changed` to see the pricing
   explanation. Click `Refresh sample Scientist state` to see `Sample purchase
   state refreshed.`
3. **ECM feedback — yes/no.** Open `ECM Device`, click `Use ECM Device` for
   Ready → Working, `Complete sample ECM activation` for Successful and
   Shepherd pursuit 8 → 5, then `Mark sample ECM device spent` for Spent.
4. **Scout, facilitator, note, and two ship maps — yes/no.** Open `Scout
   report` for the pending request. Choose `Facilitator // GM` in the view
   selector. Its chart target is `System 8378 // O // Deep Nebula`; click
   `Reveal Endeavour scout at 8378`. Return to `Scientist // Endeavour` and
   open `Scout report` for `Deep Nebula`, `Discovery note saved for this
   station.`, and `The facilitator keeps the jump benefit private.` Open `My
   ship map` to see 8378. Switch to `Second ship // AEGIS`: its node says
   `Unknown system // coordinates unavailable` and does not show 8378.

## Agent-owned proof boundaries

| Boundary | Evidence |
|---|---|
| Focused and full local tests | Integrated candidate: focused scout and movement suite, 49 tests passed; full unit and Functions suite, 419 files and 5,628 tests passed. Typecheck, Functions build, bundle-size check, and lint passed; lint has six existing warnings and no errors. |
| Firestore rules and privacy | Firestore emulator suite: 4 files and 138 tests passed. Scout and ECM projections also have focused transaction and audience regressions. |
| Rendered phone, desktop, short landscape, and reduced motion | Integrated review page checked at 320×800 Scientist and second ship, 1280×900 GM, and 844×390 GM; no horizontal overflow. A separate 320×800 run confirmed the reduced-motion media rule applies, computed scrolling is automatic, and the page makes no Firebase requests. |
| Browser and render performance | Ticker smoke passed its normal and reduced-motion viewport matrix and lifecycle captures. The P637 render gate passed: landing entry graph 1,843,582 raw / 481,347 gzip bytes within unchanged limits; largest whole-build chunk 497,103 bytes; landing startup p95 101.46 ms and no long mobile frames. The separate review entry graph is 242,358 raw / 77,743 gzip bytes. Integrated local run: `/tmp/pc01-render-final-validated/results.json` (2026-09-27 23:10 UTC). |
| Independent callable and privacy review | Sol xhigh reviewed the integrated GM roster and move/jump repairs at commit `029abdf8` and found no remaining actionable findings. Release-gate measurement is being checked separately. |
| Production deployment | Pending release workflow and hosted build check. |
| Ordinary authorized facilitator and Scientist gameplay | Pending an authorized live session. Synthetic review and local tests do not establish this boundary. |

## Test changes

| Added test | Reason |
|---|---|
| `functions/src/endeavourEcmDeviceWriter.test.ts` | ECM authorization, one-shot effect, current pursuit projection, replay, malformed authority, and group integrity. |
| `functions/src/scoutMapIntegration.test.ts` | One transaction grants the request-time receiving ship a coordinate without granting another ship or losing navigation metadata; stale fleet-group pointers fail before publication. |
| `functions/src/scoutResolutionPlan.test.ts` | One exact chart fact, durable note and audit identity, hidden Nebula marker, and replay. |
| `functions/src/scoutResultCallable.test.ts` | Facilitator and requester audiences, private result and note reads, reconnect, retry, and same-ship fleet split. |
| `src/components/EndeavourEcmDevicePanel.test.tsx` and `EndeavourEcmDeviceView.test.tsx` | Production ready, working, success, spent, stale, and isolated review presentation. |
| `src/components/EndeavourResearchChoices.test.tsx` | The review scene and production research controls share the same presentational choices. |
| `src/components/EndeavourFieldUpgradeChoices.test.tsx` | Production and review field-upgrade choices share prices and purchase presentation. |
| `src/PC01ReviewScene.test.tsx` | The isolated owner tour advances research, purchases a sample upgrade, runs ECM, reveals a private scout result, and hides its coordinate from the second ship. |
| `src/components/ScoutResultControllers.test.tsx` and `ScoutResultPanels.test.tsx` | Current GM and Scientist flows use private reports, notes, and the same review presentation. |
| `src/lib/endeavourEcmDeviceService.test.ts` and `scoutResultService.test.ts` | Client request identity, retries, and private response parsing. |
| `scripts/prompt-637-render-performance.test.mjs` | The landing byte budget includes its static module graph and shared science presentation but excludes lazy and separate review-only assets; missing or unsupported landing modules fail closed. |
| `tests/rules/scoutPrivacy.rules.test.ts` | Direct client reads and writes cannot bypass private scout storage. |

| Changed test | Reason |
|---|---|
| `functions/src/navigationProjection.test.ts` | Per-ship visited and scouted coordinates stay separate in member projections. |
| `functions/src/jumpCallable.test.ts` | A ship keeps its revealed scout coordinate after a move or jump while a different ship's projection still hides it. |
| `functions/src/scoutRequestCallable.test.ts` | Current ship, range, cadence, request-time docking host, and replay are checked against valid session fixtures. |
| `scripts/deployment-targets.test.mjs` | The release selects every new PC01 callable and existing ship-map writer, and treats the separate review entry as Hosting; its historical fixture uses a fixed historical end commit. |
| `src/components/AppHeader.test.tsx` | The current PC01 entry and retained 0.5.50 recharge history both remain visible after the version rollover. |
| `src/components/EndeavourResearchPanel.test.tsx` | Confirmation is queried inside the research section after ECM adds another status message. |
| `src/components/Starmap.test.tsx` | Unknown coordinates and location details stay hidden for the viewed ship. |
| `src/lib/scoutRequestService.test.ts` | Client parsing keeps the server-derived receiving ship and validates current requests. |
| `src/routes/ShipConsoleNavigation.test.tsx` | The joined ship map and route do not show another ship's discoveries. |
| `src/routes/ShuttleConsole.test.tsx` | Live route reaches ECM and scouting; request confirmation is selected by its actual copy when the report pane also has a status. |
| `tests/rules/firestore.rules.test.ts` | New ECM and scout records deny direct writes and expose only the intended event audience. |

**Skipped tests:** none. **Deleted tests:** none. A focused run temporarily
filtered unrelated tests while diagnosing selector failures; final full-suite
results appear above.

## Known issues and later candidates

The ordinary authorized live path requires a facilitator and Scientist session
after deployment. PC02–PC10 remain provisional; Starlight, Hummingbird, and
Comms result workspaces, selective sharing, away missions, split-fleet
communication, and unrelated stations remain outside the PC01 shape.

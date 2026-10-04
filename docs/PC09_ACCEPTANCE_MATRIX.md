# PC09 acceptance matrix

Opening catalog: 654/751; assigned tranche: 49; required closing target: 703/751.
This matrix tracks evidence and gaps; the JSON catalog remains the status authority.
All catalog statuses remain at their opening values until the reconciled review,
normal gameplay acceptance and release gates pass. All ten audit repairs are in
P621/P645 scope.

| ID | Acceptance | Owner group | Opening status | Current evidence / remaining gap |
|---|---|---|---|---|
| 471 | Enforce Battlestation Short Range immunity. | Aftermath | missing | Implementation and accepted proof pending bounded worker handoff. |
| 472 | Apply Strikecarrier wing bonus. | Aftermath | missing | Implementation and accepted proof pending bounded worker handoff. |
| 473 | Apply surviving Wolf ship damage. | Aftermath | missing | Implementation and accepted proof pending bounded worker handoff. |
| 580 | Resolve Boa combat ambiguity. | Aftermath | missing | Implementation and accepted proof pending bounded worker handoff. |
| 605a | Visualize Wolf attacks on DRADIS. | DRADIS | missing | Activated implementation 3c80d9fd is integrated. Original normal-auth proof exposed recovery failure; Sol test-first feed ordering fix b8cd50f5 is integrated. Same-UID offline/online/resume/reload/reselection passes on the isolated worker candidate; enhanced privacy, rendered final proof, reconciled review and release remain. |
| 474 | Publish the immediate attack result. | Aftermath | missing | Safe finalization/audience and complete GM receipt are integrated. Ordinary composed finalization exposed Firestore map-order rejection: red 5512307a and product 1bc85a2d preserve the allowlist; 25 focused checks and strict build pass. Fresh actual subscription proof, review and release remain. |
| 475 | Reuse the common damage draw path. | Aftermath | missing | Implementation and accepted proof pending bounded worker handoff. |
| 476 | Destroy a ship on combat deck exhaustion. | Aftermath | missing | Implementation and accepted proof pending bounded worker handoff. |
| 477 | Apply combat casualties. | Aftermath | missing | Implementation and accepted proof pending bounded worker handoff. |
| 478 | Apply Doctor casualty mitigation. | Aftermath | missing | Implementation and accepted proof pending bounded worker handoff. |
| 479 | Resolve Warrior post-attack salvage. | Aftermath | missing | Implementation and accepted proof pending bounded worker handoff. |
| 480 | Resolve Capybara post-attack Scrap. | Aftermath | missing | Implementation and accepted proof pending bounded worker handoff. |
| 481 | Collect Scrap with Macaw or Boa. | Aftermath | missing | Implementation and accepted proof pending bounded worker handoff. |
| 482 | Resolve post-attack repairs. | Aftermath | missing | Implementation and accepted proof pending bounded worker handoff. |
| 483 | Rebuild fighters after combat. | Aftermath | missing | Implementation and accepted proof pending bounded worker handoff. |
| 484 | Publish the complete aftermath. | Aftermath | missing | Implementation and accepted proof pending bounded worker handoff. |
| 490 | Preserve independent split-group threat. | Threats | missing | Source/group window and preparation prerequisites e77424a4/0facdc88 are integrated. Connected selected-group declaration, normal-auth proof, review and release remain. |
| 491 | Trigger Active Wolf Outpost attacks. | Threats | missing | Group-scoped source rules e5968c36 and arrival/window prerequisites are integrated; L requires one Battlestation plus 20 other capacity. Connected source choices, normal-auth proof, review and release remain. |
| 492 | Trigger Active Wolf Fortress attacks. | Threats | missing | Printed two-Battlestation plus 25 other-capacity rule is integrated with corrected red tests 32aa5a3a and catalog source correction 4ebc1b5d. Connected source choices, normal-auth proof, review and release remain. |
| 493 | Trigger Ancient Space Station attacks. | Threats | missing | Immutable P context and exact-survivor repeat planner 9b8d2c10 are integrated. Atomic finalizer restaging, connected current-source declaration, normal repeat proof, review and release remain. |
| 494 | Resolve the Wolf Commander attack dial. | Threats | missing | Implementation and accepted proof pending bounded worker handoff. |
| 621 | Recover during a Wolf attack. | Audit | missing | All ten native audit repairs and 6f72bf79 handoff are integrated; exact normal-auth RANGE-07 reproduction passed on the audit candidate. Root composed run passed real EO interruptions during pending Medium/Short ranges. Discovery-order and result-map-order follow-on repairs are integrated; completed composed/reconciled proof, independent review and release remain. |
| 214 | Build and use the Wolf Agent Detector. | Specialists | partial | Implementation and accepted proof pending bounded worker handoff. |
| 503a | Trigger hacking overlays after committed sabotage. | Specialists | partial | Implementation and accepted proof pending bounded worker handoff. |
| 506 | Prove investigation randomness ownership. | Specialists | missing | Implementation and accepted proof pending bounded worker handoff. |
| 508 | Test with the Wolf Agent Detector. | Specialists | missing | Implementation and accepted proof pending bounded worker handoff. |
| 513 | Calculate arrest posse size privately. | Specialists | partial | Implementation and accepted proof pending bounded worker handoff. |
| 514 | Resolve arrest and its deadline. | Specialists | missing | Implementation and accepted proof pending bounded worker handoff. |
| 516 | Activate the Comms Officer. | Specialists | missing | Implementation and accepted proof pending bounded worker handoff. |
| 517 | Activate the VIP Host. | Specialists | missing | Implementation and accepted proof pending bounded worker handoff. |
| 519 | Activate the Militia Leader. | Specialists | missing | Implementation and accepted proof pending bounded worker handoff. |
| 520 | Activate the PDF Fighter Ace. | Specialists | missing | Implementation and accepted proof pending bounded worker handoff. |
| 521 | Complete Wolf Commander powers. | Threats | missing | Implementation and accepted proof pending bounded worker handoff. |
| 521a | Resolve the Wolf Commander address. | Threats | missing | Implementation and accepted proof pending bounded worker handoff. |
| 521b | Resolve Wolf Commander amnesty. | Threats | missing | Implementation and accepted proof pending bounded worker handoff. |
| 524 | Run the complete Wolf-and-deduction scenario. | Owner | missing | Implementation and accepted proof pending bounded worker handoff. |
| 645 | Run a complete Wolf attack playthrough. | Owner | missing | Implementation and accepted proof pending bounded worker handoff. |
| 523b | Configure Crisis difficulty. | Crises | missing | Implementation and accepted proof pending bounded worker handoff. |
| 523c | Configure emergency-jump severity. | Crises | missing | Implementation and accepted proof pending bounded worker handoff. |
| 524b | Resolve the President's address. | Crises | missing | Implementation and accepted proof pending bounded worker handoff. |
| 524c | Resolve a presidential visit. | Crises | missing | Implementation and accepted proof pending bounded worker handoff. |
| 524d | Enforce presidential authority boundaries. | Crises | missing | Implementation and accepted proof pending bounded worker handoff. |
| 528 | Resolve Approaching Vessel choices. | Crises | missing | Implementation and accepted proof pending bounded worker handoff. |
| 529 | Integrate Voyage 33-0 arrival. | Crises | partial | Implementation and accepted proof pending bounded worker handoff. |
| 537 | Configure election procedure. | Crises | missing | Implementation and accepted proof pending bounded worker handoff. |
| 538 | Resolve the election privately. | Crises | missing | Implementation and accepted proof pending bounded worker handoff. |
| 539 | Announce binding resolutions at Team start. | Crises | missing | Implementation and accepted proof pending bounded worker handoff. |
| 540 | Run the full crisis scenario. | Crises | missing | Implementation and accepted proof pending bounded worker handoff. |
| 180 | Create the Executive Officer workspace. | Owner | missing | Released combat/Pallas behavior recovered; source-required EO maintenance gap repaired test first through shared AEGIS controls on a separate Maintenance page. All 153 shared route tests and typecheck pass. Actual authenticated EO maintenance, Pallas/visible return, network interruption/reload, four viewports and monospace pass at 584697f4. Composed attack actions, review and release remain. |

The full affected ShipConsole and FleetSystemsWorkspace files pass 153 tests.
Prepared browser evidence, normal authenticated emulator gameplay, native tests,
Rules, independent review, CI and deployment are recorded separately at closeout.
No production-GM or physical-device evidence is inferred from local passes.

The EO proof driver is `scripts/test-pc09-executive-workspace-http.mjs` and its
external evidence is `/tmp/dow-pc09-evidence/executive/result.json`. It uses a
normal 18-post session and real browser join, with no auth-storage injection,
hidden-state seed or clock change. Explicit current-generation departure is a
different action that releases the post; actual network interruption is used
for same-identity recovery. The complete P524/P645 driver is being composed
from the bounded deduction and aftermath handoffs; it has not passed yet.

# PC10 acceptance matrix

Opening: 703/751 overall; 245/293 campaign. Target: 48 assigned closures, 751/751 and 293/293. All rows start pending. Added scope earns zero campaign credit.

The [function and role matrix](PC10_FUNCTION_ROLE_MATRIX.json) enumerates the
actual compiled Firebase SDK endpoints, their current client consumers, core,
sparse-roster, replacement and private-loyalty roles. Each row separately tracks
fresh-game, authority/privacy/recovery, automated browser and human-device
evidence. Inventory and focused regression passes grant no gameplay credit.
Regenerate it after the final Functions integration and bind each accepted row
to the corresponding real scenario and source/runtime evidence.

| ID | Required behavior | Implementation / connection | Authenticated gameplay / recovery / privacy | Review / release |
|---|---|---|---|---|
| 181 | Create the Wing Commander workspace. | pending | pending | pending |
| 215b | Complete the Scientist workspace. | pending | pending | pending |
| 223b | Complete the Explorer workspace. | pending | pending | pending |
| 233b | Complete the PDF Colonel workspace. | pending | pending | pending |
| 541 | Reveal a New Eden candidate. | pending | pending | pending |
| 542 | Make candidate discovery retry-safe. | pending | pending | pending |
| 543 | Track candidate plans by Cycle 6. | pending | pending | pending |
| 544 | Validate Ancient Jump Ring prerequisites. | pending | pending | pending |
| 545 | Repair the Ancient Jump Ring. | pending | pending | pending |
| 546 | Prevent duplicate Ring contributions. | pending | pending | pending |
| 547 | Fuel each Ring passage. | pending | pending | pending |
| 548 | Resolve Ring passage. | pending | pending | pending |
| 549 | Record blocked Wolf pursuit through the Ring. | pending | pending | pending |
| 550 | Accumulate Deep Nebula scouting. | pending | pending | pending |
| 551 | Attempt a Deep Nebula jump. | pending | pending | pending |
| 552 | Lose a ship in the Deep Nebula. | pending | pending | pending |
| 553 | Reach the Deep Nebula threshold. | pending | pending | pending |
| 554 | Prevent repeat Nebula attempts. | pending | pending | pending |
| 555 | Trigger Ancient Space Station arrival combat. | pending | pending | pending |
| 556 | Repeat Station combat while Wolves survive. | pending | pending | pending |
| 557 | Liberate the Ancient Space Station. | pending | pending | pending |
| 558 | Validate Station Reactor contributions. | pending | pending | pending |
| 559 | Power New Eden Station. | pending | pending | pending |
| 563 | Explain candidate results. | pending | pending | pending |
| 564 | Enter debrief once. | pending | pending | pending |
| 565 | Close the session authoritatively. | pending | pending | pending |
| 566 | Read debrief after closure. | pending | pending | pending |
| 576 | Resolve Macaw salvage dismantling. | pending | pending | pending |
| 579 | Resolve Boa reclamation. | pending | pending | pending |
| 581 | Create post-damage Scrap pickups. | pending | pending | pending |
| 584 | Run the Capybara vertical scenario. | pending | pending | pending |
| 585 | Run the base/expansion isolation scenario. | pending | pending | pending |
| 593 | Show candidate preparation help. | pending | pending | pending |
| 618 | Reconnect every live projection. | pending | pending | pending |
| 619 | Make candidate retries survive reconnect. | pending | pending | pending |
| 620 | Recover from stale revisions. | pending | pending | pending |
| 629 | Protect private projections comprehensively. | pending | pending | pending |
| 630 | Prove server-owned randomness. | pending | pending | pending |
| 631 | Rate-limit expensive callables. | pending | pending | pending |
| 634 | Record security denials privately. | pending | pending | pending |
| 635 | Standardize action audit records. | pending | pending | pending |
| 641 | Run a complete base-game playthrough. | pending | pending | pending |
| 642 | Run a complete Capybara playthrough. | pending | pending | pending |
| 647 | Prove Ancient Jump Ring success. | pending | pending | pending |
| 648 | Prove Deep Nebula success and loss. | pending | pending | pending |
| 649 | Prove Ancient Space Station success. | pending | pending | pending |
| 650 | Prove authoritative terminal failure and recovery paths. | pending | pending | pending |
| 651 | Run the final release-readiness audit. | pending | pending | pending |

| Addition / gate | Acceptance | Evidence |
|---|---|---|
| PC10-A01 | Joined primary Settings ordinary join QR/link/code; ordinary admission/Auth/consent/privacy | pending |
| PC10-A02 | Actual authenticated GM, fresh cycle 0→1, unlimited/manual full-game demo beside existing cycle demo | pending |
| Gate 1 | Every role/function in fresh full game through ending across two browsers | pending; function inventory to be reconciled |
| Gate 2 | About 21 independent authenticated sessions with overlapping actions/reconnect/retries/privacy | pending; record actor sessions and actual browser contexts separately |
| Gate 3 | Available actions, costs, blockers and next actor can be understood in app | pending; broader PC11 guidance is future work |

Prepared presentation, native tests, normal authenticated emulator HTTP/UI/rules, automated concurrent browsers, human/device playtesting, CI and production deployment are separate evidence classes. No unavailable evidence earns closure credit.

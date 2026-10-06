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

## October 6 accepted and open finite families

The latest closed actual boundary is GM21 at
source `db96d9f23c5e17de98e3d9135b00b9ef02796aa3`. Core7, Press3, GM20 and
the minimal Miner qualifier closed at `a27a795ffa3ebd62bc3eb98c52dd897e9916f6e4`;
their failed evidence and cleanup remain retained. The subsequent Press first
readiness, primary casting control and four-leg Core scope repairs have focused
native evidence, without fresh gameplay credit. All 48 catalog closures and
the release remain pending.
Accepted subsystem checks do not establish an entire family or every function.

| Existing scenario family | Accepted evidence | Exact open behavior |
|---|---|---|
| Ordinary Settings QR | Fresh normal admission and actual GM manual start; four unchanged pixel captures decoded to the exact ordinary join payload; accessible link/code and responsive presentation. | Final current-source/release reconciliation; no physical-device scan is claimed. |
| Member and GM lifecycle / GM recipes | GM17 completed four mounted recipes, ordinary Pursuit ending, immutable debrief/closure and entitled crew reload across two browsers. GM19 independently completed the fighter-count recipe but failed the resource-counter case. | Browser qualification of the repaired resource-counter lifecycle/source checks and ordinary primary casting preference. GM20 incorrectly required new consent despite valid browser-global 72-hour acknowledgement. GM21 retained genuine consent but failed during its pre-start sequence without a current casting sample; no exclusive cause is proved. The native casting repair requires actual connected-player readiness. GM22 preserves consent and uses one atomic source sample within the existing 60-second deadline. Remaining mounted member/GM functions and interrupted/repeated recovery stay open. The intentionally unmounted registration-lock writer earns no UI credit. |
| Full Base / combat / politics / crisis / arrest | Combat29 committed nine paid maintenance actions and its opening combat choices before failure. | Both Combat29 and the separate eight-core minimal Miner qualifier changed the original pre-selection generation before station acceptance; initiating callback attribution is unretained. The minimal qualifier ran without the maintenance/combat prefix. Native tests independently reproduce passive roster resume and cancellation defects; repair and actual qualification remain separate from historical attribution. Complete stable role selection, release/reselection/reload, range/aftermath and subsequent ordinary Base actions through ending. |
| Core and Press shuttle transit | Core7 retained the original current member berth/control witness and received Request UI/exact-replay 200 responses, but its source evaluator did not accept the result. Press2 confirmed canonical null replacement status and its own SNN scope/control; Press3 failed before departure with source readiness predicates incomplete. | The integrated Core four-leg recipe uses actual member scope and an independently observed original docking host; 56 focused native checks passed. The integrated Press selector awaits its own player and applicable modern member confirmation inside the original deadline; 14 new and 94 retained checks passed. Fresh Core8/Press4 movement, natural arrival and reload through ending remain open. Three adjacent Core recipe contracts and printed-owner control selection are under bounded source repair. Incomplete predicates do not identify an exclusive historical callback cause. |
| N/O/P candidate games | CandidatePanel6 completed four ordinary cycles and twenty Scientist choices; phone/landscape targets and all viewport overflow/target-size checks passed. | Desktop native Tab reached seven of eight targets within the unchanged 48-Tab cap; all three distinct candidate outcomes and endings remain open. |
| Capybara, sparse joint engineering and replacement-role families | Current implementation and focused native checks are retained. | Fresh appropriate-role connected functions, source costs, replay/recovery/privacy and their existing normal endings. |
| Gate 2 independent sessions | Functional3 completed all 21 ordinary browser joins and consent. | Original GM start returned 500 before the functional/privacy commands; no concurrency acceptance. Complete the original finite overlap/reconnect/retry/privacy contract after source reconciliation. |
| Gate 3 usability / final release | Existing action/source annotations and subsystem screenshots are retained. | Reconcile available actions, costs, blockers, committed results and next actor; one independent review, final local checks, exact candidate/main CI and deployment. |

The parent returned the earlier Chain Scanner runtime window, after which Root
ran the closed slices above. After GM21 closed, Root verified its own cleanup
and offered the next requested bounded window. Retained Root servers remain
idle and further heavy/browser proofs await the parent's explicit return;
bounded source/native work continues. No outgoing thread-message capability is
available in this environment, and no parent acknowledgement is fabricated.
Each closed actual retained its own failure evidence, closed browsers before
exact-owned-session deletion, and returned all three owned gameplay scopes to
zero. No other task’s reservation or runtime was changed.

The critical path is to finish independent source-coupled repairs using existing
fixtures, reconcile once, qualify the affected live slices, then finish the
existing fresh families and Gate 2. Do not replay unchanged admission/research
prefixes merely to recover missing diagnostics. Do not add a test framework,
relax authority/privacy/keyboard budgets, or infer whole-game acceptance from
native totals. Automated Auth actors and browser contexts remain distinct from
physical human/device play.

October 10 is the budget for the whole agreed sequence, including the existing
post-PC10 work and PC11; PC12 remains conditional. PC10 must finish at the
earliest safe release boundary and return to the parent first. It does not
reserve October 10 as its own recovery buffer or execute later checkpoints.

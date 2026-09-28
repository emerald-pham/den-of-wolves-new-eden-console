# PC03 playtest report — navigation and shuttle controls

**State:** Candidate in preparation. The hosted build and review link will be recorded only after the exact commit has passed validation and deployed. The prepared scene uses production interface components with labeled synthetic states and performs no live session writes.

## Rule decisions and evidence to review first

- **Jump distance bands (P287):** The routed rule source measures the shortest printed chart path in edges but does not specify the numeric Short, Medium, and Long cutoffs. The current one-edge, two-edge, three-or-more compatibility behavior remains in place pending the owner's decision. Related prompt closure stays open.
- **Failed-jump damage (P299):** The source leaves the damage trigger and draw count to facilitator adjudication. No new automatic damage policy is inferred.
- **Small ships:** Supplemental vessel statistics are reference values; they do not create an independent resource ledger or player seat. The review path does not present those Jump Drives as ready to launch.

## One-sitting owner UI walkthrough

Open the prepared PC03 review scene when its link is published. Its five numbered views use representative ship and shuttle states; the controls do not submit production mutations.

1. **Find the route — yes/no:** From the assigned ship station, open Navigation. Read the current coordinate, ship-specific known map, and navigation log. Return to Systems and the fleet board. Is the path understandable without losing your place?
2. **Read the drive — yes/no:** In prepared ready, uncharged, fuel-starved, damaged, integrity-locked, pending, committed, and stale states, enter and lock four coordinate digits by touch or keyboard. Are charge, cost, fuel, condition, and the next action clear? The sample launch remains disabled.
3. **Follow a shuttle — yes/no:** Find its current dock and airspace window, then inspect prepared departure, transit, retarget, arrival, and closed-airspace views. Can you find the correct station on return and tell when another request has changed the state?
4. **Find stores and service — yes/no:** From the ship station, follow direct links to resource stores and shuttle docking history. Inspect shuttle cargo and repair/recharge states. Can you distinguish enough stock and a ready host from insufficient, undocked, already-used, wrong-phase, pending, and committed states?
5. **Recover — yes/no:** Compare prepared refresh/reconnect and stale-reply views. Do the latest map, drive, shuttle, stores, and service states show a useful next action without suggesting a duplicate jump, cargo transfer, charge, or repair?

## Evidence boundaries

The source-supported server paths and client recovery changes require focused authority, role, phase, concurrency, replay, and privacy tests. The scene and browser layout checks establish presentation only. CI deployment, hosted page load, and ordinary authorized gameplay will each be recorded separately at the release boundary.

The production-play checks for P371, P380, P238, P244, and P241c remain open until an authorized session exercises them. P112/P385 require owner trade and dismantling decisions. P250/P251, P679, and P020a remain gated by the jump chain. No prompt is marked complete from the synthetic scene or local test results alone.

## Candidate behavior and local checks

| Area | Candidate behavior | Verification boundary |
|---|---|---|
| Ship navigation | Direct ship-console links reach resource stores and shuttle docking history inside the scrollable panel. The review scene offers the same two routes from the prepared station and includes the existing ship-safe map and log. | Focused route and scene tests; rendered phone, short-landscape, desktop, and reduced-motion scene checks. A synthetic scene does not prove a live role assignment. |
| Jump Drive | Installed-upgrade fuel costs appear in the drive and fleet chrome. Stale replies prompt a live refresh; an uncertain acknowledgement keeps its exact request identity and offers receipt retry. A presentation-only drive permits local digits and lock while launch cannot call the server. | Focused service, component, and existing server receipt tests. The production callable transaction is unchanged. No ordinary live jump or timeout retry has been observed for PC03. |
| Shuttle | Departure availability refreshes at the airspace deadline without waiting for another snapshot. Pending movement is announced. Cargo transfer holds its exact request after uncertain transport or unreadable replies, blocks a new move, and permits replay only under the same current authority. | Focused client tests and existing callable receipt behavior. The delayed server worker, competing movement, and live cargo transfer still need ordinary production-play proof. |
| Owner scene | Five prepared views use production navigation, drive, and shuttle presentation components. Service and cargo samples are visibly disabled and no live session or mutation is mounted. | Unit assertions and a browser walkthrough establish presentation, not player authority or a committed action. |

**Test-change inventory.** New files: `src/PC03ReviewScene.test.tsx`, `src/components/FleetRoleConsoleTemplate.test.tsx`, and `scripts/test-pc03-scene-layout.mjs`. Extended tests: `functions/src/jumpCallable.test.ts`, `functions/src/jumpDrive.test.ts`, `scripts/deployment-targets.test.mjs`, `src/components/AppHeader.test.tsx`, `src/components/FleetSystemsWorkspace.test.tsx`, `src/components/JumpDriveConsole.test.tsx`, `src/components/ShuttleConsoleTemplate.test.tsx`, `src/lib/sessionService.test.ts`, `src/lib/shuttleCargoService.test.ts`, `src/routes/ShipConsole.test.tsx`, `src/routes/ShipConsoleNavigation.test.tsx`, and `src/routes/ShuttleConsole.test.tsx`. No test was skipped or deleted. The first full suite found old ship-system and changelog assertions after their intended copy changed; both were corrected to assert the new copy and retained PC02 history, then their focused suites passed.

**Local candidate checks so far:** 5,788 unit and Functions tests pass. The first `test:all` invocation could not start Firestore rules because this new checkout had no isolated emulator configuration; after reserving slot 1, `npm run test:rules` passed all 140 rules tests. Typecheck, web and Functions builds, bundle size, font consistency, and 66 deployment-selector tests pass. Lint has zero errors and six existing warnings. The PC03 browser walkthrough passes at 320 × 844, 390 × 844, 844 × 390, and 1440 × 900 with reduced motion. The ticker browser suite passed its viewport, font-readiness, reduced-motion, and lifecycle cases. The P637 render-performance baseline passed (landing startup p95 116.25 ms, route startup p95 101 ms, mobile frame p95 33.2 ms, zero long frames). The deployment selector chooses Hosting for this source range. Independent review, deployment workflow, hosted page load, and ordinary production path remain separate gates.

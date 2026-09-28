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

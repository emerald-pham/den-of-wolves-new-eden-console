# Playtest checkpoint feedback

This is the record of the product owner's UI review by playing the app, not a
gameplay-rules, test, or source-code review. Record notes on layout, wording,
navigation, visible states, and any suggested change the owner raises. The
next checkpoint shape must read every received note and state
its disposition in [Product Milestones](PRODUCT_MILESTONES.md). Written UI
feedback and walkthrough answers are optional. Explicit owner authorization is
sufficient checkpoint acceptance and must be recorded here; silence alone is
not authorization. If no feedback has arrived, record that fact in the next
shape and continue; do not wait.

For each authorization or review, append an entry with:

- milestone ID, build/version, date, authorization state, and any owner notes;
- one row per note with a short ID and exact requested behavior;
- disposition: fixed in cooldown, included in the next shape, or added to a
  named [later candidate](PRODUCT_MILESTONE_CANDIDATES.md);
- cooldown change and in-app verification, or the reason it remains open;
- the later shape that read and addressed the note.

If the owner corrects an assumption from the
[assumptions log](PRODUCT_MILESTONE_ASSUMPTIONS.md), link that assumption and
resolve it in the cooldown pass before starting a new milestone build. Feedback
that arrives during an already shaped build is handled at its next safe
boundary. Never silently enlarge that accepted build.

## PC01 — Shepherd science station

**Review state:** the owner supplied cross-checkpoint guidance on 2026-09-27,
including a role-selection screenshot. This was not a PC01 walkthrough or
verdict. These notes inform PC02–PC10; the owner prefers resolution by the
PC02 handoff where the work can be completed safely. PC01 build 0.5.51 has
since been released. PC01 checkpoint acceptance awaits explicit authorization;
a completed UI walkthrough is not required. Ordinary authorized live-play
proof remains a separate agent-owned evidence gap.

| Note ID | Owner's observation or request | Disposition | Cooldown evidence or later candidate | Next shape that addressed it |
|---|---|---|---|---|
| PC01-F01 | Survivor population changes and purges are sent to the Press log. | Included in PC02 cooldown target. | Authoritative Press handoff, recipient privacy, and replay proof pending. | PC02 planned. |
| PC01-F02 | Presidential events are handed to Press. | Included in PC02 cooldown target. | President event to Press handoff and audience proof pending. | PC02 planned. |
| PC01-F03 | Replace “Awaiting server telemetry” with “Awaiting CIC handshake”; use in-universe language where possible. | Included in PC02 cooldown target. | Local candidate `4c0e7e80` changes the pursuit pending labels; focused UI tests pass. Release and in-app verification pending. | PC02 planned. |
| PC01-F04 | Repeat DRADIS sweeps must keep the first contact enlargement for its full first-sweep duration, then resume normal-sized repeat behavior. | Included in PC02 cooldown target. | Local candidate `ff7baa15` separates the first size beat from repeat brightness pings; focused timing tests pass. Released gameplay review pending. | PC02 planned. |
| PC01-F05 | Players can drop out midgame and play continues in every non-GM role. | Included in PC02 cooldown target. | Server-authoritative role, seat, and continuation proof pending. | PC02 planned. |
| PC01-F06 | The three Code of Conduct checkboxes last for 72 hours. | Included in PC02 cooldown target. | Local candidates `4c0e7e80` and `6ad74397` set a 72-hour browser acknowledgement, update its label, and reopen the gate at expiry in active or resumed tabs. Focused boundary tests pass; release and in-app verification pending. | PC02 planned. |
| PC01-F07 | The screenshot-style cycle, phase, location, authority, next-action, and failure-state panel is visible only to people logged in as GM. | Included in PC02 cooldown target. | Local candidate `4c0e7e80` gates the panel on active authenticated GM access; player and unauthorized-GM tests pass. Release and in-app verification pending. | PC02 planned. |
| PC01-F08 | Leave session must not sit at the top of the screen; Settings is an acceptable location. | Included in PC02 cooldown target. | Local candidate `4c0e7e80` removes the two top-screen controls; shared Settings retains the confirmed disconnect action. Release and in-app verification pending. | PC02 planned. |
| PC01-F09 | DRADIS contact names overlap other plot content. The expanded plot should keep each name readable and anchored on the left or right of its contact, choosing the side with more room from other labels and marks. The minimized plot is lower priority and may be less readable. | Included in PC02 cooldown target. | Local candidates `4525a4db`, `60eef106`, and `60d2ca71` wrap oversized names, choose the clearer anchored side after scans, and provide a “Read names” expansion control on narrow screens. Focused tests and rendered 320/390/844/1440 px checks pass for expanded labels without overlaps or detached names; released gameplay review pending. | PC02 planned. |
| PC01-F10 | Reconnect does not restore the correct game state. | Included in PC02 cooldown target. | Local candidate `096aaf88` rebinds private state listeners after a same-player resume; focused route/private-projection test passes. Server continuity and released gameplay proof pending. | PC02 planned. |

**PC02 authorization update (2026-09-28).** All ten requested presentation and continuity changes above are included in released build 0.5.52 from `f0e4eb73c753915567412899efd4dd4d78faa9dc`. [The release workflow](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/36374346054) passed, the public build marker advanced through 0.5.52, and the six-step [solo review scene](https://dow-new-eden-console.web.app/pc02-review) loads. The owner explicitly authorized PC02 and confirmed that checkpoint authorization is sufficient without walkthrough answers or written UI feedback. PC02 owner acceptance is complete. The table preserves the earlier candidate and proof state as received; see [the PC02 report](PC02_PLAYTEST_REPORT.md) for the final test inventory and remaining agent-owned production evidence.

## PC03 — Navigation and shuttle controls

**Authorization state (2026-09-28): accepted.** The owner explicitly authorized PC03 and confirmed that checkpoint authorization is sufficient without walkthrough answers or written UI feedback. Build 0.5.53 and the five-step [solo review scene](https://dow-new-eden-console.web.app/pc03-review) are released. Optional later feedback remains welcome and follows the ordinary cooldown process. See [the PC03 report](PC03_PLAYTEST_REPORT.md) for release evidence, unresolved rule decisions, and remaining agent-owned production evidence.

**Post-acceptance guidance received for PC04 (2026-09-28).** The owner gave
the following app-wide corrections while authorizing work to begin on PC04.
They are cooldown requirements for the PC04 release, not a revocation of PC03
acceptance. The end of released PC01 build 0.5.51 is the strongest known-good
typography reference, but the owner notes it may contain outliers; the
documented CIC typography contract controls. A passing source-only font guard
is not sufficient proof, and the corrected rendered contract must become a
mandatory CI/deployment gate.

| Note ID | Owner's observation or request | Disposition | Cooldown evidence or later candidate | Next shape that addressed it |
|---|---|---|---|---|
| PC03-F01 | Consolidate Role Select and station selection into one early screen. Ordinary players choose a station/console, not a role; Role Select remains only for authenticated GMs joining the game. | Included in PC04 cooldown target. | Test-first route and first-entry authority repair, responsive rendered checks, and released in-app verification pending. | PC04 planned. |
| PC03-F02 | Change current player-facing “table” copy to “console” app-wide, including “UPGRADES AND PROCEDURE OUTCOMES ARE TRACKED AT THE TABLE.” | Included in PC04 cooldown target. | Current visible UI copy inventory, focused assertions, and released in-app verification pending. Internal wire names, historical release notes, source citations, and genuine HTML/data tables remain unchanged. | PC04 planned. |
| PC03-F03 | The default Red Alert copy must be exactly “RED ALERT // WOLF ATTACK IMMINENT ALL HANDS TO BATTLE STATIONS. NON-CREW MUST SHELTER IN PLACE UNTIL ALERT LIFTED”. | Included in PC04 cooldown target. | Authoritative default/restore path, ticker/alert tests, and released in-app verification pending. | PC04 planned. |
| PC03-F04 | The app-wide and DRADIS font regression since the end of PC01 is unacceptable and must be repaired by the end of PC04. PC01 looked correct but may contain outliers; the intended CIC typography controls. Typography must be a mandatory CI/deployment gate that cannot be bypassed again. | Included in PC04 cooldown target and release gate. | Compare PC01 exact release `4e8e3876108709f2a620c4f71ea874183d3db4ee` with the PC04 candidate, resolve any outlier against the documented CIC tokens, and gate representative rendered/computed styles at required viewports on every player-facing deployment. | PC04 planned. |
| PC03-F05 | Automate every facilitator procedure that can be automated. The ultimate design target is one facilitator making only required choices, with automated facilitator actions and outcomes sent to the GM log. | Encoded as an app-wide product requirement and applied to PC04 mission/split work. | Automatic paths must own deterministic calculation and state changes, emit a complete server-owned GM-log receipt, and pause only for genuine choices, rulings, or interventions. Focused behavior, authority, replay, and log tests plus released in-app verification pending. | PC04 planned. |

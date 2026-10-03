# PC07 attack-engine source decisions

This note records the source boundary and the bounded digital assumptions for the PC07 attack-engine group (428, 431, 432, 432a, 433, 433a, 433b, 434, 434a, 435, 436, 437, 438, 439, 440, 441, 442, 444, and 523a). It does not change the canonical prompt catalog or grant closure credit to later prompts.

## Printed rules consumed

- The purchased v1.1 Player’s Guide, printed pages 12–13, gives the attack-stage order, the simultaneous range resolution and target-assignment order, fighter priority at Short Range, destruction effects, and boarding defence. The engine keeps these steps in one server-owned lifecycle and records each actual range and final effect.
- The v1.1 Facilitator’s Guide, printed page 10, specifies the first attack as ten Fighter Wings and five Assault Transports. PC07 uses that exact composition at every supported roster size. A phase deadline is displayed as context; it does not choose, pass, or time out a genuine player decision.
- The v1.1 A4 double-sided component sheet, printed page 23, gives the Gorgoneion Captain a before-targeting Force Field target choice that reduces the chosen ship’s final aggregate attack damage by two. Printed page 34 says the reactor can keep all four AEGIS combat consoles charged. Printed page 71 shows the base six-target Wolf ring.
- The Capybara v1.1 A4 double-sided sheet, printed pages 1 and 5, supplies the expansion target and boarding references. Its seven-target Wolf ring includes Capybara; the expansion target die rerolls an 8 and maps 7 to Capybara. The complementary Capybara v1.1 A3 single-sided ship sheet, printed page 1, was checked for the matching vessel identity.

Source-specific ship and attack sheets take precedence over guide summaries. These page references record visual checks of the full relevant pages; no source assets or private reference paths are included here.

## Bounded digital assumptions

- **PC07-A2, small-roster target ring:** the Facilitator’s Guide removes Dione from the small-roster setup, while the base target table still lists it. For a valid 8–11-player base configuration, the server filters the canonical printed order to admitted active full ships (Dione is the only allowed omitted core ship), then samples uniformly from that configured ring and wraps using its actual length. At 12 or more players the six-entry base ring is required. A full Capybara configuration requires Dione and uses the seven-entry expansion ring; an incomplete or malformed core roster fails closed.
- **Excess hits:** the printed rule assigns hits to distinct live legal targets but does not explain excess hits when fewer contacts remain than successful hits. The engine keeps every generated die and success in the private receipt, assigns at most one hit to each distinct legal live contact, records the remainder as unused, and applies no duplicate damage or reroll. With no live legal contacts it makes no target assignment.
- **No invented choice on disconnect:** the current Gorgoneion Captain explicitly selects a permitted current-group target or passes before targeting is exposed; the current AEGIS Executive Officer chooses each enabled range action or passes and supplies any required opaque-contact assignment; current ship crew explicitly commits a value from zero through available Security Teams for each boarding defence. These remain pending across disconnects. A displayed deadline does not create a pass, default, target, or roll.
- **Force Field readiness:** the current server-authored maintenance charge is the readiness authority for the projector. Recognized explicit damage/destruction markers deny use. PC07 does not add a small-ship damage deck or infer readiness from client state.
- **Reusable charged consoles:** printed “while charged” Missile Launcher and Point-Defence Laser actions are independently considered at their printed ranges. Resolving one range does not spend a reusable charge or disable the later printed range. Other future weapon actions and modifiers remain unavailable until their assigned prompts.

## Connected behavior boundary

The declaration callable atomically records the source composition, server targeting receipt, parking, restricted airspace, cycle deadline, and one safe member announcement. A server trigger advances empty/source-deterministic stages and progresses a required stage after the entitled choice is committed; the GM need not relay routine range or boarding steps. Each transaction rechecks current authority, group berth, attack revision, active cycle, restricted airspace, and shared timer holds. Reasoned GM recovery and attack pause/resume are audited interventions; ordinary cycle advance, skip, and airspace extension cannot bypass a declared attack. Exact request replay returns its stored receipt without sampling again.

Player projections contain only the caller’s eligible choices and safe committed results. The protected GM projection carries typed pending/unavailable/resolved decision summaries and complete private calculation/audit data. Member outcomes disclose source, target, contact reference, range, effect, outcome, and server time, while redacting composition, unresolved dice, facilitator notes, and intervention state.

This group includes the minimum printed base boarding-defence choice, current Force Field choice, and current charged Missile Launcher/PDL use/pass actions needed to complete PC07. Dedicated PC08 weapon consoles, enhanced warhead or shuttle support, specialized boarding benefits, and PC09 aftermath remain outside this scope.

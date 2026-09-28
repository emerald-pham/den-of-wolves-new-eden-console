# PC04 playtest report — exploration and split-fleet map

**State:** PC04 is in progress and has not been released. The local review
scene and any passing tests remain candidate evidence until the reconciled
runtime commit passes the required independent review, exact-SHA gates,
deployment, and hosted verification. Ordinary authorized gameplay is a
separate boundary.

## Rule decisions and evidence to review first

- **Mission Leader authority (PC04-A1):** The mission team chooses one Mission
  Leader. The active GM records that choice together with one connected
  participant roster; the console does not choose the leader for the team.
- **Eligible craft:** A mission start requires a new-location opportunity and
  one source-authorized active capable craft in the same fleet group. Optional
  Gorgoneion, Capybara, Warrior, Union, and other not-yet-admitted craft remain
  excluded.
- **Rejoined pursuit:** The printed split-fleet rule does not define one merged
  pursuit value after groups rejoin. The checkpoint preserves the independently
  tracked values and does not invent a merge.
- **Automation-first facilitation:** Deterministic procedure work belongs to
  server-owned transactions. A GM should supply only a real choice, ruling, or
  intervention; the automatic work must leave a complete GM-log receipt.
- **Typography baseline:** The exact PC01 release is the strongest rendered
  comparison, not an authority for preserving an outlier. The documented CIC
  typography contract controls the result, and the browser typography check is
  a mandatory CI and deployment gate.

## One-sitting owner UI walkthrough

The hosted PC04 review link will be added after the exact release is deployed.
The five numbered views use prepared states and must not submit production
mutations.

1. **Enter once — yes/no:** After joining, can I use one early catalog to find
   my assigned or open station, see live occupancy, enter or view its console,
   return without losing place, and distinguish the separate authenticated GM
   Role Select path without making a second role-then-station choice?
2. **Read the console — yes/no:** Across entry, DRADIS, shared header,
   representative ship and shuttle stations, GM, and mission views, does the
   typography follow the CIC console treatment? Is current generic interface
   wording consistently “console”? Does the default warning read exactly
   `RED ALERT // WOLF ATTACK IMMINENT ALL HANDS TO BATTLE STATIONS. NON-CREW MUST SHELTER IN PLACE UNTIL ALERT LIFTED`?
3. **Follow a mission — yes/no:** Can I tell which group and coordinate owns
   the mission, who the Mission Leader is, which craft and players are
   participating, what private action is mine, which opportunity owns each
   result, and where a reward is held or must be dropped off? Are deterministic
   steps automatic and recorded in the GM log?
4. **Follow a split — yes/no:** In whole-fleet, split, taxi, and pending-rejoin
   views, can I distinguish each group’s ships, location, pursuit, map
   knowledge, communication state, and next permitted action without learning
   another group’s private state?
5. **Recover — yes/no:** In refresh, reconnect, simultaneous-entry, stale
   mission action, and group-change views, is the latest authorized station,
   hand, mission, map, and group state clear without offering a duplicate
   claim, card action, reward, taxi, or message?

## Evidence boundaries

The following evidence must stay separate in the final handoff:

- focused and full local tests;
- rendered phone, desktop, short-landscape, and reduced-motion QA;
- independent review of the exact final commit;
- CI and deployment of that same commit;
- hosted page and version verification;
- ordinary authorized player and facilitator gameplay.

A synthetic review scene proves presentation only. It cannot prove server
authority, privacy, a committed mutation, replay safety, or a complete live
mission or split/rejoin playthrough.

## Candidate behavior and verification

| Area | Required candidate behavior | Required evidence |
|---|---|---|
| Entry | One early station/console catalog for ordinary players; Role Select only for authenticated GM joining; atomic first claim; occupied viewing; Press separation; deep links and Back preserved. | Route/component tests, concurrent claim coverage, responsive browser review, and ordinary joined-session verification. |
| Copy and alert | Current generic digital-interface wording uses “console”; genuine data tables and the printed Battle Table name remain intact; default/restore/ticker use the exact owner-supplied warning. | Exact-string client/server tests, visible-copy audit, and the ticker browser lifecycle gate. |
| Typography | CIC display/mono/readout treatment is consistent across representative production routes, including DRADIS. | Computed font family, size, weight, line height, tracking, bounds, and screenshots at 320×844, 390×844, 844×390, and 1440×900; mandatory exact-SHA CI/deploy gate. |
| Mission start | Active GM records the team-selected connected roster and one leader for one exact new-location opportunity/group/coordinate/cycle; the server validates eligible craft and automatically creates the immutable snapshot and initial private deal. | Callable, transaction, replay/stale, privacy/rules, projection, component, and GM-log receipt tests plus ordinary gameplay. |
| Mission lifecycle | Secret hands, blind allocation, private requests/discard/assignment, nonempty-only facilitator cards, server totals/bonuses/results, custody, overrun, and legal drop-off remain source-bound and automatic. | Focused domain and production-path tests. No prompt closes from isolated candidate modules. |
| Split fleet | Group-local roster, position, pursuit, map, messages, and scout-taxi exception remain isolated; pending rejoin does not merge pursuit without authority. | Projection/privacy, movement/range/capacity, communication, replay, and multi-client tests plus ordinary gameplay. |
| Review scene | Five prepared views reuse production presentation components and make their no-write boundary explicit. | Component assertions and rendered walkthrough only. |

## Held work and known gaps

- P237 remains held pending optional Gorgoneion admission and pre-deal support.
- P241b/P243 remain held until their mission contribution, result, and custody
  dependencies exist.
- P334/P335 remain held without authoritative recipient/history transactions.
- P348 has no source-backed merged-pursuit rule. P347/P349/P350/P424/P643 must
  not be claimed complete from a pending-rejoin sample.
- P422/P646 require an ordinary complete away-mission playthrough.
- P424/P643 require an ordinary complete split/rejoin playthrough.
- P678 requires authoritative recipient selection and projection.

## Test-change inventory

This section will be completed from the reconciled final diff. No test may be
removed, skipped, or weakened to release PC04.

## Review, release, and hosted evidence

This section intentionally remains open until one exact candidate commit has
passed independent Sol review, coordinated validation, CI, deployment, hosted
version verification, and the attempted ordinary authorized gameplay checks.

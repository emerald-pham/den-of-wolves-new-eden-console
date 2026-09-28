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
  one source-authorized, currently usable and colocated active craft in the
  same fleet group. Connected teammates may ride without personally owning
  that craft. The inspected mission procedure recommends at least three
  shuttles but prints no numeric passenger capacity, so the console does not
  invent one. Optional Gorgoneion, Capybara, Warrior, Union, and other
  not-yet-admitted craft remain excluded.
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

The reconciled candidate now renders the production `FleetRoster`,
`AwayMissionStartPanel`, private mission-card presentation, and fleet-group
context in the prepared review route. Its local command boundaries cannot call
Firebase or mutate a live session. The route-level browser check exercises the
real station link, participant and Mission Leader controls, mission-start
result, server-receipt presentation, private discard presentation, split-state
controls, and recovery boundary at 320×844, 390×844, 844×390, and 1440×900
with reduced motion.

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

No test is skipped or deleted for PC04.

- **Entry and station catalog:** route tests cover the ordinary-player redirect
  away from Role Select, explicit authenticated GM join intent, direct station
  links, live OPEN / HELD BY YOU / CLAIMED READ-ONLY states, legacy GM-owned
  seat release, foreign-seat intervention, and private-brief UID/session
  binding. One prior assertion that prohibited every GM release on Role Select
  changed test-first to the narrower product contract: an active GM may release
  its own legacy seat, while ordinary players still cannot claim or release
  there.
- **Typography:** source-level CIC token and geometry tests cover 61 cases; two
  release-contract tests require both typography gates before Hosting deploy;
  the browser matrix compares seven production surfaces at four viewports in
  normal and reduced motion against exact PC01 release
  `4e8e3876108709f2a620c4f71ea874183d3db4ee`. The later oversized DRADIS label
  override was removed after the rendered comparison established the
  regression.
- **Copy and alert:** client and callable tests assert the exact default,
  restore, and ticker text and keep `ICSN ADMIRAL //` as the distinct ticker
  source prefix. The visible-copy audit preserves genuine HTML/data tables,
  physical session-table language, historical release notes, and the printed
  Battle Table proper name.
- **Mission start:** tests cover request shape, active-GM and instance
  authority, current first-arrival opportunity, later-cycle supersession,
  chart/coordinate/group/cycle binding, current shuttle and PDF carrier state,
  mixed-role passengers, the team-selected Mission Leader, atomic private
  initial deals, immutable context, separate shared-carrier receipt facts,
  direct-write denial, private projection, stale and exact replay, ambiguous
  lost acknowledgement, terminal-phase receipt lookup, and both committed and
  stale terminal results. The duplicate terminal replay test was replaced with
  distinct committed-versus-stale cases; its acceptance was not weakened.
- **Prepared checkpoint:** component and responsive browser tests require the
  production entry, mission-start, private-card, mission-receipt, fleet-group,
  split, alert, typography, and recovery components. The browser script was
  updated after its first red run still targeted the removed hand-built entry
  button; the rerun passed all four viewports without horizontal overflow.
- **Pure later lifecycle candidates:** separate domain tests cover blind extra
  allocation, private request/discard/assignment, nonempty facilitator cards,
  totals, bonuses, and results. Reconciled Functions compilation caught the
  older candidate's per-participant `craftIds` assumption after mission start
  moved shared carriers to the mission receipt. A test-first repair now keeps
  carrier availability once at mission level, accepts teammates without
  inventing craft ownership, and authorizes a craft bonus only when that craft
  is present and its source-defined role owner contributed. Those tests do not
  claim production wiring or close Prompts 404–412.
- **Release history:** the first reconciled full run correctly failed because
  one changelog test still expected PC03's console-links note inside the new
  PC04 entry. The repaired test locates the preserved 0.5.53 entry explicitly;
  it does not move or rewrite the historical note.

Independent exact-head review cleared the entry/typography candidate
`027a6b26a55a3039f0cf58a25a77767cf25f9d2c` after its legacy-GM repair and the
mission-start candidate `8e16673c35dbdb8f12396aec6d808a35c7c48b55` after its
cycle, carrier, participant, context, and replay repairs. Final review of the
reconciled release commit remains required.

## Review, release, and hosted evidence

Local owner evidence is currently green for 5,880 unit/Functions tests, all 141
Firestore Rules tests, the Functions TypeScript build, the application
typecheck/build, focused integrated suites, and the production-component review
scene. This section remains open until one exact reconciled candidate commit
passes the remaining mandatory browser and documentation gates, final
independent Sol review, coordinated validation, CI, deployment, hosted version
verification, and the attempted ordinary authorized gameplay checks. No push,
merge, deployment, hosted verification, or ordinary live gameplay is claimed
yet.

## Authorized post-release documentation audit

The owner explicitly authorized a documentation audit and potential cleanup
after PC04 is released. At that boundary, inspect the implementation-prompt
catalog and generated views, product milestone and playtest records, release
and deployment claims, cross-links, superseded guidance, duplicate material,
and completed-work artifacts. Correct stale or contradictory current guidance,
regenerate and validate derived documentation, and remove only exact items
verified as redundant or terminal. Preserve primary/source records, historical
release evidence, active worktrees, unique commits, user data, and anything
whose ownership or recovery value is uncertain.

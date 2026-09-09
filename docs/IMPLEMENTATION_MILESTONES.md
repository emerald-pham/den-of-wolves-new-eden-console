# Implementation Milestones — Completion Route

This is the short, dependency-ordered route from the current tested foundation
to a complete Den of Wolves: New Eden companion game. It is the default roadmap
document for selecting work. The detailed acceptance catalog and its stable IDs
remain in [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md); live completion
evidence remains in
[`IMPLEMENTATION_PROGRESS.md`](./IMPLEMENTATION_PROGRESS.md).

Do not infer completion from the number of source files, screens, catalogs, or
passing low-level tests. The repository has substantial tested foundations, but
the progress ledger is the truthful prompt-level snapshot and the milestone
gates below are the truthful player-story measure.

## How to use this file

1. Start from the earliest dependency-ready milestone, not automatically the
   lowest unresolved prompt ID.
2. Select one vertical result that a player or facilitator can observe.
3. Look up only that milestone's prompt neighborhood and exact selected prompt
   in `IMPLEMENTATION_PLAN.md`.
4. Read the printed references routed for that mechanic, then follow
   `CLAUDE.md` for test-first delivery and release.
5. Mark a milestone green only after its end-to-end exit fixture passes. A set
   of isolated controls or catalogs is not a completed milestone.

Prompt ranges below are navigation hints, not ownership boundaries. Some
cross-cutting or catastrophe prompts intentionally support several milestones.

## Completion ladder

| Level | Outcome | Gate |
|---|---|---|
| 0 — Tested foundation | Sessions, authority primitives, typed catalogs, shared shells, timing, maintenance primitives, damage, jump scaffolding, DRADIS presentation, and debrief presentation exist. | Preserve named tests; do not count these pieces as a playable game by themselves. |
| 1 — Base walking skeleton | A supported base roster can cast, start, complete a turn, perform a real specialist action, scout, jump, and continue after reconnect. | Milestones 1–5 pass in one production-path fixture. |
| 2 — Base gameplay loop | Shuttles travel, an away mission resolves, a split fleet can reunite, a Wolf attack and deduction loop resolve, and catastrophe recovery keeps play alive. | Milestones 6–11 pass individually and in a multi-turn base-game fixture. |
| 3 — Base game completion | Crises work and at least one candidate success plus the terminal failure paths reach a durable closed debrief. | Milestones 12–13 pass; all enabled base roles and vessels have truthful work. |
| 4 — Full supported breadth | Every supported roster/configuration, replacement role, craft, candidate path, and the separately enabled Capybara expansion works without cross-loading base data. | Breadth matrices and base/expansion isolation proofs pass. |
| 5 — Release readiness | The table is accessible and responsive, secrets remain private, retry/reconnect paths are safe, and the measured 20-player/60-browser operating envelope is acceptable. | Security, accessibility, capacity, operational, version, changelog, deployment, and final evidence gates are green. |

`1.0.0` requires Level 5. Level 0 is valuable implementation progress, but it
is not evidence that the game is half or fully complete.

## Audited baseline — 2026-09-08 (after Prompt 004 and roadmap addenda)

This baseline explains why the completion route starts with production-path
stories even though the repository has many tests and UI surfaces. Update the
progress ledger as work lands; it supersedes this dated summary.

- The ledger reports **63 / 713 prompts done, 33 partial, one active prompt,
  and 616 missing** after completing the Prompt 004 catalog slice, activating
  Prompt 021, and recording the two owner-requested regression children while retaining
  the deliberately reopened Prompt 030 seat evidence and the five
  dependency-placed Wolf/DRADIS lettered prompts.
  Several done prompts define or test reusable contracts; they do not by
  themselves prove that production callables consume those contracts.
- No complete production route currently resolves an away mission, Wolf
  attack/boarding sequence, crisis, New Eden candidate attempt, or durable
  success/failure/closed transition. Existing catalogs and debrief presentation
  are foundations for those loops.
- The authoritative client/server catalogs now accept the settled 8–20 matrix,
  including the owner-set 19-player row. Production configuration, one-GM
  readiness/start, and Prompt 638's measured capacity evidence remain open;
  catalog support is not a live-game or 60-client claim.
- Seat claim/release primitives have isolated transaction tests, but session
  creation does not provision a production seat catalog, the client does not
  expose the claim/release path, and readiness ignores seat authority. Prompt
  030 is therefore partial and must be repaired before the one-GM readiness or
  lobby-to-Team-Phase composition gates can close.
- No repeatable 60-browser gameplay harness or commit/deployment-tied capacity
  artifact exists yet. Runtime instance limits and deployment automation are
  configuration, not capacity or live-game proof.
- The detailed plan's test totals are a historical snapshot. Current proof is
  the selected prompt's focused evidence plus the reconciled release gate, not
  an old aggregate count.

### Active dependency slice — release 0.3.12

The active Prompt 021 release is limited to authoritative configuration,
production seating, and one-GM staffing. It repairs Prompt 030's uncomposed
seat primitive and Prompt 073's obsolete two-holder representation in the same
dependency slice. Prompt 051 gains production configuration evidence but stays
partial: this release does not evaluate readiness, assign Wolves, initialize a
setup receipt, start Turn 1, or close the Milestone 1 fixture.

The slice exits only when creation produces the exact 8–20 configuration and
stable core-seat documents; one compare-and-set command cannot split count,
mode, role, vessel, or expansion state; client-visible claim/release composes
seat, player pointer, revision, receipt, and event; one active GM can carry both
facilitator labels while optional GMs share/handoff; legacy singular staffing
normalizes deterministically; Press remains a distinct optional non-counted
21st player; and chronological red-first, emulator/rules, responsive/a11y,
reconnect, race, full build/test, reconcile, merge, and push evidence is
recorded. The next dependency slice consumes this authority for readiness,
automatic private setup, and Turn 1.

Prompt 275b is a separately queued regression repair after the current
dependency slice. It must recover the last working SNN Dispatch Desk from git
history, restore its complete production composition, and prove that the desk
remains available and actionable during Turn Zero despite generic Turn Zero
locks. It does not change Press's separate optional/non-counted identity and is
not evidence for the Milestone 1 start gate.

Prompt 122a is a separate maintenance safety repair after its Reactor capacity,
damage/upgrade, console-eligibility, expiry, and atomicity dependencies. It must
reuse the existing authoritative maintenance transaction and exact danger-red
`ARE YOU SURE?` convention, adding confirmation-before-mutation and idempotent
accepted-only audit without claiming the wider vessel maintenance matrix.

Prompt 603a is a separate responsive-shell regression repair after shared
session chrome and Role Select. It requires the measured session ticket to own
real layout space so routed content reflows and never intersects it at phone or
short-landscape sizes; z-index coverage, hiding, and clipping are not fixes.

Prompt 602a is a separate return-navigation repair after authoritative shuttle
docking/association and console-route entitlement. It must give each ordinary
shuttle an explicit deterministic path back to its permitted associated ship
without releasing or rewriting the player's session, seat, active console, or
shuttle state. Press, Joint Engineering, and GM exit semantics remain distinct;
universal Prompt 602 cannot close until this composed regression is green.

These are roadmap inputs, not invitations to bypass dependencies. First prove a
base walking skeleton, then broaden roles/configurations and measure capacity
against gameplay that actually exists.

## Dependency-ordered milestone map

### Milestone 1 — Cast and start a real game

**Outcome:** a facilitator selects a supported immutable configuration, casts
the exact roster, privately assigns loyalties, seats players, and advances from
Turn 0 to Turn 1 without invalid or orphaned authority.

**Depends on:** session lifecycle, join/seat/GM authority, configuration and
privacy contracts.

**Primary prompt neighborhood:** 001–090.

**Exit fixture:** create → join → cast → start → Turn 1 using the production
callable path, with unsupported rosters, leaked secrets, stale requests, and
duplicate commands denied.

### Milestone 2 — Complete an authoritative turn and maintenance loop

**Outcome:** a healthy reference ship and a materially different damaged ship
complete Team and Coordination phases in printed order, including resources,
population, unrest, damage, charges, shuttle fuel, timing, and airspace.

**Depends on:** Milestone 1 and server-owned random/damage results.

**Primary prompt neighborhood:** 091–160.

**Exit fixture:** lobby → Turn 1 maintenance → Coordination → Turn 2 exactly
once; retry, reconnect, rollback, expiry, and damage history remain correct.

### Milestone 3 — Make roles, vessels, and the fleet economy playable

**Outcome:** every role enabled by the selected base roster has meaningful,
authorized work; mining, refining, production, repair, recharge, research,
upgrade, transfer, fighter, and specialist actions use their printed costs and
limits through shared vessel/role architecture.

**Depends on:** Milestones 1–2.

**Primary prompt neighborhood:** 161–280, with replacement and catastrophe
links in 140a–140g and 525–585.

**Exit fixture:** an all-roster capability matrix plus one multi-role economy
chain proves that each exposed control reaches a real authoritative result.

### Milestone 4 — Scout without leaking the organiser chart

**Outcome:** an entitled scout learns only the permitted system, mission,
hazard, or candidate information; the organiser chart and unrelated secrets
remain private.

**Depends on:** Milestones 1 and 3, selected-chart authority, and privacy-safe
projections.

**Primary prompt neighborhood:** 281–350, especially scouting and chart-state
prompts.

**Exit fixture:** success, range/turn denial, reconnect, and redaction cases on
at least two materially different scouting capabilities.

### Milestone 5 — Jump independently and recover from failure

**Outcome:** each ship can select a printed reachable destination, pay its own
fuel, move once per turn, update location/pursuit/logs, and recover truthfully
from invalid coordinates, damage, random failure, emergency jump, timeout, or a
facilitator adjudication.

**Depends on:** Milestones 1–4, navigation topology, damage, and pursuit.

**Primary prompt neighborhood:** 161–280 for per-vessel drives and 281–320 for
common navigation authority.

**Exit fixture:** reference and different-cost ships jump through the production
path; concurrent submissions and a reconnect cannot spend or move twice. The
jump button alone is not this milestone.

### Milestone 6 — Fly a shuttle and use it after arrival

**Outcome:** every enabled craft has a legal owner/host, departs, retargets from
its server-resolved position, appears truthfully on local DRADIS, arrives,
docks, transfers permitted cargo, and performs only its printed actions.

**Depends on:** Milestones 1–3 and airspace state.

**Primary prompt neighborhood:** 234–280 and 351–400, with integration proof in
423.

**Exit fixture:** ordinary transit, mid-flight retarget, restricted-airspace
denial/exception, Wolf parking, arrival, retry, and reconnect all agree.

### Milestone 7 — Complete an away mission

**Outcome:** eligibility, private cards, blind distribution, secret choices,
simultaneous totals, shuttle bonuses, facilitator cards, success/critical/
failure outcomes, rewards, overruns, and drop-off resolve without leaks.

**Depends on:** Milestones 3–6.

**Primary prompt neighborhood:** 401–424.

**Exit fixture:** one successful and one failed mission through the production
path, including reconnect and a hostile-system consequence.

### Milestone 8 — Operate and reunite a split fleet

**Outcome:** groups have independent location and pursuit, group-local DRADIS
and communication, legal taxi/fuel transfer, local actions, and an authoritative
same-system rejoin.

**Depends on:** Milestones 4–7.

**Primary prompt neighborhood:** 321–350 and proof prompt 424.

**Exit fixture:** two groups scout/jump/act without cross-group leakage, then
rejoin without losing pursuit, resources, passengers, or history.

### Milestone 9 — Resolve a Wolf attack and aftermath

**Outcome:** one GM prepares and triggers the attack from the GM console;
affected players resolve every eligible choice from their consoles; targeting,
all ranges, simultaneous actions, fighters, boarding, damage, casualties,
timeouts, retreat/return, salvage, repair, and aftermath use server-owned
outcomes, calculation receipts, intervention controls, and correct audience
projections.

**Depends on:** Milestones 2–3 and 6, authoritative group pursuit, damage
authority, and Wolf card data.

**Primary prompt neighborhood:** 425–484 plus 432a, 433a, 433b, 434a, recovery
621, and proof 645. Prompt 433a produces stable DRADIS-ready endpoints/events;
owner-deferred Prompt 605a visualization is not a playable-attack dependency.

**Exit fixture:** one GM and the affected player consoles complete an attack
through a usable aftermath with automatic routine math, reasoned recovery, and
correct privacy. Different destruction ranges produce their printed results,
a concurrent-GM race commits once, no client supplies target/roll/composition/
damage, and the DRADIS-ready schema passes without adding the deferred visual.

### Milestone 10 — Make hidden loyalties and deduction playable

**Outcome:** sabotage, homing, intel, suspicion, clues, investigation, arrest,
prisoner deadlines, release/execution, and replacement roles preserve private
and public boundaries while producing usable follow-on play.

**Depends on:** Milestones 1–3 and private result/audit projections.

**Primary prompt neighborhood:** 485–524.

**Exit fixture:** at least one loyal and one Wolf path complete through arrest
and replacement without leaking hidden truth or granting new arbitrary power.

### Milestone 11 — Recover from catastrophe without orphaning play

**Outcome:** jump failure, damage-deck exhaustion, population loss, unrest 8,
mutiny, arrest deadlines, and destroyed ships lead to exact evacuation, escape,
salvage, repair, reassignment, or terminal state rather than a stuck session.

**Depends on:** Milestones 2, 3, 5, 7, 9, and 10.

**Primary prompt neighborhood:** 140a–140g and 525–585.

**Exit fixture:** one recoverable catastrophe continues into a meaningful next
action; every unrecoverable case reaches an explicit outcome.

### Milestone 12 — Resolve crises and political decisions

**Outcome:** all configured crises, political capital, presidential actions,
elections, quarantine, approaching vessels, and facilitator calls resolve at
the correct phase with attributable authority.

**Depends on:** Milestones 1–3 and facilitator/broadcast contracts.

**Primary prompt neighborhood:** 193b, 524a–524d, and 525–540.

**Exit fixture:** every crisis reaches a legal resolution or escalation and a
reconnect cannot erase or duplicate the pending decision.

### Milestone 13 — Reach an explicit New Eden ending

**Outcome:** Ancient Jump Ring, Deep Nebula, and Ancient Space Station retain
their distinct preparation and attempt rules; candidate success, pursuit 10,
total loss, abandoned paths, and unresolved facilitator decisions produce a
durable outcome and closed debrief.

**Depends on:** Milestones 1–12.

**Primary prompt neighborhood:** 541–566 and final composition proofs 641–651.

**Exit fixture:** at least one candidate success and one terminal failure run
from lobby to closed debrief before the remaining candidate/configuration matrix
is claimed complete.

## Cross-cutting work is continuous

Prompts 586–640 are not a final polish phase. Apply their relevant requirements
to the first slice that exposes each surface:

- onboarding/help before a player must use the mechanic;
- visible return navigation and supported viewports with every new route;
- accessible names, focus, live regions, touch targets, contrast, and reduced
  motion with every UI change;
- authentication, membership, role/phase/revision checks, Firestore denial,
  private projections, server randomness, retry, and reconnect with every
  authoritative mutation;
- App Check, throttling, cost, observability, and overload behavior before the
  affected callable family is considered release-ready;
- capacity measurements only after the exercised gameplay loop is real.

## Review budget and evidence reuse

The 2026-09-08 audit found 213 evidence-oriented prompts (163 `[PRESERVE]` plus
50 `[PROVE]`) in the 713-prompt catalog. They protect real contracts, but they
must not create 213 independent review ceremonies.

Use this review budget for a normal slice:

1. **One selection preflight:** reconcile current `main`, the progress row,
   relevant tests, and printed sources once. Do not reread or re-audit unchanged
   global material for every adjacent prompt.
2. **One red/green implementation loop:** `[PRESERVE]` may close from current
   named evidence; `[EXTEND]`/`[NEW]` begins with the smallest missing failing
   acceptance; `[DECISION]` begins with the unresolved policy assertion.
3. **One risk-based review:** independent review is required for security,
   authorization, hidden information, randomness, destructive migration,
   endgame, capacity, or complex conflict resolution. It is optional for an
   ordinary low-risk slice whose focused evidence and machine gates are clear.
4. **One reconciled release gate:** self-review the final diff, run the
   executable gate once on the final reconciled SHA, then merge and push.

Evidence rules by tag:

| Tag | Efficient completion rule |
|---|---|
| `[PRESERVE]` | Reuse current named passing evidence. Batch adjacent evidence-only prompts in one documentation/tooling slice when no behavior changes. Do not create a product version, changelog, refactor, or independent review merely to re-prove unchanged behavior. |
| `[EXTEND]` / `[NEW]` | Test and implement one user-visible authoritative result. Reuse shared denial/retry fixtures; add only the cases the new surface changes. |
| `[PROVE]` | Run once at the milestone boundary after prerequisites are green. Compose production paths; do not rebuild or manually re-review every lower-level assertion. |
| `[DECISION]` | Record the source, chosen policy, owner, and affected prompts once; downstream prompts link to it. |

The final release-readiness audit aggregates current milestone and gate evidence.
It does not authorize a second manual rerun of every earlier review.

## 1.0 completion gate

The companion is complete only when all of the following are true:

- every supported base and expansion configuration casts valid roles and keeps
  base/Capybara identities isolated;
- every enabled role and vessel has meaningful, authoritative work inside at
  least one completed loop;
- a base game and Capybara game can each move from lobby through multiple turns,
  exploration, conflict, crisis, outcome, and closed debrief;
- every candidate success and terminal failure/recovery family has current
  production-path evidence;
- hidden information, direct-write denial, server-owned randomness, stale/
  duplicate commands, reconnect, and cross-group privacy are proven;
- all affected routes are usable by keyboard and touch across supported
  viewports with reduced motion;
- the 20-player/60-browser scenario is measured against real gameplay and its
  latency, errors, contention, recovery, usage, and cost are recorded;
- release, operations, incident, version, changelog, deployment, and rollback
  evidence is current and no placeholder or fictional control remains.

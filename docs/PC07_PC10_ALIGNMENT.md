# PC07–PC10 prompt alignment

**Owner-authorized planning change, 2026-09-30.** Apply this guide only to the
195 IDs already assigned to PC07–PC10 in the
[fixed completion allocation](CHECKPOINT_COMPLETION_PLAN.md#complete-baseline-allocation).
PC06 is in progress: its prompt definitions, allocation, statuses, evidence,
implementation and release work are outside this amendment. No implementation,
closure credit, deployment or gameplay proof is claimed here.

The catalog remains the definition and status authority. Each of these future
rows references this guide in its acceptance. Apply the requirements within
that row's own scope: a proof prompt verifies the behavior, a UI prompt presents
it, and an authority prompt enforces it. This reference does not create extra
prompt IDs, alter prerequisites or require unrelated features in every row.
The allocation stays **49 / 49 / 49 / 48**, with overall done targets
**605 / 654 / 703 / 751 of 751** for PC07 / PC08 / PC09 / PC10. Targets assume
prior closures remain valid; report a regression or carried shortfall honestly.

## Decisions carried forward

These are explicit owner decisions from conversations before and between
checkpoints, not new preferences inferred from old implementation descriptions.
The linked repository records carry their implementation context.

| Owner decision | Future acceptance effect |
|---|---|
| 2026-09-09–13: all player text belongs in the universe; use cycle and console; retain the CIC's space-console fonts. | Apply the [copy lexicon](PLAYER_COPY_LEXICON.md) and [aesthetic contract](AESTHETICS.md) to every new screen, result, warning and recovery message. Preserve printed proper names, actual data tables and internal wire fields. |
| 2026-09-10: preserve deliberate departures from the printed game and explain why. | Keep the [intentional deviation guards](INTENTIONAL_DEVIATION_GUARDS.md), including optional non-counting Press, optional additional GMs and separate base/expansion Capybara definitions. |
| 2026-09-11 and 13: split groups have independent information and operations under one shared session cycle/phase clock. | Group-local jumps, pursuit, rosters, communications and knowledge never become separate session clocks or implicit cross-group reads. |
| 2026-09-11: when all players disconnect, pause and resume the timer rather than resetting it. | Preserve remaining authoritative time through disconnection, interstitials and recovery; use the existing pause contract. |
| 2026-09-12–13: the ticker is always present, client scrolling stays local, and incoming priorities wait for visible text to finish. | Preserve ATC, Press and AEGIS source priorities, constant-speed local playback, Stand Down twice and no abrupt disappearance of visible copy under the [ticker contract](TICKER_BEHAVIOR.md). |
| 2026-09-23: committed sabotage first alerts the GM everywhere; GM acknowledgement and the clue decision precede the notice to every player console. | Retain P503a's intentional acknowledgement boundary and private details. Its experience review remains after 1.0 under [post-completion work](POST_PROMPT_COMPLETION_TASKS.md). |
| 2026-09-27–28: decide, log, keep going; the owner reviews by playing the UI; review feedback is optional under authorization. | Resolve routine source ambiguity in the [assumptions log](PRODUCT_MILESTONE_ASSUMPTIONS.md), provide a finished solo tour and continue under the [standing authorization](PRODUCT_MILESTONES.md#autonomous-execution-for-pc05pc10). |
| PC02–PC05 feedback: station selection, truthful DRADIS, dropouts, graceful restore and mandatory rendered typography. | Preserve the specific presentation and recovery corrections recorded in [checkpoint feedback](PRODUCT_MILESTONE_FEEDBACK.md). |
| PC04 feedback: automate every facilitator procedure that can be automated; one facilitator makes required choices and receives automated results in the GM log. | Remove manual arithmetic, result entry and relay from the normal workflow while retaining genuine choices, source rulings and deliberate intervention. |
| PC05: automatic Wolf assignment uses the confirmed real roster, even when nobody is eligible; Wolves are human survivors. | Preserve the configured roster's target without inventing absent players, and retain the approved onboarding sentence, “Wolf agents are humans, just like the other survivors.” |
| 2026-09-28–30: fixed closure accounting and coherent behavior groups with one accountable checkpoint owner. | Keep assigned IDs intact, use complete behavior briefs and current approved delegation policy, and report exact evidence and actual completion counts. No new dependency Git/CI gate is introduced by this guide. |

## Operating and presentation contract

**One facilitator can operate the normal workflow.** The console calculates
and commits source-defined results, records them in the GM log, and delivers
the appropriate information to each entitled console. Players make their own
choices. Facilitator input is reserved for required choices, rulings and
interventions. Reconnects and retries preserve committed results.

For each changed procedure, state who chooses, what the server calculates,
what commits, who learns the result, what the GM log records and how a retry or
reconnect resumes it. Source-defined rolls, costs, modifiers, damage, casualty
thresholds, benefit consumption, tallying and subsequent legal state changes
run automatically after the required choices are settled. Extra GMs remain
optional. Do not add a routine GM confirm/advance/transcribe button for each
calculation or force players to depend on a GM relay. Existing manual controls
may remain as explicit audited correction tools when their normal procedure
becomes automatic. A pause, override or correction retains current authority,
reason, revision and replay protections.

A source-required player choice stays with its entitled player. A genuine GM
choice, incomplete printed consequence or deliberate intervention stays
explicit. An unspecified timeout consequence must be source-backed or logged
as a bounded assumption before implementation; automation is not permission
to invent it. Physical facts the app cannot observe may need one minimal
confirmation, followed by automatic calculations and durable receipts.

Keep three audiences distinct: operational information for the affected crew;
the complete private GM calculation and intervention record; and approved
public facts made available to Press or the existing broadcast path. Press
chooses whether and how to publish its news. A Press handoff is not automatic
publication and does not grant private Wolf identity, suspicion, hidden dice,
mission hands, chart facts, deck order or GM notes. A GM inspecting a vessel
uses the established read-only default and explicit protected intervention
path. Other players' perspectives never become an observer role or new authority.

Ordinary players enter and change workspaces through the existing station/
console chooser. Role Select remains for authenticated GMs joining. Back and
recovery return to the proper chooser, with an explicit instruction to reselect
when station authority is lost. Preserve unsent input safely without retaining
or replaying unauthorized actions. Recovered projections replace stale cache;
resolved actions stay resolved, pending choices remain truthful and committed
random results never reroll. Cover dropouts across non-GM roles, not just
ordinary crew, and distinguish a sparse current roster from the full-table
proof still required at the final checkpoint.

Apply CIC language and typography to alerts, results, endings and errors as
well as primary screens. Retain the existing mandatory rendered typography
release gate at supported desktop, phone and short-landscape sizes, including
reduced motion. The default alert is exactly:

> RED ALERT // WOLF ATTACK IMMINENT ALL HANDS TO BATTLE STATIONS. NON-CREW MUST SHELTER IN PLACE UNTIL ALERT LIFTED

DRADIS keeps the first qualifying sweep's enlargement for its full existing
duration despite repeat sweeps. Every readable name remains inside the viewport
and bound to a visible contact: no early label or orphan name, including during
fade, reconnect and reduced motion. The minimized enlargement control remains
**Zoom** (or the approved magnifying-glass-plus icon). Reuse current truthful
contact projections and ticker behavior rather than introducing extra telemetry.

## Checkpoint amendments and representative UI checks

These checks guide a short, finished solo tour. Agents still prove every
assigned acceptance, ordinary authorized gameplay, privacy and multi-client
behavior; the owner is never asked to inspect code or perform rule arithmetic.

### PC07 — Airspace, split fleets and attack foundations

- **P336–350, P424 and P643:** keep one session clock while each group acts
  and learns independently. Choose the documented rejoin/pursuit policy once;
  calculate and audit merges automatically with no per-score transcription.
- **P432a and P433b:** the GM declares the attack and handles actual rulings;
  legal lifecycle progress follows committed choices and authoritative
  deadlines automatically. Entitled players act in their existing consoles.
- **P678:** send only facts the sender's ship already knows, to legal current
  recipients; all/subset controls never defeat split-fleet communication rules.
- **Tour:** can the owner distinguish their group's ships and messages, share
  known facts with a selected legal ship, follow a declared attack, and see the
  next genuine decision without repeatedly pressing GM advance?

### PC08 — Weapons, fighters and boarding

- **P389, P394–398 and P443–470:** automate source-defined rolls, costs,
  modifiers, losses and destruction after player choices. When these normal
  paths ship, raw fighter-count edits become correction tools rather than a
  required battle procedure.
- **P447, P448 and P455:** consume [PC07-A6](PRODUCT_MILESTONE_ASSUMPTIONS.md#pc07-a6--retain-successful-hits-beyond-legal-target-capacity)
  wherever the source action requires distinct legal targets. Preserve all
  committed successes and record excess hits unused; do not invent contacts,
  repeat damage or reroll. Each action retains its own printed target limit;
  this creates no shared deduplication across independent actions.
- **P464:** the incomplete leadership consequence remains an explicit GM
  ruling, surrounded by automatic boarding calculations and a private receipt.
- **P354–360, P423, P605 and P644:** preserve the DRADIS corrections through
  travel, attack parking, rejoin and responsive layouts. Contact work does not
  silently activate attack visualization.
- **Tour:** can the owner choose a valid weapon/wing action, understand its
  committed result and boarding state, and read contact names on desktop and
  phone without asking the GM to enter a roll or fighter loss?

### PC09 — Aftermath, deduction, visits and crises

- **P474, P477, P484, P524b and P539:** publish entitled crew outcomes, complete
  private GM receipts and only audience-safe news for Press; political news and
  casualty information do not automatically reveal private causes or votes.
- **P503a:** preserve private alert, GM acknowledgement/clue handling and then
  the actor-free all-player notice. This intentional human step is not a
  regression against the automation goal; experience review stays after 1.0.
- **P517:** follow PC09-A1: one GM attests the otherwise unobservable VIP Host
  Team Time visit, then the server grants and consumes the printed maintenance
  reroll. Browsing a console or docking a shuttle does not establish the visit.
- **P524c:** follow PC09-A2: the President selects a ship during Coordination,
  and the server atomically spends one political capital and reduces unrest by
  one. Do not conflate this with the VIP Host's Team Time ability.
- **P537–538:** configure genuine election policy before opening ballots;
  eligibility, configured weighting, tally and office changes then run once
  automatically, with secret ballots remaining private.
- **Tour:** can the owner follow an aftermath, distinguish crew news from
  Press publication, confirm the required visit, operate an election and see
  sabotage's acknowledgement sequence without private information appearing?
- **P605a activation boundary:** PC09 owns this assigned ID, but explicit owner
  activation and P433a's endpoint/schema/privacy proof remain prerequisites.
  This planning authorization does **not** activate it. Surface that decision
  before PC09 closure work; deferral earns no closure credit, cannot remove
  the ID or lower 703/751, and does not block the playable attack exit gate.
  Continue independent work while resolving it under existing policy.

### PC10 — Endings, integration and full-game proof

- **P181, P215b, P223b and P233b:** finish real actions inside the existing
  workspace and chooser, including current authority, results and Back.
- **P543:** the visible preparation marker is **Cycle 6**. Internal turn fields
  and printed source citations retain their technical meaning.
- **P548, P553 and P563–566:** automate resolved candidate outcomes while
  preserving genuine sabotage/adjudication choices and the documented fleet
  success policy. Debrief does not make private loyalties, decks, hands or GM
  notes public by default, including after closure.
- **P584–585, P618, P620 and P641–642:** retain full core/Capybara proof, add
  sparse-roster continuation and role dropout/recovery, preserve automatic
  Wolf assignment and variant isolation, and keep extra GMs and Press optional.
- **P651:** audit all 751 acceptances with current evidence, exact final build,
  truthful counts and no placeholder controls. Separate local tests, rendered
  QA, CI, deployment and ordinary authorized play. A tour is presentation
  evidence; a missing authenticated local/emulator gameplay path remains an explicit evidence gap.
- **Tour:** can the owner prepare each distinct candidate, understand why a
  choice succeeds or fails, recover a workspace after disconnection and read
  the permitted ending/history without accounts switching or a recruited table?

## Execution and evidence

The checkpoint owner shapes each tranche from the current catalog, dependencies,
feedback and source-backed assumptions, then carries its complete acceptance
through implementation and release. Group independent work by complete behavior
and agreed interfaces using the current authorized model policy. Apply existing
independent authority/privacy review where required; this documentary amendment
adds no mandatory reviewer cycle, testing system or release gate.

Use focused meaningful tests and the established rendered/release checks for the
changed behavior. Provide a genuine solo path or an isolated, clearly labeled
review scene with no live writes. Supply numbered in-app checks, new assumptions
first, exact build/review access, actual closure counts and a short summary of
agent-owned gameplay evidence. Routine UI feedback or a completed walkthrough
is not required to continue under standing authorization. Keep explicit feature
exclusions and separate 0.9.x/1.0.0 authorization intact.

After catalog edits regenerate its Markdown views and the PC07–PC10 Gantt
HTML/JSON/CSV. The chart remains a derived dependency projection; its status
snapshot is not a second completion ledger. Preserve PC06 as the entry
prerequisite and PC10 as the fixed endpoint.

## Current proof standard — October 2 owner correction

“All future will use local emulator” supersedes the earlier PC07-only evidence
exception. Every current and future checkpoint criterion uses meaningful
authenticated local/emulator native handlers, normal HTTP/UI and rules evidence
as appropriate. Production-GM gameplay is not required for closure. Functional
criteria, source/authority/privacy/recovery, fixed counts, independent risk
review, CI and production deployment are retained. Synthetic review scenes
remain presentation only. PC10's full-table, end-to-end and actual ending proof
may use local/emulator clients; version authorization and P605a exclusion stay
intact. See the current policy in Product Milestones.

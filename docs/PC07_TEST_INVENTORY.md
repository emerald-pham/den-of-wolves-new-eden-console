# PC07 test inventory

Compared with current-main baseline `5e3d09d56a50aa712406a6f3cb6b64a81e70418e`. New behavior has discriminating test-only commits before implementation; the execution record and retained external red/green logs record those boundaries. No test was skipped or deleted to pass this checkpoint. Existing fixture migrations supply current roles, physical groups, query snapshots, headers and subscriptions instead of weakening authority, arithmetic, privacy or presentation assertions.

Native handler tests, mock-based unit tests, normal authenticated emulator gameplay and prepared rendered scenes retain their distinct evidence labels. Release progress tests intentionally fail at the old556 snapshot before the fixed49 metadata change. Final full validation and CI are separate release gates.

## functions/src/awayMissionCallable.test.ts

Updated suite: 2 new cases and 0 changed existing cases.

New cases:

- continues a mission after rejoin and resplit from the leader’s current physical group, preserving P403 lineage
- denies rejoined mission continuation without valid current group authority: %s

## functions/src/fleetGroupOperations.test.ts

Added suite: 2 new cases and 0 changed existing cases.

New cases:

- automatically rejoins only groups at the same authoritative system and keeps the highest recorded pursuit
- shares only server-owned scanned coordinates to an explicit current-group ship subset

## functions/src/fleetGroups.test.ts

Updated suite: 0 new cases and 1 changed existing cases.

Updated cases (existing success/denial assertions remain):

- keeps retries idempotent and rejects malformed or duplicate membership

## functions/src/fleetPartition.test.ts

Updated suite: 1 new cases and 1 changed existing cases.

New cases:

- never reuses an absorbed group identity when a reunited fleet splits again

Updated cases (existing success/denial assertions remain):

- partitions the complete current group by authoritative coordinates and preserves private knowledge

## functions/src/fleetTaxiTransfer.test.ts

Added suite: 2 new cases and 0 changed existing cases.

New cases:

- moves at most two current anchor passengers to the selected destination group in one taxi attempt
- moves fuel atomically in units of one or two, without changing group membership

## functions/src/jumpCallable.test.ts

Updated suite: 6 new cases and 1 changed existing cases.

New cases:

- increments manual-location navigation from its global cursor, independently of the vessel action revision
- rejects a %s shared navigation cursor before manual-location writes
- advances the current topology revision independently after taxi transfers and replays without writes
- preserves both independent revisions when a physical partition confirmation changes nothing
- denies a malformed or exhausted current topology revision (%s) before any partition write
- reattaches a validated in-flight shuttle to the rejoined current group exactly once

Updated cases (existing success/denial assertions remain):

- blocks jump and movement from a lifted phase with %s Wolf attack state

## functions/src/maintenanceCallable.test.ts

Updated suite: 0 new cases and 2 changed existing cases.

Updated cases (existing success/denial assertions remain):

- rejects illegal phase transitions and advances only valid numbered turns with the configured schedule
- commits one server-owned Coordination completion announcement with the next-turn state

## functions/src/memberSession.test.ts

Added suite: 10 new cases and 0 changed existing cases.

New cases:

- uses the live group tuple and rejects disconnected or stale membership
- retains the one shared clock and only current group vessel and craft state
- removes craft immediately when its authoritative host moves to another group
- provides Press only the shared public header, without operational maps
- does not spread newly introduced private fields into the public DTO
- keeps validated hosted small vessels with their current group and withdraws foreign hosts
- keeps Voyage admission and maintenance at its validated current host without coordinates
- preserves repair usage without disclosing other-group host details or GM alert recipients
- redacts previous foreign hosts in %s while retaining its printed usage count
- keeps prior drone/recharge usage without foreign host or system details

## functions/src/memberSessionCallable.test.ts

Added suite: 4 new cases and 0 changed existing cases.

New cases:

- keeps only the current Press holder’s own SNN operations through docking and transit

- reads live membership and state atomically with no caller-selected audience
- denies wrong actor, disconnected actor, kicked actor and malformed membership
- tracks actual craft group while in transit and removes it after foreign arrival

## functions/src/navigationProjection.test.ts

Updated suite: 2 new cases and 0 changed existing cases.

New cases:

- uses server-only current-group berth for the passenger own discovery projection
- projects only committed mission craft carried by the current fleet group

## functions/src/scoutAutomaticResolution.test.ts

Added suite: 10 new cases and 0 changed existing cases.

New cases:

- resolves the current Comms player choice without any GM identity or extra input
- deduplicates a retried event and preserves the first timestamp and map publication
- delivers the committed fact only to its requester while a disconnected requester can recover later
- lets the protected GM recovery path replay an automatic result without overwriting its authority
- fails closed before publication for %s
- does not process deletion, request mutation or a closed session
- rejects a malformed stored automatic audit instead of manufacturing a replay
- returns a bounded result log to an owned live GM without chart or identity fields
- denies a player, wrong instance, stale GM and caller-chosen audience
- replays the immutable resolution after a group merge without moving its original note or republishing

## functions/src/scoutTaxiCommunicationCallable.test.ts

Updated suite: 8 new cases and 0 changed existing cases.

New cases:

- denies malformed or exhausted topology authority before a %s taxi can write (%s)
- commits one legal passenger taxi with a Firestore-safe audit and exact replay
- denies an out-of-range passenger taxi without any write
- atomically taxis fuel only between current groups and reconciles an exact retry once
- rejects taxi %s before any write
- shares only scanned systems into current-group private ship projections and retries once
- denies known-system share with %s before any write
- returns server-current ships only for the requesting fleet group and denies a forged group

## functions/src/sessionComposition.test.ts

Updated suite: 0 new cases and 3 changed existing cases.

Updated cases (existing success/denial assertions remain):

- parks a travelling shuttle atomically when the ordinary airspace deadline catches up at advanceTurn
- keeps a late arrival from stealing the deadline host before the delayed parking task runs
- completes Team and Coordination through Turn 2 exactly once on the production callable path

## functions/src/singlePlayerDemoCallable.test.ts

Updated suite: 0 new cases and 1 changed existing cases.

Updated cases (existing success/denial assertions remain):

- starts Turn One for the only connected player and writes the shared transition

## functions/src/terminalFreezePolicy.test.ts

Updated suite: 0 new cases and 0 changed existing cases.
Existing cases are retained; shared fixtures, current authority inputs or source binding changed.

## functions/src/turnInterstitial.test.ts

Added suite: 2 new cases and 0 changed existing cases.

New cases:

- captures the committed Team duration, parses it and resumes only the exact held transition
- does not relabel a genuine emergency or an empty-session hold

## functions/src/turnInterstitialCallable.test.ts

Added suite: 3 new cases and 0 changed existing cases.

New cases:

- commits one exact resume, one safe event and a private receipt, then replays without writes
- denies wrong actor before replay and conflicting fingerprints without a resume
- rejects stale, malformed and unrelated holds with no writes

## functions/src/wolfAttackAudience.test.ts

Added suite: 3 new cases and 0 changed existing cases.

New cases:

- publishes stable current progress and only committed audience-safe results
- omits results until a server-committed range receipt exists
- fails closed on malformed private state and rejects injected hidden fields

## functions/src/wolfAttackDeclarationCallable.test.ts

Updated suite: 9 new cases and 5 changed existing cases.

New cases:

- declares against the five configured active vessels in an ordinary eight-player base roster
- parks targeting until the admitted charged Gorgoneion Captain records the pre-target choice
- requires a reason and danger confirmation, then replays only the same scoped recovery
- rejects a stored recovery receipt whose nested revision or rollback delta is malformed
- rejects a reasoned recovery after the authoritative Coordination deadline
- requires reasoned revision-bound replay for emergency pause and resume during an attack
- rejects an attack-clock intervention from a stale attack revision without a receipt
- denies ordinary timer extension and cycle-skip controls while an attack is declared
- keeps the declaration clock authoritative and rejects post-declaration extension

Updated cases (existing success/denial assertions remain):

- advances targeting only after the assigned Commander finishes and preserves the private receipt and deadline
- rejects client outcomes, a stale GM instance, and a stale targeting revision without writes
- does not advance targeting while the current emergency timer is paused
- uses the resumed server-owned airspace deadline and rejects a paused advance without writes
- does not overwrite a private targeting audit when its command receipt is missing

Previous case names (migration explained below):

- uses the current server-owned airspace deadline after a restricted-window extension

## functions/src/wolfAttackForceField.test.ts

Added suite: 2 new cases and 0 changed existing cases.

New cases:

- requires the charged Captain to choose an active fleet target before dice are rolled
- rejects an inactive target and does not fabricate a choice when the projector is not charged

## functions/src/wolfAttackLifecycle.test.ts

Added suite: 3 new cases and 0 changed existing cases.

New cases:

- derives only charged, undamaged base AEGIS weapons and applies installed upgrades
- locks all range dice before revealing only hit slots, then applies assignments without rerolling
- enforces each printed step in order and validates the entitled boarding defence count

## functions/src/wolfAttackPreparationCallable.test.ts

Updated suite: 1 new cases and 0 changed existing cases.

New cases:

- audits legacy player-action preparation markers as inert choices

## functions/src/wolfAttackRangeCallable.test.ts

Added suite: 27 new cases and 0 changed existing cases.

New cases:

- continues a real five-ship targeting receipt into automatic unavailable EO ranges
- returns only current source-derived actions and opaque target contacts to the entitled Executive Officer
- publishes a private GM decision summary with configured-but-disconnected roles distinct from unavailable actions
- denies the EO range projection after the current berth moves away from AEGIS
- denies use/pass writes after the EO has taxied away from AEGIS
- locks one server-generated Long Range attack once and assigns it without rerolling
- reconstructs a partially selected Medium Range lock after an entitled reconnect
- caps excess server hits at the live distinct contacts and preserves the private full-hit receipt
- commits an empty target assignment when Short Range has no legal live contacts
- records an explicit range pass in the final receipt and member-safe results
- records an explicit pass, rejects stale/wrong-phase/wrong-actor writes, and honors pause
- opens Long Range automatically when targeting has no Commander and no available C&C choice
- does not run automatic attack progression through any current session pause
- marks a charged range unavailable and continues when the fleet configuration has no Executive Officer
- keeps a charged range pending while the configured Executive Officer is disconnected
- does not leave charged Command and Control ownerless when no Executive Officer is configured
- commits only the target ship crew boarding choice, reserves teams, then auto-resolves and reopens once
- keeps boarding pending through disconnect and scopes the projection to the current mapped berth
- reads casualty alert audiences before any final boarding write under Firestore transaction ordering
- bounds the boarding choice by current resources and holds it during a session pause
- requires the current Gorgoneion Captain to choose or pass before targeting rolls are exposed
- records an explicit Force Field pass and denies stale or lost-host writes
- limits Force Field targets to active ships in the current Captain group
- fails closed on an unsupported %s without spending or fabricating a projector use
- checks current Captain group authority before replaying an unchanged Force Field request
- replays a committed Captain choice after automatic %s progression without new writes or dice
- rolls targeting once after the committed Captain choice and continues from the server receipt

## functions/src/wolfAttackTargetRing.test.ts

Added suite: 3 new cases and 0 changed existing cases.

New cases:

- uses the canonical five active full ships for a valid 8–11 player base roster
- preserves the printed six- and seven-target rings when all ships are active
- does not admit inactive targets or tolerate omission of another required core vessel

## functions/src/wolfAttackTimerRequest.test.ts

Added suite: 9 new cases and 0 changed existing cases.

New cases:

- preserves ordinary pause and resume envelopes without fabricating attack authority
- retains all validated authority fields for reasoned pause and resume
- requires the whole attack intervention when only %s is present
- rejects a malformed stable request identity: %s
- rejects a non-positive or unsafe attack revision: %s
- rejects an unbounded or noncanonical reason: %s
- accepts the exact reason boundaries and retains canonical retry identity behavior
- requires explicit danger confirmation: %s
- retains shared clock and GM-instance validation

## functions/src/wolfCombatMath.test.ts

Updated suite: 5 new cases and 0 changed existing cases.

New cases:

- caps excess range hits at distinct live contacts and records the unused hits
- records successful hits as unused when no live legal contact remains
- keeps expanded Capybara destruction, boarding, and fleet damage in the configured ring
- finalizes committed ranges without rerolls and applies the pre-target Force Field to final damage
- calculates complete attack receipts over a configured five- or seven-target ring

## functions/src/wolfCommandAndControlCallable.test.ts

Updated suite: 2 new cases and 1 changed existing cases.

New cases:

- lets the current EO explicitly pass optional C&C and automatically advances targeting
- keeps an explicit C&C pass terminal before the automatic stage trigger runs

Updated cases (existing success/denial assertions remain):

- preserves an authorized C&C redirect when the facilitator closes targeting

## scripts/deployment-targets.pc07.test.mjs

Added suite: 5 new cases and 0 changed existing cases.

New cases:

- PC07 solo review is an explicit Hosting entry
- new briefing authority helper selects both clear and all clock-advance consumers
- new briefing callable factory selects the real deployed adapter and rejects source drift
- reconciled PC07 index rejects any change outside the full source consumer audit
- every changed PC07 runtime module has an exact bounded consumer audit

## scripts/deployment-targets.test.mjs

Updated suite: 0 new cases and 4 changed existing cases.

Updated cases (existing success/denial assertions remain):

- maps the final PC06 shared index from the actually deployed 0.5.62 source
- maps the GM window repair from its reviewed owner source and rejects extra runtime edits
- maps every changed PC06 runtime module from the actual deployed build together
- maps the new private Voyage storage helper to every callable that reads or migrates it

## scripts/test-gm-ship-access-layout.mjs

Updated suite: 0 new cases and 1 changed existing cases.

Updated cases (existing success/denial assertions remain):

- GM ship access stays pointer-reachable beside the ship identity and preserves DRADIS zoom

## scripts/test-pc07-airspace-http.mjs

Added scenario harness; its assertions cover the ordinary emulator or prepared geometry boundary named by the script.

## scripts/test-pc07-attack-choice-layout.mjs

Added suite: 1 new cases and 0 changed existing cases.

New cases:

- actual Captain, EO and target-crew choices remain readable and usable in eight viewport/motion cases

## scripts/test-pc07-briefing-layout.mjs

Added suite: 1 new cases and 0 changed existing cases.

New cases:

- cycle briefing clearance stays visible, reachable and readable in every viewport and motion mode

## scripts/test-pc07-briefing-recovery-layout.mjs

Added suite: 1 new cases and 0 changed existing cases.

New cases:

- held briefing and recovery messages remain readable without covering the transmission

## scripts/test-pc07-clock-http.mjs

Added scenario harness; its assertions cover the ordinary emulator or prepared geometry boundary named by the script.

## scripts/test-pc07-full-attack-http.mjs

Added scenario harness; its assertions cover the ordinary emulator or prepared geometry boundary named by the script.

## scripts/test-pc07-intervention-layout.mjs

Added suite: 1 new cases and 0 changed existing cases.

New cases:

- actual GM attack intervention forms stay readable and reachable in eight responsive/motion cases

## scripts/test-pc07-maintenance-matrix.emulator.mjs

Added scenario harness; its assertions cover the ordinary emulator or prepared geometry boundary named by the script.

## scripts/test-pc07-member-history-http.mjs

Added scenario harness; its assertions cover the ordinary emulator or prepared geometry boundary named by the script.

## scripts/test-pc07-navigation-http.mjs

Added scenario harness; its assertions cover the ordinary emulator or prepared geometry boundary named by the script.

## scripts/test-pc07-normal-ui.mjs

Added scenario harness; its assertions cover the ordinary emulator or prepared geometry boundary named by the script.

## scripts/test-pc07-scene-layout.mjs

Added suite: 1 new cases and 0 changed existing cases.

New cases:

- PC07 prepared scene keeps all five checks usable and isolated in eight responsive/motion cases

## scripts/test-pc07-split-http.mjs

Added scenario harness; its assertions cover the ordinary emulator or prepared geometry boundary named by the script.

## src/App.test.tsx

Updated suite: 2 new cases and 0 changed existing cases.

New cases:

- withdraws the previous group operational data immediately when current membership changes
- retains the protected GM navigation revision with its maps across a shared header update

## src/PC07AttackChoicesReview.test.tsx

Added suite: 6 new cases and 0 changed existing cases.

New cases:

- lets the owner choose a local Captain target in the actual prepared presenter
- retains the real explicit range pass and target assignment controls
- requires an explicit boarding count including zero in the real prepared presenter
- shows truthful readonly GM presence and withdraws the prepared private summary offline
- uses the actual local Commander presenter for a selected reroll and explicit finish
- uses the actual optional C&C presenter with an explicit prepared pass

## src/PC07ReviewScene.test.tsx

Added suite: 8 new cases and 0 changed existing cases.

New cases:

- provides the five numbered solo checks and explicit navigation without a live session
- uses group-local contacts and notes and immediately removes contacts for a cached sample
- offers only scanned locations and current local recipients in the known-system sample
- shows a bounded taxi payload, one-attempt recovery and an explicit rejoin result
- renders committed safe attack results and offers genuine use, pass and recovery samples
- retains a reusable charged combat console in the prepared use result
- keeps the actual held-clock presentation isolated from an existing signed-in identity
- lets the owner see the prepared automatic Comms report and GM result log together

## src/components/AegisCommandAndControlPanel.test.tsx

Updated suite: 7 new cases and 0 changed existing cases.

New cases:

- withdraws C&C targets after server disconnect despite a delayed live targeting callback

- offers an explicit pass and records that no target was redirected
- withdraws an old target list when the current EO identity changes
- does not hydrate a late redirect after the current Executive Officer changes
- withdraws the EO targets immediately when console authority is locked after a successful read
- withdraws private EO targets when the connection or snapshot freshness is lost
- withdraws EO targets when the server advances beyond targeting

## src/components/AirspaceControlAuthority.test.tsx

Added suite: 6 new cases and 0 changed existing cases.

New cases:

- allows a current restricted Press choice but immediately withdraws it for cached authority
- keeps Press choice unavailable behind every authoritative timer hold
- announces a committed restriction or reopening as one current accessible state
- keeps a denial visible and allows a fresh explicit retry without announcing clearance
- does not claim Press movement clearance from cached or globally held authority
- withdraws a delayed denial when the current %s changes

## src/components/AllyRepairPanel.test.tsx

Updated suite: 1 new cases and 0 changed existing cases.

New cases:

- keeps the second-host fuel requirement when the first host is in another group

## src/components/AppHeader.test.tsx

Updated suite: 0 new cases and 2 changed existing cases.

Updated cases (existing success/denial assertions remain):

- opens a readable changelog in a bounded scroll region from settings
- renders current and retained repair history with progress and keyboard stop intact

## src/components/ChacauRepairPanel.test.tsx

Updated suite: 1 new cases and 0 changed existing cases.

New cases:

- retains the two-host limit when prior repair hosts are outside the current group

## src/components/EmergencyTimerAttack.test.tsx

Added suite: 3 new cases and 0 changed existing cases.

New cases:

- requires an attack reason and three deliberate confirmations bound to the attack revision
- withdraws the old reason and confirmation sequence when revision or GM authority changes
- preserves the established three-confirmation non-attack command

## src/components/EmergencyTimerBriefing.test.tsx

Added suite: 1 new cases and 0 changed existing cases.

New cases:

- keeps emergency resume unavailable for a committed briefing hold

## src/components/FleetAlert.test.tsx

Updated suite: 0 new cases and 1 changed existing cases.

Updated cases (existing success/denial assertions remain):

- rehydrates the live timer and permitted actions from the same server phase after reconnect

## src/components/FleetGroupWorkspace.test.tsx

Updated suite: 4 new cases and 0 changed existing cases.

New cases:

- shares only a known coordinate to selected ships from the fresh current-group projection
- offers a legal taxi payload form and reports the server committed fuel result
- lets the current taxi owner select at most two connected members from the server scoped group roster
- keeps sharing and taxi controls compact, adjacent to their labels, and tappable on short viewports

## src/components/GmWolfDecisionSummary.test.tsx

Added suite: 8 new cases and 0 changed existing cases.

New cases:

- shows a genuine disconnected choice as pending with server-reconciled presence
- explains source-unavailable choices without inventing a disconnected actor
- renders the actual Captain target with a printed vessel name
- shows current range choices and hit assignment without exposing dice or private composition
- withdraws a range summary that belongs to another stage
- shows every current target crew boarding choice and committed security count
- withdraws all private choices when the current GM snapshot is unavailable and restores only new data
- labels a missing current summary as awaiting refresh and never substitutes an unavailable decision

## src/components/GorgoneionRepairDronesPanel.test.tsx

Updated suite: 1 new cases and 0 changed existing cases.

New cases:

- keeps current-cycle use consumed when previous foreign host details are withheld

## src/components/MacawRepairPanel.test.tsx

Updated suite: 1 new cases and 0 changed existing cases.

New cases:

- retains the two-host limit when prior hosts are redacted after a split

## src/components/PhiliaRepairPanel.test.tsx

Updated suite: 1 new cases and 0 changed existing cases.

New cases:

- respects redacted prior repair usage without showing foreign host details

## src/components/ScoutRequestControls.test.tsx

Updated suite: 1 new cases and 0 changed existing cases.

New cases:

- records only a coordinate request and awaits automatic private delivery

Previous case names (migration explained below):

- records only a coordinate request and leaves follow-up with a facilitator

## src/components/ScoutResultControllers.test.tsx

Updated suite: 3 new cases and 1 changed existing cases.

New cases:

- receives an automatic result without a player refresh or GM reveal
- shows the automatic GM result log and labels manual resolution as recovery
- delivers the Comms Officer automatic report in its current replacement station

Updated cases (existing success/denial assertions remain):

- lets the Scientist revisit an older saved report one fact at a time

## src/components/ScoutResultPanels.test.tsx

Updated suite: 0 new cases and 1 changed existing cases.

Updated cases (existing success/denial assertions remain):

- shows a pending Scientist request without a chart fact

## src/components/ShipPlotLocalAuthority.test.tsx

Added suite: 1 new cases and 0 changed existing cases.

New cases:

- fails closed until group navigation is available in the actual ShipPlot consumer

## src/components/ShipPlotReviewSafety.test.tsx

Added suite: 1 new cases and 0 changed existing cases.

New cases:

- allows an isolated review to reuse expanded DRADIS without exposing live GM effects

## src/components/ShuttleMovementAuthority.test.tsx

Added suite: 4 new cases and 0 changed existing cases.

New cases:

- rebinds a route listener denied before the flight existed after the holder commits its departure
- withdraws a selected cached route and restores it only from current server clearance
- keeps a mission-committed craft docked under otherwise open current airspace
- shows a consumed service recharge without inventing a withheld host or console name

## src/components/TurnStartInterstitial.test.tsx

Added suite: 2 new cases and 0 changed existing cases.

New cases:

- restores an uncleared interstitial on reconnect, hides its timer and exposes one explicit clear
- keeps the same clear identity after a temporary error and blocks offline dismissal

## src/components/WarriorRepairDronesPanel.test.tsx

Updated suite: 1 new cases and 0 changed existing cases.

New cases:

- keeps current-cycle use consumed when previous foreign host details are withheld

## src/components/WolfAttackChoiceAuthority.test.tsx

Added suite: 9 new cases and 0 changed existing cases.

New cases:

- withdraws $name controls on server disconnect even if a late callback reports live freshness (Captain, AEGIS range, boarding)

- withdraws a displayed Force Field choice as soon as live authority or berth changes
- ignores a Force Field mutation reply after its Captain authority is replaced
- withdraws an already displayed Force Field choice when a current server refresh is denied
- serializes range reads and ignores obsolete failed reads while applying the latest matching step
- withdraws an AEGIS range choice when the active console or member freshness changes
- withdraws range controls when a current fleet-group berth or connection generation changes
- ignores a boarding mutation reply after the attack or current fleet berth changes
- preserves choice drafts on same-revision refreshes and resets them when authority changes

## src/components/WolfBoardingDefencePanel.test.tsx

Added suite: 2 new cases and 0 changed existing cases.

New cases:

- requires a real target-crew choice from zero through current Security Team inventory
- shows the committed defence after reconnect without reopening the choice

## src/components/WolfCommanderTargetingPanel.test.tsx

Updated suite: 6 new cases and 0 changed existing cases.

New cases:

- withdraws Commander dice after server disconnect despite a delayed live targeting callback

- does not let an enabled fixture prop grant Commander authority
- withdraws private dice when the Commander connection or freshness is lost
- withdraws the current private dice after an authorized refresh is rejected
- does not hydrate a late reroll reply after the current Commander changes
- does not hydrate an old targeting response into a replacement Commander identity

## src/components/WolfForceFieldChoicePanel.test.tsx

Added suite: 2 new cases and 0 changed existing cases.

New cases:

- requires the Captain to choose a current group target or explicitly pass before targeting
- shows committed use and pass as final while keeping a disconnected choice pending

## src/components/WolfRangeActionPanel.test.tsx

Added suite: 4 new cases and 0 changed existing cases.

New cases:

- requires a deliberate use or pass choice and explains the authoritative deadline
- restores fixed hit counts, hides unavailable contacts, and requires distinct targets per action
- commits only distinct live contacts and clearly records over-limit hits as unused
- allows an empty assignment only when every target is unavailable

## src/components/localDradisContacts.test.ts

Added suite: 3 new cases and 0 changed existing cases.

New cases:

- renders only arrived ships matching both authoritative coordinate and group
- consumes only server sampled transit coordinates and never gives animation destination authority
- drops destroyed contacts without deriving another fleet from catalog defaults

## src/config/implementationProgress.test.ts

Updated suite: 2 new cases and 0 changed existing cases.

New cases:

- preserves the fixed PC06 closures and its historical release allocation
- closes exactly the fixed PC07 allocation and reaches its cumulative target

Previous case names (migration explained below):

- records all fixed PC06 IDs as earned closures without counting PC07 taxi scope

## src/lib/blacksmithRepairService.test.ts

Updated suite: 1 new cases and 0 changed existing cases.

New cases:

- preserves current repair revision when earlier foreign host details are withheld

## src/lib/firestore.test.ts

Updated suite: 13 new cases and 0 changed existing cases.

New cases:

- hydrates the entitled independent SNN docking and visits without foreign vessel maps or invented transit docks
- rejects a pending member reply after the server actor becomes %s and waits for current reconnect (disconnected, missing, kicked)

- does not invent foreign resources or Press docking from a current member session scope
- carries the current fleet partition revision through member hydration for real navigation commands
- uses the current member read feed without subscribing to a raw session root
- hydrates the bounded Philia repair receipt through the member wire parser
- hydrates bounded craft histories without resetting usage or inventing foreign hosts
- rejects an old group response after the current player moves and accepts the new group read
- never hydrates a response for another authenticated actor
- hydrates the complete GM-private attack state and keeps its revision monotonic
- hydrates the pre-target Force Field decision without exposing targeting and validates its committed receipt
- strictly parses the private GM decision summary and rejects unknown decision fields
- hydrates only a valid local mission craft allowlist from the private member discovery projection

Previous case names (migration explained below):

- hydrates only the safe GM declaration summary and keeps its revision monotonic

## src/lib/firestore.wolfAttackAudience.test.ts

Added suite: 4 new cases and 0 changed existing cases.

New cases:

- withdraws an unsafe future member schema and fences out older raw revisions
- withdraws a cached member snapshot and does not restore it from an older server event
- withdraws a stale cached event but accepts the matching authoritative server revision again
- withdraws malformed audience data without a raw revision and waits for a newer valid revision

## src/lib/scoutResultService.test.ts

Updated suite: 1 new cases and 0 changed existing cases.

New cases:

- parses only the bounded GM scout log and rejects identity or chart fields and stale leases

## src/lib/sessionService.test.ts

Updated suite: 1 new cases and 1 changed existing cases.

New cases:

- reads the current boarding choice and commits the exact entitled zero-team decision

Updated cases (existing success/denial assertions remain):

- advances only the revision-bound private Wolf stage through the current GM instance

## src/lib/turnInterstitialService.test.ts

Added suite: 3 new cases and 0 changed existing cases.

New cases:

- calls the normal endpoint from current authority and accepts its resumed clock
- rejects cache or an obsolete hold before calling
- does not apply a delayed clear after %s

## src/lib/useFleetGroupNavigation.test.tsx

Added suite: 4 new cases and 0 changed existing cases.

New cases:

- connects the current group endpoint to a fresh live consumer
- has no navigation for cache or a disabled catalog consumer
- drops a late response after group/identity changes and never restores an old sample
- clears an accepted projection immediately when reconnect needs server authority

## src/lib/wolfAttackRecovery.test.ts

Added suite: 4 new cases and 0 changed existing cases.

New cases:

- submits a trimmed reason, explicit danger confirmation and current revision
- denies an invalid reason before any callable: %s
- denies absent danger confirmation before any callable
- rejects %s in the recovery reply

## src/lib/wolfAttackTimerIntervention.test.ts

Added suite: 4 new cases and 0 changed existing cases.

New cases:

- binds the attack pause command to reason, confirmation, revision and idempotency
- denies %s before requesting an attack pause
- rejects %s without hydrating a new clock
- does not hydrate a late attack pause after GM instance replacement

## src/lib/wolfCommanderSessionService.test.ts

Updated suite: 2 new cases and 1 changed existing cases.

New cases:

- sends an explicit C&C pass and accepts only the correlated no-redirect receipt
- rejects a C&C redirect receipt from a different submitted request

Updated cases (existing success/denial assertions remain):

- accepts only a privacy-safe committed redirect bound to current Executive Officer authority

## src/routes/GmConsole.test.tsx

Updated suite: 5 new cases and 4 changed existing cases.

New cases:

- stages the private composition with automatic server targeting
- blocks ordinary cycle and window overrides while the attack is declared
- normal preparation reserves source-owned targeting choices for the entitled players
- connects current server attack decisions to the GM and withdraws them when the snapshot goes offline
- ignores an abandoned GM attack callback after this browser claims another instance

Updated cases (existing success/denial assertions remain):

- lets the facilitator mark and resolve the approximate Wolf window without starting combat
- lets the live GM close targeting and enter Long Range on the existing attack deadline
- ignores a late Long Range receipt after the active GM instance changes
- requires three deliberate confirmations to pause and resume the emergency timer

Previous case names (migration explained below):

- stages a private card and target draft through the GM-only preparation panel

## src/routes/RoleSelect.test.tsx

Updated suite: 1 new cases and 0 changed existing cases.

New cases:

- waits for current member authority before enabling a named GM claim after reload

## src/routes/ShipConsole.test.tsx

Updated suite: 0 new cases and 0 changed existing cases.
Existing cases are retained; shared fixtures, current authority inputs or source binding changed.

## src/routes/ShipConsoleNavigation.test.tsx

Updated suite: 0 new cases and 0 changed existing cases.
Existing cases are retained; shared fixtures, current authority inputs or source binding changed.

## tests/rules/firestore.rules.test.ts

Updated suite: 6 new cases and 7 changed existing cases.

New cases:

- keeps PDF Escort Wing state protected while the filtered reader supplies member views
- does not expose cross-group craft, location, or mission maps in a split member root read
- keeps raw roots GM-only while ordinary members use the current filtered callable
- protects census root reads and denies player and GM client mutations
- moves a historical shuttle route with a rejoined group and revokes it from both later partitions
- protects raw alert reads and denies player and GM direct alert writes

Updated cases (existing success/denial assertions remain):

- blocks ordinary members from a legacy public Voyage coordinate while preserving GM cleanup access
- are not readable by non-members
- allows facilitator audit and denies every lower audience and client write
- allows facilitator audit and denies every lower audience and client write
- scopes an exact pending route to its fleet group and denies enumeration or client writes
- are not readable by non-members
- denies player and GM client writes to maintenance, charges, cargo and shuttle fuel

Previous case names (migration explained below):

- keeps PDF Escort Wing attack state server-only while allowing the member-safe session projection
- is readable by a session member
- allows members to read census but denies player and GM client mutations
- allows member reads but denies player and GM direct alert writes

## tests/rules/nonmember-reads.rules.test.ts

Updated suite: 0 new cases and 1 changed existing cases.

Updated cases (existing success/denial assertions remain):

- keeps permitted member and facilitator reads available as positive controls

## Case-name and expectation migrations

These nine previous names were replaced in test-only commits because PC07's authorized behavior changed their old expectation. They are not skipped or silently removed success gates. The applicable equivalent or stricter checks remain:

| File / previous case | Current case(s) and reason |
|---|---|
| wolfAttackDeclarationCallable / uses the current server-owned airspace deadline after a restricted-window extension | `keeps the declaration clock authoritative and rejects post-declaration extension`, plus reasoned revision-bound emergency pause/resume and stale/deadline denials. Ordinary extension cannot bypass a declared attack; committed server deadlines remain authoritative. |
| ScoutRequestControls / records only a coordinate request and leaves follow-up with a facilitator | `records only a coordinate request and awaits automatic private delivery`. The player still supplies only a coordinate; the authorized Comms continuation now resolves automatically instead of requiring routine GM work. |
| implementationProgress / records all fixed PC06 IDs as earned closures without counting PC07 taxi scope | `preserves the fixed PC06 closures and its historical release allocation`. All49 PC06 IDs remain done at the actual historical0.5.64 entry and556 snapshot, while a separate case credits only the fixed49 PC07 IDs. |
| firestore / hydrates only the safe GM declaration summary and keeps its revision monotonic | `hydrates the complete GM-private attack state and keeps its revision monotonic`, plus separate strict member-audience tests. A GM may read the full private decision state; ordinary members receive the independently bounded projection. Revision monotonicity and malformed-state withdrawal remain checked. |
| GmConsole / stages a private card and target draft through the GM-only preparation panel | `stages the private composition with automatic server targeting`, plus `normal preparation reserves source-owned targeting choices for the entitled players`. GM preparation remains private, but the server rolls and actual players own the source-required choices. |
| Rules / keeps PDF Escort Wing attack state server-only while allowing the member-safe session projection | `keeps PDF Escort Wing state protected while the filtered reader supplies member views`. Direct private state stays protected; member projection now comes from the actor-derived callable because Firestore cannot redact fields within a raw root document. |
| Rules / is readable by a session member | `keeps raw roots GM-only while ordinary members use the current filtered callable`. The former player root positive control was an observed cross-group privacy leak. GM root succeeds, player and Press root deny; current-member callable positive and denial tests preserve ordinary entitled access. |
| Rules / allows members to read census but denies player and GM client mutations | `protects census root reads and denies player and GM client mutations`. Census uses the same protected root and filtered member projection; all direct mutation denials remain. |
| Rules / allows member reads but denies player and GM direct alert writes | `protects raw alert reads and denies player and GM direct alert writes`. GM root positive, ordinary root denial and both player/GM alert write denials remain; bounded current member alert presentation is covered separately. |

The initial boarding-order test fixture did not reach the alert-audience read and failed only its intended alert expectation. That failure is retained as nondiscriminating evidence. Separate fixture-only615511e1 supplies the real250-population casualty boundary; its red fails on Firestore's read-after-write constraint before source931f78bc repairs ordering. The browser Commander proof likewise retains earlier harness failures for an extra unberthed actor and stale watched runtime; the passing final branch uses ordinary admission/physical berth and a fresh compiled backend.

## Independent-review repair verification

Test-only commit `080c38c4` preserves the first review's four defects before source repair `b517dc4f`: absorbed group-ID reuse, an audience-invalid automatic unavailable EO result, lost own SNN projection, and late member hydration after actor revocation. `review-repairs.red.log` records six failing expanded cases with218 passing; `review-disconnect-panels.red.log` records five failing real choice consumers with34 passing. The repaired eight focused suites pass276/276 in `review-repairs.green.log`. All evidence paths are under external `root-takeover/`.

The existing unavailable-EO native handler case now passes its actual persisted result through the strict audience projector; it preserves the current range, audit, empty receipt and unspent charge assertions. The audience schema has not been widened.

The split HTTP scenario adds ordinary split → rejoin → split, current local writes, acquired old history, and denial of new foreign notes. Two explicitly labeled ECM event fixtures test native Rules audiences; they do not claim an ECM activation. `test-pc07-unavailable-eo-press-http.mjs` covers a normal eight-station roster plus independently joined Press, ordinary phone conduct/join, its own SNN controls after polling and UI movement, and charged unavailable EO ranges through boarding, final atomic damage, exact replay and reopening. These scripts accelerate only disposable deadlines and use ordinary audited facilitator decisions. Their successful evidence is separate from mock-based tests and prepared scenes.

The normal Press UI walk exposed the missing-flight listener termination under the existing strict route Rules. `9479d0db` reproduces it before `581fa75c` rebinds the exact private route after the authenticated departure commits. The original failed gameplay is retained; native rule permission is unchanged, and `press-departure-listener.green.log` passes6/6 focused movement/touch checks.

The same Press walk discriminated a second local re-projection that discarded its server-entitled SNN docking/history. `a38b7cb2` preserves that red before `4cb06d7b`; the client keeps only SNN state already listed in the server craft entitlement, with no vessel maps or invented transit docking. `press-docking-hydration.green.log` passes190/190 client parsing and movement/touch checks.

## functions/src/wolfCommanderRerolls.test.ts

Updated suite: 1 new case and 0 changed existing cases.

- accepts the canonical five-ship receipt while denying arbitrary subsets, reordered rings and out-of-ring dice

The normal eight-station attack exposed the private targeting parser still denying the supported five-ship receipt. Test-only `df3cdb4c` records two discriminating failures before `e26b8f33` adds only the canonical five-ship ring. The native automatic continuation and all affected targeting/declaration/C&C/range suites pass110/110. Existing six/seven-ring validation and malformed-dice/privacy checks are preserved.

## Final lint reconciliation

The first final validation of approved `c88dcb0a` stopped at four lint errors. Test-only `790cf18a` moves three existing `it.each` invocations onto their call line in `jumpCallable.test.ts`, `scoutAutomaticResolution.test.ts` and `scoutTaxiCommunicationCallable.test.ts`; all parameters, case names and assertions are unchanged. Source-only `0a9774f0` replaces an unused rest-destructuring binding in `planFleetTaxiTransfer` with a copy and explicit removal of the same optional passenger map. The result still omits an empty source map and preserves current passenger membership. The lint failure and repaired lint log are retained externally. The five affected native suites pass 188/188 for the unchanged behavior, and the source-bound consumer hash is refreshed without expanding the 105-Function selector.

## Full-suite failure reconciliation after 6ac25f24

The earlier sections record the initial baseline comparison; this appendix records every later test change in the repair delta. No source test is disabled or removed. Renamed cases below migrate explicitly superseded manual behavior to the equivalent or stricter automatic-authority contract. The failed full run, 670-case diagnostic (204 failures), and all intermediate fixture diagnostics are retained externally. The repaired fifteen focused suites now pass **701/701** in `root-takeover/broad-repairs.green.log`.

Test-only `3c19aaef` precedes render-loop repair `b755c211`; test-only `2b28b983` and `ed6249c3` precede typed session-source repair `c8b27208`. `member-projection.red.log` retains eleven failures, including the unchanged join/resume nested privacy, ticker and phase-context tests; the later Escort retention red detects a missing valid public field. `member-projection-and-workspace.green.log` passes116/116. Fixture-only `97fda4d1`, `53947f8c` and `963fcdcd` are separate from both source repairs.

### functions/src/joinSessionCallable.test.ts

Model committed player/group writes for the additional read-only transaction; persist the real join code and make the retained shuttle belong to the requesting actor. Keep all original nested privacy and phase-context assertions. Add native live-refresh positive controls, nested secret denial and retention of the public AEGIS Escort Wing view.

New cases:

- sanitizes nested operational data on live refresh before applying the current fleet audience



Changed cases:

- redeems a valid %s legacy or current code

- does not project a retained Press shuttle as docked when legacy docking fields are absent



### functions/src/maintenanceCallable.test.ts

The old generic request helper attached an advance requestId to every expectedTurn, accidentally making ordinary emergency-clock requests into incomplete attack interventions. Use unchanged ordinary clock payloads; retain pause/resume audits and all stale, expired, Cycle 0 and non-GM denials. Three renamed cases now test the authorized automatic attack contract: cycle override rejects with no writes, automatic resolution retains movement restriction, and unreasoned attack-clock pause/resume rejects with no writes. The existing `wolfAttackDeclarationCallable` case `requires reasoned revision-bound replay for emergency pause and resume during an attack` retains the positive reasoned, revision-bound recovery and replay checks.

New cases:

- keeps Wolf attack parking separate by rejecting cycle advancement during restricted Press catch-up

- keeps an overrunning Wolf attack locked through Team Phase while automatic resolution continues

- keeps an unresolved Wolf attack restricted by rejecting unreasoned emergency pause and resume



Changed cases:

- lets only the active GM pause and resume a live turn clock with an audit event

- denies stale, expired, Turn 0, and non-GM emergency timer requests without writing



Previous names, migrated above:

- keeps the P373 Wolf-attack parking lane separate during restricted Press catch-up

- keeps an overrunning Wolf attack locked through Team Phase until facilitator resolution

- keeps an unresolved Wolf attack restricted across emergency pause and resume



### functions/src/memberSessionCallable.test.ts

Keep this suite focused on atomic membership using an explicitly parsed-public fixture dependency. Add a regression that the required parser receives the current transaction snapshot and the reader cannot spread the raw root.

New cases:

- uses the required public parser on the same transaction snapshot instead of spreading the stored root



### functions/src/sessionLifecycleCallable.test.ts

Distinguish a DocumentReference from a CollectionReference and Query. The new transaction reads the actual fleet-group collection; all 143 existing assertions remain unchanged.

### functions/src/sessionResumeCallable.test.ts

Expose native snapshot data and committed transaction writes to the refreshed reader. Reset writes when a scenario creates a new prepared membership, including the stale/active membership comparison; retain both denial and write assertions. Retained SNN belongs to the caller instead of a foreign Press actor.

Changed cases:

- does not project a retained Press shuttle as docked when legacy docking fields are absent

- replaces a stale membership lock but refuses an active membership in another session



### functions/src/terminalFreezePolicy.test.ts

Classify the four new read-only projection endpoints explicitly. Keep commitWolfRangeActionChoice guarded through its exact requireWolfRangeState(session, state, range) delegate and inspect that helper body for the active-game guard; the mutator is not exempted.

### src/App.test.tsx

Add empty readonly mocks for the new range, Captain and boarding choice endpoints, alongside the existing C&C mock. Keep all 99 older route and authorization assertions.

### src/PC01ReviewScene.test.tsx

Update only the pending scouting copy to automatic result delivery. Preserve the older prepared-scene reveal, private note and ship-limited map walkthrough; it does not earn normal gameplay proof.

Changed cases:

- walks from the pending request through the GM reveal to the private note and ship-limited map



### src/components/FleetGroupPanelRenderStability.test.tsx

Bound the real component with a Profiler guard so an optional-data render loop fails quickly instead of hanging the test worker. Preserve usable Send group note and a small render count.

New cases:

- keeps group-note controls usable when optional navigation and taxi data are absent



### src/components/FleetSystemsWorkspace.test.tsx

Supply the actual connected Executive Officer fleet identity while remaining offline. Retain the printed C&C reference and reconnect message; require the private redirect offer to be absent until current server authority exists, while maintenance, fighter bay and shuttle navigation remain visible.

Changed cases:

- adds live C&C to the Executive Officer console while retaining its systems and maintenance shell



### src/routes/ShipConsole.test.tsx

Add the three readonly choice mocks. Scope the original second-person confetti status assertion to its own named region because boarding defence adds a second status node; preserve role, exact copy and activation assertions.

Changed cases:

- tells a lone non-captain that a second person must fire the cannon



### src/routes/ShipConsoleNavigation.test.tsx

Add the three readonly choice mocks while retaining all navigation and authorization checks.

### src/routes/ShuttleConsole.test.tsx

Add the three readonly choice mocks. Scope operation status queries to unnamed statuses within the Shuttle control region, preserving status roles, exact feedback and deferred old-identity callback denials while the new airspace status remains present. Three positive movement scenarios supply the live server freshness required by current authority, with identical request arguments and no client movement. Scout confirmations now require automatic private delivery instead of routine facilitator follow-up.

Changed cases:

- opens Chacau on its Refinery 124 Engineer route with its repair and cargo envelope

- lets the current %s owner record a scouting request from the shuttle route

- lets the printed owner hand shuttle control to a connected fleet-group player

- lets a fuelled service-shuttle holder add one host charge during Coordination

- preserves a service recharge selection and waits for current revisions before explicit retry

- retains the original request for exact replay after an uncertain result and closed Coordination

- lets the current holder request a local departure during open airspace without moving the shuttle

- lets the SNN holder request departure during AEGIS-authorized restricted airspace

- lets the holder enter transit from an authorized departure without a duplicate request

- lets the current holder retarget an active shuttle leg without client position input

- ignores a deferred old-session retarget %s callback without changing the new pending state

- completes a reached transit automatically and exposes the server-confirmed destination

- ignores a deferred old-session automatic arrival %s and lets the new identity arrive

- ignores a deferred manual retry after identity changes and preserves the new arrival pending state

## In-transit history regression and ordinary proof

Test-only `959fc990` adds `retains only the current in-transit craft’s local history without inventing a docking` to `functions/src/joinSessionCallable.test.ts`. The real exported reader must retain a valid AEGIS visit for its current in-transit Starlight craft while excluding a Shepherd visit and an unknown craft, keeping dockings empty and performing no writes. The retained red log fails with an empty history. Source-only `a5471669` lets the typed visit parser recognize printed craft during flight; the final transactional audience filter still applies current craft and host entitlement. All81 join, resume and member tests pass in `root-takeover/member-transit-history.green.log`.

Test-only `7d738953` extends `scripts/test-pc07-unavailable-eo-press-http.mjs` to inspect a real server flight after normal phone Begin transit: retain actual preflight own history, empty vessel maps and no invented docking. Its first attempt also incorrectly demanded a newly written departed event, which the existing movement contract does not create. Separate test-only `1a46f91f` removes only that unsupported event expectation; it preserves the full meaningful flight/history assertions and every prior movement/attack check. The failed harness log and JSON remain external, alongside the corrected normal proof. This correction changes no gameplay source or established test expectation.

## Final browser fixture and bundle gate repairs

The unchanged complete validator at `4c3272ef` passes536 suites /7,234 application tests, all156 Rules checks, lint, both builds, roadmap and62 source-font checks, then stops at the required DRADIS contact typography sample. Its log/JSON and partial images remain under `root-takeover/final-validation.typography-failure.*` and `typography-failure-4c3272ef`.

`scripts/test-typography-browser.mjs` keeps the exact accepted PC01 source, seven surfaces, all four viewports, both motion modes, every font/contrast/geometry assertion and the existing network restriction. Test-only `f666d5a2` adds an explicit prepared current-group read sample solely to the candidate local Vite server, a diagnostic for missing contacts, and a stronger assertion that the actual local plot is present before measurement. The new assertion fails with LOCAL FIX UNAVAILABLE, preventing ambient labels from masking a missing fleet sample. The first resolver repair `4c18d733` remains a failed attempt; `7663bc8c` additionally handles Vite's observed extensionless resolved path. The complete unchanged matrix then passes56 PC01 comparisons and8 Voyage metadata renders in `root-takeover/typography-fixture-complete`. The report explicitly labels this prepared read-hook boundary. No production hook, authorization, authenticated gameplay claim or reference source changes.

The existing production bundle test rejects the582,958-byte GM chunk against its unchanged512,000-byte ceiling. Source-only build commit `7a509ee6` assigns the mutually importing session service and Firestore adapters to one shared runtime chunk before the GM route. The existing gate then passes: GM216,429 bytes, session runtime390,226 bytes, largest chunk497,246 bytes. The failed budget log, successful build/gate and exact sizes remain in `root-takeover/remaining-bundle-gate.log`, `bundle-repair-build.log` and `bundle-repair-metrics.json`. No budget or application behavior assertion changes; final production-browser/performance verification remains required.

## Published core and production review layout regression

Exact `d8f56eeea6d536f5e8da15d49b2ca965b38ed3bb` passes all11 required local commands:536 suites /7,234 application tests,156 Rules checks,62 font checks,56 typography comparisons plus8 Voyage renders, all24 ticker cases and both lifecycle captures, production performance and the unchanged bundle budget. Independent Sol6.1xhigh approval preceded candidate CI37132717748. Exact-main deployment37134010820 verifies hosting0.5.65, Firestore rules and all105 selected Functions, including active state, browser invoker access and changed revisions. Local and CI performance reports retain their actual measurements separately; no physical-device or authenticated production gameplay claim is made.

The deployed phone review screenshot revealed the real plot using its floating console layout above the prepared workspace. Test-only `7253ac31` extends the existing eight-case prepared scene test with compact, expanded and restored containment plus nonoverlap with the header, boundary notice and navigation. Its retained red at320px shows the plot at92px while its workspace begins at942.59px, overlapping both header and notice. Source-only `e89d153e` supplies the existing `gm-dradis` embedded context and an intrinsically sized, bounded workspace; it changes no shared plot, gameplay, authorization or Functions code. The complete matrix passes in17.13 seconds, retaining every previous interaction, font, geometry, motion and network-isolation assertion. The corrected phone image was inspected. Evidence: `root-takeover/review-plot-layout-red.log` and `review-plot-layout-green/summary.json` with all40 images.

Fixture-only `2a9db8a8` changes only the PC07 release-allocation assertion from the latest changelog row to the actual published0.5.65 row and adds its605 snapshot assertion. It retains the same named case, exact49 IDs, uniqueness, done statuses, total605 and P605a denial. This permits a later layout-only release without crediting those49 IDs again. Build0.5.66 records an empty new-prompt list and the unchanged605/751 snapshot; its appropriate validation, review, CI and hosting deployment remain pending at preparation.

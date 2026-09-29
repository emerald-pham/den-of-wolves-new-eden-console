# PC05 acceptance execution matrix

This matrix preserves all 49 assigned acceptances from the catalog. It is an
execution checklist, not completion evidence. The catalog remains the planning
authority. Record exact candidate, test or rules evidence, deployed revision,
and ordinary gameplay observations before closing a row. A fixture alone does
not establish a production outcome. See [the report](PC05_PLAYTEST_REPORT.md)
for review findings, source assumptions and the deployment boundary.

## Science and private maps

### P211 — Encode Endeavour console-upgrade research tracks.

each track advances the left-most box and exposes the correct current material cost.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P212 — Enforce Endeavour research cadence.

up to three distinct choices plus no more than two five-ore extras resolve per Team Phase.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P213 — Build and use the ECM Device.

the completed device reduces the owning group’s pursuit by three exactly once per allowed use.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P391 — Resolve Endeavour field upgrades.

two target consoles, or four when fuelled, use each target ship's current material cost.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P321 — Define scout entitlements.

only Starlight, Hummingbird, Endeavour, or the assigned Comms Officer can create their printed request.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P325 — Resolve Endeavour scouting.

the Scientist scouts one system at any range once per allowed turn.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P327 — Measure scout range from current authority.

a stale owner or client origin cannot expand range after a ship jumps.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P328 — Deliver scout results privately.

only the requester and permitted facilitator readers receive the requested system fact.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P329 — Reveal a chart result as facilitator.

the facilitator resolves the selected booklet entry without publishing the organiser chart.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P330 — Persist player discovery notes safely.

entitled facts survive while no endpoint becomes a full-chart export.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P331 — Audit scouting events.

requester, origin, target, turn, and permitted result are recorded with no unrelated chart data.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P332 — Accumulate Deep Nebula scans privately.

each qualifying system O scout adds one hidden bonus entry exactly once.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P333 — Hide the Deep Nebula total.

players know scouting occurred but cannot read the accumulated roll modifier before resolution.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P677 — Gate jump-map coordinates by ship knowledge and hide location details.

A player jump map reveals a system's jump coordinates only when that particular ship has previously visited the location or has authoritatively discovered those coordinates; another ship's knowledge alone must not reveal them. Enforce the entitled projection at the data boundary, including labels, tooltips, accessibility text, search, cached/reconnect state, and serialized map data, rather than merely concealing coordinates with CSS. Add a Ship View Privacy option to hide information about what is present at a location, independently of whether its coordinates are known, using the existing privacy-control scope and permissions without deleting the ship's recorded knowledge. Preserve authorized facilitator views, valid visited/discovered history, jump targeting and server legality, and accepted non-GM DRADIS behavior. Reconcile the older fleet-group discovery projection with this owner-requested per-ship distinction. Prove different knowledge on two ships, visited and scanned reveals, unknown-coordinate denial, privacy hide/reveal, stale cache/reconnect, and accessible responsive player maps.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

## Setup and first action

### P654 — Start production after a confirmed roster without treating unfilled roles as a blocker.

an authenticated active facilitator with a valid confirmed canonical setup can authoritatively start exactly once with zero, partial, or full role occupancy; unfilled roles are never blockers. Reject only genuine missing or invalid tuple, lifecycle/revision/closed/authority/malformed/unavailable server-result blockers with a stable nonsecret reason; never fabricate a role, player, or loyalty and never accept client randomness. Define an owner-approved server outcome for zero eligible Wolf/private-loyalty holders. After confirmation the existing start control is enabled and accessible, and role status names the actual blocker rather than stale `Start blocked // confirm...` copy. Preserve focus, 44px targets, reduced motion, and mobile CIC behavior. This repair supersedes the retired Prompt 071 acceptance and depends on Milestone 1; later server, client, UI, and security tests must replace the old missing-role blockers.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P662 — Resolve ordinary-start Wolf designation policy.

current ordinary Setup intentionally has no manual designation under Prompts 054/075, but residual exported caller-controlled `assignWolves`, `assignWolfRoles`, `resetWolves`, and manual-assignment guards require an explicit owner-approved policy. Audit printed references, current UI, callables, guards, secrets, tests, and history. If automatic server assignment is retained, retire or strictly constrain residual manual/random endpoints and stale guards, clarify in-universe copy explaining when the server assigns Wolves, and prove locked-roster-derived count, private audience, replay/CAS, and unauthorized denial. If manual designation is chosen, require a separate bounded GM-only pre-start flow with roster-derived count/candidates, authoritative validation, audit/replay/CAS, secrecy, a11y, and rules denial. Do not silently choose between policies. Note overlaps/dependencies 054, 071, 075, 496, and 586–588. This is low priority/deferred and remains missing until the owner-approved policy and bounded acceptance are recorded.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P589 — Teach the table ground rules.

onboarding covers private briefs, no out-of-game communication/photos, Wolf humanity, and resource components with exact approved copy.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P590 — Teach the core game loop.

help explains Team, Coordination, pursuit failure, jump announcements, attack docking, and away missions without unsupported mechanics.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P599 — Build the single-facilitator setup checklist.

one complete checklist tracks both printed responsibilities, room/components, chart, casting, loyalties, automatic setup math, and readiness without mutating gameplay; optional additional-GM lane assignments remain collaborative and nonblocking.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P600 — Run the onboarding-to-first-action scenario.

a new player acknowledges safety, joins, receives private assignments, learns the loop, enters the right route, completes one real action, and returns.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

## Maintenance and recovery

### P100 — Gate Coordination actions.

movement, transfer, scouting, research, and jumps fail outside Coordination except printed exceptions.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P117 — Resolve the ration-table wording conflict.

the chosen interpretation distinguishes spend from bonus, is source-linked, and is fixed before product controls ship.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P116 — Select food and water rations independently.

only levels and spends on the vessel's current printed table are accepted.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P118 — Swap population-dependent ration tables.

crossing a starred vessel threshold changes only that vessel's allowed table.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P119 — Resolve the two-dice unrest check.

server dice and both ration bonuses produce the printed below-12, below-20, and 20-plus result.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P120 — Resolve a riot.

rolling below current unrest applies the correct unrest/population consequence and authoritative damage path once.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P121 — Resolve small-ship maintenance loss.

base small ships and Voyage 33-0 use their printed population-loss/skip-charge exception, not full-ship riot behavior.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P134 — Alert starred population thresholds without a multi-GM deadlock.

the smaller ration table becomes authoritative and one active facilitator can acknowledge/own the blocking consequence; additional or stale GM instances may retain informational alerts but cannot prevent maintenance or movement. Competing acknowledgements commit once and return a safe stale/idempotent result.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P135 — Add two unrest at population zero.

the transition applies once and replayed snapshots cannot add it again.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P136 — Enter mutiny at unrest 8.

the ship becomes unusable, its actions deny, and facilitators receive a named recovery requirement.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P137 — Resolve replacement-captain mutiny recovery.

an authorized facilitator records the permitted unrest reduction rather than an invented automatic value.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P184 — Resolve Dione rations and thresholds.

its discrete population track selects the correct progressively smaller table.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P191 — Spend a VIP unrest reroll.

one owned card rerolls one maintenance die, consumes once, and cannot be replayed.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

## Jump lifecycle

### P287 — Calculate jump distance.

the server classifies legal routes as short, medium, or long using the selected printed topology.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P288 — Resolve per-ship jump costs.

each core/full ship and small-ship variant receives its exact S/M/L cost from server catalogs.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P289 — Validate Jump Drive readiness.

uncharged, damaged beyond use, destroyed, wrong-role, or wrong-phase requests fail without spending fuel.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P290 — Enforce one jump per ship per turn.

refresh, reconnect, concurrency, and retry cannot produce a second completed jump.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P291 — Reserve jump fuel atomically.

concurrent requests cannot overdraw a ship or host and a failed transaction spends nothing.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P294 — Complete an independent ship jump.

one ship reaches its legal destination while all other ships retain their own states.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P296 — Resolve uncharged and fuel-starved attempts.

the ship stays put, reports the exact denial, and preserves all resources.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P297 — Resolve damaged-drive randomness.

the server owns the printed 1–3 failure roll and its auditable outcome.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P298 — Apply upgraded-drive behavior.

cost drops by one and the damaged failure threshold changes exactly as printed.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P299 — Apply failed-jump damage.

the chosen facilitator policy routes damage through the common draw path and labels the adjudication.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P300 — Execute one emergency jump per ship.

all fuel is consumed, the drive and half remaining consoles are damaged as specified, and repeats fail.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P301 — Resolve concurrent fleet jumps.

simultaneous legal jumps update independent fuel, position, event, and group state without lost writes.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P302 — Record every jump transition.

completed, failed, integrity, wrong-destination, and emergency results each create one audience-safe event.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P303 — Audit jump-button truthfulness.

digits, lock, power rail, pending, success, failure, and cooldown reflect server authority and remain keyboard/touch usable.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P304 — Reconcile jump retries.

a timeout retry returns the committed result or fresh denial without spending or moving twice.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

### P201 — Audit the Icebreaker Jump Drive.

successful jumps use 3/6/12 fuel and preserve all landed jump authority/denial behavior.

- Implementation and risk evidence: reconcile final repaired candidate.
- Deployment and ordinary gameplay: pending.
- Closure: unproven.

## Required owner regressions

- F01: invalid-station reconnect returns to station selection with persistent reselect-role guidance; valid role selection recovers access.
- F02: names first appear with their visible DRADIS contacts, including sweep acquisition, refresh, changed tracks, fade and reduced motion.
- F03: minimized DRADIS says Zoom or uses a plus magnifier, with usable expand and return controls.

Local regression evidence is recorded in the report. All three still need the deployed candidate verified before full PC05 release.

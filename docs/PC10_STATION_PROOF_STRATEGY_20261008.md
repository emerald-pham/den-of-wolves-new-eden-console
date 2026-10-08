# Bounded Station P proof strategy

This is the parent-authorized source-only successor to Attempt 27 on
`7c14e95917faa2f575592cb7c6d2b3aca2fb3837`. It changes the proof's legal choices,
not combat rules, rolls, forces, damage, timers or success conditions. Native
success remains unqualified until a fresh parent allocation and exact review.

## Evidence and limits

Attempt 27 completed twelve ordinary waves. Twenty initial hulls became twelve,
nine, then seven survivors; waves 3–12 retained two transports, four
Strikecarriers and one Battlestation. Eight launches and sixteen fighter range
mutation receipts contained nineteen Medium fighter choices and nineteen Short
fighter selections. These counts describe different units, not conflicting
receipt totals. No missile or point-defence laser action was made. Alpha and
Bravo reached zero fighters; the uncharged PDF bay never launched its four
fighters. Final-range calculations auto-passed without offensive actions.

The real public Wing options were opaque `Wolf contact N` labels. The old
Battlestation text preference could not match them and distributed shots among
the first contacts. The Battlestation was never selected. Short fighter attacks
risk permanent friendly losses and cannot damage its capacity-six hull.
Targeting and boarding receipts varied; the retained evidence does not establish
a repeated seed. Earlier complete range rolls and partial wounds were not
retained. Current repeat construction resets `damageTaken`, but printed material
does not expressly resolve partial-wound carryover. That product assumption is
a separate parent-owned interpretation risk and is outside this driver repair.

Private source PDFs remain outside Git. Source-backed paraphrase: the Player
Guide, Wolf cards, AEGIS battle sheet and Facilitator guide require surviving P
forces to repeat; charged missile launchers can damage hulls at Long/Medium and
charged point-defence lasers act at Medium/Short. Hits from one action target
distinct contacts. Short targeting must cover publicly marked Fighter Wings
before other contacts. Normal AEGIS reactor capacity is five consoles, while
REFINERY 124 has four. There is no guaranteed roll outcome or promised victory.

## Cohort and normal setup

Use the existing supported recommended **15-role preset**, with eight fresh
normal Auth actors: GM, Wing Commander, Miner, Scientist, Explorer, PDF Colonel,
Press and a distinct Executive Officer. Preserve all six mandatory printed
craft custodians and their UID/control bindings. Unused configured seats stay
open. Preset 14 plus an ad hoc EO is invalid; allocating fifteen Auth actors is
unnecessary. EO must hold its actual assigned/active canonical seat and AEGIS
berth; GM credentials cannot substitute for it.

## Legal action policy

1. During existing normal Cycle 2 maintenance, charge AEGIS jump drive, both
   physical fighter bays, missile launchers and point-defence lasers (five).
   Charge REFINERY 124 jump drive and its physical PDF fighter bay (two). Other
   ships retain their existing jump charge. Do not add ore, upgrades, construction
   charges, fighters, extra maintenance, recharge cycles or administrator repair.
2. Launch only when the actual owned bay/source and painted control allow it.
   At Medium, focus Wing/PDF fighters on the last available opaque contact in
   their own current public option list. Do not read GM enemy type, capacity,
   wounds or expected outcomes to choose. At Short, explicitly pass both fighter
   wings and PDF to preserve their legal Medium offense across repeated waves.
3. The actual EO reads enriched-warhead and Command and Control views at
   targeting. Explicitly pass an eligible optional choice; do not buy warheads
   or charge an extra console. A known unavailable/already settled view requires
   its matching painted blocker and no mutation.
4. At each range, finish the existing Wing/PDF/support choices before the EO
   reads the actual range view. Use only offered charged missile/PDL actions;
   explicitly pass when none are offered. Source availability is re-read on
   every wave and range. Charges are existing cycle state, not invented per-wave
   grants; no driver action replenishes fighters or assumes a weapon survives.
5. When the actual source requires targets, use its locked hit counts and damage
   per hit. Select distinct live public contacts per action, prioritizing the
   last contact except for public Short coverage requirements. Cover each marked
   Fighter Wing first with available hits, then other contacts; impossible
   coverage must retain legal fighter-only selections rather than bypassing the
   UI/server rule. Zero hits or insufficient live contacts are recorded unused
   through the normal enabled commit control. Never reroll or manufacture hits.

Every new route reuses the existing canonical actor adapter, source phase/GM
bookends, original attack identity, discovery/berth/lease/SDK fences, normal
mounted UI capture and exact request metadata. Missing/malformed/foreign views,
unknown reads, denied authority and ambiguous receipts remain fatal. Only
validated ordered/terminal progression cancels stale intent; the same original
deadline applies. No second uncertain mutation or deadline reset is introduced.

## Concrete integration boundary

P181 Attempt 4 handoff `OWNER_PC10_P181_ATTEMPT4_FINAL_PARENT_HANDOFF_AND_OPEN_GATES_20261008.json`
binds `808b4521c08b4e838f843dc43b104f9583f8f6c8`. Its current source change is only
`scripts/pc10-starlight-movement-scout-ui-proof.mjs`, with its focused runner
test. Native execution stopped at an omitted local GM opt-in before setup,
Wing or Starlight gameplay; it is not a backend recharge failure. Prior parent
`rechargeActual4` qualification remains separate. Existing Station normal
reactor maintenance has no demonstrated P181 dependency. No P181 file, shared
recharge helper, backend, UI or private source file is edited here. Any future
shared maintenance change must be returned to the parent before implementation.

Authorized functional files are `scripts/pc10-fresh-minimum-ring-proof.mjs` and
`scripts/pc10-station-crew-dispatch.mjs`, with their focused Station tests.
Existing shared readiness supports EO warheads, Command and Control and range
actions and remains unchanged. Contract commit precedes separately committed
meaningful actual-consumer REDs, then bounded repair and focused GREEN. Retain
raw logs and before/after source hashes; synthetic/source-shaped fixtures are
not native proof. Parent owns the single reconciled candidate, independent exact
review, final validation, fresh allocation and any integration/release.

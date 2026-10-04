# PC09 ordinary fighter loss, return, and rebuild handoff

This bounded row-5 proof supports P483/P645. It establishes the ordinary
authenticated loss and return path through two resolved attacks, but did not
complete the paid fighter rebuild because the source-generated cycle-4 state
made the Construction Bay unavailable.

## Runtime and evidence

- Isolated checkout: `/private/tmp/dow-pc09-audit-20261004`, branch
  `feat/pc09-audit-20261004`; isolated emulator slot 5.
- Functions runtime: source commit
  `74ab27b194a3a72629d2a4d2a7c3b28b45790b25`, directory
  `/tmp/pc09-owner-functions-74ab27b1`; its 207-file JavaScript tree matched
  the recorded SHA-256 `6d5526483cf6b3e0c4a240aec686699b18fcd0d5d42f847ed224d9e5080bb956`
  using sorted relative paths, NUL, file bytes, NUL. The single `index.js`
  hash is not the tree hash.
- The normal authenticated 20-player local session used the Capybara expansion
  and two browser contexts joining as Wing Commander and Press. The proof
  advanced only disposable cycle deadlines directly; attack state, target
  choices, combat rolls, fighter counts and resources were server-authored.
- The first due attack completed through normal authenticated range and
  boarding actions. An attack-bound Fighter Ace Short action targeted two
  current contacts; its exact retry returned the same result. The member
  projection read Alpha at three fighters after the loss, and its later ordinary
  launch view remained at three.
- The next due attack consumed the first immutable return manifest. Its
  carryover named the prior attack and all eight surviving Wing instances. The
  ordinary composition included a Battlestation and another Wing. Attack 2
  resolved, returned the Battlestation in `survivingWolfShips`, and left Alpha
  at three. The saved attack state reports `nextAttackConsumesReturnManifestAndReturnsBattlestation=true`.

The evidence files from the last gameplay run are outside Git:

- `/tmp/pc09-audit-rebuild/evidence.json.failure.json`
- `/tmp/pc09-audit-rebuild/evidence.json.predicate-inputs.json`
- `/tmp/pc09-audit-rebuild/ui/failure.png`
- `/tmp/pc09-audit-rebuild/ui/failure-state.json`

They contain no retained Auth tokens. The disposable session was recursively
deleted by the driver.

## Rebuild blocker and limit

After the second attack, the ordinary cycle-4 AEGIS maintenance choice used the
available zero-ration level. Server rolls were `1 + 5`; unrest rose from 4 to 6.
The server then rolled 3 against unrest 6 and damaged `construction-bay`.
`fighter-bay-alpha` was also damaged in the captured state. The reactor receipt
charged zero consoles. AEGIS had one material, no food, water or fuel, and a
damaged Construction Bay. The normal build preconditions therefore could not
be met without a later legal repair and recharge. No resource, damage,
inventory, or dice state was changed to force that precondition.

The gameplay runner next encountered an optional late-cycle shuttle refuel
request with no fuel and stopped. The paired server snapshot already records
the Construction Bay damage and empty charge list before that request. The
driver now omits cycle-3-and-later shuttle refuels, filters damaged optional
reactor consoles, reads the printed ration schedule from the assigned runtime,
and acknowledges live GM ship alerts through their normal callables. These
final driver-only corrections were syntax-checked but were not rerun after the
last session captured this genuine Construction Bay blocker. Earlier sessions
ended on distinct proof-harness mistakes and were not counted as gameplay
evidence. Consequently there is no proof here of the actual
Wing Commander build screen, build request, material spend, exact build retry,
final UI geometry, or error-free browser console. The captured browser console
contains HTTP 403/429 resource errors during the large local session; those
were not diagnosed as part of this bounded proof.

The reusable driver is
[`pc09-ordinary-return-rebuild-proof.mjs`](../scripts/pc09-ordinary-return-rebuild-proof.mjs).
It verifies the immutable runtime hash before creating a session. The command
`node --check scripts/pc09-ordinary-return-rebuild-proof.mjs` passed after the
final driver-only edits. No product code or existing tests changed in this
follow-up.

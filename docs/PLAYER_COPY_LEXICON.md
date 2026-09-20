# Player-facing copy contract

The New Eden Console speaks like an issued fleet instrument. Labels describe a
real reading, authority boundary, or action. They do not expose implementation
vendors, web-product jargon, or retired fictional middleware.

## Approved vocabulary

| Meaning | Use | Avoid |
|---|---|---|
| Numbered game clock | `cycle` | `turn` |
| A player's device surface | `console` | `page`, `dashboard` |
| Joined table and its server-owned state | `session` | database or provider names |
| Connection before the player projection is ready | `session authorization pending` | retired Iris authentication copy |
| Shared connection | `fleet link` | Firebase or backend copy |
| Optional setup controls | `enable` / `disable` | `turn on` / `turn off` |
| Motion control | `Reduce motion` | announcing that an inactive system preference is off |

ATC, Press, Aegis, DRADIS, CIC, fleet, ship, station, role, phase, session,
cycle, and console are established terms. Player-visible errors state what the
operator can do next. Update and installation surfaces may use ordinary device
terms when that is required to explain a real device action.

## Inventory boundary

The deterministic guard scans production TypeScript and TSX string/template
literals, JSX text, visible and accessible attributes, `index.html`, the web
app manifest, command-error copy, update/install copy, and the Settings
changelog. Tests, comments, imports, CSS/class identifiers, persistence keys,
callable names, protocol values, and TypeScript property names are developer
or wire text rather than player copy.

Raw Firebase configuration failures in `src/lib/firebase.ts` and
`src/lib/firebaseConfig.ts` are reviewed developer diagnostics. Reachable
command failures pass through `src/lib/commandErrors.ts`, whose friendly copy
remains inside the scanned inventory. Internal fields such as `currentTurn`
remain stable for compatibility; their rendered labels must say `cycle`.

The machine-readable vocabulary, forbidden patterns, and reviewed exclusions
live in `config/player-copy-contract.json`. `scripts/player-copy-contract.mjs`
fails with the source file, line, rule, and offending literal. The unit gate
runs the guard for every web release candidate.

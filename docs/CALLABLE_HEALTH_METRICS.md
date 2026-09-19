# Callable and snapshot health evidence

Prompt 636 measures the existing Prompt 638 expanded emulator rehearsal without
recording player, session, request, or content identifiers. A closed vocabulary
rejects any metric dimension outside the committed callable names, sources,
listener projections, and lifecycle stages. The evidence groups
samples only by fixed metric name, source, outcome, listener projection, and
lifecycle stage. Each group reports count, minimum, median, 95th percentile,
maximum, and retry count where applicable.

The rehearsal records real Firebase Emulator callable latency for successful,
denied, rejected, and stale-contention results. It also measures snapshot delay
from the beginning of each operation to the first resulting snapshot at initial
subscription, game start, a resource action, and reconnect. Listener timing is
anchored to event timestamps rather than snapshot ordinals, so unrelated valid
updates cannot be mistaken for the measured operation.

The Firebase Emulator cannot reliably synthesize platform HTTP 429 and
unavailable responses. The rehearsal therefore records those two transport
dispositions as explicitly `injected-transport` samples, then proves recovery
with a real idempotent `refreshPresence` call labeled `emulator-recovery`. These
samples establish the metric taxonomy and retry accounting; they do not claim a
production outage or production service-level result.

Run the proof against an already-started isolated emulator slot:

```sh
npm run test:health:p636
```

The command writes `/tmp/p636-callable-health.json` and validates that the
source rehearsal passed, all required outcome classes and listener stages are
present, retries were counted, and the health summary contains no forbidden
identity or content fields. The artifact is local emulator evidence. It does
not establish production capacity, a 60-browser result, or a service-level
objective.

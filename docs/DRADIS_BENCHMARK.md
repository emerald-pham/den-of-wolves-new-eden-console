# Repeatable DRADIS render benchmark

The duplicate CI runs for commit `159ab737` used the same application and
benchmark inputs, but their DRADIS p95 values were 118.3 ms and 155.1 ms.
The passing run performed 5,780 label layout reads; the failure performed
6,744. The 150 ms limit therefore depended on both runner scheduling and
how far the live radar sweep had advanced between contact updates.

The component harness now advances animation-frame callbacks and timeouts at
fixed 60 Hz steps from a fresh mount. CSS sweeps and scan-created Web Animations
use that same timeline. The real production components, sweep callbacks,
20-contact input revisions, full-motion setting and browser geometry remain in
the workload. `performance.now()` remains native: advancing the simulated clock
does not manufacture performance measurements.

Each update measurement includes its React commit, two production animation
frame batches, mutation delivery and synchronous style/layout. Native paint
waits happen after that measurement. This defines update cost separately from
runner frame scheduling; it changes the measurement method, not the 150 ms
budget. It is not directly comparable to the previous update-plus-frame-wait
timing. The separate 120-frame mobile measurement still uses native animation
frames and includes actual frame waits. All existing budgets and assertions
remain unchanged.

The existing `results.json` evidence now identifies the measurement method,
keeps all 30 DRADIS cost samples, and records layout reads per sample. The first
read sample includes the initial mount/warmup. These counters make workload
differences diagnosable without retrying to obtain a green result. Real cost
and frame timing can still vary with hardware load; deterministic scheduling
does not promise identical milliseconds on shared runners.

Regression tests cover host stalls, callback order, cancellation, native API
restoration, CSS/scan animation phases and a deliberately slow 160 ms update
whose real cost remains above the 150 ms limit. They were committed before
implementation. Existing benchmark tests and application tests were preserved.
This is a tooling change with no application version, player changelog, PC06
catalog or gameplay change.

Two complete local browser runs produced identical per-sample read counts and
5,179 total label reads each. DRADIS update-cost p95 was 15.5 ms and 14.0 ms;
native mobile-frame p95 was 33.3 ms and 33.2 ms. Both passed the unchanged
budgets. These are local measurements, not evidence about hosted CI capacity.

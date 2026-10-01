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

Each budgeted update measurement includes its React commit, two production
animation frame batches, mutation delivery, synchronous style/layout and two
native frame/paint waits. The original update-plus-frame-wait metric still
controls every existing threshold, including the 150 ms DRADIS limit. A new
work-only diagnostic separates update cost from those native waits and never
replaces the budgeted metric. The separate 120-frame mobile measurement advances
one fixed production sweep batch per update, while its durations use native
animation-frame timestamps and include actual work and paint waits. All 120
samples remain in the p95 and long-frame checks. All existing budgets and
assertions remain unchanged.

The existing `results.json` evidence now identifies the measurement method,
keeps all 30 DRADIS total/work samples and all 120 native mobile intervals,
and records layout reads per sample on both surfaces. The first read sample
includes the initial mount/warmup. These counters make workload
differences diagnosable without retrying to obtain a green result. Real cost
and frame timing can still vary with hardware load; deterministic scheduling
does not promise identical milliseconds on shared runners.

Regression tests cover host stalls, callback order, cancellation, native API
restoration, CSS/scan animation phases and a deliberately slow 160 ms update
whose real cost remains above the 150 ms limit. A separate 151 ms update with
100 ms work and 51 ms frame waiting proves that native waits stay in the
budgeted value. A mobile case with 17, 50 and 133 ms native intervals advances
the sweep through the same three 60 Hz phases while retaining the genuine
133 ms interval above the unchanged 120 ms limit. These tests were committed
before their implementations.
Existing benchmark tests and application tests were preserved.
This is a tooling change with no application version, player changelog, PC06
catalog or gameplay change.

Three local repetitions produced identical per-sample read counts and 5,179
total label reads each. A separate fresh-mount comparison after a 750 ms native
pause also reproduced the exact read sequence. The final full benchmark,
including native waits, measured a 34.3 ms DRADIS p95, 33.5 ms attack and mission
p95, and 16.8 ms mobile-frame p95 with no long frames. Its diagnostic DRADIS
work-cost p95 was 14.7 ms. All unchanged budgets passed. These are local
measurements, not evidence about hosted CI capacity.

The first exact-candidate hosted pair reproduced identical 5,177-read DRADIS
workloads, with 77.9 ms and 96.2 ms p95. The remaining live-clock mobile probe
passed at 66.7 ms with 15 long frames in one run and failed at 133.3 ms with
90 long frames in the other. That failure is preserved as run `36800807676`;
it was repaired by applying the controlled workload to the mobile probe too,
without increasing either the 120 ms frame ceiling or the 70-long-frame limit.
Two complete local runs after that repair reproduced both read sequences:
5,179 DRADIS reads and 22,268 mobile reads. Both measured 33.4 ms DRADIS p95
and 16.8 ms mobile p95, with no long frames.

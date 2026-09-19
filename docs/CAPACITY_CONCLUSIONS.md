# Capacity conclusions

Prompts 636, 638, and 639 establish a measured local release-readiness
envelope. They do not establish a production service limit or a maximum player
count.

## Supported local envelope

The current local evidence supports this exact scenario:

- 20 authenticated player identities with three Chromium pages each, for 60
  concurrent browser pages;
- two authorized GM controllers renewing their own leases;
- 120 steady Firestore listeners, one session and one private player listener
  per page;
- production-cadence ten-second presence heartbeats for 15 minutes;
- one real two-GM resource-action race per minute;
- one disconnect and reconnect of all three pages for a player identity; and
- one injected unavailable response and one injected resource-exhausted
  response, each followed by a fresh real emulator call.

The qualifying Prompt 639 run passed every versioned threshold. It recorded
5,401 successful in-window heartbeats with no error, 92 successful GM lease
renewals, 20,063 listener deliveries with no listener error, 14 action races
with one commit and one stale result each, 3,195 ms action-to-listener p95, and
a 1,654.6 ms three-page reconnect. One heartbeat that crossed the declared end
of the window was recorded separately and excluded from coverage.

Prompt 638 separately supports the 20-player Capybara setup boundary in two
local rehearsals: core-only with one GM, then 20 core players plus claimed Press
and two GMs. Those runs cover setup, start contention, listener convergence,
one real action, reconnect, privacy denials, and unchanged roster and capacity
math. They do not prove the complete Capybara game; that remains Prompt 584.

## Failed and unproven boundaries

No threshold failed in the qualifying Prompt 639 closure run. A separate Prompt
638 attempt to fire 23 heartbeats simultaneously produced an internal Firebase
Emulator transaction-lock failure. Its cause remains undetermined. The passing
Prompt 638 evidence uses three-client batches with bounded retries, so the
repository makes no simultaneous-burst capacity claim.

The current evidence does not prove:

- production Firebase latency, availability, quota, throttling, or billing;
- internet-path, mobile-device, WebKit, or Firefox performance;
- more than 20 independently authenticated players or 60 browser pages;
- a duration longer than 15 minutes, repeated reconnect storms, or multiple
  simultaneous identity reconnects;
- automatic retry after an unavailable or resource-exhausted response; or
- complete base, Capybara, split-fleet, shuttle, combat, mission, candidate, or
  terminal-failure playthroughs covered by Prompts 641–650.

The result supports the nominal browser target inside the measured local
scenario. It is not a claim that 60 is the maximum safe load or that every
gameplay path has run under that load.

## Retry guidance

The Prompt 639 transport probes deliberately inject one failure, remove the
injection, and measure a new real call. The next calls passed in 715.8 ms after
the unavailable sample and 24.4 ms after the resource-exhausted sample. Those
numbers prove that the fresh calls succeeded against the local emulator; they
are not retry delays and do not demonstrate automatic client recovery.

Production commands should follow their existing authority and idempotency
contracts. Retry only a command whose request identity can be safely reused or
whose current server state has first been reconciled. Preserve its request ID,
honor any bounded retry hint, refresh stale authority before mutation, and use
bounded backoff rather than a simultaneous burst. Terminal authorization,
validation, lifecycle, and stale-state failures require correction or
reconciliation instead of blind retry. Presence refresh may issue a later
fresh call because it is state-idempotent; this capacity evidence does not add
a new generic retry mechanism.

## Cost and usage

The measured run used local Chromium and local Firebase emulators, so its
actual billable service cost was `$0`. It generated 5,489 browser callable
attempts, 151 controller callable attempts, and 20,063 listener document
deliveries. These counts describe the tested traffic shape and may inform a
later production estimate. They are not production invoices or pricing
forecasts.

## Follow-up work

1. Investigate the preserved Prompt 638 simultaneous-heartbeat emulator lock
   before making a burst-capacity claim.
2. Run the Prompt 641–650 complete-playthrough proofs before claiming full-game
   release readiness under the measured envelope.
3. Measure a production-like Firebase environment, real network paths, longer
   duration, supported device classes, and relevant browser engines before
   publishing a production service-level or cost claim.
4. Repeat the versioned Prompt 639 command after material runtime, Firebase,
   heartbeat, listener, reconnect, or capacity-threshold changes.

The detailed scenario, thresholds, artifact binding, and exact closure values
remain in [60-browser capacity proof](CAPACITY_60_BROWSER_PROOF.md) and its
[committed audit artifact](audits/p639-60-browser-capacity.json).

# Presence load proof — 2026-09-19

Prompt 614 passed an isolated Firebase Emulator rehearsal using the production
`refreshPresence` callable and `expireStalePlayers` scheduled handler. The
handler was invoked directly against the emulator; this does not measure Cloud
Scheduler delivery or production capacity.

The run used twenty authenticated, joined clients. Admin fixture writes gave
each client a current seat and created twenty obsolete identities pointing to
those same seats with leases older than 45 seconds. While expiry ran, all twenty
current clients sent concurrent heartbeats in three cohorts, without retries or
reduced concurrency.

| Cohort | Start offset | Callable cohort duration | Successes |
| --- | ---: | ---: | ---: |
| 1 | 1 ms | 7,204 ms | 20/20 |
| 2 | 10,003 ms | 7,163 ms | 20/20 |
| 3 | 20,003 ms | 7,474 ms | 20/20 |

All sixty calls completed. Every current player remained connected with a
renewed timestamp, reciprocal seat holder and active membership. All twenty
obsolete identities became disconnected and lost their old memberships. No
current seat was released and no session deletion deadline was scheduled.

The committed harness is `scripts/prompt-614-presence-load.mjs`; the measured
runtime/harness commit was `ea571ed168d5c025afe92f1448e713cb9a6edc1e`. The result
was saved locally at `/tmp/p614-presence-load.json`. Reproduce after configuring
and starting a free worktree emulator row and building Functions:

```sh
node scripts/prompt-614-presence-load.mjs
```

The existing lifecycle and App tests separately cover the 45-second boundary,
expiry re-reading a concurrently renewed lease, independent GM browser expiry,
the ten-second client cadence, and one renewal in flight. This rehearsal adds
real concurrent transaction evidence; its seeded seat assignments are not a
new casting or full-game capacity proof.

The existing Prompt 638 core and Press/multiple-GM rehearsals also passed after
their disconnect requests were updated to carry the server-issued connection
generation. Both now assert a disconnected player record before resuming, so a
successful no-op cleanup cannot masquerade as reconnect evidence. Their local
results are `/tmp/p614-p638-reconnect-core.json` and
`/tmp/p614-p638-reconnect-press.json`. Those rehearsals retain their three-client
heartbeat batches and their stated limits; this twenty-client test does not
erase the historical twenty-three-client contention result or establish a
sixty-client limit.

No production data, runtime behavior, or application version changed for this
proof.

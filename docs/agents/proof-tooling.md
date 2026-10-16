# Proof tooling

Read this when preparing an allocated local proof, choosing an authority read,
or testing a callable's fresh action and exact retry. Use the existing runner
for that behavior; its source defines its cohort, deadlines and evidence.
The [execution policy](../AGENT_EXECUTION_POLICY.md) owns authorization, review,
test-first work and acceptance. [Worktree coordination](../WORKTREE_COORDINATION.md)
owns shared resources and emulator rows.

## Runtime plan and return

Reuse these existing tools rather than copying their implementation into a
new invocation. This page adds guidance, not automation or a new evidence schema.

| Existing tool | Already automated | Owner still checks |
| --- | --- | --- |
| `npm run storage:status`, `npm run coordination:status` | Read-only storage and host-wide ownership inventory. | The assigned checkout, current permission, and whether another owner still needs its resources. |
| `npm run emulators:configure -- auto` | Atomically selects and configures a complete free row. | The run is authorized and its commands use that same configuration. This command allocates resources. |
| [run-emulator-command.mjs](../../scripts/run-emulator-command.mjs) | Reserves wrapper ports, records its child, forwards signals to its owned child group and releases its process reservation on return. | All owned descendants, including separately launched browsers/admin helpers, have stopped; all allocated ports are free before releasing the configured row. Wrapper exit alone is insufficient. |
| [proofRuntimeFromViteSource / validateProofRuntime](../../scripts/pc10-full-game-demo-proof-helpers.mjs) | Checks the served Vite project and Auth/Functions/Firestore emulator ports against the supplied loopback demo plan. | The expected plan belongs to this allocation and matches the source and compiled Functions actually loaded. |
| [PC11 launchPlan / checkServedEnvironment](../../scripts/qualification/pc11-launch.mjs) | Builds a PC11-specific plan and validates served local-GM settings. Its allocated launcher records source/index bindings, bounds work and teardown, checks its recorded service ports and releases configuration on clean return. | PC11's cohort and budget fit the requested claim. Extra processes/ports and the complete imported Functions artifact tree are covered by the run's evidence. This is not a generic PC10 launcher. |

The PC11 source-only path creates neither runtime nor evidence directory:

```bash
node scripts/qualification/pc11-launch.mjs --check --gm-only \
  --project demo-pc11-source-check --evidence /tmp/pc11-source-check
```

For an allocated run, keep one plan and one final return record in its existing
report. Before launch, bind the absolute checkout, commit and clean/dirty status;
the actual compiled Functions files, including imported modules; the
demo project, complete row and any extra owned ports; served browser environment;
wrapper/child ownership; and the original work/cleanup deadline. Record actual
process IDs when each child starts. An index hash
alone does not bind imported artifacts. Reuse the runner's existing fields and
add only missing facts needed for this run. A source-only plan grants no allocation.

Freeze those source/runtime inputs until the owner receives the strict return.
On success, failure or cancellation, retain the primary result, close owned
browsers and helpers, stop the owned service groups, and verify the recorded
descendants and listeners are absent. Release only this run's reservations and
configuration after those checks. Record the stop time, remaining resources and
any incomplete cleanup. Let the owner resolve a remaining resource before reuse;
do not treat the next available row as proof that the last run returned cleanly.

Diagnostic instrumentation binds a separate artifact/hash and earns diagnostic
evidence only. Restore and verify the candidate's artifacts before an acceptance
run. Keep failed attempts failed, and distinguish process return, source tests,
mounted fixtures and authenticated gameplay in the existing report.

## Point reads and projection waits

Choose the read from the consumer's claim, not from a method's name or metadata.
`fromCache: false` and `hasPendingWrites: false` do not by themselves establish
that a snapshot includes a particular just-committed change.

| Consumer needs | Contract |
| --- | --- |
| One authoritative inspection after an action/denial | Bind the exact entitled document and original actor/session/role/group/lease. Use the proved server read path within the existing deadline, then recheck the original authority and document shape. An error, late result or contradictory state remains a failure. |
| A mounted projection to catch up | Keep the existing bounded waiter. Return only after its exact expected marker/revision and current identity/hydration/SDK/berth conditions hold. An older matching-scope projection remains pending; it gains no action or acceptance credit. |

The integration-only boarding repair is a concrete example of the first row.
At published source `dbc5da69`, `readCurrentWolfAttackFromServer` in
[pc10-two-browser-gameplay.mjs](../../scripts/pc10-two-browser-gameplay.mjs)
still uses `getDocFromServer`. Candidate `8fcf0c9f` changes its browser SDK read
to `runTransaction(database, tx => tx.get(exactReference), { maxAttempts: 1 })`
and bounds the outstanding evaluation by the original deadline. The transaction
callback reads only: it uses the selected normal GM Auth client, the exact current
attack document, no writes, no application retry or cache fallback, and unchanged
authority/metadata/shape checks. This is a candidate implementation example, not
a released generic strong-read API or permission to read private GM data.

An existing exact-marker waiter can already handle an old snapshot safely.
The integration Nebula own-player waiter, for example, accepts only the expected
code, outcome **and cycle**, then requires the actual loss rendering and locks.
An older marker is pending within its original bound. That source assessment
did not establish a defect or justify replacing its read with a transaction.

For navigation, capture the original document, UID, profile, session, role/group/
seat, server generation and mounted hydration/SDK state before the transition.
Exercise the actual listener → ordinary App resume → accepted hydration ordering.
The App owns any retry; the proof observes it. A parsed HTTP200 reply alone is
not current SDK authority. Keep a withdrawn intermediate epoch unqualified only
where the actual consumer proves normal recovery inside the original deadline;
changed scope, failed/late resume or unmatched final generation remains terminal.

## Fresh-action and exact-replay tests

Extend the callable's existing handler/transaction fixture. Useful published
examples are [Highwall mining](../../functions/src/highwallMiningCallable.test.ts),
[Boa recycling](../../functions/src/boaRecyclingCallable.test.ts) and
[Hummingbird harvest](../../functions/src/hummingbirdHarvestCallable.test.ts).
Use the real callable consumer and its transaction reads, not a duplicate guard
or a fixture starting only in the final accepted state.

| Case | Required observation |
| --- | --- |
| Current authorized fresh action | Its ordinary effect commits once with the source cost, revision and any natural random result. |
| Fresh action after actor disposition, authoritative home-vessel settlement or current-host settlement | Reject before an effect write, resource spend or random draw. Cover each applicable scope; a current host can differ from the actor's home vessel. |
| State changes after preflight but before the effect transaction | Re-read the authoritative documents inside that transaction and reject the fresh effect. Use the fixture's existing transaction boundary to inject the transition. |
| Exact committed receipt retried after settlement/control or cycle changes | Authenticate the same entitled actor, recover the exact matching receipt before fresh-action availability checks, and return the original domain result without another write, cost or random draw. |
| Foreign actor/scope, altered payload/request fingerprint or malformed receipt | Reject; a replay label or known request ID does not bypass authorization or exact receipt matching. |

Apply only the cases the callable's source contract supports; an uncommitted
pending roll is not an already committed allocation receipt. Preserve privacy,
client-write denials and the original server-owned transaction boundary. Observe
the discriminating behavioral RED before implementation, retain its test-only
commit, then implement and run the affected focused suites.

The October 16 candidate repairs `ac8b9c31` (tests) → `6bd9d6a5` (source) applied
this pattern to Highwall, Boa mission reclamation and Hummingbird allocation:
seven intended RED failures, then 92/92 focused callable tests and a Functions
production TypeScript check. These are candidate mocked-handler results, not
released behavior, emulator/Rules proof or native gameplay. Reuse the contract
and existing fixtures; do not import the candidate's unpublished modules or
require its test count as a new release gate.

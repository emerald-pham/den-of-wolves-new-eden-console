# PC07 independent risk review brief

Review the complete reconciled candidate against baseline/current main
`5e3d09d56a50aa712406a6f3cb6b64a81e70418e`. This brief is navigation, not approval.
The owner supplies the exact candidate SHA at dispatch. Use independent
GPT-6.1 Sol **xhigh** for the complex authority/privacy scope. Return all
actionable findings together with exact paths, reproduction and consequence;
the implementation owner repairs them. Follow-up is bounded to unresolved
findings or materially changed risk.

The [49-ID matrix](PC07_ACCEPTANCE_MATRIX.md), [execution record](PC07_EXECUTION_RECORD.md)
and [report](PC07_PLAYTEST_REPORT.md) separate implementation, normal local
gameplay, prepared UI, review, CI and production deployment. The October 2
owner correction authorizes future normal authenticated local/emulator proof;
it retains all functional criteria, independent review, CI and deployment.
PC08 and P605a gain no scope or completion credit. Private source material
stays outside Git; consult its routed index only for a concrete mechanic
question and paraphrase concise findings.

## Current authority and information boundaries

- Review `memberSession.ts`, its callable factory, join/resume adapters,
  `firestore.rules`, the ordinary member polling feed, App callbacks and actual
  store/client consumers together. GM-only raw root reads close a demonstrated
  foreign craft/cargo/host/history leak. The callable derives the actor's
  current group in one transaction and allowlists local vessel/craft fields.
  Press uses its entitled public header/SNN information. Ordinary members
  cannot select another audience or fall back to default foreign vessels.
- Cover role/group/connection-generation changes, malformed topology,
  wrong actor/session, kicked or disconnected actors, delayed old responses,
  stale persisted state and immediate withdrawal during a group transition.
  Preserve one shared cycle/phase clock and valid current console authority.
  Hosted small craft, Voyage, local repair ledgers and own retained craft must
  remain usable without disclosing foreign fields or resetting printed limits.
  Five repair ledgers retain their total host-use count and current local
  details only. Earlier foreign drone/service use becomes a strict cycle and
  revision marker. Review wire parsing and every actual repair consumer:
  withheld hosts must not restore a used action, waive second-host fuel, or
  fabricate a host/console label. The authoritative full server ledger is
  unchanged by these read-only projections.
- Review fleet partition/rejoin, notes, scout taxi passenger/fuel transfer,
  known-system sharing and navigation reads in `index.ts`, `fleetGroups.ts`,
  `fleetPartition.ts`, `fleetGroupOperations.ts` and `navigationProjection.ts`.
  Requests bind current actor/role/group/host, revisions and stable identity;
  mutation, private audit, receipts and audience projections commit together.
  No caller supplies hidden chart facts, arbitrary recipients, pursuit result
  or position. Exact replay must preserve its result without new writes.
- An in-flight route is visible only when both validated endpoints belong to
  the current group. Partition changes revoke/rebind its audience. Current
  group navigation emits sampled positions at one instant, never the private
  route chain or a foreign destination. Rejoin preserves per-ship knowledge
  and applies the logged highest-pursuit assumption once.

## Automatic Comms scouting

Review the internal committed-request continuation and its durable Firestore
request-create trigger together with the original protected GM resolver. The
server verifies the exact request fingerprint/reply and cadence before looking
up one fact on the current locked chart. Result, note, audit, Nebula marker and
ship-map fanout must be atomic and exactly replayable across event retry and
group merge. A committed legal scan survives requester disconnect; current
reader authority governs later delivery. The automatic path is not a callable
client-selected authority. Its audit has no fabricated facilitator UID.
Check `listGmScoutResolutionLog` and current GM/player report consumers for
owned-instance authorization, bounded allowlists, delayed old responses,
serial polling and withdrawal on group/identity/generation/connection changes.
Direct chart, result, note and audit reads remain denied by Rules.

## Automatic attack, timing and recovery

- Review attack math, ring configuration, lifecycle, target actions, boarding,
  audience schema and real callable adapters together. Five/six/seven target
  configurations must use their actual enabled vessels; failed configuration
  cannot fabricate a target, result, damage or defence.
- Declaration owns lock/parking/state/event atomically. Server randomness is
  committed before choices that depend on it; hidden assignments and modifiers
  remain private. Crew and GM projections are separate, direct privileged
  writes denied, and future-schema rejection revokes old visible state.
- Genuine current entitled player action/pass, target and boarding choices
  survive reconnect and exact retry. Unconfigured source actions are audited
  unavailable; a configured disconnected actor stays pending. Printed charged
  Missile/PDL actions remain reusable in their applicable ranges. Short Range
  fighter-first eligibility, destruction effects, full hit/unused-hit audit,
  survivor arithmetic and five-step order need complete source-consumer proof.
- Any shared timer hold blocks progress. Final resolution and damage reopen
  movement and ticker atomically without resetting the preserved clock or
  Press grant. Attack replay cannot repeat damage, parking or reopening.
  The owner P159 scenario composes normal start, maintenance, transit,
  declaration, player choices and final recovery through native/HTTP/UI paths.
- Review the cycle interstitial transaction/clear endpoint and every advance
  consumer. Clearance requires the exact current hold identity; competing
  devices clear once and replay preserves time. Cached/offline shuttle,
  airspace, GM claim and sampled navigation controls fail closed and recover.

## Release and presentation

Review the exact source-bound Functions consumer inventory, including shared
helper/factory/transitive consumers in both the baseline and candidate. Unknown
tuples fail closed; no broad `functions` fallback is permitted. Preserve WIF,
production local-GM exclusion and existing deployment/auth isolation.

The solo review scene uses local callback presentations and no shared writes.
Responsive, CIC font/geometry, navigation, reduced motion, ticker handoff,
DRADIS performance and bundle gates remain required. Catalog projections and
release notes must credit only the fixed49 and preserve historical counts.
The owner supplies the evidence root and exact candidate with the dispatch;
if approved, return the structured independent review receipt bound to that
SHA. Do not add a new gate or reopen a settled source decision without a
specific code conflict.

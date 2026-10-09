# Production delta and safe release-base reconciliation

## Recommendation

Construct a new isolated additive candidate from recorded published main
`1aab9503cd89fb69117dfe91d843c848ec18b98d`, not the unpublished PC10 checkpoint
`b9152b9ea2ce743070b777912e7e042f2db4b2f8`. Do not merge/rebase the entire current
branch into release. The two bases diverge at
`9bfe4c3ae338f21eb564323c0d26822a28b628ec`:30 published-side and1541 PC10-side
commits,761 differing files. No live remote refresh succeeded earlier; this is
the locally available recorded published commit, not a claim of current GitHub
HEAD. PC10 worktree was neither read for new state nor changed during this audit.

## Exact dependency comparison

SHA256 preimages, AST-extracted declarations/callbacks and line locations are in
[comparison manifest](evidence/released-main-preimage-comparison.json).

| Dependency | Released versus PC10 | Reconciliation |
| --- | --- | --- |
| `requireFacilitatorInstance`, `isActivePlayer`, `isConnectedPlayer`, `gmInstanceLeaseTimestamp`, `isLiveGmInstance` | AST declaration text byte-identical | Use released helpers unchanged |
| `gmAccess.ts`, `sessionLifecycle.ts`, `runtimeOptions.ts`, `gameSetup.ts` | Whole-file byte-identical | No import from PC10 needed |
| createSession/joinSession/loginGmAccess/claimGmInstance | Handler callback text byte-identical; callable wrappers differ | Keep released exports unchanged |
| request guards requireUid/session creation/presence | Exact declaration text identical | Keep released guards |
| requireGmClaimRequest | PC10 changes optional recovery spread from `recovering` to defined timestamp | Casting sends neither resume nor expectedClaimedAt; initial explicit claim uses released compatible path |
| refreshPresence | PC10 adds core/Press optimizations and reconciliation changes | Keep released function; qualify GM-instance heartbeat/revocation on reconciled candidate |
| securityCallable.ts | Absent from released main | Add companion-scoped transport wrapper preserving explicit released runtime/AppCheck options and privacy-safe denial records; do not import whole PC10 game wrapper/random producers or rewrite other callables |
| src/lib/firebase.ts | PC10 adds demo-actor named applications | Keep released default auth()/functions() API, compatible with casting; no demo-actor import |
| firebaseConfig.ts, cic.css, approved flag directory | Identical | Reuse released wiring/design/assets |

Ten modified-existing preimages match, including both workflows, firebase.json,
service worker, risk/profile/artifact tools and Vite config. Fourteen differ:
firestore.rules, Functions/root package.json, Functions index, deployment target
implementation/tests, and eight unrelated baseline type-repair files. Apply only
casting hunks to released versions. Exclude all nine-file `ccf749df` baseline
type-repair hunks, including the unrelated index narrowing; published main
already had recorded successful typechecks. Do not carry PC10 game changes.

## Exact new production infrastructure

- One new gen2 callable `castingCompanionCommand` in existing project
  `dow-new-eden-console`, regionus-central1, existing Node22/runtime limits and
  Auth/AppCheck. Canonical model compiled into generated private Functions core
  artifact. No new HTTP server, scheduled job or database.
- Four Admin-only Firestore roots: `castingWorkspaces` (session-bound root state),
  `castingSessionWorkspaces` (one immutable workspace/session),
  `castingPublishedHandles` (hashed192-bit form/dossier handle and active tombstone),
  `castingIngressCounters` (20new submissions/UID/hour and200/publication).
  Explicit `allow read,write:if false` matches for each; no client grants, composite
  index, existing game-data migration or participant prepopulation.
- Hosting adds casting build entry, `/casting{,/**}` rewrite before main fallback,
  noindex/nofollow/noarchive, no-referrer and no-store headers. Main service worker
  bypasses casting; no main navigation/sitemap entry. Build enablement
  `VITE_CASTING_ENABLED=1`; existing origin/path, no subdomain/DNS/new certificate.
- CI/build/artifact/deployment selectors include the model/core and one callable.
  Deploy narrowly: the new callable, additive deny rules and Hosting artifact;
  never broadly redeploy unpublished PC10 game functions. Rules/Hosting deployment
  still contains released-main content, so reconciliation must preserve it.

No new owner credential, secret, custom Auth claim, persistent human GM grant,
allowlist or expanded main authorization is required. Existing GM login plus
explicit owned per-tab instance controls editing. New callable transport gets
normal Firebase service invocation configuration through existing deployment;
public transport is not a Firestore/admin grant. Existing deployment principal,
Anonymous Auth and AppCheck/reCAPTCHA origin configuration must be verified
read-only before release; no invented access or additional credential creation.
Same origin means no assumed new domain registration. Missing permissions, if
actually observed, should be reported precisely rather than preemptively expanded.

## Minimal reconciliation and evidence plan

1. Create separate task-owned checkout at exact recorded published commit after
   parent coordinates freshness/main ownership. Preserve current reviewed branch
   and evidence; no mutation of PC10. Import new casting-owned files and apply
   only reviewed additive shared-file hunks against released preimages.
2. Test RED before companion-scoped wrapper implementation: explicit endpoint
   AppCheck/runtime, hashed-denial privacy and unchanged released helper/exports.
   Then implement wrapper and minimal index wiring. Keep released Firebase client
   and existing game callables/rules intact. Reconcile package/CI selectors without
   PC10 dependency additions. Add explicit pinned esbuild build dependency and
   lockfile reconciliation: the core build imports it directly, so relying on
   Vite transitivity is insufficient. Include any newly named companion wrapper
   in the casting-only callable consumer map and its fail-closed regression tests;
   the existing six-source map must not miss wrapper-only changes.
3. Native root/Functions build, meaningful affected unit/rules/selector/artifact
   tests, exact source/security review, compare all released noncasting exports
   and game-rule preimages. Measure published baseline and reconciled candidate
   budget independently. Prior PC10 baseline534040/current534058 overrun cannot
   be silently inherited or waived; released-base budget is not yet measured.
4. Reuse unchanged model/layout/Hosting proof, but allocate one focused synthetic
   Auth/Functions/Firestore run for released create/join/GM claim, own heartbeat,
   current-authority denial, workspace publish/submission/dossier/revoke and all
   four namespace denials. Changed base/wrapper needs fresh actual evidence.
5. With concrete technical gates passed, coordinate routine narrow deployment
   through parent/main ownership under existing build authorization. No additional
   generic approval request is needed. No release undertaken in this audit.

Owner input genuinely needed for **real participant use**: actual form questions
and personalized dossier content, intended participants/link-sharing purpose,
and a retention/deletion choice if not resolved by implementation defaults.
Existing shared-GM login/claim is normal use, not a new security grant. Retention
cascade/tombstones and abuse/capacity (fresh anonymous UIDs evade UID-only limits)
are technical work to close, not reasons to ask for blanket approval. No real
responses or prior private rulebooks may be seeded. Production Auth/AppCheck and
capacity/retention verification plus budget/main integration remain open.

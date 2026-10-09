# Independent synthetic milestone review


> Latest source milestone: [SESSION_MILESTONE.md](SESSION_MILESTONE.md). Session GM and bearer contracts now have synthetic source/tests; production integration and fresh renders remain pending.

> Current decisions and qualification supersede older proposals below: [DECISIONS_20261008.md](DECISIONS_20261008.md). GM/session authority and bearer links are approved directions, not implemented production contracts.
## Subsequent UI/transaction milestone receipt

Independent `/root/casting_security` Sol xhigh affected recheck of exact
`d6131d5c` passed 27/27 source/DOM tests. Four reproduced findings and the
late-export race are resolved: owner checks before directory inspection,
update preview binds instance ID/revision, public answers/retry identity survive
failure with pending submission disabled, definitive authority denial clears
private UI, and epoch guards prevent late reads/exports after invalidation.
No remaining finding in that affected scope. Later source difference is intro
copy only; actual render/typography/motion and backend connection are unapproved.

Independent FAQ/defaults coverage review at `b75de627` found only a missing
template-creation walkthrough. That clarification was added at `1e7ef87f`.
No misleading release or security claim was found. No runtime/tests were rerun
for that documentation-only review.

The earlier receipt below is historical: its live-edit policy was subsequently
replaced through observed RED/GREEN with explicit recipient snapshots and
owner-only authorization. Current recommended defaults are in
`CONTRACT_DEFAULTS.md`.

## Initial authority milestone receipt

Reviewer: `/root/casting_security`, independent gpt-6.1-sol xhigh.
Exact source candidate: `3ecc9cc9efdbcee4adec3fcf34730e79042a277a`.
Architecture and source reviewed; applicable repository instructions read.
No reviewer edits, infrastructure mutations or production runtime.

Result: two independently reproduced model findings resolved; no further
actionable defect within the stated trusted synchronous scope. Backend
connection is not approved. Independent native test recheck passed 6/6.
Reviewer inspected final source and confirmed reviewed files unchanged from
the exact source candidate. Historical corrected RED was reported by the owner,
not independently observed by the reviewer; committed logs retain that evidence.

Resolved: assignment now checks/hashes the expected previewed instance revision;
256 KiB UTF-8 operation payload and constructed response bounds prevent the
reproduced 2,014,063-byte accepted response. Review confirms authorization before
owner receipt replay, receipt workspace/UID scoping, independent instance IDs,
three retained instances, rotating publication handles, UID/workspace-bound
dossier projections and current grant revocation/reassignment.

Historical retry acknowledgements do not recreate revoked grants. Consumers
must refresh current state before presenting a previous share as active.

## Decisions required before backend connection

1. Define workspace bootstrap, who grants/removes admins and exact owner/admin
   permissions. Read current membership in protected transactions; authorize
   before replay. Server SDKs bypass rules, so handlers need their own checks.
2. Choose durable recipient sign-in and verified invitation directory. Arbitrary
   typed UIDs, names, email answers and game anonymous login do not establish
   intended recipient identity.
3. Public forms are bearer-handle accessible. Use cryptographically random,
   independent submission-attempt nonces or verified respondent scope for retry
   identity; prevent predictable cross-respondent receipt collisions.
4. Confirm live-edit sharing policy (the model currently reads current details)
   versus frozen recipient snapshots. UI must identify affected recipients on
   edits and bind preview revision on sharing.
5. Require no-store on sensitive responses/exports and no-referrer. Exclude
   secrets from browser persistence, service worker caches, logs/crash reports
   and receipts; clear rendered data on account change/sign-out/denied refresh.
6. Approve collection purpose and retention; define deletion of responses,
   instances, grants, receipts and minimal audits. Explain downloaded copies
   cannot be recalled; independently verify safe CSV export.
7. Preserve shared-project boundaries: exact Hosting target/function selection,
   narrowly named collections, App Check, WIF and explicit CORS allowlist.
   A separate site is not a separate Auth/Firestore security boundary.

Adapter proof remains required for legitimate foreign-workspace owners, revoked
membership, concurrent allocation/assignment, publication races, durable retry,
current-grant reads, bounded ingress and uniform unavailable errors. Source
tests do not establish Firebase rules/callable authorization, UI or production.

Supporting primary documentation reviewed by the independent reviewer:

- https://firebase.google.com/docs/firestore/quotas
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://firebase.google.com/docs/hosting/manage-cache
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy
- https://firebase.google.com/docs/hosting/multisites
- https://firebase.google.com/docs/functions/callable

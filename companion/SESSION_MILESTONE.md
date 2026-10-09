# Session-bound casting source milestone

This supersedes the pending source implementation portions of DECISIONS_20261008.md. No real adapter, live grant, deployment or new render qualification is claimed.

## Lifecycle and synthetic flow

Actual createSession stores lobby/turn0, creator role player, configuration unlocked. startGame is a separate action. Existing loginGmAccess then claimGmInstance is required for GM authority. The same session can remain in lobby and later transition to active; requireFacilitatorInstance is not lobby-only. We therefore bind casting to an existing selected session, with no startGame call or global GM privilege.

Boot now selects createSessionDemoAdapter, a hardcoded browser-only fixture. It opens Choose a DoW session. Create synthetic lobby creates turn0/lobby with no GM editing, Claim synthetic GM instance separately simulates an already-authorized GM's instance, then Use selected session binds casting. Existing synthetic lobby can be selected directly if its seeded instance is active. These are clearly labelled fixture actions; no credential, actual session, participant or real permission is created. Reload clears all data. Older createDemoAdapter is retained only for legacy regression fixtures; settings distinguish that surface.

## New authority/bearer contract

session-contract.mjs exports the selected gateway and fake serial transaction store. Every private operation, including receipt replay, checks current session-bound GM access, connected GM player, owned live instance, finite/nonfuture timestamps, and nonclosed/nondeleting session before using the internal model. Caller UID comes exclusively from verified server context, supporting existing Firebase anonymous authenticated GM identities. Old owner memberships are ignored. Workspace binding is immutable; a GM in another session cannot edit it. Session creation itself grants no authority.

Binding, data mutations and receipts commit atomically in the synthetic store. Interrupted-before-commit changes nothing; after-commit lost acknowledgements replay under current authority. Timestamp policies are conservative: missing player heartbeat and missing both GM timestamps deny; actual GM timestamp falls back to claimedAt. This is a deliberate narrowing of legacy helpers, not an expansion. Production must reuse authoritative normalization/helpers with current gmAccess in the same Firestore transaction; copying these fixture checks is insufficient proof.

Bearer dossier operation accepts only handle, requires no recipient account and returns only the frozen published snapshot. Handles use192 random bits. Assignment explicitly links a reviewed response to one independent character instance; UI has no recipient-account picker in current mode and warns anyone holding the link may view. Draft edits stay private until explicit update bound to the assigned instance/revision. Publishing again rotates the handle, and revoke invalidates it. Public operations derive workspace from stored handle, never caller input. Closed/deleting/missing associated session disables public forms and dossiers. No listing/raw checkpoint endpoint exists; synthetic checkpoint contains private fixture state and is trusted-only.

Session cleanup policy: DoW retains empty/disconnected sessions for seven days, then deletion. Casting handles fail closed if session disappears. Actual retention/cascade cleanup of casting records and permanent retired-handle/receipt tombstones remain unimplemented production dependencies; there is no promise of indefinite lobby or dossier availability.

## Meaningful RED and verification

-18dba6ea: actual consumer bridge to old implementation leaked private workspace in five cases: nonGM, expired/revoked access, staleGM instance, cross-session instance.8/8newconsumerRED, GREEN7c25f8b9.
-bec01aa2: actualUI lacked session prerequisite, GREENee1dd3ad.
-Bearer UI first run7b2bd3ce had wrong action label setup error, not functionalRED. Corrected7c7041be observed obsolete recipient picker, GREEN2a67042d.
-bcb15bfa: reduced gallery inaccessible to keyboard scroll, GREENba53bcae. Previous independent actual renders establish fontfallback and stickySkip visualRED; source now pins installed Menlo first in existingCICmono stack, reserves separate Skip row, scrolls gallery region and traps focus between gallery/Skip. Actual rendered/font/scroll verification remains pending, not waived.
-bb8d06a6: confirmed committedcreate+failedrefresh retry duplicatedlobby and transition lostfocus. GREEN0c5da800 retainsoperationID through fullaction, locksfields whilepublishing, restoresheading/selectfocus, refreshesassignedresponse revision.

63/63 native source/DOM tests pass, including20 new session gateway/store cases and20UI cases. Risk coverage: interrupted/lostack/repeated attempts, revoked authority before receipts, closedsession public invalidation, threeinstances/nooverwrite, stale revisions, bad/future/missing/infinite heartbeat, bearer snapshotupdate/rotation/revoke and denialofbearer editing. Broadening test binding interruption initially passed wrongsessionargument; corrected83d16975, no functional RED claimed for that setup error.

No browser/emulator was launched for this milestone. Earlier3engine tests only prove existing catchall denies casting direct access; new production backend checks need their own realadapter proof. Previous browser24case qualification is for earlier screens only, not these new source changes. Independent security/code reviews and final FAQ coverage are recorded separately with their exact scope.

## Remaining integration gates

-Real server adapter using actual verified Auth/AppCheck, currentgmAccess, shared liveGM helpers and storedbinding in one Firestore transaction; proper heartbeat/instance lifecycle, bounded ingress, scope-safe public submit nonce/rate limiting and session cleanup.
-Additive /casting build/routing/noindex/nofollow/noarchive/no-referrer/no-store without main navigation or sitemap entry; no production preview adapter in build. Existing hostingURL verified, no DNS required.
-Fresh actual-render typography/intro/session/bearer workflows in a parent-allocated browser window; independent final renders/review; actual spreadsheet-consumer CSV interpretation.
-Real form/recipients/purpose, retention choices and parent coordinated release. Synthetic only until then.

Independent security review found kickedAt omission and truthy AppCheck acceptance at83d16975; actualconsumerRED99b7865a reproduced both, fixed1f39edea with current kicked-player denial and exact appVerified===true.63/63fullsuiteGREEN. Independent fresh security review of1f39edea resolved both findings,20/20sessiontests independently passed, no new affectedfinding. Independent UIcode review83d16975 confirmed all requested recovery/focus/control/gallerysource fixes and20/20DOM tests. FAQcoverage complete with preview deletion wording qualified. Standalone source build passes; buildhashmanifest does not claim fresh visual qualification.

## Actual Firebase source integration, 2026-10-09

Real Firebase entry/adapter and transactional handler now wired at `/casting` in isolated source. See LOCAL_INTEGRATION_PLAN.md for exact proposed production delta and pending runtime allocation. Actual handler plus preserved existing GM/session/casting regressions: 96 passed; companion: 66 passed. Independent client review found loading navigation race and credential retention in retry identity; observed both failing tests at ce0ec7ab, then fixed one-shot login and disabled loading navigation with Retry connection. Evidence client-review-red/green retained.

Auth-entry initial test failed because its harness omitted matchMedia; that is setup failure, not a behavioral RED for auth hydration. Hydration source correction was proactive within already RED-gated client/route work. Corrected harness passes; no retrospective RED claim. Full type builds remain blocked by baseline errors independently reproduced on b9152b9. New casting source has no reported type errors. Actual current browser/emulator integration and deployment remain unqualified; no runtime started or live mutation.

Actual-handler independent review found no backend transaction/rule issue at a4c739c1. Client authority review found sibling-instance adoption and insufficient heartbeat authority checks; two observed RED tests eacb24ab. Fix: explicit per-tab claim only, no automatic sibling adoption/renewal; heartbeat validates casting workspace current authority after renewing presence, or prerequisite GM access/current instance before binding. Adapter four tests and entry one pass. Four actual private namespaces added to prepared engine harness; not run. FAQ updated for current source status and real owner flow. Future companion core changes must be classified as high-risk Functions changes, and deployment artifact verification must include the generated core bundle before release; these CI wiring checks are still open.

## Build/CI follow-up

BUILD_CI_MILESTONE.md supersedes earlier build/CI blockers: root and Functions builds now pass after minimal independently reviewed PC10 type repairs; source main-owner reuse commitccf749df. Generated core verification/classification/named callable consumers complete. 351 affected runtime regressions and180 tooling/profile tests pass. Existing PC10 session-runtime budget remains failed (baseline534040 vs candidate534058 bytes; limit512000), independently reproduced without changing the budget. Parent must coordinate this dependency before runtime/release. No provision/deploy or heavy runtime.

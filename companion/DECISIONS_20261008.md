# Current decisions and qualification checkpoint

Supersedes earlier subdomain, separate owner allowlist and required recipient-login proposals. Those old source contracts remain implemented only as synthetic scaffolding and are not the approved production design.

## Approved direction

- Unlisted `/casting` under the existing DoW URL. Verified default host is `https://dow-new-eden-console.web.app`; custom-domain mappings remain unverified. No new Hosting site or DNS is needed for this chosen path. An additive build entry/routing/header configuration and named server Functions still need reviewed integration/deployment through the existing GitHub/Firebase stack. Existing deploy identity permissions/quota must be checked, not expanded presumptively.
- Existing server-validated GM authority authorizes editing for the associated session; no separate owner bootstrap. Bearer links only view published dossier snapshots, never edit or reveal submissions/drafts. Use random high-entropy handles, explicit publish/update and rotate/revoke; no listing.
- All prior tests requiring recipient login/owner allowlist prove the old model only. Fresh consumer RED, implementation and independent security review are required before adopting GM/bearer contracts. Production adapter and path integration do not exist.

## Actual GM authority inspected

`functions/src/index.ts` loginGmAccess writes server-issued `gmAccess/{uid}`; logout deletes it. `functions/src/gmAccess.ts` defines seven-day validity. claimGmInstance requires current access, existing session and active session player before assigning an owned instance. No password/digest is copied into the companion.

The existing `requireFacilitatorInstance` reads session, `sessions/{sessionId}/players/{uid}` and matching `gmInstances/{instanceId}` transactionally; requires current active player role gm and live instance owned by UID. Presence lease is 45 seconds (`sessionLifecycle.ts`), with legacy missing timestamps accepted by existing helpers. This helper alone does not reread gmAccess: casting must also check active gmAccess inside the authoritative transaction so logout/expiry cannot leave a retained session instance authorized. Direct Firestore `isGm` role check is weaker and must not replace the server check.

Safe proposed binding: immutable casting workspace `sessionId` established by a currently authorized GM for that existing session. Every private read/write/receipt replay rechecks verified Firebase UID, current gmAccess and the bound session's live instance; derive session from stored workspace, reject mismatched caller session/instance, and discard late UI results after auth change. Existing anonymous Firebase identities are intentionally supported by DoW GM access, so old durable-recipient/owner-auth assumptions must be removed deliberately.

**Precise unresolved pre-game question:** which existing DoW session should own this casting workspace, and must casting remain editable before any live GM instance can be claimed? The safe default is an existing-session-bound workspace requiring live GM authority. No global pre-game privilege or credential grant is invented. Parent must resolve any requirement beyond that before broadening access.

## Bounded qualification

Loopback synthetic browser runs completed by 23:42:47 UTC; one Chromium at a time on owned row5 port5178. Actual touch/overflow RED committed0f9161d4, corrected f7316d67. Independent static intro visual RED71e9815f, corrected d49956ba. Final24 cases across phone/desktop/landscape/200% text report zero width/target failures/errors. Actual viewport images resolve fullpage/fixed-overlay capture ambiguity. Source/build hashes: `evidence/qualified-build-manifest-20261008.json`.

38/38 native source/DOM tests pass. Three isolated Firestore engine tests pass on demo-dow-casting-20261008/127.0.0.1:8130: five actor classes cannot read/list eight private casting paths; owner/anonymous cannot create/update/delete/self-grant; existing game-GM entitlement positive control can read its genuine game session but cannot access casting namespace. This is observed deny-all rules proof, NOT implemented GM backend authorization or bearer sharing proof. No production rules changed.

Independent exact CSS review f7316d67 passes. Refreshed independent typography/motion review confirms phone/desktop/landscape static intro corrections and paced seven-flag animation; animated replay Skip and restored focus observed. Remaining qualification gaps: initial home Courier vs subsequent Menlo actual fallback, enlarged-text intro scroll-through all flags (sticky Skip partly covers current flag), reduced-motion firstvisit rendered evidence, full-duration animated replay. Dossier workflow/new authority requires separate future qualification. No gate waived.

Artifacts retained locally at `/tmp/dow-casting-qualification-20261008`: PNGs, ARIA snapshots, actual platform-font metrics, video/timeline, exact browser harness, rules logs/cleanup. All hardcoded synthetic data. No private rulebook/print material imported.

Own Chromium/context/server closed; Java PID33057 exited143 after owned SIGTERM; row5 runtime/config reservations released; owned ports5178/8130/9350 have no listeners; temporary dependency symlink removed at23:43. No other task's resources or PC10 data touched. No tests remain running and no deployment occurred.

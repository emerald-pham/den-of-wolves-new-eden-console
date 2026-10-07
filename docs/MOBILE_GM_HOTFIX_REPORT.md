# Mobile GM hotfix

Owner-directed urgent repair, isolated from unfinished PC10 on the live
`0.5.68` base `248ba5fe7460dd2708baf4dc152190001ffbdb20`.
The original dirty checkout, PC09 evidence, and PC10 candidate remain preserved.
This hotfix earns no numbered-prompt closures.

## Scope and acceptance

- Expanded GM DRADIS must occupy a usable modal surface above the header and
  Primary Status. A normal phone tap closes it. Escape, keyboard containment,
  restored focus, narrow phone, desktop, and short landscape must work with
  normal and reduced motion, using existing design tokens and fonts.
- An authenticated GM must recover from ordinary mobile link interruption and
  natural presence expiry through the original owned claim. Live authority
  still expires after 45 seconds. Recovery must never reverse an explicit
  kick, release, signout/revocation, changed claim, foreign identity, terminal
  session, or conflicting core station. Inactive claims cannot expose private
  data, retain a ship write grant, or reclaim another GM's occupied lanes.
- Server GM authorization and its device timestamp last seven days. Persist no
  password. Initial Code of Conduct acknowledgement also lasts seven days,
  with all three checkboxes and the existing ten-second review preserved.
  Changed or unversioned terms require real acknowledgement again. The
  separate motion-safety choice retains its existing duration.
- Awaiting CIC authentication/handshake uses the red warning token. Preserve
  the PC09 Cycle 0 wording and Settings explanation that the GM starts the game.

## Baseline evidence and limits

Authenticated actual layout run 5 reproduced the failure on 390×844:
all three sampled close-button points were intercepted by header/ticker/rank
content, and a normal tap timed out. The expanded panel's z-index is trapped
inside the routed ScreenFade stacking context. Screenshot and full geometry:
`/tmp/dow-pc10-evidence/mobile-gm-base-layout-5/`.

Earlier runner attempts 1–4 stopped before this interaction; they provide no
DRADIS bug credit. Run 2 crashed in the observer; its exact session/identity
cleanup is separately retained. All other completed attempts recorded cleanup.

The first presence run retained GM for 70 seconds in the foreground. Chromium's
requested freeze did not suspend its heartbeat, so it provides no suspension
proof. This is not evidence of the cause on the owner's physical iPhone. The
source separately shows that live-list absence or listener failure discards the
remembered claim, while natural lease cleanup deletes the claim altogether.
A real 55-second browser network interruption then reproduced loss of the same
GM instance after reconnect in `/tmp/dow-pc10-evidence/mobile-gm-base-presence-6/`.
Its normal foreground heartbeat remained valid first; the outage aged the lease
beyond 45 seconds. All owned browser/session/identity resources were removed.
This proves a local recovery defect, not the exclusive cause of the reported
iPhone event. The runner-only aborted network launch is retained separately.

## Test changes

New regressions cover exact seven-day server/client boundaries, invalid/future
stamps, version-bound real consent, original actor/lease recovery, missing and
foreign claims, changed leases, explicit disconnection/revocation, expiry,
kicked members, closed sessions, conflicting stations, fresh lease rotation,
private-grant removal, occupied lanes, late and malformed replies, modal escape
and focus return. Existing acknowledgement fixtures use the public acknowledgement
helper for the new record format; these remain prepared unit/render fixtures,
not normal-auth gameplay proof.

Existing modal tests inspect the current portalled node instead of the removed
compact node, preserving expansion/collapse motion assertions. The geometry fixture counts
only DRADIS source/destination measurements, so ContactPlot reads cannot consume
its four expected bounds. The missing-manifest assertion waits for the actual
asynchronous listener event rather than assuming it has already occurred. Existing GM
manifest-error/missing-instance tests now require immediate removal of live
freshness and private crisis data while retaining the remembered descriptor for
server reconciliation. Late private callbacks remain rejected. Existing explicit
role-demotion, no-claim, private rules, and server revocation expectations remain.
The waiting-state test now expects the owner's red token with the same accessible
copy. An additional ephemeral recovery-state test ensures it is never persisted and
resets on identity reset. A mounted recovery hold keeps private controls absent
while the original claim is checked. An explicit server role-demotion negative
prevents automatic promotion of a fresh demoted claim. The existing same-UID sibling lifecycle assertion now checks an inactive
natural-expiry descriptor instead of deletion, while preserving live sibling,
player role and membership assertions and asserting no stale private grant.
No tests are skipped or
deleted; test-name selection is reported separately from full-file validation.

## Implementation and independent review

Expanded DRADIS uses a body portal above the shared header, existing CIC fonts
and tokens, keyboard containment, focus restoration and responsive layouts.
Its rendered presence requires live/server GM readiness. Losing readiness or
entering recovery closes it, releases scroll and cancels the old animation;
restored authority permits a fresh normal opening. The CIC waiting label and
dot use the defined red `--cic-danger` token and preserve the PC09 wording.

Server recovery requires the same authenticated actor, session, instance and
canonical claim token, current seven-day access and an original naturally
expired lease. It rotates the lease, removes old private write grants and
respects another GM's occupied lanes. Explicit demotion, kick, release,
disconnect, revoked access, future/malformed leases, terminal sessions and
conflicting core stations cannot manufacture recovery authority. Client reply
fences cover identity, connection, member, mode, route and claim changes; the
current manifest confirms the returned lease. Persisted descriptors provide
no private authority.

Independent Sol 6.1 Max initially returned four findings, repaired test-first
with one reconciled bounded follow-up. Later focused regressions proved that
private subscriptions could bind before live/server startup readiness. Source
63d8c8b1 adds that readiness and rejects stale private/manifest callbacks;
genuine current listener errors still withdraw private authority. Source-only
review passed. Native Actual 6 then found that an offline modal could remain
open without a recovery flag. Two new red regressions cover offline/cache
loss. Source 67abdb11 narrowly gates the rendered modal on live/server readiness,
preserving the existing offline attack reconnect readout. The temporary broad
route-hold attempt failed that existing readout test and is retained as a patch;
no existing test was altered to accommodate it. Only the two new regressions
were corrected to match the established readout contract; both remained red
until the modal fix. Full GM validation then passed all 158 tests.

The deployment consumer audit was repaired because the existing classifier
correctly refused the newly changed GM access helper. Test-first exact hashes
and production call-site coverage select claimGmInstance, expireStalePlayers
and loginGmAccess. Unknown source drift still fails closed, and historical
contracts/gates remain intact. The PC09-only fixture now reads accepted 248ba5fe
rather than changing HEAD, preserving all its digest/consumer/drift assertions.
Independent review passed Source 3cc6255b; no Functions bytes changed later.
The local range prediction selects three Functions in one batch and Hosting
last, pending confirmation by the exact-main workflow.

The typography initializer must use each exact source's consent format. New
regressions execute that initializer and the actual current/PC01 readers:
current version-bound JSON passes, PC01 rejects it, and both reject future
acknowledgements. Source a63c5efc gives only the exact PC01 archive its supported
numeric format; current product consent stays strict. All 11 release-gate
contract tests pass. Accepted metrics, thresholds, cases, exact reference
source and CI/deployment requirements are unchanged. Independent review of
this fixture and the narrow modal repair passed a63c5efc without findings.

Candidate d0069de3 was pushed once and opened as PR #14. Its automatic push CI
37694731814 and PR CI 37694764432 both failed before the longer checks:
the unconditional release contract imported TypeScript before CI installed its
locked dependencies. The failure logs remain retained. Test-only 617d9ee9
adds two bootstrap/checkout contracts; its reconciled red run passes twelve
and fails the ordering assertion. Source c9f20746 moves the existing root
`npm ci` to one unconditional step before the same contract. Functions install
conditions, all gates, thresholds, permissions and WIF remain unchanged.
All 29 focused tooling contracts pass, including thirteen typography release
contracts. Independent bounded Source review passes c9f20746 without findings.
The initial head-only PR checkout proposal was rejected by that review; only
its new, uncommitted test was corrected, with the original patch and two-red
log retained. PR synthetic merge coverage and trusted exact-main input priority
remain intact. Product and browser-harness bytes are identical to a63c5efc;
the repaired candidate needs fresh hosted CI before merge.

All review reports are retained under /tmp/dow-pc10-evidence as
OWNER_MOBILE_GM_HOTFIX_RECONCILED_REVIEW_20261007.json,
OWNER_MOBILE_GM_HOTFIX_F134_RECONCILED_FOLLOWUP_REVIEW_20261007.json,
OWNER_MOBILE_GM_HOTFIX_RELOAD_STARTUP_TARGETED_REVIEW_20261007.json,
OWNER_MOBILE_GM_HOTFIX_DEPLOYMENT_SELECTOR_TARGETED_REVIEW_20261007.json,
and OWNER_MOBILE_GM_HOTFIX_OFFLINE_MODAL_TYPOGRAPHY_TARGETED_REVIEW_20261007.json.
These reviews are source-only and never upgrade failed native runs. The separate
OWNER_MOBILE_GM_HOTFIX_NATIVE8_EVIDENCE_REVIEW_20261007.json passes a bounded,
read-only audit of the latest authenticated runner and its retained result.
The bootstrap follow-up is recorded in
OWNER_MOBILE_GM_HOTFIX_CI_BOOTSTRAP_TARGETED_REVIEW_20261007.json.

Other test fixture corrections remain traceable: normal mocked GM readiness
is explicitly live/server; startup negatives override it. Cycle 3 is scoped to
Cycle controls because the header also displays it. A new manifest case first
omitted its crisis fixture and was corrected before its meaningful red run.
Explicit single-browser disconnect still deletes its claim; only natural
expiry expects a retained inactive descriptor. Native observers use the
normal document's exact Store and Firebase SDK module identities. The Back
link includes its CSS arrow in its native accessible name. No timeout,
authority/privacy requirement, performance budget or release gate was relaxed.

## Local checks and retained native evidence

The initial affected eleven client files passed 589 tests. Final focused suites
passed GM 158, service 238, store 28 and font 62, across separate runs rather than
one full-project count. Affected Functions passed 283, and Rules passed 164 in
four files using the separate dow-new-eden-rules-test project on the reserved
emulator. Deployment contracts passed 149. Typography release contracts passed
eleven at a63c5efc and thirteen after the CI bootstrap repair. Web/Functions
builds, lint (zero errors and sixteen existing warnings),
bundle, documentation, roadmap and player-copy checks passed. Computed typography
passes 56 PC01 comparisons plus eight Voyage metadata renders
across four viewports and both motion modes, with zero comparison/audit issues.
Ticker passes all 33 geometry tests and 24 browser smoke cases, plus the normal
and reduced-motion lifecycle proofs. The normal capture proves Press-to-Red-Alert
physical handoff, a complete Red Alert traversal, two Stand Down passes and
return to Press.
The sustained-render gate also passes against unchanged baseline version 21,
using the fresh a63c5efc production build. These rendered gates use prepared
fixtures and supply no additional authenticated gameplay or actor-concurrency
credit. Exact CI/deployment receipts remain pending.

| Actual | Exact source | Outcome and qualified evidence |
| --- | --- | --- |
| Baseline layout 5 | 248ba5fe | FAILED: normal phone tap intercepted by header; three close-hit points reproduced. |
| Baseline presence 6 | 1efcb390, unchanged baseline product bytes | FAILED: foreground GM survived 70 s; a real 55 s outage lost its original instance. |
| Fixed layout 1 | 575de166 | FAILED overall at undefined red token; eight responsive geometry/tap/keyboard/focus/font cases passed first. |
| Fixed color 2/3/4 | 4d092f39 | FAILED at subsequent navigation/reload checks; exact red copy/dot passed first. |
| Fixed color 5 | 3cc6255b | FAILED at a text-only Back locator; retained screenshot shows the console and arrow-prefixed native link. |
| Fixed color 7 | 3cc6255b | PASSED: normal Auth, red copy/dot, same-identity/instance reload without renewed consent, actual Back navigation and GM Console return. |
| Fixed recovery 3 | 4d092f39 | FAILED at a duplicate-SDK privacy observer after qualified real 55 s recovery, original claim rotation, grant removal, occupied peer lanes and modal reopen. |
| Fixed recovery 6 | 3cc6255b | FAILED before return because the offline modal stayed open; owner-only callable grant and raw-private denial passed before the real 55006 ms outage. |
| Fixed recovery 8 | a63c5efc | PASSED: two normal Auth actors; reload/navigation, real 55007 ms outage, original claim recovery, occupied peer lanes, modal cleanup/reopen, scoped privacy, native peer kick and explicit resume denial. |

Fixed-layout eight cases cover 320×844, 390×844, 844×390 and 1440×900, each with
normal/reduced motion. The undefined token was corrected at 4d092f39. Later
color runs have zero new render cases and do not inherit full eight-case
credits. Actual 5's selector mistake remains failed; Actual 7 captures the real
arrow-inclusive accessibility name, href and actual navigation.

Recovery 3 used two independent normal Auth identities and two Chrome processes
and contexts. A genuine 55005 ms outage aged the original lease 59480 ms while a
second GM occupied both lanes. The original UID/session/instance recovered
with a rotated claim, empty lanes and no old private grant. Its later
invalid-argument error occurred in the observer before Rules. The corrected
observer uses the actual versioned SDK and a public instance read as a positive
control; raw private grants remain server-only for owner and peer, with an
owner-only callable projection. No Rules or privacy boundary was changed.
Latest-source Actual 8 passes the complete bounded recovery/privacy/removal check,
including the positive public SDK read, raw-private denial for owner and peer,
owner-only grant projection before interruption, removed grant afterwards, native
peer kick, absent original claim and explicit server resume denial. Its 55007 ms
network interruption aged the heartbeat 60820 ms. Offline DRADIS closed and
released the body scroll lock before recovery; the restored console reopened
and closed it with Escape. It also repeats normal reload/navigation without a
renewed consent prompt. The populated grant checks use an admitted peer before
its GM claim, so they establish admitted-peer privacy. After recovery the grant
is absent; later denials and projection omissions establish removal and no
restoration rather than a second populated private-record case. All ten
Google cleardot.gif connectivity-probe attempts were aborted by the existing
local-only browser boundary; there were no completed external browser requests
or production gameplay requests. This is two automated Auth actors and two
Chrome processes/contexts, not human or physical-phone proof.
The call ledger retains background scout-list HTTP 400 responses in the lobby
and post-kick HTTP 403 denials. Empty page errors do not imply that every RPC
succeeded; this scoped proof does not certify those background scout endpoints.

All completed cohorts record scoped browser, session, join pointer, membership
and fresh Auth cleanup, with zero owned active session/player/GM scope. Admin
operations read or clean up those owned fixtures only; gameplay uses normal
Auth/UI/SDK/server paths without clock acceleration. No production gameplay
was mutated. Evidence provides no physical iPhone, Safari, OS suspension,
human-device concurrency, 21-session, whole-game-ending or manual-free credit.
This hotfix earns zero PC10/catalog closures: 703/751 overall and 245/293
campaign closures remain the accepted main snapshot.

## Release status and remaining work

Version 0.5.69 is prepared but not released. Latest-source native recovery,
computed typography, ticker and sustained render are complete. Publish the
reconciled candidate through its authorized PR and candidate CI. Then land the
authorized
candidate, verify exact-main CI and the selected Functions/Hosting deployment,
strict revisions, health/IAM and live build version. Record the exact receipts
before calling the release complete.

PC10 remains preserved for its full acceptance and release sequence; PC11 has
an independently authorized checkout and runtime. PC12, licensing, private
assets and unrelated services remain outside this hotfix.

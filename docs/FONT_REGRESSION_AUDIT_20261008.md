# Font regression investigation — 2026-10-08

Report: owner describes fonts regressing everywhere. No reproduced cause yet.
Compared released 0.5.68 `248ba5fe7460dd2708baf4dc152190001ffbdb20` with
0.5.69 `a0e38bef957b4cefccfff20808b8a054c5f71489`.

## Verified source findings

- No changes to `src/styles/cic.css`, global body family, global native-control
  inheritance, `index.html`, `vite.config.ts`, or public font assets in this range.
  CIC stack remains SFMono-Regular, Consolas, Liberation Mono, monospace; display
  aliases mono. No @font-face or downloaded-font loader occurs in the source.
  Platform fallback is therefore a real font choice, not evidence of failed
  network loading. Computed CSS family alone cannot identify the face painted.
- New expanded GM DRADIS is portaled into document.body. Modal sets mono family
  but ancestor selectors/inherited context differ. This is a targeted risk, not
  a verified explanation for the global report. Recovery adds a new role-select
  status paragraph. Normal route typography declarations are unchanged.
- Connection status color changes to danger red; size/weight are unchanged.

## What the existing gates prove

`test:font-consistency` is a stylesheet/source contract: display aliases mono,
body uses mono, controls inherit, forbidden office faces are absent. It cannot
prove emitted assets, font selection, rendered geometry or user transitions.

`test-typography-browser.mjs` compares 7 sampled surfaces × 4 viewport sizes ×
2 motion modes = 56 cases against PC01; eight Voyage cases sample four metadata
labels. It checks family strings, size, weight, line height, tracking, wrapping
and representative bounds. It uses Vite createServer and a prepared DRADIS hook,
not the final production dist. DRADIS sample is the admiral/player plot. The GM
sample is heading, section title and starmap label; expanded GM portal, recovery
and other text are outside those assertions. It waits for document.fonts.ready
but does not identify the actual platform face. Thus 56+8 green cases do not
establish all-screen or final-build typography correctness.

## Cross-app failure boundaries and changes

Chain Scanner tests around lines 16422–16426 directly set etEverUnit to Days
after openEdit; they prove saved values, not Hours→Days handler behavior. Add
unit tests above exercise changeQuickEvergreen. A focused Edit transition with
prior-state/default/custom intent assertions would catch the reported rule
divergence without a full matrix. Patch supplied separately for owner integration.

ReadBar `Checks/UIContract.swift` asserts delegate card width >=420, while
`scripts/check.sh` compiles/runs inference, native, transport and other contracts.
Those layers cannot establish real app typography or working UI transitions.
Blocked UI automation must remain a gap despite native inference passes.
Guidance patch preserves mandatory TDD and coordinated synthetic-data app review.

All three guidance patches require an independent reviewer of the actual final
build, baseline comparison, actual rendered face/fallback, computed typography,
readability and overflow at relevant states/sizes, with explicit omissions. This
is the owner's requested release requirement, not a new automated framework.

## Next bounded verification and stopping condition

Parent owns runtime allocation and publication. Once allocated, compare released
base and candidate production builds on the reported platform using synthetic
fixtures: shared chrome, normal role, GM, expanded portal and recovery. Capture
actual font selection and computed style, emitted CSS/asset identity and rendered
screens. Add a discriminating affected-consumer regression and negative control
only after isolating a defect; fix minimum source and obtain independent final
build typography review. Do not change global type spec speculatively. No browser,
emulator, build, CI, deployment or live typography pass is claimed here.

Residual risks: platform/system fallback, text scaling/browser settings, stale
served assets, build-only cascade and unsampled inheritance paths. Static source
audit cost is low; a focused final-build comparison needs allocated browser time,
not new accounts or whole-game replay.

## Subsequent cycle-clearance handback

Owner screenshot metadata and pixel inspection identify the cycle briefing's
Clear cycle briefing // resume clock action, not Maintenance Proceed controls.
Parent measured blue grid x37–904 in a 942px PNG, leaving 37px dark gutters;
CSS viewport is unknown. This worker's Library transfer returned HTTP403 twice
and cloud-local materialization was inaccessible on the Mac; screenshot pixels
were not available to this worker. No full-bleed CSS change is claimed.

Test-first commit `fc253cd3` adds real mounted-consumer role-loss, mismatched
UID/session, recovery and initial-player reconnect regressions. Five failed
before implementation; existing two clearance tests now supply genuine GM
identity, keeping their assertions. Fix `bec5779d` limits visibility and dispatch
to matching current GM identity/descriptor with recovery excluded; dispatch also
requires fresh server state. Offline GM control remains disabled. Existing server
authorization is preserved (active members remain authorized by the callable);
this is the requested UI restriction. Focused component, announcement and service
suites pass 21 tests. Raw red/green logs: /tmp/font-clearance-red.log and
/tmp/font-clearance-green.log. Independent Sol code review found no actionable
findings on implementation blob dfd24e96166a7d24d446b5f33a5882eedd157787.

Production build passes after linking existing root and Functions dependency
directories. Initial build failed because Functions dependencies were missing;
that repair justified the retry. Build log: /tmp/font-clearance-build.log. No
version bump/CI/deploy performed: parent reconciles the whole visual candidate,
release metadata and final gates. Required independent rendered typography
review remains outstanding.

ReadBar runtime was subsequently confirmed released by parent. Chrome control
was unavailable; in-app browser reused existing route/session, so it was closed
without proceeding into real user data. Only the visible safety heading was
inspected: mono family stack, 48px size/line height and weight700. This is neither
actual painted-face identification nor global font correctness evidence. A
fresh browser profile and parent-accessible screenshot are still needed.

Preserve isolated checkout and both borrowed dependency symlinks for parent
integration. No retained PC10/slot2 processes were modified.

## Completed bounded private-browser qualification

Owner authorized the established Playwright private-context path. All browser
contexts and ephemeral loopback preview servers are now closed; runtime may be
allocated to Chain Scanner immediately. No retained services or real user data
were used. Original screenshot transfer403 remains recorded; this qualification
reproduced the real consumer with synthetic state, without bypassing that403.

`7e147b4c` production-builds the real TurnStartAnnouncement component in a tiny
fixture and observes the full-bleed regression: x16,width358 at viewport390.
It retains GM/player screenshots at390×844,844×390,1440×900 before asserting,
and uses CDP CSS.getPlatformFontsForNode to identify actual painted faces.
`bbda43da` removes ground padding, paints CIC panel to physical edges and keeps
content/clearance insets and safe areas. Six rendered cases pass edge coverage,
no horizontal overflow, nonzero text geometry and correct GM/player visibility.

Independent visual review found intermediate animation made initial06/07 pixels
unsuitable for steady readability. `dc522a1f` repairs the fixture to reproduce
App's data-motion=reduce and asserts all sampled ancestor opacities are1. Fresh
steady TRAITORS screenshots/metrics: /tmp/dow-cycle-render-steady; passed six
production-built consumer renders, log /tmp/font-steady-green.log. This is a
fixture repair, not a product animation change.

Released0568/0569 synthetic consumer builds: /tmp/dow-cycle-release-0568 and
/tmp/dow-cycle-release-0569. Initial-state family,size,weight,line-height and
actual painted-font metrics match each other and candidate without deltas.
All samples paint Courier on this Mac, despite computed mono stack. This is an
existing platform fallback, not a reproduced0569 typography change.

A fresh private deployed noauth safety inspection independently confirms version
0.5.69, computed mono family, 24px size/line height, weight700 and actual
Courier-Bold with zero font network requests. Evidence /tmp/dow-public-font-runtime,
log /tmp/font-public-runtime.log. Firebase traffic was blocked. No statement
about authenticated routes, iPhone font selection or all-screen correctness is
supported by that single safety sample. Do not speculatively replace fonts.

Final full-app production build passes (/tmp/font-visual-final-build.log); final
focused suites pass83 (clearance/announcement/service21 plus aesthetics62).
Independent reviewer verified full-app index links index-Dt955Y5i.css with
SHA25625173ae136116a84f0f907ed96c5faf965c3ec91a197f86cd9943c4e2f96121f,
and its emitted rules match the scoped reviewed CSS. Rendered fixtures exercise
actual production-bundled consumer code; they are not full authenticated app
runtime. Parent retains whole-release ticker/typography CI, release metadata,
merge/deploy and final reconciled-candidate review responsibilities.

Global report remains unresolved on the reporting iPhone; the investigated
released range has no reproduced sampled font delta. Resolved requested defects:
blue background gutters and non-GM clearance visibility.

Independent Sol typography review completed with no remaining actionable findings
on product candidate bbda43da and evidence repair dc522a1f. It inspected all six
steady06/07 screenshots: clean wrapping/readability, unobstructed44px GM button,
edge coverage and zero horizontal overflow. Exclusions are authenticated full-app
runtime, selected live profile, other routes/dialogs/recovery, full animation
sequence, nonzero safe areas and real iOS devices. Preserve this scoped evidence;
it does not substitute for final review of a materially changed reconciled release.

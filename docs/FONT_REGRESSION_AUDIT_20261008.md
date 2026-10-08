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

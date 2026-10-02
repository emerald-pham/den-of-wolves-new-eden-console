# PC06 typography gate audit: Voyage 33-0 metadata

## Finding

The original report did not preserve a route name or screenshot, so this audit
does not assign it to an unrecorded screen. The confirmed typography regression
in the deployed PC06 surface was the Voyage 33-0 movement panel's eyebrow,
connection state, and location/host labels. Their text used
`--cic-amber-dim` (`#6b3c14`) over the CIC frame's dark, gradient-composited
panel. The actual rendered contrast measured 2.09–2.10:1. The text remained
10.88px, monospaced, uppercase, with the existing `0.08em` tracking and `1.5`
line-height; the defect was color contrast, not size or spacing.

The affected CSS was introduced by `7ad70f6d` on 2026-09-30 and is present in
deployed SHA `baad0b16f1381a6eba835c401aa8796679b1befb` (0.5.62). A local
Playwright render of that exact component source and CIC panel composition
reproduced the contrast failure at narrow phone, short landscape, and desktop
sizes. The deployed-source check and screenshots do not constitute an
authenticated live-session or physical-device observation.

## Why the gate passed

The rendered typography harness was added in `2b9ba1b6` on 2026-09-28 and made
required for Hosting in `4c5503ed` the same day. At [exact-SHA deployment run
36940222730](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/36940222730),
the exact main SHA above completed both `Console font consistency` and
`Computed-style typography gate` successfully, then uploaded the rendered
evidence. Its artifact records 56 comparisons across seven surfaces, four
viewports, and normal/reduced motion. The checked surfaces were entry catalog,
GM join, shared header, DRADIS, Press shuttle, GM console, and mission; Voyage
33-0 was absent.

This was a coverage gap, not a skipped or stale typography run. The browser
harness compares sampled font metrics and geometry against the exact PC01
baseline, but it did not sample Voyage or assert foreground contrast. The
source-level aesthetic test checked console font and broad style contracts,
but did not inspect this new label group. The Voyage component was added after
the gate became mandatory, and its hard-coded surface inventory did not grow
with it, so the dim color could pass both checks. The release artifact showed
zero issues for every sample it actually included.

## Correction and added coverage

Test commit `12df055c` adds Voyage metadata to the existing typography browser
release harness and a source-level color assertion. Before the CSS repair, the
new check rendered the actual panel and its surrounding `.cic-frame` at
320×844, 390×844, 844×390, and 1440×900 in both motion modes. It sampled
Chromium screenshot pixels beside each label to measure the panel's actual
gradient-composited background. All 56 historical comparisons still passed;
the new cases produced 64 expected failures across four labels and eight
renders, with contrast at 2.09–2.10:1.

The separate repair commit changes only the metadata group's foreground token
to the established `--cic-amber`. It preserves the 10.88px size and all existing
caption typography. The same rendered checks now pass at 7.37–7.39:1, with no
horizontal overflow. The browser test asserts the established full-amber token
and a targeted 4.5:1 minimum for these essential labels. No new release process
was added; this coverage extends the existing typography harness.

## Validation and retained evidence

- `npm run test:font-consistency -- --reporter=verbose`: 62/62 tests pass after
  repair. The test-first failure (61 passed, one new color assertion failed)
  is retained at `/Users/emeraldpham/Documents/PC06-active/evidence/typography/red-test-first-unit.log`.
- `npm run test:typography:browser`: 56 exact-PC01 comparisons and eight
  Voyage metadata renders pass; both normal and reduced motion are covered.
  The red pre-repair run and its measurements are retained at
  `/Users/emeraldpham/Documents/PC06-active/evidence/typography/red-test-first-browser/`.
- After-render screenshots and measurements are retained at
  `/Users/emeraldpham/Documents/PC06-active/evidence/typography/voyage-candidate-after/`.
  The before-render set is at
  `/Users/emeraldpham/Documents/PC06-active/evidence/typography/voyage-0.5.62-before/`.
  Representative normal-motion pairs:
  [narrow before](/Users/emeraldpham/Documents/PC06-active/evidence/typography/voyage-0.5.62-before/normal-phone-small.png),
  [narrow after](/Users/emeraldpham/Documents/PC06-active/evidence/typography/voyage-candidate-after/voyage33/normal/phone-narrow/voyage-movement.png),
  [landscape before](/Users/emeraldpham/Documents/PC06-active/evidence/typography/voyage-0.5.62-before/normal-short-landscape.png),
  [landscape after](/Users/emeraldpham/Documents/PC06-active/evidence/typography/voyage-candidate-after/voyage33/normal/short-landscape/voyage-movement.png),
  [desktop before](/Users/emeraldpham/Documents/PC06-active/evidence/typography/voyage-0.5.62-before/normal-desktop.png), and
  [desktop after](/Users/emeraldpham/Documents/PC06-active/evidence/typography/voyage-candidate-after/voyage33/normal/desktop/voyage-movement.png).
- `npm run test:typography:release-gate` and `npm run lint` both pass.

The screenshots are local renders of the exact React panel, product CSS, and
frame composition. They establish a reproducible rendered defect and repair;
they are not evidence of authenticated production gameplay, a deployed 0.5.63
candidate, or physical-device rendering. The focused source change is handed
to the PC06 owner for checkpoint integration and release verification.

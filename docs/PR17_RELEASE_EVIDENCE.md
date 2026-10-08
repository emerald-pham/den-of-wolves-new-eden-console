# PR17 console guidance and responsive controls

The reconciled release combines the closed-by-default Maintenance Operations
reference, removal of retired ICN console-lock controls, and responsive GM
Console/expanded DRADIS controls. Immediate action guidance remains visible.
The reference retains its original text, accessible name, native activation,
Escape focus return, identity reset and live-content behavior.

Baseline: released main `9bfe4c3ae338f21eb564323c0d26822a28b628ec`, 0.5.71.
Reviewed product source: `c80b519a7c7661864c49a3810537f1f4e38203a2`.
The final release adds only version 0.5.72, its separate changelog entry and
this receipt after that source candidate. No Functions, Firestore rules,
production data or unfinished PC10 work is included.

## Focused verification and independent review

- Operations disclosure: observed consumer RED before implementation;
  focused component tests pass 83/83.
- Retired ICN controls: observed focused RED before removal; retained
  compatibility service/wire fields and server permissions are unchanged.
- Responsive controls: observed rendered word/overflow failures before repair.
  Both initial disclosure specificity and local-overflow failures were repaired
  test-first. The final whole-word guard uses browser Range geometry. Its RED
  was an assertion replay of transparently transcribed, independently inspected
  prior pixels, rather than a new browser run while another owner held runtime.
- Combined source risk review, final scoped correlation review and final
  independent typography review are clear. Exact source reviews and runtime
  evidence are retained by the release owner.

Authenticated proof is bound to
`52af1e3a12c56f5096c3ea0114a1b2f666ba5121`: three normally admitted independent
Auth actors, legal 12-slot setup with ten empty seats, and 12 earned claims.
Actual GM Console-mode observer, scoped grant/revoke, retained authenticated
legacy-lock mutation, original Engineer begin/storage committed receipts,
original-member reload and role re-entry, and foreign-vessel disabled gameplay
passed. Later changes affect only disclosure CSS and rendered tests; authority
and authenticated observer code are byte-unchanged. This is neither a
21-account rehearsal nor a capacity or whole-game claim.

Fresh exact c80 presentation proof passed ten production-built actual-component
consumer cases: GM/player at 320x844, 390x844, 844x390, 390x844 with 150% root text,
and 1440x900. All 25 PNGs received independent review. Each label word occupies
one line; normal/enlarged control sizes are 14/21px, targets meet 44px, controls
fit their immediate panel and document, and native keyboard/focus checks pass.
Computed fonts and actual CDP-painted Courier were inspected alongside pixels,
including reference body, headings and expanded scrollable DRADIS controls.

## Preserved failures and limits

The first authenticated run stopped after an endpoint-only response observer
consumed an earlier disable reply. The original failure remains retained.
The canonical capture now pairs a request emitted by the current choice with
its response, exact payload, and wire request ID where published. Grant/revoke
have no wire ID and preserve their existing instance/claim envelope. Denials
and original actor/session checks remain enforced; backend authorization was
not changed. Both retained RED regressions and 28 focused native checks pass.

Presentation fixtures are synthetic state and are not authenticated gameplay
or full-app runtime. The separate authenticated proof supplies authority credit.
Actual iOS/Safari/Dynamic Type, physical devices, nonzero safe areas, global font
uniformity, unrelated routes and live production gameplay are outside this
bounded proof. Live deployment verification must separately establish served
assets and read-only visible behavior.

All owned browsers, emulator/preview processes, fresh accounts and session/root
records were cleaned. Authenticated scope returned to zero and its ports were
clear; the final rendered owner returned runtime at 11:36:47 UTC on October 8,
before the 11:39 deadline. No review launched an additional browser owner.

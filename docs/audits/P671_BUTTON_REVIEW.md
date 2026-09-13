# Fleet and application button review

Scope: Prompt 671, including Prompt 668's Write Mode Off presentation. This review covers the 142 native button declarations in production TSX at the 0.3.95 baseline. Repeated fleet and role instances use the same reviewed component declarations. Handlers, authority, privacy persistence, and pending conditions are unchanged.

## Shared conventions

Operational actions use `cic-action-button`; deliberate destructive confirmations use its existing `--confirm` variant. Navigation and dismissal links may retain `cic-text-button`. Pressed operational toggles now share the existing cyan selected treatment through `aria-pressed`. Instrument controls keep their established geometry and their existing scoped focus, disabled, and touch-target rules.

## Findings and disposition

| Surface | Review result |
| --- | --- |
| Ship resource/census privacy | Both controls now use shared action buttons. Existing independent local visibility toggles and pressed semantics remain. |
| Observer and fleet-number write modes | Shared action button in both states; existing labels, pressed state, and handlers remain. This covers Prompt 668 without changing its policy. |
| GM casting and census actions | Reuse shared actions. Removed redundant visual rules; census-save controls inherit the shared 44px minimum instead of 2rem. |
| GM registration and availability | Shared action class with retained layout and availability state treatment. No authority or inclusion-policy changes. |
| Settings access, changelog, and disconnect | Shared action or existing confirmation variant, retaining layout and conditional states. |
| Landing and role selection | Deliberate large entry/role-card controls retain their existing scoped presentation and focus/disabled behavior. Ordinary role actions already use shared variants. |
| Resource counters, coordinate digits, role tabs, chart choices | Retain their scoped instrument layouts and explicit accessible names/state. These are not free-standing generic action buttons. |
| Timer, confetti, and alert covers | Retain their instrument interaction and safety-cover semantics. The separate P655 release repairs the Press warning and mobile size. |
| Non-GM DRADIS | ShipPlot controls, rendering, and behavior are unchanged. |
| Errors, population/unrest notices, return controls | Existing dismissal/navigation variants retained. |

## Evidence

Existing ShipConsole, ShipConsoleNavigation, GmConsole, and AppHeader interaction suites pass: 216 tests. These cover privacy independence, write-mode toggling, disabled actions, settings, and navigation. Read-only seeded real ShipConsole/GmConsole markup with production-order CSS was rendered at 320x844, 1440x900, and 844x390 under normal and reduced motion. Privacy and Write Mode Off controls have visible keyboard focus, truthful unpressed state, no horizontal overflow, and at least 44px height. Screenshots were visually inspected. These are rendered-layout checks, separate from the interaction suites and deployment verification; fixture assets are not a live-network proof.

Release reconciliation, remaining representative settings/census rendered checks, and final validation are still required before closing the catalog rows.

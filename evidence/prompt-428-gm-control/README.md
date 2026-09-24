# Prompt 428 GM control rendered evidence

A temporary local Chrome fixture rendered the production GM console route and components with an authorized GM session, current attack snapshot, and empty verified sabotage-alert subscription. Callable and listener boundaries were stubbed for the visual run; this proves local rendering and control interaction, not a Firebase round trip or deployed behavior. The temporary fixture harness was removed after capture.

| viewport | normal motion | reduced motion | control height | horizontal overflow | result |
| --- | --- | --- | --- | --- | --- |
| 320×844 | phone-320-full.png | phone-320-reduce.png | 50.40625 px | none | control stays in viewport |
| 390×844 | phone-390-full.png | phone-390-reduce.png | 50.40625 px | none | control stays in viewport |
| 844×390 | short-landscape-full.png | short-landscape-reduce.png | 50.40625 px | none | verified-empty alert panel does not cover control |
| 1440×900 | desktop-full.png | desktop-reduce.png | 50.40625 px | none | control stays in viewport |

All eight captures reported `document.documentElement.scrollWidth === viewport width`; reduced-motion captures used `prefers-reduced-motion: reduce`. Keyboard focus and Enter activation submitted the displayed turn and revision and rendered the success status in the local fixture. The route regression also exercises Enter activation. Pending alerts remain visible, and unknown/loading/error listener states retain the panel; only a verified ready empty queue hides it.

Captured 2026-09-24. Focused `WolfHackingRuntime` component test: 3/3 passed. Focused GM console route suite: 124/124 passed. See catalog evidence E-428-COMBAT-MATH and its referenced source commit for the broader validation record.

# Prompt 603a rendered evidence

Run `npm run test:geometry:603a` from the repository root to launch the local
Vite app and an isolated headless Chrome profile. The script uses the Chrome
DevTools Protocol to capture real `getBoundingClientRect()` values and writes
the reproducible result to `evidence/prompt-603a/geometry.json`. It also
writes inspected PNG captures for Role Select and Ship Role Select at
320×844, 390×844, 844×390, and 1440×900, plus settings, keyboard-focus, and
reduced-motion variants at 390×844. The 44px target assertion applies to the
touch-sized viewports; the desktop pointer-sized settings icon is listed
explicitly in the JSON.

The JSON distinguishes the shared session-ticket/header checks from the
ship-role DRADIS check and records the exact header/content, ticket/content,
and plot/content gaps. `src/styles/consoleScroll.test.ts` remains a static
cascade contract; it is not presented as DOM geometry evidence.

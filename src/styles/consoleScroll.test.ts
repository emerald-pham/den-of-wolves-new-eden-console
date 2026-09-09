import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');
it('reserves the measured header row above compact DRADIS', () => {
  expect(css).toContain('--console-plot-top: calc(max(0.75rem, env(safe-area-inset-top)) + var(--app-header-height, 4.25rem) + 0.75rem)');
  expect(css).not.toMatch(/\.ship-plot\[data-aboard='true'\]\[data-expanded='false'\]\s*\{\s*top: max/);
});

it('keeps narrow-phone DRADIS on the measured top used to clear the console', () => {
  const narrowPhone = css.slice(
    css.indexOf('@media (max-width: 32rem)'),
    css.indexOf("[data-motion='reduce']"),
  );

  expect(narrowPhone).toMatch(
    /\.ship-plot\[data-aboard='true'\]\[data-expanded='false'\]\s*\{[^}]*top: var\(--console-plot-top\)/s,
  );
  expect(narrowPhone).not.toMatch(
    /\.ship-plot\[data-aboard='true'\]\[data-expanded='false'\]\s*\{[^}]*top: calc\([^}]*5\.25rem/s,
  );
});

it('does not reserve a standalone combat-range key in expanded DRADIS', () => {
  expect(css).not.toContain('dradis-range-bands');
  expect(css).not.toContain('range-bands');
});

it('lets app-wide session chrome scroll away without freezing ship names', () => {
  const header = css.match(/\.app-header\s*\{([^}]*)\}/)?.[1] ?? '';

  expect(header).toContain('position: absolute');
  expect(header).not.toContain('position: fixed');
  expect(css).not.toMatch(/\.ship-console \.ship-console__name\s*\{[^}]*position: sticky/s);
});

it('wraps long vessel names in the shared base instead of widening phone consoles', () => {
  const name = css.match(/^\.ship-console__name\s*\{([^}]*)\}/m)?.[1] ?? '';
  expect(name).toContain('overflow-wrap: anywhere');
});

it('reserves measured session chrome for role routes in short landscape', () => {
  expect(css).toMatch(
    /@media\s*\(max-width:\s*42rem\),\s*\(max-height:\s*42rem\)[\s\S]*?\.role-select,\s*\.session-mode\s*\{[^}]*padding-top:\s*max\(\s*clamp\(6rem,\s*14vh,\s*9rem\),\s*calc\(max\(0\.75rem,\s*env\(safe-area-inset-top\)\)\s*\+\s*var\(--app-header-height,\s*4\.25rem\)\s*\+\s*1rem\)\s*\)/s,
  );
});

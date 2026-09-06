import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');
it('reserves the measured header row above compact DRADIS', () => {
  expect(css).toContain('--console-plot-top: calc(max(0.75rem, env(safe-area-inset-top)) + var(--app-header-height, 4.25rem) + 0.75rem)');
  expect(css).not.toMatch(/\.ship-plot\[data-aboard='true'\]\[data-expanded='false'\]\s*\{\s*top: max/);
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

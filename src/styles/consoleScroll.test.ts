import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');
it('reserves the measured header row above compact DRADIS', () => {
  expect(css).toContain('--console-plot-top: calc(max(0.75rem, env(safe-area-inset-top)) + var(--app-header-height, 4.25rem) + 0.75rem)');
  expect(css).not.toMatch(/\.ship-plot\[data-aboard='true'\]\[data-expanded='false'\]\s*\{\s*top: max/);
});
it('lets ship and shuttle workspaces displace chrome and freeze their console rows', () => {
  expect(css).toContain('[data-console-chrome="true"] .app-header');
  expect(css).toMatch(/\.ship-console \.ship-console__name\s*\{[^}]*position: sticky/s);
});

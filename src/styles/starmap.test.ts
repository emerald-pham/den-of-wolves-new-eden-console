import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps the printed jump network legible as amber structure', () => {
  const css = readFileSync('src/styles/starmap.css', 'utf8');
  expect(css).toMatch(/\.starmap__link\s*\{[^}]*stroke: var\(--cic-amber\);[^}]*opacity: 0\.48;/);
  expect(css).toMatch(/\.starmap__node-coordinate\s*\{[^}]*font:\s*0\.6875rem/);
  expect(css).toMatch(/\.starmap__projection-note\s*\{[^}]*font:\s*0\.68rem/);
  expect(css).toMatch(/\.starmap__scene\s*\{[^}]*height:\s*75%/);
  expect(css).not.toContain('font-size: 0.56rem');
});

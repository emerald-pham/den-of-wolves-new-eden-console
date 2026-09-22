import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPONENT = readFileSync(join(HERE, 'ShuttleControl.tsx'), 'utf8');
const STYLES = readFileSync(join(HERE, 'ShuttleControl.css'), 'utf8');

describe('shuttle travel touch-target contract', () => {
  it('keeps every actionable shuttle control on the scoped target class', () => {
    const controlLines = COMPONENT.split('\n').filter((line) =>
      /^\s*<(?:button|select|input)\b/.test(line) && !line.includes('type="checkbox"'));

    expect(controlLines.length).toBeGreaterThan(10);
    expect(controlLines.every((line) => line.includes('shuttle-control__touch-target'))).toBe(true);
  });

  it('defines a 44px keyboard and touch surface without a hover dependency', () => {
    expect(STYLES).toMatch(
      /\.shuttle-control__touch-target\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;[^}]*touch-action:\s*manipulation;/s,
    );
    expect(STYLES).toMatch(
      /\.shuttle-control__check-target\s*\{[^}]*min-height:\s*44px;/s,
    );
    expect(STYLES).not.toContain(':hover');
    expect(STYLES).toContain(':focus-visible');
    expect(STYLES).toContain(':focus-within');
  });
});

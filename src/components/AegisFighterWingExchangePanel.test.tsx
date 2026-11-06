import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import AegisFighterWingExchangePanel from './AegisFighterWingExchangePanel';

const css = readFileSync(join(process.cwd(), 'src/components/AegisFighterWingExchangePanel.css'), 'utf8');

function declaredRem(selector: string): number[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  return [...block.matchAll(/font(?:-size)?:\s*(?:\d+\s+)?([\d.]+)rem/g)].map((match) => Number(match[1]));
}

it('keeps exchange labels at or above the 0.75rem amber-label floor and reuses the shared eyebrow', () => {
  const labelSizes = declaredRem('.aegis-wing-exchange__form label');
  expect(labelSizes.length).toBeGreaterThan(0);
  expect(Math.min(...labelSizes)).toBeGreaterThanOrEqual(0.75);
  expect(css).not.toMatch(/\.aegis-wing-exchange__header p\s*\{/);

  render(<AegisFighterWingExchangePanel
    counts={{ 'fighter-wing-alpha': { count: 2, revision: 1 }, 'fighter-wing-bravo': { count: 2, revision: 1 } }}
    capacity={4} blockerFor={() => null} onExchange={async () => null} />);
  const panel = screen.getByRole('region', { name: 'Fighter Wing exchange' });
  expect(within(panel).getByText('Team Phase // Wing Commander')).toHaveClass('console-workspace__eyebrow');
});

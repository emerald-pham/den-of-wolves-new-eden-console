import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS_PATH = join(process.cwd(), 'src/components/AegisFighterWingExchangePanel.css');
const CSS = readFileSync(CSS_PATH, 'utf8');

function declarationsFor(selector: string): Record<string, string> {
  const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const matchingRules = rules.filter(([, header]) =>
    (header ?? '').split(',').some((part) => part.trim() === selector),
  );
  // The final matching rule accounts for later component-state overrides.
  const rule = matchingRules[matchingRules.length - 1];
  if (!rule) throw new Error('Missing CSS rule for ' + selector);

  return Object.fromEntries(
    [...(rule[2] ?? '').matchAll(/([\w-]+)\s*:\s*([^;]+)\s*;/g)]
      .map(([, property, value]) => [property, (value ?? '').trim()]),
  );
}

describe('Aegis Fighter Wing exchange palette', () => {
  it('uses the issued CIC roles for live values, controls, guidance and errors', () => {
    expect(declarationsFor('.aegis-wing-exchange__cycle').color).toBe('var(--cic-cyan)');
    expect(declarationsFor('.aegis-wing-exchange__strength').color).toBe('var(--cic-cyan)');
    expect(declarationsFor('.aegis-wing-exchange__form label').color).toBe('var(--cic-amber)');

    const choice = declarationsFor('.aegis-wing-exchange__form select');
    expect(choice.color).toBe('var(--cic-cyan)');
    expect(choice.border).toBe('1px solid var(--cic-amber-dim)');
    expect(choice.background).toBe('var(--cic-panel)');

    expect(declarationsFor('.aegis-wing-exchange__notice').color).toBe('var(--cic-ink)');
    expect(declarationsFor('.aegis-wing-exchange__error').color).toBe('var(--cic-danger)');
  });
});

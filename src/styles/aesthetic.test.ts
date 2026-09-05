/**
 * Mechanical guard for the rules in docs/AESTHETICS.md that a stylesheet can
 * be checked against. Prose alone has never stopped a stray rounded corner or
 * an off-palette colour from landing, so the three rules that are checkable
 * without rendering anything are checked here.
 *
 * This guard is a ratchet, not a cleanup: it does not judge the interface that
 * exists, it stops the set of deviations from growing.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Vitest runs from the repo root, and jsdom's `import.meta.url` is not a file URL. */
const SRC = join(process.cwd(), 'src');

/**
 * The ground is hand-mixed: the doc asks for "near-black with a cold cast",
 * and the several backdrops, vignettes and scrims that make up the room are
 * each mixed by eye rather than pulled from a token. Anything this dark is
 * ground and passes; everything lighter has to carry a documented role, which
 * in practice means it has to be a token.
 */
const GROUND_CEILING = 0x20;

/**
 * Deviations that predate this guard, each one a finding rather than a
 * blessing. An entry leaves this list when the deviation is fixed. Nothing
 * joins it without a matching note in docs/AESTHETICS.md saying which role the
 * new value carries and why no existing token could carry it.
 */
const GRANDFATHERED = new Set([
  // The connection lamp's third state. Green has no role in the palette; the
  // lamp needs three distinguishable states and nothing else on screen is
  // green, so it has run untokenised since the indicator was written.
  'src/index.css #5fbf7a',
  // The settings dialog's depth shadow, which the doc's "no drop shadows used
  // as depth" rule would otherwise refuse. The dialog is the only thing in the
  // interface that floats over the rest of it.
  'src/index.css box-shadow: 0 1.5rem 4rem #000000a0',
]);

function stylesheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

/** Repo-relative, so a failure message names the file the way a person would. */
function label(path: string): string {
  return `src${path.slice(SRC.length)}`;
}

const SHEETS = stylesheets(SRC).map((path) => ({
  name: label(path),
  css: readFileSync(path, 'utf8'),
}));

/** Every `--cic-*` / `--plot-*` colour, reduced to its six-digit RGB. */
const PALETTE = new Set(
  [...SHEETS.map((sheet) => sheet.css).join('\n').matchAll(
    /--(?:cic|plot)-[\w-]+:\s*(#[0-9a-fA-F]{3,8})/g,
  )].map((match) => rgb(match[1] ?? '')),
);

/** Six-digit RGB, alpha and shorthand normalised away. */
function rgb(hex: string): string {
  const digits = hex.slice(1);
  if (digits.length <= 4) {
    return [...digits.slice(0, 3)].map((digit) => digit + digit).join('');
  }
  return digits.slice(0, 6).toLowerCase();
}

function isGround(hex: string): boolean {
  const value = rgb(hex);
  return [0, 2, 4].every(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) < GROUND_CEILING,
  );
}

describe('the CIC palette', () => {
  it('spends only tokens, or the near-black of the ground', () => {
    const strays = SHEETS.flatMap(({ name, css }) =>
      [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
        .map((match) => match[0])
        .filter((hex) => !PALETTE.has(rgb(hex)) && !isGround(hex))
        .map((hex) => `${name} ${hex}`),
    );

    expect([...new Set(strays)].filter((stray) => !GRANDFATHERED.has(stray))).toEqual([]);
  });
});

describe('the CIC frame', () => {
  it('is never rounded', () => {
    const rounded = SHEETS.flatMap(({ name, css }) =>
      [...css.matchAll(/border-radius:\s*([^;}]+)/g)]
        .map((match) => (match[1] ?? '').trim())
        .filter((value) => !['var(--cic-radius)', '50%', '0'].includes(value))
        .map((value) => `${name} border-radius: ${value}`),
    );

    expect(rounded).toEqual([]);
  });

  /**
   * A shadow with an offset is a light source and a surface floating above
   * another one. A shadow with no offset is a glow, which is a screen being
   * bright — that one is the whole point of the interface.
   */
  it('casts glows, never drop shadows', () => {
    const cast = SHEETS.flatMap(({ name, css }) =>
      [...css.matchAll(/box-shadow:\s*([^;}]+)/g)]
        .map((match) => (match[1] ?? '').trim())
        .filter((value) => {
          const offsets = value.replace(/^inset\s+/, '').match(/^(-?[\d.]+)\S*\s+(-?[\d.]+)/);
          return offsets !== null
            && (Number(offsets[1]) !== 0 || Number(offsets[2]) !== 0);
        })
        .map((value) => `${name} box-shadow: ${value}`),
    );

    expect(cast.filter((shadow) => !GRANDFATHERED.has(shadow))).toEqual([]);
  });
});

describe('the in-session header', () => {
  it('centres the session label and code on a shared two-column grid', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const badge = index.match(/\.session-badge\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(badge).toContain('display: grid');
    expect(badge).toContain('grid-template-columns: auto auto');
    expect(badge).toContain('align-items: center');
  });
});

describe('the GM console', () => {
  it('uses the full viewport instead of the centered session-mode width cap', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const console = index.match(/\.gm-console\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(console).toContain('width: 100%');
    expect(console).toContain('max-width: none');
    expect(console).toContain('margin: 0');
  });

  it('organizes growing GM instruments into three wide-screen columns', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const grid = index.match(/\.gm-console__grid\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(grid).toContain('display: grid');
    expect(grid).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
  });

  it('collapses the GM instrument grid for tablet and phone widths', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const tablet = index.match(/@media \(max-width: 60rem\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const phone = index.match(/@media \(max-width: 42rem\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(tablet).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(phone).toContain('grid-template-columns: 1fr');
  });
});

describe('friendly DRADIS returns', () => {
  it('inherits each faction color from the positioned contact', () => {
    const plot = SHEETS.find(({ name }) => name === 'src/styles/plot.css')?.css ?? '';
    const contact = plot.match(/\.contact-plot__contact\s*\{([^}]*)\}/)?.[1] ?? '';
    const jitter = plot.match(/\.contact-plot__jitter\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(contact).toContain('--contact-ink: var(--plot-hot)');
    expect(jitter).not.toContain('--contact-ink:');
  });

  it('scales the compact plot against its container instead of a zero-size contact', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const shipPlot = index.match(/\.ship-plot\[data-aboard='true'\]\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(shipPlot).toContain('container-type: inline-size');
  });

  it('acquires contacts on their first sweep and only then applies stepped display drift', () => {
    const plot = SHEETS.find(({ name }) => name === 'src/styles/plot.css')?.css ?? '';
    const apparent = plot.match(/\.contact-plot__apparent\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(apparent).toContain('opacity: 0');
    expect(apparent).toContain('plot-acquire');
    expect(apparent).toContain('plot-drift');
    expect(apparent).toContain('steps(1, end)');
    expect(apparent).toContain('calc(var(--phase) * var(--plot-turn) / 2)');
    expect(apparent).toContain(
      'calc((var(--phase) - var(--drift-slot)) * var(--plot-turn) / 2)',
    );
  });

  it('keeps far-side returns in a foreground layer above the scan planes', () => {
    const plot = SHEETS.find(({ name }) => name === 'src/styles/plot.css')?.css ?? '';
    const returns = plot.match(/\.contact-plot__returns\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(returns).toContain('z-index: 3');
    expect(returns).toContain('isolation: isolate');
  });

  it('keeps consecutive apparent fixes within a tiny subpixel step', () => {
    const plot = SHEETS.find(({ name }) => name === 'src/styles/plot.css')?.css ?? '';
    const drift = plot.match(/@keyframes plot-drift\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const fixes = [...drift.matchAll(
      /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/g,
    )].map((match): [number, number, number] => [
      Number(match[1]), Number(match[2]), Number(match[3]),
    ]);

    expect(fixes.length).toBeGreaterThan(4);
    for (let index = 1; index < fixes.length; index += 1) {
      const previous = fixes[index - 1];
      const current = fixes[index];
      if (!previous || !current) continue;
      expect(Math.hypot(
        current[0] - previous[0],
        current[1] - previous[1],
        current[2] - previous[2],
      )).toBeLessThanOrEqual(0.35);
    }
  });
});

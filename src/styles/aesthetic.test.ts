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

  it('organizes growing GM instruments on a roomy console grid', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const grid = index.match(/\.gm-console__grid\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(grid).toContain('display: grid');
    expect(grid).toContain('grid-template-columns: repeat(12, minmax(0, 1fr))');
  });

  it('collapses the GM instrument grid for tablet and phone widths', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const tablet = index.match(/@media \(max-width: 60rem\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const phone = index.match(/@media \(max-width: 42rem\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(tablet).toContain('.gm-console__module { grid-column: span 6; }');
    expect(phone).toContain('.gm-console__module { grid-column: 1 / -1; }');
  });
});

describe('the shuttlecraft console template', () => {
  it('uses the ship console viewport and stacks real instruments on phones', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const phone = index.match(/@media \(max-width: 42rem\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(index).toContain('.shuttle-console--snn');
    expect(phone).toContain('.shuttle-console .ship-console__identity');
    expect(phone).toContain('position: relative');
  });
});

describe('ship console instrument layout', () => {
  it('fades routed content while shared movement stays visible above DRADIS', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const root = index.match(/\.screen-fade\s*\{([^}]*)\}/)?.[1] ?? '';
    const content = index.match(/\.screen-fade__content\s*\{([^}]*)\}/)?.[1] ?? '';
    const crossing = index.match(
      /\.screen-fade\[data-crossing='true'\]\s*\{([^}]*)\}/,
    )?.[1] ?? '';
    const plot = index.match(
      /\.ship-plot\[data-aboard='true'\]\s*\{([^}]*)\}/,
    )?.[1] ?? '';
    const header = index.match(/\.app-header\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(root).not.toContain('transition: opacity');
    expect(root).toContain('z-index: 1');
    expect(content).toContain('transition: opacity 100ms ease');
    expect(content).toContain('z-index: 19');
    expect(crossing).toContain('z-index: 5');
    expect(plot).toContain('z-index: 4');
    expect(header).toContain('z-index: 10');
  });

  it('never blanks routed content under the in-app reduced-motion override', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const reducedMotion = index.match(
      /\[data-motion='reduce'\] \.screen-fade__content,\s*\[data-motion='reduce'\] \.screen-fade\[data-phase='out'\] \.screen-fade__content\s*\{([^}]*)\}/,
    )?.[1] ?? '';

    expect(reducedMotion).toContain('opacity: 1 !important');
  });

  it('keeps ship information above the stationary destination flag', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const console = index.match(/\.ship-console\s*\{([^}]*)\}/)?.[1] ?? '';
    const identity = index.match(/\.ship-console__identity\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(console).not.toContain('z-index:');
    expect(identity).toContain('z-index: 21');
  });

  it('eases DRADIS in and out between field, widget and expanded sizes', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const plot = index.match(/\.ship-plot\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(plot).toContain('container-type: size');
    expect(plot).toContain('transition:');
    expect(plot).toContain('var(--ship-plot-resize) ease-in-out');
  });

  it('places the shuttlebay in a dedicated rail below compact DRADIS', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const rail = index.match(/\.ship-console__instruments\s*\{([^}]*)\}/)?.[1] ?? '';
    const bay = index.match(/\.ship-shuttlebay\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(rail).toContain('display: flex');
    expect(rail).toContain('--ship-plot-widget-size');
    expect(bay).toContain('overflow: auto');
    expect(bay).toContain('min-height: 0');
  });

  it('reserves the shipboard instrument rail beside the command-role picker', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const picker = index.match(/\.ship-role-select\s*\{([^}]*)\}/)?.[1] ?? '';
    const panel = index.match(
      /\.ship-role-select\s+\.session-mode__panel\s*\{([^}]*)\}/,
    )?.[1] ?? '';

    expect(picker).toContain('max-width: none');
    expect(picker).toContain('--ship-plot-widget-size');
    expect(panel).toContain('grid-template-columns:');
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
    const shipPlot = index.match(/\.ship-plot\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(shipPlot).toContain('container-type: size');
  });

  it('acquires contacts on their first sweep and only then applies stepped display drift', () => {
    const plot = SHEETS.find(({ name }) => name === 'src/styles/plot.css')?.css ?? '';
    const apparent = plot.match(/\.contact-plot__apparent\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(apparent).toContain('opacity: 0');
    expect(apparent).not.toContain('animation');
    expect(plot).toContain(".contact-plot__apparent[data-acquired='true']");
    expect(plot).not.toContain('plot-boost');
  });

  it('keeps far-side returns in a foreground layer above the scan planes', () => {
    const plot = SHEETS.find(({ name }) => name === 'src/styles/plot.css')?.css ?? '';
    const returns = plot.match(/\.contact-plot__returns\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(returns).toContain('z-index: 3');
    expect(returns).toContain('isolation: isolate');
  });

  it('lets blips nearly decay between sweeps while acquired ship names remain solid', () => {
    const plot = SHEETS.find(({ name }) => name === 'src/styles/plot.css')?.css ?? '';
    const blip = plot.match(/\.contact-plot__blip\s*\{([^}]*)\}/)?.[1] ?? '';
    const tag = plot.match(/\.contact-plot__tag\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(blip).toContain('opacity: 0.03');
    expect(blip).not.toContain('animation');
    expect(tag).toContain('opacity: 1');
  });

  it('leaves altitude fade timing to the same sweep crossing as its blip', () => {
    const plot = SHEETS.find(({ name }) => name === 'src/styles/plot.css')?.css ?? '';
    const drop = plot.match(/\.contact-plot__drop\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(drop).toContain('opacity: 0.03');
    expect(drop).not.toContain('animation');
  });

  it('gives apparent returns a two-degree bearing drift without changing formation coordinates', () => {
    const plot = SHEETS.find(({ name }) => name === 'src/styles/plot.css')?.css ?? '';
    expect(plot).toContain('var(--fix-x, 0)');
    expect(plot).toContain('var(--fix-z, 0)');
    expect(plot).not.toContain('@keyframes plot-drift');
  });

  it('delays departure jitter while the latest scan return is still bright', () => {
    const plot = SHEETS.find(({ name }) => name === 'src/styles/plot.css')?.css ?? '';
    expect(plot).toContain("[data-departing='true'][data-scan-fresh='true']");
    expect(plot).toMatch(
      /\[data-scan-fresh='true'\][^{]*\{[^}]*animation:\s*none/,
    );
  });
});

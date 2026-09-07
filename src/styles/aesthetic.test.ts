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

describe('the fleet transmission', () => {
  it('uses bone-white type for the survivor loss readout', () => {
    const intrusion = SHEETS.find(({ name }) => name === 'src/styles/intrusion.css')?.css ?? '';
    const population = intrusion.match(/\.turn-start-announcement__population\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(population).toContain('color: var(--cic-ink)');
  });

  it('keeps turn transitions inside the shared CIC instrument grammar', () => {
    const component = readFileSync('src/components/TurnStartAnnouncement.tsx', 'utf8');
    const intrusion = SHEETS.find(({ name }) => name === 'src/styles/intrusion.css')?.css ?? '';

    expect(component).toContain('className="turn-start-announcement__console cic-frame"');
    expect(component).toContain('className="turn-start-announcement__ticks cic-ticks"');
    expect(intrusion).toContain('box-shadow:');
    expect(intrusion).toContain('@keyframes turn-start-scan');
    expect(intrusion).toMatch(
      /@media \(max-width: 34rem\)\s*\{[^]*?\.turn-start-announcement__readouts\s*\{[^}]*grid-template-columns: 1fr/,
    );
    expect(intrusion).toMatch(
      /\.turn-start-announcement__console::after\s*\{[^}]*animation: turn-start-scan/,
    );
    expect(intrusion).toMatch(
      /\.turn-start-announcement__console::after\s*\{[^}]*animation: turn-start-scan[^]*?\[data-motion='reduce'\][^]*?\.turn-start-announcement__console::after\s*\{[^}]*animation: none/,
    );
  });
});

describe('the in-session header', () => {
  it('uses the same session readout composition in header and settings', () => {
    const header = readFileSync('src/components/AppHeader.tsx', 'utf8');

    expect(header.match(/<SessionReadouts/g)).toHaveLength(2);
  });

  it('centres the session label and code on a shared two-column grid', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const badge = index.match(/\.session-badge\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(badge).toContain('display: grid');
    expect(badge).toContain('grid-template-columns: auto auto');
    expect(badge).toContain('align-items: center');
  });
});

describe('the launcher manifest', () => {
  it('presents the motion control with the same button typography as the other launcher actions', () => {
    const landing = readFileSync('src/routes/Landing.tsx', 'utf8');
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const motionControl = index.match(/\.landing__motion-control\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(landing).toContain('className="landing__button landing__motion-control"');
    expect(motionControl).not.toMatch(/\bfont(?:-family|-size)?\s*:/);
    expect(motionControl).not.toContain('letter-spacing:');
    expect(motionControl).not.toContain('text-transform:');
  });

  it('reserves enough inline room for every current session-code digit', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const code = index.match(/\.landing__code\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(code).toContain('width: 9rem');
    expect(code).toContain('letter-spacing: 0.4rem');
  });

  it('uses shared value and label rows so every readout aligns', () => {
    const arrival = SHEETS.find(({ name }) => name === 'src/routes/arrival.css')?.css ?? '';
    const grid = arrival.match(/\.arrival-manifest__grid\s*\{([^}]*)\}/)?.[1] ?? '';
    const readout = arrival.match(/\.arrival-readout\s*\{([^}]*)\}/)?.[1] ?? '';
    const value = arrival.match(/\.arrival-readout__value\s*\{([^}]*)\}/)?.[1] ?? '';
    const label = arrival.match(/\.arrival-readout__label\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(grid).toContain('grid-template-rows: minmax(0, 1fr) auto');
    expect(readout).toContain('display: grid');
    expect(readout).toContain('grid-row: span 2');
    expect(readout).toContain('grid-template-rows: subgrid');
    expect(value).toContain('align-self: center');
    expect(value).not.toContain('min-height:');
    expect(arrival).toContain('.arrival-readout + .arrival-readout { border-left: 1px solid var(--cic-rule); }');
    expect(value).toContain('grid-row: 1');
    expect(label).toContain('grid-row: 2');
  });

  it('keeps the population estimate closer in scale to the other arrival values', () => {
    const arrival = SHEETS.find(({ name }) => name === 'src/routes/arrival.css')?.css ?? '';
    const population = arrival.match(/\.arrival-readout--population \.arrival-readout__value\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(population).toContain('font-size: clamp(3.5rem, 7vw, 5rem)');
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

  it('places GM modules in one column inside the role workspace', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const grid = index.match(/\.gm-console__grid\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(grid).toContain('display: grid');
    expect(grid).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('keeps nested GM headings compact and perspective buttons wide enough to wrap', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const heading = index.match(/\.gm-console \.gm-console__section-title\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(heading).toContain('font: 0.875rem/1.4 var(--cic-mono)');
    expect(index).toMatch(/@container \(max-width: 20rem\)\s*\{\s*\.gm-fleet-resource-ship li\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(index).toContain('grid-template-columns: repeat(auto-fit, minmax(min(100%, 7rem), 1fr))');
  });

  it('puts the GM instrument rail in document flow on phones and short screens', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    expect(index).toMatch(/@media \(max-width: 42rem\), \(max-height: 42rem\)\s*\{[^]*?\.gm-console__instruments\s*\{[^}]*position: static/);
  });

  it('keeps staged roster confirmation and Union labels readable on a narrow screen', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const roleLabel = index.match(/\.gm-wolf-role > span\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(roleLabel).toContain('min-width: 0');
    expect(roleLabel).toContain('overflow-wrap: anywhere');
    expect(index).toContain('.gm-union-role__station { display: block; padding-top: 0.1rem; }');
    expect(index).toMatch(/@media \(max-width: 720px\)\s*\{[^]*?\.gm-roster-draft \{ grid-template-columns: 1fr; \}/);
  });

  it('keeps the finale layer decorative, and honors the in-app reduced-motion setting', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const layer = index.match(/\.debrief-mode\s*\{([^}]*)\}/)?.[1] ?? '';
    const toast = index.match(/\.debrief-mode__toast\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(layer).toContain('pointer-events: none');
    expect(layer).toContain('z-index: 26');
    expect(toast).toContain('color: var(--cic-cyan-hot)');
    expect(index).toMatch(/\[data-motion='reduce'\][^}]*\.debrief-mode__ball[^}]*animation: none/);
    expect(index).toMatch(/\[data-motion='reduce'\][^}]*\.debrief-mode__confetti-piece[^}]*animation: none/);
  });

  it('moves the finale ball into the unused corner on compact viewports', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';

    expect(index).toMatch(
      /@media \(max-width: 720px\), \(max-height: 480px\)\s*\{[^]*?\.debrief-mode__ball\s*\{[^}]*left: max\(2rem, calc\(env\(safe-area-inset-left\) \+ 2rem\)\);[^}]*width: clamp\(3.5rem, 14vmin, 4rem\);/,
    );
  });

  it('keeps finale lighting bounded to compositor-friendly transforms', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const scene = index.match(/\.debrief-mode\s*\{([^}]*)\}/)?.[1] ?? '';
    const ball = index.match(/\.debrief-mode__ball\s*\{([^}]*)\}/)?.[1] ?? '';
    const orb = index.match(/\.debrief-mode__orb\s*\{([^}]*)\}/)?.[1] ?? '';
    const lightfield = index.match(/\.debrief-mode__lightfield\s*\{([^}]*)\}/)?.[1] ?? '';
    const beamKeyframes = index.match(/@keyframes debrief-beam-fan\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(scene).toContain('perspective:');
    expect(scene).toContain('--debrief-ball-rest-y');
    expect(scene).toContain('--debrief-source-y: calc(var(--debrief-ball-rest-y) + clamp(3.25rem, 6.5vmin, 4rem))');
    expect(ball).toContain('width: clamp(6.5rem, 13vmin, 8rem)');
    expect(index).toContain('translateY(var(--debrief-ball-rest-y))');
    expect(orb).toContain('transform-style: preserve-3d');
    expect(lightfield).toContain('contain: paint');
    expect(lightfield).toContain('pointer-events: none');
    expect(beamKeyframes).toContain('transform:');
    expect(beamKeyframes).toContain('opacity:');
    expect(beamKeyframes).not.toMatch(/filter:|background:|box-shadow:/);
    expect(index).toContain('.debrief-mode__confetti-piece:nth-child(n + 49)');
    expect(index).toContain('.debrief-mode__beam:nth-child(n + 5)');
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

  it('anchors compact ship DRADIS below the measured header on phones', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';

    expect(index).toContain(`@media (max-width: 42rem) {
  .ship-plot[data-aboard='true'][data-expanded='false'] {
    top: var(--console-plot-top);
    transition-property: width, height, border-color, background-color, box-shadow;
  }`);
  });

  it('formats compact phone galactic coordinates as a short stacked readout', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';

    const label = index.match(
      /\.ship-plot\[data-expanded='false'\] \.ship-plot__galactic-coordinate-label\s*\{([^}]*)\}/,
    )?.[1] ?? '';
    const value = index.match(
      /\.ship-plot\[data-expanded='false'\] \.ship-plot__galactic-coordinate-value\s*\{([^}]*)\}/,
    )?.[1] ?? '';

    expect(label).toContain('display: block');
    expect(value).toContain('display: block');
    expect(value).toContain('font-variant-numeric: tabular-nums');
    expect(value).toContain('max-width: 100%');
    expect(value).toContain('overflow: hidden');
    expect(value).toContain('white-space: nowrap');
    expect(index).toContain('@keyframes ship-plot-coordinate-ticker');
    expect(index).toContain('animation: ship-plot-coordinate-ticker');
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

  it('gives census conditions more width and scrolls only overflowing labels', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const counters = index.match(/\.ship-console__counters\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(counters).toContain('grid-template-columns: minmax(0, 1.65fr) minmax(15rem, 1fr)');
    expect(index).toContain(".overflow-ticker[data-overflow='true'] .overflow-ticker__track");
    expect(index).toContain('@keyframes overflow-ticker-scroll');
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

  it('moves only spatial truth continuously and holds the visible return between sweeps', () => {
    const plot = SHEETS.find(({ name }) => name === 'src/styles/plot.css')?.css ?? '';
    const transit = plot.match(
      /\.contact-plot__contact\[data-moving='true'\][^{]*\.contact-plot__actual\s*\{([^}]*)\}/,
    )?.[1] ?? '';
    const apparent = plot.match(/\.contact-plot__apparent\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(transit).toContain('animation: ambient-contact-transit');
    expect(apparent).not.toContain('animation: ambient-contact-transit');
    expect(apparent).toContain('var(--fix-x, var(--x))');
    expect(apparent).toContain('var(--fix-y, var(--y))');
    expect(apparent).toContain('var(--fix-z, var(--z))');
    expect(plot).toContain('@keyframes ambient-contact-transit');
    expect(plot).toMatch(
      /\.contact-plot\[data-still='true'\][^{]*\.contact-plot__actual[^{]*\{[^}]*animation:\s*none/,
    );
    expect(plot).toMatch(
      /data-ambient='true'[^{}]*:not\(\[data-acquired='true'\]\)[^{}]*\{[^}]*opacity:\s*0/,
    );
  });

  it('scales the compact plot against its container instead of a zero-size contact', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';
    const shipPlot = index.match(/\.ship-plot\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(shipPlot).toContain('container-type: size');
  });

  it('keeps GM effect controls beside the compass on narrow expanded plots', () => {
    const index = SHEETS.find(({ name }) => name === 'src/index.css')?.css ?? '';

    expect(index).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.ship-plot > \.dradis-effect-controls\s*\{[^}]*left:\s*calc\([^}]*10\.25rem[^}]*right:/,
    );
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

  it('keeps stationary apparent drift separate from formation coordinates', () => {
    const plot = SHEETS.find(({ name }) => name === 'src/styles/plot.css')?.css ?? '';
    expect(plot).toContain('var(--fix-x, var(--x))');
    expect(plot).toContain('var(--fix-z, var(--z))');
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


it('keeps system labels amber regardless of row order and makes reference copy readable', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8');
  expect(css).not.toContain('.aegis-system dl div:last-child dt');
  expect(css).not.toContain(".aegis-system[data-damaged='true'] .aegis-system__condition dt");
  expect(css).not.toContain('.aegis-system .jump-failure-readout dt { color: var(--cic-danger); }');
  expect(css).toMatch(/\.aegis-system > p\s*\{[^}]*color: var\(--cic-ink\);[^}]*font-size: 0\.875rem;/);
});

it.each([false, true])('preserves semantic system colors with damage=%s and varying row order', (damaged) => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8');
  const style = document.createElement('style');
  // Isolate the real system rules from unrelated responsive and decorative CSS.
  style.textContent = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match => match[1]?.includes('.aegis-system'))
    .map(match => match[0]).join('\n');
  document.head.append(style);
  const article = document.createElement('article');
  article.className = 'aegis-system';
  article.dataset.damaged = String(damaged);
  article.innerHTML = '<p>System reference</p><dl><div class="aegis-system__condition"><dt>Condition</dt><dd>State</dd></div><div class="aegis-system__damaged-rule"><dt>If Damaged</dt><dd>Rule</dd></div></dl>';
  document.body.append(article);
  try {
    const condition = article.querySelector('dl > div')!;
    for (const last of [false, true]) {
      if (last) article.querySelector('dl')!.append(condition);
      for (const label of article.querySelectorAll('dt')) {
        expect(getComputedStyle(label).color).toBe(
          label.textContent === 'If Damaged' ? 'var(--cic-danger)' : 'var(--cic-amber)',
        );
        expect(getComputedStyle(label).fontSize).toBe('0.75rem');
      }
      for (const value of article.querySelectorAll('dd')) {
        expect(getComputedStyle(value).fontSize).toBe('0.875rem');
      }
      expect(getComputedStyle(condition.querySelector('dd')!).color)
        .toBe(damaged ? 'var(--cic-danger)' : 'var(--cic-cyan-hot)');
      expect(getComputedStyle(article.querySelector('p')!).fontSize).toBe('0.875rem');
    }
  } finally {
    article.remove();
    style.remove();
  }
});

it('keeps maintenance choices touch-sized and disabled controls visibly muted', () => {
  const css = readFileSync('src/index.css', 'utf8');
  expect(css).toContain('.maintenance-controls');
  expect(css).toMatch(/\.maintenance-systems button:disabled[^}]+color: var\(--cic-muted\)/s);
});

it('gives CIC actions the same square ruled control treatment as the console', () => {
  const css = readFileSync('src/styles/cic.css', 'utf8');
  const action = css.match(/\.cic-action-button\s*\{([^}]*)\}/)?.[1] ?? '';

  expect(action).toContain('min-height: 44px');
  expect(action).toContain('border: 1px solid var(--cic-amber-dim)');
  expect(action).toContain('border-radius: var(--cic-radius)');
  expect(action).toContain('background: transparent');
  expect(action).toContain('color: var(--cic-cyan)');
  expect(action).toContain('font: 0.72rem/1.2 var(--cic-mono)');
  expect(action).toContain('text-transform: uppercase');
});

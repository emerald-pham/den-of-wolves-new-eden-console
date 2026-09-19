import { readFileSync } from 'node:fs';

const DOCUMENTATION_PATTERN = /(?:^|\/)(?:README(?:\..*)?|.*\.md)$/i;
const CATALOG_PATTERN = /^docs\/implementation-prompts\.json$/i;
const ROADMAP_PATTERN = /^(?:docs\/implementation-prompts\.json|docs\/IMPLEMENTATION_[^/]*\.md)$/i;
const TEST_PATTERN = /(?:^|\/)(?:__tests__|tests)(?:\/|$)|(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/i;
const WEB_PATTERN = /^(?:src\/|public\/|index\.html$|package(?:-lock)?\.json$|tsconfig[^/]*\.json$|vite\.config\.[^/]+$)/i;
const FUNCTIONS_PATTERN = /^functions\//i;
const FIRESTORE_PATTERN = /^(?:firestore\.rules|firestore\.indexes\.json)$/i;
const ROOT_TOOLING_PATTERN = /^(?:scripts\/|config\/|\.github\/|\.githooks\/|eslint\.config\.|vitest\.config\.)/i;

// The ticker is shared application chrome. Route composition, session
// projection, global styling, dependencies, and the ticker harness can all
// make it disappear or break its source handoff.
const TICKER_PATTERN = /^(?:src\/(?:App|main)\.[^/]+|src\/index\.css|src\/(?:components|routes|store|services|lib)\/|src\/styles\/|public\/|index\.html$|package(?:-lock)?\.json$|scripts\/test-fleet-ticker-browser\.mjs$)/i;

// Font consistency can regress through CSS, rendered UI markup, font assets,
// application entry points, or dependency changes.
const FONT_PATTERN = /^(?:src\/(?:App|main)\.[^/]+|src\/index\.css|src\/(?:components|routes|styles)\/|public\/|index\.html$|package(?:-lock)?\.json$)/i;

// The sustained-render benchmark is intentionally narrower than general UI:
// run it for the tactical canvases/styles and for its own harness or budgets.
const RENDER_PATTERN = /^(?:src\/(?:components|routes)\/[^/]*(?:Dradis|DRADIS|Starmap|StarMap|ContactPlot)[^/]*|src\/styles\/starmap\.css$|src\/index\.css$|scripts\/prompt-637-render-performance\.mjs$|config\/render-performance[^/]*\.json$)/i;

function normalize(files) {
  return [...new Set(files.map((file) => String(file ?? '').trim()
    .replaceAll('\\', '/').replace(/^\.\//, '')).filter(Boolean))].sort();
}

export function classifyRiskGates(files, { manual = false } = {}) {
  const changedFiles = normalize(files);
  if (manual || changedFiles.includes('__unknown_diff__')) {
    return {
      documentationOnly: false,
      roadmapChanged: true,
      rootInstall: true,
      functionsInstall: true,
      lint: true,
      unit: true,
      functions: true,
      firestore: true,
      webBuild: true,
      ticker: true,
      font: true,
      render: true,
      bundle: true,
    };
  }

  const nonDocumentation = changedFiles.filter((file) =>
    !DOCUMENTATION_PATTERN.test(file) && !CATALOG_PATTERN.test(file));
  const productionFiles = nonDocumentation.filter((file) => !TEST_PATTERN.test(file));
  const web = productionFiles.some((file) => WEB_PATTERN.test(file));
  const functions = productionFiles.some((file) => FUNCTIONS_PATTERN.test(file));
  const firestore = productionFiles.some((file) => FIRESTORE_PATTERN.test(file));
  const tooling = nonDocumentation.some((file) => ROOT_TOOLING_PATTERN.test(file));
  const unknown = nonDocumentation.some((file) =>
    !WEB_PATTERN.test(file) && !FUNCTIONS_PATTERN.test(file) &&
    !FIRESTORE_PATTERN.test(file) && !ROOT_TOOLING_PATTERN.test(file) &&
    file !== 'firebase.json' && file !== '.firebaserc');
  const firebaseConfig = nonDocumentation.some((file) => file === 'firebase.json' || file === '.firebaserc');
  const failClosed = unknown || firebaseConfig;
  const ticker = productionFiles.some((file) => TICKER_PATTERN.test(file)) || failClosed;
  const font = productionFiles.some((file) => FONT_PATTERN.test(file)) || failClosed;
  const render = productionFiles.some((file) => RENDER_PATTERN.test(file)) || failClosed;

  return {
    documentationOnly: nonDocumentation.length === 0,
    roadmapChanged: changedFiles.some((file) => ROADMAP_PATTERN.test(file)),
    rootInstall: nonDocumentation.length > 0,
    functionsInstall: functions || failClosed,
    lint: nonDocumentation.length > 0,
    unit: web || tooling || nonDocumentation.some((file) => TEST_PATTERN.test(file)) || failClosed,
    functions: functions || failClosed,
    firestore: firestore || failClosed,
    webBuild: web || render || failClosed,
    ticker,
    font,
    render,
    bundle: web || failClosed,
  };
}

export function formatRiskGateOutputs(profile) {
  return Object.entries(profile)
    .map(([name, value]) => `${name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}=${value}`)
    .join('\n');
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (process.argv[1]?.endsWith('/risk-gates.mjs')) {
  const file = option(process.argv.slice(2), '--files-file');
  if (!file) throw new Error('Usage: risk-gates.mjs --files-file <path> [--manual true|false]');
  const files = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  process.stdout.write(`${formatRiskGateOutputs(classifyRiskGates(files, {
    manual: option(process.argv.slice(2), '--manual') === 'true',
  }))}\n`);
}

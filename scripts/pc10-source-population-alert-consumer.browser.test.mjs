import assert from 'node:assert/strict';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build, stop } from 'esbuild';
import { chromium } from 'playwright';
import { withProofBrowserCleanup } from './proof-tooling-browser-lifecycle.mjs';
import {
  POPULATION_ALERT_DIALOG_NAME,
  matchVisiblePopulationAlerts,
} from './pc10-source-population-alert-consumer.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Optional absolute path to an already-installed Chromium when Playwright's pinned build is absent.
const browserOverride = process.env.PROOF_BROWSER_EXECUTABLE?.trim();
const originalGmInstanceId = 'gm-instance-original';
const populationAlerts = {
  icebreaker: { shipId: 'icebreaker', shipName: 'Icebreaker', population: 28000,
    targetGmInstanceIds: [originalGmInstanceId], createdAt: 1 },
  pallas: { shipId: 'pallas', shipName: 'Pallas', population: 31000,
    targetGmInstanceIds: ['gm-instance-foreign'], createdAt: 2 },
};

async function componentScript() {
  const result = await build({
    stdin: {
      resolveDir: root,
      loader: 'tsx',
      contents: `
        import { createRoot } from 'react-dom/client';
        import PopulationAlert from './src/components/PopulationAlert';
        createRoot(document.querySelector('#root')).render(<PopulationAlert />);
      `,
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    alias: { '@': resolve(root, 'src') },
    plugins: [{
      name: 'population-alert-inert-ports',
      setup(builder) {
        builder.onResolve({ filter: /^@\/(store\/useSessionStore|lib\/sessionService)$/ }, args => ({
          path: args.path,
          namespace: 'proof-port',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'proof-port' }, args => ({
          loader: 'js',
          contents: args.path.endsWith('useSessionStore')
            ? 'export const useSessionStore=select=>select(window.__proofState);'
            : 'export async function dismissPopulationAlert(shipId){window.__proofCalls.push(shipId);}',
        }));
      },
    }],
  });
  return result.outputFiles[0].text;
}

/** The application stylesheet exactly as main.tsx loads it, with font files left inert. */
async function applicationStylesheet() {
  const result = await build({
    entryPoints: [resolve(root, 'src/index.css')],
    bundle: true,
    write: false,
    loader: { '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty', '.otf': 'empty', '.svg': 'empty', '.png': 'empty' },
    external: ['http:*', 'https:*', 'data:*'],
  });
  return result.outputFiles[0].text;
}

test('the real PopulationAlert, styled as shipped, binds to exactly the original GM source row', async () => {
  await withProofBrowserCleanup(async resources => {
    const [script, stylesheet] = await Promise.all([componentScript(), applicationStylesheet()]);
    if (browserOverride) assert.ok(isAbsolute(browserOverride), 'PROOF_BROWSER_EXECUTABLE must be an absolute path.');
    resources.browserServer = await chromium.launchServer({
      headless: true, ...(browserOverride ? { executablePath: browserOverride } : {}),
    });
    resources.browser = await chromium.connect(resources.browserServer.wsEndpoint());
    resources.context = await resources.browser.newContext({ locale: 'en-US' });
    await resources.context.route('**/*', route => route.abort());
    const page = await resources.context.newPage();
    page.setDefaultTimeout(5000);
    await page.setContent('<div id="root"></div>');
    await page.evaluate(alerts => {
      window.__proofState = {
        session: { phase: 'active', unrestAlerts: {}, populationAlerts: alerts },
        gmInstance: { id: 'gm-instance-original' },
      };
      window.__proofCalls = [];
    }, populationAlerts);
    await page.addScriptTag({ content: script });

    const alert = page.getByRole('alertdialog', { name: POPULATION_ALERT_DIALOG_NAME, exact: true });
    await alert.waitFor();
    const consume = async () => matchVisiblePopulationAlerts({
      renderedText: await alert.innerText(), populationAlerts, gmInstanceId: originalGmInstanceId,
    }).map(([shipId]) => shipId);

    // Control: without the shipped stylesheet the rendered text keeps its source case.
    assert.deepEqual(await consume(), ['icebreaker']);

    await page.addStyleTag({ content: stylesheet });
    const rendered = (await alert.innerText()).replace(/\s+/g, ' ');
    assert.match(rendered, /ICEBREAKER SURVIVOR POPULATION HAS REACHED 28,000\./,
      'The shipped .unrest-alert styling renders the alert sentence in uppercase.');
    assert.deepEqual(await consume(), ['icebreaker'],
      'The visible, styled population alert must match exactly one current source alert targeted to this GM.');

    await alert.getByRole('button', { name: 'Dismiss population alert', exact: true }).click();
    await page.waitForFunction(() => window.__proofCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__proofCalls), ['icebreaker']);
  }, { stopBuild: stop });
});

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, stop } from 'esbuild';
import { chromium } from 'playwright';
import test from 'node:test';
import { withProofBrowserCleanup } from './proof-tooling-browser-lifecycle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function ownedBrowserPids(rootPid) {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n')
    .map(line => line.trim().split(/\s+/).map(Number));
  const owned = new Set([rootPid]);
  let changed;
  do {
    changed = false;
    for (const [pid, parentPid] of rows) {
      if (owned.has(parentPid) && !owned.has(pid)) { owned.add(pid); changed = true; }
    }
  } while (changed);
  return [...owned];
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}

async function componentScript() {
  const result = await build({
    stdin: {
      resolveDir: root,
      loader: 'tsx',
      contents: `
        import { createRoot } from 'react-dom/client';
        import FleetAlertControl from './src/components/FleetAlertControl';
        createRoot(document.querySelector('#root')).render(<FleetAlertControl />);
      `,
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    alias: { '@': resolve(root, 'src') },
    plugins: [{
      name: 'proof-smoke-access-ports',
      setup(builder) {
        builder.onResolve({ filter: /^@\/(store\/useSessionStore|lib\/(consoleAccess|fleetAlertService|commandErrors))$/ }, args => ({
          path: args.path,
          namespace: 'proof-port',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'proof-port' }, args => ({
          loader: 'js',
          contents: args.path.endsWith('useSessionStore')
            ? 'export const useSessionStore=select=>select(window.__proofState);'
            : args.path.endsWith('consoleAccess')
              ? 'export const useConsoleAccess=()=>window.__proofAccess;'
              : args.path.endsWith('commandErrors')
                ? 'export const normalizeCommandError=error=>({message:error.message});'
                : 'export async function setFleetRedAlert(active,text){window.__proofCalls.push({active,...(text===undefined?{}:{text})});}',
        }));
      },
    }],
  });
  return result.outputFiles[0].text;
}

test('the real Fleetwide Red Alert control completes one inert command in Playwright Chromium', async () => {
  const browserPids = new Set();
  await withProofBrowserCleanup(async resources => {
    const script = await componentScript();
    resources.browserServer = await chromium.launchServer({ headless: true });
    for (const pid of ownedBrowserPids(resources.browserServer.process().pid)) browserPids.add(pid);
    resources.browser = await chromium.connect(resources.browserServer.wsEndpoint());
    resources.context = await resources.browser.newContext();
    await resources.context.route('**/*', route => route.abort());
    const page = await resources.context.newPage();
    page.setDefaultTimeout(5000);
    await page.setContent('<div id="root"></div>');
    await page.evaluate(() => {
      window.__proofState = {
        session: { phase: 'active', fleetRedAlert: { active: false } },
        me: { role: 'player', activeConsoleRoleId: 'admiral' },
        connection: 'live',
      };
      window.__proofAccess = { roleId: 'admiral', writable: true };
      window.__proofCalls = [];
    });
    await page.addScriptTag({ content: script });

    const section = page.getByRole('region', { name: 'FLEETWIDE RED ALERT', exact: true });
    await section.waitFor();
    const textbox = section.getByRole('textbox', { name: 'ALERT MESSAGE', exact: true });
    assert.equal(await textbox.count(), 1);
    assert.equal(await textbox.isVisible(), true);
    await textbox.fill('ordinary source alert');
    assert.equal(await textbox.inputValue(), 'ORDINARY SOURCE ALERT');
    await page.getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER', exact: true }).click();
    const raiseButton = page.getByRole('button', { name: 'RAISE FLEETWIDE RED ALERT', exact: true });
    assert.equal(await raiseButton.isEnabled(), true);
    await raiseButton.click();
    await page.waitForFunction(() => window.__proofCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__proofCalls), [
      { active: true, text: 'ORDINARY SOURCE ALERT' },
    ]);
    for (const pid of ownedBrowserPids(resources.browserServer.process().pid)) browserPids.add(pid);
  }, {
    stopBuild: stop,
    afterCleanup: async resources => {
      if (resources.browserServer) {
        for (const pid of ownedBrowserPids(resources.browserServer.process().pid)) browserPids.add(pid);
      }
    let remaining = [...browserPids].filter(isAlive);
    for (let attempt = 0; remaining.length && attempt < 20; attempt += 1) {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 50));
      remaining = remaining.filter(isAlive);
    }
    assert.deepEqual(remaining, [], 'every captured Playwright Chromium process must exit during cleanup');
    },
  });
});

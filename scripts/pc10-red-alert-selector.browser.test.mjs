import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { build, stop } from 'esbuild';
import { chromium } from 'playwright';
import ts from 'typescript';
import { blockedSourceBranch } from './pc10-political-crisis-arrest-proof-contracts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(new URL('./pc10-politics-press-proof.mjs', import.meta.url), 'utf8');
const file = ts.createSourceFile('politics.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functions = ['required', 'missingChoice', 'demandButton', 'runFleetAlert'].map(name => {
  const matches = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(matches.length, 1); return matches[0].getText(file);
}).join('\n');

// Standalone source-rendered DOM, without an application build, server, Auth or
// Firebase. Only service/store/access ports are inert; React and Playwright
// render/interact with the unchanged actual FleetAlertControl component.
async function fixtureScript() {
  const result = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import FleetAlertControl from './src/components/FleetAlertControl';
    createRoot(document.querySelector('#root')).render(<FleetAlertControl />);
  ` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    alias: { '@': resolve(root, 'src') }, plugins: [{ name: 'standalone-alert-ports', setup(builder) {
      builder.onResolve({ filter: /^@\/(store\/useSessionStore|lib\/(consoleAccess|fleetAlertService|commandErrors))$/ }, args =>
        ({ path: args.path, namespace: 'alert-port' }));
      builder.onLoad({ filter: /.*/, namespace: 'alert-port' }, args => ({ loader: 'js', contents:
        args.path.endsWith('useSessionStore') ? 'export const useSessionStore=select=>select(window.__alertState);' :
          args.path.endsWith('consoleAccess') ? 'export const useConsoleAccess=()=>window.__alertAccess;' :
            args.path.endsWith('commandErrors') ? 'export const normalizeCommandError=error=>({message:error.message});' :
              'export async function setFleetRedAlert(active,text){window.__alertCalls.push({active,...(text===undefined?{}:{text})});}' }));
    } }] });
  return result.outputFiles[0].text;
}

function ownedChromePids(rootPid) {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n')
    .map(line => line.trim().split(/\s+/).map(Number));
  const owned = new Set([rootPid]);
  let changed;
  do { changed = false; for (const [pid, ppid] of rows) if (owned.has(ppid) && !owned.has(pid)) { owned.add(pid); changed = true; } } while (changed);
  return [...owned];
}

const actor = { actorKind: 'player', sessionId: 'standalone-source-session', uidHash: 'standalone-original-admiral-hash',
  roleId: 'admiral', assignedRoleId: 'admiral', cycle: 1, phase: 'active', turnStatePhase: 'team' };
async function consume(page, choice = 'raise', options = { redAlertMessage: 'ORDINARY SOURCE ALERT' }) {
  let mutations = 0;
  const runFleetAlert = runInNewContext(`(() => { ${functions}; return runFleetAlert; })()`, {
    assert, blockedSourceBranch,
    enterSelectedRole: async (_context, roleId) => { assert.equal(roleId, 'admiral'); return { actor }; },
    observedMutation: async input => {
      assert.equal(input.endpoint, 'setFleetRedAlert'); assert.equal(input.expectedActor, actor);
      mutations++; await input.executeUi(); return { accepted: false, status: 'standalone-dom-only' };
    },
  });
  const result = await runFleetAlert({ crew: { page } }, choice, options);
  return { result, mutations };
}

test('Red Alert serialized consumer uses the actual FleetAlert DOM and real Playwright selectors', async t => {
  const script = await fixtureScript();
  let browserServer, browser;
  const chromePids = new Set();
  try {
    browserServer = await chromium.launchServer({ channel: 'chrome', headless: true });
    browser = await chromium.connect(browserServer.wsEndpoint());
    async function withPage(run, { writable = true, active = false, roleId = 'admiral' } = {}) {
      const context = await browser.newContext();
      try {
        await context.route('**/*', route => route.abort());
        const page = await context.newPage(); page.setDefaultTimeout(750);
        await page.setContent('<div id="root"></div>');
        await page.evaluate(({ writable, active, roleId }) => {
          window.__alertState = { session: { phase: 'active', fleetRedAlert: { active } },
            me: { role: 'player', activeConsoleRoleId: roleId }, connection: 'live' };
          window.__alertAccess = { roleId, writable }; window.__alertCalls = [];
        }, { writable, active, roleId });
        await page.addScriptTag({ content: script });
        if (roleId === 'admiral') await page.getByRole('region', { name: 'FLEETWIDE RED ALERT', exact: true }).waitFor();
        for (const pid of ownedChromePids(browserServer.process().pid)) chromePids.add(pid);
        await run(page);
      } finally { await context.close(); }
    }
    await t.test('implicit label text includes the initial textarea text while the textbox accessible name stays exact', () => withPage(async page => {
      const section = page.getByRole('region', { name: 'FLEETWIDE RED ALERT', exact: true });
      const textbox = section.getByRole('textbox', { name: 'ALERT MESSAGE', exact: true });
      assert.equal(await textbox.isVisible(), true); assert.equal(await textbox.isEnabled(), true);
      assert.match(await textbox.inputValue(), /^RED ALERT \/\/ WOLF ATTACK IMMINENT/);
      assert.equal(await section.getByLabel('ALERT MESSAGE', { exact: true }).count(), 0);
      assert.equal(await textbox.count(), 1);
    }));
    await t.test('the actual raise consumer fills the mounted field after opening its cover', () => withPage(async page => {
      try {
        const { result, mutations } = await consume(page);
        assert.equal(result.accepted, false, 'The inert service is not a gameplay receipt.'); assert.equal(mutations, 1);
        assert.deepEqual(await page.evaluate(() => window.__alertCalls), [{ active: true, text: 'ORDINARY SOURCE ALERT' }]);
      } catch (error) {
        await page.screenshot({ path: '/tmp/pc10-implementation-notes-20261015/redalert-selector-source-failure.png' });
        throw error;
      }
    }));
    await t.test('an already open cover stays open through field selection and trigger', () => withPage(async page => {
      await page.getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER', exact: true }).click();
      assert.equal((await consume(page)).mutations, 1);
      assert.equal((await page.evaluate(() => window.__alertCalls)).length, 1);
    }));
    await t.test('a disabled original cover stays blocked with zero service calls', () => withPage(async page => {
      const { result, mutations } = await consume(page); assert.equal(result.accepted, false); assert.equal(mutations, 0);
      assert.deepEqual(await page.evaluate(() => window.__alertCalls), []);
    }, { writable: false }));
    await t.test('a different role cannot offer the Admiral alert section', () => withPage(async page => {
      const { result, mutations } = await consume(page); assert.equal(result.accepted, false); assert.equal(mutations, 0);
      assert.deepEqual(await page.evaluate(() => window.__alertCalls), []);
    }, { roleId: 'wing-commander' }));
    await t.test('missing explicit text grants no trigger or service call', () => withPage(async page => {
      const { result, mutations } = await consume(page, 'raise', {}); assert.equal(result.accepted, false); assert.equal(mutations, 0);
      assert.deepEqual(await page.evaluate(() => window.__alertCalls), []);
    }));
    await t.test('the ordinary stand-down consumer retains its cover and enabled-trigger path', () => withPage(async page => {
      assert.equal((await consume(page, 'stand-down')).mutations, 1);
      assert.deepEqual(await page.evaluate(() => window.__alertCalls), [{ active: false }]);
    }, { active: true }));
  } finally {
    if (browser) await browser.close();
    if (browserServer) await browserServer.close();
    stop();
    const remaining = [...chromePids].filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
    assert.deepEqual(remaining, [], 'Every captured owned Chrome process must exit during cleanup.');
    console.log(JSON.stringify({ standaloneChromeOwnedPids: [...chromePids], remainingOwnedChromePids: remaining, gameplayAcceptance: false }));
  }
});

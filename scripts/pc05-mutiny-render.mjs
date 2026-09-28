#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(process.env.PC05_MUTINY_EVIDENCE_DIR ?? '/tmp/pc05-mutiny-render');
const VIEWPORTS = [
  { name: 'narrow-phone', width: 320, height: 844 },
  { name: 'short-landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
];

async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  await new Promise((resolvePromise) => server.close(resolvePromise));
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local port.');
  return address.port;
}

async function waitForHttp(url, child, readOutput) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite exited early.\n${readOutput()}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Vite may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${url}.\n${readOutput()}`);
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const port = await freePort();
  const appUrl = `http://127.0.0.1:${port}`;
  let output = '';
  const vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: ROOT,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  vite.stdout.on('data', (chunk) => { output += chunk.toString(); });
  vite.stderr.on('data', (chunk) => { output += chunk.toString(); });
  let browser;
  try {
    await waitForHttp(appUrl, vite, () => output);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const page = await context.newPage();
      page.on('pageerror', (error) => { throw error; });
      await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
      await page.evaluate(async () => {
        document.body.replaceChildren();
        const container = document.createElement('main');
        container.id = 'pc05-mutiny-render';
        document.body.append(container);
        const { mountPc05MutinyFixture } = await import('/scripts/fixtures/pc05-mutiny-render.tsx');
        mountPc05MutinyFixture(container);
      });
      const fixture = page.getByRole('region', { name: 'PC05 mutiny recovery fixture' });
      await fixture.waitFor({ state: 'visible', timeout: 12_000 });
      const measurement = await fixture.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const heading = element.querySelector('h4');
        const controls = [...element.querySelectorAll('select, button')].map((control) => {
          const bounds = control.getBoundingClientRect();
          return { label: control.getAttribute('aria-label') ?? control.textContent, height: bounds.height };
        });
        return {
          copy: element.textContent?.replace(/\s+/g, ' ').trim(),
          fontFamily: heading ? getComputedStyle(heading).fontFamily : '',
          rect: { left: rect.left, right: rect.right },
          scrollWidth: document.documentElement.scrollWidth,
          controls,
        };
      });
      if (!/Base Capybara mutiny.*former captain waiting for a new role/i.test(measurement.copy ?? '') ||
          !/Voyage 33-0 mutiny.*does not create a player identity or grant a player role/i.test(measurement.copy ?? '')) {
        throw new Error(`${viewport.name}: recovery copy is incomplete: ${measurement.copy}`);
      }
      if (!/Oxanium|Share Tech Mono|monospace/i.test(measurement.fontFamily)) {
        throw new Error(`${viewport.name}: recovery panel lost the console font: ${measurement.fontFamily}`);
      }
      if (measurement.scrollWidth > viewport.width + 1 || measurement.rect.left < -1 ||
          measurement.rect.right > viewport.width + 1) {
        throw new Error(`${viewport.name}: recovery panel overflows: ${JSON.stringify(measurement)}`);
      }
      if (measurement.controls.length !== 5 || measurement.controls.some((control) => control.height < 44)) {
        throw new Error(`${viewport.name}: recovery controls miss the 44px target: ${JSON.stringify(measurement.controls)}`);
      }
      await page.screenshot({
        path: resolve(OUTPUT_DIR, `mutiny-recovery-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
      console.log(`PC05 mutiny recovery rendered proof passed: ${viewport.name} ${viewport.width}x${viewport.height}`);
      await context.close();
    }
  } finally {
    await browser?.close();
    vite.kill('SIGTERM');
  }
}

await main();

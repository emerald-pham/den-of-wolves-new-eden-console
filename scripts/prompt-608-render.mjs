#!/usr/bin/env node

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(process.env.PROMPT_608_EVIDENCE_DIR ?? '/tmp/p608-dialog-render-20260923');
const VIEWPORTS = [
  { name: 'narrow-phone', width: 320, height: 740 },
  { name: 'phone', width: 390, height: 844 },
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

async function waitForHttp(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Vite may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function fixtureState(now) {
  const sessionId = 'prompt-608-dialog-review';
  const timestamp = new Date(now).toISOString();
  return {
      session: {
        id: sessionId,
        name: 'Dialog Flow Review',
        joinCode: '6080',
        phase: 'active',
        ownerUid: 'prompt-608-player',
        createdAt: timestamp,
        updatedAt: timestamp,
        currentTurn: 2,
        activeRoleIds: ['admiral'],
        activeVesselIds: ['aegis'],
        capybaraEnabled: true,
        dioneEnabled: true,
        pressEnabled: true,
      },
      me: {
        uid: 'prompt-608-player',
        sessionId,
        displayName: 'Admiral',
        role: 'player',
        seatId: 'admiral',
        assignedRoleId: 'admiral',
        activeConsoleRoleId: 'admiral',
        joinedAt: timestamp,
      },
      roleBrief: {
        assignmentUid: 'prompt-608-player',
        roleId: 'admiral',
        roleName: 'Admiral',
        vesselName: 'AEGIS',
        text: 'Coordinate the fleet.',
        commonRules: 'Keep this brief private.',
        setupRevision: 1,
      },
      arbourVision: {
        sessionId,
        recipientUid: 'prompt-608-player',
        revision: 1,
        kind: 'danger',
        text: 'There is danger at the outer relay.',
        label: 'FACILITATOR CALL',
      },
  };
}

async function measureDialog(page, viewport, purpose, motion) {
  const dialog = page.getByRole('dialog');
  const title = await dialog.getByRole('heading').first().innerText();
  const close = dialog.getByRole('button', { name: 'Continue' });
  await close.scrollIntoViewIfNeeded();
  const measured = await page.evaluate(() => {
    const panel = document.querySelector('.focus-dialog');
    const button = panel?.querySelector('.focus-dialog__close');
    const title = panel?.querySelector('.focus-dialog__header h2');
    if (!(panel instanceof HTMLElement) || !(button instanceof HTMLElement) || !(title instanceof HTMLElement)) {
      throw new Error('The rendered focus dialog is missing its panel, purpose heading, or close control.');
    }
    const panelRect = panel.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const titleStyle = getComputedStyle(title);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
      panel: {
        left: panelRect.left, right: panelRect.right, top: panelRect.top, bottom: panelRect.bottom,
        width: panelRect.width, height: panelRect.height,
        scrollWidth: panel.scrollWidth, clientWidth: panel.clientWidth,
        scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight,
        overflowY: getComputedStyle(panel).overflowY,
      },
      close: { width: buttonRect.width, height: buttonRect.height },
      titleFont: titleStyle.fontFamily,
      bodyFont: getComputedStyle(document.body).fontFamily,
      motion: document.querySelector('[data-motion="reduce"]') ? 'reduce'
        : document.querySelector('[data-motion="full"]') ? 'full' : 'unset',
    };
  });
  if (measured.document.scrollWidth > viewport.width + 1 ||
      measured.panel.left < -1 || measured.panel.right > viewport.width + 1 ||
      measured.panel.top < -1 || measured.panel.bottom > viewport.height + 1 ||
      measured.close.width < 44 || measured.close.height < 44 ||
      measured.panel.scrollWidth > measured.panel.clientWidth + 1 ||
      measured.motion !== (motion === 'reduce' ? 'reduce' : 'full')) {
    throw new Error(`${purpose} ${viewport.name}: dialog bounds or controls failed: ${JSON.stringify(measured)}`);
  }
  if (!/Oxanium|Share Tech Mono|monospace/i.test(measured.titleFont)) {
    throw new Error(`${purpose} ${viewport.name}: dialog purpose heading lost the CIC display font: ${JSON.stringify(measured)}`);
  }
  return { title, ...measured };
}

async function runCase(browser, appUrl, viewport, motion) {
  const mobile = viewport.width <= 480;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference',
    serviceWorkers: 'block',
  });
  const now = Date.now();
  await context.addInitScript(({ timestamp, choice }) => {
    localStorage.setItem('dow-new-eden-session', JSON.stringify({ state: {}, version: 1 }));
    localStorage.setItem('dow-new-eden-session-waiver', String(timestamp));
    localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: timestamp, choice }));
  }, { timestamp: now, choice: motion });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`${viewport.name}/${motion} page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`${viewport.name}/${motion} browser error: ${message.text()}`);
  });
  await page.goto(`${appUrl}/`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-motion]').waitFor({ state: 'visible', timeout: 12_000 });
  await page.evaluate(async (fixture) => {
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    const state = useSessionStore.getState();
    state.setIdentity(fixture.session, fixture.me);
    state.setRoleBrief({
      ...fixture.roleBrief,
    });
    state.setPrivateLoyalty({ kind: 'universal-arbour', suspicion: 10 });
    state.setArbourVision(fixture.arbourVision);
    state.setConnection('live');
    state.setCommunicationError(null);
    useSessionStore.setState({ setCommunicationError: () => undefined });
  }, fixtureState(now));
  await page.getByRole('heading', { name: 'Connect this device', exact: true }).waitFor({ state: 'visible' });
  await page.evaluate(() => { window.location.hash = '#/brief'; });
  await page.getByRole('heading', { name: 'Admiral', exact: true }).waitFor({ state: 'visible' });
  let dialog = page.getByRole('dialog', { name: 'Facilitator call' });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 12_000 });
  } catch (error) {
    console.error(`${viewport.name}/${motion} rendered page before facilitator dialog: ${await page.locator('body').innerText()}`);
    console.error(`${viewport.name}/${motion} modal markup: ${await page.locator('[role="dialog"], [role="alertdialog"]').evaluateAll((elements) => elements.map((element) => element.outerHTML))}`);
    await page.screenshot({ path: resolve(OUTPUT_DIR, `failure-${viewport.name}-${motion}.png`), fullPage: true });
    throw error;
  }
  await dialog.getByText('There is danger at the outer relay.').waitFor({ state: 'visible' });
  const callEvidence = await measureDialog(page, viewport, 'facilitator-call', motion);
  if (await dialog.getAttribute('aria-describedby') === null) throw new Error('Facilitator call lacks a purpose description.');
  await page.screenshot({ path: resolve(OUTPUT_DIR, `${viewport.name}-${motion}-facilitator-call.png`) });
  if (!(await dialog.getByRole('heading', { name: 'Facilitator call', exact: true })
    .evaluate((element) => document.activeElement === element))) {
    throw new Error(`${viewport.name}/${motion}: focus did not start at the facilitator-call purpose heading.`);
  }
  await page.keyboard.press('Escape');
  const callReview = page.getByRole('button', { name: 'Review facilitator call' });
  await callReview.waitFor({ state: 'visible' });
  if (!(await callReview.evaluate((element) => document.activeElement === element))) {
    throw new Error(`${viewport.name}/${motion}: facilitator-call dismissal did not restore its review control.`);
  }

  await page.evaluate(async () => {
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    const state = useSessionStore.getState();
    state.setPrivateLoyalty({ kind: 'wolf-cult', suspicion: 15 });
    state.setWolfCultIntelligence({
      sessionId: state.session?.id ?? '', recipientUid: state.me?.uid ?? '', revision: 2,
      fortressCoordinate: '4454', suppliesCoordinate: '1964', agentUid: 'private-agent',
      codeWord: 'NIGHTFALL', label: 'WOLF INTEL',
    });
  });
  dialog = page.getByRole('dialog', { name: 'Private result' });
  await dialog.waitFor({ state: 'visible', timeout: 8_000 });
  await dialog.getByText('NIGHTFALL').waitFor({ state: 'visible' });
  const privateEvidence = await measureDialog(page, viewport, 'private-result', motion);
  await page.screenshot({ path: resolve(OUTPUT_DIR, `${viewport.name}-${motion}-private-result.png`) });
  await page.keyboard.press('Escape');
  const privateReview = page.getByRole('button', { name: 'Review private result' });
  await privateReview.waitFor({ state: 'visible' });
  if (!(await privateReview.evaluate((element) => document.activeElement === element))) {
    throw new Error(`${viewport.name}/${motion}: private-result dismissal did not restore its review control.`);
  }

  await page.evaluate(async () => {
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    const state = useSessionStore.getState();
    state.setSession({
      ...state.session,
      phase: 'failure',
      gameOutcome: {
        type: 'game-outcome', result: 'failure', cause: 'pursuit-limit', cycle: 4,
        navigationRevision: 12, occurredAt: new Date().toISOString(),
      },
    });
  });
  dialog = page.getByRole('dialog', { name: 'Endgame evaluation' });
  await dialog.waitFor({ state: 'visible', timeout: 8_000 });
  await dialog.getByText(/Pursuit reached 10 in Cycle 4/).waitFor({ state: 'visible' });
  const endgameEvidence = await measureDialog(page, viewport, 'endgame', motion);
  await page.screenshot({ path: resolve(OUTPUT_DIR, `${viewport.name}-${motion}-endgame.png`) });
  await page.keyboard.press('Escape');
  const endgameReview = page.getByRole('button', { name: 'Review endgame evaluation' });
  await endgameReview.waitFor({ state: 'visible' });
  if (!(await endgameReview.evaluate((element) => document.activeElement === element))) {
    throw new Error(`${viewport.name}/${motion}: endgame dismissal did not restore its review control.`);
  }

  await context.close();
  return { viewport: viewport.name, motion, callEvidence, privateEvidence, endgameEvidence };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const port = await freePort();
  const appUrl = `http://127.0.0.1:${port}`;
  const vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: ROOT, env: { ...process.env, BROWSER: 'none' }, stdio: 'ignore',
  });
  let browser;
  const evidence = [];
  try {
    await waitForHttp(appUrl);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const viewport of VIEWPORTS) {
      for (const motion of ['full', 'reduce']) {
        const record = await runCase(browser, appUrl, viewport, motion);
        evidence.push(record);
        console.log(`Prompt 608 dialog rendering passed: ${viewport.name} ${viewport.width}x${viewport.height}, ${motion} motion`);
      }
    }
    writeFileSync(resolve(OUTPUT_DIR, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await browser?.close();
    vite.kill('SIGTERM');
  }
}

await main();

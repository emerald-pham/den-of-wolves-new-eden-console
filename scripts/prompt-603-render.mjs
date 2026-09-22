#!/usr/bin/env node

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(process.env.PROMPT_603_EVIDENCE_DIR ?? '/tmp/prompt-603-render');
const VIEWPORTS = [
  { name: 'narrow-phone', width: 320, height: 740 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'short-landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
];
const MOTION_MODES = ['full', 'reduce'];

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

function persistedState(now) {
  const session = {
    id: 'prompt-603-narrow-console', name: 'Narrow Console Review', joinCode: '6030',
    phase: 'active', ownerUid: 'prompt-603-player', configurationLocked: true,
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
    currentTurn: 3, activeRoleIds: ['admiral'], activeVesselIds: ['aegis'],
    capybaraEnabled: true, dioneEnabled: true, pressEnabled: true, pressClaimed: true,
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: new Date(now + 600_000).toISOString(),
      openAirspaceEndsAt: new Date(now + 1_200_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shipResources: {
      aegis: { ore: 7, fuel: 12, food: 21, water: 18, materials: 4, securityTeams: 8 },
    },
    shipSurvivors: { aegis: 2_500 },
    shipUnrest: { aegis: 3 },
    shipDamage: { aegis: { damagedSystemIds: ['jump-drive'], destroyed: false } },
    shipUpgrades: { aegis: [] },
    shipGalacticCoordinates: { aegis: '0012' },
    maintenanceCycles: {
      aegis: { step: 3, revision: 3, results: { '1': 'Storage intact.', '2': 'Rations set.' }, charges: [], refuelled: [], turn: 3 },
    },
    fleetRedAlert: { active: false, text: 'ALL SHIPS // STAND BY', raisedAt: null },
  };
  const me = {
    uid: 'prompt-603-player', sessionId: session.id, displayName: 'Admiral', role: 'player',
    assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral', seatId: 'admiral',
    joinedAt: new Date(now).toISOString(),
  };
  return JSON.stringify({
    state: { session, me, gmInstance: null, pendingCommands: [], mode: 'console', lastRoute: '/ships/aegis/roles/admiral' },
    version: 1,
  });
}

async function inspect(page, viewport, motion) {
  try {
    await page.getByRole('heading', { name: 'Maintenance cycle', exact: true }).waitFor({ state: 'visible', timeout: 12_000 });
  } catch (error) {
    const body = await page.locator('body').innerText().catch(() => 'Could not read document body.');
    await page.screenshot({ path: resolve(OUTPUT_DIR, `failure-${viewport.name}-${motion}.png`), fullPage: true });
    console.error(`${viewport.name}/${motion} page content before failure: ${body}`);
    throw error;
  }
  await page.evaluate(async () => {
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
    useSessionStore.getState().setCommunicationError(null);
    // This layout-only fixture has no Firebase emulator; keep its expected
    // backend connection errors from covering the rendered console content.
    useSessionStore.setState({ setCommunicationError: () => undefined });
  });
  await page.waitForTimeout(250);

  const targets = await page.evaluate(() => {
    const selectors = {
      primaryStatus: '.primary-status',
      instruments: '.ship-console__instruments',
      maintenanceReference: '.maintenance-reference',
      maintenanceSequence: '.maintenance-systems__cycle > ol',
      resourceStores: '.ship-resources',
      damagedSystem: '.aegis-system[data-damaged="true"]',
      maintenanceAction: '.maintenance-systems__cycle > ol > li[aria-current="step"] > button.cic-action-button',
      fleetAlert: '.confetti-dispenser--fleet-alert',
    };
    const measurements = Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return [name, null];
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return [name, {
        text: (element.innerText ?? element.textContent ?? '').replace(/\s+/g, ' ').trim(),
        bounds: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
        scroll: { width: element.scrollWidth, clientWidth: element.clientWidth, height: element.scrollHeight, clientHeight: element.clientHeight },
        overflow: { x: style.overflowX, y: style.overflowY, text: style.textOverflow },
        fontFamily: style.fontFamily,
      }];
    }));
    const resourceLabels = [...document.querySelectorAll('.ship-resources .resource-label > span')]
      .map((element) => ({
        text: element.textContent?.trim() ?? '',
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        textOverflow: getComputedStyle(element).textOverflow,
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      }));
    const resourceRows = [...document.querySelectorAll('.ship-resources li')].map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        label: element.querySelector('.resource-label > span')?.textContent?.trim() ?? '',
        value: element.querySelector('strong')?.textContent?.trim() ?? '',
        name: element.getAttribute('aria-label') ?? '',
        height: rect.height,
      };
    });
    const criticalText = [
      ...document.querySelectorAll(
        '.primary-status dd, .maintenance-reference dd, .aegis-system[data-damaged="true"] dd, ' +
        '.ship-resources .resource-label > span, .ship-resources li strong, ' +
        '.maintenance-systems__cycle > button, .confetti-dispenser--fleet-alert button',
      ),
    ].filter((element) => element instanceof HTMLElement).map((element) => ({
      text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      textOverflow: getComputedStyle(element).textOverflow,
      overflowY: getComputedStyle(element).overflowY,
    }));
    const action = document.querySelector('.confetti-dispenser--fleet-alert .confetti-dispenser__cover');
    const actionRect = action?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
      header: (() => {
        const element = document.querySelector('.app-header');
        const rect = element?.getBoundingClientRect();
        return rect ? {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          position: getComputedStyle(element).position,
        } : null;
      })(),
      motion: document.querySelector('[data-motion="reduce"]') ? 'reduce'
        : document.querySelector('[data-motion="full"]') ? 'full' : 'unset',
      targets: measurements,
      resourceLabels,
      resourceRows,
      criticalText,
      alertCover: actionRect ? { width: actionRect.width, height: actionRect.height } : null,
      bodyFont: getComputedStyle(document.body).fontFamily,
    };
  });

  if (!targets.targets.primaryStatus || !targets.targets.maintenanceReference ||
      !targets.targets.maintenanceSequence || !targets.targets.resourceStores ||
      !targets.targets.damagedSystem || !targets.targets.maintenanceAction || !targets.targets.fleetAlert) {
    throw new Error(`${viewport.name}/${motion}: one or more critical console landmarks are missing: ${JSON.stringify(targets.targets)}`);
  }
  const statusText = targets.targets.primaryStatus.text.toUpperCase();
  const sequenceText = targets.targets.maintenanceReference.text.toUpperCase();
  const damageText = targets.targets.damagedSystem.text.toUpperCase();
  const storesText = targets.targets.resourceStores.text.toUpperCase();
  const expectedStores = ['STRYTIUM ORE 7', 'STRYTIUM FUEL 12', 'FOOD 21', 'WATER 18', 'MATERIALS 4', 'SECURITY TEAMS 8'];
  if (!statusText.includes('CYCLE 3') || !statusText.includes('ACTIVE // TEAM PHASE') ||
      !sequenceText.includes('1 STORAGE // 2 RATIONS // 3 UNREST CHECK // 4 RIOT CHECK // 5 REACTOR // 6 SHUTTLE BAY ZETA // 7 SHUTTLE BAY OMEGA') ||
      !damageText.includes('CONDITION DAMAGED') || !expectedStores.every((value) => storesText.includes(value)) ||
      !targets.targets.maintenanceAction.text.toUpperCase().includes('RUN UNREST CHECK')) {
    throw new Error(`${viewport.name}/${motion}: critical ship console content is incomplete: ${JSON.stringify({ statusText, sequenceText, damageText, storesText, maintenanceAction: targets.targets.maintenanceAction.text })}`);
  }
  if (targets.document.scrollWidth > viewport.width + 1) {
    throw new Error(`${viewport.name}/${motion}: page has horizontal overflow: ${JSON.stringify(targets.document)}`);
  }
  if (targets.motion !== motion) {
    throw new Error(`${viewport.name}/${motion}: app motion mode did not match the browser fixture: ${targets.motion}`);
  }
  const responsiveViewport = viewport.width <= 672 || viewport.height <= 672;
  if (responsiveViewport && targets.resourceLabels.some((label) => label.fontSize < 11)) {
    throw new Error(`${viewport.name}/${motion}: resource store labels are too small to read: ${JSON.stringify(targets.resourceLabels)}`);
  }
  if (responsiveViewport && targets.resourceRows.some((row) => row.height < 44)) {
    throw new Error(`${viewport.name}/${motion}: resource store rows are too short for their readable labels: ${JSON.stringify(targets.resourceRows)}`);
  }
  if (!targets.resourceRows.every((row) => row.name === `${row.label}: ${row.value}`)) {
    throw new Error(`${viewport.name}/${motion}: resource names or values do not match their accessible labels: ${JSON.stringify(targets.resourceRows)}`);
  }
  const clippedText = targets.criticalText.filter((element) =>
    element.scrollWidth > element.clientWidth + 1 ||
    ((element.overflowY === 'hidden' || element.overflowY === 'clip') &&
      element.scrollHeight > element.clientHeight + 1));
  if (clippedText.length > 0) {
    throw new Error(`${viewport.name}/${motion}: critical console text is clipped: ${JSON.stringify(clippedText)}`);
  }

  const maintenanceAction = page.getByRole('button', { name: 'Run unrest check', exact: true });
  await maintenanceAction.scrollIntoViewIfNeeded();
  await maintenanceAction.focus();
  const maintenanceActionState = await maintenanceAction.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const header = document.querySelector('.app-header');
    const headerRect = header?.getBoundingClientRect();
    return {
      text: element.textContent?.trim() ?? '',
      focused: document.activeElement === element,
      disabled: (element instanceof HTMLButtonElement) && element.disabled,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      headerOverlap: Boolean(headerRect && rect.left < headerRect.right && rect.right > headerRect.left &&
        rect.top < headerRect.bottom && rect.bottom > headerRect.top),
    };
  });
  if (!maintenanceActionState.focused || maintenanceActionState.disabled ||
      maintenanceActionState.width < 44 || maintenanceActionState.height < 44 ||
      maintenanceActionState.left < -1 || maintenanceActionState.right > viewport.width + 1 ||
      (responsiveViewport && maintenanceActionState.headerOverlap)) {
    throw new Error(`${viewport.name}/${motion}: current maintenance action failed focus/readability checks: ${JSON.stringify(maintenanceActionState)}`);
  }

  const primaryAction = page.getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER' });
  await primaryAction.scrollIntoViewIfNeeded();
  if (viewport.width <= 480) {
    await primaryAction.tap();
    await page.getByRole('button', { name: 'CLOSE RED ALERT COMMAND COVER' }).focus();
    await page.getByRole('button', { name: 'CLOSE RED ALERT COMMAND COVER' }).press('Enter');
    await page.getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER' }).focus();
    await page.getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER' }).press('Space');
  } else {
    await primaryAction.focus();
    await primaryAction.press('Enter');
  }
  const trigger = page.getByRole('button', { name: 'RAISE FLEETWIDE RED ALERT' });
  await trigger.waitFor({ state: 'visible' });
  if (!(await trigger.isEnabled())) {
    throw new Error(`${viewport.name}/${motion}: the primary fleet action is disabled in the live review fixture.`);
  }
  await trigger.focus();
  const focusState = await trigger.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      focused: document.activeElement === element,
      disabled: (element instanceof HTMLButtonElement) && element.disabled,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      fontFamily: getComputedStyle(element).fontFamily,
      tabIndex: element.tabIndex,
      header: (() => {
        const header = document.querySelector('.app-header');
        const headerRect = header?.getBoundingClientRect();
        if (!headerRect) return null;
        return {
          position: getComputedStyle(header).position,
          top: headerRect.top,
          bottom: headerRect.bottom,
          overlaps: rect.left < headerRect.right && rect.right > headerRect.left &&
            rect.top < headerRect.bottom && rect.bottom > headerRect.top,
        };
      })(),
    };
  });
  if (!focusState.focused || focusState.disabled || focusState.width < 44 || focusState.height < 44 ||
      focusState.left < -1 || focusState.right > viewport.width + 1 || focusState.tabIndex < 0 ||
      !/Oxanium|Share Tech Mono|monospace/i.test(focusState.fontFamily)) {
    throw new Error(`${viewport.name}/${motion}: primary touch/focus control failed: ${JSON.stringify(focusState)}`);
  }
  if ((viewport.width <= 672 || viewport.height <= 672) &&
      (focusState.header?.position === 'fixed' || focusState.header?.overlaps)) {
    throw new Error(`${viewport.name}/${motion}: the persistent header covers the primary action after scrolling: ${JSON.stringify(focusState)}`);
  }
  async function capture(name, selector) {
    await page.evaluate(async () => {
      const { useSessionStore } = await import('/src/store/useSessionStore.ts');
      useSessionStore.getState().setCommunicationError(null);
    });
    if (!['status', 'page'].includes(name) && (viewport.width <= 672 || viewport.height <= 672)) {
      const occlusion = await page.evaluate((targetSelector) => {
        const header = document.querySelector('.app-header');
        const target = document.querySelector(targetSelector);
        if (!header || !target) return null;
        const headerRect = header.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        return {
          position: getComputedStyle(header).position,
          overlaps: targetRect.left < headerRect.right && targetRect.right > headerRect.left &&
            targetRect.top < headerRect.bottom && targetRect.bottom > headerRect.top,
          header: { top: headerRect.top, bottom: headerRect.bottom },
          target: { top: targetRect.top, bottom: targetRect.bottom },
        };
      }, selector);
      if (!occlusion || occlusion.position === 'fixed' || occlusion.overlaps) {
        throw new Error(`${viewport.name}/${motion}: header obscures ${name} while reading: ${JSON.stringify(occlusion)}`);
      }
    }
    await page.screenshot({ path: resolve(OUTPUT_DIR, `${viewport.name}-${motion}-${name}.png`), fullPage: false });
  }
  await capture('page', '.ship-console');
  const screenshotTargets = [
    ['status', '.primary-status'],
    ['maintenance', '.maintenance-reference'],
    ['damage', '.aegis-system[data-damaged="true"]'],
    ['stores', '.ship-resources'],
    ['maintenance-action', '.maintenance-systems__cycle > ol > li[aria-current="step"] > button.cic-action-button'],
    ['primary-action', '.confetti-dispenser--fleet-alert'],
  ];
  for (const [name, selector] of screenshotTargets) {
    const target = page.locator(selector).first();
    if (!(await target.isVisible().catch(() => false))) continue;
    await target.scrollIntoViewIfNeeded();
    await capture(name, selector);
  }
  const hasTouch = viewport.width <= 480;
  const focusStateWithInput = { ...focusState, input: hasTouch ? 'touch-opened, keyboard-focused' : 'keyboard-opened, keyboard-focused' };
  return {
    viewport: viewport.name,
    motion,
    layout: targets,
    maintenanceAction: maintenanceActionState,
    primaryAction: focusStateWithInput,
  };
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
      for (const motion of MOTION_MODES) {
        const mobile = viewport.width <= 480;
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: mobile,
          hasTouch: mobile,
          reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference',
          serviceWorkers: 'block',
        });
        const now = Date.now();
        await context.addInitScript(({ state, timestamp, choice }) => {
          localStorage.setItem('dow-new-eden-session', state);
          localStorage.setItem('dow-new-eden-session-waiver', String(timestamp));
          localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: timestamp, choice }));
        }, { state: persistedState(now), timestamp: now, choice: motion });
        const page = await context.newPage();
        await page.goto(`${appUrl}/#/ships/aegis/roles/admiral`, { waitUntil: 'domcontentloaded' });
        const record = await inspect(page, viewport, motion);
        evidence.push(record);
        console.log(`Prompt 603 rendered proof passed: ${viewport.name} ${viewport.width}x${viewport.height} ${motion} motion`);
        await context.close();
      }
    }
    writeFileSync(resolve(OUTPUT_DIR, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await browser?.close();
    vite.kill('SIGTERM');
  }
}

await main();

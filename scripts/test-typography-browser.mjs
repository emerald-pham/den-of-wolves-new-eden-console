#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { installTypographyNetworkBoundary, waitForTypographyTargets } from './typography-browser-readiness.mjs';

const ROOT = process.cwd();
const EVIDENCE_DIR = resolve(process.env.TYPOGRAPHY_EVIDENCE_DIR ?? '/tmp/pc04-typography');
const PC01_SHA = '4e8e3876108709f2a620c4f71ea874183d3db4ee';
const VIEWPORTS = [
  { name: 'phone-narrow', width: 320, height: 844 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'short-landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
];
const MOTION_MODES = ['normal', 'reduced'];

const STAMP = '2026-01-01T00:00:00.000Z';

function session(id, ownerUid = 'pc04-player') {
  return {
    id,
    name: 'New Eden typography review',
    joinCode: 'PC04',
    phase: 'active',
    ownerUid,
    createdAt: STAMP,
    updatedAt: STAMP,
    currentTurn: 3,
    activeRoleIds: [
      'admiral', 'executive-officer', 'wing-commander', 'dione-captain',
      'dione-engineer', 'press-officer', 'shepherd-engineer', 'shepherd-scientist',
      'quellon-captain', 'refinery-124-captain',
    ],
    activeVesselIds: ['aegis', 'dione', 'shepherd', 'quellon', 'refinery-124'],
    capybaraEnabled: true,
    dioneEnabled: true,
    pressEnabled: true,
    pressClaimed: false,
    shipGalacticCoordinates: {
      aegis: '0000', dione: '0012', shepherd: '0243', quellon: '1104',
      'refinery-124': '2315',
    },
    shipResources: {
      aegis: { ore: 7, fuel: 12, food: 21, water: 18, materials: 4, securityTeams: 8 },
    },
    shipSurvivors: { aegis: 2500 },
    shipUnrest: { aegis: 3 },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    shipUpgrades: { aegis: [] },
  };
}

function playerState(id, route, { press = false, mission = false, brief = false } = {}) {
  const currentSession = session(id);
  const player = {
    uid: 'pc04-player',
    sessionId: currentSession.id,
    displayName: 'Ari Review',
    role: 'player',
    seatId: press ? 'press-officer' : 'admiral',
    ...(brief ? { assignedRoleId: 'admiral' } : {}),
    ...(press ? { activeConsoleRoleId: 'press-officer' } : {}),
    ...(!press && route.startsWith('/ships/') ? { activeConsoleRoleId: 'admiral' } : {}),
    joinedAt: STAMP,
  };
  const awayMissionHandPointers = mission ? [{
    sessionId: id,
    participantUid: player.uid,
    missionId: 'nightfall-approach',
    handId: 'nightfall-hand-1',
    phase: 'discarding',
    revision: 1,
    discarded: false,
  }] : [];
  const awayMissionHands = mission ? [{
    sessionId: id,
    participantUid: player.uid,
    missionId: 'nightfall-approach',
    handId: 'nightfall-hand-1',
    cardId: 'scout-7',
    rank: 'seven',
    suit: 'clubs',
    value: 7,
    discarded: false,
  }] : [];
  return {
    state: {
      session: currentSession,
      me: player,
      gmInstance: null,
      gmAccessAuthenticatedAt: null,
      pendingCommands: [],
      seats: [
        { id: 'admiral', sessionId: id, roleId: 'admiral', label: 'AEGIS // Admiral', status: 'claimed', holderUid: 'other-player', factionId: 'aegis', claimedAt: STAMP },
        { id: 'dione-engineer', sessionId: id, roleId: 'dione-engineer', label: 'Dione // Engineer', status: 'open', holderUid: null, factionId: 'dione', claimedAt: null },
      ],
      roleBrief: brief ? {
        assignmentUid: player.uid,
        roleId: 'admiral',
        roleName: 'Admiral',
        vesselName: 'AEGIS',
        text: 'Coordinate the fleet and confirm the next operational priority.',
        commonRules: 'Keep private roles and table decisions confidential.',
        ownedCraftIds: ['fighter-wing-alpha'],
        setupRevision: 1,
      } : null,
      awayMissionHandPointer: awayMissionHandPointers[0] ?? null,
      awayMissionHand: awayMissionHands[0] ?? null,
      awayMissionHandPointers,
      awayMissionHands,
      gmAwayMissionHandPointers: [],
      mode: press ? 'press' : 'console',
      lastRoute: route,
    },
    version: 1,
  };
}

function gmState(id, route) {
  const currentSession = session(id, 'pc04-gm');
  const gm = {
    uid: 'pc04-gm', sessionId: id, displayName: 'Facilitator', role: 'gm',
    seatId: null, joinedAt: STAMP,
  };
  return {
    state: {
      session: currentSession,
      me: gm,
      gmInstance: {
        id: 'pc04-gm-instance', sessionId: id, uid: gm.uid,
        name: 'Bridge review', deviceLabel: 'Typography review', claimedAt: STAMP,
      },
      gmAccessAuthenticatedAt: Date.now(),
      pendingCommands: [],
      seats: [],
      gmAwayMissionHandPointers: [{
        sessionId: id, participantUid: 'pc04-player', missionId: 'nightfall-approach',
        handId: 'nightfall-hand-1', phase: 'awaiting-card-selection', revision: 1,
        discarded: false,
      }],
      mode: 'gm',
      lastRoute: route,
    },
    version: 1,
  };
}

function gmJoinState(id, route) {
  const fixture = playerState(id, route);
  fixture.state.gmAccessAuthenticatedAt = Date.now();
  return fixture;
}

const SURFACES = [
  {
    id: 'entry-catalog', route: '/console', fixture: () => playerState('pc04-entry', '/console'),
    targets: [
      ['catalog-heading', '.fleet-roster__header h1'],
      ['catalog-card-title', '.fleet-card__name'],
      ['catalog-seat-state', '.fleet-card__console-status'],
    ],
  },
  {
    id: 'gm-join', route: '/roles', fixture: () => gmJoinState('pc04-gm-join', '/console'),
    enterThroughCatalog: true,
    targets: [
      ['gm-join-heading', '.role-select__title'],
      ['gm-join-action', '.role-claim__button'],
      ['gm-instance-name-label', '.role-claim label'],
    ],
  },
  {
    id: 'shared-header', route: '/gm', fixture: () => gmState('pc04-header', '/gm'),
    targets: [
      ['session-code', '.app-header .session-badge__code'],
      ['primary-status-label', '.app-header .primary-status__field dt'],
      ['settings-control', '.app-header .settings-button'],
    ],
  },
  {
    id: 'dradis', route: '/ships/aegis/roles/admiral',
    fixture: () => playerState('pc04-dradis', '/ships/aegis/roles/admiral'),
    expandDradis: true,
    targets: [
      ['dradis-label', '.ship-plot__label'],
      ['dradis-contact-name', '.contact-plot__tag > span:first-child'],
      ['ship-title', '.ship-console__name'],
      ['ship-description', '.ship-console__description'],
    ],
  },
  {
    id: 'press-shuttle', route: '/press',
    fixture: () => playerState('pc04-press', '/press', { press: true }),
    targets: [
      ['shuttle-title', '.ship-console__name'],
      ['press-dispatch-label', '.press-dispatch__current-heading'],
    ],
  },
  {
    id: 'gm-console', route: '/gm', fixture: () => gmState('pc04-gm', '/gm'),
    targets: [
      ['gm-heading', '.gm-console h1'],
      ['gm-section-title', '.gm-console .gm-console__section-title'],
      ['gm-map-control', '.gm-starmap__controls label'],
    ],
  },
  {
    id: 'mission', route: '/ships/aegis/roles/admiral',
    fixture: () => playerState('pc04-mission', '/ships/aegis/roles/admiral', { mission: true }),
    targets: [
      ['mission-heading', '.away-mission-private-panel h2'],
      ['mission-card-title', '.away-mission-private-panel__card dt'],
      ['mission-card-value', '.away-mission-private-panel__card dd'],
      ['mission-brief-copy', '.ship-console__name'],
    ],
  },
];

function round(value) {
  return Math.round(value * 100) / 100;
}

function normalizeFamily(value) {
  return value.toLowerCase().replaceAll('"', '').replaceAll("'", '')
    .replace(/\s+/g, ' ').trim();
}

function safeName(value) {
  return value.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
}

async function preparePc01Reference() {
  execFileSync('git', ['cat-file', '-e', `${PC01_SHA}^{commit}`], { cwd: ROOT });
  const root = await mkdtemp(join(await realpath(tmpdir()), 'pc04-typography-pc01-'));
  try {
    const archive = execFileSync('git', ['archive', '--format=tar', PC01_SHA], {
      cwd: ROOT,
      maxBuffer: 512 * 1024 * 1024,
    });
    execFileSync('tar', ['-xf', '-', '-C', root], {
      cwd: ROOT,
      input: archive,
      maxBuffer: 16 * 1024 * 1024,
    });
    await symlink(resolve(ROOT, 'node_modules'), resolve(root, 'node_modules'), 'dir');
    return root;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function startServer(root) {
  const requireFromRoot = createRequire(resolve(ROOT, 'package.json'));
  const viteEntry = requireFromRoot.resolve('vite');
  const { createServer } = await import(pathToFileURL(viteEntry).href);
  const cacheDir = await mkdtemp(join(await realpath(tmpdir()), 'pc04-typography-vite-'));
  let server;
  try {
    server = await createServer({
      root,
      configFile: resolve(root, 'vite.config.ts'),
      cacheDir,
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      logLevel: 'silent',
    });
    const resolvedRoot = await realpath(root);
    const expectedConfigFile = resolve(resolvedRoot, 'vite.config.ts');
    const actualConfigRoot = await realpath(server.config.root);
    const actualConfigFile = await realpath(server.config.configFile);
    assert.equal(
      actualConfigRoot,
      resolvedRoot,
      `Vite resolved ${server.config.root} instead of the requested reference root ${resolvedRoot}`,
    );
    assert.equal(
      actualConfigFile,
      expectedConfigFile,
      `Vite resolved ${server.config.configFile} instead of the root-owned config ${expectedConfigFile}`,
    );
    await server.listen();
    const address = server.httpServer?.address();
    assert.ok(address && typeof address !== 'string', `Vite did not open for ${root}`);
    return {
      server,
      url: `http://127.0.0.1:${address.port}`,
      cacheDir,
      resolvedConfig: { root: actualConfigRoot, configFile: actualConfigFile },
    };
  } catch (error) {
    await server?.close();
    await rm(cacheDir, { recursive: true, force: true });
    throw error;
  }
}

async function collectSurface(browser, appUrl, surface, viewport, motion, kind) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: motion === 'reduced' ? 'reduce' : 'no-preference',
    serviceWorkers: 'block',
  });
  await installTypographyNetworkBoundary(context, appUrl);
  const page = await context.newPage();
  const browserDiagnostics = [];
  page.on('pageerror', (error) => browserDiagnostics.push(`pageerror: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserDiagnostics.push(`console: ${message.text()} (${message.location().url})`);
    }
  });
  page.on('requestfailed', (request) => {
    browserDiagnostics.push(`request failed: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      browserDiagnostics.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  const now = Date.now();
  const fixture = surface.fixture();
  const initialRoute = surface.enterThroughCatalog && kind === 'candidate'
    ? '/console'
    : surface.route;
  fixture.state.lastRoute = initialRoute;
  await context.addInitScript(({ state, timestamp, motionPreference }) => {
    localStorage.setItem('dow-new-eden-session', JSON.stringify(state));
    localStorage.setItem('dow-new-eden-session-waiver', String(timestamp));
    localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({
      acknowledgedAt: timestamp,
      choice: motionPreference,
    }));
    localStorage.setItem('new-eden-motion-override', motionPreference);
  }, { state: fixture, timestamp: now, motionPreference: motion === 'reduced' ? 'reduce' : 'full' });

  const search = `?typography=${kind}-${surface.id}-${viewport.width}x${viewport.height}-${motion}`;
  const url = `${appUrl}/${search}#${initialRoute}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    if (surface.enterThroughCatalog && kind === 'candidate') {
      await page.getByRole('link', { name: 'GM join' }).click();
      await page.locator('.role-claim__button').waitFor({ state: 'visible', timeout: 15_000 });
    }
    const screenshotDir = resolve(EVIDENCE_DIR, kind, motion, viewport.name);
    await mkdir(screenshotDir, { recursive: true });
    const screenshot = resolve(screenshotDir, `${safeName(surface.id)}.png`);
    const firstTarget = surface.targets[0];
    if (!firstTarget) throw new Error(`${surface.id} has no typography target.`);
    const first = page.locator(firstTarget[1]).first();
    try {
      await first.waitFor({ state: 'visible', timeout: 15_000 });
    } catch (error) {
      const bodyText = await page.locator('body').innerText().catch(() => 'body unavailable');
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined);
      throw new Error(
        `${kind}/${surface.id} did not render ${firstTarget[0]} at ${surface.route}: ` +
        `${bodyText.replace(/\s+/g, ' ').slice(0, 500)} [${browserDiagnostics.join(' | ')}] ` +
        `screenshot=${screenshot}`,
        { cause: error },
      );
    }
    if (surface.expandDradis) {
      const expand = page.getByRole('button', { name: /zoom into dradis panel/i });
      if (await expand.count()) await expand.click();
      await page.locator('.contact-plot__tag').first().waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('.ship-plot').evaluate(async (element) => {
        const transitions = element.getAnimations()
          .filter((animation) => typeof animation.transitionProperty === 'string');
        await Promise.all(transitions.map((animation) => animation.finished.catch(() => undefined)));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
    }
    await waitForTypographyTargets(page, surface.targets);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);

    const measurement = await page.evaluate((targetSpecs) => {
      const roundPixel = (number) => Math.round(number * 100) / 100;
      const monoToken = getComputedStyle(document.documentElement).getPropertyValue('--cic-mono').trim();
      const specs = targetSpecs.map(([name, selector]) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return { name, selector, missing: true };
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const lineTops = [...range.getClientRects()].map((line) => roundPixel(line.top));
        const lines = new Set(lineTops).size;
        return {
          name,
          selector,
          text: (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180),
          tokenFamily: monoToken,
          fontFamily: style.fontFamily,
          fontSize: roundPixel(Number.parseFloat(style.fontSize)),
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
          textTransform: style.textTransform,
          whiteSpace: style.whiteSpace,
          lineCount: lines,
          geometry: {
            left: roundPixel(rect.left),
            top: roundPixel(rect.top),
            width: roundPixel(rect.width),
            height: roundPixel(rect.height),
            right: roundPixel(rect.right),
            bottom: roundPixel(rect.bottom),
          },
          overflow: {
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
          },
        };
      });
      const root = document.documentElement;
      const plot = document.querySelector('.ship-plot');
      const plotTags = [...document.querySelectorAll('.contact-plot__tag')];
      return {
        viewport: { width: innerWidth, height: innerHeight },
        appliedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'full',
        appMotionMode: document.querySelector('[data-motion]')?.getAttribute('data-motion') ?? null,
        pageGeometry: {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          scrollHeight: root.scrollHeight,
          clientHeight: root.clientHeight,
        },
        dradis: plot ? {
          expanded: plot.getAttribute('data-expanded'),
          tags: plotTags.length,
          tagBounds: plotTags.slice(0, 4).map((tag) => {
            const rect = tag.getBoundingClientRect();
            return {
              text: (tag.textContent ?? '').replace(/\s+/g, ' ').trim(),
              left: roundPixel(rect.left), top: roundPixel(rect.top),
              width: roundPixel(rect.width), height: roundPixel(rect.height),
              right: roundPixel(rect.right), bottom: roundPixel(rect.bottom),
            };
          }),
        } : null,
        targets: specs,
      };
    }, surface.targets);
    const missing = measurement.targets.filter((target) => target.missing);
    assert.deepEqual(missing, [], `${kind}/${surface.id}: required rendered typography samples are missing.`);

    await page.screenshot({ path: screenshot, fullPage: true });
    return {
      id: surface.id,
      route: surface.route,
      viewport,
      motion,
      screenshot,
      ...measurement,
    };
  } finally {
    await context.close();
  }
}

function comparePc01(candidate, reference) {
  const caseKey = (entry) =>
    `${entry.motion}/${entry.viewport.width}x${entry.viewport.height}/${entry.id}`;
  const referenceById = new Map(reference.map((entry) => [caseKey(entry), entry]));
  const issues = [];
  const check = (condition, message) => {
    if (!condition) issues.push(message);
  };
  assert.equal(candidate.length, reference.length, 'PC01 comparison case count changed.');
  const cases = candidate.map((entry) => {
    const key = caseKey(entry);
    const old = referenceById.get(key);
    assert.ok(old, `PC01 is missing comparison case ${key}.`);
    check(entry.appliedMotion === (entry.motion === 'reduced' ? 'reduce' : 'full'),
      `${key}: requested motion profile was not applied.`);
    check(old.appliedMotion === (entry.motion === 'reduced' ? 'reduce' : 'full'),
      `${key}: PC01 reference did not receive the requested motion profile.`);
    if (entry.appMotionMode !== null) {
      check(entry.appMotionMode === entry.appliedMotion,
        `${key}: candidate app motion state did not match the browser preference.`);
    }
    check(entry.pageGeometry.scrollWidth <= entry.viewport.width + 1,
      `${key}: candidate page overflowed horizontally (${entry.pageGeometry.scrollWidth}px).`);
    assert.equal(entry.targets.length, old.targets.length,
      `${key}: candidate and PC01 sample different target counts.`);
    const oldByName = new Map(old.targets.map((target) => [target.name, target]));
    return {
      id: key,
      surface: entry.id,
      viewport: entry.viewport,
      motion: entry.motion,
      targets: entry.targets.map((target) => {
        const baselineTarget = oldByName.get(target.name);
        assert.ok(baselineTarget, `${key}/${target.name}: PC01 sample is missing.`);
        const targetLabel = `${key}/${target.name}`;
        check(!target.missing, `${targetLabel}: candidate typography sample disappeared.`);
        check(!baselineTarget.missing, `${targetLabel}: PC01 typography sample disappeared.`);
        check(normalizeFamily(target.fontFamily) === normalizeFamily(target.tokenFamily),
          `${targetLabel}: candidate family does not resolve to the CIC mono token.`);
        check(normalizeFamily(baselineTarget.fontFamily) === normalizeFamily(baselineTarget.tokenFamily),
          `${targetLabel}: PC01 reference violates the CIC mono-family contract.`);
        check(normalizeFamily(target.fontFamily) === normalizeFamily(baselineTarget.fontFamily),
          `${targetLabel}: family differs from the accepted PC01 rendering.`);
        check(target.fontWeight === baselineTarget.fontWeight,
          `${targetLabel}: weight changed from PC01 ${baselineTarget.fontWeight} to ${target.fontWeight}.`);
        check(target.textTransform === baselineTarget.textTransform,
          `${targetLabel}: text casing changed from the accepted PC01 rendering.`);
        if (target.text.toLocaleLowerCase() === baselineTarget.text.toLocaleLowerCase()) {
          check(target.text === baselineTarget.text,
            `${targetLabel}: authored text casing changed from the accepted PC01 rendering.`);
        }
        check(target.whiteSpace === baselineTarget.whiteSpace,
          `${targetLabel}: wrapping mode changed from the accepted PC01 rendering.`);
        check(target.lineHeight === baselineTarget.lineHeight,
          `${targetLabel}: line-height changed from PC01 ${baselineTarget.lineHeight} to ${target.lineHeight}.`);
        check(target.letterSpacing === baselineTarget.letterSpacing,
          `${targetLabel}: tracking changed from PC01 ${baselineTarget.letterSpacing} to ${target.letterSpacing}.`);
        check(Math.abs(target.fontSize - baselineTarget.fontSize) <= 0.1,
          `${targetLabel}: size changed from PC01 ${baselineTarget.fontSize}px to ${target.fontSize}px.`);
        check(target.geometry.width > 0 && target.geometry.height > 0,
          `${targetLabel}: candidate has no rendered bounds.`);
        check(baselineTarget.geometry.width > 0 && baselineTarget.geometry.height > 0,
          `${targetLabel}: PC01 reference has no rendered bounds.`);
        if (target.text === baselineTarget.text) {
          check(target.lineCount === baselineTarget.lineCount,
            `${targetLabel}: line wrapping changed while the sampled copy stayed the same.`);
          for (const dimension of ['width', 'height']) {
            check(Math.abs(target.geometry[dimension] - baselineTarget.geometry[dimension]) <= 2,
              `${targetLabel}: ${dimension} differs from PC01 by more than 2px.`);
          }
        }
        return {
          name: target.name,
          pc01FontFamily: baselineTarget.fontFamily,
          currentFontFamily: target.fontFamily,
          pc01FontSize: baselineTarget.fontSize,
          currentFontSize: target.fontSize,
          fontSizeDelta: round(target.fontSize - baselineTarget.fontSize),
          pc01Weight: baselineTarget.fontWeight,
          currentWeight: target.fontWeight,
          pc01LineHeight: baselineTarget.lineHeight,
          currentLineHeight: target.lineHeight,
          pc01LetterSpacing: baselineTarget.letterSpacing,
          currentLetterSpacing: target.letterSpacing,
          textChanged: target.text !== baselineTarget.text,
          pc01Lines: baselineTarget.lineCount,
          currentLines: target.lineCount,
          pc01Geometry: baselineTarget.geometry,
          currentGeometry: target.geometry,
          geometryDelta: {
            width: round(target.geometry.width - baselineTarget.geometry.width),
            height: round(target.geometry.height - baselineTarget.geometry.height),
          },
        };
      }),
    };
  });
  return { cases, issues };
}

const runners = [];
let browser;
let pc01Root;
try {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  pc01Root = await preparePc01Reference();
  const pc01Server = await startServer(pc01Root);
  runners.push(pc01Server);
  const candidateServer = await startServer(ROOT);
  runners.push(candidateServer);
  browser = await chromium.launch({ headless: true });

  const candidate = [];
  const pc01 = [];
  for (const motion of MOTION_MODES) {
    for (const viewport of VIEWPORTS) {
      for (const surface of SURFACES) {
        candidate.push(await collectSurface(
          browser, candidateServer.url, surface, viewport, motion, 'candidate',
        ));
        pc01.push(await collectSurface(
          browser, pc01Server.url, surface, viewport, motion, 'pc01',
        ));
      }
    }
  }

  const pc01Comparison = comparePc01(candidate, pc01);

  const report = {
    reference: {
      sha: PC01_SHA,
      source: 'git archive from the exact PC01 commit',
      root: pc01Server.resolvedConfig.root,
      configFile: pc01Server.resolvedConfig.configFile,
    },
    candidate,
    pc01,
    pc01Comparison,
  };
  await writeFile(resolve(EVIDENCE_DIR, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (pc01Comparison.issues.length > 0) {
    const visibleIssues = pc01Comparison.issues.slice(0, 30).join('\n');
    const remainder = pc01Comparison.issues.length > 30
      ? `\n...and ${pc01Comparison.issues.length - 30} more; see results.json.`
      : '';
    throw new Error(
      `Rendered typography differs from the exact PC01/CIC contract in ` +
      `${pc01Comparison.issues.length} checks:\n${visibleIssues}${remainder}`,
    );
  }
  console.log(
    `Rendered typography gate passed: ${candidate.length} cases, ${SURFACES.length} surfaces, ` +
    `${VIEWPORTS.length} viewports, normal/reduced motion. Evidence: ${EVIDENCE_DIR}`,
  );
  console.log(`Exact PC01 ${PC01_SHA} comparison evidence: ${resolve(EVIDENCE_DIR, 'results.json')}`);
} finally {
  await browser?.close();
  await Promise.all(runners.map(async ({ server, cacheDir }) => {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }));
  if (pc01Root) await rm(pc01Root, { recursive: true, force: true });
}

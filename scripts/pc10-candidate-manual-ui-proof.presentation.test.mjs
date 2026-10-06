import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import ts from 'typescript';
import { candidateGameplayTools } from './pc10-candidate-manual-ui-proof.mjs';
import { receptionFixture } from './pc10-candidate-manual-ui-proof.reception.test.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const noAction = () => assert.fail('Source presentation fixtures cannot clear, replay, mutate gameplay, or call Auth/emulators.');

async function componentSource(file, imports, realm) {
  const { outputText } = ts.transpileModule(await readFile(resolve(ROOT, file), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  const module = new SourceTextModule(outputText, { context: realm });
  await module.link(async name => {
    assert.ok(Object.hasOwn(imports, name), `Only declared presentation source dependencies may load: ${name}`);
    const values = imports[name];
    if (values instanceof SourceTextModule) return values;
    const dependency = new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context: realm });
    await dependency.link(noAction); return dependency;
  });
  await module.evaluate(); return module;
}

async function actualPresentation(t, kind) {
  const f = await receptionFixture({ initialNetworkMs: 0, initialComponentMs: 2 });
  f.dom.reconfigure({ url: 'http://source-presentation.invalid/' });
  const container = f.window.document.createElement('div'); f.window.document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { root.unmount(); await Promise.resolve(); f.dispose(); });
  const realm = createContext({ window: f.window, document: f.window.document,
    HTMLElement: f.window.HTMLElement, Node: f.window.Node, MutationObserver: f.window.MutationObserver,
    queueMicrotask });
  const jsx = { react: React, 'react/jsx-runtime': jsxRuntime };
  if (kind === 'transmission') {
    const motion = await componentSource('src/lib/motionPreference.ts', { react: React }, realm);
    const phase = await componentSource('src/lib/turnPhase.ts', {}, realm);
    const glitch = await componentSource('src/components/intrusionGlitch.ts', {}, realm);
    const intrusion = await componentSource('src/components/Intrusion.tsx', { ...jsx,
      './intrusionGlitch': glitch, '@/lib/motionPreference': motion }, realm);
    const timer = await componentSource('src/components/TurnPhaseTimer.tsx', { ...jsx, '@/lib/turnPhase': phase }, realm);
    const live = await componentSource('src/components/LiveChangeRegion.tsx', jsx, realm);
    const clearance = await componentSource('src/components/CycleBriefingClearanceView.tsx', jsx, realm);
    const formal = await componentSource('src/components/TeamStartFormalAnnouncementsView.tsx', jsx, realm);
    const useSessionStore = Object.assign(selector => selector(f.store), { getState: () => f.store });
    const turn = await componentSource('src/components/TurnStartAnnouncement.tsx', { ...jsx,
      './Intrusion': intrusion, '@/lib/motionPreference': motion, '@/lib/turnPhase': phase,
      '@/store/useSessionStore': { useSessionStore }, './TurnPhaseTimer': timer, './LiveChangeRegion': live,
      '@/lib/turnInterstitialService': { clearTurnAdvanceInterstitial: noAction },
      './CycleBriefingClearanceView': clearance, './TeamStartFormalAnnouncementsView': formal }, realm);
    const style = f.window.document.createElement('style');
    const css = await readFile(resolve(ROOT, 'src/styles/intrusion.css'), 'utf8');
    // JSDOM cannot parse the existing nested, inactive reduced-motion rule.
    // Keep every normal source declaration byte-identical; this earns no full-CSS/pixel credit.
    const nested = css.indexOf("[data-motion='reduce'] {"), afterNested = css.indexOf('/* The clear action is a real, accessible control');
    assert.ok(nested >= 0 && afterNested > nested);
    style.textContent = css.slice(0, nested) + css.slice(afterNested);
    f.window.document.head.append(style);
    f.store.session = { ...f.store.session, currentTurn: 3, updatedAt: 'source-presentation-key-3',
      turnStartAnnouncement: { turn: 3, survivorPopulation: 222581, revision: 0 } };
    f.render(); root.render(React.createElement(turn.namespace.default));
    await delay(20);
    assert.equal(f.window.document.querySelector('.intrusion--fleet'), null, 'Mounting an existing marker alone cannot replay a natural transmission.');
    f.store.session = { ...f.store.session, currentTurn: 4, updatedAt: 'source-presentation-key-4',
      turnStartAnnouncement: { turn: 4, survivorPopulation: 222581, revision: 0 } };
    f.render(); root.render(React.createElement(turn.namespace.default));
    for (let attempt = 0; !f.window.document.querySelector('.intrusion--fleet') && attempt < 50; attempt++) await delay(2);
    const overlay = f.window.document.querySelector('.intrusion--fleet');
    assert.ok(overlay?.isConnected); assert.equal(overlay.getAttribute('aria-hidden'), 'true');
    assert.equal(f.window.getComputedStyle(overlay).pointerEvents, 'none');
    assert.equal(f.window.getComputedStyle(overlay).position, 'fixed');
    assert.ok(overlay.textContent.includes('CYCLE 3 → CYCLE 4'));
    assert.equal(f.window.document.querySelector('[aria-modal="true"]'), null, 'The actual natural transmission has no modal focus trap.');
    const tab = new f.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    f.window.document.dispatchEvent(tab); assert.equal(tab.defaultPrevented, false);
  } else {
    const focus = await componentSource('src/hooks/useDialogFocus.ts', { react: React }, realm);
    const dialog = await componentSource('src/components/FocusDialog.tsx', { ...jsx,
      'react-dom': { createPortal }, '@/hooks/useDialogFocus': focus }, realm);
    root.render(React.createElement(dialog.namespace.default, { open: true,
      title: 'Source presentation modal', description: 'Actual contained-focus source counterexample.', onClose: noAction },
    React.createElement('p', null, 'A real modal remains open.')));
    for (let attempt = 0; !f.window.document.querySelector('[aria-modal="true"]') && attempt < 50; attempt++) await delay(2);
    assert.ok(f.window.document.querySelector('[aria-modal="true"]')?.isConnected);
    const nativeDefault = f.surface.page.keyboard.press;
    f.surface.page.keyboard.press = async key => {
      const event = new f.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      f.window.document.dispatchEvent(event);
      if (!event.defaultPrevented) await nativeDefault(key);
    };
  }
  await f.received();
  return f;
}

for (const kind of ['transmission', 'modal-focus-trap']) {
  test(`public candidate geometry keeps actual ${kind} source presentation unready before ONE refresh/capture`, async t => {
    const f = await actualPresentation(t, kind);
    const directory = await mkdtemp(resolve(tmpdir(), 'pc10-source-presentation-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const tools = candidateGameplayTools({ gm: f.surface, crew: f.surface, directory,
      initial: { sessionId: f.store.session.id, joinCode: 'source-join' },
      roster: [{ roleId: 'shepherd-scientist', uidHash: 'source-original-hash' }],
      projectId: 'demo-pc10-source-reception', ports: { functions: 5011 } });
    let failure;
    try { await tools.candidateGeometry(f.surface, 'N', 'research-choice', { readinessTimeoutMs: 650 }); }
    catch (error) { failure = error; }
    const observation = { sourceOnly: true, kind,
      actualTransmissionMounted: !!f.window.document.querySelector('.intrusion--fleet .turn-start-announcement__console'),
      actualModalMounted: !!f.window.document.querySelector('[aria-modal="true"]'),
      explicitRefreshClicks: f.clickCount(), sourceCaptureCount: f.screenshotCount(),
      message: failure?.message ?? 'Source geometry was accepted despite mounted presentation.' };
    console.log(JSON.stringify({ presentationCounterexample: observation }));
    assert.ok(failure, 'Mounted source presentation must remain pending; returning a geometry success cannot satisfy this regression.');
    assert.match(observation.message, /presentation|deadline|did not finish rendering/i);
    assert.equal(f.clickCount(), 0, 'Mounted presentation must consume the original readiness budget before arming the proof refresh.');
    assert.equal(f.screenshotCount(), 0);
  });
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as proof from './pc10-base-combat-deduction-ui-proof.mjs';
import { baseMemberRowsMatch, waitForBaseMemberAftermath } from './pc10-base-combat-deduction-contracts.mjs';

// Native DOM/source counterexamples only: no actual browser, Auth, runtime,
// gameplay, whole-game or checkpoint credit.
const view = () => ({ type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 'native-session',
  attackId: 'native-attack', turn: 1, revision: 25, status: 'resolved', phase: 'active', currentStep: 'resolved',
  range: null, deadlineAt: '2026-10-05T22:26:00Z', serverTime: '2026-10-05T22:26:01Z', visibility: 'members',
  redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'],
  remainingThreatCount: 2, returningThreatCount: 1,
  results: [
    { range: 'boarding', sourceId: 'wolf-attack-damage', targetId: 'aegis', bearing: null,
      contactReference: 'AEGIS MixedCase-α', effect: 'Fleet damage', outcome: { damage: 1, populationLoss: 1000 },
      serverTime: '2026-10-05T22:26:01Z' },
    { range: 'long-range', sourceId: 'Aegis-MixedCase', targetId: 'wolf-contact-bravo', bearing: null,
      contactReference: 'Wolf contact Bravo', effect: 'Missed attack', outcome: { damage: 0 },
      serverTime: '2026-10-05T22:25:00Z' },
  ] });
const original = { hasAuth: true, sameActor: true, uidHash: 'native-executive', sessionId: 'native-session',
  profileRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', playerRole: 'player',
  phase: 'active', cycle: 1, connection: 'live', freshness: 'server' };
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const outcome = result => result.outcome.populationLoss
  ? `${result.outcome.damage} damage // ${result.outcome.populationLoss} population lost` : `${result.outcome.damage} damage`;
const normalized = value => value.replace(/\s+/g, ' ').trim();

async function fixture(current = view(), change = () => {}) {
  const [component, panelCss, globalCss] = await Promise.all([
    readFile(new URL('../src/components/WolfAttackStatusPanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/WolfAttackStatusPanel.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  ]);
  assert.ok(component.includes('<p className="eyebrow">Fleet alert // cycle {view.turn}</p>'));
  assert.ok(component.includes('resolved: \'Attack complete\''));
  assert.ok(component.includes("view.currentStep === 'resolved' ? 'Resolution committed'"));
  const styles = [globalCss.match(/\.eyebrow\s*\{[^}]*\}/)?.[0],
    panelCss.match(/\.wolf-attack-status__phase\s*\{[^}]*\}/)?.[0],
    panelCss.match(/\.wolf-attack-status__results strong\s*\{[^}]*\}/)?.[0]];
  assert.ok(styles.every(rule => rule?.includes('text-transform: uppercase')));
  const rows = current.results.map(result => `<li><strong>${escape(result.range === 'boarding' ? 'Boarding' : `${result.range} range`)}</strong>
    <span>${escape(result.sourceId)} → ${escape(result.contactReference)}</span><span>${escape(outcome(result))}</span>
    <small>Committed ${escape(result.serverTime)}</small></li>`).join('');
  const dom = new JSDOM(`<style>${styles.join('\n')}</style><section aria-label="Wolf attack status">
    <header class="wolf-attack-status__header"><div><p class="eyebrow">Fleet alert // cycle ${current.turn}</p></div>
      <span class="wolf-attack-status__phase">Attack complete</span></header>
    <p class="wolf-attack-status__deadline">Resolution committed // <time datetime="${current.deadlineAt}">${current.deadlineAt}</time></p>
    <p aria-label="Remaining Wolf threat count">${current.remainingThreatCount} remaining hostile ships // ${current.returningThreatCount} returning next attack</p>
    ${rows ? `<ol class="wolf-attack-status__results" aria-label="Committed attack results">${rows}</ol>`
      : '<p class="wolf-attack-status__pending">Attack progress is server recorded. Results appear here when a step commits.</p>'}</section>`);
  const { document } = dom.window;
  change(document);
  const visible = node => {
    for (let current = node; current; current = current.parentElement)
      if (current.hidden || ['none'].includes(dom.window.getComputedStyle(current).display) ||
        ['hidden', 'collapse'].includes(dom.window.getComputedStyle(current).visibility)) return false;
    return !!node;
  };
  const paintedText = node => {
    if (node.nodeType === 3) return node.textContent;
    const text = [...node.childNodes].map(paintedText).join(' ');
    return dom.window.getComputedStyle(node).textTransform === 'uppercase' ? text.toUpperCase() : text;
  };
  function locator(nodes) {
    const selected = (selector, options = {}) => nodes.flatMap(node => [...node.querySelectorAll(selector)])
      .filter(node => options.name === undefined || node.getAttribute('aria-label') === options.name);
    return { count: async () => nodes.length, isVisible: async () => visible(nodes[0]),
      textContent: async () => nodes[0]?.textContent ?? null, innerText: async () => paintedText(nodes[0]),
      getAttribute: async name => nodes[0]?.getAttribute(name) ?? null,
      all: async () => nodes.map(node => locator([node])),
      locator: selector => locator(selected(selector)),
      getByRole: (role, options) => locator(selected({ region: 'section', list: 'ol', listitem: 'li' }[role], options)),
      getByLabel: (name, options) => { assert.equal(options.exact, true); return locator(selected('[aria-label]', { name })); } };
  }
  const surface = { page: locator([document]) };
  return { surface, document, close: () => dom.window.close(),
    painted: () => normalized(paintedText(document.querySelector('section'))) };
}
async function ready(f, current) {
  if (typeof proof.renderedBaseMemberAftermath === 'function') return proof.renderedBaseMemberAftermath(f.surface, current);
  // The pre-repair reader is private. Execute that exact existing function for
  // the retained RED evidence; the repaired module's normal export is used thereafter.
  const source = await readFile(new URL('./pc10-base-combat-deduction-ui-proof.mjs', import.meta.url), 'utf8');
  const legacy = source.match(/  async function renderedMemberAftermath\(surface, view\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(legacy, 'The exact pre-repair private DOM reader is available.');
  const read = Function('baseMemberRowsMatch', `return (${legacy.trim()});`)(baseMemberRowsMatch);
  return read(f.surface, current);
}

test('the inert source DOM reader is exposed for focused native checks', () => {
  assert.equal(typeof proof.renderedBaseMemberAftermath, 'function');
});

test('normal source DOM with uppercase CSS paint proves exact aftermath without folding contact or outcome text', async t => {
  const current = view(), f = await fixture(current); t.after(f.close);
  assert.ok(f.painted().includes('FLEET ALERT // CYCLE 1'));
  assert.ok(f.painted().includes('ATTACK COMPLETE'));
  assert.ok(f.painted().includes('BOARDING'));
  assert.ok(f.painted().includes('LONG-RANGE RANGE'));
  assert.equal(await ready(f, current), true);
});

for (const [name, change] of Object.entries({
  'hidden panel': d => { d.querySelector('section').hidden = true; },
  'missing current cycle': d => d.querySelector('.eyebrow').remove(),
  'wrong current cycle': d => { d.querySelector('.eyebrow').textContent = 'Fleet alert // cycle 11'; },
  'duplicate cycle field': d => d.querySelector('.eyebrow').after(d.querySelector('.eyebrow').cloneNode(true)),
  'hidden phase': d => { d.querySelector('.wolf-attack-status__phase').hidden = true; },
  'wrong phase': d => { d.querySelector('.wolf-attack-status__phase').textContent = 'Targeting'; },
  'arbitrary success copy': d => { d.querySelector('.wolf-attack-status__phase').textContent = 'Success: Attack complete'; },
  'missing deadline': d => d.querySelector('.wolf-attack-status__deadline').remove(),
  'wrong resolution label': d => { d.querySelector('.wolf-attack-status__deadline').firstChild.textContent = 'Current deadline // '; },
  'wrong source deadline': d => { d.querySelector('time').textContent = '2026-10-05T22:27:00Z'; },
  'wrong time attribute': d => d.querySelector('time').setAttribute('datetime', '2026-10-05T22:27:00Z'),
  'hidden result list': d => { d.querySelector('ol').hidden = true; },
  'missing result row': d => d.querySelector('li').remove(),
  'extra result row': d => d.querySelector('li').after(d.querySelector('li').cloneNode(true)),
  'hidden result row': d => { d.querySelector('li').hidden = true; },
  'hidden range field': d => { d.querySelector('strong').hidden = true; },
  'wrong range field': d => { d.querySelector('strong').textContent = 'Short-range range'; },
  'hidden contact field': d => { d.querySelector('li span').hidden = true; },
  'case-changed private/source identifier': d => { d.querySelectorAll('li')[1].querySelector('span').textContent = 'AEGIS-MIXEDCASE → Wolf contact Bravo'; },
  'case-changed contact reference': d => { d.querySelector('li span').textContent = 'wolf-attack-damage → AEGIS MIXEDCASE-Α'; },
  'wrong contact reference': d => { d.querySelector('li span').textContent = 'wolf-attack-damage → DIONE MixedCase-α'; },
  'hidden outcome field': d => { d.querySelector('li span:nth-of-type(2)').hidden = true; },
  'wrong damage outcome': d => { d.querySelector('li span:nth-of-type(2)').textContent = '0 damage // 1000 population lost'; },
  'wrong population outcome': d => { d.querySelector('li span:nth-of-type(2)').textContent = '1 damage // 999 population lost'; },
  'case-changed outcome': d => { d.querySelector('li span:nth-of-type(2)').textContent = '1 DAMAGE // 1000 POPULATION LOST'; },
  'missing commit time': d => d.querySelector('small').remove(),
  'wrong commit time': d => { d.querySelector('small').textContent = 'Committed 2026-10-05T22:26:02Z'; },
  'hidden threat count': d => { d.querySelector('[aria-label="Remaining Wolf threat count"]').hidden = true; },
  'missing threat count': d => d.querySelector('[aria-label="Remaining Wolf threat count"]').remove(),
  'wrong remaining threat count': d => { d.querySelector('[aria-label="Remaining Wolf threat count"]').textContent = '3 remaining hostile ships // 1 returning next attack'; },
  'wrong returning threat count': d => { d.querySelector('[aria-label="Remaining Wolf threat count"]').textContent = '2 remaining hostile ships // 0 returning next attack'; },
})) test(`exact aftermath rejects ${name}`, async t => {
  const current = view(), f = await fixture(current, change); t.after(f.close);
  assert.equal(await ready(f, current), false);
});

test('zero committed results require the visible source pending text rather than an absent result list alone', async t => {
  const current = { ...view(), results: [] }, f = await fixture(current); t.after(f.close);
  assert.equal(await ready(f, current), true);
  f.document.querySelector('.wolf-attack-status__pending').hidden = true;
  assert.equal(await ready(f, current), false);
});

for (const drift of [{ attackId: 'foreign' }, { revision: 24 }, { turn: 2 }, { status: 'declared' }, { currentStep: 'boarding' }])
  test(`exact source aftermath still fences ${JSON.stringify(drift)}`, async t => {
    let time = 0, paints = 0;
    const expected = view(), current = { ...view(), ...drift }, f = await fixture(expected); t.after(f.close);
    await assert.rejects(waitForBaseMemberAftermath({ original, expected, inspect: async () => original,
      read: async () => current, renderedReady: async value => { paints++; return ready(f, value); },
      timeoutMs: 600, now: () => time, wait: async () => { time += 200; } }), /deadline/i);
    assert.equal(paints, 0); assert.equal(time, 600);
  });

test('actor drift during source-driven DOM read cannot accept the otherwise exact uppercase aftermath', async t => {
  const current = view(), f = await fixture(current); t.after(f.close);
  let painted = false;
  await assert.rejects(waitForBaseMemberAftermath({ original, expected: current,
    inspect: async () => ({ ...original, ...(painted ? { uidHash: 'foreign' } : {}) }), read: async () => current,
    renderedReady: async value => { const result = await ready(f, value); painted = true; return result; } }), /uid|original/i);
});

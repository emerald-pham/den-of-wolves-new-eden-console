import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const mockService = `
const evidence = window.pc06KeyboardEvidence = { created: [], calls: [] };
export function createJumpShipAttempt(shipId, destination, options = {}) {
  const attempt = { sessionId: 'local-keyboard', instanceId: 'local', requestId: 'local-' + (evidence.created.length + 1),
    expectedRevision: 0, shipId, destination, ...options };
  evidence.created.push(attempt); return attempt;
}
export function isJumpShipOutcomeUncertain(error) { return error.code === 'functions/unavailable'; }
export async function jumpShip(attempt) {
  evidence.calls.push(attempt);
  if (evidence.calls.length === 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
    throw { code: 'functions/permission-denied', message: 'Local denial fixture.' };
  }
  if (evidence.calls.length === 2) throw { code: 'functions/unavailable', message: 'Local ambiguous fixture.' };
  return { status: 'jumped', shipId: attempt.shipId, origin: '0000', destination: attempt.destination,
    length: 'short', fuelCost: 2, remainingFuel: 2 };
}
`;

test('real Jump Drive completes native keyboard power, denial and exact retry in local transport fixtures', async () => {
  const server = await createServer({ server: {host:'127.0.0.1',port:0}, logLevel:'silent', plugins:[{
    name:'pc06-keyboard-local-service', enforce:'pre',
    resolveId(id) { return id === '@/lib/sessionService' || /\/src\/lib\/sessionService(?:\.ts)?$/.test(id) ? '\0pc06-keyboard-service' : null; },
    load(id) { return id === '\0pc06-keyboard-service' ? mockService : null; },
  }] });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    browser = await chromium.launch({channel:'chrome',headless:true});
    for (const reducedMotion of ['no-preference','reduce']) for (const [width,height] of [[320,844],[390,844],[844,390],[1440,900]]) {
      const page = await browser.newPage({viewport:{width,height},reducedMotion});
      try {
        await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
        await page.goto(`http://127.0.0.1:${address.port}/scripts/pc06-jump-keyboard-review.html`);
        const first = page.getByRole('button',{name:'Increase coordinate digit 1'});
        await first.focus();
        await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
        assert.match(await page.getByLabel('Locked destination coordinates').textContent(), /2000/);
        const rest = ['Decrease coordinate digit 1','Increase coordinate digit 2','Decrease coordinate digit 2',
          'Increase coordinate digit 3','Decrease coordinate digit 3','Increase coordinate digit 4','Decrease coordinate digit 4',
          'Enable blind jump','Lock destination coordinates'];
        for (const name of rest) {
          await page.keyboard.press('Tab');
          assert.ok(await page.getByRole('button',{name,exact:true}).evaluate(element=>element === document.activeElement), `${width}x${height}: ${name} tab order`);
        }
        await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
        const power = page.getByRole('slider',{name:'Jump drive power'});
        assert.ok(await power.evaluate(element=>element === document.activeElement));
        await page.keyboard.press('End');
        assert.equal(await power.inputValue(),'100', 'native range End key reaches full power');
        await page.keyboard.press('Tab');
        const launch = page.getByRole('button',{name:'Jump to 2000',exact:true});
        assert.ok(await launch.isEnabled());
        assert.ok(await launch.evaluate(element=>element === document.activeElement));
        await page.keyboard.press('Enter');
        await page.getByText(/JUMP REQUEST REJECTED/).waitFor();
        assert.ok(await launch.evaluate(element=>element === document.activeElement), 'denial restores launch focus');
        await page.keyboard.press('Enter');
        const retry = page.getByRole('button',{name:'Retry jump confirmation',exact:true});
        await retry.waitFor();
        assert.ok(await retry.evaluate(element=>element === document.activeElement), 'ambiguous result focuses exact retry');
        await page.keyboard.press('Enter');
        await page.getByText(/JUMP COMPLETE.*0000 → 2000/).waitFor();
        const evidence = await page.evaluate(()=>window.pc06KeyboardEvidence);
        assert.equal(evidence.created.length,2);
        assert.equal(evidence.calls.length,3);
        assert.deepEqual(evidence.calls[1],evidence.calls[2]);
        assert.notEqual(evidence.calls[0].requestId,evidence.calls[1].requestId);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
        const offscreen = await page.locator('.jump-drive button, .jump-drive input').evaluateAll(elements=>elements.filter(element=>{
          const rect=element.getBoundingClientRect(); return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth+1);
        }).map(element=>element.getAttribute('aria-label') ?? element.textContent));
        assert.deepEqual(offscreen,[]);
        await page.screenshot({path:`/tmp/pc06-keyboard-${width}x${height}-${reducedMotion}.png`,fullPage:true});
      } finally { await page.close(); }
    }
  } finally { await browser?.close(); await server.close(); }
});

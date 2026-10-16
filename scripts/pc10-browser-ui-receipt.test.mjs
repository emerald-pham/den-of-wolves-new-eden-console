import assert from 'node:assert/strict';
import { test } from 'node:test';

const module = await import('./pc10-browser-ui-receipt.mjs').catch(() => ({}));

test('UI receipt observation arms before the real control can issue its request', async () => {
  assert.equal(typeof module.observeUiReceipt, 'function');
  let armed = false;
  const response = { status: 200 };
  assert.equal(await module.observeUiReceipt({
    waitForResponse: () => { armed = true; return Promise.resolve(response); },
    choose: async () => assert.equal(armed, true),
  }), response);
});

test('a failed UI choice preserves that error while the abandoned response wait stays handled', async () => {
  assert.equal(typeof module.observeUiReceipt, 'function');
  let rejectResponse;
  const choiceFailure = new Error('actual control is unavailable');
  await assert.rejects(module.observeUiReceipt({
    waitForResponse: () => new Promise((_, reject) => { rejectResponse = reject; }),
    choose: async () => { throw choiceFailure; },
  }), error => error === choiceFailure);
  rejectResponse(new Error('response wait subsequently ended'));
  await new Promise(resolve => setImmediate(resolve));
});

test('a response timeout remains a failed gate after a successful control choice', async () => {
  assert.equal(typeof module.observeUiReceipt, 'function');
  const responseFailure = new Error('actual response timed out');
  await assert.rejects(module.observeUiReceipt({
    waitForResponse: () => Promise.reject(responseFailure),
    choose: async () => {},
  }), error => error === responseFailure);
});

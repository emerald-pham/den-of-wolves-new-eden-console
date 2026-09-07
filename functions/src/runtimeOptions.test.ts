import { expect, it } from 'vitest';
import { callableRuntimeOptionsFor } from './runtimeOptions';

it('requires App Check on every deployed callable while retaining the bounded instance cap', () => {
  expect(callableRuntimeOptionsFor({})).toMatchObject({
    region: 'us-central1',
    maxInstances: 10,
    enforceAppCheck: true,
  });
});

it('does not enforce App Check in the Functions Emulator', () => {
  expect(callableRuntimeOptionsFor({ FUNCTIONS_EMULATOR: 'true' })).toMatchObject({
    region: 'us-central1',
    maxInstances: 10,
    enforceAppCheck: false,
  });
});

import { expect, it } from 'vitest';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';

it('requires App Check on every callable while retaining the bounded instance cap', () => {
  expect(CALLABLE_RUNTIME_OPTIONS).toMatchObject({
    region: 'us-central1',
    maxInstances: 10,
    enforceAppCheck: true,
  });
});

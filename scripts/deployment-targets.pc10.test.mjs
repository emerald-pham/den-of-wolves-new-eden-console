import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { pc10TransitionConsumers } from './deployment-targets.mjs';

const digest = source => createHash('sha256').update(source).digest('hex');
const before = 'export const previous = sdkCallable(handler);\n';
const after = 'export const current = namedSdkCallable(handler);\n';
const audited = { modules: { 'functions/src/newSharedAuthority.ts': {
  before: digest(before), after: digest(after), consumers: ['alpha', 'beta'],
} } };

test('PC10 source audits select every named reviewed consumer and retain historical fallthrough', () => {
  assert.deepEqual(pc10TransitionConsumers('functions/src/newSharedAuthority.ts', before, after, audited), ['alpha', 'beta']);
  assert.equal(pc10TransitionConsumers('functions/src/newSharedAuthority.ts', 'older historical source', after, audited), null);
  assert.equal(pc10TransitionConsumers('functions/src/unmapped.ts', before, after, audited), null);
});

test('PC10 source drift cannot retain an earlier reviewed deployment consumer list', () => {
  assert.throws(() => pc10TransitionConsumers('functions/src/newSharedAuthority.ts', before,
    `${after}// material unreviewed drift\n`, audited), /PC10.*exact source consumer audit/i);
});

test('PC10 consumer audits reject broad selectors, pure-helper accidents and duplicate names', () => {
  for (const consumers of [['functions'], ['alpha', 'alpha'], [''], []]) {
    const bad = { modules: { 'functions/src/newSharedAuthority.ts': { ...audited.modules['functions/src/newSharedAuthority.ts'], consumers } } };
    assert.throws(() => pc10TransitionConsumers('functions/src/newSharedAuthority.ts', before, after, bad),
      /invalid.*named.*consumer/i);
  }
});

test('PC10 additions have an audited absent-to-present module transition', () => {
  const added = { modules: { 'functions/src/addedAuthority.ts': {
    before: digest(''), after: digest(after), consumers: ['newGameplayCommand'],
  } } };
  assert.deepEqual(pc10TransitionConsumers('functions/src/addedAuthority.ts', '', after, added), ['newGameplayCommand']);
  assert.throws(() => pc10TransitionConsumers('functions/src/addedAuthority.ts', '', '', added), /PC10.*audit/i);
});

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { deploymentSelector } from './deployment-targets.mjs';

const baseline = '248ba5fe7460dd2708baf4dc152190001ffbdb20';
const sharedParser = 'functions/src/requestGuards.ts';
const pc10Audit = JSON.parse(readFileSync('scripts/pc10-deployment-consumers.json', 'utf8'));
const transitions = [
  {
    name: 'PC10',
    revision: '9073f410ec44199a6ab09920ecd25989d52a3aed',
    consumers: pc10Audit.modules[sharedParser].consumers,
  },
  {
    name: 'mobile GM hotfix',
    revision: '63d8c8b1c444200bbb25dd99e44f07651f670d48',
    consumers: ['claimGmInstance'],
  },
];
const readSource = (revision, file) => execFileSync('git', ['show', `${revision}:${file}`], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
});

for (const transition of transitions) {
  test(`the shared parser retains the exact ${transition.name} deployment audit`, () => {
    const selected = deploymentSelector({
      before: baseline, after: transition.revision, files: [sharedParser], targets: ['functions'],
    }).split(',');
    assert.deepEqual(selected.slice().sort(), [
      'hosting', ...transition.consumers.map(name => `functions:${name}`),
    ].sort());
    assert.equal(new Set(selected).size, selected.length);
    assert.equal(selected.includes('functions'), false);
  });

  test(`the shared parser rejects drift from the ${transition.name} deployment audit`, () => {
    assert.throws(() => deploymentSelector({
      before: baseline, after: 'unreviewed-shared-parser', files: [sharedParser], targets: ['functions'],
      isAncestor: () => false,
      sourceAtRevision: (revision, file) => readSource(revision === baseline ? baseline : transition.revision, file) +
        (revision === baseline ? '' : '\n// unaudited integration drift\n'),
    }), /exact source consumer audit/i);
  });
}

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {classifyChangedFiles, deploymentSelector} from './deployment-targets.mjs';

test('the standalone PC08 review page selects Hosting with no unknown deployment path', () => {
  const result = classifyChangedFiles(['pc08-review.html']);
  assert.deepEqual(result.targets, ['hosting']);
  assert.deepEqual(result.unknownFiles, []);
});

test('every PC08 runtime transition selects its exact consumers and rejects unaudited edits', () => {
  const baseline = 'ebbad230b815e6962e35f303cb529b5612e1d046';
  const inventory = JSON.parse(readFileSync('scripts/pc08-deployment-consumers.json', 'utf8'));
  assert.equal(inventory.baseline, baseline);
  const files = execFileSync('git', ['diff', '--name-only', baseline, 'HEAD', '--', 'functions/src'], {encoding: 'utf8'})
    .trim().split('\n').filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'));
  assert.ok(files.length > 0, 'PC08 must audit its connected server changes');
  const hash = source => createHash('sha256').update(source).digest('hex');
  const current = file => readFileSync(file, 'utf8');
  const previous = file => {
    try {
      return execFileSync('git', ['show', `${baseline}:${file}`], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
      });
    } catch { return ''; }
  };
  for (const file of files) {
    const audit = file === 'functions/src/index.ts' ? inventory.index : inventory.modules[file];
    assert.ok(audit?.consumers.length > 0, `${file}: exact connected consumers are required`);
    assert.equal(audit.before, hash(previous(file)), `${file}: audit baseline source`);
    assert.equal(audit.after, hash(current(file)), `${file}: audit final source`);
    const select = candidate => deploymentSelector({
      before: baseline, after: 'pc08-candidate', files: [file], targets: ['functions'],
      sourceAtRevision: (revision, path) => revision === baseline
        ? previous(path) : path === file ? candidate : current(path),
      isAncestor: () => false,
    });
    assert.deepEqual(select(current(file)).split(',').sort(), ['hosting', ...audit.consumers.map(name => `functions:${name}`)].sort(),
      `${file}: exact bounded deployment`);
    assert.throws(() => select(current(file) + '\n// unaudited runtime mutation\n'), /PC08.*audit/i,
      `${file}: source drift must fail closed`);
  }
  const whole = deploymentSelector({
    before: baseline, after: 'pc08-candidate', files, targets: ['functions'],
    sourceAtRevision: (revision, file) => revision === baseline ? previous(file) : current(file),
    isAncestor: () => false,
  }).split(',');
  const expected = [...new Set(files.flatMap(file => (file === 'functions/src/index.ts'
    ? inventory.index : inventory.modules[file]).consumers))].sort().map(name => `functions:${name}`);
  assert.deepEqual(whole.sort(), ['hosting', ...expected].sort(), 'the reconciled release deploys all audited consumers exactly once with its required Hosting artifact');
  assert.equal(whole.includes('functions'), false, 'there is no broad Functions fallback');
  const native = deploymentSelector({ before: baseline, after: 'HEAD', files, targets: ['functions'] }).split(',');
  assert.deepEqual(native.sort(), ['hosting', ...expected].sort(), 'the real Git source reader audits newly added modules too');
});

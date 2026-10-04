import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {classifyChangedFiles, deploymentSelector} from './deployment-targets.mjs';

test('the PC09 prepared review entry is a Hosting deployment input', () => {
  const result = classifyChangedFiles(['pc09-review.html']);
  assert.deepEqual(result.targets, ['hosting']);
  assert.deepEqual(result.unknownFiles, []);
});

test('PC09 maps every exact runtime transition including re-exported aftermath and transitive damage consumers', () => {
  const baseline = 'b36119e9cdcf43e65bdfc00538b67115b0214ee2';
  const inventory = JSON.parse(readFileSync('scripts/pc09-deployment-consumers.json', 'utf8'));
  assert.equal(inventory.baseline, baseline);
  const files = execFileSync('git', ['diff', '--name-only', baseline, 'HEAD', '--', 'functions/src'], {encoding: 'utf8'})
    .trim().split('\n').filter(file => file.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(file));
  assert.ok(files.length > 0);
  const hash = source => createHash('sha256').update(source).digest('hex');
  const source = (revision, file) => {
    try {return execFileSync('git', ['show', `${revision}:${file}`], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
    });} catch {if (revision === baseline) return ''; throw new Error(`Missing current source ${file}`);}
  };
  assert.ok(inventory.index.consumers.includes('resolveWolfAttackAftermath'), 'A new re-export requires index deployment selection');
  assert.ok(inventory.modules['functions/src/wolfAttackAftermathCallable.ts'].consumers.includes('resolveWolfAttackAftermath'));
  for (const name of ['repairConsolesFromMacaw', 'getCurrentMemberSession', 'runMaintenance']) {
    assert.ok(inventory.modules['functions/src/shipDamage.ts'].consumers.includes(name), `${name}: changed damage dependency must be deployed`);
  }
  for (const file of files) {
    const audit = file === 'functions/src/index.ts' ? inventory.index : inventory.modules[file];
    assert.ok(audit && Array.isArray(audit.consumers), `${file}: exact audit required`);
    assert.equal(new Set(audit.consumers).size, audit.consumers.length);
    assert.equal(audit.before, hash(source(baseline,file)), `${file}: baseline digest`);
    assert.equal(audit.after, hash(source('HEAD',file)), `${file}: candidate digest`);
    const select = current => deploymentSelector({before:baseline,after:'pc09-candidate',files:[file],targets:['functions'],
      sourceAtRevision:(revision,path)=>revision===baseline ? source(baseline,path) : path===file ? current : source('HEAD',path),
      isAncestor:()=>false});
    assert.deepEqual(select(source('HEAD',file)).split(',').sort(), ['hosting',...audit.consumers.map(name=>`functions:${name}`)].sort(),
      `${file}: bounded consumers`);
    assert.throws(()=>select(source('HEAD',file)+'\n// unaudited runtime drift\n'), /PC09.*audit/i,
      `${file}: source drift fails closed`);
  }
  const expected = [...new Set(files.flatMap(file=>(file==='functions/src/index.ts' ? inventory.index : inventory.modules[file]).consumers))]
    .sort().map(name=>`functions:${name}`);
  const native = deploymentSelector({before:baseline,after:'HEAD',files,targets:['functions']}).split(',');
  assert.deepEqual(native.sort(), ['hosting',...expected].sort(), 'Native Git reads include each audited target exactly once');
  assert.equal(native.includes('functions'),false,'No broad Functions fallback');
});

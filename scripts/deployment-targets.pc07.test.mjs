import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {classifyChangedFiles,deploymentSelector} from './deployment-targets.mjs';
// PC07 is a published historical transition. Later checkpoints must exercise
// that exact release source while keeping every consumer and drift assertion.
const PC07_RELEASE = 'd8f56eeea6d536f5e8da15d49b2ca965b38ed3bb';
const releaseSource = file => execFileSync('git', ['show', `${PC07_RELEASE}:${file}`], {
 encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});
test('PC07 solo review is an explicit Hosting entry',()=>{
 const result=classifyChangedFiles(['pc07-review.html']);
 assert.deepEqual(result.targets,['hosting']);assert.deepEqual(result.unknownFiles,[]);
});
test('new briefing authority helper selects both clear and all clock-advance consumers',()=>{
 const file='functions/src/turnInterstitial.ts';
 const source=releaseSource(file);
 const select=current=>deploymentSelector({before:'new-helper-baseline',after:'pc07-candidate',files:[file],targets:['functions'],
  sourceAtRevision:revision=>revision==='new-helper-baseline'?'':current,isAncestor:()=>false});
 const selected=select(source).split(',');
 for(const name of ['clearTurnAdvanceInterstitial','startGame','startSinglePlayerDemo','advanceTurn'])
  assert.ok(selected.includes(`functions:${name}`),`${name} must adopt the held/cleared clock contract`);
 assert.throws(()=>select(source+'\n// unaudited runtime mutation\n'),/audit/i);
});
test('new briefing callable factory selects the real deployed adapter and rejects source drift',()=>{
 const file='functions/src/turnInterstitialCallable.ts';
 const source=releaseSource(file);
 const select=current=>deploymentSelector({before:'new-helper-baseline',after:'pc07-candidate',files:[file],targets:['functions'],
  sourceAtRevision:revision=>revision==='new-helper-baseline'?'':current,isAncestor:()=>false});
 assert.deepEqual(select(source).split(',').filter(target=>target.startsWith('functions:')),['functions:clearTurnAdvanceInterstitial']);
 assert.throws(()=>select(source+'\n// unaudited runtime mutation\n'),/audit/i);
});
test('reconciled PC07 index rejects any change outside the full source consumer audit',()=>{
 const file='functions/src/index.ts',baseline='5e3d09d56a50aa712406a6f3cb6b64a81e70418e';
 const previous=execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8',maxBuffer:16*1024*1024});
 const current=releaseSource(file);
 const select=source=>deploymentSelector({before:baseline,after:'pc07-candidate',files:[file],targets:['functions'],
  sourceAtRevision:revision=>revision===baseline?previous:source,isAncestor:()=>false});
 assert.ok(select(current).includes('functions:clearTurnAdvanceInterstitial'));
 assert.throws(()=>select(current+'\n// unaudited shared-helper mutation\n'),/PC07.*audit/i);
});
test('every changed PC07 runtime module has an exact bounded consumer audit',()=>{
 const baseline='5e3d09d56a50aa712406a6f3cb6b64a81e70418e';
 const files=execFileSync('git',['diff','--name-only',baseline,PC07_RELEASE,'--','functions/src'],{encoding:'utf8'})
  .trim().split('\n').filter(file=>file.endsWith('.ts')&&!file.endsWith('.test.ts'));
 const inventory=JSON.parse(readFileSync('scripts/pc07-deployment-consumers.json','utf8'));
 const read=(_revision,file)=>releaseSource(file);
 const previous=file=>{try{return execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024});}catch{return '';}};
 for(const file of files){
  const audit=file==='functions/src/index.ts'?inventory.index:inventory.modules[file];
  assert.ok(audit?.consumers.length>0,`${file}: exact audited consumers required`);
  const select=current=>deploymentSelector({before:baseline,after:'pc07-candidate',files:[file],targets:['functions'],
   sourceAtRevision:(revision,path)=>revision===baseline?previous(path):path===file?current:read(revision,path),isAncestor:()=>false});
  const selected=select(read('pc07-candidate',file)).split(',').filter(target=>target.startsWith('functions:'));
  assert.deepEqual(selected,[...audit.consumers].sort().map(name=>`functions:${name}`),`${file}: exact consumer coverage`);
  assert.throws(()=>select(read('pc07-candidate',file)+'\n// unaudited module edit\n'),/PC07.*audit/i);
 }
 const whole=deploymentSelector({before:baseline,after:'pc07-candidate',files,targets:['functions'],
  sourceAtRevision:(revision,file)=>revision===baseline?previous(file):read(revision,file),isAncestor:()=>false});
 assert.ok(whole.includes('functions:clearTurnAdvanceInterstitial'));
 assert.equal(whole.split(',').includes('functions'),false,'No broad fallback deployment');
});

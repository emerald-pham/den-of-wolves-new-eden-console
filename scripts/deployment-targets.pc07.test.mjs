import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {classifyChangedFiles,deploymentSelector} from './deployment-targets.mjs';
test('PC07 solo review is an explicit Hosting entry',()=>{
 const result=classifyChangedFiles(['pc07-review.html']);
 assert.deepEqual(result.targets,['hosting']);assert.deepEqual(result.unknownFiles,[]);
});
test('new briefing authority helper selects both clear and all clock-advance consumers',()=>{
 const file='functions/src/turnInterstitial.ts';
 const source=readFileSync(file,'utf8');
 const select=current=>deploymentSelector({before:'new-helper-baseline',after:'pc07-candidate',files:[file],targets:['functions'],
  sourceAtRevision:revision=>revision==='new-helper-baseline'?'':current,isAncestor:()=>false});
 const selected=select(source).split(',');
 for(const name of ['clearTurnAdvanceInterstitial','startGame','startSinglePlayerDemo','advanceTurn'])
  assert.ok(selected.includes(`functions:${name}`),`${name} must adopt the held/cleared clock contract`);
 assert.throws(()=>select(source+'\n// unaudited runtime mutation\n'),/audit/i);
});
test('new briefing callable factory selects the real deployed adapter and rejects source drift',()=>{
 const file='functions/src/turnInterstitialCallable.ts';
 const source=readFileSync(file,'utf8');
 const select=current=>deploymentSelector({before:'new-helper-baseline',after:'pc07-candidate',files:[file],targets:['functions'],
  sourceAtRevision:revision=>revision==='new-helper-baseline'?'':current,isAncestor:()=>false});
 assert.deepEqual(select(source).split(',').filter(target=>target.startsWith('functions:')),['functions:clearTurnAdvanceInterstitial']);
 assert.throws(()=>select(source+'\n// unaudited runtime mutation\n'),/audit/i);
});

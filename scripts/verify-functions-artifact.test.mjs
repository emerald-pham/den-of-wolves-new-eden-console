import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyFunctionsArtifact} from './verify-functions-artifact.mjs';
test('artifact rejects missing or invalid casting core and accepts runtime exports',async()=>{
 const root=await mkdtemp(join(tmpdir(),'casting-artifact-'));try{await mkdir(join(root,'lib'));await writeFile(join(root,'package.json'),JSON.stringify({dependencies:{}}));await writeFile(join(root,'lib/index.js'),'');
 await assert.rejects(verifyFunctionsArtifact(root),/casting.*core/i);
 await writeFile(join(root,'lib/casting-companion-core.cjs'),'module.exports = {};');await assert.rejects(verifyFunctionsArtifact(root),/casting.*exports/i);
 await writeFile(join(root,'lib/casting-companion-core.cjs'),'exports.CastingService = class {}; exports.createSessionCastingGateway = () => {};');await verifyFunctionsArtifact(root);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('CI and deploy verify the generated artifact before upload or cloud authentication',async()=>{
 const {readFile}=await import('node:fs/promises');for(const [path,boundary]of [['../.github/workflows/ci.yml','- name: Upload Functions build artifact'],['../.github/workflows/deploy.yml','- name: Authenticate to Google Cloud']]){const source=await readFile(new URL(path,import.meta.url),'utf8');const verification=source.indexOf('node scripts/verify-functions-artifact.mjs functions');assert.ok(verification>=0&&verification<source.indexOf(boundary));}
});

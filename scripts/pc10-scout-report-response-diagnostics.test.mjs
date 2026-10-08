import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import { originalProofError } from './pc10-proof-failure-evidence.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=await readFile(new URL('./pc10-scout-private-audience-ui-proof.mjs',import.meta.url),'utf8');
const ast=ts.createSourceFile('native.mjs',source,ts.ScriptTarget.Latest,true),callbacks=[];
function visit(node){
 if(ts.isCallExpression(node)&&node.expression.getText(ast)==="page.on"&&node.arguments[0]?.getText(ast)==="'response'")callbacks.push(node.arguments[1]);
 ts.forEachChild(node,visit);
}
visit(ast);assert.equal(callbacks.length,1);
const plain=value=>JSON.parse(JSON.stringify(value));
async function observe({endpoint='readPrivateScoutResult',bodyFailure=false}={}){
 const calls=[],scoutResponseBodies=[],pendingScoutResponses=[],writes=[];let bodyReads=0;
 const callback=vm.runInNewContext(`(${callbacks[0].getText(ast)})`,{
  URL,Date,Promise,assert,label:'browser-B-normal-Scientist',calls,scoutResponseBodies,pendingScoutResponses,
  directory:'/private-test-evidence',hash:value=>createHash('sha256').update(value).digest('hex'),originalProofError,
  writeFile:async(path,text,options)=>writes.push({path,body:JSON.parse(text),options}),
 });
 const body={result:{type:'private-scout-result',sessionId:'owned-session',requestId:'original-scout',
  requesterUid:'own-scientist',sourceId:'endeavour',cycle:1,targetCoordinate:'6798',
  systemFact:{coordinate:'6798',code:'N',title:'Ancient Jump Ring'}}};
 const response={url:()=>`http://127.0.0.1:5011/demo-pc10-owner-integrated-2/us-central1/${endpoint}`,
  status:()=>200,request:()=>({method:()=> 'POST',postDataJSON:()=>({data:{sessionId:'owned-session',requestId:'original-scout'}})}),
  json:async()=>{bodyReads++;if(bodyFailure)throw new Error('Original response-body read failed');return body;}};
 await callback(response);await Promise.allSettled(pendingScoutResponses);
 return{calls:plain(calls),bodies:plain(scoutResponseBodies),writes:plain(writes),bodyReads,expected:body};
}
test('actual report response observer preserves exact HTTP200 body privately alongside transport metadata',async()=>{
 const r=await observe();assert.equal(r.calls.length,1);assert.equal(r.bodyReads,1);
 assert.equal(r.bodies.length,1);assert.deepEqual(r.bodies[0].rawResponse,r.expected);
 assert.equal(r.bodies[0].bodyStatus,'received');assert.equal(r.writes.length,1);
 assert.equal(r.writes[0].options.flag,'wx');assert.equal(r.writes[0].options.mode,0o600);
 assert.deepEqual(r.writes[0].body.rawResponse,r.expected);
 assert.equal(r.bodies[0].requestData.sessionId,'owned-session');
 assert.equal(Object.hasOwn(r.bodies[0],'headers'),false);
});
test('actual report response observer preserves body-read failure instead of inventing successful parse evidence',async()=>{
 const r=await observe({bodyFailure:true});assert.equal(r.bodies.length,1);
 assert.equal(r.bodies[0].bodyStatus,'failed');assert.equal(r.bodies[0].originalError.message,'Original response-body read failed');
 assert.equal(Object.hasOwn(r.bodies[0],'rawResponse'),false);assert.equal(r.writes.length,1);
});
test('normal admission and resume replies are excluded from private scout body diagnostics',async()=>{
 for(const endpoint of ['createSession','joinSession','resumeSession','authorizeLocalGmAccess']){
  const r=await observe({endpoint});assert.equal(r.bodyReads,0);assert.deepEqual(r.bodies,[]);assert.deepEqual(r.writes,[]);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { assertOriginalActor, fingerprint } from './pc10-member-gm-lifecycle-contracts.mjs';

// Finite Source fixtures execute the existing revoke/restoration blocks and the
// unchanged real authority contract. No browser/Auth/SDK/network is launched.
const source = await readFile(new URL('./pc10-two-live-gm-responsibility-proof.mjs', import.meta.url), 'utf8');
const releaseMarker = 'sourceLiveManifestCount: 1 };';
const releaseAssignment = source.indexOf('      evidence.release =');
const releaseDone = source.indexOf(releaseMarker, releaseAssignment);
assert.ok(releaseAssignment > 0 && releaseDone > releaseAssignment);
const begin = releaseDone + releaseMarker.length;
const split = source.indexOf("      stage = 'original controller manager, roster and casting restoration';", begin);
const end = source.indexOf("      failure.guard = 'restored-controller.exact-original-controller-and-gm-routes';", split);
assert.ok(begin > 0 && split > begin && end > split, 'Bind both actual original Source blocks before regressions.');
const revokeBody = source.slice(begin, split), restoreBody = source.slice(split, end);
const account = { sessionId:'synthetic-original-session',uidHash:'synthetic-original-controller',
  hasAuth:true,sameActor:true,connection:'live',freshness:'server',privateAudienceMatches:true,
  foreignPendingCount:0,generation:2,hydrationRevision:1,playerRole:'player',gmInstanceOwned:false,
  instanceId:null,claimedAt:null,profileRoleId:'controller',privatePayloadCount:0,pendingCount:0,
  seatId:null,assignedRoleId:null,activeConsoleRoleId:null,setupRevision:40,gmAccessCached:true };
function deferredError() { return Object.assign(new Error('The original readiness deadline expired.'),{name:'TimeoutError'}); }

function revokeFixture({ openedAt=0, readyAt=0, current={} }={}) {
  let now=0; const released={...account};
  const calls={settings:0,until:[],captures:[],clicks:0,closed:0,extraSdkCalls:0,extraAuthActors:0};
  const value=()=>({...released,...current,connection:now>=readyAt?(current.connection??'live'):'connecting'});
  const context={crew:{}};const failure={guard:'original-preceding-guard',held:{released}};const evidence={};
  const dialog={getByRole(role,options) {assert.equal(role,'button');assert.equal(options.name,'Revoke GM access');assert.equal(options.exact,true);assert.deepEqual(Object.keys(options).sort(),['exact','name']);return {async click(){calls.clicks++;}};}};
  const scope=vm.createContext({assert,hash:fingerprint,Date:{now:()=>now}});
  const invoke=new vm.Script('(async function(context,released,failure,evidence,openLifecycleSettings,untilLifecycle,captureLifecycleUiAction,closeLifecycleSettings) {let dialog,stage;\n'+revokeBody+'\nreturn evidence;})',
    {filename:'actual-original-controller-revoke-block'}).runInContext(scope);
  return {calls,released,failure,evidence,async run(){return invoke(context,released,failure,evidence,
    async surface=>{assert.equal(surface,context.crew);calls.settings++;now=openedAt;return dialog;},
    async (surface,expected,predicate,description,options={})=>{
      calls.until.push({expected,options:{...options},invokedAt:now});assert.equal(surface,context.crew);
      assert.equal(expected.uidHash,released.uidHash);assert.equal(expected.sessionId,released.sessionId);
      const deadline=now+(options.timeout??60_000);
      const immediate=value();
      if (immediate.uidHash!==released.uidHash||immediate.sessionId!==released.sessionId) throw Error('Original actor or session changed.');
      if (readyAt>deadline){now=deadline;throw deferredError();}
      now=Math.max(now,readyAt);const actor=value();
      if(!predicate(actor)||actor.connection!=='live'||actor.freshness!=='server'){now=deadline;throw deferredError();}
      assertOriginalActor(expected,actor,options);return actor;
    },
    async (surface,endpoint,choose,options={})=>{
      const before=value();assertOriginalActor(before,before,{gm:before.gmInstanceOwned});
      assert.equal(surface,context.crew);assert.equal(endpoint,'logoutGmAccess');
      if(options.deadlineAt!==undefined&&options.deadlineAt<=now)throw deferredError();
      calls.captures.push({options:{...options},invokedAt:now});await choose();
      return {httpStatus:200,data:{sessionId:null,instanceId:null},result:{authenticated:false}};
    },async d=>{assert.equal(d,dialog);calls.closed++;});}};
}
function noBypass(fixture){assert.equal(fixture.calls.extraSdkCalls,0);assert.equal(fixture.calls.extraAuthActors,0);}

test('bridge: the actual OLD revoke block preserves the original button, response body and single click',async()=>{
  const f=revokeFixture();await f.run();assert.equal(f.calls.settings,1);assert.equal(f.calls.clicks,1);
  assert.equal(f.calls.closed,1);assert.equal(f.evidence.revoke.authenticated,false);noBypass(f);
});
test('a released original controller becoming live after Settings settles before the same native revoke',async()=>{
  const f=revokeFixture({openedAt:19_000,readyAt:27_000});await f.run();
  assert.equal(f.calls.until.length,1);assert.equal(f.calls.until[0].expected,f.released);
  assert.equal(f.calls.until[0].options.releasedGm,true);assert.equal(f.calls.clicks,1);noBypass(f);
});
test('Settings, live readiness and the native response share the original sixty-second deadline',async()=>{
  const f=revokeFixture({openedAt:19_000,readyAt:27_000});await f.run();
  assert.equal(f.calls.until[0].options.timeout,41_000);
  assert.equal(f.calls.captures[0].options.deadlineAt,60_000);
  assert.equal(f.calls.captures[0].invokedAt,27_000);noBypass(f);
});
test('unsettled live state exhausts the original deadline without a click or response capture',async()=>{
  const f=revokeFixture({openedAt:19_000,readyAt:60_001});await assert.rejects(()=>f.run());
  assert.equal(f.calls.until.length,1);assert.equal(f.calls.clicks,0);assert.equal(f.calls.captures.length,0);noBypass(f);
});
test('Settings cannot consume more than the original deadline and still start a revoke',async()=>{
  const f=revokeFixture({openedAt:60_001});await assert.rejects(()=>f.run());
  assert.equal(f.calls.clicks,0);assert.equal(f.calls.captures.length,0);noBypass(f);
});
for(const [name,current] of [['foreign UID',{uidHash:'synthetic-foreign-controller'}],
  ['foreign session',{sessionId:'synthetic-foreign-session'}],['changed member generation',{generation:3}],
  ['uncleared private payload',{privatePayloadCount:1}]]) {
  test('revoke readiness rejects '+name+' without acting on a substitute authority',async()=>{
    const f=revokeFixture({current});await assert.rejects(()=>f.run());
    assert.equal(f.calls.clicks,0);assert.equal(f.calls.captures.length,0);noBypass(f);
  });
}

function restorationFixture({current={},bridge=false}={}) {
  const controller={...account,generation:1,gmAccessCached:false},released={...account};
  const calls={goto:[],until:[],extraSdkCalls:0,extraAuthActors:0};const context={crew:{page:{async goto(url){calls.goto.push(url);}}}};
  const failure={guard:'preceding-original-guard',held:{released}};const evidence={};
  const scope=vm.createContext({assert});
  const invoke=new vm.Script('(async function(context,controller,released,failure,evidence,savedCrewUrl,revision,untilLifecycle) {let stage;\n'+restoreBody+'\nreturn failure.held.restored;})',
    {filename:'actual-original-controller-manager-restoration-block'}).runInContext(scope);
  return {calls,controller,released,failure,async run(){return invoke(context,controller,released,failure,evidence,
    'http://127.0.0.1:5174/?demoActor=synthetic-original-controller#/demo-actors',37,
    async(surface,expected,predicate,description,options={})=>{
      assert.equal(surface,context.crew);calls.until.push({expected,options:{...options}});
      const generation=bridge?(options.rejoined?expected.generation+1:expected.generation):3;
      const actor={...account,gmAccessCached:false,generation,...current};
      if(!predicate(actor))throw Error('Original restoration predicate not satisfied.');
      assertOriginalActor(expected,actor,options);return actor;
    });}};
}

test('bridge: the actual OLD restoration block navigates once and retains the original account predicate',async()=>{
  const f=restorationFixture({bridge:true});const result=await f.run();
  assert.equal(f.calls.goto.length,1);assert.equal(f.calls.until.length,1);
  assert.equal(result.uidHash,f.controller.uidHash);assert.equal(result.sessionId,f.controller.sessionId);
  assert.equal(result.privatePayloadCount,0);assert.equal(result.gmAccessCached,false);noBypass(f);
});
test('a legitimate manager document reconnect binds the released member and requires a new server generation',async()=>{
  const f=restorationFixture();const result=await f.run();
  assert.equal(result.generation,3);assert.equal(f.calls.until[0].expected,f.released);
  assert.equal(f.calls.until[0].options.rejoined,true);noBypass(f);
});
for(const [name,current] of [['unchanged released generation',{generation:2}],['stale original generation',{generation:1}],
  ['foreign UID',{uidHash:'synthetic-foreign-controller'}],['foreign session',{sessionId:'synthetic-foreign-session'}],
  ['uncleared private payload',{privatePayloadCount:1}],['retained GM access',{gmAccessCached:true}],
  ['another actor profile',{profileRoleId:'admiral'}]]) {
  test('manager restoration rejects '+name+' through the original strict predicate and authority contract',async()=>{
    const f=restorationFixture({current});await assert.rejects(()=>f.run());noBypass(f);
  });
}

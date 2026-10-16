import assert from 'node:assert/strict';
import test from 'node:test';
import * as fixture from './pc07-authenticated-session.mjs';

function timers() {
  let next=0;
  const scheduled=new Map();
  const intervals=[];
  return {scheduled,intervals,
    setInterval:(callback,ms)=>{const id=++next;scheduled.set(id,callback);intervals.push(ms);return id;},
    clearInterval:id=>scheduled.delete(id),
  };
}
function create(options) {
  assert.equal(typeof fixture.createFixtureHeartbeatController,'function',
    'The fixture needs a stop/drain controller before natural disappearance can be proved.');
  return fixture.createFixtureHeartbeatController(options);
}

test('stopping drains GM and player requests and cancels the remaining queued player renewals',async()=>{
  const clock=timers();
  const sent=[];
  let releaseGm,releasePlayer;
  const controller=create({...clock,
    gmTick:async()=>{sent.push('gm');await new Promise(resolve=>{releaseGm=resolve;});},
    playerTick:async running=>{for(const actor of ['player-1','player-2']) {
      if(!running())return;
      sent.push(actor);
      if(actor==='player-1')await new Promise(resolve=>{releasePlayer=resolve;});
    }},
  });
  controller.start();
  const callbacks=[...clock.scheduled.values()];
  for(const callback of callbacks)callback();
  await Promise.resolve();
  assert.deepEqual(sent,['gm','player-1']);
  let drained=false;
  const stopped=controller.stop().then(()=>{drained=true;});
  assert.equal(clock.scheduled.size,0);
  for(const callback of callbacks)callback();
  await Promise.resolve();
  assert.equal(drained,false);
  releaseGm();
  await Promise.resolve();
  assert.equal(drained,false,'Both current transports must drain before stop completes.');
  releasePlayer();
  await stopped;
  assert.equal(drained,true);
  assert.deepEqual(sent,['gm','player-1'],'No actor is renewed after disappearance begins.');
});

test('stop is idempotent and never-started fixtures need no transport or state mutation',async()=>{
  const clock=timers();
  const controller=create({...clock,gmTick:()=>assert.fail('Unexpected GM renewal'),
    playerTick:()=>assert.fail('Unexpected player renewal')});
  const first=controller.stop();
  assert.equal(controller.stop(),first);
  await first;
  assert.equal(clock.scheduled.size,0);
  assert.equal(controller.isRunning(),false);
});

test('normal cadence and one GM/player timer pair can restart after recovery',async()=>{
  const clock=timers();
  const sent=[];
  const controller=create({...clock,gmTick:async()=>sent.push('gm'),playerTick:async()=>sent.push('players')});
  controller.start();controller.start();
  assert.equal(clock.scheduled.size,2);
  assert.deepEqual(clock.intervals,[10000,10000]);
  await controller.stop();
  controller.start();
  for(const callback of clock.scheduled.values())callback();
  await Promise.resolve();
  await controller.stop();
  assert.deepEqual(sent,['gm','players']);
  assert.deepEqual(clock.intervals,[10000,10000,10000,10000]);
});

test('stop reports an actual unfinished transport failure instead of swallowing it',async()=>{
  const clock=timers();
  let fail;
  const controller=create({...clock,gmTick:()=>new Promise((_resolve,reject)=>{fail=reject;}),playerTick:async()=>{}});
  controller.start();
  clock.scheduled.values().next().value();
  await Promise.resolve();
  const stopped=controller.stop();
  fail(new Error('Synthetic local transport failed.'));
  await assert.rejects(stopped,/Synthetic local transport failed/);
  assert.equal(clock.scheduled.size,0);
});

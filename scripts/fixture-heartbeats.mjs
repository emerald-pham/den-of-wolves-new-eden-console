/** Own both synthetic fixture timers so a natural disconnect can stop and drain them. */
export function createFixtureHeartbeatController({gmTick,playerTick,
 setInterval=globalThis.setInterval,clearInterval=globalThis.clearInterval}={}) {
 if(typeof gmTick!=='function'||typeof playerTick!=='function') {
  throw new TypeError('Both fixture heartbeat transports are required.');
 }
 let running=false,generation=0,intervals=[],stopped;
 const pending=new Set();
 function start() {
  if(running)return;
  if(pending.size)throw new Error('Drain fixture heartbeats before restarting them.');
  running=true;stopped=undefined;
  const current=++generation;
  const active=()=>running&&generation===current;
  function queue(tick) {
   if(!active())return;
   const request=Promise.resolve().then(()=>active()?tick(active):undefined);
   pending.add(request);
   // Retain a rejected transport until stop can report it; attach a rejection
   // handler immediately so an idle timer cannot cause an unhandled rejection.
   request.then(()=>pending.delete(request),()=>{});
  }
  intervals=[setInterval(()=>queue(gmTick),10000),setInterval(()=>queue(playerTick),10000)];
 }
 function stop() {
  if(stopped)return stopped;
  running=false;
  for(const interval of intervals)clearInterval(interval);
  intervals=[];
  const requests=[...pending];
  stopped=Promise.allSettled(requests).then(results=>{
   for(const request of requests)pending.delete(request);
   const failure=results.find(result=>result.status==='rejected');
   if(failure)throw failure.reason;
  });
  return stopped;
 }
 async function withCleanupLifetime(work) {
  // A pending SDK/close promise alone does not keep Node alive after the
  // browser and heartbeat handles are gone. This hold sends no renewal and
  // changes no deadline; it exists only until the original cleanup settles.
  const hold=setInterval(()=>{},10000);
  try{return await work();}finally{clearInterval(hold);}
 }
 return {start,stop,isRunning:()=>running,withCleanupLifetime};
}

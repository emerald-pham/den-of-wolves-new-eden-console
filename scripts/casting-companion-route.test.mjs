import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
const config=JSON.parse(await readFile(new URL('../firebase.json',import.meta.url),'utf8'));
test('casting clean URL and routed variants have their own unlisted entry and privacy headers',async()=>{
 const rewrite=config.hosting.rewrites.find(rule=>rule.source==='/casting{,/**}');assert.equal(rewrite?.destination,'/casting/index.html');
 const headers=config.hosting.headers.find(rule=>rule.source==='/casting{,/**}')?.headers??[];
 for(const [key,value] of [['X-Robots-Tag','noindex, nofollow, noarchive'],['Referrer-Policy','no-referrer'],['Cache-Control','no-store']])assert.ok(headers.some(header=>header.key===key&&header.value===value));
 await access(new URL('../casting/index.html',import.meta.url));
});
test('casting navigation bypasses service-worker caching and main-shell fallback',async()=>{
 const handlers={};const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');const context={URL,self:{location:{origin:'https://synthetic.invalid'},addEventListener:(name,run)=>{handlers[name]=run;}},fetch:async()=>({ok:false}),caches:{open:async()=>({match:async()=>undefined}),keys:async()=>[]}};
 vm.runInNewContext(source,context);let intercepted=false;handlers.fetch({request:{method:'GET',url:'https://synthetic.invalid/casting/',mode:'navigate'},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
});

// Exercise the configured Vite middleware consumer in memory: no server/socket/runtime.
async function configuredRouteConsumer(preview=false) {
 const {loadConfigFromFile}=await import('vite');const loaded=await loadConfigFromFile({command:'serve',mode:'development'});assert.ok(loaded);
 const plugin=loaded.config.plugins.flat(Infinity).find(plugin=>plugin?.name==='casting-companion-entry-route');const middleware=[];
 const hook=plugin?.[preview?'configurePreviewServer':'configureServer'];if(hook)await (typeof hook==='function'?hook:hook.handler)({middlewares:{use:fn=>middleware.push(fn)}});
 return async(url,method='GET')=>{const request={url,method},headers={},response={setHeader:(name,value)=>{headers[name.toLowerCase()]=value;}};for(const fn of middleware)await fn(request,response,()=>{});
 // Vite's HTML sender overwrites this header after middleware; emulate that actual consumer.
 response.setHeader('Cache-Control','no-cache');
 const path=request.url.split('?')[0];const html=await readFile(new URL(path==='/casting/index.html'?'../casting/index.html':'../index.html',import.meta.url),'utf8');return{html,url:request.url,headers};};
}
for(const preview of [false,true])test(`actual configured ${preview?'preview':'development'} route serves casting for direct/reload/query/history consumers`,async()=>{
 const route=await configuredRouteConsumer(preview);
 for(const [url,method]of [['/casting','GET'],['/casting/','HEAD'],['/casting?source=direct','GET']]){const result=await route(url,method);assert.equal(result.headers['cache-control'],'no-store');assert.equal(result.headers['referrer-policy'],'no-referrer');assert.equal(result.headers['x-robots-tag'],'noindex, nofollow, noarchive');assert.match(result.html,/id="casting-app"/);assert.match(result.html,/src\/casting\/main\.ts/);assert.equal(result.url,'/casting/index.html'+(url.includes('?')?'?source=direct':''));}
 const {JSDOM}=await import('jsdom');const dom=new JSDOM((await route('/casting')).html,{url:'https://synthetic.invalid/casting'});dom.window.history.pushState(null,'','#form/synthetic');dom.window.history.pushState(null,'','#dossier/synthetic');assert.equal(dom.window.location.pathname,'/casting');assert.equal(dom.window.location.hash,'#dossier/synthetic');assert.match((await route(dom.window.location.pathname)).html,/id="casting-app"/);dom.window.close();
 for(const path of ['/','/casting-other','/casting/private','/src/casting/main.ts','/casting%2f'])assert.equal((await route(path)).url,path);
 assert.equal((await route('/casting','POST')).url,'/casting');
});

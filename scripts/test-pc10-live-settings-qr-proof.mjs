import assert from 'node:assert/strict';
import test from 'node:test';
import * as proof from './pc10-live-settings-qr-proof.mjs';
import {
  assertNormalSettingsJoin, settingsActorRecord, assertOriginalSettingsActor,
  settingsGeometryFailures, settingsTokenFailures, assertStableSettingsBinding,
  assertSettingsReturnUrl,
} from './pc10-live-settings-qr-contracts.mjs';

const joinCode = '012345';
const baseHref = 'http://127.0.0.1:5174/?demoActor=fresh~admiral&demoJoin=012345#/console';
const href = 'http://127.0.0.1:5174/#/?joinCode=012345';
const join = () => ({ baseHref, href, joinCode,
  linkName: `Open join screen for session ${joinCode}`,
  qrName: `QR code for session ${joinCode}`, code: joinCode });
const expected = { sessionId: 'fresh', uidHash: '1234567890abcdef', roleId: 'admiral' };
const actor = () => ({ hasAuth: true, sameActor: true, uidHash: expected.uidHash,
  sessionId: 'fresh', playerRole: 'player', profileRoleId: 'admiral', assignedRoleId: 'admiral',
  connection: 'live', freshness: 'server', cycle: 1, phase: 'active', gmInstanceOwned: false,
  gmAccessAuthenticated: false, briefMatchesActor: true, briefRoleId: 'admiral' });
const rectangle = (left=20, top=20, width=144, height=144) => ({left,top,width,height,right:left+width,bottom:top+height});
const geometry = () => ({ viewport:{width:320,height:844}, documentWidth:320, bodyWidth:320,
  dialog:rectangle(16,4,288,840), qr:rectangle(), qrVisibleAtCenter:true,
  controls:[{name:'Close settings',rect:rectangle(260,20,44,44),visibleAtCenter:true}] });
const mono = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
const tokens = () => ({ mono, radius:'0px', void:'#04070a', ink:'#e4ecee', amber:'#e8892b', cyan:'#46c8de',
  samples:[{name:'Settings title',fontFamily:mono,color:'rgb(232, 137, 43)',expectedColor:'amber',fontSize:16},
    {name:'Join link',fontFamily:mono,color:'rgb(70, 200, 222)',expectedColor:'cyan',fontSize:10.88}] });

function normalNavigationPage(initialRoute='#/ships/icarus') {
  let route=initialRoute,focused=null;
  const events=[],hidden=new Set();
  const present=name=>!hidden.has(name) && (name==='Demo crew' || name==='Current actor' || name==='Settings' ||
    (name==='Back to stations' && route==='#/demo-actors') || (name==='Open private brief' && route==='#/console'));
  const page={url:()=>`http://127.0.0.1:5174/?demoActor=fresh~admiral&demoJoin=012345${route}`,
    getByRole:(_role,{name})=>locator(name),getByLabel:name=>locator(name),
    waitForURL:async predicate=>{
      events.push({action:'waitForURL',route});
      assert.ok(predicate(new URL(page.url())),'Keyboard navigation must reach the actual normal route.');
    },
    goto:async()=>{throw new Error('Direct route bypass is forbidden.');},
  };
  function locator(name) {
    return {isVisible:async()=>present(name),
      focus:async()=>{
        events.push({action:'focus',name});
        if(!present(name))throw new Error(`Normal control unavailable: ${name}`);
        focused=name;
      },
      press:async key=>{
        events.push({action:'press',name,key});
        assert.equal(key,'Enter');assert.equal(focused,name);assert.ok(present(name));
        if(name==='Demo crew')route='#/demo-actors';
        else if(name==='Back to stations')route='#/console';
        else if(name==='Open private brief')route='#/brief';
      }};
  }
  return {page,events,hidden,route:()=>route};
}

test('a real ship-route control topology uses keyboard Demo crew and manager Back before the private brief',async()=>{
  const {page,events,route}=normalNavigationPage();
  const stages=[];
  const brief=await proof.navigateLiveSettingsToConsole({page,
    checkpoint:async()=>assertOriginalSettingsActor(actor(),expected),onStage:value=>stages.push(value)});
  assert.equal(route(),'#/console');
  assert.deepEqual(events.filter(e=>e.action==='press').map(e=>e.name),['Demo crew','Back to stations']);
  assert.deepEqual(events.filter(e=>e.action==='focus').map(e=>e.name),['Demo crew','Back to stations','Open private brief']);
  assert.ok(stages.includes('normalize-demo-crew') && stages.includes('normalize-manager-stations'));
  await brief.press('Enter');assert.equal(route(),'#/brief');
});

test('an already-console actor focuses the ordinary private brief without changing route',async()=>{
  const {page,events,route}=normalNavigationPage('#/console');
  await proof.navigateLiveSettingsToConsole({page,checkpoint:async()=>assertOriginalSettingsActor(actor(),expected)});
  assert.equal(route(),'#/console');
  assert.deepEqual(events,[{action:'focus',name:'Open private brief'}]);
});

test('an already-manager actor uses only its existing keyboard Back to stations',async()=>{
  const {page,events,route}=normalNavigationPage('#/demo-actors');
  await proof.navigateLiveSettingsToConsole({page,checkpoint:async()=>assertOriginalSettingsActor(actor(),expected)});
  assert.equal(route(),'#/console');
  assert.deepEqual(events.filter(e=>e.action==='press').map(e=>e.name),['Back to stations']);
});

test('changed private audience after normal navigation is rejected before the next control is activated',async()=>{
  const {page,events,route}=normalNavigationPage();
  await assert.rejects(proof.navigateLiveSettingsToConsole({page,checkpoint:async()=>
    assertOriginalSettingsActor(route()==='#/demo-actors'?{...actor(),briefRoleId:'doctor'}:actor(),expected)}),/private brief/);
  assert.equal(route(),'#/demo-actors');
  assert.deepEqual(events.filter(e=>e.action==='press').map(e=>e.name),['Demo crew']);
  assert.equal(events.some(e=>e.name==='Back to stations'),false);
});

test('a missing normal ship-route control fails instead of using Back, goto or forced state',async()=>{
  const {page,events,hidden,route}=normalNavigationPage();
  hidden.add('Demo crew');
  await assert.rejects(proof.navigateLiveSettingsToConsole({page,checkpoint:async()=>assertOriginalSettingsActor(actor(),expected)}),/Normal control unavailable: Demo crew/);
  assert.equal(route(),'#/ships/icarus');
  assert.deepEqual(events,[{action:'focus',name:'Demo crew'}]);
});

test('a missing console private-brief control fails without route or actor bypass',async()=>{
  const {page,events,hidden,route}=normalNavigationPage('#/console');
  hidden.add('Open private brief');
  await assert.rejects(proof.navigateLiveSettingsToConsole({page,checkpoint:async()=>assertOriginalSettingsActor(actor(),expected)}),/Normal control unavailable: Open private brief/);
  assert.equal(route(),'#/console');
  assert.deepEqual(events,[{action:'focus',name:'Open private brief'}]);
});

test('pre-restoration failure evidence records route and control booleans without private URL or error values',async()=>{
  const {page}=normalNavigationPage();
  const error=Object.assign(new Error('raw-uid private-loyalty token-value'),{name:'TimeoutError',code:'private-token'});
  const diagnostic=await proof.captureLiveSettingsFailure({page,stage:'normalize-demo-crew',error});
  assert.equal(diagnostic.route,'ship-console');assert.equal(diagnostic.stage,'normalize-demo-crew');
  assert.equal(diagnostic.category,'timeout');
  assert.equal(diagnostic.controls.demoCrew,true);assert.equal(diagnostic.controls.managerBack,false);
  assert.equal(diagnostic.controls.openPrivateBrief,false);
  for(const privateValue of ['raw-uid','private-loyalty','token-value','private-token','fresh~admiral','012345','http://']){
    assert.equal(JSON.stringify(diagnostic).includes(privateValue),false);
  }
});

test('failed diagnostic probes are explicit unavailable values rather than successful control observations',async()=>{
  const page={url:()=>{throw new Error('private URL state');},
    getByRole:()=>({isVisible:async()=>{throw new Error('private control text');}}),
    getByLabel:()=>({isVisible:async()=>{throw new Error('private actor metadata');}})};
  const diagnostic=await proof.captureLiveSettingsFailure({page,stage:{private:'state'},error:{code:'secret'}});
  assert.equal(diagnostic.route,'unknown');assert.equal(diagnostic.stage,'unknown');
  assert.ok(Object.values(diagnostic.controls).every(value=>value===null));
  assert.equal(diagnostic.probeStatus,'unavailable');
  assert.equal(JSON.stringify(diagnostic).includes('secret'),false);
});

test('restoration errors are classified and fail the original restoration gate without exposing cause text',async()=>{
  const evidence={status:'pixels-captured-awaiting-decode'};
  const failure=Object.assign(new Error('private original UID token'),{name:'TimeoutError'});
  const complete=await proof.recordLiveSettingsRestoration({evidence,
    restore:async()=>{throw failure;},stage:()=> 'restore-entry-route'});
  assert.equal(complete,false);assert.equal(evidence.status,'failed');
  assert.equal(evidence.restorationFailure.stage,'restore-entry-route');
  assert.equal(evidence.restorationFailure.category,'timeout');
  assert.equal(evidence.restorationFailure.code,'PC10_SETTINGS_PROOF_FAILED');
  assert.equal(JSON.stringify(evidence).includes('private original UID token'),false);
});

test('successful restoration retains its source and original actor verification without manufacturing failure',async()=>{
  const evidence={status:'pixels-captured-awaiting-decode'};
  const complete=await proof.recordLiveSettingsRestoration({evidence,stage:()=> 'restore-source-binding',restore:async()=>{
    evidence.restoration={sameEntryActor:true,sameEntryRoute:true};
  }});
  assert.equal(complete,true);assert.equal(evidence.status,'pixels-captured-awaiting-decode');
  assert.equal(evidence.restorationFailure,undefined);
  assert.deepEqual(evidence.restoration,{sameEntryActor:true,sameEntryRoute:true});
});

test('normal join payload drops persona context and preserves accessible identical code', () => {
  assert.equal(assertNormalSettingsJoin(join()), href);
  assert.equal(assertNormalSettingsJoin({...join(),baseHref:'https://example.test/console/?demoActor=fresh~admiral#/brief',href:'https://example.test/console/#/?joinCode=012345'}),
    'https://example.test/console/#/?joinCode=012345');
});
test('QR links reject elevated data, duplicate fields, foreign origin/path and wrong code', () => {
  for (const altered of [href+'&gmToken=capability', href+'&joinCode=012345',
    href.replace('/#','/?gmGrant=capability#'), href.replace('127.0.0.1','localhost'),
    href.replace('/#','/gm/#'), href.replace('012345','999999'), href.replace('#/?','#/gm?')]) {
    assert.throws(() => assertNormalSettingsJoin({...join(),href:altered}), /ordinary join/);
  }
});
test('QR alternative text, accessible link and visible code must match exactly', () => {
  for (const patch of [{linkName:'Open GM console'}, {qrName:'Session QR'}, {code:'999999'}, {joinCode:'12345'}]) {
    assert.throws(() => assertNormalSettingsJoin({...join(),...patch}), /join|accessible|code/);
  }
});
test('live ordinary original roster UID is required, including its actual private brief ownership', () => {
  assert.doesNotThrow(() => assertOriginalSettingsActor(actor(), expected));
  for (const patch of [{uidHash:'fedcba0987654321'},{sameActor:false},{hasAuth:false},
    {sessionId:'foreign'},{playerRole:'gm'},{assignedRoleId:'doctor'},{profileRoleId:'doctor'},
    {connection:'connecting'},{freshness:'cache'},{phase:'debrief'}, {gmInstanceOwned:true},
    {gmAccessAuthenticated:true},{briefMatchesActor:false},{briefRoleId:'doctor'}]) {
    assert.throws(() => assertOriginalSettingsActor({...actor(),...patch},expected), /original|ordinary|live|brief/);
  }
});
test('actor evidence allowlists metadata and never copies UID, credentials, hands or GM capabilities', () => {
  const safe = settingsActorRecord({...actor(),uid:'raw-uid',authToken:'secret',gmPassword:'password',
    instanceId:'capability',privateLoyalty:{text:'private'},roleBrief:{text:'private'},pendingCommands:[{token:'secret'}]});
  assert.equal(safe.uidHash, expected.uidHash);
  for (const forbidden of ['uid','authToken','gmPassword','instanceId','privateLoyalty','roleBrief','pendingCommands']) {
    assert.ok(!Object.hasOwn(safe,forbidden));
  }
});
test('malformed nested actor metadata cannot smuggle private values into an allowlisted field', () => {
  assert.throws(() => settingsActorRecord({...actor(),cycle:{token:'secret'}}), /metadata/);
});
test('restoration uses only the same normal persona URL and never an elevated or foreign route', () => {
  assert.equal(assertSettingsReturnUrl(baseHref,expected,joinCode),baseHref);
  for (const url of [baseHref+'&gmToken=secret',baseHref.replace('fresh~admiral','fresh~doctor'),
    baseHref.replace('#/console','#/gm'),baseHref.replace('127.0.0.1','example.test')]) {
    assert.throws(() => assertSettingsReturnUrl(url,expected,joinCode), /normal|original|local/);
  }
});
test('real scrolled Settings may be tall, while QR and current controls fit unobscured', () => {
  const valid = geometry(); valid.dialog = rectangle(16,-300,288,1300);
  assert.deepEqual(settingsGeometryFailures(valid), []);
});
test('40px controls do not pass the 44px contract and evidence contains the measured failure', () => {
  const metrics = geometry(); metrics.controls[0].rect = rectangle(260,20,40,40);
  const failures = settingsGeometryFailures(metrics);
  assert.ok(failures.some(message => message.includes('44px') && message.includes('40')));
});
test('clipped, covered, zero-size and horizontally overflowing actual geometry fails', () => {
  for (const patch of [{qr:rectangle(-1,20)}, {qr:rectangle(20,820)},
    {qr:rectangle(20,20,0,0)}, {qrVisibleAtCenter:false}, {documentWidth:322},
    {bodyWidth:322}, {dialog:rectangle(-2,4,288,840)}]) {
    assert.ok(settingsGeometryFailures({...geometry(),...patch}).length > 0);
  }
});
test('tiny checkbox glyphs require the genuine associated 44px label target', () => {
  const metrics = geometry(); metrics.controls = [{name:'Reduce motion',rect:rectangle(20,20,130,44),visibleAtCenter:true}];
  assert.deepEqual(settingsGeometryFailures(metrics), []);
  metrics.controls[0].rect = rectangle(20,20,13,13);
  assert.ok(settingsGeometryFailures(metrics).length > 0);
});
test('CIC mono, square radius and actual source palette remain strict', () => {
  assert.deepEqual(settingsTokenFailures(tokens()), []);
  for (const patch of [{mono:'Arial'}, {radius:'8px'}, {cyan:'#ffffff'},
    {samples:[{...tokens().samples[0],fontFamily:'Arial'}]},
    {samples:[{...tokens().samples[0],color:'rgb(255, 255, 255)'}]}]) {
    assert.ok(settingsTokenFailures({...tokens(),...patch}).length > 0);
  }
});
test('exact source and full compiled tree must remain stable around the live callback', () => {
  const binding = {sourceCommit:'a'.repeat(40),compiledTreeSha256:'b'.repeat(64),trackedDirty:false};
  assert.doesNotThrow(() => assertStableSettingsBinding(binding,{...binding}));
  for (const patch of [{sourceCommit:'c'.repeat(40)}, {compiledTreeSha256:'d'.repeat(64)}, {trackedDirty:true}]) {
    assert.throws(() => assertStableSettingsBinding(binding,{...binding,...patch}), /source|compiled|dirty/);
  }
});
test('same HEAD cannot hide changed mounted-source or callback bytes', () => {
  const binding={sourceCommit:'a'.repeat(40),compiledTreeSha256:'b'.repeat(64),trackedDirty:false,
    sourceFiles:[{path:'src/index.css',sha256:'c'.repeat(64)}],callbackFiles:[{name:'proof.mjs',sha256:'d'.repeat(64)}]};
  assert.throws(() => assertStableSettingsBinding(binding,{...binding,sourceFiles:[]}), /source/);
  assert.throws(() => assertStableSettingsBinding(binding,{...binding,callbackFiles:[]}), /callback/);
});

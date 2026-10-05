import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNormalSettingsJoin, settingsActorRecord, assertOriginalSettingsActor,
  settingsGeometryFailures, settingsTokenFailures, assertStableSettingsBinding,
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

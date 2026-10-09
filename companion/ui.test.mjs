import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountCasting } from './ui.mjs';
import { createDemoAdapter, createSessionDemoAdapter } from './demo-adapter.mjs';
import { getAllByRole } from '@testing-library/dom';
const schema = { title: 'Synthetic casting', description: 'Fixture only', sections: [{ title: 'Player', questions: [] }] };
function fixture(options = {}) {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://synthetic.invalid/' });
  let saved, shareHandle;
  const adapter = {
    load: async () => ({ definition: schema, revision: 1, responses: [{ id: 'response', revision: 1, handle: shareHandle, answers: { name: 'Synthetic Player' } }], instances: [{ id: 'instance', revision: 1, playerName: 'Synthetic Player', characterName: 'Pilot', details: 'Synthetic secret' }], recipients: [{ id: 'verified-fixture', name: 'Verified synthetic recipient' }] }),
    save: async input => { saved = input; return { revision: 2 }; },
    publish: async () => ({ handle: 'synthetic-form' }),
    assign: async input => { saved = input; shareHandle = 'synthetic-dossier'; return { handle: 'synthetic-dossier' }; },
    dossier: async () => ({ playerName: 'Synthetic Player', characterName: 'Pilot', details: 'Synthetic secret', revision: 1 }),
  };
  const mounted = mountCasting(dom.window.document.querySelector('#app'), { adapter, motionReduced: true, ...options });
  return { dom, document: dom.window.document, saved: () => saved, mounted };
}
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
const button = (document, text) => [...document.querySelectorAll('button')].find(b => b.textContent === text);
function fill(document, label, value) {
  const input = [...document.querySelectorAll('label')].find(l => l.textContent.startsWith(label))?.querySelector('input,textarea,select');
  assert.ok(input, label); input.value = value;
  input.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  input.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
}
test('owner builder edits questions, previews and saves schema through adapter', async () => {
  const f = fixture(); await flush();
  assert.ok(f.document.querySelector('h1').textContent.includes('Casting'));
  button(f.document, 'Form builder').click(); await flush();
  fill(f.document, 'Title', 'Custom casting');
  button(f.document, 'Add question').click();
  fill(f.document, 'Question label', 'Preferred role'); fill(f.document, 'Question type', 'dropdown');
  fill(f.document, 'Choices', 'Pilot\nEngineer');
  button(f.document, 'Preview form').click();
  assert.equal(f.document.querySelector('select[aria-label="Preferred role"]').options.length, 3);
  button(f.document, 'Back to builder').click();
  button(f.document, 'Save draft').click(); await flush();
  assert.equal(f.saved().definition.title, 'Custom casting');
  assert.deepEqual(f.saved().definition.sections[0].questions[0].options, ['Pilot', 'Engineer']);
  assert.equal(f.saved().expectedRevision, 1);
  f.dom.window.close();
});
test('assignment previews exact content and verified recipient before explicit sharing', async () => {
  const f = fixture(); await flush(); button(f.document, 'Responses').click(); await flush();
  button(f.document, 'Assign character').click();
  assert.ok(f.document.body.textContent.includes('Synthetic secret'));
  fill(f.document, 'Recipient', 'verified-fixture');
  button(f.document, 'Publish dossier to recipient').click(); await flush();
  assert.equal(f.saved().expectedInstanceRevision, 1);
  assert.equal(f.saved().recipientId, 'verified-fixture');
  assert.equal(f.saved().responseId, 'response');
  assert.ok(f.document.querySelector('a[href*="synthetic-dossier"]'));
  f.dom.window.close();
});
test('recipient route renders only dossier, handles denial and has visible return', async () => {
  const f = fixture({ route: { name: 'dossier', handle: 'synthetic-dossier' } }); await flush();
  assert.ok(f.document.body.textContent.includes('Synthetic secret'));
  assert.equal(button(f.document, 'Responses'), undefined);
  button(f.document, 'Close dossier').click();
  assert.ok(!f.document.body.textContent.includes('Synthetic secret'));
  f.dom.window.close();
});
test('first visit intro includes all approved flags, skip preserves focus and settings replays', async () => {
  const f = fixture({ introSeen: false, motionReduced: false });
  assert.equal(f.document.querySelectorAll('[data-flag]').length, 7);
  button(f.document, 'Skip intro').click(); await flush();
  assert.equal(f.document.activeElement.tagName, 'H1');
  button(f.document, 'Settings').click(); button(f.document, 'Replay flag intro').click();
  button(f.document, 'Skip intro').click();
  assert.equal(f.document.activeElement.textContent, 'Replay flag intro');
  f.dom.window.close();
});
test('synthetic demo adapter runs builder and recipient snapshots without a backend', async () => {
  const adapter = createDemoAdapter();
  const loaded = await adapter.load();
  const saved = await adapter.save({ definition: { ...loaded.definition, title: 'Edited fixture' }, expectedRevision: loaded.revision, attempt: 'save' });
  const publication = await adapter.publish({ expectedRevision: saved.revision, attempt: 'publish' });
  assert.equal((await adapter.publicForm(publication.handle)).definition.title, 'Edited fixture');
  const instance = loaded.instances[0], response = loaded.responses[0];
  const share = await adapter.assign({ responseId: response.id, instanceId: instance.id, recipientId: loaded.recipients[0].id, expectedResponseRevision: response.revision, expectedInstanceRevision: instance.revision, attempt: 'assign' });
  await adapter.updateInstance({ instanceId: instance.id, expectedRevision: instance.revision, details: { ...instance, details: 'Unpublished edit' }, attempt: 'edit' });
  assert.equal((await adapter.dossier(share.handle)).details, instance.details);
});
test('lost save acknowledgement retries with the same operation identity', async () => {
  const attempts = []; let count = 0;
  const base = createDemoAdapter();
  const adapter = { ...base, save: async payload => { attempts.push(payload.attempt); if (++count === 1) throw new Error('lost acknowledgement'); return { revision: 2 }; } };
  const f = fixture({ adapter }); await flush(); button(f.document, 'Form builder').click();
  button(f.document, 'Save draft').click(); await flush();
  button(f.document, 'Save draft').click(); await flush();
  assert.equal(attempts.length, 2); assert.equal(attempts[0], attempts[1]); f.dom.window.close();
});
test('owner previews explicit snapshot updates and confirms per-response revocation', async () => {
  const adapter = createDemoAdapter(), loaded = await adapter.load();
  const i = loaded.instances[0], r = loaded.responses[0];
  const share = await adapter.assign({ responseId: r.id, instanceId: i.id, recipientId: loaded.recipients[0].id, expectedResponseRevision: 1, expectedInstanceRevision: 1, attempt: 'assign' });
  await adapter.updateInstance({ instanceId: i.id, expectedRevision: 1, details: { ...i, details: 'New draft' }, attempt: 'edit' });
  const f = fixture({ adapter }); await flush(); button(f.document, 'Responses').click();
  button(f.document, 'Preview dossier update').click(); assert.ok(f.document.body.textContent.includes('New draft'));
  button(f.document, 'Publish updated snapshot').click(); await flush();
  assert.equal((await adapter.dossier(share.handle)).details, 'New draft');
  button(f.document, 'Back to responses').click(); button(f.document, 'Revoke recipient access').click();
  assert.ok(f.document.body.textContent.includes('Downloaded copies cannot be recalled'));
  button(f.document, 'Confirm revocation').click(); await flush();
  await assert.rejects(adapter.dossier(share.handle), /unavailable/); f.dom.window.close();
});
test('owner can add character instances with independent names', async () => {
  const adapter = createDemoAdapter(); const f = fixture({ adapter }); await flush(); button(f.document, 'Characters').click();
  fill(f.document, 'New player name', 'Second synthetic player'); fill(f.document, 'New character name', 'Pilot Two'); fill(f.document, 'New character details', 'Second synthetic detail');
  button(f.document, 'Create character instance').click(); await flush();
  const data = await adapter.load(); assert.equal(data.instances.length, 2); assert.equal(data.instances[1].playerName, 'Second synthetic player');
  assert.equal(data.instances[0].playerName, 'Fixture Player'); f.dom.window.close();
});
test('snapshot update preview locks the assigned instance', async () => {
  const adapter = createDemoAdapter(), loaded = await adapter.load(), i = loaded.instances[0], r = loaded.responses[0];
  await adapter.createInstance({ templateId: i.templateId, details: { playerName: 'Other', characterName: 'Other pilot', details: 'Other private content' }, attempt: 'other' });
  await adapter.assign({ responseId: r.id, instanceId: i.id, recipientId: loaded.recipients[0].id, expectedResponseRevision: 1, expectedInstanceRevision: 1, attempt: 'assign' });
  const f = fixture({ adapter }); await flush(); button(f.document, 'Responses').click(); button(f.document, 'Preview dossier update').click();
  assert.equal([...f.document.querySelectorAll('label')].find(l => l.textContent.startsWith('Character instance'))?.querySelector('select'), undefined);
  assert.ok(f.document.body.textContent.includes(i.details)); f.dom.window.close();
});
test('public submission failure preserves answers and stable retry identity', async () => {
  const attempts = []; const adapter = { publicForm: async () => ({ definition: { ...schema, sections: [{ title: 'Player', questions: [{ id: 'name', label: 'Player name', type: 'short', required: true }] }] }, version: 1 }), submit: async payload => { attempts.push(payload.attempt); throw new Error('lost acknowledgement'); } };
  const f = fixture({ adapter, route: { name: 'form', handle: 'synthetic-form' } }); await flush(); fill(f.document, 'Player name', 'Synthetic entered answer');
  f.document.querySelector('form').dispatchEvent(new f.dom.window.Event('submit', { bubbles: true, cancelable: true })); await flush();
  assert.equal(f.document.querySelector('input').value, 'Synthetic entered answer');
  f.document.querySelector('form').dispatchEvent(new f.dom.window.Event('submit', { bubbles: true, cancelable: true })); await flush();
  assert.equal(attempts[0], attempts[1]); f.dom.window.close();
});
test('owner authors a new character template without importing private materials', async () => {
  const adapter = createDemoAdapter(), f = fixture({ adapter }); await flush(); button(f.document, 'Characters').click();
  fill(f.document, 'New template name', 'Synthetic diplomat'); fill(f.document, 'New template details', 'New fixture only');
  button(f.document, 'Create character template').click(); await flush();
  assert.equal((await adapter.load()).templates[1].name, 'Synthetic diplomat'); f.dom.window.close();
});
test('owner export control delivers synthetic CSV through the download boundary', async () => {
  let download; const adapter = { ...createDemoAdapter(), exportResponses: async () => 'response_id\r\nsynthetic\r\n' };
  const f = fixture({ adapter, download: csv => { download = csv; } }); await flush(); button(f.document, 'Responses').click();
  button(f.document, 'Export responses CSV').click(); await flush(); assert.ok(download.includes('synthetic')); f.dom.window.close();
});
test('revoked authority clears private content instead of preserving a stale response', async () => {
  const base = createDemoAdapter(); let calls = 0;
  const adapter = { ...base, load: async () => { if (++calls > 1) throw Object.assign(new Error('denied'), { code: 'permission-denied' }); return base.load(); } };
  const f = fixture({ adapter }); await flush(); button(f.document, 'Responses').click(); assert.ok(f.document.body.textContent.includes('Fixture Player'));
  button(f.document, 'Refresh responses').click(); await flush(); assert.ok(!f.document.body.textContent.includes('Fixture Player')); assert.equal(button(f.document, 'Form builder'), undefined); f.dom.window.close();
});
test('account invalidation prevents a pending private export from downloading', async () => {
  let resolveExport, downloaded = false; const adapter = { ...createDemoAdapter(), exportResponses: () => new Promise(resolve => { resolveExport = resolve; }) };
  const f = fixture({ adapter, download: () => { downloaded = true; } }); await flush(); button(f.document, 'Responses').click(); button(f.document, 'Export responses CSV').click();
  f.mounted.invalidateSession(); resolveExport('synthetic private export'); await flush(); assert.equal(downloaded, false); assert.ok(!f.document.body.textContent.includes('Fixture Player')); f.dom.window.close();
});
test('builder selects have exact accessible labels without including every option', async () => {
  const f = fixture({ adapter: createDemoAdapter() }); await flush(); button(f.document, 'Form builder').click();
  assert.equal(getAllByRole(f.document.body, 'combobox', { name: 'Question type', exact: true }).length, 2); f.dom.window.close();
});

test('casting prerequisites create/select a lobby and require claimed GM before exposing builder', async () => {
 const adapter = createSessionDemoAdapter(); const f = fixture({adapter}); await flush();
 assert.ok(f.document.body.textContent.includes('Choose a DoW session'));
 assert.equal(button(f.document, 'Form builder'), undefined);
 const name = getAllByRole(f.document.body,'textbox',{name:'New lobby name'})[0]; name.value='Synthetic pregame'; name.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
 button(f.document,'Create synthetic lobby').click(); await flush();
 assert.ok(f.document.body.textContent.includes('GM instance required'));
 assert.equal(button(f.document,'Form builder'),undefined);
 button(f.document,'Claim synthetic GM instance').click(); await flush();
 button(f.document,'Use selected session for casting').click(); await flush();
 assert.ok(button(f.document,'Form builder')); assert.equal(adapter.checkpointSessionSynthetic().phase,'lobby');assert.equal(adapter.checkpointSessionSynthetic().currentTurn,0);
 button(f.document,'Settings').click(); assert.ok(f.document.body.textContent.includes('Anyone holding a dossier link can view'));assert.ok(!f.document.body.textContent.includes('require verified sign-in'));f.dom.window.close();
});
test('session-bound GM publishes bearer dossier without a recipient account selector', async () => {
 const adapter=createSessionDemoAdapter();const f=fixture({adapter});await flush();button(f.document,'Use selected session for casting').click();await flush();
 button(f.document,'Responses').click();button(f.document,'Assign character').click();
 assert.ok(!f.document.body.textContent.includes('Select verified recipient'));
 const select=getAllByRole(f.document.body,'combobox',{name:'Character instance'})[0];select.value='synthetic-pilot-1';select.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));
 const publish=button(f.document,'Publish view-only dossier link');assert.ok(publish);assert.equal(publish.disabled,false);publish.click();await flush();
 const href=f.document.querySelector('a[href^="#dossier/"]').getAttribute('href');const published=await adapter.dossier(href.split('/')[1]);assert.equal(published.playerName,'Fixture Player');assert.ok(f.document.body.textContent.includes('Anyone holding this link'));f.dom.window.close();
});
test('reduced-motion gallery is a labelled keyboard-focusable region within the dialog', async () => {
 const f=fixture({motionReduced:true,introSeen:false});await flush();const dialog=f.document.querySelector('[role="dialog"]'), gallery=dialog.querySelector('.casting-intro__flags'), skip=button(f.document,'Skip intro');
 assert.equal(gallery.getAttribute('tabindex'),'0');assert.equal(gallery.getAttribute('aria-hidden'),null);assert.equal(gallery.querySelectorAll('[role="listitem"]').length,7);
 skip.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(f.document.activeElement,gallery);
 gallery.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(f.document.activeElement,skip);f.dom.window.close();
});
test('committed lobby creation followed by failed refresh retains receipt until full action succeeds', async () => {
 const base=createSessionDemoAdapter();let fail=false;const calls=[];const adapter={...base,createSession:async payload=>{calls.push(payload);const result=await base.createSession(payload);fail=calls.length===1;return result;},load:async()=>{if(fail){fail=false;throw new Error('synthetic refresh interrupted');}return base.load();}};
 const f=fixture({adapter});await flush();const name=getAllByRole(f.document.body,'textbox',{name:'New lobby name'})[0];name.value='Retry lobby';name.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
 button(f.document,'Create synthetic lobby').click();await flush();button(f.document,'Create synthetic lobby').click();await flush();assert.equal(calls[0].attempt,calls[1].attempt);assert.equal((await base.load()).prerequisite.sessions.filter(s=>s.name==='Retry lobby').length,1);assert.ok(f.document.body.textContent.includes('GM instance required'));button(f.document,'Create synthetic lobby').click();await flush();assert.notEqual(calls[1].attempt,calls[2].attempt);assert.equal((await base.load()).prerequisite.sessions.filter(s=>s.name==='Retry lobby').length,2);f.dom.window.close();
});
test('session transition preserves heading focus and publication locks all editing controls', async () => {
 const base=createSessionDemoAdapter();let release;const adapter={...base,assign:payload=>new Promise(resolve=>{release=()=>base.assign(payload).then(resolve);})};const f=fixture({adapter});await flush();button(f.document,'Use selected session for casting').click();await flush();assert.equal(f.document.activeElement.tagName,'H1');
 button(f.document,'Responses').click();button(f.document,'Assign character').click();button(f.document,'Publish view-only dossier link').click();await flush();assert.equal(getAllByRole(f.document.body,'combobox',{name:'Character instance'})[0].disabled,true);release();await flush();f.dom.window.close();
});
test('unsaved real workspace cannot publish until its first durable draft exists',async()=>{
 const f=fixture({adapter:{load:async()=>({definition:schema,revision:1,formSaved:false,accessMode:'gm-bearer',responses:[],instances:[],templates:[],recipients:[]}),save:async()=>({revision:1,formSaved:true})}});await flush();button(f.document,'Form builder').click();assert.equal(button(f.document,'Publish form').disabled,true);button(f.document,'Save draft').click();await flush();assert.equal(button(f.document,'Publish form').disabled,false);f.dom.window.close();
});

test('pending owner load disables navigation and failed load offers recovery',async()=>{
 let resolveLoad;const f=fixture({adapter:{load:()=>new Promise(resolve=>{resolveLoad=resolve;})}});await flush();assert.equal(button(f.document,'Form builder').disabled,true);resolveLoad({definition:schema,revision:1,responses:[],instances:[],templates:[]});await flush();assert.equal(button(f.document,'Form builder').disabled,false);f.dom.window.close();
 let calls=0;const g=fixture({adapter:{load:async()=>{if(++calls===1)throw new Error('offline');return {definition:schema,revision:1,responses:[],instances:[],templates:[]};}}});await flush();assert.ok(button(g.document,'Retry connection'));button(g.document,'Retry connection').click();await flush();assert.equal(button(g.document,'Form builder').disabled,false);g.dom.window.close();
});
test('failed GM login uses fresh one-shot attempts and clears password input',async()=>{
 const attempts=[];const f=fixture({adapter:{load:async()=>({prerequisite:{mode:'firebase',sessions:[],gmAccessActive:false}}),loginGmAccess:async payload=>{attempts.push(payload.attempt);throw new Error('offline');}}});await flush();
 for(let i=0;i<2;i++){const input=f.document.querySelector('input[type=password]');input.value='synthetic-password';input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));button(f.document,'Sign in to GM access').click();await flush();assert.equal(f.document.querySelector('input[type=password]').value,'');}
 assert.notEqual(attempts[0],attempts[1]);f.dom.window.close();
});

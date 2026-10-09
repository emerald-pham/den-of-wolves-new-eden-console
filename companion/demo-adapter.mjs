import { responseCsv } from './csv.mjs';
/** Browser-only synthetic fixture. No identity verification, storage, network or backend authorization. */
export function createDemoAdapter({ bearer = false } = {}) {
  const clone = value => structuredClone(value), token = () => btoa(String.fromCharCode(...globalThis.crypto.getRandomValues(new Uint8Array(24)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const state = {
    revision: 1, definition: { title: 'Synthetic fleet casting', description: 'Development fixture — no real responses.', sections: [{ title: 'Player preferences', questions: [{ id: 'name', label: 'Player name', type: 'short', required: true }, { id: 'role', label: 'Preferred role', type: 'dropdown', required: true, options: ['Pilot', 'Engineer', 'Diplomat'] }] }] },
    responses: [{ id: 'synthetic-response', revision: 1, answers: { name: 'Fixture Player', role: 'Pilot' }, instanceId: null, handle: null }],
    templates: [{ id: 'synthetic-pilot-template', name: 'Pilot', details: 'New synthetic character template.' }],
    instances: [{ id: 'synthetic-pilot-1', templateId: 'synthetic-pilot-template', revision: 1, playerName: 'Fixture Player', characterName: 'Pilot One', details: 'Synthetic dossier only. You command a survey craft.' }],
    recipients: [{ id: 'synthetic-verified-recipient', name: 'Verified recipient fixture (not a real identity)' }],
  };
  let publication, version = 0; const shares = new Map(), receipts = new Map();
  const check = (current, expected) => { if (current !== expected) throw new Error('stale revision'); };
  const operation = (name, payload, run) => {
    if (!payload.attempt) throw new Error('retry key required');
    const key = `${name}:${payload.attempt}`, digest = JSON.stringify(payload), old = receipts.get(key);
    if (old) { if (old.digest !== digest) throw new Error('retry conflict'); return clone(old.result); }
    const result = run(); receipts.set(key, { digest, result: clone(result) }); return clone(result);
  };
  const instance = id => { const value = state.instances.find(i => i.id === id); if (!value) throw new Error('unavailable'); return value; };
  const response = id => { const value = state.responses.find(r => r.id === id); if (!value) throw new Error('unavailable'); return value; };
  const snapshot = value => ({ playerName: value.playerName, characterName: value.characterName, details: value.details, revision: value.revision });
  return {
    load: async () => ({ ...clone(state), ...(bearer ? { accessMode: 'gm-bearer', recipients: [] } : {}) }),
    exportResponses: async () => responseCsv(state.responses),
    createTemplate: async payload => operation('createTemplate', payload, () => { const template = { id: token(), name: payload.name, details: payload.details }; state.templates.push(template); return template; }),
    save: async payload => operation('save', payload, () => { check(state.revision, payload.expectedRevision); state.definition = clone(payload.definition); state.revision++; return { revision: state.revision }; }),
    publish: async payload => operation('publish', payload, () => { check(state.revision, payload.expectedRevision); version++; state.revision++; publication = { handle: token(), version, definition: clone(state.definition) }; return { handle: publication.handle, revision: state.revision }; }),
    unpublish: async payload => operation('unpublish', payload, () => { check(state.revision, payload.expectedRevision); publication = undefined; state.revision++; return { revision: state.revision }; }),
    publicForm: async handle => { if (publication?.handle !== handle) throw new Error('unavailable'); return clone({ definition: publication.definition, version: publication.version }); },
    submit: async payload => operation('submit', payload, () => { if (publication?.handle !== payload.handle) throw new Error('unavailable'); check(publication.version, payload.version); for (const q of publication.definition.sections.flatMap(s => s.questions)) if (q.required && (!payload.answers[q.id] || !payload.answers[q.id].length)) throw new Error('required answer'); const entry = { id: token(), revision: 1, answers: clone(payload.answers), instanceId: null, handle: null }; state.responses.push(entry); return { id: entry.id }; }),
    assign: async payload => operation('assign', payload, () => {
      const r = response(payload.responseId), i = instance(payload.instanceId); check(r.revision, payload.expectedResponseRevision); check(i.revision, payload.expectedInstanceRevision);
      if (!bearer && !state.recipients.some(recipient => recipient.id === payload.recipientId)) throw new Error('recipient unavailable');
      if (state.responses.some(other => other.id !== r.id && other.instanceId === i.id && other.handle)) throw new Error('already assigned');
      if (r.handle) shares.delete(r.handle); r.handle = token(); r.instanceId = i.id; r.recipientId = payload.recipientId; r.revision++;
      shares.set(r.handle, snapshot(i)); return { handle: r.handle, revision: r.revision };
    }),
    updateInstance: async payload => operation('updateInstance', payload, () => { const i = instance(payload.instanceId); check(i.revision, payload.expectedRevision); Object.assign(i, snapshot(payload.details)); i.revision = payload.expectedRevision + 1; return { revision: i.revision }; }),
    publishDossierUpdate: async payload => operation('publishDossierUpdate', payload, () => { const r = response(payload.responseId), i = instance(r.instanceId); check(r.revision, payload.expectedResponseRevision); if (r.instanceId !== payload.expectedInstanceId) throw new Error('instance mismatch'); check(i.revision, payload.expectedInstanceRevision); if (!shares.has(r.handle)) throw new Error('unavailable'); shares.set(r.handle, snapshot(i)); r.revision++; return { handle: r.handle, revision: r.revision }; }),
    revoke: async payload => operation('revoke', payload, () => { const r = response(payload.responseId); check(r.revision, payload.expectedResponseRevision); shares.delete(r.handle); r.handle = null; r.revision++; return { revision: r.revision }; }),
    createInstance: async payload => operation('createInstance', payload, () => { if (!state.templates.some(t => t.id === payload.templateId)) throw new Error('template unavailable'); if (state.instances.filter(i => i.templateId === payload.templateId).length >= 3) throw new Error('instance limit'); const i = { id: token(), templateId: payload.templateId, revision: 1, ...payload.details }; state.instances.push(i); return clone(i); }),
    dossier: async handle => { const published = shares.get(handle); if (!published) throw new Error('unavailable'); return clone(published); },
  };
}
/** Hardcoded browser fixture only. No real session creation, GM login, grant or network. */
export function createSessionDemoAdapter() {
 const base = createDemoAdapter({bearer:true}), sessions=[{id:'synthetic-lobby',name:'Synthetic lobby fixture',phase:'lobby',currentTurn:0,gmActive:true}], receipts=new Map(); let bound;
 const copy=value=>structuredClone(value), denied=()=>{throw Object.assign(new Error('synthetic GM authority unavailable'),{code:'permission-denied'});};
 const session=id=>sessions.find(s=>s.id===id);
 const guard=()=>{const current=session(bound);if(!current?.gmActive||current.phase==='closed')denied();return current;};
 const command=(method,payload,run)=>{const key=JSON.stringify([method,payload.attempt]),fingerprint=JSON.stringify(payload);const prior=receipts.get(key);if(prior){if(prior.fingerprint!==fingerprint)throw new Error('retry conflict');return copy(prior.result);}const result=run();receipts.set(key,{fingerprint,result:copy(result)});return copy(result);};
 const adapter={};
 for(const [method,run] of Object.entries(base)) adapter[method]=async (...args)=>{if(!['dossier','publicForm','submit'].includes(method))guard();return run(...args);};
 adapter.load=async()=>bound?{...await base.load(),session:copy(guard())}:{prerequisite:{sessions:copy(sessions)}};
 adapter.createSession=async payload=>command('createSession',payload,()=>{if(!payload.name?.trim()||payload.name.length>80)throw new Error('invalid lobby name');const s={id:globalThis.crypto.randomUUID(),name:payload.name,phase:'lobby',currentTurn:0,gmActive:false};sessions.push(s);return s;});
 adapter.claimSessionGm=async payload=>command('claimSessionGm',payload,()=>{const current=session(payload.sessionId);if(!current||current.phase==='closed')denied();current.gmActive=true;return {id:current.id};});
 adapter.selectSession=async payload=>{const current=session(payload.sessionId);if(!current?.gmActive||current.phase==='closed')denied();if(bound&&bound!==current.id)throw new Error('workspace session cannot change');return command('selectSession',payload,()=>{bound=current.id;return {id:bound};});};
 adapter.checkpointSessionSynthetic=()=>copy(session(bound));
 return adapter;
}

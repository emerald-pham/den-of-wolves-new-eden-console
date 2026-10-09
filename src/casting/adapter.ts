type Payload = Record<string, unknown>;
type Session = { id: string; name: string; phase: string; currentTurn: number; gmActive: boolean; instances: {id:string;name:string}[] };
type Prerequisite = { sessions: Session[]; gmAccessActive: boolean };
type Form = {id:string;definition:Payload;revision:number};
type Workspace = {forms:Form[];responses:unknown[];templates:unknown[];instances:unknown[]};
type Dependencies = { call(name:string,payload:Payload):Promise<unknown>; ensureIdentity():Promise<void>; workspace?:string;instanceId?:string;onBinding?(workspace:string):void };
const empty = { title:'Untitled casting',description:'',sections:[{title:'Player preferences',questions:[]}] };
const denied = () => Object.assign(new Error('Identity changed'),{code:'unauthenticated'});
export function createCastingFirebaseAdapter({call,ensureIdentity,workspace:initialWorkspace='',instanceId:initialInstance='',onBinding}:Dependencies) {
 let epoch=0,workspace=initialWorkspace,instanceId=initialInstance,sessionId='',formId='';let prerequisite:Prerequisite={sessions:[],gmAccessActive:false};
 const check=(generation:number)=>{if(generation!==epoch)throw denied();};
 const transport=async(name:string,payload:Payload,publicRead=false)=>{const generation=epoch;if(!publicRead)await ensureIdentity();check(generation);try{const result=await call(name,payload);check(generation);return result;}catch(error){check(generation);if(error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&error.code.startsWith('functions/'))throw Object.assign(new Error('Callable failed'),{code:error.code.slice(10)});throw error;}};
 const rpc=(operation:string,payload:Payload)=>transport('castingCompanionCommand',{operation,payload,...(instanceId?{instanceId}: {})},operation==='publicForm'||operation==='dossier');
 const loadPrerequisite=async()=>{const generation=epoch;const result=await rpc('prerequisite',{}) as Prerequisite;check(generation);prerequisite=result;const current=result.sessions[0];sessionId=current?.id??'';if(!current?.instances.some(instance=>instance.id===instanceId))instanceId='';prerequisite={...result,sessions:result.sessions.map(session=>({...session,gmActive:session.instances.some(instance=>instance.id===instanceId)}))};return {prerequisite:{...prerequisite,mode:'firebase'}};};
 const mutate=(operation:string,payload:Payload)=>{if(!workspace)throw denied();return rpc(operation,{workspace,...payload});};
 return {
  resetAuthority:async()=>{epoch++;workspace='';instanceId='';sessionId='';formId='';prerequisite={sessions:[],gmAccessActive:false};},
  getAuthority:()=>({sessionId,instanceId}),
  load:async()=>{const generation=epoch;if(!workspace)return loadPrerequisite();if(!instanceId||!sessionId){await loadPrerequisite();check(generation);if(!instanceId)return {prerequisite:{...prerequisite,mode:'firebase'}};}const result=await mutate('workspace',{}) as Workspace;check(generation);const form=result.forms[0];formId=form?.id??'';return {definition:form?.definition??structuredClone(empty),revision:form?.revision??1,formSaved:!!form,accessMode:'gm-bearer',responses:result.responses,templates:result.templates,instances:result.instances,recipients:[]};},
  createSession:async(payload:Payload)=>{const generation=epoch;const result=await transport('createSession',{name:payload.name,displayName:'Casting GM',joinCodeVersion:2,requestId:payload.attempt}) as {session:{id:string}};check(generation);sessionId=result.session.id;instanceId='';return {id:sessionId};},
  joinSession:async(payload:Payload)=>{const generation=epoch;const result=await transport('joinSession',{joinCode:payload.joinCode,displayName:'Casting GM'}) as {session:{id:string}};check(generation);sessionId=result.session.id;instanceId='';return {id:sessionId};},
  loginGmAccess:(payload:Payload)=>transport('loginGmAccess',{password:payload.password}),
  claimSessionGm:async(payload:Payload)=>{const generation=epoch;const current=String(payload.sessionId);const claimId=String(payload.attempt);await transport('claimGmInstance',{sessionId:current,instanceId:claimId,name:'Casting',deviceLabel:'Casting browser'});check(generation);instanceId=claimId;sessionId=current;return {id:current};},
  selectSession:async(payload:Payload)=>{const generation=epoch;const selected=prerequisite.sessions.find(session=>session.id===payload.sessionId);if(!selected?.gmActive||!instanceId||!selected.instances.some(instance=>instance.id===instanceId))throw denied();sessionId=selected.id;const requested=workspace||btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');const result=await rpc('bindWorkspace',{workspace:requested,sessionId,attempt:payload.attempt}) as {workspace:string};check(generation);workspace=result.workspace;onBinding?.(workspace);return {id:workspace};},
  save:async(payload:Payload)=>{const generation=epoch;const result=await mutate(formId?'updateForm':'createForm',formId?{formId,...payload}:{definition:payload.definition,attempt:payload.attempt}) as {id:string;revision:number};check(generation);formId=result.id;return {revision:result.revision,formSaved:true};},
  publish:(payload:Payload)=>{if(!formId)throw Object.assign(new Error('Save first'),{code:'failed-precondition'});return mutate('publish',{formId,...payload});},
  unpublish:(payload:Payload)=>mutate('unpublish',{formId,...payload}),
  publicForm:(handle:string)=>rpc('publicForm',{handle}),
  dossier:(handle:string)=>rpc('dossier',{handle}),
  submit:(payload:Payload)=>rpc('submit',payload),
  exportResponses:()=>mutate('exportResponses',{formId}),
  createTemplate:(payload:Payload)=>mutate('createTemplate',{template:{name:payload.name,details:payload.details},attempt:payload.attempt}),
  createInstance:(payload:Payload)=>mutate('createInstance',payload),
  updateInstance:(payload:Payload)=>mutate('updateInstance',payload),
  assign:(payload:Payload)=>mutate('assign',payload),
  publishDossierUpdate:(payload:Payload)=>mutate('publishDossierUpdate',payload),
  revoke:(payload:Payload)=>mutate('revoke',payload),
  heartbeat:async()=>{if(!sessionId||!instanceId)return;await transport('refreshPresence',{sessionId,instanceId});if(workspace)await mutate('workspace',{});else{const result=await rpc('prerequisite',{}) as Prerequisite;if(!result.gmAccessActive||!result.sessions.some(session=>session.id===sessionId&&session.instances.some(instance=>instance.id===instanceId)))throw Object.assign(new Error('GM authority expired'),{code:'permission-denied'});}},
 };
}

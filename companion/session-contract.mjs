import { createHash } from 'node:crypto';
import { CastingService } from './casting.mjs';
const error = code => Object.assign(new Error(code), { code });
const string = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const descriptors = {
  workspace: ['workspace'], bindWorkspace: ['workspace', 'sessionId', 'attempt'],
  responses: ['workspace', 'formId'], exportResponses: ['workspace', 'formId'],
  createForm: ['workspace', 'definition', 'attempt'],
  updateForm: ['workspace', 'formId', 'expectedRevision', 'definition', 'attempt'],
  publish: ['workspace', 'formId', 'expectedRevision', 'attempt'], unpublish: ['workspace', 'formId', 'expectedRevision', 'attempt'],
  createTemplate: ['workspace', 'template', 'attempt'],
  createInstance: ['workspace', 'templateId', 'details', 'attempt'],
  instance: ['workspace', 'instanceId'],
  updateInstance: ['workspace', 'instanceId', 'expectedRevision', 'details', 'attempt'],
  assign: ['workspace', 'responseId', 'instanceId', 'expectedResponseRevision', 'expectedInstanceRevision', 'attempt'],
  publishDossierUpdate: ['workspace', 'responseId', 'expectedResponseRevision', 'expectedInstanceRevision', 'attempt', 'expectedInstanceId'],
  revoke: ['workspace', 'responseId', 'expectedResponseRevision', 'attempt'],
  dossier: ['handle'], publicForm: ['handle'], submit: ['handle', 'version', 'answers', 'attempt'],
};
const publicOperations = new Set(['publicForm', 'submit', 'dossier']);
function validate(request) {
  try {
    if (Buffer.byteLength(JSON.stringify(request), 'utf8') > 256 * 1024) throw error('invalid-argument');
  } catch { throw error('invalid-argument'); }
  const { operation, payload } = request ?? {};
  if (!Object.hasOwn(descriptors, operation ?? '') || !payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.keys(payload).length !== descriptors[operation].length || descriptors[operation].some(key => !Object.hasOwn(payload, key))) throw error('invalid-argument');
  for (const key of descriptors[operation]) {
    const value = payload[key];
    if (['definition', 'template', 'details', 'answers'].includes(key)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw error('invalid-argument');
    } else if (key.includes('Revision') || key === 'version') {
      if (!Number.isSafeInteger(value) || value < 1) throw error('invalid-argument');
    } else if (!string(value)) throw error('invalid-argument');
  }
  if (operation === 'submit' && !/^[A-Za-z0-9_-]{32,128}$/.test(payload.attempt)) throw error('invalid-argument');
}
const outwardCodes = new Set(['invalid-argument', 'unauthenticated', 'permission-denied', 'failed-precondition', 'not-found', 'aborted', 'resource-exhausted', 'already-exists', 'internal', 'unavailable', 'deadline-exceeded']);
const rejectedIdentityCodes = new Set(['auth/user-disabled', 'auth/id-token-revoked', 'auth/id-token-expired', 'auth/invalid-id-token', 'auth/user-not-found']);
function mappedFailure(failure) {
  if (rejectedIdentityCodes.has(failure?.code)) return error('unauthenticated');
  if (failure?.code) return error(outwardCodes.has(failure.code) ? failure.code : 'internal');
  const message = failure?.message ?? '';
  if (message === 'forbidden') return error('permission-denied');
  if (/stale|instance mismatch/.test(message)) return error('aborted');
  if (/unavailable/.test(message)) return error('not-found');
  if (/limit/.test(message) && !/size/.test(message)) return error('resource-exhausted');
  if (/invalid|size|required|choice|unknown/.test(message)) return error('invalid-argument');
  if (/retry conflict|already assigned/.test(message)) return error('already-exists');
  return error('internal');
}
/** Unconnected provider contract. Context verifiers are trusted server dependencies,
 * never client callbacks. This is not Firebase Auth or a deployed endpoint.
 */
export function createSessionCastingGateway({ store, verifyContext, verifySubmissionAttempt }) {
  return { async handle(request) {
    try {
      validate(request);
      const { operation, payload: p, context } = request;
      const trusted = await verifyContext(context);
      if (trusted?.appVerified !== true) throw error('failed-precondition');
      let actor = null;
      if (!publicOperations.has(operation)) {
        const identity = trusted.identity;
        if (!string(identity?.uid) || identity.verified !== true || identity.disabled) throw error('unauthenticated');
        actor = { uid: identity.uid, workspace: p.workspace, instanceId: trusted.instanceId };
        if (!string(actor.instanceId)) throw error('permission-denied');
        // Current membership before private directory/grant inspection, then rechecked
        // in the mutating store transaction after any asynchronous resolution.
        // Store rechecks current session-bound GM authority within each transaction.
      }
      let args;
      switch (operation) {
        case 'workspace': args = []; break;
        case 'bindWorkspace': args = [p.sessionId, p.attempt]; break;
        case 'responses': case 'exportResponses': args = [p.formId]; break;
        case 'createForm': args = [p.definition, p.attempt]; break;
        case 'updateForm': args = [p.formId, p.expectedRevision, p.definition, p.attempt]; break;
        case 'publish': case 'unpublish': args = [p.formId, p.expectedRevision, p.attempt]; break;
        case 'createTemplate': args = [p.template, p.attempt]; break;
        case 'createInstance': args = [p.templateId, p.details, p.attempt]; break;
        case 'instance': args = [p.instanceId]; break;
        case 'updateInstance': args = [p.instanceId, p.expectedRevision, p.details, p.attempt]; break;
        case 'assign': args = [p.responseId, p.instanceId, p.expectedResponseRevision, p.attempt, p.expectedInstanceRevision]; break;
        case 'publishDossierUpdate': args = [p.responseId, p.expectedResponseRevision, p.expectedInstanceRevision, p.attempt, p.expectedInstanceId]; break;
        case 'revoke': args = [p.responseId, p.expectedResponseRevision, p.attempt]; break;
        case 'publicForm': case 'dossier': args = [p.handle]; break;
        case 'submit': {
          const verified = await verifySubmissionAttempt({ context, handle: p.handle, attempt: p.attempt });
          if (verified?.nonce !== p.attempt || !string(verified.scope)) throw error('invalid-argument');
          const scopedKey = createHash('sha256').update(JSON.stringify([verified.scope, verified.nonce])).digest('hex');
          args = [p.handle, p.version, p.answers, scopedKey]; break;
        }
        default: throw error('invalid-argument');
      }
      return await store.invoke(actor, operation, args);
    } catch (failure) { throw mappedFailure(failure); }
  } };
}

const copy = value => structuredClone(value);
const methods = new Set(Object.keys(descriptors));
const bearerRecipient = 'internal-bearer-snapshot'; // Legacy model storage field; never a participant identity.
/** Synthetic atomic authority model, not Firebase/production authorization. */
export class SessionCastingStore {
  #seed; #tail = Promise.resolve(); #now;
  constructor(seed, { now = Date.now } = {}) { this.#seed = copy(seed); this.#now = now; }
  checkpointSynthetic() { return copy(this.#seed); }
  #transaction(run) { const op = this.#tail.then(run); this.#tail = op.catch(() => {}); return op; }
  changeAuthoritySynthetic(change) { return this.#transaction(() => { const candidate = copy(this.#seed); change(candidate); this.#seed = candidate; }); }
  #session(seed, sessionId) { const session = seed.sessions.find(s => s.id === sessionId); if (!session || session.phase === 'closed' || session.deletingAt) throw error('permission-denied'); return session; }
  #gm(seed, actor, sessionId) {
    const now = this.#now(), session = this.#session(seed, sessionId);
    const validTime = (value, duration) => Number.isFinite(value) && value <= now && now - value < duration;
    const access = seed.gmAccess.find(a => a.uid === actor?.uid);
    const player = session.players.find(p => p.uid === actor?.uid);
    const instance = session.instances.find(i => i.id === actor?.instanceId);
    if (!Number.isFinite(now) || !access || !validTime(access.authenticatedAt, 7 * 86400000) ||
        !player || player.kickedAt != null || player.role !== 'gm' || player.connected !== true || !validTime(player.lastSeenAt, 45000) ||
        !instance || instance.uid !== actor.uid || instance.connected !== true || !validTime(instance.lastSeenAt ?? instance.claimedAt, 45000)) throw error('permission-denied');
  }
  invoke(actor, method, args, { interrupt } = {}) {
    return this.#transaction(() => {
      if (!methods.has(method)) throw error('invalid-argument');
      if (!Array.isArray(args) || Buffer.byteLength(JSON.stringify(args), 'utf8') > 256 * 1024) throw error('invalid-argument');
      const candidate = copy(this.#seed); let result;
      if (method === 'bindWorkspace') {
        const [sessionId, attempt] = args; this.#gm(candidate, actor, sessionId);
        const existing = candidate.bindings.find(b => b.workspace === actor.workspace);
        if (existing && existing.sessionId !== sessionId) throw error('failed-precondition');
        const key = JSON.stringify([actor.uid, actor.workspace, attempt]);
        const prior = candidate.bindingReceipts.find(r => r.key === key);
        if (prior && prior.sessionId !== sessionId) throw error('already-exists');
        if (!existing) candidate.bindings.push({ workspace: actor.workspace, sessionId });
        result = { workspace: actor.workspace, sessionId };
        if (!prior) candidate.bindingReceipts.push({ key, sessionId, result });
      } else {
        let scopedActor = actor;
        if (publicOperations.has(method)) {
          const stateMap = method === 'dossier' ? candidate.state.shares : candidate.state.forms;
          const value = method === 'dossier' ? stateMap.find(([handle]) => handle === args[0])?.[1] : stateMap.find(([, form]) => form.published?.handle === args[0])?.[1];
          const binding = candidate.bindings.find(b => b.workspace === value?.workspace);
          if (!binding || !candidate.sessions.some(s => s.id === binding.sessionId && s.phase !== 'closed' && !s.deletingAt)) throw error('not-found');
          if (method === 'dossier') scopedActor = { uid: bearerRecipient, workspace: value.workspace };
        } else {
          const binding = candidate.bindings.find(b => b.workspace === actor?.workspace);
          if (!binding) throw error('permission-denied'); this.#gm(candidate, actor, binding.sessionId);
        }
        const service = new CastingService({ memberships: actor ? [{ uid: actor.uid, workspace: actor.workspace, role: 'owner' }] : [], state: candidate.state });
        if (method === 'assign') result = service.assign(actor, args[0], args[1], bearerRecipient, args[2], args[3], args[4]);
        else if (method === 'dossier') result = service.dossier(scopedActor, args[0]);
        else result = ['publicForm','submit'].includes(method) ? service[method](...args) : service[method](actor, ...args);
        candidate.state = service.exportSyntheticState();
      }
      if (interrupt === 'beforeCommit') throw error('unavailable'); this.#seed = candidate;
      if (interrupt === 'afterCommit') throw error('unavailable'); return copy(result);
    });
  }
}

import { createHash } from 'node:crypto';
const error = code => Object.assign(new Error(code), { code });
const string = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const descriptors = {
  workspace: ['workspace'],
  responses: ['workspace', 'formId'], exportResponses: ['workspace', 'formId'],
  createForm: ['workspace', 'definition', 'attempt'],
  updateForm: ['workspace', 'formId', 'expectedRevision', 'definition', 'attempt'],
  publish: ['workspace', 'formId', 'expectedRevision', 'attempt'], unpublish: ['workspace', 'formId', 'expectedRevision', 'attempt'],
  createTemplate: ['workspace', 'template', 'attempt'],
  createInstance: ['workspace', 'templateId', 'details', 'attempt'],
  instance: ['workspace', 'instanceId'],
  updateInstance: ['workspace', 'instanceId', 'expectedRevision', 'details', 'attempt'],
  assign: ['workspace', 'responseId', 'instanceId', 'recipientId', 'expectedResponseRevision', 'expectedInstanceRevision', 'attempt'],
  publishDossierUpdate: ['workspace', 'responseId', 'expectedResponseRevision', 'expectedInstanceRevision', 'attempt', 'expectedInstanceId'],
  revoke: ['workspace', 'responseId', 'expectedResponseRevision', 'attempt'],
  dossier: ['workspace', 'handle'], publicForm: ['handle'], submit: ['handle', 'version', 'answers', 'attempt'],
};
const publicOperations = new Set(['publicForm', 'submit']);
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
export function createCastingGateway({ store, verifyContext, resolveRecipient, verifySubmissionAttempt }) {
  return { async handle(request) {
    try {
      validate(request);
      const { operation, payload: p, context } = request;
      const trusted = await verifyContext(context);
      if (!trusted?.appVerified) throw error('failed-precondition');
      let actor = null;
      if (!publicOperations.has(operation)) {
        const identity = trusted.identity;
        if (!string(identity?.uid) || identity.durable !== true || identity.verified !== true || identity.disabled) throw error('unauthenticated');
        actor = { uid: identity.uid, workspace: p.workspace };
        // Current membership before private directory/grant inspection, then rechecked
        // in the mutating store transaction after any asynchronous resolution.
        if (operation !== 'dossier') await store.invoke(actor, 'workspace', []);
      }
      let args;
      switch (operation) {
        case 'workspace': args = []; break;
        case 'responses': case 'exportResponses': args = [p.formId]; break;
        case 'createForm': args = [p.definition, p.attempt]; break;
        case 'updateForm': args = [p.formId, p.expectedRevision, p.definition, p.attempt]; break;
        case 'publish': case 'unpublish': args = [p.formId, p.expectedRevision, p.attempt]; break;
        case 'createTemplate': args = [p.template, p.attempt]; break;
        case 'createInstance': args = [p.templateId, p.details, p.attempt]; break;
        case 'instance': args = [p.instanceId]; break;
        case 'updateInstance': args = [p.instanceId, p.expectedRevision, p.details, p.attempt]; break;
        case 'assign': {
          const uid = await resolveRecipient(p.workspace, p.recipientId);
          if (!string(uid)) throw error('not-found');
          args = [p.responseId, p.instanceId, uid, p.expectedResponseRevision, p.attempt, p.expectedInstanceRevision]; break;
        }
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

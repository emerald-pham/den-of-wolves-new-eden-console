import { CastingService } from './casting.mjs';
const methods = new Set(['workspace', 'exportResponses', 'createForm', 'updateForm', 'publish', 'unpublish', 'publicForm', 'submit', 'responses', 'createTemplate', 'createInstance', 'instance', 'updateInstance', 'assign', 'publishDossierUpdate', 'revoke', 'dossier']);
const publicMethods = new Set(['publicForm', 'submit']);
/** Serializable fake transaction store. Synthetic fixtures only; no database or Auth. */
export class SyntheticStore {
  #seed; #tail = Promise.resolve();
  constructor(seed) { this.#seed = structuredClone(seed); }
  #transaction(run) {
    const operation = this.#tail.then(() => run());
    this.#tail = operation.catch(() => {}); return operation;
  }
  checkpointSynthetic() { return structuredClone(this.#seed); }
  invoke(actor, method, args, { interrupt } = {}) {
    return this.#transaction(() => {
      if (!methods.has(method)) throw new Error('unsupported method');
      if (!Array.isArray(args) || Buffer.byteLength(JSON.stringify(args), 'utf8') > 256 * 1024) throw new Error('aggregate size limit');
      const candidate = structuredClone(this.#seed);
      const service = new CastingService({ memberships: candidate.memberships, state: candidate.state });
      if (!publicMethods.has(method) && method !== 'dossier') service.workspace(actor);
      const eligible = uid => candidate.directory.some(r => r.workspace === actor?.workspace && r.uid === uid && r.eligible);
      if (method === 'assign' && !eligible(args[2])) throw new Error('recipient unavailable');
      if (method === 'dossier' && !eligible(actor?.uid)) throw new Error('unavailable');
      if (method === 'publishDossierUpdate') {
        const response = candidate.state.responses.find(([, r]) => r.id === args[0])?.[1];
        const grant = candidate.state.shares.find(([handle]) => handle === response?.handle)?.[1];
        if (!grant || !eligible(grant.recipientUid)) throw new Error('recipient unavailable');
      }
      const result = publicMethods.has(method) ? service[method](...args) : service[method](actor, ...args);
      candidate.state = service.exportSyntheticState();
      if (interrupt === 'beforeCommit') throw new Error('interrupted before commit');
      this.#seed = candidate;
      if (interrupt === 'afterCommit') throw new Error('lost acknowledgement after commit');
      return result;
    });
  }
  removeOwnerSynthetic(actor) {
    return this.#transaction(() => { this.#seed.memberships = this.#seed.memberships.filter(m => m.uid !== actor.uid || m.workspace !== actor.workspace); });
  }
  removeRecipientSynthetic(actor, uid) {
    return this.#transaction(() => {
      const candidate = structuredClone(this.#seed);
      new CastingService({ memberships: candidate.memberships, state: candidate.state }).workspace(actor);
      candidate.directory = candidate.directory.map(r => r.workspace === actor.workspace && r.uid === uid ? { ...r, eligible: false } : r);
      const removed = new Set(candidate.state.shares.filter(([, g]) => g.workspace === actor.workspace && g.recipientUid === uid).map(([handle]) => handle));
      candidate.state.shares = candidate.state.shares.filter(([handle]) => !removed.has(handle));
      candidate.state.responses = candidate.state.responses.map(([key, response]) => [key, removed.has(response.handle) ? { ...response, handle: null, revision: response.revision + 1 } : response]);
      this.#seed = candidate;
    });
  }
}

import { responseCsv } from './csv.mjs';
import { randomBytes, createHash } from 'node:crypto';

const copy = value => structuredClone(value);
const fail = message => { throw new Error(message); };
const bound = value => { if (Buffer.byteLength(canonical(value), 'utf8') > 256 * 1024) fail('aggregate size limit'); };
const id = () => randomBytes(24).toString('base64url');
const text = (value, max = 10000) => typeof value === 'string' && value.length <= max;
const canonical = value => JSON.stringify(value, function(key, item) {
  if (item && typeof item === 'object' && !Array.isArray(item))
    return Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]]));
  return item;
});
function definition(input) {
  if (!input || !text(input.title, 200) || !input.title.trim() || !text(input.description) ||
      !Array.isArray(input.sections) || input.sections.length > 30) fail('invalid definition');
  const seen = new Set();
  const sections = input.sections.map(section => {
    if (!text(section.title, 200) || !Array.isArray(section.questions) || section.questions.length > 50) fail('invalid section');
    return { title: section.title, questions: section.questions.map(q => {
      if (!text(q.id, 100) || !q.id || seen.has(q.id) || !text(q.label, 500) ||
          !['short', 'long', 'single', 'multiple', 'dropdown', 'link'].includes(q.type) || typeof q.required !== 'boolean') fail('invalid question');
      seen.add(q.id);
      const result = { id: q.id, label: q.label, type: q.type, required: q.required };
      if (['single', 'multiple', 'dropdown'].includes(q.type)) {
        if (!Array.isArray(q.options) || !q.options.length || q.options.length > 100 ||
            q.options.some(v => !text(v, 500) || !v.trim()) || new Set(q.options).size !== q.options.length) fail('invalid choices');
        result.options = [...q.options];
      }
      return result;
    }) };
  });
  return { title: input.title, description: input.description, sections };
}
function validateAnswers(schema, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid answers');
  const result = Object.create(null), questions = schema.sections.flatMap(s => s.questions);
  if (Object.keys(input).some(key => !questions.some(q => q.id === key))) fail('unknown answer');
  for (const q of questions) {
    const value = input[q.id];
    const empty = value === undefined || value === '' || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length);
    if (empty) { if (q.required) fail('required answer'); continue; }
    if (q.type === 'multiple') {
      if (!Array.isArray(value) || value.length > q.options.length || new Set(value).size !== value.length || value.some(v => !q.options.includes(v))) fail('invalid choice');
    } else {
      if (!text(value, q.type === 'long' ? 10000 : 1000)) fail('invalid text');
      if (q.options && !q.options.includes(value)) fail('invalid choice');
      if (q.type === 'link') {
        let url; try { url = new URL(value); } catch { fail('invalid link'); }
        if (url.protocol !== 'https:' || url.username || url.password) fail('invalid link');
      }
    }
    result[q.id] = copy(value);
  }
  return result;
}
function details(input) {
  if (!input || !text(input.playerName, 200) || !input.playerName.trim() ||
      !text(input.characterName, 200) || !input.characterName.trim() || !text(input.details, 50000)) fail('invalid dossier');
  return { playerName: input.playerName, characterName: input.characterName, details: input.details };
}

/** Synthetic synchronous contract model, NOT a production authorization backend.
 * Actors/memberships must eventually come from verified server identity. No IO.
 */
export class CastingService {
  #memberships; #forms = new Map(); #responses = new Map(); #templates = new Map();
  #instances = new Map(); #shares = new Map(); #receipts = new Map();
  constructor({ memberships, state }) {
    this.#memberships = copy(memberships);
    if (state) {
      if (state.format !== 1) fail('invalid synthetic state');
      const maps = ['forms', 'responses', 'templates', 'instances', 'shares', 'receipts'].map(name => new Map(copy(state[name])));
      [this.#forms, this.#responses, this.#templates, this.#instances, this.#shares, this.#receipts] = maps;
    }
  }
  // Trusted test adapter boundary only. Contains private synthetic data; never expose via transport.
  exportSyntheticState() {
    return copy({ format: 1, forms: [...this.#forms], responses: [...this.#responses], templates: [...this.#templates],
      instances: [...this.#instances], shares: [...this.#shares], receipts: [...this.#receipts] });
  }
  #owner(actor) {
    if (!actor?.uid || !actor.workspace || !this.#memberships.some(m => m.uid === actor.uid && m.workspace === actor.workspace && m.role === 'owner')) fail('forbidden');
  }
  #owned(actor, map, key) {
    this.#owner(actor); const value = map.get(key);
    if (!value || value.workspace !== actor.workspace) fail('forbidden');
    return value;
  }
  #revision(value, expected) { if (value.revision !== expected) fail('stale revision'); }
  #operation(scope, operation, key, payload, run) {
    if (!text(key, 200) || !key) fail('invalid retry key');
    const receiptKey = canonical([scope, operation, key]);
    bound(payload);
    const digest = createHash('sha256').update(canonical(payload)).digest('hex');
    const previous = this.#receipts.get(receiptKey);
    if (previous) { if (previous.digest !== digest) fail('retry conflict'); return copy(previous.result); }
    const result = run(); this.#receipts.set(receiptKey, { digest, result: copy(result) }); return copy(result);
  }
  #mutate(actor, operation, key, payload, run) {
    this.#owner(actor); return this.#operation([actor.workspace, actor.uid], operation, key, payload, run);
  }
  workspace(actor) {
    this.#owner(actor);
    return copy({ forms: [...this.#forms.values()].filter(f => f.workspace === actor.workspace),
      responses: [...this.#responses.values()].filter(r => r.workspace === actor.workspace),
      templates: [...this.#templates.values()].filter(t => t.workspace === actor.workspace),
      instances: [...this.#instances.values()].filter(i => i.workspace === actor.workspace) });
  }
  createForm(actor, input, key) {
    return this.#mutate(actor, 'createForm', key, input, () => {
      const form = { id: id(), workspace: actor.workspace, revision: 1, version: 0, definition: definition(input), published: null };
      this.#forms.set(form.id, form); return form;
    });
  }
  updateForm(actor, formId, expected, input, key) {
    return this.#mutate(actor, 'updateForm', key, [formId, expected, input], () => {
      const form = this.#owned(actor, this.#forms, formId); this.#revision(form, expected);
      const parsed = definition(input); form.definition = parsed; form.revision++; return form;
    });
  }
  publish(actor, formId, expected, key) {
    return this.#mutate(actor, 'publish', key, [formId, expected], () => {
      const form = this.#owned(actor, this.#forms, formId); this.#revision(form, expected);
      form.version++; form.revision++; form.published = { handle: id(), version: form.version, definition: copy(form.definition) };
      return { handle: form.published.handle, version: form.version, revision: form.revision };
    });
  }
  unpublish(actor, formId, expected, key) {
    return this.#mutate(actor, 'unpublish', key, [formId, expected], () => {
      const form = this.#owned(actor, this.#forms, formId); this.#revision(form, expected);
      form.published = null; form.revision++; return { revision: form.revision };
    });
  }
  #published(handle) {
    const form = [...this.#forms.values()].find(f => f.published?.handle === handle);
    if (!form) fail('unavailable'); return form;
  }
  publicForm(handle) {
    const { published } = this.#published(handle); return copy({ definition: published.definition, version: published.version });
  }
  submit(handle, version, input, key) {
    const form = this.#published(handle);
    if (version !== form.published.version) fail('stale publication');
    const answers = validateAnswers(form.published.definition, input);
    return this.#operation(['submission', handle], 'submit', key, [version, answers], () => {
      const response = { id: id(), workspace: form.workspace, formId: form.id, version, answers,
        definition: copy(form.published.definition), revision: 1, instanceId: null, handle: null };
      bound(response);
      this.#responses.set(response.id, response);
      return { id: response.id, version }; // receipt only, no private assignment or answer data
    });
  }
  responses(actor, formId) {
    this.#owned(actor, this.#forms, formId);
    return copy([...this.#responses.values()].filter(r => r.formId === formId));
  }
  exportResponses(actor, formId) { return responseCsv(this.responses(actor, formId)); }
  createTemplate(actor, input, key) {
    return this.#mutate(actor, 'createTemplate', key, input, () => {
      if (!input || !text(input.name, 200) || !input.name.trim() || !text(input.details, 50000)) fail('invalid template');
      const template = { id: id(), workspace: actor.workspace, name: input.name, details: input.details };
      this.#templates.set(template.id, template); return template;
    });
  }
  createInstance(actor, templateId, input, key) {
    return this.#mutate(actor, 'createInstance', key, [templateId, input], () => {
      this.#owned(actor, this.#templates, templateId); const parsed = details(input);
      if ([...this.#instances.values()].filter(i => i.templateId === templateId && i.workspace === actor.workspace).length >= 3) fail('instance limit');
      const instance = { id: id(), workspace: actor.workspace, templateId, revision: 1, ...parsed };
      this.#instances.set(instance.id, instance); return instance;
    });
  }
  instance(actor, instanceId) { return copy(this.#owned(actor, this.#instances, instanceId)); }
  updateInstance(actor, instanceId, expected, input, key) {
    return this.#mutate(actor, 'updateInstance', key, [instanceId, expected, input], () => {
      const instance = this.#owned(actor, this.#instances, instanceId); this.#revision(instance, expected);
      const parsed = details(input); Object.assign(instance, parsed); instance.revision++; return instance;
    });
  }
  assign(actor, responseId, instanceId, recipientUid, expected, key, expectedInstanceRevision) {
    return this.#mutate(actor, 'assign', key, [responseId, instanceId, recipientUid, expected, expectedInstanceRevision], () => {
      const response = this.#owned(actor, this.#responses, responseId);
      const instance = this.#owned(actor, this.#instances, instanceId); this.#revision(response, expected);
      this.#revision(instance, expectedInstanceRevision);
      if (!text(recipientUid, 128) || !recipientUid.trim()) fail('invalid recipient');
      // One active assignment per instance; explicit detach/revoke before reuse.
      if ([...this.#responses.values()].some(r => r.id !== responseId && r.handle && r.instanceId === instanceId)) fail('instance already assigned');
      if (response.handle) this.#shares.delete(response.handle);
      response.handle = id(); response.instanceId = instanceId; response.revision++;
      this.#shares.set(response.handle, { workspace: actor.workspace, recipientUid, instanceId, snapshot: { playerName: instance.playerName, characterName: instance.characterName, details: instance.details, revision: instance.revision } });
      return { handle: response.handle, revision: response.revision };
    });
  }
  publishDossierUpdate(actor, responseId, expected, expectedInstanceRevision, key, expectedInstanceId) {
    return this.#mutate(actor, 'publishDossierUpdate', key, [responseId, expected, expectedInstanceRevision, expectedInstanceId], () => {
      const response = this.#owned(actor, this.#responses, responseId); this.#revision(response, expected);
      if (response.instanceId !== expectedInstanceId) fail('instance mismatch');
      const grant = this.#shares.get(response.handle); if (!grant) fail('unavailable');
      const instance = this.#owned(actor, this.#instances, response.instanceId); this.#revision(instance, expectedInstanceRevision);
      grant.snapshot = { playerName: instance.playerName, characterName: instance.characterName, details: instance.details, revision: instance.revision };
      response.revision++; return { handle: response.handle, revision: response.revision };
    });
  }
  revoke(actor, responseId, expected, key) {
    return this.#mutate(actor, 'revoke', key, [responseId, expected], () => {
      const response = this.#owned(actor, this.#responses, responseId); this.#revision(response, expected);
      if (response.handle) this.#shares.delete(response.handle);
      response.handle = null; response.revision++; return { revision: response.revision };
    });
  }
  dossier(actor, handle) {
    const grant = this.#shares.get(handle);
    if (!grant || grant.recipientUid !== actor?.uid || grant.workspace !== actor?.workspace) fail('unavailable');
    return copy(grant.snapshot);
  }
}

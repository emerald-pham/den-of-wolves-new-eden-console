import { createHash, randomUUID } from 'node:crypto';

const PREFIX = 'PC10_PRIVATE_SDK_PHASE:';
const PHASES = Object.freeze(['callback-entry', 'first-import-complete', 'second-import-complete',
  'getDoc-invoked', 'originally-settled']);
const hash = (kind, value) => createHash('sha256').update(`pc10-private-sdk-${kind}\0${value}`).digest('hex');
const documentHash = value => createHash('sha256').update(`pc10-native-durable-document\0${value}`).digest('hex');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const time = value => Number.isSafeInteger(value) && value >= 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected) => record(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const safeCode = value => typeof value === 'string' && /^(?:firestore\/)?(?:permission-denied|unavailable|deadline-exceeded|cancelled|internal|failed-precondition|not-found|unauthenticated|resource-exhausted|aborted|invalid-argument)$/.test(value) ? value : null;

/** This exact callback runs in the original page.evaluate. Both imports stay
 * outside the original SDK catch. The echo is scalar provenance, never a body
 * replacement, Auth observation, or a second SDK operation. */
export async function readPc10PrivateSdkInPage({ moduleUrl, sessionId, suffix, invocationId }) {
  const documentId = invocationId ? globalThis[Symbol.for('pc10-proof-native-durable-document')] : null;
  const phases = [];
  const note = phase => {
    if (!invocationId) return;
    const event = { ordinal: phases.length, phase, browserAt: Date.now() };
    phases.push(event);
    try { console.debug(`PC10_PRIVATE_SDK_PHASE:${JSON.stringify({ schemaVersion: 1, invocationId, documentId, ...event })}`); }
    catch { /* A console failure cannot suppress or replace the original SDK operation. */ }
  };
  note('callback-entry');
  const { db } = await import('/src/lib/firestore.ts');
  note('first-import-complete');
  const { doc, getDocFromServer } = await import(moduleUrl);
  note('second-import-complete');
  let originalReply;
  try {
    const operation = getDocFromServer(doc(db(), `sessions/${sessionId}/${suffix}`));
    note('getDoc-invoked');
    const reply = await operation;
    originalReply = { status: 'read', exists: reply.exists() };
  } catch (error) { originalReply = { status: 'denied', code: error.code }; }
  note('originally-settled');
  return invocationId ? { originalReply, phaseWitness: { schemaVersion: 1, invocationId, documentId, phases } } : originalReply;
}

/** At most five scalar console notes per original dispatch. Pending notes are
 * unconfirmed even if perfectly forged. Only the SAME evaluate's timely scalar
 * echo can corroborate them; no server or passive-wire authority is implied. */
export function createPc10PrivateSdkPhaseDiagnostics(page, clock = Date.now) {
  const active = new Map();
  const channelRejections = { foreignInvocation: 0, malformed: 0 };
  const increment = key => { channelRejections[key] = Math.min(Number.MAX_SAFE_INTEGER, channelRejections[key] + 1); };
  const invalidate = (state, category) => {
    if (!state.value.rejections.includes(category)) state.value.rejections.push(category);
    state.value.verification = 'INVALID'; state.value.outcome = 'UNKNOWN';
  };
  function begin({ binding, suffix, moduleUrl }) {
    const bindingKeys = ['commandId', 'roleId', 'actorHash', 'sessionHash', 'contextHash',
      'nativeDocumentHash', 'sourceBeforeHash', 'commandFingerprint'];
    const validBinding = keys(binding, bindingKeys) && uuid(binding.commandId) &&
      typeof binding.roleId === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(binding.roleId) &&
      bindingKeys.slice(2).every(key => digest(binding[key]));
    const collectionTag = suffix === 'secrets/wolf-assignment' ? 'secrets'
      : suffix === 'serverState/candidates' ? 'server-state' : null;
    const value = { kind: 'original-private-sdk-phase-diagnostic', verification: 'UNCONFIRMED', outcome: 'UNKNOWN',
      binding: validBinding ? Object.freeze({ ...binding }) : null, collectionTag,
      suffixHash: hash('suffix', suffix), sdkModuleHash: hash('module', moduleUrl),
      dispatchedAt: clock(), budgetStartedAt: null, deadlineAt: null, deadlineExceeded: false,
      completedAt: null, operationRejected: false, lateSettlement: null, phases: [], rejections: [], channelRejections };
    Object.defineProperty(value, 'invocationId', { value: randomUUID(), enumerable: true });
    const state = { value, notes: [], settled: false };
    active.set(value.invocationId, state);
    if (!validBinding || !collectionTag) invalidate(state, 'original-command-binding-invalid');
    const budgetStarted = at => { value.budgetStartedAt = at; value.deadlineAt = at + 15_000; };
    const deadline = () => { value.deadlineExceeded = true; };
    const outcome = reply => reply?.status === 'denied' ? 'DENIED' : reply?.status === 'read' ? 'READ' : 'UNKNOWN';
    const corroborates = witness => {
      if (!keys(witness, ['schemaVersion', 'invocationId', 'documentId', 'phases']) || witness.schemaVersion !== 1 ||
        witness.invocationId !== value.invocationId || !uuid(witness.documentId) || !value.binding ||
        documentHash(witness.documentId) !== value.binding.nativeDocumentHash || !Array.isArray(witness.phases) ||
        witness.phases.length !== PHASES.length || state.notes.length !== PHASES.length) return false;
      return witness.phases.every((event, ordinal) => keys(event, ['ordinal', 'phase', 'browserAt']) &&
        event.ordinal === ordinal && event.phase === PHASES[ordinal] && time(event.browserAt) &&
        event.browserAt === state.notes[ordinal].browserAt);
    };
    const latePhaseTiming = (envelope, at) => {
      const reject = reason => ({ status: 'REJECTED', reason });
      if (!value.binding || value.verification === 'INVALID') return reject('late-original-binding-invalid');
      if (!time(value.dispatchedAt) || !time(value.budgetStartedAt) || !time(value.deadlineAt) || !time(at) ||
        value.budgetStartedAt < value.dispatchedAt || value.deadlineAt !== value.budgetStartedAt + 15_000 ||
        at < value.deadlineAt) return reject('late-window-invalid');
      if (!keys(envelope, ['originalReply', 'phaseWitness'])) return reject('late-envelope-schema-invalid');
      const witness = envelope.phaseWitness;
      if (!keys(witness, ['schemaVersion', 'invocationId', 'documentId', 'phases']) || witness.schemaVersion !== 1 ||
        !Array.isArray(witness.phases) || witness.phases.length !== PHASES.length) return reject('late-witness-schema-invalid');
      if (witness.invocationId !== value.invocationId) return reject('late-invocation-mismatch');
      if (!uuid(witness.documentId) || documentHash(witness.documentId) !== value.binding.nativeDocumentHash) {
        return reject('late-native-document-mismatch');
      }
      let last = value.dispatchedAt;
      for (const [ordinal, event] of witness.phases.entries()) {
        if (!keys(event, ['ordinal', 'phase', 'browserAt']) || event.ordinal !== ordinal || event.phase !== PHASES[ordinal]) {
          return reject('late-phase-schema-invalid');
        }
        if (!time(event.browserAt) || event.browserAt < last || event.browserAt > at) return reject('late-phase-time-invalid');
        if (state.notes[ordinal] && event.browserAt !== state.notes[ordinal].browserAt) return reject('late-timely-prefix-mismatch');
        last = event.browserAt;
      }
      // The already returned SAME evaluate supplies timing only. Timely phase
      // verification, SDK outcome and the timed-out command remain untouched.
      return { status: 'RECORDED', originallySettledBrowserAt: last };
    };
    const fulfilled = envelope => {
      const at = clock(); state.settled = true;
      const originalReply = envelope?.originalReply;
      if (value.deadlineExceeded) {
        value.lateSettlement = { kind: 'evaluate-fulfilled', observedAt: at,
          status: ['read', 'denied'].includes(originalReply?.status) ? originalReply.status : null,
          code: safeCode(originalReply?.code), phaseTiming: latePhaseTiming(envelope, at) };
      } else {
        value.completedAt = at;
        if (!time(at) || at < value.dispatchedAt || at > value.deadlineAt) invalidate(state, 'phase-outside-original-window');
        if (!keys(envelope, ['originalReply', 'phaseWitness']) || !corroborates(envelope.phaseWitness)) {
          invalidate(state, 'original-promise-provenance-mismatch');
        }
        if (value.verification !== 'INVALID') { value.verification = 'VERIFIED'; value.outcome = outcome(originalReply); }
      }
      return originalReply;
    };
    const rejected = () => {
      state.settled = true;
      if (value.deadlineExceeded) value.lateSettlement = { kind: 'evaluate-rejected', observedAt: clock(), status: null, code: null };
      else value.operationRejected = true;
    };
    return { value, budgetStarted, deadline, fulfilled, rejected };
  }
  function observeMessage(message, text = message.text()) {
    if (typeof text !== 'string' || !text.startsWith(PREFIX)) return false;
    if (text.length > 2048) { increment('malformed'); return true; }
    let event;
    try { event = JSON.parse(text.slice(PREFIX.length)); } catch { increment('malformed'); return true; }
    const state = active.get(event?.invocationId);
    if (!state) { increment('foreignInvocation'); return true; }
    const { value } = state;
    if (value.deadlineExceeded || state.settled) return true; // Late notes never fill the timely transcript.
    if (!keys(event, ['schemaVersion', 'invocationId', 'documentId', 'ordinal', 'phase', 'browserAt']) ||
      event.schemaVersion !== 1 || !uuid(event.invocationId) || !uuid(event.documentId)) {
      invalidate(state, 'malformed-phase-marker'); return true;
    }
    if (message.page?.() !== page || message.worker?.() !== null || !value.binding ||
      documentHash(event.documentId) !== value.binding.nativeDocumentHash) {
      invalidate(state, 'foreign-page-document-or-worker'); return true;
    }
    const at = clock();
    if (!time(event.browserAt) || event.browserAt < value.dispatchedAt || event.browserAt > at ||
      event.browserAt > (value.deadlineAt ?? value.dispatchedAt + 15_000) ||
      (state.notes.length && event.browserAt < state.notes.at(-1).browserAt)) {
      invalidate(state, 'phase-outside-original-window'); return true;
    }
    if (event.ordinal !== state.notes.length || event.phase !== PHASES[event.ordinal] || state.notes.length >= PHASES.length) {
      invalidate(state, 'duplicate-or-out-of-order-phase'); return true;
    }
    if (value.verification === 'INVALID') return true;
    const note = { ordinal: event.ordinal, phase: event.phase, browserAt: event.browserAt };
    state.notes.push(note); value.phases.push({ ...note, observedAt: at });
    return true;
  }
  return { begin, observeMessage };
}

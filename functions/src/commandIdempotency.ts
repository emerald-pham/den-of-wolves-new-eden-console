/**
 * A command receipt is deliberately private. Its fingerprint is the complete
 * command identity that allows one safe retry and rejects every other reuse of
 * the request id before a previous result can be disclosed.
 */
export type CommandPayloadValue = boolean | number | string | null | readonly string[];

export type CommandFingerprint = Readonly<{
  action: string;
  sessionId: string | null;
  requestId: string;
  actorUid: string;
  instanceId: string | null;
  expectedRevision: number | null;
  payload: Readonly<Record<string, CommandPayloadValue>>;
}>;

export type CommandReceiptDisposition =
  | Readonly<{ kind: 'replay' }>
  | Readonly<{ kind: 'foreign-actor' }>
  | Readonly<{ kind: 'collision' }>;

function isCanonicalPayload(value: unknown): value is CommandFingerprint['payload'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((field) => field === null ||
    typeof field === 'boolean' || typeof field === 'string' ||
    (typeof field === 'number' && Number.isFinite(field)) ||
    (Array.isArray(field) && field.every((item) => typeof item === 'string')));
}

function isCommandFingerprint(value: unknown): value is CommandFingerprint {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.action === 'string' && candidate.action.length > 0 &&
    (candidate.sessionId === null ||
      (typeof candidate.sessionId === 'string' && candidate.sessionId.length > 0)) &&
    typeof candidate.requestId === 'string' && candidate.requestId.length > 0 &&
    typeof candidate.actorUid === 'string' && candidate.actorUid.length > 0 &&
    (typeof candidate.instanceId === 'string' || candidate.instanceId === null) &&
    (Number.isSafeInteger(candidate.expectedRevision) || candidate.expectedRevision === null) &&
    isCanonicalPayload(candidate.payload);
}

function samePayload(
  stored: CommandFingerprint['payload'],
  expected: CommandFingerprint['payload'],
): boolean {
  const storedKeys = Object.keys(stored).sort();
  const expectedKeys = Object.keys(expected).sort();
  return storedKeys.length === expectedKeys.length &&
    storedKeys.every((key, index) => {
      if (key !== expectedKeys[index]) return false;
      const storedValue = stored[key];
      const expectedValue = expected[key];
      if (Array.isArray(storedValue)) {
        return Array.isArray(expectedValue) &&
          storedValue.length === expectedValue.length &&
          storedValue.every((value, valueIndex) => value === expectedValue[valueIndex]);
      }
      return !Array.isArray(expectedValue) && storedValue === expectedValue;
    });
}

/** Distinguish a foreign receipt from every malformed or conflicting reuse. */
export function commandReceiptDisposition(
  stored: unknown,
  expected: CommandFingerprint,
): CommandReceiptDisposition {
  if (!isCommandFingerprint(stored)) return { kind: 'collision' };
  // Cross-action reuse is a request-id collision even when the actor also
  // differs. This keeps action probing on the established conflict path;
  // same-action foreign reuse remains an authorization denial.
  if (stored.action !== expected.action) return { kind: 'collision' };
  if (stored.actorUid !== expected.actorUid) return { kind: 'foreign-actor' };
  if (
    stored.sessionId !== expected.sessionId ||
    stored.requestId !== expected.requestId ||
    stored.instanceId !== expected.instanceId ||
    stored.expectedRevision !== expected.expectedRevision ||
    !samePayload(stored.payload, expected.payload)
  ) {
    return { kind: 'collision' };
  }
  return { kind: 'replay' };
}

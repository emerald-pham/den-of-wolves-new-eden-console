import { expect, it } from 'vitest';
import {
  commandReceiptDisposition,
  type CommandFingerprint,
} from './commandIdempotency';

const fingerprint = (overrides: Partial<CommandFingerprint> = {}): CommandFingerprint => ({
  action: 'set-press-availability',
  sessionId: 's1',
  requestId: 'request-1',
  actorUid: 'gm-1',
  instanceId: 'bridge',
  expectedRevision: 3,
  payload: { pressEnabled: true },
  ...overrides,
});

it('accepts only an exact canonical command fingerprint for replay', () => {
  const expected = fingerprint();

  expect(commandReceiptDisposition(expected, expected)).toEqual({ kind: 'replay' });
  expect(commandReceiptDisposition(fingerprint({
    payload: { pressEnabled: false },
  }), expected)).toEqual({ kind: 'collision' });
  expect(commandReceiptDisposition(fingerprint({ expectedRevision: 2 }), expected))
    .toEqual({ kind: 'collision' });
  expect(commandReceiptDisposition(fingerprint({ action: 'assign-role' }), expected))
    .toEqual({ kind: 'collision' });
});

it('never treats a receipt belonging to another actor as replayable', () => {
  expect(commandReceiptDisposition(fingerprint({ actorUid: 'gm-2' }), fingerprint()))
    .toEqual({ kind: 'foreign-actor' });
  expect(commandReceiptDisposition(fingerprint({ action: 'assign-role', actorUid: 'gm-2' }), fingerprint()))
    .toEqual({ kind: 'collision' });
  expect(commandReceiptDisposition({ ...fingerprint(), payload: { pressEnabled: true, ignored: null } }, fingerprint()))
    .toEqual({ kind: 'collision' });
});

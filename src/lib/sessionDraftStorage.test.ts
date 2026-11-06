import { beforeEach, expect, it } from 'vitest';
import { clearSessionDraft, readSessionDraft, writeSessionDraft } from './sessionDraftStorage';

const scope = { kind: 'pdf-news-relay-draft', sessionId: 's1', uid: 'u1', scope: 'fleet-2' };
const asText = (value: unknown) => typeof value === 'string' ? value : null;

beforeEach(() => sessionStorage.clear());

it('clears only the exact session, UID and scope draft', () => {
  writeSessionDraft(scope, 'Fleet two.');
  writeSessionDraft({ ...scope, scope: 'fleet-3' }, 'Fleet three.');
  writeSessionDraft({ ...scope, uid: 'u2' }, 'Another player.');

  clearSessionDraft(scope);

  expect(readSessionDraft(scope, asText)).toBeNull();
  expect(readSessionDraft({ ...scope, scope: 'fleet-3' }, asText)).toBe('Fleet three.');
  expect(readSessionDraft({ ...scope, uid: 'u2' }, asText)).toBe('Another player.');
});

it('ignores a clear without a complete scope', () => {
  writeSessionDraft(scope, 'Kept.');
  clearSessionDraft({ ...scope, uid: null });
  expect(readSessionDraft(scope, asText)).toBe('Kept.');
});

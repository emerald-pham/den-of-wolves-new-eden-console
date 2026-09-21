import { expect, it } from 'vitest';
import { normalizeAdmiralDirectives } from './admiralDirectiveState';

it('rejects a malformed public Admiral history as one fail-closed state', () => {
  expect(normalizeAdmiralDirectives({ revision: 2, entries: [
    { id: 'one', kind: 'fleet-policy', text: ' Hold formation ', cycle: 3, publishedAt: '2026-09-21T12:00:00.000Z', actorUid: 'secret' },
    { id: 'bad', kind: 'gm-command', text: 'Override', cycle: 3, publishedAt: '2026-09-21T12:00:00.000Z' },
  ] })).toEqual({ revision: 0, entries: [] });
});

it('normalizes a valid public Admiral history without private fields', () => {
  expect(normalizeAdmiralDirectives({ revision: 2, entries: [
    { id: 'one', kind: 'fleet-policy', text: ' Hold formation ', cycle: 3, publishedAt: '2026-09-21T12:00:00.000Z', actorUid: 'secret' },
  ] })).toEqual({
    revision: 2,
    entries: [{ id: 'one', kind: 'fleet-policy', text: 'Hold formation', cycle: 3, publishedAt: '2026-09-21T12:00:00.000Z' }],
  });
});

import { expect, it } from 'vitest';
import { normalizeAdmiralDirectives } from './admiralDirectiveState';

it('normalizes only current public Admiral directive fields', () => {
  expect(normalizeAdmiralDirectives({ revision: 2, entries: [
    { id: 'one', kind: 'fleet-policy', text: ' Hold formation ', cycle: 3, publishedAt: '2026-09-21T12:00:00.000Z', actorUid: 'secret' },
    { id: 'bad', kind: 'gm-command', text: 'Override', cycle: 3, publishedAt: '2026-09-21T12:00:00.000Z' },
  ] })).toEqual({
    revision: 2,
    entries: [{ id: 'one', kind: 'fleet-policy', text: 'Hold formation', cycle: 3, publishedAt: '2026-09-21T12:00:00.000Z' }],
  });
});

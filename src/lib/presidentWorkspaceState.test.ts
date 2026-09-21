import { expect, it } from 'vitest';
import { normalizePresidentWorkspace } from './presidentWorkspaceState';

it('hydrates only exact President workspace records', () => {
  const valid = { revision: 1, entries: [{ id: 'one', kind: 'address', text: 'Address the fleet.',
    cycle: 2, recordedAt: '2026-09-21T21:00:00.000Z' }] };
  expect(normalizePresidentWorkspace(valid)).toEqual(valid);
  expect(normalizePresidentWorkspace({ ...valid, extra: true })).toEqual({ revision: 0, entries: [] });
  expect(normalizePresidentWorkspace({ revision: 1, entries: [{ ...valid.entries[0], kind: 'gm-command' }] }))
    .toEqual({ revision: 0, entries: [] });
});

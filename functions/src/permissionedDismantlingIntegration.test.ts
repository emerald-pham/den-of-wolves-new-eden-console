import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  runTransaction: vi.fn(),
  doc: vi.fn((path: string) => ({ path, id: path.split('/').at(-1) })),
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ doc: mock.doc, runTransaction: mock.runTransaction }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class MockTimestamp {},
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));

import { proposePermissionedDismantling } from './index';

beforeEach(() => {
  mock.runTransaction.mockReset();
  mock.doc.mockClear();
});

it('exports the permissioned dismantling callable and rejects unauthenticated requests before database access', async () => {
  await expect(proposePermissionedDismantling.run({
    data: {
      sessionId: 's1',
      proposalId: 'proposal-1',
      craftId: 'philia',
      targetShipId: 'dione',
      targetConsoleId: 'reactor',
      expectedTargetRevision: 0,
      expectedControlRevision: 0,
    },
    auth: null,
  } as CallableRequest<Record<string, unknown>>)).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  expect(mock.runTransaction).not.toHaveBeenCalled();
});

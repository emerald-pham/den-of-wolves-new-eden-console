import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), role: 'gm', owner: 'u1', connected: true,
  fuel: 6, unrest: 7, population: 16_000,
  phase: 'active',
  revision: 0,
  receipts: {} as Record<string, Record<string, unknown>>,
  audits: {} as Record<string, Record<string, unknown>>,
  set: vi.fn(),
  retry: false, retryFuel: undefined as number | undefined,
  unrestAlerts: {} as Record<string, unknown>, populationAlerts: {} as Record<string, unknown>,
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: async (callback: (tx: unknown) => unknown) => {
      const writes: Record<string, Record<string, unknown>> = {};
      const transaction = {
        get: mock.get,
        update: mock.update,
        set: (path: string, value: Record<string, unknown>) => {
          mock.set(path, value);
          writes[path] = value;
        },
      };
      if (mock.retry) {
        await callback(transaction);
        if (mock.retryFuel !== undefined) mock.fuel = mock.retryFuel;
      }
      const result = await callback(transaction);
      for (const [path, value] of Object.entries(writes)) {
        if (path.includes('/commandReceipts/')) mock.receipts[path] = value;
        if (path.includes('/actionAudits/')) mock.audits[path] = value;
      }
      return result;
    },
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { adjustShipResource, adjustShipUnrest, applyShipCounterSteps } from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  const withRevision = data.counter === undefined || data.expectedRevision !== undefined
    ? data
    : { ...data, expectedRevision: 0 };
  return { data: withRevision.requestId === undefined
    ? { ...withRevision, requestId: 'test-counter' }
    : withRevision, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

beforeEach(() => {
  mock.role = 'gm'; mock.owner = 'u1'; mock.connected = true;
  mock.fuel = 6; mock.unrest = 7; mock.population = 16_000;
  mock.phase = 'active'; mock.revision = 0;
  mock.retry = false; mock.retryFuel = undefined;
  mock.unrestAlerts = {}; mock.populationAlerts = {};
  mock.update.mockReset();
  mock.receipts = {};
  mock.audits = {};
  mock.set.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/actionAudits/')) {
      const audit = mock.audits[path];
      return { exists: audit !== undefined, get: (key: string) => audit?.[key], data: () => audit };
    }
    if (path.includes('/commandReceipts/')) {
      const receipt = mock.receipts[path];
      return { exists: receipt !== undefined, get: (key: string) => receipt?.[key] };
    }
    if (path.endsWith('/gmInstances')) return { docs: [{ id: 'gm1' }, { id: 'gm2' }] };
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected }
      : path.includes('/gmInstances/') ? { uid: mock.owner, connected: mock.connected, lastSeenAt: new Date() }
      : {
        activeVesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'],
        phase: mock.phase,
        vesselActionRevisions: { dione: mock.revision, capybara: mock.revision },
        shipResources: { dione: { fuel: mock.fuel } },
        shipUnrest: { dione: mock.unrest, capybara: mock.unrest },
        shipSurvivors: { dione: mock.population, capybara: mock.population },
        unrestAlerts: mock.unrestAlerts,
        populationAlerts: mock.populationAlerts,
      };
    return { exists: true, get: (key: string) => fields[key] };
  });
});

it('applies rapid resource steps in their click order inside one transaction', async () => {
  const committedRequest = request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'resource',
    resourceId: 'fuel', steps: [1, 1, -1],
  });
  const committed = await applyShipCounterSteps.run(committedRequest);
  expect(committed).toMatchObject({ amount: 7, appliedSteps: [1, 1, -1], alertRaised: false,
    actorUid: 'u1', vesselId: 'dione', idempotencyKey: 'test-counter', auditId: 'counter-batch-test-counter' });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.dione.fuel': 7,
  }));
  expect(mock.audits['sessions/s1/actionAudits/test-counter']).toMatchObject({
    schemaVersion: 1, sessionId: 's1', actorUid: 'u1', actorRoleId: null,
    action: 'ship-counter-batch', phase: 'active', requestId: 'test-counter',
    revision: 1, outcome: 'committed', resolutionSource: 'facilitator',
    redactionPolicy: 'action-audit-metadata-only-v1', createdAt: 'server-time',
  });
  expect(mock.audits['sessions/s1/actionAudits/test-counter']).not.toHaveProperty('steps');
  expect(mock.audits['sessions/s1/actionAudits/test-counter']).not.toHaveProperty('amount');
  expect(mock.audits['sessions/s1/actionAudits/test-counter']).not.toHaveProperty('counter');
  expect(mock.audits['sessions/s1/actionAudits/test-counter']).not.toHaveProperty('resourceId');
  const writesAfterCommit = mock.set.mock.calls.length;
  delete mock.audits['sessions/s1/actionAudits/test-counter'];
  await expect(applyShipCounterSteps.run(committedRequest)).resolves.toEqual(committed);
  expect(mock.set).toHaveBeenCalledTimes(writesAfterCommit + 1);
  expect(mock.audits['sessions/s1/actionAudits/test-counter']).toMatchObject({
    action: 'ship-counter-batch', requestId: 'test-counter', revision: 1,
  });
  const writesAfterAuditRepair = mock.set.mock.calls.length;
  await expect(applyShipCounterSteps.run(committedRequest)).resolves.toEqual(committed);
  expect(mock.set).toHaveBeenCalledTimes(writesAfterAuditRepair);
  mock.audits['sessions/s1/actionAudits/test-counter']!.action = 'ship-store-scavenge';
  await expect(applyShipCounterSteps.run(committedRequest))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledTimes(writesAfterAuditRepair);
});

it('re-evaluates one resource command against the latest count after a transaction retry', async () => {
  mock.retry = true;
  mock.retryFuel = 7;

  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'resource',
    resourceId: 'fuel', steps: [1],
  }))).resolves.toMatchObject({ amount: 8, appliedSteps: [1], alertRaised: false,
    actorUid: 'u1', vesselId: 'dione', idempotencyKey: 'test-counter', revision: 1 });
  expect(mock.update).toHaveBeenNthCalledWith(1, 'sessions/s1', expect.objectContaining({
    'shipResources.dione.fuel': 7,
  }));
  expect(mock.update).toHaveBeenNthCalledWith(2, 'sessions/s1', expect.objectContaining({
    'shipResources.dione.fuel': 8,
  }));
});

it.each([
  ['resource', 'fuel', 6],
  ['unrest', undefined, 7],
  ['population', undefined, 16_000],
] as const)('returns only the GM-authorized current %s value for a stale batch', async (counter, resourceId, amount) => {
  mock.revision = 3;
  const result = await applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter,
    ...(resourceId === undefined ? {} : { resourceId }),
    steps: [1], expectedRevision: 1, requestId: `stale-${counter}`,
  }));

  expect(result).toMatchObject({
    status: 'stale', amount, alertRaised: false, retryBlockedByAlert: false,
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter,
    requestId: `stale-${counter}`, expectedRevision: 1, currentRevision: 3,
    actorUid: 'u1', vesselId: 'dione', revision: 3,
    idempotencyKey: `stale-${counter}`,
  });
  expect(Object.keys(result).sort()).toEqual([
    'actorRoleId', 'actorUid', 'alertRaised', 'amount', 'auditId', 'counter',
    'currentRevision', 'expectedRevision', 'idempotencyKey', 'instanceId',
    'phase', 'requestId', 'retryBlockedByAlert', 'revision', 'sessionId', 'shipId', 'status', 'turn',
    'vesselId', ...(resourceId === undefined ? [] : ['resourceId']),
  ].sort());
  expect(mock.set).toHaveBeenCalledWith(
    `sessions/s1/commandReceipts/stale-${counter}`,
    expect.objectContaining({ fingerprint: expect.any(Object), result }),
  );
  expect(mock.audits[`sessions/s1/actionAudits/stale-${counter}`]).toBeUndefined();
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter,
    ...(resourceId === undefined ? {} : { resourceId }),
    steps: [1], expectedRevision: 1, requestId: `stale-${counter}`,
  }))).resolves.toEqual(result);
  expect(mock.set).toHaveBeenCalledTimes(1);
  expect(mock.update).not.toHaveBeenCalled();
});

it.each([
  ['unrest', 'unrestAlerts'],
  ['population', 'populationAlerts'],
] as const)('reports only whether the stale %s retry is blocked by a pending GM alert', async (counter, alertField) => {
  mock.revision = 3;
  mock[alertField] = {
    dione: {
      shipId: 'dione', shipName: 'Dione', targetGmInstanceIds: ['gm1'], createdAt: 'server-time',
    },
  };

  const result = await applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter,
    steps: [-1], expectedRevision: 1, requestId: `stale-alert-${counter}`,
  }));

  expect(result).toMatchObject({ status: 'stale', retryBlockedByAlert: true });
  expect(Object.keys(result)).not.toContain('unrestAlerts');
  expect(Object.keys(result)).not.toContain('populationAlerts');
  expect(JSON.stringify(result)).not.toContain('targetGmInstanceIds');
});

it('fails closed when a stale population reply cannot project a value on the printed track', async () => {
  mock.revision = 3;
  mock.population = 15_500;

  await expect(applyShipCounterSteps.run({
    data: {
      sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'population',
      steps: [1], expectedRevision: 1, requestId: 'malformed-stale-population',
    },
    auth: { uid: 'u1' },
  } as CallableRequest<Record<string, unknown>>)).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('requires an explicit expected revision for ordered counter batches', async () => {
  await expect(applyShipCounterSteps.run({
    data: {
      sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'unrest',
      steps: [1], requestId: 'missing-counter-revision',
    },
    auth: { uid: 'u1' },
  } as CallableRequest<Record<string, unknown>>)).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('keeps single and ordered resource commands at the safe upper boundary', async () => {
  mock.fuel = Number.MAX_SAFE_INTEGER;

  await expect(adjustShipResource.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', resourceId: 'fuel', delta: 1,
  }))).resolves.toMatchObject({ amount: Number.MAX_SAFE_INTEGER,
    actorUid: 'u1', vesselId: 'dione', idempotencyKey: 'test-counter', revision: 1 });
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'resource',
    resourceId: 'fuel', steps: [1], requestId: 'boundary-batch',
  }))).resolves.toMatchObject({ amount: Number.MAX_SAFE_INTEGER, appliedSteps: [1], alertRaised: false,
    actorUid: 'u1', vesselId: 'dione', idempotencyKey: 'boundary-batch', revision: 1 });
  expect(mock.update).toHaveBeenLastCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.dione.fuel': Number.MAX_SAFE_INTEGER,
  }));
  expect(mock.audits['sessions/s1/actionAudits/test-counter']).toMatchObject({
    action: 'ship-resource-adjustment', requestId: 'test-counter', revision: 1,
    resolutionSource: 'facilitator', redactionPolicy: 'action-audit-metadata-only-v1',
  });
  expect(mock.audits['sessions/s1/actionAudits/boundary-batch']).toMatchObject({
    action: 'ship-counter-batch', requestId: 'boundary-batch', revision: 1,
  });
  expect(mock.audits['sessions/s1/actionAudits/test-counter']).not.toHaveProperty('resourceId');
  expect(mock.audits['sessions/s1/actionAudits/test-counter']).not.toHaveProperty('delta');
});

it('records a metadata-only facilitator audit for a single unrest correction', async () => {
  await expect(adjustShipUnrest.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', delta: -1,
    requestId: 'unrest-change',
  }))).resolves.toMatchObject({ amount: 6, actorUid: 'u1', revision: 1 });
  expect(mock.audits['sessions/s1/actionAudits/unrest-change']).toMatchObject({
    schemaVersion: 1, sessionId: 's1', actorUid: 'u1', action: 'ship-unrest-adjustment',
    phase: 'active', requestId: 'unrest-change', revision: 1, outcome: 'committed',
    resolutionSource: 'facilitator', redactionPolicy: 'action-audit-metadata-only-v1',
  });
  expect(mock.audits['sessions/s1/actionAudits/unrest-change']).not.toHaveProperty('amount');
  expect(mock.audits['sessions/s1/actionAudits/unrest-change']).not.toHaveProperty('delta');
  expect(mock.audits['sessions/s1/actionAudits/unrest-change']).not.toHaveProperty('shipId');
});

it('fails closed when an audit record exists without its bound command receipt', async () => {
  mock.audits['sessions/s1/actionAudits/audit-collision'] = {
    schemaVersion: 1, sessionId: 's1', actorUid: 'u1', actorRoleId: null,
    action: 'ship-store-scavenge', phase: 'active', requestId: 'audit-collision',
    revision: 1, outcome: 'committed', resolutionSource: 'facilitator',
    redactionPolicy: 'action-audit-metadata-only-v1', createdAt: 'server-time',
  };
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'resource',
    resourceId: 'fuel', steps: [1], requestId: 'audit-collision',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.audits['sessions/s1/actionAudits/audit-collision']?.action)
    .toBe('ship-store-scavenge');
});

it('preserves an unrest threshold crossing rather than netting it away', async () => {
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'unrest', steps: [1, -1],
  }))).resolves.toMatchObject({ amount: 8, appliedSteps: [1], alertRaised: true,
    actorUid: 'u1', vesselId: 'dione', idempotencyKey: 'test-counter', auditId: 'counter-batch-test-counter' });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipUnrest.dione': 8,
    unrestAlerts: { dione: expect.objectContaining({ targetGmInstanceIds: ['gm1', 'gm2'] }) },
  }));
  expect(mock.audits['sessions/s1/actionAudits/test-counter']).toMatchObject({
    action: 'ship-counter-batch', requestId: 'test-counter', revision: 1,
    resolutionSource: 'facilitator', redactionPolicy: 'action-audit-metadata-only-v1',
  });
});

it('preserves the first population threshold and targets every active GM', async () => {
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'capybara', counter: 'population', steps: [-1, -1],
  }))).resolves.toMatchObject({ amount: 15_000, appliedSteps: [-1], alertRaised: true,
    actorUid: 'u1', vesselId: 'capybara', idempotencyKey: 'test-counter', auditId: 'counter-batch-test-counter' });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipSurvivors.capybara': 15_000,
    populationAlerts: { capybara: expect.objectContaining({ population: 15_000, targetGmInstanceIds: ['gm1', 'gm2'] }) },
  }));
  expect(mock.audits['sessions/s1/actionAudits/test-counter']).toMatchObject({
    action: 'ship-counter-batch', requestId: 'test-counter', revision: 1,
    resolutionSource: 'facilitator', redactionPolicy: 'action-audit-metadata-only-v1',
  });
});

it('adds two unrest once when an ordered Capybara population input reaches zero', async () => {
  mock.population = 250;
  mock.unrest = 7;

  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'capybara', counter: 'population', steps: [-1],
  }))).resolves.toMatchObject({ amount: 0, appliedSteps: [-1], alertRaised: true });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipSurvivors.capybara': 0,
    'shipUnrest.capybara': 9,
    populationAlerts: { capybara: expect.objectContaining({ population: 0 }) },
    unrestAlerts: { capybara: expect.objectContaining({ targetGmInstanceIds: ['gm1', 'gm2'] }) },
  }));

  mock.population = 0;
  mock.update.mockReset();
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'capybara', counter: 'population', steps: [-1],
    requestId: 'already-zero',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('does not let a batch bypass an unresolved GM alert', async () => {
  mock.unrestAlerts = { dione: { targetGmInstanceIds: ['gm1'] } };

  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'unrest', steps: [-1],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });

  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects untrusted counter batches before changing session state', async () => {
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'unrest', steps: [1, 2],
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  mock.role = 'player';
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'unrest', steps: [1],
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects single and batched counter mutations after pursuit failure without writing', async () => {
  mock.phase = 'failure';
  await expect(adjustShipResource.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', resourceId: 'fuel', delta: 1,
    requestId: 'terminal-resource',
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/endgame evaluation/i) });
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'resource',
    resourceId: 'fuel', steps: [1], requestId: 'terminal-batch',
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/endgame evaluation/i) });
  expect(mock.update).not.toHaveBeenCalled();
});

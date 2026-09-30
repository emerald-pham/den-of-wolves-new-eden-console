import { expect, it } from 'vitest';
import { createPermissionedDismantlingCallables } from './permissionedDismantlingCallable';

type Fields = Record<string, unknown>;
type Write = { readonly kind: 'set' | 'create' | 'update'; readonly path: string; readonly data: Fields };

const SESSION_ID = 's1';
const PROPOSAL_ID = 'proposal-1';
const CONSENT_ID = 'consent-1';
const APPLY_ID = 'apply-1';

function pathSet(target: Fields, dottedPath: string, value: unknown): void {
  const parts = dottedPath.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] = { ...((cursor[part] as Fields | undefined) ?? {}) };
    cursor = cursor[part] as Fields;
  }
  cursor[parts[parts.length - 1]!] = structuredClone(value);
}

class FakeStore {
  readonly records = new Map<string, Fields>();
  readonly committedWrites: Write[] = [];

  doc(path: string) {
    return { path, id: path.split('/').at(-1) ?? '' };
  }

  async runTransaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    const staged: Write[] = [];
    const tx = {
      get: async (ref: { readonly path: string }) => {
        const value = this.records.get(ref.path);
        return {
          exists: value !== undefined,
          id: ref.path.split('/').at(-1) ?? '',
          ref: this.doc(ref.path),
          get: (field: string) => value?.[field],
          data: () => value,
        };
      },
      set: (ref: { readonly path: string }, data: Fields) => {
        staged.push({ kind: 'set', path: ref.path, data: structuredClone(data) });
      },
      create: (ref: { readonly path: string }, data: Fields) => {
        staged.push({ kind: 'create', path: ref.path, data: structuredClone(data) });
      },
      update: (ref: { readonly path: string }, data: Fields) => {
        staged.push({ kind: 'update', path: ref.path, data: structuredClone(data) });
      },
    };

    const result = await work(tx);
    for (const write of staged) {
      if (write.kind === 'create' && this.records.has(write.path)) {
        throw new Error('Document already exists: ' + write.path);
      }
      if (write.kind === 'update') {
        const current = structuredClone(this.records.get(write.path) ?? {});
        for (const [key, value] of Object.entries(write.data)) pathSet(current, key, value);
        this.records.set(write.path, current);
      } else {
        this.records.set(write.path, structuredClone(write.data));
      }
      this.committedWrites.push(write);
    }
    return result;
  }
}

const paths = (sessionId = SESSION_ID) => ({
  session: 'sessions/' + sessionId,
  proposer: 'sessions/' + sessionId + '/players/engineer',
  targetPlayer: 'sessions/' + sessionId + '/players/target-player',
  otherShipPlayer: 'sessions/' + sessionId + '/players/other-ship-player',
  proposal: 'sessions/' + sessionId + '/permissionedDismantlingProposals/' + PROPOSAL_ID,
  consent: 'sessions/' + sessionId + '/permissionedDismantlingConsents/' + CONSENT_ID,
  targetState: 'sessions/' + sessionId + '/permissionedDismantlingTargetStates/dione',
  applyReceipt: 'sessions/' + sessionId + '/permissionedDismantlingReceipts/' + APPLY_ID,
});

function activePlayer(assignedRoleId: string): Fields {
  return {
    role: 'player',
    connected: true,
    assignedRoleId,
    replacementRoleId: null,
    replacementStatus: null,
    escapeState: null,
  };
}

function seededStore(): FakeStore {
  const store = new FakeStore();
  const p = paths();
  store.records.set(p.session, {
    phase: 'active',
    activeRoleIds: ['dione-engineer', 'dione-captain', 'icebreaker-miner'],
    activeVesselIds: ['dione', 'icebreaker'],
    shuttleDockings: [{ shuttleId: 'philia', shipId: 'dione', dockedAt: 'SESSION START' }],
    shuttleControl: {
      philia: {
        shuttleId: 'philia',
        ownerRoleId: 'dione-engineer',
        ownerUid: 'engineer',
        holderUid: 'engineer',
        revision: 4,
      },
    },
    shipDamage: { dione: { damagedSystemIds: ['storage'], destroyed: false } },
    shipResources: {
      dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 5, securityTeams: 2 },
    },
  });
  store.records.set(p.proposer, activePlayer('dione-engineer'));
  store.records.set(p.targetPlayer, activePlayer('dione-captain'));
  store.records.set(p.otherShipPlayer, activePlayer('icebreaker-miner'));
  return store;
}

function dependencies(store: FakeStore) {
  return {
    db: store,
    serverTimestamp: () => 'server-time',
    now: () => new Date('2026-09-30T17:00:00.000Z'),
  };
}

const request = (uid: string, data: Fields) => ({ auth: { uid }, data });
const proposeRequest = (overrides: Fields = {}) => request('engineer', {
  sessionId: SESSION_ID,
  proposalId: PROPOSAL_ID,
  craftId: 'philia',
  targetShipId: 'dione',
  targetConsoleId: 'reactor',
  expectedTargetRevision: 0,
  expectedControlRevision: 4,
  ...overrides,
});
const consentRequest = (uid = 'target-player', overrides: Fields = {}) => request(uid, {
  sessionId: SESSION_ID,
  proposalId: PROPOSAL_ID,
  consentId: CONSENT_ID,
  expectedTargetRevision: 0,
  ...overrides,
});
const applyRequest = (overrides: Fields = {}) => request('engineer', {
  sessionId: SESSION_ID,
  requestId: APPLY_ID,
  proposalId: PROPOSAL_ID,
  consentId: CONSENT_ID,
  expectedTargetRevision: 0,
  ...overrides,
});

it('proposes, grants one exact target-ship consent, and atomically applies damage with the printed materials gain', async () => {
  const store = seededStore();
  const callables = createPermissionedDismantlingCallables(dependencies(store));

  const proposed = await callables.proposePermissionedDismantling(proposeRequest());
  const proposalWrites = store.committedWrites.length;
  const replayedProposal = await callables.proposePermissionedDismantling(proposeRequest());
  expect(proposed).toMatchObject({
    status: 'proposed',
    sessionId: SESSION_ID,
    proposalId: PROPOSAL_ID,
    craftId: 'philia',
    targetShipId: 'dione',
    targetConsoleId: 'reactor',
    targetRevision: 0,
    materialGain: 3,
  });
  expect(replayedProposal).toMatchObject({ status: 'replayed', proposalId: PROPOSAL_ID });
  expect(store.committedWrites).toHaveLength(proposalWrites);

  const consented = await callables.consentToPermissionedDismantling(consentRequest());
  expect(consented).toMatchObject({
    status: 'consented',
    proposalId: PROPOSAL_ID,
    consentId: CONSENT_ID,
    targetRevision: 0,
  });
  expect(store.records.get(paths().consent)).toMatchObject({
    type: 'permissioned-dismantling-consent',
    status: 'granted',
    actorUid: 'target-player',
    craftId: 'philia',
    targetShipId: 'dione',
    targetConsoleId: 'reactor',
    targetRevision: 0,
    materialGain: 3,
  });

  const applied = await callables.applyPermissionedDismantling(applyRequest());
  const applyWrites = store.committedWrites.length;
  expect(applied).toMatchObject({
    status: 'applied',
    proposalId: PROPOSAL_ID,
    consentId: CONSENT_ID,
    targetShipId: 'dione',
    targetConsoleId: 'reactor',
    targetRevision: 1,
    materialsAfter: 8,
  });
  expect(store.records.get(paths().session)).toMatchObject({
    shipDamage: { dione: { damagedSystemIds: ['storage', 'reactor'], destroyed: false } },
    shipResources: { dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 8, securityTeams: 2 } },
  });
  expect(store.records.get(paths().proposal)).toMatchObject({ status: 'applied', consumedConsentId: CONSENT_ID });
  expect(store.records.get(paths().consent)).toMatchObject({
    status: 'consumed',
    actorUid: 'target-player',
    consumedByUid: 'engineer',
  });
  expect(store.records.get(paths().targetState)).toMatchObject({
    type: 'permissioned-dismantling-target-state',
    sessionId: SESSION_ID,
    targetShipId: 'dione',
    revision: 1,
  });

  const replayedApply = await callables.applyPermissionedDismantling(applyRequest());
  expect(replayedApply).toMatchObject({ status: 'replayed', requestId: APPLY_ID });
  expect(store.committedWrites).toHaveLength(applyWrites);
  await expect(callables.applyPermissionedDismantling(applyRequest({ requestId: 'apply-2' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(store.committedWrites).toHaveLength(applyWrites);
});

it('rejects malformed requests, ineligible craft actors, self-consent, and a player assigned to another ship without writes', async () => {
  const malformedStore = seededStore();
  const malformed = createPermissionedDismantlingCallables(dependencies(malformedStore));
  await expect(malformed.proposePermissionedDismantling(proposeRequest({ unexpected: true })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(malformed.proposePermissionedDismantling(proposeRequest({ targetConsoleId: 'not-a-console' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(malformedStore.committedWrites).toHaveLength(0);

  const unauthorizedStore = seededStore();
  const unauthorized = createPermissionedDismantlingCallables(dependencies(unauthorizedStore));
  await expect(unauthorized.proposePermissionedDismantling(request('target-player', {
    sessionId: SESSION_ID,
    proposalId: PROPOSAL_ID,
    craftId: 'philia',
    targetShipId: 'dione',
    targetConsoleId: 'reactor',
    expectedTargetRevision: 0,
    expectedControlRevision: 4,
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(unauthorizedStore.committedWrites).toHaveLength(0);

  const selfStore = seededStore();
  const selfConsent = createPermissionedDismantlingCallables(dependencies(selfStore));
  await selfConsent.proposePermissionedDismantling(proposeRequest());
  const beforeSelfConsent = selfStore.committedWrites.length;
  await expect(selfConsent.consentToPermissionedDismantling(consentRequest('engineer')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(selfStore.committedWrites).toHaveLength(beforeSelfConsent);
  expect(selfStore.records.has(paths().consent)).toBe(false);

  const wrongShipStore = seededStore();
  const wrongShip = createPermissionedDismantlingCallables(dependencies(wrongShipStore));
  await wrongShip.proposePermissionedDismantling(proposeRequest());
  const beforeWrongShip = wrongShipStore.committedWrites.length;
  await expect(wrongShip.consentToPermissionedDismantling(consentRequest('other-ship-player')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(wrongShipStore.committedWrites).toHaveLength(beforeWrongShip);
  expect(wrongShipStore.records.has(paths().consent)).toBe(false);
});

it('returns a stale revision without writes when the target changes after consent', async () => {
  const store = seededStore();
  const callables = createPermissionedDismantlingCallables(dependencies(store));
  await callables.proposePermissionedDismantling(proposeRequest());
  await callables.consentToPermissionedDismantling(consentRequest());
  const before = store.committedWrites.length;
  const session = store.records.get(paths().session)!;
  session.shipDamage = { dione: { damagedSystemIds: ['storage', 'hydroponics'], destroyed: false } };
  store.records.set(paths().session, session);

  await expect(callables.applyPermissionedDismantling(applyRequest())).resolves.toMatchObject({
    status: 'stale',
    expectedTargetRevision: 0,
    currentTargetRevision: 1,
  });
  expect(store.committedWrites).toHaveLength(before);
  expect(store.records.get(paths().consent)).toMatchObject({ status: 'granted' });
  expect(store.records.get(paths().proposal)).toMatchObject({ status: 'pending' });
});

it('requires a fresh target revision and current craft control both when proposing and when applying', async () => {
  const staleProposalStore = seededStore();
  const staleProposal = createPermissionedDismantlingCallables(dependencies(staleProposalStore));
  await expect(staleProposal.proposePermissionedDismantling(proposeRequest({ expectedTargetRevision: 1 })))
    .resolves.toMatchObject({ status: 'stale', expectedTargetRevision: 1, currentTargetRevision: 0 });
  expect(staleProposalStore.committedWrites).toHaveLength(0);

  const staleControlStore = seededStore();
  const staleControl = createPermissionedDismantlingCallables(dependencies(staleControlStore));
  await staleControl.proposePermissionedDismantling(proposeRequest());
  await staleControl.consentToPermissionedDismantling(consentRequest());
  const before = staleControlStore.committedWrites.length;
  const session = staleControlStore.records.get(paths().session)!;
  session.shuttleControl = {
    philia: { shuttleId: 'philia', ownerRoleId: 'dione-engineer', ownerUid: 'engineer', holderUid: 'another-player', revision: 5 },
  };
  staleControlStore.records.set(paths().session, session);

  await expect(staleControl.applyPermissionedDismantling(applyRequest()))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(staleControlStore.committedWrites).toHaveLength(before);
  expect(staleControlStore.records.get(paths().consent)).toMatchObject({ status: 'granted' });
  expect(staleControlStore.records.get(paths().session)).toMatchObject({
    shipDamage: { dione: { damagedSystemIds: ['storage'], destroyed: false } },
  });
});

it('lets only the consenting target player revoke, and never applies a revoked or reused consent', async () => {
  const store = seededStore();
  const callables = createPermissionedDismantlingCallables(dependencies(store));
  await callables.proposePermissionedDismantling(proposeRequest());
  await callables.consentToPermissionedDismantling(consentRequest());
  const beforeUnauthorizedRevoke = store.committedWrites.length;
  await expect(callables.revokePermissionedDismantlingConsent(request('other-ship-player', {
    sessionId: SESSION_ID,
    proposalId: PROPOSAL_ID,
    consentId: CONSENT_ID,
  })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.committedWrites).toHaveLength(beforeUnauthorizedRevoke);

  await callables.revokePermissionedDismantlingConsent(request('target-player', {
    sessionId: SESSION_ID,
    proposalId: PROPOSAL_ID,
    consentId: CONSENT_ID,
  }));
  const beforeApply = store.committedWrites.length;
  await expect(callables.applyPermissionedDismantling(applyRequest()))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(store.committedWrites).toHaveLength(beforeApply);
  expect(store.records.get(paths().consent)).toMatchObject({ status: 'revoked' });
  expect(store.records.get(paths().session)).toMatchObject({
    shipDamage: { dione: { damagedSystemIds: ['storage'], destroyed: false } },
    shipResources: { dione: { materials: 5 } },
  });
});

it('rejects an inactive target, changed docking, an already-damaged console, and material overflow atomically', async () => {
  const inactiveStore = seededStore();
  const inactive = createPermissionedDismantlingCallables(dependencies(inactiveStore));
  await inactive.proposePermissionedDismantling(proposeRequest());
  await inactive.consentToPermissionedDismantling(consentRequest());
  inactiveStore.records.get(paths().targetPlayer)!.connected = false;
  const beforeInactive = inactiveStore.committedWrites.length;
  await expect(inactive.applyPermissionedDismantling(applyRequest()))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(inactiveStore.committedWrites).toHaveLength(beforeInactive);

  const undockedStore = seededStore();
  const undocked = createPermissionedDismantlingCallables(dependencies(undockedStore));
  await undocked.proposePermissionedDismantling(proposeRequest());
  const session = undockedStore.records.get(paths().session)!;
  session.shuttleDockings = [{ shuttleId: 'philia', shipId: 'icebreaker', dockedAt: 'moved' }];
  undockedStore.records.set(paths().session, session);
  const beforeUndocked = undockedStore.committedWrites.length;
  await expect(undocked.consentToPermissionedDismantling(consentRequest()))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(undockedStore.committedWrites).toHaveLength(beforeUndocked);

  for (const damage of [
    { damagedSystemIds: ['reactor'], destroyed: false },
    { damagedSystemIds: ['storage'], destroyed: true },
  ]) {
    const store = seededStore();
    const callables = createPermissionedDismantlingCallables(dependencies(store));
    await callables.proposePermissionedDismantling(proposeRequest());
    await callables.consentToPermissionedDismantling(consentRequest());
    const changedSession = store.records.get(paths().session)!;
    changedSession.shipDamage = { dione: damage };
    store.records.set(paths().session, changedSession);
    const before = store.committedWrites.length;
    await expect(callables.applyPermissionedDismantling(applyRequest()))
      .resolves.toMatchObject({ status: 'stale' });
    expect(store.committedWrites).toHaveLength(before);
  }

  const overflowStore = seededStore();
  const overflow = createPermissionedDismantlingCallables(dependencies(overflowStore));
  await overflow.proposePermissionedDismantling(proposeRequest());
  await overflow.consentToPermissionedDismantling(consentRequest());
  const overflowSession = overflowStore.records.get(paths().session)!;
  overflowSession.shipResources = {
    dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: Number.MAX_SAFE_INTEGER, securityTeams: 2 },
  };
  overflowStore.records.set(paths().session, overflowSession);
  const beforeOverflow = overflowStore.committedWrites.length;
  await expect(overflow.applyPermissionedDismantling(applyRequest())).resolves.toMatchObject({ status: 'stale' });
  expect(overflowStore.committedWrites).toHaveLength(beforeOverflow);
});

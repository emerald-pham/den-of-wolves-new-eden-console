import { Firestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { createPermissionedDismantlingCallables } from './permissionedDismantlingCallable';
import { startTurnPhase } from './turnZero';

type Fields = Record<string, unknown>;
type Write = { readonly kind: 'set' | 'create' | 'update'; readonly path: string; readonly data: Fields };

const SESSION_ID = 's1';
const PROPOSAL_ID = 'proposal-1';
const CONSENT_ID = 'consent-1';
const APPLY_ID = 'apply-1';
// Offline SDK instance: only used to reject update maps real Firestore would refuse.
const firestoreUpdateValidator = new Firestore({ projectId: 'c1-offline-update-map-validation' });

afterAll(async () => {
  await firestoreUpdateValidator.terminate();
});

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
  validateUpdateMapsWithFirestore = false;

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
        if (this.validateUpdateMapsWithFirestore) {
          firestoreUpdateValidator.batch().update(firestoreUpdateValidator.doc(ref.path), data);
        }
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
    inbox: 'sessions/' + sessionId + '/permissionedDismantlingInboxes/dione',
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
    updatedAt: 'session-v1',
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
  expect(store.records.get(paths().inbox)).toMatchObject({
    type: 'permissioned-dismantling-inbox',
    sessionId: SESSION_ID,
    targetShipId: 'dione',
    proposalId: PROPOSAL_ID,
    craftId: 'philia',
    targetConsoleId: 'reactor',
    targetRevision: 0,
    materialGain: 3,
    status: 'pending',
  });
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
  expect(store.records.get(paths().inbox)).toMatchObject({
    proposalId: PROPOSAL_ID,
    consentId: CONSENT_ID,
    status: 'consented',
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
  expect(store.records.get(paths().inbox)).toMatchObject({
    proposalId: PROPOSAL_ID,
    consentId: CONSENT_ID,
    status: 'applied',
    materialsAfter: 8,
  });

  const replayedApply = await callables.applyPermissionedDismantling(applyRequest());
  expect(replayedApply).toMatchObject({ status: 'replayed', requestId: APPLY_ID });
  expect(store.committedWrites).toHaveLength(applyWrites);
  await expect(callables.applyPermissionedDismantling(applyRequest({ requestId: 'apply-2' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(store.committedWrites).toHaveLength(applyWrites);
});

it('binds an omitted private target revision to the server-observed proposal state and replays safely', async () => {
  const store = seededStore();
  const callables = createPermissionedDismantlingCallables(dependencies(store));
  const data = { ...proposeRequest().data };
  delete data.expectedTargetRevision;

  await expect(callables.proposePermissionedDismantling(request('engineer', data)))
    .resolves.toMatchObject({ status: 'proposed', targetRevision: 0 });
  await expect(callables.proposePermissionedDismantling(request('engineer', data)))
    .resolves.toMatchObject({ status: 'replayed', targetRevision: 0 });
  expect(store.committedWrites.filter(({ path }) => path === paths().proposal)).toHaveLength(1);
});

it('keeps one active consent request visible per target ship', async () => {
  const store = seededStore();
  const callables = createPermissionedDismantlingCallables(dependencies(store));
  await callables.proposePermissionedDismantling(proposeRequest());
  const writesAfterFirstProposal = store.committedWrites.length;

  await expect(callables.proposePermissionedDismantling(proposeRequest({
    proposalId: 'proposal-2',
    targetConsoleId: 'hydroponics',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(store.committedWrites).toHaveLength(writesAfterFirstProposal);
  expect(store.records.get(paths().inbox)).toMatchObject({ proposalId: PROPOSAL_ID, status: 'pending' });
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

it('uses the current vessel-bound replacement role to identify a target-ship player', async () => {
  const store = seededStore();
  const target = store.records.get(paths().targetPlayer)!;
  target.assignedRoleId = 'admiral';
  target.replacementRoleId = 'vip-host';
  target.replacementStatus = null;
  const callables = createPermissionedDismantlingCallables(dependencies(store));

  await callables.proposePermissionedDismantling(proposeRequest());
  await expect(callables.consentToPermissionedDismantling(consentRequest())).resolves.toMatchObject({
    status: 'consented',
    consentId: CONSENT_ID,
  });
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

it('invalidates consent after a target change is reverted before apply', async () => {
  const store = seededStore();
  const callables = createPermissionedDismantlingCallables(dependencies(store));
  await callables.proposePermissionedDismantling(proposeRequest());
  await callables.consentToPermissionedDismantling(consentRequest());
  const session = store.records.get(paths().session)!;
  const originalDamage = structuredClone(session.shipDamage);
  session.shipDamage = { dione: { damagedSystemIds: ['storage', 'hydroponics'], destroyed: false } };
  session.updatedAt = 'session-v2';
  store.records.set(paths().session, session);
  session.shipDamage = originalDamage;
  session.updatedAt = 'session-v3';
  store.records.set(paths().session, session);
  const before = store.committedWrites.length;

  await expect(callables.applyPermissionedDismantling(applyRequest())).resolves.toMatchObject({
    status: 'stale',
    expectedTargetRevision: 0,
    currentTargetRevision: 1,
  });
  expect(store.committedWrites).toHaveLength(before);
  expect(store.records.get(paths().consent)).toMatchObject({ status: 'granted' });
  expect(store.records.get(paths().session)).toMatchObject({
    shipDamage: { dione: { damagedSystemIds: ['storage'], destroyed: false } },
    shipResources: { dione: { materials: 5 } },
  });
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
  expect(store.records.get(paths().inbox)).toMatchObject({
    proposalId: PROPOSAL_ID,
    consentId: CONSENT_ID,
    status: 'revoked',
  });
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

it('requires a new proposal after the target player revokes the exact request', async () => {
  const store = seededStore();
  const callables = createPermissionedDismantlingCallables(dependencies(store));
  await callables.proposePermissionedDismantling(proposeRequest());
  await callables.consentToPermissionedDismantling(consentRequest());
  await callables.revokePermissionedDismantlingConsent(request('target-player', {
    sessionId: SESSION_ID, proposalId: PROPOSAL_ID, consentId: CONSENT_ID,
  }));
  const writesBeforeReconsent = store.committedWrites.length;

  await expect(callables.consentToPermissionedDismantling(consentRequest('target-player', {
    consentId: 'consent-new',
  }))).rejects.toThrow(/new request|pending/i);

  expect(store.committedWrites).toHaveLength(writesBeforeReconsent);
  expect(store.records.get(paths().inbox)).toMatchObject({ status: 'revoked', consentId: CONSENT_ID });
});

it('lets the target player decline a pending proposal without damage or materials changes', async () => {
  const store = seededStore();
  const callables = createPermissionedDismantlingCallables(dependencies(store));
  await callables.proposePermissionedDismantling(proposeRequest());
  const beforeDamage = structuredClone(store.records.get(paths().session)?.shipDamage);
  const beforeResources = structuredClone(store.records.get(paths().session)?.shipResources);
  const declineRequest = request('target-player', { sessionId: SESSION_ID, proposalId: PROPOSAL_ID });

  await expect(callables.declinePermissionedDismantling(declineRequest))
    .resolves.toMatchObject({ status: 'declined', proposalId: PROPOSAL_ID });
  const writesAfterDecision = store.committedWrites.length;
  await expect(callables.declinePermissionedDismantling(declineRequest))
    .resolves.toMatchObject({ status: 'replayed', proposalId: PROPOSAL_ID });

  expect(store.committedWrites).toHaveLength(writesAfterDecision);
  expect(store.records.get(paths().session)?.shipDamage).toEqual(beforeDamage);
  expect(store.records.get(paths().session)?.shipResources).toEqual(beforeResources);
  expect(store.records.get(paths().inbox)).toMatchObject({ status: 'declined', consentId: null });
});

it('does not let the craft holder decline for the target or decline after consent', async () => {
  const store = seededStore();
  const callables = createPermissionedDismantlingCallables(dependencies(store));
  await callables.proposePermissionedDismantling(proposeRequest());
  const beforeUnauthorized = store.committedWrites.length;

  await expect(callables.declinePermissionedDismantling(request('engineer', {
    sessionId: SESSION_ID, proposalId: PROPOSAL_ID,
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.committedWrites).toHaveLength(beforeUnauthorized);

  await callables.consentToPermissionedDismantling(consentRequest());
  const afterConsent = store.committedWrites.length;
  await expect(callables.declinePermissionedDismantling(request('target-player', {
    sessionId: SESSION_ID, proposalId: PROPOSAL_ID,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(store.committedWrites).toHaveLength(afterConsent);
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

for (const replacementStatus of ['awaiting-re-role', 'awaiting-console']) {
  it(`rejects new target consent through a historical role while ${replacementStatus}`, async () => {
    const store = seededStore();
    const callables = createPermissionedDismantlingCallables(dependencies(store));
    await callables.proposePermissionedDismantling(proposeRequest());
    store.records.set(paths().targetPlayer, {
      ...activePlayer('dione-captain'), replacementStatus,
    });
    const writes = store.committedWrites.length;
    await expect(callables.consentToPermissionedDismantling(consentRequest()))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.committedWrites).toHaveLength(writes);
  });

  it(`rechecks target consent before apply when historical role is ${replacementStatus}`, async () => {
    const store = seededStore();
    const callables = createPermissionedDismantlingCallables(dependencies(store));
    await callables.proposePermissionedDismantling(proposeRequest());
    await callables.consentToPermissionedDismantling(consentRequest());
    store.records.set(paths().targetPlayer, {
      ...activePlayer('dione-captain'), replacementStatus,
    });
    const writes = store.committedWrites.length;
    await expect(callables.applyPermissionedDismantling(applyRequest()))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.committedWrites).toHaveLength(writes);
    expect(store.records.get(paths().session)).toMatchObject({
      shipDamage: { dione: { damagedSystemIds: ['storage'] } },
      shipResources: { dione: { materials: 5 } },
    });
  });
}

describe('Macaw deliberate dismantling', () => {
  const NOW = Date.parse('2026-09-30T17:00:00.000Z');
  const capybaraInbox = 'sessions/' + SESSION_ID + '/permissionedDismantlingInboxes/capybara';
  const capybaraTargetState = 'sessions/' + SESSION_ID + '/permissionedDismantlingTargetStates/capybara';
  const fleetGroup = 'sessions/' + SESSION_ID + '/fleetGroups/fleet-1';
  const macawPropose = (overrides: Fields = {}) => proposeRequest({
    craftId: 'macaw', expectedControlRevision: 9, ...overrides,
  });

  /** The Capybara Captain ('engineer' uid) holds Macaw, docked at Dione, during live Coordination. */
  function macawStore(): FakeStore {
    const store = seededStore();
    const p = paths();
    const session = store.records.get(p.session)!;
    session.activeRoleIds = ['capybara-captain', 'capybara-recycler', 'dione-captain', 'icebreaker-miner'];
    session.activeVesselIds = ['dione', 'icebreaker', 'capybara'];
    session.currentTurn = 2;
    session.turnPhase = {
      ...startTurnPhase(2, NOW - 6 * 60_000),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    };
    session.shuttleFuelled = { macaw: false };
    session.shuttleDockings = [{ shuttleId: 'macaw', shipId: 'dione', dockedAt: 'SESSION START' }];
    session.shuttleControl = {
      macaw: {
        shuttleId: 'macaw', ownerRoleId: 'capybara-captain', ownerUid: 'engineer',
        holderUid: 'engineer', revision: 9,
      },
    };
    session.shipDamage = {
      dione: { damagedSystemIds: ['storage'], destroyed: false },
      capybara: { damagedSystemIds: [], destroyed: false },
    };
    session.shipResources = {
      dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 5, securityTeams: 2 },
      capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 },
    };
    store.records.set(p.proposer, { ...activePlayer('capybara-captain'),
      activeConsoleRoleId: 'capybara-captain', fleetGroupId: 'fleet-1' });
    store.records.set('sessions/' + SESSION_ID + '/players/recycler', activePlayer('capybara-recycler'));
    store.records.set(fleetGroup, { id: 'fleet-1', vesselIds: ['dione', 'icebreaker', 'capybara'],
      memberUids: ['engineer', 'recycler', 'target-player', 'other-ship-player'] });
    return store;
  }

  function dockAtCapybara(store: FakeStore): void {
    store.records.get(paths().session)!.shuttleDockings = [
      { shuttleId: 'macaw', shipId: 'capybara', dockedAt: 'SESSION START' },
    ];
  }

  async function proposeAndConsent(store: FakeStore) {
    const callables = createPermissionedDismantlingCallables(dependencies(store));
    await callables.proposePermissionedDismantling(macawPropose());
    await callables.consentToPermissionedDismantling(consentRequest());
    return callables;
  }

  it('damages one consented Dione console and credits exactly one Capybara Scrap, once', async () => {
    const store = macawStore();
    const callables = createPermissionedDismantlingCallables(dependencies(store));

    const proposed = await callables.proposePermissionedDismantling(macawPropose());
    expect(proposed).toMatchObject({
      status: 'proposed', craftId: 'macaw', targetShipId: 'dione', targetConsoleId: 'reactor', scrapGain: 1,
    });
    expect(proposed).not.toHaveProperty('materialGain');
    expect(store.records.get(paths().inbox)).toEqual(expect.objectContaining({
      craftId: 'macaw', scrapGain: 1, status: 'pending', scrapAfter: null,
    }));
    expect(store.records.get(paths().inbox)).not.toHaveProperty('materialGain');
    expect(store.records.get(paths().inbox)).not.toHaveProperty('materialsAfter');

    await callables.consentToPermissionedDismantling(consentRequest());
    const applied = await callables.applyPermissionedDismantling(applyRequest());
    expect(applied).toEqual({
      status: 'applied', sessionId: SESSION_ID, requestId: APPLY_ID, proposalId: PROPOSAL_ID,
      consentId: CONSENT_ID, targetShipId: 'dione', targetConsoleId: 'reactor', targetRevision: 1,
      scrapGain: 1, scrapAfter: 4,
    });
    expect(store.records.get(paths().session)).toMatchObject({
      shipDamage: { dione: { damagedSystemIds: ['storage', 'reactor'], destroyed: false } },
      shipResources: {
        dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 5, securityTeams: 2 },
        capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 4 },
      },
      macawRepairs: { cycle: 2, revision: 1, hosts: [{ shipId: 'dione', systemIds: ['reactor'] }] },
    });
    expect(store.records.get(paths().inbox)).toMatchObject({ status: 'applied', scrapAfter: 4 });

    const writes = store.committedWrites.length;
    await expect(callables.applyPermissionedDismantling(applyRequest()))
      .resolves.toMatchObject({ status: 'replayed', scrapAfter: 4 });
    await expect(callables.applyPermissionedDismantling(applyRequest({ requestId: 'apply-competing' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.committedWrites).toHaveLength(writes);
    expect(store.records.get(paths().session)).toMatchObject({ shipResources: { capybara: { scrap: 4 } } });
  });

  it('lets a different active Capybara player approve host dismantling, never the Macaw holder', async () => {
    const store = macawStore();
    dockAtCapybara(store);
    const callables = createPermissionedDismantlingCallables(dependencies(store));
    await callables.proposePermissionedDismantling(macawPropose({
      targetShipId: 'capybara', targetConsoleId: 'advanced-hydroponics',
    }));
    expect(store.records.get(capybaraInbox)).toMatchObject({ targetShipId: 'capybara', status: 'pending', scrapGain: 1 });

    const proposedWrites = store.committedWrites.length;
    await expect(callables.consentToPermissionedDismantling(consentRequest('engineer')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(callables.consentToPermissionedDismantling(consentRequest('target-player')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.committedWrites).toHaveLength(proposedWrites);
    expect(store.records.has(paths().consent)).toBe(false);

    await callables.consentToPermissionedDismantling(consentRequest('recycler'));
    store.validateUpdateMapsWithFirestore = true;
    await expect(callables.applyPermissionedDismantling(applyRequest()))
      .resolves.toMatchObject({ status: 'applied', targetShipId: 'capybara', scrapGain: 1, scrapAfter: 4 });
    expect(store.records.get(paths().session)).toMatchObject({
      shipDamage: { capybara: { damagedSystemIds: ['advanced-hydroponics'], destroyed: false } },
      shipResources: { capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 4 } },
      macawRepairs: { cycle: 2, revision: 1, hosts: [{ shipId: 'capybara', systemIds: ['advanced-hydroponics'] }] },
    });
    expect(store.records.get(capybaraTargetState)).toMatchObject({ revision: 1 });

    const writes = store.committedWrites.length;
    await expect(callables.applyPermissionedDismantling(applyRequest()))
      .resolves.toMatchObject({ status: 'replayed', scrapAfter: 4 });
    expect(store.committedWrites).toHaveLength(writes);
    expect(store.records.get(paths().session)).toMatchObject({ shipResources: { capybara: { scrap: 4 } } });
  });

  it('rejects a Macaw request from anyone but the current holder without writes', async () => {
    const store = macawStore();
    const callables = createPermissionedDismantlingCallables(dependencies(store));
    await expect(callables.proposePermissionedDismantling({ ...macawPropose(), auth: { uid: 'recycler' } }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.committedWrites).toHaveLength(0);

    await callables.proposePermissionedDismantling(macawPropose());
    await callables.consentToPermissionedDismantling(consentRequest());
    const writes = store.committedWrites.length;
    for (const uid of ['recycler', 'target-player']) {
      await expect(callables.applyPermissionedDismantling({ ...applyRequest(), auth: { uid } }))
        .rejects.toMatchObject({ code: 'permission-denied' });
    }
    expect(store.committedWrites).toHaveLength(writes);
    expect(store.records.get(paths().consent)).toMatchObject({ status: 'granted' });
  });

  it('rejects a Macaw request that carries an engineering material gain', async () => {
    const store = macawStore();
    const callables = createPermissionedDismantlingCallables(dependencies(store));
    await expect(callables.proposePermissionedDismantling(macawPropose({ materialGain: 3 })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(store.committedWrites).toHaveLength(0);
  });

  it.each([
    ['Team Phase', (session: Fields) => {
      session.turnPhase = { ...(session.turnPhase as Fields), airspace: { state: 'restricted', tickerActive: true, pressAccess: false } };
    }],
    ['an expired Coordination window', (session: Fields) => {
      session.turnPhase = { ...(session.turnPhase as Fields), openAirspaceEndsAt: new Date(NOW - 1).toISOString() };
    }],
    ['a stale phase cycle', (session: Fields) => { session.currentTurn = 3; }],
    ['two consoles already repaired on this ship', (session: Fields) => {
      session.macawRepairs = { cycle: 2, revision: 2, hosts: [{ shipId: 'dione', systemIds: ['storage', 'jump-drive'] }] };
    }],
    ['an unfuelled second ship', (session: Fields) => {
      session.macawRepairs = { cycle: 2, revision: 1, hosts: [{ shipId: 'icebreaker', systemIds: ['reactor'] }] };
    }],
    ['a disabled Capybara', (session: Fields) => { session.activeVesselIds = ['dione', 'icebreaker']; }],
  ] as const)('rejects fresh Macaw dismantling during %s without consuming consent', async (_label, change) => {
    const store = macawStore();
    const callables = await proposeAndConsent(store);
    change(store.records.get(paths().session)!);
    const writes = store.committedWrites.length;

    await expect(callables.applyPermissionedDismantling(applyRequest()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.committedWrites).toHaveLength(writes);
    expect(store.records.has(paths().applyReceipt)).toBe(false);
    expect(store.records.get(paths().consent)).toMatchObject({ status: 'granted' });
    expect(store.records.get(paths().session)).toMatchObject({ shipResources: { capybara: { scrap: 3 } } });
  });

  /** Matches repairConsolesFromMacaw: current group holds the target and the Capybara, no pursuit pause. */
  it.each([
    ['a target outside the holder’s fleet group', (store: FakeStore) => {
      store.records.set(fleetGroup, { id: 'fleet-1', vesselIds: ['icebreaker', 'capybara'],
        memberUids: ['engineer', 'recycler'] });
    }, 'permission-denied'],
    ['a fleet group without the Capybara', (store: FakeStore) => {
      store.records.set(fleetGroup, { id: 'fleet-1', vesselIds: ['dione', 'icebreaker'],
        memberUids: ['engineer', 'recycler', 'target-player'] });
    }, 'permission-denied'],
    ['a holder whose group pointer is stale', (store: FakeStore) => {
      store.records.get(paths().proposer)!.fleetGroupId = 'fleet-2';
    }, 'permission-denied'],
    ['a holder not on the Capybara Captain console', (store: FakeStore) => {
      store.records.get(paths().proposer)!.activeConsoleRoleId = 'dione-captain';
    }, 'permission-denied'],
    ['a pending pursuit emergency decision', (store: FakeStore) => {
      store.records.get(paths().session)!.pursuitEmergencyWindow = { type: 'pursuit-emergency-window',
        status: 'awaiting-gm-decision', cycle: 2, openedAt: '2026-09-30T16:59:00.000Z' };
    }, 'failed-precondition'],
  ] as const)('rejects a Macaw proposal for %s without writes', async (_label, change, code) => {
    const store = macawStore();
    change(store);
    const callables = createPermissionedDismantlingCallables(dependencies(store));
    await expect(callables.proposePermissionedDismantling(macawPropose())).rejects.toMatchObject({ code });
    expect(store.committedWrites).toHaveLength(0);
  });

  it.each([
    ['the target moved to another fleet group', (store: FakeStore) => {
      store.records.set(fleetGroup, { id: 'fleet-1', vesselIds: ['icebreaker', 'capybara'],
        memberUids: ['engineer', 'recycler'] });
    }, 'permission-denied'],
    ['a pending pursuit emergency decision', (store: FakeStore) => {
      store.records.get(paths().session)!.pursuitEmergencyWindow = { type: 'pursuit-emergency-window',
        status: 'offered', cycle: 2, openedAt: '2026-09-30T16:59:00.000Z' };
    }, 'failed-precondition'],
  ] as const)('rejects a consented Macaw apply when %s, keeping the consent unused', async (_label, change, code) => {
    const store = macawStore();
    const callables = await proposeAndConsent(store);
    change(store);
    const writes = store.committedWrites.length;
    await expect(callables.applyPermissionedDismantling(applyRequest())).rejects.toMatchObject({ code });
    expect(store.committedWrites).toHaveLength(writes);
    expect(store.records.get(paths().consent)).toMatchObject({ status: 'granted' });
    expect(store.records.get(paths().session)).toMatchObject({ shipResources: { capybara: { scrap: 3 } } });
  });

  it('rejects consent once the target has left the Macaw holder’s fleet group', async () => {
    const store = macawStore();
    const callables = createPermissionedDismantlingCallables(dependencies(store));
    await callables.proposePermissionedDismantling(macawPropose());
    store.records.set(fleetGroup, { id: 'fleet-1', vesselIds: ['icebreaker', 'capybara'],
      memberUids: ['engineer', 'recycler'] });
    const writes = store.committedWrites.length;
    await expect(callables.consentToPermissionedDismantling(consentRequest()))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.committedWrites).toHaveLength(writes);
  });
});

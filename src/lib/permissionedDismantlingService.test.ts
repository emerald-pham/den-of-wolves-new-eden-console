import { beforeEach, expect, it, vi } from 'vitest';

interface MockCurrent {
  session: {
    id: string;
    phase: string;
    shuttleControl: Record<string, { holderUid: string; revision: number }>;
    shuttleDockings: { shuttleId: string; shipId: string; dockedAt: string }[];
  };
  me: {
    uid: string;
    sessionId: string;
    role: string;
    assignedRoleId: string | null;
    activeConsoleRoleId: string | null;
    replacementRoleId: string | null;
    replacementStatus: string | null;
  };
}

const mocks = vi.hoisted(() => ({
  callable: vi.fn(),
  onSnapshot: vi.fn(),
  doc: vi.fn((_database: unknown, path: string) => ({ path })),
  current: {} as MockCurrent,
}));

vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('firebase/firestore', () => ({ doc: mocks.doc, onSnapshot: mocks.onSnapshot }));
vi.mock('./firebase', () => ({ functions: vi.fn(() => 'functions') }));
vi.mock('./firestore', () => ({ db: vi.fn(() => 'firestore') }));
vi.mock('./sessionMutationAuthority', () => ({
  hasFreshSessionAuthority: vi.fn(() => true),
  requireFreshSessionAuthority: vi.fn(),
}));
vi.mock('@/store/useSessionStore', () => ({
  useSessionStore: { getState: () => mocks.current },
}));

import {
  applyPermissionedDismantling,
  consentToPermissionedDismantling,
  declinePermissionedDismantling,
  proposePermissionedDismantling,
  subscribePermissionedDismantlingInbox,
} from './permissionedDismantlingService';

const inbox = {
  type: 'permissioned-dismantling-inbox' as const,
  sessionId: 's1', targetShipId: 'dione', proposalId: 'proposal-1',
  proposerUid: 'engineer', craftId: 'philia', targetConsoleId: 'reactor',
  targetRevision: 9, materialGain: 3, status: 'pending' as const,
  consentId: null, materialsAfter: null, updatedAt: new Date('2026-09-30T17:00:00.000Z'),
} as const;

beforeEach(() => {
  mocks.callable.mockReset();
  mocks.doc.mockClear();
  mocks.onSnapshot.mockReset();
  mocks.current = {
    session: {
      id: 's1', phase: 'active',
      shuttleControl: { philia: { holderUid: 'engineer', revision: 4 } },
      shuttleDockings: [{ shuttleId: 'philia', shipId: 'dione', dockedAt: 'SESSION START' }],
    },
    me: {
      uid: 'engineer', sessionId: 's1', role: 'player', assignedRoleId: 'dione-engineer',
      activeConsoleRoleId: 'dione-engineer', replacementRoleId: null, replacementStatus: null,
    },
  };
});

it('proposes against the live dock and control but leaves the private target revision server-bound', async () => {
  const call = vi.fn().mockResolvedValue({ data: {
    status: 'proposed', sessionId: 's1', proposalId: 'proposal-1', craftId: 'philia',
    targetShipId: 'dione', targetConsoleId: 'reactor', targetRevision: 9,
    controlRevision: 4, materialGain: 3,
  } });
  mocks.callable.mockReturnValue(call);

  await expect(proposePermissionedDismantling({
    proposalId: 'proposal-1', craftId: 'philia', targetShipId: 'dione', targetConsoleId: 'reactor',
  })).resolves.toMatchObject({ status: 'proposed', targetRevision: 9 });

  expect(call).toHaveBeenCalledWith({
    sessionId: 's1', proposalId: 'proposal-1', craftId: 'philia',
    targetShipId: 'dione', targetConsoleId: 'reactor', expectedControlRevision: 4,
  });
});

it('routes a Macaw consent request to one distinct current host and validates its Scrap receipt', async () => {
  mocks.current = {
    session: {
      id: 's1', phase: 'active',
      shuttleControl: { macaw: { holderUid: 'captain', revision: 9 } },
      shuttleDockings: [{ shuttleId: 'macaw', shipId: 'dione', dockedAt: 'SESSION START' }],
    },
    me: {
      uid: 'captain', sessionId: 's1', role: 'player', assignedRoleId: 'capybara-captain',
      activeConsoleRoleId: 'capybara-captain', replacementRoleId: null, replacementStatus: null,
    },
  };
  const proposalCall = vi.fn().mockResolvedValue({ data: {
    status: 'proposed', sessionId: 's1', proposalId: 'macaw-proposal', craftId: 'macaw',
    targetShipId: 'dione', targetConsoleId: 'reactor', targetRevision: 3,
    controlRevision: 9, scrapGain: 1,
  } });
  mocks.callable.mockReturnValue(proposalCall);
  await expect(proposePermissionedDismantling({
    proposalId: 'macaw-proposal', craftId: 'macaw', targetShipId: 'dione', targetConsoleId: 'reactor',
  })).resolves.toMatchObject({ status: 'proposed', scrapGain: 1 });
  expect(proposalCall).toHaveBeenCalledWith({
    sessionId: 's1', proposalId: 'macaw-proposal', craftId: 'macaw',
    targetShipId: 'dione', targetConsoleId: 'reactor', expectedControlRevision: 9,
  });

  const macawInbox = {
    type: 'permissioned-dismantling-inbox', sessionId: 's1', targetShipId: 'dione',
    proposalId: 'macaw-proposal', proposerUid: 'captain', craftId: 'macaw',
    targetConsoleId: 'reactor', targetRevision: 3, scrapGain: 1, status: 'consented',
    consentId: 'macaw-consent', materialsAfter: null, scrapAfter: null,
    updatedAt: new Date('2026-09-30T17:00:00.000Z'),
  } as const;
  const applyCall = vi.fn().mockResolvedValue({ data: {
    status: 'applied', sessionId: 's1', requestId: 'macaw-apply', proposalId: 'macaw-proposal',
    consentId: 'macaw-consent', targetShipId: 'dione', targetConsoleId: 'reactor',
    targetRevision: 4, scrapGain: 1, scrapAfter: 4,
  } });
  mocks.callable.mockReturnValue(applyCall);
  await expect(applyPermissionedDismantling({ inbox: macawInbox, requestId: 'macaw-apply' }))
    .resolves.toMatchObject({ status: 'applied', scrapGain: 1, scrapAfter: 4 });
  expect(applyCall).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'macaw-apply', proposalId: 'macaw-proposal',
    consentId: 'macaw-consent', expectedTargetRevision: 3,
  });
});

it('routes Macaw host proposals and accepts the Capybara consent inbox and Scrap receipt', async () => {
  mocks.current.session.shuttleControl = { macaw: { holderUid: 'captain', revision: 9 } };
  mocks.current.session.shuttleDockings = [{ shuttleId: 'macaw', shipId: 'capybara', dockedAt: 'SESSION START' }];
  mocks.current.me = {
    uid: 'captain', sessionId: 's1', role: 'player', assignedRoleId: 'capybara-captain',
    activeConsoleRoleId: 'capybara-captain', replacementRoleId: null, replacementStatus: null,
  };
  const proposalCall = vi.fn().mockResolvedValue({ data: {
    status: 'proposed', sessionId: 's1', proposalId: 'macaw-host', craftId: 'macaw',
    targetShipId: 'capybara', targetConsoleId: 'advanced-hydroponics', targetRevision: 3,
    controlRevision: 9, scrapGain: 1,
  } });
  mocks.callable.mockReturnValue(proposalCall);
  await expect(proposePermissionedDismantling({
    proposalId: 'macaw-host', craftId: 'macaw', targetShipId: 'capybara',
    targetConsoleId: 'advanced-hydroponics',
  })).resolves.toMatchObject({ status: 'proposed', targetShipId: 'capybara', scrapGain: 1 });
  expect(proposalCall).toHaveBeenCalledWith({
    sessionId: 's1', proposalId: 'macaw-host', craftId: 'macaw', targetShipId: 'capybara',
    targetConsoleId: 'advanced-hydroponics', expectedControlRevision: 9,
  });

  const hostInbox = {
    type: 'permissioned-dismantling-inbox', sessionId: 's1', targetShipId: 'capybara',
    proposalId: 'macaw-host', proposerUid: 'captain', craftId: 'macaw',
    targetConsoleId: 'advanced-hydroponics', targetRevision: 3, scrapGain: 1,
    status: 'consented', consentId: 'macaw-host-consent', materialsAfter: null, scrapAfter: null,
    updatedAt: new Date('2026-09-30T17:00:00.000Z'),
  } as const;
  let publish: ((snapshot: unknown) => void) | undefined;
  const onInbox = vi.fn();
  const onError = vi.fn();
  mocks.onSnapshot.mockImplementation((_reference, _options, callback) => {
    publish = callback;
    return vi.fn();
  });
  subscribePermissionedDismantlingInbox('s1', 'capybara', { onInbox, onError });
  publish?.({ exists: () => true, metadata: { fromCache: false }, data: () => hostInbox });
  expect(onInbox).toHaveBeenLastCalledWith(hostInbox);
  expect(onError).not.toHaveBeenCalled();

  const applyCall = vi.fn().mockResolvedValue({ data: {
    status: 'applied', sessionId: 's1', requestId: 'macaw-host-apply', proposalId: 'macaw-host',
    consentId: 'macaw-host-consent', targetShipId: 'capybara', targetConsoleId: 'advanced-hydroponics',
    targetRevision: 4, scrapGain: 1, scrapAfter: 4,
  } });
  mocks.callable.mockReturnValue(applyCall);
  await expect(applyPermissionedDismantling({ inbox: hostInbox, requestId: 'macaw-host-apply' }))
    .resolves.toMatchObject({ status: 'applied', targetShipId: 'capybara', scrapGain: 1, scrapAfter: 4 });
});

it('sends consent bound to the exact target revision and exposes the completed inbox result to the proposer', async () => {
  mocks.current.me = {
    uid: 'target', sessionId: 's1', role: 'player', assignedRoleId: 'dione-captain',
    activeConsoleRoleId: 'dione-captain', replacementRoleId: null, replacementStatus: null,
  };
  const consentCall = vi.fn().mockResolvedValue({ data: {
    status: 'consented', consentStatus: 'granted', sessionId: 's1',
    proposalId: 'proposal-1', consentId: 'consent-1', targetRevision: 9,
  } });
  mocks.callable.mockReturnValue(consentCall);
  await expect(consentToPermissionedDismantling({ inbox, consentId: 'consent-1' }))
    .resolves.toMatchObject({ status: 'consented', targetRevision: 9 });
  expect(consentCall).toHaveBeenCalledWith({
    sessionId: 's1', proposalId: 'proposal-1', consentId: 'consent-1', expectedTargetRevision: 9,
  });

  mocks.current.me = {
    uid: 'engineer', sessionId: 's1', role: 'player', assignedRoleId: 'dione-engineer',
    activeConsoleRoleId: 'dione-engineer', replacementRoleId: null, replacementStatus: null,
  };
  const acceptedInbox = { ...inbox, status: 'consented' as const, consentId: 'consent-1' };
  const applyCall = vi.fn().mockResolvedValue({ data: {
    status: 'applied', sessionId: 's1', requestId: 'apply-1', proposalId: 'proposal-1',
    consentId: 'consent-1', targetShipId: 'dione', targetConsoleId: 'reactor',
    targetRevision: 10, materialGain: 3, materialsAfter: 8,
  } });
  mocks.callable.mockReturnValue(applyCall);
  await expect(applyPermissionedDismantling({ inbox: acceptedInbox, requestId: 'apply-1' }))
    .resolves.toMatchObject({ status: 'applied', targetRevision: 10, materialsAfter: 8 });
  expect(applyCall).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'apply-1', proposalId: 'proposal-1', consentId: 'consent-1',
    expectedTargetRevision: 9,
  });
});

it('subscribes to one exact ship inbox and clears cached or malformed projections', () => {
  let next: ((snapshot: unknown) => void) | undefined;
  const onInbox = vi.fn();
  const onError = vi.fn();
  mocks.onSnapshot.mockImplementation((_reference, _options, callback) => {
    next = callback;
    return vi.fn();
  });
  const unsubscribe = subscribePermissionedDismantlingInbox('s1', 'dione', { onInbox, onError });
  expect(mocks.doc).toHaveBeenCalledWith('firestore', 'sessions/s1/permissionedDismantlingInboxes/dione');
  expect(unsubscribe).toBeTypeOf('function');

  next?.({ exists: () => true, metadata: { fromCache: false }, data: () => inbox });
  expect(onInbox).toHaveBeenLastCalledWith(inbox);
  next?.({ exists: () => true, metadata: { fromCache: true }, data: () => inbox });
  expect(onInbox).toHaveBeenLastCalledWith(null);
  expect(onError).toHaveBeenCalledOnce();
  next?.({ exists: () => true, metadata: { fromCache: false }, data: () => ({ ...inbox, privatePayload: 'secret' }) });
  expect(onInbox).toHaveBeenLastCalledWith(null);
  expect(onError).toHaveBeenCalledTimes(2);
});

it('declines only the exact pending request for the current target player', async () => {
  mocks.current.me = {
    uid: 'target', sessionId: 's1', role: 'player', assignedRoleId: 'dione-captain',
    activeConsoleRoleId: 'dione-captain', replacementRoleId: null, replacementStatus: null,
  };
  const declineCall = vi.fn().mockResolvedValue({ data: {
    status: 'declined', sessionId: 's1', proposalId: 'proposal-1',
  } });
  mocks.callable.mockReturnValue(declineCall);

  await expect(declinePermissionedDismantling({ inbox }))
    .resolves.toMatchObject({ status: 'declined', proposalId: 'proposal-1' });
  expect(declineCall).toHaveBeenCalledWith({ sessionId: 's1', proposalId: 'proposal-1' });
});

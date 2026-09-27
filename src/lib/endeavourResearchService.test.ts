import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import {
  advanceEndeavourResearchTrack,
  createEndeavourResearchAttempt,
  readEndeavourResearchWorkspace,
  retryEndeavourResearchAttempt,
  type EndeavourResearchAttempt,
  type EndeavourResearchWorkspace,
} from './endeavourResearchService';

const workspace: EndeavourResearchWorkspace = {
  status: 'ready', sessionId: 's1', cycle: 3, researchRevision: 0,
  cadence: { cycle: 3, revision: 0, choices: [] },
  progress: { reactor: 1 },
  tracks: [{
    trackId: 'reactor', name: 'Reactor', crossedBoxes: 1,
    totalBoxes: 5, currentMaterialCost: 7, complete: false,
  }],
  shepherdOre: 10,
  fieldUpgradeState: { upgradeRevision: 0, targetsUsedThisCycle: 0 },
};

function committedReply(attempt: EndeavourResearchAttempt) {
  return {
    status: 'committed', sessionId: attempt.sessionId, requestId: attempt.requestId,
    cycle: attempt.expectedCycle, researchRevision: attempt.expectedResearchRevision + 1,
    trackId: attempt.trackId, funding: attempt.funding,
    oreCost: attempt.funding === 'standard' ? 0 : 5,
    previousMaterialCost: 7, currentMaterialCost: 6, shepherdOre: 10,
    progress: { reactor: 2 },
    cadence: {
      cycle: attempt.expectedCycle, revision: attempt.expectedResearchRevision + 1,
      choices: [{ trackId: attempt.trackId, funding: attempt.funding, oreCost: attempt.funding === 'standard' ? 0 : 5 }],
    },
  };
}

function staleReply(attempt: EndeavourResearchAttempt) {
  return {
    status: 'stale', sessionId: attempt.sessionId, requestId: attempt.requestId,
    trackId: attempt.trackId, funding: attempt.funding,
    expected: {
      cycle: attempt.expectedCycle,
      controlRevision: attempt.expectedControlRevision,
      researchRevision: attempt.expectedResearchRevision,
    },
    current: {
      cycle: attempt.expectedCycle,
      controlRevision: attempt.expectedControlRevision,
      researchRevision: attempt.expectedResearchRevision + 1,
    },
  };
}

beforeEach(() => {
  mocks.call.mockReset();
  mocks.callable.mockReset();
  mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    currentTurn: 3, activeRoleIds: ['shepherd-scientist'],
    shuttleControl: { endeavour: {
      shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', ownerUid: 'scientist',
      holderUid: 'scientist', revision: 4,
    } },
    createdAt: '', updatedAt: '',
  }, {
    uid: 'scientist', sessionId: 's1', displayName: 'Scientist', role: 'player', seatId: null,
    assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('reads and validates the private research workspace through the named callable', async () => {
  mocks.call.mockResolvedValueOnce({ data: workspace });
  await expect(readEndeavourResearchWorkspace()).resolves.toEqual(workspace);
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'readEndeavourResearchWorkspace');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1' });
});

it('sends only the selected track, funding, and observed revision/cycle/control CAS', async () => {
  const attempt = createEndeavourResearchAttempt({ workspace, trackId: 'reactor', funding: 'shepherd-ore' });
  mocks.call.mockResolvedValueOnce({ data: committedReply(attempt) });
  await expect(advanceEndeavourResearchTrack(attempt)).resolves.toEqual({ status: 'committed' });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'advanceEndeavourResearchTrack');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: attempt.requestId, expectedControlRevision: 4,
    expectedResearchRevision: 0, expectedCycle: 3, trackId: 'reactor', funding: 'shepherd-ore',
  });
});

it('accepts only a minimal stale envelope bound to the exact request and observed revisions', async () => {
  const attempt = createEndeavourResearchAttempt({ workspace, trackId: 'reactor', funding: 'standard' });
  const envelope = staleReply(attempt);
  mocks.call.mockResolvedValueOnce({ data: envelope });
  await expect(advanceEndeavourResearchTrack(attempt)).resolves.toEqual(envelope);
});

it('fails closed on malformed, mismatched, or privacy-expanded stale envelopes', async () => {
  const attempt = createEndeavourResearchAttempt({ workspace, trackId: 'reactor', funding: 'standard' });
  const valid = staleReply(attempt);
  const invalid = [
    { ...valid, progress: { reactor: 99 } },
    { ...valid, currentMaterialCost: 7 },
    { ...valid, shepherdOre: 10 },
    { ...valid, requestId: 'another-request' },
    { ...valid, expected: { ...valid.expected, researchRevision: 8 } },
    { ...valid, current: { ...valid.current, controlRevision: 9 } },
    { ...valid, current: { ...valid.current, researchRevision: attempt.expectedResearchRevision } },
  ];
  for (const data of invalid) {
    mocks.call.mockResolvedValueOnce({ data });
    await expect(advanceEndeavourResearchTrack(attempt)).rejects.toThrow(/invalid Endeavour research result/i);
  }
});

it('retries uncertain transport with the identical request ID and CAS payload', async () => {
  const attempt = createEndeavourResearchAttempt({ workspace, trackId: 'reactor', funding: 'standard' });
  mocks.call.mockRejectedValueOnce(new Error('connection interrupted'));
  mocks.call.mockResolvedValueOnce({ data: committedReply(attempt) });
  await expect(advanceEndeavourResearchTrack(attempt)).rejects.toThrow(/connection interrupted/i);
  await expect(advanceEndeavourResearchTrack(attempt)).resolves.toEqual({ status: 'committed' });
  expect(mocks.call.mock.calls[0]![0]).toEqual(mocks.call.mock.calls[1]![0]);
  expect(mocks.call.mock.calls[0]![0]).toEqual({
    sessionId: 's1', requestId: attempt.requestId, expectedControlRevision: 4,
    expectedResearchRevision: 0, expectedCycle: 3, trackId: 'reactor', funding: 'standard',
  });
});

it('confirms the immutable request after cycle and control rollover without exposing its private receipt', async () => {
  const attempt = createEndeavourResearchAttempt({ workspace, trackId: 'reactor', funding: 'standard' });
  mocks.call.mockRejectedValueOnce(new Error('connection interrupted'));
  await expect(advanceEndeavourResearchTrack(attempt)).rejects.toThrow(/connection interrupted/i);

  const { session, me } = useSessionStore.getState();
  useSessionStore.getState().setIdentity({
    ...session!,
    currentTurn: 4,
    shuttleControl: { endeavour: { ...session!.shuttleControl!.endeavour!, revision: 5 } },
  }, { ...me! });
  mocks.call.mockResolvedValueOnce({ data: {
    ...committedReply(attempt),
    status: 'replayed',
  } });

  await expect(retryEndeavourResearchAttempt(attempt)).resolves.toEqual({ status: 'replayed' });
  expect(mocks.call).toHaveBeenLastCalledWith({
    sessionId: 's1', requestId: attempt.requestId, expectedControlRevision: 4,
    expectedResearchRevision: 0, expectedCycle: 3, trackId: 'reactor', funding: 'standard',
  });
});

it('denies exact confirmation when the current Scientist holder has changed', async () => {
  const attempt = createEndeavourResearchAttempt({ workspace, trackId: 'reactor', funding: 'standard' });
  const { session, me } = useSessionStore.getState();
  useSessionStore.getState().setIdentity({
    ...session!,
    shuttleControl: { endeavour: {
      ...session!.shuttleControl!.endeavour!, holderUid: 'new-scientist', revision: 5,
    } },
  }, { ...me! });

  await expect(retryEndeavourResearchAttempt(attempt)).rejects.toThrow(/current Shepherd Scientist/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});

it('drops a delayed replay reply after the current holder changes', async () => {
  const attempt = createEndeavourResearchAttempt({ workspace, trackId: 'reactor', funding: 'standard' });
  let resolve!: (result: { data: ReturnType<typeof committedReply> }) => void;
  mocks.call.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const pending = retryEndeavourResearchAttempt(attempt);
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'advanceEndeavourResearchTrack');

  const { session, me } = useSessionStore.getState();
  useSessionStore.getState().setIdentity({
    ...session!,
    shuttleControl: { endeavour: {
      ...session!.shuttleControl!.endeavour!, holderUid: 'new-scientist', revision: 5,
    } },
  }, { ...me! });
  resolve({ data: { ...committedReply(attempt), status: 'replayed' } });

  await expect(pending).rejects.toThrow(/authority changed/i);
});

it('accepts a delayed stale envelope after an unrelated live session snapshot refresh', async () => {
  const attempt = createEndeavourResearchAttempt({ workspace, trackId: 'reactor', funding: 'standard' });
  let resolve!: (value: { data: ReturnType<typeof staleReply> }) => void;
  mocks.call.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const pending = advanceEndeavourResearchTrack(attempt);
  const { session, me } = useSessionStore.getState();
  useSessionStore.getState().setIdentity({ ...session!, name: 'Fleet refreshed' }, { ...me! });
  resolve({ data: staleReply(attempt) });
  await expect(pending).resolves.toMatchObject({ status: 'stale' });
});

it('ignores a delayed stale envelope after Scientist authority changes', async () => {
  const attempt = createEndeavourResearchAttempt({ workspace, trackId: 'reactor', funding: 'standard' });
  let resolve!: (value: { data: ReturnType<typeof staleReply> }) => void;
  mocks.call.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const pending = advanceEndeavourResearchTrack(attempt);
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'shepherd-engineer',
  });
  resolve({ data: staleReply(attempt) });
  await expect(pending).rejects.toThrow(/authority changed/i);
});

it('does not request or retain private research from a cached session or a different role', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(readEndeavourResearchWorkspace()).rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();

  useSessionStore.getState().setSessionSnapshotFreshness('server');
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'shepherd-engineer',
  });
  await expect(readEndeavourResearchWorkspace()).rejects.toThrow(/current Shepherd Scientist/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});

it('drops a delayed private reply after the active console role changes', async () => {
  let resolve!: (result: { data: EndeavourResearchWorkspace }) => void;
  mocks.call.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const pending = readEndeavourResearchWorkspace();
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'shepherd-engineer',
  });
  resolve({ data: workspace });
  await expect(pending).rejects.toThrow(/authority changed/i);
});

it('fails closed on malformed server projections', async () => {
  for (const data of [
    { ...workspace, tracks: [{ ...workspace.tracks[0]!, privateCost: 99 }] },
    { ...workspace, tracks: [{ ...workspace.tracks[0]!, totalBoxes: '5' }] },
    { ...workspace, fieldUpgradeState: { upgradeRevision: -1, targetsUsedThisCycle: 0 } },
  ]) {
    mocks.call.mockResolvedValueOnce({ data });
    await expect(readEndeavourResearchWorkspace()).rejects.toThrow(/invalid Endeavour research data/i);
  }
});

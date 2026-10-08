import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { createCandidateAttempt, executeCandidateAttempt, readCandidateWorkspace, recoverCandidateAttempt } from './candidateService';

const transport = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => transport.call }));
vi.mock('./firebase', () => ({ functions: () => ({}) }));
const choice = { expectedRevision: 0, expectedGroupId: 'fleet-1', code: 'N' as const,
  coordinate: '6798', action: 'contribute-materials' as const, shipId: 'aegis', amount: 1 };
const result = (attempt: ReturnType<typeof createCandidateAttempt>) => ({ type: 'candidate-action-result', status: 'committed',
  sessionId: 's1', requestId: attempt.requestId, revision: 1, code: 'N', action: choice.action, summary: 'One material committed.' });
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  useSessionStore.setState({ session: { id: 's1' } as never,
    me: { uid: 'u1', role: 'player', sessionId: 's1', fleetGroupId: 'fleet-1' } as never,
    connection: 'live', sessionSnapshotFreshness: 'server', gmInstance: null });
});
it('projects the shared server-selected edition and global N/O lock to the current actor', async () => {
  transport.call.mockResolvedValueOnce({ data: { type: 'candidate-workspace', sessionId: 's1', groupId: 'fleet-1',
    cycle: 6, revision: 3, edition: 'deluxe', editionLocked: true, paths: [] } });
  const workspace = await readCandidateWorkspace('fleet-1');
  expect(workspace).toMatchObject({ edition: 'deluxe', editionLocked: true });
});
it('rejects an unknown or missing server edition instead of inferring rules in the client', async () => {
  transport.call.mockResolvedValueOnce({ data: { type: 'candidate-workspace', sessionId: 's1', groupId: 'fleet-1',
    cycle: 6, revision: 3, edition: 'unlisted', editionLocked: false, paths: [] } });
  await expect(readCandidateWorkspace('fleet-1')).rejects.toThrow(/candidate operation report/i);
  transport.call.mockResolvedValueOnce({ data: { type: 'candidate-workspace', sessionId: 's1', groupId: 'fleet-1',
    cycle: 6, revision: 3, editionLocked: false, paths: [] } });
  await expect(readCandidateWorkspace('fleet-1')).rejects.toThrow(/candidate operation report/i);
});
it('persists the exact interrupted attempt and recovers it across component reload without another identity', async () => {
  const attempt = createCandidateAttempt(choice);
  transport.call.mockRejectedValueOnce(new Error('network interrupted'));
  await expect(executeCandidateAttempt(attempt)).rejects.toThrow('network interrupted');
  expect(recoverCandidateAttempt('fleet-1')).toEqual(attempt);
  expect(() => createCandidateAttempt(choice)).toThrow(/original/i);
  transport.call.mockResolvedValueOnce({ data: result(attempt) });
  await executeCandidateAttempt(recoverCandidateAttempt('fleet-1')!);
  expect(transport.call.mock.calls[0]?.[0]).toEqual(transport.call.mock.calls[1]?.[0]);
  expect(recoverCandidateAttempt('fleet-1')).toBeUndefined();
});
it('refuses a changed payload under a retained original request ID without overwriting recovery', async () => {
  const attempt = createCandidateAttempt(choice);
  transport.call.mockRejectedValueOnce(new Error('network interrupted'));
  await expect(executeCandidateAttempt(attempt)).rejects.toThrow();
  transport.call.mockResolvedValue({ data: result(attempt) });
  await expect(executeCandidateAttempt({ ...attempt, amount: 2 })).rejects.toThrow(/original|changed/i);
  expect(transport.call).toHaveBeenCalledTimes(1);
  expect(recoverCandidateAttempt('fleet-1')).toEqual(attempt);
});
it('keeps the receipt pending if the current player changes group before it returns', async () => {
  const attempt = createCandidateAttempt(choice);
  transport.call.mockImplementation(async () => {
    useSessionStore.setState({ me: { uid: 'u1', role: 'player', sessionId: 's1', fleetGroupId: 'fleet-2' } as never });
    return { data: result(attempt) };
  });
  await expect(executeCandidateAttempt(attempt)).rejects.toThrow(/audience|group|identity/i);
  useSessionStore.setState({ me: { uid: 'u1', role: 'player', sessionId: 's1', fleetGroupId: 'fleet-1' } as never });
  expect(recoverCandidateAttempt('fleet-1')).toEqual(attempt);
});
it('does not overwrite an interrupted original request after the player changes fleet group', async () => {
  const attempt = createCandidateAttempt(choice);
  transport.call.mockRejectedValueOnce(new Error('network interrupted'));
  await expect(executeCandidateAttempt(attempt)).rejects.toThrow();
  useSessionStore.setState({ me: { uid: 'u1', role: 'player', sessionId: 's1', fleetGroupId: 'fleet-2' } as never });
  expect(() => createCandidateAttempt({ ...choice, expectedGroupId: 'fleet-2' })).toThrow(/original/i);
  await expect(executeCandidateAttempt({ ...attempt, requestId: 'new-request', expectedGroupId: 'fleet-2' })).rejects.toThrow(/original/i);
  expect(transport.call).toHaveBeenCalledTimes(1);
  useSessionStore.setState({ me: { uid: 'u1', role: 'player', sessionId: 's1', fleetGroupId: 'fleet-1' } as never });
  expect(recoverCandidateAttempt('fleet-1')).toEqual(attempt);
});
it('rejects a mismatched committed request receipt and private derived values', async () => {
  const attempt = createCandidateAttempt(choice);
  transport.call.mockResolvedValueOnce({ data: { ...result(attempt), requestId: 'unrelated' } });
  await expect(executeCandidateAttempt(attempt)).rejects.toThrow(/result|receipt|original/i);
  transport.call.mockResolvedValueOnce({ data: { ...result(attempt), scouts: 8 } });
  await expect(executeCandidateAttempt(attempt)).rejects.toThrow(/result|receipt|original/i);
});

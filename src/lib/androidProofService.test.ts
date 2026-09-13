import { beforeEach, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { useSessionStore } from '@/store/useSessionStore';
import { revealAndroidProof } from './androidProofService';

const call = vi.fn();

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({ functions: vi.fn(() => ({ name: 'functions' })) }));
vi.mock('./sessionMutationAuthority', () => ({ requireFreshSessionAuthority: vi.fn() }));

beforeEach(() => {
  call.mockReset();
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  useSessionStore.getState().reset();
  useSessionStore.getState().setSession({ id: 's1' } as never);
  useSessionStore.getState().setPrivateLoyalty({ kind: 'android', suspicion: null });
});

it('calls the server-owned Android disclosure action with the current session', async () => {
  call.mockResolvedValue({ data: { disclosed: true } });

  await expect(revealAndroidProof()).resolves.toEqual({ disclosed: true });

  expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'revealAndroidProof');
  expect(call).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1', requestId: expect.any(String) }));
});

it('does not call the server for a non-Android private card', async () => {
  useSessionStore.getState().setPrivateLoyalty({ kind: 'fleet-loyalist', suspicion: 0 });

  await expect(revealAndroidProof()).rejects.toThrow(/only the Android holder/i);
  expect(call).not.toHaveBeenCalled();
});

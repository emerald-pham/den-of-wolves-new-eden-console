import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { normalizePressDispatch } from './pressDispatchState';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';

function commandId(): string {
  return window.crypto.randomUUID();
}

function activeSession(): { sessionId: string; revision: number } {
  const { session } = useSessionStore.getState();
  if (!session) {
    throw new Error('Reconnect before changing a press dispatch.');
  }
  requireFreshSessionAuthority();
  return {
    sessionId: session.id,
    revision: normalizePressDispatch(session.pressDispatch).revision,
  };
}

export async function publishPressDispatch(text: string): Promise<void> {
  const { sessionId, revision } = activeSession();
  await httpsCallable(functions(), 'publishPressDispatch')({
    sessionId, requestId: commandId(),
    text,
    expectedRevision: revision,
  });
}

export async function dismissPressDispatch(dispatchId: string): Promise<void> {
  const { sessionId, revision } = activeSession();
  await httpsCallable(functions(), 'dismissPressDispatch')({
    sessionId, requestId: commandId(),
    dispatchId,
    expectedRevision: revision,
  });
}

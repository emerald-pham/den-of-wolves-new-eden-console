import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { normalizePressDispatch } from './pressDispatchState';

function activeSession(): { sessionId: string; revision: number } {
  const { session, connection } = useSessionStore.getState();
  if (!session || connection !== 'live') {
    throw new Error('Reconnect before changing a press dispatch.');
  }
  return {
    sessionId: session.id,
    revision: normalizePressDispatch(session.pressDispatch).revision,
  };
}

export async function publishPressDispatch(text: string): Promise<void> {
  const { sessionId, revision } = activeSession();
  await httpsCallable(functions(), 'publishPressDispatch')({
    sessionId,
    text,
    expectedRevision: revision,
  });
}

export async function dismissPressDispatch(dispatchId: string): Promise<void> {
  const { sessionId, revision } = activeSession();
  await httpsCallable(functions(), 'dismissPressDispatch')({
    sessionId,
    dispatchId,
    expectedRevision: revision,
  });
}

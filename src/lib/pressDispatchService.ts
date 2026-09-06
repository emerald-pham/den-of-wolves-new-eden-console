import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';

export async function publishPressDispatch(text: string): Promise<void> {
  const { session, connection } = useSessionStore.getState();
  if (!session || connection !== 'live') {
    throw new Error('Reconnect before publishing a press dispatch.');
  }
  await httpsCallable(functions(), 'publishPressDispatch')({
    sessionId: session.id,
    text,
    expectedRevision: session.pressDispatch?.revision ?? 0,
  });
}

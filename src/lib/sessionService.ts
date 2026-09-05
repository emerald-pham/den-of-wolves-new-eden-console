import { signInAnonymously } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';

/**
 * The client's whole conversation with Firebase about sessions.
 *
 * Deliberately thin: it signs in, calls a callable, and drops the result into
 * the store. Creating a session and joining one are both server-authoritative --
 * `firestore.rules` denies session creation outright, and joining goes through a
 * function so that finding a table by its four-digit code never requires letting
 * a client list every session that exists.
 */

interface SessionReply {
  readonly session: GameSession;
  readonly player: Player;
}

const TERMINAL_RESUME_ERRORS = new Set([
  'functions/not-found',
  'functions/permission-denied',
  'functions/failed-precondition',
]);

function errorCode(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return undefined;
  return typeof cause.code === 'string' ? cause.code : undefined;
}

function applySession(reply: SessionReply): void {
  useSessionStore.getState().setIdentity(reply.session, reply.player);
}

/**
 * Anonymous sign-in: a player at a table should not have to make an account
 * before they can take a seat. The uid is still a real, stable identity that
 * the rules and the callables can check.
 */
async function ensureSignedIn(): Promise<void> {
  const instance = auth();
  if (instance.currentUser) return;
  await signInAnonymously(instance);
}

/**
 * Establish the Firebase half of the connection. Called as the app mounts and
 * retried while offline; the status light is red until this resolves and red
 * again if it throws.
 */
export async function connect(): Promise<void> {
  const store = useSessionStore.getState();
  store.setConnection('connecting');
  try {
    if (!window.navigator.onLine) {
      throw new Error('Browser is offline.');
    }
    await ensureSignedIn();
    const rememberedSession = store.session;
    if (rememberedSession) {
      try {
        await resumeSession(rememberedSession.id);
      } catch (cause) {
        if (!TERMINAL_RESUME_ERRORS.has(errorCode(cause) ?? '')) throw cause;
        store.disconnect();
      }
    }
    store.setConnection('live');
  } catch {
    store.setConnection('offline');
  }
}

export async function createSession(name?: string): Promise<void> {
  await ensureSignedIn();
  const call = httpsCallable<{ name?: string }, SessionReply>(
    functions(),
    'createSession',
  );
  const reply = await call(name === undefined ? {} : { name });
  applySession(reply.data);
}

export async function joinSession(joinCode: string): Promise<void> {
  await ensureSignedIn();
  const call = httpsCallable<{ joinCode: string }, SessionReply>(
    functions(),
    'joinSession',
  );
  const reply = await call({ joinCode });
  applySession(reply.data);
}

export async function resumeSession(sessionId: string): Promise<void> {
  const call = httpsCallable<{ sessionId: string }, SessionReply>(
    functions(),
    'resumeSession',
  );
  const reply = await call({ sessionId });
  applySession(reply.data);
}

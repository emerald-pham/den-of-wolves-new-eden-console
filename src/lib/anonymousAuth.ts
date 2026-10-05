import { signInAnonymously, type Auth, type User } from 'firebase/auth';

const pendingSignIns = new WeakMap<Auth, Promise<User>>();

/** Share startup restoration and signup across mount, join and demo preparation. */
export function ensureAnonymousAuth(instance: Auth, expectedUid?: string): Promise<User> {
  let pending = pendingSignIns.get(instance);
  if (!pending) {
    pending = (async () => {
      // Test doubles and legacy adapters may omit this method. The web SDK
      // always waits for its persisted account before deciding to create one.
      await instance.authStateReady?.();
      if (instance.currentUser) return instance.currentUser;
      // A missing established persona is a recovery problem, never permission
      // to silently replace its seat, private audience or historical UID.
      if (expectedUid) throw new Error('This demo actor account is unavailable in this browser. Return to the demo crew controller.');
      return (await signInAnonymously(instance)).user;
    })();
    pendingSignIns.set(instance, pending);
    const captured = pending;
    void pending.finally(() => {
      if (pendingSignIns.get(instance) === captured) pendingSignIns.delete(instance);
    }).catch(() => undefined);
  }
  return pending.then(user => {
    if (expectedUid && user?.uid !== expectedUid) {
      throw new Error('The demo actor identity changed. Return to the demo crew controller.');
    }
    return user;
  });
}

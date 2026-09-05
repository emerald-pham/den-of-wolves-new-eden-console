import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { app } from './firebase';
import { useEmulators } from './firebaseConfig';

let firestore: Firestore | undefined;

export function db(): Firestore {
  if (!firestore) {
    firestore = initializeFirestore(app(), {
      // Offline persistence, multi-tab safe -- a table full of players will
      // have the same session open on phones that drop off the venue wifi.
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
    if (useEmulators) connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  }
  return firestore;
}

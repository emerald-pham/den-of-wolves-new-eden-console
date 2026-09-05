import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from 'firebase/functions';
import { firebaseConfig, firebaseConfigured, useEmulators } from './firebaseConfig';

/**
 * Lazy, single-instance Firebase wiring.
 *
 * Nothing here runs at import time. The landing page renders with no Firebase
 * connection at all; the first feature that needs shared state calls `db()`.
 * That keeps the app buildable and testable before the project is provisioned.
 */

function app() {
  if (!firebaseConfigured) {
    throw new Error(
      'Firebase is not configured yet. Fill in src/lib/firebaseConfig.ts ' +
        '(or set VITE_FIREBASE_* env vars) before using shared state.',
    );
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let firestore: Firestore | undefined;
let authInstance: Auth | undefined;
let functionsInstance: Functions | undefined;

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

export function auth(): Auth {
  if (!authInstance) {
    // Ensure the app is fully initialized by initializing Firestore first.
    // This prevents "auth/configuration-not-found" errors in some SDK versions.
    db();
    authInstance = getAuth(app());
    if (useEmulators) {
      connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', {
        disableWarnings: true,
      });
    }
  }
  return authInstance;
}

export function functions(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(app());
    if (useEmulators) {
      connectFunctionsEmulator(functionsInstance, '127.0.0.1', 5001);
    }
  }
  return functionsInstance;
}

import type { FirebaseOptions } from 'firebase/app';
import { resolveEmulatorPorts } from './emulatorPorts';

/**
 * Firebase web config.
 *
 * These values are PUBLIC identifiers by design -- they ship in every client
 * bundle and Google documents them as safe to expose. They are not credentials.
 * What actually protects the data is `firestore.rules` plus the callable
 * Cloud Functions in `functions/`. Never put a service-account key, an admin
 * credential, or a private API key in this file or anywhere under `src/`.
 *
 * Values are filled in by `scripts/set-firebase-config.mjs` (or by hand) after
 * the Firebase project exists. Env vars override them for local experiments.
 */
const committed = {
  apiKey: 'AIzaSyCRBHvl_LHZ3V-kN8wqOKmUZPE7FQTb--Q',
  authDomain: 'dow-new-eden-console.firebaseapp.com',
  projectId: 'dow-new-eden-console',
  storageBucket: 'dow-new-eden-console.firebasestorage.app',
  messagingSenderId: '299811605673',
  appId: '1:299811605673:web:9edc254e6cd1cc0a10edb8',
} satisfies FirebaseOptions;

const env = import.meta.env;

export const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? committed.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? committed.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? committed.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? committed.storageBucket,
  messagingSenderId:
    env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? committed.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID ?? committed.appId,
};

/** True once the placeholders above have been replaced with real values. */
export const firebaseConfigured =
  typeof firebaseConfig.projectId === 'string' &&
  !firebaseConfig.projectId.startsWith('__');

export const useEmulators = env.VITE_USE_EMULATORS === '1';
export const emulatorPorts = resolveEmulatorPorts(env);

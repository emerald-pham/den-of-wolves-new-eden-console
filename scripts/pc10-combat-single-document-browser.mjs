import { connectFirestoreEmulator, doc, getDoc, getFirestore } from 'firebase/firestore/lite';
import { app, auth } from '/src/lib/firebase.ts';
import { emulatorPorts, firebaseConfig, useEmulators } from '/src/lib/firebaseConfig.ts';

const databases = new WeakMap();

/** One current-attack server fetch on the original App/Auth; no listener or transaction. */
export async function readCurrentWolfAttackSingleDocument(sessionId) {
  const originalApp = app(), originalUid = auth().currentUser?.uid;
  if (!useEmulators || !/^demo-[a-z0-9-]+$/.test(firebaseConfig.projectId ?? '') ||
      originalApp.options.projectId !== firebaseConfig.projectId || !originalUid ||
      typeof sessionId !== 'string' || !sessionId || sessionId.includes('/') ||
      !Number.isSafeInteger(emulatorPorts.firestore) || emulatorPorts.firestore < 1 || emulatorPorts.firestore > 65_535)
    throw new Error('The original authenticated local combat source is required.');
  let database = databases.get(originalApp);
  if (!database) {
    // Lite uses this same app's Auth and App Check providers. The original
    // app() initializes them; no mock token or alternative credentials exist.
    database = getFirestore(originalApp);
    connectFirestoreEmulator(database, '127.0.0.1', emulatorPorts.firestore);
    databases.set(originalApp, database);
  }
  const document = await getDoc(doc(database, `sessions/${sessionId}/wolfAttackState/current`));
  if (app() !== originalApp || auth().currentUser?.uid !== originalUid)
    throw new Error('Original combat App/Auth changed during the server read.');
  return document;
}

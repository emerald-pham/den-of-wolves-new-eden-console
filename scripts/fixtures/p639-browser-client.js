import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, indexedDBLocalPersistence, setPersistence, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, onSnapshot } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const state = {
  calls: [], sessionEvents: [], playerEvents: [], listenerErrors: [],
  heartbeatTimer: undefined, heartbeatTimeout: undefined, heartbeatInFlight: false,
  heartbeatPromise: undefined,
  maxHeartbeatInFlight: 0, currentHeartbeatInFlight: 0,
};

function outcome(error, result) {
  if (!error && result?.status === 'stale') return 'contention';
  if (!error) return 'success';
  return String(error?.code ?? 'unknown').replace(/^functions\//, '');
}

async function measuredCall(name, data, source = 'browser') {
  const startedAt = Date.now();
  const startedMonotonicAt = performance.now();
  try {
    const result = (await httpsCallable(state.functions, name)(data)).data;
    state.calls.push({
      name,
      source,
      outcome: outcome(null, result),
      startedAt,
      completedAt: Date.now(),
      durationMs: performance.now() - startedMonotonicAt,
    });
    return result;
  } catch (error) {
    state.calls.push({
      name,
      source,
      outcome: outcome(error),
      startedAt,
      completedAt: Date.now(),
      durationMs: performance.now() - startedMonotonicAt,
    });
    throw error;
  }
}

async function initialize(config) {
  state.sessionId = config.sessionId;
  const app = initializeApp({
    apiKey: 'demo-api-key', authDomain: `${config.projectId}.firebaseapp.com`,
    projectId: config.projectId, appId: `p639-${config.clientLabel}`,
  });
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${config.ports.auth}`, { disableWarnings: true });
  await setPersistence(auth, indexedDBLocalPersistence);
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  state.uid = auth.currentUser.uid;
  state.functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(state.functions, '127.0.0.1', config.ports.functions);
  state.firestore = getFirestore(app);
  connectFirestoreEmulator(state.firestore, '127.0.0.1', config.ports.firestore);
  const membership = config.joinCode
    ? await measuredCall('joinSession', { joinCode: config.joinCode, displayName: config.displayName })
    : await measuredCall('resumeSession', { sessionId: config.sessionId });
  const sessionRef = doc(state.firestore, 'sessions', config.sessionId);
  const playerRef = doc(state.firestore, 'sessions', config.sessionId, 'players', state.uid);
  state.unsubscribeSession = onSnapshot(sessionRef, (snapshot) => {
    const data = snapshot.data() ?? {};
    state.sessionEvents.push({
      at: Date.now(),
      resourceRevision: Number(data.vesselActionRevisions?.capybara ?? 0),
    });
  }, (error) => state.listenerErrors.push(String(error?.code ?? error)));
  state.unsubscribePlayer = onSnapshot(playerRef, (snapshot) => {
    state.playerEvents.push({ at: Date.now(), connected: snapshot.data()?.connected === true });
  }, (error) => state.listenerErrors.push(String(error?.code ?? error)));
  return { uid: state.uid, membership };
}

function scheduleHeartbeat(intervalMs, offsetMs = 0) {
  const heartbeat = async () => {
    if (state.heartbeatInFlight) return;
    state.heartbeatInFlight = true;
    state.currentHeartbeatInFlight += 1;
    state.maxHeartbeatInFlight = Math.max(state.maxHeartbeatInFlight, state.currentHeartbeatInFlight);
    const promise = measuredCall('refreshPresence', { sessionId: state.sessionId });
    state.heartbeatPromise = promise;
    try { await promise; }
    catch { /* Recorded and evaluated by the runner. */ }
    finally {
      state.currentHeartbeatInFlight -= 1;
      state.heartbeatInFlight = false;
      if (state.heartbeatPromise === promise) state.heartbeatPromise = undefined;
    }
  };
  state.heartbeatTimeout = setTimeout(() => {
    void heartbeat();
    state.heartbeatTimer = setInterval(() => void heartbeat(), intervalMs);
  }, offsetMs);
}

async function stopHeartbeats() {
  clearTimeout(state.heartbeatTimeout);
  clearInterval(state.heartbeatTimer);
  state.heartbeatTimeout = undefined;
  state.heartbeatTimer = undefined;
  if (state.heartbeatPromise) await state.heartbeatPromise.catch(() => undefined);
}

window.p639 = {
  initialize,
  call: measuredCall,
  scheduleHeartbeat,
  stopHeartbeats,
  summary() {
    return {
      calls: [...state.calls],
      sessionEvents: [...state.sessionEvents],
      playerEvents: [...state.playerEvents],
      listenerErrors: [...state.listenerErrors],
      maxHeartbeatInFlight: state.maxHeartbeatInFlight,
    };
  },
};
window.p639Ready = true;

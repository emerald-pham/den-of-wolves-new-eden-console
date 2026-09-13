export const SERVICE_WORKER_PATH = '/sw.js';

export interface ServiceWorkerUpdateState {
  readonly available: boolean;
  readonly activated: boolean;
}

type ServiceWorkerUpdateListener = (state: ServiceWorkerUpdateState) => void;

const INITIAL_UPDATE_STATE: ServiceWorkerUpdateState = {
  available: false,
  activated: false,
};

let updateState = INITIAL_UPDATE_STATE;
let registration: ServiceWorkerRegistration | null = null;
let waitingWorker: ServiceWorker | null = null;
let applyRequested = false;
const listeners = new Set<ServiceWorkerUpdateListener>();
const observedInstallingWorkers = new WeakSet<ServiceWorker>();

function publishUpdateState(next: Partial<ServiceWorkerUpdateState>): void {
  updateState = { ...updateState, ...next };
  for (const listener of listeners) listener(updateState);
}

function markWaiting(worker: ServiceWorker | null): void {
  if (!worker) return;
  waitingWorker = worker;
  publishUpdateState({ available: true, activated: false });
  if (applyRequested) {
    applyRequested = false;
    worker.postMessage({ type: 'SKIP_WAITING' });
  }
}

function observeInstalling(installing: ServiceWorker | null): void {
  if (!installing || observedInstallingWorkers.has(installing)) return;
  observedInstallingWorkers.add(installing);
  installing.addEventListener('statechange', () => {
    if (installing.state === 'installed' && installing !== navigator.serviceWorker.controller) {
      markWaiting(installing);
    }
  });
  // updatefound can precede registration resolution, so inspect the already
  // installed worker as soon as the registration becomes observable.
  if (installing.state === 'installed' && installing !== navigator.serviceWorker.controller) {
    markWaiting(installing);
  }
}

function observeRegistration(nextRegistration: ServiceWorkerRegistration): void {
  registration = nextRegistration;
  markWaiting(nextRegistration.waiting);
  observeInstalling(nextRegistration.installing);
  nextRegistration.addEventListener('updatefound', () => {
    observeInstalling(nextRegistration.installing);
  });
}

/** The app can render this state without making the update blocking. */
export function getServiceWorkerUpdateState(): ServiceWorkerUpdateState {
  return updateState;
}

/** Subscribe to update state for the existing app header/status surface. */
export function subscribeServiceWorkerUpdates(
  listener: ServiceWorkerUpdateListener,
): () => void {
  listeners.add(listener);
  listener(updateState);
  return () => listeners.delete(listener);
}

/** Ask the browser to discover the waiting worker after a fresh build marker. */
export function markServiceWorkerUpdateAvailable(): void {
  publishUpdateState({ available: true, activated: false });
  void registration?.update().then(() => {
    if (registration) {
      markWaiting(registration.waiting);
      observeInstalling(registration.installing);
    }
  }).catch(() => undefined);
}

/** Apply only an explicitly requested update; this never reloads the page. */
export function applyServiceWorkerUpdate(): void {
  if (waitingWorker) {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  applyRequested = true;
  if (registration) {
    void registration.update().catch(() => undefined);
  }
}

/** Reload only after the player explicitly chooses to use the activated worker. */
export function reloadAfterServiceWorkerUpdate(): void {
  if (typeof window !== 'undefined') window.location.reload();
}

/** Register the root-scoped worker only when the browser supports installable app shells. */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener?.('controllerchange', () => {
    if (!updateState.available) return;
    waitingWorker = null;
    publishUpdateState({ activated: true });
  });
  void navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: '/' })
    .then((nextRegistration) => {
      if (nextRegistration) observeRegistration(nextRegistration);
    })
    .catch(() => undefined);
}

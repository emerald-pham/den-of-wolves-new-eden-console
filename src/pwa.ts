export const SERVICE_WORKER_PATH = '/sw.js';

/** Register the root-scoped worker only when the browser supports installable app shells. */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  void navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: '/' }).catch(() => undefined);
}

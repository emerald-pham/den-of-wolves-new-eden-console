import { APP_VERSION } from '@/version';

export const PAGE_STALE_AFTER_MS = 60_000;

interface VersionResponse {
  readonly ok: boolean;
  json: () => Promise<unknown>;
}

interface VersionUpgradeMonitorOptions {
  readonly fetchVersion?: (
    input: string,
    init: { readonly cache: 'no-store' },
  ) => Promise<VersionResponse>;
  readonly reload?: () => void;
  readonly reconnect?: () => void;
  readonly staleAfterMs?: number;
}

/**
 * Recover after the page has been hidden long enough for browser throttling to
 * stale its connection. A newer build reloads with persisted identity intact;
 * the current build resumes directly. Neither path sends the explicit
 * disconnect command, so server presence does not enter a player-drop state.
 */
export function startVersionUpgradeMonitor(
  options: VersionUpgradeMonitorOptions = {},
): () => void {
  const fetchVersion = options.fetchVersion ?? ((input, init) => fetch(input, init));
  const reload = options.reload ?? (() => window.location.reload());
  const reconnect = options.reconnect ?? (() => undefined);
  const staleAfterMs = options.staleAfterMs ?? PAGE_STALE_AFTER_MS;
  let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null;
  let stopped = false;
  let checking = false;

  const recover = async (): Promise<void> => {
    if (stopped || checking) return;
    checking = true;
    let reloading = false;
    try {
      const response = await fetchVersion('/build-version.json', { cache: 'no-store' });
      if (!response.ok) return;
      const metadata: unknown = await response.json();
      if (
        typeof metadata === 'object' && metadata !== null &&
        'version' in metadata && typeof metadata.version === 'string' &&
        metadata.version !== APP_VERSION
      ) {
        reloading = true;
        reload();
      }
    } catch {
      // Reconnection is still useful when the static version marker is unavailable.
    } finally {
      checking = false;
      if (!stopped && !reloading) reconnect();
    }
  };

  const handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      hiddenAt ??= Date.now();
      return;
    }
    const lastHiddenAt = hiddenAt;
    hiddenAt = null;
    if (lastHiddenAt !== null && Date.now() - lastHiddenAt >= staleAfterMs) {
      void recover();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

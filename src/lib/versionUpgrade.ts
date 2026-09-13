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
  readonly reconnect?: () => void;
  readonly onUpdateAvailable?: () => void;
  readonly staleAfterMs?: number;
}

/**
 * Recover after the page has been hidden long enough for browser throttling to
 * stale its connection. A newer build advertises a non-blocking update; the
 * current build resumes directly. Neither path sends the explicit disconnect
 * command, so server presence does not enter a player-drop state.
 */
export function startVersionUpgradeMonitor(
  options: VersionUpgradeMonitorOptions = {},
): () => void {
  const fetchVersion = options.fetchVersion ?? ((input, init) => fetch(input, init));
  const reconnect = options.reconnect ?? (() => undefined);
  const onUpdateAvailable = options.onUpdateAvailable ?? (() => undefined);
  const staleAfterMs = options.staleAfterMs ?? PAGE_STALE_AFTER_MS;
  let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null;
  let stopped = false;
  let checking = false;
  let advertisedVersion: string | null = null;

  const recover = async (): Promise<void> => {
    if (stopped || checking) return;
    checking = true;
    try {
      const response = await fetchVersion('/build-version.json', { cache: 'no-store' });
      if (!response.ok) return;
      const metadata: unknown = await response.json();
      if (
        typeof metadata === 'object' && metadata !== null &&
        'version' in metadata && typeof metadata.version === 'string' &&
        metadata.version !== APP_VERSION
      ) {
        if (advertisedVersion !== metadata.version) {
          advertisedVersion = metadata.version;
          onUpdateAvailable();
        }
      }
    } catch {
      // Reconnection is still useful when the static version marker is unavailable.
    } finally {
      checking = false;
      if (!stopped) reconnect();
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

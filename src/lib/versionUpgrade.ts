import { APP_VERSION } from '@/version';

export const VERSION_CHECK_INTERVAL_MS = 5_000;

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
  readonly intervalMs?: number;
}

/**
 * Discover a newly deployed client and reload into it without sending the
 * explicit disconnect command. The persisted session, route and GM instance
 * remain available for the normal startup resume path, while server presence
 * never transitions through a player-drop state.
 */
export function startVersionUpgradeMonitor(
  options: VersionUpgradeMonitorOptions = {},
): () => void {
  const fetchVersion = options.fetchVersion ?? ((input, init) => fetch(input, init));
  const reload = options.reload ?? (() => window.location.reload());
  let stopped = false;
  let checking = false;
  let upgradeFound = false;

  const check = async (): Promise<void> => {
    if (stopped || checking || upgradeFound) return;
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
        upgradeFound = true;
        reload();
      }
    } catch {
      // A missed poll is harmless; Firebase reconnect and the next poll continue.
    } finally {
      checking = false;
    }
  };

  void check();
  const timer = window.setInterval(() => void check(), options.intervalMs ?? VERSION_CHECK_INTERVAL_MS);

  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

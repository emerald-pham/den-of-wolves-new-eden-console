import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Firebase App Check configuration', () => {
  it('keeps the committed site key when an optional local override is blank', async () => {
    vi.stubEnv('VITE_APP_CHECK_SITE_KEY', '');

    const { appCheckSiteKey } = await import('./firebaseConfig');

    expect(appCheckSiteKey).toBe('6Lee_6stAAAAAFdM5TdnbuaDLYMmc9Rl2KTF1z6J');
  });
});

import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  app: { name: '[DEFAULT]' },
  getApps: vi.fn(() => []),
  getApp: vi.fn(),
  initializeApp: vi.fn(),
  getAuth: vi.fn(),
  connectAuthEmulator: vi.fn(),
  getFunctions: vi.fn(),
  connectFunctionsEmulator: vi.fn(),
  initializeAppCheck: vi.fn(),
  ReCaptchaEnterpriseProvider: vi.fn(function Provider(this: { siteKey: string }, siteKey: string) {
    this.siteKey = siteKey;
  }),
}));

vi.mock('firebase/app', () => ({
  getApps: mocks.getApps,
  getApp: mocks.getApp,
  initializeApp: mocks.initializeApp,
}));
vi.mock('firebase/auth', () => ({
  getAuth: mocks.getAuth,
  connectAuthEmulator: mocks.connectAuthEmulator,
}));
vi.mock('firebase/functions', () => ({
  getFunctions: mocks.getFunctions,
  connectFunctionsEmulator: mocks.connectFunctionsEmulator,
}));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: mocks.initializeAppCheck,
  ReCaptchaEnterpriseProvider: mocks.ReCaptchaEnterpriseProvider,
}));
vi.mock('./firebaseConfig', () => ({
  emulatorPorts: { auth: 9099, functions: 5001, firestore: 8080 },
  firebaseConfig: { projectId: 'dow-new-eden-console' },
  firebaseConfigured: true,
  appCheckSiteKey: 'enterprise-site-key',
  useEmulators: false,
}));

const { appCheck, functions } = await import('./firebase');

describe('Firebase App Check', () => {
  it('initializes Enterprise attestation before the callable Functions client', () => {
    mocks.initializeApp.mockReturnValue(mocks.app);
    mocks.getFunctions.mockReturnValue({ kind: 'functions' });
    mocks.initializeAppCheck.mockReturnValue({ kind: 'app-check' });

    expect(appCheck()).toEqual({ kind: 'app-check' });
    expect(mocks.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('enterprise-site-key');
    expect(mocks.initializeAppCheck).toHaveBeenCalledWith(mocks.app, {
      provider: expect.objectContaining({ siteKey: 'enterprise-site-key' }),
      isTokenAutoRefreshEnabled: true,
    });

    functions();
    expect(mocks.getFunctions).toHaveBeenCalledWith(mocks.app);
    expect(mocks.initializeAppCheck.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getFunctions.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });
});

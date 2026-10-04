import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configuration: { useEmulators: true, appCheckSiteKey: 'enterprise-site-key' },
  app: { name: '[DEFAULT]' },
  getApps: vi.fn(() => []),
  getApp: vi.fn(),
  initializeApp: vi.fn(),
  getAuth: vi.fn(),
  connectAuthEmulator: vi.fn(),
  getFunctions: vi.fn(),
  connectFunctionsEmulator: vi.fn(),
  initializeAppCheck: vi.fn(),
  ReCaptchaEnterpriseProvider: vi.fn(),
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
  emulatorPorts: { auth: 9199, functions: 5101, firestore: 8180 },
  firebaseConfig: { projectId: 'demo-pc09-isolation' },
  firebaseConfigured: true,
  get useEmulators() { return mocks.configuration.useEmulators; },
  get appCheckSiteKey() { return mocks.configuration.appCheckSiteKey; },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.configuration.useEmulators = true;
  mocks.configuration.appCheckSiteKey = 'enterprise-site-key';
  mocks.initializeApp.mockReturnValue(mocks.app);
  mocks.getAuth.mockReturnValue({ kind: 'auth' });
  mocks.getFunctions.mockReturnValue({ kind: 'functions' });
  mocks.initializeAppCheck.mockReturnValue({ kind: 'app-check' });
  Reflect.deleteProperty(globalThis, 'FIREBASE_APPCHECK_DEBUG_TOKEN');
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'FIREBASE_APPCHECK_DEBUG_TOKEN');
});

describe('Firebase emulator isolation', () => {
  it.each(['enterprise-site-key', ''])('joins through local services without remote attestation (site key %j)', async siteKey => {
    mocks.configuration.appCheckSiteKey = siteKey;
    const { auth, functions } = await import('./firebase');

    expect(auth()).toEqual({ kind: 'auth' });
    expect(functions()).toEqual({ kind: 'functions' });
    expect(mocks.connectAuthEmulator).toHaveBeenCalledWith(
      { kind: 'auth' }, 'http://127.0.0.1:9199', { disableWarnings: true },
    );
    expect(mocks.connectFunctionsEmulator).toHaveBeenCalledWith({ kind: 'functions' }, '127.0.0.1', 5101);
    expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
    expect(mocks.ReCaptchaEnterpriseProvider).not.toHaveBeenCalled();
    expect(Reflect.has(globalThis, 'FIREBASE_APPCHECK_DEBUG_TOKEN')).toBe(false);
  });

  it('still requires production attestation before Firebase services', async () => {
    mocks.configuration.useEmulators = false;
    const { auth, functions } = await import('./firebase');

    auth();
    functions();
    expect(mocks.initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(mocks.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('enterprise-site-key');
    expect(mocks.initializeAppCheck.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getAuth.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(mocks.initializeAppCheck.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getFunctions.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(mocks.connectAuthEmulator).not.toHaveBeenCalled();
    expect(mocks.connectFunctionsEmulator).not.toHaveBeenCalled();
  });

  it('fails closed without the production site key', async () => {
    mocks.configuration.useEmulators = false;
    mocks.configuration.appCheckSiteKey = '';
    const { auth, functions } = await import('./firebase');

    expect(() => auth()).toThrow('Firebase App Check is not configured');
    expect(() => functions()).toThrow('Firebase App Check is not configured');
    expect(mocks.getAuth).not.toHaveBeenCalled();
    expect(mocks.getFunctions).not.toHaveBeenCalled();
    expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  apps: [] as { name: string }[],
  getAuth: vi.fn((app: { name: string }) => ({ app })),
  getFunctions: vi.fn((app: { name: string }) => ({ app })),
  initializeAppCheck: vi.fn((app: { name: string }) => ({ app })),
  connectAuthEmulator: vi.fn(), connectFunctionsEmulator: vi.fn(),
}));
vi.mock('firebase/app', () => ({
  getApps: () => sdk.apps,
  getApp: (name = '[DEFAULT]') => sdk.apps.find(app => app.name === name),
  initializeApp: (_config: unknown, name = '[DEFAULT]') => {
    const app = { name }; sdk.apps.push(app); return app;
  },
}));
vi.mock('firebase/auth', () => ({ getAuth: sdk.getAuth, connectAuthEmulator: sdk.connectAuthEmulator }));
vi.mock('firebase/functions', () => ({ getFunctions: sdk.getFunctions, connectFunctionsEmulator: sdk.connectFunctionsEmulator }));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: sdk.initializeAppCheck,
  ReCaptchaEnterpriseProvider: vi.fn(function Provider() {}),
}));
vi.mock('./firebaseConfig', () => ({
  firebaseConfig: { projectId: 'demo-isolation' }, firebaseConfigured: true,
  useEmulators: false, appCheckSiteKey: 'public-site-key', emulatorPorts: {},
}));
beforeEach(() => { vi.resetModules(); sdk.apps = []; vi.clearAllMocks(); });
afterEach(() => { window.history.replaceState(null, '', '/'); });

it('binds the active document to its named Auth/Functions app even if a different app exists first', async () => {
  window.history.replaceState(null, '', '/?demoActor=session-a~admiral');
  sdk.apps.push({ name: '[DEFAULT]' });
  const firebase = await import('./firebase');
  const active = firebase.app();
  expect(active.name).not.toBe('[DEFAULT]');
  expect(firebase.auth().app).toBe(active);
  expect(firebase.functions().app).toBe(active);
  window.history.replaceState(null, '', '/?demoActor=session-a~wing-commander');
  expect(firebase.auth().app).toBe(active);
});

it('keeps default services separate from automatically prepared actor services and attests every app', async () => {
  window.history.replaceState(null, '', '/');
  const firebase = await import('./firebase');
  const ordinary = firebase.auth();
  const actor = firebase.demoActorServices({ sessionId: 'session-a', roleId: 'admiral' });
  expect(actor.auth).not.toBe(ordinary);
  expect(actor.auth.app).toBe(actor.functions.app);
  expect(firebase.auth()).toBe(ordinary);
  expect(firebase.demoActorServices({ sessionId: 'session-a', roleId: 'admiral' })).toBe(actor);
  expect(sdk.initializeAppCheck).toHaveBeenCalledTimes(2);
  expect(sdk.initializeAppCheck.mock.invocationCallOrder[0]).toBeLessThan(sdk.getAuth.mock.invocationCallOrder[0]!);
});

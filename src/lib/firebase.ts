import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from 'firebase/functions';
import {
  emulatorPorts,
  appCheckSiteKey,
  firebaseConfig,
  firebaseConfigured,
  useEmulators,
} from './firebaseConfig';
import { demoActorAppName, type DemoActorProfile } from './demoActorContext';

/**
 * Lazy, single-instance Firebase wiring.
 *
 * Nothing here runs at import time. The landing page renders before the first
 * feature asks for an Auth or Functions instance, which keeps configuration
 * errors observable and the module straightforward to test.
 */

const appsByName = new Map<string, FirebaseApp>();

function firebaseApp(name = demoActorAppName()): FirebaseApp {
  if (!firebaseConfigured) {
    throw new Error(
      'Firebase is not configured yet. Fill in src/lib/firebaseConfig.ts ' +
        '(or set VITE_FIREBASE_* env vars) before using shared state.',
    );
  }
  const cached = appsByName.get(name);
  if (cached) return cached;
  const instance = getApps().find(candidate => candidate.name === name) ??
    (name === '[DEFAULT]' ? initializeApp(firebaseConfig) : initializeApp(firebaseConfig, name));
  appsByName.set(name, instance);
  return instance;
}

const authInstances = new Map<string, Auth>();
const functionsInstances = new Map<string, Functions>();
const appCheckInstances = new Map<string, AppCheck>();
const actorServices = new Map<string, Readonly<{ auth: Auth; functions: Functions }>>();

/**
 * Production App Check starts before Firebase services. The explicitly selected
 * local emulators do not enforce attestation, and starting the debug provider
 * there would still exchange tokens with the remote App Check service.
 * The production site key is public; its domains live in reCAPTCHA Enterprise.
 */
export function appCheck(name = demoActorAppName()): AppCheck | undefined {
  if (useEmulators) return undefined;
  let instance = appCheckInstances.get(name);
  if (!instance) {
    if (!appCheckSiteKey) {
      throw new Error(
        'Firebase App Check is not configured. Set VITE_APP_CHECK_SITE_KEY before using Firebase services.',
      );
    }
    instance = initializeAppCheck(firebaseApp(name), {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInstances.set(name, instance);
  }
  return instance;
}

export function app(name = demoActorAppName()): FirebaseApp {
  const instance = firebaseApp(name);
  appCheck(name);
  return instance;
}

export function auth(name = demoActorAppName()): Auth {
  let instance = authInstances.get(name);
  if (!instance) {
    instance = getAuth(app(name));
    if (useEmulators) {
      connectAuthEmulator(instance, `http://127.0.0.1:${emulatorPorts.auth}`, {
        disableWarnings: true,
      });
    }
    authInstances.set(name, instance);
  }
  return instance;
}

export function functions(name = demoActorAppName()): Functions {
  let instance = functionsInstances.get(name);
  if (!instance) {
    instance = getFunctions(app(name));
    if (useEmulators) {
      connectFunctionsEmulator(instance, '127.0.0.1', emulatorPorts.functions);
    }
    functionsInstances.set(name, instance);
  }
  return instance;
}

/** Independent SDK identities used only by the disclosed demo crew manager. */
export function demoActorServices(profile: DemoActorProfile): Readonly<{ auth: Auth; functions: Functions }> {
  const name = demoActorAppName(profile);
  const existing = actorServices.get(name);
  if (existing) return existing;
  const services = { auth: auth(name), functions: functions(name) };
  actorServices.set(name, services);
  return services;
}

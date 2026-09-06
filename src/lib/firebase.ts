import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
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

/**
 * Lazy, single-instance Firebase wiring.
 *
 * Nothing here runs at import time. The landing page renders before the first
 * feature asks for an Auth or Functions instance, which keeps configuration
 * errors observable and the module straightforward to test.
 */

function firebaseApp(): FirebaseApp {
  if (!firebaseConfigured) {
    throw new Error(
      'Firebase is not configured yet. Fill in src/lib/firebaseConfig.ts ' +
        '(or set VITE_FIREBASE_* env vars) before using shared state.',
    );
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let authInstance: Auth | undefined;
let functionsInstance: Functions | undefined;
let appCheckInstance: AppCheck | undefined;

/**
 * App Check must start before any Firebase service so callable and Firestore
 * requests carry an automatically refreshed attestation token. The site key is
 * intentionally public; its allowed domains live in reCAPTCHA Enterprise.
 */
export function appCheck(): AppCheck {
  if (!appCheckInstance) {
    if (!appCheckSiteKey) {
      throw new Error(
        'Firebase App Check is not configured. Set VITE_APP_CHECK_SITE_KEY before using Firebase services.',
      );
    }
    if (useEmulators) {
      (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean })
        .FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    appCheckInstance = initializeAppCheck(firebaseApp(), {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return appCheckInstance;
}

export function app(): FirebaseApp {
  const instance = firebaseApp();
  appCheck();
  return instance;
}

export function auth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(app());
    if (useEmulators) {
      connectAuthEmulator(authInstance, `http://127.0.0.1:${emulatorPorts.auth}`, {
        disableWarnings: true,
      });
    }
  }
  return authInstance;
}

export function functions(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(app());
    if (useEmulators) {
      connectFunctionsEmulator(functionsInstance, '127.0.0.1', emulatorPorts.functions);
    }
  }
  return functionsInstance;
}

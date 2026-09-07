import type { GlobalOptions } from 'firebase-functions/v2';

type RuntimeEnvironment = Readonly<{
  FUNCTIONS_EMULATOR?: string;
}>;

/**
 * Runtime defaults shared by every callable. Production callers must prove
 * they came from the web app, while the local Functions Emulator cannot
 * validate App Check tokens and is identified by Firebase's own environment.
 */
export function callableRuntimeOptionsFor(environment: RuntimeEnvironment = process.env) {
  return {
    region: 'us-central1',
    maxInstances: 10,
    enforceAppCheck: environment.FUNCTIONS_EMULATOR !== 'true',
  } satisfies GlobalOptions;
}

export const CALLABLE_RUNTIME_OPTIONS = callableRuntimeOptionsFor();

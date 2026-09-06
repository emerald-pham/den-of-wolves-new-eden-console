import type { GlobalOptions } from 'firebase-functions/v2';

/**
 * Runtime defaults shared by every callable. A bounded fleet does not need
 * unbounded scale-out, and every caller must prove it came from the web app.
 */
export const CALLABLE_RUNTIME_OPTIONS = {
  region: 'us-central1',
  maxInstances: 10,
  enforceAppCheck: true,
} satisfies GlobalOptions;

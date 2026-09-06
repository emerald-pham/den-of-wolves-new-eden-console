export const EMULATOR_SLOT_COUNT = 15;

const BASE_PORTS = Object.freeze({
  auth: 9099,
  functions: 5001,
  firestore: 8080,
  firestoreWebsocket: 9300,
  hosting: 5000,
  ui: 4000,
  hub: 4400,
  // This range intentionally starts above the Hub range so all 15 rows remain
  // globally unique. The former 4500 base collides with Hub slots 10 through 14.
  logging: 4600,
});

const PORT_OFFSET_PER_SLOT = 10;
const VITE_DEV_SERVER_PORT = 5173;

function assertSlot(slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= EMULATOR_SLOT_COUNT) {
    throw new RangeError(
      `Emulator slot must be an integer from 0 through ${EMULATOR_SLOT_COUNT - 1}.`,
    );
  }
}

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

/** Return every Firebase service port assigned to one worktree slot. */
export function emulatorPortsForSlot(slot) {
  assertSlot(slot);
  const offset = slot * PORT_OFFSET_PER_SLOT;

  return {
    auth: BASE_PORTS.auth + offset,
    functions: BASE_PORTS.functions + offset,
    firestore: BASE_PORTS.firestore + offset,
    firestoreWebsocket: BASE_PORTS.firestoreWebsocket + offset,
    hosting: BASE_PORTS.hosting + offset,
    ui: BASE_PORTS.ui + offset,
    hub: BASE_PORTS.hub + offset,
    logging: BASE_PORTS.logging + offset,
  };
}

/** Return the Vite variables that make the browser use the selected slot. */
export function emulatorEnvironmentForSlot(slot) {
  const ports = emulatorPortsForSlot(slot);

  return {
    VITE_USE_EMULATORS: '1',
    VITE_FIREBASE_AUTH_EMULATOR_PORT: String(ports.auth),
    VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT: String(ports.functions),
    VITE_FIREBASE_FIRESTORE_EMULATOR_PORT: String(ports.firestore),
    VITE_DEV_SERVER_PORT: String(VITE_DEV_SERVER_PORT + slot),
  };
}

/** Overlay one slot's complete emulator set on an existing Firebase config. */
export function firebaseConfigForSlot(baseConfig, slot) {
  const ports = emulatorPortsForSlot(slot);
  const config = objectRecord(baseConfig);
  const emulators = objectRecord(config.emulators);

  return {
    ...config,
    emulators: {
      ...emulators,
      auth: { ...objectRecord(emulators.auth), port: ports.auth },
      functions: { ...objectRecord(emulators.functions), port: ports.functions },
      firestore: {
        ...objectRecord(emulators.firestore),
        port: ports.firestore,
        websocketPort: ports.firestoreWebsocket,
      },
      hosting: { ...objectRecord(emulators.hosting), port: ports.hosting },
      ui: { ...objectRecord(emulators.ui), enabled: true, port: ports.ui },
      hub: { ...objectRecord(emulators.hub), port: ports.hub },
      logging: { ...objectRecord(emulators.logging), port: ports.logging },
    },
  };
}

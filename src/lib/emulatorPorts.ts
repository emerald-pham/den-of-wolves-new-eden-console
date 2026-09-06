export interface EmulatorPorts {
  readonly auth: number;
  readonly functions: number;
  readonly firestore: number;
}

type EmulatorEnvironment = Readonly<Record<string, string | boolean | undefined>>;

function port(value: string | boolean | undefined, fallback: number): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535 ? parsed : fallback;
}

export function resolveEmulatorPorts(env: EmulatorEnvironment): EmulatorPorts {
  return {
    auth: port(env.VITE_FIREBASE_AUTH_EMULATOR_PORT, 9099),
    functions: port(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT, 5001),
    firestore: port(env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT, 8080),
  };
}

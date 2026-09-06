export interface EmulatorSlotPorts {
  readonly auth: number;
  readonly functions: number;
  readonly firestore: number;
  readonly firestoreWebsocket: number;
  readonly hosting: number;
  readonly ui: number;
  readonly hub: number;
  readonly logging: number;
}

export type EmulatorEnvironment = Readonly<Record<string, string>>;

export const EMULATOR_SLOT_COUNT: number;

export function emulatorPortsForSlot(slot: number): EmulatorSlotPorts;
export function emulatorEnvironmentForSlot(slot: number): EmulatorEnvironment;
export function firebaseConfigForSlot(
  baseConfig: Record<string, unknown>,
  slot: number,
): Record<string, unknown>;

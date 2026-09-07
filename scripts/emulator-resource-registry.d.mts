export const COORDINATION_FILE_ENV: string;
export const COORDINATION_SCHEMA_VERSION: number;
export const DEFAULT_VERSION_AGREEMENT: string;

export interface CoordinationReservation {
  readonly id?: string;
  readonly slot: number;
  readonly worktree: string;
  readonly kind: string;
  readonly pid: number;
  readonly command: string;
  readonly claimedAt: string;
  readonly ports?: readonly number[];
}

export interface CoordinationEntry {
  readonly id: string;
  readonly worktree: string;
  readonly pid?: number;
  readonly startedAt: string;
  readonly status?: string;
  readonly intent: string;
  readonly versionPlan: string;
  readonly preemptiveChangelog: string;
  readonly resources?: readonly string[];
  readonly completedAt?: string;
  readonly result?: string;
}

export interface ConfiguredEmulatorSlot {
  readonly id: string;
  readonly slot: number;
  readonly worktree: string;
  readonly configuredAt: string;
  readonly ports?: readonly number[];
}

export interface CoordinationState {
  readonly version: number;
  readonly versionAgreement: string;
  readonly entries: readonly CoordinationEntry[];
  readonly reservations: readonly CoordinationReservation[];
  readonly configurations: readonly ConfiguredEmulatorSlot[];
}

export function coordinationFilePath(
  environment?: Readonly<Record<string, string | undefined>>,
  temporaryDirectory?: string,
): string;
export function emptyCoordinationState(): CoordinationState;
export function parseCoordinationState(content: string): CoordinationState;
export function pruneDeadReservations(
  state: CoordinationState,
  isAlive?: (pid: number) => boolean,
): CoordinationState;
export function pruneOrphanedConfigurations(
  state: CoordinationState,
): CoordinationState;
export function chooseAvailableEmulatorSlot(options: {
  preferredSlot?: number;
  availableSlots: readonly number[];
  worktree: string;
  kind: string;
  reservations: readonly CoordinationReservation[];
}): number | undefined;
export function isPortFree(port: number, host?: string): Promise<boolean>;
export function readCoordinationState(filePath?: string): Promise<CoordinationState>;
export function reserveConfiguredEmulatorSlot(options: {
  filePath?: string;
  slot: number;
  worktree?: string;
  ports: readonly number[];
  portCheck?: (port: number) => Promise<boolean>;
}): Promise<ConfiguredEmulatorSlot>;
export function reserveAvailableConfiguredEmulatorSlot(options: {
  filePath?: string;
  preferredSlot?: number;
  worktree?: string;
  availableSlots?: readonly number[];
  portsForSlot?: (slot: number) => readonly number[];
  portCheck?: (port: number) => Promise<boolean>;
}): Promise<ConfiguredEmulatorSlot>;
export function releaseConfiguredEmulatorSlot(
  configuration: ConfiguredEmulatorSlot,
  filePath?: string,
): Promise<void>;
export function reserveEmulatorSlot(options: {
  filePath?: string;
  slot: number;
  worktree?: string;
  kind: string;
  command: string;
  ports: readonly number[];
  portCheck?: (port: number) => Promise<boolean>;
}): Promise<CoordinationReservation>;
export function reserveAvailableEmulatorSlot(options: {
  filePath?: string;
  preferredSlot?: number;
  worktree?: string;
  kind: string;
  command: string;
  availableSlots?: readonly number[];
  portsForSlot?: (slot: number) => readonly number[];
  portCheck?: (port: number) => Promise<boolean>;
}): Promise<CoordinationReservation>;
export function releaseEmulatorSlot(
  reservation: CoordinationReservation,
  filePath?: string,
): Promise<void>;
export function formatCoordinationState(state: CoordinationState): string;

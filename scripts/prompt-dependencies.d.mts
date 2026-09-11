import type { PromptCatalog } from './prompt-catalog.mjs';

export const DEPENDENCY_PACKET_SCHEMA_VERSION: number;
export const COMPACT_PACKET_MAX_LINES: number;
export const COMPACT_PACKET_MAX_BYTES: number;
export const DEPENDENCY_AUTHORITY_PATHS: Readonly<{ catalog: string }>;

export interface DependencyPacket {
  readonly schemaVersion: number;
  readonly source: string;
  readonly selected: Readonly<Record<string, unknown>>;
  readonly readiness: 'done' | 'ready' | 'needs-confirmation' | 'blocked' | 'unknown';
  readonly next: string | null;
  readonly readyQueue: readonly Readonly<Record<string, unknown>>[];
  readonly needsConfirmation: readonly Readonly<Record<string, unknown>>[];
  readonly blocked: readonly Readonly<Record<string, unknown>>[];
  readonly summary: Readonly<Record<string, unknown>>;
}

export function createDependencyPacket(options: {
  readonly prompt: number | string;
  readonly catalog?: PromptCatalog;
  readonly catalogSource?: string;
  readonly cwd?: string;
  readonly path?: string;
  readonly requestedScopes?: readonly string[];
  readonly requestedClaims?: readonly string[];
}): DependencyPacket;
export function formatDependencyPacket(
  packet: DependencyPacket,
  options?: { readonly full?: boolean; readonly json?: boolean },
): string;
export function loadDependencySources(cwd?: string, path?: string): Readonly<{
  catalogSource: string;
  catalog: PromptCatalog;
}>;

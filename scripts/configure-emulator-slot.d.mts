import type { ConfiguredEmulatorSlot } from './emulator-resource-registry.mjs';

export function configureEmulatorSlot(options?: {
  readonly slot?: number | undefined;
  readonly repositoryDirectory?: string;
  readonly coordinationPath?: string;
  readonly portCheck?: (port: number) => Promise<boolean>;
  readonly write?: (path: string, content: string) => Promise<void>;
}): Promise<{
  readonly configuration: ConfiguredEmulatorSlot;
  readonly localFirebaseConfigPath: string;
  readonly localEnvironmentPath: string;
  readonly coordinationPath: string;
}>;

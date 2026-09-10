export declare const LOCKFILE_STAMP_FILE: string;

export interface DependencyInstallRequest {
  readonly cwd: string;
  readonly args: readonly string[];
}

export interface BootstrapOptions {
  readonly repositoryDirectory?: string;
  readonly runInstall?: (request: DependencyInstallRequest) => Promise<void>;
}

export interface BootstrapResult {
  readonly installed: readonly string[];
  readonly skipped: readonly string[];
}

export declare function fingerprintLockfile(lockfilePath: string): Promise<string>;
export declare function bootstrapDependencies(options?: BootstrapOptions): Promise<BootstrapResult>;

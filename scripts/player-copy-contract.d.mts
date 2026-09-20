export interface PlayerCopyViolation {
  readonly file: string;
  readonly line: number;
  readonly ruleId: string;
  readonly text: string;
  readonly guidance: string;
}

export interface PlayerCopyScanOptions {
  readonly root?: string;
  readonly contractPath?: string;
}

export function scanPlayerCopyContract(options?: PlayerCopyScanOptions): PlayerCopyViolation[];

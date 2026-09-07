import { describe, expect, it } from 'vitest';
import {
  CODEX_COORDINATION_FILE_ENV,
  COORDINATION_FILE_ENV,
  COORDINATION_SCOPE,
  coordinationFilePath,
  emptyCoordinationState,
  formatCoordinationState,
  parseCoordinationState,
} from '../../scripts/emulator-resource-registry.mjs';

describe('Codex-wide coordination', () => {
  it('accepts a canonical cross-project file override and preserves the legacy alias', () => {
    expect(
      coordinationFilePath(
        { [CODEX_COORDINATION_FILE_ENV]: '/tmp/codex-wide.json' },
        '/tmp',
      ),
    ).toBe('/tmp/codex-wide.json');
    expect(
      coordinationFilePath(
        { [COORDINATION_FILE_ENV]: '/tmp/legacy-coordination.json' },
        '/tmp',
      ),
    ).toBe('/tmp/legacy-coordination.json');
  });

  it('marks legacy and new state as Codex-wide', () => {
    expect(COORDINATION_SCOPE).toBe('codex-wide');
    expect(emptyCoordinationState().scope).toBe('codex-wide');
    expect(
      parseCoordinationState(JSON.stringify({ version: 1, entries: [] })).scope,
    ).toBe('codex-wide');
  });

  it('labels status output as shared across local repositories', () => {
    expect(formatCoordinationState(emptyCoordinationState())).toContain(
      'Codex-wide coordination',
    );
  });
});

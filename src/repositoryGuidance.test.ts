import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('repository guidance', () => {
  it('requires collision-free emulator ports in concurrent worktrees', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('Concurrent worktrees and emulator ports');
    expect(guidance).toContain('firebase emulators:start');
    expect(guidance).toContain('firebase emulators:exec');
    expect(guidance).toContain('lsof');
    expect(guidance).toMatch(
      /auth,\s+Functions, Firestore, Hosting, Emulator UI, Hub, and Logging/,
    );
  });
});

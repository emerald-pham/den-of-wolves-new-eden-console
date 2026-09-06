import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('repository guidance', () => {
  it('requires agents to install locked dependencies in fresh worktrees', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('Worktree dependency bootstrap');
    expect(guidance).toContain('npm ci');
    expect(guidance).toContain('npm ci --prefix functions');
    expect(guidance).toContain('package-lock.json');
    expect(guidance).toContain('functions/package-lock.json');
  });

  it('requires agents to leave detached HEAD before editing', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('Worktree branch bootstrap');
    expect(guidance).toContain('git branch --show-current');
    expect(guidance).toContain('before changing files');
    expect(guidance).toContain('current `HEAD`');
  });

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

  it('requires every product release to update the player-facing changelog', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('Player-facing changelog');
    expect(guidance).toContain('every completed product edit');
    expect(guidance).toContain('user perspective');
    expect(guidance).toContain('developer perspective');
  });
});

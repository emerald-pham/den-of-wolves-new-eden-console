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
    expect(guidance).toContain('Before editing');
    expect(guidance).toContain('branch must be attached');
  });

  it('requires collision-free emulator ports in concurrent worktrees', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('Concurrent worktrees and emulator ports');
    expect(guidance).toContain('firebase emulators:start');
    expect(guidance).toContain('firebase emulators:exec');
    expect(guidance).toContain('lsof');
    expect(guidance).toContain('npm run emulators:configure -- auto');
    expect(guidance).toContain('| 14 |');
    expect(guidance).toMatch(
      /auth,\s+Functions, Firestore, Firestore WebSocket, Hosting, Emulator UI, Hub, and Logging/,
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

  it('requires a shared preemptive work entry before agents edit a worktree', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('preemptive changelog');
    expect(guidance).toContain('coordination:begin');
    expect(guidance).toContain('version agreement');
    expect(guidance).toContain('coordination:status');
  });

  it('requires the executable coordination validation and completion gate', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('coordination:validate');
    expect(guidance).toContain('coordination:docs');
    expect(guidance).toContain('documentation-review');
    expect(guidance).toContain('visual-review');
    expect(guidance).toContain('final branch SHA');
    expect(guidance).toContain('origin/main');
    expect(guidance).toContain('machine-checked');
  });

  it('keeps AGENTS.md as a pointer to the canonical executable gate', () => {
    const agentsPath = resolve(process.cwd(), 'AGENTS.md');
    const agents = readFileSync(agentsPath, 'utf8');

    expect(agents).toContain('CLAUDE.md');
    expect(agents).toContain('coordination:validate');
    expect(agents).toContain('coordination:finish');
    expect(agents).toContain('machine-checked');
  });

  it('makes startup recovery authoritative when end cleanup was skipped', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('Start cleanup is authoritative');
    expect(guidance).toMatch(/no\s+live reservation does not mean a configured row is free/);
    expect(guidance).toContain('End cleanup remains required');
    expect(guidance).toMatch(/worktree is\s+missing/);
  });

  it('requires every task to track immediate post-test merge as an objective', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('Every `Session goals` checklist must include this release objective');
    expect(guidance.replace(/\s+/g, ' ')).toContain(
      'As soon as required validation is green: commit, reconcile with current main, merge to main, push to origin, and close coordination.',
    );
    expect(guidance).toContain('Immediate post-test merge objective is checked off');
  });
});

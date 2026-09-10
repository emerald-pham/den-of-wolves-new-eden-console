// @ts-expect-error The executable gate is intentionally plain JavaScript.
import { DEFAULT_WORKTREE_LIMIT, parseWorktreeLimitArguments, parseWorktreePorcelain, planWorktreePrune } from '../../scripts/enforce-worktree-limit.mjs';

describe('worktree retention gate', () => {
  it('parses the primary, attached, and detached records from Git porcelain output', () => {
    const worktrees = parseWorktreePorcelain([
      'worktree /repo',
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/main',
      '',
      'worktree /repo/feature',
      'HEAD 2222222222222222222222222222222222222222',
      'branch refs/heads/feature/test',
      '',
      'worktree /repo/detached',
      'HEAD 3333333333333333333333333333333333333333',
      'detached',
      '',
    ].join('\n'));

    expect(worktrees).toEqual([
      {
        path: '/repo',
        head: '1111111111111111111111111111111111111111',
        branch: 'main',
        isPrimary: true,
      },
      {
        path: '/repo/feature',
        head: '2222222222222222222222222222222222222222',
        branch: 'feature/test',
        isPrimary: false,
      },
      {
        path: '/repo/detached',
        head: '3333333333333333333333333333333333333333',
        branch: undefined,
        isPrimary: false,
      },
    ]);
  });

  it('selects the oldest eligible landed worktrees without touching protected worktrees', () => {
    const plan = planWorktreePrune({
      limit: 4,
      currentWorktree: '/repo/current',
      activeWorktrees: new Set(['/repo/active']),
      worktrees: [
        { path: '/repo', isPrimary: true, exists: true, clean: true, mergedIntoMain: true, createdAtMs: 1 },
        { path: '/repo/active', exists: true, clean: true, mergedIntoMain: true, createdAtMs: 2 },
        { path: '/repo/dirty', exists: true, clean: false, mergedIntoMain: true, createdAtMs: 3 },
        { path: '/repo/unmerged', exists: true, clean: true, mergedIntoMain: false, createdAtMs: 4 },
        { path: '/repo/oldest', exists: true, clean: true, mergedIntoMain: true, createdAtMs: 5 },
        { path: '/repo/newer', exists: true, clean: true, mergedIntoMain: true, createdAtMs: 6 },
      ],
    });

    expect(plan).toMatchObject({
      existingCount: 6,
      limit: 4,
      removalsNeeded: 2,
      shortfall: 0,
    });
    expect(plan.removals.map((worktree: { path: string }) => worktree.path)).toEqual([
      '/repo/oldest',
      '/repo/newer',
    ]);
    expect(plan.protected).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/repo', reason: 'primary worktree' }),
      expect.objectContaining({ path: '/repo/active', reason: 'active coordination work' }),
      expect.objectContaining({ path: '/repo/dirty', reason: 'dirty worktree' }),
      expect.objectContaining({ path: '/repo/unmerged', reason: 'unmerged commit' }),
    ]));
  });

  it('refuses to pretend the cap is satisfied when unsafe worktrees block pruning', () => {
    const plan = planWorktreePrune({
      limit: 1,
      currentWorktree: '/repo/current',
      worktrees: [
        { path: '/repo', isPrimary: true, exists: true, clean: true, mergedIntoMain: true, createdAtMs: 1 },
        { path: '/repo/dirty', exists: true, clean: false, mergedIntoMain: true, createdAtMs: 2 },
        { path: '/repo/unmerged', exists: true, clean: true, mergedIntoMain: false, createdAtMs: 3 },
      ],
    });

    expect(plan.removals).toEqual([]);
    expect(plan.removalsNeeded).toBe(2);
    expect(plan.shortfall).toBe(2);
  });

  it('requires an explicit apply flag and a positive integer limit', () => {
    expect(parseWorktreeLimitArguments([])).toEqual({
      apply: false,
      limit: DEFAULT_WORKTREE_LIMIT,
    });
    expect(parseWorktreeLimitArguments(['--apply', '--limit', '50'])).toEqual({
      apply: true,
      limit: 50,
    });
    expect(() => parseWorktreeLimitArguments(['--limit', '0'])).toThrow(/positive integer/i);
  });
});

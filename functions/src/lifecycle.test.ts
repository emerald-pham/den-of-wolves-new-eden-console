import {
  assertLifecycleTransition,
  canTransitionLifecycle,
  type LifecyclePhase,
} from './lifecycle';

describe('lifecycle transition policy', () => {
  it.each([
    ['lobby', 'casting'],
    ['casting', 'briefing'],
    ['briefing', 'active'],
    ['active', 'success'],
    ['active', 'failure'],
    ['active', 'debrief'],
    ['success', 'debrief'],
    ['failure', 'debrief'],
    ['debrief', 'closed'],
    ['lobby', 'retained-empty'],
  ] as const)('allows the explicit %s -> %s edge', (from, to) => {
    expect(canTransitionLifecycle(from, to)).toBe(true);
    expect(assertLifecycleTransition(from, to)).toBe(to);
  });

  it.each([
    ['lobby', 'active'],
    ['casting', 'success'],
    ['briefing', 'success'],
    ['active', 'lobby'],
    ['active', 'casting'],
    ['closed', 'lobby'],
    ['retained-empty', 'lobby'],
  ] as const)('rejects the illegal %s -> %s edge', (from, to) => {
    expect(canTransitionLifecycle(from, to)).toBe(false);
    expect(() => assertLifecycleTransition(from, to)).toThrow(
      `Illegal lifecycle transition: ${from} -> ${to}`,
    );
  });

  it('rejects unknown phases at the policy boundary', () => {
    expect(canTransitionLifecycle('unknown' as LifecyclePhase, 'lobby')).toBe(false);
    expect(() => assertLifecycleTransition('lobby', 'unknown' as LifecyclePhase)).toThrow(
      'Unknown lifecycle phase',
    );
  });
});

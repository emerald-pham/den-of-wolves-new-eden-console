const FULL_SCENARIOS = ['press', 'turn-zero'];

export function resolveTickerSmokePlan({
  shard,
  onlyLifecycle = false,
  onlyReducedLifecycle = false,
} = {}) {
  if (shard && (onlyLifecycle || onlyReducedLifecycle)) {
    throw new Error('TICKER_SMOKE_SHARD cannot be combined with focused lifecycle modes.');
  }

  if (shard) {
    if (shard === 'press') {
      return { scenarios: ['press'], normalLifecycle: false, reducedLifecycle: false };
    }
    if (shard === 'turn-zero') {
      return { scenarios: ['turn-zero'], normalLifecycle: false, reducedLifecycle: false };
    }
    if (shard === 'lifecycle') {
      return { scenarios: [], normalLifecycle: true, reducedLifecycle: true };
    }
    throw new Error(`Unknown ticker smoke shard: ${shard}`);
  }

  if (onlyReducedLifecycle) {
    return { scenarios: [], normalLifecycle: false, reducedLifecycle: true };
  }
  if (onlyLifecycle) {
    return { scenarios: [], normalLifecycle: true, reducedLifecycle: false };
  }

  return {
    scenarios: [...FULL_SCENARIOS],
    normalLifecycle: true,
    reducedLifecycle: true,
  };
}

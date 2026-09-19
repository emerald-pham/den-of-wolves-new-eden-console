const SAFE_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const round = (value) => Math.round(value * 100) / 100;

export const HEALTH_METRIC_VOCABULARY = Object.freeze({
  callableNames: Object.freeze([
    'adjust-ship-resource', 'assign-role', 'claim-gm-instance', 'claim-seat',
    'confirm-setup', 'create-session', 'disconnect-from-session', 'elevate-to-gm',
    'join-session', 'login-gm-access', 'refresh-presence', 'resume-session', 'start-game',
  ]),
  sources: Object.freeze(['emulator', 'emulator-recovery', 'injected-transport']),
  projections: Object.freeze(['gm-collection', 'player-collection', 'session-projection']),
  stages: Object.freeze(['action-update', 'initial', 'reconnect-update', 'start-update']),
  transientCodes: Object.freeze(['resource-exhausted', 'unavailable']),
});

function safeName(value, label) {
  if (typeof value !== 'string' || !SAFE_NAME.test(value)) {
    throw new Error(`${label} must be a lowercase privacy-safe metric name.`);
  }
  return value;
}

function vocabularyName(value, label, allowed) {
  const name = safeName(value, label);
  if (!allowed.includes(name)) throw new Error(`${label} is outside the fixed health metric vocabulary.`);
  return name;
}

function safeDuration(value) {
  if (!Number.isFinite(value) || value < 0 || value > 300_000) {
    throw new Error('Health metric duration must be finite and between 0 and 300000ms.');
  }
  return round(value);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function callableOutcome(error, result) {
  if (!error && result && typeof result === 'object' && result.status === 'stale') return 'contention';
  if (!error) return 'success';
  const raw = typeof error.code === 'string' ? error.code : 'unknown';
  const code = raw.replace(/^functions\//, '');
  if (code === 'permission-denied' || code === 'unauthenticated') return 'denied';
  if (code === 'resource-exhausted') return 'throttled';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'unavailable';
  return 'rejected';
}

export function listenerDelayAfter(events, startedAt) {
  if (!Array.isArray(events) || !Number.isFinite(startedAt)) {
    throw new Error('Listener events and start time must be finite timing data.');
  }
  const receivedAt = events.find((eventAt) => Number.isFinite(eventAt) && eventAt >= startedAt);
  return receivedAt === undefined ? undefined : safeDuration(receivedAt - startedAt);
}

function aggregate(records, keys) {
  const groups = new Map();
  for (const record of records) {
    const key = keys.map((field) => record[field]).join('\u0000');
    const group = groups.get(key) ?? { records: [], identity: Object.fromEntries(keys.map((field) => [field, record[field]])) };
    group.records.push(record);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ records: group, identity }) => {
    const durations = group.map((record) => record.durationMs);
    return {
      ...identity,
      count: group.length,
      latencyMs: {
        min: Math.min(...durations),
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        max: Math.max(...durations),
      },
      retryAttempts: group.filter((record) => record.attempt > 1).length,
    };
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function createHealthMetricsRecorder({ clock = () => performance.now() } = {}) {
  const callables = [];
  const listeners = [];

  return {
    async measureCallable(name, operation, { source = 'emulator', attempt = 1 } = {}) {
      const metricName = vocabularyName(name, 'Callable', HEALTH_METRIC_VOCABULARY.callableNames);
      const metricSource = vocabularyName(source, 'Callable source', HEALTH_METRIC_VOCABULARY.sources);
      if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 10) {
        throw new Error('Callable attempt must be an integer from 1 through 10.');
      }
      const startedAt = clock();
      try {
        const result = await operation();
        callables.push({ name: metricName, source: metricSource, outcome: callableOutcome(null, result), attempt, durationMs: safeDuration(clock() - startedAt) });
        return result;
      } catch (error) {
        callables.push({ name: metricName, source: metricSource, outcome: callableOutcome(error), attempt, durationMs: safeDuration(clock() - startedAt) });
        throw error;
      }
    },
    recordTransient(name, code, { attempt, durationMs = 0 } = {}) {
      const error = { code: vocabularyName(code, 'Transient code', HEALTH_METRIC_VOCABULARY.transientCodes) };
      callables.push({
        name: vocabularyName(name, 'Callable', HEALTH_METRIC_VOCABULARY.callableNames), source: 'injected-transport', outcome: callableOutcome(error),
        attempt: Number.isSafeInteger(attempt) && attempt >= 1 && attempt <= 10 ? attempt : 1,
        durationMs: safeDuration(durationMs),
      });
    },
    recordListener(projection, stage, durationMs) {
      listeners.push({
        projection: vocabularyName(projection, 'Listener projection', HEALTH_METRIC_VOCABULARY.projections),
        stage: vocabularyName(stage, 'Listener stage', HEALTH_METRIC_VOCABULARY.stages),
        durationMs: safeDuration(durationMs),
      });
    },
    summary() {
      return {
        schemaVersion: 1,
        privacy: 'aggregate-only; identifiers and content omitted',
        callableSamples: callables.length,
        listenerSamples: listeners.length,
        retryAttempts: callables.filter((record) => record.attempt > 1).length,
        callables: aggregate(callables, ['name', 'source', 'outcome']),
        listeners: aggregate(listeners.map((record) => ({ ...record, attempt: 1 })), ['projection', 'stage'])
          .map(({ retryAttempts: _retryAttempts, ...record }) => record),
      };
    },
  };
}

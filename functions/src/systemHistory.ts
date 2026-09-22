import { isStarSystemCoordinate, type NavigationLogEntry } from './navigation';

/**
 * A server-authored history event. The category that owns the event provides
 * its meaning; this persistence seam deliberately keeps only a stable event
 * identity and server timestamp until that producer is implemented.
 */
export interface SystemHistoryEvent {
  readonly id: string;
  readonly occurredAt: string;
}

export interface CandidateDiscovery extends SystemHistoryEvent {
  readonly code: 'N' | 'O' | 'P';
  readonly title: string;
  readonly source: 'arrival' | 'scout';
}

/**
 * One printed system's durable state. The future buckets are explicit so a
 * reconnect never has to infer whether a later producer has written state.
 */
export interface SystemHistoryEntry {
  readonly coordinate: string;
  readonly discovery?: SystemHistoryEvent;
  readonly candidateDiscovery?: CandidateDiscovery;
  readonly attempts: readonly SystemHistoryEvent[];
  readonly hazards: readonly SystemHistoryEvent[];
  readonly rewards: readonly SystemHistoryEvent[];
  readonly clearedThreats: readonly SystemHistoryEvent[];
  readonly candidateProgress: readonly SystemHistoryEvent[];
}

export type SystemHistoryForShip = Readonly<Record<string, SystemHistoryEntry>>;
export type SystemHistory = Readonly<Record<string, SystemHistoryForShip>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function historyEvent(value: unknown): SystemHistoryEvent | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0 ||
      typeof value.occurredAt !== 'string' || value.occurredAt.length === 0) {
    return undefined;
  }
  return { id: value.id, occurredAt: value.occurredAt };
}

function candidateDiscovery(value: unknown): CandidateDiscovery | undefined {
  const event = historyEvent(value);
  if (!event || !isRecord(value) ||
      (value.code !== 'N' && value.code !== 'O' && value.code !== 'P') ||
      typeof value.title !== 'string' || value.title.length === 0 || value.title.length > 160 ||
      value.title.trim() !== value.title ||
      (value.source !== 'arrival' && value.source !== 'scout')) return undefined;
  return { ...event, code: value.code, title: value.title, source: value.source };
}

function historyEvents(value: unknown): readonly SystemHistoryEvent[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    const event = historyEvent(candidate);
    if (!event || seen.has(event.id)) return [];
    seen.add(event.id);
    return [event];
  });
}

function emptyEntry(coordinate: string): SystemHistoryEntry {
  return {
    coordinate,
    attempts: [],
    hazards: [],
    rewards: [],
    clearedThreats: [],
    candidateProgress: [],
  };
}

function storedEntry(value: unknown, coordinate: string): SystemHistoryEntry | undefined {
  if (!isRecord(value) || value.coordinate !== coordinate) return undefined;
  const discovery = value.discovery === undefined ? undefined : historyEvent(value.discovery);
  const foundCandidate = value.candidateDiscovery === undefined
    ? undefined : candidateDiscovery(value.candidateDiscovery);
  if (value.discovery !== undefined && !discovery) return undefined;
  if (value.candidateDiscovery !== undefined && !foundCandidate) return undefined;
  return {
    coordinate,
    ...(discovery ? { discovery } : {}),
    ...(foundCandidate ? { candidateDiscovery: foundCandidate } : {}),
    attempts: historyEvents(value.attempts),
    hazards: historyEvents(value.hazards),
    rewards: historyEvents(value.rewards),
    clearedThreats: historyEvents(value.clearedThreats),
    candidateProgress: historyEvents(value.candidateProgress),
  };
}

function mergeDiscoveryFromLogs(
  entries: SystemHistoryForShip,
  logs: readonly NavigationLogEntry[],
): SystemHistoryForShip {
  const next: Record<string, SystemHistoryEntry> = Object.fromEntries(
    Object.entries(entries).map(([coordinate, entry]) => [coordinate, {
      ...entry,
      attempts: [...entry.attempts],
      hazards: [...entry.hazards],
      rewards: [...entry.rewards],
      clearedThreats: [...entry.clearedThreats],
      candidateProgress: [...entry.candidateProgress],
    }]),
  );
  for (const log of logs) {
    if (log.type !== 'self-jump' || !isStarSystemCoordinate(log.destination)) continue;
    const current = next[log.destination] ?? emptyEntry(log.destination);
    if (!current.discovery) {
      next[log.destination] = {
        ...current,
        discovery: { id: log.id, occurredAt: log.occurredAt },
      };
    }
  }
  return next;
}

/**
 * Normalize server history and backfill discovery records from the existing
 * authoritative self-jump log. No mission, hazard, reward, or candidate
 * outcome is inferred from navigation alone.
 */
export function systemHistory(
  value: unknown,
  activeVesselIds: readonly string[],
  logsByShip: Readonly<Record<string, readonly NavigationLogEntry[]>>,
): SystemHistory | undefined {
  const raw = isRecord(value) ? value : {};
  const result: Record<string, SystemHistoryForShip> = {};
  for (const shipId of activeVesselIds) {
    const rawShip = isRecord(raw[shipId]) ? raw[shipId] : {};
    const entries: Record<string, SystemHistoryEntry> = {};
    for (const [coordinate, candidate] of Object.entries(rawShip)) {
      if (!isStarSystemCoordinate(coordinate)) continue;
      const parsed = storedEntry(candidate, coordinate);
      if (parsed) entries[coordinate] = parsed;
    }
    const merged = mergeDiscoveryFromLogs(entries, logsByShip[shipId] ?? []);
    if (Object.keys(merged).length > 0) result[shipId] = merged;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function systemHistoryForShip(
  history: SystemHistory | undefined,
  shipId: string,
): SystemHistoryForShip | undefined {
  const entries = history?.[shipId];
  return entries && Object.keys(entries).length > 0 ? entries : undefined;
}

/** Append one producer-owned hazard outcome without duplicating its identity. */
export function recordSystemHazard(
  history: SystemHistory | undefined,
  shipId: string,
  coordinate: string,
  event: SystemHistoryEvent,
): SystemHistory {
  if (!isStarSystemCoordinate(coordinate) || !event.id || !event.occurredAt) {
    throw new Error('System hazard history is malformed.');
  }
  const currentShip = history?.[shipId] ?? {};
  const currentEntry = currentShip[coordinate] ?? emptyEntry(coordinate);
  const hazards = currentEntry.hazards.some((candidate) => candidate.id === event.id)
    ? [...currentEntry.hazards]
    : [...currentEntry.hazards, event];
  return {
    ...(history ?? {}),
    [shipId]: {
      ...currentShip,
      [coordinate]: { ...currentEntry, hazards },
    },
  };
}

/** Record the first server-authorized reveal of one printed New Eden candidate. */
export function recordCandidateDiscovery(
  history: SystemHistory | undefined,
  shipId: string,
  coordinate: string,
  discovery: CandidateDiscovery,
): SystemHistory {
  if (!shipId || !isStarSystemCoordinate(coordinate) || !candidateDiscovery(discovery)) {
    throw new Error('Candidate discovery history is malformed.');
  }
  const currentShip = history?.[shipId] ?? {};
  const currentEntry = currentShip[coordinate] ?? emptyEntry(coordinate);
  return {
    ...(history ?? {}),
    [shipId]: {
      ...currentShip,
      [coordinate]: currentEntry.candidateDiscovery
        ? currentEntry
        : { ...currentEntry, candidateDiscovery: discovery },
    },
  };
}

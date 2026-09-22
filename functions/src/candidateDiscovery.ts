import { organiserSitesForChart, type ChartId } from './starChartLookup';
import { parsePrivateScoutResult } from './scoutResultProjection';
import {
  recordCandidateDiscovery,
  type SystemHistory,
  type SystemHistoryEvent,
} from './systemHistory';

const CANDIDATE_CODES = new Set(['N', 'O', 'P']);
const CANDIDATE_TITLES = Object.freeze({
  N: 'Ancient Jump Ring',
  O: 'Deep Nebula',
  P: 'Ancient Space Station',
});

function isIsoTimestamp(value: string): boolean {
  try {
    return value.length > 0 && new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

/**
 * Apply a candidate reveal only after an authoritative movement has produced
 * the moving ship's own arrival event. Non-candidate systems are a no-op.
 */
export function candidateDiscoveryFromArrival(
  history: SystemHistory | undefined,
  input: Readonly<{
    shipId: string;
    coordinate: string;
    chart: ChartId;
    event: SystemHistoryEvent;
  }>,
): SystemHistory | undefined {
  const site = organiserSitesForChart(input.chart)[input.coordinate];
  if (!site || !CANDIDATE_CODES.has(site.code)) return history;
  return recordCandidateDiscovery(history, input.shipId, input.coordinate, {
    ...input.event,
    code: site.code as 'N' | 'O' | 'P',
    title: site.name,
    source: 'arrival',
  });
}

/**
 * Convert one strictly parsed private scout result into durable ship history.
 * The caller supplies the entitled ship and server timestamp; malformed,
 * non-candidate, or organiser-wide payloads cannot create a reveal.
 */
export function candidateDiscoveryFromScout(
  history: SystemHistory | undefined,
  shipId: string,
  rawResult: unknown,
  occurredAt: string,
): SystemHistory | undefined {
  const result = parsePrivateScoutResult(rawResult);
  if (!result || !CANDIDATE_CODES.has(result.systemFact.code) ||
      CANDIDATE_TITLES[result.systemFact.code as keyof typeof CANDIDATE_TITLES] !== result.systemFact.title ||
      !isIsoTimestamp(occurredAt)) return history;
  return recordCandidateDiscovery(history, shipId, result.targetCoordinate, {
    id: `scout-${result.requestId}`,
    occurredAt,
    code: result.systemFact.code as 'N' | 'O' | 'P',
    title: result.systemFact.title,
    source: 'scout',
  });
}

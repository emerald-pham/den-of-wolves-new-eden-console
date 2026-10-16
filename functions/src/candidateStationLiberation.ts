import { organiserSitesForChart } from './starChartLookup';

export interface CandidateStationLiberation {
  type: 'candidate-station-liberation'; sessionId: string; groupId: string; coordinate: string;
  chart: 'A' | 'B' | 'C'; sequenceId: string; sourceId: string; cycle: number; liberatedAt: string;
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const fields = ['type', 'sessionId', 'groupId', 'coordinate', 'chart', 'sequenceId', 'sourceId', 'cycle', 'liberatedAt'];
function marker(raw: unknown): raw is CandidateStationLiberation {
  return record(raw) && Object.keys(raw).length === fields.length && Object.keys(raw).every(k => fields.includes(k)) &&
    raw.type === 'candidate-station-liberation' && typeof raw.sessionId === 'string' && /^[\w-]{1,128}$/.test(raw.sessionId) &&
    typeof raw.groupId === 'string' && /^fleet-[1-9]\d*$/.test(raw.groupId) &&
    ['A', 'B', 'C'].includes(String(raw.chart)) && typeof raw.coordinate === 'string' &&
    organiserSitesForChart(raw.chart as 'A' | 'B' | 'C')[raw.coordinate]?.code === 'P' &&
    typeof raw.sequenceId === 'string' && /^wolf-p-station-[\w.:-]+$/.test(raw.sequenceId) &&
    typeof raw.sourceId === 'string' && /^wolf-attack-[\w.:-]+$/.test(raw.sourceId) &&
    Number.isSafeInteger(raw.cycle) && (raw.cycle as number) >= 1 && typeof raw.liberatedAt === 'string' &&
    new Date(raw.liberatedAt).toISOString() === raw.liberatedAt;
}
/** Called only after the existing source-bound finalizer has verified all range receipts. */
export function candidateStationLiberationFromFinalization(sessionId: string, state: unknown, receipt: unknown,
  repeat: unknown, liberatedAt: string): CandidateStationLiberation | undefined {
  if (!record(state) || !record(receipt) || !record(repeat) || !record(state.pStationSequence) ||
      state.status !== 'resolved' || state.currentStep !== 'resolved' || state.threatSiteCode !== 'P' ||
      !Array.isArray(receipt.survivingWolfShips) || receipt.survivingWolfShips.length !== 0 || repeat.status !== 'stopped') return undefined;
  const sequence = state.pStationSequence;
  if (sequence.type !== 'p-station-sequence' || sequence.stationId !== 'P' || sequence.groupId !== state.targetGroupId ||
      repeat.groupId !== sequence.groupId || repeat.sequenceId !== sequence.sequenceId || repeat.attackId !== state.attackId ||
      repeat.turn !== state.turn || sequence.sourceCycle !== state.turn || repeat.attackNumber !== sequence.attackNumber) return undefined;
  const value = { type: 'candidate-station-liberation', sessionId, groupId: sequence.groupId,
    coordinate: sequence.coordinate, chart: sequence.chart, sequenceId: sequence.sequenceId,
    sourceId: state.attackId, cycle: state.turn, liberatedAt };
  return marker(value) ? value : undefined;
}
export function parseCandidateStationLiberations(value: unknown): Record<string, CandidateStationLiberation> {
  if (value === undefined) return {};
  if (!record(value) || Object.entries(value).some(([key, entry]) => !marker(entry) || key !== `${entry.groupId}:${entry.coordinate}`)) {
    throw new Error('Durable Station liberation authority is malformed.');
  }
  return { ...value } as Record<string, CandidateStationLiberation>;
}

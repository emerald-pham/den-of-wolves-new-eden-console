export const WOLF_ATTACK_MEMBER_VIEW_TYPE = 'wolf-attack-member-view' as const;
export const WOLF_ATTACK_MEMBER_VIEW_VERSION = 1 as const;

export const WOLF_ATTACK_PUBLIC_STEPS = [
  'targeting', 'long-range', 'medium-range', 'short-range', 'boarding', 'resolved',
] as const;
export type WolfAttackPublicStep = typeof WOLF_ATTACK_PUBLIC_STEPS[number];
export type WolfAttackPublicRange = 'long' | 'medium' | 'short' | null;

export interface WolfAttackMemberResult {
  readonly range: 'long' | 'medium' | 'short' | 'boarding';
  readonly sourceId: string;
  readonly targetId: string;
  readonly bearing: number | null;
  readonly contactReference: string;
  readonly effect: string;
  readonly outcome: Readonly<Record<string, number | boolean | string | null>>;
  readonly serverTime: string;
}

export interface WolfAttackMemberView {
  readonly type: typeof WOLF_ATTACK_MEMBER_VIEW_TYPE;
  readonly schemaVersion: typeof WOLF_ATTACK_MEMBER_VIEW_VERSION;
  readonly sessionId: string;
  readonly attackId: string;
  readonly turn: number;
  readonly revision: number;
  readonly status: 'declared' | 'resolved';
  readonly phase: 'active';
  readonly currentStep: WolfAttackPublicStep;
  readonly range: WolfAttackPublicRange;
  readonly deadlineAt: string;
  readonly serverTime: string;
  readonly visibility: 'members';
  readonly redaction: readonly [
    'composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state',
  ];
  readonly results: readonly WolfAttackMemberResult[];
}

const OUTCOME_FIELDS = new Set([
  'damage', 'destroyed', 'remainingCapacity', 'shipsDestroyed', 'populationLoss',
  'survivingBoardingParties', 'securityCasualties', 'boarderCasualties',
  'returnedCraftCount', 'overrun',
]);
const REDACTED_FIELDS = Object.freeze([
  'composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state',
] as const);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validInstant(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function canonicalRange(value: unknown): WolfAttackMemberResult['range'] | undefined {
  if (value === 'long' || value === 'long-range') return 'long';
  if (value === 'medium' || value === 'medium-range') return 'medium';
  if (value === 'short' || value === 'short-range') return 'short';
  return value === 'boarding' ? 'boarding' : undefined;
}

function resultProjection(value: unknown): WolfAttackMemberResult | undefined {
  const range = record(value) ? canonicalRange(value.range) : undefined;
  if (!record(value) || value.status !== 'committed' || range === undefined ||
      typeof value.sourceId !== 'string' || value.sourceId.length < 1 || value.sourceId.length > 128 ||
      typeof value.targetId !== 'string' || value.targetId.length < 1 || value.targetId.length > 128 ||
      !(value.bearing === null || (typeof value.bearing === 'number' && Number.isFinite(value.bearing) &&
        value.bearing >= 0 && value.bearing < 360)) ||
      typeof value.contactReference !== 'string' || value.contactReference.length < 1 ||
      value.contactReference.length > 160 || typeof value.effect !== 'string' ||
      value.effect.length < 1 || value.effect.length > 160 || !record(value.outcome) ||
      !validInstant(value.serverTime)) return undefined;
  const outcome: Record<string, number | boolean | string | null> = {};
  for (const [key, field] of Object.entries(value.outcome)) {
    if (!OUTCOME_FIELDS.has(key) ||
        !(field === null || typeof field === 'boolean' ||
          (typeof field === 'number' && Number.isFinite(field)) ||
          (typeof field === 'string' && field.length <= 80))) return undefined;
    outcome[key] = field;
  }
  return {
    range,
    sourceId: value.sourceId,
    targetId: value.targetId,
    bearing: value.bearing,
    contactReference: value.contactReference,
    effect: value.effect,
    outcome,
    serverTime: value.serverTime,
  };
}

function publicRange(step: WolfAttackPublicStep): WolfAttackPublicRange {
  if (step === 'long-range') return 'long';
  if (step === 'medium-range') return 'medium';
  if (step === 'short-range') return 'short';
  return null;
}

/**
 * Build the single member-safe projection from private attack state. The only
 * path from private result data into this view is the committed-result field
 * allowlist above; raw receipts, card identities, dice and notes never spread.
 */
export function projectWolfAttackMemberView(input: Readonly<{
  sessionId: string;
  state: unknown;
  serverTime: string;
}>): WolfAttackMemberView {
  const state = input.state;
  if (!input.sessionId || !validInstant(input.serverTime) || !record(state) ||
      state.type !== 'wolf-attack-state' ||
      (state.status !== 'declared' && state.status !== 'resolved') ||
      typeof state.attackId !== 'string' || state.attackId.length < 1 || state.attackId.length > 160 ||
      !Number.isSafeInteger(state.turn) || (state.turn as number) < 1 ||
      !Number.isSafeInteger(state.revision) || (state.revision as number) < 1 ||
      !WOLF_ATTACK_PUBLIC_STEPS.includes(state.currentStep as WolfAttackPublicStep) ||
      !validInstant(state.deadlineAt)) {
    throw new Error('The private Wolf attack state is malformed.');
  }
  const results = state.memberResults === undefined ? [] : state.memberResults;
  if (!Array.isArray(results)) throw new Error('The committed Wolf attack audience results are malformed.');
  const projectedResults = results.map(resultProjection);
  if (projectedResults.some(result => result === undefined)) {
    throw new Error('A committed Wolf attack audience result is malformed.');
  }
  return Object.freeze({
    type: WOLF_ATTACK_MEMBER_VIEW_TYPE,
    schemaVersion: WOLF_ATTACK_MEMBER_VIEW_VERSION,
    sessionId: input.sessionId,
    attackId: state.attackId,
    turn: state.turn as number,
    revision: state.revision as number,
    status: state.status,
    phase: 'active',
    currentStep: state.currentStep as WolfAttackPublicStep,
    range: publicRange(state.currentStep as WolfAttackPublicStep),
    deadlineAt: state.deadlineAt,
    serverTime: input.serverTime,
    visibility: 'members',
    redaction: REDACTED_FIELDS,
    results: Object.freeze(projectedResults as WolfAttackMemberResult[]),
  });
}

/** Reject stored or callable views which smuggle private attack state. */
export function isWolfAttackMemberView(value: unknown): value is WolfAttackMemberView {
  if (!record(value)) return false;
  const allowed = new Set([
    'type', 'schemaVersion', 'sessionId', 'attackId', 'turn', 'revision', 'status', 'phase',
    'currentStep', 'range', 'deadlineAt', 'serverTime', 'visibility', 'redaction', 'results',
  ]);
  return Object.keys(value).every(key => allowed.has(key)) &&
    value.type === WOLF_ATTACK_MEMBER_VIEW_TYPE && value.schemaVersion === WOLF_ATTACK_MEMBER_VIEW_VERSION &&
    typeof value.sessionId === 'string' && value.sessionId.length > 0 &&
    typeof value.attackId === 'string' && value.attackId.length > 0 &&
    Number.isSafeInteger(value.turn) && (value.turn as number) >= 1 &&
    Number.isSafeInteger(value.revision) && (value.revision as number) >= 1 &&
    (value.status === 'declared' || value.status === 'resolved') && value.phase === 'active' &&
    WOLF_ATTACK_PUBLIC_STEPS.includes(value.currentStep as WolfAttackPublicStep) &&
    value.range === publicRange(value.currentStep as WolfAttackPublicStep) &&
    validInstant(value.deadlineAt) && validInstant(value.serverTime) && value.visibility === 'members' &&
    Array.isArray(value.redaction) && JSON.stringify(value.redaction) === JSON.stringify(REDACTED_FIELDS) &&
    Array.isArray(value.results) && value.results.every(result => {
      const safe = resultProjection({ ...(record(result) ? result : {}), status: 'committed' });
      return safe !== undefined && JSON.stringify(safe) === JSON.stringify(result);
    });
}

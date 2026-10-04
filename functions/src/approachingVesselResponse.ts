export const APPROACHING_VESSEL_RESPONSE_CHOICES = [
  'jump-away-soon',
  'wait-briefly-then-leave',
  'prepare-attack-or-jump',
  'prepare-medical-and-wait',
] as const;
export type ApproachingVesselResponseChoice = (typeof APPROACHING_VESSEL_RESPONSE_CHOICES)[number];

export const APPROACHING_VESSEL_COORDINATION_ACTIONS = [
  'security', 'medical', 'research', 'quarantine', 'contingency-objectives',
] as const;
export type ApproachingVesselCoordinationAction = (typeof APPROACHING_VESSEL_COORDINATION_ACTIONS)[number];
export type ApproachingVesselReality = 'real' | 'trap';

export interface ApproachingVesselResponseInput {
  readonly vesselReality: ApproachingVesselReality;
  readonly responseChoices: readonly ApproachingVesselResponseChoice[];
  readonly coordinationActions: readonly ApproachingVesselCoordinationAction[];
  readonly responseInstructions: string;
  readonly quarantineInstructions?: string;
  readonly contingencyObjectives?: string;
  readonly rationale: string;
}

export interface StoredApproachingVesselResponse extends ApproachingVesselResponseInput {
  readonly type: 'approaching-vessel-response';
  readonly sessionId: string;
  readonly crisisId: string;
  readonly crisisRevision: number;
  readonly state: 'debated';
  readonly revision: number;
  readonly actorUid: string;
  readonly instanceId: string;
}

export function isApproachingVesselReality(value: unknown): value is ApproachingVesselReality {
  return value === 'real' || value === 'trap';
}

export function isApproachingVesselResponseChoice(value: unknown): value is ApproachingVesselResponseChoice {
  return typeof value === 'string' && (APPROACHING_VESSEL_RESPONSE_CHOICES as readonly string[]).includes(value);
}

export function isApproachingVesselCoordinationAction(value: unknown): value is ApproachingVesselCoordinationAction {
  return typeof value === 'string' && (APPROACHING_VESSEL_COORDINATION_ACTIONS as readonly string[]).includes(value);
}

function requiredBoundedText(value: unknown, name: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
    throw new Error(`${name} must be non-empty text of at most ${maximum} characters.`);
  }
  return value.trim();
}

function actionList<T extends string>(value: unknown, name: string, allowed: readonly T[], minimum: number): readonly T[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > allowed.length ||
      value.some((entry) => typeof entry !== 'string' || !(allowed as readonly string[]).includes(entry)) ||
      new Set(value).size !== value.length) {
    throw new Error(`${name} must contain unique documented choices.`);
  }
  return [...value] as T[];
}

/** Explicit GM decision; timings remain written instructions and do not trigger automatic mechanics. */
export function parseApproachingVesselResponseInput(value: {
  readonly vesselReality?: unknown;
  readonly responseChoices?: unknown;
  readonly coordinationActions?: unknown;
  readonly responseInstructions?: unknown;
  readonly quarantineInstructions?: unknown;
  readonly contingencyObjectives?: unknown;
  readonly rationale?: unknown;
}): ApproachingVesselResponseInput {
  if (!isApproachingVesselReality(value.vesselReality)) {
    throw new Error('Choose whether the approaching vessel is real or a trap before recording the response.');
  }
  const responseChoices = actionList(value.responseChoices, 'responseChoices', APPROACHING_VESSEL_RESPONSE_CHOICES, 1);
  const coordinationActions = value.coordinationActions === undefined
    ? [] : actionList(value.coordinationActions, 'coordinationActions', APPROACHING_VESSEL_COORDINATION_ACTIONS, 0);
  const responseInstructions = requiredBoundedText(value.responseInstructions, 'responseInstructions', 1200);
  const rationale = value.rationale === undefined ? '' : typeof value.rationale === 'string' ? value.rationale.trim() : '';
  if (rationale.length > 2000) throw new Error('rationale is too long.');
  const quarantineInstructions = value.quarantineInstructions === undefined ? undefined
    : requiredBoundedText(value.quarantineInstructions, 'quarantineInstructions', 700);
  const contingencyObjectives = value.contingencyObjectives === undefined ? undefined
    : requiredBoundedText(value.contingencyObjectives, 'contingencyObjectives', 700);
  if (coordinationActions.includes('quarantine') && !quarantineInstructions) {
    throw new Error('Describe quarantine staffing and enforcement when selecting quarantine.');
  }
  if (coordinationActions.includes('contingency-objectives') && !contingencyObjectives) {
    throw new Error('Record actionable conditions and objectives when selecting contingency planning.');
  }
  if (quarantineInstructions && !coordinationActions.includes('quarantine')) {
    throw new Error('Quarantine instructions require the quarantine choice.');
  }
  if (contingencyObjectives && !coordinationActions.includes('contingency-objectives')) {
    throw new Error('Contingency objectives require the contingency-planning choice.');
  }
  return {
    vesselReality: value.vesselReality,
    responseChoices,
    coordinationActions,
    responseInstructions,
    ...(quarantineInstructions ? { quarantineInstructions } : {}),
    ...(contingencyObjectives ? { contingencyObjectives } : {}),
    rationale,
  };
}

export function parseStoredApproachingVesselResponse(value: unknown): StoredApproachingVesselResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  let input: ApproachingVesselResponseInput;
  try { input = parseApproachingVesselResponseInput(raw); } catch { return null; }
  if (raw.type !== 'approaching-vessel-response' || typeof raw.sessionId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(String(raw.crisisId)) || !Number.isSafeInteger(raw.crisisRevision) ||
      Number(raw.crisisRevision) < 1 || raw.state !== 'debated' || !Number.isSafeInteger(raw.revision) ||
      Number(raw.revision) < 1 || typeof raw.actorUid !== 'string' || !raw.actorUid ||
      typeof raw.instanceId !== 'string' || !raw.instanceId) return null;
  return {
    type: 'approaching-vessel-response', sessionId: raw.sessionId, crisisId: raw.crisisId as string,
    crisisRevision: Number(raw.crisisRevision), state: 'debated', revision: Number(raw.revision), ...input,
    actorUid: raw.actorUid, instanceId: raw.instanceId,
  };
}

/** Fleet-safe committed response. Vessel truth, rationale, actor and GM lease stay private. */
export function publicApproachingVesselResponse(value: StoredApproachingVesselResponse): Readonly<{
  readonly crisisId: string;
  readonly revision: number;
  readonly responseChoices: readonly ApproachingVesselResponseChoice[];
  readonly coordinationActions: readonly ApproachingVesselCoordinationAction[];
  readonly responseInstructions: string;
  readonly quarantineInstructions?: string;
  readonly contingencyObjectives?: string;
}> {
  return {
    crisisId: value.crisisId,
    revision: value.revision,
    responseChoices: value.responseChoices,
    coordinationActions: value.coordinationActions,
    responseInstructions: value.responseInstructions,
    ...(value.quarantineInstructions ? { quarantineInstructions: value.quarantineInstructions } : {}),
    ...(value.contingencyObjectives ? { contingencyObjectives: value.contingencyObjectives } : {}),
  };
}

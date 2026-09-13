export const ZEALOTRY_RESPONSE_ACTIONS = [
  'leave',
  'pressure',
  'investigate',
  'arrest',
] as const;

export type ZealotryResponseAction = (typeof ZEALOTRY_RESPONSE_ACTIONS)[number];

export interface ZealotryResponseInput {
  readonly actions: readonly ZealotryResponseAction[];
  readonly customResponse?: string;
  readonly rationale: string;
}

export function isZealotryResponseAction(value: unknown): value is ZealotryResponseAction {
  return typeof value === 'string' &&
    (ZEALOTRY_RESPONSE_ACTIONS as readonly string[]).includes(value);
}

export function parseZealotryResponseInput(value: {
  readonly actions?: unknown;
  readonly customResponse?: unknown;
  readonly rationale?: unknown;
}): ZealotryResponseInput {
  const actions = value.actions === undefined ? [] : value.actions;
  if (!Array.isArray(actions) || actions.length > ZEALOTRY_RESPONSE_ACTIONS.length) {
    throw new Error('actions must be a bounded list of unique source actions.');
  }
  const parsedActions = actions.map((action) => {
    if (!isZealotryResponseAction(action)) throw new Error('actions contains an unknown response.');
    return action;
  });
  if (new Set(parsedActions).size !== parsedActions.length) {
    throw new Error('actions must not contain duplicates.');
  }
  const customResponse = value.customResponse === undefined
    ? undefined
    : typeof value.customResponse === 'string' && value.customResponse.trim().length > 0
      ? value.customResponse.trim()
      : (() => { throw new Error('customResponse must be non-empty text.'); })();
  if (customResponse !== undefined && customResponse.length > 1000) {
    throw new Error('customResponse is too long.');
  }
  const rationale = typeof value.rationale === 'string' ? value.rationale.trim() : '';
  if (rationale.length > 2000) throw new Error('rationale is too long.');
  if (parsedActions.length === 0 && customResponse === undefined) {
    throw new Error('Choose at least one source action or record a custom response.');
  }
  return {
    actions: parsedActions,
    ...(customResponse === undefined ? {} : { customResponse }),
    rationale,
  };
}

export interface StoredZealotryResponse {
  readonly sessionId: string;
  readonly crisisId: string;
  readonly crisisRevision: number;
  readonly state: 'debated';
  readonly revision: number;
  readonly actions: readonly ZealotryResponseAction[];
  readonly customResponse?: string;
  readonly rationale: string;
  readonly loyaltyCensusRevision: number | null;
  readonly actorUid: string;
  readonly instanceId: string;
}

export function parseStoredZealotryResponse(value: unknown): StoredZealotryResponse | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  let input: ZealotryResponseInput;
  try {
    input = parseZealotryResponseInput({
      actions: raw.actions,
      customResponse: raw.customResponse,
      rationale: raw.rationale,
    });
  } catch {
    return null;
  }
  if (
    raw.type !== 'zealotry-response' || typeof raw.sessionId !== 'string' ||
    typeof raw.crisisId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(raw.crisisId) ||
    raw.state !== 'debated' || !Number.isSafeInteger(raw.crisisRevision) ||
    (raw.crisisRevision as number) < 1 || !Number.isSafeInteger(raw.revision) ||
    (raw.revision as number) < 1 ||
    (!Number.isSafeInteger(raw.loyaltyCensusRevision) && raw.loyaltyCensusRevision !== null) ||
    (typeof raw.loyaltyCensusRevision === 'number' && raw.loyaltyCensusRevision < 0) ||
    typeof raw.actorUid !== 'string' || raw.actorUid.length === 0 ||
    typeof raw.instanceId !== 'string' || raw.instanceId.length === 0
  ) return null;
  return {
    sessionId: raw.sessionId,
    crisisId: raw.crisisId,
    crisisRevision: raw.crisisRevision as number,
    state: 'debated',
    revision: raw.revision as number,
    actions: input.actions,
    ...(input.customResponse === undefined ? {} : { customResponse: input.customResponse }),
    rationale: input.rationale,
    loyaltyCensusRevision: raw.loyaltyCensusRevision as number | null,
    actorUid: raw.actorUid,
    instanceId: raw.instanceId,
  };
}

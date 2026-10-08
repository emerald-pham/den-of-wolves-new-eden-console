export type MissionRewardChoice =
  | Readonly<{ kind: 'research'; trackIds: readonly string[] }>
  | Readonly<{ kind: 'consoles'; action: 'upgrade' | 'repair'; targets: readonly Readonly<{ shipId: string; systemId: string }>[] }>;
export interface MissionRewardSelection { readonly opportunityId: string; readonly choice: MissionRewardChoice }
export interface MissionRewardChoiceOptions {
  readonly opportunityId: string;
  readonly researchSelections: number;
  readonly researchTracks: readonly Readonly<{ trackId: string; name: string }>[];
  readonly consoleActions: readonly Readonly<{ action: 'upgrade' | 'repair'; amount: number }>[];
  readonly consoleTargets: readonly Readonly<{ shipId: string; systemId: string; name: string; canUpgrade: boolean; canRepair: boolean; weapon: boolean }>[];
}

const tracks = new Set(['reactor', 'jump-drive', 'hydroponics', 'water-reclamation', 'advanced-hydroponics',
  'water-production', 'fuel-refinery', 'mining-drone-control', 'ram-scoop', 'command-and-control',
  'point-defence-lasers', 'missile-launchers', 'ecm-device', 'wolf-agent-detector']);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: readonly string[]) => Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));

/** Private server options are closed and count-limited before becoming controls. */
export function validMissionRewardChoiceProjection(options: unknown, selections: unknown): boolean {
  if (!Array.isArray(options) || !Array.isArray(selections) || options.length > 3 || selections.length > 3) return false;
  const ids = new Set<string>();
  for (const option of options) {
    if (!record(option) || !keys(option, ['opportunityId', 'researchSelections', 'researchTracks', 'consoleActions', 'consoleTargets']) ||
        !text(option.opportunityId) || ids.has(option.opportunityId) || !Number.isSafeInteger(option.researchSelections) ||
        (option.researchSelections as number) < 0 || (option.researchSelections as number) > 2 ||
        !Array.isArray(option.researchTracks) || !Array.isArray(option.consoleActions) || !Array.isArray(option.consoleTargets)) return false;
    ids.add(option.opportunityId);
    if ((option.researchSelections === 0) === (option.researchTracks.length > 0) ||
        (option.researchSelections === 0) === (option.consoleActions.length === 0) ||
        (option.researchSelections !== 0 && option.consoleTargets.length !== 0) ||
        option.researchTracks.some(track => !record(track) || !keys(track, ['trackId', 'name']) || !text(track.trackId) || !tracks.has(track.trackId) || !text(track.name)) ||
        new Set(option.researchTracks.map(track => track.trackId)).size !== option.researchTracks.length ||
        option.consoleActions.some(action => !record(action) || !keys(action, ['action', 'amount']) || !['upgrade', 'repair'].includes(String(action.action)) ||
          !Number.isSafeInteger(action.amount) || (action.amount as number) < 1 || (action.amount as number) > 3) ||
        new Set(option.consoleActions.map(action => action.action)).size !== option.consoleActions.length ||
        option.consoleTargets.some(target => !record(target) || !keys(target, ['shipId', 'systemId', 'name', 'canUpgrade', 'canRepair', 'weapon']) ||
          !text(target.shipId) || !text(target.systemId) || !text(target.name) || typeof target.canUpgrade !== 'boolean' ||
          typeof target.canRepair !== 'boolean' || typeof target.weapon !== 'boolean') ||
        new Set(option.consoleTargets.map(target => `${target.shipId}:${target.systemId}`)).size !== option.consoleTargets.length) return false;
  }
  const chosen = new Set<string>();
  return selections.every(selection => {
    if (!record(selection) || !keys(selection, ['opportunityId', 'choice']) || !text(selection.opportunityId) || chosen.has(selection.opportunityId) || !record(selection.choice)) return false;
    chosen.add(selection.opportunityId);
    const option = options.find(candidate => candidate.opportunityId === selection.opportunityId) as MissionRewardChoiceOptions | undefined;
    if (!option) return false;
    const choice = selection.choice;
    if (choice.kind === 'research') return keys(choice, ['kind', 'trackIds']) && Array.isArray(choice.trackIds) &&
      choice.trackIds.length === option.researchSelections && option.researchSelections > 0 && choice.trackIds.every(id => option.researchTracks.some(track => track.trackId === id));
    if (choice.kind !== 'consoles' || !keys(choice, ['kind', 'action', 'targets']) || !Array.isArray(choice.targets) ||
        choice.targets.length !== option.consoleActions.find(action => action.action === choice.action)?.amount) return false;
    const targetIds = new Set<string>();
    return choice.targets.every(target => {
      if (!record(target) || !keys(target, ['shipId', 'systemId']) || !text(target.shipId) || !text(target.systemId)) return false;
      const key = `${target.shipId}:${target.systemId}`;
      if (targetIds.has(key)) return false;
      targetIds.add(key);
      return option.consoleTargets.some(candidate => candidate.shipId === target.shipId && candidate.systemId === target.systemId);
    });
  });
}

import { ENDEAVOUR_RESEARCH_TRACKS } from './endeavourResearch';

export type CandidateCode = 'N' | 'O' | 'P';
export type CandidateEdition = 'home' | 'deluxe';
export type CandidateActionName = 'contribute-materials' | 'contribute-research' |
  'commit-engineering-shuttle' | 'ring-passage' | 'sabotage-ring' | 'nebula-jump' | 'contribute-reactor';
export interface CandidateAction {
  sessionId: string; requestId: string; expectedRevision: number; expectedGroupId: string;
  code: CandidateCode; coordinate: string; action: CandidateActionName; instanceId?: string;
  shipId?: string; amount?: number; trackIds?: string[]; shuttleId?: string;
}
export interface CandidateShipAuthority {
  fuel: number; materials: number; reactorCapacity: number; destroyed: boolean;
  jumpCharged: boolean; jumpDamaged: boolean; longJumpCost: number;
  atCandidate: boolean; jumpedThisCycle: boolean; coordinate?: string;
}
export interface CandidateAuthority {
  sessionId: string; cycle: number; phase: string; coordination: boolean; now: string;
  groupId: string; vesselIds: string[];
  actor: { uid: string; gm: boolean; shipIds: string[]; research: boolean; shuttleIds: string[] };
  discovered: { code: CandidateCode; coordinate: string }[];
  ships: Record<string, CandidateShipAuthority>; research: Record<string, number>;
  engineeringShuttles: { id: string; available: boolean }[];
  hiddenScoutCount: number;
  station?: { coordinate: string; groupId: string; liberated: boolean; sourceId: string };
}
export interface CandidateActionReply {
  type: 'candidate-action-result'; status: 'committed' | 'replayed'; sessionId: string;
  requestId: string; revision: number; code: CandidateCode; action: CandidateActionName;
  summary: string; outcome?: 'crossed' | 'reached' | 'lost' | 'activated';
  fuelSpent?: number; remainingFuel?: number;
}
export interface CandidateGroupOutcome {
  type: 'candidate-group-outcome'; result: 'success' | 'failure'; candidateCode: CandidateCode;
  groupId: string; cycle: number; occurredAt: string; sourceId: string;
  successfulShipIds: string[]; leftBehindShipIds: string[];
}
export interface CandidateSiteState {
  code: CandidateCode; coordinate: string; groupId: string;
  materials: number; researchIds: string[]; shuttleId?: string; repairedAt?: string;
  ships: Record<string, CandidateActionReply>; reactors: Record<string, number>;
  liberatedSourceId?: string; activatedAt?: string; sabotagedAt?: string;
  completed?: CandidateGroupOutcome;
}
export interface CandidateState {
  revision: number; sites: Record<string, CandidateSiteState>; edition?: CandidateEdition;
}
export interface CandidateResolution {
  state: CandidateState; reply: CandidateActionReply;
  shipPatches: Record<string, { fuel?: number; materials?: number; destroyed?: true; survivors?: 0; cannibalised?: true }>;
  calculation: Record<string, unknown>; groupOutcome?: CandidateGroupOutcome;
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
export const isCandidateEdition = (value: unknown): value is CandidateEdition => value === 'home' || value === 'deluxe';
const counter = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const fail = (message: string): never => { throw new Error(message); };
const ACTION_FIELDS: Record<CandidateActionName, string[]> = {
  'contribute-materials': ['shipId', 'amount'], 'contribute-research': ['trackIds'],
  'commit-engineering-shuttle': ['shuttleId'], 'ring-passage': ['shipId'],
  'sabotage-ring': [], 'nebula-jump': ['shipId'], 'contribute-reactor': ['shipId'],
};
const REPLY_FIELDS = ['type', 'status', 'sessionId', 'requestId', 'revision', 'code', 'action',
  'summary', 'outcome', 'fuelSpent', 'remainingFuel'];

/** No client-owned randomness, derived counts, outcome or private chart is accepted. */
export function parseCandidateAction(raw: unknown): CandidateAction {
  if (!isRecord(raw) || typeof raw.action !== 'string' || !Object.hasOwn(ACTION_FIELDS, raw.action)) {
    return fail('Choose a known candidate action.');
  }
  const action = raw.action as CandidateActionName;
  const fields = ['sessionId', 'requestId', 'expectedRevision', 'expectedGroupId', 'code', 'coordinate',
    'action', ...ACTION_FIELDS[action], ...(raw.instanceId === undefined ? [] : ['instanceId'])];
  if (Object.keys(raw).length !== fields.length || Object.keys(raw).some(key => !fields.includes(key)) ||
      fields.some(key => !Object.hasOwn(raw, key)) || !id(raw.sessionId) || !id(raw.requestId) ||
      !counter(raw.expectedRevision) || raw.expectedRevision >= Number.MAX_SAFE_INTEGER ||
      typeof raw.expectedGroupId !== 'string' || !/^fleet-[1-9]\d*$/.test(raw.expectedGroupId) ||
      typeof raw.coordinate !== 'string' || !/^\d{4}$/.test(raw.coordinate) ||
      (raw.instanceId !== undefined && !id(raw.instanceId)) ||
      raw.code !== (action === 'nebula-jump' ? 'O' : action === 'contribute-reactor' ? 'P' : 'N') ||
      ('shipId' in raw && !id(raw.shipId)) || ('shuttleId' in raw && !id(raw.shuttleId)) ||
      ('amount' in raw && (!counter(raw.amount) || raw.amount < 1 || raw.amount > 15)) ||
      ('trackIds' in raw && (!Array.isArray(raw.trackIds) || raw.trackIds.length < 1 || raw.trackIds.length > 5 ||
        raw.trackIds.some(track => typeof track !== 'string' || !Object.hasOwn(ENDEAVOUR_RESEARCH_TRACKS, track)) ||
        new Set(raw.trackIds).size !== raw.trackIds.length))) return fail('Invalid candidate choices; research must be distinct.');
  return { ...raw } as unknown as CandidateAction;
}

export function parseCandidateState(raw: unknown): CandidateState {
  if (raw === undefined) return { revision: 0, edition: 'home', sites: {} };
  if (!isRecord(raw) || !counter(raw.revision) || !isRecord(raw.sites) ||
      (raw.edition !== undefined && !isCandidateEdition(raw.edition))) return fail('Candidate authority is malformed.');
  const edition = isCandidateEdition(raw.edition) ? raw.edition : 'home';
  const materialRequirement = edition === 'deluxe' ? 15 : 10;
  for (const [key, value] of Object.entries(raw.sites)) {
    if (!isRecord(value) || typeof value.coordinate !== 'string' || !/^\d{4}$/.test(value.coordinate) ||
        (key !== value.coordinate && key !== `${value.groupId}:${value.coordinate}`) ||
        !['N', 'O', 'P'].includes(String(value.code)) || !/^fleet-[1-9]\d*$/.test(String(value.groupId)) ||
        !counter(value.materials) || value.materials > materialRequirement || !Array.isArray(value.researchIds) ||
        value.researchIds.length > 5 || new Set(value.researchIds).size !== value.researchIds.length ||
        value.researchIds.some(track => typeof track !== 'string' || !Object.hasOwn(ENDEAVOUR_RESEARCH_TRACKS, track)) ||
        !isRecord(value.ships) || !isRecord(value.reactors) ||
        Object.values(value.reactors).some(capacity => !counter(capacity) || capacity < 1 || capacity > 10) ||
        Object.values(value.ships).some(reply => !isRecord(reply) || reply.type !== 'candidate-action-result' ||
          Object.keys(reply).some(field => !REPLY_FIELDS.includes(field)) || !id(reply.sessionId) ||
          reply.code !== value.code || reply.action !== (value.code === 'N' ? 'ring-passage' : 'nebula-jump') ||
          typeof reply.summary !== 'string' || reply.summary.length > 1000 ||
          (reply.fuelSpent !== undefined && !counter(reply.fuelSpent)) ||
          (reply.remainingFuel !== undefined && !counter(reply.remainingFuel)) ||
          reply.status !== 'committed' || !counter(reply.revision) || !id(reply.requestId) ||
          !['crossed', 'reached', 'lost'].includes(String(reply.outcome)))) return fail('Candidate site authority is malformed.');
  }
  return { ...structuredClone(raw), edition } as unknown as CandidateState;
}

function siteFor(a: CandidateAuthority, state: CandidateState, code: CandidateCode, coordinate: string): CandidateSiteState {
  const scoped = state.sites[`${a.groupId}:${coordinate}`];
  const legacy = state.sites[coordinate];
  const existing = scoped ?? (legacy?.groupId === a.groupId ? legacy : undefined);
  if (existing && existing.code !== code) return fail('This candidate authority changed.');
  return existing ?? { code, coordinate, groupId: a.groupId, materials: 0, researchIds: [], ships: {}, reactors: {} };
}
function ownShip(a: CandidateAuthority, command: CandidateAction): CandidateShipAuthority {
  const shipId = command.shipId!;
  const ship = a.ships[shipId];
  if (!a.vesselIds.includes(shipId) || (!a.actor.gm && !a.actor.shipIds.includes(shipId))) return fail('Current ship authority is required.');
  if (!ship || ship.destroyed) return fail('A lost or destroyed ship cannot contribute or act.');
  if (!ship.atCandidate) return fail('The ship must be at this discovered candidate.');
  return ship;
}
function outcomeFor(a: CandidateAuthority, site: CandidateSiteState, command: CandidateAction,
  successful: string[], leftBehind: string[], result: 'success' | 'failure' = 'success'): CandidateGroupOutcome {
  return { type: 'candidate-group-outcome', result, candidateCode: site.code, groupId: a.groupId,
    cycle: a.cycle, occurredAt: a.now, sourceId: command.requestId,
    successfulShipIds: successful, leftBehindShipIds: leftBehind };
}

/** Pure server planner. The adapter supplies transaction-read authority and one stable server die. */
export function resolveCandidateAction(a: CandidateAuthority, original: CandidateState,
  command: CandidateAction, serverDie?: number): CandidateResolution {
  if (command.sessionId !== a.sessionId || command.expectedGroupId !== a.groupId) return fail('Current fleet group authority changed.');
  if (!a.discovered.some(site => site.code === command.code && site.coordinate === command.coordinate)) return fail('An entitled candidate discovery is required.');
  const priorSite = siteFor(a, original, command.code, command.coordinate);
  const priorShip = command.shipId && priorSite.ships[command.shipId];
  if (priorShip && (command.action === 'ring-passage' || command.action === 'nebula-jump')) {
    if (!a.actor.gm && !a.actor.shipIds.includes(command.shipId!)) return fail('Original ship authority is required to recover this result.');
    return { state: original, reply: { ...priorShip, status: 'replayed' }, shipPatches: {}, calculation: {} };
  }
  if (a.phase !== 'active' || !a.coordination) return fail('New candidate actions require an active Coordination Phase.');
  if (priorSite.completed) return fail('This candidate outcome is already committed.');
  if (original.revision !== command.expectedRevision) return fail('Candidate revision changed; refresh the live record.');
  const state = structuredClone(original);
  const edition = original.edition ?? 'home';
  const ringMaterialsRequired = edition === 'deluxe' ? 15 : 10;
  const site = structuredClone(priorSite);
  const shipPatches: CandidateResolution['shipPatches'] = {};
  const sourceId = command.code === 'P' ? `base-v1.1-candidate-${command.code}` : `${edition}-v1.1-candidate-${command.code}`;
  const calculation: Record<string, unknown> = { source: sourceId, cycle: a.cycle };
  let summary = ''; let outcome: CandidateActionReply['outcome']; let fuelSpent: number | undefined; let remainingFuel: number | undefined;
  let groupOutcome: CandidateGroupOutcome | undefined;
  if (command.action === 'contribute-materials') {
    const ship = ownShip(a, command);
    if (site.repairedAt || site.materials + command.amount! > ringMaterialsRequired) return fail('Ring materials are already funded or exceed the missing materials.');
    if (ship.materials < command.amount!) return fail('This ship lacks the chosen materials.');
    site.materials += command.amount!;
    shipPatches[command.shipId!] = { materials: ship.materials - command.amount! };
    calculation.materials = command.amount; summary = `${site.materials}/${ringMaterialsRequired} Ring materials committed.`;
  } else if (command.action === 'contribute-research') {
    if (!a.actor.research && !a.actor.gm) return fail('Current Endeavour Scientist authority is required.');
    if (site.repairedAt || command.trackIds!.some(track => site.researchIds.includes(track)) ||
        site.researchIds.length + command.trackIds!.length > 5) return fail('Research contributions must be distinct and cannot be used twice.');
    if (command.trackIds!.some(track => {
      const progress = a.research[track] ?? 0;
      return edition === 'home' ? progress < 4 : progress !== ENDEAVOUR_RESEARCH_TRACKS[track as keyof typeof ENDEAVOUR_RESEARCH_TRACKS].materialCosts.length;
    })) return fail(edition === 'home' ? 'Each lab track requires at least four crosses.' : 'Each technology must be fully completed.');
    site.researchIds.push(...command.trackIds!);
    calculation.researchIds = [...command.trackIds!]; summary = `${site.researchIds.length}/5 distinct Ring research tracks committed.`;
  } else if (command.action === 'commit-engineering-shuttle') {
    if (!a.actor.gm && !a.actor.shuttleIds.includes(command.shuttleId!)) return fail('Current Engineering Shuttle holder authority is required.');
    if (site.shuttleId || !a.engineeringShuttles.some(craft => craft.id === command.shuttleId && craft.available) ||
        Object.values(state.sites).some(other => other.shuttleId === command.shuttleId)) return fail('Choose an available Engineering Shuttle not already committed.');
    site.shuttleId = command.shuttleId; calculation.shuttleId = command.shuttleId; calculation.craftConsumed = true;
    summary = 'Engineering Shuttle permanently consumed repairing the Ring; it cannot launch or operate again.';
  } else if (command.action === 'ring-passage') {
    const ship = ownShip(a, command);
    if (!site.repairedAt) return fail('Complete all Ring repair prerequisites first.');
    if (ship.fuel < 5) return fail('This ship needs five fuel for Ring passage and remains behind.');
    fuelSpent = 5; remainingFuel = ship.fuel - 5; shipPatches[command.shipId!] = { fuel: remainingFuel };
    outcome = 'crossed'; summary = 'Ring passage committed. Five fuel spent; the ship reached safety.';
    calculation.fuelSpent = 5;
  } else if (command.action === 'sabotage-ring') {
    if (!a.actor.gm) return fail('Opposite-side Ring sabotage is an explicit facilitator choice.');
    const crossed = a.vesselIds.filter(shipId => site.ships[shipId]?.outcome === 'crossed');
    if (!site.repairedAt || crossed.length === 0) return fail('At least one paid Ring passage must complete before opposite-side sabotage.');
    const leftBehind = a.vesselIds.filter(shipId => !crossed.includes(shipId));
    site.sabotagedAt = a.now; groupOutcome = outcomeFor(a, site, command, crossed, leftBehind);
    calculation.requiredChoice = 'opposite-side-sabotage'; calculation.leftBehindShipIds = leftBehind;
    summary = edition === 'home'
      ? 'Ring sabotaged from the far side. Wolf pursuit through the Ring is blocked; recorded ships remain behind.'
      : 'Ring sabotaged from the far side after a paid crossing. Ships that did not cross remain behind.';
  } else if (command.action === 'nebula-jump') {
    const ship = ownShip(a, command);
    if (ship.jumpedThisCycle) return fail('This ship already jumped this cycle. Its original jump result is retained.');
    if (!ship.jumpCharged || ship.jumpDamaged) return fail('Charge and repair the Jump Drive before the long jump.');
    if (ship.fuel < ship.longJumpCost) return fail('This ship lacks the fuel required for its long jump.');
    if (!Number.isInteger(serverDie) || serverDie! < 1 || serverDie! > 6) return fail('An authoritative server die is required.');
    const priorLosses = edition === 'home'
      ? new Set(Object.values(state.sites).filter(other => other.code === 'O' && other.coordinate === site.coordinate)
        .flatMap(other => Object.entries(other.ships).filter(([, result]) => result.outcome === 'lost').map(([shipId]) => shipId))).size
      : 0;
    const threshold = edition === 'home' ? 9 : 8;
    const total = serverDie! + a.hiddenScoutCount + priorLosses;
    outcome = total >= threshold ? 'reached' : 'lost'; fuelSpent = ship.longJumpCost; remainingFuel = ship.fuel - fuelSpent;
    shipPatches[command.shipId!] = { fuel: remainingFuel, ...(outcome === 'lost' ? { destroyed: true, survivors: 0 } : {}) };
    Object.assign(calculation, { die: serverDie, scouts: a.hiddenScoutCount,
      ...(edition === 'home' ? { priorLosses } : {}), total, threshold, fuelSpent });
    summary = outcome === 'reached' ? 'Long jump committed. The ship reached New Eden within the Deep Nebula.' :
      'Long jump committed. The ship was lost within the Deep Nebula; its former actions are closed.';
  } else {
    const ship = ownShip(a, command);
    if (!a.station?.liberated || a.station.coordinate !== command.coordinate || a.station.groupId !== a.groupId) return fail('The Station must be liberated by authoritative combat before Reactors can be committed.');
    if (Object.values(state.sites).some(other => Object.hasOwn(other.reactors, command.shipId!))) return fail('A Reactor is already committed and cannot count twice.');
    if (!counter(ship.reactorCapacity) || ship.reactorCapacity < 1) return fail('This Reactor has no available charge capacity.');
    site.liberatedSourceId = a.station.sourceId;
    site.reactors[command.shipId!] = ship.reactorCapacity;
    shipPatches[command.shipId!] = { cannibalised: true };
    const capacity = Object.values(site.reactors).reduce((sum, value) => sum + value, 0);
    calculation.reactorCapacity = ship.reactorCapacity; calculation.totalCapacity = capacity;
    summary = `${capacity}/18 Station charge capacity committed. This Reactor ship is cannibalised.`;
    if (capacity >= 18) {
      site.activatedAt = a.now; outcome = 'activated';
      groupOutcome = outcomeFor(a, site, command, [...a.vesselIds], []);
      summary += ' New Eden Station is active; its defences block future Wolf attacks.';
    }
  }
  if (site.code === 'N' && !site.repairedAt && site.materials === ringMaterialsRequired && site.researchIds.length === 5 && site.shuttleId) {
    site.repairedAt = a.now; summary += ' Ancient Jump Ring repaired; each ship may choose a five-fuel passage.';
  }
  state.revision += 1;
  const reply: CandidateActionReply = { type: 'candidate-action-result', status: 'committed',
    sessionId: a.sessionId, requestId: command.requestId, revision: state.revision,
    code: command.code, action: command.action, summary,
    ...(outcome ? { outcome } : {}), ...(fuelSpent === undefined ? {} : { fuelSpent, remainingFuel }) };
  if (command.action === 'ring-passage' || command.action === 'nebula-jump') site.ships[command.shipId!] = reply;
  if (site.code === 'O' && a.vesselIds.every(shipId => a.ships[shipId]?.destroyed || site.ships[shipId])) {
    const successful = a.vesselIds.filter(shipId => site.ships[shipId]?.outcome === 'reached');
    groupOutcome = outcomeFor(a, site, command, successful,
      a.vesselIds.filter(shipId => !successful.includes(shipId)), successful.length ? 'success' : 'failure');
  }
  if (groupOutcome) site.completed = groupOutcome;
  const siteKey = state.sites[command.coordinate] && state.sites[command.coordinate]?.groupId !== a.groupId
    ? `${a.groupId}:${command.coordinate}` : command.coordinate;
  state.sites[siteKey] = site;
  return { state, reply, shipPatches, calculation, ...(groupOutcome ? { groupOutcome } : {}) };
}

/** Member-safe operational view: private calculations and unrevealed coordinates are absent. */
export function candidateWorkspace(a: CandidateAuthority, state: CandidateState) {
  const edition = state.edition ?? 'home';
  const ringMaterialsRequired = edition === 'deluxe' ? 15 : 10;
  const editionLocked = Object.values(state.sites).some(site => site.code === 'N' || site.code === 'O');
  const researchEligible = (track: string, crosses: number) => edition === 'home' ? crosses >= 4 :
    Object.hasOwn(ENDEAVOUR_RESEARCH_TRACKS, track) && crosses === ENDEAVOUR_RESEARCH_TRACKS[track as keyof typeof ENDEAVOUR_RESEARCH_TRACKS].materialCosts.length;
  return { type: 'candidate-workspace' as const, sessionId: a.sessionId, groupId: a.groupId,
    cycle: a.cycle, revision: state.revision, edition, editionLocked,
    paths: a.discovered.map(({ code, coordinate }) => {
      const site = siteFor(a, state, code, coordinate);
      const blockers: string[] = [];
      if (a.phase !== 'active') blockers.push('Gameplay is complete. Original results remain available.');
      if (!a.coordination) blockers.push('Candidate actions open during Coordination Phase.');
      if (code === 'N' && !site.repairedAt) {
        if (site.materials < ringMaterialsRequired) blockers.push(`Contribute ${ringMaterialsRequired - site.materials} materials.`);
        if (site.researchIds.length < 5) blockers.push(edition === 'home'
          ? 'Commit five distinct research tracks with at least four crosses.'
          : 'Commit five distinct fully completed Endeavour technologies.');
        if (!site.shuttleId) blockers.push('Commit one available Engineering Shuttle.');
      }
      if (code === 'P' && !a.station?.liberated) blockers.push('Station combat must defeat every remaining Wolf force.');
      const ships = a.vesselIds.map(shipId => {
        const ship = a.ships[shipId]; const result = site.ships[shipId];
        const atCandidate = !!ship?.atCandidate && (ship.coordinate === undefined || ship.coordinate === coordinate);
        return { shipId, result: result?.outcome ?? (ship?.destroyed ? 'lost' : 'awaiting-choice'),
          ...(result ? { summary: result.summary, fuelSpent: result.fuelSpent } : {}),
          fuelCost: code === 'N' ? 5 : code === 'O' ? ship?.longJumpCost ?? 0 : 0,
          reactorCapacity: code === 'P' ? ship?.reactorCapacity ?? 0 : 0,
          canAct: !site.completed && !result && !ship?.destroyed && a.phase === 'active' && a.coordination &&
            (a.actor.gm || a.actor.shipIds.includes(shipId)) && atCandidate,
          blocker: result ? 'Original result retained.' : ship?.destroyed ? 'Lost or destroyed ship.' :
            !atCandidate ? 'Ship must arrive at this candidate.' : code === 'N' && (ship?.fuel ?? 0) < 5 ? 'Five fuel required.' :
              code === 'O' && (!ship?.jumpCharged || ship.jumpDamaged) ? 'Charge and repair the Jump Drive.' :
                code === 'O' && ship.jumpedThisCycle ? 'Already jumped this cycle.' :
                  code === 'O' && ship.fuel < ship.longJumpCost ? 'Long-jump fuel required.' : '',
        };
      });
      return { code, coordinate, title: code === 'N' ? 'Ancient Jump Ring' : code === 'O' ? 'Deep Nebula' :
        site.activatedAt ? 'New Eden Station' : 'Ancient Space Station', blockers, ships,
        nextActor: site.completed ? 'Outcome committed.' : code === 'N' ? site.repairedAt ?
          'Each ship chooses passage; the GM may choose opposite-side sabotage.' :
          'Ship crews, Endeavour Scientist and an Engineering Shuttle holder.' : code === 'O' ?
          'Each ship chooses its long jump. Scout the Nebula first if needed.' : a.station?.liberated ?
          'Each ship crew chooses whether to cannibalise its Reactor.' : 'Battle crews resolve the required Station attack.',
        materials: site.materials, materialsRequired: ringMaterialsRequired, researchCount: site.researchIds.length,
        researchRequired: 5, shuttleCommitted: !!site.shuttleId, repaired: !!site.repairedAt,
        researchChoices: code === 'N' && (a.actor.research || a.actor.gm) ? Object.entries(a.research)
          .filter(([track, crosses]) => researchEligible(track, crosses) && !site.researchIds.includes(track))
          .map(([track]) => ({ id: track, name: ENDEAVOUR_RESEARCH_TRACKS[track as keyof typeof ENDEAVOUR_RESEARCH_TRACKS].name })) : [],
        engineeringShuttles: code === 'N' ? a.engineeringShuttles.filter(craft => craft.available &&
          (a.actor.gm || a.actor.shuttleIds.includes(craft.id))) : [],
        liberated: code === 'P' && a.station?.liberated === true,
        chargeCapacity: Object.values(site.reactors).reduce((sum, capacity) => sum + capacity, 0),
        requiredCapacity: 18, reactorShipIds: Object.keys(site.reactors),
        activated: !!site.activatedAt, sabotaged: !!site.sabotagedAt, completed: !!site.completed,
        canSabotage: a.actor.gm && !!site.repairedAt && !site.completed &&
          Object.values(site.ships).some(result => result.outcome === 'crossed'),
      };
    }) };
}

import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { SMALL_SHIP_IDS, parseSmallShipState } from './smallShip';
import { parseUnassignedCraftHostLoss, craftHostLossHasCurrentProof, type UnassignedCraftHostLoss } from './shipDestruction';
import { parsePdfEscortWingState, type PdfEscortWingState } from './pdfEscortWingState';
import { projectPdfEscortWingMemberView } from './pdfEscortWingProjection';
import { fighterWingCounts, FIGHTER_WING_IDS } from './fighterWings';
import { parseAegisFighterWingCombatState } from './fighterWingCombat';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export interface OtherHostCraftLoss {
  readonly sessionPatch: Record<string, unknown>;
  readonly pdfState?: PdfEscortWingState;
  readonly attackPatch?: Record<string, unknown>;
}

/** Read-only planning; every caller completes these reads before any writes.
 * Wing provenance comes from the same printed owner's validated initial-only
 * shuttle loss, rather than inferring ownership from an empty current roster. */
export async function unassignedHostCraftLoss(tx: Pick<Transaction, 'get'>, db: Pick<Firestore, 'doc'>,
  input: Readonly<{ session: DocumentSnapshot; players: readonly DocumentSnapshot[];
    host: string; cycle: number; lostAt: string; lostShuttleIds: readonly string[] }>): Promise<OtherHostCraftLoss> {
  const patch: Record<string, unknown> = {};
  const loss: UnassignedCraftHostLoss = { status: 'lost', destroyedHostShipId: input.host,
    sourceId: `damage-destroyed-${input.host}`, cycle: input.cycle, lostAt: input.lostAt };
  const rawShips = input.session.get('smallShipStates');
  if (rawShips !== undefined && !record(rawShips)) throw new Error('Small-ship assignment history is malformed.');
  for (const id of SMALL_SHIP_IDS) {
    if (!record(rawShips) || !Object.hasOwn(rawShips, id)) continue;
    const state = parseSmallShipState(rawShips[id], id);
    if (!state) throw new Error('Small-ship assignment history is malformed.');
    if (state.hostShipId !== input.host) continue;
    const owner = input.players.some(player => player.exists && player.get('role') === 'player' &&
      player.get('replacementRoleId') === `${id}-captain`);
    if (state.everAssigned === true || owner && state.everAssigned === undefined) continue;
    if (state.everAssigned !== false || owner || state.loss || state.dockingRevision >= Number.MAX_SAFE_INTEGER) {
      throw new Error('Small-ship assignment history cannot establish never-assigned custody.');
    }
    patch[`smallShipStates.${id}`] = { ...state, hostShipId: null,
      dockingRevision: state.dockingRevision + 1, loss };
  }
  const sessionId = input.session.id;
  const aegis = input.host === 'aegis' && input.lostShuttleIds.includes('starlight');
  const pdf = input.host === 'refinery-124' && input.lostShuttleIds.includes('chepu');
  if (!aegis && !pdf) return { sessionPatch: patch };
  const attack = await tx.get(db.doc(`sessions/${sessionId}/wolfAttackState/current`));
  const launched = attack.get('launchedCraftIds');
  if (launched !== undefined && (!Array.isArray(launched) || launched.some(id => typeof id !== 'string'))) {
    throw new Error('Fighter host loss has malformed launch history.');
  }
  if (aegis) {
    const counts = fighterWingCounts(input.session.get('fighterWingCounts'));
    const combatRaw = attack.get('aegisFighterWingState');
    const combat = combatRaw === undefined ? undefined : parseAegisFighterWingCombatState(combatRaw);
    if (combatRaw !== undefined && !combat) throw new Error('Fighter host loss has malformed combat history.');
    for (const id of FIGHTER_WING_IDS) {
      const count = counts[id];
      if (!count || count.revision >= Number.MAX_SAFE_INTEGER || launched?.includes(id) || combat?.wings[id].launched) {
        throw new Error('Fighter host loss cannot establish an unassigned unlaunched wing.');
      }
      patch[`fighterWingCounts.${id}`] = { count: 0, revision: count.revision + 1 };
    }
    const attackPatch = combat && attack.get('status') === 'declared' ? { aegisFighterWingState: {
      ...combat, revision: combat.revision + 1, wings: Object.fromEntries(FIGHTER_WING_IDS.map(id => [id, {
        ...combat.wings[id], fighters: 0, losses: combat.wings[id].losses + combat.wings[id].fighters,
      }])),
    } } : undefined;
    return { sessionPatch: patch, ...(attackPatch ? { attackPatch } : {}) };
  }
  const stored = await tx.get(db.doc(`sessions/${sessionId}/serverState/pdfEscortWing`));
  const state = parsePdfEscortWingState(stored.exists ? stored.data() : undefined);
  if (!state || state.launched || state.hostLoss || state.mediumResolved || state.shortResolved ||
      state.revision >= Number.MAX_SAFE_INTEGER || launched?.includes('pdf-escort-fighter-wing')) {
    throw new Error('Fighter host loss cannot establish an unassigned unlaunched PDF wing.');
  }
  const pdfState = parsePdfEscortWingState({ ...state, revision: state.revision + 1,
    fighters: 0, losses: 4, hostLoss: loss });
  if (!pdfState) throw new Error('The terminal PDF fighter state is malformed.');
  patch.pdfEscortWing = projectPdfEscortWingMemberView(pdfState);
  return { sessionPatch: patch, pdfState };
}

/** A recorded terminal small ship is not an undocked operational craft. */
export function smallShipHostLossIsCurrent(value: unknown, input: Readonly<{
  activeVesselIds: readonly string[]; currentCycle: number; shipDamage: unknown; vesselActionRevisions?: unknown;
}>): boolean {
  const loss = parseUnassignedCraftHostLoss(value);
  return !!loss && input.activeVesselIds.includes(loss.destroyedHostShipId) &&
    loss.cycle <= input.currentCycle && craftHostLossHasCurrentProof(loss, input.shipDamage, input.vesselActionRevisions);
}

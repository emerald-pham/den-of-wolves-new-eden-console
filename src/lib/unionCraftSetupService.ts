import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import type { UnionCraftStartingHostReply } from '../../functions/src/unionCraftSetupCallable';

export const UNION_CRAFT_STARTING_HOSTS = {
  wobbly: { roleId: 'joint-engineering-quellon-refinery', hosts: ['quellon', 'refinery-124'] },
  ally: { roleId: 'joint-engineering-shepherd-icebreaker', hosts: ['shepherd', 'icebreaker'] },
} as const;
export async function setUnionCraftStartingHost(
  craftId: 'wobbly' | 'ally', hostShipId: string,
  retry?: { requestId: string; expectedSetupRevision: number },
): Promise<UnionCraftStartingHostReply> {
  requireFreshSessionAuthority();
  const { session, me, gmInstance } = useSessionStore.getState();
  if (!session || !me || me.role !== 'gm' || me.sessionId !== session.id || !gmInstance ||
      gmInstance.sessionId !== session.id || gmInstance.uid !== me.uid)
    throw Error('A current facilitator instance is required.');
  if (session.setupConfirmed !== true || session.configurationLocked === true || session.currentTurn !== 0 ||
      !['lobby', 'casting'].includes(session.phase)) throw Error('Confirm the current setup before choosing the Union starting host.');
  const choice = UNION_CRAFT_STARTING_HOSTS[craftId];
  if (!session.activeRoleIds?.includes(choice.roleId)) throw Error('The confirmed Union station is unavailable.');
  if (!(choice.hosts as readonly string[]).includes(hostShipId) || !session.activeVesselIds?.includes(hostShipId))
    throw Error('Choose one of the Union station’s paired active ships.');
  const revision = retry?.expectedSetupRevision ?? session.setupRevision;
  const requestId = retry?.requestId ?? window.crypto.randomUUID();
  if (!Number.isSafeInteger(revision) || (revision as number) < 0 || !Number.isSafeInteger((revision as number) + 1) ||
      !/^[\w-]{1,128}$/.test(requestId)) throw Error('The setup request is invalid.');
  const payload = { sessionId: session.id, instanceId: gmInstance.id, requestId, expectedSetupRevision: revision as number, craftId, hostShipId };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'setUnionCraftStartingHost');
  const { data } = await call(payload);
  const current = useSessionStore.getState();
  requireFreshSessionAuthority();
  if (current.session?.id !== session.id || current.me?.uid !== me.uid || current.me.role !== 'gm' ||
      current.gmInstance?.id !== gmInstance.id || current.gmInstance.uid !== me.uid)
    throw Error('The facilitator session changed. Review its current setup.');
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw Error('The starting host receipt is malformed.');
  const reply = data as Record<string, unknown>;
  if (Object.keys(reply).length !== 6 || reply.status !== 'committed' || reply.sessionId !== payload.sessionId ||
      reply.requestId !== requestId || reply.craftId !== craftId || reply.hostShipId !== hostShipId || reply.setupRevision !== payload.expectedSetupRevision + 1)
    throw Error('The starting host receipt is malformed or belongs to another request.');
  // Docking and ownership come from the live snapshot; a delayed receipt never patches either.
  return reply as unknown as UnionCraftStartingHostReply;
}

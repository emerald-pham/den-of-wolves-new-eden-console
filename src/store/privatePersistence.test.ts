import { beforeEach, expect, it } from 'vitest';
import { SESSION_STORAGE_KEY, useSessionStore } from './useSessionStore';
import type { GameSession } from '@/types/game';

beforeEach(() => { useSessionStore.getState().reset(); localStorage.clear(); });

it('discards every legacy private runtime projection before an authenticated resume', async () => {
  const clean = useSessionStore.getState();
  const privateKeys = [
    'privateLoyalty', 'roleBrief', 'awayMissionHandPointer', 'awayMissionHand',
    'awayMissionHandPointers', 'awayMissionHands', 'gmAwayMissionHandPointers',
    'gmLoyaltyCensus', 'wolfCultIntelligence', 'gmWolfCultIntelligence',
    'arbourVision', 'gmArbourVision', 'facilitatorRuleCall', 'gmFacilitatorRuleCall',
    'gmCrisisState', 'gmZealotryResponse', 'gmCivilUnrestResolution', 'gmSetupReceipt',
    'commissarPurgeAuthority', 'seats',
  ] as const;
  const original = Object.fromEntries(privateKeys.map(key => [key, clean[key]]));
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: 1, state: {
    session: { id: 'old-session', name: 'Table', joinCode: '123456', phase: 'active',
      ownerUid: 'old-uid', createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z' },
    me: { uid: 'old-uid', sessionId: 'old-session', displayName: 'Prior reader', role: 'player' },
    mode: 'console', lastRoute: '/console', pendingCommands: [],
    ...Object.fromEntries(privateKeys.map(key => [key, { sentinel: 'PRIVATE-HAND-LOYALTY-NOTE-ROLL-BONUS' }])),
  } }));
  await useSessionStore.persist.rehydrate();
  const restored = useSessionStore.getState();
  expect(restored.session?.id).toBe('old-session');
  expect(restored.sessionSnapshotFreshness).toBe('cache');
  expect(Object.fromEntries(privateKeys.map(key => [key, restored[key]]))).toEqual(original);
  expect(JSON.stringify(restored)).not.toContain('PRIVATE-HAND-LOYALTY-NOTE-ROLL-BONUS');
});

it.each(['persist', 'rehydrate'] as const)('allowlists the cached session root before %s', async direction => {
  const marker = 'PRIVATE-NESTED-HAND-LOYALTY-NOTE-ROLL-BONUS';
  const privateKeys = ['loyalty', 'loyalties', 'privateLoyalty', 'wolfAssignments',
    'awayMissionHands', 'missionDeck', 'deckOrder', 'deepNebulaScans', 'hiddenRolls',
    'privateBonuses', 'facilitatorNotes', 'gmNotes', 'candidateVesselOutcomes', 'futurePrivateProjection'];
  const cached = {
    id: 'old-session', name: 'Table', joinCode: '123456', phase: 'active', currentTurn: 1,
    ownerUid: 'old-uid', createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z',
    shipResources: { aegis: { materials: 3 } },
    fullGameDemo: { status: 'active', progression: 'manual' },
    ...Object.fromEntries(privateKeys.map(key => [key, { sentinel: marker }])),
  };
  if (direction === 'persist') {
    useSessionStore.getState().setSession(cached as unknown as GameSession);
  } else {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: 1, state: { session: cached } }));
    await useSessionStore.persist.rehydrate();
  }
  const safe = direction === 'persist'
    ? JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).state.session
    : useSessionStore.getState().session;
  for (const key of privateKeys) expect(safe).not.toHaveProperty(key);
  expect(JSON.stringify(safe)).not.toContain(marker);
  expect(safe).toMatchObject({ id: 'old-session', currentTurn: 1,
    shipResources: { aegis: { materials: 3 } }, fullGameDemo: { status: 'active', progression: 'manual' } });
  if (direction === 'persist') expect(useSessionStore.getState().session).toBe(cached);
  else expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
});

it('rejects a malformed private-bearing demo marker from the cached public session', async () => {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: 1, state: { session: {
    id: 'old-session', name: 'Table', joinCode: '123456', phase: 'active',
    createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z',
    fullGameDemo: { status: 'active', progression: 'manual', actorUid: 'private-actor' },
  } } }));
  await useSessionStore.persist.rehydrate();
  expect(useSessionStore.getState().session).not.toHaveProperty('fullGameDemo');
  expect(JSON.stringify(useSessionStore.getState().session)).not.toContain('private-actor');
});

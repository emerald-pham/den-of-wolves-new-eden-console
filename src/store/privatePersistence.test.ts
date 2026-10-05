import { beforeEach, expect, it } from 'vitest';
import { SESSION_STORAGE_KEY, useSessionStore } from './useSessionStore';

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

import {
  applyAwayMissionLifecycleCommand, createAwayMissionLifecycleBootstrap,
  projectAwayMissionPrivateState, projectAwayMissionPublicState,
  type AwayMissionLifecycleCommand, type AwayMissionLifecycleRecord,
} from '../../functions/src/awayMissionLifecycleAdapter';
import { awayMissionHandId } from '../../functions/src/awayMissionCards';
import { missionDeck, missionDeckStateFromCards } from '../../functions/src/missionDeck';
import { organiserSitesForChart } from '../../functions/src/starChartLookup';

type CommandFields<T> = T extends unknown ? Omit<T, 'requestId' | 'expectedRevision'> : never;

/** Synthetic source-derived legacy storage; never a copy of a live session. */
export function legacyFailedKProjectionFixture(sessionId = 'k-privacy-fixture') {
  const missionId = 'mission-k-privacy-fixture';
  const participants = [{ uid: 'alice', roleId: 'wing-commander' }, { uid: 'bob', roleId: 'icebreaker-miner' }];
  const participantCrafts = [{ participantUid: 'alice', craftIds: ['starlight'] }, { participantUid: 'bob', craftIds: ['highwall'] }];
  const prefix = ['A♥', 'A♦', '10♥', '10♦'];
  const cards = missionDeck();
  const deckState = missionDeckStateFromCards([
    ...prefix.map(id => cards.find(card => card.id === id)!), ...cards.filter(card => !prefix.includes(card.id)),
  ]);
  const bootstrap = createAwayMissionLifecycleBootstrap({ sessionId, groupId: 'fleet-1', sourceCycle: 2,
    participantCrafts, lifecycle: { missionId, siteCode: 'K', leaderUid: 'alice', participants,
      availableCarrierCraftIds: ['starlight', 'highwall'], deckState, dealtCount: 2,
      initialCards: [{ participantUid: 'alice', cardId: 'A♥' }, { participantUid: 'bob', cardId: 'A♦' }] } });
  if (!bootstrap) throw new Error('Invalid synthetic P403 bootstrap.');
  let record: AwayMissionLifecycleRecord = bootstrap.record;
  const apply = (actorUid: string, fields: CommandFields<AwayMissionLifecycleCommand>) => {
    const command = { ...fields, requestId: `fixture-${record.revision}`, expectedRevision: record.revision } as AwayMissionLifecycleCommand;
    const result = applyAwayMissionLifecycleCommand(record, command, {
      actorUid, isActiveGm: actorUid === 'gm', teamPhase: false, currentCycle: 2,
      legalDropOffShipIds: ['aegis'], bonusSources: [], secretD6Rolls: { 'K-1': 6 }, randomIndex: () => 0,
    });
    if (result.status !== 'committed' || !result.record) throw new Error(`Invalid synthetic command: ${command.type}`);
    record = result.record;
  };
  // Parameters are checked by the actual command consumer, not fixture arithmetic.
  apply('alice', { type: 'distributeExtraCard', participantUid: 'alice', opportunityId: 'K-1' });
  apply('gm', { type: 'openDiscards' });
  apply('alice', { type: 'discardCard', cardId: 'A♥' });
  apply('bob', { type: 'discardCard', cardId: 'A♦' });
  apply('alice', { type: 'assignCards', placements: [{ cardId: '10♥', opportunityId: 'K-1' }] });
  apply('bob', { type: 'assignCards', placements: [] });
  apply('gm', { type: 'addFacilitatorCards' });
  apply('gm', { type: 'resolve' });
  const coordinate = Object.entries(organiserSitesForChart('A')).find(([, site]) => site.code === 'K')![0];
  const pointers = participants.map(({ uid: participantUid }) => {
    const safe = projectAwayMissionPublicState(record, participantUid)!;
    const legacy = { ...safe, outcomes: safe.outcomes!.map(outcome => {
      const canonical = record.outcomes!.find(candidate => candidate.opportunityId === outcome.opportunityId)!;
      return { ...outcome, difficulty: canonical.difficulty, criticalThreshold: canonical.criticalThreshold };
    }) };
    const handId = awayMissionHandId(missionId, participantUid);
    return { type: 'away-mission-hand-pointer', sessionId, participantUid, missionId, handId,
      groupId: 'fleet-1', chart: 'A', coordinate, siteCode: 'K', sourceCycle: 2,
      participantCount: 2, missionLeaderUid: 'alice', missionLeaderRoleId: 'wing-commander',
      phase: safe.phase, revision: record.revision, discarded: true, lifecyclePublicState: legacy };
  });
  const hands = participants.map(({ uid: participantUid }, index) => ({ type: 'away-mission-hand', sessionId,
    participantUid, missionId, handId: pointers[index]!.handId, cardId: prefix[index],
    revision: record.revision, phase: pointers[index]!.phase, discarded: true,
    lifecyclePrivateState: projectAwayMissionPrivateState(record, participantUid)! }));
  return { sessionId, missionId, record, pointers, hands };
}

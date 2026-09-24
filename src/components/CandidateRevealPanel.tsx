import type { GameSession, Player } from '@/types/game';

export default function CandidateRevealPanel({
  session,
  player,
  sessionSnapshotFreshness,
  observer = false,
}: {
  readonly session: Pick<GameSession, 'phase' | 'currentGroupCandidateReveals'> | null;
  readonly player: Pick<Player, 'role' | 'fleetGroupId'> | null;
  readonly sessionSnapshotFreshness: 'unknown' | 'cache' | 'server';
  readonly observer?: boolean;
}) {
  const candidateReveals = session?.currentGroupCandidateReveals;
  if (observer || sessionSnapshotFreshness !== 'server' || session?.phase !== 'active' ||
      player?.role !== 'player' || !player.fleetGroupId ||
      candidateReveals?.groupId !== player.fleetGroupId) return null;

  if (candidateReveals.candidateReveals.length === 0) return null;

  return (
    <section className="candidate-reveal-panel cic-frame" aria-label="Candidate discoveries">
      <p className="ship-resources__eyebrow">Candidate discoveries</p>
      <ul>
        {candidateReveals.candidateReveals.map(({ code, title }) => (
          <li key={code}><strong>{code}</strong><span>{title}</span></li>
        ))}
      </ul>
    </section>
  );
}

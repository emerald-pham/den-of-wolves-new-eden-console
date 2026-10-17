import type { GameSession, NewEdenCandidateCode, Player } from '@/types/game';

const preparationRequirements: Record<NewEdenCandidateCode, string> = {
  N: 'Repair needs 10 materials, an Engineering Shuttle, and five different Endeavour Research Lab upgrades or science devices with four crosses each. Passage needs 5 Strytium per ship.',
  O: 'Additional in-range scout missions improve each ship’s chance on a long jump. The exact scouting total and each ship’s result stay facilitator-private.',
  P: 'Resolve the Station’s combat requirement, then provide at least 18 consoles’ worth of power from Reactor ships.',
};

export default function CandidateRevealPanel({
  session,
  player,
  sessionSnapshotFreshness,
  observer = false,
}: {
  readonly session: Pick<GameSession, 'phase' | 'currentTurn' | 'currentGroupCandidateReveals'> | null;
  readonly player: Pick<Player, 'role' | 'fleetGroupId'> | null;
  readonly sessionSnapshotFreshness: 'unknown' | 'cache' | 'server';
  readonly observer?: boolean;
}) {
  const candidateReveals = session?.currentGroupCandidateReveals;
  if (observer || sessionSnapshotFreshness !== 'server' || session?.phase !== 'active' ||
      player?.role !== 'player' || !player.fleetGroupId) return null;

  const entitledReveals = candidateReveals?.groupId === player.fleetGroupId
    ? candidateReveals.candidateReveals
    : [];
  const showCycleSixEncouragement = session.currentTurn === 6;
  if (entitledReveals.length === 0 && !showCycleSixEncouragement) return null;

  return (
    <>
      {entitledReveals.length > 0 && (
        <section className="candidate-reveal-panel cic-frame" aria-label="Candidate discoveries">
          <p className="ship-resources__eyebrow">Candidate discoveries</p>
          <ul>
            {entitledReveals.map(({ code, title }) => (
              <li key={code}><strong>{code}</strong><span>{title}</span></li>
            ))}
          </ul>
          <section aria-label="Candidate preparation requirements">
            <p className="ship-resources__eyebrow">Preparation requirements</p>
            <ul>
              {entitledReveals.map(({ code, title }) => (
                <li key={code}>
                  <strong>{code} // {title}</strong>
                  <span>{preparationRequirements[code]}</span>
                </li>
              ))}
            </ul>
          </section>
        </section>
      )}
      {showCycleSixEncouragement && (
        <section className="candidate-reveal-panel cic-frame" aria-label="Cycle 6 plan encouragement">
          <p className="ship-resources__eyebrow">New Eden planning</p>
          <p>Cycle 6 // Agree a New Eden plan with your fleet and identify who acts next.</p>
        </section>
      )}
    </>
  );
}

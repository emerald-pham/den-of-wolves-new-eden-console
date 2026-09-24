import type { CandidateReveal } from '@/types/game';

export default function CandidateRevealPanel({
  candidateReveals,
}: {
  readonly candidateReveals: readonly CandidateReveal[];
}) {
  if (candidateReveals.length === 0) return null;

  return (
    <section className="candidate-reveal-panel cic-frame" aria-label="Candidate discoveries">
      <p className="ship-resources__eyebrow">Candidate discoveries</p>
      <ul>
        {candidateReveals.map(({ code, title }) => (
          <li key={code}><strong>{code}</strong><span>{title}</span></li>
        ))}
      </ul>
    </section>
  );
}

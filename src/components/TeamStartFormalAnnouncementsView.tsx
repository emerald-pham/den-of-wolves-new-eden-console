import type { TeamStartFormalAnnouncement } from '@/types/game';

export function TeamStartFormalAnnouncementsView({ announcements }: {
  readonly announcements: readonly TeamStartFormalAnnouncement[];
}) {
  if (announcements.length === 0) return null;
  return <section className="turn-start-announcement__formal" aria-label="Formal Team-start announcements">
    <h2>FORMAL FLEET ANNOUNCEMENTS</h2>
    {announcements.map((announcement) => <article key={announcement.id} data-kind={announcement.kind}>
      <p>DECIDED CYCLE {announcement.decidedCycle}</p>
      <h3>{announcement.title}</h3>
      <p>{announcement.details}</p>
    </article>)}
  </section>;
}

import { Link } from 'react-router-dom';
import { SHUTTLECRAFT } from '@/data/shuttles';

/** Shared launch links for the physical craft assigned to a role’s printed sheet. */
export default function AssignedShuttlecraft({ roleId }: { readonly roleId: string }) {
  const craft = SHUTTLECRAFT.filter((shuttle) => shuttle.captainRoleId === roleId);
  if (craft.length === 0) return null;
  return (
    <section className="console-workspace__section" aria-label="Assigned shuttlecraft">
      <h3>Assigned shuttlecraft</h3>
      <div className="aegis-system-grid">
        {craft.map((shuttle) => (
          <article className="aegis-system cic-frame" key={shuttle.id}>
            <p>{shuttle.vesselType}</p>
            <h3>{shuttle.name}</h3>
            <p>{shuttle.description}</p>
            <Link className="cic-text-button" to={`/shuttles/${shuttle.id}`}
              aria-label={`Open ${shuttle.shortName} shuttle console`}>
              Open shuttle console
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

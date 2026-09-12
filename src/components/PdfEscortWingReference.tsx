import { PDF_FIGHTER_WING_SYSTEM, PDF_ROLE_CONSOLE } from '@/data/pdfConsoles';
import refinery124 from '@/data/vessels/refinery-124';

/** Static PDF wing reference; mutable count and combat resolution belong to later prompts. */
export default function PdfEscortWingReference() {
  const wing = PDF_ROLE_CONSOLE.craft[0]!;
  const fighterBay = refinery124.systems?.find((system) => system.id === wing.launch.systemId);
  return (
    <section className="console-workspace__section" aria-labelledby="pdf-escort-wing-title">
      <h3 id="pdf-escort-wing-title">PDF Escort Fighter Wing</h3>
      <div className="aegis-system-grid">
        <article className="aegis-system cic-frame">
          <p>Fighter wing // P.D.F. Colonel</p>
          <h3>{wing.name}</h3>
          <dl>
            <div><dt>Owner</dt><dd>{wing.ownerRoleId}</dd></div>
            <div><dt>Fighter cap</dt><dd>Up to {wing.capacity} fighters // PDF wing cap</dd></div>
            <div><dt>Away mission</dt><dd>Independent of Fighter Bay charge // Search &amp; rescue +{wing.mission.bonuses.searchAndRescue} // Salvage +{wing.mission.bonuses.salvage}</dd></div>
            <div><dt>Combat launch</dt><dd>{PDF_FIGHTER_WING_SYSTEM.name} // charged and undamaged // {wing.launch.phase}</dd></div>
          </dl>
          <p>{fighterBay?.effect ?? `${PDF_FIGHTER_WING_SYSTEM.name} launch reference unavailable`}</p>
          <p className="aegis-craft__system-label">Combat reference</p>
          <p>{wing.combat.mediumRange}</p>
          <p>{wing.combat.shortRange} {wing.combat.lossRule}</p>
          <p className="aegis-system__damaged-rule">{fighterBay?.effect.match(/Damaged:.*$/i)?.[0] ?? 'Damaged: launch unavailable.'}</p>
        </article>
      </div>
    </section>
  );
}

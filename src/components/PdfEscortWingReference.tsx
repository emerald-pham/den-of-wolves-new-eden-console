import { PDF_FIGHTER_WING_SYSTEM, PDF_ROLE_CONSOLE } from '@/data/pdfConsoles';
import type { PdfEscortWingMemberView } from '@/types/game';
import { initialPdfEscortWingMemberView } from '@/lib/pdfEscortWingProjection';
import refinery124 from '@/data/vessels/refinery-124';

/** Printed PDF wing reference with only the server-authored member status view. */
export default function PdfEscortWingReference({ state }: {
  readonly state?: PdfEscortWingMemberView | undefined;
}) {
  const wing = PDF_ROLE_CONSOLE.craft[0]!;
  const fighterBay = refinery124.systems?.find((system) => system.id === wing.launch.systemId);
  const current = state ?? initialPdfEscortWingMemberView();
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
            <div><dt>Fighters remaining</dt><dd>{current.fighters} of {current.capacity}</dd></div>
            <div><dt>Launch state</dt><dd>{current.launched ? 'Launched' : 'Not launched'}</dd></div>
            <div><dt>Medium Range</dt><dd>{current.mediumResolved
              ? `Resolved // ${current.mediumActionCount} fighter actions`
              : 'Not resolved'}</dd></div>
            <div><dt>Short Range</dt><dd>{current.shortResolved
              ? `Resolved // ${current.shortRollCount} fighter rolls`
              : 'Not resolved'}</dd></div>
            <div><dt>Wing losses</dt><dd>{current.losses}</dd></div>
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

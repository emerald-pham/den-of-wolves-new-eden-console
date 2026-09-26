import { useCallback, useEffect, useRef, useState } from 'react';
import { PDF_FIGHTER_WING_SYSTEM, PDF_ROLE_CONSOLE } from '@/data/pdfConsoles';
import { getPdfEscortWingLaunch, launchPdfEscortWing } from '@/lib/sessionService';
import type { PdfEscortWingLaunchView, PdfEscortWingMemberView } from '@/types/game';
import { initialPdfEscortWingMemberView } from '@/lib/pdfEscortWingProjection';
import { useSessionStore } from '@/store/useSessionStore';
import refinery124 from '@/data/vessels/refinery-124';

function launchStatus(view: PdfEscortWingLaunchView | null, canRead: boolean): string {
  if (!view) return canRead ? 'Checking current Wolf attack launch authority…' :
    'Launch authority is available to the active P.D.F. Colonel in a live session.';
  if (view.launched) return `Launched // Cycle ${view.turn}`;
  if (view.eligible) return 'Wolf Attack targeting // Refinery 8♦ Fighter Bay charged and operational';
  if (view.reason === 'uncharged') return 'Refinery 8♦ Fighter Bay uncharged // launch denied';
  if (view.reason === 'damaged') return 'Refinery 8♦ Fighter Bay damaged // launch denied';
  if (view.reason === 'destroyed') return 'Refinery 124 destroyed // launch denied';
  if (view.reason === 'no-fighters') return 'No P.D.F. Escort Wing fighters remain // launch denied';
  return 'Waiting for an active Wolf Attack targeting window.';
}

/** Printed PDF wing reference with only the server-authored member status view. */
export default function PdfEscortWingReference({ state, writable = false }: {
  readonly state?: PdfEscortWingMemberView | undefined;
  readonly writable?: boolean;
}) {
  const session = useSessionStore((current) => current.session);
  const connection = useSessionStore((current) => current.connection);
  const me = useSessionStore((current) => current.me);
  const wing = PDF_ROLE_CONSOLE.craft[0]!;
  const fighterBay = refinery124.systems?.find((system) => system.id === wing.launch.systemId);
  const current = state ?? initialPdfEscortWingMemberView();
  const [launchView, setLaunchView] = useState<PdfEscortWingLaunchView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const launchReadGeneration = useRef(0);
  const canReadLaunchAuthority = writable && connection === 'live' && Boolean(session) &&
    me?.activeConsoleRoleId === PDF_ROLE_CONSOLE.roleId;

  const refreshLaunchView = useCallback(async () => {
    const generation = ++launchReadGeneration.current;
    setLaunchView(null);
    setPending(false);
    setError(null);
    if (!writable || connection !== 'live' || !session ||
        me?.activeConsoleRoleId !== PDF_ROLE_CONSOLE.roleId) return;
    try {
      const view = await getPdfEscortWingLaunch();
      if (launchReadGeneration.current !== generation) return;
      setLaunchView(view);
    } catch (cause) {
      if (launchReadGeneration.current !== generation) return;
      setLaunchView(null);
      setError(cause instanceof Error ? cause.message : 'Escort Wing launch authority is unavailable.');
    }
  }, [connection, me?.activeConsoleRoleId, session, writable]);

  useEffect(() => {
    void refreshLaunchView();
    return () => { launchReadGeneration.current += 1; };
  }, [refreshLaunchView, session?.currentTurn, session?.turnPhase?.airspace.state]);

  async function launch(): Promise<void> {
    if (!canReadLaunchAuthority || !launchView?.eligible) return;
    const generation = launchReadGeneration.current;
    setPending(true);
    setError(null);
    try {
      const result = await launchPdfEscortWing(
        launchView.turn, launchView.revision, launchView.wingRevision,
      );
      if (launchReadGeneration.current === generation) setLaunchView(result);
    } catch (cause) {
      if (launchReadGeneration.current !== generation) return;
      setError(cause instanceof Error ? cause.message : 'Escort Wing launch failed.');
      await refreshLaunchView();
    } finally {
      if (launchReadGeneration.current === generation) setPending(false);
    }
  }

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
            <div><dt>Away mission reference</dt><dd>Fuel-free participation // printed bonuses +{wing.mission.bonuses.searchAndRescue} search &amp; rescue // +{wing.mission.bonuses.salvage} salvage // result integration pending</dd></div>
            <div><dt>Combat launch</dt><dd>{PDF_FIGHTER_WING_SYSTEM.name} // charged and undamaged // {wing.launch.phase}</dd></div>
          </dl>
          <p>{fighterBay?.effect ?? `${PDF_FIGHTER_WING_SYSTEM.name} launch reference unavailable`}</p>
          <p className="aegis-craft__system-label">Combat reference</p>
          <p>{wing.combat.mediumRange}</p>
          <p>{wing.combat.shortRange} {wing.combat.lossRule}</p>
          <p>Medium and Short combat resolution is not available in the console yet.</p>
          <p className="aegis-system__damaged-rule">{fighterBay?.effect.match(/Damaged:.*$/i)?.[0] ?? 'Damaged: launch unavailable.'}</p>
          <div className="cic-frame" aria-label="PDF Escort Wing launch control">
            <p className="ship-resources__eyebrow">Wolf Attack // Refinery Fighter Bay 8♦</p>
            <p aria-live="polite">{launchStatus(launchView, canReadLaunchAuthority)}</p>
            {error && <p role="alert">{error}</p>}
            <button
              className="cic-action-button"
              type="button"
              disabled={!canReadLaunchAuthority || pending || !launchView?.eligible}
              onClick={() => void launch()}
            >
              {pending ? 'Launching PDF Escort Wing…' : launchView?.launched
                ? 'PDF Escort Wing launched' : 'Launch PDF Escort Wing'}
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}

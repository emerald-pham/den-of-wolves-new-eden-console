import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { PDF_FIGHTER_WING_SYSTEM, PDF_ROLE_CONSOLE } from '@/data/pdfConsoles';
import { getPdfEscortWingLaunch, launchPdfEscortWing, passWolfFighterLaunchChoice } from '@/lib/sessionService';
import type { PdfEscortWingLaunchView, PdfEscortWingMemberView } from '@/types/game';
import PdfFighterAcePermissionControl from './PdfFighterAcePermissionControl';
import { initialPdfEscortWingMemberView } from '@/lib/pdfEscortWingProjection';
import { useSessionStore } from '@/store/useSessionStore';
import refinery124 from '@/data/vessels/refinery-124';
import './PdfEscortWingReference.css';

function launchStatus(view: PdfEscortWingLaunchView | null, canRead: boolean): string {
  if (!view) return canRead ? 'Checking current Wolf attack launch authority…' :
    'Launch authority is available to the active P.D.F. Colonel in a live session.';
  if (view.choiceStatus === 'passed' || view.reason === 'passed') return 'Launch choice passed for this attack.';
  if (view.choiceStatus === 'unavailable') return 'The Escort Wing could not launch for this attack.';
  if (view.launched) return `Launched // Cycle ${view.turn}`;
  if (view.eligible) return 'Wolf Attack targeting // Refinery 8♦ Fighter Bay charged and operational';
  if (view.reason === 'uncharged') return 'Refinery 8♦ Fighter Bay uncharged // launch denied';
  if (view.reason === 'damaged') return 'Refinery 8♦ Fighter Bay damaged // launch denied';
  if (view.reason === 'destroyed') return 'Refinery 124 destroyed // launch denied';
  if (view.reason === 'no-fighters') return 'No P.D.F. Escort Wing fighters remain // launch denied';
  return 'Waiting for an active Wolf Attack targeting window.';
}

export interface PdfEscortWingLaunchPanelViewProps {
  readonly view: PdfEscortWingLaunchView | null;
  readonly canRead: boolean;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly blocker?: string | null;
  readonly onLaunch: (view: PdfEscortWingLaunchView) => void;
  readonly onPass: (view: PdfEscortWingLaunchView) => void;
}

export function PdfEscortWingLaunchPanelView({
  view, canRead, busy = false, error, blocker, onLaunch, onPass,
}: PdfEscortWingLaunchPanelViewProps) {
  const statusId = useId();
  return (
    <div className="cic-frame pdf-escort-launch" aria-label="PDF Escort Wing launch control">
      <p className="ship-resources__eyebrow">Wolf Attack // Refinery Fighter Bay 8♦</p>
      <p id={statusId} aria-live="polite">{blocker ?? launchStatus(view, canRead)}</p>
      {error && <p role="alert">{error}</p>}
      <div className="pdf-escort-launch__actions">
        <button className="cic-action-button" type="button"
          aria-describedby={statusId}
          disabled={!canRead || busy || !view?.eligible}
          onClick={() => { if (view?.eligible) onLaunch(view); }}>
          {busy ? 'Launching PDF Escort Wing…' : view?.launched ? 'PDF Escort Wing launched' : 'Launch PDF Escort Wing'}
        </button>
        {view?.eligible && <button className="cic-action-button pdf-escort-launch__pass" type="button"
          aria-describedby={statusId}
          disabled={!canRead || busy} onClick={() => onPass(view)}>
          Pass PDF Escort Wing
        </button>}
      </div>
    </div>
  );
}

/** Printed PDF wing reference with only the server-authored member status view. */
export default function PdfEscortWingReference({ state, writable = false }: {
  readonly state?: PdfEscortWingMemberView | undefined;
  readonly writable?: boolean;
}) {
  const session = useSessionStore((current) => current.session);
  const connection = useSessionStore((current) => current.connection);
  const freshness = useSessionStore((current) => current.sessionSnapshotFreshness);
  const me = useSessionStore((current) => current.me);
  const wing = PDF_ROLE_CONSOLE.craft[0]!;
  const fighterBay = refinery124.systems?.find((system) => system.id === wing.launch.systemId);
  const current = state ?? initialPdfEscortWingMemberView();
  const [launchView, setLaunchView] = useState<{
    readonly authorityKey: string;
    readonly view: PdfEscortWingLaunchView;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ readonly authorityKey: string; readonly message: string } | null>(null);
  const launchReadGeneration = useRef(0);
  const canReadLaunchAuthority = writable && connection === 'live' && freshness === 'server' &&
    session?.phase === 'active' && typeof session.currentTurn === 'number' &&
    Number.isSafeInteger(session.currentTurn) && session.currentTurn >= 1 &&
    me?.role === 'player' && Boolean(me.uid) && me.sessionId === session.id &&
    me.activeConsoleRoleId === PDF_ROLE_CONSOLE.roleId;
  const authorityKey = JSON.stringify([
    session?.id, session?.phase, session?.currentTurn, session?.turnPhase?.airspace.state,
    me?.uid, me?.sessionId, me?.activeConsoleRoleId, connection, freshness, writable,
  ]);
  const currentLaunchView = canReadLaunchAuthority && launchView?.authorityKey === authorityKey ? launchView.view : null;
  const currentError = canReadLaunchAuthority && error?.authorityKey === authorityKey ? error.message : null;
  const awaitingStart = session?.phase === 'lobby' || session?.phase === 'casting' || session?.phase === 'briefing' ||
    (session?.phase === 'active' && session.currentTurn === 0);
  const launchAuthorityBlocker = !session ? null : awaitingStart
    ? 'Awaiting GM start // launch authority opens in Cycle 1.'
    : session.phase !== 'active'
      ? 'Game ended // Escort Wing launch unavailable.'
      : connection !== 'live' || freshness !== 'server'
        ? 'Reconnect // await live session state before checking launch authority.'
        : typeof session.currentTurn !== 'number' || !Number.isSafeInteger(session.currentTurn) || session.currentTurn < 1
          ? 'Current cycle unavailable // await the GM’s live game state.'
          : !canReadLaunchAuthority
            ? 'Select the active P.D.F. Colonel console to check launch authority.'
            : null;

  const refreshLaunchView = useCallback(async () => {
    const generation = ++launchReadGeneration.current;
    setLaunchView(null);
    setPending(false);
    setError(null);
    if (!canReadLaunchAuthority) return;
    try {
      const view = await getPdfEscortWingLaunch();
      if (launchReadGeneration.current !== generation) return;
      setLaunchView(view ? { authorityKey, view } : null);
    } catch (cause) {
      if (launchReadGeneration.current !== generation) return;
      setLaunchView(null);
      setError({ authorityKey, message: cause instanceof Error ? cause.message : 'Escort Wing launch authority is unavailable.' });
    }
  }, [authorityKey, canReadLaunchAuthority]);

  useEffect(() => {
    void refreshLaunchView();
    return () => { launchReadGeneration.current += 1; };
  }, [refreshLaunchView, session]);

  async function launch(): Promise<void> {
    if (!canReadLaunchAuthority || !currentLaunchView?.eligible) return;
    const generation = launchReadGeneration.current;
    setPending(true);
    setError(null);
    try {
      const result = await launchPdfEscortWing(
        currentLaunchView.turn, currentLaunchView.revision, currentLaunchView.wingRevision,
      );
      if (launchReadGeneration.current === generation) setLaunchView({ authorityKey, view: result });
    } catch (cause) {
      if (launchReadGeneration.current !== generation) return;
      setError({ authorityKey, message: cause instanceof Error ? cause.message : 'Escort Wing launch failed.' });
      await refreshLaunchView();
    } finally {
      if (launchReadGeneration.current === generation) setPending(false);
    }
  }

  async function pass(): Promise<void> {
    if (!canReadLaunchAuthority || !currentLaunchView?.eligible) return;
    const generation = launchReadGeneration.current;
    setPending(true);
    setError(null);
    try {
      await passWolfFighterLaunchChoice(
        'pdf-escort-fighter-wing', currentLaunchView.turn, currentLaunchView.revision, currentLaunchView.wingRevision,
      );
      if (launchReadGeneration.current === generation) await refreshLaunchView();
    } catch (cause) {
      if (launchReadGeneration.current !== generation) return;
      setError({ authorityKey, message: cause instanceof Error ? cause.message : 'Escort Wing pass failed.' });
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
          <PdfEscortWingLaunchPanelView view={currentLaunchView} canRead={canReadLaunchAuthority}
            busy={pending} error={currentError} blocker={launchAuthorityBlocker}
            onLaunch={() => void launch()} onPass={() => void pass()} />
          {currentLaunchView?.launched && <PdfFighterAcePermissionControl sourceId="pdf-escort-fighter-wing"
            enabled={canReadLaunchAuthority} refreshKey={currentLaunchView.revision} />}
        </article>
      </div>
    </section>
  );
}

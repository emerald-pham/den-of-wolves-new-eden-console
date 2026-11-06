import { useCallback } from 'react';
import {
  getAegisFighterWingLaunch,
  launchAegisFighterWing,
  passWolfFighterLaunchChoice,
} from '@/lib/sessionService';
import type {
  AegisFighterWingLaunchView,
  WolfAttackMemberView,
} from '@/types/game';
import { useWolfAttackChoiceAuthority, useWolfAttackChoiceController } from '@/lib/wolfAttackChoiceController';
import { useSessionStore } from '@/store/useSessionStore';
import { fighterWingCallsign, type FighterWingId } from '@/data/aegisConsoles';
import PdfFighterAcePermissionControl from './PdfFighterAcePermissionControl';
import './AegisFighterWingLaunchPanel.css';

export type AegisFighterWingLaunchViews = Readonly<Partial<Record<FighterWingId, AegisFighterWingLaunchView>>>;

const WINGS: readonly Readonly<{ id: FighterWingId; label: string; bay: string }>[] = [
  { id: 'fighter-wing-alpha', label: 'Fighter Wing Alpha', bay: 'Fighter Bay Alpha' },
  { id: 'fighter-wing-bravo', label: 'Fighter Wing Bravo', bay: 'Fighter Bay Bravo' },
];

function reasonText(view: AegisFighterWingLaunchView, bay: string): string | undefined {
  if (view.eligible) return undefined;
  if (view.choiceStatus === 'passed' || view.reason === 'passed') return 'Launch choice passed for this attack.';
  if (view.choiceStatus === 'unavailable') return 'This wing could not launch for the current attack.';
  // A launched wing stays launched once the attack leaves targeting, where the server reports it as waiting.
  const launched = `Fighter Wing ${fighterWingCallsign(view.wingId)} is launched for this attack.`;
  if (view.launched) return launched;
  switch (view.reason) {
    case 'already-launched': return launched;
    case 'no-fighters': return `No fighters remain in ${fighterWingCallsign(view.wingId)}.`;
    case 'uncharged': return `Charge ${bay} before launching this wing.`;
    case 'damaged': return `${bay} is damaged and cannot launch this wing.`;
    case 'destroyed': return 'A destroyed AEGIS cannot launch its fighter wings.';
    default: return 'Waiting for the current Wolf attack targeting step.';
  }
}

export interface AegisFighterWingLaunchPanelViewProps {
  readonly views: AegisFighterWingLaunchViews;
  readonly onLaunch: (wingId: FighterWingId, view: AegisFighterWingLaunchView) => void;
  readonly onPass?: (wingId: FighterWingId, view: AegisFighterWingLaunchView) => void;
  readonly busy?: boolean;
  readonly message?: string;
}

export function AegisFighterWingLaunchPanelView({
  views,
  onLaunch,
  onPass,
  busy = false,
  message,
}: AegisFighterWingLaunchPanelViewProps) {
  const turn = WINGS.map(({ id }) => views[id]?.turn).find((value) => value !== undefined);
  return (
    <section className="cic-frame aegis-fighter-launch" aria-label="AEGIS fighter wing launches">
      <header className="aegis-fighter-launch__header">
        <div>
          <p className="eyebrow">{turn ? `Cycle ${turn} // flight control` : 'Flight control'}</p>
          <h2>AEGIS fighter bays</h2>
        </div>
        <span className="aegis-fighter-launch__status">Targeting</span>
      </header>
      <div className="aegis-fighter-launch__wings">
        {WINGS.map(({ id, label, bay }) => {
          const view = views[id];
          return (
            <article className="aegis-fighter-launch__wing" key={id} aria-label={label}>
              <div>
                <h3>{label}</h3>
                {view ? <p>{view.fighters} fighter{view.fighters === 1 ? '' : 's'} remaining</p>
                  : <p role="status">Checking launch authority…</p>}
              </div>
              {view?.eligible ? (
                <div className="aegis-fighter-launch__actions">
                  <button type="button" className="cic-action-button" disabled={busy}
                    onClick={() => onLaunch(id, view)}>
                    Launch {label}
                  </button>
                  <button type="button" className="cic-action-button aegis-fighter-launch__pass" disabled={busy || !onPass}
                    onClick={() => onPass?.(id, view)}>
                    Pass {label}
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" className="cic-action-button" disabled>
                    Launch {label}
                  </button>
                  {view && <p className="aegis-fighter-launch__notice" role="status">{reasonText(view, bay)}</p>}
                </>
              )}
            </article>
          );
        })}
      </div>
      {message && <p className="aegis-fighter-launch__notice" role="status">{message}</p>}
    </section>
  );
}

export default function AegisFighterWingLaunchPanel({
  sessionId: suppliedSessionId,
}: Readonly<{ sessionId?: string }> = {}) {
  const authority = useWolfAttackChoiceAuthority('wing-commander', suppliedSessionId);
  const currentTurn = useSessionStore((state) => state.session?.currentTurn);
  const expectedStep = useCallback((member: WolfAttackMemberView) =>
    member.status === 'declared' && member.turn === currentTurn, [currentTurn]);
  const readViews = useCallback(async (): Promise<AegisFighterWingLaunchViews | null> => {
    const results = await Promise.all([
      getAegisFighterWingLaunch('fighter-wing-alpha'),
      getAegisFighterWingLaunch('fighter-wing-bravo'),
    ]);
    if (results.some((result) => result === null)) return null;
    return { 'fighter-wing-alpha': results[0]!, 'fighter-wing-bravo': results[1]! };
  }, []);
  const { memberView, view, busy, error, message, runMutation } = useWolfAttackChoiceController({
    authority, actor: 'wing-commander', expectedStep, read: readViews,
    readMatches: launchReadMatches,
    readFailureMessage: 'Could not read fighter launch authority.',
    mutationFailureMessage: 'The fighter launch choice could not be committed.',
  });

  if (!authority.sessionId || !authority.actorReady) return null;
  if (!authority.ready) return <section className="cic-frame aegis-fighter-launch" aria-label="AEGIS fighter wing launches">
    <p role="status">Waiting for the live server session before showing fighter bay choices.</p>
  </section>;

  if (!memberView) return null;
  const views = view ?? {};
  const displayMessage = error ?? message;

  return <>
    <AegisFighterWingLaunchPanelView views={views} busy={busy}
      {...(displayMessage ? { message: displayMessage } : {})}
      onLaunch={(wingId, wing) => runMutation(
        () => launchAegisFighterWing(wingId, wing.turn, wing.revision, wing.wingRevision),
        `${fighterWingCallsign(wingId)} launched for this attack.`,
      )}
      onPass={(wingId, wing) => runMutation(
        () => passWolfFighterLaunchChoice(wingId, wing.turn, wing.revision, wing.wingRevision),
        `${fighterWingCallsign(wingId)} launch passed for this attack.`,
      )} />
    {WINGS.flatMap(({ id }) => views[id]?.launched ? [
      <PdfFighterAcePermissionControl key={id} sourceId={id}
        enabled={authority.actorReady && authority.ready} refreshKey={memberView.revision} />,
    ] : [])}
  </>;
}

function launchReadMatches(views: AegisFighterWingLaunchViews | null, member: WolfAttackMemberView): boolean {
  return WINGS.every(({ id }) => {
    const view = views?.[id];
    return view?.sessionId === member.sessionId && view.turn === member.turn &&
      view.attackId === member.attackId && view.revision === member.revision && view.wingId === id;
  });
}

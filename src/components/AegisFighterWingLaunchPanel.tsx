import { useCallback, useEffect, useState } from 'react';
import {
  getAegisFighterWingLaunch,
  launchAegisFighterWing,
  passWolfFighterLaunchChoice,
} from '@/lib/sessionService';
import type {
  AegisFighterWingLaunchView,
} from '@/types/game';
import { useWolfAttackChoiceAuthority } from '@/lib/wolfAttackChoiceController';
import PdfFighterAcePermissionControl from './PdfFighterAcePermissionControl';
import './AegisFighterWingLaunchPanel.css';

export type AegisFighterWingId = 'fighter-wing-alpha' | 'fighter-wing-bravo';
export type AegisFighterWingLaunchViews = Readonly<Partial<Record<AegisFighterWingId, AegisFighterWingLaunchView>>>;

const WINGS: readonly Readonly<{ id: AegisFighterWingId; label: string; bay: string }>[] = [
  { id: 'fighter-wing-alpha', label: 'Fighter Wing Alpha', bay: 'Fighter Bay Alpha' },
  { id: 'fighter-wing-bravo', label: 'Fighter Wing Bravo', bay: 'Fighter Bay Bravo' },
];

function reasonText(view: AegisFighterWingLaunchView, bay: string): string | undefined {
  if (view.eligible) return undefined;
  if (view.choiceStatus === 'passed' || view.reason === 'passed') return 'Launch choice passed for this attack.';
  if (view.choiceStatus === 'unavailable') return 'This wing could not launch for the current attack.';
  switch (view.reason) {
    case 'already-launched': return `${view.wingId === 'fighter-wing-alpha' ? 'Fighter Wing Alpha' : 'Fighter Wing Bravo'} is launched for this attack.`;
    case 'no-fighters': return `No fighters remain in ${view.wingId === 'fighter-wing-alpha' ? 'Alpha' : 'Bravo'}.`;
    case 'uncharged': return `Charge ${bay} before launching this wing.`;
    case 'damaged': return `${bay} is damaged and cannot launch this wing.`;
    case 'destroyed': return 'A destroyed AEGIS cannot launch its fighter wings.';
    default: return 'Waiting for the current Wolf attack targeting step.';
  }
}

export interface AegisFighterWingLaunchPanelViewProps {
  readonly views: AegisFighterWingLaunchViews;
  readonly onLaunch: (wingId: AegisFighterWingId, view: AegisFighterWingLaunchView) => void;
  readonly onPass?: (wingId: AegisFighterWingId, view: AegisFighterWingLaunchView) => void;
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
  const [views, setViews] = useState<AegisFighterWingLaunchViews>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [refreshToken, setRefreshToken] = useState(0);

  const readViews = useCallback(async (): Promise<AegisFighterWingLaunchViews | null> => {
    if (!authority.sessionId || !authority.actorReady || !authority.ready) return null;
    const results = await Promise.all([
      getAegisFighterWingLaunch('fighter-wing-alpha'),
      getAegisFighterWingLaunch('fighter-wing-bravo'),
    ]);
    if (results.some((result) => result === null)) return null;
    return { 'fighter-wing-alpha': results[0]!, 'fighter-wing-bravo': results[1]! };
  }, [authority.actorReady, authority.ready, authority.sessionId]);

  useEffect(() => {
    let current = true;
    if (!authority.sessionId || !authority.actorReady || !authority.ready) return () => { current = false; };
    void readViews().then((next) => {
      if (current && next) setViews(next);
    }).catch((cause) => {
      if (current) setMessage(cause instanceof Error ? cause.message : 'Could not read fighter launch authority.');
    });
    return () => { current = false; };
  }, [authority.actorReady, authority.ready, authority.sessionId, readViews, refreshToken]);

  if (!authority.sessionId || !authority.actorReady) return null;
  if (!authority.ready) return <section className="cic-frame aegis-fighter-launch" aria-label="AEGIS fighter wing launches">
    <p role="status">Waiting for the live server session before showing fighter bay choices.</p>
  </section>;

  return <>
    <AegisFighterWingLaunchPanelView views={views} busy={busy} {...(message ? { message } : {})}
      onLaunch={(wingId, view) => {
        setBusy(true);
        setMessage(undefined);
        void launchAegisFighterWing(wingId, view.turn, view.revision, view.wingRevision)
          .then((result) => {
            setViews((current) => ({ ...current, [wingId]: result }));
            setMessage(`${wingId === 'fighter-wing-alpha' ? 'Alpha' : 'Bravo'} launched for this attack.`);
            setRefreshToken((token) => token + 1);
          })
          .catch((cause) => setMessage(cause instanceof Error ? cause.message : 'The fighter wing could not launch.'))
          .finally(() => setBusy(false));
      }}
      onPass={(wingId, view) => {
        setBusy(true);
        setMessage(undefined);
        void passWolfFighterLaunchChoice(wingId, view.turn, view.revision, view.wingRevision)
          .then(() => {
            setMessage(`${wingId === 'fighter-wing-alpha' ? 'Alpha' : 'Bravo'} launch passed for this attack.`);
            setRefreshToken((token) => token + 1);
          })
          .catch((cause) => setMessage(cause instanceof Error ? cause.message : 'The fighter launch choice could not be passed.'))
          .finally(() => setBusy(false));
      }} />
    {WINGS.flatMap(({ id }) => views[id]?.launched ? [
      <PdfFighterAcePermissionControl key={id} sourceId={id}
        enabled={authority.actorReady && authority.ready} refreshKey={refreshToken} />,
    ] : [])}
  </>;
}

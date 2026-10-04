import { useCallback, useEffect, useState } from 'react';
import { commitPdfFighterAceCombat, getPdfFighterAceCombatView } from '@/lib/pdfFighterAceService';
import type { PdfFighterAceCombatView } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';
import { PdfFighterAcePanel } from './Pc09SpecialistPresenters';

export default function PdfFighterAceCombatWorkspace() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const [view, setView] = useState<PdfFighterAceCombatView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!session || !me || connection !== 'live' || me.replacementRoleId !== 'pdf-fighter-ace' ||
        me.replacementStatus != null || me.activeConsoleRoleId !== null) {
      setView(null);
      return;
    }
    setLoading(true);
    try {
      setView(await getPdfFighterAceCombatView());
      setMessage(null);
    } catch (cause) {
      setView(null);
      setMessage(cause instanceof Error ? cause.message : 'Current Fighter Ace combat choices are unavailable.');
    } finally {
      setLoading(false);
    }
  }, [connection, me, session]);

  useEffect(() => { void refresh(); }, [refresh, refreshKey, session?.currentTurn, session?.turnPhase?.airspace.state]);

  if (!me || me.replacementRoleId !== 'pdf-fighter-ace') return null;
  if (connection !== 'live') return <section className="pc09-specialist-panel cic-frame" aria-label="PDF Fighter Ace personal combat">
    <p role="status">Reconnect to the live fleet before using Fighter Ace combat controls.</p>
  </section>;
  if (!view) return <section className="pc09-specialist-panel cic-frame" aria-label="PDF Fighter Ace personal combat">
    <p role={message ? 'alert' : 'status'}>{message ?? (loading ? 'Reading current Fighter Ace attack choices…' : 'Waiting for the current Ace combat choices.')}</p>
  </section>;
  if (view.status !== 'ready' || !view.attackId || !view.range || view.actionUsed || view.fighterSources.length === 0) {
    const detail = view.actionUsed ? 'The Fighter Ace has already acted in this attack.'
      : view.range === null ? 'A Wolf attack range is not currently open.'
        : 'A current commander has not authorized an available fighter slot for this attack.';
    return <section className="pc09-specialist-panel cic-frame" aria-label="PDF Fighter Ace personal combat">
      <p className="pc09-specialist-panel__eyebrow">Refinery 124 // Fighter Ace</p>
      <h2>Personal combat</h2>
      <p role="status">{detail}</p>
      {message && <p role="alert">{message}</p>}
    </section>;
  }

  const sources = view.fighterSources.map((source) => ({
    id: source.id, label: source.label, fighters: source.fighters,
  }));
  const targets = view.targets.filter((target) => target.available).map((target) => ({
    id: target.targetId, label: target.label,
  }));
  return <div>
    {message && <p role="alert">{message}</p>}
    <PdfFighterAcePanel attackId={view.attackId} range={view.range}
      fighterSources={sources} targets={targets}
      onCommit={async (action) => {
        const source = view.fighterSources.find((entry) => entry.id === action.sourceId);
        if (!source) throw new Error('The authorized fighter source is no longer available.');
        const result = await commitPdfFighterAceCombat({
          attackId: view.attackId!, expectedRevision: view.revision, range: view.range!,
          sourceId: source.id, fighterIndex: source.fighterIndex,
          permissionRequestId: source.permissionRequestId, permissionRevision: source.permissionRevision,
          targetId: action.targetId,
          ...(action.targetShift === undefined ? {} : { targetShift: action.targetShift }),
          ...(action.extraTargetId === undefined ? {} : { extraTargetId: action.extraTargetId }),
        });
        setRefreshKey((key) => key + 1);
        const outcome = result.aceDied ? 'pilot lost'
          : result.escaped ? 'fighter lost; pilot escaped'
            : result.targetDestroyed ? 'target destroyed'
              : result.damage > 0 ? 'hit' : 'miss';
        return { outcome, damage: result.damage };
      }} />
  </div>;
}

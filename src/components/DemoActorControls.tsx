import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { activeDemoActorProfile, demoActorManagerUrl, DEMO_ACTOR_ROSTER_CHANGED, demoActorRosterStorageKey, readDemoActorAccountUid } from '@/lib/demoActorContext';
import { demoSessionStatus, readDemoActorRoster, renewDemoActorPresence, switchDemoActor, type DemoActorRecord } from '@/lib/demoActorProfiles';
import { auth } from '@/lib/firebase';
import { refreshPresence } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import { isSessionWaiverAcknowledged } from '@/lib/sessionWaiver';
import { findConsoleRole } from '@/data/roles';
import { replacementRoleFor } from '@/data/replacementRoles';
import { findShip } from '@/data/ships';
import type { Player } from '@/types/game';
import './DemoActorControls.css';

const HEARTBEAT_MS = 30_000;

function currentStation(player: Player): string {
  if (player.escapeState?.status === 'pending') return 'awaiting escape. Complete this actor’s ordinary escape flow.';
  if (player.escapeState || player.replacementStatus === 'awaiting-re-role') return 'awaiting GM role assignment.';
  const replacement = player.replacementRoleId ? replacementRoleFor(player.replacementRoleId) : undefined;
  if (replacement) return `${replacement.vesselName} // ${replacement.name}.`;
  const role = findConsoleRole(player.activeConsoleRoleId ?? undefined);
  if (role) return `${findShip(role.shipId)?.name ?? 'Independent station'} // ${role.name}.`;
  return 'not selected. Use this actor’s stations to choose an authorized station.';
}

/** Visible virtual-crew disclosure and ordinary lease renewal across actor routes. */
export default function DemoActorControls() {
  const session = useSessionStore(state => state.session);
  const me = useSessionStore(state => state.me);
  const connection = useSessionStore(state => state.connection);
  const freshness = useSessionStore(state => state.sessionSnapshotFreshness);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profile = activeDemoActorProfile;
  const status = demoSessionStatus(session);
  const sessionId = session?.id;
  const joined = !!profile && profile.sessionId === sessionId && me?.sessionId === sessionId;
  const live = joined && connection === 'live' && freshness === 'server';
  const [actors, setActors] = useState<readonly DemoActorRecord[]>(() => profile ? readDemoActorRoster(profile.sessionId) : []);

  useEffect(() => {
    if (!profile) return;
    const refresh = () => setActors(readDemoActorRoster(profile.sessionId));
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === demoActorRosterStorageKey(profile.sessionId)) refresh();
    };
    refresh();
    window.addEventListener(DEMO_ACTOR_ROSTER_CHANGED, refresh);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(DEMO_ACTOR_ROSTER_CHANGED, refresh); window.removeEventListener('storage', storage); };
  }, [profile]);

  useEffect(() => {
    if (!profile || !joined || !status || status === 'complete' || session?.phase === 'debrief' || session?.phase === 'closed') return;
    const originalUid = me?.uid;
    if (!originalUid) return;
    let disposed = false;
    let renewing = false;
    const current = () => {
      const state = useSessionStore.getState();
      return !disposed && readDemoActorAccountUid(profile.roleId) === originalUid &&
        auth().currentUser?.uid === originalUid && state.me?.uid === originalUid && state.me.role === 'player' &&
        state.me.connected !== false && state.session?.id === profile.sessionId && state.me.sessionId === profile.sessionId &&
        state.connection === 'live' && state.sessionSnapshotFreshness === 'server' &&
        ['preparing', 'active'].includes(demoSessionStatus(state.session) ?? '') &&
        !['debrief', 'closed'].includes(state.session?.phase ?? '') && isSessionWaiverAcknowledged();
    };
    const renew = async () => {
      if (renewing || !current()) return;
      const currentSession = useSessionStore.getState().session;
      if (!currentSession) return;
      renewing = true;
      try {
        const failed = await renewDemoActorPresence(currentSession, {
          shouldContinue: current,
          foregroundPresence: {
            profile, uid: originalUid,
            refresh: async () => {
              if (!current()) throw new Error('The selected demo actor is no longer current.');
              try { await refreshPresence(); }
              catch (cause) {
                if (current()) {
                  const state = useSessionStore.getState();
                  state.setSessionSnapshotFreshness('cache');
                  state.setConnection('offline');
                }
                throw cause;
              }
            },
          },
        });
        if (!disposed) setError(failed.length ? 'Some demo actors could not reconnect. Return to the crew controller and retry.' : null);
      } finally { renewing = false; }
    };
    void renew().catch(() => undefined);
    const timer = window.setInterval(() => { void renew().catch(() => undefined); }, HEARTBEAT_MS);
    window.addEventListener('online', renew);
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener('online', renew); };
  }, [joined, profile, sessionId, status, session?.phase, me?.uid]);

  if (!profile || !joined || !session || !status) return null;

  async function selectActor(roleId: string): Promise<void> {
    if (!session || !live || busy || !isSessionWaiverAcknowledged()) return;
    const actor = actors.find(item => item.roleId === roleId);
    if (!actor) return;
    setBusy(true); setError(null);
    try { await switchDemoActor(actor, session.joinCode); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'This actor could not open. Retry from the crew controller.'); setBusy(false); }
  }

  return <aside className="demo-actor-controls cic-frame" aria-label="Demo actor controls">
    <p className="eyebrow">FULL-GAME DEMO // SIMULATED CREW</p>
    <p>One person controls this virtual crew. Online actors are not physical attendees.</p>
    <div className="demo-actor-controls__row">
      <label htmlFor="demo-active-actor">Current actor</label>
      <select id="demo-active-actor" value={profile.roleId} disabled={!live || busy || !actors.length}
        onChange={event => { void selectActor(event.target.value); }}>
        {profile.roleId === 'controller' && <option value="controller">Crew controller</option>}
        {actors.map(actor => <option key={actor.roleId} value={actor.roleId}>{actor.label} // persona</option>)}
      </select>
      <Link className="cic-text-button" to="/demo-actors">Demo crew</Link>
      {profile.roleId !== 'controller' && <a className="cic-text-button" href={demoActorManagerUrl(session, window.location.href)}>Crew controller</a>}
    </div>
    {profile.roleId !== 'controller' && <p role="status">Persona identity: {actors.find(actor => actor.roleId === profile.roleId)?.label ?? profile.roleId}. Current station: {currentStation(me)}</p>}
    {error && <p className="demo-actor-controls__error" role="alert">{error}</p>}
  </aside>;
}

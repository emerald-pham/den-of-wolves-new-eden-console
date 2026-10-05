import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { activeDemoActorProfile, demoActorJoinCode, demoActorManagerUrl } from '@/lib/demoActorContext';
import {
  assertSelectedDemoActorIdentity,
  demoSessionStatus,
  prepareDemoActors,
  readDemoActorRoster,
  switchDemoActor,
  waitForDemoPreparationReady,
  type DemoActorRecord,
} from '@/lib/demoActorProfiles';
import { joinSession } from '@/lib/sessionService';
import { auth } from '@/lib/firebase';
import { isSessionWaiverAcknowledged } from '@/lib/sessionWaiver';
import { useSessionStore } from '@/store/useSessionStore';
import '@/components/DemoActorControls.css';

export default function DemoActorManager() {
  const session = useSessionStore(state => state.session);
  const me = useSessionStore(state => state.me);
  const connection = useSessionStore(state => state.connection);
  const freshness = useSessionStore(state => state.sessionSnapshotFreshness);
  const profile = activeDemoActorProfile;
  const [actors, setActors] = useState<readonly DemoActorRecord[]>(() => profile ? readDemoActorRoster(profile.sessionId) : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identityChecked, setIdentityChecked] = useState(false);
  const [waiver, setWaiver] = useState(isSessionWaiverAcknowledged);
  const joining = useRef(false);
  const mounted = useRef(true);
  const status = demoSessionStatus(session);
  const joined = !!session && !!me && session.id === profile?.sessionId && me.sessionId === session.id;
  const live = joined && connection === 'live' && freshness === 'server';

  useEffect(() => {
    mounted.current = true;
    const timer = window.setInterval(() => setWaiver(isSessionWaiverAcknowledged()), 1_000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, []);

  async function enter(): Promise<void> {
    const code = demoActorJoinCode();
    if (!profile || !code || joining.current) return;
    joining.current = true; setError(null);
    try {
      await assertSelectedDemoActorIdentity(profile);
      if (!useSessionStore.getState().session) await joinSession(code);
      if (mounted.current) setIdentityChecked(true);
    } catch (cause) {
      if (mounted.current) {
        const message = cause instanceof Error ? cause.message : 'The demo could not reconnect. Retry the ordinary join.';
        setError(/disconnect from.*session/i.test(message)
          ? 'This demo account is still online in another game. Close its other demo window, wait 45 seconds for the ordinary lease to expire, then retry the demo join.'
          : message);
      }
    } finally { joining.current = false; }
  }

  useEffect(() => {
    void enter();
    // Each manager instance is bound to the document's immutable profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function prepare(): Promise<void> {
    if (!profile || profile.roleId !== 'controller' || !me || !session || !live || busy || !isSessionWaiverAcknowledged()) return;
    const controllerUid = me.uid;
    setBusy(true); setError(null);
    try {
      const roster = await prepareDemoActors(session, {
        onProgress: next => { if (mounted.current) setActors(next); },
        waitForReady: () => waitForDemoPreparationReady({
          profile, expectedUid: controllerUid,
          read: () => {
            const state = useSessionStore.getState();
            return { session: state.session, me: state.me, mounted: mounted.current,
              authenticatedUid: auth().currentUser?.uid ?? null,
              connection: state.connection, freshness: state.sessionSnapshotFreshness };
          },
        }),
        shouldContinue: () => {
          const state = useSessionStore.getState();
          return mounted.current && state.connection === 'live' && state.sessionSnapshotFreshness === 'server' &&
            auth().currentUser?.uid === controllerUid && state.me?.uid === controllerUid &&
            state.me.role === 'player' && state.me.sessionId === profile.sessionId &&
            state.session?.id === profile.sessionId && state.session.currentTurn === 0 &&
            ['lobby', 'casting'].includes(state.session.phase) && demoSessionStatus(state.session) === 'preparing';
        },
      });
      if (mounted.current) setActors(roster);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Crew preparation stopped. Reconnect and retry.');
    } finally { if (mounted.current) setBusy(false); }
  }

  async function select(actor: DemoActorRecord): Promise<void> {
    if (!session || !live || busy || !waiver) return;
    setBusy(true); setError(null);
    try { await switchDemoActor(actor, session.joinCode); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'This actor could not open. Retry from the crew controller.'); setBusy(false); }
  }

  return <main className="demo-actor-manager">
    <section className="demo-actor-manager__panel cic-frame" aria-label="Full-game demo crew">
      <Link className="cic-text-button" to={session ? '/console' : '/'}>{session ? 'Back to stations' : 'Back to session entry'}</Link>
      <p className="eyebrow">FULL-GAME DEMO</p>
      <h1>Demo crew controller</h1>
      <p>Operate the simulated crew from this browser and keep the authenticated GM in the other browser.</p>
      <p>Each actor keeps its own identity, private brief and choices. Actor names show their original persona; station assignments can change. Make consent and gameplay decisions after selecting that actor. These actors do not establish physical attendance.</p>
      {!profile || !demoActorJoinCode() ? <p role="alert">Open the crew link from the GM's prepared full-game demo.</p>
        : !joined ? <div className="demo-actor-manager__actions"><p role="status">Joining through ordinary session admission…</p>
          <button type="button" className="cic-action-button" onClick={() => { void enter(); }}>Retry demo join</button></div>
        : !status ? <p role="alert">The GM must prepare this session as a full-game demo first.</p>
        : <>
          <p role="status">{live ? 'Live demo session' : 'Reconnecting // actions wait for the current session'} // {actors.length} prepared actors</p>
          {status === 'preparing' && profile.roleId === 'controller' && <div className="demo-actor-manager__actions">
            <button type="button" className="cic-action-button" disabled={!live || busy || !waiver || !identityChecked}
              onClick={() => { void prepare(); }}>{busy ? 'Preparing demo crew…' : 'Prepare demo crew'}</button>
            <p>Then use the other browser's GM controls to cast the claimed crew and start Cycle 1.</p>
          </div>}
          {actors.length > 0 && <ul className="demo-actor-manager__actors" aria-label="Prepared demo actors">
            {actors.map(actor => <li key={actor.roleId}><button type="button" className="cic-action-button" disabled={!live || busy || !waiver}
              onClick={() => { void select(actor); }}>Open {actor.label}</button></li>)}
          </ul>}
          {profile.roleId !== 'controller' && <div className="demo-actor-manager__actions">
            <Link className="cic-text-button" to="/console">Enter this actor's stations</Link>
            <a className="cic-text-button" href={demoActorManagerUrl(session, window.location.href)}>Return to crew controller</a>
          </div>}
          {status === 'complete' && <p role="status">This demo has ended. Keep its permitted history; use the GM browser to create another fresh game for other outcomes. This browser reuses its real actor accounts; allow 45 seconds for their prior online leases to expire.</p>}
        </>}
      {error && <p className="demo-actor-controls__error" role="alert">{error}</p>}
    </section>
  </main>;
}

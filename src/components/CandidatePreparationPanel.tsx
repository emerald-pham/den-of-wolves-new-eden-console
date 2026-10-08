import { useEffect, useId, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { setGmShipConsoleWriteGrant } from '@/lib/sessionService';
import { createCandidateAttempt, executeCandidateAttempt, readCandidateWorkspace, recoverCandidateAttempt,
  selectCandidateEdition, type CandidateAttempt, type CandidateEdition, type CandidatePathView, type CandidateWorkspace } from '@/lib/candidateService';
import './CandidatePreparationPanel.css';

function CandidateChoices({ path, revision, groupId, edition, busy, submit, gm, grantedShipId }: {
  path: CandidatePathView; revision: number; groupId: string; edition: CandidateEdition; busy: boolean;
  gm?: boolean; grantedShipId?: string | undefined;
  submit: (choice: Omit<CandidateAttempt, 'sessionId' | 'requestId' | 'instanceId'>) => void;
}) {
  const [shipId, setShipId] = useState(''); const [materials, setMaterials] = useState(1);
  const [tracks, setTracks] = useState<string[]>([]); const [shuttleId, setShuttleId] = useState('');
  const ownShips = path.ships.filter(ship => ship.canAct);
  const ship = ownShips.find(candidate => candidate.shipId === shipId) ?? ownShips[0];
  const shipBlocked = busy || (gm && grantedShipId !== ship?.shipId);
  const craft = path.engineeringShuttles.find(candidate => candidate.id === shuttleId) ?? path.engineeringShuttles[0];
  const base = { expectedRevision: revision, expectedGroupId: groupId, code: path.code, coordinate: path.coordinate };
  return <div className="candidate-preparation__choices">
    {ownShips.length > 1 && <label>Acting ship<select value={ship?.shipId ?? ''} disabled={busy}
      onChange={event => setShipId(event.target.value)}>{ownShips.map(candidate =>
        <option key={candidate.shipId} value={candidate.shipId}>{candidate.shipId}</option>)}</select></label>}
    {path.code === 'N' && !path.repaired && !path.completed && <>
      {ship && path.materials < path.materialsRequired && <div className="candidate-preparation__action">
        <label>Materials to contribute<input type="number" min={1} max={path.materialsRequired - path.materials} value={materials}
          disabled={busy} onChange={event => setMaterials(Number(event.target.value))} /></label>
        <button className="cic-action-button" type="button" disabled={shipBlocked || materials < 1 || materials > path.materialsRequired - path.materials}
          onClick={() => submit({ ...base, action: 'contribute-materials', shipId: ship.shipId, amount: materials })}>
          Contribute Ring materials</button>
      </div>}
      {path.researchChoices.length > 0 && <fieldset disabled={busy}>
        <legend>{edition === 'home' ? 'Choose distinct four-cross research tracks' : 'Choose distinct completed technologies'}</legend>
        {path.researchChoices.map(track => <label key={track.id} className="candidate-preparation__track">
          <input type="checkbox" checked={tracks.includes(track.id)} onChange={event => setTracks(current =>
            event.target.checked ? [...current, track.id] : current.filter(id => id !== track.id))} />{track.name}</label>)}
        <button className="cic-action-button" type="button" disabled={tracks.length < 1 || tracks.length > 5 - path.researchCount}
          onClick={() => submit({ ...base, action: 'contribute-research', trackIds: tracks })}>Commit chosen research</button>
      </fieldset>}
      {craft && !path.shuttleCommitted && <div className="candidate-preparation__action">
        <label>Engineering Shuttle<select value={craft.id} disabled={busy} onChange={event => setShuttleId(event.target.value)}>
          {path.engineeringShuttles.map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.id}</option>)}
        </select></label>
        <button className="cic-action-button" type="button" disabled={busy}
          onClick={() => submit({ ...base, action: 'commit-engineering-shuttle', shuttleId: craft.id })}>Commit Engineering Shuttle</button>
      </div>}
    </>}
    {path.code === 'N' && path.repaired && ship && <button className="cic-action-button" type="button"
      disabled={shipBlocked || !!ship.blocker} onClick={() => submit({ ...base, action: 'ring-passage', shipId: ship.shipId })}>
      Cross Ring // {ship.shipId} // five fuel</button>}
    {path.code === 'N' && path.canSabotage && <div className="candidate-preparation__intervention">
      <p>Opposite-side GM choice. Ships still awaiting passage will remain behind: {path.ships
        .filter(candidate => candidate.result !== 'crossed').map(candidate => candidate.shipId).join(', ') || 'none'}.</p>
      <button className="cic-action-button" type="button" disabled={busy}
        onClick={() => submit({ ...base, action: 'sabotage-ring' })}>Sabotage Ring from the far side</button>
    </div>}
    {path.code === 'O' && ship && <button className="cic-action-button" type="button" disabled={shipBlocked || !!ship.blocker}
      onClick={() => submit({ ...base, action: 'nebula-jump', shipId: ship.shipId })}>
      Long jump into Nebula // {ship.shipId} // {ship.fuelCost} fuel</button>}
    {path.code === 'P' && path.liberated && ship && !path.reactorShipIds.includes(ship.shipId) &&
      <div className="candidate-preparation__intervention"><p>Cannibalising this Reactor ends the ship’s vessel actions.
        Its {ship.reactorCapacity} charge capacity will power the Station; survivors settle at the Station.</p>
        <button className="cic-action-button" type="button" disabled={shipBlocked || ship.reactorCapacity < 1}
          onClick={() => submit({ ...base, action: 'contribute-reactor', shipId: ship.shipId })}>
          Cannibalise Reactor // {ship.shipId} // {ship.reactorCapacity} capacity</button></div>}
  </div>;
}

export default function CandidatePreparationPanel() {
  const sessionId = useSessionStore(state => state.session?.id);
  const me = useSessionStore(state => state.me);
  const gmInstance = useSessionStore(state => state.gmInstance);
  const freshness = useSessionStore(state => state.sessionSnapshotFreshness);
  const connection = useSessionStore(state => state.connection);
  const audience = JSON.stringify([sessionId, me?.sessionId, me?.uid, me?.role, me?.fleetGroupId,
    me?.assignedRoleId, me?.activeConsoleRoleId, gmInstance?.id, gmInstance?.uid, gmInstance?.sessionId,
    gmInstance?.claimedAt, freshness, connection]);
  return <CandidatePreparationWorkspace key={audience} />;
}

function CandidatePreparationWorkspace() {
  const session = useSessionStore(state => state.session); const me = useSessionStore(state => state.me);
  const freshness = useSessionStore(state => state.sessionSnapshotFreshness); const connection = useSessionStore(state => state.connection);
  const gmInstance = useSessionStore(state => state.gmInstance);
  const [selectedGroup, setSelectedGroup] = useState(''); const [workspace, setWorkspace] = useState<CandidateWorkspace>();
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<CandidateAttempt>(); const [refresh, setRefresh] = useState(0);
  const [gmShipId, setGmShipId] = useState('');
  const readinessId = useId();
  const isGm = me?.role === 'gm';
  const groupIds = [...new Set(Object.values(session?.shipFleetGroupIds ?? {}))];
  const groupId = isGm ? selectedGroup || me?.fleetGroupId || groupIds[0] || 'fleet-1' : me?.fleetGroupId;
  const started = typeof session?.currentTurn === 'number' && Number.isSafeInteger(session.currentTurn) && session.currentTurn >= 1;
  const ready = started && !!session && !!me && me.sessionId === session.id && !!groupId &&
    freshness === 'server' && connection === 'live' && (!isGm ||
      (!!gmInstance && gmInstance.uid === me.uid && gmInstance.sessionId === session.id));
  const canMakeChoices = ready && session?.phase === 'active';
  const currentWorkspace = ready ? workspace : undefined;
  const ended = session?.phase === 'success' || session?.phase === 'failure' || session?.phase === 'debrief' ||
    session?.phase === 'closed' || session?.phase === 'retained-empty';
  const readBlocker = !started && connection === 'live' && freshness === 'server'
    ? 'Awaiting GM start // candidate operations open from Cycle 1.'
    : 'Reconnect to receive current candidate actions and original results.';
  useEffect(() => {
    let cancelled = false; setWorkspace(undefined);
    if (!ready || !groupId) { setPending(undefined); setMessage(''); return; }
    try { setPending(recoverCandidateAttempt(groupId)); } catch { setPending(undefined); }
    void readCandidateWorkspace(groupId).then(value => { if (!cancelled) setWorkspace(value); })
      .catch(cause => { if (!cancelled) setMessage(cause instanceof Error ? cause.message : 'Candidate operations unavailable.'); });
    return () => { cancelled = true; };
  }, [ready, groupId, session?.id, session?.currentTurn, session?.phase, session?.updatedAt,
    me?.uid, me?.role, gmInstance?.id, gmInstance?.uid, gmInstance?.sessionId, gmInstance?.claimedAt, refresh]);
  if (!session || !me || (me.role !== 'gm' && me.role !== 'player')) return null;
  async function execute(attempt: CandidateAttempt) {
    if (busy) return; setBusy(true); setPending(attempt); setMessage('Transmitting candidate choice…');
    try { const result = await executeCandidateAttempt(attempt); setPending(undefined);
      setMessage(`${result.status === 'replayed' ? 'ORIGINAL RESULT // ' : ''}${result.summary}`); setRefresh(value => value + 1);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Candidate transmission interrupted. Retry the original request.'); }
    finally { setBusy(false); }
  }
  function submit(choice: Omit<CandidateAttempt, 'sessionId' | 'requestId' | 'instanceId'>) {
    try { void execute(createCandidateAttempt(choice)); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Candidate authority unavailable.'); }
  }
  const gmShips = [...new Set(currentWorkspace?.paths.flatMap(path => path.ships.filter(ship => ship.canAct).map(ship => ship.shipId)) ?? [])];
  const grantShip = gmShips.includes(gmShipId) ? gmShipId : gmShips[0];
  async function enableGmControl() {
    if (!canMakeChoices || !gmInstance || !grantShip || busy) return;
    setBusy(true);
    try {
      await setGmShipConsoleWriteGrant(grantShip, true, { shipId: grantShip, sessionId: session!.id,
        uid: me!.uid, instanceId: gmInstance.id, claimedAt: gmInstance.claimedAt });
      setMessage(`GM vessel control enabled // ${grantShip}.`); setRefresh(value => value + 1);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'GM vessel control unavailable.'); }
    finally { setBusy(false); }
  }
  async function chooseCandidateEdition(value: string) {
    if (!canMakeChoices || !isGm || !gmInstance || !groupId || !currentWorkspace ||
        currentWorkspace.editionLocked || busy || (value !== 'home' && value !== 'deluxe') || value === currentWorkspace.edition) return;
    setBusy(true); setMessage('Saving the session N/O rules edition…');
    try {
      const result = await selectCandidateEdition(groupId, value as CandidateEdition, currentWorkspace.revision);
      setMessage(result.summary); setRefresh(current => current + 1);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'The N/O rules edition could not be saved. Refresh the live report.');
    } finally { setBusy(false); }
  }
  return <section className="candidate-preparation cic-frame" aria-label="Candidate preparation and actions">
    <div className="candidate-preparation__header"><h2>New Eden preparation</h2>
      {isGm && groupIds.length > 1 && <label>Fleet group<select value={groupId ?? ''} onChange={event => setSelectedGroup(event.target.value)}>
        {groupIds.map(id => <option key={id} value={id}>{id}</option>)}</select></label>}
      <button className="cic-action-button" type="button" disabled={!ready || busy}
        aria-describedby={!ready || ended ? readinessId : undefined} onClick={() => setRefresh(value => value + 1)}>
        Refresh candidate operations</button></div>
    {session.currentTurn === 6 && <p>Cycle 6 // agree a New Eden plan with your fleet and identify who acts next.</p>}
    {currentWorkspace && <p>Cycle {currentWorkspace.cycle} // candidate revision {currentWorkspace.revision}</p>}
    {currentWorkspace && <div className="candidate-preparation__action" aria-label="N/O rules edition">
      <p>N/O rules // {currentWorkspace.edition === 'home' ? 'Home (default)' : 'Deluxe (alternative)'}</p>
      {isGm && <label>Candidate edition<select aria-label="Candidate edition" value={currentWorkspace.edition}
        disabled={!canMakeChoices || busy || currentWorkspace.editionLocked}
        onChange={event => void chooseCandidateEdition(event.target.value)}>
        <option value="home">Home (default)</option><option value="deluxe">Deluxe (alternative)</option>
      </select></label>}
    </div>}
    {ready && ended && <p id={readinessId}>Game ended // original candidate results remain available.</p>}
    {isGm && canMakeChoices && grantShip && <div className="candidate-preparation__action">
      <label>GM candidate vessel<select value={grantShip} disabled={busy} onChange={event => setGmShipId(event.target.value)}>
        {gmShips.map(shipId => <option key={shipId} value={shipId}>{shipId}</option>)}</select></label>
      <button className="cic-action-button" type="button" disabled={busy} onClick={() => void enableGmControl()}>Enable GM candidate ship control</button>
      <p>Current scoped control // {gmInstance?.shipConsoleWriteGrant?.shipId ?? 'choose a vessel and enable control'}.</p>
    </div>}
    {!ready ? <p id={readinessId}>{readBlocker}</p> : !currentWorkspace ?
      <p>Receiving current candidate operations…</p> : currentWorkspace.paths.length === 0 ?
        <p>Scout or arrive at a candidate to receive its preparation and actions.</p> : currentWorkspace.paths.map(path =>
          <article key={`${path.code}-${path.coordinate}`} className="candidate-preparation__path">
            <h3>{path.title}</h3>
            <p>{path.code === 'N' ? currentWorkspace.edition === 'home'
              ? 'Repair: 10 materials, one Engineering Shuttle and five distinct research tracks with at least four crosses. Ring repair permanently consumes the Engineering Shuttle; it cannot launch, repair, recharge or join a mission afterward. Passage: five fuel from each ship. In Home, the GM may choose far-side sabotage after a paid crossing to stop Wolf pursuit through the Ring.'
              : 'Repair: 15 materials, one Engineering Shuttle and five distinct fully completed Endeavour technologies. Ring repair permanently consumes the Engineering Shuttle; it cannot launch, repair, recharge or join a mission afterward. Passage: five fuel from each ship.' :
              path.code === 'O' ? currentWorkspace.edition === 'home'
                ? 'Scout within range, then each ship chooses a long jump. One d6 plus protected scouting reaches New Eden at nine; earlier losses at that coordinate also add to the total. The server resolves the result; scouting totals stay private.'
                : 'Scout within range, then each ship chooses a long jump. One d6 plus protected scouting reaches New Eden at eight; prior losses do not add a bonus. The server resolves the result; scouting totals stay private.' :
                'Defeat all Station Wolves, then cannibalise unique Reactors for at least 18 available charge capacity. Station defences activate automatically.'}</p>
            <p>{path.code === 'N' ? currentWorkspace.edition === 'home'
              ? `${path.materials}/10 materials // ${path.researchCount}/5 research // Engineering Shuttle ${path.shuttleCommitted ? 'committed' : 'required'} // ${path.repaired ? 'Ring repaired' : 'repair pending'}`
              : `${path.materials}/15 materials // ${path.researchCount}/5 completed technologies // Engineering Shuttle ${path.shuttleCommitted ? 'committed' : 'required'} // ${path.repaired ? 'Ring repaired' : 'repair pending'}` :
              path.code === 'O' ? 'Each ship retains one committed reached-or-lost result.' :
                `${path.liberated ? 'Station liberated' : 'Station occupied'} // ${path.chargeCapacity}/18 charge capacity // ${path.activated ? 'defences active' : 'power pending'}`}</p>
            {path.blockers.length > 0 && <ul aria-label={`${path.title} blockers`}>{path.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>}
            <p className="candidate-preparation__next">Next actor // {path.nextActor}</p>
            {canMakeChoices && path.code === 'P' && !path.liberated && !path.completed &&
              <p className="candidate-preparation__next">{isGm
                ? 'GM // open GM Console’s existing Wolf attack controls; battle crews use their assigned ship combat console.'
                : 'Battle crews // open your assigned ship combat console for the offered range and boarding actions. The GM uses the existing Wolf attack controls in GM Console.'}</p>}
            <ul className="candidate-preparation__ships">{path.ships.map(ship => <li key={ship.shipId}>
              <strong>{ship.shipId}</strong> // {ship.summary || ship.result}{ship.blocker && ` // ${ship.blocker}`}</li>)}</ul>
            {canMakeChoices && <CandidateChoices path={path} revision={currentWorkspace.revision} groupId={currentWorkspace.groupId}
              edition={currentWorkspace.edition} busy={busy || !!pending} submit={submit} gm={isGm}
              grantedShipId={gmInstance?.shipConsoleWriteGrant?.shipId} />}
          </article>)}
    {message && <p role="status" aria-live="polite">{message}</p>}
    {ready && pending && !busy && <button className="cic-action-button" type="button"
      onClick={() => void execute(pending)}>Retry original candidate request</button>}
    {isGm && currentWorkspace?.privateCalculations && <details><summary>Private GM candidate calculations</summary>
      <ul>{currentWorkspace.privateCalculations.map(audit => <li key={audit.requestId}>{audit.code} // {audit.result} //
        {JSON.stringify(audit.calculation)}</li>)}</ul></details>}
  </section>;
}
